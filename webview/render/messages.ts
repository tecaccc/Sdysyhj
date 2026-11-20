// 消息流渲染：Markdown 正文 / thinking 折叠 / 工具调用卡片。
// 渲染策略：*_delta 追加到对应内容块（流式，rAF 节流 + 300ms 节流 Markdown 重排）；
// message_final 整体替换该消息 DOM（权威终稿）；大输出仅保留尾部（outputTruncated 标记）。

import type { UiBlock, UiMessage } from "../../src/panel/messages";
import { escapeText, renderMarkdown } from "./markdown";

const STATUS_ICONS: Record<string, string> = {
  running: "⏳",
  success: "✔",
  error: "✘",
  aborted: "⊘",
};
const STATUS_LABELS: Record<string, string> = {
  running: "进行中",
  success: "成功",
  error: "失败",
  aborted: "已中止",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

abstract class BlockView {
  readonly root: HTMLElement;
  constructor(className: string) {
    this.root = el("div", className);
  }
  abstract finalize(block: UiBlock): void;
}

class TextBlockView extends BlockView {
  private buffer = "";
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor() {
    super("blk blk-text");
    this.root.appendChild(el("div", "md"));
  }

  private get mdEl(): HTMLElement {
    return this.root.querySelector(".md") as HTMLElement;
  }

  appendDelta(delta: string): void {
    this.buffer += delta;
    this.dirty = true;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
    }, 300);
  }

  private render(): void {
    this.mdEl.innerHTML = renderMarkdown(this.buffer);
  }

  finalize(block: UiBlock): void {
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.buffer = block.type === "text" ? block.text : this.buffer;
    this.render();
  }

  get currentText(): string {
    return this.buffer;
  }
}

class ThinkingBlockView extends BlockView {
  private buffer = "";
  /** 增量合并批处理：rAF 节流，避免逐 delta 刷 DOM（NFR-01） */
  private rafHandle: number | null = null;

  constructor() {
    super("blk blk-thinking");
    const details = el("details", "thinking-details"); // 默认折叠（FR-CHAT-03）
    const summary = el("summary", "thinking-summary", "▸ 💭 thinking…");
    const pre = el("pre", "thinking-text");
    details.appendChild(summary);
    details.appendChild(pre);
    this.root.appendChild(details);
  }

  private get preEl(): HTMLElement {
    return this.root.querySelector(".thinking-text") as HTMLElement;
  }

  appendDelta(delta: string): void {
    this.buffer += delta;
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame(() => {
        this.rafHandle = null;
        this.preEl.textContent = this.buffer; // 展开后流式显示（按帧合批）
      });
    }
  }

  finalize(block: UiBlock): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.buffer = block.type === "thinking" ? block.text : this.buffer;
    this.preEl.textContent = this.buffer;
  }
}

class ToolCardView extends BlockView {
  private argsBuffer = "";
  private outputText = "";
  private outputTruncated = false;
  private status = "running";
  private summary = "";

  constructor(
    private readonly toolCallId: string,
    private readonly toolName: string,
    private readonly onCopy: (toolCallId: string) => void
  ) {
    super("blk blk-toolcall");
    const card = el("div", "toolcard");
    const details = el("details", "toolcard-details");
    const summaryEl = el("summary", "toolcard-head");
    summaryEl.appendChild(el("span", "toolcard-icon", "🔧"));
    summaryEl.appendChild(el("span", "toolcard-name", toolName));
    summaryEl.appendChild(el("span", "toolcard-summary"));
    summaryEl.appendChild(el("span", "toolcard-status"));
    const body = el("div", "toolcard-body");
    body.appendChild(el("div", "toolcard-section-label", "输入"));
    body.appendChild(el("pre", "toolcard-args"));
    body.appendChild(el("div", "toolcard-section-label", "输出"));
    body.appendChild(el("pre", "toolcard-output"));
    const copyBtn = el("button", "toolcard-copy", "复制全部");
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onCopy(this.toolCallId);
    });
    body.appendChild(copyBtn);
    details.appendChild(summaryEl);
    details.appendChild(body);
    card.appendChild(details);
    this.root.appendChild(card);
    this.refresh();
  }

  setSummary(summary: string): void {
    this.summary = summary;
    this.refresh();
  }

  appendArgsDelta(delta: string): void {
    this.argsBuffer += delta;
    const argsEl = this.root.querySelector(".toolcard-args");
    if (argsEl) argsEl.textContent = this.argsBuffer;
  }

  setStatus(status: string, output?: string, outputTruncated?: boolean): void {
    this.status = status;
    if (output !== undefined) this.outputText = output;
    if (outputTruncated !== undefined) this.outputTruncated = outputTruncated;
    this.refresh();
  }

  private refresh(): void {
    const summaryEl = this.root.querySelector(".toolcard-head");
    const summaryTextEl = this.root.querySelector(".toolcard-summary");
    const statusEl = this.root.querySelector(".toolcard-status");
    const argsEl = this.root.querySelector(".toolcard-args");
    const outputEl = this.root.querySelector(".toolcard-output");
    const copyBtn = this.root.querySelector(".toolcard-copy") as HTMLElement | null;
    if (summaryTextEl) summaryTextEl.textContent = this.summary || compact(this.argsBuffer);
    if (statusEl) {
      statusEl.textContent = `${STATUS_ICONS[this.status] ?? ""} ${STATUS_LABELS[this.status] ?? this.status}`;
      statusEl.className = `toolcard-status status-${this.status}`;
    }
    if (argsEl) argsEl.textContent = this.argsBuffer;
    if (outputEl) outputEl.textContent = this.outputText;
    if (copyBtn) copyBtn.hidden = !this.outputTruncated;
    if (summaryEl) summaryEl.setAttribute("title", STATUS_LABELS[this.status] ?? this.status);
  }

  finalize(block: UiBlock): void {
    if (block.type !== "toolcall") return;
    this.argsBuffer = block.args;
    this.summary = block.summary;
    this.status = block.status;
    this.outputText = block.output;
    this.outputTruncated = block.outputTruncated;
    this.refresh();
  }
}

function compact(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** 单条消息视图：负责流式增量与权威终稿渲染。 */
export class MessageView {
  readonly root: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly blocks = new Map<number, BlockView>();
  private cursorEl: HTMLElement | null = null;
  private finalized = false;

  constructor(
    readonly id: string,
    readonly role: "user" | "assistant",
    private readonly onCopy: (toolCallId: string) => void
  ) {
    this.root = el("div", `message message-${role}`);
    this.root.dataset.messageId = id;
    this.root.appendChild(el("div", "message-role", role === "user" ? "User" : "Assistant"));
    this.bodyEl = el("div", "message-body");
    this.root.appendChild(this.bodyEl);
    if (role === "assistant") {
      this.cursorEl = el("span", "stream-cursor", "▍");
    }
  }

  /** 静态构造：从权威 UiMessage 渲染（历史/终稿）。 */
  static fromUiMessage(message: UiMessage, onCopy: (toolCallId: string) => void): MessageView {
    const view = new MessageView(message.id, message.role, onCopy);
    view.finalize(message);
    return view;
  }

  private blockView(index: number, init: () => BlockView): BlockView {
    let view = this.blocks.get(index);
    if (!view) {
      view = init();
      this.blocks.set(index, view);
      const ordered = [...this.blocks.entries()].sort((a, b) => a[0] - b[0]);
      this.bodyEl.innerHTML = "";
      for (const [, v] of ordered) this.bodyEl.appendChild(v.root);
      if (this.cursorEl && this.role === "assistant" && !this.finalized) {
        this.bodyEl.appendChild(this.cursorEl);
      }
    }
    return view;
  }

  textDelta(index: number, delta: string): void {
    const view = this.blockView(index, () => new TextBlockView());
    if (view instanceof TextBlockView) view.appendDelta(delta);
  }

  thinkingDelta(index: number, delta: string): void {
    const view = this.blockView(index, () => new ThinkingBlockView());
    if (view instanceof ThinkingBlockView) view.appendDelta(delta);
  }

  toolcallStart(index: number, toolCallId: string, toolName: string, args: string, summary: string): void {
    const view = this.blockView(index, () => new ToolCardView(toolCallId, toolName, this.onCopy));
    if (view instanceof ToolCardView) {
      if (args) view.appendArgsDelta(args);
      if (summary) view.setSummary(summary);
    }
  }

  toolcallDelta(index: number, delta: string): void {
    const view = this.blocks.get(index);
    if (view instanceof ToolCardView) view.appendArgsDelta(delta);
  }

  toolcallStatus(toolCallId: string, status: string, summary?: string, output?: string, outputTruncated?: boolean): void {
    for (const view of this.blocks.values()) {
      if (view instanceof ToolCardView && view["toolCallId"] === toolCallId) {
        if (summary !== undefined) view.setSummary(summary);
        view.setStatus(status, output, outputTruncated);
      }
    }
  }

  /** message_final：整体替换该消息 DOM（权威终稿）。 */
  finalize(message: UiMessage): void {
    this.finalized = true;
    if (this.cursorEl) this.cursorEl.remove();
    this.blocks.clear();
    this.bodyEl.innerHTML = "";
    message.blocks.forEach((block, index) => {
      const view = this.createFinalBlock(block);
      if (view) {
        this.bodyEl.appendChild(view.root);
        // #D-04：终稿块视图回填 this.blocks。toolcallStatus() 遍历此表按 toolCallId 匹配，
        // agent 循环时序上 toolResult（toolcall_status）必然晚于含工具卡的 message_final 到达，
        // 不回填则 final 后状态更新必然丢失（卡片恒“进行中”）。键取终稿块数组下标——
        // toolcallStatus 匹配只看 toolCallId，与键无关；流式期间行为不变。
        this.blocks.set(index, view);
      }
    });
    if (message.aborted) {
      this.bodyEl.appendChild(el("div", "aborted-marker", "⏹ 已中止"));
    }
    if (message.errorMessage) {
      this.bodyEl.appendChild(el("div", "message-error", `⚠ ${message.errorMessage}`));
    }
    this.root.classList.toggle("message-aborted", message.aborted === true);
    this.root.classList.toggle("message-error-message", Boolean(message.errorMessage));
  }

  private createFinalBlock(block: UiBlock): BlockView | null {
    switch (block.type) {
      case "text": {
        const view = new TextBlockView();
        view.finalize(block);
        return view;
      }
      case "thinking": {
        const view = new ThinkingBlockView();
        view.finalize(block);
        return view;
      }
      case "toolcall": {
        const view = new ToolCardView(block.id, block.tool, this.onCopy);
        view.finalize(block);
        return view;
      }
      default:
        return null;
    }
  }
}

export function escapePlainText(text: string): string {
  return escapeText(text);
}

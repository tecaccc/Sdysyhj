// Webview 入口：消息流状态、输入区交互、宿主消息路由。

import type {
  HostToWebview,
  ModelSummary,
  RunState,
  SlashCommandInfo,
  UiMessage,
  WebviewToHost,
} from "../src/panel/messages";
import { CommandMenuState } from "./render/commandMenu";
import { FollowState } from "./render/followState";
import { formatContextUsage } from "./render/format";
import { MessageView } from "./render/messages";
import "./styles/styles.css";
import "highlight.js/styles/github.css";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ---------- DOM 引用 ----------

/** 滚动容器（FR-CHAT-09 度量与滚动执行在此层） */
const messagesScrollEl = document.getElementById("messages") as HTMLElement;
/** 消息内容列（FR-CHAT-10 ①：与输入区共享同一 960px 居中列；消息追加在此层） */
const messagesEl = document.getElementById("messages-col") as HTMLElement;
const errorsEl = document.getElementById("errors-col") as HTMLElement;
const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("btn-send") as HTMLButtonElement;
const stopBtn = document.getElementById("btn-stop") as HTMLButtonElement;
const newBtn = document.getElementById("btn-new") as HTMLButtonElement;
const historyBtn = document.getElementById("btn-history") as HTMLButtonElement;
const settingsBtn = document.getElementById("btn-settings") as HTMLButtonElement;
const statusLine = document.getElementById("status-line") as HTMLElement;
const sessionNameEl = document.getElementById("session-name") as HTMLElement;
const sendModeEl = document.getElementById("send-mode") as HTMLSelectElement;
const cmdMenuEl = document.getElementById("cmd-menu") as HTMLElement;
const modelBtn = document.getElementById("model-selector") as HTMLButtonElement;
const modelNameEl = document.getElementById("model-selector-name") as HTMLElement;
const modelMenuEl = document.getElementById("model-menu") as HTMLElement;
const usageEl = document.getElementById("usage-line") as HTMLElement;

// ---------- 状态 ----------

const messageViews = new Map<string, MessageView>();
const streamingViews = new Map<string, MessageView>();
let runState: RunState = "idle";
let lastAtTrigger = 0;
let userSeq = 0;
/** 当前模型名（FR-MOD-01③ 底部选择器展示与当前项标记） */
let currentModel = "";

function isRunning(): boolean {
  return runState === "starting" || runState === "streaming";
}

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

// ---------- 渲染：消息流 ----------

function requestCopy(toolCallId: string): void {
  post({ kind: "copy_output", toolCallId });
}

// ---------- 流式输出自动跟随（FR-CHAT-09） ----------
// 纯决策逻辑在 render/followState.ts；此处为接线薄层：滚动度量 + 滚动执行。
// 跟随为会话内瞬时 UI 状态：不持久化、不产生消息级标记（④）。

const follow = new FollowState();
/** 程序滚动自标记：跟随逻辑发起的滚动也会触发 scroll 事件，须与用户滚动区分，
 *  且内容增长瞬间距底可能短暂 >40px，不能仅凭距底值判定打断。 */
let selfScrollPending = false;

/** 视口底缘距滚动底端的像素距离（≥0）。 */
function distanceFromBottom(): number {
  return Math.max(0, messagesScrollEl.scrollHeight - messagesScrollEl.clientHeight - messagesScrollEl.scrollTop);
}

/** 滚到消息区底部（距底 0px）。已在底部时无位移不产生 scroll 事件，不自标记。 */
function scrollMessagesToBottom(): void {
  const target = messagesScrollEl.scrollHeight - messagesScrollEl.clientHeight;
  if (messagesScrollEl.scrollTop === target) return;
  selfScrollPending = true;
  messagesScrollEl.scrollTop = target;
}

/** 消息追加/增量渲染后的统一滚动决策：跟随则保持“在底部”，
 * 打断则不推动滚动位置（scrollTop 保持用户所选，②）。 */
function applyFollowScroll(): void {
  if (follow.shouldAutoScroll()) scrollMessagesToBottom();
}

// 增量渲染点 = 消息区 DOM 实际变化点（增量合并渲染：正文 300ms 合批 / thinking rAF 合批）。
// 在渲染点而非 delta 事件到达时做跟随决策：合批渲染真正改 DOM 后立刻回底，
// 视口在两次渲染之间始终距底 0px（① “每次增量渲染后保持底部”）；打断时决策为 false，不动滚动位置（②）。
const renderObserver = new MutationObserver(() => applyFollowScroll());
renderObserver.observe(messagesScrollEl, { childList: true, subtree: true, characterData: true });

messagesScrollEl.addEventListener("scroll", () => {
  if (selfScrollPending) {
    selfScrollPending = false; // 本次滚动由跟随逻辑发起，非用户操作
    return;
  }
  follow.onUserScroll(distanceFromBottom()); // >40px 打断（②）；≤40px 恢复（③）
});

function appendMessageView(view: MessageView): void {
  messageViews.set(view.id, view);
  messagesEl.appendChild(view.root);
  applyFollowScroll(); // 消息追加后的滚动决策统一走跟随模块（idle 不自动滚动，④）
}

function clearMessages(): void {
  messageViews.clear();
  streamingViews.clear();
  messagesEl.innerHTML = "";
}

function loadHistory(messages: UiMessage[]): void {
  clearMessages();
  for (const message of messages) {
    appendMessageView(MessageView.fromUiMessage(message, requestCopy));
  }
  // 会话载入/切换的一次性初始定位（滚到底部）：不属“自动跟随”范畴（④ 排除项），不走向量决策
  scrollMessagesToBottom();
}

// ---------- 渲染：错误与提示 ----------

function showError(message: string, hint?: string): void {
  const card = document.createElement("div");
  card.className = "error-card";
  const title = document.createElement("div");
  title.className = "error-title";
  title.textContent = `⚠ ${message}`;
  card.appendChild(title);
  if (hint) {
    const hintEl = document.createElement("div");
    hintEl.className = "error-hint";
    hintEl.textContent = hint;
    card.appendChild(hintEl);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "error-dismiss";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => card.remove());
  card.appendChild(dismiss);
  errorsEl.appendChild(card);
  card.scrollIntoView({ block: "nearest" });
}

function showToast(text: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  errorsEl.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showExternalChangeBanner(detail: string): void {
  const existing = document.getElementById("external-change-banner");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "external-change-banner";
  banner.className = "banner";
  const text = document.createElement("span");
  text.textContent = `⚠ ${detail} 当前显示可能为陈旧状态。`;
  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "刷新";
  refreshBtn.addEventListener("click", () => {
    banner.remove();
    post({ kind: "refresh_session" });
  });
  const dismiss = document.createElement("button");
  dismiss.textContent = "忽略";
  dismiss.addEventListener("click", () => banner.remove());
  banner.appendChild(text);
  banner.appendChild(refreshBtn);
  banner.appendChild(dismiss);
  errorsEl.appendChild(banner);
}

// ---------- 状态展示 ----------

const STATE_TEXT: Record<RunState, string> = {
  idle: "空闲",
  starting: "启动中",
  streaming: "运行中",
  aborted: "已中止",
  error: "错误",
};

function refreshHeader(model: string, thinkingLevel: string, sessionName: string): void {
  statusLine.textContent = `${model || "(未设置模型)"} · ${thinkingLevel || "—"} · ${STATE_TEXT[runState]}`;
  sessionNameEl.textContent = sessionName || "未命名会话";
  // FR-MOD-01③/FR-MOD-03：底部内联选择器常显当前模型，与状态栏/命令面板入口同步
  currentModel = model;
  modelNameEl.textContent = model || "(未设置模型)";
}

function setRunState(state: RunState): void {
  runState = state;
  const running = isRunning();
  stopBtn.hidden = !running;
  sendBtn.hidden = running;
  inputEl.placeholder = running
    ? `运行中：输入消息以 ${sendModeEl.value === "followUp" ? "follow-up" : "steer"} 方式插话…（Enter 发送）`
    : "输入消息…（Enter 发送 / Shift+Enter 换行；@ 引用文件、/ 呼出命令）";
  statusLine.textContent = statusLine.textContent.replace(/· (空闲|启动中|运行中|已中止|错误)$/, `· ${STATE_TEXT[state]}`);
}

// ---------- 输入区 ----------

function sendInput(): void {
  const text = inputEl.value.trim();
  if (text.length === 0) return;
  post({ kind: "prompt", text, mode: isRunning() ? (sendModeEl.value as "steer" | "followUp") : "auto" });
  inputEl.value = "";
  inputEl.style.height = "auto";
}

sendBtn.addEventListener("click", sendInput);
stopBtn.addEventListener("click", () => post({ kind: "abort" }));
newBtn.addEventListener("click", () => post({ kind: "new_session" }));
historyBtn.addEventListener("click", () => post({ kind: "open_history" }));
settingsBtn.addEventListener("click", () => post({ kind: "open_settings" }));
sessionNameEl.addEventListener("click", () => post({ kind: "rename_session" }));
statusLine.addEventListener("click", () => post({ kind: "switch_model" }));
statusLine.addEventListener("dblclick", () => post({ kind: "switch_thinking" }));
sendModeEl.addEventListener("change", () => setRunState(runState));

inputEl.addEventListener("keydown", (event) => {
  // FR-CMD-03 ③：菜单打开时 ↑/↓ 导航、Enter 选中插入、Esc 关闭，均不触发发送
  if (cmdMenu.isOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      cmdMenu.moveDown();
      renderCommandMenu();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      cmdMenu.moveUp();
      renderCommandMenu();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cmdMenu.close();
      renderCommandMenu();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      selectHighlightedCommand();
      return;
    }
  }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendInput();
  }
});

inputEl.addEventListener("input", () => {
  // `/` 命令补全菜单（FR-CMD-03 ②）：随输入实时过滤
  updateCommandMenu(inputEl.value);
  // @file 触发（FR-FILE-02，唯一文件引用入口）：输入 @ 且前一字符为行首/空白时弹出文件选择器
  const pos = inputEl.selectionStart;
  const value = inputEl.value;
  if (pos > 0 && value[pos - 1] === "@") {
    const before = pos >= 2 ? value[pos - 2] : "";
    const now = Date.now();
    if ((before === "" || /\s/.test(before)) && now - lastAtTrigger > 1000) {
      lastAtTrigger = now;
      post({ kind: "insert_file_ref" });
    }
  }
});

/** 在光标处插入文本（file_ref / sendToPi 预填）。 */
function insertAtCursor(text: string, replaceAt = false): void {
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  const value = inputEl.value;
  if (replaceAt && start > 0 && value[start - 1] === "@") {
    inputEl.value = value.slice(0, start - 1) + text + value.slice(end);
    inputEl.selectionStart = inputEl.selectionEnd = start - 1 + text.length;
  } else {
    inputEl.value = value.slice(0, start) + text + value.slice(end);
    inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
  }
  inputEl.focus();
}

// ---------- `/` 命令补全菜单（FR-CMD-03） ----------
// 纯逻辑在 render/commandMenu.ts；此处为接线：输入事件、键盘导航、菜单 DOM 渲染与选中插入。

const cmdMenu = new CommandMenuState();
/** 命令全集是否已请求（首次 `/` 触发时向宿主要求；会话切换后失效重取） */
let slashCommandsRequested = false;

/** 菜单 DOM 重渲染：按状态机快照重建（项数有限，全量重建确定性更高）。 */
function renderCommandMenu(): void {
  cmdMenuEl.innerHTML = "";
  if (!cmdMenu.isOpen) {
    cmdMenuEl.hidden = true;
    return;
  }
  const items = cmdMenu.items;
  items.forEach((item) => {
    const option = document.createElement("button");
    option.type = "button";
    const active = cmdMenu.highlightedItem === item;
    option.className = active ? "cmd-item cmd-item-active" : "cmd-item";
    option.setAttribute("role", "option");
    if (active) option.setAttribute("aria-selected", "true");
    const name = document.createElement("span");
    name.className = "cmd-name";
    name.textContent = `/${item.name}`;
    option.appendChild(name);
    if (item.description) {
      const desc = document.createElement("span");
      desc.className = "cmd-desc";
      desc.textContent = item.description;
      option.appendChild(desc);
    }
    // mousedown（先于 blur）+ preventDefault：保持焦点在输入框，等效键盘选中（③④）
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectCommand(item);
    });
    cmdMenuEl.appendChild(option);
  });
  cmdMenuEl.hidden = false;
}

/** 输入变化 → 状态机更新；首次进入 `/` 前缀时向宿主请求命令全集。 */
function updateCommandMenu(text: string): void {
  if (text.startsWith("/") && !slashCommandsRequested) {
    slashCommandsRequested = true;
    post({ kind: "request_commands" }); // 响应前菜单不显示（无命令不显示，⑤）
  }
  cmdMenu.onInput(text);
  renderCommandMenu();
}

/** 选中插入（④）：`/` + 命令名写入输入框（替换 `/` 起始的过滤文本），关闭菜单，焦点保持输入框。 */
function selectCommand(item: SlashCommandInfo): void {
  inputEl.value = `/${item.name}`;
  inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
  cmdMenu.close();
  renderCommandMenu();
  inputEl.focus();
}

/** 键盘 Enter 选中当前高亮项。 */
function selectHighlightedCommand(): void {
  const item = cmdMenu.highlightedItem;
  if (item) selectCommand(item);
}

/** 会话切换：命令全集随会话（prompt 模板 / skills）失效，下次 `/` 触发重取。 */
function invalidateSlashCommands(): void {
  slashCommandsRequested = false;
  cmdMenu.setCommands([]);
}

// ---------- 底部内联模型选择器（FR-MOD-01③/FR-MOD-03） ----------

let modelsCache: ModelSummary[] | null = null;

function closeModelMenu(): void {
  modelMenuEl.hidden = true;
  modelMenuEl.innerHTML = "";
}

function renderModelMenu(models: ModelSummary[] | null): void {
  modelMenuEl.innerHTML = "";
  const note = (text: string): void => {
    const el = document.createElement("div");
    el.className = "model-note";
    el.textContent = text;
    modelMenuEl.appendChild(el);
  };
  if (models === null) {
    note("加载可用模型…");
    return;
  }
  if (models.length === 0) {
    note("没有可用模型（先运行 pi auth / pi config）");
    return;
  }
  models.forEach((model) => {
    const label = `${model.provider}/${model.id}`;
    const option = document.createElement("button");
    option.type = "button";
    option.className = `model-item${label === currentModel ? " model-item-current" : ""}`;
    option.setAttribute("role", "option");
    if (label === currentModel) option.setAttribute("aria-selected", "true");
    const name = document.createElement("span");
    name.className = "model-item-name";
    name.textContent = `${label === currentModel ? "✓ " : ""}${label}`;
    option.appendChild(name);
    const desc = document.createElement("span");
    desc.className = "model-item-desc";
    desc.textContent = [model.name, model.reasoning ? "reasoning" : ""].filter(Boolean).join(" · ");
    option.appendChild(desc);
    option.addEventListener("click", () => {
      post({ kind: "set_model", provider: model.provider, modelId: model.id }); // 切换经既有 setModel 通道，model_info 同步三入口
      closeModelMenu();
    });
    modelMenuEl.appendChild(option);
  });
}

modelBtn.addEventListener("click", () => {
  if (!modelMenuEl.hidden) {
    closeModelMenu();
    return;
  }
  modelMenuEl.hidden = false;
  renderModelMenu(modelsCache);
  post({ kind: "request_models" }); // 每次打开刷新列表（与状态栏/命令面板入口同源）
});

// 点击菜单外区域 / Esc 关闭模型列表
function handleModelMenuDismiss(target: EventTarget | null, key?: string): void {
  if (modelMenuEl.hidden) return;
  if (key === "Escape") {
    closeModelMenu();
    return;
  }
  if (target instanceof Node && !modelMenuEl.contains(target) && !modelBtn.contains(target)) {
    closeModelMenu();
  }
}

document.addEventListener("click", (event) => handleModelMenuDismiss(event.target));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") handleModelMenuDismiss(null, "Escape");
});

// ---------- 底部上下文用量行（FR-MOD-04） ----------

function refreshUsage(totalTokens: number | null, contextWindow: number | null): void {
  usageEl.textContent = formatContextUsage(totalTokens, contextWindow);
  const detail =
    totalTokens === null
      ? "当前会话尚无助手消息"
      : `最近一条助手消息 ${totalTokens.toLocaleString()} tokens${contextWindow ? ` / 窗口 ${contextWindow.toLocaleString()}` : ""}`;
  usageEl.title = `上下文用量：${detail}`;
}

function handleHostMessage(raw: unknown): void {
  const msg = raw as HostToWebview;
  if (!msg || typeof msg !== "object" || typeof (msg as { kind?: unknown }).kind !== "string") return;
  switch (msg.kind) {
    case "config": {
      sendModeEl.value = msg.sendMode;
      break;
    }
    case "session_reset": {
      clearMessages();
      sessionNameEl.textContent = msg.name || "未命名会话";
      invalidateSlashCommands(); // 会话切换后命令全集重取（prompt 模板/skills 随会话）
      break;
    }
    case "history_loaded": {
      loadHistory(msg.messages);
      invalidateSlashCommands();
      break;
    }
    case "user_message": {
      const view = new MessageView(`webview-user-${++userSeq}`, "user", requestCopy);
      view.finalize({
        id: view.id,
        role: "user",
        blocks: [{ type: "text", text: msg.text }],
        timestamp: Date.now(),
      });
      appendMessageView(view);
      break;
    }
    case "stream_start": {
      // 每轮流式开始默认置跟随态（FR-CHAT-09 ①）：先置态，后追加，追加后的滚动决策即走跟随模块
      follow.onStreamStart();
      const view = new MessageView(msg.messageId, "assistant", requestCopy);
      streamingViews.set(msg.messageId, view);
      appendMessageView(view);
      break;
    }
    case "text_delta": {
      streamingViews.get(msg.messageId)?.textDelta(msg.index, msg.delta);
      break; // 滚动决策在渲染点（renderObserver），delta 到达时 DOM 尚未变化
    }
    case "thinking_delta": {
      streamingViews.get(msg.messageId)?.thinkingDelta(msg.index, msg.delta);
      break;
    }
    case "toolcall_start": {
      streamingViews.get(msg.messageId)?.toolcallStart(msg.index, msg.id, msg.tool, msg.args, msg.summary);
      break;
    }
    case "toolcall_delta": {
      streamingViews.get(msg.messageId)?.toolcallDelta(msg.index, msg.delta);
      break;
    }
    case "toolcall_status": {
      const view = streamingViews.get(msg.messageId) ?? messageViews.get(msg.messageId);
      view?.toolcallStatus(msg.toolCallId, msg.status, msg.summary, msg.output, msg.outputTruncated);
      break; // 工具输出增量同属流式增量，渲染点统一走跟随决策（②：打断时不得推动滚动位置）
    }
    case "message_final": {
      const view = streamingViews.get(msg.messageId) ?? messageViews.get(msg.messageId);
      if (view) {
        view.finalize(msg.message);
        streamingViews.delete(msg.messageId);
        applyFollowScroll(); // 终稿重排后的滚动决策（此时仍在运行态，跟随则保持底部）
      } else {
        appendMessageView(MessageView.fromUiMessage(msg.message, requestCopy));
      }
      break;
    }
    case "run_state": {
      setRunState(msg.state);
      follow.onRunState(isRunning()); // idle 等非运行态不自动滚动（FR-CHAT-09 ④）
      if (msg.detail && (msg.state === "error" || msg.state === "aborted")) {
        showToast(msg.detail);
      }
      break;
    }
    case "model_info": {
      refreshHeader(msg.model, msg.thinkingLevel, msg.sessionName);
      break;
    }
    case "session_name": {
      sessionNameEl.textContent = msg.name || "未命名会话";
      break;
    }
    case "error": {
      showError(msg.message, msg.hint);
      break;
    }
    case "toast": {
      showToast(msg.text);
      break;
    }
    case "external_change": {
      showExternalChangeBanner(msg.detail);
      break;
    }
    case "file_ref": {
      insertAtCursor(`@${msg.path} `, true);
      break;
    }
    case "input_prefill": {
      inputEl.value = msg.text;
      inputEl.focus();
      break;
    }
    case "commands": {
      // FR-CMD-03 ①：命令全集（空/不可用 → 状态机判定菜单不显示，⑤）
      cmdMenu.setCommands(msg.commands);
      renderCommandMenu();
      break;
    }
    case "models_list": {
      modelsCache = msg.models;
      if (!modelMenuEl.hidden) renderModelMenu(modelsCache);
      break;
    }
    case "usage_info": {
      refreshUsage(msg.totalTokens, msg.contextWindow);
      break;
    }
    default:
      break;
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  handleHostMessage(event.data);
});

// 通知宿主就绪（宿主回放配置/状态/历史）
post({ kind: "ready" });

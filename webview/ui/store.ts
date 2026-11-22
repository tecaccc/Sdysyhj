// 新 UI webview 状态镜像（TASK-009 §10.14 D4/D5；lab store 平移扩容）。
// 纯 reducer：输入 HostToWebview 事件（既有协议零改动复用），输出面板全量 UI 状态。
// 消息两条规则（FR-CHAT-11 / 澄清 #16/#17 消费侧口径）：
//   ① 幂等键 = 消息 id——message_final 同 id 就地覆盖（#16：更新前后均为一条）；
//   ② 被动保留——无事件即无操作（#17：不重绑、不追加、不错换）。
// toolcall_status 按 toolCallId 就地更新（#D-04：终稿后工具卡状态仍可回填）。
// delta 合批：EventBuffer 每 rAF 至多一次 store 演进（NFR-01 批处理判据），非 delta 事件前强制冲刷零丢失。
// 无 DOM / 无 React 依赖，单测全覆盖（test/unit/ui-store.test.ts）。

import type {
  HostToWebview,
  ModelSummary,
  RunState,
  SlashCommandInfo,
  UiBlock,
  UiMessage,
} from "../../src/panel/messages";

/** webview 本地事件（toast/错误卡/横幅手动关闭），与协议事件同构进 reducer。 */
export type UiLocalEvent =
  | { kind: "ui_dismiss_toast"; id: number }
  | { kind: "ui_dismiss_error"; id: number }
  | { kind: "ui_dismiss_banner" };

export type UiEvent = HostToWebview | UiLocalEvent;

export interface UiState {
  messages: UiMessage[];
  /** starting|streaming（FR-CHAT-08 运行状态展示与 FR-CHAT-09 跟随门控共用） */
  isRunning: boolean;
  runState: RunState;
  model: string;
  thinkingLevel: string;
  sessionName: string;
  totalTokens: number | null;
  contextWindow: number | null;
  tailLines: number;
  sendMode: "steer" | "followUp";
  workspaceLabel: string;
  errors: Array<{ id: number; message: string; hint?: string }>;
  toasts: Array<{ id: number; text: string }>;
  externalChange: string | null;
  models: ModelSummary[] | null;
  commands: SlashCommandInfo[];
  /** stream_start 事件计数（FR-CHAT-09 ①每轮默认跟随重置点的观察面，D4） */
  streamStartSeq: number;
  /** 会话切换/历史重建计数（命令全集缓存失效等副作用的观察面） */
  sessionEpoch: number;
  /** Composer 文本插入请求（file_ref 替换 @ / input_prefill 预填），seq 递增触发消费 */
  insertion: { seq: number; text: string; replaceAt: boolean } | null;
  nextLocalId: number;
}

export const initialUiState: UiState = {
  messages: [],
  isRunning: false,
  runState: "idle",
  model: "",
  thinkingLevel: "",
  sessionName: "",
  totalTokens: null,
  contextWindow: null,
  tailLines: 200,
  sendMode: "steer",
  workspaceLabel: "",
  errors: [],
  toasts: [],
  externalChange: null,
  models: null,
  commands: [],
  streamStartSeq: 0,
  sessionEpoch: 0,
  insertion: null,
  nextLocalId: 1,
};

/** 深拷贝块（reducer 纯度：不得就地变更事件 payload 引用的块对象——宿主在进程内测试下直传引用）。 */
function copyBlocks(blocks: UiBlock[]): UiBlock[] {
  return blocks.map((block) => (block.type === "toolcall" ? { ...block } : { type: block.type, text: block.text }));
}

/** 从事件流增量推导消息列表（按 id upsert / append——①幂等键=消息 id）。 */
function applyMessageEvent(state: UiState, messageId: string, build: () => UiMessage): UiMessage[] {
  const index = state.messages.findIndex((m) => m.id === messageId);
  if (index >= 0) {
    const next = [...state.messages];
    next[index] = build();
    return next;
  }
  return [...state.messages, build()];
}

function findMessage(state: UiState, messageId: string): UiMessage | undefined {
  return state.messages.find((m) => m.id === messageId);
}

/** text/thinking delta 追加到目标消息 index 位块（无则新建；块先拷贝防 payload 变异）。 */
function appendDelta(state: UiState, messageId: string, index: number, blockType: "text" | "thinking", delta: string): UiMessage[] {
  return applyMessageEvent(state, messageId, () => {
    const existing = findMessage(state, messageId);
    const blocks: UiBlock[] = existing ? copyBlocks(existing.blocks) : [];
    while (blocks.length < index) blocks.push({ type: "text", text: "" }); // 保序空位（映射期滤除）
    let target = blocks[index];
    if (!target || target.type !== blockType) {
      target = blockType === "text" ? { type: "text", text: "" } : { type: "thinking", text: "" };
      blocks[index] = target;
    }
    if (target.type === blockType) target.text += delta;
    return {
      id: messageId,
      role: "assistant",
      blocks,
      timestamp: existing?.timestamp ?? Date.now(),
    };
  });
}

/** toolcall 块就地更新（按 toolCallId 扫描——#D-04：终稿后 toolcall_status 仍可命中）。 */
function updateToolcallBlocks(blocks: UiBlock[], toolCallId: string, update: (block: Extract<UiBlock, { type: "toolcall" }>) => void): UiBlock[] {
  let hit = false;
  const next = blocks.map((block) => {
    if (block.type === "toolcall" && block.id === toolCallId) {
      hit = true;
      const copy = { ...block };
      update(copy);
      return copy;
    }
    return block;
  });
  return hit ? next : blocks;
}

const DELTA_KINDS = new Set(["text_delta", "thinking_delta", "toolcall_delta", "toolcall_status"]);

export function isDeltaEvent(event: UiEvent): boolean {
  return DELTA_KINDS.has(event.kind);
}

/** 事件 → 新状态（纯函数；未覆盖事件原样返回）。 */
export function uiReducer(state: UiState, event: UiEvent): UiState {
  switch (event.kind) {
    case "config":
      return { ...state, tailLines: event.tailLines, sendMode: event.sendMode, workspaceLabel: event.workspaceLabel };
    case "history_loaded":
      return {
        ...state,
        messages: event.messages.map((m) => ({ ...m, blocks: copyBlocks(m.blocks) })),
        sessionEpoch: state.sessionEpoch + 1,
      };
    case "session_reset":
      return {
        ...state,
        messages: [],
        sessionName: event.name || "未命名会话",
        sessionEpoch: state.sessionEpoch + 1,
        commands: [],
        models: null,
      };
    case "user_message":
      return {
        ...state,
        // §10.12 D1：宿主单源 id 直接 push（①发送即时展示，不等回声）
        messages: [
          ...state.messages,
          { id: event.id, role: "user", blocks: [{ type: "text", text: event.text }], timestamp: Date.now() },
        ],
      };
    case "stream_start":
      return {
        ...state,
        streamStartSeq: state.streamStartSeq + 1,
        messages: applyMessageEvent(state, event.messageId, () => {
          const existing = findMessage(state, event.messageId);
          return {
            id: event.messageId,
            role: "assistant",
            blocks: existing ? copyBlocks(existing.blocks) : [],
            timestamp: existing?.timestamp ?? Date.now(),
          };
        }),
      };
    case "text_delta":
      return { ...state, messages: appendDelta(state, event.messageId, event.index, "text", event.delta) };
    case "thinking_delta":
      return { ...state, messages: appendDelta(state, event.messageId, event.index, "thinking", event.delta) };
    case "toolcall_start":
      return {
        ...state,
        messages: applyMessageEvent(state, event.messageId, () => {
          const existing = findMessage(state, event.messageId);
          const blocks: UiBlock[] = existing ? copyBlocks(existing.blocks) : [];
          while (blocks.length < event.index) blocks.push({ type: "text", text: "" });
          blocks[event.index] = {
            type: "toolcall",
            id: event.id,
            tool: event.tool,
            args: event.args,
            summary: event.summary,
            status: "running",
            output: "",
            outputTruncated: false,
          };
          return {
            id: event.messageId,
            role: "assistant",
            blocks,
            timestamp: existing?.timestamp ?? Date.now(),
          };
        }),
      };
    case "toolcall_delta":
      return {
        ...state,
        messages: applyMessageEvent(state, event.messageId, () => {
          const existing = findMessage(state, event.messageId);
          const blocks: UiBlock[] = existing ? copyBlocks(existing.blocks) : [];
          while (blocks.length < event.index) blocks.push({ type: "text", text: "" });
          let target = blocks[event.index];
          if (!target || target.type !== "toolcall") {
            target = { type: "toolcall", id: `pending-${event.index}`, tool: "", args: "", summary: "", status: "running", output: "", outputTruncated: false };
            blocks[event.index] = target;
          }
          if (target.type === "toolcall") target.args += event.delta;
          return {
            id: event.messageId,
            role: "assistant",
            blocks,
            timestamp: existing?.timestamp ?? Date.now(),
          };
        }),
      };
    case "toolcall_status":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id !== event.messageId
            ? m
            : {
                ...m,
                blocks: updateToolcallBlocks(m.blocks, event.toolCallId, (block) => {
                  block.status = event.status;
                  if (event.summary !== undefined) block.summary = event.summary;
                  if (event.output !== undefined) block.output = event.output;
                  if (event.outputTruncated !== undefined) block.outputTruncated = event.outputTruncated;
                }),
              }
        ),
      };
    case "message_final":
      // ① 幂等键 = 消息 id：同 id 就地覆盖（#16 单条就地更新）；视图缺失才 append（合法兜底）
      return {
        ...state,
        messages: applyMessageEvent(state, event.messageId, () => ({ ...event.message, blocks: copyBlocks(event.message.blocks) })),
      };
    case "run_state":
      return {
        ...state,
        runState: event.state,
        isRunning: event.state === "starting" || event.state === "streaming",
      };
    case "model_info":
      return { ...state, model: event.model, thinkingLevel: event.thinkingLevel, sessionName: event.sessionName };
    case "session_name":
      return { ...state, sessionName: event.name || "未命名会话" };
    case "usage_info":
      return { ...state, totalTokens: event.totalTokens, contextWindow: event.contextWindow };
    case "commands":
      return { ...state, commands: event.commands };
    case "models_list":
      return { ...state, models: event.models };
    case "error":
      return {
        ...state,
        errors: [...state.errors, { id: state.nextLocalId, message: event.message, ...(event.hint ? { hint: event.hint } : {}) }],
        nextLocalId: state.nextLocalId + 1,
      };
    case "toast":
      return { ...state, toasts: [...state.toasts, { id: state.nextLocalId, text: event.text }], nextLocalId: state.nextLocalId + 1 };
    case "external_change":
      return { ...state, externalChange: event.detail };
    case "file_ref":
      return { ...state, insertion: { seq: (state.insertion?.seq ?? 0) + 1, text: `@${event.path} `, replaceAt: true } };
    case "input_prefill":
      return { ...state, insertion: { seq: (state.insertion?.seq ?? 0) + 1, text: event.text, replaceAt: false } };
    case "ui_dismiss_toast":
      return state.toasts.some((t) => t.id === event.id) ? { ...state, toasts: state.toasts.filter((t) => t.id !== event.id) } : state;
    case "ui_dismiss_error":
      return state.errors.some((e) => e.id === event.id) ? { ...state, errors: state.errors.filter((e) => e.id !== event.id) } : state;
    case "ui_dismiss_banner":
      return state.externalChange !== null ? { ...state, externalChange: null } : state;
    default:
      return state;
  }
}

/**
 * 极简 external store（useSyncExternalStore 目标）：dispatch 即 reducer 演进 + 通知。
 * 状态引用仅在变化时更新（getSnapshot 稳定性）；dispatchMany = 合批演进单次通知。
 */
export class UiStore {
  private state: UiState = initialUiState;
  private readonly listeners = new Set<() => void>();

  getSnapshot(): UiState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(event: UiEvent): void {
    const next = uiReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.notify();
  }

  /** 合批演进：折叠全部事件后单次通知（每 rAF 至多一次 store 演进，D4）。 */
  dispatchMany(events: readonly UiEvent[]): void {
    let next = this.state;
    for (const event of events) next = uiReducer(next, event);
    if (next === this.state) return;
    this.state = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * delta 合批缓冲（D4）：delta 事件按 rAF 合批（schedule 可注入，测试确定性）；
 * 非 delta 事件（含 message_final/history_loaded/session_reset）前强制冲刷 = 零丢失保证。
 */
export class EventBuffer {
  private queue: UiEvent[] = [];
  private scheduled = false;

  constructor(
    private readonly sink: { dispatch(event: UiEvent): void; dispatchMany(events: readonly UiEvent[]): void },
    private readonly schedule: (flush: () => void) => void = (cb) => {
      requestAnimationFrame(() => cb());
    }
  ) {}

  push(event: UiEvent): void {
    if (isDeltaEvent(event)) {
      this.queue.push(event);
      if (!this.scheduled) {
        this.scheduled = true;
        this.schedule(() => {
          this.scheduled = false;
          this.flush();
        });
      }
      return;
    }
    this.flush();
    this.sink.dispatch(event);
  }

  /** 强制冲刷（message_final/history_loaded/session_reset 前保证 delta 零丢失）。 */
  flush(): void {
    if (this.queue.length === 0) return;
    const events = this.queue;
    this.queue = [];
    this.sink.dispatchMany(events);
  }
}

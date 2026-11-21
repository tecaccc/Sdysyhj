// 路线 B webview 状态镜像（FR-AUI-02②；TASK-009 §10.13 D3）。
// 纯 reducer：输入 HostToWebview 事件（既有协议零改动复用），输出 { messages, isRunning }。
// 幂等键 = 消息 id（§10.12 D4 同语义：同 id 重复 message_final 就地覆盖不追加）；
// user_message 直接 push（宿主单源 id，§10.12 D1——FR-CHAT-11 语义由宿主账本承载）。
// 无 DOM / 无 React 依赖，单测全覆盖（test/unit/lab-store.test.ts）。

import type { HostToWebview, UiBlock, UiMessage } from "../../src/panel/messages";

export interface LabState {
  messages: UiMessage[];
  isRunning: boolean;
}

export const initialLabState: LabState = { messages: [], isRunning: false };

/** 深拷贝块（reducer 纯度：不得就地变更事件 payload 引用的块对象——宿主在进程内测试下直传引用）。 */
function copyBlocks(blocks: UiBlock[]): UiBlock[] {
  return blocks.map((block) =>
    block.type === "toolcall"
      ? { ...block }
      : { type: block.type, text: block.text }
  );
}

/** 从事件流增量推导消息列表（按 id upsert / append）。 */
function applyMessageEvent(state: LabState, messageId: string, build: () => UiMessage): UiMessage[] {
  const index = state.messages.findIndex((m) => m.id === messageId);
  if (index >= 0) {
    const next = [...state.messages];
    next[index] = build();
    return next;
  }
  return [...state.messages, build()];
}

/** text/thinking delta 追加到目标消息的对应类型尾块（无则新建；streaming 期间原地追加；块先拷贝防 payload 变异）。 */
function appendDelta(state: LabState, messageId: string, blockType: "text" | "thinking", delta: string): UiMessage[] {
  return applyMessageEvent(state, messageId, () => {
    const existing = state.messages.find((m) => m.id === messageId);
    const blocks: UiBlock[] = existing ? copyBlocks(existing.blocks) : [];
    let last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
    if (!last || last.type !== blockType) {
      last = blockType === "text" ? { type: "text", text: "" } : { type: "thinking", text: "" };
      blocks.push(last);
    }
    if (last.type === blockType) last.text += delta;
    return {
      id: messageId,
      role: "assistant",
      blocks,
      timestamp: existing?.timestamp ?? Date.now(),
    };
  });
}

/** 事件 → 新状态（纯函数；未覆盖事件原样返回，isRunning = starting|streaming）。 */
export function labReducer(state: LabState, event: HostToWebview): LabState {
  switch (event.kind) {
    case "history_loaded":
      return { ...state, messages: event.messages.map((m) => ({ ...m, blocks: copyBlocks(m.blocks) })) };
    case "session_reset":
      return { ...state, messages: [] };
    case "user_message":
      return {
        ...state,
        messages: [...state.messages, { id: event.id, role: "user", blocks: [{ type: "text", text: event.text }], timestamp: Date.now() }],
      };
    case "stream_start":
      return {
        ...state,
        messages: applyMessageEvent(state, event.messageId, () => {
          const existing = state.messages.find((m) => m.id === event.messageId);
          return { id: event.messageId, role: "assistant", blocks: existing ? copyBlocks(existing.blocks) : [], timestamp: existing?.timestamp ?? Date.now() };
        }),
      };
    case "text_delta":
      return { ...state, messages: appendDelta(state, event.messageId, "text", event.delta) };
    case "thinking_delta":
      return { ...state, messages: appendDelta(state, event.messageId, "thinking", event.delta) };
    case "message_final":
      return {
        ...state,
        messages: applyMessageEvent(state, event.messageId, () => ({ ...event.message, blocks: copyBlocks(event.message.blocks) })),
      };
    case "run_state":
      return { ...state, isRunning: event.state === "starting" || event.state === "streaming" };
    default:
      return state;
  }
}

/**
 * 极简 external store（useSyncExternalStore 目标）：dispatch 即 reducer 演进 + 通知。
 * 消息数组引用仅在变化时更新（getSnapshot 稳定性）。
 */
export class LabStore {
  private state: LabState = initialLabState;
  private readonly listeners = new Set<() => void>();

  getSnapshot(): LabState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(event: HostToWebview): void {
    const next = labReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}

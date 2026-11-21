// TASK-009 §10.13 D8 单测：路线 B store reducer（FR-AUI-02②/FR-AUI-03①）。
// 判定面 = webview store 的 messages 状态（D8：断言落通道+数据层，不建 DOM 基建）。
// 幂等键 = 消息 id（§10.12 D4 同语义）；user_message 直接 push（宿主单源 id，§10.12 D1）。

import { describe, expect, it } from "vitest";
import type { HostToWebview, UiMessage } from "../../src/panel/messages";
import { LabStore, initialLabState, labReducer } from "../../webview/lab/store";
import { toThreadMessageLike } from "../../webview/lab/threadMessageLike";

const apply = (events: HostToWebview[]) => events.reduce(labReducer, initialLabState);
const textOf = (m: UiMessage): string => m.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");

describe("labReducer（FR-AUI-02② 事件镜像 → messages 状态）", () => {
  it("① user_message push；message_final(user) 同 id 就地覆盖不追加（幂等键=消息 id）", () => {
    const state = apply([
      { kind: "user_message", id: "u1", text: "发送原文" },
      { kind: "message_final", messageId: "u1", message: { id: "u1", role: "user", blocks: [{ type: "text", text: "pi 权威文本" }], timestamp: 2 } },
    ] as HostToWebview[]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("pi 权威文本");
  });

  it("② stream_start + text_delta 流式：assistant 消息原地追加（外部库流式口径同型）", () => {
    const state = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "ack: " },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "GOLDEN" },
      { kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "ack: GOLDEN" }], timestamp: 3 } },
    ] as HostToWebview[]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("ack: GOLDEN");
  });

  it("③ 重复 message_final 同 id 就地覆盖（幂等）不追加第二条", () => {
    const finalMsg: UiMessage = { id: "m1", role: "assistant", blocks: [{ type: "text", text: "终稿" }], timestamp: 3 };
    const state = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "message_final", messageId: "m1", message: finalMsg },
      { kind: "message_final", messageId: "m1", message: { ...finalMsg, blocks: [{ type: "text", text: "终稿v2" }] } },
    ] as HostToWebview[]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("终稿v2");
  });

  it("④ history_loaded 全量重建（面板 ready 回放）", () => {
    const history: UiMessage[] = [
      { id: "u1", role: "user", blocks: [{ type: "text", text: "Q" }], timestamp: 1 },
      { id: "a1", role: "assistant", blocks: [{ type: "text", text: "A" }], timestamp: 2 },
    ];
    const state = apply([{ kind: "history_loaded", messages: history }]);
    expect(state.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("⑤ run_state → isRunning（starting/streaming=true，idle/aborted/error=false）", () => {
    expect(apply([{ kind: "run_state", state: "starting" }]).isRunning).toBe(true);
    expect(apply([{ kind: "run_state", state: "streaming" }]).isRunning).toBe(true);
    expect(apply([{ kind: "run_state", state: "idle" }]).isRunning).toBe(false);
    expect(apply([{ kind: "run_state", state: "aborted" }]).isRunning).toBe(false);
  });

  it("⑥ 未覆盖事件（model_info/error/toast…）不改变 messages（原状态引用返回）", () => {
    const before = apply([{ kind: "user_message", id: "u1", text: "x" }]);
    const after = labReducer(before, { kind: "model_info", model: "m", thinkingLevel: "off", sessionName: "s" });
    expect(after).toBe(before);
  });

  it("⑦ XSS 探针文本经 reducer 与映射层逐字节保真（FR-AUI-02⑤ 通道层）", () => {
    const probe = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const state = apply([
      { kind: "user_message", id: "u1", text: `LAB-XSS probe ${probe}` },
      { kind: "message_final", messageId: "u1", message: { id: "u1", role: "user", blocks: [{ type: "text", text: `LAB-XSS probe ${probe}` }], timestamp: 1 } },
      { kind: "stream_start", messageId: "m1" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: `probe reply ${probe}` },
      { kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: `probe reply ${probe}` }], timestamp: 2 } },
    ] as HostToWebview[]);
    expect(textOf(state.messages[0])).toBe(`LAB-XSS probe ${probe}`);
    expect(textOf(state.messages[1])).toBe(`probe reply ${probe}`);
    for (const m of state.messages) {
      const like = toThreadMessageLike(m);
      const text = Array.isArray(like.content) ? (like.content[0] as { text: string }).text : like.content;
      expect(text).toContain(probe);
    }
  });

  it("⑧ LabStore：dispatch 通知订阅者、getSnapshot 稳定（未变化不通知）", () => {
    const store = new LabStore();
    let notified = 0;
    const unsub = store.subscribe(() => (notified += 1));
    store.dispatch({ kind: "user_message", id: "u1", text: "a" });
    store.dispatch({ kind: "model_info", model: "m", thinkingLevel: "off", sessionName: "s" }); // 无状态变化
    expect(notified).toBe(1);
    expect(store.getSnapshot().messages).toHaveLength(1);
    unsub();
    store.dispatch({ kind: "user_message", id: "u2", text: "b" });
    expect(notified).toBe(1);
  });

  it("⑨ reducer 纯度：不就地变更事件 payload 引用的块对象（进程内引用直传下防交叉污染）", () => {
    const block = { type: "text" as const, text: "初始" };
    const historyMessage: UiMessage = { id: "m1", role: "assistant", blocks: [block], timestamp: 1 };
    const finalMessage: UiMessage = { id: "m1", role: "assistant", blocks: [{ type: "text", text: "终稿" }], timestamp: 2 };
    labReducer(
      labReducer(initialLabState, { kind: "history_loaded", messages: [historyMessage] }),
      { kind: "text_delta", messageId: "m1", index: 0, delta: "追加" }
    );
    // payload 块对象未被变异（history_loaded 引用与终稿对象各归各）
    expect(block.text).toBe("初始");
    const state = labReducer(initialLabState, { kind: "message_final", messageId: "m1", message: finalMessage });
    expect(textOf(state.messages[0])).toBe("终稿");
    expect(finalMessage.blocks[0]).toEqual({ type: "text", text: "终稿" });
  });
});

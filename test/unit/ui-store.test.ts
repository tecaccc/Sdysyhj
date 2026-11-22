// TASK-009 §10.14 D8 单测：新 UI store reducer + delta 合批缓冲（D4/D5）。
// 回归重定向：lab-store.test.ts → 本文件（①–⑨ 断言平移扩容，无放宽）。
// 消息规则（FR-CHAT-11 / 澄清 #16/#17 消费侧）：① 幂等键=消息 id 就地覆盖；② 被动保留（无事件无操作）。

import { describe, expect, it } from "vitest";
import type { HostToWebview, UiMessage } from "../../src/panel/messages";
import { EventBuffer, UiStore, initialUiState, uiReducer, type UiEvent, type UiState } from "../../webview/ui/store";
import { toThreadMessageLike } from "../../webview/ui/threadMessageLike";

const apply = (events: UiEvent[]): UiState => events.reduce(uiReducer, initialUiState);
const textOf = (m: UiMessage): string => m.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");

describe("uiReducer（FR-AUI-02② 事件镜像 → 面板状态）", () => {
  it("① user_message push；message_final(user) 同 id 就地覆盖不追加（幂等键=消息 id，#16）", () => {
    const state = apply([
      { kind: "user_message", id: "u1", text: "发送原文" },
      { kind: "message_final", messageId: "u1", message: { id: "u1", role: "user", blocks: [{ type: "text", text: "pi 权威文本" }], timestamp: 2 } },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("pi 权威文本");
  });

  it("② stream_start + text_delta 流式：assistant 消息原地追加", () => {
    const state = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "ack: " },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "GOLDEN" },
      { kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "ack: GOLDEN" }], timestamp: 3 } },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("ack: GOLDEN");
  });

  it("③ 重复 message_final 同 id 就地覆盖（幂等）不追加第二条", () => {
    const finalMsg: UiMessage = { id: "m1", role: "assistant", blocks: [{ type: "text", text: "终稿" }], timestamp: 3 };
    const state = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "message_final", messageId: "m1", message: finalMsg },
      { kind: "message_final", messageId: "m1", message: { ...finalMsg, blocks: [{ type: "text", text: "终稿v2" }] } },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(textOf(state.messages[0])).toBe("终稿v2");
  });

  it("④ history_loaded 全量重建（权威重建唯一入口，③④）", () => {
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

  it("⑥ model_info 等事件不改变 messages（消息数组引用不变）", () => {
    const before = apply([{ kind: "user_message", id: "u1", text: "x" }]);
    const after = uiReducer(before, { kind: "model_info", model: "m", thinkingLevel: "off", sessionName: "s" });
    expect(after.messages).toBe(before.messages);
    expect(after.model).toBe("m");
  });

  it("⑦ XSS 探针文本经 reducer 与映射层逐字节保真（通道层）", () => {
    const probe = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const state = apply([
      { kind: "user_message", id: "u1", text: `UI-XSS probe ${probe}` },
      { kind: "message_final", messageId: "u1", message: { id: "u1", role: "user", blocks: [{ type: "text", text: `UI-XSS probe ${probe}` }], timestamp: 1 } },
      { kind: "stream_start", messageId: "m1" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: `probe reply ${probe}` },
      { kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: `probe reply ${probe}` }], timestamp: 2 } },
    ]);
    expect(textOf(state.messages[0])).toBe(`UI-XSS probe ${probe}`);
    expect(textOf(state.messages[1])).toBe(`probe reply ${probe}`);
    for (const m of state.messages) {
      const like = toThreadMessageLike(m);
      const text = Array.isArray(like.content) ? (like.content[0] as { text: string }).text : like.content;
      expect(text).toContain(probe);
    }
  });

  it("⑧ UiStore：dispatch 通知订阅者、getSnapshot 稳定（未变化不通知）", () => {
    const store = new UiStore();
    let notified = 0;
    const unsub = store.subscribe(() => (notified += 1));
    store.dispatch({ kind: "user_message", id: "u1", text: "a" });
    store.dispatch({ kind: "unknown-event" } as unknown as UiEvent); // 无状态变化
    expect(notified).toBe(1);
    expect(store.getSnapshot().messages).toHaveLength(1);
    unsub();
    store.dispatch({ kind: "user_message", id: "u2", text: "b" });
    expect(notified).toBe(1);
  });

  it("⑨ reducer 纯度：不就地变更事件 payload 引用的块对象", () => {
    const block = { type: "text" as const, text: "初始" };
    const historyMessage: UiMessage = { id: "m1", role: "assistant", blocks: [block], timestamp: 1 };
    const finalMessage: UiMessage = { id: "m1", role: "assistant", blocks: [{ type: "text", text: "终稿" }], timestamp: 2 };
    uiReducer(
      uiReducer(initialUiState, { kind: "history_loaded", messages: [historyMessage] }),
      { kind: "text_delta", messageId: "m1", index: 0, delta: "追加" }
    );
    expect(block.text).toBe("初始");
    const state = uiReducer(initialUiState, { kind: "message_final", messageId: "m1", message: finalMessage });
    expect(textOf(state.messages[0])).toBe("终稿");
    expect(finalMessage.blocks[0]).toEqual({ type: "text", text: "终稿" });
  });

  it("⑩ toolcall_start/delta/status 全链：块就地更新；终稿后 toolcall_status 仍命中（#D-04 store 层同语义）", () => {
    const state = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "toolcall_start", messageId: "m1", index: 0, id: "tc1", tool: "bash", args: "{\"command\":", summary: "ls" },
      { kind: "toolcall_delta", messageId: "m1", index: 0, delta: "\"ls\"}" },
      {
        kind: "message_final",
        messageId: "m1",
        message: {
          id: "m1",
          role: "assistant",
          blocks: [{ type: "toolcall", id: "tc1", tool: "bash", args: "{\"command\":\"ls\"}", summary: "ls", status: "running", output: "", outputTruncated: false }],
          timestamp: 3,
        },
      },
      { kind: "toolcall_status", messageId: "m1", toolCallId: "tc1", status: "success", summary: "cmd", output: "a\nb", outputTruncated: true },
    ]);
    const block = state.messages[0].blocks[0];
    expect(block).toEqual({
      type: "toolcall",
      id: "tc1",
      tool: "bash",
      args: "{\"command\":\"ls\"}",
      summary: "cmd",
      status: "success",
      output: "a\nb",
      outputTruncated: true,
    });
    // 流式期 delta 追加（终稿前）
    const streaming = apply([
      { kind: "stream_start", messageId: "m1" },
      { kind: "toolcall_start", messageId: "m1", index: 0, id: "tc1", tool: "bash", args: "{}", summary: "" },
      { kind: "toolcall_delta", messageId: "m1", index: 0, delta: "X" },
    ]);
    expect((streaming.messages[0].blocks[0] as { args: string }).args).toBe("{}X");
  });

  it("⑪ #17 被动保留：无回声事件时乐观条目保持单条不错换（无事件=无操作）", () => {
    const state = apply([
      { kind: "user_message", id: "u1", text: "原文A" },
      { kind: "user_message", id: "u2", text: "原文B" },
    ]);
    // 无 message_final 到达（多通道不可判定受控例外）：条目保持发送原文、恒 2 条
    expect(state.messages.map(textOf)).toEqual(["原文A", "原文B"]);
  });

  it("⑫ run_state 之外的展示面：usage/commands/models/insertion/错误与 toast 生命周期", () => {
    let state = apply([
      { kind: "usage_info", totalTokens: 12300, contextWindow: 200000 },
      { kind: "commands", commands: [{ name: "review" }] },
      { kind: "models_list", models: [{ id: "m", provider: "p" }] },
      { kind: "file_ref", path: "src/a.ts" },
    ]);
    expect(state.totalTokens).toBe(12300);
    expect(state.commands).toHaveLength(1);
    expect(state.models).toHaveLength(1);
    expect(state.insertion).toEqual({ seq: 1, text: "@src/a.ts ", replaceAt: true });
    state = uiReducer(state, { kind: "input_prefill", text: "预填" });
    expect(state.insertion).toEqual({ seq: 2, text: "预填", replaceAt: false });
    state = uiReducer(state, { kind: "error", message: "e", hint: "h" });
    state = uiReducer(state, { kind: "toast", text: "t" });
    expect(state.errors).toHaveLength(1);
    expect(state.toasts).toHaveLength(1);
    state = uiReducer(state, { kind: "ui_dismiss_error", id: state.errors[0].id });
    state = uiReducer(state, { kind: "ui_dismiss_toast", id: state.toasts[0].id });
    expect(state.errors).toHaveLength(0);
    expect(state.toasts).toHaveLength(0);
    state = uiReducer(state, { kind: "external_change", detail: "d" });
    expect(state.externalChange).toBe("d");
    state = uiReducer(state, { kind: "ui_dismiss_banner" });
    expect(state.externalChange).toBeNull();
  });
});

describe("EventBuffer（D4 delta 合批：每 rAF 至多一次 store 演进 + 零丢失）", () => {
  it("⑬ 多 delta 合批单次通知；非 delta 前强制冲刷（message_final 前零丢失）", () => {
    const store = new UiStore();
    const pending: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => pending.push(cb));
    let notified = 0;
    store.subscribe(() => (notified += 1));

    buffer.push({ kind: "stream_start", messageId: "m1" } as HostToWebview);
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "a" } as HostToWebview);
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "b" } as HostToWebview);
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "c" } as HostToWebview);
    const afterNonDelta = notified; // stream_start 立即演进 1 次；delta 尚未冲刷
    expect(store.getSnapshot().messages[0].blocks).toEqual([]);

    pending.forEach((cb) => cb()); // rAF 冲刷：3 delta 合批一次演进
    expect(notified).toBe(afterNonDelta + 1);
    expect(textOf(store.getSnapshot().messages[0])).toBe("abc");

    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "d" } as HostToWebview);
    buffer.push({ kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "abcd" }], timestamp: 1 } } as HostToWebview);
    // message_final 前强制冲刷："d" 零丢失（合批 + final 顺序保持）
    expect(textOf(store.getSnapshot().messages[0])).toBe("abcd");
  });

  it("⑭ 600 delta 合批零丢失（NFR-01 代理判据的 store 层）", () => {
    const store = new UiStore();
    const pending: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => pending.push(cb));
    buffer.push({ kind: "stream_start", messageId: "m1" } as HostToWebview);
    for (let i = 0; i < 600; i++) buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: `${i},` } as HostToWebview);
    pending.forEach((cb) => cb());
    const text = textOf(store.getSnapshot().messages[0]);
    expect(text.length).toBeGreaterThan(0);
    expect(text.split(",").filter(Boolean)).toHaveLength(600);
  });
});

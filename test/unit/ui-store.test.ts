// TASK-009 §10.14 D8 单测：新 UI store reducer + delta 合批缓冲（D4/D5）。
// 回归重定向：lab-store.test.ts → 本文件（①–⑨ 断言平移扩容，无放宽）。
// 消息规则（FR-CHAT-11 / 澄清 #16/#17 消费侧）：① 幂等键=消息 id 就地覆盖；② 被动保留（无事件无操作）。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostToWebview, UiMessage } from "../../src/panel/messages";
import {
  EventBuffer,
  STREAM_NOTIFY_THROTTLE_MS,
  UiStore,
  initialUiState,
  isDeltaEvent,
  uiReducer,
  type UiEvent,
  type UiState,
} from "../../webview/ui/store";
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
  // 通知时机断言调整说明（#D-07/R-05 修复）：本用例旧版断言「rAF 冲刷后立即通知」，属中间时机断言
  // ——恰为本次修复所变更的维度（通知从「每 rAF 合批演进一次」改为「流式期间窗口合批 ≤1次/300ms」）。
  // 新契约：rAF 冲刷后状态已累积（零丢失断言不变），通知入窗延迟；message_final 终态立即冲刷通知。
  // 终态/零丢失/顺序断言全部保留不变（见下）。新增 fake timers 专段（下个 describe）钉死节流语义。
  it("⑬ 多 delta 合批单演进；窗口内不通知；message_final 立即冲刷（d 零丢失，顺序保持）", () => {
    const store = new UiStore();
    const pending: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => pending.push(cb));
    let notified = 0;
    store.subscribe(() => (notified += 1));

    buffer.push({ kind: "stream_start", messageId: "m1" } as HostToWebview); // 非流式事件：立即通知 1 次
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "a" } as HostToWebview);
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "b" } as HostToWebview);
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "c" } as HostToWebview);
    expect(store.getSnapshot().messages[0].blocks).toEqual([]); // delta 尚未演进（rAF 待冲刷）

    pending.forEach((cb) => cb()); // rAF 冲刷：3 delta 合批一次演进
    // 节流只影响通知时机，不影响状态累积：通知未发（入窗），状态已累积 "abc"
    expect(textOf(store.getSnapshot().messages[0])).toBe("abc");
    expect(notified).toBe(1); // 窗口内多次演进仅通知一次（本次演进零新增通知）

    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "d" } as HostToWebview);
    buffer.push({ kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "abcd" }], timestamp: 1 } } as HostToWebview);
    // message_final 前强制冲刷 + 终态立即通知："d" 零丢失（合批 + final 顺序保持）
    expect(textOf(store.getSnapshot().messages[0])).toBe("abcd");
    expect(notified).toBe(2); // message_final（message_end 映射）立即冲刷通知
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

describe("通知层节流（#D-07/R-05 修复：同窗口多次 store 演进仅通知一次 + 终态立即冲刷）", () => {
  // fake timers：setTimeout/Date 同源推进（尾随 timer 触发点、窗口起点均确定性可控）
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("⑮ 频率上界：流式期间相邻通知间隔 ≥300ms（≤1次/300ms）；全部 delta 零丢失按序累积", () => {
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    const notifyAt: number[] = [];
    store.subscribe(() => notifyAt.push(Date.now()));

    buffer.push({ kind: "run_state", state: "starting" }); // 非流式事件：立即通知（流式期首事件，允许）
    expect(notifyAt).toHaveLength(1);
    buffer.push({ kind: "stream_start", messageId: "m1" }); // 运行中非终态：入窗不通知
    expect(notifyAt).toHaveLength(1);

    // 60Hz 流式 ~3s：每帧 16ms 推 5 个增量（text 帧/thinking 帧交替，各自独立块位）+ rAF 合批演进
    const textDeltas: string[] = [];
    const thinkingDeltas: string[] = [];
    for (let frame = 0; frame < 188; frame++) {
      const isThinking = frame % 2 === 1;
      const sink = isThinking ? thinkingDeltas : textDeltas;
      for (let i = 0; i < 5; i++) {
        const d = `f${frame}i${i};`;
        sink.push(d);
        buffer.push({ kind: isThinking ? "thinking_delta" : "text_delta", messageId: "m1", index: isThinking ? 1 : 0, delta: d });
      }
      raf.splice(0).forEach((cb) => cb()); // 本帧 rAF：合批演进
      vi.advanceTimersByTime(16);
    }

    // 频率上界：相邻通知间隔 ≥300ms（含首事件通知后首尾随也隔满窗）
    for (let i = 1; i < notifyAt.length; i++) {
      expect(notifyAt[i] - notifyAt[i - 1]).toBeGreaterThanOrEqual(STREAM_NOTIFY_THROTTLE_MS);
    }
    // 同窗口多次演进仅通知一次：188 帧演进 → 通知数 ≪ 帧数（量级断言，上界 = 时长/窗口 + 2）
    expect(notifyAt.length).toBeGreaterThan(1);
    expect(notifyAt.length).toBeLessThanOrEqual(Math.floor((188 * 16) / STREAM_NOTIFY_THROTTLE_MS) + 2);
    // 零丢失零乱序：节流不影响状态累积（text/thinking 各自块位全量按序拼接）
    const blocks = store.getSnapshot().messages[0].blocks;
    expect((blocks[0] as { type: string; text: string }).text).toBe(textDeltas.join(""));
    expect((blocks[1] as { type: string; text: string }).text).toBe(thinkingDeltas.join(""));
    expect(textOf(store.getSnapshot().messages[0])).toBe(textDeltas.join(""));
  });

  it("⑯ 终态一致性：节流管线 message_final/settled 后状态 = 逐事件处理（逐字节等价）", () => {
    const events: UiEvent[] = [
      { kind: "run_state", state: "starting" },
      { kind: "stream_start", messageId: "m1" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "Hel" },
      { kind: "text_delta", messageId: "m1", index: 0, delta: "lo" },
      { kind: "thinking_delta", messageId: "m1", index: 1, delta: "hmm" },
      { kind: "text_delta", messageId: "m1", index: 2, delta: "tail" },
      { kind: "toolcall_start", messageId: "m1", index: 3, id: "tc1", tool: "bash", args: "{}", summary: "" },
      { kind: "toolcall_delta", messageId: "m1", index: 3, delta: "X" },
      {
        kind: "message_final",
        messageId: "m1",
        message: {
          id: "m1",
          role: "assistant",
          blocks: [
            { type: "text", text: "Hello" },
            { type: "thinking", text: "hmm" },
            { type: "text", text: "tail" },
            { type: "toolcall", id: "tc1", tool: "bash", args: "{}X", summary: "", status: "running", output: "", outputTruncated: false },
          ],
          timestamp: 42,
        },
      },
      { kind: "toolcall_status", messageId: "m1", toolCallId: "tc1", status: "success", output: "ok", outputTruncated: false },
      { kind: "run_state", state: "idle" },
    ];

    // A 节流管线：EventBuffer（rAF 手控）+ 通知节流，窗口交错（每次演进推进半窗跨尾随触发点）
    vi.setSystemTime(1_000);
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    for (const event of events) {
      buffer.push(event);
      if (isDeltaEvent(event)) {
        raf.splice(0).forEach((cb) => cb()); // rAF 合批演进（窗口内多次演进）
        vi.advanceTimersByTime(STREAM_NOTIFY_THROTTLE_MS / 2);
      }
    }
    vi.advanceTimersByTime(STREAM_NOTIFY_THROTTLE_MS * 2); // 排空尾随窗口，只留终态已冲刷结果

    // B 逐事件处理基线：同一 reducer 逐条折叠（同一时钟起点 → Date.now 派生字段同源）
    vi.setSystemTime(1_000);
    const baseline = events.reduce(uiReducer, initialUiState);

    expect(JSON.stringify(store.getSnapshot())).toBe(JSON.stringify(baseline));
  });

  it("⑰ flush 语义：窗口内 message_final 立即同步通知（零 timer 推进）且尾随不悬挂", () => {
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    let notified = 0;
    store.subscribe(() => (notified += 1));

    buffer.push({ kind: "run_state", state: "starting" });
    buffer.push({ kind: "stream_start", messageId: "m1" });
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "abc" });
    raf.splice(0).forEach((cb) => cb()); // 演进入窗
    expect(notified).toBe(1); // 窗口内不通知

    // message_final（pi message_end 映射）＝ 终态汇合：立即冲刷（同步，未推进任何 timer）
    buffer.push({ kind: "message_final", messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "final" }], timestamp: 1 } });
    expect(notified).toBe(2);
    expect(textOf(store.getSnapshot().messages[0])).toBe("final");

    // 尾随 timer 已清除：推进任意时长零新增通知（无悬挂 timer）
    vi.advanceTimersByTime(1_000);
    expect(notified).toBe(2);
  });

  it("⑱ abort/急停：run_state 终态（aborted→idle）立即冲刷；增量零丢失；多窗口推进零悬挂", () => {
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    let notified = 0;
    store.subscribe(() => (notified += 1));

    buffer.push({ kind: "run_state", state: "starting" });
    buffer.push({ kind: "stream_start", messageId: "m1" });
    for (const d of ["a", "b", "c"]) buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: d });
    raf.splice(0).forEach((cb) => cb()); // 演进入窗
    expect(notified).toBe(1);
    expect(textOf(store.getSnapshot().messages[0])).toBe("abc"); // 节流不影响累积

    // 用户 Stop → agent_settled(aborted)：run_state(aborted) + run_state(idle)（生产同序）
    buffer.push({ kind: "run_state", state: "aborted" });
    expect(notified).toBe(2); // 立即冲刷
    buffer.push({ kind: "run_state", state: "idle" });
    expect(notified).toBe(3); // 立即冲刷

    // 悬挂检查：5 个节流窗口时长内零新增通知；终态与逐事件一致
    for (let i = 0; i < 5; i++) vi.advanceTimersByTime(STREAM_NOTIFY_THROTTLE_MS);
    expect(notified).toBe(3);
    expect(textOf(store.getSnapshot().messages[0])).toBe("abc");
  });

  it("⑲ 修复语义：节流只影响通知时机，不影响状态累积——窗口内快照已含全部增量", () => {
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    let notified = 0;
    let snapshotAtNotify = "";
    store.subscribe(() => {
      notified += 1;
      const m = store.getSnapshot().messages[0];
      snapshotAtNotify = m ? textOf(m) : "";
    });

    buffer.push({ kind: "run_state", state: "starting" });
    buffer.push({ kind: "stream_start", messageId: "m1" });
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "a" });
    raf.splice(0).forEach((cb) => cb());
    expect(notified).toBe(1); // 通知未发
    expect(textOf(store.getSnapshot().messages[0])).toBe("a"); // 状态已累积

    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "b" });
    raf.splice(0).forEach((cb) => cb());
    expect(notified).toBe(1); // 窗口内后续演进仍不通知
    expect(textOf(store.getSnapshot().messages[0])).toBe("ab"); // 累积持续

    // 窗口终点尾随通知：渲染态追平累积态
    vi.advanceTimersByTime(STREAM_NOTIFY_THROTTLE_MS + 1);
    expect(notified).toBe(2);
    expect(snapshotAtNotify).toBe("ab");
  });

  it("⑳ 权威重建汇合点：窗口内 history_loaded / session_reset 立即冲刷（终态精确）", () => {
    const store = new UiStore();
    const raf: Array<() => void> = [];
    const buffer = new EventBuffer(store, (cb) => raf.push(cb));
    let notified = 0;
    store.subscribe(() => (notified += 1));

    buffer.push({ kind: "run_state", state: "starting" });
    buffer.push({ kind: "stream_start", messageId: "m1" });
    buffer.push({ kind: "text_delta", messageId: "m1", index: 0, delta: "x" });
    raf.splice(0).forEach((cb) => cb());
    expect(notified).toBe(1); // 窗口内

    const history: UiMessage[] = [
      { id: "u1", role: "user", blocks: [{ type: "text", text: "Q" }], timestamp: 1 },
      { id: "a1", role: "assistant", blocks: [{ type: "text", text: "A" }], timestamp: 2 },
    ];
    buffer.push({ kind: "history_loaded", messages: history });
    expect(notified).toBe(2); // 立即冲刷
    expect(store.getSnapshot().messages).toHaveLength(2);
    expect(store.getSnapshot().sessionEpoch).toBe(1);

    buffer.push({ kind: "session_reset", sessionId: "s2", name: "新会话" });
    expect(notified).toBe(3); // 立即冲刷
    expect(store.getSnapshot().messages).toHaveLength(0);

    vi.advanceTimersByTime(1_000);
    expect(notified).toBe(3); // 无悬挂
  });
});

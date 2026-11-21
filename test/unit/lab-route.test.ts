// TASK-009 §10.13 D8 单测：路线 A 事件→帧翻译器 LabFrameTranslator 与 ChatRequest 解析（FR-AUI-02①）。
// 帧型权威样例：`ai` UIMessageChunk（start-step/text-start/text-delta/text-end/reasoning-*/
// finish-step/finish/abort/error；官方测试床 fixtures/route.ts，§11 #16/#17）。
// 判定面 = 驱动渲染的 UIMessage 流帧（D8 通道+数据层）。

import { describe, expect, it } from "vitest";
import type { BridgeEvent } from "../../src/bridge/piBridge";
import { LabFrameTranslator, readChatRequestPrompt } from "../../src/lab/chatRoute";

const ev = <K extends BridgeEvent["kind"]>(kind: K, payload: Omit<Extract<BridgeEvent, { kind: K }>, "kind">): BridgeEvent =>
  ({ kind, ...payload } as unknown as BridgeEvent);

describe("LabFrameTranslator（FR-AUI-02① PiBridge 事件 → UIMessage 流帧）", () => {
  it("① stream_start → start-step；首条 text_delta 开 part（text-start + text-delta），后续仅 delta", () => {
    const t = new LabFrameTranslator();
    expect(t.push(ev("stream_start", { messageId: "m1" }))).toEqual([{ type: "start-step" }]);
    expect(t.push(ev("text_delta", { messageId: "m1", index: 0, delta: "he" }))).toEqual([
      { type: "text-start", id: "t0" },
      { type: "text-delta", id: "t0", delta: "he" },
    ]);
    expect(t.push(ev("text_delta", { messageId: "m1", index: 0, delta: "llo" }))).toEqual([{ type: "text-delta", id: "t0", delta: "llo" }]);
  });

  it("② thinking_delta → reasoning-start/reasoning-delta（同型）；text/reasoning 交替按 index 开新 part", () => {
    const t = new LabFrameTranslator();
    t.push(ev("stream_start", { messageId: "m1" }));
    expect(t.push(ev("thinking_delta", { messageId: "m1", index: 0, delta: "th" }))).toEqual([
      { type: "reasoning-start", id: "r0" },
      { type: "reasoning-delta", id: "r0", delta: "th" },
    ]);
    expect(t.push(ev("text_delta", { messageId: "m1", index: 1, delta: "ans" }))).toEqual([
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "ans" },
    ]);
  });

  it("③ message_final(assistant) → 关闭全部打开 part（text-end/reasoning-end 按开启序）+ finish-step", () => {
    const t = new LabFrameTranslator();
    t.push(ev("stream_start", { messageId: "m1" }));
    t.push(ev("thinking_delta", { messageId: "m1", index: 0, delta: "th" }));
    t.push(ev("text_delta", { messageId: "m1", index: 1, delta: "ans" }));
    expect(t.push(ev("message_final", { messageId: "m1", message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: "ans" }], timestamp: 1 } }))).toEqual([
      { type: "reasoning-end", id: "r0" },
      { type: "text-end", id: "t1" },
      { type: "finish-step" },
    ]);
    // 终稿后新 stream_start 开新 step（多轮 assistant 各自成 step）
    expect(t.push(ev("stream_start", { messageId: "m2" }))).toEqual([{ type: "start-step" }]);
  });

  it("④ user 事件不发帧（路线 A 的 FR-CHAT-11 承载：客户端自有 user 渲染，回声仅作流路由）", () => {
    const t = new LabFrameTranslator();
    expect(t.push(ev("message_final", { messageId: "u1", message: { id: "u1", role: "user", blocks: [{ type: "text", text: "Q" }], timestamp: 1 } }))).toEqual([]);
  });

  it("⑤ run 终结帧：正常 finish(stop)；aborted → abort 帧", () => {
    const normal = new LabFrameTranslator();
    normal.push(ev("stream_start", { messageId: "m1" }));
    normal.push(ev("message_final", { messageId: "m1", message: { id: "m1", role: "assistant", blocks: [], timestamp: 1 } }));
    expect(normal.finishFrame()).toEqual({ type: "finish", finishReason: "stop" });

    const aborted = new LabFrameTranslator();
    aborted.push(ev("run_state", { state: "aborted" }));
    expect(aborted.finishFrame()).toEqual({ type: "abort", reason: "cancelled" });

    const abortedMsg = new LabFrameTranslator();
    abortedMsg.push(ev("message_final", { messageId: "m1", message: { id: "m1", role: "assistant", blocks: [], timestamp: 1, aborted: true } }));
    expect(abortedMsg.finishFrame()).toEqual({ type: "abort", reason: "cancelled" });
  });
});

describe("readChatRequestPrompt（ChatRequest 解析，官方 fixtures/request.ts 口径：取最后 user 消息 text part）", () => {
  it("① parts 形态：取最后一条 user 的 text part 拼接", () => {
    const parsed = readChatRequestPrompt({
      messages: [
        { role: "user", parts: [{ type: "text", text: "first" }] },
        { role: "assistant", parts: [{ type: "text", text: "reply" }] },
        { role: "user", parts: [{ type: "text", text: "GOLDEN-PROMPT" }, { type: "data-x", data: {} }] },
      ],
    });
    expect(parsed?.text).toBe("GOLDEN-PROMPT");
  });

  it("② content 字符串形态兼容", () => {
    expect(readChatRequestPrompt({ messages: [{ role: "user", content: "str body" }] })?.text).toBe("str body");
  });

  it("③ 非法输入（无 messages / 无 user 文本）→ null", () => {
    expect(readChatRequestPrompt(null)).toBeNull();
    expect(readChatRequestPrompt({ messages: "not-array" })).toBeNull();
    expect(readChatRequestPrompt({ messages: [{ role: "assistant", parts: [] }] })).toBeNull();
  });

  it("④ sendMode 可选透传（steer/followUp 白名单，其余忽略）", () => {
    expect(readChatRequestPrompt({ messages: [{ role: "user", parts: [{ type: "text", text: "q" }] }], sendMode: "followUp" })).toEqual({ text: "q", sendMode: "followUp" });
    expect(readChatRequestPrompt({ messages: [{ role: "user", parts: [{ type: "text", text: "q" }] }], sendMode: "auto" })?.sendMode).toBeUndefined();
  });
});

// TASK-009 §10.14 D8 单测：映射纯函数 toThreadMessageLike（FR-AUI-02② 全量映射，D2 扩容）。
// 契约锚点：@assistant-ui/core dist/runtime/utils/thread-message-like.js（§11 #21）——
// status 仅 assistant 合法（不注入）、空 text/reasoning 丢弃、user 仅 text part、
// tool-call 透传 result/isError/argsText、metadata.custom 透传。
// 回归重定向：lab-store-mapping.test.ts → 本文件（断言扩容，无放宽）。

import { describe, expect, it } from "vitest";
import type { UiMessage } from "../../src/panel/messages";
import { toThreadMessageLike } from "../../webview/ui/threadMessageLike";

const base: UiMessage = { id: "u1", role: "user", blocks: [], timestamp: 1700000000000 };

describe("toThreadMessageLike（FR-AUI-02② UiMessage→ThreadMessageLike 全量映射）", () => {
  it("① user 纯文本消息：role/id/createdAt 直映，content 为 text part", () => {
    const ui: UiMessage = { ...base, blocks: [{ type: "text", text: "GOLDEN-PROMPT-BASIC" }] };
    const like = toThreadMessageLike(ui);
    expect(like.role).toBe("user");
    expect(like.id).toBe("u1");
    expect(like.createdAt).toEqual(new Date(1700000000000));
    expect(like.content).toEqual([{ type: "text", text: "GOLDEN-PROMPT-BASIC" }]);
  });

  it("② assistant 三类 block 全映射（text/thinking/toolcall），零数据丢失；running 不注入 result", () => {
    const ui: UiMessage = {
      id: "a1",
      role: "assistant",
      blocks: [
        { type: "thinking", text: "think…" },
        { type: "text", text: "answer" },
        { type: "toolcall", id: "call_1", tool: "bash", args: "{\"command\":\"ls\"}", summary: "ls", status: "running", output: "", outputTruncated: false },
      ],
      timestamp: 1,
    };
    const like = toThreadMessageLike(ui);
    expect(like.role).toBe("assistant");
    expect(like.content).toEqual([
      { type: "reasoning", text: "think…" },
      { type: "text", text: "answer" },
      { type: "tool-call", toolCallId: "call_1", toolName: "bash", argsText: "{\"command\":\"ls\"}" },
    ]);
  });

  it("③ 空消息：content 为空字符串（ExternalStoreRuntime 合法形态）", () => {
    expect(toThreadMessageLike(base).content).toBe("");
  });

  it("④ XSS 探针文本保真：不截断不转义（通道层原文透传；DOM 转义属渲染层）", () => {
    const probe = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const ui: UiMessage = { ...base, blocks: [{ type: "text", text: probe }] };
    expect(toThreadMessageLike(ui).content).toEqual([{ type: "text", text: probe }]);
  });

  it("⑤ 多 text 块顺序保持（流式增量分块不合并）", () => {
    const ui: UiMessage = {
      ...base,
      role: "assistant",
      blocks: [
        { type: "text", text: "part1 " },
        { type: "text", text: "part2" },
      ],
      timestamp: 1,
    };
    expect(toThreadMessageLike(ui).content).toEqual([
      { type: "text", text: "part1 " },
      { type: "text", text: "part2" },
    ]);
  });

  it("⑥ 终态 tool-call 注入 result 全要素（status/summary/output/outputTruncated）；error → isError", () => {
    const ui: UiMessage = {
      ...base,
      role: "assistant",
      blocks: [
        { type: "toolcall", id: "c1", tool: "bash", args: "{}", summary: "cmd", status: "success", output: "out", outputTruncated: true },
        { type: "toolcall", id: "c2", tool: "read", args: "{}", summary: "s", status: "error", output: "boom", outputTruncated: false },
        { type: "toolcall", id: "c3", tool: "write", args: "{}", summary: "s", status: "aborted", output: "", outputTruncated: false },
      ],
      timestamp: 1,
    };
    const [p1, p2, p3] = toThreadMessageLike(ui).content as unknown as Array<Record<string, unknown>>;
    expect(p1).toEqual({
      type: "tool-call",
      toolCallId: "c1",
      toolName: "bash",
      argsText: "{}",
      result: { status: "success", summary: "cmd", output: "out", outputTruncated: true },
      isError: false,
    });
    expect(p2.isError).toBe(true);
    expect((p2.result as { status: string }).status).toBe("error");
    expect((p3.result as { status: string }).status).toBe("aborted");
    expect(p3.isError).toBe(false);
  });

  it("⑦ aborted → metadata.custom.aborted；errorMessage → metadata.custom.errorMessage", () => {
    const ui: UiMessage = { ...base, role: "assistant", blocks: [{ type: "text", text: "x" }], timestamp: 1, aborted: true, errorMessage: "炸了" };
    const like = toThreadMessageLike(ui);
    expect(like.metadata?.custom).toEqual({ aborted: true, errorMessage: "炸了" });
    const plain = toThreadMessageLike({ ...base, blocks: [{ type: "text", text: "x" }], timestamp: 1 });
    expect(plain.metadata).toBeUndefined();
  });

  it("⑧ 空/纯空白 text、reasoning 块映射期滤除保序（#21 消费契约顺从）", () => {
    const ui: UiMessage = {
      ...base,
      role: "assistant",
      blocks: [
        { type: "text", text: "  \n " },
        { type: "thinking", text: "" },
        { type: "text", text: "keep" },
        { type: "thinking", text: "reason" },
      ],
      timestamp: 1,
    };
    expect(toThreadMessageLike(ui).content).toEqual([
      { type: "text", text: "keep" },
      { type: "reasoning", text: "reason" },
    ]);
    expect(toThreadMessageLike({ ...base, blocks: [{ type: "text", text: " " }], timestamp: 1 }).content).toBe("");
  });

  it("⑨ user 仅 text part：user 消息的 reasoning/toolcall 块不映射（#21：user 带之即 throw）", () => {
    const ui: UiMessage = {
      ...base,
      blocks: [
        { type: "thinking", text: "t" },
        { type: "toolcall", id: "c", tool: "bash", args: "{}", summary: "", status: "running", output: "", outputTruncated: false },
        { type: "text", text: "only" },
      ],
      timestamp: 1,
    };
    expect(toThreadMessageLike(ui).content).toEqual([{ type: "text", text: "only" }]);
  });

  it("⑩ status 不注入（#21：user 带 status 即 throw——全角色恒不注入）", () => {
    const like = toThreadMessageLike({ ...base, role: "assistant", blocks: [{ type: "text", text: "x" }], timestamp: 1 });
    expect(like.status).toBeUndefined();
  });
});

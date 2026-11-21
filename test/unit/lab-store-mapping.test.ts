// TASK-009 §10.13 D8 单测：路线 B 映射纯函数 toThreadMessageLike（FR-AUI-02②/FR-AUI-03①）。
// 契约锚点：@assistant-ui/core dist/runtime/utils/thread-message-like.d.ts（ThreadMessageLike
// = { role, content: string | parts[], id?, createdAt? }；part 型 text/reasoning/tool-call，
// §11 #14）。阶段①最小渲染口径：三类 block 全映射（零数据丢失），fixture 断言只覆盖 text。

import { describe, expect, it } from "vitest";
import type { UiMessage } from "../../src/panel/messages";
import { toThreadMessageLike } from "../../webview/lab/threadMessageLike";

const base: UiMessage = { id: "u1", role: "user", blocks: [], timestamp: 1700000000000 };

describe("toThreadMessageLike（FR-AUI-02② UiMessage→ThreadMessageLike 映射）", () => {
  it("① user 纯文本消息：role/id/createdAt 直映，content 为 text part", () => {
    const ui: UiMessage = { ...base, blocks: [{ type: "text", text: "GOLDEN-PROMPT-BASIC" }] };
    const like = toThreadMessageLike(ui);
    expect(like.role).toBe("user");
    expect(like.id).toBe("u1");
    expect(like.createdAt).toEqual(new Date(1700000000000));
    expect(like.content).toEqual([{ type: "text", text: "GOLDEN-PROMPT-BASIC" }]);
  });

  it("② assistant 消息三类 block 全映射（text/thinking/toolcall），零数据丢失", () => {
    const ui: UiMessage = {
      id: "a1",
      role: "assistant",
      blocks: [
        { type: "thinking", text: "think…" },
        { type: "text", text: "answer" },
        { type: "toolcall", id: "call_1", tool: "bash", args: "{\"command\":\"ls\"}", summary: "ls", status: "success", output: "", outputTruncated: false },
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
});

// UiMessage → ThreadMessageLike 映射（TASK-009 §10.14 D2 全量映射扩容；lab 映射平移扩容）。
// 纯函数：无 DOM / 无 vscode / 无 React 依赖，单测全覆盖（test/unit/ui-mapping.test.ts）。
// 消费契约锚点：@assistant-ui/core dist/runtime/utils/thread-message-like.js（§11 #21）——
//   status 仅 assistant 合法（user 带 status 即 throw，故不注入）；空/纯空白 text、reasoning part 丢弃
//   （映射期滤除保序）；user role 的 tool-call/reasoning part throw（user 仅 text part）；
//   tool-call 透传 result/isError/argsText；metadata.custom 透传。
// 字段映射（D2 映射扩容表）：
//   text → {type:"text"}；thinking → {type:"reasoning"}；
//   toolcall → tool-call part（toolCallId=block.id/toolName/argsText），终端态（非 running）注入
//     result:{status,summary,output,outputTruncated}、isError=status==="error"（running 不注入）；
//   UiMessage.aborted → metadata.custom.aborted；UiMessage.errorMessage → metadata.custom.errorMessage。
// 相邻 assistant 消息不合并（无 joinStrategy，一 UiMessage → 一 ThreadMessage）。

import type { UiMessage } from "../../src/panel/messages";
import type { ThreadMessageLike } from "@assistant-ui/react";

type ThreadMessageLikePart = Extract<ThreadMessageLike["content"], readonly unknown[]>[number];

export function toThreadMessageLike(ui: UiMessage): ThreadMessageLike {
  const custom: Record<string, unknown> = {};
  if (ui.aborted) custom.aborted = true;
  if (ui.errorMessage) custom.errorMessage = ui.errorMessage;

  const isUser = ui.role === "user";
  const parts: ThreadMessageLikePart[] = [];
  for (const block of ui.blocks) {
    switch (block.type) {
      case "text":
        // 空/纯空白 text part 会被消费契约丢弃——提前滤除保序（D2）
        if (block.text.trim().length > 0) parts.push({ type: "text", text: block.text });
        break;
      case "thinking":
        if (isUser) break; // user 仅 text part（#21：user 带 reasoning 即 throw）
        if (block.text.trim().length > 0) parts.push({ type: "reasoning", text: block.text });
        break;
      case "toolcall": {
        if (isUser) break; // user 仅 text part（#21：user 带 tool-call 即 throw）
        const terminal = block.status !== "running";
        parts.push({
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.tool,
          argsText: block.args,
          ...(terminal
            ? {
                result: { status: block.status, summary: block.summary, output: block.output, outputTruncated: block.outputTruncated },
                isError: block.status === "error",
              }
            : {}),
        });
        break;
      }
    }
  }

  return {
    id: ui.id,
    role: ui.role,
    createdAt: new Date(ui.timestamp),
    content: parts.length === 0 ? "" : parts,
    ...(Object.keys(custom).length > 0 ? { metadata: { custom } } : {}),
  };
}

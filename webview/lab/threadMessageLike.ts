// UiMessage → ThreadMessageLike 映射（路线 B，FR-AUI-02②；TASK-009 §10.13 D3）。
// 纯函数：无 DOM / 无 vscode / 无 React 依赖，单测全覆盖（test/unit/lab-mapping.test.ts）。
// 契约锚点：@assistant-ui/core dist/runtime/utils/thread-message-like.d.ts
// （ThreadMessageLike = { role, content: string | parts[], id?, createdAt? }；
// part 型 text / reasoning / tool-call：toolCallId?/toolName 必填、argsText 可选）——§11 #14。
// 阶段①最小渲染口径：三类 block 全映射（零数据丢失），fixture 断言只覆盖 text（FR-AUI-03①）。

import type { UiMessage } from "../../src/panel/messages";
import type { ThreadMessageLike } from "@assistant-ui/react";

export function toThreadMessageLike(ui: UiMessage): ThreadMessageLike {
  return {
    id: ui.id,
    role: ui.role,
    createdAt: new Date(ui.timestamp),
    content:
      ui.blocks.length === 0
        ? ""
        : ui.blocks.map((block) => {
            switch (block.type) {
              case "text":
                return { type: "text" as const, text: block.text };
              case "thinking":
                return { type: "reasoning" as const, text: block.text };
              case "toolcall":
                // 阶段②工具卡：不注入 result/artifact，仅保形
                return {
                  type: "tool-call" as const,
                  toolCallId: block.id,
                  toolName: block.tool,
                  argsText: block.args,
                };
            }
          }),
  };
}

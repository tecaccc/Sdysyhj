// 工具调用卡片（FR-CHAT-04 全要素，TASK-009 §10.14 D2）：ToolCallMessagePart 渲染覆盖。
// 要素（与旧 webview/render/messages.ts ToolCardView 同构）：工具名 / 关键参数摘要 /
// 执行状态（进行中/成功/失败/已中止）/ 可展开输入输出 / bash 命令与输出摘要（result.summary）/
// 大输出截断保留尾部 +「复制全部」（→ post copy_output 取宿主缓存全量）。
// 数据承载 = tool-call part（result/isError 经 fromThreadMessageLike 真实 runtime 透传，§11 #21）。

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { WebviewToHost } from "../../src/panel/messages";

type ToolResult = { status?: string; summary?: string; output?: string; outputTruncated?: boolean };

const STATUS_ICONS: Record<string, string> = {
  running: "⏳",
  success: "✔",
  error: "✘",
  aborted: "⊘",
};
const STATUS_LABELS: Record<string, string> = {
  running: "进行中",
  success: "成功",
  error: "失败",
  aborted: "已中止",
};

function compact(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

export interface ToolCardProps extends ToolCallMessagePartProps {
  /** webview → 宿主（copy_output 取宿主缓存全量输出） */
  post: (message: WebviewToHost) => void;
}

export function ToolCard({ toolCallId, toolName, argsText, result, post }: ToolCardProps): React.ReactElement {
  const r = (result ?? {}) as ToolResult;
  const status = r.status ?? "running"; // running 态不注入 result（D2 映射口径）
  const summary = r.summary || compact(argsText ?? "");
  return (
    <div className="blk blk-toolcall">
      <div className="toolcard">
        <details className="toolcard-details">
          <summary className="toolcard-head" title={STATUS_LABELS[status] ?? status}>
            <span className="toolcard-icon">🔧</span>
            <span className="toolcard-name">{toolName}</span>
            <span className="toolcard-summary">{summary}</span>
            <span className={`toolcard-status status-${status}`}>
              {STATUS_ICONS[status] ?? ""} {STATUS_LABELS[status] ?? status}
            </span>
          </summary>
          <div className="toolcard-body">
            <div className="toolcard-section-label">输入</div>
            <pre className="toolcard-args">{argsText ?? ""}</pre>
            <div className="toolcard-section-label">输出</div>
            <pre className="toolcard-output">{r.output ?? ""}</pre>
            <button
              type="button"
              className="toolcard-copy"
              hidden={!r.outputTruncated}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                post({ kind: "copy_output", toolCallId });
              }}
            >
              复制全部
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

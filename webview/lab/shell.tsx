// 双切片共享最小外壳（TASK-009 §10.13 D4）：ThreadPrimitive 无头原语消息列表 +
// ComposerPrimitive 输入。阶段①纯文本级最小渲染（FR-AUI-02③）；不引入 Tailwind /
// 模板组件（D5——样式直接消费 shadcn token，见 lab.css）。
// 契约锚点：@assistant-ui/react 导出面（ThreadPrimitive/MessagePrimitive/ComposerPrimitive，§11 #14）。

import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";

function UserMessage(): React.ReactElement {
  return (
    <MessagePrimitive.Root className="lab-message lab-message-user">
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => <div className="lab-bubble">{text}</div>,
        }}
      />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage(): React.ReactElement {
  return (
    <MessagePrimitive.Root className="lab-message lab-message-assistant">
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => <div className="lab-plain">{text}</div>,
          Reasoning: ({ text }) => <details className="lab-thinking"><summary>thinking</summary><div>{text}</div></details>,
        }}
      />
    </MessagePrimitive.Root>
  );
}

/** 共享外壳：消息视口 + 输入区（发送/中止）。 */
export function LabShell(): React.ReactElement {
  return (
    <ThreadPrimitive.Root className="lab-root">
      <ThreadPrimitive.Viewport className="lab-viewport">
        <ThreadPrimitive.If empty>
          <div className="lab-empty">实验面板（assistant-ui 迁移试点）：输入消息发送。</div>
        </ThreadPrimitive.If>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="lab-composer">
        <ComposerPrimitive.Input rows={2} placeholder="输入消息…（实验）" aria-label="输入消息" />
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send className="lab-send" aria-label="发送">
            发送
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel className="lab-cancel" aria-label="中止">
            中止
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

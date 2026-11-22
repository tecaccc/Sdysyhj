// 新 UI 全壳（TASK-009 §10.14 D1/D2/D4/D5/D6）：header + 消息区 + Composer + 错误区。
// 消息渲染 part 化（D2）：text=MarkdownText / reasoning=折叠块（FR-CHAT-03）/ tool-call=工具卡（FR-CHAT-04）；
// aborted/errorMessage 经 metadata.custom 消息级标记（D5）。
// 流式跟随（D4）：FollowState 纯状态机零改动复用（render/followState.ts）；决策点 = useLayoutEffect
// （依赖 store 快照，每次增量渲染 commit 后 applyFollowScroll）；程序滚动自标记 selfScrollPending 同构迁移；
// 每轮默认跟随 = stream_start（streamStartSeq 观察）；idle 门控 = onRunState；会话载入尾部一次性定位不走向量决策。
// 视觉五子条（D6/#19(a)）：.content-col 960px 居中 / .composer-shell 8px / 发送图标化 aria-label「发送」/
// 用户右气泡·助手左无气泡·禁 avatar / HH:mm 时间戳（format.ts 复用）替代角色标记。

import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from "@assistant-ui/react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ThreadMessage, ToolCallMessagePartProps } from "@assistant-ui/react";
import type { HostToWebview, UiMessage, WebviewToHost } from "../../src/panel/messages";
import { FollowState } from "../render/followState";
import { formatHHmm } from "../render/format";
import { Composer } from "./composer";
import { MarkdownTextPart } from "./markdown";
import { EventBuffer, UiStore, type UiState } from "./store";
import { toThreadMessageLike } from "./threadMessageLike";
import { ToolCard } from "./toolCard";

const STATE_TEXT: Record<string, string> = {
  idle: "空闲",
  starting: "启动中",
  streaming: "运行中",
  aborted: "已中止",
  error: "错误",
};

/** AppendMessage.content → prompt 文本（取 text part 拼接）。 */
export function appendMessageText(content: string | ReadonlyArray<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

/** 宿主事件入口：window message → delta 合批缓冲 → store（真实传输通道，FR-AUI-02③）。 */
export function attachHostEventPump(target: Window, buffer: EventBuffer): () => void {
  const handler = (event: MessageEvent): void => {
    const data = event.data as HostToWebview | undefined;
    if (typeof data === "object" && data !== null && typeof (data as { kind?: unknown }).kind === "string") {
      buffer.push(data);
    }
  };
  target.addEventListener("message", handler);
  return () => target.removeEventListener("message", handler);
}

interface MessageViewProps {
  message: ThreadMessage;
  components: ReturnType<typeof makeMessageComponents>;
}

function makeMessageComponents(post: (message: WebviewToHost) => void) {
  return {
    Text: MarkdownTextPart,
    Reasoning: ({ text }: { text: string }): React.ReactElement => (
      <details className="thinking-details blk blk-thinking">
        <summary className="thinking-summary">▸ 💭 thinking…</summary>
        <pre className="thinking-text">{text}</pre>
      </details>
    ),
    tools: {
      Override: (props: ToolCallMessagePartProps): React.ReactElement => <ToolCard {...props} post={post} />,
    },
  };
}

function MessageTime({ message }: { message: ThreadMessage }): React.ReactElement {
  return <div className="message-time">{formatHHmm(message.createdAt.getTime())}</div>;
}

function UserMessageView({ message, components }: MessageViewProps): React.ReactElement {
  return (
    <MessagePrimitive.Root className="message message-user" data-message-id={message.id}>
      <MessageTime message={message} />
      <div className="message-body">
        <MessagePrimitive.Content components={components} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessageView({ message, components }: MessageViewProps): React.ReactElement {
  const custom = (message.metadata?.custom ?? {}) as { aborted?: boolean; errorMessage?: string };
  return (
    <MessagePrimitive.Root
      className={`message message-assistant${custom.aborted ? " message-aborted" : ""}${custom.errorMessage ? " message-error-message" : ""}`}
      data-message-id={message.id}
    >
      <MessageTime message={message} />
      <div className="message-body">
        <MessagePrimitive.Content components={components} />
        {custom.aborted ? <div className="aborted-marker">⏹ 已中止</div> : null}
        {custom.errorMessage ? <div className="message-error">⚠ {custom.errorMessage}</div> : null}
      </div>
    </MessagePrimitive.Root>
  );
}

function Header({ state, post }: { state: UiState; post: (message: WebviewToHost) => void }): React.ReactElement {
  return (
    <header id="header">
      <div className="header-row">
        <span
          id="session-name"
          className="session-name"
          title="点击重命名"
          onClick={() => post({ kind: "rename_session" })}
          onKeyDown={(e) => e.key === "Enter" && post({ kind: "rename_session" })}
        >
          {state.sessionName || "未命名会话"}
        </span>
        <span className="header-actions">
          <button id="btn-new" title="新建会话" onClick={() => post({ kind: "new_session" })}>
            ＋
          </button>
          <button id="btn-history" title="会话历史" onClick={() => post({ kind: "open_history" })}>
            🕘
          </button>
          <button id="btn-settings" title="设置" onClick={() => post({ kind: "open_settings" })}>
            ⚙
          </button>
        </span>
      </div>
      <div className="header-row">
        <span
          id="status-line"
          className="status-line"
          title="点击切换模型"
          onClick={() => post({ kind: "switch_model" })}
          onDoubleClick={() => post({ kind: "switch_thinking" })}
        >
          {`${state.model || "(未设置模型)"} · ${state.thinkingLevel || "—"} · ${STATE_TEXT[state.runState] ?? state.runState}`}
        </span>
      </div>
    </header>
  );
}

function ErrorsArea({ state, post, store }: { state: UiState; post: (message: WebviewToHost) => void; store: UiStore }): React.ReactElement {
  // toast 一次性提示（4s 自动消失，旧 showToast 同语义）
  useEffect(() => {
    if (state.toasts.length === 0) return;
    const timers = state.toasts.map((toast) =>
      setTimeout(() => store.dispatch({ kind: "ui_dismiss_toast", id: toast.id }), 4000)
    );
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.toasts]);
  return (
    <div id="errors">
      <div id="errors-col" className="content-col">
        {state.errors.map((error) => (
          <div key={error.id} className="error-card">
            <div className="error-title">⚠ {error.message}</div>
            {error.hint ? <div className="error-hint">{error.hint}</div> : null}
            <button className="error-dismiss" onClick={() => store.dispatch({ kind: "ui_dismiss_error", id: error.id })}>
              ×
            </button>
          </div>
        ))}
        {state.toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ))}
        {state.externalChange !== null ? (
          <div id="external-change-banner" className="banner">
            <span>{`⚠ ${state.externalChange} 当前显示可能为陈旧状态。`}</span>
            <button
              onClick={() => {
                store.dispatch({ kind: "ui_dismiss_banner" });
                post({ kind: "refresh_session" });
              }}
            >
              刷新
            </button>
            <button onClick={() => store.dispatch({ kind: "ui_dismiss_banner" })}>忽略</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Shell({ state, post, store }: { state: UiState; post: (message: WebviewToHost) => void; store: UiStore }): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(new FollowState());
  const selfScrollPendingRef = useRef(false);
  const components = useRef(makeMessageComponents(post)).current;

  const distanceFromBottom = (): number => {
    const el = viewportRef.current;
    if (!el) return 0;
    return Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop);
  };

  /** 滚到消息区底部；已在底部时无位移不产生 scroll 事件，不自标记（旧同构）。 */
  const scrollMessagesToBottom = (): void => {
    const el = viewportRef.current;
    if (!el) return;
    const target = el.scrollHeight - el.clientHeight;
    if (el.scrollTop === target) return;
    selfScrollPendingRef.current = true;
    el.scrollTop = target;
  };

  const applyFollowScroll = (): void => {
    if (followRef.current.shouldAutoScroll()) scrollMessagesToBottom();
  };

  // 运行状态门控（④：idle 不自动滚动；结束解除「本轮」标记）
  useEffect(() => {
    followRef.current.onRunState(state.isRunning);
  }, [state.isRunning]);

  // 每轮流式开始默认跟随（①：stream_start 为重置点，轮内后续不覆盖用户打断）
  useEffect(() => {
    if (state.streamStartSeq === 0) return;
    followRef.current.onStreamStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streamStartSeq]);

  // 决策点 = 每次增量渲染 commit 后（D4：useLayoutEffect 与旧 MutationObserver 渲染点同口径）
  useLayoutEffect(() => {
    applyFollowScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages]);

  // 会话载入/切换尾部一次性初始定位（④排除项，不走向量决策）
  useEffect(() => {
    if (state.sessionEpoch === 0) return;
    scrollMessagesToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionEpoch]);

  // 程序滚动自标记（selfScrollPending 同构迁移）：跟随发起的滚动与用户滚动区分
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = (): void => {
      if (selfScrollPendingRef.current) {
        selfScrollPendingRef.current = false;
        return;
      }
      followRef.current.onUserScroll(distanceFromBottom());
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThreadPrimitive.Root className="chat-root">
      <Header state={state} post={post} />
      <ThreadPrimitive.Viewport className="messages-viewport" ref={viewportRef}>
        <div className="content-col messages-col" id="messages-col" aria-live="polite">
          <ThreadPrimitive.If empty>
            <div className="chat-empty">输入消息开始对话。</div>
          </ThreadPrimitive.If>
          <ThreadPrimitive.Messages>
            {({ message }) =>
              message.role === "user" ? (
                <UserMessageView message={message} components={components} />
              ) : (
                <AssistantMessageView message={message} components={components} />
              )
            }
          </ThreadPrimitive.Messages>
        </div>
      </ThreadPrimitive.Viewport>
      <ErrorsArea state={state} post={post} store={store} />
      <footer id="input-area">
        <Composer state={state} post={post} />
      </footer>
    </ThreadPrimitive.Root>
  );
}

export interface ChatAppProps {
  store: UiStore;
  post: (message: WebviewToHost) => void;
}

/** 新 UI 根组件：真实 ExternalStoreRuntime 消费链（UiMessage→ThreadMessageLike→组件渲染）。 */
export function ChatApp({ store, post }: ChatAppProps): React.ReactElement {
  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot()
  );
  const runtime = useExternalStoreRuntime({
    messages: state.messages as readonly UiMessage[],
    convertMessage: toThreadMessageLike,
    isRunning: state.isRunning,
    onNew: async (message) => {
      post({ kind: "prompt", text: appendMessageText(message.content), mode: "auto" });
    },
    onCancel: async () => {
      post({ kind: "abort" });
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Shell state={state} post={post} store={store} />
    </AssistantRuntimeProvider>
  );
}

// 路线 B 切片（ExternalStoreRuntime，FR-AUI-02②；TASK-009 §10.13 D3 webview 侧）。
// 状态源 = LabStore（既有 HostToWebview 协议事件的 webview 侧镜像，store.ts），
// useSyncExternalStore 挂接 + useExternalStoreRuntime({ messages, convertMessage,
// isRunning, onNew, onCancel })。契约锚点：@assistant-ui/core external-store-adapter.d.ts
// （onNew 必需；isRunning→thread.isRunning；§11 #14「Handler matrix」）。
// 流式 = 终稿前 text_delta 对 assistant 消息原地追加（store reducer，官方「Streaming
// responses」原地变更 assistant 消息口径同型）。

import { useSyncExternalStore } from "react";
import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import type { WebviewToHost } from "../../src/panel/messages";
import { LabShell } from "./shell";
import { LabStore } from "./store";
import { toThreadMessageLike } from "./threadMessageLike";

/** AppendMessage.content → prompt 文本（取 text part 拼接；attachments 阶段①无）。 */
export function appendMessageText(content: string | ReadonlyArray<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

let sharedStore: LabStore | null = null;

/** 路线 B 共享 store（模块级单例：消息监听接线与切片渲染共享同一状态源）。 */
export function getSharedLabStore(): LabStore {
  if (!sharedStore) sharedStore = new LabStore();
  return sharedStore;
}

export interface SliceBOptions {
  /** webview → 宿主发送（acquireVsCodeApi().postMessage 或测试注入） */
  post: (message: WebviewToHost) => void;
}

export function SliceB({ post }: SliceBOptions): React.ReactElement {
  const store = getSharedLabStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const runtime = useExternalStoreRuntime({
    messages: state.messages,
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
      <LabShell />
    </AssistantRuntimeProvider>
  );
}

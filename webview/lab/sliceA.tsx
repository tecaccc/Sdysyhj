// 路线 A 切片（fetch-bridge，FR-AUI-02①；TASK-009 §10.13 D2 webview 侧）。
// useChatRuntime + AssistantChatTransport({ api, fetch: vscodeFetch })——官方指南
// 「Runtimes」节唯一可过桥的组合（§11 #13）；fetch 隧道经 @assistant-ui/vscode/webview
// 的 vscodeFetch（postMessage 桥，不经网络——CSP 无需 connect-src）。

import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { vscodeFetch } from "@assistant-ui/vscode/webview";
import { LabShell } from "./shell";

export function SliceA(): React.ReactElement {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat", fetch: vscodeFetch }),
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LabShell />
    </AssistantRuntimeProvider>
  );
}

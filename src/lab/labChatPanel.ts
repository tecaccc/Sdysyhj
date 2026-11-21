// 实验面板核心（路线 A + B 宿主侧，FR-AUI-01/02；TASK-009 §10.13 D1/D3）。
// 不 import vscode：构造入参 = PiBridge + WebviewLike 形状（postMessage/onDidReceiveMessage，
// 与 `@assistant-ui/vscode` serveWebviewHost 的 WebviewLike 同形，§11 #12），供 in-node 集成测试
// 直接实例化（test/integration/lab-slice-a.test.ts / lab-slice-b.test.ts）。
// 职责：
//   路线 A：serveWebviewHost 挂载 /api/chat 路由（createLabChatRoute）——fetch 隧道（fetch:* 帧）；
//   路线 B：bridge.onAny → postMessage 泵（既有 HostToWebview 协议零改动复用，§10.12 回声账本原样生效）；
//   协议子集：ready（回放 model_info/run_state/history_loaded）/ prompt / abort。
// 事件隔离：与默认面板共享同一 PiBridge（emitter 多订阅互不影响，默认面板订阅路径不变）。

import type { PiBridge } from "../bridge/piBridge";
import type { WebviewToHost } from "../panel/messages";
import type { Logger } from "../util/log";
import { serveWebviewHost, type WebviewLike } from "@assistant-ui/vscode/host";
import { createLabChatRoute } from "./chatRoute";

export class LabChatPanel {
  private readonly disposables: Array<() => void> = [];

  constructor(
    private readonly bridge: PiBridge,
    private readonly webview: WebviewLike,
    private readonly logger: Logger
  ) {
    // 路线 A：官方宿主桥（fetch 隧道 + webview→宿主 RPC），仅挂实验面板 webview（D1 运行隔离）
    const host = serveWebviewHost(webview, {
      routes: { "/api/chat": { POST: createLabChatRoute(bridge, logger) } },
      onError: (error) => this.logger.warn(`lab 面板路由错误：${error instanceof Error ? error.message : String(error)}`),
    });
    this.disposables.push(() => host.dispose());

    // 路线 B：PiBridge 事件 → postMessage 泵（独立订阅，不影响默认面板）
    const unsubscribe = bridge.onAny((event) => {
      void webview.postMessage(event);
    });
    this.disposables.push(unsubscribe);
  }

  /** webview → 宿主协议消息（ready/prompt/abort；桥通道消息由 serveWebviewHost 消费）。 */
  async handleMessage(raw: unknown): Promise<void> {
    if (typeof raw !== "object" || raw === null) return;
    const msg = raw as WebviewToHost;
    switch (msg.kind) {
      case "ready": {
        const info = this.bridge.getModelInfo();
        await this.webview.postMessage({ kind: "model_info", model: info.model, thinkingLevel: info.thinkingLevel, sessionName: info.sessionName });
        await this.webview.postMessage({ kind: "run_state", state: this.bridge.getRunState() });
        await this.webview.postMessage({ kind: "history_loaded", messages: this.bridge.getUiMessages() });
        break;
      }
      case "prompt":
        await this.bridge.sendPrompt(msg.text, msg.mode);
        break;
      case "abort":
        await this.bridge.abort();
        break;
      default:
        break;
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      try {
        d();
      } catch {
        // 忽略
      }
    }
    this.disposables.length = 0;
  }
}

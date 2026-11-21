// 实验面板 vscode 薄壳（FR-AUI-01①；TASK-009 §10.13 D1）。
// 仅做 options/HTML/挂 serveWebviewHost 接线；面板核心在 labChatPanel.ts（vscode-free）。
// HTML 由 `@assistant-ui/vscode` renderWebviewHtml 生成（strict CSP 默认，零新增指令——D5），
// 标题「聊天（实验）」（「实验」标识落于面板标题与 HTML <title>）。

import * as vscode from "vscode";
import type { PiBridge } from "../bridge/piBridge";
import type { Logger } from "../util/log";
import { renderWebviewHtml } from "@assistant-ui/vscode/host";
import { LabChatPanel } from "./labChatPanel";

export class LabViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sdysyhj.chatLabView";

  private panel: LabChatPanel | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bridge: PiBridge,
    private readonly logger: Logger
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = renderWebviewHtml(webview, {
      scripts: [vscode.Uri.joinPath(this.context.extensionUri, "media", "lab.js")],
      styles: [vscode.Uri.joinPath(this.context.extensionUri, "media", "lab.css")],
      title: "聊天（实验）",
      lang: "zh-CN",
      surface: "sidebar",
      scriptType: "classic",
    });

    // 面板核心（vscode-free）：route A 桥 + route B 事件泵 + 协议子集
    const panel = new LabChatPanel(this.bridge, this.toWebviewLike(webview), this.logger);
    const subscription = webview.onDidReceiveMessage((raw) => {
      void panel.handleMessage(raw);
    }, undefined, this.disposables);
    this.disposables.push(subscription);
    if (this.panel) this.panel.dispose();
    this.panel = panel;
  }

  /** 供命令入口：聚焦并显示实验面板。 */
  reveal(): void {
    void vscode.commands.executeCommand(`${LabViewProvider.viewType}.focus`);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private toWebviewLike(webview: vscode.Webview) {
    return {
      postMessage: (message: unknown) => webview.postMessage(message),
      onDidReceiveMessage: (listener: (message: unknown) => unknown) => webview.onDidReceiveMessage(listener),
    };
  }
}

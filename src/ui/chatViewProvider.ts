// 新 UI vscode 薄壳（TASK-009 §10.14 D1；labViewProvider 演进）。
// 仅做 options/HTML/接线：renderWebviewHtml strict CSP（FR-AUI-05②）+ retainContextWhenHidden
// 由注册侧显式声明（FR-AUI-05④）；面板核心在 chatController.ts（vscode-free）。
// viewType = sdysyhj.chatView（FR-AUI-07①：默认聊天面板转正，用户无感切换）。

import * as vscode from "vscode";
import type { PiBridge } from "../bridge/piBridge";
import { createHostActions, type HostActions, type StartupError } from "../panel/hostActions";
import type { HostToWebview } from "../panel/messages";
import type { SdysyhjConfig } from "../util/config";
import type { Logger } from "../util/log";
import { renderWebviewHtml } from "@assistant-ui/vscode/host";
import { ChatController } from "./chatController";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sdysyhj.chatView";

  private controller: ChatController | null = null;
  private currentWebview: vscode.Webview | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly actions: HostActions;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bridge: PiBridge,
    private readonly logger: Logger,
    private readonly getConfig: () => SdysyhjConfig,
    private readonly cwd: string,
    private readonly noWorkspace: boolean,
    private readonly sessionsRoot?: string,
    private readonly getStartupError: () => StartupError | null = () => null
  ) {
    // 宿主动作层（D3 共享模块）绑定本面板 post/reveal（命令入口与 webview 协议入口共用）
    this.actions = createHostActions({
      bridge: this.bridge,
      logger: this.logger,
      cwd: this.cwd,
      ...(this.sessionsRoot ? { sessionsRoot: this.sessionsRoot } : {}),
      post: (message) => this.post(message),
      reveal: () => this.reveal(),
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webview = webviewView.webview;
    this.currentWebview = webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = renderWebviewHtml(webview, {
      scripts: [vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.js")],
      styles: [vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.css")],
      title: "Chat",
      lang: "zh-CN",
      surface: "sidebar",
      scriptType: "classic",
    });

    // 面板核心（vscode-free）：事件泵 + WebviewToHost 协议全集
    const controller = new ChatController(this.bridge, { postMessage: (m) => webview.postMessage(m) }, this.logger, this.actions, {
      getConfig: this.getConfig,
      cwd: this.cwd,
      noWorkspace: this.noWorkspace,
      getStartupError: this.getStartupError,
    });
    const subscription = webview.onDidReceiveMessage((raw) => {
      void controller.handleMessage(raw);
    }, undefined, this.disposables);
    this.disposables.push(subscription);
    if (this.controller) this.controller.dispose();
    this.controller = controller;
  }

  /** 供命令入口：聚焦并显示默认聊天面板。 */
  reveal(): void {
    void vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
  }

  /** 右键“发送到 Pi”（FR-FILE-03）：目标 = 新 UI 面板（D1 运行接线）。 */
  sendToPi(uri?: vscode.Uri): void {
    if (this.controller) {
      this.controller.sendToPi(uri);
    } else {
      this.actions.sendToPi(uri);
    }
  }

  /** 命令入口复用的宿主动作（与 webview 协议入口终接同一 bridge，FR-MOD-01 三入口同步）。 */
  get hostActions(): HostActions {
    return this.actions;
  }

  dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    this.currentWebview = null;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private post(message: HostToWebview): void {
    void this.currentWebview?.postMessage(message);
  }
}

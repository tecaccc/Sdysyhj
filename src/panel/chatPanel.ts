// ChatPanel：WebviewViewProvider + postMessage 路由。
// 宿主侧中介：webview 消息 → PiBridge 操作 / vscode API；PiBridge 事件 → webview。
// TASK-011 批次 A 项（2026-11-27 人类指令「还原聊天界面为我们自己编写的版本，去掉外部引入
// 的框架」）：viewType 回迁 sdysyhj.chatView——本面板即唯一聊天面板（v0.1.6 时代形态，
// assistant-ui 新 UI 与 chatViewClassic 双轨注册随批次退役）；vscode 交互动作仍经
// hostActions.ts 同名委托（TASK-009 D3 机械提取，行为零变化）。

import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import type { PiBridge } from "../bridge/piBridge";
import { createHostActions, type HostActions, type StartupError } from "./hostActions";
import type { SdysyhjConfig } from "../util/config";
import type { Logger } from "../util/log";
import { isHostToWebview, type HostToWebview, type WebviewToHost } from "./messages";

export type { StartupError } from "./hostActions";

export class ChatPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "sdysyhj.chatView";

  private view: vscode.WebviewView | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly actions: HostActions;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bridge: PiBridge,
    private readonly logger: Logger,
    private readonly getConfig: () => SdysyhjConfig,
    /** 工作区绑定目录（FR-FILE-01） */
    private readonly cwd: string,
    /** 无工作区打开时为 true：允许聊天，提示文件工具受限 */
    private readonly noWorkspace: boolean,
    private readonly sessionsRoot?: string,
    private readonly getStartupError: () => StartupError | null = () => null
  ) {
    this.actions = createHostActions({
      bridge: this.bridge,
      logger: this.logger,
      cwd: this.cwd,
      ...(this.sessionsRoot ? { sessionsRoot: this.sessionsRoot } : {}),
      post: (message) => this.post(message),
      reveal: () => this.reveal(),
    });
    this.disposables.push(new vscode.Disposable(this.bridge.onAny((event) => this.post(event))));
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(ChatPanel.viewType, this, {
        webviewOptions: { retainContextWhenHidden: true },
      })
    );
  }

  // ---------- WebviewViewProvider ----------

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = this.getHtml(webview);
    webview.onDidReceiveMessage(
      (raw) => {
        void this.handleWebviewMessage(raw);
      },
      undefined,
      this.disposables
    );
  }

  /** 供命令/菜单调用：聚焦并显示聊天面板。 */
  reveal(): void {
    void vscode.commands.executeCommand(`${ChatPanel.viewType}.focus`);
  }

  /** 右键“发送到 Pi”（FR-FILE-03）：hostActions 委托（行为零变化）。 */
  sendToPi(uri?: vscode.Uri): void {
    this.actions.sendToPi(uri);
  }

  // ---------- 面板操作（命令入口复用；hostActions 同名委托） ----------

  async showHistory(): Promise<void> {
    await this.actions.showHistory();
  }

  async showModelPicker(): Promise<void> {
    await this.actions.showModelPicker();
  }

  async showThinkingPicker(): Promise<void> {
    await this.actions.showThinkingPicker();
  }

  async showRenameInput(): Promise<void> {
    await this.actions.showRenameInput();
  }

  // ---------- 内部 ----------

  private async handleWebviewMessage(raw: unknown): Promise<void> {
    if (!isHostToWebview(raw)) return;
    const msg = raw as unknown as WebviewToHost;
    switch (msg.kind) {
      case "ready": {
        const config = this.getConfig();
        this.post({ kind: "config", tailLines: config.outputTailLines, sendMode: config.sendMode, workspaceLabel: path.basename(this.cwd) });
        const startupError = this.getStartupError();
        if (startupError) {
          this.post({ kind: "error", message: startupError.message, hint: startupError.hint });
          this.post({ kind: "run_state", state: "error", detail: startupError.message });
        } else if (this.noWorkspace) {
          this.post({
            kind: "toast",
            text: "未打开工作区：仍可聊天，但文件工具受限（cwd = 用户主目录）。",
          });
        }
        const info = this.bridge.getModelInfo();
        this.post({ kind: "model_info", model: info.model, thinkingLevel: info.thinkingLevel, sessionName: info.sessionName });
        this.post({ kind: "usage_info", ...this.bridge.getUsageInfo() });
        this.post({ kind: "run_state", state: this.bridge.getRunState() });
        this.post({ kind: "history_loaded", messages: this.bridge.getUiMessages() });
        break;
      }
      case "prompt":
        await this.guard(async () => {
          await this.bridge.sendPrompt(msg.text, msg.mode);
        }, "发送失败");
        break;
      case "abort":
        await this.guard(() => this.bridge.abort(), "中止失败");
        break;
      case "open_history":
        await this.showHistory();
        break;
      case "new_session":
        await this.guard(() => this.bridge.newSession(), "新建会话失败");
        break;
      case "switch_model":
        await this.showModelPicker();
        break;
      case "switch_thinking":
        await this.showThinkingPicker();
        break;
      case "rename_session":
        await this.showRenameInput();
        break;
      case "insert_file_ref":
        await this.showFilePicker();
        break;
      case "request_commands": {
        // FR-CMD-03 ⑤：不可用/空 → 空列表回发，webview 不显示菜单
        const commands = await this.bridge.listCommands();
        this.post({ kind: "commands", commands });
        break;
      }
      case "request_models": {
        // FR-MOD-01③：底部内联选择器的列表数据（与状态栏/命令面板入口同一通道 listModels）
        const models = await this.bridge.listModels();
        this.post({
          kind: "models_list",
          models: models.map((m) => ({ id: m.id, provider: m.provider, name: m.name, reasoning: m.reasoning })),
        });
        break;
      }
      case "set_model":
        await this.guard(() => this.bridge.setModel(msg.provider, msg.modelId), "切换模型失败");
        break;
      case "open_settings":
        void vscode.commands.executeCommand("workbench.action.openSettings", "sdysyhj");
        break;
      case "open_external":
        void vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case "refresh_session":
        await this.guard(() => this.bridge.reloadHistory(), "刷新会话失败");
        break;
      case "copy_output": {
        await this.actions.copyOutput(msg.toolCallId);
        break;
      }
      default:
        break;
    }
  }

  /** @file 文件选择器（FR-FILE-02）：hostActions 委托。 */
  private async showFilePicker(): Promise<void> {
    await this.actions.showFilePicker();
  }

  private async guard(fn: () => Promise<void> | void, label: string): Promise<void> {
    await this.actions.guard(fn, label);
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"));
    const cspSource = webview.cspSource;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Sdysyhj</title>
</head>
<body>
  <header id="header">
    <div class="header-row">
      <span id="session-name" class="session-name" title="点击重命名">未命名会话</span>
      <span class="header-actions">
        <button id="btn-new" title="新建会话">＋</button>
        <button id="btn-history" title="会话历史">🕘</button>
        <button id="btn-settings" title="设置">⚙</button>
      </span>
    </div>
    <div class="header-row">
      <span id="status-line" class="status-line" title="点击切换模型">—</span>
    </div>
  </header>
  <main id="messages" aria-live="polite"><div id="messages-col" class="content-col"></div></main>
  <div id="errors"><div id="errors-col" class="content-col"></div></div>
  <footer id="input-area">
    <div class="content-col" id="input-col">
      <div class="input-toolbar">
        <label class="mode-label">插话模式
          <select id="send-mode" title="运行中插话模式（FR-CHAT-06）">
            <option value="steer">steer（运行中插话）</option>
            <option value="followUp">follow-up（本轮后处理）</option>
          </select>
        </label>
      </div>
      <div class="input-shell" id="input-shell">
        <div id="cmd-menu" class="cmd-menu" role="listbox" aria-label="命令补全" hidden></div>
        <textarea id="input" rows="3" placeholder="输入消息…（Enter 发送 / Shift+Enter 换行；输入 @ 引用文件、/ 呼出命令）"></textarea>
        <button id="btn-send" aria-label="发送" title="发送">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <path d="M8 13.2V3.6M8 3.6 4.3 7.3M8 3.6l3.7 3.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <div class="input-bottom" id="input-bottom">
        <button id="model-selector" class="model-selector" title="切换模型（底部内联选择器）">
          <span id="model-selector-name">—</span><span class="model-caret" aria-hidden="true">▾</span>
        </button>
        <span id="usage-line" class="usage-line" title="上下文用量：最近一条助手消息 token / 上下文窗口">—</span>
        <span class="input-bottom-spacer"></span>
        <button id="btn-stop" hidden>■ Stop</button>
        <div id="model-menu" class="model-menu" role="listbox" aria-label="可用模型" hidden></div>
      </div>
    </div>
  </footer>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

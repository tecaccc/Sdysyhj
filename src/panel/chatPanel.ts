// ChatPanel：WebviewViewProvider + postMessage 路由。
// 宿主侧中介：webview 消息 → PiBridge 操作 / vscode API；PiBridge 事件 → webview。

import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import type { PiBridge } from "../bridge/piBridge";
import { PiRuntimeError } from "../bridge/rpcTransport";
import { listSessions } from "../session/sessionStore";
import type { SdysyhjConfig } from "../util/config";
import type { Logger } from "../util/log";
import { firstLine } from "../util/text";
import { isHostToWebview, type HostToWebview, type WebviewToHost } from "./messages";

export interface StartupError {
  message: string;
  hint?: string;
  detail?: string;
}

export class ChatPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "sdysyhj.chatView";

  private view: vscode.WebviewView | null = null;
  private readonly disposables: vscode.Disposable[] = [];

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

  /** 右键“发送到 Pi”（FR-FILE-03）：文件路径或选区作为 prompt 素材预填输入框。 */
  sendToPi(uri?: vscode.Uri): void {
    const editor = vscode.window.activeTextEditor;
    const target = uri ?? editor?.document.uri;
    if (!target) {
      void vscode.window.showWarningMessage("Sdysyhj：没有可发送的文件。");
      return;
    }
    const rel = this.relativePath(target.fsPath);
    let text = `@${rel}`;
    if (editor && editor.document.uri.fsPath === target.fsPath && !editor.selection.isEmpty) {
      const selection = editor.document.getText(editor.selection);
      const startLine = editor.selection.start.line + 1;
      const endLine = editor.selection.end.line + 1;
      text += `\n\n选区（L${startLine}-L${endLine}）：\n\`\`\`\n${selection}\n\`\`\``;
    }
    this.reveal();
    this.post({ kind: "input_prefill", text });
  }

  // ---------- 面板操作（命令入口复用） ----------

  async showHistory(): Promise<void> {
    const sessions = listSessions(this.cwd, this.sessionsRoot);
    if (sessions.length === 0) {
      void vscode.window.showInformationMessage("Sdysyhj：当前工作区暂无历史会话。");
      return;
    }
    const items = sessions.map((s) => ({
      label: `$(comment-discussion) ${s.title}`,
      description: `${new Date(s.modifiedAt).toLocaleString()} · ${s.messageCount} 条消息`,
      detail: s.name ? s.path : undefined,
      sessionPath: s.path,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "选择会话切换（上下文将完整恢复）",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) return;
    await this.guard(async () => {
      await this.bridge.switchSession(picked.sessionPath);
    }, "切换会话失败");
  }

  async showModelPicker(): Promise<void> {
    await this.guard(async () => {
      const models = await this.bridge.listModels();
      if (models.length === 0) {
        void vscode.window.showInformationMessage("Sdysyhj：没有可用模型，请先运行 pi config / pi auth 配置。");
        return;
      }
      const picked = await vscode.window.showQuickPick(
        models.map((m) => ({
          label: m.id,
          description: `${m.provider}${m.name ? ` · ${m.name}` : ""}${m.reasoning ? " · reasoning" : ""}`,
          model: m,
        })),
        { placeHolder: "选择模型（随会话持久化）" }
      );
      if (!picked) return;
      await this.bridge.setModel(picked.model.provider, picked.model.id);
    }, "切换模型失败");
  }

  async showThinkingPicker(): Promise<void> {
    await this.guard(async () => {
      const levels = await this.bridge.listThinkingLevels();
      const items = [
        { label: "$(sync) 循环切换", level: "__cycle__" as string },
        ...levels.map((l) => ({ label: l, level: l })),
      ];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: "选择 thinking 等级" });
      if (!picked) return;
      if (picked.level === "__cycle__") {
        await this.bridge.cycleThinkingLevel();
      } else {
        await this.bridge.setThinkingLevel(picked.level);
      }
    }, "切换 thinking 等级失败");
  }

  async showRenameInput(): Promise<void> {
    const current = this.bridge.getModelInfo().sessionName;
    const name = await vscode.window.showInputBox({
      prompt: "会话名称",
      value: current,
      placeHolder: "例如：重构鉴权模块",
    });
    if (name === undefined) return;
    await this.guard(async () => {
      await this.bridge.renameSession(name.trim());
    }, "重命名会话失败");
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
        const text = this.bridge.getToolOutput(msg.toolCallId);
        if (text !== undefined) {
          await vscode.env.clipboard.writeText(text);
          this.post({ kind: "toast", text: "已复制全部输出" });
        } else {
          this.post({ kind: "toast", text: "没有可复制的输出" });
        }
        break;
      }
      default:
        break;
    }
  }

  /** @file 文件选择器（FR-FILE-02）：当前工作区内选文件，路径插入 prompt。 */
  private async showFilePicker(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0];
    const uris = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,out,dist}/**", 2000);
    const inRoot = root ? uris.filter((u) => u.fsPath.startsWith(root.uri.fsPath)) : uris;
    const items = inRoot.map((u) => {
      const rel = this.relativePath(u.fsPath);
      return { label: path.basename(u.fsPath), description: rel, rel };
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "选择要引用的文件（@file）",
      matchOnDescription: true,
    });
    if (!picked) return;
    this.post({ kind: "file_ref", path: picked.rel });
  }

  private relativePath(fsPath: string): string {
    const root = vscode.workspace.workspaceFolders?.[0];
    const base = root?.uri.fsPath ?? this.cwd;
    const rel = path.relative(base, fsPath) || path.basename(fsPath);
    return rel.split(path.sep).join("/");
  }

  private async guard(fn: () => Promise<void> | void, label: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof PiRuntimeError ? err.message : err instanceof Error ? err.message : String(err);
      const hint = err instanceof PiRuntimeError ? err.hint : undefined;
      this.logger.error(`${label}：${message}`);
      this.post({ kind: "error", message: `${label}：${message}`, ...(hint ? { hint } : {}) });
      void vscode.window.showErrorMessage(`Sdysyhj：${label}（${firstLine(message, 120)}）`);
    }
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
  <main id="messages" aria-live="polite"></main>
  <div id="errors"></div>
  <footer id="input-area">
    <div class="input-toolbar">
      <button id="btn-file" title="插入文件引用（@file）">@文件</button>
      <label class="mode-label">插话模式
        <select id="send-mode" title="运行中插话模式（FR-CHAT-06）">
          <option value="steer">steer（运行中插话）</option>
          <option value="followUp">follow-up（本轮后处理）</option>
        </select>
      </label>
    </div>
    <textarea id="input" rows="3" placeholder="输入消息…（Enter 发送 / Shift+Enter 换行；输入 @ 引用文件）"></textarea>
    <div class="input-actions">
      <span id="stream-cursor" hidden>▍</span>
      <button id="btn-send">发送</button>
      <button id="btn-stop" hidden>■ Stop</button>
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

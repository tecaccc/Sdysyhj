// 新 UI 面板核心（vscode-free，TASK-009 §10.14 D1；labChatPanel 演进）。
// 职责：bridge.onAny → postMessage 泵（既有 HostToWebview 协议零改动复用，§10.12 回声账本原样生效）
// + WebviewToHost 协议全集处理（ready 回放 superset：config/model_info/usage_info/run_state/
// history_loaded，对齐 chatPanel.ts 现行为）。vscode 交互动作经注入的 HostActions
// （src/panel/hostActions.ts 共享模块绑定实例，D3），本文件不 import vscode——
// 供 in-node/jsdom 集成测试直接实例化（test/integration/ui-golden-dom.test.ts）。
// 事件隔离：与经典面板共享同一 PiBridge（emitter 多订阅互不影响）。

import * as path from "path";
import type { PiBridge } from "../bridge/piBridge";
import type { HostActions, StartupError } from "../panel/hostActions";
import { isHostToWebview, type HostToWebview, type WebviewToHost } from "../panel/messages";
import type { SdysyhjConfig } from "../util/config";
import type { Logger } from "../util/log";

/** 宿主 → webview 传输面（与 vscode.Webview.postMessage 同形）。 */
export interface ChatWebviewLike {
  postMessage(message: unknown): unknown;
}

export interface ChatControllerOptions {
  getConfig: () => SdysyhjConfig;
  cwd: string;
  noWorkspace: boolean;
  getStartupError?: () => StartupError | null;
}

export class ChatController {
  private readonly disposables: Array<() => void> = [];

  constructor(
    private readonly bridge: PiBridge,
    private readonly webview: ChatWebviewLike,
    private readonly logger: Logger,
    private readonly actions: HostActions,
    private readonly options: ChatControllerOptions
  ) {
    // PiBridge 事件 → postMessage 泵（独立订阅，不影响经典面板）
    this.disposables.push(
      bridge.onAny((event) => {
        void this.webview.postMessage(event);
      })
    );
  }

  /** 右键“发送到 Pi”（FR-FILE-03）：目标 = 新 UI 面板（D1 运行接线）。 */
  sendToPi(uri?: unknown): void {
    this.actions.sendToPi(uri as never);
  }

  /** webview → 宿主协议消息（WebviewToHost 全集）。 */
  async handleMessage(raw: unknown): Promise<void> {
    if (!isHostToWebview(raw)) return;
    const msg = raw as unknown as WebviewToHost;
    switch (msg.kind) {
      case "ready": {
        // ready 回放 superset（对齐 chatPanel.ts 现行为）
        const config = this.options.getConfig();
        this.post({
          kind: "config",
          tailLines: config.outputTailLines,
          sendMode: config.sendMode,
          workspaceLabel: path.basename(this.options.cwd),
        });
        const startupError = this.options.getStartupError?.() ?? null;
        if (startupError) {
          this.post({ kind: "error", message: startupError.message, hint: startupError.hint });
          this.post({ kind: "run_state", state: "error", detail: startupError.message });
        } else if (this.options.noWorkspace) {
          this.post({ kind: "toast", text: "未打开工作区：仍可聊天，但文件工具受限（cwd = 用户主目录）。" });
        }
        const info = this.bridge.getModelInfo();
        this.post({ kind: "model_info", model: info.model, thinkingLevel: info.thinkingLevel, sessionName: info.sessionName });
        this.post({ kind: "usage_info", ...this.bridge.getUsageInfo() });
        this.post({ kind: "run_state", state: this.bridge.getRunState() });
        this.post({ kind: "history_loaded", messages: this.bridge.getUiMessages() });
        break;
      }
      case "prompt":
        await this.actions.guard(async () => {
          await this.bridge.sendPrompt(msg.text, msg.mode);
        }, "发送失败");
        break;
      case "abort":
        await this.actions.guard(() => this.bridge.abort(), "中止失败");
        break;
      case "open_history":
        await this.actions.showHistory();
        break;
      case "new_session":
        await this.actions.guard(() => this.bridge.newSession(), "新建会话失败");
        break;
      case "switch_model":
        await this.actions.showModelPicker();
        break;
      case "switch_thinking":
        await this.actions.showThinkingPicker();
        break;
      case "rename_session":
        await this.actions.showRenameInput();
        break;
      case "insert_file_ref":
        await this.actions.showFilePicker();
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
        await this.actions.guard(() => this.bridge.setModel(msg.provider, msg.modelId), "切换模型失败");
        break;
      case "open_settings":
        this.actions.openSettings();
        break;
      case "open_external":
        this.actions.openExternal(msg.url);
        break;
      case "refresh_session":
        await this.actions.guard(() => this.bridge.reloadHistory(), "刷新会话失败");
        break;
      case "copy_output":
        await this.actions.copyOutput(msg.toolCallId);
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

  private post(message: HostToWebview): void {
    void this.webview.postMessage(message);
  }
}

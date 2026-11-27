// 宿主动作层（原 ChatPanel 内联 vscode 交互动作机械提取，TASK-009 §10.14 D3）：chatPanel.ts
// 同名委托，行为零变化；TASK-011 A 项新 UI 退役后由 ChatPanel 独家消费。
// 动作清单（D3 表）：showHistory/showFilePicker/showModelPicker/showThinkingPicker/showRenameInput/
// guard/relativePath/copy_output/sendToPi（input_prefill 预填，FR-FILE-03）/open_settings/open_external。

import * as path from "path";
import * as vscode from "vscode";
import type { PiBridge } from "../bridge/piBridge";
import { PiRuntimeError } from "../bridge/rpcTransport";
import { listSessions } from "../session/sessionStore";
import type { Logger } from "../util/log";
import { firstLine } from "../util/text";
import type { HostToWebview } from "./messages";

export interface StartupError {
  message: string;
  hint?: string;
  detail?: string;
}

/** 动作依赖上下文（post/reveal 绑定各自面板的 webview 与聚焦入口）。 */
export interface HostActionsContext {
  bridge: PiBridge;
  logger: Logger;
  cwd: string;
  sessionsRoot?: string;
  post(message: HostToWebview): void;
  reveal(): void;
}

export interface HostActions {
  showHistory(): Promise<void>;
  showModelPicker(): Promise<void>;
  showThinkingPicker(): Promise<void>;
  showRenameInput(): Promise<void>;
  showFilePicker(): Promise<void>;
  sendToPi(uri?: vscode.Uri): void;
  copyOutput(toolCallId: string): Promise<void>;
  guard(fn: () => Promise<void> | void, label: string): Promise<void>;
  openSettings(): void;
  openExternal(url: string): void;
  relativePath(fsPath: string): string;
}

export function createHostActions(ctx: HostActionsContext): HostActions {
  const relativePath = (fsPath: string): string => {
    const root = vscode.workspace.workspaceFolders?.[0];
    const base = root?.uri.fsPath ?? ctx.cwd;
    const rel = path.relative(base, fsPath) || path.basename(fsPath);
    return rel.split(path.sep).join("/");
  };

  const guard = async (fn: () => Promise<void> | void, label: string): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof PiRuntimeError ? err.message : err instanceof Error ? err.message : String(err);
      const hint = err instanceof PiRuntimeError ? err.hint : undefined;
      ctx.logger.error(`${label}：${message}`);
      ctx.post({ kind: "error", message: `${label}：${message}`, ...(hint ? { hint } : {}) });
      void vscode.window.showErrorMessage(`Sdysyhj：${label}（${firstLine(message, 120)}）`);
    }
  };

  return {
    relativePath,
    guard,

    async showHistory(): Promise<void> {
      const sessions = listSessions(ctx.cwd, ctx.sessionsRoot);
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
      await guard(async () => {
        await ctx.bridge.switchSession(picked.sessionPath);
      }, "切换会话失败");
    },

    async showModelPicker(): Promise<void> {
      await guard(async () => {
        const models = await ctx.bridge.listModels();
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
        await ctx.bridge.setModel(picked.model.provider, picked.model.id);
      }, "切换模型失败");
    },

    async showThinkingPicker(): Promise<void> {
      await guard(async () => {
        const levels = await ctx.bridge.listThinkingLevels();
        const items = [
          { label: "$(sync) 循环切换", level: "__cycle__" as string },
          ...levels.map((l) => ({ label: l, level: l })),
        ];
        const picked = await vscode.window.showQuickPick(items, { placeHolder: "选择 thinking 等级" });
        if (!picked) return;
        if (picked.level === "__cycle__") {
          await ctx.bridge.cycleThinkingLevel();
        } else {
          await ctx.bridge.setThinkingLevel(picked.level);
        }
      }, "切换 thinking 等级失败");
    },

    async showRenameInput(): Promise<void> {
      const current = ctx.bridge.getModelInfo().sessionName;
      const name = await vscode.window.showInputBox({
        prompt: "会话名称",
        value: current,
        placeHolder: "例如：重构鉴权模块",
      });
      if (name === undefined) return;
      await guard(async () => {
        await ctx.bridge.renameSession(name.trim());
      }, "重命名会话失败");
    },

    /** @file 文件选择器（FR-FILE-02）：当前工作区内选文件，路径插入 prompt。 */
    async showFilePicker(): Promise<void> {
      const root = vscode.workspace.workspaceFolders?.[0];
      const uris = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,out,dist}/**", 2000);
      const inRoot = root ? uris.filter((u) => u.fsPath.startsWith(root.uri.fsPath)) : uris;
      const items = inRoot.map((u) => {
        const rel = relativePath(u.fsPath);
        return { label: path.basename(u.fsPath), description: rel, rel };
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "选择要引用的文件（@file）",
        matchOnDescription: true,
      });
      if (!picked) return;
      ctx.post({ kind: "file_ref", path: picked.rel });
    },

    /** 右键“发送到 Pi”（FR-FILE-03）：文件路径或选区作为 prompt 素材预填输入框。 */
    sendToPi(uri?: vscode.Uri): void {
      const editor = vscode.window.activeTextEditor;
      const target = uri ?? editor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage("Sdysyhj：没有可发送的文件。");
        return;
      }
      const rel = relativePath(target.fsPath);
      let text = `@${rel}`;
      if (editor && editor.document.uri.fsPath === target.fsPath && !editor.selection.isEmpty) {
        const selection = editor.document.getText(editor.selection);
        const startLine = editor.selection.start.line + 1;
        const endLine = editor.selection.end.line + 1;
        text += `\n\n选区（L${startLine}-L${endLine}）：\n\`\`\`\n${selection}\n\`\`\``;
      }
      ctx.reveal();
      ctx.post({ kind: "input_prefill", text });
    },

    /** 大输出「复制全部」（FR-CHAT-04）：宿主缓存全量 → 剪贴板 + toast。 */
    async copyOutput(toolCallId: string): Promise<void> {
      const text = ctx.bridge.getToolOutput(toolCallId);
      if (text !== undefined) {
        await vscode.env.clipboard.writeText(text);
        ctx.post({ kind: "toast", text: "已复制全部输出" });
      } else {
        ctx.post({ kind: "toast", text: "没有可复制的输出" });
      }
    },

    openSettings(): void {
      void vscode.commands.executeCommand("workbench.action.openSettings", "sdysyhj");
    },

    openExternal(url: string): void {
      void vscode.env.openExternal(vscode.Uri.parse(url));
    },
  };
}

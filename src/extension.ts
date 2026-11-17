// 激活入口：注册命令/面板/输出通道，组装 PiBridge 运行链路（FR-CMD-01/02/05）。

import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { PiBridge } from "./bridge/piBridge";
import { RpcClient } from "./bridge/rpcClient";
import { PiRuntimeError, resolvePiRuntime, type ResolvedRuntime } from "./bridge/rpcTransport";
import { ChatPanel, type StartupError } from "./panel/chatPanel";
import { mostRecentSession } from "./session/sessionStore";
import { DEFAULT_CONFIG, readConfig, type SdysyhjConfig } from "./util/config";
import { createRedactingLogger, type Logger } from "./util/log";

const OUTPUT_CHANNEL_NAME = "Sdysyhj";
const REPORT_ISSUE_URL = "https://github.com/sdysyhj/sdysyhj/issues";

const STATE_LABELS: Record<string, string> = {
  idle: "空闲",
  starting: "启动中",
  streaming: "运行中",
  aborted: "已中止",
  error: "错误",
};

let bridge: PiBridge | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 输出通道（FR-CMD-02 / NFR-05）：stderr、协议异常、关键路径日志统一写入，写前脱敏（NFR-03）
  const channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(channel);
  const logger: Logger = createRedactingLogger({
    info: (m) => channel.appendLine(`[info  ${stamp()}] ${m}`),
    warn: (m) => channel.appendLine(`[warn  ${stamp()}] ${m}`),
    error: (m) => channel.appendLine(`[error ${stamp()}] ${m}`),
    debug: (m) => channel.appendLine(`[debug ${stamp()}] ${m}`),
  });

  const getConfig = (): SdysyhjConfig => {
    const cfg = vscode.workspace.getConfiguration("sdysyhj");
    return readConfig((key) => cfg.get(key));
  };

  // 工作区绑定（FR-FILE-01）：多根取第一个；无工作区允许聊天（cwd = 用户主目录，提示受限）
  const folder = vscode.workspace.workspaceFolders?.[0];
  const cwd = folder?.uri.fsPath ?? os.homedir();
  const noWorkspace = folder === undefined;
  logger.info(`激活：cwd=${cwd}${noWorkspace ? "（无工作区，文件工具受限）" : ""}`);

  // pi 运行时来源解析（FR-CMD-05）
  let runtime: ResolvedRuntime | null = null;
  let startupError: StartupError | null = null;
  try {
    runtime = await resolvePiRuntime(getConfig());
    logger.info(`pi 运行时：${runtime.detail}（source=${runtime.source}）`);
  } catch (err) {
    startupError = toStartupError(err);
    logger.error(`pi 运行时解析失败：${startupError.message}｜${startupError.hint ?? ""}｜${startupError.detail ?? ""}`);
  }

  // 启动续接最近会话（FR-SESS-03/FR-MOD-03：重启插件后状态栏反映会话内持久的模型/thinking）
  const resume = runtime ? mostRecentSession(cwd) : null;
  if (resume) logger.info(`续接最近会话：${resume.path}`);

  bridge = new PiBridge({
    cwd,
    runtime: runtime ?? { source: "explicit", command: "__unavailable__", baseArgs: [], detail: "运行时不可用" },
    createClient: ({ command, args, cwd: clientCwd }) =>
      new RpcClient({
        command,
        args,
        cwd: clientCwd,
        env: process.env,
      }),
    logger,
    tailLines: getConfig().outputTailLines,
    sendMode: getConfig().sendMode,
    thinkingDefault: getConfig().thinkingDefault,
    resumeSessionPath: resume?.path,
  });

  if (runtime) {
    try {
      await bridge.start();
    } catch (err) {
      startupError = toStartupError(err);
      logger.error(`PiBridge 启动失败：${startupError.message}`);
    }
  }

  const panel = new ChatPanel(
    context,
    bridge,
    logger,
    getConfig,
    cwd,
    noWorkspace,
    undefined,
    () => startupError
  );
  context.subscriptions.push(panel);

  // 状态栏（FR-CHAT-08）
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "sdysyhj.openChat";
  context.subscriptions.push(statusBar);
  const refreshStatusBar = (): void => {
    const info = bridge!.getModelInfo();
    const state = bridge!.getRunState();
    const model = info.model || "(未设置模型)";
    const thinking = info.thinkingLevel || "—";
    statusBar.text = `$(comment-discussion) Sdysyhj: ${model} · ${thinking} · ${STATE_LABELS[state] ?? state}`;
    statusBar.tooltip = `会话：${info.sessionName || "未命名"}｜点击打开聊天`;
    statusBar.show();
  };
  refreshStatusBar();
  bridge.onAny(() => refreshStatusBar());

  // 命令面板（FR-CMD-01）
  context.subscriptions.push(
    vscode.commands.registerCommand("sdysyhj.openChat", () => panel.reveal()),
    vscode.commands.registerCommand("sdysyhj.newSession", async () => {
      panel.reveal();
      await guardCommand(() => bridge!.newSession(), logger);
    }),
    vscode.commands.registerCommand("sdysyhj.abort", async () => {
      await guardCommand(() => bridge!.abort(), logger);
    }),
    vscode.commands.registerCommand("sdysyhj.showHistory", async () => {
      panel.reveal();
      await panel.showHistory();
    }),
    vscode.commands.registerCommand("sdysyhj.reportIssue", () => {
      void vscode.env.openExternal(vscode.Uri.parse(REPORT_ISSUE_URL));
    }),
    vscode.commands.registerCommand("sdysyhj.renameSession", () => panel.showRenameInput()),
    vscode.commands.registerCommand("sdysyhj.switchModel", () => panel.showModelPicker()),
    vscode.commands.registerCommand("sdysyhj.switchThinking", () => panel.showThinkingPicker()),
    vscode.commands.registerCommand("sdysyhj.sendToPi", (uri?: vscode.Uri) => panel.sendToPi(uri))
  );

  logger.info("Sdysyhj 已激活");
}

function toStartupError(err: unknown): StartupError {
  if (err instanceof PiRuntimeError) {
    return { message: err.message, hint: err.hint, detail: err.detail };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    hint: "请检查 sdysyhj.piRuntime / sdysyhj.piPath 设置，或查看 Output「Sdysyhj」日志。",
  };
}

async function guardCommand(fn: () => Promise<void>, logger: Logger): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`命令执行失败：${message}`);
    void vscode.window.showErrorMessage(`Sdysyhj：${message}`);
  }
}

function stamp(): string {
  return new Date().toISOString();
}

export async function deactivate(): Promise<void> {
  if (bridge) {
    await bridge.dispose(); // 强制停止子进程，防僵尸/泄漏
    bridge = null;
  }
}

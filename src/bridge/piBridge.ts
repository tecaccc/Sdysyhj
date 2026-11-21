// PiBridge：宿主侧唯一权威状态持有者。
// - 运行生命周期状态机：idle → starting → streaming → (idle | aborted | error)，子进程崩溃自动重启一次（NFR-02）
// - 事件翻译：message_update 等流式事件 → UI 增量消息；message_end 为权威终稿（message_final 覆盖）
// - 完成判定：以 agent_settled 为“运行结束”信号（agent_end 后仍可能有重试/压缩/排队）
// - 大输出截断保留尾部（tailLines），全量缓存供“复制全部”（FR-CHAT-04）

import type { HostToWebview, RunState, ToolCallStatus, UiBlock, UiMessage } from "../panel/messages";
import { SessionFileWatcher } from "../session/sessionStore";
import { TypedEmitter } from "../util/emitter";
import type { Logger } from "../util/log";
import { summarizeToolArgs, truncateToTail, firstLine } from "../util/text";
import type { ResolvedRuntime } from "./rpcTransport";
import type {
  AgentMessage,
  ModelInfo,
  RpcEvent,
  RpcSessionState,
  RpcSlashCommand,
  ToolCallContent,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "./protocol";

export type BridgeEvent = Extract<
  HostToWebview,
  {
    kind:
      | "session_reset"
      | "history_loaded"
      | "user_message"
      | "stream_start"
      | "text_delta"
      | "thinking_delta"
      | "toolcall_start"
      | "toolcall_delta"
      | "toolcall_status"
      | "message_final"
      | "run_state"
      | "model_info"
      | "session_name"
      | "usage_info"
      | "error"
      | "toast"
      | "external_change";
  }
>;
/** 事件负载映射（emit 时不含 kind，onAny 合成完整消息）。 */
export type BridgeEventMap = {
  [K in BridgeEvent["kind"]]: Omit<Extract<BridgeEvent, { kind: K }>, "kind">;
};

export interface PromptAcceptance {
  ok: boolean;
  disposition?: string;
  error?: string;
}
export interface QueueAcceptance {
  ok: boolean;
  disposition?: string;
  error?: string;
}

/** PiBridge 依赖的 RPC 客户端接口（RpcClient 结构满足；测试注入 fake）。 */
export interface PiRpcClient {
  readonly isRunning: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: (event: RpcEvent) => void): () => void;
  onExit(listener: (info: { code: number | null; stderr: string; intentional: boolean }) => void): () => void;
  /** 子进程 stderr（按行原文），供日志排障（FR-CMD-02） */
  onStderr(listener: (line: string) => void): () => void;
  /** RPC 协议异常（解析失败等），供日志排障（FR-CMD-02） */
  onAnomaly(listener: (detail: string) => void): () => void;
  prompt(message: string, streamingBehavior?: "steer" | "followUp"): Promise<PromptAcceptance>;
  steer(message: string): Promise<QueueAcceptance>;
  followUp(message: string): Promise<QueueAcceptance>;
  abort(): Promise<void>;
  newSession(): Promise<{ cancelled: boolean }>;
  switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
  getState(): Promise<RpcSessionState>;
  getMessages(): Promise<AgentMessage[]>;
  setModel(provider: string, modelId: string): Promise<ModelInfo>;
  getAvailableModels(): Promise<ModelInfo[]>;
  getCommands(): Promise<RpcSlashCommand[]>;
  setThinkingLevel(level: string): Promise<void>;
  cycleThinkingLevel(): Promise<{ level: string } | null>;
  getAvailableThinkingLevels(): Promise<string[]>;
  setSessionName(name: string): Promise<void>;
}

export interface SessionWatcherLike {
  track(filePath: string | null): void;
  markSynced(): void;
  /**
   * 运行态门控（FR-SESS-07，#D-01）：true=挂起（轮询只吸收变化不报警）；
   * 恢复（false）时实现方须先 markSynced 再恢复正常检测。
   */
  setSuspended(suspended: boolean): void;
  start(): void;
  dispose(): void;
}

export interface PiBridgeOptions {
  /** 工作区根（pi 子进程 cwd，FR-FILE-01） */
  cwd: string;
  runtime: ResolvedRuntime;
  createClient: (args: { command: string; args: string[]; cwd: string }) => PiRpcClient;
  logger: Logger;
  /** 工具输出卡片保留尾部行数 */
  tailLines: number;
  /** 运行中默认插话模式 */
  sendMode: "steer" | "followUp";
  /** 新建会话默认 thinking 等级（自由字符串透传 pi，空=继承） */
  thinkingDefault?: string;
  /** 启动续接的会话文件（FR-SESS-03/FR-MOD-03） */
  resumeSessionPath?: string;
  /** 外部修改监视（FR-SESS-07）工厂，测试可注入 */
  createWatcher?: (onExternalChange: () => void) => SessionWatcherLike;
}

/** #D-03（Issue #2）：extension_error 同键（extensionPath+error）toast 去重窗口 */
const EXTENSION_ERROR_TOAST_DEDUP_MS = 60_000;

/** queue_update 快照 diff：返回 next 相对 prev 新增的文本（保留 next 顺序；同文本重复按出现次序一一对应）。 */
function addedTexts(prev: string[], next: string[]): string[] {
  const counts = new Map<string, number>();
  for (const text of prev) counts.set(text, (counts.get(text) ?? 0) + 1);
  const added: string[] = [];
  for (const text of next) {
    const remaining = counts.get(text) ?? 0;
    if (remaining > 0) counts.set(text, remaining - 1);
    else added.push(text);
  }
  return added;
}

interface ToolLocation {
  messageId: string;
}

/** 待回声发送通道（§10.12 D2） */
type PendingEchoChannel = "prompt" | "steer" | "followUp";

/**
 * 待回声账本条目（§10.12 D2，FR-CHAT-11）：一次用户发送 → 期待一条 pi user 回声。
 * pi 回声不携带客户端关联键（json.md L30–46），关联只能由我方在发送侧建立；
 * 全部状态迁移由协议事件驱动（入账/queue_update 绑定/回声消账/settled 残留清理），零时间阈值。
 * 数组成员资格 = 在账（可参与匹配）；消费/拒绝/handled/settled 终结后即移除。
 */
interface PendingUserEcho {
  /** 全局发送序（入账顺序） */
  seq: number;
  /** 宿主单源消息 id（D1；回声终稿 message_final 复用该 id） */
  id: string;
  channel: PendingEchoChannel;
  /** 发送原文（乐观展示文本，澄清 #16：回声到达前展示） */
  sentText: string;
  /** 发送时刻（权威重建回填时的时间戳） */
  sentAt: number;
  /** 入队快照绑定的展开后文本（rpc-commands.md L24/L48/L72：skill/template 在发送/入队前展开，队列文本即回声将携带的文本） */
  queuedText?: string;
  /** disposition:"started" 的 prompt 条目：其回声是下一 run 的首条 user 回声（json.md L36–39 序列），精确匹配时优先 */
  runHead: boolean;
}

export class PiBridge extends TypedEmitter<BridgeEventMap> {
  private anyListeners = new Set<(event: BridgeEvent) => void>();

  /** 订阅全部桥接事件（面板转发到 webview 用）。 */
  onAny(listener: (event: BridgeEvent) => void): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  override emit<E extends keyof BridgeEventMap>(event: E, payload: BridgeEventMap[E]): void {
    super.emit(event, payload);
    const full = { kind: event, ...payload } as unknown as BridgeEvent;
    for (const listener of [...this.anyListeners]) {
      try {
        listener(full);
      } catch {
        // 监听器异常不得影响事件循环
      }
    }
  }

  private client: PiRpcClient | null = null;
  private unsubs: Array<() => void> = [];
  private runState: RunState = "idle";
  private uiMessages: UiMessage[] = [];
  private messageIdSeq = 0;
  private streamingMessage: UiMessage | null = null;
  private streamingBlocks = new Map<number, UiBlock>();
  private toolLocations = new Map<string, ToolLocation>();
  private toolStatuses = new Map<string, ToolCallStatus>();
  private toolOutputs = new Map<string, string>();
  private pendingAbort = false;
  private crashStreak = 0;
  private disposed = false;
  /** 会话陈旧（外部修改待刷新）：拦截后续 prompt，直至刷新完成（FR-SESS-07） */
  private sessionStale = false;
  /** #D-03：extension_error toast 去重（key=extensionPath+\0+error → 上次 toast 时刻；仅抑制重复 toast，日志始终全量） */
  private extensionErrorToastAt = new Map<string, number>();

  private sessionId = "";
  private sessionName = "";
  private modelName = "";
  private thinkingLevel = "";
  private sessionFile: string | null = null;

  /** 待回声账本（§10.12 D2）：未消费/未出账的用户发送 */
  private pendingUserEchoes: PendingUserEcho[] = [];
  private pendingEchoSeq = 0;
  /** 最近一次 queue_update 快照（json.md「Queue and state events」L121–122：两字段含完整当前队列） */
  private lastQueueSnapshot: { steering: string[]; followUp: string[] } | null = null;

  /** FR-MOD-04：最近一条助手消息 usage.totalTokens（会话内权威取值；null = 尚无助手消息） */
  private lastUsageTokens: number | null = null;
  /** FR-MOD-04：get_state 返回的上下文窗口（state.model.contextWindow；null = 未知） */
  private contextWindow: number | null = null;
  /** usage_info 去重快照（值未变化不重发，减少 postMessage 噪音；初值 = 空快照，避免启动时噪音事件） */
  private lastEmittedUsage: { totalTokens: number | null; contextWindow: number | null } = {
    totalTokens: null,
    contextWindow: null,
  };

  private watcher: SessionWatcherLike;

  constructor(private readonly options: PiBridgeOptions) {
    super();
    this.watcher =
      options.createWatcher?.(() => {
        this.onExternalChange();
      }) ??
      new SessionFileWatcher({
        onExternalChange: () => {
          this.onExternalChange();
        },
      });
  }

  /** 外部修改：置陈旧标记（拦截后续交互）并提示刷新（FR-SESS-07，口径 C）。 */
  private onExternalChange(): void {
    this.sessionStale = true;
    this.emit("external_change", {
      detail: "当前会话在插件之外被修改（如终端 pi 写入同一会话）。",
    });
  }

  // ---------- 生命周期 ----------

  async start(): Promise<void> {
    if (this.disposed || this.client) return;
    await this.spawnClient();
    await this.refreshState();
    await this.refreshHistory();
    this.watcher.start();
    this.options.logger.info(`PiBridge 已启动（${this.options.runtime.detail}，cwd=${this.options.cwd}）`);
  }

  private buildArgs(): string[] {
    const args = [...this.options.runtime.baseArgs, "--mode", "rpc"];
    const resume = this.sessionFile ?? this.options.resumeSessionPath;
    if (resume) args.push("--session", resume);
    return args;
  }

  private async spawnClient(): Promise<void> {
    const client = this.options.createClient({
      command: this.options.runtime.command,
      args: this.buildArgs(),
      cwd: this.options.cwd,
    });
    this.client = client;
    this.attach(client);
    await client.start();
  }

  private attach(client: PiRpcClient): void {
    this.unsubs.push(client.onEvent((event) => void this.handleEvent(event)));
    this.unsubs.push(
      client.onExit((info) => {
        if (this.disposed || info.intentional) return;
        this.handleCrash(info);
      })
    );
    // stderr 原文与协议异常写入 Output Channel（FR-CMD-02 / NFR-05）；logger 统一脱敏（NFR-03）
    this.unsubs.push(client.onStderr((line) => this.options.logger.error(`pi 子进程 stderr：${line}`)));
    this.unsubs.push(client.onAnomaly((detail) => this.options.logger.warn(`RPC 协议异常：${detail}`)));
  }

  private detach(): void {
    for (const unsub of this.unsubs) {
      try {
        unsub();
      } catch {
        // 忽略
      }
    }
    this.unsubs = [];
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.watcher.dispose();
    this.detach();
    const client = this.client;
    this.client = null;
    if (client) {
      try {
        await client.stop();
      } catch {
        // 忽略
      }
    }
    this.removeAllListeners();
  }

  private async handleCrash(info: { code: number | null; stderr: string }): Promise<void> {
    this.options.logger.error(`pi 子进程退出（code=${info.code}）：${info.stderr.trim().slice(0, 500)}`);
    this.crashStreak += 1;
    const wasRunning = this.runState === "starting" || this.runState === "streaming";
    if (this.crashStreak <= 1) {
      this.emit("error", {
        message: `Pi 子进程异常退出（code=${info.code}），已自动重启一次。`,
        hint: "若反复崩溃：请运行 `pi auth` 检查凭证、确认 sdysyhj.piPath 设置，并查看 Output「Sdysyhj」日志。",
      });
      this.emit("toast", { text: "Pi 子进程已自动重启" });
      try {
        this.detach();
        this.client = null;
        await this.spawnClient();
        await this.refreshState();
        await this.refreshHistory();
        if (wasRunning) {
          // 同口径 A：崩溃致中止为瞬态，最终回 idle（提示经 toast/error 补充）
          this.setRunState("aborted", "子进程崩溃，本次运行已中止");
        }
        this.setRunState("idle");
      } catch (err) {
        this.setRunState("error", err instanceof Error ? err.message : String(err));
        this.emit("error", {
          message: "Pi 子进程重启失败。",
          hint: "请检查 sdysyhj.piRuntime / sdysyhj.piPath 设置与 pi 安装是否完整，然后重新打开面板。",
        });
      }
    } else {
      this.setRunState("error", `子进程退出（code=${info.code}）`);
      this.emit("error", {
        message: "Pi 子进程反复崩溃，已停止自动重启。",
        hint: "请运行 `pi auth` 检查凭证；检查 sdysyhj.piPath 是否指向有效 pi；查看 Output「Sdysyhj」日志中的 stderr 详情。",
      });
    }
  }

  // ---------- 对外操作 ----------

  async sendPrompt(text: string, mode: "auto" | "steer" | "followUp" = "auto"): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    // FR-SESS-07 拦截语义（v0.2.2 口径 C）：外部修改未刷新前，阻止基于陈旧状态继续交互
    if (this.sessionStale) {
      this.options.logger.warn("prompt 发送被拦截：会话在插件之外被修改，待刷新");
      this.emit("error", {
        message: "会话已在插件之外被修改，本次发送已拦截（避免基于陈旧状态操作）。",
        hint: "请先点击『刷新』恢复最新会话状态（或重新选择会话）后再发送。",
      });
      return;
    }
    const client = this.client;
    if (!client) {
      this.emit("error", { message: "pi 运行时尚未就绪，无法发送。", hint: "请稍候或重新打开面板。" });
      return;
    }
    const running = this.runState === "starting" || this.runState === "streaming";
    if (running) {
      const effective = mode === "auto" ? this.options.sendMode : mode;
      // D1：宿主单源 id；D2：发送即入账（回声关联键在发送侧建立）
      const entry = this.openPendingEcho(effective === "steer" ? "steer" : "followUp", trimmed);
      this.options.logger.info(`prompt 发送（${effective} 插话排队）：${firstLine(trimmed, 80)}`);
      this.emit("user_message", { id: entry.id, text });
      this.pushUserMessage(entry.id, text);
      try {
        const result = effective === "steer" ? await client.steer(trimmed) : await client.followUp(trimmed);
        if (!result.ok) {
          this.closePendingEcho(entry); // D3：受理前拒绝即刻出账，不污染后续匹配
          this.emit("error", { message: `插话失败：${result.error ?? "未知错误"}`, hint: "可点击 Stop 中止本轮后重新发送。" });
        } else if (result.disposition === "handled") {
          this.closePendingEcho(entry); // D3：input handler 消费，无 run 无回声（rpc-commands.md L46–92）
        } else {
          this.emit("toast", { text: effective === "steer" ? "steer 消息已排队" : "follow-up 消息已排队" });
        }
      } catch (err) {
        this.closePendingEcho(entry);
        this.emit("error", { message: `插话失败：${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // D1/D2：idle 发送同样入账；回声终稿将复用该 id 就地更新（澄清 #16）
    const entry = this.openPendingEcho("prompt", trimmed);
    this.options.logger.info(`prompt 发送：${firstLine(trimmed, 80)}`);
    this.emit("user_message", { id: entry.id, text });
    this.pushUserMessage(entry.id, text);
    this.setRunState("starting");
    try {
      const result = await client.prompt(trimmed);
      if (!result.ok) {
        this.closePendingEcho(entry); // D3：success:false 受理前拒绝，无后续事件（rpc-commands.md L34–42）
        this.setRunState("idle");
        this.emit("error", {
          message: `prompt 被拒绝：${result.error ?? "未知错误"}`,
          hint: "请检查模型/凭证配置（`pi auth`），或稍后重试。",
        });
        return;
      }
      if (result.disposition === "handled") {
        this.closePendingEcho(entry); // D3：扩展命令消费，无 run 不等 settled（rpc.md「Run lifecycle」）
        this.setRunState("idle");
      } else if (result.disposition === "started") {
        entry.runHead = true; // D2：其回声是下一 run 的首条 user 回声（json.md L36–39）
      }
      // disposition:"queued"（或未知）：留账，等待 queue_update 快照绑定 queuedText
    } catch (err) {
      this.closePendingEcho(entry);
      this.setRunState("idle");
      this.emit("error", {
        message: `发送失败：${err instanceof Error ? err.message : String(err)}`,
        hint: "请查看 Output「Sdysyhj」日志了解子进程 stderr 详情。",
      });
    }
  }

  async abort(): Promise<void> {
    const client = this.client;
    if (!client) return;
    if (this.runState !== "starting" && this.runState !== "streaming") return;
    this.options.logger.info("abort：请求中止当前运行（RPC abort）");
    this.pendingAbort = true;
    try {
      await client.abort();
    } catch (err) {
      this.pendingAbort = false;
      this.emit("error", { message: `中止失败：${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async newSession(): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    await this.safeAbort();
    await client.newSession();
    this.sessionStale = false;
    if (this.options.thinkingDefault && this.options.thinkingDefault.length > 0) {
      // 新会话默认 thinking 等级；枚举由 pi 校验（透传不固化）
      try {
        await client.setThinkingLevel(this.options.thinkingDefault);
      } catch (err) {
        this.options.logger.warn(`应用 thinkingDefault 失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.uiMessages = [];
    this.lastQueueSnapshot = null; // 新会话队列为空：旧快照不作数
    await this.refreshState(true);
    await this.refreshHistory();
    this.setRunState("idle");
    this.emit("toast", { text: "已新建会话（旧会话已保留）" });
    this.options.logger.info("新建会话");
  }

  async switchSession(sessionPath: string): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    await this.safeAbort();
    await client.switchSession(sessionPath);
    this.sessionStale = false;
    this.uiMessages = [];
    this.lastQueueSnapshot = null; // 切换后会话队列状态未知且与旧快照无关
    await this.refreshState(true);
    await this.refreshHistory();
    this.setRunState("idle");
    this.options.logger.info(`切换会话：${sessionPath}`);
  }

  async renameSession(name: string): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    await client.setSessionName(name);
    this.sessionName = name;
    this.emit("session_name", { name });
    this.emitModelInfo();
    this.watcher.markSynced();
    this.options.logger.info(`会话命名：${name}`);
  }

  /** FR-SESS-07：用户确认后刷新，避免静默使用陈旧状态；刷新完成解除交互拦截。 */
  async reloadHistory(): Promise<void> {
    await this.refreshHistory();
    this.sessionStale = false;
    this.watcher.markSynced();
    this.emit("toast", { text: "会话已刷新" });
  }

  async listModels(): Promise<ModelInfo[]> {
    const client = await this.requireClient();
    if (!client) return [];
    return client.getAvailableModels();
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    await client.setModel(provider, modelId);
    await this.refreshState();
    this.emit("toast", { text: `模型已切换：${provider}/${modelId}` });
  }

  async listThinkingLevels(): Promise<string[]> {
    const client = await this.requireClient();
    if (!client) return [];
    return client.getAvailableThinkingLevels();
  }

  async setThinkingLevel(level: string): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    await client.setThinkingLevel(level);
    await this.refreshState();
    this.emit("toast", { text: `thinking 等级：${level}` });
  }

  async cycleThinkingLevel(): Promise<void> {
    const client = await this.requireClient();
    if (!client) return;
    const result = await client.cycleThinkingLevel();
    if (result) {
      await this.refreshState();
      this.emit("toast", { text: `thinking 等级：${result.level}` });
    } else {
      this.emit("toast", { text: "当前模型不支持 thinking" });
    }
  }

  /** 供“复制全部”使用：宿主缓存的完整工具输出。 */
  getToolOutput(toolCallId: string): string | undefined {
    return this.toolOutputs.get(toolCallId);
  }

  /** webview 重放快照 */
  getUiMessages(): UiMessage[] {
    return this.uiMessages;
  }

  getRunState(): RunState {
    return this.runState;
  }

  getModelInfo(): { model: string; thinkingLevel: string; sessionName: string } {
    return { model: this.modelName, thinkingLevel: this.thinkingLevel, sessionName: this.sessionName };
  }

  /** FR-MOD-04：上下文用量快照（webview ready 重放用）。 */
  getUsageInfo(): { totalTokens: number | null; contextWindow: number | null } {
    return { totalTokens: this.lastUsageTokens, contextWindow: this.contextWindow };
  }

  /** FR-CMD-03：命令全集。不可用（运行时未就绪 / RPC 失败）时返回空——菜单不显示，`/` 文本仍可直接发送透传（⑤）。 */
  async listCommands(): Promise<RpcSlashCommand[]> {
    const client = await this.requireClient();
    if (!client) return [];
    try {
      return await client.getCommands();
    } catch (err) {
      this.options.logger.warn(`get_commands 失败：${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ---------- 内部 ----------

  private async requireClient(): Promise<PiRpcClient | null> {
    if (this.client) return this.client;
    this.emit("error", { message: "pi 运行时尚未就绪。", hint: "请稍候或重新打开面板。" });
    return null;
  }

  private async safeAbort(): Promise<void> {
    if (this.runState === "starting" || this.runState === "streaming") {
      this.pendingAbort = true;
      try {
        await this.client?.abort();
      } catch {
        // 忽略
      }
    }
  }

  private setRunState(state: RunState, detail?: string): void {
    this.runState = state;
    this.emit("run_state", detail !== undefined ? { state, detail } : { state });
    if (state === "starting") {
      // 运行态门控（#D-01）：starting/streaming 期间本插件 pi 子进程持续写会话文件，
      // watcher 只吸收变化（更新基线）不报警
      this.watcher.setSuspended(true);
    } else if (state === "idle" || state === "aborted") {
      // 恢复检测：解除挂起（内部先 markSynced 重置基线），再兑底同步一次
      this.watcher.setSuspended(false);
      this.watcher.markSynced();
    }
  }

  private async refreshState(sessionChanged = false): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const state = await client.getState();
      this.sessionId = state.sessionId ?? "";
      this.sessionName = state.sessionName ?? "";
      this.modelName = state.model ? `${state.model.provider}/${state.model.id}` : "";
      this.thinkingLevel = state.thinkingLevel ?? "";
      this.sessionFile = state.sessionFile ?? null;
      // FR-MOD-04 ②：上下文窗口 = get_state 的 model.contextWindow
      this.contextWindow = typeof state.model?.contextWindow === "number" ? state.model.contextWindow : null;
      this.watcher.track(this.sessionFile);
      if (sessionChanged) {
        this.emit("session_reset", { sessionId: this.sessionId, name: this.sessionName });
      }
      this.emitModelInfo();
      this.emitUsageInfo();
    } catch (err) {
      this.options.logger.warn(`get_state 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private emitModelInfo(): void {
    this.emit("model_info", {
      model: this.modelName,
      thinkingLevel: this.thinkingLevel,
      sessionName: this.sessionName,
    });
  }

  /** FR-MOD-04：值变化时透出 usage_info（去重：重复相同 usage 不重发）。 */
  private emitUsageInfo(): void {
    const snapshot = { totalTokens: this.lastUsageTokens, contextWindow: this.contextWindow };
    if (this.lastEmittedUsage.totalTokens === snapshot.totalTokens && this.lastEmittedUsage.contextWindow === snapshot.contextWindow) {
      return;
    }
    this.lastEmittedUsage = snapshot;
    this.emit("usage_info", snapshot);
  }

  /** FR-MOD-04 ①：捕获最近一条助手消息的 usage.totalTokens（message_update 携带的 Usage / message_end 权威终稿）。 */
  private captureUsage(usage: Usage | undefined): void {
    if (!usage || typeof usage.totalTokens !== "number") return;
    this.lastUsageTokens = usage.totalTokens;
    this.emitUsageInfo();
  }

  private async refreshHistory(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const messages = await client.getMessages();
      this.toolLocations.clear();
      this.toolStatuses.clear();
      this.uiMessages = [];
      for (const message of messages) {
        if (message.role === "toolResult") {
          // 先更新状态/输出，使后续消息（与卡片）看到权威结果
          this.handleToolResult(message);
          continue;
        }
        const ui = this.buildUiMessage(message);
        if (ui) this.upsertUiMessage(ui);
      }
      // 历史重建：未收到 toolResult 的工具调用（被中止等）收敛为终态
      for (const ui of this.uiMessages) {
        for (const block of ui.blocks) {
          if (block.type === "toolcall" && block.status === "running") {
            block.status = ui.aborted ? "aborted" : "success";
          }
        }
      }
      // §10.12 D5：权威重建后回填仍入队的待回声条目（按发送序追加尾部，乐观条目不丢、不重复）；
      // 已不在队列的未回声条目出账（JSONL 已权威或已失效，不再参与匹配）
      for (const entry of this.pendingUserEchoes.filter((e) => this.entryStillQueued(e))) {
        if (this.uiMessages.some((m) => m.id === entry.id)) continue;
        this.uiMessages.push({
          id: entry.id,
          role: "user",
          blocks: [{ type: "text", text: entry.sentText }],
          timestamp: entry.sentAt,
        });
      }
      this.pendingUserEchoes = this.pendingUserEchoes.filter((e) => this.entryStillQueued(e));
      // FR-MOD-04 ④：会话载入/切换后按新会话最近一条助手消息的 usage.totalTokens 取值刷新
      this.lastUsageTokens = null;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role === "assistant" && m.usage && typeof m.usage.totalTokens === "number") {
          this.lastUsageTokens = m.usage.totalTokens;
          break;
        }
      }
      this.watcher.markSynced();
      this.emit("history_loaded", { messages: this.uiMessages });
      this.emitUsageInfo();
    } catch (err) {
      this.options.logger.warn(`get_messages 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------- 事件翻译 ----------

  private async handleEvent(event: RpcEvent): Promise<void> {
    switch (event.type) {
      case "agent_start":
        if (this.runState === "starting") this.setRunState("streaming");
        break;
      case "message_start": {
        const message = event.message;
        if (message && message.role === "assistant") {
          const id = `m${++this.messageIdSeq}`;
          this.streamingMessage = { id, role: "assistant", blocks: [], timestamp: Date.now() };
          this.streamingBlocks = new Map();
          this.emit("stream_start", { messageId: id });
        }
        break;
      }
      case "message_update":
        this.captureUsage(event.usage); // FR-MOD-04：流式期间收到用量即刷新
        this.handleMessageUpdate(event.assistantMessageEvent);
        break;
      case "message_end":
        if (event.message && event.message.role === "assistant") {
          this.captureUsage(event.message.usage); // 权威终稿用量
        }
        this.handleMessageEnd(event.message);
        break;
      case "tool_execution_start": {
        const location = this.toolLocations.get(event.toolCallId);
        const summary = event.args ? summarizeToolArgs(event.toolName, event.args) : undefined;
        this.toolStatuses.set(event.toolCallId, "running");
        if (location) {
          this.emit("toolcall_status", {
            messageId: location.messageId,
            toolCallId: event.toolCallId,
            status: "running",
            ...(summary !== undefined ? { summary } : {}),
          });
        }
        break;
      }
      case "tool_execution_update": {
        const location = this.toolLocations.get(event.toolCallId);
        const full = event.partialResult ? this.payloadText(event.partialResult.content) : "";
        if (full.length > 0) this.toolOutputs.set(event.toolCallId, full);
        if (location) {
          const tail = truncateToTail(full, this.options.tailLines);
          this.emit("toolcall_status", {
            messageId: location.messageId,
            toolCallId: event.toolCallId,
            status: "running",
            output: tail.text,
            outputTruncated: tail.truncated,
          });
        }
        break;
      }
      case "tool_execution_end": {
        const location = this.toolLocations.get(event.toolCallId);
        const full = event.result ? this.payloadText(event.result.content) : "";
        this.toolOutputs.set(event.toolCallId, full);
        const status: ToolCallStatus = event.isError ? "error" : "success";
        this.toolStatuses.set(event.toolCallId, status);
        if (location) {
          const tail = truncateToTail(full, this.options.tailLines);
          this.emit("toolcall_status", {
            messageId: location.messageId,
            toolCallId: event.toolCallId,
            status,
            output: tail.text,
            outputTruncated: tail.truncated,
          });
        }
        break;
      }
      case "agent_settled": {
        const aborted = event.aborted === true || this.pendingAbort;
        this.pendingAbort = false;
        this.streamingMessage = null;
        this.streamingBlocks = new Map();
        this.crashStreak = 0; // 正常跑完一轮，清零崩溃连击
        // §10.12 D2 残留清理（确定性事件点，零时间阈值）：未消费且 queuedText 仍在队列 → 保留
        // （abort 后队列保留、后续 prompt 继续投递，rpc-commands.md L126）；否则终结出账（保留单条乐观展示）
        this.settlePendingEchoes();
        // 运行状态口径（v0.2.2 口径 A）：settled 后必须回 idle；
        // “已中止”为消息级标记（message.aborted），aborted 仅为瞬态状态事件。
        if (aborted) {
          this.setRunState("aborted");
        }
        this.setRunState("idle");
        if (this.sessionFile === null) {
          // #D-02：全新会话首轮落盘后 get_state 才有文件路径——settled 补学使 watcher 进入跟踪；
          // 此时已回 idle，track→markSynced 只吸收本端已落盘内容，不会吞掉真实外部修改
          await this.refreshState();
        }
        break;
      }
      case "entry_appended":
        // 本插件 pi 子进程条目落盘的精确信号（#D-01）：即时同步基线，
        // 使轮询不会把 turn_start 边界的 user 条目写入误判为外部修改
        this.watcher.markSynced();
        break;
      case "queue_update": {
        // §10.12 D2：队列快照（steering/followUp 完整当前队列），diff 绑定新增文本为 queuedText
        const prev = this.lastQueueSnapshot;
        this.lastQueueSnapshot = {
          steering: Array.isArray(event.steering) ? [...event.steering] : [],
          followUp: Array.isArray(event.followUp) ? [...event.followUp] : [],
        };
        this.bindQueuedTexts(prev);
        break;
      }
      case "session_info_changed":
        this.sessionName = event.name ?? "";
        this.emit("session_name", { name: this.sessionName });
        this.emitModelInfo();
        break;
      case "thinking_level_changed":
        this.thinkingLevel = event.level;
        this.emitModelInfo();
        break;
      case "auto_retry_start":
        this.emit("toast", { text: `模型繁忙，自动重试（${event.attempt}/${event.maxAttempts}）…` });
        break;
      case "auto_retry_end":
        if (!event.success) {
          this.emit("error", { message: `自动重试失败：${event.finalError ?? "未知错误"}`, hint: "请稍后重试或检查 provider 状态。" });
        }
        break;
      case "compaction_start":
        this.emit("toast", { text: "上下文压缩中…" });
        break;
      case "compaction_end":
        this.emit("toast", { text: event.aborted ? "上下文压缩已中止" : "上下文压缩完成" });
        break;
      case "extension_error":
        this.handleExtensionError(event);
        break;
      default: {
        // 未知/未处理事件：记录协议异常供排障（FR-CMD-02）
        const type = (event as { type: string }).type;
        if (type === "bash_execution_update") {
          this.options.logger.debug(`RPC 事件：${type}`);
        } else {
          this.options.logger.debug(`未处理 RPC 事件：${type}`);
        }
      }
    }
  }

  /**
   * #D-03（Issue #2，FR-CHAT-07 展示通道口径 / 需求基线澄清 #14）：上游 pi 扩展系统错误为
   * 非阻断通知——toast 一次性提示（60s 同键去重）+ Output 日志全字段；
   * 不进聊天区错误卡片（那是需用户行动的错误），也不输出指向本机目录的误导 hint。
   */
  private handleExtensionError(event: { extensionPath?: string; event?: string; error?: string }): void {
    const extensionPath = event.extensionPath ?? "";
    const errorText = event.error ?? "";
    // 日志全字段（不截断、不去重；经 logger 统一脱敏入 Output「Sdysyhj」，FR-CMD-02/NFR-05）
    this.options.logger.warn(
      `extension_error 事件：extensionPath=${extensionPath || "(无)"} event=${event.event ?? "(无)"} error=${errorText || "(无)"}`
    );
    const key = `${extensionPath}\u0000${errorText}`;
    const now = Date.now();
    for (const [k, at] of this.extensionErrorToastAt) {
      if (now - at >= EXTENSION_ERROR_TOAST_DEDUP_MS) this.extensionErrorToastAt.delete(k); // 清理过期键，防无界增长
    }
    const last = this.extensionErrorToastAt.get(key);
    if (last !== undefined && now - last < EXTENSION_ERROR_TOAST_DEDUP_MS) return; // 窗口内同键：只记日志不再 toast
    this.extensionErrorToastAt.set(key, now);
    this.emit("toast", {
      text: `扩展错误（${extensionPath || "未知扩展"}）：${firstLine(errorText || "未知错误", 120)}（详情见 Output「Sdysyhj」）`,
    });
  }

  private handleMessageUpdate(delta: import("./protocol").AssistantMessageEvent): void {
    const message = this.streamingMessage;
    if (!message) return;
    const index = delta.contentIndex;
    switch (delta.type) {
      case "text_start": {
        this.ensureBlock(message, index, { type: "text", text: "" });
        break;
      }
      case "text_delta": {
        const block = this.ensureBlock(message, index, { type: "text", text: "" });
        if (block.type === "text") block.text += delta.delta;
        this.emit("text_delta", { messageId: message.id, index, delta: delta.delta });
        break;
      }
      case "thinking_start": {
        this.ensureBlock(message, index, { type: "thinking", text: "" });
        break;
      }
      case "thinking_delta": {
        const block = this.ensureBlock(message, index, { type: "thinking", text: "" });
        if (block.type === "thinking") block.text += delta.delta;
        this.emit("thinking_delta", { messageId: message.id, index, delta: delta.delta });
        break;
      }
      case "toolcall_start": {
        const block = this.ensureBlock(message, index, {
          type: "toolcall",
          id: delta.id,
          tool: delta.toolName,
          args: "",
          summary: "",
          status: "running",
          output: "",
          outputTruncated: false,
        });
        if (block.type === "toolcall") {
          this.toolLocations.set(delta.id, { messageId: message.id });
          this.toolStatuses.set(delta.id, "running");
          this.emit("toolcall_start", {
            messageId: message.id,
            index,
            id: delta.id,
            tool: delta.toolName,
            args: "",
            summary: "",
          });
        }
        break;
      }
      case "toolcall_delta": {
        const block = this.streamingBlocks.get(index);
        if (block && block.type === "toolcall") {
          block.args += delta.delta;
          this.emit("toolcall_delta", { messageId: message.id, index, delta: delta.delta });
        }
        break;
      }
      case "toolcall_end": {
        const block = this.streamingBlocks.get(index);
        const toolCall: ToolCallContent | undefined = delta.toolCall;
        if (block && block.type === "toolcall") {
          const args = toolCall ? JSON.stringify(toolCall.arguments ?? {}) : block.args;
          block.args = args;
          block.summary = summarizeToolArgs(block.tool, toolCall?.arguments ?? {});
          this.emit("toolcall_status", {
            messageId: message.id,
            toolCallId: block.id,
            status: "running",
            summary: block.summary,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private ensureBlock(message: UiMessage, index: number, init: UiBlock): UiBlock {
    let block = this.streamingBlocks.get(index);
    if (!block) {
      block = init;
      this.streamingBlocks.set(index, block);
      message.blocks = [...this.streamingBlocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    }
    return block;
  }

  private handleMessageEnd(message: AgentMessage | undefined): void {
    if (!message) return;
    if (message.role === "toolResult") {
      this.handleToolResult(message);
      return;
    }
    if (message.role === "user") {
      // pi user 回声（json.md L30–46）：匹配账本 → 复用乐观条目 id 就地更新（D1/D2/澄清 #16）
      this.handleUserEcho(message);
      return;
    }
    const ui = this.buildUiMessage(message);
    if (!ui) return;
    if (message.role === "assistant") {
      const streaming = this.streamingMessage;
      if (streaming) {
        ui.id = streaming.id;
      }
      this.streamingMessage = null;
      this.streamingBlocks = new Map();
      if (message.stopReason === "aborted") ui.aborted = true;
      if (message.stopReason === "error") {
        ui.errorMessage = message.errorMessage ?? "模型返回错误";
        this.emit("error", {
          message: `模型返回错误：${ui.errorMessage}`,
          hint: "请检查 provider 配置与额度（`pi auth` / `pi config`），或更换模型后重试。",
        });
      }
    }
    this.upsertUiMessage(ui);
    this.emit("message_final", { messageId: ui.id, message: ui });
    if (message.role === "assistant") {
      this.watcher.markSynced();
    }
  }

  // ---------- 待回声账本（§10.12 D2/D3，FR-CHAT-11） ----------

  /** 入账：一次用户发送（prompt/steer/followUp）即建立回声关联候选。 */
  private openPendingEcho(channel: PendingEchoChannel, sentText: string): PendingUserEcho {
    const entry: PendingUserEcho = {
      seq: ++this.pendingEchoSeq,
      id: `u${++this.messageIdSeq}`,
      channel,
      sentText,
      sentAt: Date.now(),
      runHead: false,
    };
    this.pendingUserEchoes.push(entry);
    return entry;
  }

  /** 出账：已消费回声 / 拒绝 / handled / settled 终结——不再参与后续匹配。 */
  private closePendingEcho(entry: PendingUserEcho): void {
    const index = this.pendingUserEchoes.indexOf(entry);
    if (index >= 0) this.pendingUserEchoes.splice(index, 1);
  }

  /**
   * 回声消账匹配（D2）：① 精确匹配（sentText/queuedText === 回声文本；run-head 优先 → 全局发送序）；
   * ② 确定性兑底（快照未覆盖的发送后变换）：唯一未消费条目 → 绑定；全部同通道 → 通道内 FIFO；
   * ③ 多通道不可判定 → null（不重绑不追加，保留原文待权威重建）。
   */
  private matchPendingEcho(text: string): PendingUserEcho | null {
    const pending = this.pendingUserEchoes;
    if (pending.length === 0) return null;
    const exact = pending
      .filter((e) => e.sentText === text || e.queuedText === text)
      .sort((a, b) => (Number(b.runHead) - Number(a.runHead)) || a.seq - b.seq);
    if (exact.length > 0) return exact[0];
    if (pending.length === 1) return pending[0];
    const channels = new Set(pending.map((e) => e.channel));
    if (channels.size === 1) return [...pending].sort((a, b) => a.seq - b.seq)[0];
    return null;
  }

  /** user 回声终稿：匹配则复用乐观条目 id 合并更新（D5 绝不 push 第二条）并 message_final 就地 finalize（D6）。 */
  private handleUserEcho(message: UserMessage): void {
    const text = this.userContentToText(message.content);
    const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now();
    const match = this.matchPendingEcho(text);
    if (match) {
      this.closePendingEcho(match);
      const ui: UiMessage = { id: match.id, role: "user", blocks: [{ type: "text", text }], timestamp };
      this.upsertUiMessage(ui);
      this.emit("message_final", { messageId: ui.id, message: ui });
      return;
    }
    if (this.pendingUserEchoes.length === 0) {
      // 账本空：本端从未发送的 user 消息（扩展 custom_message 等，extensions.md L752–770）
      // → 宿主新 id 建条目（D4 合法追加场景①）
      const ui: UiMessage = { id: `u${++this.messageIdSeq}`, role: "user", blocks: [{ type: "text", text }], timestamp };
      this.upsertUiMessage(ui);
      this.emit("message_final", { messageId: ui.id, message: ui });
      return;
    }
    // 多通道不可判定（D2.2 兑底）：不重绑、不追加；保留乐观条目原文，待权威重建收敛（宁保留不错换）
    this.options.logger.warn(
      `user 回声无法唯一关联（文本不匹配且未消费条目跨通道），保留乐观条目待权威重建：${firstLine(text, 80)}`
    );
  }

  /** queue_update 快照 diff：新增队列文本绑定为候选条目的 queuedText（多条按序对应；同文本重复按出现次序一一对应）。 */
  private bindQueuedTexts(prev: { steering: string[]; followUp: string[] } | null): void {
    const current = this.lastQueueSnapshot;
    if (!current) return;
    const queues: Array<["steering" | "followUp", PendingEchoChannel[]]> = [
      ["steering", ["steer", "prompt"]],
      ["followUp", ["followUp", "prompt"]],
    ];
    for (const [queue, channels] of queues) {
      const added = addedTexts(prev ? prev[queue] : [], current[queue]);
      if (added.length === 0) continue;
      // 候选 = 该队列通道的未绑定条目；prompt 通道仅 disposition:"queued"（非 run-head）
      // 的条目可入候选——run-head prompt（started）已进入运行流，不在任何队列，不得被快照 diff 绑定
      const candidates = (): PendingUserEcho[] =>
        this.pendingUserEchoes
          .filter((e) => channels.includes(e.channel) && (e.channel !== "prompt" || !e.runHead) && e.queuedText === undefined)
          .sort((a, b) => a.seq - b.seq);
      // ① 优先精确：队列文本 === 发送原文
      for (const text of added) {
        const hit = candidates().find((e) => e.sentText === text);
        if (hit) hit.queuedText = text;
      }
      // ② 变换文本（skill/template 入队前展开）：剩余新增按序对应剩余候选（发送序）
      const bound = new Set(this.pendingUserEchoes.filter((e) => e.queuedText !== undefined).map((e) => e.queuedText));
      const rest = added.filter((t) => !bound.has(t));
      const remaining = candidates();
      rest.forEach((text, i) => {
        if (remaining[i]) remaining[i].queuedText = text;
      });
    }
  }

  /** agent_settled 残留清理（D2）：仍入队 → 保留；已不在队列且从未回声 → 终结出账。 */
  private settlePendingEchoes(): void {
    this.pendingUserEchoes = this.pendingUserEchoes.filter((e) => this.entryStillQueued(e));
  }

  private entryStillQueued(entry: PendingUserEcho): boolean {
    const snapshot = this.lastQueueSnapshot;
    return (
      snapshot !== null &&
      entry.queuedText !== undefined &&
      (snapshot.steering.includes(entry.queuedText) || snapshot.followUp.includes(entry.queuedText))
    );
  }

  private handleToolResult(message: ToolResultMessage): void {
    const full = this.payloadText(message.content);
    this.toolOutputs.set(message.toolCallId, full);
    const status: ToolCallStatus = message.isError ? "error" : "success";
    this.toolStatuses.set(message.toolCallId, status);
    const location = this.toolLocations.get(message.toolCallId);
    if (location) {
      const tail = truncateToTail(full, this.options.tailLines);
      // 同步权威快照中的卡片
      const ui = this.uiMessages.find((m) => m.id === location.messageId);
      const block = ui?.blocks.find((b) => b.type === "toolcall" && b.id === message.toolCallId);
      if (block && block.type === "toolcall") {
        block.status = status;
        block.output = tail.text;
        block.outputTruncated = tail.truncated;
      }
      this.emit("toolcall_status", {
        messageId: location.messageId,
        toolCallId: message.toolCallId,
        status,
        output: tail.text,
        outputTruncated: tail.truncated,
      });
    }
  }

  private upsertUiMessage(ui: UiMessage): void {
    for (const block of ui.blocks) {
      if (block.type === "toolcall") {
        this.toolLocations.set(block.id, { messageId: ui.id });
      }
    }
    const index = this.uiMessages.findIndex((m) => m.id === ui.id);
    if (index >= 0) this.uiMessages[index] = ui;
    else this.uiMessages.push(ui);
  }

  private pushUserMessage(id: string, text: string): void {
    const ui: UiMessage = {
      id,
      role: "user",
      blocks: [{ type: "text", text }],
      timestamp: Date.now(),
    };
    this.uiMessages.push(ui);
  }

  private buildUiMessage(message: AgentMessage): UiMessage | null {
    const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now();
    if (message.role === "user") {
      const text = this.userContentToText(message.content);
      return { id: `u${++this.messageIdSeq}`, role: "user", blocks: [{ type: "text", text }], timestamp };
    }
    if (message.role === "assistant") {
      const blocks: UiBlock[] = [];
      for (const item of message.content ?? []) {
        if (item.type === "text") {
          blocks.push({ type: "text", text: item.text });
        } else if (item.type === "thinking") {
          blocks.push({ type: "thinking", text: item.thinking });
        } else if (item.type === "toolCall") {
          const args = JSON.stringify(item.arguments ?? {});
          const status = this.toolStatuses.get(item.id) ?? "running";
          const fullOutput = this.toolOutputs.get(item.id) ?? "";
          const tail = truncateToTail(fullOutput, this.options.tailLines);
          const block: UiBlock = {
            type: "toolcall",
            id: item.id,
            tool: item.name,
            args,
            summary: summarizeToolArgs(item.name, item.arguments ?? {}),
            status,
            output: tail.text,
            outputTruncated: tail.truncated,
          };
          blocks.push(block);
        }
      }
      const ui: UiMessage = {
        id: `a${++this.messageIdSeq}`,
        role: "assistant",
        blocks,
        timestamp,
      };
      if (message.stopReason === "aborted") ui.aborted = true;
      return ui;
    }
    return null;
  }

  private userContentToText(content: UserMessage["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => (block.type === "text" ? block.text : `[图片:${block.mimeType}]`))
        .join("\n");
    }
    return "";
  }

  private payloadText(content: Array<{ type: string; text?: string }> | undefined): string {
    if (!content) return "";
    return content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
  }
}

// RpcClient 等价封装：spawn `… --mode rpc` 子进程，stdin 写命令（JSONL），stdout 收 response + 事件流。
// 帧解析严格 LF 切分（见 jsonl.ts）；请求带 id 关联，超时可取消；关闭 stdin 即有序退出。
//
// 说明：官方 @earendil-works/pi-coding-agent npm 包 exports 未导出 RpcClient 子路径
// （deep import 会触发 ERR_PACKAGE_PATH_NOT_EXPORTED），故按任务约定自实现等价封装；
// 线协议与官方 rpc.md 保持一致，集成测试用 mock 子进程全链路验证。

import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "child_process";
import { JsonlLineReader } from "./jsonl";
import {
  isRpcResponse,
  parseRecord,
  type AgentMessage,
  type ModelInfo,
  type RpcCommandBase,
  type RpcEvent,
  type RpcResponse,
  type RpcSessionState,
  type RpcSlashCommand,
} from "./protocol";

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
) => ChildProcessWithoutNullStreams;

export interface RpcClientOptions {
  /** 可执行文件（PATH 中的 pi，或 node） */
  command: string;
  /** 参数（bundled 运行时为 [cliPath, "--mode", "rpc", …]） */
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** 依赖注入：测试可替换 spawn */
  spawnFn?: SpawnFn;
  /** 普通请求超时（毫秒） */
  requestTimeoutMs?: number;
}

export interface RpcExitInfo {
  code: number | null;
  stderr: string;
  /** 是否由本端主动停止 */
  intentional: boolean;
}

export interface PromptAcceptance {
  ok: boolean;
  /** started | queued | handled（handled 表示被扩展命令消费，不等 agent_settled） */
  disposition?: string;
  error?: string;
}

export interface QueueAcceptance {
  ok: boolean;
  disposition?: string;
  error?: string;
}

interface PendingRequest {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
}

export type RpcEventListener = (event: RpcEvent) => void;

export class RpcClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Set<RpcEventListener>();
  private exitListeners = new Set<(info: RpcExitInfo) => void>();
  private anomalyListeners = new Set<(detail: string) => void>();
  private stderrListeners = new Set<(line: string) => void>();
  private stderrLineBuffer = "";
  private stderrChunks: string[] = [];
  private requestId = 0;
  private exited = false;
  private stopping = false;
  private exitInfo: RpcExitInfo | null = null;

  constructor(private readonly options: RpcClientOptions) {}

  /** 启动子进程。spawn 失败（如路径无效）抛出可行动错误。 */
  async start(): Promise<void> {
    if (this.child) return;
    const spawnFn = this.options.spawnFn ?? (nodeSpawn as unknown as SpawnFn);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnFn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: this.options.env ?? process.env,
      });
    } catch (err) {
      throw new Error(`无法启动 pi 子进程（${this.options.command}）：${err instanceof Error ? err.message : String(err)}`);
    }
    this.child = child;
    this.exited = false;
    this.exitInfo = null;

    const reader = new JsonlLineReader((line) => this.handleLine(line));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string | Buffer) => reader.push(chunk));
    child.stdout.on("end", () => reader.end());
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.acceptStderrChunk(chunk));
    child.on("error", (err) => {
      this.finishExit(null, `进程错误：${err.message}`);
    });
    child.on("exit", (code) => {
      // close 在 stdio 冲刷完后触发，可拿到完整 stderr；200ms 兤底防止管道悬挂
      const timer = setTimeout(() => this.finishExit(code, undefined), 200);
      child.once("close", () => {
        clearTimeout(timer);
        this.finishExit(code, undefined);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => resolve();
      const onError = (err: Error) => reject(new Error(`pi 子进程启动失败（${this.options.command}）：${err.message}`));
      child.once("spawn", onSpawn);
      child.once("error", onError);
      // 已经退出/无 spawn 事件时兜底
      setTimeout(() => {
        if (!this.exited && this.child === child) resolve();
      }, 50);
    });
  }

  getStderr(): string {
    return this.stderrChunks.join("");
  }

  onEvent(listener: RpcEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onExit(listener: (info: RpcExitInfo) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  onAnomaly(listener: (detail: string) => void): () => void {
    this.anomalyListeners.add(listener);
    return () => this.anomalyListeners.delete(listener);
  }

  /** 订阅子进程 stderr（按行，原文转发，供 Output Channel 排障，FR-CMD-02）。 */
  onStderr(listener: (line: string) => void): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  get isRunning(): boolean {
    return this.child !== null && !this.exited;
  }

  // ---------- 命令 ----------

  async prompt(message: string, streamingBehavior?: "steer" | "followUp"): Promise<PromptAcceptance> {
    const cmd: RpcCommandBase = { type: "prompt", message };
    if (streamingBehavior) cmd.streamingBehavior = streamingBehavior;
    const res = await this.request(cmd, 60_000);
    if (!res.success) return { ok: false, error: res.error };
    const data = res.data as { disposition?: string } | undefined;
    return { ok: true, disposition: data?.disposition };
  }

  async steer(message: string): Promise<QueueAcceptance> {
    const res = await this.request({ type: "steer", message }, 30_000);
    if (!res.success) return { ok: false, error: res.error };
    const data = res.data as { disposition?: string } | undefined;
    return { ok: true, disposition: data?.disposition };
  }

  async followUp(message: string): Promise<QueueAcceptance> {
    const res = await this.request({ type: "follow_up", message }, 30_000);
    if (!res.success) return { ok: false, error: res.error };
    const data = res.data as { disposition?: string } | undefined;
    return { ok: true, disposition: data?.disposition };
  }

  async abort(): Promise<void> {
    await this.request({ type: "abort" }, 10_000);
  }

  async newSession(): Promise<{ cancelled: boolean }> {
    const res = await this.request({ type: "new_session" }, 30_000);
    const data = res.data as { cancelled?: boolean } | undefined;
    return { cancelled: data?.cancelled === true };
  }

  async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
    const res = await this.request({ type: "switch_session", sessionPath }, 30_000);
    const data = res.data as { cancelled?: boolean } | undefined;
    return { cancelled: data?.cancelled === true };
  }

  async getState(): Promise<RpcSessionState> {
    const res = await this.request({ type: "get_state" }, 15_000);
    return (res.data ?? {}) as RpcSessionState;
  }

  async getMessages(): Promise<AgentMessage[]> {
    const res = await this.request({ type: "get_messages" }, 30_000);
    const data = res.data as { messages?: AgentMessage[] } | undefined;
    return data?.messages ?? [];
  }

  async setModel(provider: string, modelId: string): Promise<ModelInfo> {
    const res = await this.request({ type: "set_model", provider, modelId }, 15_000);
    return (res.data ?? {}) as ModelInfo;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const res = await this.request({ type: "get_available_models" }, 15_000);
    const data = res.data as { models?: ModelInfo[] } | undefined;
    return data?.models ?? [];
  }

  /** FR-CMD-03：命令全集（扩展命令 / prompt 模板 / skills）。 */
  async getCommands(): Promise<RpcSlashCommand[]> {
    const res = await this.request({ type: "get_commands" }, 15_000);
    const data = res.data as { commands?: RpcSlashCommand[] } | undefined;
    return data?.commands ?? [];
  }

  async setThinkingLevel(level: string): Promise<void> {
    await this.request({ type: "set_thinking_level", level }, 15_000);
  }

  async cycleThinkingLevel(): Promise<{ level: string } | null> {
    const res = await this.request({ type: "cycle_thinking_level" }, 15_000);
    return (res.data ?? null) as { level: string } | null;
  }

  async getAvailableThinkingLevels(): Promise<string[]> {
    const res = await this.request({ type: "get_available_thinking_levels" }, 15_000);
    const data = res.data as { levels?: string[] } | undefined;
    return data?.levels ?? [];
  }

  async setSessionName(name: string): Promise<void> {
    await this.request({ type: "set_session_name", name }, 15_000);
  }

  async clearQueue(): Promise<{ steering: string[]; followUp: string[] }> {
    const res = await this.request({ type: "clear_queue" }, 15_000);
    return (res.data ?? { steering: [], followUp: [] }) as { steering: string[]; followUp: string[] };
  }

  /** 发送扩展 UI 子协议响应（MVP 仅透传，避免扩展对话框挂死）。 */
  sendExtensionUiResponse(response: { id: string; value?: unknown; confirmed?: boolean; cancelled?: boolean }): void {
    this.write({ type: "extension_ui_response", ...response });
  }

  // ---------- 内部 ----------

  private write(command: RpcCommandBase): void {
    if (!this.child || this.exited) throw new Error("pi 子进程未运行");
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  private request(command: RpcCommandBase, timeoutMs?: number): Promise<RpcResponse> {
    if (!this.child || this.exited) {
      return Promise.reject(new Error("pi 子进程未运行"));
    }
    const id = `sdysyhj-${++this.requestId}`;
    const record: RpcCommandBase = { ...command, id };
    const effectiveTimeout = this.options.requestTimeoutMs ?? timeoutMs ?? 30_000;
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC 命令超时（${command.type}，${effectiveTimeout}ms）`));
      }, effectiveTimeout);
      this.pending.set(id, { resolve, reject, timer, command: command.type });
      try {
        this.write(record);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleLine(line: string): void {
    const record = parseRecord(line);
    if ("parseError" in record) {
      this.notifyAnomaly(`无法解析的 RPC 输出行：${record.parseError}`);
      return;
    }
    if (isRpcResponse(record)) {
      const id = record.id;
      const pending = id !== undefined ? this.pending.get(id) : undefined;
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id!);
        pending.resolve(record);
      }
      return;
    }
    const event = record as RpcEvent;
    if (event.type === "agent_settled") {
      // 顺序保证（缺陷#2 修复）：stderr 尾部冲刷必须先于对外暴露 agent_settled——
      // settled 事件到达消费方时，本次运行已写入的 stderr 必定已全部进入日志通道。
      // 跨管道交付无内核级顺序保证（stdout/stderr 为两个独立 fd，事件回调顺序不与
      // 子进程写入顺序一致），故经 stderr 排空屏障（让出事件循环，使已就绪的 stderr
      // 先落地日志）后再派发，见 stderrDrainBarrier。
      this.enqueueDispatch(true, () => this.dispatchEvent(event));
    } else {
      this.enqueueDispatch(false, () => this.dispatchEvent(event));
    }
  }

  /** 有序派发队列：普通事件队列空时同步派发；屏障项等待 stderr 排空后再派发；全局保序。 */
  private dispatchQueue: Array<{ barrier: boolean; run: () => void }> = [];
  private draining = false;

  private enqueueDispatch(barrier: boolean, run: () => void): void {
    this.dispatchQueue.push({ barrier, run });
    if (!this.draining) {
      void this.drainDispatchQueue();
    }
  }

  private async drainDispatchQueue(): Promise<void> {
    this.draining = true;
    try {
      while (this.dispatchQueue.length > 0) {
        const item = this.dispatchQueue.shift()!;
        if (item.barrier) {
          await this.stderrDrainBarrier();
        }
        item.run();
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * stderr 排空屏障：让出事件循环，使已入内核/stream 层的 stderr 先于 settled 派发落地。
   * 依据：子进程在程序序上先写 stderr 后写 settled（内核管道缓冲保序），故 settled 被父进程
   * 处理时 stderr 字节必已就绪；libuv 同一 poll 批次内两 fd 回调顺序不定（即本次竞态），
   * 但 poll 阶段及其 nextTick/微任务均先于 check 阶段（setImmediate）完成——
   * 因此两连 setImmediate 让出后，就绪的 stderr 必定已进入日志通道，再派发 settled 即保序。
   */
  private async stderrDrainBarrier(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  /** stderr 原文接收：累积 + 行缓冲转发（FR-CMD-02）。 */
  private acceptStderrChunk(chunk: string): void {
    this.stderrChunks.push(chunk);
    this.stderrLineBuffer += chunk;
    for (;;) {
      const idx = this.stderrLineBuffer.indexOf("\n");
      if (idx === -1) break;
      let line = this.stderrLineBuffer.slice(0, idx);
      this.stderrLineBuffer = this.stderrLineBuffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length > 0) this.notifyStderr(line);
    }
  }

  private dispatchEvent(event: RpcEvent): void {
    for (const listener of [...this.eventListeners]) {
      try {
        listener(event);
      } catch (err) {
        this.notifyAnomaly(`事件监听器异常：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private notifyAnomaly(detail: string): void {
    for (const listener of [...this.anomalyListeners]) {
      try {
        listener(detail);
      } catch {
        // 忽略
      }
    }
  }

  private notifyStderr(line: string): void {
    for (const listener of [...this.stderrListeners]) {
      try {
        listener(line);
      } catch {
        // 忽略
      }
    }
  }

  private finishExit(code: number | null, extraError?: string): void {
    if (this.exited) return;
    this.exited = true;
    // 冲刷未换行的 stderr 尾部
    if (this.stderrLineBuffer.length > 0) {
      const tail = this.stderrLineBuffer;
      this.stderrLineBuffer = "";
      this.notifyStderr(tail);
    }
    const stderr = this.getStderr() + (extraError ? `\n${extraError}` : "");
    this.exitInfo = { code, stderr, intentional: this.stopping };
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`pi 子进程已退出（code=${code}）；stderr：${stderr.trim().slice(0, 2000) || "(空)"}`));
    }
    this.pending.clear();
    for (const listener of [...this.exitListeners]) {
      try {
        listener(this.exitInfo);
      } catch {
        // 忽略
      }
    }
  }

  /** 有序停止：关闭 stdin 等待退出，超时后强制结束。 */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    try {
      child.stdin.end();
    } catch {
      // 忽略
    }
    if (this.exited) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // 忽略
        }
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.child = null;
  }
}

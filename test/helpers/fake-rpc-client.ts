// 单测用 FakeRpcClient：实现 PiRpcClient 接口，脚本化响应 + 手动事件注入。

import type { PiRpcClient, PromptAcceptance, QueueAcceptance } from "../../src/bridge/piBridge";
import type { AgentMessage, ModelInfo, RpcEvent, RpcSessionState } from "../../src/bridge/protocol";

export class FakeRpcClient implements PiRpcClient {
  isRunning = true;
  started = false;
  stopped = false;
  startCount = 0;

  /** 记录的调用 */
  prompts: Array<{ message: string; behavior?: "steer" | "followUp" }> = [];
  steers: string[] = [];
  followUps: string[] = [];
  aborts = 0;
  newSessions = 0;
  switchSessions: string[] = [];
  setModels: Array<{ provider: string; modelId: string }> = [];
  setThinkingLevels: string[] = [];
  cycleThinkingCalls = 0;
  setSessionNames: string[] = [];

  /** 可配置响应 */
  promptResult: PromptAcceptance = { ok: true, disposition: "started" };
  promptDelayMs = 0;
  state: RpcSessionState = {
    model: { id: "mock-alpha", provider: "mock", name: "Mock Alpha", reasoning: true },
    thinkingLevel: "high",
    isStreaming: false,
    sessionFile: "/tmp/fake-session.jsonl",
    sessionId: "fake-session",
    sessionName: "mock-session",
    messageCount: 0,
    pendingMessageCount: 0,
  };
  messages: AgentMessage[] = [];
  availableModels: ModelInfo[] = [
    { id: "mock-alpha", provider: "mock" },
    { id: "mock-beta", provider: "mock" },
  ];
  availableThinkingLevels = ["off", "low", "medium", "high"];

  private eventListeners = new Set<(event: RpcEvent) => void>();
  private exitListeners = new Set<(info: { code: number | null; stderr: string; intentional: boolean }) => void>();

  async start(): Promise<void> {
    this.started = true;
    this.startCount += 1;
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.isRunning = false;
  }

  onEvent(listener: (event: RpcEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onExit(listener: (info: { code: number | null; stderr: string; intentional: boolean }) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  /** 注入事件（模拟子进程事件流）。 */
  emit(event: RpcEvent): void {
    for (const listener of [...this.eventListeners]) listener(event);
  }

  /** 模拟子进程异常退出。 */
  crash(code = 3, stderr = "fake crash"): void {
    this.isRunning = false;
    for (const listener of [...this.exitListeners]) listener({ code, stderr, intentional: false });
  }

  async prompt(message: string, behavior?: "steer" | "followUp"): Promise<PromptAcceptance> {
    this.prompts.push({ message, behavior });
    if (this.promptDelayMs > 0) await new Promise((r) => setTimeout(r, this.promptDelayMs));
    return this.promptResult;
  }

  async steer(message: string): Promise<QueueAcceptance> {
    this.steers.push(message);
    return { ok: true, disposition: "queued" };
  }

  async followUp(message: string): Promise<QueueAcceptance> {
    this.followUps.push(message);
    return { ok: true, disposition: "queued" };
  }

  async abort(): Promise<void> {
    this.aborts += 1;
  }

  async newSession(): Promise<{ cancelled: boolean }> {
    this.newSessions += 1;
    this.messages = [];
    return { cancelled: false };
  }

  async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
    this.switchSessions.push(sessionPath);
    return { cancelled: false };
  }

  async getState(): Promise<RpcSessionState> {
    return this.state;
  }

  async getMessages(): Promise<AgentMessage[]> {
    return this.messages;
  }

  async setModel(provider: string, modelId: string): Promise<ModelInfo> {
    this.setModels.push({ provider, modelId });
    this.state.model = { id: modelId, provider };
    return this.state.model;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return this.availableModels;
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.setThinkingLevels.push(level);
    this.state.thinkingLevel = level;
  }

  async cycleThinkingLevel(): Promise<{ level: string } | null> {
    this.cycleThinkingCalls += 1;
    return { level: "medium" };
  }

  async getAvailableThinkingLevels(): Promise<string[]> {
    return this.availableThinkingLevels;
  }

  async setSessionName(name: string): Promise<void> {
    this.setSessionNames.push(name);
    this.state.sessionName = name;
  }
}

/** 等待条件成立（轮询），超时抛错。 */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

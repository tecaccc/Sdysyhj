// 核验 Agent 独立 jsdom harness（自建——不复用交付 test/helpers/*；断言器自建）。
// 链路：自建 replay 子进程（协议语义依 pi rpc.md/json.md 转印）→ 产品 RpcClient → PiBridge
// → ChatController → postMessage 通道 → 产品 EventBuffer/UiStore → 真实 AssistantRuntimeProvider
// + useExternalStoreRuntime + 组件 → DOM 断言（自建断言函数）。

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "/tmp/verify-s234/src/bridge/piBridge";
import { RpcClient } from "/tmp/verify-s234/src/bridge/rpcClient";
import type { ResolvedRuntime } from "/tmp/verify-s234/src/bridge/rpcTransport";
import { ChatController } from "/tmp/verify-s234/src/ui/chatController";
import type { HostActions, StartupError } from "/tmp/verify-s234/src/panel/hostActions";
import type { HostToWebview, UiMessage, WebviewToHost } from "/tmp/verify-s234/src/panel/messages";
import { DEFAULT_CONFIG, type SdysyhjConfig } from "/tmp/verify-s234/src/util/config";
import { MemoryLogger } from "/tmp/verify-s234/src/util/log";
import { attachHostEventPump } from "/tmp/verify-s234/webview/ui/shell";
import { EventBuffer, UiStore } from "/tmp/verify-s234/webview/ui/store";

// jsdom 缺失的浏览器观察器（@assistant-ui 运行时需要；无布局语义，断言面不在布局）
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.ResizeObserver === "undefined") {
  g.ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} };
}
if (typeof g.IntersectionObserver === "undefined") {
  g.IntersectionObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} takeRecords(): [] { return []; } };
}
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// ---------- 自建断言器 ----------
export class Verdicts {
  lines: string[] = [];
  ck(tc: string, name: string, cond: boolean, detail = ""): void {
    this.lines.push(`[${cond ? "PASS" : "FAIL"}][${tc}] ${name}${detail ? " — " + detail : ""}`);
  }
  note(tc: string, name: string, detail = ""): void {
    this.lines.push(`[NOTE][${tc}] ${name}${detail ? " — " + detail : ""}`);
  }
  dump(): string {
    return this.lines.join("\n") + "\n";
  }
  fails(): string[] {
    return this.lines.filter((l) => l.startsWith("[FAIL]"));
  }
}

export async function waitFor(pred: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (pred()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------- 自建回放 CLI（协议语义：启动回放前置 out；每条 stdin 命令与录制 in 游标匹配后回放其后 out） ----------
export const REPLAY_CLI = "/tmp/v10/replay-pi.mjs";

// ---------- fixture 构造（json.md「Event sequence」L30–46 形状转印） ----------
export type Rec = { dir: "in" | "out"; record: Record<string, unknown> };
export const inRec = (type: string, extra: Record<string, unknown> = {}): Rec => ({ dir: "in", record: { type, ...extra } });
export const outRec = (record: Record<string, unknown>): Rec => ({ dir: "out", record });
export const resp = (command: string, data: Record<string, unknown>, id = "sdysyhj-x"): Rec =>
  outRec({ id, type: "response", command, success: true, data });

export function writeFixture(name: string, records: Rec[]): string {
  const dir = "/tmp/v10/fixtures";
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name + ".jsonl");
  fs.writeFileSync(p, "# 核验 Agent 自建场景 fixture（事件形状对照 pi json.md「Event sequence」L30–46 转印）\n" +
    records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return p;
}

export const USAGE0 = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
export function usage(totalTokens: number): Record<string, unknown> {
  return { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

/** 会话状态响应（golden 形状转印，数值自定）。 */
export function getStateData(sessionFile: string, modelId = "mock-small", ctxWindow = 200000): Record<string, unknown> {
  return {
    model: {
      id: modelId, name: modelId, api: "openai-completions", provider: "mock", baseUrl: "http://127.0.0.1:0/v1",
      reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: ctxWindow, maxTokens: 16384,
    },
    thinkingLevel: "off", isStreaming: false, isCompacting: false, steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time", sessionFile, sessionId: "S1", autoCompactionEnabled: true,
    messageCount: 0, pendingMessageCount: 0,
  };
}

/** 一轮标准运行（user 回声 + assistant 流式 + settled）。 */
export function runRecords(opts: {
  prompt: string;
  echoText?: string;
  assistantContent?: unknown[];
  assistantDeltas?: string[];
  thinkingDeltas?: string[];
  emptyTextBlock?: boolean;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; resultOutput?: string; isError?: boolean; late?: boolean }>;
  stopReason?: string;
  errorMessage?: string;
  aborted?: boolean;
  skipSettled?: boolean;
  usageTotal?: number;
  /** prompt 受理后、回声前的同步暂停（ms）——供「发送即时」时点采样（自建 mock 节奏，确定性） */
  paceMs?: number;
  /** delta 间同步暂停（ms）——供 delta 级增量渲染采样（自建 mock 节奏） */
  paceDeltasMs?: number;
}): Rec[] {
  const {
    prompt, echoText, assistantContent, assistantDeltas = [], thinkingDeltas = [], emptyTextBlock = false,
    toolCalls = [], stopReason = "stop", errorMessage, aborted = false, skipSettled = false, usageTotal = 5, paceMs = 0, paceDeltasMs = 0,
  } = opts;
  const echo = echoText ?? prompt;
  const out: Rec[] = [
    inRec("prompt", { message: prompt }),
    resp("prompt", { disposition: "started" }),
    ...(paceMs > 0 ? [outRec({ type: "__sleep", ms: paceMs })] : []),
    outRec({ type: "agent_start" }),
    outRec({ type: "turn_start" }),
    outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: echo }], timestamp: 0 } }),
    outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: echo }], timestamp: 0 } }),
    outRec({ type: "message_start", message: { role: "assistant", content: [], api: "openai-completions", provider: "mock", model: "mock-small", usage: usage(usageTotal), stopReason: "pending", timestamp: 0 } }),
  ];
  let idx = 0;
  for (const t of thinkingDeltas) {
    if (t === thinkingDeltas[0]) out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "thinking_start", contentIndex: idx } }));
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "thinking_delta", contentIndex: idx, delta: t } }));
  }
  if (thinkingDeltas.length) { idx += 1; out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "thinking_end", contentIndex: idx - 1, thinking: thinkingDeltas.join("") } })); }
  for (const tc of toolCalls) {
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "toolcall_start", contentIndex: idx, id: tc.id, toolName: tc.name } }));
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "toolcall_delta", contentIndex: idx, delta: JSON.stringify(tc.args) } }));
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "toolcall_end", contentIndex: idx, toolCall: { id: tc.id, name: tc.name, arguments: tc.args } } }));
    out.push(outRec({ type: "tool_execution_start", toolCallId: tc.id, toolName: tc.name, args: tc.args }));
    if (!tc.late) {
      out.push(outRec({ type: "tool_execution_end", toolCallId: tc.id, toolName: tc.name, isError: !!tc.isError, result: { content: [{ type: "text", text: tc.resultOutput ?? "ok" }] } }));
    }
    idx += 1;
  }
  if (emptyTextBlock) {
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "text_start", contentIndex: idx } }));
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "text_end", contentIndex: idx, content: "" } }));
    idx += 1;
  }
  const deltas = assistantDeltas.length ? assistantDeltas : (assistantContent ? [] : []);
  if (deltas.length) {
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "text_start", contentIndex: idx } }));
    for (const d of deltas) {
      if (paceDeltasMs > 0) out.push(outRec({ type: "__sleep", ms: paceDeltasMs }));
      out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "text_delta", contentIndex: idx, delta: d } }));
    }
    out.push(outRec({ type: "message_update", usage: usage(usageTotal), assistantMessageEvent: { type: "text_end", contentIndex: idx, content: deltas.join("") } }));
    idx += 1;
  }
  // 迟到工具结果（#D-04：晚于 message_end——先出权威终稿再出工具结果）
  const content = assistantContent ?? [
    ...(thinkingDeltas.length ? [{ type: "thinking", thinking: thinkingDeltas.join("") }] : []),
    ...toolCalls.map((tc) => ({ type: "toolCall", id: tc.id, name: tc.name, arguments: tc.args })),
    ...(emptyTextBlock ? [{ type: "text", text: "" }] : []),
    ...(deltas.length ? [{ type: "text", text: deltas.join("") }] : []),
  ];
  const aMsg: Record<string, unknown> = {
    role: "assistant", content, api: "openai-completions", provider: "mock", model: "mock-small",
    usage: usage(usageTotal), stopReason: errorMessage ? "error" : aborted ? "aborted" : stopReason, timestamp: 0,
  };
  if (errorMessage) aMsg.errorMessage = errorMessage;
  out.push(outRec({ type: "message_end", message: aMsg }));
  for (const tc of toolCalls.filter((t) => t.late)) {
    out.push(outRec({ type: "tool_execution_end", toolCallId: tc.id, toolName: tc.name, isError: !!tc.isError, result: { content: [{ type: "text", text: tc.resultOutput ?? "ok" }] } }));
  }
  out.push(outRec({ type: "turn_end", message: aMsg, toolResults: [] }));
  out.push(outRec({ type: "agent_end", messages: [aMsg], willRetry: false }));
  if (!skipSettled) out.push(outRec({ type: "agent_settled", aborted }));
  return out;
}

/** 场景公共头：get_state + get_messages（空历史）。 */
export function prelude(sessionFile: string, messages: unknown[] = [], modelId = "mock-small", ctxWindow = 200000): Rec[] {
  return [
    inRec("get_state"), resp("get_state", getStateData(sessionFile, modelId, ctxWindow)),
    inRec("get_messages"), resp("get_messages", { messages }),
  ];
}

// ---------- 自建链路 harness ----------
export interface Chain {
  bridge: PiBridge;
  controller: ChatController;
  store: UiStore;
  posted: HostToWebview[];
  sent: WebviewToHost[];
  actionLog: string[];
  logger: MemoryLogger;
  events: BridgeEvent[];
  send: (m: WebviewToHost) => void;
  dispose: () => Promise<void>;
}

export function makeChain(opts: { fixture: string; cwd: string; tailLines?: number }): Chain {
  const events: BridgeEvent[] = [];
  const logger = new MemoryLogger();
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [REPLAY_CLI], detail: "verify-agent replay cli" };
  const bridge = new PiBridge({
    cwd: opts.cwd,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({ command, args, cwd, env: { ...process.env, VERIFY_REPLAY_FIXTURE: opts.fixture } }) as unknown as PiRpcClient,
    logger,
    tailLines: opts.tailLines ?? 200,
    sendMode: "steer",
  });
  bridge.onAny((e) => events.push(e));

  const store = new UiStore();
  // 合批调度：setTimeout 0（jsdom 无 rAF；合批语义为产品 EventBuffer 自身）
  const buffer = new EventBuffer(store, (cb: () => void) => setTimeout(cb, 0));
  const detach = attachHostEventPump(window, buffer);

  const posted: HostToWebview[] = [];
  const webview = {
    postMessage: (m: unknown): unknown => {
      posted.push(structuredClone(m) as HostToWebview);
      window.dispatchEvent(new MessageEvent("message", { data: structuredClone(m) }));
      return true;
    },
  };

  const sent: WebviewToHost[] = [];
  const actionLog: string[] = [];
  // 自建动作层桩：vscode 交互动作记名；showHistory/showFilePicker 模拟用户选择后走真实桥方法/通道
  const actions: HostActions = {
    showHistory: async () => { actionLog.push("showHistory"); await bridge.switchSession("/tmp/v10/fixtures/session-b.jsonl"); },
    showModelPicker: async () => void actionLog.push("showModelPicker"),
    showThinkingPicker: async () => void actionLog.push("showThinkingPicker"),
    showRenameInput: async () => void actionLog.push("showRenameInput"),
    showFilePicker: async () => { actionLog.push("showFilePicker"); webview.postMessage({ kind: "file_ref", path: "src/picked.ts" }); },
    sendToPi: () => void actionLog.push("sendToPi"),
    copyOutput: async (toolCallId: string) => { actionLog.push(`copy_output:${toolCallId}`); },
    guard: async (fn: () => Promise<void> | void, label: string) => {
      try { await fn(); } catch (err) { webview.postMessage({ kind: "error", message: `${label}：${err instanceof Error ? err.message : String(err)}` }); }
    },
    openSettings: () => void actionLog.push("openSettings"),
    openExternal: () => void actionLog.push("openExternal"),
    relativePath: (p: string) => p,
  };

  const controller = new ChatController(bridge, webview, logger, actions, {
    getConfig: (): SdysyhjConfig => ({ ...DEFAULT_CONFIG, outputTailLines: opts.tailLines ?? 200, sendMode: "steer" }),
    cwd: opts.cwd,
    noWorkspace: false,
    getStartupError: (): StartupError | null => null,
  });

  const send = (m: WebviewToHost): void => { sent.push(m); void controller.handleMessage(m); };

  return {
    bridge, controller, store, posted, sent, actionLog, logger, events, send,
    dispose: async () => { detach(); controller.dispose(); await bridge.dispose(); },
  };
}

// ---------- DOM 工具 ----------
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  desc!.set!.call(el, text);
  try { el.setSelectionRange(text.length, text.length); } catch { /* noop */ }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
export function click(el: Element): void {
  // 完整鼠标序列（产品含 onMouseDown 处理点——仅派发 click 不触发）
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
export function keyDown(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

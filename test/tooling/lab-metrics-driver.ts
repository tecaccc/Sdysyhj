// lab-metrics-driver.ts — 度量驱动（TASK-009 §10.13 D7②，由 test/tooling/lab-metrics.mjs
// 经 esbuild 打包为 ESM 后以 node 运行）。无人值守、离线（FAKE_PI_REPLAY golden 回放）、
// 自终止 + 全局有界超时。输出 JSON 到 stdout。
// 时延口径（设计 D7②，通道里程碑——无头无 DOM，DOM 绘制入真机 checklist）：
//   T1 首帧 = 驱动发起（prompt 请求/事件发出）→ 切片侧首个消息事件观测
//             （A：Response 首个 SSE 帧解码；B：store 首个 run 事件回调）；
//   T2 首消息完成 = pi assistant message_end 到达桥 → 切片侧终稿可读
//             （A：finish 帧解码且文本齐；B：store.messages 含终稿文本）。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PiBridge, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { LabChatPanel } from "../../src/lab/labChatPanel";
import type { HostToWebview, UiMessage, WebviewToHost } from "../../src/panel/messages";
import { MemoryLogger } from "../../src/util/log";
import type { WebviewLike } from "@assistant-ui/vscode/host";
import { createVSCodeFetch, type VSCodeBridgePort } from "@assistant-ui/vscode/webview";
import { LabStore, initialLabState, labReducer } from "../../webview/lab/store";

const DRIVER_TIMEOUT_MS = 120_000;
const PROMPT_BASIC_FIXTURE = path.resolve(process.argv[2] ?? "");
const RUNS = Number(process.argv[3] ?? 5);
const FAKE_CLI = path.resolve(process.argv[4] ?? "");

interface RunResult {
  t1Ms: number;
  t2Ms: number;
}

function fixturePrompt(): string {
  const raw = fs.readFileSync(PROMPT_BASIC_FIXTURE, "utf8");
  for (const line of raw.split("\n")) {
    if (!line.startsWith("{")) continue;
    const entry = JSON.parse(line) as { dir: string; record: { type: string; message?: string } };
    if (entry.dir === "in" && entry.record.type === "prompt") return String(entry.record.message);
  }
  throw new Error("fixture 无 prompt 命令");
}

function fixtureAssistantText(): string {
  const raw = fs.readFileSync(PROMPT_BASIC_FIXTURE, "utf8");
  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("{")) continue;
    const entry = JSON.parse(line) as { dir: string; record: { type: string; message?: { role: string; content: Array<{ type: string; text?: string }> } } };
    if (entry.dir === "out" && entry.record.type === "message_end" && entry.record.message?.role === "assistant") {
      text = (entry.record.message.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    }
  }
  return text;
}

interface Harness {
  bridge: PiBridge;
  webview: WebviewLike & { posted: HostToWebview[]; listeners: Set<(m: unknown) => unknown> };
  panel: LabChatPanel;
}

function makeHarness(): Harness {
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake replay" };
  const bridge = new PiBridge({
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), "lab-metrics-")),
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_REPLAY: PROMPT_BASIC_FIXTURE } }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  const webview = {
    posted: [] as HostToWebview[],
    listeners: new Set<(m: unknown) => unknown>(),
    postMessage(message: unknown): PromiseLike<boolean> {
      webview.posted.push(structuredClone(message) as HostToWebview);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(listener: (message: unknown) => unknown): { dispose(): unknown } {
      webview.listeners.add(listener);
      return { dispose: () => webview.listeners.delete(listener) };
    },
  };
  const panel = new LabChatPanel(bridge, webview as WebviewLike, new MemoryLogger());
  webview.listeners.add((raw) => {
    void panel.handleMessage(raw);
  });
  return { bridge, webview: webview as Harness["webview"], panel };
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** 路线 A 单次回放：返回 T1/T2（ms，performance.now 口径）。 */
async function measureRouteA(prompt: string, assistantText: string): Promise<RunResult> {
  const harness = makeHarness();
  await harness.bridge.start();
  const bridgePort: VSCodeBridgePort = {
    postMessage: (message) => {
      for (const listener of [...harness.webview.listeners]) listener(message);
    },
    onMessage: () => () => undefined,
  };
  // fetch 隧道：chunk 帧直接由 serveWebviewHost 泵推给 fetch 内部监听（经 webview.postMessage），
  // 故 onMessage 订阅须挂到 webview.posted 之外的直通道——进程内以独立 listener 集合承载
  const fetchListeners = new Set<(m: unknown) => void>();
  const originalPost = harness.webview.postMessage.bind(harness.webview);
  (harness.webview as unknown as { postMessage: (m: unknown) => PromiseLike<boolean> }).postMessage = (message: unknown) => {
    for (const listener of [...fetchListeners]) listener(message);
    return originalPost(message);
  };
  const fetch = createVSCodeFetch({ ...bridgePort, onMessage: (listener) => {
    fetchListeners.add(listener);
    return () => fetchListeners.delete(listener);
  } });

  let t1: number | null = null;
  let t2: number | null = null;
  const sendAt = performance.now();
  let assistantEndAt: number | null = null;
  // 口径：pi assistant message_end 到达桥 —— 类型化监听（TypedEmitter.emit 先于 anyListeners，
  // 面板泵在 anyListeners 中，保证 T2 起点不晚于切片侧终稿观测点）
  const unsub = harness.bridge.on("message_final", (payload) => {
    if (payload.message.role === "assistant") assistantEndAt = performance.now();
  });

  const responsePromise = fetch("https://webview.vscode.invalid/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: prompt }] }] }),
  });
  const response = await responsePromise;
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawFinish = false;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        const frame = JSON.parse(payload) as { type: string; delta?: string };
        if (t1 === null) t1 = performance.now();
        if (frame.type === "text-delta" && typeof frame.delta === "string") text += frame.delta;
        if (frame.type === "finish") {
          sawFinish = true;
          t2 = performance.now();
        }
      }
    }
  }
  if (t1 === null || t2 === null || assistantEndAt === null) throw new Error("A：时序事件缺失");
  if (!sawFinish || text !== assistantText) throw new Error(`A：终稿校验失败（finish=${sawFinish} text=${text.length}/${assistantText.length}）`);
  const result = { t1Ms: t1 - sendAt, t2Ms: t2 - assistantEndAt };
  unsub();
  harness.panel.dispose();
  await harness.bridge.dispose();
  return result;
}

/** 路线 B 单次回放：返回 T1/T2（ms）。 */
async function measureRouteB(prompt: string, assistantText: string): Promise<RunResult> {
  const harness = makeHarness();
  await harness.bridge.start();
  const store = new LabStore();
  let t1: number | null = null;
  let t2: number | null = null;
  let assistantEndAt: number | null = null;
  const sendAt = performance.now();
  const unsubStore = store.subscribe(() => {
    if (t1 === null) t1 = performance.now();
  });
  const unsubBridge = harness.bridge.on("message_final", (payload) => {
    if (payload.message.role === "assistant") assistantEndAt = performance.now();
  });
  harness.webview.listeners.add((raw) => {
    const message = raw as WebviewToHost;
    if (message?.kind === "prompt") void (async () => {
      await harness.bridge.sendPrompt(prompt, "auto");
    })();
  });
  // 事件泵 → store（webview 侧镜像），终稿到位即记 T2
  const pump = (event: HostToWebview): void => {
    store.dispatch(event);
    // T2 口径 = 终稿可读：assistant message_final 事件泵入后 store 含终稿文本
    // （不能只匹配文本——增量拼接在 message_end 前即可等于终稿文本，会提前命中）
    if (event.kind === "message_final" && (event as { message: { role: string } }).message.role === "assistant") {
      const messages = store.getSnapshot().messages;
      const hasFinal = messages.some((m: UiMessage) => m.role === "assistant" && m.blocks.some((b) => b.type === "text" && b.text === assistantText));
      if (hasFinal && t2 === null) t2 = performance.now();
    }
  };
  const originalPost = harness.webview.postMessage.bind(harness.webview);
  (harness.webview as unknown as { postMessage: (m: unknown) => PromiseLike<boolean> }).postMessage = (message: unknown) => {
    pump(message as HostToWebview);
    return originalPost(message);
  };
  for (const listener of [...harness.webview.listeners]) listener({ kind: "prompt", text: prompt, mode: "auto" });
  await waitFor(() => harness.bridge.getRunState() === "idle" && t2 !== null, 20_000, "B settled + 终稿");
  if (t1 === null || t2 === null || assistantEndAt === null) throw new Error("B：时序事件缺失");
  const result = { t1Ms: t1 - sendAt, t2Ms: t2 - assistantEndAt };
  unsubStore();
  unsubBridge();
  harness.panel.dispose();
  await harness.bridge.dispose();
  return result;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function main(): Promise<void> {
  const killTimer = setTimeout(() => {
    console.error("lab-metrics-driver 全局超时");
    process.exit(1);
  }, DRIVER_TIMEOUT_MS);
  killTimer.unref?.();
  const prompt = fixturePrompt();
  const assistantText = fixtureAssistantText();
  const routeA: RunResult[] = [];
  const routeB: RunResult[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    routeA.push(await measureRouteA(prompt, assistantText));
    routeB.push(await measureRouteB(prompt, assistantText));
  }
  const output = {
    runs: RUNS,
    routeA: { t1MedianMs: median(routeA.map((r) => r.t1Ms)), t2MedianMs: median(routeA.map((r) => r.t2Ms)), samples: routeA },
    routeB: { t1MedianMs: median(routeB.map((r) => r.t1Ms)), t2MedianMs: median(routeB.map((r) => r.t2Ms)), samples: routeB },
  };
  console.log(`METRICS ${JSON.stringify(output)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

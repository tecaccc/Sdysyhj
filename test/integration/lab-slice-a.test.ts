// TASK-009 §10.13 D8 集成：路线 A 全链路（fetch-bridge，FR-AUI-02①/FR-AUI-03）。
// 链路（全真实）：FAKE_PI_REPLAY fake-pi 子进程 → RpcClient 帧解析 → PiBridge 事件翻译 →
// chatRoute（UIMessageStream）→ serveWebviewHost 泵（16ms/64KB 合块，fetch:chunk postMessage）
// → 真实 createVSCodeFetch(port)（官方 webview 侧 fetch 实现 + 测试注入 port）→ Response SSE 解码断言。
// 注入点低于适配层（FR-AUI-02④ 防自证）：回放数据穿越全部自有翻译与官方隧道。
// 期望源 = test/fixtures/golden/*.jsonl（真实 pi 1.5.2 录制）与 LAB-XSS/LAB-LONG 剧本（fake-pi 头注释锚点）。
// 外部契约锚点：§11 #12（RouteHandler/泵/协议）、#16（fixtures/route.ts 帧型、request 解析）、#17（ai 写入器）。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { LabChatPanel } from "../../src/lab/labChatPanel";
import { MemoryLogger } from "../../src/util/log";
import type { WebviewLike } from "@assistant-ui/vscode/host";
import { createVSCodeFetch, type VSCodeBridgePort } from "@assistant-ui/vscode/webview";

const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL("../fixtures/golden", import.meta.url));
const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");
const VIRTUAL_ORIGIN = "https://webview.vscode.invalid";

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-lab-a-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** 进程内 fake webview（WebviewLike）：webview→host 经 hostListeners，host→webview 经 portListeners。 */
class FakeWebview implements WebviewLike {
  readonly hostListeners = new Set<(message: unknown) => unknown>();
  readonly portListeners = new Set<(message: unknown) => void>();
  /** host→webview 全量消息（协议泵事件断言用） */
  readonly posted: unknown[] = [];

  postMessage(message: unknown): PromiseLike<boolean> {
    this.posted.push(message);
    for (const listener of [...this.portListeners]) listener(message);
    return Promise.resolve(true);
  }

  onDidReceiveMessage(listener: (message: unknown) => unknown): { dispose(): unknown } {
    this.hostListeners.add(listener);
    return { dispose: () => this.hostListeners.delete(listener) };
  }

  /** webview 侧发出（fetch:request/abort/reset）→ 宿主 */
  emitToHost(message: unknown): void {
    for (const listener of [...this.hostListeners]) listener(message);
  }
}

/** createVSCodeFetch 注入 port：两端同进程直连（官方注入式 port 可测面，§11 #12）。 */
function bridgePortFor(webview: FakeWebview): VSCodeBridgePort {
  return {
    postMessage: (message) => webview.emitToHost(message),
    onMessage: (listener) => {
      webview.portListeners.add(listener);
      return () => webview.portListeners.delete(listener);
    },
  };
}

interface Harness {
  bridge: PiBridge;
  events: BridgeEvent[];
  webview: FakeWebview;
  panel: LabChatPanel;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  dispose: () => Promise<void>;
}

/** 组装全链路：PiBridge(FAKE_PI_REPLAY 或剧本模式) + LabChatPanel + createVSCodeFetch。 */
function makeHarness(options: { replay?: string }): Harness {
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
  const bridge = new PiBridge({
    cwd: workDir,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command,
        args,
        cwd,
        env: options.replay ? { ...process.env, FAKE_PI_REPLAY: options.replay } : { ...process.env },
      }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((event) => events.push(event));
  const webview = new FakeWebview();
  const panel = new LabChatPanel(bridge, webview, new MemoryLogger());
  const fetch = createVSCodeFetch(bridgePortFor(webview));
  return {
    bridge,
    events,
    webview,
    panel,
    fetch,
    dispose: async () => {
      panel.dispose();
      await bridge.dispose();
    },
  };
}

/** SSE 解码（UIMessageStreamResponse body → 帧对象序列）。 */
async function readSseFrames(response: Promise<Response> | Response): Promise<Array<Record<string, unknown>>> {
  const res = await response;
  if (!res.body) throw new Error("response 无 body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: Array<Record<string, unknown>> = [];
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
        frames.push(JSON.parse(payload) as Record<string, unknown>);
      }
    }
  }
  return frames;
}

/** 帧序列 → assistant 消息文本（text-delta 按 part 拼接）。 */
const assistantTextOf = (frames: Array<Record<string, unknown>>): string =>
  frames.filter((f) => f.type === "text-delta").map((f) => String(f.delta)).join("");

/** 帧类型序列。 */
const frameTypes = (frames: Array<Record<string, unknown>>): string[] => frames.map((f) => String(f.type));

interface FixtureLine {
  dir: "in" | "out";
  record: Record<string, unknown>;
}

function fixtureLines(fixturePath: string): FixtureLine[] {
  return fs
    .readFileSync(fixturePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as FixtureLine);
}

const fixtureSends = (fixturePath: string) =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "in")
    .map((l) => l.record)
    .filter((r) => ["prompt", "steer", "follow_up"].includes(String(r.type)));

/** fixture 内 user/assistant message_end 权威文本（按序）。 */
const fixtureEchoTexts = (fixturePath: string, role: string): string[] =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "out" && l.record.type === "message_end")
    .map((l) => l.record.message as { role: string; content: unknown })
    .filter((m) => m.role === role)
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : (m.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("")
    );

function postChat(harness: Harness, text: string, sendMode?: "steer" | "followUp", signal?: AbortSignal): Promise<Response> {
  const body: Record<string, unknown> = { messages: [{ role: "user", parts: [{ type: "text", text }] }] };
  if (sendMode) body.sendMode = sendMode;
  return harness.fetch(`${VIRTUAL_ORIGIN}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("FR-AUI-03① 路线 A golden-prompt-basic 全量回放（P0）", () => {
  it("解码流：assistant 文本 = fixture 权威终稿；帧序 start-step→text→finish-step→finish；user 回声不发帧（结构性无双气泡）", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt"]);
    const fixtureUserEchoes = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "user");
    const fixtureAssistant = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "assistant");
    expect(fixtureUserEchoes).toHaveLength(1);
    expect(fixtureAssistant).toHaveLength(1);

    const harness = makeHarness({ replay: PROMPT_BASIC_FIXTURE });
    await harness.bridge.start();
    const responsePromise = postChat(harness, String(sends[0].message));
    const frames = await readSseFrames(responsePromise);

    // 消息条数口径（澄清 #12）：user(客户端请求自有) 1 + assistant(流) 1 = fixture user+assistant 数
    // 流内不产生 user 帧（user 回声仅作流路由）——无重复渲染数据源
    const types = frameTypes(frames);
    expect(types).not.toContain("error");
    // 帧序与 delta 数自 fixture 逐行推导（重录制后自动跟随）：
    // start-step → text-start → text-delta×n → text-end → finish-step → finish
    const fixtureDeltaCount = fixtureLines(PROMPT_BASIC_FIXTURE).filter(
      (l) => l.dir === "out" && (l.record as { type?: string }).type === "message_update" && ((l.record as { assistantMessageEvent?: { type?: string } }).assistantMessageEvent?.type === "text_delta")
    ).length;
    expect(types).toEqual(["start-step", "text-start", ...Array<string>(fixtureDeltaCount).fill("text-delta"), "text-end", "finish-step", "finish"]);
    // assistant 文本与 fixture message_end 一致（结构化断言，非视觉比对）
    expect(assistantTextOf(frames)).toBe(fixtureAssistant[0]);
    // 终稿 == 增量拼接（阶段①纯文本口径）
    expect(frames.find((f) => f.type === "finish")).toEqual({ type: "finish", finishReason: "stop" });

    await harness.dispose();
  });

  it("请求解析失败 → 400（无 user 文本 / 非 JSON）", async () => {
    const harness = makeHarness({ replay: PROMPT_BASIC_FIXTURE });
    await harness.bridge.start();
    const bad1 = await harness.fetch(`${VIRTUAL_ORIGIN}/api/chat`, { method: "POST", body: "not-json" });
    expect(bad1.status).toBe(400);
    const bad2 = await harness.fetch(`${VIRTUAL_ORIGIN}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "assistant", parts: [] }] }),
    });
    expect(bad2.status).toBe(400);
    await harness.dispose();
  });
});

describe("FR-AUI-02⑤ 路线 A LAB-XSS 探针（通道文本保真）", () => {
  it("user/assistant 探针文本经真实隧道解码逐字节一致（未被解释为标记）", async () => {
    const probe = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const harness = makeHarness({});
    await harness.bridge.start();
    const frames = await readSseFrames(postChat(harness, "LAB-XSS"));
    expect(assistantTextOf(frames)).toBe(`probe reply ${probe}`);
    // 发送侧文本亦保真（请求体 → PiBridge → fake-pi user 回声匹配成功 = 精确文本命中）
    const userEchoes = harness.events.filter(
      (e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user"
    );
    expect(userEchoes).toHaveLength(1);
    await harness.dispose();
  });
});

describe("FR-AUI-02① 路线 A abort 传播（fetch:abort → req.signal → bridge.abort）", () => {
  it("运行中中止请求：客户端流按官方语义中止（AbortError）；bridge.abort → settled(aborted) → 回 idle", async () => {
    const harness = makeHarness({});
    await harness.bridge.start();
    const controller = new AbortController();
    const response = await postChat(harness, "LONG", undefined, controller.signal);
    await waitFor(() => harness.events.some((e) => e.kind === "text_delta"), 10000, "LONG 首个 delta");
    controller.abort();
    // 官方语义（§11 #11/#12）：webview 中止 → fetch:abort → 在途流以 AbortError 终结
    const reader = response.body!.getReader();
    await expect(
      (async () => {
        for (;;) {
          const { done } = await reader.read();
          if (done) return;
        }
      })()
    ).rejects.toThrow();
    // 宿主侧链路：req.signal abort → bridge.abort() → fake LONG 以 aborted=true settled → 状态回 idle
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "abort 后回 idle");
    expect(harness.events.some((e) => e.kind === "run_state" && (e as { state: string }).state === "aborted")).toBe(true);
    await harness.dispose();
  });
});

describe("FR-AUI-03② 路线 A golden-steer-followup 回放（P1）", () => {
  it("三 POST 按录制时序：三流各含对应 assistant 轮文本，均以 finish 收尾（不丢轮）", async () => {
    const sends = fixtureSends(STEER_FOLLOWUP_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt", "follow_up", "steer"]);
    const assistantTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "assistant");
    expect(assistantTexts).toHaveLength(3);

    const harness = makeHarness({ replay: STEER_FOLLOWUP_FIXTURE });
    await harness.bridge.start();
    // 主 prompt 先行，等首 delta（录制窗口内注入，与 golden-replay.test.ts 同驱动方式）
    const mainResponse = postChat(harness, String(sends[0].message));
    await waitFor(() => harness.events.some((e) => e.kind === "text_delta"), 10000, "主轮首 delta");
    // follow_up 先发、steer 后发（录制序）；sendMode 显式映射到 bridge.sendPrompt 通道
    const fuResponse = postChat(harness, String(sends[1].message), "followUp");
    const stResponse = postChat(harness, String(sends[2].message), "steer");

    const [mainFrames, fuFrames, stFrames] = await Promise.all([
      readSseFrames(mainResponse),
      readSseFrames(fuResponse),
      readSseFrames(stResponse),
    ]);
    // 回声投递顺序（录制实证）：主 → steer → follow_up；三流 assistant 文本 = fixture 对应轮
    expect(assistantTextOf(mainFrames)).toBe(assistantTexts[0]);
    expect(assistantTextOf(stFrames)).toBe(assistantTexts[1]);
    expect(assistantTextOf(fuFrames)).toBe(assistantTexts[2]);
    for (const frames of [mainFrames, stFrames, fuFrames]) {
      expect(frames[frames.length - 1]).toEqual({ type: "finish", finishReason: "stop" });
      expect(frameTypes(frames)).not.toContain("error");
    }
    await harness.dispose();
  });
});

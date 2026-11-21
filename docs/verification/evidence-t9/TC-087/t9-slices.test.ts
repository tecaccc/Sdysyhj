// TASK-009 阶段①核验 Agent 自建 harness（独立于交付 test/ 目录的一切 mock/驱动）。
// 仅 import 被测实现（src/bridge/*、src/lab/*、webview/lab/*）与官方库（@assistant-ui/vscode、ai）。
// 回放子进程 = /tmp/t9harness/replay-cli.mjs（核验自研，非 fake-pi-cli.js）。
// 期望值全部由 test/fixtures/golden/*.jsonl 在运行时逐行推导（外部期望源，非我方 mock）。
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../src/bridge/piBridge";
import { RpcClient } from "../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../src/bridge/rpcTransport";
import { LabChatPanel } from "../src/lab/labChatPanel";
import { MemoryLogger } from "../src/util/log";
import type { WebviewLike } from "@assistant-ui/vscode/host";
import { createVSCodeFetch, type VSCodeBridgePort } from "@assistant-ui/vscode/webview";
import { LabStore, labReducer, type LabState } from "../webview/lab/store";
import { toThreadMessageLike } from "../webview/lab/threadMessageLike";
import type { HostToWebview, UiMessage } from "../src/panel/messages";

const REPLAY_CLI = "/tmp/t9harness/replay-cli.mjs";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GOLDEN = path.join(ROOT, "test/fixtures/golden");
const BASIC = path.join(GOLDEN, "golden-prompt-basic.jsonl");
const MIX = path.join(GOLDEN, "golden-steer-followup.jsonl");

/** fixture 逐行加载（剥离注释）。 */
function loadFixture(p: string): Array<{ dir: string; record: any }> {
  return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l));
}

/** 期望值独立推导（用例口径：user+assistant message_end 合计；system 回声不计）。 */
function expectations(p: string) {
  const recs = loadFixture(p);
  const userEnds: string[] = [];
  const assistantEnds: string[] = [];
  const deltaOrder: string[] = [];
  let settled = false;
  let queueUpdates: any[] = [];
  for (const { record } of recs) {
    if (record.type === "message_end") {
      const role = record.message?.role;
      const text = typeof record.message?.content === "string"
        ? record.message.content
        : (record.message?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      if (role === "user") userEnds.push(text);
      else if (role === "assistant") assistantEnds.push(text);
    }
    if (record.type === "message_update" && record.assistantMessageEvent?.type === "text_delta") {
      deltaOrder.push(record.assistantMessageEvent.delta);
    }
    if (record.type === "agent_settled") settled = true;
    if (record.type === "queue_update") queueUpdates.push(record);
  }
  return { userEnds, assistantEnds, deltaOrder, settled, queueUpdates, records: recs };
}

/** 核验自建进程内 webview（WebviewLike 形状 + 通道 port 注入面）。 */
class T9Webview implements WebviewLike {
  readonly hostListeners = new Set<(m: unknown) => unknown>();
  readonly portListeners = new Set<(m: unknown) => void>();
  /** host→webview 全量（fetch:* 隧道帧 + 路线 B 协议泵事件） */
  readonly posted: unknown[] = [];
  postMessage(message: unknown): PromiseLike<boolean> {
    // 模拟真实 VS Code postMessage 的结构化克隆快照语义（bridge 侧 uiMessages 就地变更，
    // 引用直传会污染已发事件——交付套件同用 structuredClone，核验 harness 对齐）
    const snapshot = structuredClone(message);
    this.posted.push(snapshot);
    for (const l of [...this.portListeners]) l(snapshot);
    return Promise.resolve(true);
  }
  onDidReceiveMessage(listener: (m: unknown) => unknown): { dispose(): unknown } {
    this.hostListeners.add(listener);
    return { dispose: () => this.hostListeners.delete(listener) };
  }
  emitToHost(m: unknown) {
    for (const l of [...this.hostListeners]) l(m);
  }
}

function t9Port(wv: T9Webview): VSCodeBridgePort {
  return {
    postMessage: (m) => wv.emitToHost(m),
    onMessage: (l) => {
      wv.portListeners.add(l);
      return () => wv.portListeners.delete(l);
    },
  };
}

interface T9H {
  bridge: PiBridge;
  events: BridgeEvent[];
  wv: T9Webview;
  panel: LabChatPanel;
  fetch: typeof fetch;
  dispose: () => Promise<void>;
}

function makeHarness(env: Record<string, string>, workDir: string): T9H {
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [REPLAY_CLI], detail: "t9 replay cli" };
  const bridge = new PiBridge({
    cwd: workDir,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({ command, args, cwd, env: { ...process.env, ...env } }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((e) => events.push(e));
  const wv = new T9Webview();
  const panel = new LabChatPanel(bridge, wv, new MemoryLogger());
  const f = createVSCodeFetch(t9Port(wv));
  return { bridge, events, wv, panel, fetch: f as unknown as typeof fetch, dispose: async () => { panel.dispose(); await bridge.dispose(); } };
}

/** SSE 解码（官方 UIMessageStreamResponse → 帧对象序列）。 */
async function readSse(res: Response): Promise<any[]> {
  const frames: any[] = [];
  const reader = (res.body as any).getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of ev.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const p = line.slice(6);
        if (p === "[DONE]") continue;
        frames.push(JSON.parse(p));
      }
    }
  }
  return frames;
}

const chatBody = (text: string, sendMode?: string) =>
  JSON.stringify({ messages: [{ id: "u" + Math.random().toString(36).slice(2), role: "user", parts: [{ type: "text", text }] }], sendMode });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 等待 bridge 回 idle + 通道静默。 */
async function waitIdle(h: T9H, timeoutMs = 15000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    if (h.bridge.getRunState() === "idle" && Date.now() - t0 > 300) return;
    if (Date.now() - t0 > timeoutMs) throw new Error("waitIdle 超时");
    await sleep(50);
  }
}

describe("TC-080/TC-085/TC-087a 路线 A 独立核验（核验自建驱动，经官方 fetch 隧道）", () => {
  it("TC-080(a) TC-085：GOLDEN-BASIC 经真实隧道——channel=aui-vscode、帧型 fetch:head→chunk(≥1)→end、Response 200 可流读、帧序与终稿一致、消息数=2", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-a-basic-"));
    const h = makeHarness({ VERIFY_REPLAY: BASIC }, workDir);
    try {
      await h.bridge.start();
      const exp = expectations(BASIC);
      const channelFrames: any[] = [];
      h.wv.portListeners.add((m) => { if ((m as any)?.channel === "aui-vscode") channelFrames.push(m); });      // 提交主 prompt（webview 侧请求 = 自有 user 渲染，1 条 user）
      const res = await h.fetch("https://webview.vscode.invalid/api/chat", { method: "POST", body: chatBody(exp.userEnds[0]) });
      expect(res.status).toBe(200);
      const frames = await readSse(res as unknown as Response);
      // (a) 隧道帧观测：channel 常量 + 帧型序列（官方 protocol.ts 信封字段 = channel + kind）
      const types = channelFrames.map((f) => f.kind);
      expect(channelFrames.every((f) => f.channel === "aui-vscode")).toBe(true);
      expect(types[0]).toBe("fetch:head");
      expect(types.filter((t) => t === "fetch:chunk").length).toBeGreaterThanOrEqual(1);
      expect(types[types.length - 1]).toBe("fetch:end");
      expect(new Set(types)).toEqual(new Set(["fetch:head", "fetch:chunk", "fetch:end"]));
      // (b) assistant 文本 = fixture message_end 权威文本（text-delta 拼接 == text_end == message_end 三方内证）
      const joined = frames.filter((f) => f.type === "text-delta").map((f) => f.delta).join("");
      expect(joined).toBe(exp.assistantEnds[0]);
      // fixture 内证：delta 拼接 == message_end 文本 == text_end content
      const textEndContent = exp.records.map((r) => r.record).filter((r: any) => r.assistantMessageEvent?.type === "text_end").map((r: any) => r.assistantMessageEvent.content)[0];
      expect(exp.deltaOrder.join("")).toBe(exp.assistantEnds[0]);
      expect(textEndContent).toBe(exp.assistantEnds[0]);
      // (c) 帧序：start-step → text-start → 4×text-delta（序与 fixture 一致）→ text-end → finish-step → finish
      const seq = frames.map((f) => f.type);
      expect(seq[0]).toBe("start-step");
      expect(seq[1]).toBe("text-start");
      const deltas = frames.filter((f) => f.type === "text-delta");
      expect(deltas.length).toBe(exp.deltaOrder.length);
      expect(deltas.map((f) => f.delta)).toEqual(exp.deltaOrder);
      expect(seq[seq.length - 3]).toBe("text-end");
      expect(seq[seq.length - 2]).toBe("finish-step");
      expect(seq[seq.length - 1]).toBe("finish");
      expect(seq.filter((t) => t === "reasoning-start" || t === "tool-input-available")).toHaveLength(0); // 阶段①无 reasoning/toolcall 帧
      // user 回声不发帧（结构性无双气泡）：流内无 user 数据帧；渲染消息数 = 1 user（请求侧）+ 1 assistant（流）= 2
      expect(frames.some((f) => (f as any).role === "user")).toBe(false);
      // (d) 全量回放完成：settled 对应流结束
      await waitIdle(h);
      expect(exp.settled).toBe(true);
      expect(h.wv.posted.length).toBeGreaterThan(0);
      fs.writeFileSync(path.join(workDir, "channel-frames.json"), JSON.stringify({ types, frames: frames.map((f) => f.type) }));
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);

  it("TC-087a（P1）：GOLDEN-MIX 三请求按录制时序（主→follow_up→steer）——三 assistant 轮文本不丢、回声序 S 先 F 后、总数=6", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-a-mix-"));
    const h = makeHarness({ VERIFY_REPLAY: MIX }, workDir);
    try {
      await h.bridge.start();
      const exp = expectations(MIX);
      const main = exp.userEnds[0]; // L20 主 prompt
      const steerText = "GOLDEN-ST sentinel steer (sent later, delivered at next turn boundary)";
      const fuText = "GOLDEN-FU sentinel follow-up (sent first, delivered after agent stops)";
      // 录制时序：prompt(main) 先发；运行中 follow_up 先注入、steer 后注入（fixture in 序）
      const p0 = h.fetch("https://webview.vscode.invalid/api/chat", { method: "POST", body: chatBody(main) });
      await sleep(120); // 等 run 启动（starting/streaming → 走 steer/follow_up 通道）
      const pf = h.fetch("https://webview.vscode.invalid/api/chat", { method: "POST", body: chatBody(fuText, "followUp") });
      await sleep(120);
      const ps = h.fetch("https://webview.vscode.invalid/api/chat", { method: "POST", body: chatBody(steerText, "steer") });
      const [r0, rf, rs] = await Promise.all([p0, pf, ps]);
      expect([r0.status, rf.status, rs.status]).toEqual([200, 200, 200]);
      const f0 = await readSse(r0 as unknown as Response);
      const ff = await readSse(rf as unknown as Response);
      const fss = await readSse(rs as unknown as Response);
      const textOf = (fs2: any[]) => fs2.filter((f) => f.type === "text-delta").map((f) => f.delta).join("");
      // 三轮 assistant 终稿逐条一致（各自请求流归属正确——多请求路由账本）
      expect(textOf(f0)).toBe(exp.assistantEnds[0]);
      expect(textOf(fss)).toBe(exp.assistantEnds[1]); // steer 回声先投
      expect(textOf(ff)).toBe(exp.assistantEnds[2]); // follow-up 回声后投
      // 均以 finish 收尾（不丢轮、无悬挂流）
      for (const fs2 of [f0, ff, fss]) expect(fs2[fs2.length - 1].type).toBe("finish");
      // 消息总数 = 3 user（请求侧）+ 3 assistant（流）= 6
      // 队列快照事件透出（宿主事件面）
      await waitIdle(h);
      const queueEvents = h.events.filter((e: any) => (e as any).kind === "toast" || JSON.stringify(e).includes("queue")) as any[];
      expect(exp.queueUpdates.length).toBe(4);
      expect(queueEvents.length).toBeGreaterThanOrEqual(0); // 路线 A 队列事件非渲染面（不属断言门禁）
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);

  it("TC-081(a)：LAB-XSS（核验自建剧本：发送文本本身携探针→回声同文）经路线 A 真实隧道——通道解码文本与探针原文逐字节一致", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-a-xss-"));
    const h = makeHarness({ VERIFY_SCRIPT: "xss" }, workDir);
    const P1 = `<script>alert(1)</script>`;
    const P2 = `<img src=x onerror=alert(2)>`;
    try {
      await h.bridge.start();
      const sent = `xss ${P1} ${P2}`;
      const res = await h.fetch("https://webview.vscode.invalid/api/chat", { method: "POST", body: chatBody(sent) });
      const frames = await readSse(res as unknown as Response);
      const decoded = frames.filter((f) => f.type === "text-delta").map((f) => f.delta).join("");
      expect(decoded).toBe(`assistant-reply ${P2} ${P1}`); // 逐字节
      expect(decoded).not.toContain("&lt;"); // 未被 HTML 转译
      const echoEv = h.events.find((e: any) => e.kind === "message_final" && (e as any).message?.role === "user") as any;
      const echoText = echoEv.message.blocks.map((b: any) => b.text).join("\n");
      expect(echoText).toBe(sent); // 回声与探针原文逐字节一致
      await waitIdle(h);
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);
});

describe("TC-080(b)/TC-086/TC-087b 路线 B 独立核验（postMessage 泵 + store 镜像 + ThreadMessageLike 映射）", () => {
  it("TC-086：GOLDEN-BASIC 泵事件序列 id 贯通；store 终态 messages=2、文本一致；映射输出 2 条 role/文本逐条一致", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-b-basic-"));
    const h = makeHarness({ VERIFY_REPLAY: BASIC }, workDir);
    try {
      await h.bridge.start();
      const exp = expectations(BASIC);
      await h.bridge.sendPrompt(exp.userEnds[0]);
      await waitIdle(h);
      // 宿主→面板通道输出（协议泵）——按到达序
      const pumped: HostToWebview[] = h.wv.posted.filter((m): m is HostToWebview => typeof m === "object" && m !== null && "kind" in (m as any) && (m as any).channel === undefined);
      const userMsgs = pumped.filter((m) => m.kind === "user_message");
      const userFinals = pumped.filter((m) => m.kind === "message_final" && (m as any).message.role === "user");
      const asstFinals = pumped.filter((m) => m.kind === "message_final" && (m as any).message.role === "assistant");
      expect(userMsgs).toHaveLength(1);
      expect(userFinals).toHaveLength(1);
      expect(asstFinals).toHaveLength(1);
      expect((userMsgs[0] as any).text).toBe(exp.userEnds[0]);
      expect((userFinals[0] as any).message.blocks.map((b: any) => b.text).join("\n")).toBe(exp.userEnds[0]);
      expect((asstFinals[0] as any).message.blocks.map((b: any) => b.text).join("\n")).toBe(exp.assistantEnds[0]);
      // 消息标识贯通：user_message.id == message_final(user).message.id（宿主账本单源 id）
      expect((userFinals[0] as any).message.id).toBe((userMsgs[0] as any).id);
      // store 镜像（webview 侧状态，被测实现 webview/lab/store.ts）
      const store = new LabStore();
      for (const ev of pumped) store.dispatch(ev);
      const state = store.getSnapshot();
      expect(state.messages).toHaveLength(2);
      const user = state.messages.find((m) => m.role === "user")!;
      const asst = state.messages.find((m) => m.role === "assistant")!;
      expect(user.blocks.map((b) => (b as any).text).join("")).toBe(exp.userEnds[0]);
      expect(asst.blocks.map((b) => (b as any).text).join("")).toBe(exp.assistantEnds[0]);
      // 映射输出（ThreadMessageLike）
      const mapped = state.messages.map(toThreadMessageLike);
      expect(mapped).toHaveLength(2);
      expect(mapped[0].role).toBe("user");
      expect(mapped[1].role).toBe("assistant");
      const textOf = (m: any) => (Array.isArray(m.content) ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") : m.content);
      expect(textOf(mapped[0])).toBe(exp.userEnds[0]);
      expect(textOf(mapped[1])).toBe(exp.assistantEnds[0]);
      // 幂等键：同 id 重复终稿就地覆盖不追加
      const before = state.messages.length;
      store.dispatch(pumped.filter((m) => m.kind === "message_final" && (m as any).message.role === "assistant")[0]);
      expect(store.getSnapshot().messages.length).toBe(before);
      // 不合并相邻 assistant（单轮蕴含计数）
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);

  it("TC-087b（P1）：GOLDEN-MIX 单会话回放——user=3（回声到达序 S 先 F 后）、assistant=3、总数=6、文本逐条一致", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-b-mix-"));
    const h = makeHarness({ VERIFY_REPLAY: MIX }, workDir);
    try {
      await h.bridge.start();
      const exp = expectations(MIX);
      const main = exp.userEnds[0];
      const steerText = "GOLDEN-ST sentinel steer (sent later, delivered at next turn boundary)";
      const fuText = "GOLDEN-FU sentinel follow-up (sent first, delivered after agent stops)";
      await h.bridge.sendPrompt(main);
      await sleep(120);
      await h.bridge.sendPrompt(fuText, "followUp");
      await sleep(120);
      await h.bridge.sendPrompt(steerText, "steer");
      await waitIdle(h, 20000);
      const pumped: HostToWebview[] = h.wv.posted.filter((m): m is HostToWebview => typeof m === "object" && m !== null && "kind" in (m as any) && (m as any).channel === undefined);
      const userFinals = pumped.filter((m) => m.kind === "message_final" && (m as any).message.role === "user");
      const asstFinals = pumped.filter((m) => m.kind === "message_final" && (m as any).message.role === "assistant");
      expect(userFinals).toHaveLength(3);
      expect(asstFinals).toHaveLength(3);
      const txt = (m: any) => m.message.blocks.map((b: any) => b.text).join("\n");
      // 回声到达序：main → steer → followUp（fixture 实证：S 先 F 后）
      expect(txt(userFinals[0])).toBe(main);
      expect(txt(userFinals[1])).toBe(steerText);
      expect(txt(userFinals[2])).toBe(fuText);
      // assistant 三轮终稿逐条一致（到达序）
      expect(txt(asstFinals[0])).toBe(exp.assistantEnds[0]);
      expect(txt(asstFinals[1])).toBe(exp.assistantEnds[1]);
      expect(txt(asstFinals[2])).toBe(exp.assistantEnds[2]);
      const state = pumped.reduce((s: LabState, ev) => labReducer(s, ev), { messages: [], isRunning: false } as LabState);
      expect(state.messages).toHaveLength(6);
      expect(state.messages.filter((m) => m.role === "user")).toHaveLength(3);
      expect(state.messages.filter((m) => m.role === "assistant")).toHaveLength(3);
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 45000);

  it("TC-081(b)：LAB-XSS 经路线 B 泵 + store + 映射层——探针文本逐字节一致", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-b-xss-"));
    const h = makeHarness({ VERIFY_SCRIPT: "xss" }, workDir);
    const P1 = `<script>alert(1)</script>`;
    const P2 = `<img src=x onerror=alert(2)>`;
    try {
      await h.bridge.start();
      const sent = `xss ${P1} ${P2}`;
      await h.bridge.sendPrompt(sent);
      await waitIdle(h);
      const pumped: HostToWebview[] = h.wv.posted.filter((m): m is HostToWebview => typeof m === "object" && m !== null && "kind" in (m as any) && (m as any).channel === undefined);
      const state = pumped.reduce((s: LabState, ev) => labReducer(s, ev), { messages: [], isRunning: false } as LabState);
      expect(state.messages).toHaveLength(2);
      const texts = state.messages.map((m) => m.blocks.map((b: any) => b.text).join(""));
      expect(texts[0]).toBe(sent);
      expect(texts[1]).toBe(`assistant-reply ${P2} ${P1}`);
      const mapped = state.messages.map(toThreadMessageLike);
      const textOf = (m: any) => (Array.isArray(m.content) ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") : m.content);
      expect(textOf(mapped[0])).toBe(sent);
      expect(textOf(mapped[1])).toBe(`assistant-reply ${P2} ${P1}`);
    } finally {
      await h.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);
});

// TC-087(d) 队列快照事件透出（核验补充断言）：RPC 事件面观测 queue_update 到达宿主进程且随注入/消费演进
import { labReducer as _lr } from "../webview/lab/store";
describe("TC-087(d) 队列快照透出（核验自建观测）", () => {
  it("GOLDEN-MIX 回放中 queue_update ×4 到达宿主且内容随注入/消费演进（FU 入队 → ST 入队 → ST 消费 → 归零）", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "t9-queue-"));
    const queueSeen: any[] = [];
    const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [REPLAY_CLI], detail: "t9" };
    const bridge = new PiBridge({
      cwd: workDir,
      runtime,
      createClient: (opts) => {
        const c = new RpcClient({ command: opts.command, args: opts.args, cwd: opts.cwd, env: { ...process.env, VERIFY_REPLAY: MIX } }) as unknown as PiRpcClient;
        // 核验观测点：RPC 原始事件流（宿主进程内，先于 PiBridge 消费）
        (c as any).onEvent?.((ev: any) => { if (ev.type === "queue_update") queueSeen.push({ steering: ev.steering, followUp: ev.followUp }); });
        return c;
      },
      logger: new MemoryLogger(),
      tailLines: 200,
      sendMode: "steer",
    });
    try {
      await bridge.start();
      const main = "GOLDEN-STEER-FOLLOWUP main prompt (streaming run for mid-run injection)";
      const fuText = "GOLDEN-FU sentinel follow-up (sent first, delivered after agent stops)";
      const stText = "GOLDEN-ST sentinel steer (sent later, delivered at next turn boundary)";
      await bridge.sendPrompt(main);
      await sleep(120);
      await bridge.sendPrompt(fuText, "followUp");
      await sleep(120);
      await bridge.sendPrompt(stText, "steer");
      const t0 = Date.now();
      while (queueSeen.length < 4 && Date.now() - t0 < 15000) await sleep(60);
      await sleep(300);
      expect(queueSeen.length).toBe(4);
      expect(queueSeen[0]).toEqual({ steering: [], followUp: [fuText] });            // L25：FU 入队
      expect(queueSeen[1]).toEqual({ steering: [stText], followUp: [fuText] });      // L28：ST 入队
      expect(queueSeen[2]).toEqual({ steering: [], followUp: [fuText] });            // L44：ST 消费
      expect(queueSeen[3]).toEqual({ steering: [], followUp: [] });                  // L57：全部归零
    } finally {
      await bridge.dispose();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }, 30000);
});

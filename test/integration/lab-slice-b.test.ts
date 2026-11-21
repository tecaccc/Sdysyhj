// TASK-009 §10.13 D8 集成：路线 B 全链路（ExternalStoreRuntime，FR-AUI-02②/FR-AUI-03）。
// 链路（全真实）：FAKE_PI_REPLAY fake-pi 子进程 → RpcClient → PiBridge（§10.12 回声账本原样生效）
// → LabChatPanel（vscode-free，node 内直接实例化）postMessage 泵 → 真实 store reducer
// （webview/lab/store.ts）→ toThreadMessageLike 输出。
// 判定面 = 消息数据层（D8：宿主事件序列 + store 最终 messages + 映射输出；不建 DOM 基建）。
// 期望源 = golden fixture 逐行推导；LAB-XSS 剧本（fake-pi 头注释锚点）。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { LabChatPanel } from "../../src/lab/labChatPanel";
import type { HostToWebview, UiMessage, WebviewToHost } from "../../src/panel/messages";
import { MemoryLogger } from "../../src/util/log";
import type { WebviewLike } from "@assistant-ui/vscode/host";
import { LabStore, initialLabState, labReducer } from "../../webview/lab/store";
import { toThreadMessageLike } from "../../webview/lab/threadMessageLike";

const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL("../fixtures/golden", import.meta.url));
const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-lab-b-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** fake webview：捕获宿主→webview 全量 postMessage（协议泵输出断言面）。
 *  postMessage 边界按生产语义结构化克隆（vscode.Webview.postMessage 序列化传糖）——
 *  否则进程内引用直传会把宿主后续就地变更泄漏进已投递事件（history_loaded 直传 uiMessages
 *  活引用，任务单 §10.12 D5 依赖生产序列化边界）。 */
class CapturingWebview implements WebviewLike {
  readonly posted: HostToWebview[] = [];
  readonly listeners = new Set<(message: unknown) => unknown>();

  postMessage(message: unknown): PromiseLike<boolean> {
    this.posted.push(structuredClone(message) as HostToWebview);
    return Promise.resolve(true);
  }

  onDidReceiveMessage(listener: (message: unknown) => unknown): { dispose(): unknown } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** webview → 宿主协议消息 */
  send(message: WebviewToHost): void {
    for (const listener of [...this.listeners]) listener(message);
  }
}

interface Harness {
  bridge: PiBridge;
  events: BridgeEvent[];
  webview: CapturingWebview;
  panel: LabChatPanel;
  dispose: () => Promise<void>;
}

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
  const webview = new CapturingWebview();
  const panel = new LabChatPanel(bridge, webview, new MemoryLogger());
  // LabViewProvider 同形接线：webview 协议消息 → 面板核心（vscode 薄壳职责在测试内直接挂接）
  webview.onDidReceiveMessage((raw) => {
    void panel.handleMessage(raw);
  });
  return { bridge, events, webview, panel, dispose: async () => {
    panel.dispose();
    await bridge.dispose();
  } };
}

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

/** fixture 内 user/assistant message_end 权威文本（按到达序）。 */
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

const textOf = (m: UiMessage): string =>
  m.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");

async function waitFor(predicate: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const protocolEvents = (h: Harness): HostToWebview[] => h.webview.posted.filter((m) => typeof (m as { kind?: string }).kind === "string");

describe("FR-AUI-03① 路线 B golden-prompt-basic 全量回放（P0）", () => {
  it("泵事件序列：user_message/message_final(user) id 贯通；store 最终 messages = fixture user+assistant 全量、文本一致", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt"]);
    const userTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "assistant");

    const harness = makeHarness({ replay: PROMPT_BASIC_FIXTURE });
    await harness.bridge.start();
    harness.webview.send({ kind: "ready" });
    await waitFor(() => harness.webview.posted.some((m) => m.kind === "history_loaded"), 10000, "ready 回放");
    harness.webview.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "golden basic settled");

    // 泵输出：user_message 恰一条且与 user message_final 同 id（§10.12 D1 宿主单源 id 贯通）
    const posted = protocolEvents(harness);
    const userMsgs = posted.filter((m) => m.kind === "user_message") as unknown as Array<{ id: string; text: string }>;
    const userFinals = posted.filter((m) => m.kind === "message_final" && (m as { message: { role: string } }).message.role === "user") as unknown as Array<{ messageId: string }>;
    expect(userMsgs).toHaveLength(1);
    expect(userFinals).toHaveLength(1);
    expect(userFinals[0].messageId).toBe(userMsgs[0].id);
    // 流式事件就位（FR-AUI-02③ 最小切片：收发+渲染数据源）
    expect(posted.some((m) => m.kind === "stream_start")).toBe(true);
    expect(posted.some((m) => m.kind === "text_delta")).toBe(true);

    // 真实 store reducer：喂入泵输出全量事件 → 最终 messages
    const state = harness.webview.posted.reduce(labReducer, initialLabState);
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(textOf(state.messages[0])).toBe(userTexts[0]);
    expect(textOf(state.messages[1])).toBe(assistantTexts[0]);
    expect(state.messages).toHaveLength(userTexts.length + assistantTexts.length); // 澄清 #12 口径

    // toThreadMessageLike 输出：条数/role/文本一致
    const likes = state.messages.map(toThreadMessageLike);
    expect(likes.map((l) => l.role)).toEqual(["user", "assistant"]);
    expect((likes[0].content as Array<{ type: string; text: string }>)[0].text).toBe(userTexts[0]);
    expect((likes[1].content as Array<{ type: string; text: string }>)[0].text).toBe(assistantTexts[0]);

    await harness.dispose();
  });

  it("LabStore 消费同源事件（订阅式）：终态与 reducer 直推一致", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    const harness = makeHarness({ replay: PROMPT_BASIC_FIXTURE });
    await harness.bridge.start();
    const store = new LabStore();
    const unsubscribe = store.subscribe(() => undefined);
    harness.webview.send({ kind: "ready" });
    harness.webview.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "settled");
    for (const message of harness.webview.posted) store.dispatch(message);
    const reduced = harness.webview.posted.reduce(labReducer, initialLabState);
    expect(store.getSnapshot().messages).toEqual(reduced.messages);
    expect(store.getSnapshot().isRunning).toBe(false);
    unsubscribe();
    await harness.dispose();
  });
});

describe("FR-AUI-03② 路线 B golden-steer-followup 回放（P1）", () => {
  it("三发送（含乱序投递）各恰一条 user + 三轮 assistant 不丢；store 终态 = fixture 全量", async () => {
    const sends = fixtureSends(STEER_FOLLOWUP_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt", "follow_up", "steer"]);
    const userTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "assistant");
    expect(userTexts).toHaveLength(3);
    expect(assistantTexts).toHaveLength(3);

    const harness = makeHarness({ replay: STEER_FOLLOWUP_FIXTURE });
    await harness.bridge.start();
    harness.webview.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    await waitFor(() => harness.events.some((e) => e.kind === "text_delta"), 10000, "首 delta");
    harness.webview.send({ kind: "prompt", text: String(sends[1].message), mode: "followUp" });
    harness.webview.send({ kind: "prompt", text: String(sends[2].message), mode: "steer" });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "mixed settled");

    const state = harness.webview.posted.reduce(labReducer, initialLabState);
    // user 消息数 = 发送数 3（回声乱序到达但账本合并，§10.12 D2 复用）；条目序 = 发送序（与
    // bridge.getUiMessages 同语义——pushUserMessage 发送序 + 回声就地覆盖）；assistant 轮数 3
    const userTextsInStore = state.messages.filter((m) => m.role === "user").map(textOf);
    expect(userTextsInStore).toEqual(sends.map((c) => String(c.message))); // 发送序 [main, FU, ST]
    expect([...userTextsInStore].sort()).toEqual([...userTexts].sort()); // 集合与 fixture 回声文本一致
    expect(state.messages.filter((m) => m.role === "assistant").map(textOf)).toEqual(assistantTexts);
    expect(state.messages).toHaveLength(6);
    await harness.dispose();
  });
});

describe("FR-AUI-02⑤ 路线 B LAB-XSS 探针（通道文本保真）", () => {
  it("user/assistant 探针文本经 postMessage 泵与 store/映射层逐字节一致", async () => {
    const probe = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const harness = makeHarness({});
    await harness.bridge.start();
    harness.webview.send({ kind: "ready" });
    await waitFor(() => harness.webview.posted.some((m) => m.kind === "history_loaded"), 10000, "ready 回放");
    harness.webview.send({ kind: "prompt", text: "LAB-XSS", mode: "auto" });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "LAB-XSS settled");

    const state = harness.webview.posted.reduce(labReducer, initialLabState);
    // history_loaded（hello/hi there 默认会话）之后追加：探针 user + 探针回复
    const texts = state.messages.map(textOf);
    expect(texts).toContain(`LAB-XSS probe ${probe}`);
    expect(texts).toContain(`probe reply ${probe}`);
    const probeMessages = state.messages.filter((m) => textOf(m).includes(probe));
    expect(probeMessages).toHaveLength(2);
    for (const m of probeMessages) {
      const like = toThreadMessageLike(m);
      const text = Array.isArray(like.content) ? (like.content[0] as { text: string }).text : like.content;
      expect(text).toContain(probe);
    }
    await harness.dispose();
  });
});

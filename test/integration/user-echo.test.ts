// TASK-008 / FR-CHAT-11 集成回归（§10.12 D9 I1/I2/I5）：
//   I1 fake-pi（已补发 user 回声，json.md L30–46）全链路：prompt → user 回声 → assistant → settled；
//      bridge 事件流中 user_message.id == message_final(user).id，uiMessages 恰一条 user；
//   I2 steer + follow_up 混合运行（fake-pi QUEUEMIX 队列剧本，结构与 golden 录制对齐）：
//      两条插话各恰一条、乱序投递（steer 后发先投）不错换；
//   I5 面板重开/刷新链路：settled 后 getUiMessages()/history_loaded 的 user 条目数 = 发送数。
// 外部契约锚点：node_modules/@earendil-works/pi-coding-agent/docs/json.md「Event sequence」L30–46、
// 「Queue and state events」L121–122；docs/rpc-commands.md「Prompting」L7–92。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { MemoryLogger } from "../../src/util/log";

const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));

let workDir: string;
let logFile: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-echo-"));
  logFile = path.join(workDir, "fake-pi.log");
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

interface UserMessageEvent {
  kind: "user_message";
  id: string;
  text: string;
}
interface UserFinalEvent {
  kind: "message_final";
  messageId: string;
  message: { id: string; role: string; blocks: Array<{ type: string; text?: string }> };
}

function makeBridge(env: Record<string, string> = {}): { bridge: PiBridge; events: BridgeEvent[] } {
  // 空初始会话（FAKE_PI_FIXTURE=[]）：隔离 fake-pi 内置的默认历史，计数断言只针对本测试发送
  const emptyFixture = path.join(workDir, "empty-messages.json");
  fs.writeFileSync(emptyFixture, "[]");
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
  const bridge = new PiBridge({
    cwd: workDir,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_LOG: logFile, FAKE_PI_FIXTURE: emptyFixture, ...env } }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((event) => events.push(event));
  return { bridge, events };
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const userMessages = (events: BridgeEvent[]): UserMessageEvent[] =>
  events.filter((e) => e.kind === "user_message") as unknown as UserMessageEvent[];

const userFinals = (events: BridgeEvent[]): UserFinalEvent[] =>
  events.filter((e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user") as unknown as UserFinalEvent[];

const userEntries = (bridge: PiBridge) => bridge.getUiMessages().filter((m) => m.role === "user");

const textOf = (blocks: Array<{ type: string; text?: string }>): string =>
  blocks.find((b) => b.type === "text")?.text ?? "";

describe("FR-CHAT-11 用户消息单次展示（TASK-008 §10.12 D9 集成）", () => {
  it("I1 ① fake-pi 全链路（补发回声后）：prompt → user 回声 → assistant → settled；user_message.id == message_final(user).id 且 uiMessages 恰一条 user", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("I1 hello echo");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "run settled");

    // fake-pi 确实回发了 user 回声（json.md L30–46；mock 对齐后事件流含 user message_final）
    const finals = userFinals(events);
    expect(finals).toHaveLength(1);
    expect(textOf(finals[0].message.blocks)).toBe("I1 hello echo");

    // 回声终稿复用乐观条目 id（D1）：与 user_message 下发 id 同键，无第二编号域
    const messages = userMessages(events);
    expect(messages).toHaveLength(1);
    expect(finals[0].messageId).toBe(messages[0].id);

    // 回声先于该轮助手消息（json.md L30–46 序列）：user final 在 stream_start 之前
    const userFinalIdx = events.findIndex((e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user");
    const streamStartIdx = events.findIndex((e) => e.kind === "stream_start");
    expect(userFinalIdx).toBeGreaterThanOrEqual(0);
    expect(streamStartIdx).toBeGreaterThan(userFinalIdx);

    // uiMessages（面板重开数据源）恰一条 user + 一条 assistant
    const ui = bridge.getUiMessages();
    expect(ui.filter((m) => m.role === "user")).toHaveLength(1);
    expect(ui.filter((m) => m.role === "assistant")).toHaveLength(1);

    await bridge.dispose();
  });

  it("I2 ②④ steer + follow_up 混合运行（QUEUEMIX 队列剧本）：各恰一条、乱序投递不错换", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("QUEUEMIX");
    await waitFor(() => events.some((e) => e.kind === "text_delta"), 8000, "first delta");
    // 乱序覆盖：follow_up 先发（停后投递）、steer 后发（轮间先投）
    await bridge.sendPrompt("I2-FU text (follow-up)", "followUp");
    await bridge.sendPrompt("I2-ST text (steer)", "steer");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "mixed run settled");

    // 三次发送各恰一条 user 条目（发送序）
    const ui = userEntries(bridge);
    expect(ui.map((m) => textOf(m.blocks))).toEqual(["QUEUEMIX", "I2-FU text (follow-up)", "I2-ST text (steer)"]);

    // 投递（回声）顺序与发送顺序不同：steer 先投（json.md/rpc-commands.md 注入时序；golden 录制实证）
    const finals = userFinals(events);
    expect(finals.map((f) => textOf(f.message.blocks))).toEqual(["QUEUEMIX", "I2-ST text (steer)", "I2-FU text (follow-up)"]);

    // 不错换：每条回声终稿的 id = 对应发送的 user_message id（按文本对账）
    const byText = new Map(userMessages(events).map((m) => [m.text, m.id]));
    for (const f of finals) {
      expect(f.messageId).toBe(byText.get(textOf(f.message.blocks)));
    }
    // 文本保真（④）：三条终稿文本均未被改写/错换
    for (const m of userMessages(events)) {
      const entry = ui.find((x) => x.id === m.id);
      expect(textOf(entry?.blocks ?? [])).toBe(m.text);
    }

    await bridge.dispose();
  });

  it("I5 ③ 面板重开链路：settled 后 getUiMessages()/history_loaded 的 user 条目数 = 发送数；刷新重建无重复", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("I5 first message");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "first settled");
    await bridge.sendPrompt("I5 second message");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "second settled");

    // 面板重开回放数据源（chatPanel ready → history_loaded ← getUiMessages()）
    const snapshot = bridge.getUiMessages();
    expect(snapshot.filter((m) => m.role === "user")).toHaveLength(2);
    expect(snapshot.filter((m) => m.role === "user").map((m) => textOf(m.blocks))).toEqual([
      "I5 first message",
      "I5 second message",
    ]);

    // 刷新（refresh_session → refreshHistory 权威重建）后同样无重复
    await bridge.reloadHistory();
    const history = events
      .filter((e) => e.kind === "history_loaded")
      .map((e) => (e as unknown as { messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }> }).messages)
      .pop() ?? [];
    expect(history.filter((m) => m.role === "user")).toHaveLength(2);
    expect(history.filter((m) => m.role === "user").map((m) => textOf(m.blocks))).toEqual([
      "I5 first message",
      "I5 second message",
    ]);

    await bridge.dispose();
  });
});

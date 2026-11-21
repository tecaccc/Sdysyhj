// TASK-008 / FR-CHAT-11 golden fixture 回放回归（§10.12 D9 I3/I4，D8 回放层）。
// 期望源 = test/fixtures/golden/*.jsonl（真实 pi 1.5.2 录制的事件序列转录，非自建 mock）：
//   I3 golden-prompt-basic 回放：同 I1 断言（user 回声单条、id 贯通、回声先于助手消息）；
//   I4 golden-steer-followup 回放：运行中 steer/follow_up 混合注入的时序与回声关联断言（乱序投递）。
// 回放机制：fake-pi-cli.js FAKE_PI_REPLAY 模式（录制游标 + 输入命令序列一致性断言，零网络零时钟）。
// fixture 防漂移：驱动文本直接取自 fixture 的 in 命令（重录制后测试自动跟随）。
// 外部契约锚点：json.md「Event sequence」L30–46 /「Queue and state events」L121–122、
// rpc-commands.md「Prompting」L46–92；fixture 头注释含录制命令/版本/脱敏声明。

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
const GOLDEN_DIR = fileURLToPath(new URL("../fixtures/golden", import.meta.url));
const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-golden-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

interface FixtureCommand {
  type: string;
  message?: string;
}

/** 解析 fixture 的 in 命令（剥离 # 注释行）——回放驱动与防漂移断言的数据源。 */
function fixtureCommands(fixturePath: string): FixtureCommand[] {
  const raw = fs.readFileSync(fixturePath, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as { dir: string; record: FixtureCommand })
    .filter((e) => e.dir === "in")
    .map((e) => e.record);
}

/** fixture 的 out 事件里按类型收集（时序断言用）。 */
function fixtureEvents(fixturePath: string, type: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(fixturePath, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as { dir: string; record: Record<string, unknown> })
    .filter((e) => e.dir === "out" && e.record.type === type)
    .map((e) => e.record);
}

function makeReplayBridge(fixturePath: string): { bridge: PiBridge; events: BridgeEvent[] } {
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli replay" };
  const bridge = new PiBridge({
    cwd: workDir,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command,
        args,
        cwd,
        env: { ...process.env, FAKE_PI_REPLAY: fixturePath },
      }) as unknown as PiRpcClient,
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

const userMessages = (events: BridgeEvent[]) =>
  events.filter((e) => e.kind === "user_message") as unknown as Array<{ id: string; text: string }>;
const userFinals = (events: BridgeEvent[]) =>
  events.filter(
    (e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user"
  ) as unknown as Array<{ messageId: string; message: { blocks: Array<{ type: string; text?: string }> } }>;
const textOf = (blocks: Array<{ type: string; text?: string }>): string => blocks.find((b) => b.type === "text")?.text ?? "";

describe("FR-CHAT-11 golden fixture 回放（TASK-008 §10.12 D8/D9 I3/I4）", () => {
  it("I3 ① golden-prompt-basic：真实 pi 录制序列回放——user 回声单条、id 贯通、回声先于助手消息", async () => {
    const commands = fixtureCommands(PROMPT_BASIC_FIXTURE);
    const sends = commands.filter((c) => ["prompt", "steer", "follow_up"].includes(c.type));
    expect(sends.map((c) => c.type)).toEqual(["prompt"]); // 剧本形状自检：单次 prompt
    // fixture 本身确实记录了 user 回声（回声期望来自真实 pi，非自建 mock）
    const recordedUserEchoes = fixtureEvents(PROMPT_BASIC_FIXTURE, "message_end").filter(
      (m) => (m.message as { role?: string })?.role === "user"
    );
    expect(recordedUserEchoes).toHaveLength(1);

    const { bridge, events } = makeReplayBridge(PROMPT_BASIC_FIXTURE);
    await bridge.start();
    await bridge.sendPrompt(String(sends[0].message));
    await waitFor(() => bridge.getRunState() === "idle", 8000, "golden basic settled");

    // 回声终稿恰一条且复用乐观条目 id（D1；webview messageViews 命中 → finalize 就地更新）
    const finals = userFinals(events);
    const messages = userMessages(events);
    expect(finals).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(finals[0].messageId).toBe(messages[0].id);
    expect(textOf(finals[0].message.blocks)).toBe(messages[0].text);

    // 回声先于该轮助手消息（json.md L30–46；golden 录制序列）
    const userFinalIdx = events.findIndex(
      (e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user"
    );
    const streamStartIdx = events.findIndex((e) => e.kind === "stream_start");
    expect(userFinalIdx).toBeGreaterThanOrEqual(0);
    expect(streamStartIdx).toBeGreaterThan(userFinalIdx);

    // uiMessages：恰一条 user + 一条 assistant
    const ui = bridge.getUiMessages();
    expect(ui.filter((m) => m.role === "user")).toHaveLength(1);
    expect(ui.filter((m) => m.role === "assistant")).toHaveLength(1);

    await bridge.dispose();
  });

  it("I4 ②④ golden-steer-followup：注入时序与回声关联——乱序投递各恰一条、不错换", async () => {
    const commands = fixtureCommands(STEER_FOLLOWUP_FIXTURE);
    const sends = commands.filter((c) => ["prompt", "steer", "follow_up"].includes(c.type));
    expect(sends.map((c) => c.type)).toEqual(["prompt", "follow_up", "steer"]); // 发送序：follow_up 先发、steer 后发
    // fixture 录制实证：user 回声到达顺序 = prompt → steer → follow_up（投递序 ≠ 发送序）
    const echoOrder = fixtureEvents(STEER_FOLLOWUP_FIXTURE, "message_end")
      .filter((m) => (m.message as { role?: string })?.role === "user")
      .map((m) => {
        const content = (m.message as { content: unknown }).content;
        if (typeof content === "string") return content;
        return (content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("");
      })
      .map((t) => t.slice(0, 12));
    expect(echoOrder).toEqual(["GOLDEN-STEER", "GOLDEN-ST se", "GOLDEN-FU se"]);
    // fixture 录制实证：queue_update 两次入队 + 两次出队（快照语义）
    const queueUpdates = fixtureEvents(STEER_FOLLOWUP_FIXTURE, "queue_update");
    expect(queueUpdates.length).toBeGreaterThanOrEqual(4);

    const { bridge, events } = makeReplayBridge(STEER_FOLLOWUP_FIXTURE);
    await bridge.start();
    await bridge.sendPrompt(String(sends[0].message)); // 主 prompt（慢速流式，录制窗口）
    await waitFor(() => events.some((e) => e.kind === "text_delta"), 8000, "golden first delta");
    await bridge.sendPrompt(String(sends[1].message), "followUp");
    await bridge.sendPrompt(String(sends[2].message), "steer");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "golden mixed settled");

    // 三次发送各恰一条 user（发送序保持）
    const ui = bridge.getUiMessages().filter((m) => m.role === "user");
    expect(ui.map((m) => textOf(m.blocks))).toEqual(sends.map((c) => String(c.message)));

    // 回声（投递）顺序与发送顺序不同：主 prompt → steer（后发先投）→ follow_up（先发后投）；
    // 各自命中正确条目（不错换）
    const finals = userFinals(events);
    expect(finals.map((f) => textOf(f.message.blocks))).toEqual([
      String(sends[0].message),
      String(sends[2].message),
      String(sends[1].message),
    ]);
    const byText = new Map(userMessages(events).map((m) => [m.text, m.id]));
    for (const f of finals) {
      expect(f.messageId).toBe(byText.get(textOf(f.message.blocks)));
    }

    // 文本保真（④）+ 助手轮数 = 3（主轮 + steer 注入轮 + follow_up 注入轮）
    for (const m of userMessages(events)) {
      const entry = bridge.getUiMessages().find((x) => x.id === m.id);
      expect(textOf(entry?.blocks ?? [])).toBe(m.text);
    }
    expect(bridge.getUiMessages().filter((m) => m.role === "assistant")).toHaveLength(3);

    await bridge.dispose();
  });
});

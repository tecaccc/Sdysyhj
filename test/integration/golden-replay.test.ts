// TASK-008 / FR-CHAT-11 golden fixture 回放回归（§10.12 D9 I3/I4，D8 回放层）。
// 期望源 = test/fixtures/golden/*.jsonl（真实 pi 1.5.2 录制的事件序列转录，非自建 mock）：
//   I3 golden-prompt-basic 回放：同 I1 断言（user 回声单条、id 贯通、回声先于助手消息）；
//   I4 golden-steer-followup 回放：运行中 steer/follow_up 混合注入的时序与回声关联断言（乱序投递）；
//   I5 golden-timing-interleave 回放（TASK-011 批次 D / Issue #7 R-06 / P-06 类别①）：时序交织类剧本
//     （synthetic 留痕，见 fixture 头注释）——entry_appended 物理落盘 × 真实 SessionFileWatcher 轮询
//     × markSynced 窗口（#D-01）：窗口内零误报、外部写入检出、刷新后零复发。
// 回放机制：fake-pi-cli.js FAKE_PI_REPLAY 模式（录制游标 + 输入命令序列一致性断言，零网络零时钟；
// FAKE_PI_SESSION_FILE 设置时 entry_appended 事件行同步物理落盘 = 回放层文件系统面，G1 封堵）。
// fixture 防漂移：驱动文本直接取自 fixture 的 in 命令（重录制后测试自动跟随）。
// 外部契约锚点：json.md「Event sequence」L30–46 /「Queue and state events」L121–122、
// rpc-commands.md「Prompting」L46–92；fixture 头注释含录制命令/版本/脱敏声明。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient, type SessionWatcherLike } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { MemoryLogger } from "../../src/util/log";
import { SessionFileWatcher } from "../../src/session/sessionStore";

const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL("../fixtures/golden", import.meta.url));
const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");
const TIMING_INTERLEAVE_FIXTURE = path.join(GOLDEN_DIR, "golden-timing-interleave.jsonl");
/** 时序交织剧本 get_state.sessionFile 占位符：测试物化替换为真实临时会话文件路径。 */
const TIMING_SESSION_PLACEHOLDER = "GOLDEN-TIMING-SESSION-FILE";

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

interface ReplayBridgeOpts {
  /** 追加注入子进程的环境变量（FAKE_PI_SESSION_FILE 等；FAKE_PI_REPLAY 始终由 fixturePath 指定） */
  env?: NodeJS.ProcessEnv;
  /** 外部修改监视工厂（时序交织剧本注入真实 SessionFileWatcher 短轮询周期） */
  createWatcher?: (onExternalChange: () => void) => SessionWatcherLike;
}

function makeReplayBridge(fixturePath: string, opts: ReplayBridgeOpts = {}): { bridge: PiBridge; events: BridgeEvent[] } {
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
        env: { ...process.env, ...opts.env, FAKE_PI_REPLAY: fixturePath },
      }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
    ...(opts.createWatcher ? { createWatcher: opts.createWatcher } : {}),
  });
  bridge.onAny((event) => events.push(event));
  return { bridge, events };
}

/**
 * 时序交织剧本物化：get_state.sessionFile 占位符替换为真实临时会话文件路径（与 FAKE_PI_SESSION_FILE
 * 同一路径——回放层 fs 面落盘目标 = watcher 跟踪目标），写入 workDir 后作为 FAKE_PI_REPLAY 输入；
 * 期望值断言仍读仓库内原 fixture（两文件仅 sessionFile 字段不同）。
 */
function materializeTimingFixture(sessionFile: string): string {
  const raw = fs.readFileSync(TIMING_INTERLEAVE_FIXTURE, "utf8");
  // 仅替换带引号的占位符出现（fixture 头注释中占位符不带引号；替换后 get_state.sessionFile = 真实路径）
  const materialized = raw.split(`"${TIMING_SESSION_PLACEHOLDER}"`).join(JSON.stringify(sessionFile));
  const out = path.join(workDir, "golden-timing-interleave.materialized.jsonl");
  fs.writeFileSync(out, materialized);
  return out;
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

describe("P-06 类别① golden-timing-interleave 时序交织回放（TASK-011 批次 D / Issue #7 R-06）", () => {
  it(
    "I5 ③ entry_appended 落盘 × 轮询窗口零误报；外部写入检出；刷新后零复发（#D-01 三重豁免）",
    async () => {
      // 剧本形状自检（防漂移）：prompt + 流式中途 steer；消息流中途 entry_appended ≥4；末条 in = get_messages（刷新通道）
      const commands = fixtureCommands(TIMING_INTERLEAVE_FIXTURE);
      const sends = commands.filter((c) => ["prompt", "steer", "follow_up"].includes(c.type));
      expect(sends.map((c) => c.type)).toEqual(["prompt", "steer"]);
      expect(fixtureEvents(TIMING_INTERLEAVE_FIXTURE, "entry_appended").length).toBe(4);
      expect(commands[commands.length - 1].type).toBe("get_messages");

      // 既有会话（文件已存在）→ 启动即进入跟踪（与 pi-bridge Issue #1 回归同前置态）
      const sessionFile = path.join(workDir, "timing-interleave-session.jsonl");
      fs.writeFileSync(
        sessionFile,
        JSON.stringify({ type: "session", version: 3, id: "timing-interleave", timestamp: "1970-01-01T00:00:00.000Z", cwd: workDir }) + "\n"
      );
      const replayFixture = materializeTimingFixture(sessionFile);

      const { bridge, events } = makeReplayBridge(replayFixture, {
        env: { FAKE_PI_SESSION_FILE: sessionFile },
        // 真实 SessionFileWatcher + 短轮询周期（50ms）：与生产同检测语义，窗口内 ≥10 个轮询周期
        createWatcher: (cb) => new SessionFileWatcher({ intervalMs: 50, onExternalChange: cb }),
      });
      await bridge.start();

      // 主 prompt：turn_start 边界 entry_appended（回放层 fs 面物理落盘）→ 流式打开
      await bridge.sendPrompt(String(sends[0].message));
      await waitFor(() => events.some((e) => e.kind === "text_delta"), 8000, "golden timing first delta");

      // #D-01 窗口重放：落盘已发生、流未结束，持有窗口 500ms（≥10 个轮询周期）——零误报
      //（运行态挂起吸收 + entry_appended 即时 markSynced 双豁免同时在场，golden 通道实证）
      await new Promise((r) => setTimeout(r, 500));
      expect(events.some((e) => e.kind === "external_change")).toBe(false);

      // 流式中途 steer：剧本在轮间边界投递（出队 + entry_appended + 回声 → 第二轮 → 终稿落盘）
      await bridge.sendPrompt(String(sends[1].message), "steer");
      await waitFor(() => bridge.getRunState() === "idle", 8000, "golden timing settled");
      expect(events.some((e) => e.kind === "external_change")).toBe(false); // 全程误报为零

      // 回放层文件系统面实证：4 条 entry 物理落盘（会话头 + e-timing-1..4，顺序与 fixture 一致）
      const lines = fs
        .readFileSync(sessionFile, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { id?: string });
      expect(lines.map((l) => l.id)).toEqual(["timing-interleave", "e-timing-1", "e-timing-2", "e-timing-3", "e-timing-4"]);

      // 真实外部写入（无 entry_appended 伴随，模拟终端 pi 追加同一会话）→ 一个轮询周期内检出
      fs.appendFileSync(
        sessionFile,
        JSON.stringify({
          type: "message",
          id: "e-external",
          parentId: null,
          timestamp: "1970-01-01T00:00:00.000Z",
          message: { role: "user", content: "terminal pi", timestamp: 0 },
        }) + "\n"
      );
      await waitFor(() => events.some((e) => e.kind === "external_change"), 5000, "external change detected");

      // 检出后拦截（FR-SESS-07 口径 C：外部修改未刷新前阻止继续交互）
      await bridge.sendPrompt("after-external");
      const errors = events.filter((e) => e.kind === "error") as Array<{ message: string }>;
      expect(errors.some((e) => e.message.includes("拦截"))).toBe(true);

      // 刷新（reloadHistory → fixture 末条 get_messages in 命令）→ markSynced 重置基线 → 会话已刷新
      await bridge.reloadHistory();
      const toasts = events.filter((e) => e.kind === "toast") as Array<{ text: string }>;
      expect(toasts.some((t) => t.text === "会话已刷新")).toBe(true);
      const detected = events.filter((e) => e.kind === "external_change").length;

      // 刷新后再观察 ≥8 个轮询周期：零复发（markSynced 窗口时序——基线已重置）
      await new Promise((r) => setTimeout(r, 400));
      expect(events.filter((e) => e.kind === "external_change")).toHaveLength(detected);

      // 刷新后历史 = fixture 末条 get_messages 权威重建（2 user + 2 assistant）
      expect(bridge.getUiMessages()).toHaveLength(4);

      await bridge.dispose();
    },
    30000
  );
});

// 集成测试：PiBridge + RpcClient + 真实 mock 子进程（fake-pi-cli.js）。
// 覆盖：prompt→工具链→settled、崩溃自动重启、会话切换历史恢复（FR-SESS-03）。

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

let logDir: string;
let logFile: string;

beforeEach(() => {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-int-"));
  logFile = path.join(logDir, "fake-pi.log");
});

afterEach(() => {
  fs.rmSync(logDir, { recursive: true, force: true });
});

function makeBridge(options: { env?: Record<string, string> } = {}): { bridge: PiBridge; events: BridgeEvent[] } {
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = {
    source: "bundled",
    command: process.execPath,
    baseArgs: [FAKE_CLI],
    detail: "fake cli",
  };
  const bridge = new PiBridge({
    cwd: logDir,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command,
        args,
        cwd,
        env: { ...process.env, FAKE_PI_LOG: logFile, ...options.env },
      }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((event) => events.push(event));
  return { bridge, events };
}

function spawnCount(): number {
  try {
    return fs
      .readFileSync(logFile, "utf8")
      .split("\n")
      .filter((l) => l.includes('"event":"spawn"')).length;
  } catch {
    return 0;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("PiBridge + mock 子进程集成", () => {
  it("启动 → prompt → 工具调用链 → settled（含 thinking/tool 卡片事件）", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();
    expect(spawnCount()).toBe(1);

    await bridge.sendPrompt("TOOL");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "run settled");

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("stream_start");
    expect(kinds).toContain("thinking_delta");
    expect(kinds).toContain("toolcall_start");
    expect(kinds).toContain("toolcall_status");
    expect(kinds).toContain("message_final");

    // 工具卡片终态：成功 + 输出
    const statuses = events.filter((e) => e.kind === "toolcall_status") as Array<{ toolCallId: string; status: string; output?: string }>;
    const finalStatus = statuses.filter((s) => s.toolCallId === "call_1").pop();
    expect(finalStatus?.status).toBe("success");
    expect(finalStatus?.output).toContain("line-1");

    // 快照：工具轮（含卡片）+ 总结轮均在案
    const ui = bridge.getUiMessages();
    const toolMsg = ui.find((m) => m.blocks.some((b) => b.type === "toolcall"));
    expect(toolMsg).toBeTruthy();
    expect(ui.some((m) => m.blocks.some((b) => b.type === "text" && b.text === "Done."))).toBe(true);

    await bridge.dispose();
  });

  it("错误运行（ERROR）：错误展示 + 状态恢复", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("ERROR");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "error run settled");

    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.some((e) => e.message.includes("mock provider error"))).toBe(true);
    expect(errors.some((e) => Boolean(e.hint))).toBe(true);

    await bridge.dispose();
  });

  it("子进程崩溃 → 自动重启一次；再崩溃 → error 态 + 可行动指引（NFR-02/FR-CHAT-07）", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("CRASH_NOW");
    await waitFor(() => spawnCount() >= 2, 8000, "auto restart");
    await waitFor(() => bridge.getRunState() !== "streaming" && bridge.getRunState() !== "starting", 8000, "crash handled");

    const errors1 = events.filter((e) => e.kind === "error") as Array<{ message: string }>;
    expect(errors1.some((e) => e.message.includes("自动重启一次"))).toBe(true);

    // 重启后的子进程再次崩溃
    await bridge.sendPrompt("CRASH_NOW");
    await waitFor(() => bridge.getRunState() === "error", 8000, "second crash → error");
    const errors2 = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors2.some((e) => e.message.includes("反复崩溃"))).toBe(true);
    expect(errors2.some((e) => (e.hint ?? "").includes("pi auth"))).toBe(true);

    await bridge.dispose();
  });

  it("会话切换：历史恢复（session_reset + history_loaded）", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.switchSession(path.join(logDir, "other-session.jsonl"));
    await waitFor(() => events.some((e) => e.kind === "history_loaded"), 8000, "history loaded");

    expect(events.some((e) => e.kind === "session_reset")).toBe(true);
    const history = events.filter((e) => e.kind === "history_loaded").pop() as unknown as {
      messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }>;
    };
    expect(history.messages.some((m) => m.role === "user")).toBe(true);
    expect(history.messages.some((m) => m.role === "assistant")).toBe(true);

    await bridge.dispose();
  });

  it("新建会话清空历史（FR-SESS-01）", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();
    await bridge.sendPrompt("hello");
    await waitFor(() => bridge.getRunState() === "idle", 8000, "first run");

    await bridge.newSession();
    await waitFor(() => events.some((e) => e.kind === "history_loaded"), 8000, "history reset");
    const history = events.filter((e) => e.kind === "history_loaded").pop() as unknown as { messages: unknown[] };
    expect(history.messages.length).toBe(0);

    await bridge.dispose();
  });

  it("steer 插话排队（FR-CHAT-06）", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    await bridge.sendPrompt("LONG");
    await waitFor(() => bridge.getRunState() === "streaming", 8000, "streaming");
    await bridge.sendPrompt("mid-run steer", "auto");
    await waitFor(() => events.some((e) => e.kind === "toast"), 4000, "steer queued");

    await bridge.abort();
    await waitFor(() => bridge.getRunState() === "aborted", 8000, "aborted");
    expect(events.some((e) => e.kind === "message_final")).toBe(true);

    await bridge.dispose();
  });

  it("dispose 强制停止子进程（无僵尸）", async () => {
    const { bridge } = makeBridge();
    await bridge.start();
    expect(spawnCount()).toBe(1);
    await bridge.dispose();
    await new Promise((r) => setTimeout(r, 200));
    expect(bridge.getRunState()).not.toBe("streaming");
  });

  it("NFR-01 代理：≥600 delta 零丢失 + 全量渲染 ≤30s", async () => {
    const { bridge, events } = makeBridge();
    await bridge.start();

    const t0 = Date.now();
    await bridge.sendPrompt("FLOOD");
    await waitFor(() => bridge.getRunState() === "idle", 30_000, "flood settled");
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(30_000);

    // 600 个 delta 零丢失：逐段拼接 == 权威终稿全文
    const deltas = events
      .filter((e) => e.kind === "text_delta")
      .map((e) => (e as unknown as { delta: string }).delta);
    expect(deltas.length).toBe(600);
    const assembled = deltas.join("");
    expect(assembled).toBe(deltas.map((_, i) => `d${String(i + 1).padStart(3, "0")} `).join(""));
    const final = events.filter((e) => e.kind === "message_final").pop() as unknown as {
      message: { blocks: Array<{ type: string; text?: string }> };
    };
    expect(final.message.blocks[0].text).toBe(assembled);
    // 快照同样完整
    const ui = bridge.getUiMessages();
    const lastAssistant = [...ui].reverse().find((m) => m.role === "assistant");
    expect(lastAssistant?.blocks[0]).toEqual({ type: "text", text: assembled });

    await bridge.dispose();
  });

  it("FR-SESS-03：切换会话重放历史与会话 JSONL 一致（含压缩状态条目）", async () => {
    // 构造会话 JSONL fixture（含压缩状态条目，线性分支）
    const sessionJsonl = path.join(logDir, "fixture-session.jsonl");
    const userMsg = { role: "user", content: "帮我看看 a.ts", timestamp: 1 };
    const assistant1 = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "先读文件" },
        { type: "text", text: "好的，已读取 a.ts" },
        { type: "toolCall", id: "call_j1", name: "read", arguments: { path: "src/a.ts" } },
      ],
      api: "mock",
      provider: "mock",
      model: "mock-alpha",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
      stopReason: "toolUse",
      timestamp: 2,
    };
    const toolResult = {
      role: "toolResult",
      toolCallId: "call_j1",
      toolName: "read",
      content: [{ type: "text", text: "文件内容……" }],
      isError: false,
      timestamp: 3,
    };
    const assistant2 = {
      role: "assistant",
      content: [{ type: "text", text: "a.ts 是一个工具模块。" }],
      api: "mock",
      provider: "mock",
      model: "mock-alpha",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
      stopReason: "stop",
      timestamp: 4,
    };
    const lines = [
      { type: "session", version: 3, id: "jsonl-consistency", timestamp: "2026-01-01T00:00:00.000Z", cwd: logDir },
      { type: "compaction", id: "c1", parentId: null, timestamp: "t", reason: "threshold", summary: "前情提要：正在分析 a.ts", firstKeptEntryId: "e2" },
      { type: "message", id: "e1", parentId: null, timestamp: "t", message: userMsg },
      { type: "message", id: "e2", parentId: "e1", timestamp: "t", message: assistant1 },
      { type: "message", id: "e3", parentId: "e2", timestamp: "t", message: toolResult },
      { type: "message", id: "e4", parentId: "e3", timestamp: "t", message: assistant2 },
    ];
    fs.writeFileSync(sessionJsonl, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    // 会话 JSONL 的消息条目（含压缩后的活动分支）→ mock 子进程返回集
    const fixturePath = path.join(logDir, "fixture-messages.json");
    fs.writeFileSync(fixturePath, JSON.stringify([userMsg, assistant1, toolResult, assistant2]));

    const { bridge, events } = makeBridge({ env: { FAKE_PI_FIXTURE: fixturePath } });
    await bridge.start();

    await bridge.switchSession(sessionJsonl);
    await waitFor(() => events.some((e) => e.kind === "history_loaded"), 8000, "history loaded");

    // mock 子进程确实收到 switch_session（上下文/压缩状态由 pi 侧权威恢复）
    const log = fs.readFileSync(logFile, "utf8");
    expect(log).toContain('"type":"switch_session"');
    expect(log).toContain(sessionJsonl);

    // 重放历史与 JSONL 消息 1:1 一致
    const history = events.filter((e) => e.kind === "history_loaded").pop() as unknown as {
      messages: Array<{ role: string; blocks: Array<Record<string, unknown>> }>;
    };
    expect(history.messages.length).toBe(3); // user + assistant(含 toolcall) + assistant（toolResult 折叠进卡片）
    const [u, a1, a2] = history.messages;
    expect(u.role).toBe("user");
    expect(u.blocks[0]).toEqual({ type: "text", text: "帮我看看 a.ts" });
    expect(a1.role).toBe("assistant");
    expect(a1.blocks[0]).toEqual({ type: "thinking", text: "先读文件" });
    expect(a1.blocks[1]).toEqual({ type: "text", text: "好的，已读取 a.ts" });
    const card = a1.blocks[2] as unknown as { type: string; id: string; tool: string; args: string; status: string; output: string };
    expect(card.type).toBe("toolcall");
    expect(card.id).toBe("call_j1");
    expect(card.tool).toBe("read");
    expect(card.args).toBe(JSON.stringify({ path: "src/a.ts" }));
    expect(card.status).toBe("success");
    expect(card.output).toBe("文件内容……");
    expect(a2.blocks[0]).toEqual({ type: "text", text: "a.ts 是一个工具模块。" });

    await bridge.dispose();
  });
});

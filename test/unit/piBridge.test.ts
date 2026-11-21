// PiBridge 单测：事件翻译、运行状态机、崩溃恢复、steer、工具卡片截断（FakeRpcClient 注入）。
// 含 Issue #1（#D-01/#D-02）外部修改检测回归：运行态门控 / entry_appended 豁免 / settled 补学。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PiBridge, type BridgeEvent, type SessionWatcherLike } from "../../src/bridge/piBridge";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import type { AgentMessage, ModelInfo, RpcEvent } from "../../src/bridge/protocol";
import { SessionFileWatcher } from "../../src/session/sessionStore";
import { MemoryLogger, createRedactingLogger } from "../../src/util/log";
import { FakeRpcClient } from "../helpers/fake-rpc-client";

const runtime: ResolvedRuntime = { source: "bundled", command: "node", baseArgs: ["/tmp/cli.js"], detail: "test" };

/** 假 watcher 模式下的调用记录（realWatcher 模式不记录） */
interface FakeWatcherCalls {
  track: Array<string | null>;
  markSynced: number;
  setSuspended: boolean[];
}

interface Harness {
  bridge: PiBridge;
  fakes: FakeRpcClient[];
  events: BridgeEvent[];
  logger: MemoryLogger;
  watcher: { cb: (() => void) | null; watcher: SessionWatcherLike };
  calls: FakeWatcherCalls;
}

function makeBridge(
  options: {
    tailLines?: number;
    sendMode?: "steer" | "followUp";
    thinkingDefault?: string;
    promptResult?: { ok: boolean; disposition?: string; error?: string };
    /** 启动前注入 fake.state.model（如 contextWindow，FR-MOD-04） */
    initialModel?: ModelInfo;
    /** 注入真实 SessionFileWatcher（文件级回归）；sessionFile 同时作为 fake.state.sessionFile 初始值（null=无，#D-02 场景） */
    realWatcher?: { sessionFile: string | null; intervalMs: number };
  } = {}
): Harness {
  const fakes: FakeRpcClient[] = [];
  const events: BridgeEvent[] = [];
  const logger = new MemoryLogger();
  const watcher: Harness["watcher"] = { cb: null, watcher: null as unknown as SessionWatcherLike };
  const calls: FakeWatcherCalls = { track: [], markSynced: 0, setSuspended: [] };
  const bridge = new PiBridge({
    cwd: "/tmp",
    runtime,
    createClient: () => {
      const fake = new FakeRpcClient();
      if (options.promptResult) fake.promptResult = options.promptResult;
      if (options.initialModel) fake.state.model = options.initialModel;
      if (options.realWatcher) fake.state.sessionFile = options.realWatcher.sessionFile ?? undefined;
      fakes.push(fake);
      return fake;
    },
    logger,
    tailLines: options.tailLines ?? 200,
    sendMode: options.sendMode ?? "steer",
    thinkingDefault: options.thinkingDefault,
    createWatcher: (cb) => {
      watcher.cb = cb;
      if (options.realWatcher) {
        const impl = new SessionFileWatcher({ intervalMs: options.realWatcher.intervalMs, onExternalChange: cb });
        watcher.watcher = impl;
        return impl;
      }
      const impl: SessionWatcherLike = {
        track: (p) => calls.track.push(p),
        markSynced: () => (calls.markSynced += 1),
        setSuspended: (s) => calls.setSuspended.push(s),
        start: () => undefined,
        dispose: () => undefined,
      };
      watcher.watcher = impl;
      return impl;
    },
  });
  bridge.onAny((event) => events.push(event));
  return { bridge, fakes, events, logger, watcher, calls };
}

function kinds(events: BridgeEvent[]): string[] {
  return events.map((e) => e.kind);
}

/** 模拟一次简单文本运行的事件序列。 */
function emitSimpleRun(fake: FakeRpcClient, text: string): void {
  fake.emit({ type: "agent_start" });
  fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
  fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text } });
  fake.emit({
    type: "message_end",
    message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", timestamp: 1 },
  });
  fake.emit({ type: "agent_settled", aborted: false });
}

describe("PiBridge 状态机与事件翻译", () => {
  it("启动后加载状态与历史", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    fake.messages = [
      { role: "user", content: "hello", timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "hi" }], stopReason: "stop", timestamp: 2 },
    ] as AgentMessage[];
    await bridge.reloadHistory();

    expect(kinds(events)).toContain("model_info");
    const history = events.filter((e) => e.kind === "history_loaded").pop() as { messages: unknown[] } | undefined;
    expect(history).toBeTruthy();
  });

  it("prompt → 流式 → settled 全链路；run_state 转移 starting→streaming→idle", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("hello");
    emitSimpleRun(fake, "Hello");

    expect(kinds(events)).toEqual([
      "model_info",
      "history_loaded",
      "user_message",
      "run_state", // starting
      "run_state", // streaming（agent_start）
      "stream_start",
      "text_delta",
      "message_final",
      "run_state", // idle
    ]);
    const states = events.filter((e) => e.kind === "run_state").map((e) => (e as { state: string }).state);
    expect(states).toEqual(["starting", "streaming", "idle"]);
    const final = events.find((e) => e.kind === "message_final") as { message: { blocks: Array<{ type: string; text?: string }> } };
    expect(final.message.blocks[0].text).toBe("Hello");
  });

  it("message_end 为权威终稿，覆盖流式增量", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("hi");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" } });
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Hello world! (final)" }], stopReason: "stop", timestamp: 1 },
    });

    const final = events.filter((e) => e.kind === "message_final").pop() as { message: { blocks: Array<{ type: string; text?: string }> } };
    expect(final.message.blocks[0].text).toBe("Hello world! (final)");
  });

  it("abort：agent_settled(aborted) → 状态流 streaming→aborted→idle，历史保留（缺陷#3 回归，口径 A）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("hi");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "partial" } });
    await bridge.abort();
    expect(fake.aborts).toBe(1);
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "partial" }], stopReason: "aborted", timestamp: 1 },
    });
    fake.emit({ type: "agent_settled", aborted: true });

    const states = events.filter((e) => e.kind === "run_state").map((e) => (e as { state: string }).state);
    // 口径 A：settled 后必须回 idle；“已中止”为消息级标记
    expect(states.join("→")).toContain("streaming→aborted→idle");
    expect(states[states.length - 1]).toBe("idle");
    expect(bridge.getRunState()).toBe("idle");
    const final = events.filter((e) => e.kind === "message_final").pop() as { message: { aborted?: boolean } };
    expect(final.message.aborted).toBe(true);
  });

  it("运行中发送 → steer 排队（FR-CHAT-06）", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("start");
    fake.emit({ type: "agent_start" });
    await bridge.sendPrompt("mid-run message", "auto");

    expect(fake.steers).toEqual(["mid-run message"]);
    expect(kinds(events)).toContain("toast");
  });

  it("运行中发送 follow-up 模式", async () => {
    const { bridge, fakes } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("start");
    fake.emit({ type: "agent_start" });
    await bridge.sendPrompt("later", "followUp");

    expect(fake.followUps).toEqual(["later"]);
  });

  it("工具卡片：执行状态 + 输出截断保留尾部 + 复制全部取全量（FR-CHAT-04）", async () => {
    const { bridge, fakes, events } = makeBridge({ tailLines: 2 });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("do it");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, id: "call_1", toolName: "bash" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0, delta: '{"command":"ls"}' } });
    fake.emit({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
        toolCall: { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } },
      },
    });
    fake.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: 1,
      },
    });
    fake.emit({ type: "tool_execution_start", toolCallId: "call_1", toolName: "bash", args: { command: "ls" } });
    const bigOutput = "a\nb\nc\nd";
    fake.emit({
      type: "tool_execution_end",
      toolCallId: "call_1",
      result: { content: [{ type: "text", text: bigOutput }] },
      isError: false,
    });
    fake.emit({
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "bash",
        content: [{ type: "text", text: bigOutput }],
        isError: false,
        timestamp: 2,
      },
    });
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop", timestamp: 3 },
    });
    fake.emit({ type: "agent_settled", aborted: false });

    const statuses = events.filter((e) => e.kind === "toolcall_status") as Array<{
      status: string;
      output?: string;
      outputTruncated?: boolean;
    }>;
    expect(statuses[0].status).toBe("running");
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe("success");
    expect(last.outputTruncated).toBe(true);
    expect(last.output).toBe("c\nd"); // 保留尾部 2 行
    expect(bridge.getToolOutput("call_1")).toBe(bigOutput); // 复制全部取全量

    // 权威快照中的卡片同样是终态
    const ui = bridge.getUiMessages();
    const toolMsg = ui.find((m) => m.blocks.some((b) => b.type === "toolcall"));
    const block = toolMsg?.blocks.find((b) => b.type === "toolcall");
    expect(block && block.type === "toolcall" && block.status).toBe("success");
  });

  it("#D-04 时序契约：工具执行结果晚于含工具卡的 message_final 到达时，toolcall_status 仍随后发出且可按 messageId/toolCallId 路由（FR-CHAT-04，直播路径）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("run tool");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, id: "call_d4", toolName: "read" } });
    // 含工具卡的助手消息终稿先行到达（message_final）
    fake.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_d4", name: "read", arguments: { path: "src/a.ts" } }],
        stopReason: "toolUse",
        timestamp: 1,
      },
    });
    const finalIdx = events.findIndex(
      (e) => e.kind === "message_final" && e.messageId !== undefined && (e as { message: { blocks: unknown[] } }).message.blocks.length > 0
    );
    expect(finalIdx).toBeGreaterThanOrEqual(0);
    const finalEvent = events[finalIdx] as { kind: "message_final"; messageId: string; message: { blocks: Array<{ type: string; id?: string; status?: string }> } };
    const finalToolBlock = finalEvent.message.blocks.find((b) => b.type === "toolcall");
    expect(finalToolBlock).toBeDefined();
    expect(finalToolBlock && finalToolBlock.status).toBe("running"); // final 时执行结果未到：进行中

    // 工具执行结果事件在 final 之后才到达（#D-04 必现时序）
    fake.emit({ type: "tool_execution_start", toolCallId: "call_d4", toolName: "read", args: { path: "src/a.ts" } });
    fake.emit({
      type: "tool_execution_end",
      toolCallId: "call_d4",
      result: { content: [{ type: "text", text: "file body" }] },
      isError: false,
    });
    fake.emit({
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "call_d4",
        toolName: "read",
        content: [{ type: "text", text: "file body" }],
        isError: false,
        timestamp: 2,
      },
    });

    // 迟到的状态事件仍以同一 messageId/toolCallId 发出（webview 修复后按此路由命中卡片）
    const lateStatuses = events
      .slice(finalIdx + 1)
      .filter((e) => e.kind === "toolcall_status") as Array<{ messageId: string; toolCallId: string; status: string }>;
    expect(lateStatuses.length).toBeGreaterThan(0);
    expect(lateStatuses.every((s) => s.messageId === finalEvent.messageId)).toBe(true);
    const settled = lateStatuses[lateStatuses.length - 1];
    expect(settled.toolCallId).toBe("call_d4");
    expect(settled.status).toBe("success");

    // 权威快照同步收敛为终态
    const ui = bridge.getUiMessages();
    const msg = ui.find((m) => m.id === finalEvent.messageId);
    const block = msg?.blocks.find((b) => b.type === "toolcall");
    expect(block && block.type === "toolcall" && block.status).toBe("success");
  });

  it("工具失败状态（isError）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("do it");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, id: "call_x", toolName: "bash" } });
    fake.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_x", name: "bash", arguments: { command: "bad" } }],
        stopReason: "toolUse",
        timestamp: 1,
      },
    });
    fake.emit({
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "call_x",
        toolName: "bash",
        content: [{ type: "text", text: "command failed" }],
        isError: true,
        timestamp: 2,
      },
    });

    const statuses = events.filter((e) => e.kind === "toolcall_status") as Array<{ status: string }>;
    expect(statuses[statuses.length - 1].status).toBe("error");
  });

  it("子进程崩溃自动重启一次并提示（NFR-02）；再次崩溃进入 error", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    fakes[0].crash(3, "segfault");

    await waitFor(() => fakes.length === 2);
    expect(kinds(events)).toContain("toast");
    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.some((e) => e.message.includes("自动重启一次"))).toBe(true);

    fakes[1].crash(3, "segfault again");
    await waitFor(() => bridge.getRunState() === "error");
    const errors2 = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors2.some((e) => e.message.includes("反复崩溃"))).toBe(true);
    expect(errors2.some((e) => (e.hint ?? "").includes("pi auth"))).toBe(true);
  });

  it("prompt 被拒：错误展示 + 恢复可输入（FR-CHAT-05/07）", async () => {
    const { bridge, fakes, events } = makeBridge({ promptResult: { ok: false, error: "already streaming" } });
    await bridge.start();
    await bridge.sendPrompt("hi");

    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("already streaming");
    expect(errors[0].hint).toBeTruthy();
    expect(bridge.getRunState()).toBe("idle");
  });

  it("provider 报错（stopReason=error）展示可读信息与指引", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("hi");
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "x" }],
        stopReason: "error",
        errorMessage: "quota exceeded",
        timestamp: 1,
      },
    });

    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.some((e) => e.message.includes("quota exceeded"))).toBe(true);
    expect(errors.some((e) => (e.hint ?? "").includes("pi auth"))).toBe(true);
  });

  it("外部修改检测：watcher 回调 → external_change（FR-SESS-07）", async () => {
    const { bridge, events, watcher } = makeBridge();
    await bridge.start();
    watcher.cb?.();
    expect(kinds(events)).toContain("external_change");
  });

  it("历史重建：工具结果绑定到卡片（FR-SESS-03）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    fake.messages = [
      { role: "user", content: "run ls", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_h1", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call_h1",
        toolName: "bash",
        content: [{ type: "text", text: "file-a\nfile-b" }],
        isError: false,
        timestamp: 3,
      },
      { role: "assistant", content: [{ type: "text", text: "listed" }], stopReason: "stop", timestamp: 4 },
    ] as AgentMessage[];

    await bridge.reloadHistory();

    const history = events.filter((e) => e.kind === "history_loaded").pop() as unknown as {
      messages: Array<{ blocks: Array<{ type: string; id?: string; status?: string; output?: string }> }>;
    };
    const toolBlock = history.messages.flatMap((m) => m.blocks).find((b) => b.type === "toolcall");
    expect(toolBlock?.id).toBe("call_h1");
    expect(toolBlock?.status).toBe("success");
    expect(toolBlock?.output).toContain("file-a");
  });

  it("模型切换后 model_info 更新（FR-MOD-01）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    fake.state.model = { id: "mock-alpha", provider: "mock" };
    await bridge.setModel("mock", "mock-beta");
    expect(fake.setModels).toEqual([{ provider: "mock", modelId: "mock-beta" }]);
    const info = events.filter((e) => e.kind === "model_info").pop() as { model: string };
    expect(info.model).toContain("mock-beta");
  });

  it("thinking 等级切换/循环（FR-MOD-02）", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    await bridge.setThinkingLevel("low");
    await bridge.cycleThinkingLevel();
    expect(fake.setThinkingLevels).toEqual(["low"]);
    expect(fake.cycleThinkingCalls).toBe(1);
  });

  it("会话命名（FR-SESS-04）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    await bridge.renameSession("重构鉴权");
    expect(fake.setSessionNames).toEqual(["重构鉴权"]);
    expect(kinds(events)).toContain("session_name");
  });

  it("新建/切换会话：session_reset + 历史重建（FR-SESS-01/03）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    await bridge.newSession();
    expect(fake.newSessions).toBe(1);
    await bridge.switchSession("/tmp/other.jsonl");
    expect(fake.switchSessions).toEqual(["/tmp/other.jsonl"]);
    expect(kinds(events).filter((k) => k === "session_reset").length).toBeGreaterThanOrEqual(2);
  });

  it("thinkingDefault 在新建会话时透传（FR-MOD-02：枚举不固化）", async () => {
    const { bridge, fakes } = makeBridge({ thinkingDefault: "ultra" });
    await bridge.start();
    const fake = fakes[0];
    await bridge.newSession();
    expect(fake.setThinkingLevels).toEqual(["ultra"]); // 原样透传，由 pi 校验
  });

  it("thinkingDefault 为空时不干预 pi 自身设置", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    await bridge.newSession();
    expect(fake.setThinkingLevels).toEqual([]);
  });

  it("缺陷#6 回归：关键路径日志 4 类齐全（会话创建/prompt/abort/子进程退出）", async () => {
    const { bridge, fakes, logger } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.newSession(); // 会话创建
    await bridge.sendPrompt("hello world"); // prompt 发送
    fake.emit({ type: "agent_start" });
    await bridge.abort(); // abort
    fake.emit({ type: "agent_settled", aborted: true });
    fake.crash(3, "boom"); // 子进程退出（触发自动重启路径日志）
    await waitFor(() => fakes.length === 2);

    const log = logger.lines.join("\n");
    expect(log).toMatch(/新建会话/); // 会话创建
    expect(log).toMatch(/prompt/i); // prompt 发送
    expect(log).toMatch(/abort|中止/); // abort
    expect(log).toMatch(/子进程退出/); // 子进程退出
  });

  it("缺陷#4 回归：外部修改后 prompt 被拦截并引导刷新；刷新后恢复（FR-SESS-07 口径 C）", async () => {
    const { bridge, fakes, events, watcher } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    // 模拟外部修改检测
    watcher.cb?.();
    expect(kinds(events)).toContain("external_change");

    // 未刷新：下一次 prompt 被拦截（不发 RPC prompt）并引导刷新
    await bridge.sendPrompt("stale-check");
    expect(fake.prompts.length).toBe(0);
    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.some((e) => e.message.includes("拦截"))).toBe(true);
    expect(errors.some((e) => (e.hint ?? "").includes("刷新"))).toBe(true);

    // 刷新后恢复交互
    await bridge.reloadHistory();
    await bridge.sendPrompt("fresh-check");
    expect(fake.prompts.map((p) => p.message)).toEqual(["fresh-check"]);
  });

  it("缺陷#4 回归：切换/新建会话同样解除陈旧拦截", async () => {
    const { bridge, fakes, watcher } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    watcher.cb?.();
    await bridge.sendPrompt("blocked");
    expect(fake.prompts.length).toBe(0);

    await bridge.newSession();
    await bridge.sendPrompt("after-new");
    expect(fake.prompts.map((p) => p.message)).toEqual(["after-new"]);

    watcher.cb?.();
    await bridge.sendPrompt("blocked-again");
    expect(fake.prompts.length).toBe(1);
    await bridge.switchSession("/tmp/other.jsonl");
    await bridge.sendPrompt("after-switch");
    expect(fake.prompts.map((p) => p.message)).toEqual(["after-new", "after-switch"]);
  });

  it("缺陷#2 回归：stderr/协议异常写入日志并脱敏（FR-CMD-02）", async () => {
    const fakes: FakeRpcClient[] = [];
    const memory = new MemoryLogger();
    const watcherCb: { cb: (() => void) | null } = { cb: null };
    void watcherCb;
    const bridge = new PiBridge({
      cwd: "/tmp",
      runtime,
      createClient: () => {
        const fake = new FakeRpcClient();
        fakes.push(fake);
        return fake;
      },
      logger: createRedactingLogger(memory),
      tailLines: 200,
      sendMode: "steer",
      createWatcher: (cb) => {
        void cb;
        return { track: () => undefined, markSynced: () => undefined, setSuspended: () => undefined, start: () => undefined, dispose: () => undefined };
      },
    });
    await bridge.start();
    const fake = fakes[0];

    fake.emitStderr("E2E-STDERR-MARKER diagnostic");
    fake.emitStderr('{"api_key":"sk-supersecret123456"}');
    fake.emitAnomaly("无法解析的 RPC 输出行：bad json");

    const log = memory.lines.join("\n");
    expect(log).toContain("E2E-STDERR-MARKER"); // stderr 原文
    expect(log).toMatch(/无法解析|协议异常/); // 协议异常记录
    expect(log).toContain("[REDACTED]"); // 脱敏
    expect(log).not.toContain("sk-supersecret123456");
    await bridge.dispose();
  });
});

describe("Issue #1 回归（#D-01/#D-02，FR-SESS-07）", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-stalewatch-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("运行态门控接线：starting 挂起，idle/aborted 恢复并同步基线（#D-01 R2）", async () => {
    const { bridge, fakes, calls } = makeBridge();
    await bridge.start();
    expect(calls.setSuspended).toEqual([]); // idle 启动：不挂起

    await bridge.sendPrompt("hello"); // → starting：挂起（streaming 仅可自 starting 迁入，保持挂起）
    expect(bridge.getRunState()).toBe("starting");
    expect(calls.setSuspended).toEqual([true]);

    const fake = fakes[0];
    fake.emit({ type: "agent_start" }); // → streaming：无新挂起/恢复调用
    expect(calls.setSuspended).toEqual([true]);
    fake.emit({ type: "agent_settled", aborted: false }); // → idle：恢复
    expect(bridge.getRunState()).toBe("idle");
    expect(calls.setSuspended).toEqual([true, false]);
    expect(calls.markSynced).toBeGreaterThanOrEqual(1); // 恢复时基线同步

    await bridge.sendPrompt("again");
    fake.emit({ type: "agent_settled", aborted: true }); // → aborted → idle：同样恢复
    expect(bridge.getRunState()).toBe("idle");
    expect(calls.setSuspended[calls.setSuspended.length - 1]).toBe(false);

    await bridge.dispose();
  });

  it("(a) starting/streaming 期间会话文件变化只吸收不报警；settled 后恢复正常检测（#D-01）", async () => {
    const sessionFile = path.join(tmpDir, "session.jsonl");
    fs.writeFileSync(sessionFile, '{"type":"session","id":"s1"}\n');
    const { bridge, fakes, events } = makeBridge({ realWatcher: { sessionFile, intervalMs: 25 } });
    await bridge.start();
    const fake = fakes[0];

    // 续接会话已在跟踪；发送后进入 starting（挂起）
    await bridge.sendPrompt("hello");
    expect(bridge.getRunState()).toBe("starting");
    // turn_start 边界 user 条目落盘（本插件子进程写入；无 entry_appended 信号的最坏情形）
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":"hello"}}\n');
    await sleep(120); // ≥4 个轮询周期落在“已落盘、未 markSynced”窗口（Issue #1 触发窗口）
    expect(events.some((e) => e.kind === "external_change")).toBe(false);

    // streaming：继续吸收
    fake.emit({ type: "agent_start" });
    expect(bridge.getRunState()).toBe("streaming");
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"assistant"}}\n');
    await sleep(120);
    expect(events.some((e) => e.kind === "external_change")).toBe(false);

    // 未被误置 sessionStale：运行中后续发送走 steer 排队而非拦截
    await bridge.sendPrompt("still running");
    expect(fake.steers).toEqual(["still running"]);

    // settled → idle：恢复检测（运行期间写入全部吸收，不追溯报警）
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }], stopReason: "stop", timestamp: 1 },
    });
    fake.emit({ type: "agent_settled", aborted: false });
    expect(bridge.getRunState()).toBe("idle");
    expect(events.some((e) => e.kind === "external_change")).toBe(false);

    // settled 后真实外部写入 → 一个轮询周期内检出（检测已恢复）
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":"terminal pi"}}\n');
    await waitFor(() => events.some((e) => e.kind === "external_change"), 2000, "external_change after settle");
    // sessionStale 置位：后续 prompt 被拦截（口径 C）
    await bridge.sendPrompt("after-external");
    expect(fake.prompts.map((p) => p.message)).toEqual(["hello"]);

    await bridge.dispose();
  });

  it("(b) idle 下迟到 entry_appended：先落盘后事件不误报（#D-01 R1）", async () => {
    const sessionFile = path.join(tmpDir, "late-entry.jsonl");
    fs.writeFileSync(sessionFile, '{"type":"session","id":"s2"}\n');
    const { bridge, fakes, events } = makeBridge({ realWatcher: { sessionFile, intervalMs: 25 } });
    await bridge.start();
    const fake = fakes[0];
    expect(bridge.getRunState()).toBe("idle");

    // 子进程已物理落盘（迟到），entry_appended 事件随即到达（同一事件循环，均在下一轮询 tick 前）
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":"late"}}\n');
    fake.emit({ type: "entry_appended", entry: { type: "message", message: { role: "user", content: "late" } } });
    await sleep(120); // ≥4 个轮询周期
    expect(events.some((e) => e.kind === "external_change")).toBe(false);

    // 未置 sessionStale：后续 prompt 正常发出（不被拦截）
    await bridge.sendPrompt("next");
    expect(fake.prompts.map((p) => p.message)).toEqual(["next"]);

    await bridge.dispose();
  });

  it("(c) idle 下真实外部写入在一个轮询周期内检出（≤5s 检测语义保持，#D-01）", async () => {
    const sessionFile = path.join(tmpDir, "external.jsonl");
    fs.writeFileSync(sessionFile, '{"type":"session","id":"s3"}\n');
    const { bridge, fakes, events } = makeBridge({ realWatcher: { sessionFile, intervalMs: 40 } });
    await bridge.start();
    const fake = fakes[0];

    await sleep(80); // 基线稳定（ ≥1 个空转周期，排除启动噪声）
    expect(events.some((e) => e.kind === "external_change")).toBe(false);
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":"terminal write"}}\n');
    // 生产默认 intervalMs=2500（保证 ≤5s 检出时限）；此处压缩周期验证同一“一个周期内检出”语义
    await waitFor(() => events.some((e) => e.kind === "external_change"), 2000, "external_change within poll cycle");

    // 检出后 sessionStale：prompt 被拦截（FR-SESS-07 口径 C 不受影响）
    await bridge.sendPrompt("blocked");
    expect(fake.prompts.length).toBe(0);

    await bridge.dispose();
  });

  it("#D-02 全新会话：settled 后补学 sessionFile 并进入跟踪，外部写入可检出（R3）", async () => {
    const sessionFile = path.join(tmpDir, "fresh-session.jsonl");
    const { bridge, fakes, events } = makeBridge({ realWatcher: { sessionFile: null, intervalMs: 25 } });
    await bridge.start(); // 全新会话：启动时 get_state 无文件路径 → watcher 不跟踪
    const fake = fakes[0];
    expect(fake.state.sessionFile).toBeUndefined();
    await bridge.sendPrompt("first");
    expect(bridge.getRunState()).toBe("starting");

    // 首轮运行中子进程创建并落盘会话文件（挂起窗口内被吸收，不误报）
    fs.writeFileSync(sessionFile, '{"type":"session","id":"fresh"}\n');
    await sleep(80);
    expect(events.some((e) => e.kind === "external_change")).toBe(false);

    // settled：已回 idle → refreshState 补学新会话路径（观察点：model_info 再次发出，即 get_state 已返回）
    const modelInfoBefore = events.filter((e) => e.kind === "model_info").length;
    fake.state.sessionFile = sessionFile;
    fake.emit({ type: "agent_settled", aborted: false });
    expect(bridge.getRunState()).toBe("idle");
    await waitFor(
      () => events.filter((e) => e.kind === "model_info").length === modelInfoBefore + 1,
      2000,
      "settled 补学 refreshState"
    );

    // 补学后 watcher 进入跟踪：随后的真实外部写入被检出（修复前永不跟踪 → 漏报）
    fs.appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":"terminal"}}\n');
    await waitFor(() => events.some((e) => e.kind === "external_change"), 2000, "external_change after backfill");

    await bridge.dispose();
  });
});

describe("Issue #2 回归（#D-03，FR-CHAT-07 展示通道口径）", () => {
  const STALE_ERROR = "This extension ctx is stale after session replacement or reload\n  at core/extensions/runner.js:482";

  it("通道选择：extension_error 走 toast（非阻断）——无 error 事件、无误导 hint，文案含路径/错误首行/Output 指引", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    fakes[0].emit({
      type: "extension_error",
      extensionPath: "/home/u/.pi/agent/npm/pi-loop/main.js",
      event: "subagent-async",
      error: STALE_ERROR,
    });

    expect(events.filter((e) => e.kind === "error")).toHaveLength(0); // 不再进聊天区错误卡片
    const toasts = events.filter((e) => e.kind === "toast") as Array<{ text: string }>;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toContain("/home/u/.pi/agent/npm/pi-loop/main.js"); // 扩展路径
    expect(toasts[0].text).toContain("This extension ctx is stale after session replacement or reload"); // 错误首行
    expect(toasts[0].text).toContain("详情见 Output「Sdysyhj」"); // 尾部指引
    expect(toasts[0].text).not.toContain("runner.js:482"); // 多行错误只取首行
    expect(toasts[0].text).not.toContain("~/.pi/agent/extensions"); // 误导 hint 已删除
    await bridge.dispose();
  });

  it("日志全字段：logger.warn 含 extensionPath/event/error 全文（多行不截断）", async () => {
    const { bridge, fakes, logger } = makeBridge();
    await bridge.start();
    fakes[0].emit({
      type: "extension_error",
      extensionPath: "/home/u/.pi/agent/npm/pi-loop/main.js",
      event: "subagent-async",
      error: STALE_ERROR,
    });

    const warns = logger.lines.filter((l) => l.startsWith("[warn] extension_error"));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("extensionPath=/home/u/.pi/agent/npm/pi-loop/main.js");
    expect(warns[0]).toContain("event=subagent-async");
    expect(warns[0]).toContain(`error=${STALE_ERROR}`); // 全文，含第二行堆栈
    await bridge.dispose();
  });

  it("同键去重：相同 error+extensionPath 60s 窗口内只 toast 一次，日志仍全量", async () => {
    const { bridge, fakes, events, logger } = makeBridge();
    await bridge.start();
    const event = {
      type: "extension_error" as const,
      extensionPath: "/home/u/.pi/agent/npm/pi-loop/main.js",
      event: "subagent-async",
      error: "stale ctx",
    };
    fakes[0].emit(event);
    fakes[0].emit(event);
    fakes[0].emit(event);

    expect(events.filter((e) => e.kind === "toast")).toHaveLength(1); // toast 去重
    expect(logger.lines.filter((l) => l.startsWith("[warn] extension_error"))).toHaveLength(3); // 日志不去重
    await bridge.dispose();
  });

  it("不同键不去重：extensionPath 或 error 任一不同即各自 toast", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    fakes[0].emit({ type: "extension_error", extensionPath: "/npm/a/main.js", error: "boom A" });
    fakes[0].emit({ type: "extension_error", extensionPath: "/npm/b/main.js", error: "boom A" }); // 路径不同
    fakes[0].emit({ type: "extension_error", extensionPath: "/npm/a/main.js", error: "boom B" }); // 错误不同

    expect(events.filter((e) => e.kind === "toast")).toHaveLength(3);
    await bridge.dispose();
  });

  it("60s 窗口外同键重复事件再次 toast（fake timers，确定性无等待）", async () => {
    vi.useFakeTimers();
    try {
      const { bridge, fakes, events } = makeBridge();
      await bridge.start();
      const event = {
        type: "extension_error" as const,
        extensionPath: "/npm/pi-loop/main.js",
        error: "stale ctx",
      };
      fakes[0].emit(event);
      expect(events.filter((e) => e.kind === "toast")).toHaveLength(1);

      vi.advanceTimersByTime(60_000); // 到达窗口边界：窗口内（<60s）不再重复，期满可再提示
      fakes[0].emit(event);
      expect(events.filter((e) => e.kind === "toast")).toHaveLength(2);
      await bridge.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("缺字段容错：无 extensionPath/error 仍 toast 与记日志（占位文案，不抛错）", async () => {
    const { bridge, fakes, events, logger } = makeBridge();
    await bridge.start();
    fakes[0].emit({ type: "extension_error", event: "timer" });

    const toasts = events.filter((e) => e.kind === "toast") as Array<{ text: string }>;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toContain("未知扩展");
    expect(toasts[0].text).toContain("未知错误");
    expect(toasts[0].text).toContain("详情见 Output「Sdysyhj」");
    const warn = logger.lines.find((l) => l.startsWith("[warn] extension_error"));
    expect(warn).toContain("event=timer");
    expect(warn).toContain("extensionPath=(无)");
    await bridge.dispose();
  });
});

describe("FR-MOD-04 上下文用量捕获与透出", () => {
  const usage = (totalTokens: number) => ({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens });

  function usageSnapshots(events: BridgeEvent[]): Array<{ totalTokens: number | null; contextWindow: number | null }> {
    return events
      .filter((e) => e.kind === "usage_info")
      .map((e) => ({ totalTokens: (e as { totalTokens: number | null }).totalTokens, contextWindow: (e as { contextWindow: number | null }).contextWindow }));
  }

  it("② get_state 的 model.contextWindow 透出；无助手消息 totalTokens=null（④占位 — 的数据源）", async () => {
    const { bridge, events } = makeBridge({
      initialModel: { id: "mock-alpha", provider: "mock", name: "Mock Alpha", reasoning: true, contextWindow: 200_000 },
    });
    await bridge.start();
    expect(usageSnapshots(events)).toEqual([{ totalTokens: null, contextWindow: 200_000 }]);
    expect(bridge.getUsageInfo()).toEqual({ totalTokens: null, contextWindow: 200_000 });
  });

  it("① message_update 携带 Usage 即刷新（流式期间实时更新，无需等终稿）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    events.length = 0;
    fakes[0].emit({ type: "message_update", usage: usage(5_000), assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    expect(usageSnapshots(events)).toEqual([{ totalTokens: 5_000, contextWindow: null }]);
    expect(bridge.getUsageInfo().totalTokens).toBe(5_000);
  });

  it("① message_end 权威终稿用量覆盖流式值", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    events.length = 0;
    fake.emit({ type: "message_update", usage: usage(5_000), assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "ok" }], usage: usage(7_000), stopReason: "stop", timestamp: 1 },
    });
    expect(usageSnapshots(events).map((e) => e.totalTokens)).toEqual([5_000, 7_000]);
    expect(bridge.getUsageInfo().totalTokens).toBe(7_000);
  });

  it("无 Usage 事件不改变取值；重复相同用量去重不重发", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    events.length = 0;
    fake.emit({ type: "message_update", usage: usage(5_000), assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x" } }); // 无 Usage
    fake.emit({ type: "message_update", usage: usage(5_000), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "y" } }); // 同值
    expect(usageSnapshots(events)).toEqual([{ totalTokens: 5_000, contextWindow: null }]);
  });

  it("④ 历史重建：取新会话最后一条助手消息 usage；无助手消息时重置为 null", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    fake.messages = [
      { role: "user", content: "q1", timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "a1" }], usage: usage(111), stopReason: "stop", timestamp: 2 },
      { role: "user", content: "q2", timestamp: 3 },
      { role: "assistant", content: [{ type: "text", text: "a2" }], usage: usage(222), stopReason: "stop", timestamp: 4 },
    ] as AgentMessage[];
    await bridge.reloadHistory();
    expect(bridge.getUsageInfo().totalTokens).toBe(222);

    fake.messages = [{ role: "user", content: "only-user", timestamp: 5 }] as AgentMessage[];
    await bridge.reloadHistory();
    expect(bridge.getUsageInfo().totalTokens).toBeNull();
  });

  it("④ 新建会话后重置（当前会话尚无助手消息 → —）", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    fakes[0].emit({ type: "message_update", usage: usage(5_000), assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    expect(bridge.getUsageInfo().totalTokens).toBe(5_000);
    await bridge.newSession();
    expect(bridge.getUsageInfo().totalTokens).toBeNull();
  });

  it("② 切换模型后 contextWindow 随 get_state 更新并透出", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    events.length = 0;
    fakes[0].state.model = { id: "mock-alpha", provider: "mock", name: "Mock Alpha", reasoning: true, contextWindow: 128_000 };
    await bridge.setModel("mock", "mock-beta"); // fake setModel 合并保留 contextWindow 后 refreshState 读取
    expect(usageSnapshots(events).pop()).toEqual({ totalTokens: null, contextWindow: 128_000 });
    expect(bridge.getUsageInfo().contextWindow).toBe(128_000);
  });
});

describe("FR-CMD-03 命令全集（get_commands 桥侧封装）", () => {
  it("listCommands 透传客户端 get_commands 结果（扩展命令/prompt 模板/skills）", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    const fake = fakes[0];
    fake.commands = [
      { name: "init", description: "Initialize project", source: "extension" },
      { name: "review", description: "Review code", source: "prompt" },
      { name: "skill:summarize", description: "总结", source: "skill" },
    ];
    await expect(bridge.listCommands()).resolves.toEqual(fake.commands);
  });

  it("⑤ get_commands 不可用（RPC 失败）→ 返回空并记日志：菜单不显示，`/` 文本仍可直接发送透传", async () => {
    const { bridge, fakes, logger } = makeBridge();
    await bridge.start();
    fakes[0].commandsError = new Error("rpc unavailable");
    await expect(bridge.listCommands()).resolves.toEqual([]);
    expect(logger.lines.some((l) => l.startsWith("[warn] get_commands 失败"))).toBe(true);
  });
});

describe("FR-CHAT-11 用户消息单次展示（TASK-008 §10.12 D2/D3/D9 单元）", () => {
  const asUserMessage = (e: BridgeEvent): { id: string; text: string } => e as unknown as { id: string; text: string };
  const userFinals = (events: BridgeEvent[]) =>
    events.filter(
      (e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user"
    ) as unknown as Array<{ messageId: string; message: { blocks: Array<{ type: string; text?: string }> } }>;
  const userEntries = (bridge: PiBridge) => bridge.getUiMessages().filter((m) => m.role === "user");
  const textOf = (blocks: Array<{ type: string; text?: string }>): string => blocks.find((b) => b.type === "text")?.text ?? "";

  /** user 回声（json.md L30–46：message_start/user → message_end/user，content 为文本块数组）。 */
  function emitUserEcho(fake: FakeRpcClient, text: string): void {
    fake.emit({ type: "message_start", message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
    fake.emit({ type: "message_end", message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
  }

  it("U1 ① prompt → user 回声：uiMessages 恰一条 user；message_final.id = user_message 下发的乐观条目 id", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("hello");
    expect(userEntries(bridge)).toHaveLength(1); // 发送后即时展示（乐观条目，不等回声）
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "hello");
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" } });
    fake.emit({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Hello" }], stopReason: "stop", timestamp: 2 },
    });
    fake.emit({ type: "agent_settled", aborted: false });

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("hello");
    const finals = userFinals(events);
    expect(finals).toHaveLength(1); // 回声给稿仅一次
    expect(finals[0].messageId).toBe(sent[0].id); // 同键：回声复用乐观条目 id（D1）
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(1); // 助手终稿渲染完成后仍仅一条（① 两个判定时点）
    expect(ui[0].id).toBe(sent[0].id);
    expect(textOf(ui[0].blocks)).toBe("hello");
    await bridge.dispose();
  });

  it("U2 ④ 澄清 #16：回声文本 ≠ 发送原文 → 同 id 同条目文本更新为权威文本，更新前后条数均 1", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("raw text");
    expect(userEntries(bridge)).toHaveLength(1);
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "expanded authoritative text"); // 唯一未消费条目 → 兑底绑定
    expect(userEntries(bridge)).toHaveLength(1); // 更新前后均为一条
    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    expect(userFinals(events)[0].messageId).toBe(sent[0].id);
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(1);
    expect(textOf(ui[0].blocks)).toBe("expanded authoritative text"); // 以 pi 权威文本为准就地更新
    await bridge.dispose();
  });

  it("U3 ② 运行中 steer：注入回声后恰一条；queue_update 绑定展开文本（slash 展开）命中", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main run");
    fake.emit({ type: "agent_start" });
    await bridge.sendPrompt("/skill:summarize", "auto"); // 运行中 → steer
    expect(fake.steers).toEqual(["/skill:summarize"]);
    // 入队快照携带展开后文本（rpc-commands.md L48：入队前展开）
    fake.emit({ type: "queue_update", steering: ["expanded: summarize please"], followUp: [] });
    // 轮间注入：回声文本 = 展开后文本（≠ 发送原文）→ 经 queuedText 精确命中
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "r1" }], stopReason: "stop", timestamp: 2 } });
    emitUserEcho(fake, "expanded: summarize please");

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const steerSent = sent.find((m) => m.text === "/skill:summarize");
    expect(steerSent).toBeTruthy();
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2); // main + steer 各一条
    const steerEntry = ui.find((m) => m.id === steerSent!.id);
    expect(textOf(steerEntry?.blocks ?? [])).toBe("expanded: summarize please");
    expect(userFinals(events).some((f) => f.messageId === steerSent!.id)).toBe(true);
    await bridge.dispose();
  });

  it("U4 ② follow_up：agent 停后注入回声恰一条", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "main");
    await bridge.sendPrompt("do fu after", "followUp");
    fake.emit({ type: "queue_update", steering: [], followUp: ["do fu after"] });
    // agent 停下 → follow_up 注入（agent_end 后、settled 前，rpc-commands.md L70–92）
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "r" }], stopReason: "stop", timestamp: 2 } });
    fake.emit({ type: "agent_end", messages: [], willRetry: false });
    emitUserEcho(fake, "do fu after");
    fake.emit({ type: "queue_update", steering: [], followUp: [] });
    fake.emit({ type: "agent_start" });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "fu reply" }], stopReason: "stop", timestamp: 3 } });
    fake.emit({ type: "agent_settled", aborted: false });

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const fuSent = sent.find((m) => m.text === "do fu after");
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2);
    const fuEntry = ui.find((m) => m.id === fuSent!.id);
    expect(textOf(fuEntry?.blocks ?? [])).toBe("do fu after"); // 恰一条、文本保真
    await bridge.dispose();
  });

  it("U5 ②④ 乱序：followUp 先发、steer 后发，steer 回声先到 → 各自命中不错换", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "main");
    await bridge.sendPrompt("FU-TEXT", "followUp");
    await bridge.sendPrompt("ST-TEXT", "steer");
    fake.emit({ type: "queue_update", steering: ["ST-TEXT"], followUp: ["FU-TEXT"] });
    // 投递顺序与发送顺序不同：steer 先投
    emitUserEcho(fake, "ST-TEXT");
    emitUserEcho(fake, "FU-TEXT");

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const idOf = (text: string) => sent.find((m) => m.text === text)!.id;
    const finals = userFinals(events);
    expect(finals.map((f) => textOf(f.message.blocks))).toEqual(["main", "ST-TEXT", "FU-TEXT"]);
    expect(finals.map((f) => f.messageId)).toEqual([idOf("main"), idOf("ST-TEXT"), idOf("FU-TEXT")]); // 不错换
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(3);
    for (const m of sent) {
      expect(textOf(ui.find((x) => x.id === m.id)?.blocks ?? [])).toBe(m.text);
    }
    await bridge.dispose();
  });

  it("U6 ① 同文本两次独立发送 → 逐条消费不跨发送合并（run-head 优先 → FIFO）", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("same text"); // idle prompt → run-head
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "same text"); // 首条回声 → run-head 条目优先
    await bridge.sendPrompt("same text", "auto"); // 运行中 steer 同文本
    fake.emit({ type: "queue_update", steering: ["same text"], followUp: [] });
    emitUserEcho(fake, "same text"); // 次条回声 → 剩余同文本条目（FIFO）

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    expect(sent).toHaveLength(2); // 两条独立发送不合并
    const finals = userFinals(events);
    expect(finals).toHaveLength(2);
    expect(finals[0].messageId).toBe(sent[0].id);
    expect(finals[1].messageId).toBe(sent[1].id);
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2);
    expect(ui.every((m) => textOf(m.blocks) === "same text")).toBe(true);
    await bridge.dispose();
  });

  it("U7 ①④ disposition handled：单条、即刻出账；后续无关回声不错绑（D3）", async () => {
    const { bridge, fakes, events } = makeBridge({ promptResult: { ok: true, disposition: "handled" } });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("/extcmd run"); // 扩展命令消费：无 run 无回声
    expect(userFinals(events)).toHaveLength(0); // 无回声终稿触碰该条目
    expect(bridge.getRunState()).toBe("idle");

    // 后续无关 user 回声（扩展 custom_message）：账本已空 → 宿主新 id 建条目（D4 合法追加），
    // 不经 user_message 通道、不错绑到 handled 条目
    emitUserEcho(fake, "extension injected");
    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const handled = sent.find((m) => m.text === "/extcmd run")!;
    const finals = userFinals(events);
    expect(finals).toHaveLength(1);
    const injectedFinal = finals[0];
    expect(textOf(injectedFinal.message.blocks)).toBe("extension injected");
    expect(injectedFinal.messageId).not.toBe(handled.id); // 新 id，非 handled 条目 id
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2);
    expect(textOf(ui.find((m) => m.id === handled.id)?.blocks ?? [])).toBe("/extcmd run"); // 原文未被覆盖
    expect(textOf(ui.find((m) => m.id === injectedFinal.messageId)?.blocks ?? [])).toBe("extension injected");
    await bridge.dispose();
  });

  it("U8 ①④ success:false：单条、即刻出账；下一条消息回声正确关联（D3）", async () => {
    const { bridge, fakes, events } = makeBridge({ promptResult: { ok: false, error: "already streaming" } });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("rejected text");
    expect(userFinals(events)).toHaveLength(0);
    fake.promptResult = { ok: true, disposition: "started" }; // 后续发送恢复受理
    await bridge.sendPrompt("accepted text");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "accepted text");

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const accepted = sent.find((m) => m.text === "accepted text")!;
    const finals = userFinals(events);
    expect(finals).toHaveLength(1);
    expect(finals[0].messageId).toBe(accepted.id); // 只关联新条目
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2);
    expect(textOf(ui.find((m) => m.id === accepted.id)?.blocks ?? [])).toBe("accepted text");
    await bridge.dispose();
  });

  it("U9 ②④ abort 后队列保留（settled + queue_update 仍含该文本）→ 单条保留；后续 prompt 继续投递时迟到回声正确命中", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main long");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "main long");
    await bridge.sendPrompt("late steer text", "auto"); // 运行中排队
    fake.emit({ type: "queue_update", steering: ["late steer text"], followUp: [] });
    await bridge.abort();
    fake.emit({ type: "agent_settled", aborted: true }); // abort 后队列保留（rpc-commands.md L126）
    expect(userEntries(bridge)).toHaveLength(2); // 条目单条保留

    // 后续 prompt：保留队列继续投递（迟到回声）+ 新 prompt 回声
    await bridge.sendPrompt("next prompt");
    emitUserEcho(fake, "late steer text"); // 迟到回声先到
    emitUserEcho(fake, "next prompt");
    fake.emit({ type: "queue_update", steering: [], followUp: [] });
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop", timestamp: 3 } });
    fake.emit({ type: "agent_settled", aborted: false });

    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const steerSent = sent.find((m) => m.text === "late steer text")!;
    const nextSent = sent.find((m) => m.text === "next prompt")!;
    const finals = userFinals(events);
    expect(finals.map((f) => f.messageId)).toContain(steerSent.id); // 迟到回声命中保留条目
    expect(finals.map((f) => f.messageId)).toContain(nextSent.id);
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(3);
    expect(textOf(ui.find((m) => m.id === steerSent.id)?.blocks ?? [])).toBe("late steer text"); // 文本不错换
    await bridge.dispose();
  });

  it("U10 ③④ refreshHistory 权威重建无重复；仍入队条目按发送序回填尾部，且后续回声仍命中（D5）", async () => {
    const { bridge, fakes, events } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "main");
    await bridge.sendPrompt("queued fu text", "followUp");
    fake.emit({ type: "queue_update", steering: [], followUp: ["queued fu text"] });
    fake.emit({ type: "agent_settled", aborted: false }); // 仍入队 → 保留在账

    // 权威重建：JSONL 只含 main（fu 尚未投递）
    fake.messages = [
      { role: "user", content: "main", timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "r" }], stopReason: "stop", timestamp: 2 },
    ] as AgentMessage[];
    await bridge.reloadHistory();
    const history = events
      .filter((e) => e.kind === "history_loaded")
      .map((e) => (e as unknown as { messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }> }).messages)
      .pop() ?? [];
    const historyUsers = history.filter((m) => m.role === "user").map((m) => textOf(m.blocks));
    expect(historyUsers).toEqual(["main", "queued fu text"]); // 无重复 + 回填尾部（发送序）

    // 回填条目后续回声仍命中（id 贯通，不产生重复）
    const sent = events.filter((e) => e.kind === "user_message").map(asUserMessage);
    const fuSent = sent.find((m) => m.text === "queued fu text")!;
    emitUserEcho(fake, "queued fu text");
    expect(userFinals(events).some((f) => f.messageId === fuSent.id)).toBe(true);
    expect(userEntries(bridge).map((m) => textOf(m.blocks))).toEqual(["main", "queued fu text"]); // 仍两条
    await bridge.dispose();
  });

  it("U11 ③ getUiMessages() 回放快照：每次发送恰一条 user 条目（面板重开数据源）", async () => {
    const { bridge, fakes } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("a");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "a");
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ra" }], stopReason: "stop", timestamp: 2 } });
    fake.emit({ type: "agent_settled", aborted: false });
    await bridge.sendPrompt("b");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "b");
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "rb" }], stopReason: "stop", timestamp: 3 } });
    fake.emit({ type: "agent_settled", aborted: false });

    const ui = userEntries(bridge);
    expect(ui.map((m) => textOf(m.blocks))).toEqual(["a", "b"]);
    expect(new Set(ui.map((m) => m.id)).size).toBe(2); // id 唯一（回放不产生重复）
    await bridge.dispose();
  });

  it("U12 ⑤ 回归边界：回声在场的助手流式/工具卡事件序列与现状一致（D7 零改动）", async () => {
    const { bridge, fakes, events } = makeBridge();
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("do tool");
    fake.emit({ type: "agent_start" });
    emitUserEcho(fake, "do tool");
    fake.emit({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending" } });
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, id: "call_u12", toolName: "bash" } });
    fake.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_u12", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: 1,
      },
    });
    fake.emit({ type: "tool_execution_end", toolCallId: "call_u12", result: { content: [{ type: "text", text: "out" }] }, isError: false });
    fake.emit({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "call_u12", toolName: "bash", content: [{ type: "text", text: "out" }], isError: false, timestamp: 2 },
    });
    fake.emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop", timestamp: 3 } });
    fake.emit({ type: "agent_settled", aborted: false });

    // 助手流式（stream_start/message_final）、toolcall_start/status 路径与修复前一致，
    // 仅在正确位置插入 user 回声终稿（message_final(user)）——事件序列全量断言
    expect(kinds(events)).toEqual([
      "model_info",
      "history_loaded",
      "user_message",
      "run_state", // starting
      "run_state", // streaming（agent_start）
      "message_final", // user 回声（新插入，位于助手流式之前）
      "stream_start",
      "toolcall_start",
      "message_final", // 含工具卡的助手终稿
      "toolcall_status", // tool_execution_end
      "toolcall_status", // toolResult message_end
      "message_final", // 总结轮终稿
      "run_state", // idle
    ]);
    await bridge.dispose();
  });

  it("D2.2 兑底：多通道不可判定时不重绑不追加，保留原文并 warn 留痕（宁保留不错换）", async () => {
    const { bridge, fakes, events, logger } = makeBridge({ sendMode: "steer" });
    await bridge.start();
    const fake = fakes[0];

    await bridge.sendPrompt("main"); // prompt 通道（未回声：快照未覆盖的变换假设场景）
    fake.emit({ type: "agent_start" });
    await bridge.sendPrompt("steer text", "auto"); // steer 通道
    // 回声文本与两者均不匹配 → prompt+steer 跨通道不可判定
    emitUserEcho(fake, "totally different text");

    expect(userFinals(events)).toHaveLength(0); // 不重绑、不追加（无 message_final）
    const ui = userEntries(bridge);
    expect(ui).toHaveLength(2);
    expect(textOf(ui[0].blocks)).toBe("main"); // 保留乐观条目原文
    expect(textOf(ui[1].blocks)).toBe("steer text");
    expect(logger.lines.some((l) => l.includes("无法唯一关联"))).toBe(true); // 留痕待权威重建
    await bridge.dispose();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

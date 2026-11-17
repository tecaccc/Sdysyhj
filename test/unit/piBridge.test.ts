// PiBridge 单测：事件翻译、运行状态机、崩溃恢复、steer、工具卡片截断（FakeRpcClient 注入）。

import { describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type SessionWatcherLike } from "../../src/bridge/piBridge";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import type { AgentMessage, RpcEvent } from "../../src/bridge/protocol";
import { MemoryLogger } from "../../src/util/log";
import { FakeRpcClient } from "../helpers/fake-rpc-client";

const runtime: ResolvedRuntime = { source: "bundled", command: "node", baseArgs: ["/tmp/cli.js"], detail: "test" };

interface Harness {
  bridge: PiBridge;
  fakes: FakeRpcClient[];
  events: BridgeEvent[];
  logger: MemoryLogger;
  watcher: { cb: (() => void) | null; watcher: SessionWatcherLike };
}

function makeBridge(options: { tailLines?: number; sendMode?: "steer" | "followUp"; thinkingDefault?: string; promptResult?: { ok: boolean; disposition?: string; error?: string } } = {}): Harness {
  const fakes: FakeRpcClient[] = [];
  const events: BridgeEvent[] = [];
  const logger = new MemoryLogger();
  const watcher: Harness["watcher"] = { cb: null, watcher: null as unknown as SessionWatcherLike };
  const bridge = new PiBridge({
    cwd: "/tmp",
    runtime,
    createClient: () => {
      const fake = new FakeRpcClient();
      if (options.promptResult) fake.promptResult = options.promptResult;
      fakes.push(fake);
      return fake;
    },
    logger,
    tailLines: options.tailLines ?? 200,
    sendMode: options.sendMode ?? "steer",
    thinkingDefault: options.thinkingDefault,
    createWatcher: (cb) => {
      watcher.cb = cb;
      const impl: SessionWatcherLike = {
        track: () => undefined,
        markSynced: () => undefined,
        start: () => undefined,
        dispose: () => undefined,
      };
      watcher.watcher = impl;
      return impl;
    },
  });
  bridge.onAny((event) => events.push(event));
  return { bridge, fakes, events, logger, watcher };
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

  it("abort：agent_settled(aborted) → run_state=aborted，历史保留", async () => {
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
    expect(states[states.length - 1]).toBe("aborted");
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
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await new Promise((r) => setTimeout(r, 5));
  }
}

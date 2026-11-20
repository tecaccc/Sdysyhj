#!/usr/bin/env node
// Mock pi RPC 子进程（确定性脚本响应，离线可重跑；禁止网络/API）。
// 协议与 pi --mode rpc JSONL 约定一致：stdin 每行一个命令，stdout 每行一个 response/事件。
//
// 环境变量：
//   FAKE_PI_LOG     追加记录 spawn/命令的 JSONL 日志文件（测试断言用）
//   FAKE_PI_FIXTURE get_messages / switch_session 返回的消息 JSON 文件（数组）
//   FAKE_PI_SESSION_FILE 会话 JSONL 文件路径；设置后 prompt 接受时物理落盘条目
//                    并广播 entry_appended 事件（模拟真实 pi 在 turn_start 边界写 user
//                    条目 / 终稿落盘，Issue #1 #D-01 回归）；未设置时行为与旧版一致
//
// 特殊 prompt 消息（触发脚本化行为）：
//   "CRASH_NOW"  → 输出部分事件后进程退出 code=3（子进程崩溃）
//   "ERROR"      → 模拟 provider 报错（stopReason: error）
//   "TOOL"       → 完整工具调用链（thinking + toolcall + tool_execution + toolResult + 第二轮回复）
//   "LONG"       → 持续流式输出直到 abort
//   "FLOOD"      → 一次性输出 600 个 text delta（NFR-01 代理判据：零丢失）
//   "SLOW"       → 首响应延迟 600ms 的简单回复（thinking 模型首响应延迟窗口，Issue #1）
//   "STDERR"     → stderr 输出 E2E-STDERR-MARKER 行 + stdout 输出非法 JSONL 行（FR-CMD-02）
//   "STDERRKEY"  → stderr 输出含凭证样文本（验证日志脱敏）
//   "UNICODE"    → text delta 内含 U+2028/U+2029（帧解析边界）
//   其他         → 简单文本流式回复 "Hello world"

"use strict";

const fs = require("fs");

const logPath = process.env.FAKE_PI_LOG;
function log(entry) {
  if (logPath) {
    try {
      fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
    } catch {
      // 忽略
    }
  }
}
log({ event: "spawn", pid: process.pid, args: process.argv.slice(2) });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function respond(cmd, data) {
  const out = { type: "response", command: cmd.type, success: true };
  if (cmd.id !== undefined) out.id = cmd.id;
  if (data !== undefined) out.data = data;
  send(out);
}

function respondError(cmd, error) {
  const out = { type: "response", command: cmd.type, success: false, error };
  if (cmd.id !== undefined) out.id = cmd.id;
  send(out);
}

const USAGE = { input: 3, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

function defaultMessages() {
  return [
    { role: "user", content: "hello", timestamp: 1 },
    {
      role: "assistant",
      content: [{ type: "text", text: "hi there" }],
      api: "mock",
      provider: "mock",
      model: "mock-alpha",
      usage: USAGE,
      stopReason: "stop",
      timestamp: 2,
    },
  ];
}

function loadFixtureMessages() {
  const fixture = process.env.FAKE_PI_FIXTURE;
  if (fixture) {
    try {
      return JSON.parse(fs.readFileSync(fixture, "utf8"));
    } catch {
      // fall through
    }
  }
  return defaultMessages();
}

// 模拟真实 pi 的会话文件落盘（仅 FAKE_PI_SESSION_FILE 设置时启用）
const sessionFilePath = process.env.FAKE_PI_SESSION_FILE || null;

/** 条目落盘（追加 JSONL 行）并广播 entry_appended（真实 pi：_commitBoundaryDrafts）。 */
function commitEntry(entry) {
  if (!sessionFilePath) return;
  try {
    fs.appendFileSync(sessionFilePath, JSON.stringify(entry) + "\n");
  } catch {
    // 忽略：落盘失败不影响事件流
  }
  send({ type: "entry_appended", entry });
}

const state = {
  provider: "mock",
  modelId: "mock-alpha",
  thinkingLevel: "high",
  sessionName: "mock-session",
  sessionFile: sessionFilePath || "/tmp/fake-pi-session.jsonl",
  sessionId: "fake-session-id",
  messages: loadFixtureMessages(),
  streaming: false,
  streamTimer: null,
  toolOutput: "line-1\nline-2\nline-3",
  thinkingLevels: ["off", "low", "medium", "high"],
};

function stateData() {
  return {
    model: { id: state.modelId, name: "Mock Model", provider: state.provider, api: "mock", reasoning: true, contextWindow: 100000, maxTokens: 8192 },
    thinkingLevel: state.thinkingLevel,
    isStreaming: state.streaming,
    isCompacting: false,
    steeringMode: "all",
    followUpMode: "one-at-a-time",
    sessionFile: state.sessionFile,
    sessionId: state.sessionId,
    sessionName: state.sessionName,
    autoCompactionEnabled: true,
    messageCount: state.messages.length,
    pendingMessageCount: 0,
  };
}

function assistantMessage(content, stopReason) {
  return {
    role: "assistant",
    content,
    api: "mock",
    provider: state.provider,
    model: state.modelId,
    usage: USAGE,
    stopReason,
    timestamp: Date.now(),
  };
}

// ---------- 脚本化运行 ----------

function runSimpleText() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello " } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "world" } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Hello world" } });
  const final = assistantMessage([{ type: "text", text: "Hello world" }], "stop");
  send({ type: "message_end", message: final });
  if (sessionFilePath) commitEntry({ type: "message", id: "e-sec", parentId: null, timestamp: new Date().toISOString(), message: final });
  state.messages.push({ role: "user", content: state.lastPrompt, timestamp: Date.now() }, final);
  send({ type: "agent_settled", aborted: false });
}

// Issue #1 触发窗口：prompt 接受后 user 条目已落盘，首响应延迟期间多个 watcher 轮询周期过去
function runSlow() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  setTimeout(() => {
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "slow reply" } });
    const final = assistantMessage([{ type: "text", text: "slow reply" }], "stop");
    send({ type: "message_end", message: final });
    if (sessionFilePath) commitEntry({ type: "message", id: "e-slow", parentId: null, timestamp: new Date().toISOString(), message: final });
    state.messages.push({ role: "user", content: state.lastPrompt, timestamp: Date.now() }, final);
    send({ type: "agent_settled", aborted: false });
  }, 600);
}

function runFlood() {
  const count = 600;
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  let full = "";
  for (let i = 1; i <= count; i += 1) {
    const delta = `d${String(i).padStart(3, "0")} `;
    full += delta;
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta } });
  }
  const final = assistantMessage([{ type: "text", text: full }], "stop");
  send({ type: "message_end", message: final });
  state.messages.push(final);
  send({ type: "agent_settled", aborted: false });
}

function runUnicode() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  const weird = "a\u2028b\u2029c";
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: weird } });
  const final = assistantMessage([{ type: "text", text: weird }], "stop");
  send({ type: "message_end", message: final });
  state.messages.push(final);
  send({ type: "agent_settled", aborted: false });
}

function runError() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "partial" } });
  const final = assistantMessage([{ type: "text", text: "partial" }], "error");
  final.errorMessage = "mock provider error: boom";
  send({ type: "message_end", message: final });
  state.messages.push(final);
  send({ type: "agent_settled", aborted: false });
}

function runTool() {
  send({ type: "agent_start" });
  // 第一轮：thinking + 工具调用
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_start", contentIndex: 0 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "I should run ls" } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "I should run ls" } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 1 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Let me check." } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_start", contentIndex: 2, id: "call_1", toolName: "bash" } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: "{\"command\":" } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: "\"ls\"}" } });
  send({
    type: "message_update",
    usage: USAGE,
    assistantMessageEvent: { type: "toolcall_end", contentIndex: 2, toolCall: { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } } },
  });
  const first = assistantMessage(
    [
      { type: "thinking", thinking: "I should run ls" },
      { type: "text", text: "Let me check." },
      { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } },
    ],
    "toolUse"
  );
  send({ type: "message_end", message: first });
  // 工具执行
  send({ type: "tool_execution_start", toolCallId: "call_1", toolName: "bash", args: { command: "ls" } });
  send({
    type: "tool_execution_update",
    toolCallId: "call_1",
    toolName: "bash",
    args: { command: "ls" },
    partialResult: { content: [{ type: "text", text: "line-1" }], details: {} },
  });
  send({
    type: "tool_execution_end",
    toolCallId: "call_1",
    result: { content: [{ type: "text", text: state.toolOutput }], details: {} },
    isError: false,
  });
  const toolResult = {
    role: "toolResult",
    toolCallId: "call_1",
    toolName: "bash",
    content: [{ type: "text", text: state.toolOutput }],
    isError: false,
    timestamp: Date.now(),
  };
  send({ type: "message_end", message: toolResult });
  // 第二轮：总结
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Done." } });
  const second = assistantMessage([{ type: "text", text: "Done." }], "stop");
  send({ type: "message_end", message: second });
  state.messages.push({ role: "user", content: state.lastPrompt, timestamp: Date.now() }, first, toolResult, second);
  send({ type: "agent_settled", aborted: false });
}

function runLong() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  let ticks = 0;
  state.streaming = true;
  state.streamTimer = setInterval(() => {
    ticks += 1;
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `tick${ticks} ` } });
    if (ticks >= 10000) finishLong(false);
  }, 5);
}

function finishLong(aborted) {
  if (state.streamTimer) {
    clearInterval(state.streamTimer);
    state.streamTimer = null;
  }
  if (!state.streaming) return;
  state.streaming = false;
  const final = assistantMessage([{ type: "text", text: "tick output" }], aborted ? "aborted" : "stop");
  send({ type: "message_end", message: final });
  state.messages.push(final);
  send({ type: "agent_settled", aborted: aborted === true });
}

function runStderr(withKey) {
  process.stderr.write("E2E-STDERR-MARKER mock diagnostic line\n");
  if (withKey) {
    process.stderr.write('{"api_key":"sk-mocksecret123456"}\n');
  }
  process.stdout.write("{invalid-jsonl-line\n"); // 非法 JSONL：客户端应记协议异常
  runSimpleText();
}

function runCrash() {
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "about to die" } });
  setTimeout(() => {
    log({ event: "crash-exit", pid: process.pid });
    process.exit(3);
  }, 5);
}

// ---------- 命令分发 ----------

function handleCommand(cmd) {
  log({ event: "command", type: cmd.type, id: cmd.id, sessionPath: cmd.sessionPath, message: cmd.message });
  switch (cmd.type) {
    case "prompt": {
      if (state.streaming) {
        if (cmd.streamingBehavior === "steer" || cmd.streamingBehavior === "followUp") {
          respond(cmd, { disposition: "queued" });
          return;
        }
        respondError(cmd, "already streaming (specify streamingBehavior)");
        return;
      }
      state.lastPrompt = cmd.message;
      respond(cmd, { disposition: "started" });
      const message = String(cmd.message ?? "");
      // 模拟真实 pi：turn_start 边界将 user 条目落盘并广播 entry_appended（仅显式启用时）
      if (sessionFilePath) {
        send({ type: "turn_start" });
        commitEntry({
          type: "message",
          id: "e-user",
          parentId: null,
          timestamp: new Date().toISOString(),
          message: { role: "user", content: cmd.message, timestamp: Date.now() },
        });
      }
      if (message === "CRASH_NOW") runCrash();
      else if (message === "ERROR") runError();
      else if (message === "TOOL") runTool();
      else if (message === "LONG") runLong();
      else if (message === "FLOOD") runFlood();
      else if (message === "SLOW") runSlow();
      else if (message === "STDERR") runStderr(false);
      else if (message === "STDERRKEY") runStderr(true);
      else if (message === "UNICODE") runUnicode();
      else runSimpleText();
      return;
    }
    case "steer":
    case "follow_up": {
      respond(cmd, { disposition: "queued" });
      send({ type: "queue_update", steering: cmd.type === "steer" ? [cmd.message] : [], followUp: cmd.type === "follow_up" ? [cmd.message] : [] });
      return;
    }
    case "abort": {
      respond(cmd);
      if (state.streaming) finishLong(true);
      return;
    }
    case "clear_queue": {
      respond(cmd, { steering: [], followUp: [] });
      return;
    }
    case "new_session": {
      state.messages = [];
      state.sessionName = "mock-session";
      respond(cmd, { cancelled: false });
      return;
    }
    case "switch_session": {
      state.sessionFile = cmd.sessionPath;
      state.messages = loadFixtureMessages();
      respond(cmd, { cancelled: false });
      send({ type: "session_info_changed", name: state.sessionName });
      return;
    }
    case "get_state": {
      respond(cmd, stateData());
      return;
    }
    case "get_messages": {
      respond(cmd, { messages: state.messages });
      return;
    }
    case "get_available_models": {
      respond(cmd, {
        models: [
          { id: "mock-alpha", name: "Mock Alpha", provider: "mock", api: "mock", reasoning: true, contextWindow: 100000, maxTokens: 8192 },
          { id: "mock-beta", name: "Mock Beta", provider: "mock", api: "mock", reasoning: false, contextWindow: 100000, maxTokens: 8192 },
        ],
      });
      return;
    }
    case "set_model": {
      state.provider = cmd.provider;
      state.modelId = cmd.modelId;
      respond(cmd, { provider: state.provider, id: state.modelId });
      return;
    }
    case "set_thinking_level": {
      state.thinkingLevel = cmd.level;
      respond(cmd);
      send({ type: "thinking_level_changed", level: state.thinkingLevel });
      return;
    }
    case "cycle_thinking_level": {
      const idx = state.thinkingLevels.indexOf(state.thinkingLevel);
      state.thinkingLevel = state.thinkingLevels[(idx + 1) % state.thinkingLevels.length];
      respond(cmd, { level: state.thinkingLevel });
      send({ type: "thinking_level_changed", level: state.thinkingLevel });
      return;
    }
    case "get_available_thinking_levels": {
      respond(cmd, { levels: state.thinkingLevels });
      return;
    }
    case "set_session_name": {
      state.sessionName = cmd.name;
      respond(cmd);
      send({ type: "session_info_changed", name: state.sessionName });
      return;
    }
    case "get_commands": {
      respond(cmd, {
        commands: [{ name: "fix-tests", description: "Fix failing tests", source: "prompt", location: "project" }],
      });
      return;
    }
    case "get_session_stats": {
      respond(cmd, { sessionFile: state.sessionFile, sessionId: state.sessionId, totalMessages: state.messages.length });
      return;
    }
    default: {
      respondError(cmd, `unknown command: ${cmd.type}`);
      return;
    }
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const idx = buffer.indexOf("\n");
    if (idx === -1) break;
    const line = buffer.slice(0, idx).replace(/\r$/, "");
    buffer = buffer.slice(idx + 1);
    if (line.trim().length === 0) continue;
    let cmd;
    try {
      cmd = JSON.parse(line);
    } catch {
      send({ type: "response", command: "parse", success: false, error: "bad json" });
      continue;
    }
    handleCommand(cmd);
  }
});

process.stdin.on("end", () => {
  log({ event: "stdin-end", pid: process.pid });
  process.exit(0);
});

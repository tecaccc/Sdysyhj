#!/usr/bin/env node
// 核验独立 fake pi RPC 子进程（测试 Agent 自写，不依赖被测仓库 test/ 内任何代码；
// 协议参考 pi --mode rpc JSONL 约定与 docs/tasks/TASK-003 §1 的代码级复现路径）。
//
// 环境变量：
//   VERIFY_FAKE_LOG    追加记录命令/落盘时戳的 JSONL 日志（驱动脚本断言用）
//   VERIFY_FAKE_MODE   "resumed"：--session <path> 续接既有会话文件；
//                      "fresh"  ：全新会话（首轮 turn 边界才创建会话文件，此前 get_state 返回 null）
//   VERIFY_DELAY_MS    prompt 接受（user 条目落盘）→ 首个 assistant message_end 的延迟（默认 3500）
//   VERIFY_SESSION_FILE fresh 模式下新建会话文件的落盘路径
//
// 协议：stdin 每行一个 JSON 命令；stdout 每行一个 response/事件（严格 JSONL，LF 切分）。

"use strict";
const fs = require("fs");

const logPath = process.env.VERIFY_FAKE_LOG;
function log(entry) {
  if (logPath) {
    try { fs.appendFileSync(logPath, JSON.stringify({ t: Date.now(), ...entry }) + "\n"); } catch {}
  }
}
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
function respond(cmd, data) {
  const out = { type: "response", command: cmd.type, success: true };
  if (cmd.id !== undefined) out.id = cmd.id;
  if (data !== undefined) out.data = data;
  send(out);
}

const USAGE = { input: 3, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const DELAY = Number(process.env.VERIFY_DELAY_MS || 3500);
const MODE = process.env.VERIFY_FAKE_MODE || "resumed";

// --session <path> 解析（buildArgs 生成：[cliPath, "--mode", "rpc", "--session", path]）
let resumedPath = null;
{
  const argv = process.argv.slice(2);
  const idx = argv.indexOf("--session");
  if (idx >= 0 && idx + 1 < argv.length) resumedPath = argv[idx + 1];
}

const state = {
  sessionFile: MODE === "resumed" ? resumedPath : null, // fresh 模式首轮落盘后才存在
  sessionId: "verify-session-id",
  sessionName: "verify-session",
  modelId: "verify-model",
  provider: "mock",
  thinkingLevel: "high",
  messages: [],
  turnCount: 0,
};

// 续接模式：预置文件中的历史消息（真实 pi switch/resume 后 get_messages 重放）
if (MODE === "resumed" && resumedPath && fs.existsSync(resumedPath)) {
  for (const line of fs.readFileSync(resumedPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.type === "message" && e.message && (e.message.role === "user" || e.message.role === "assistant")) {
        state.messages.push(e.message);
      }
    } catch {}
  }
}

function assistantFinal(text, stopReason) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "mock", provider: state.provider, model: state.modelId,
    usage: USAGE, stopReason, timestamp: Date.now(),
  };
}

/** 条目物理落盘 + 广播 entry_appended（真实 pi _commitBoundaryDrafts 行为）。 */
function commitEntry(entry, tag) {
  if (!state.sessionFile) return;
  try { fs.appendFileSync(state.sessionFile, JSON.stringify(entry) + "\n"); } catch {}
  log({ event: tag, file: state.sessionFile });
  send({ type: "entry_appended", entry });
}

function stateData() {
  return {
    model: { id: state.modelId, name: "Verify Model", provider: state.provider, api: "mock", reasoning: true, contextWindow: 100000, maxTokens: 8192 },
    thinkingLevel: state.thinkingLevel,
    isStreaming: false, isCompacting: false, steeringMode: "all", followUpMode: "one-at-a-time",
    sessionFile: state.sessionFile,           // fresh 模式首轮前 = null（#D-02 场景）
    sessionId: state.sessionId, sessionName: state.sessionName,
    autoCompactionEnabled: true, messageCount: state.messages.length, pendingMessageCount: 0,
  };
}

function runTurn(cmd) {
  state.turnCount += 1;
  send({ type: "agent_start" });
  send({ type: "message_start", message: assistantFinal([], "pending") });

  // turn_start 边界：user 条目落盘（真实 pi 在 prompt 接受时即写入；Issue #1 复现路径第 2 步）
  const userMsg = { role: "user", content: cmd.message, timestamp: Date.now() };
  if (MODE === "fresh" && state.turnCount === 1 && !state.sessionFile) {
    state.sessionFile = process.env.VERIFY_SESSION_FILE || null;
    if (state.sessionFile) {
      try { fs.appendFileSync(state.sessionFile, JSON.stringify({ type: "session", id: state.sessionId, timestamp: new Date().toISOString() }) + "\n"); } catch {}
    }
  }
  if (state.sessionFile) {
    send({ type: "turn_start" });
    commitEntry({ type: "message", id: `e-u${state.turnCount}`, parentId: null, timestamp: new Date().toISOString(), message: userMsg }, "user-entry-written");
  }
  state.messages.push(userMsg);

  // 首响应延迟（thinking 模型常态）：user 条目已落盘、assistant message_end 未到 → watcher 轮询窗口
  setTimeout(() => {
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `reply-${state.turnCount}` } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_end", contentIndex: 0, content: `reply-${state.turnCount}` } });
    const final = assistantFinal(`reply-${state.turnCount}`, "stop");
    send({ type: "message_end", message: final });
    log({ event: "assistant-final-emitted", turn: state.turnCount });
    if (state.sessionFile) {
      commitEntry({ type: "message", id: `e-a${state.turnCount}`, parentId: null, timestamp: new Date().toISOString(), message: final }, "assistant-entry-written");
    }
    state.messages.push(final);
    send({ type: "agent_settled", aborted: false });
  }, DELAY);
}

function handleCommand(cmd) {
  log({ event: "command", type: cmd.type, id: cmd.id, message: cmd.message });
  switch (cmd.type) {
    case "prompt":
      respond(cmd, { disposition: "started" });
      runTurn(cmd);
      return;
    case "steer":
    case "follow_up":
      respond(cmd, { disposition: "queued" });
      send({ type: "queue_update", steering: cmd.type === "steer" ? [cmd.message] : [], followUp: cmd.type === "follow_up" ? [cmd.message] : [] });
      return;
    case "abort":
      respond(cmd);
      send({ type: "agent_settled", aborted: true });
      return;
    case "new_session":
      state.messages = [];
      respond(cmd, { cancelled: false });
      return;
    case "switch_session":
      state.sessionFile = cmd.sessionPath;
      respond(cmd, { cancelled: false });
      send({ type: "session_info_changed", name: state.sessionName });
      return;
    case "get_state":
      respond(cmd, stateData());
      return;
    case "get_messages":
      respond(cmd, { messages: state.messages });
      return;
    case "get_available_models":
      respond(cmd, { models: [{ id: state.modelId, name: "Verify Model", provider: state.provider, api: "mock", reasoning: true, contextWindow: 100000, maxTokens: 8192 }] });
      return;
    case "set_model":
      state.provider = cmd.provider; state.modelId = cmd.modelId;
      respond(cmd, { provider: state.provider, id: state.modelId });
      return;
    case "set_thinking_level":
      state.thinkingLevel = cmd.level;
      respond(cmd);
      return;
    case "set_session_name":
      state.sessionName = cmd.name;
      respond(cmd);
      send({ type: "session_info_changed", name: state.sessionName });
      return;
    default:
      send({ type: "response", command: cmd.type, success: false, error: `unknown command: ${cmd.type}`, ...(cmd.id !== undefined ? { id: cmd.id } : {}) });
      return;
  }
}

log({ event: "spawn", pid: process.pid, mode: MODE, delayMs: DELAY, resumedPath, sessionFile: state.sessionFile });

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const idx = buffer.indexOf("\n");
    if (idx === -1) break;
    const line = buffer.slice(0, idx).replace(/\r$/, "");
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    let cmd;
    try { cmd = JSON.parse(line); } catch { send({ type: "response", command: "parse", success: false, error: "bad json" }); continue; }
    handleCommand(cmd);
  }
});
process.stdin.on("end", () => { log({ event: "stdin-end", pid: process.pid }); process.exit(0); });

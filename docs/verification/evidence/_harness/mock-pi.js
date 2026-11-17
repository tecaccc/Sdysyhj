#!/usr/bin/env node
// /tmp/vharness/mock-pi.js —— 按 test-cases.md §0.3 MOCK-* 规范实现的 pi RPC mock 子进程（L1）。
// 协议：stdin 每行一个 JSON 命令，stdout 每行一个 response/事件（pi --mode rpc JSONL 约定）。
// 每条收到的请求追加到 $MOCKLOG/calls.jsonl（§0.3 公共契约）。
// 会话持久化：$HOME/.pi/agent/sessions/--<enc>--/<ts>_<id>.jsonl（条目格式对齐 pi session-format）。
"use strict";
const fs = require("fs");
const path = require("path");

const MOCKLOG = process.env.MOCKLOG || "/tmp";
const CALLS = path.join(MOCKLOG, "calls.jsonl");
const SCENARIO = (process.env.MOCK_SCENARIO || "stream").toLowerCase();

function logCall(entry) {
  try {
    fs.appendFileSync(CALLS, JSON.stringify({ ts: Date.now(), pid: process.pid, ...entry }) + "\n");
  } catch {}
}
logCall({ event: "spawn", args: process.argv.slice(2), cwd: process.cwd(), scenario: SCENARIO });

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

// ---------- 会话存储 ----------
function encodeSessionDirName(cwd) {
  return `--${path.resolve(cwd).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}
const SESSIONS_ROOT =
  process.env.PI_CODING_AGENT_SESSION_DIR ||
  path.join(process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME, ".pi", "agent"), "sessions");
const SESSION_DIR = path.join(SESSIONS_ROOT, encodeSessionDirName(process.cwd()));

function newSessionFile() {
  // 惰性创建：首条条目落盘时才写文件（空会话不落盘，对齐 pi 行为）
  const id = "mocksess" + Math.random().toString(36).slice(2, 8);
  const file = path.join(SESSION_DIR, `${Date.now()}_${id}.jsonl`);
  return { id, file, lazy: true };
}
function ensureHeader(file, id) {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ type: "session", id, timestamp: new Date().toISOString() }) + "\n");
  }
}
function appendEntry(file, entry) {
  ensureHeader(file, state.session.id);
  fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n");
}
function loadFile(file) {
  const entries = [];
  if (!file || !fs.existsSync(file)) return entries;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch {}
  }
  return entries;
}

// 会话文件解析：支持 --session <path> 续接（TC-029/046）
function resolveInitialSession() {
  const idx = process.argv.indexOf("--session");
  if (idx >= 0 && process.argv[idx + 1] && fs.existsSync(process.argv[idx + 1])) {
    return loadSessionRef(process.argv[idx + 1]);
  }
  return newSessionFile();
}
function loadSessionRef(file) {
  let id = path.basename(file, ".jsonl");
  try {
    for (const e of loadFile(file)) {
      if (e.type === "session" && typeof e.id === "string") { id = e.id; break; }
    }
  } catch {}
  return { id, file };
}

const state = {
  provider: "mock",
  modelId: "mock-alpha",
  thinkingLevel: "high",
  sessionName: "",
  session: resolveInitialSession(),
  streaming: false,
  queue: { steering: [], followUp: [] },
  aborted: false,
};

// 恢复持久化的 model/thinkingLevel（TC-029 重启持久）
function restorePersisted() {
  try {
    if (!fs.existsSync(state.session.file)) return;
    for (const e of loadFile(state.session.file)) {
      if (e.type === "session_state") {
        if (e.modelId) state.modelId = e.modelId;
        if (e.thinkingLevel) state.thinkingLevel = e.thinkingLevel;
      }
      if (e.type === "session_info" && typeof e.name === "string") state.sessionName = e.name;
    }
  } catch {}
}
restorePersisted();

function persistState() {
  appendEntry(state.session.file, { type: "session_state", modelId: state.modelId, thinkingLevel: state.thinkingLevel });
}

function stateData() {
  return {
    model: { id: state.modelId, name: "Mock Model", provider: state.provider, api: "mock", reasoning: true, contextWindow: 100000, maxTokens: 8192 },
    thinkingLevel: state.thinkingLevel,
    isStreaming: state.streaming,
    isCompacting: false,
    sessionFile: state.session.file,
    sessionId: state.session.id,
    sessionName: state.sessionName,
    messageCount: 0,
    pendingMessageCount: state.queue.steering.length + state.queue.followUp.length,
  };
}

function messagesFromFile(file) {
  const msgs = [];
  for (const e of loadFile(file)) {
    if (e.type === "message" && e.message) msgs.push(e.message);
  }
  return msgs;
}

// ---------- 场景行为 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

function assistantMsg(content, stopReason, errorMessage) {
  const m = { role: "assistant", content, api: "mock", provider: state.provider, model: state.modelId, usage: USAGE, stopReason, timestamp: Date.now() };
  if (errorMessage) m.errorMessage = errorMessage;
  return m;
}
function userMsg(text) {
  return { role: "user", content: text, timestamp: Date.now() };
}

let busy = false;
let slowTimer = null;
let slowResolve = null;
let slowCount = 0;

// 场景可由 prompt 文本覆盖（便于同一进程内切换 MOCK-* 场景）
function effectiveScenario(text) {
  const t = String(text).toLowerCase();
  for (const key of ["think", "tools", "slow", "error", "crash", "big", "stderr", "noauth"]) {
    if (t.includes(key)) return key;
  }
  return SCENARIO;
}

async function runTurn(text) {
  busy = true;
  state.streaming = true;
  state.aborted = false;
  send({ type: "agent_start" });
  send({ type: "turn_start" });
  send({ type: "message_start", message: assistantMsg([], "pending") });
  const blocks = [];
  const t0 = Date.now();
  logCall({ event: "turn_start", prompt: text, scenario: SCENARIO });
  const scenario = effectiveScenario(text);

  const emitText = (delta, index) =>
    send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: index, delta } });
  const emitThinking = (delta, index) =>
    send({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: index, delta } });

  const finish = (content, stopReason, errorMessage) => {
    const msg = assistantMsg(content, stopReason, errorMessage);
    send({ type: "message_end", message: msg });
    // 落盘 user + assistant（messageCount 断言用）
    appendEntry(state.session.file, { type: "message", message: userMsg(text) });
    appendEntry(state.session.file, { type: "message", message: msg });
    state.streaming = false;
    busy = false;
    send({ type: "agent_end", messages: [userMsg(text), msg], willRetry: false });
    send({ type: "agent_settled", aborted: stopReason === "aborted" });
  };

  switch (scenario) {
    case "think": {
      for (const t of ["t1", "t2", "t3", "t4"]) { emitThinking(t, 0); await sleep(30); }
      for (const d of ["d1", "d2", "d3"]) { emitText(d, 1); await sleep(30); }
      blocks.push({ type: "thinking", thinking: "t1t2t3t4" }, { type: "text", text: "d1d2d3" });
      finish(blocks, "stop");
      break;
    }
    case "tools": {
      const tools = [
        { id: "tc-read", tool: "read", args: { path: "a.ts" }, out: Array.from({ length: 20 }, (_, i) => `read-line-${i + 1}`).join("\n") },
        { id: "tc-edit", tool: "edit", args: { path: "a.ts", oldString: "x", newString: "y" }, out: "edit ok" },
        { id: "tc-bash", tool: "bash", args: { command: "seq 1 20000" }, out: Array.from({ length: 20000 }, (_, i) => String(i + 1)).join("\n") },
      ];
      for (const t of tools) {
        const toolCall = { type: "toolCall", id: t.id, name: t.tool, arguments: t.args };
        blocks.push(toolCall);
        send({ type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: blocks.length - 1, id: t.id, toolName: t.tool } });
        send({ type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: blocks.length - 1, delta: JSON.stringify(t.args) } });
        send({ type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: blocks.length - 1, toolCall } });
        send({ type: "tool_execution_start", toolCallId: t.id, toolName: t.tool, args: t.args });
        send({ type: "tool_execution_update", toolCallId: t.id, toolName: t.tool, partialResult: { content: [{ type: "text", text: t.out }] } });
        send({ type: "tool_execution_end", toolCallId: t.id, result: { content: [{ type: "text", text: t.out }] }, isError: false });
        await sleep(20);
      }
      for (const d of ["d1", "d2"]) { emitText(d, 3); await sleep(20); }
      blocks.push({ type: "text", text: "d1d2" });
      finish(blocks, "toolUse");
      break;
    }
    case "slow": {
      // 每 200ms 一个 text delta，共 600 个，不主动结束（直至 abort）
      let slowText = "";
      await new Promise((resolve) => {
        slowResolve = resolve;
        slowTimer = setInterval(() => {
          if (state.aborted || slowCount >= 600) { clearInterval(slowTimer); slowTimer = null; resolve(); return; }
          slowCount += 1;
          emitText(`s${slowCount} `, 0);
          slowText += `s${slowCount} `;
        }, 200);
      });
      slowResolve = null;
      if (state.aborted) {
        finish([{ type: "text", text: slowText }], "aborted");
      } else {
        finish([{ type: "text", text: slowText }], "stop");
      }
      break;
    }
    case "error": {
      emitText("partial", 0);
      blocks.push({ type: "text", text: "partial" });
      finish(blocks, "error", "provider error: rate limited (429) — retry later");
      break;
    }
    case "crash": {
      // MOCK-CRASH：对触发 prompt（含 crash-check）子进程 exit(1)；恢复后其他 prompt 正常（验证自动重启后可用）
      if (String(text).includes("crash-check")) {
        emitText("x", 0);
        // 模拟 pi 崩溃前将凭证配置打到 stderr（脱敏路径必须覆盖，TC-039）
        try {
          const authRaw = fs.readFileSync(path.join(process.env.HOME, ".pi", "agent", "auth.json"), "utf8");
          process.stderr.write("config dump on crash: " + authRaw + "\n");
        } catch {}
        logCall({ event: "crash_exit" });
        process.exit(3);
      }
      let crashText = "";
      for (const d of ["d1", "d2"]) { emitText(d, 0); crashText += d; await sleep(20); }
      finish([{ type: "text", text: crashText }], "stop");
      break;
    }
    case "big": {
      let bigText = "";
      for (let i = 1; i <= 600; i++) { emitText(`b${i} `, 0); bigText += `b${i} `; }
      finish([{ type: "text", text: bigText }], "stop");
      break;
    }
    case "stderr": {
      process.stderr.write("E2E-STDERR-MARKER stderr line from mock pi\n");
      process.stdout.write("{this is not valid jsonl\n");
      for (const d of ["d1", "d2"]) { emitText(d, 0); await sleep(10); }
      finish([{ type: "text", text: "d1d2" }], "stop");
      break;
    }
    case "noauth": {
      // 模拟未配置凭证：prompt 被拒绝（pi 侧凭证校验失败）
      busy = false;
      state.streaming = false;
      logCall({ event: "prompt_rejected", reason: "no credentials" });
      return { reject: "未配置凭证：no auth found（请先运行 pi auth 完成登录）" };
    }
    default: {
      // MOCK-STREAM：d1..d8，间隔 ≥30ms（权威终稿为单 text 块）
      let textContent = "";
      for (const d of ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]) { emitText(d, 0); textContent += d; await sleep(30); }
      finish([{ type: "text", text: textContent }], "stop");
      break;
    }
  }
  return null;
}

// follow-up 队列：本轮结束后发送（TC-011b）
async function drainQueue() {
  const next = state.queue.steering.shift() || state.queue.followUp.shift();
  if (!next) return;
  logCall({ event: "queue_delivered", kind: next.kind, message: next.message });
  await runTurn(next.message);
  enqueue(drainQueue);
}

// ---------- 命令分发 ----------
let chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch((e) => logCall({ event: "handler_error", error: String(e) }));
}

process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let cmd;
    try { cmd = JSON.parse(line); } catch { continue; }
    logCall({ event: "command", type: cmd.type, args: summarizeArgs(cmd) });
    handle(cmd);
  }
});

function summarizeArgs(cmd) {
  const { type, id, ...rest } = cmd;
  return rest;
}

function handle(cmd) {
  switch (cmd.type) {
    case "prompt": {
      if (busy) { respondError(cmd, "busy"); return; }
      respond(cmd, { disposition: "started" });
      enqueue(async () => {
        const rej = await runTurn(cmd.message);
        if (rej) {
          // 被拒：以 response 失败呈现已在 respond 返回成功的情况下改为事件？此处以 error 事件 + message_end(error) 呈现
          send({ type: "message_start", message: assistantMsg([], "pending") });
          const msg = assistantMsg([{ type: "text", text: "" }], "error", rej.reject);
          send({ type: "message_end", message: msg });
          appendEntry(state.session.file, { type: "message", message: userMsg(cmd.message) });
          appendEntry(state.session.file, { type: "message", message: msg });
          send({ type: "agent_settled" });
        } else {
          enqueue(drainQueue);
        }
      });
      break;
    }
    case "steer":
      state.queue.steering.push({ kind: "steer", message: cmd.message });
      respond(cmd, { disposition: "queued" });
      send({ type: "queue_update", steering: state.queue.steering.map((q) => q.message), followUp: state.queue.followUp.map((q) => q.message) });
      break;
    case "follow_up":
      state.queue.followUp.push({ kind: "followUp", message: cmd.message });
      respond(cmd, { disposition: "queued" });
      send({ type: "queue_update", steering: state.queue.steering.map((q) => q.message), followUp: state.queue.followUp.map((q) => q.message) });
      break;
    case "abort":
      respond(cmd, {});
      logCall({ event: "abort_called" });
      state.aborted = true;
      if (slowTimer) { clearInterval(slowTimer); slowTimer = null; }
      if (slowResolve) slowResolve();
      break;
    case "new_session": {
      state.session = newSessionFile();
      state.sessionName = "";
      restorePersisted();
      respond(cmd, { cancelled: false });
      logCall({ event: "new_session", file: state.session.file });
      break;
    }
    case "switch_session": {
      const target = cmd.sessionPath;
      if (!fs.existsSync(target)) { respondError(cmd, "session not found"); return; }
      state.session = loadSessionRef(target);
      state.sessionName = "";
      restorePersisted();
      respond(cmd, { cancelled: false });
      logCall({ event: "switch_session", file: target });
      break;
    }
    case "get_state":
      logCall({ event: "state_response", data: stateData() });
      respond(cmd, stateData());
      break;
    case "get_messages":
      respond(cmd, { messages: messagesFromFile(state.session.file) });
      break;
    case "get_available_models":
      respond(cmd, { models: [
        { id: "mock-small", provider: "mock", name: "Mock Small", reasoning: false, contextWindow: 32000, maxTokens: 4096 },
        { id: "mock-large", provider: "mock", name: "Mock Large", reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      ] });
      break;
    case "set_model":
      state.modelId = cmd.modelId;
      persistState();
      respond(cmd, { id: cmd.modelId, provider: cmd.provider, name: "Mock Large" });
      break;
    case "get_available_thinking_levels":
      respond(cmd, { levels: ["off", "low", "medium", "high"] });
      break;
    case "set_thinking_level":
      state.thinkingLevel = cmd.level;
      persistState();
      respond(cmd, {});
      send({ type: "thinking_level_changed", level: cmd.level });
      break;
    case "cycle_thinking_level": {
      const levels = ["off", "low", "medium", "high"];
      const next = levels[(levels.indexOf(state.thinkingLevel) + 1) % levels.length];
      state.thinkingLevel = next;
      persistState();
      respond(cmd, { level: next });
      send({ type: "thinking_level_changed", level: next });
      break;
    }
    case "set_session_name":
      state.sessionName = cmd.name;
      appendEntry(state.session.file, { type: "session_info", name: cmd.name });
      respond(cmd, {});
      send({ type: "session_info_changed", name: cmd.name });
      break;
    case "clear_queue":
      respond(cmd, { steering: [], followUp: [] });
      state.queue = { steering: [], followUp: [] };
      break;
    default:
      respondError(cmd, `unknown command ${cmd.type}`);
  }
}

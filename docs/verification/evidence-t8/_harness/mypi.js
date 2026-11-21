#!/usr/bin/env node
// 独立 mock pi RPC 子进程（核验 Agent 自建，非交付物；仅 loopback/静态，零网络）。
// 协议依据 pi 1.5.2 随附权威文档（核验时已逐行核对）：
//   docs/json.md「Event sequence」L30–46：agent_start → turn_start → message_start(user) →
//     message_end(user) → message_start(assistant,pending) → message_update… → message_end(assistant)
//     → turn_end → agent_end → agent_settled；并按 golden 实测在 turn 首部补发 system 回声（桥侧应忽略）。
//   docs/rpc-commands.md「Prompting」L7–92：prompt/steer/follow_up 响应 disposition
//     started/queued/handled；success:false = 受理前拒绝；steer 轮间注入、follow_up 停后注入；
//     L33 入队前展开。docs/json.md L121–122：queue_update 快照（steering/followUp 全量）。
//   docs/rpc-commands.md L107–128：abort 继续保留队列中消息。
// 环境变量：
//   MYPI_SESSION_FILE  会话 JSONL 落盘路径（pi session 格式：session/message 行）
//   MYPI_REWRITE       "X=>Y"：user 回声与 JSONL 权威文本用 Y 替换 X（澄清 #16 改写模拟）
//   MYPI_DELAY_MS      prompt 响应行与其后事件流的延迟（默认 80；保证 T0 采样先于首个事件）
// prompt 文本前缀触发剧本：
//   MYPI_REJECT:...   → response success:false（受理前拒绝，无事件）
//   MYPI_HANDLED:...  → response success:true disposition=handled（无 run 无回声）
//   MYPI_LONG:...     → 流式至 abort
//   MYPI_STEERONLY:.. → 运行中等待 1 条 steer 入队 → 轮间注入
//   MYPI_MIX:...      → 运行中等待 steer+follow_up 均入队 → steer 先投、agent 停后 follow_up 投
//   MYPI_MIX_UNASSOC:.→ 同 MIX，但 steer 投递回声文本被改写（与发送原文/入队文本均不匹配）
//   MYPI_TOOL:...   → thinking + 工具调用链 + 迟到工具结果 + 第二轮总结（含 user 回声）
//   其他              → 单轮简单回复
"use strict";
const fs = require("fs");
const logPath = process.env.MYPI_LOG; // 每行 send() 的事件 type 日志（核验脚本观测 queue_update 等协议事件用）
const sessionFile = process.env.MYPI_SESSION_FILE || null;
const delayMs = Number(process.env.MYPI_DELAY_MS || 80);
const rewrite = (() => {
  const raw = process.env.MYPI_REWRITE;
  if (!raw) return null;
  const idx = raw.indexOf("=>");
  if (idx < 0) return null;
  return { from: raw.slice(0, idx), to: raw.slice(idx + 2) };
})();

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: {} };
const state = {
  sessionFile,
  sessionId: "mypi-session-id",
  messages: [],
  streaming: false,
  streamTimer: null,
  steering: [],
  followUp: [],
  wroteHeader: false,
};

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  if (logPath) { try { fs.appendFileSync(logPath, obj.type + "\n"); } catch { /* 忽略 */ } }
}
function respond(cmd, data) { send({ ...(cmd.id !== undefined ? { id: cmd.id } : {}), type: "response", command: cmd.type, success: true, ...(data !== undefined ? { data } : {}) }); }
function respondError(cmd, error) { send({ ...(cmd.id !== undefined ? { id: cmd.id } : {}), type: "response", command: cmd.type, success: false, error }); }

function appendSession(entry) {
  if (!sessionFile) return;
  try {
    if (!state.wroteHeader) {
      fs.appendFileSync(sessionFile, JSON.stringify({ type: "session", version: 3, id: state.sessionId, timestamp: new Date(0).toISOString(), cwd: "/tmp" }) + "\n");
      state.wroteHeader = true;
    }
    fs.appendFileSync(sessionFile, JSON.stringify(entry) + "\n");
  } catch { /* 忽略 */ }
}
function recordUser(text) {
  state.messages.push({ role: "user", content: [{ type: "text", text }], timestamp: state.messages.length });
  appendSession({ type: "message", id: `mu-${state.messages.length}`, parentId: null, timestamp: new Date(0).toISOString(), message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
}
function recordAssistant(text) {
  const m = { role: "assistant", content: [{ type: "text", text }], api: "mock", provider: "mypi", model: "mypi-m", usage: USAGE, stopReason: "stop", timestamp: state.messages.length };
  state.messages.push(m);
  appendSession({ type: "message", id: `ma-${state.messages.length}`, parentId: null, timestamp: new Date(0).toISOString(), message: m });
}
function recordAssistantRaw(m) {
  state.messages.push(m);
  appendSession({ type: "message", id: `ma-${state.messages.length}`, parentId: null, timestamp: new Date(0).toISOString(), message: m });
}

/** user 回声（json.md L38–39）；system 回声（golden 实测，桥侧忽略）。 */
function echoUser(text) {
  const content = [{ type: "text", text }];
  send({ type: "message_start", message: { role: "system", content: [], timestamp: 0 } });
  send({ type: "message_end", message: { role: "system", content: [], timestamp: 0 } });
  send({ type: "message_start", message: { role: "user", content, timestamp: 1 } });
  send({ type: "message_end", message: { role: "user", content, timestamp: 1 } });
  recordUser(text);
}
function queueSnap() { send({ type: "queue_update", steering: [...state.steering], followUp: [...state.followUp] }); }

function assistantReply(text) {
  send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text } });
  send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], usage: USAGE, stopReason: "stop", timestamp: 2 } });
  recordAssistant(text);
}
/** 注入一轮（golden 实测形态：turn_start → queue_update(出队) → user 回声 → 助手轮 → turn_end）。 */
function injectedTurn(echoText, reply) {
  send({ type: "turn_start" });
  queueSnap();
  echoUser(echoText);
  assistantReply(reply);
  send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: reply }] }, toolResults: [] });
}

function waitUntil(cond, cb, timeoutMs = 8000) {
  const started = Date.now();
  const step = () => { if (cond()) { cb(); return; } if (Date.now() - started > timeoutMs) { cb(); return; } setTimeout(step, 5); };
  step();
}

function echoTextFor(text) { return rewrite && text === rewrite.from ? rewrite.to : text; }

function runSimple(cmd, text) {
  respond(cmd, { disposition: "started" });
  setTimeout(() => {
    const echo = echoTextFor(text);
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    echoUser(echo);
    assistantReply(`ack: ${echo}`);
    send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: `ack: ${echo}` }] }, toolResults: [] });
    send({ type: "agent_end", messages: [], willRetry: false });
    send({ type: "agent_settled", aborted: false });
  }, delayMs);
}

function runSteerOnly(cmd, text) {
  respond(cmd, { disposition: "started" });
  setTimeout(() => {
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    echoUser(text);
    send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "main turn streaming" } });
    waitUntil(() => state.steering.length >= 1, () => {
      send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "main turn done" }], usage: USAGE, stopReason: "stop", timestamp: 2 } });
      recordAssistant("main turn done");
      send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "main turn done" }] }, toolResults: [] });
      const s = state.steering.shift();
      injectedTurn(s, `steered ack: ${s}`);
      send({ type: "agent_end", messages: [], willRetry: false });
      send({ type: "agent_settled", aborted: false });
    });
  }, delayMs);
}

function runMix(cmd, text, unassoc) {
  respond(cmd, { disposition: "started" });
  setTimeout(() => {
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    echoUser(text);
    send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "main turn streaming" } });
    waitUntil(() => state.steering.length >= 1 && state.followUp.length >= 1, () => {
      send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "main turn done" }], usage: USAGE, stopReason: "stop", timestamp: 2 } });
      recordAssistant("main turn done");
      send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "main turn done" }] }, toolResults: [] });
      // steer 轮间注入（rpc-commands.md L26/L48）；UNASSOC 分支改写投递回声文本
      const s = state.steering.shift();
      const sEcho = unassoc ? `UNASSOC-TRANSFORMED(${s})` : s;
      injectedTurn(sEcho, `steered ack: ${sEcho}`);
      // agent 停止（无更多工具调用/steer）→ follow_up 停后注入（rpc-commands.md L72）
      send({ type: "agent_end", messages: [], willRetry: false });
      const f = state.followUp.shift();
      injectedTurn(f, `fu ack: ${f}`);
      send({ type: "agent_end", messages: [], willRetry: false });
      send({ type: "agent_settled", aborted: false });
    });
  }, delayMs);
}

function runTool(cmd, text) {
  respond(cmd, { disposition: "started" });
  setTimeout(() => {
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    echoUser(text);
    // 第一轮：thinking + 工具调用
    send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_start", contentIndex: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "need to inspect" } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "need to inspect" } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 1 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Checking." } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_start", contentIndex: 2, id: "tc1", toolName: "bash" } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: '{"command":"ls"}' } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "toolcall_end", contentIndex: 2, toolCall: { type: "toolCall", id: "tc1", name: "bash", arguments: { command: "ls" } } } });
    const first = { role: "assistant", content: [ { type: "thinking", thinking: "need to inspect" }, { type: "text", text: "Checking." }, { type: "toolCall", id: "tc1", name: "bash", arguments: { command: "ls" } } ], usage: USAGE, stopReason: "toolUse", timestamp: 1 };
    send({ type: "message_end", message: first });
    recordAssistantRaw(first);
    send({ type: "turn_end", message: first, toolResults: [] });
    // 工具执行（迟到结果状态收敛：running → success）
    send({ type: "tool_execution_start", toolCallId: "tc1", toolName: "bash", args: { command: "ls" } });
    send({ type: "tool_execution_update", toolCallId: "tc1", toolName: "bash", args: { command: "ls" }, partialResult: { content: [{ type: "text", text: "partial-out" }], details: {} } });
    send({ type: "tool_execution_end", toolCallId: "tc1", result: { content: [{ type: "text", text: "file-a\nfile-b" }], details: {} }, isError: false });
    const tr = { role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [{ type: "text", text: "file-a\nfile-b" }], isError: false, timestamp: 2 };
    send({ type: "message_end", message: tr });
    // 第二轮：总结（json.md L40–44）
    send({ type: "turn_start" });
    send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "tool done summary" } });
    const second = { role: "assistant", content: [{ type: "text", text: "tool done summary" }], usage: USAGE, stopReason: "stop", timestamp: 3 };
    send({ type: "message_end", message: second });
    recordAssistantRaw(second);
    send({ type: "turn_end", message: second, toolResults: [tr] });
    send({ type: "agent_end", messages: [], willRetry: false });
    send({ type: "agent_settled", aborted: false });
  }, delayMs);
}

function runLong(cmd, text) {
  respond(cmd, { disposition: "started" });
  setTimeout(() => {
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    echoUser(text);
    send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
    send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    state.streaming = true;
    let n = 0;
    state.streamTimer = setInterval(() => {
      n += 1;
      send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `t${n} ` } });
      if (n > 100000) finishLong(false);
    }, 5);
  }, delayMs);
}

function finishLong(aborted) {
  if (state.streamTimer) { clearInterval(state.streamTimer); state.streamTimer = null; }
  if (!state.streaming) return;
  state.streaming = false;
  send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "long partial" }], usage: USAGE, stopReason: aborted ? "aborted" : "stop", timestamp: 3 } });
  recordAssistant("long partial");
  send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "long partial" }] }, toolResults: [] });
  send({ type: "agent_end", messages: [], willRetry: false });
  send({ type: "agent_settled", aborted: aborted === true });
  queueSnap(); // abort 后队列保留（rpc-commands.md L128）
}

function handleCommand(cmd) {
  switch (cmd.type) {
    case "get_state": {
      respond(cmd, {
        model: { id: "mypi-m", name: "MyPi M", provider: "mypi", api: "mock", reasoning: false, contextWindow: 100000, maxTokens: 8192 },
        thinkingLevel: "off", isStreaming: state.streaming, isCompacting: false,
        steeringMode: "one-at-a-time", followUpMode: "one-at-a-time",
        sessionFile: state.sessionFile || "/tmp/mypi-session.jsonl", sessionId: state.sessionId,
        sessionName: "mypi-session", autoCompactionEnabled: true,
        messageCount: state.messages.length, pendingMessageCount: state.steering.length + state.followUp.length,
      });
      return;
    }
    case "get_messages": { respond(cmd, { messages: state.messages }); return; }
    case "prompt": {
      if (state.streaming) {
        if (cmd.streamingBehavior === "steer" || cmd.streamingBehavior === "followUp") {
          const q = cmd.streamingBehavior === "steer" ? state.steering : state.followUp;
          q.push(String(cmd.message ?? ""));
          queueSnap();
          respond(cmd, { disposition: "queued" });
          return;
        }
        respondError(cmd, "already streaming (specify streamingBehavior)");
        return;
      }
      const text = String(cmd.message ?? "");
      if (text.startsWith("MYPI_REJECT:")) { respondError(cmd, "rejected before acceptance (mock)"); return; }
      if (text.startsWith("MYPI_HANDLED:")) { respond(cmd, { disposition: "handled" }); return; }
      if (text.startsWith("MYPI_LONG:")) { runLong(cmd, text); return; }
      if (text.startsWith("MYPI_STEERONLY:")) { runSteerOnly(cmd, text); return; }
      if (text.startsWith("MYPI_MIX_UNASSOC:")) { runMix(cmd, text, true); return; }
      if (text.startsWith("MYPI_MIX:")) { runMix(cmd, text, false); return; }
      if (text.startsWith("MYPI_TOOL:")) { runTool(cmd, text); return; }
      // 新 prompt 且 followUp 队列有保留（abort 后保留队列在新运行继续投递，rpc-commands.md L128）
      if (state.followUp.length > 0) {
        respond(cmd, { disposition: "started" });
        setTimeout(() => {
          send({ type: "agent_start" });
          send({ type: "turn_start" });
          echoUser(text);
          assistantReply(`ack: ${text}`);
          send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: `ack: ${text}` }] }, toolResults: [] });
          send({ type: "agent_end", messages: [], willRetry: false });
          const f = state.followUp.shift();
          injectedTurn(f, `late fu ack: ${f}`);
          send({ type: "agent_end", messages: [], willRetry: false });
          send({ type: "agent_settled", aborted: false });
          queueSnap();
        }, delayMs);
        return;
      }
      runSimple(cmd, text);
      return;
    }
    case "steer":
    case "follow_up": {
      const q = cmd.type === "steer" ? state.steering : state.followUp;
      q.push(String(cmd.message ?? ""));
      queueSnap(); // golden 实测：queue_update 先于 response 行
      respond(cmd, { disposition: "queued" });
      return;
    }
    case "abort": { respond(cmd); if (state.streaming) finishLong(true); return; }
    case "clear_queue": {
      const cleared = { steering: [...state.steering], followUp: [...state.followUp] };
      state.steering = []; state.followUp = [];
      respond(cmd, cleared);
      queueSnap();
      return;
    }
    case "new_session": { state.messages = []; state.steering = []; state.followUp = []; respond(cmd, { cancelled: false }); return; }
    case "switch_session": {
      state.sessionFile = cmd.sessionPath || state.sessionFile;
      state.wroteHeader = true; // 目标文件已存在（或由外部预置）
      state.messages = [];
      try {
        for (const line of fs.readFileSync(state.sessionFile, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "message" && e.message && (e.message.role === "user" || e.message.role === "assistant")) {
            state.messages.push(e.message);
          }
        }
      } catch { /* 空会话 */ }
      state.steering = []; state.followUp = [];
      respond(cmd, { cancelled: false });
      return;
    }
    case "set_session_name": { respond(cmd); send({ type: "session_info_changed", name: cmd.name }); return; }
    case "get_session_stats": { respond(cmd, { sessionFile: state.sessionFile, sessionId: state.sessionId, totalMessages: state.messages.length }); return; }
    default: { respondError(cmd, `unknown command: ${cmd.type}`); return; }
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
    if (!line.trim()) continue;
    let cmd; try { cmd = JSON.parse(line); } catch { send({ type: "response", command: "parse", success: false, error: "bad json" }); continue; }
    handleCommand(cmd);
  }
});
process.stdin.on("end", () => process.exit(0));

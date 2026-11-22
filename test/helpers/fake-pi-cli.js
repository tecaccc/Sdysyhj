#!/usr/bin/env node
// Mock pi RPC 子进程（确定性脚本响应，离线可重跑；禁止网络/API）。
// 协议与 pi --mode rpc JSONL 约定一致：stdin 每行一个命令，stdout 每行一个 response/事件。
//
// 外部契约锚点（对照权威文档编写，规范第一部分 §4.3）：
//   - user 回声：node_modules/@earendil-works/pi-coding-agent/docs/json.md「Event sequence」L30–46
//     ——一次 prompt 的权威序列为 agent_start → turn_start → message_start(user) →
//     message_end(user) → message_start(assistant) → … → agent_settled；所有 run* 剧本均已补发
//     user 角色 message_start/message_end 回声（TASK-008 / FR-CHAT-11）。
//   - 队列语义：docs/rpc-commands.md「Prompting」L7–92（steer 当前助手轮工具执行完后注入、
//     follow_up 仅 agent 停下后注入；disposition started/queued/handled）与 docs/json.md
//     「Queue and state events」L121–122（queue_update 两字段含完整当前队列）。
//   - 回放模式 FAKE_PI_REPLAY：按 golden fixture（test/fixtures/golden/*.jsonl，真实 pi 录制）
//     逐命令回放响应与其后事件行，并对输入命令序列与录制一致性断言（无脚本分支、无时钟）。
//   - UI-XSS 探针剧本（TASK-009 切换批次 D8 改名，原 LAB-XSS；FR-AUI-02④）：user 回声与 assistant 回复均携带
//     <script>/<img onerror> 探针文本，事件形状与 runSimpleText 同构（对照 json.md「Event
//     sequence」L30–46）；断言面 = jsdom 真实渲染下探针文本逐字保真且无新增 script 元素（D8 XSS 探针升格）。
//
// 环境变量：
//   FAKE_PI_LOG     追加记录 spawn/命令的 JSONL 日志文件（测试断言用）
//   FAKE_PI_FIXTURE get_messages / switch_session 返回的消息 JSON 文件（数组）
//   FAKE_PI_SESSION_FILE 会话 JSONL 文件路径；设置后 prompt 接受时物理落盘条目
//                    并广播 entry_appended 事件（模拟真实 pi 在 turn_start 边界写 user
//                    条目 / 终稿落盘，Issue #1 #D-01 回归）；未设置时行为与旧版一致
//   FAKE_PI_REPLAY  golden fixture 文件路径；设置后启用回放模式（见上）
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
//   "UI-XSS"    → XSS 探针剧本（user 回声 + assistant 回复均含 <script>/<img onerror> 探针）
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

// ---------- golden fixture 回放模式（FAKE_PI_REPLAY，TASK-008 §10.12 D8） ----------
// fixture：test/fixtures/golden/*.jsonl（真实 pi 录制），每行 {"dir":"in"|"out","record":{…}}，
// 行首 # 为注释（加载时剥离）。in = 录制时写入 pi stdin 的命令；out = pi stdout 的响应/事件。
// 行为：启动时回放首个 in 前的全部前置事件；此后 stdin 每收到一条命令即与游标处录制命令
// 做一致性断言（type + message/sessionPath），命中后回放该命令的响应行及其后至下一 in 前
// 的全部事件行。无脚本分支、无时钟（确定性最强）。
const replayPath = process.env.FAKE_PI_REPLAY;
let replayRecords = null;
let replayCursor = 0;
if (replayPath) {
  try {
    const raw = fs.readFileSync(replayPath, "utf8");
    replayRecords = raw
      .split("\n")
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))
      .map((l) => JSON.parse(l));
  } catch (err) {
    process.stderr.write(`FAKE_PI_REPLAY 加载失败：${replayPath}：${err.message}\n`);
    process.exit(2);
  }
  while (replayCursor < replayRecords.length && replayRecords[replayCursor].dir === "out") {
    send(replayRecords[replayCursor].record);
    replayCursor += 1;
  }
}

function replayFail(detail) {
  log({ event: "replay-mismatch", detail, cursor: replayCursor });
  process.stderr.write(`FAKE_PI_REPLAY 不一致（cursor=${replayCursor}）：${detail}\n`);
  process.exit(2);
}

function replayCommand(cmd) {
  const rec = replayRecords[replayCursor];
  if (!rec || rec.dir !== "in") {
    replayFail(`录制已无待匹配命令，却收到 ${cmd.type}`);
  }
  const want = rec.record;
  if (want.type !== cmd.type) {
    replayFail(`命令 type 不一致：录制=${want.type} 实际=${cmd.type}`);
  }
  if (want.message !== undefined && want.message !== cmd.message) {
    replayFail(`命令 message 不一致：录制=${JSON.stringify(want.message)} 实际=${JSON.stringify(cmd.message)}`);
  }
  if (want.sessionPath !== undefined && want.sessionPath !== cmd.sessionPath) {
    replayFail(`命令 sessionPath 不一致：录制=${want.sessionPath} 实际=${cmd.sessionPath}`);
  }
  replayCursor += 1;
  while (replayCursor < replayRecords.length && replayRecords[replayCursor].dir === "out") {
    send(replayRecords[replayCursor].record);
    replayCursor += 1;
  }
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

/**
 * user 回声（json.md L30–46）：pi 对每条到达模型的用户消息（初始 prompt 与 steer/follow_up
 * 注入）必回发 user 角色 message_start/message_end，先于该轮助手消息。content 为文本块数组
 * （与真实 pi 一致）。FR-CHAT-11 / TASK-008。
 */
function echoUser(text) {
  const content = [{ type: "text", text }];
  send({ type: "message_start", message: { role: "user", content, timestamp: Date.now() } });
  send({ type: "message_end", message: { role: "user", content, timestamp: Date.now() } });
}

/** 队列快照透出（json.md L121–122：steering/followUp 均含完整当前队列）。 */
function sendQueueUpdate() {
  send({ type: "queue_update", steering: [...state.steering], followUp: [...state.followUp] });
}

/** 入队（rpc-commands.md L46–92：steer/follow_up 排队，响应 disposition=queued）并透出快照。 */
function enqueue(queue, message) {
  state[queue].push(message);
  sendQueueUpdate();
}

/**
 * 投递一条入队消息（rpc-commands.md L46–92）：回声先干队列移除（顺序假设见设计 §10.12
 * 受控假设①：桥侧匹配不依赖两者先后）。deliverSteering=true 时为轮间注入，否则为停后注入。
 */
function deliverOne(queue) {
  const text = state[queue].shift();
  echoUser(text);
  sendQueueUpdate();
  return text;
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
  steering: [],
  followUp: [],
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
  echoUser(state.lastPrompt); // user 回声（json.md L30–46）
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
  echoUser(state.lastPrompt);
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
  echoUser(state.lastPrompt);
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
  echoUser(state.lastPrompt);
  send({ type: "message_start", message: assistantMessage([], "pending") });
  const weird = "a\u2028b\u2029c";
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: weird } });
  const final = assistantMessage([{ type: "text", text: weird }], "stop");
  send({ type: "message_end", message: final });
  state.messages.push(final);
  send({ type: "agent_settled", aborted: false });
}

/**
 * UI-XSS 探针剧本（TASK-009 切换批次 D8 改名，原 LAB-XSS；FR-AUI-02④/NFR-03）：user 回声与 assistant 回复均携带
 * <script>alert(1)</script> 与 <img src=x onerror=…> 探针文本。事件形状与 runSimpleText 同构
 * （json.md L30–46）。用法：prompt "UI-XSS"（探针仅出现在回声与回复文本，不注入任何标记语义；原 LAB-XSS 剧本）。
 */
const LAB_XSS_PROBE = '<script>alert(1)</script><img src=x onerror=alert(2)>';

function runLabXss() {
  const userText = `UI-XSS probe ${LAB_XSS_PROBE}`;
  const replyText = `probe reply ${LAB_XSS_PROBE}`;
  send({ type: "agent_start" });
  echoUser(userText);
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: replyText.slice(0, 11) } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: replyText.slice(11) } });
  const final = assistantMessage([{ type: "text", text: replyText }], "stop");
  send({ type: "message_end", message: final });
  state.messages.push({ role: "user", content: userText, timestamp: Date.now() }, final);
  send({ type: "agent_settled", aborted: false });
}

function runError() {
  send({ type: "agent_start" });
  echoUser(state.lastPrompt);
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
  echoUser(state.lastPrompt);
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
  echoUser(state.lastPrompt);
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

// Issue #2 / #D-03：上游扩展系统错误事件（会话重载后陈旧 ctx 的异步回调触发，多行错误文本）
function runExtensionError() {
  const staleError = "This extension ctx is stale after session replacement or reload\n  at core/extensions/runner.js:482";
  send({ type: "extension_error", extensionPath: "/home/u/.pi/agent/npm/pi-loop/main.js", event: "subagent-async", error: staleError });
  send({ type: "extension_error", extensionPath: "/home/u/.pi/agent/npm/pi-loop/main.js", event: "subagent-async", error: staleError }); // 同键重复（toast 去重验证）
  send({ type: "extension_error", extensionPath: "/home/u/.pi/agent/npm/subagents/main.js", event: "timer", error: "Extension context invalidated" });
  runSimpleText();
}

function runCrash() {
  send({ type: "agent_start" });
  echoUser(state.lastPrompt);
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "about to die" } });
  setTimeout(() => {
    log({ event: "crash-exit", pid: process.pid });
    process.exit(3);
  }, 5);
}

/**
 * 运行中 steer + follow_up 混合注入剧本（rpc-commands.md L46–92；结构与真实 pi 录制对齐，
 * 见 test/fixtures/golden/golden-steer-followup.jsonl）：首轮助手流式进行中接收两条插话（发送顺序
 * 任意；剧本等待两者均入队——条件等待而非时钟）；随后：当前助手轮结束（turn_end）→
 * turn_start + queue_update（移除）+ 注入回声 → 新助手轮 → …；steering 逐条注入（默认
 * one-at-a-time）→ agent 停下（无更多工具调用/steer）→ followUp 逐条注入（同样 turn 边界）→
 * agent_end + agent_settled。投递顺序与发送顺序解耦（follow_up 先发后投、steer 后发先投）。
 */
function runQueueMix() {
  send({ type: "agent_start" });
  echoUser(state.lastPrompt);
  send({ type: "message_start", message: assistantMessage([], "pending") });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "first turn running" } });
  const started = Date.now();
  const waitBoth = (cb) => {
    if ((state.steering.length >= 1 && state.followUp.length >= 1) || Date.now() - started > 8000) {
      cb();
      return;
    }
    setTimeout(() => waitBoth(cb), 5); // 有界条件等待（两命令均会到达，非时钟断言）
  };
  waitBoth(() => {
    const first = assistantMessage([{ type: "text", text: "first turn done" }], "stop");
    send({ type: "message_end", message: first });
    send({ type: "turn_end", message: first, toolResults: [] });
    state.messages.push({ role: "user", content: state.lastPrompt, timestamp: Date.now() }, first);
    const injectedTurn = (text, prefix) => {
      send({ type: "turn_start" });
      sendQueueUpdate(); // 注入即出队（录制实证：queue_update 先于回声到达）
      echoUser(text);
      send({ type: "message_start", message: assistantMessage([], "pending") });
      send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `${prefix}: ${text}` } });
      const reply = assistantMessage([{ type: "text", text: `${prefix}: ${text}` }], "stop");
      send({ type: "message_end", message: reply });
      send({ type: "turn_end", message: reply, toolResults: [] });
      state.messages.push({ role: "user", content: text, timestamp: Date.now() }, reply);
    };
    while (state.steering.length > 0) injectedTurn(state.steering.shift(), "steered"); // 轮间注入
    while (state.followUp.length > 0) injectedTurn(state.followUp.shift(), "followed up"); // 停后注入
    send({ type: "agent_end", messages: [], willRetry: false });
    send({ type: "agent_settled", aborted: false });
  });
}

// ---------- 命令分发 ----------

function handleCommand(cmd) {
  log({ event: "command", type: cmd.type, id: cmd.id, sessionPath: cmd.sessionPath, message: cmd.message });
  switch (cmd.type) {
    case "prompt": {
      if (state.streaming) {
        if (cmd.streamingBehavior === "steer" || cmd.streamingBehavior === "followUp") {
          respond(cmd, { disposition: "queued" });
          enqueue(cmd.streamingBehavior === "steer" ? "steering" : "followUp", String(cmd.message ?? ""));
          return;
        }
        respondError(cmd, "already streaming (specify streamingBehavior)");
        return;
      }
      state.lastPrompt = cmd.message;
      respond(cmd, { disposition: "started" });
      // abort 后保留的 steering 队列在后续 prompt 继续投递（rpc-commands.md L126）
      while (state.steering.length > 0) {
        const text = state.steering.shift();
        send({ type: "agent_start" });
        echoUser(text);
        sendQueueUpdate();
        send({ type: "message_start", message: assistantMessage([], "pending") });
        send({ type: "message_update", usage: USAGE, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `resumed steer: ${text}` } });
        const reply = assistantMessage([{ type: "text", text: `resumed steer: ${text}` }], "stop");
        send({ type: "message_end", message: reply });
        state.messages.push({ role: "user", content: text, timestamp: Date.now() }, reply);
        send({ type: "agent_end", messages: [], willRetry: false });
      }
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
      else if (message === "EXTERR") runExtensionError();
      else if (message === "UNICODE") runUnicode();
      else if (message === "UI-XSS") runLabXss();
      else if (message === "QUEUEMIX") runQueueMix();
      else runSimpleText();
      return;
    }
    case "steer":
    case "follow_up": {
      respond(cmd, { disposition: "queued" });
      enqueue(cmd.type === "steer" ? "steering" : "followUp", String(cmd.message ?? ""));
      return;
    }
    case "abort": {
      respond(cmd);
      if (state.streaming) finishLong(true);
      return;
    }
    case "clear_queue": {
      const cleared = { steering: [...state.steering], followUp: [...state.followUp] };
      state.steering = [];
      state.followUp = [];
      respond(cmd, cleared);
      sendQueueUpdate();
      return;
    }
    case "new_session": {
      state.messages = [];
      state.steering = [];
      state.followUp = [];
      state.sessionName = "mock-session";
      respond(cmd, { cancelled: false });
      return;
    }
    case "switch_session": {
      state.sessionFile = cmd.sessionPath;
      state.messages = loadFixtureMessages();
      state.steering = [];
      state.followUp = [];
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
    if (replayRecords) {
      // 回放模式：命令序列一致性断言 + 按录制游标回放响应与事件
      log({ event: "command", type: cmd.type, id: cmd.id, message: cmd.message });
      replayCommand(cmd);
      continue;
    }
    handleCommand(cmd);
  }
});

process.stdin.on("end", () => {
  log({ event: "stdin-end", pid: process.pid });
  process.exit(0);
});

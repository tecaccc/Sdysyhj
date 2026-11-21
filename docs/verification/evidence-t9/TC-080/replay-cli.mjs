#!/usr/bin/env node
// 独立核验用 RPC 子进程驱动（核验 Agent 自建，不复用 test/helpers/fake-pi-cli.js）。
// 模式一 VERIFY_REPLAY=<golden fixture>：逐命令回放 fixture（行为契约 = fixture 自身；
//   启动回放首个 in 前的全部 out；每条 stdin 命令按 type+message 匹配游标，命中后回放
//   该命令之后至下一 in 前的全部 out，响应 id 重写为来令 id）。
// 模式二 VERIFY_SCRIPT=xss：核验侧自建 LAB-XSS 剧本（事件形状转印自 golden-prompt-basic
//   fixture 的 agent_start→turn_start→user 回声→assistant 流式→settled 骨架，探针文本替换）。
// 零网络、无时钟、无脚本分支（回放模式）。退出：stdin 关闭即 exit 0。
"use strict";
import fs from "fs";
const log0 = 0; // ESM 化占位（无副作用）

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

const mode = process.env.VERIFY_SCRIPT ? "script" : "replay";
const fixturePath = process.env.VERIFY_REPLAY;

// ---------- 模式一：golden fixture 回放 ----------
function loadFixture(p) {
  const lines = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  return lines.map((l) => JSON.parse(l));
}
let records = [];
let cursor = 0; // 指向下一个待匹配的 in 记录
if (mode === "replay") {
  records = loadFixture(fixturePath);
  // 回放首个 in 之前的全部前置 out
  while (cursor < records.length && records[cursor].dir === "out") {
    send(records[cursor].record);
    cursor++;
  }
}

function matchIn(cmd, rec) {
  if (!rec || rec.dir !== "in") return false;
  if (rec.record.type !== cmd.type) return false;
  const a = rec.record.message, b = cmd.message;
  if ((a === undefined) !== (b === undefined)) return false;
  if (a !== undefined && a !== b) return false;
  return true;
}

function handleCommand(cmd) {
  if (mode === "script") return handleScript(cmd);
  // 一致性断言（不匹配即硬失败，暴露实现侧命令序列偏差）
  if (cursor >= records.length || !matchIn(cmd, records[cursor])) {
    process.stderr.write(`VERIFY_REPLAY mismatch at cursor=${cursor}: got ${JSON.stringify(cmd).slice(0, 120)}\n`);
    process.exit(4);
  }
  cursor++;
  while (cursor < records.length && records[cursor].dir === "out") {
    const rec = records[cursor].record;
    if (rec.type === "response" && cmd.id !== undefined) rec.id = cmd.id; // id 重写（稳健）
    send(rec);
    cursor++;
  }
}

// ---------- 模式二：LAB-XSS 剧本（核验自建；形状 = golden 骨架 + §0.3 LAB-XSS 定义） ----------
const P1 = `<script>alert(1)</script>`;
const P2 = `<img src=x onerror=alert(2)>`;
function handleScript(cmd) {
  if (cmd.type === "get_state") {
    send({ id: cmd.id, type: "response", command: "get_state", success: true, data: { model: { id: "m", name: "m", api: "a", provider: "p", baseUrl: "http://127.0.0.1:0/v1", reasoning: false, input: ["text"], cost: null, contextWindow: 128000, maxTokens: 16384 }, thinkingLevel: "off", isStreaming: false, isCompacting: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", sessionFile: "X", sessionId: "X", autoCompactionEnabled: true, messageCount: 0, pendingMessageCount: 0 } });
    return;
  }
  if (cmd.type === "get_messages") {
    send({ id: cmd.id, type: "response", command: "get_messages", success: true, data: { messages: [] } });
    return;
  }
  if (cmd.type === "abort") { send({ id: cmd.id, type: "response", command: "abort", success: true, data: {} }); return; }
  if (cmd.type !== "prompt" && cmd.type !== "steer" && cmd.type !== "follow_up") {
    send({ id: cmd.id, type: "response", command: cmd.type, success: true, data: {} });
    return;
  }
  const kind = cmd.type;
  const echo = cmd.message; // 回声 = 发送原文（pi 语义：回声与发送同文；探针由发送侧携带）
  const reply = `assistant-reply ${P2} ${P1}`;
  send({ id: cmd.id, type: "response", command: kind, success: true, data: { disposition: kind === "prompt" ? "started" : "queued" } });
  send({ type: "agent_start" });
  send({ type: "turn_start" });
  if (kind === "prompt") {
    send({ type: "message_start", message: { role: "user", content: [{ type: "text", text: echo }], timestamp: 0 } });
    send({ type: "message_end", message: { role: "user", content: [{ type: "text", text: echo }], timestamp: 0 } });
  } else {
    send({ type: "queue_update", steering: kind === "steer" ? [cmd.message] : [], followUp: kind === "follow_up" ? [cmd.message] : [] });
  }
  send({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: 0 } });
  const deltas = [reply.slice(0, 20), reply.slice(20, 44), reply.slice(44)];
  for (const d of deltas) send({ type: "message_update", usage: null, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: d } });
  send({ type: "message_update", usage: null, assistantMessageEvent: { type: "text_end", contentIndex: 0, content: reply } });
  send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: reply }], stopReason: "stop", timestamp: 0, durationMs: 0 } });
  send({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: reply }], toolResults: [] } });
  send({ type: "agent_end", messages: [] });
  send({ type: "agent_settled", aborted: false });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let cmd;
    try { cmd = JSON.parse(line); } catch { continue; }
    handleCommand(cmd);
  }
});
process.stdin.on("end", () => { setTimeout(() => process.exit(0), 10); });

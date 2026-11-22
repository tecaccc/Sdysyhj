#!/usr/bin/env node
// 核验 Agent 自建回放 CLI（独立实现；协议语义按 pi 1.5.2 docs/rpc.md「Run lifecycle」+ json.md
// 「Event sequence」L30–46 转印：stdin JSONL 命令 → stdout JSONL 响应/事件）。
// 回放语义：启动回放游标前全部 out 记录；此后每条 stdin 命令在剩余 in 记录中向前匹配
// （type + message），命中后回放其后至下一 in 前的 out 记录；响应帧按录制原文透传（id 关联由
// RpcClient 侧 sdysyhj-N 序列自然对齐）。无网络、无时钟分支（确定性）。

import fs from "node:fs";
import readline from "node:readline";

const fixturePath = process.env.VERIFY_REPLAY_FIXTURE;
if (!fixturePath) {
  process.stderr.write("VERIFY_REPLAY_FIXTURE 未设置\n");
  process.exit(2);
}
const records = fs
  .readFileSync(fixturePath, "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))
  .map((l) => JSON.parse(l));

let currentCmdId;
function send(record) {
  // 响应帧 id 归一：与当前请求 id 对齐（RpcClient 按 id 关联；事件帧原样透传）
  const r = record.type === "response" && currentCmdId !== undefined ? { ...record, id: currentCmdId } : record;
  process.stdout.write(JSON.stringify(r) + "\n");
}

let cursor = 0;
function replayOutsFrom(i) {
  let j = i;
  while (j < records.length && records[j].dir === "out") {
    const rec = records[j].record;
    if (rec.type === "__exit") process.exit(rec.code ?? 1); // 自建 mock 崩溃剧本（非 pi 事件）
    if (rec.type === "__sleep") { // 自建 mock 节奏（确定性同步暂停，供时点采样）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, rec.ms ?? 100);
      j += 1;
      continue;
    }
    send(rec);
    j += 1;
  }
  return j;
}

// 启动前置 out
cursor = replayOutsFrom(0);

const consumed = new Set();
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    return;
  }
  currentCmdId = cmd.id;
  if (cmd.type === "interrupt" || cmd.type === "abort" || cmd.type === "quit") {
    // 仍走匹配回放（fixture 内有 abort 的响应与事件）
  }
  // 向前匹配下一条未消费的同型 in 记录
  let hit = -1;
  for (let i = cursor; i < records.length; i += 1) {
    const r = records[i];
    if (r.dir !== "in" || consumed.has(i)) continue;
    if (r.record.type !== cmd.type) continue;
    if (r.record.message !== undefined && r.record.message !== cmd.message) continue;
    hit = i;
    break;
  }
  if (hit < 0) {
    process.stderr.write(`VERIFY_REPLAY 无匹配命令：${cmd.type}\n`);
    // 容错：返回空成功响应（不静默丢弃；stderr 留痕）
    if (cmd.id !== undefined) send({ id: cmd.id, type: "response", command: cmd.type, success: true, data: {} });
    return;
  }
  consumed.add(hit);
  cursor = replayOutsFrom(hit + 1);
});

rl.on("close", () => process.exit(0));

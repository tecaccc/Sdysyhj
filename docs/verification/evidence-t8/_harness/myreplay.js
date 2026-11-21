#!/usr/bin/env node
// 独立 golden fixture 回放器（核验 Agent 自建）：逐行回放 test/fixtures/golden/*.jsonl，
// 输入命令与录制游标做一致性断言（type + message），命中后回放响应与其后事件。
// 期望源 = 录制 trace 本身（真实 pi 1.5.2），非我方 mock 行为。零网络零时钟。
"use strict";
const fs = require("fs");
const file = process.env.MYREPLAY_FILE;
if (!file) { process.stderr.write("MYREPLAY_FILE 未设置\n"); process.exit(2); }
let records;
try {
  records = fs.readFileSync(file, "utf8").split("\n")
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))
    .map((l) => JSON.parse(l));
} catch (err) { process.stderr.write(`加载失败：${err.message}\n`); process.exit(2); }
let cursor = 0;
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
while (cursor < records.length && records[cursor].dir === "out") { send(records[cursor].record); cursor += 1; }
function fail(detail) { process.stderr.write(`MYREPLAY 不一致（cursor=${cursor}）：${detail}\n`); process.exit(2); }
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
    let cmd; try { cmd = JSON.parse(line); } catch { continue; }
    const rec = records[cursor];
    if (!rec || rec.dir !== "in") fail(`录制无待匹配命令，收到 ${cmd.type}`);
    if (rec.record.type !== cmd.type) fail(`type 不一致：录制=${rec.record.type} 实际=${cmd.type}`);
    if (rec.record.message !== undefined && String(rec.record.message) !== String(cmd.message)) {
      fail(`message 不一致：录制=${JSON.stringify(rec.record.message)} 实际=${JSON.stringify(cmd.message)}`);
    }
    cursor += 1;
    while (cursor < records.length && records[cursor].dir === "out") { send(records[cursor].record); cursor += 1; }
  }
});
process.stdin.on("end", () => process.exit(0));

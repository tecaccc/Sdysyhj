#!/usr/bin/env node
// pi-tee：golden fixture 录制用双向转录器（仅 test/tooling/record-golden.mjs 使用，非产品代码）。
// 用法：node pi-tee.mjs <captureFile> <command> [args...]
// spawn <command>，stdin→子进程、子进程 stdout→stdout 双向透传，并把每个 JSONL 行按到达序
// 追加写入 <captureFile>：{"dir":"in","line":"…"} / {"dir":"out","line":"…"}。
// stdin 关闭（RpcClient.stop）即转发 EOF 给子进程，子进程退出后本进程同码退出（自终止）。

import { spawn } from "node:child_process";
import fs from "node:fs";

const [captureFile, command, ...args] = process.argv.slice(2);
if (!captureFile || !command) {
  console.error("usage: node pi-tee.mjs <captureFile> <command> [args...]");
  process.exit(2);
}
const fd = fs.openSync(captureFile, "a");
const append = (dir, line) => fs.writeSync(fd, JSON.stringify({ dir, line }) + "\n");

const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });

let outBuf = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  outBuf += chunk;
  for (;;) {
    const idx = outBuf.indexOf("\n");
    if (idx === -1) break;
    const line = outBuf.slice(0, idx).replace(/\r$/, "");
    outBuf = outBuf.slice(idx + 1);
    if (line.length > 0) append("out", line);
  }
});
child.stdout.on("end", () => {
  if (outBuf.length > 0) append("out", outBuf);
  outBuf = "";
});

let inBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  try {
    child.stdin.write(chunk);
  } catch {
    // 子进程已退出：忽略
  }
  inBuf += chunk;
  for (;;) {
    const idx = inBuf.indexOf("\n");
    if (idx === -1) break;
    const line = inBuf.slice(0, idx).replace(/\r$/, "");
    inBuf = inBuf.slice(idx + 1);
    if (line.length > 0) append("in", line);
  }
});
process.stdin.on("end", () => {
  try {
    child.stdin.end();
  } catch {
    // 忽略
  }
});
child.stdin.on("error", () => {});
child.on("exit", (code) => {
  try {
    fs.closeSync(fd);
  } catch {
    // 忽略
  }
  process.exit(code ?? 0);
});

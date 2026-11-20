// 核验驱动公共库：启动 PiBridge（真实 SessionFileWatcher、真实 RpcClient、fake pi 子进程），
// 收集事件、提供确定性等待。断言在各场景脚本内。
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const FAKE_PI = "/tmp/verify-harness/fake-pi-verify.js";

function loadBridge() {
  return require(process.env.BRIDGE_BUNDLE || "/tmp/verify-harness/bridge-bundle.cjs");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return Date.now() - start;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时（${timeoutMs}ms）：${label}`);
    await sleep(25);
  }
}

/** 读 fake pi JSONL 日志。 */
function readLog(logFile) {
  try { return fs.readFileSync(logFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
}

/** 续接场景：预置"昨日会话"JSONL（user+assistant 各 1 条，消息数口径 #12：2）。 */
function seedSessionFile(dir) {
  const enc = `--${path.resolve(dir).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const sessDir = path.join(dir, ".pi", "agent", "sessions", enc);
  fs.mkdirSync(sessDir, { recursive: true });
  const file = path.join(sessDir, "session-verify-seed.jsonl");
  const entries = [
    { type: "session", id: "seed-session", timestamp: "2026-11-19T09:00:00.000Z" },
    { type: "message", id: "e-seed-1", parentId: null, timestamp: "2026-11-19T09:00:01.000Z", message: { role: "user", content: "昨日问题", timestamp: 1 } },
    { type: "message", id: "e-seed-2", parentId: null, timestamp: "2026-11-19T09:00:05.000Z", message: { role: "assistant", content: [{ type: "text", text: "昨日回答" }], api: "mock", provider: "mock", model: "verify-model", usage: null, stopReason: "stop", timestamp: 2 } },
  ];
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return file;
}

/**
 * 组装 PiBridge + fake pi。
 * opts: { cwd, mode, delayMs, logFile, resumeSessionPath }
 */
function makeBridge(opts) {
  const { PiBridge, RpcClient, MemoryLogger } = loadBridge();
  const events = [];
  const bridge = new PiBridge({
    cwd: opts.cwd,
    runtime: { source: "verify-harness", command: process.execPath, baseArgs: [FAKE_PI], detail: "verify fake pi" },
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command, args, cwd,
        env: {
          ...process.env,
          VERIFY_FAKE_LOG: opts.logFile,
          VERIFY_FAKE_MODE: opts.mode,
          VERIFY_DELAY_MS: String(opts.delayMs),
          ...(opts.sessionFileForFresh ? { VERIFY_SESSION_FILE: opts.sessionFileForFresh } : {}),
        },
      }),
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
    ...(opts.resumeSessionPath ? { resumeSessionPath: opts.resumeSessionPath } : {}),
  });
  bridge.onAny((event) => events.push({ t: Date.now(), ...event }));
  return { bridge, events };
}

function externalChanges(events) { return events.filter((e) => e.kind === "external_change"); }
function errorEvents(events) { return events.filter((e) => e.kind === "error"); }
function runStates(events) { return events.filter((e) => e.kind === "run_state").map((e) => e.state); }

module.exports = { loadBridge, sleep, waitFor, readLog, seedSessionFile, makeBridge, externalChanges, errorEvents, runStates };

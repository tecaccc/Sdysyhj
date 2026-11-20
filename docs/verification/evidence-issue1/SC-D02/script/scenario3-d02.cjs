// 场景 3（SC-D02 / #D-02）：全新会话（无续接）首轮 settled 后 sessionFile 被补学、
// 后续外部写入可检出。若补学失效：watcher 永不跟踪 → external_change 永不触发 → FAIL。
// 运行：node scenario3-d02.cjs <expect-clean|expect-bug>
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sleep, waitFor, readLog, makeBridge, externalChanges } = require("./driver-lib.cjs");

const EXPECT = process.argv[2] || "expect-clean";

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-sc3-"));
  const cwd = path.join(tmp, "workspace");
  fs.mkdirSync(cwd, { recursive: true });
  const home = path.join(tmp, "home");
  const enc = `--${path.resolve(cwd).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const sessionFile = path.join(home, ".pi", "agent", "sessions", enc, "session-fresh.jsonl");
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  const logFile = path.join(tmp, "fake-pi.log");

  const { bridge, events } = makeBridge({ cwd, mode: "fresh", delayMs: 120, logFile, sessionFileForFresh: sessionFile });
  const failures = [];
  const note = [];

  await bridge.start();
  // 前置自检：启动时 get_state 返回 sessionFile=null（fresh 模式首轮前无文件）——见 fake 日志
  const spawnRec = readLog(logFile).find((l) => l.event === "spawn");
  if (!spawnRec || spawnRec.sessionFile !== null) failures.push("fake pi 前置不符：启动时 sessionFile 应为 null");
  else note.push("前置确认：启动 get_state 时 sessionFile=null（全新会话）");

  // 第一轮：turn 边界物理创建会话文件并写入 user/assistant 条目
  const t1 = Date.now();
  await bridge.sendPrompt("全新会话第一句");
  await waitFor(() => events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= t1), 15000, "首轮 settled 回 idle");
  if (!fs.existsSync(sessionFile)) failures.push("会话文件未被 fake pi 创建（场景无效）");
  else note.push(`首轮落盘：${sessionFile}（${fs.readFileSync(sessionFile, "utf8").split("\n").filter((l) => l.trim()).length} 行）`);

  // #D-02 修复点：settled 后 refreshState 补学（get_state 在 settled 之后被再次调用）
  const settledAt = events.filter((e) => e.kind === "run_state" && e.state === "idle" && e.t >= t1).pop().t;
  let learned = false;
  try {
    await waitFor(() => readLog(logFile).filter((l) => l.event === "command" && l.type === "get_state" && l.t >= settledAt).length > 0, 5000, "settled 后 get_state 补学");
    learned = true;
  } catch {
    learned = false;
  }
  if (learned) note.push("settled 后观测到 get_state 二次调用（refreshState 补学）");
  else if (EXPECT === "expect-clean") failures.push("settled 后未观察到 get_state 补学（#D-02 修复缺失）");
  else note.push("阴性对照：settled 后无 get_state 补学（预修复代码 #D-02 表现）");

  // 等基线稳定 ≥1 个轮询周期
  await sleep(2800);
  if (externalChanges(events).length > 0) failures.push(`前置阶段即出现 external_change（× ${externalChanges(events).length}）——首轮内部写入被误报`);

  // ---- 外部写入：应可检出 ----
  const tExt = Date.now();
  fs.appendFileSync(sessionFile, JSON.stringify({ external: "probe-d02", note: "simulated terminal pi write" }) + "\n");
  let detected = false;
  try {
    await waitFor(() => externalChanges(events).length > 0, 6000, "external_change 事件");
    detected = true;
  } catch {
    detected = false;
  }
  const latency = detected ? externalChanges(events)[0].t - tExt : -1;

  if (EXPECT === "expect-clean") {
    if (!detected) failures.push("外部写入未被检出（#D-02：sessionFile 未补学 → watcher 未跟踪）");
    else note.push(`外部写入检出成功，延迟 ${latency}ms（≤5000ms 门禁）`);
  } else {
    if (detected) failures.push("阴性对照未复现：#D-02 在预修复代码上竟检出（判别力问题）");
    else note.push("阴性对照复现 #D-02：外部写入未检出（预修复代码 sessionFile 永不补学）");
  }

  await bridge.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`场景：SC-D02（#D-02 全新会话补学，期望=${EXPECT}）`);
  for (const n of note) console.log(`NOTE: ${n}`);
  if (failures.length > 0) { for (const f of failures) console.log(`FAIL: ${f}`); process.exit(1); }
  console.log("RESULT: " + (EXPECT === "expect-clean" ? "PASS（settled 补学 sessionFile，后续外部写入可检出，首轮无误报）" : "PASS（阴性对照如预期复现 #D-02 漏检）"));
}

main().catch((err) => { console.error("HARNESS-ERROR:", err.message); process.exit(2); });

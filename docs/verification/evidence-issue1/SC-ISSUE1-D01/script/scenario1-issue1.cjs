// 场景 1（SC-ISSUE1 / #D-01）：独立重放 Issue #1「会话中第二条消息误报外部修改」。
// 步骤：续接会话已跟踪 → prompt 接受即物理写 user 条目（turn_start 边界）→ 延迟 ≥3s 才回首个
// assistant message_end → 断言全程无 external_change、无拦截错误、第二条消息可正常发送。
// 运行：node scenario1-issue1.cjs <预期结果：expect-clean|expect-bug>（默认 expect-clean）
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sleep, waitFor, readLog, seedSessionFile, makeBridge, externalChanges, errorEvents, runStates } = require("./driver-lib.cjs");

const EXPECT = process.argv[2] || "expect-clean"; // expect-clean=被测标签应无缺陷；expect-bug=阴性对照（旧代码应复现）
const DELAY_MS = 3500; // ≥3s（watcher 轮询周期 2500ms 的 1.4 倍，确保至少一次轮询落在窗口内）

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-sc1-"));
  const cwd = path.join(tmp, "workspace");
  fs.mkdirSync(cwd, { recursive: true });
  const sessionFile = seedSessionFile(path.join(tmp, "home"));
  const logFile = path.join(tmp, "fake-pi.log");

  const { bridge, events } = makeBridge({ cwd, mode: "resumed", delayMs: DELAY_MS, logFile, resumeSessionPath: sessionFile });
  const failures = [];
  const note = [];
  global.__verifyEvents = events;
  global.__verifyLog = logFile;

  await bridge.start();
  // 前置自检：get_state 已学习 sessionFile 并进入跟踪（fake pi spawn 日志 + 首 get_state 已发生）
  await waitFor(() => readLog(logFile).some((l) => l.event === "command" && l.type === "get_state"), 5000, "启动后 get_state");
  note.push(`续接会话文件：${sessionFile}`);

  // ---- 第一轮：触发 Issue #1 窗口 ----
  const tSend1 = Date.now();
  await bridge.sendPrompt("第一条消息");
  await waitFor(() => events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= tSend1 + DELAY_MS / 2), DELAY_MS + 12000, "第一轮 settled 回 idle");

  const log1 = readLog(logFile);
  const userWrite = log1.find((l) => l.event === "user-entry-written");
  const finalEmit = log1.find((l) => l.event === "assistant-final-emitted");
  if (!userWrite) failures.push("未观察到 user 条目落盘（fake pi 未写文件）——场景无效");
  if (!finalEmit) failures.push("未观察到 assistant message_end——场景无效");
  if (userWrite && finalEmit) {
    const gap = finalEmit.t - userWrite.t;
    note.push(`落盘→首响应窗口实测 ${gap}ms（要求 ≥3000ms）`);
    if (gap < 3000) failures.push(`落盘→首响应窗口 ${gap}ms < 3000ms——场景未真正覆盖轮询窗口`);
  }
  note.push(`watcher 轮询周期 2500ms，窗口 ${DELAY_MS}ms ⇒ 窗口内必然发生 ≥1 次轮询`);

  // ---- 窗口期间/全程：external_change 断言 ----
  await sleep(2600); // settled 后再等一个轮询周期，观察是否存在迟到误报
  const exts = externalChanges(events);
  const intercepted = errorEvents(events).filter((e) => /拦截|插件之外被修改/.test(String(e.message)));

  if (EXPECT === "expect-clean") {
    if (exts.length > 0) failures.push(`误报 external_change × ${exts.length}：${JSON.stringify(exts)}`);
    if (intercepted.length > 0) failures.push(`出现拦截错误：${JSON.stringify(intercepted)}`);
  } else {
    if (exts.length === 0) failures.push("阴性对照未复现：窗口内无 external_change（场景无判别力或修复已在该代码中）");
    else note.push(`阴性对照复现误报 × ${exts.length}（符合预期：旧代码缺陷）`);
  }

  // ---- 第二条消息（用户报障点）----
  const promptsBefore = readLog(logFile).filter((l) => l.event === "command" && l.type === "prompt").length;
  const tSend2 = Date.now();
  await bridge.sendPrompt("第二条消息");
  if (EXPECT === "expect-clean") {
    await waitFor(() => events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= tSend2), DELAY_MS + 12000, "第二轮 settled 回 idle");
  } else {
    // 阴性对照：被拦截时无第二轮运行——等待“拦截错误”或第二轮 idle 任一到达
    await waitFor(
      () =>
        events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= tSend2) ||
        errorEvents(events).some((e) => /拦截|插件之外被修改/.test(String(e.message)) && e.t >= tSend2),
      DELAY_MS + 12000,
      "阴性对照：拦截错误或第二轮 idle"
    );
    await sleep(500);
  }
  const promptsAfter = readLog(logFile).filter((l) => l.event === "command" && l.type === "prompt").length;
  if (promptsAfter !== promptsBefore + 1) {
    if (EXPECT === "expect-clean") failures.push(`第二条消息未到达 pi 子进程（prompt 命令 ${promptsBefore}→${promptsAfter}）`);
    else note.push(`阴性对照：prompt 命令 ${promptsBefore}→${promptsAfter}（被拦截，未达子进程——复现用户报障）`);
  }
  const extsAll = externalChanges(events);
  const intercept2 = errorEvents(events).filter((e) => /拦截|插件之外被修改/.test(String(e.message)) && e.t >= tSend2);
  if (EXPECT === "expect-clean") {
    if (extsAll.length > 0) failures.push(`全程误报 external_change × ${extsAll.length}`);
    if (intercept2.length > 0) failures.push(`第二条消息被拦截：${JSON.stringify(intercept2)}`);
  } else {
    if (intercept2.length === 0 && extsAll.length === 0) failures.push("阴性对照：第二条消息未被拦截且无误报——未复现用户报障");
    else note.push(`阴性对照：第二条消息拦截错误 × ${intercept2.length}（复现用户报障）`);
  }
  note.push(`run_state 序列：${runStates(events).join(" → ")}`);

  await bridge.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`场景：SC-ISSUE1（#D-01 独立重放，期望=${EXPECT}）`);
  for (const n of note) console.log(`NOTE: ${n}`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`FAIL: ${f}`);
    process.exit(1);
  }
  console.log("RESULT: " + (EXPECT === "expect-clean" ? "PASS（全程无 external_change、无拦截、第二条消息正常发送并完成）" : "PASS（阴性对照如预期复现缺陷，证明场景有判别力）"));
}

function readLastLog() {
  try { return fs.readFileSync(global.__verifyLog, "utf8").split("\n").filter((l) => l.trim()).slice(-15); } catch { return []; }
}

main().catch((err) => {
  console.error("HARNESS-ERROR:", err.message);
  try { console.error("EVENTS-DUMP:", JSON.stringify(global.__verifyEvents || [], null, 1).slice(0, 6000)); } catch {}
  try { console.error("LOG-DUMP:", JSON.stringify(readLastLog(), null, 1).slice(0, 3000)); } catch {}
  process.exit(2);
});

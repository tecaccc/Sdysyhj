// 场景 2（SC-EXT-IDLE / TC-022 独立核验 + 口径 C）：反向语义保持——
// idle 下真实外部写入会话文件 → external_change 在时限内触发、后续 prompt 被拦截并引导刷新、刷新后恢复。
// 运行：node scenario2-external-idle.cjs
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sleep, waitFor, readLog, seedSessionFile, makeBridge, externalChanges, errorEvents } = require("./driver-lib.cjs");

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-sc2-"));
  const cwd = path.join(tmp, "workspace");
  fs.mkdirSync(cwd, { recursive: true });
  const sessionFile = seedSessionFile(path.join(tmp, "home"));
  const logFile = path.join(tmp, "fake-pi.log");

  const { bridge, events } = makeBridge({ cwd, mode: "resumed", delayMs: 120, logFile, resumeSessionPath: sessionFile });
  const failures = [];
  const note = [];

  await bridge.start();
  // 第一轮快速完成 → idle（此时 watcher 未挂起、基线已同步）
  const t1 = Date.now();
  await bridge.sendPrompt("开场消息");
  await waitFor(() => events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= t1), 15000, "第一轮 settled 回 idle");
  // 等 ≥1 个完整轮询周期（2500ms）确保基线稳定且无残留挂起
  await sleep(2800);
  if (externalChanges(events).length > 0) failures.push(`前置阶段即出现 external_change（× ${externalChanges(events).length}）——场景被污染`);

  // ---- 外部写入（模拟终端 pi 写同一会话）----
  const tExt = Date.now();
  fs.appendFileSync(sessionFile, JSON.stringify({ external: "probe", note: "simulated terminal pi write" }) + "\n");
  note.push(`外部写入时刻：${new Date(tExt).toISOString()}，行内容：{"external":"probe"}`);

  // (a) ≤5s 内 external_change 提示（TC-022(a)；任务书要求一个轮询周期 2.5s 内，实测记录）
  await waitFor(() => externalChanges(events).length > 0, 6000, "external_change 事件");
  const ext = externalChanges(events)[0];
  const latency = ext.t - tExt;
  note.push(`external_change 触发延迟实测 ${latency}ms（TC-022 门禁 ≤5000ms；任务书口径：一个轮询周期 2500ms 内）`);
  if (latency > 5000) failures.push(`external_change 延迟 ${latency}ms > 5000ms（TC-022(a) FAIL）`);
  if (latency > 2500) note.push(`披露：触发延迟 ${latency}ms 超过单轮询周期 2500ms（仍 ≤5s 门禁内；轮询相位所致）`);
  const detailOk = /插件之外被修改/.test(String(ext.detail));
  if (!detailOk) failures.push(`external_change 文案异常：${ext.detail}`);

  // (b) 后续 prompt 被拦截（口径 C/#13：不静默继续陈旧状态）
  await sleep(200);
  const promptsBefore = readLog(logFile).filter((l) => l.event === "command" && l.type === "prompt").length;
  const tSend2 = Date.now();
  await bridge.sendPrompt("外部修改后的消息");
  await sleep(1200);
  const promptsAfter = readLog(logFile).filter((l) => l.event === "command" && l.type === "prompt").length;
  const interceptErr = errorEvents(events).find((e) => /拦截/.test(String(e.message)) && e.t >= tSend2);
  if (!interceptErr) failures.push("外部修改后 prompt 未被拦截（口径 C FAIL）");
  else {
    note.push(`拦截提示：${interceptErr.message} | hint：${interceptErr.hint}`);
    if (!/刷新/.test(String(interceptErr.hint))) failures.push("拦截提示未引导刷新（TC-022(a) 文案要求）");
  }
  if (promptsAfter !== promptsBefore) failures.push(`拦截失效：prompt 仍到达子进程（${promptsBefore}→${promptsAfter}）`);

  // ---- 刷新恢复（reloadHistory = 面板『刷新』命令通道）----
  await bridge.reloadHistory();
  await sleep(300);
  const tSend3 = Date.now();
  await bridge.sendPrompt("刷新后的消息");
  await waitFor(() => events.some((e) => e.kind === "run_state" && e.state === "idle" && e.t >= tSend3), 15000, "刷新后一轮 settled 回 idle");
  const promptsFinal = readLog(logFile).filter((l) => l.event === "command" && l.type === "prompt").length;
  if (promptsFinal !== promptsBefore + 1) failures.push(`刷新后 prompt 未恢复发送（${promptsBefore}→${promptsFinal}）`);
  // 刷新后的本轮内部写入不应再触发 external_change（豁免语义，非吞检测）
  const extsFinal = externalChanges(events);
  if (extsFinal.length > 1) failures.push(`刷新后再次误报 external_change（× ${extsFinal.length - 1}）`);
  note.push(`刷新后恢复：prompt 已送达并完成一轮（${promptsBefore}→${promptsFinal}），无新误报`);

  await bridge.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("场景：SC-EXT-IDLE（TC-022 独立核验 / 口径 C 反向语义）");
  for (const n of note) console.log(`NOTE: ${n}`);
  if (failures.length > 0) { for (const f of failures) console.log(`FAIL: ${f}`); process.exit(1); }
  console.log("RESULT: PASS（idle 外部写入检出 ≤5s + 拦截并引导刷新 + 刷新后恢复 + 无新误报）");
}

main().catch((err) => { console.error("HARNESS-ERROR:", err.message); process.exit(2); });

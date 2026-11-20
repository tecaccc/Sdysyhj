#!/usr/bin/env node
// 测试 Agent 独立重放（Issue #2 / #D-03 定向核验，澄清 #14 判据）
// 驱动被测标签 bundle 的 PiBridge + 自写 fake pi，不复用仓库任何测试代码。
// 时钟控制：加载 bundle 前 patch Date.now（可推进偏移），60s 去重窗口外重放确定性触发。

// ---- 时钟 patch（须在 require bundle 之前）----
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advanceClock = (ms) => {
  clockOffset += ms;
};

const { PiBridge, RpcClient } = require("/tmp/vh-issue2/piBridge-bundle.cjs");
const FAKE_PI = "/tmp/vh-issue2/fake-pi-exterr.cjs";
const os = require("os");
const fs = require("fs");
const path = require("path");

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vh-exterr-"));

// ---- 观测tap ----
const toasts = []; // {text, at, scenario}
const errors = []; // {message, hint, at, scenario}
const warns = []; // {message, at, scenario}
const anyEvents = []; // {kind, at, scenario}
let scenario = "init";

const logger = {
  info: () => {},
  debug: () => {},
  warn: (m) => warns.push({ message: m, at: Date.now(), scenario }),
  error: (m) => warns.push({ message: "[logger.error] " + m, at: Date.now(), scenario }),
};

const noopWatcher = () => ({ track() {}, markSynced() {}, start() {}, dispose() {}, setSuspended() {} });

const bridge = new PiBridge({
  cwd,
  runtime: { source: "explicit", command: process.execPath, baseArgs: [FAKE_PI], detail: "verify-fake-pi" },
  createClient: ({ command, args, cwd: c }) => new RpcClient({ command, args, cwd: c }),
  logger,
  tailLines: 200,
  sendMode: "steer",
  createWatcher: noopWatcher,
});
bridge.on("toast", (p) => toasts.push({ ...p, at: Date.now(), scenario }));
bridge.on("error", (p) => errors.push({ ...p, at: Date.now(), scenario }));
bridge.onAny((e) => anyEvents.push({ kind: e.kind, at: Date.now(), scenario }));

// ---- 断言工具 ----
let pass = 0;
let fail = 0;
const failures = [];
function assert(id, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS ${id} :: ${detail}`);
  } else {
    fail++;
    failures.push(id);
    console.log(`FAIL ${id} :: ${detail}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, label, timeoutMs = 6000) {
  const t0 = realNow();
  while (realNow() - t0 < timeoutMs) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

(async () => {
  await bridge.start();

  const PATH_A = "/home/verify/.pi/agent/npm/pi-loop/main.js";
  const PATH_B = "/home/verify/.pi/agent/npm/subagents/main.js";
  const STALE_ERR =
    "This extension ctx is stale after session replacement or reload.\n第二行：堆栈细节不应进 toast\n第三行：完整多行错误用于日志全字段断言";
  const extToasts = () => toasts.filter((t) => t.text.startsWith("扩展错误"));
  const extWarns = () => warns.filter((w) => w.message.includes("extension_error 事件"));
  const keyAWarns = () => extWarns().filter((w) => w.message.includes(PATH_A) && w.message.includes(STALE_ERR));

  // ===== S1 全字段 extension_error =====
  scenario = "S1-EE-FULL";
  await bridge.sendPrompt("#EE-FULL");
  await waitFor(() => extToasts().length >= 1, "S1 toast");
  const t1 = extToasts()[0];
  assert("A01-通道-toast", !!t1, t1 ? `toast 已发出: ${t1.text}` : "未发出 toast");
  assert(
    "A02-文案-路径",
    t1 && t1.text.includes(PATH_A),
    `toast 含扩展路径 (${!!t1 && t1.text.includes(PATH_A)})`
  );
  assert(
    "A03-文案-错误首行",
    t1 && t1.text.includes("This extension ctx is stale after session replacement or reload."),
    "toast 含错误首行原文"
  );
  assert("A04-文案-Output指引", t1 && /Output/.test(t1.text) && t1.text.includes("Sdysyhj"), `toast 含 Output 指引: ${t1 ? t1.text : ""}`);
  assert("A05-文案-仅首行", t1 && !t1.text.includes("第二行") && !t1.text.includes("第三行"), "toast 不含错误第二/三行");
  const w1 = keyAWarns()[0];
  assert(
    "A06-日志全字段",
    w1 && w1.message.includes(PATH_A) && w1.message.includes("subagent-async") && w1.message.includes(STALE_ERR),
    w1 ? "logger.warn 含 extensionPath+event+多行 error 全文" : "未记录 logger.warn"
  );

  // ===== S2 同键连发 ×2（累计 3 次同键） =====
  scenario = "S2-EE-SAME";
  await bridge.sendPrompt("#EE-SAME");
  await bridge.sendPrompt("#EE-SAME");
  await waitFor(() => keyAWarns().length >= 3, "S2 warn×3");
  await sleep(300); // 排水
  const keyAToasts = () => extToasts().filter((t) => t.text.includes(PATH_A) && t.text.includes("This extension ctx is stale"));
  const s2toasts = keyAToasts();
  assert("A07-同键去重", s2toasts.length === 1, `同键 3 连发窗口内 toast 次数=${s2toasts.length}（期望 1，键=路径A+同一 error）`);
  assert("A08-日志不去重", keyAWarns().length === 3, `同键 3 连发 logger.warn 次数=${keyAWarns().length}（期望 3）`);

  // ===== S3 异键：不同 extensionPath =====
  scenario = "S3-EE-DIFFPATH";
  await bridge.sendPrompt("#EE-DIFFPATH");
  await waitFor(() => extToasts().some((t) => t.text.includes(PATH_B)), "S3 toast PATH_B");
  assert("A09-异键-不同路径", extToasts().some((t) => t.text.includes(PATH_B)), "不同 extensionPath 各自 toast");

  // ===== S4 异键：不同 error =====
  scenario = "S4-EE-DIFFERR";
  await bridge.sendPrompt("#EE-DIFFERR");
  await waitFor(() => extToasts().some((t) => t.text.includes("Extension context invalidated")), "S4 toast");
  assert("A10-异键-不同错误", extToasts().some((t) => t.text.includes("Extension context invalidated")), "同路径不同 error 各自 toast");

  // ===== S5 缺 extensionPath =====
  scenario = "S5-EE-NOPATH";
  await bridge.sendPrompt("#EE-NOPATH");
  await waitFor(() => extToasts().some((t) => t.text.includes("boom without path")), "S5 toast");
  const t5 = extToasts().find((tt) => tt.text.includes("boom without path"));
  assert("A11-缺路径容错", t5 && t5.text.includes("未知扩展"), `缺 extensionPath 仍 toast 且含占位：${t5 ? t5.text : "无"}`);
  const w5 = warns.find((x) => x.message.includes("boom without path"));
  assert("A12-缺路径日志", w5 && w5.message.includes("extensionPath=(无)"), `缺路径日志占位：${w5 ? w5.message : "无"}`);

  // ===== S6 缺 error =====
  scenario = "S6-EE-NOERR";
  await bridge.sendPrompt("#EE-NOERR");
  await waitFor(() => extToasts().some((t) => t.text.includes("未知错误")), "S6 toast");
  const t6 = extToasts().find((tt) => tt.text.includes("未知错误"));
  assert("A13-缺错误容错", t6 && t6.text.includes(PATH_B), `缺 error 仍 toast 且含占位与路径：${t6 ? t6.text : "无"}`);

  // ===== S7 超长首行截断 =====
  scenario = "S7-EE-LONGERR";
  await bridge.sendPrompt("#EE-LONGERR");
  await waitFor(() => extToasts().some((t) => t.text.includes("LLL")), "S7 toast");
  const t7 = extToasts().find((tt) => tt.text.includes("LLL"));
  const longLine = "L".repeat(120) + "…";
  assert("A14-首行截断120", t7 && t7.text.includes(longLine) && !t7.text.includes("TAIL-LINE-MUST-NOT-APPEAR"), `toast 首行截断 120+省略号且不含后续行`);
  const w7 = warns.find((x) => x.message.includes("TAIL-LINE-MUST-NOT-APPEAR"));
  assert("A15-日志不截断", w7 && w7.message.includes("L".repeat(150)), "logger.warn 含 150 字符全行 + 后续行");

  // ===== S8 窗口外同键重发（时钟推进 60_001ms） =====
  scenario = "S8-WINDOW-EXPIRED";
  const before = extToasts().filter((t) => t.text.includes(PATH_A) && t.text.includes("This extension ctx is stale")).length;
  advanceClock(60_001);
  await bridge.sendPrompt("#EE-SAME");
  await waitFor(() => extToasts().filter((t) => t.text.includes(PATH_A) && t.text.includes("This extension ctx is stale")).length >= before + 1, "S8 toast 再现");
  const after = extToasts().filter((t) => t.text.includes(PATH_A) && t.text.includes("This extension ctx is stale")).length;
  assert("A16-窗口外再现", after === 2, `60s 窗口外同键再次 toast（键A 累计 ${after}，期望 2）`);
  assert("A17-窗口外日志", keyAWarns().length === 4, `窗口外第 4 次同键仍记日志（=${keyAWarns().length}，期望 4）`);

  // ===== 全程通道断言：extension_error 场景零 error 卡片、零误导 hint =====
  const extScenarios = new Set(["S1-EE-FULL", "S2-EE-SAME", "S3-EE-DIFFPATH", "S4-EE-DIFFERR", "S5-EE-NOPATH", "S6-EE-NOERR", "S7-EE-LONGERR", "S8-WINDOW-EXPIRED"]);
  const errsDuringExt = errors.filter((e) => extScenarios.has(e.scenario));
  assert("A18-extension_error-零错误卡片", errsDuringExt.length === 0, `extension_error 场景 error 事件数=${errsDuringExt.length}（期望 0）`);
  const misleading = [...toasts, ...errors].filter((x) => x.text?.includes("~/.pi/agent/extensions") || x.hint?.includes("~/.pi/agent/extensions"));
  assert("A19-误导hint已移除", misleading.length === 0, `含旧误导 hint 的消息数=${misleading.length}（期望 0）`);

  // ===== R1 反向：provider 报错仍走错误卡片 =====
  scenario = "S9-PROV-ERR";
  await bridge.sendPrompt("#PROV-ERR");
  await waitFor(() => errors.some((e) => e.scenario === "S9-PROV-ERR"), "S9 error");
  const e9 = errors.find((x) => x.scenario === "S9-PROV-ERR");
  assert("A20-provider报错-错误卡片", e9 && e9.message.includes("模型返回错误") && e9.message.includes("rate limited"), `provider 报错走 error 通道：${e9 ? e9.message : "无"}`);
  assert("A21-provider报错-指引", e9 && /pi auth|额度|模型/.test(e9.hint || ""), `错误卡片含修复指引：${e9 ? e9.hint : ""}`);

  // ===== R2 反向：子进程崩溃仍走错误卡片（第二次崩溃） =====
  scenario = "S10-CRASH-1";
  await bridge.sendPrompt("#CRASH");
  await waitFor(() => anyEvents.some((x) => x.scenario.startsWith("S10") && x.kind === "run_state" && x.state === undefined ? false : false) || toasts.some((t) => t.text.includes("自动重启")), "S10 第一次崩溃重启", 8000);
  scenario = "S10-CRASH-2";
  await bridge.sendPrompt("#CRASH");
  await waitFor(() => errors.some((e) => e.scenario === "S10-CRASH-2"), "S10 第二次崩溃 error");
  const e10 = errors.find((x) => x.scenario === "S10-CRASH-2");
  assert("A22-崩溃-错误卡片", e10 && e10.message.includes("反复崩溃"), `二次崩溃走 error 通道：${e10 ? e10.message : "无"}`);
  assert("A23-崩溃-指引", e10 && /pi auth|sdysyhj\.piPath|Output/.test(e10.hint || ""), `崩溃卡片含修复指引：${e10 ? e10.hint : ""}`);

  await bridge.dispose();

  console.log("\n===== 汇总 =====");
  console.log(`PASS=${pass} FAIL=${fail}`);
  if (failures.length) console.log("FAILED: " + failures.join(", "));
  console.log(`toasts(total)=${toasts.length} errors(total)=${errors.length} extWarns=${extWarns().length}`);
  console.log("toast 明细:");
  for (const t of toasts) console.log(`  [${t.scenario}] ${t.text}`);
  console.log("error 明细:");
  for (const e of errors) console.log(`  [${e.scenario}] ${e.message}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

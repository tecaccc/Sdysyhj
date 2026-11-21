#!/usr/bin/env node
// lab-metrics.mjs — TASK-009 阶段①四维度量脚本（§10.13 D7，FR-AUI-06② 证据即事实）。
// 无人值守、离线、自终止 + 有界超时。输出 JSON（stdout）+ 人读表格（stderr）。
// 维度：
//   ① bundle 体积：实验面板合计字节（口径 D6：入口+chunk，不含 .css/.map）+ 逐切片度量入口
//      （slice-a.measure / slice-b.measure，同参构建 /tmp，不入产物）+ 宿主增量（基线检出构建对比）
//      + 默认面板依赖图（metafile inputs）；
//   ② 首帧/首消息时延：lab-metrics-driver（golden-prompt-basic 回放，≥N 次取中位，通道里程碑口径）；
//   ③ 代码侵入面：git diff --stat <baseline>（默认 HEAD）+ 未跟踪新文件，三组归类；
//   ④ PiBridge 事件契合度：定性框架打印（结论由人工/对比报告填写，本脚本只出数据底座）。
// 用法：node test/tooling/lab-metrics.mjs [--baseline <rev>] [--runs 5] [--json out.json]
//       基线检出经 git archive（只读 git，无工作区写）；node_modules 复用当前安装（esbuild 同版本）。

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { build } from "esbuild";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "../..");
const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASELINE = readArg("baseline", "HEAD");
const RUNS = Number(readArg("runs", "5"));
const OUT_JSON = readArg("json", "");

const OVERALL_TIMEOUT_MS = 240_000;
const killTimer = setTimeout(() => {
  console.error("lab-metrics 全局超时，强制退出");
  process.exit(1);
}, OVERALL_TIMEOUT_MS);
killTimer.unref?.();

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-lab-metrics-"));

function section(name) {
  console.error(`\n== ${name} ==`);
}

// ---------- ① bundle 体积 ----------

const labBuildOptions = (entry, outfile) => ({
  entryPoints: [path.join(ROOT, entry)],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  ...(entry.endsWith(".tsx") ? { jsx: "automatic" } : {}),
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  outfile,
  sourcemap: false,
  logLevel: "silent",
});

async function measureBundles() {
  section("① bundle 体积（字节，口径 D6：JS 产物合计，不含 .css/.map）");
  const out = { labTotal: 0, sliceA: 0, sliceB: 0, labCss: 0, hostCurrent: 0, hostBaseline: null, defaultPanelInputs: [] };

  const labOut = path.join(tmpRoot, "lab.js");
  await build(labBuildOptions("webview/lab/main.tsx", labOut));
  out.labTotal = fs.statSync(labOut).size;
  const labCss = `${labOut.slice(0, -3)}.css`;
  if (fs.existsSync(labCss)) out.labCss = fs.statSync(labCss).size;

  const sliceAOut = path.join(tmpRoot, "slice-a.js");
  await build(labBuildOptions("webview/lab/slice-a.measure.tsx", sliceAOut));
  out.sliceA = fs.statSync(sliceAOut).size;

  const sliceBOut = path.join(tmpRoot, "slice-b.js");
  await build(labBuildOptions("webview/lab/slice-b.measure.tsx", sliceBOut));
  out.sliceB = fs.statSync(sliceBOut).size;

  // 默认面板依赖图（metafile inputs，去重清单；write:false + outdir 供 CSS 出口）
  const { metafile } = await build({
    entryPoints: [path.join(ROOT, "webview/main.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    write: false,
    outdir: path.join(tmpRoot, "meta-default"),
    metafile: true,
    logLevel: "silent",
  });
  out.defaultPanelInputs = [...new Set(Object.keys(metafile.inputs).map((n) => n.replace(/^(\.\.\/)+/, "")))].sort();

  // 宿主：当前构建
  const hostOut = path.join(tmpRoot, "extension-current.js");
  await build({
    entryPoints: [path.join(ROOT, "src/extension.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["vscode", "@earendil-works/pi-coding-agent"],
    outfile: hostOut,
    sourcemap: false,
    logLevel: "silent",
  });
  out.hostCurrent = fs.statSync(hostOut).size;

  // 宿主：基线检出构建（git archive 只读检出 → 复用当前 node_modules symlink → 同参构建）
  try {
    const baselineDir = path.join(tmpRoot, "baseline");
    fs.mkdirSync(baselineDir, { recursive: true });
    const archive = execFileSync("git", ["-C", ROOT, "archive", BASELINE], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    execFileSync("tar", ["-x", "-C", baselineDir], { input: archive, timeout: 60_000 });
    try {
      fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(baselineDir, "node_modules"), "dir");
    } catch {
      /* 已存在（重跑） */
    }
    const baselineOut = path.join(baselineDir, "dist-extension-baseline.js");
    await build({
      entryPoints: [path.join(baselineDir, "src/extension.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: ["vscode", "@earendil-works/pi-coding-agent"],
      outfile: baselineOut,
      sourcemap: false,
      logLevel: "silent",
      absWorkingDir: baselineDir,
    });
    out.hostBaseline = fs.statSync(baselineOut).size;
  } catch (err) {
    console.error(`宿主基线构建失败（git archive ${BASELINE} 或构建异常）：${err instanceof Error ? err.message : String(err)}`);
  }

  console.error(`实验面板 webview JS 合计（media/lab.js 口径）: ${out.labTotal.toLocaleString()} B（预算 3,145,728；占比 ${((out.labTotal / (3 * 1024 * 1024)) * 100).toFixed(1)}%）`);
  console.error(`  ├ 路线 A 度量入口（slice-a.measure）: ${out.sliceA.toLocaleString()} B`);
  console.error(`  └ 路线 B 度量入口（slice-b.measure）: ${out.sliceB.toLocaleString()} B`);
  console.error(`实验面板 CSS（不计预算）: ${out.labCss.toLocaleString()} B`);
  console.error(`宿主 bundle：当前 ${out.hostCurrent.toLocaleString()} B；基线 ${out.hostBaseline !== null ? out.hostBaseline.toLocaleString() + " B" : "N/A"}；增量 ${out.hostBaseline !== null ? (out.hostCurrent - out.hostBaseline).toLocaleString() + " B（预算 1,048,576）" : "N/A"}`);
  const forbidden = out.defaultPanelInputs.filter((n) => /(^|\/)react(-dom)?(\/|$)/.test(n) || n.includes("@assistant-ui/"));
  console.error(`默认面板依赖图 inputs ${out.defaultPanelInputs.length} 项；react/@assistant-ui 命中 ${forbidden.length} 项（须为 0）`);
  return { metrics: out, forbidden };
}

// ---------- ② 时延 ----------

async function measureLatency() {
  section(`② 首帧/首消息时延（golden-prompt-basic 回放 ×${RUNS}，中位数；口径 = 通道里程碑 T1/T2）`);
  const driverEntry = path.join(ROOT, "test/tooling/lab-metrics-driver.ts");
  const driverBundle = path.join(tmpRoot, "lab-metrics-driver.bundle.js");
  await build({
    entryPoints: [driverEntry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile: driverBundle,
    sourcemap: false,
    logLevel: "silent",
    external: ["vscode"],
  });
  const fixture = path.join(ROOT, "test/fixtures/golden/golden-prompt-basic.jsonl");
  const fakeCli = path.join(ROOT, "test/helpers/fake-pi-cli.js");
  const stdout = execFileSync(process.execPath, [driverBundle, fixture, String(RUNS), fakeCli], {
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    cwd: ROOT,
  }).toString("utf8");
  const line = stdout.split("\n").find((l) => l.startsWith("METRICS "));
  if (!line) throw new Error("driver 未输出 METRICS");
  const parsed = JSON.parse(line.slice("METRICS ".length));
  console.error(`路线 A：T1 首帧 ${parsed.routeA.t1MedianMs.toFixed(2)} ms；T2 首消息完成（message_end→finish 帧）${parsed.routeA.t2MedianMs.toFixed(2)} ms`);
  console.error(`路线 B：T1 首帧 ${parsed.routeB.t1MedianMs.toFixed(2)} ms；T2 首消息完成（message_end→store 终稿）${parsed.routeB.t2MedianMs.toFixed(2)} ms`);
  return parsed;
}

// ---------- ③ 侵入面 ----------

/** D1 冻结面（默认面板 + 桥）——此组必须为空 */
const FROZEN_FILES = [
  "src/panel/chatPanel.ts",
  "src/panel/messages.ts",
  "src/bridge/jsonl.ts",
  "src/bridge/piBridge.ts",
  "src/bridge/protocol.ts",
  "src/bridge/rpcClient.ts",
  "src/bridge/rpcTransport.ts",
  "webview/main.ts",
  "webview/css.d.ts",
];
const FROZEN_DIRS = ["webview/render/", "webview/styles/"];
/** 阶段①共享文件增量（设计 D6 改动面预估清单 + 工程文件） */
const SHARED_FILES = ["package.json", "package-lock.json", "esbuild.mjs", "src/extension.ts", "test/helpers/fake-pi-cli.js", "tsconfig.json", ".gitignore"];

function measureInvasiveness() {
  section(`③ 代码侵入面（基线 ${BASELINE}：git diff --name-only + 未跟踪新文件，三组归类；docs/** 不计入另列信息组）`);
  let modified = [];
  let untracked = [];
  try {
    modified = execFileSync("git", ["-C", ROOT, "diff", "--name-only", BASELINE], { encoding: "utf8", timeout: 30_000 }).split("\n").filter(Boolean);
    untracked = execFileSync("git", ["-C", ROOT, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8", timeout: 30_000 }).split("\n").filter(Boolean);
  } catch (err) {
    console.error(`git 只读命令失败：${err instanceof Error ? err.message : String(err)}`);
  }
  const isFrozen = (f) => FROZEN_FILES.includes(f) || FROZEN_DIRS.some((d) => f.startsWith(d));
  const groups = { frozenTouched: [], shared: [], added: [], docsInformational: [], other: [] };
  for (const f of modified) {
    if (f.startsWith("docs/")) groups.docsInformational.push(f);
    else if (isFrozen(f)) groups.frozenTouched.push(f);
    else if (SHARED_FILES.includes(f)) groups.shared.push(f);
    else groups.other.push(f);
  }
  for (const f of untracked) {
    if (f.startsWith("docs/")) groups.docsInformational.push(`${f}（未跟踪）`);
    else if (f === ".pi-loop.json") groups.other.push(f);
    else groups.added.push(f);
  }
  let stat = "";
  try {
    stat = execFileSync("git", ["-C", ROOT, "diff", "--stat", BASELINE], { encoding: "utf8", timeout: 30_000 });
  } catch {
    /* 忽略 */
  }
  console.error(`默认面板冻结文件改动（须为空）：${groups.frozenTouched.length ? groups.frozenTouched.join(", ") : "（无 ✓）"}`);
  console.error(`共享文件增量 ${groups.shared.length} 项：${groups.shared.join(", ") || "（无）"}`);
  console.error(`新增文件 ${groups.added.length} 项：${groups.added.join(", ") || "（无）"}`);
  console.error(`docs/** 信息组（基线..当前全部 docs 变更，含总调度/产品/设计各角色落档，不计入三组）：${groups.docsInformational.join(", ") || "（无）"}`);
  console.error(`其他/运行时文件（非本任务产物，信息组）：${groups.other.join(", ") || "（无）"}`);
  if (stat) console.error(`\ngit diff --stat ${BASELINE}（${stat.trim().split("\n").pop()?.trim() ?? ""}）`);
  return { groups, stat };
}

// ---------- ④ 契合度框架 ----------

function fitFramework() {
  section("④ PiBridge 事件契合度（定性框架；逐路线填写，结论中立——数据底座见上方 ①②③ 与集成测试）");
  const rows = [
    ["维度", "路线 A（fetch-bridge）", "路线 B（ExternalStoreRuntime）"],
    ["流式 delta", "text_delta→text-start/delta 帧（帧型=官方 AI SDK 协议）", "text_delta→store 原地追加（官方流式口径同型）"],
    ["user 回声承载", "客户端自有 user 渲染、回声仅作流路由不重发（结构性无双气泡）", "宿主账本（§10.12 D1/D2）就地合并，FR-CHAT-11 全语义直接复用"],
    ["steer/followUp", "run 绑定请求；注入=新请求经账本路由到所属流（P1 回放实证）", "复用 queue 语义与队列快照（P1 回放实证）"],
    ["abort", "请求中止/页面重载→bridge.abort（实验：LONG 剧本）", "onCancel→协议 abort（同一 bridge.abort 终点）"],
  ];
  for (const row of rows) console.error(row.map((c, i) => (i === 0 ? c.padEnd(14) : c)).join(" ｜ "));
}

// ---------- 主流程 ----------

const bundles = await measureBundles();
const latency = await measureLatency();
const invasiveness = measureInvasiveness();
fitFramework();

const report = {
  baseline: BASELINE,
  runs: RUNS,
  bundle: bundles.metrics,
  defaultPanelForbiddenInputs: bundles.forbidden,
  latency,
  invasiveness: invasiveness.groups,
  gitDiffStat: invasiveness.stat.trim(),
};
const json = JSON.stringify(report, null, 2);
if (OUT_JSON) fs.writeFileSync(OUT_JSON, json);
else console.log(json);

fs.rmSync(tmpRoot, { recursive: true, force: true });
clearTimeout(killTimer);
console.error("\nDONE");

#!/usr/bin/env node
// Golden fixture 录制编排（TASK-008 §10.12 D8；npm run record:golden，仅人工/维护触发，不进 CI）。
// 1) 解析真实 pi 并确认版本 1.5.2：env PI_BIN → PATH `pi`（`pi --version`）→ 内置 node_modules 运行时；
// 2) esbuild 即时打包 test/tooling/golden-driver.ts（离线，依赖已安装）；
// 3) 每个剧本（golden-prompt-basic / golden-steer-followup）连录两次并逐字节比对——归一化确定性
//    的实证；一致才落盘 test/fixtures/golden/<name>.jsonl，不一致输出首个差异行并放弃落盘。
// 全程仅 loopback（driver 内嵌 OpenAI 兼容 mock server）、无外网、无真实凭证；每步有界超时、自终止。

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const EXPECTED_PI_VERSION = "1.5.2";
const DRIVER_TIMEOUT_MS = 180_000;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolDir = path.join(root, "test", "tooling");
const fixturesDir = path.join(root, "test", "fixtures", "golden");

const scenarioArg = process.argv.find((a) => a.startsWith("--scenario="))?.slice("--scenario=".length) ?? "all";
const scenarios = scenarioArg === "all" ? ["prompt-basic", "steer-followup"] : [scenarioArg];
const fixtureName = (scenario) => (scenario === "prompt-basic" ? "golden-prompt-basic" : "golden-steer-followup");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30_000, ...options });
}

/** 解析 pi：返回 {version, command, baseArgs, piPkg, detail}；找不到/版本不符返回 null 并说明。 */
function resolvePi() {
  const probes = [];
  if (process.env.PI_BIN) {
    probes.push({ label: `PI_BIN ${process.env.PI_BIN}`, command: process.env.PI_BIN, baseArgs: [] });
  }
  const which = run("which", ["pi"]);
  if (which.status === 0) {
    probes.push({ label: "PATH pi", command: which.stdout.trim(), baseArgs: [] });
  }
  const bundledCli = path.join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
  if (fs.existsSync(bundledCli)) {
    probes.push({ label: "bundled cli.js", command: process.execPath, baseArgs: [bundledCli] });
  }
  const results = [];
  for (const probe of probes) {
    const versionRun = run(probe.command, [...probe.baseArgs, "--version"]);
    const out = `${versionRun.stdout || ""}${versionRun.stderr || ""}`;
    const match = out.match(/\d+\.\d+\.\d+/);
    if (versionRun.status === 0 && match) {
      // pi 包根推导（…/pi-coding-agent/dist/bundle/cli.js → 包根）：机器路径归一化用
      let piPkg = null;
      try {
        const base = probe.baseArgs[0] ?? fs.realpathSync(probe.command);
        piPkg = path.dirname(path.dirname(path.dirname(base)));
      } catch {
        // 推导失败则跳过该替换（fixture 头仍可辨识）
      }
      results.push({ ...probe, version: match[0], piPkg });
    }
  }
  const matched = results.find((r) => r.version === EXPECTED_PI_VERSION);
  if (matched) return { pi: matched, note: results.map((r) => `${r.label}=${r.version}`).join(", ") };
  return {
    pi: null,
    note: results.length > 0 ? results.map((r) => `${r.label}=${r.version}`).join(", ") : "无可用 pi",
  };
}

const { pi, note } = resolvePi();
if (!pi) {
  console.error(`未找到 pi ${EXPECTED_PI_VERSION}（探测：${note}）。golden fixture 必须以冻结版本录制；可设 PI_BIN 指定。`);
  process.exit(1);
}
console.log(`pi 运行时：${pi.label}（${pi.version}；探测全量：${note}）`);

// 即时打包 driver（离线）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-record-"));
const bundle = path.join(tmp, "golden-driver.mjs");
esbuild.buildSync({
  entryPoints: [path.join(toolDir, "golden-driver.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: bundle,
  sourcemap: false,
  logLevel: "silent",
});

const piFlags = [
  "--model",
  "golden/golden-mock",
  "--no-skills",
  "--no-extensions",
  "--no-mcp",
  "--no-context-files",
  "--no-prompt-templates",
  "--no-themes",
];

let failed = false;
for (const scenario of scenarios) {
  const name = fixtureName(scenario);
  const runs = [];
  for (let i = 0; i < 2; i += 1) {
    const out = path.join(tmp, `${name}.run${i + 1}.jsonl`);
    const r = run(
      process.execPath,
      [
        bundle,
        "--scenario",
        scenario,
        "--fixture",
        out,
        "--tee",
        path.join(toolDir, "pi-tee.mjs"),
        "--pi",
        pi.command,
        ...pi.baseArgs.flatMap((a) => ["--pi-arg", a]),
        ...(pi.piPkg ? ["--pi-pkg", pi.piPkg] : []),
        "--pi-version",
        pi.version,
        "--pi-detail",
        pi.label,
      ],
      { cwd: root, timeout: DRIVER_TIMEOUT_MS }
    );
    if (r.status !== 0) {
      console.error(`录制失败（${name} 第 ${i + 1} 次）：\n${r.stdout || ""}\n${r.stderr || ""}`);
      process.exit(1);
    }
    runs.push({ out, summary: (r.stdout.match(/SUMMARY .*/) ?? [""])[0] });
  }
  const a = fs.readFileSync(runs[0].out, "utf8");
  const b = fs.readFileSync(runs[1].out, "utf8");
  if (a !== b) {
    console.error(`两次录制归一化后不一致（${name}）——录制不确定，放弃落盘。首个差异：`);
    const la = a.split("\n");
    const lb = b.split("\n");
    for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
      if (la[i] !== lb[i]) {
        console.error(`  行 ${i + 1}\n    run1: ${la[i]?.slice(0, 400) ?? "(无)"}\n    run2: ${lb[i]?.slice(0, 400) ?? "(无)"}`);
        break;
      }
    }
    failed = true;
    continue;
  }
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(path.join(fixturesDir, `${name}.jsonl`), a);
  const lines = a.split("\n").filter((l) => l.trim().length > 0).length;
  console.log(`✅ ${name}.jsonl：${lines} 行（双录逐字节一致）  ${runs[0].summary}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("golden fixture 录制完成（test/fixtures/golden/）。");

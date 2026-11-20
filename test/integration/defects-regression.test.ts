// 失败回路第 1 轮缺陷回归（集成）：
//   缺陷#1（FR-CMD-05）：打包布局下内置运行时解析（复现脚本形态）
//   缺陷#2（FR-CMD-02）：stderr / 协议异常写入日志（MOCK-STDERR 口径）
//   缺陷#4（FR-SESS-07）：外部修改拦截后续交互（口径 C）
//   缺陷#6（NFR-05）：关键路径日志 4 类齐全
// 全程离线：mock 子进程 + 打包布局临时目录。

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiBridge, type BridgeEvent, type PiRpcClient, type SessionWatcherLike } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { MemoryLogger, createRedactingLogger } from "../../src/util/log";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));
const VSCODE_STUB = fileURLToPath(new URL("../helpers/prod-vscode-stub.js", import.meta.url));
const REPRO_CHILD = fileURLToPath(new URL("../helpers/prod-repro-child.js", import.meta.url));

let workDir: string;
let logFile: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-fixreg-"));
  logFile = path.join(workDir, "fake-pi.log");
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 8000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function logContains(text: string): boolean {
  try {
    return fs.readFileSync(logFile, "utf8").includes(text);
  } catch {
    return false;
  }
}

describe("缺陷#1（FR-CMD-05）打包布局内置运行时", () => {
  it("复现脚本形态：激活 → ready → source=bundled 可用（vsix 布局）", async () => {
    // 构造 vsix 安装布局：<lay>/dist/extension.js + <lay>/node_modules/{vscode,@earendil-works/...}
    const layout = path.join(workDir, "vpkg");
    const distDir = path.join(layout, "dist");
    fs.mkdirSync(distDir, { recursive: true });

    // 1) 扩展 bundle（与 npm run build 相同配置；产物落在布局内）
    buildSync({
      entryPoints: [path.join(REPO_ROOT, "src", "extension.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: ["vscode", "@earendil-works/pi-coding-agent"],
      outfile: path.join(distDir, "extension.js"),
      logLevel: "silent",
    });

    // 2) vscode stub（复现脚本同款：node_modules/vscode）
    const vscodeDir = path.join(layout, "node_modules", "vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.copyFileSync(VSCODE_STUB, path.join(vscodeDir, "index.js"));

    // 3) 内置运行时（以 mock 子进程充当 cli.js，验证解析+全链路）
    const cli = path.join(layout, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(FAKE_CLI, cli);

    // 4) 隔离 HOME/PATH，按复现脚本形态在子进程中激活
    const homeDir = path.join(workDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [REPRO_CHILD, layout], {
        env: { ...process.env, HOME: homeDir, PATH: "/usr/bin:/bin", FAKE_PI_LOG: logFile },
        cwd: workDir,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });

    // 验收：复现脚本形态下通过 —— 内置运行时解析成功（source=bundled），无"未找到"错误，对话链路可用
    expect(out.stderr).toBe("");
    expect(out.stdout).toContain("PROD-REPRO-OK");
    expect(out.stdout).toContain("source=bundled");
    expect(out.stdout).not.toContain("未找到可用的 pi 运行时");
    expect(out.stdout).not.toContain('"kind":"error"');
    // mock 子进程确实被拉起并完成了一次 prompt
    expect(logContains('"type":"prompt"')).toBe(true);
    expect(logContains('"event":"spawn"')).toBe(true);
  }, 60000);
});

describe("缺陷#2（FR-CMD-02）stderr / 协议异常入日志", () => {
  function makeBridge(logger: MemoryLogger, redact: boolean): { bridge: PiBridge; events: BridgeEvent[] } {
    const events: BridgeEvent[] = [];
    const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
    const bridge = new PiBridge({
      cwd: workDir,
      runtime,
      createClient: ({ command, args, cwd }) =>
        new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_LOG: logFile } }) as unknown as PiRpcClient,
      logger: redact ? createRedactingLogger(logger) : logger,
      tailLines: 200,
      sendMode: "steer",
    });
    bridge.onAny((event) => events.push(event));
    return { bridge, events };
  }

  it("MOCK-STDERR：stderr 原文与协议异常写入日志（含脱敏）", async () => {
    const memory = new MemoryLogger();
    const { bridge } = makeBridge(memory, true);
    await bridge.start();

    await bridge.sendPrompt("STDERRKEY"); // stderr 哨兵 + 非法 JSONL + 凭证样文本
    await waitFor(() => bridge.getRunState() === "idle", 8000, "stderr run settled");

    const dump = memory.lines.join("\n");
    // (a) stderr 原文（含哨兵）
    expect(dump).toContain("E2E-STDERR-MARKER");
    // (b) 协议异常记录（非法 JSONL / 解析失败）
    expect(dump).toMatch(/无法解析|解析失败|非法|anomaly|parse/i);
    // (d) 脱敏：stderr 中凭证不出原文
    expect(dump).not.toContain("sk-mocksecret123456");
    expect(dump).toContain("[REDACTED]");

    await bridge.dispose();
  });

  it("stderr 无换行尾部在子进程退出时也会冲刷", async () => {
    const memory = new MemoryLogger();
    const { bridge } = makeBridge(memory, false);
    await bridge.start();
    // 触发崩溃路径：stderr + 退出
    await bridge.sendPrompt("CRASH_NOW");
    await waitFor(() => memory.lines.join("\n").includes("子进程退出"), 8000, "crash logged");
    const dump = memory.lines.join("\n");
    expect(dump).toMatch(/stderr|子进程退出/);
    await bridge.dispose();
  });
});

describe("缺陷#4（FR-SESS-07）外部修改拦截（口径 C）", () => {
  it("检测外部修改后 prompt 被拦截并引导刷新；刷新后恢复", async () => {
    const memory = new MemoryLogger();
    const events: BridgeEvent[] = [];
    const watcherHolder: { cb: (() => void) | null } = { cb: null };
    const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
    const bridge = new PiBridge({
      cwd: workDir,
      runtime,
      createClient: ({ command, args, cwd }) =>
        new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_LOG: logFile } }) as unknown as PiRpcClient,
      logger: memory,
      tailLines: 200,
      sendMode: "steer",
      createWatcher: (cb) => {
        watcherHolder.cb = cb;
        const impl: SessionWatcherLike = {
          track: () => undefined,
          markSynced: () => undefined,
          setSuspended: () => undefined,
          start: () => undefined,
          dispose: () => undefined,
        };
        return impl;
      },
    });
    bridge.onAny((event) => events.push(event));
    await bridge.start();

    // 外部修改检测（等价真实 watcher 触发）
    watcherHolder.cb?.();
    expect(events.some((e) => e.kind === "external_change")).toBe(true);

    // 未刷新：prompt 被拦截（mock 子进程未收到 prompt 命令）并引导刷新
    await bridge.sendPrompt("TC-022-after");
    await new Promise((r) => setTimeout(r, 300));
    expect(logContains('"type":"prompt"')).toBe(false);
    const errors = events.filter((e) => e.kind === "error") as Array<{ message: string; hint?: string }>;
    expect(errors.some((e) => e.message.includes("拦截"))).toBe(true);
    expect(errors.some((e) => (e.hint ?? "").includes("刷新"))).toBe(true);

    // 刷新后恢复交互
    await bridge.reloadHistory();
    await bridge.sendPrompt("TC-022-fresh");
    await waitFor(() => logContains('"type":"prompt"'), 4000, "prompt accepted after refresh");

    await bridge.dispose();
  });
});

describe("缺陷#6（NFR-05）关键路径日志", () => {
  it("会话创建 / prompt / abort / 子进程退出 4 类齐全", async () => {
    const memory = new MemoryLogger();
    const events: BridgeEvent[] = [];
    const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
    const bridge = new PiBridge({
      cwd: workDir,
      runtime,
      createClient: ({ command, args, cwd }) =>
        new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_LOG: logFile } }) as unknown as PiRpcClient,
      logger: memory,
      tailLines: 200,
      sendMode: "steer",
    });
    bridge.onAny((event) => events.push(event));
    await bridge.start();

    await bridge.newSession(); // ① 会话创建
    await bridge.sendPrompt("LONG"); // ② prompt 发送
    await waitFor(() => bridge.getRunState() === "streaming", 8000, "streaming");
    await bridge.abort(); // ③ abort
    await waitFor(() => bridge.getRunState() === "idle", 8000, "aborted → idle");
    await bridge.sendPrompt("CRASH_NOW"); // ④ 子进程退出
    await waitFor(() => memory.lines.join("\n").includes("子进程退出"), 8000, "crash logged");

    const dump = memory.lines.join("\n");
    expect(dump).toMatch(/新建会话/);
    expect(dump).toMatch(/prompt/i);
    expect(dump).toMatch(/abort|中止/);
    expect(dump).toMatch(/子进程退出/);

    await bridge.dispose();
  }, 30000);
});

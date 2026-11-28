// TASK-011 批次 H（Issue #13 / R-15 / P-08）：真实 pi 冒烟——D8 三源锚点的「真实 runtime」通道，
// 目的 = 暴露对端契约漂移。**禁 mock/fake 基建**：本文件不 import fake-pi-cli、不设任何 FAKE_* 环境，
// raw spawn 本机 PATH 的真实 pi 二进制。
// R-20 注记（TASK-012 批次 E / Issue #18）：npm 脚本语境（npm run verify:integration → vitest）下
//   PATH 前置 node_modules/.bin——spawn("pi") 与 `pi --version` 探测的实测对象为锁定依赖 bin
//   （@earendil-works/pi-coding-agent@1.5.2 的 bin symlink；which/实路径控制台留痕）；PATH 侧对端
//   （本机真实安装 pi，如全局 1.7.0）的漂移不由本冒烟暴露——该面由螺旋周期轮 npm view 监视承担。
// 通道（grep src/bridge/piBridge.ts buildArgs 实证）：生产 spawn = `<pi> --mode rpc [--session <path>]`；
//   本冒烟采 rpc.md「Start RPC Mode」文档范式 `pi --mode rpc --no-session`（文档范式的最小通道；
//   --no-session 免向本机真实会话目录写入）+ 临时 cwd 隔离。
// 版本字段实测注记（2026-11-27，本机 pi 1.5.2）：RPC 响应（rpc-commands.md get_state）不携带 pi 版本
//   字段——版本断言落在 `pi --version` 探测输出（该输出即携带版本号），并按生产「可用 pi」判据
//   （rpcTransport defaultProbe：版本 ≥ MIN_SUPPORTED_PI_VERSION）断言；协议握手 = get_state 的
//   response.success + id 关联回显 + data 契约字段（sessionId/model）。
// 帧规则（rpc.md「Framing」）：严格 JSONL，仅按 LF 切分、剥前置 CR（不用 readline——U+2028/U+2029
//   在 JSON 字符串内合法，readline 会误切）。
// 探测拿不到 PATH pi → describe.skip + console.warn 留痕（不红）；冒烟超时 30s；不发送 prompt
// （避免真实模型调用/网络）。

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_SUPPORTED_PI_VERSION, isVersionAtLeast } from "../../src/bridge/rpcTransport";

const PROBE_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 30_000;

interface VersionProbe {
  ok: boolean;
  version?: string;
  error?: string;
}

/** 探测本机 PATH pi：`pi --version` 退出码 0 且输出含版本号（与生产 defaultProbe 同判据）。 */
function probePathPiVersion(): Promise<VersionProbe> {
  return new Promise((resolve) => {
    // cwd 隔离：真实 pi 启动会加载本机扩展（如 pi-loop 会向 cwd 写 .pi-loop.json 机器状态）——
    // 探测不得把机器状态写进仓库根（首次实测即发现该副作用；RPC 冒烟同用临时 cwd）。
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-pi-probe-"));
    const child = spawn("pi", ["--version"], { cwd: probeDir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errOut = "";
    let settled = false;
    const done = (result: VersionProbe) => {
      if (!settled) {
        settled = true;
        fs.rmSync(probeDir, { recursive: true, force: true });
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 忽略
      }
      done({ ok: false, error: "pi --version 超时（10s）" });
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on("data", (c: Buffer | string) => (out += String(c)));
    child.stderr?.on("data", (c: Buffer | string) => (errOut += String(c)));
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      done({ ok: false, error: err.message });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const match = out.match(/\d+\.\d+(\.\d+)?/);
      if (code === 0 && match) done({ ok: true, version: match[0] });
      else done({ ok: false, error: `exit=${code} ${errOut.trim() || out.trim()}`.trim() });
    });
  });
}

interface GetStateResponse {
  type: string;
  id: string;
  command: string;
  success: boolean;
  data: { sessionId?: unknown; model?: { id?: unknown } };
}

/** 逐行 JSONL 解析（仅 LF 切分，rpc.md「Framing」）；命中关联回显 id 的 response 即 resolve。 */
function waitForResponse(child: ChildProcessWithoutNullStreams, id: string): Promise<GetStateResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`pi --mode rpc 响应超时（${RPC_TIMEOUT_MS / 1000}s）`)), RPC_TIMEOUT_MS);
    let buffer = "";
    child.stdout.setEncoding("utf8");
    const onData = (chunk: string): void => {
      buffer += chunk;
      for (;;) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.trim().length === 0) continue;
        let record: GetStateResponse;
        try {
          record = JSON.parse(line) as GetStateResponse;
        } catch {
          continue; // 非法行不计（客户端侧记协议异常的口径由 rpcClient 单测覆盖）
        }
        if (record.type === "response" && record.id === id) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          resolve(record);
        }
      }
    };
    child.stdout.on("data", onData);
    child.on("exit", (code: number | null) => {
      clearTimeout(timer);
      reject(new Error(`pi rpc 子进程提前退出：code=${code}`));
    });
    child.stdin.write(JSON.stringify({ id, type: "get_state" }) + "\n");
  });
}

// 采集期探测（本机 PATH）：拿不到 → 整套 describe.skip 并留痕（不红；真实 runtime 通道按环境存在性门控）
const probe = await probePathPiVersion();

/**
 * R-20 解析路径留痕（TASK-012 批次 E）：`which pi` 输出与 bin symlink 实路径——npm 脚本语境下
 * 实路径落入 node_modules/@earendil-works/pi-coding-agent（锁定依赖 bin）即为「实测对象 = 锁定
 * 依赖 1.5.2」的直接证据。best-effort（which 非POSIX不可用/realpath 失败均降级留痕），零行为变化。
 */
function resolvePathPiTrace(): { which?: string; real?: string; note?: string } {
  try {
    const which = execFileSync("which", ["pi"], { encoding: "utf8" }).trim();
    try {
      return { which, real: fs.realpathSync(which) };
    } catch {
      return { which, note: "实路径解析失败" };
    }
  } catch {
    return { note: "which 不可用（非 POSIX 环境）" };
  }
}
const piPathTrace = resolvePathPiTrace();

const suite = probe.ok ? describe : describe.skip;
if (!probe.ok) {
  console.warn(`[pi-real-smoke] 跳过：本机 PATH 无可用 pi（${probe.error ?? "未知原因"}）——Issue #13 真实 pi 冒烟未执行，留痕不红`);
}

suite("真实 pi 冒烟（npm 脚本语境实测对象 = 锁定依赖 bin 1.5.2，PATH 侧对端漂移由螺旋周期轮 npm view 承担；禁 mock/fake 基建；TASK-011 H / Issue #13 R-15 / P-08、TASK-012 E / Issue #18 R-20）", () => {
  it(
    "pi --version 版本字段 + pi --mode rpc get_state 协议握手（30s 超时）",
    async () => {
      // 版本字段：`pi --version` 探测输出携带版本号（实测记录入测试输出）
      console.log(`[pi-real-smoke] 本机 pi --version 实测：${probe.version ?? "(未知)"}`);
      // R-20 留痕：解析路径（which/实路径）——npm 脚本语境下实路径 = 锁定依赖 bin，PATH 侧对端
      // 漂移不由本冒烟暴露（螺旋周期轮 npm view 监视承担）
      console.log(
        `[pi-real-smoke] pi 解析路径（which pi）：${piPathTrace.which ?? piPathTrace.note ?? "(未知)"}` +
          `${piPathTrace.real ? ` → 实路径：${piPathTrace.real}` : ""}`
      );
      expect(probe.version).toBeDefined();
      // 生产「可用 pi」判据（rpcTransport defaultProbe）：PATH pi 版本 ≥ 插件最低支持
      expect(isVersionAtLeast(probe.version ?? "", MIN_SUPPORTED_PI_VERSION)).toBe(true);

      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-pi-smoke-"));
      const child = spawn("pi", ["--mode", "rpc", "--no-session"], {
        cwd: workDir,
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;
      try {
        const response = await waitForResponse(child, "sdysyhj-smoke-1");

        // 协议握手成功：response.success + command 关联回显 + id 回显
        expect(response.success).toBe(true);
        expect(response.command).toBe("get_state");
        expect(response.id).toBe("sdysyhj-smoke-1");
        // 契约字段（rpc-commands.md get_state data）：sessionId 字符串 + model 对象含 id
        expect(typeof response.data?.sessionId).toBe("string");
        expect(typeof response.data?.model?.id).toBe("string");
      } finally {
        child.kill("SIGKILL");
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    },
    RPC_TIMEOUT_MS + 5_000
  );
});

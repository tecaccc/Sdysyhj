// 集成测试：pi 运行时来源解析（FR-CMD-05）——真实 spawn 探测（离线）。
// PATH 假 pi / 无效 pi / 内置运行时回退；内置 cli.js `--version` 冒烟。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RpcClient } from "../../src/bridge/rpcClient";
import {
  defaultResolveBundledCli,
  defaultProbe,
  resolvePiRuntime,
  PiRuntimeError,
} from "../../src/bridge/rpcTransport";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-runtime-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFakePi(name: string, script: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, `#!/bin/sh\n${script}\n`);
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

describe("resolvePiRuntime（真实探测）", () => {
  it("auto：PATH 上的假 pi 可用 → source=path，含版本", async () => {
    writeFakePi("pi", 'echo "pi version 9.9.9"');
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      { env: { PATH: `${tmpDir}${path.delimiter}${process.env.PATH ?? ""}` } }
    );
    expect(rt.source).toBe("path");
    expect(rt.command).toBe("pi");
    expect(rt.detail).toContain("9.9.9");
  });

  it("auto：PATH pi 启动失败（exit≠0）→ 回退内置运行时", async () => {
    writeFakePi("pi", 'echo "boom" >&2\nexit 1');
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      { env: { PATH: `${tmpDir}${path.delimiter}${process.env.PATH ?? ""}` } }
    );
    expect(rt.source).toBe("bundled");
    expect(rt.command).toBe(process.execPath);
    expect(fs.existsSync(rt.baseArgs[0])).toBe(true);
  });

  it("auto：PATH 无 pi → 内置运行时（真实 node_modules 中的 cli.js）", async () => {
    const cli = defaultResolveBundledCli();
    expect(cli).toBeTruthy();
    expect(fs.existsSync(cli as string)).toBe(true);

    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      { env: { PATH: tmpDir } }
    );
    expect(rt.source).toBe("bundled");
    expect(rt.baseArgs[0]).toMatch(/cli\.js$/);
  });

  it("显式 piPath 指向假 pi → source=explicit", async () => {
    const fakePi = writeFakePi("my-pi", 'echo "my-pi 1.0.0"');
    const rt = await resolvePiRuntime(
      { piRuntime: "path", piPath: fakePi },
      { env: { PATH: tmpDir } }
    );
    expect(rt.source).toBe("explicit");
    expect(rt.command).toBe(fakePi);
    expect(rt.detail).toContain("1.0.0");
  });

  it("显式 piPath 启动失败 → 含详情的可行动错误", async () => {
    const badPi = writeFakePi("bad-pi", 'echo "segfault" >&2\nexit 7');
    try {
      await resolvePiRuntime({ piRuntime: "path", piPath: badPi }, { env: { PATH: tmpDir } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PiRuntimeError);
      const e = err as PiRuntimeError;
      expect(e.detail).toContain("segfault");
      expect(e.hint).toBeTruthy();
    }
  });

  it("defaultProbe：不存在的命令 → ok=false", async () => {
    const result = await defaultProbe(path.join(tmpDir, "no-such-binary"), ["--version"], { PATH: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("内置运行时冒烟（离线）", () => {
  it("bundled cli.js --version 可执行", async () => {
    const cli = defaultResolveBundledCli();
    expect(cli).toBeTruthy();
    const client = new RpcClient({ command: process.execPath, args: [cli as string, "--version"], cwd: tmpDir });
    // --version 直接输出退出，不进入 RPC 模式：用 probe 验证即可
    await client.stop();
    const probe = await defaultProbe(process.execPath, [cli as string, "--version"], { PATH: process.env.PATH });
    expect(probe.ok).toBe(true);
    expect(probe.version).toMatch(/\d+\.\d+/);
  }, 30000);
});

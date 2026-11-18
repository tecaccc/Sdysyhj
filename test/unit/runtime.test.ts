// 运行时来源解析单测（FR-CMD-05）：PATH 优先 / 内置回退 / 显式指定 + 可行动错误。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MIN_SUPPORTED_PI_VERSION,
  PiRuntimeError,
  defaultResolveBundledCli,
  isVersionAtLeast,
  resolvePiRuntime,
  type ProbeResult,
  type ResolveRuntimeDeps,
} from "../../src/bridge/rpcTransport";

function deps(overrides: Partial<ResolveRuntimeDeps> = {}): ResolveRuntimeDeps {
  return {
    probe: async (command): Promise<ProbeResult> => (command === "pi" ? { ok: true, version: "0.84.4" } : { ok: false, error: "not found" }),
    exists: () => true,
    resolveBundledCli: () => "/pkg/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
    env: {},
    ...overrides,
  };
}

describe("resolvePiRuntime", () => {
  it("auto：PATH 有可用 pi → 优先 PATH", async () => {
    const rt = await resolvePiRuntime({ piRuntime: "auto", piPath: "" }, deps());
    expect(rt.source).toBe("path");
    expect(rt.command).toBe("pi");
    expect(rt.detail).toContain("0.84.4");
  });

  it("auto：PATH 无 pi → 回退内置运行时（node + cli.js）", async () => {
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      deps({ probe: async () => ({ ok: false, error: "ENOENT" }) })
    );
    expect(rt.source).toBe("bundled");
    expect(rt.command).toBe(process.execPath);
    expect(rt.baseArgs).toEqual(["/pkg/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"]);
  });

  it("bundled 模式：直接内置", async () => {
    const rt = await resolvePiRuntime({ piRuntime: "bundled", piPath: "" }, deps());
    expect(rt.source).toBe("bundled");
    expect(rt.baseArgs[0]).toContain("cli.js");
  });

  it("auto：PATH 与内置均不可用 → PiRuntimeError 含可行动指引", async () => {
    await expect(
      resolvePiRuntime(
        { piRuntime: "auto", piPath: "" },
        deps({ probe: async () => ({ ok: false, error: "ENOENT" }), resolveBundledCli: () => null })
      )
    ).rejects.toThrow(PiRuntimeError);
    try {
      await resolvePiRuntime(
        { piRuntime: "auto", piPath: "" },
        deps({ probe: async () => ({ ok: false, error: "ENOENT" }), resolveBundledCli: () => null })
      );
    } catch (err) {
      const e = err as PiRuntimeError;
      expect(e.hint).toContain("pi");
      expect(e.detail).toContain("ENOENT");
    }
  });

  it("piPath 显式指定 → 按该路径启动", async () => {
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "/opt/pi" },
      deps({ probe: async () => ({ ok: true, version: "1.2.3" }) })
    );
    expect(rt.source).toBe("explicit");
    expect(rt.command).toBe("/opt/pi");
    expect(rt.detail).toContain("1.2.3");
  });

  it("显式路径不存在 → 含错误详情的可行动指引", async () => {
    try {
      await resolvePiRuntime({ piRuntime: "path", piPath: "/bad/pi" }, deps({ exists: () => false }));
      expect.unreachable();
    } catch (err) {
      const e = err as PiRuntimeError;
      expect(e.message).toContain("/bad/pi");
      expect(e.hint).toContain("sdysyhj.piPath");
    }
  });

  it("显式路径启动失败（探测不过）→ 错误含详情", async () => {
    try {
      await resolvePiRuntime(
        { piRuntime: "path", piPath: "/opt/pi" },
        deps({ probe: async () => ({ ok: false, error: "permission denied" }) })
      );
      expect.unreachable();
    } catch (err) {
      const e = err as PiRuntimeError;
      expect(e.detail).toContain("permission denied");
      expect(e.hint).toBeTruthy();
    }
  });

  it("path 模式未配置 piPath → 提示配置", async () => {
    try {
      await resolvePiRuntime({ piRuntime: "path", piPath: "  " }, deps());
      expect.unreachable();
    } catch (err) {
      const e = err as PiRuntimeError;
      expect(e.hint).toContain("sdysyhj.piPath");
    }
  });

  it("auto：PATH pi 版本低于最低支持 → 回退内置运行时（FR-CMD-05 判据）", async () => {
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      deps({ probe: async () => ({ ok: true, version: "0.50.0" }) })
    );
    expect(rt.source).toBe("bundled");
  });

  it("显式路径版本低于最低支持 → 含详情的可行动错误", async () => {
    try {
      await resolvePiRuntime(
        { piRuntime: "path", piPath: "/opt/pi" },
        deps({ probe: async () => ({ ok: true, version: "0.10.0" }) })
      );
      expect.unreachable();
    } catch (err) {
      const e = err as PiRuntimeError;
      expect(e.message).toContain("0.10.0");
      expect(e.message).toContain(MIN_SUPPORTED_PI_VERSION);
      expect(e.detail).toContain("0.10.0");
      expect(e.hint).toBeTruthy();
    }
  });
});

describe("isVersionAtLeast", () => {
  it("点分版本比较（缺省段按 0）", () => {
    expect(isVersionAtLeast("0.84.0", MIN_SUPPORTED_PI_VERSION)).toBe(true);
    expect(isVersionAtLeast("0.84", "0.84.0")).toBe(true);
    expect(isVersionAtLeast("1.5.2", "0.84.0")).toBe(true);
    expect(isVersionAtLeast("0.83.9", "0.84.0")).toBe(false);
    expect(isVersionAtLeast("0.84.0", "0.84.0")).toBe(true);
    expect(isVersionAtLeast("2.0", "1.99.99")).toBe(true);
  });
});

describe("defaultResolveBundledCli 打包布局（缺陷#1 回归）", () => {
  const layouts: string[] = [];

  function makeProdLayout(opts: { deepBase?: boolean; legacyCli?: boolean }): { extRoot: string; baseDir: string; cli: string } {
    const extRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-prodlayout-"));
    layouts.push(extRoot);
    const pkgRoot = path.join(extRoot, "node_modules", "@earendil-works", "pi-coding-agent");
    const cli = path.join(pkgRoot, "dist", opts.legacyCli ? "cli.js" : path.join("bundle", "cli.js"));
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "// fake bundled cli\n");
    // 扩展 bundle 位于 <ext>/dist（或更深子目录）
    const baseDir = path.join(extRoot, "dist", ...(opts.deepBase ? ["nested", "more"] : []));
    fs.mkdirSync(baseDir, { recursive: true });
    return { extRoot, baseDir, cli };
  }

  afterAll(() => {
    for (const dir of layouts) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("<ext>/dist + <ext>/node_modules 布局（vsix 形态）可解析", () => {
    const { baseDir, cli } = makeProdLayout({});
    expect(defaultResolveBundledCli(baseDir)).toBe(cli);
  });

  it("<pkg>/dist/cli.js 旧式入口可解析", () => {
    const { baseDir, cli } = makeProdLayout({ legacyCli: true });
    expect(defaultResolveBundledCli(baseDir)).toBe(cli);
  });

  it("bundle 位于更深层目录时向上走 node_modules 仍可解析", () => {
    const { baseDir, cli } = makeProdLayout({ deepBase: true });
    expect(defaultResolveBundledCli(baseDir)).toBe(cli);
  });

  it("布局内无内置运行时 → null（由上层报可行动错误）", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-emptylayout-"));
    layouts.push(empty);
    // 注入 exists 判定，隔离环境噪声（如祖先 node_modules）
    expect(defaultResolveBundledCli(path.join(empty, "dist"), () => false)).toBeNull();
    // 真实 fs 判定：布局本身不含运行时（若祖先链命中外部包则返回的路径不在布局内）
    const resolved = defaultResolveBundledCli(path.join(empty, "dist"));
    expect(resolved === null || !resolved.startsWith(empty)).toBe(true);
  });

  it("resolvePiRuntime 在打包布局下自动回退内置运行时", async () => {
    const { baseDir, cli } = makeProdLayout({});
    const rt = await resolvePiRuntime(
      { piRuntime: "auto", piPath: "" },
      {
        probe: async () => ({ ok: false, error: "ENOENT" }), // 模拟 PATH 无 pi
        resolveBundledCli: () => defaultResolveBundledCli(baseDir),
        env: {},
      }
    );
    expect(rt.source).toBe("bundled");
    expect(rt.baseArgs[0]).toBe(cli);
    expect(fs.existsSync(rt.baseArgs[0])).toBe(true);
  });
});

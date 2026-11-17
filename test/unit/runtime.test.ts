// 运行时来源解析单测（FR-CMD-05）：PATH 优先 / 内置回退 / 显式指定 + 可行动错误。

import { describe, expect, it } from "vitest";
import {
  MIN_SUPPORTED_PI_VERSION,
  PiRuntimeError,
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

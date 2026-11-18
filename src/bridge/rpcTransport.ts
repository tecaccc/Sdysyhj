// pi 子进程来源解析（FR-CMD-05）：
//   auto    → PATH 上有可用 pi 则优先；否则回退插件内置运行时（开箱即用）
//   path    → 使用 sdysyhj.piPath 显式指定；无效/启动失败 → 含错误详情的可行动错误
//   bundled → 始终使用内置运行时
// piPath 非空时（任意模式）优先生效。

import { spawn as nodeSpawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type RuntimeSource = "path" | "bundled" | "explicit";

/**
 * 插件声明的最低支持 pi 版本（FR-CMD-05 “可用 pi”判据之一）。
 * “可用 pi” = `pi --version` 退出码 0、输出含版本号、且版本 ≥ 本值；否则回退内置运行时。
 */
export const MIN_SUPPORTED_PI_VERSION = "0.84.0";

/** 点分版本比较：a ≥ b 返回 true；缺省段按 0；忽略预发布后缀。 */
export function isVersionAtLeast(version: string, minimum: string): boolean {
  const parse = (v: string): number[] =>
    v
      .split(".")
      .map((seg) => {
        const n = parseInt(seg, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const a = parse(version);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

export interface ResolvedRuntime {
  source: RuntimeSource;
  /** 可执行文件（pi 或 node） */
  command: string;
  /** 可执行文件之后、--mode rpc 之前的参数（bundled 为 [cliPath]） */
  baseArgs: string[];
  /** 人类可读来源描述（日志/状态） */
  detail: string;
}

export class PiRuntimeError extends Error {
  constructor(
    message: string,
    /** 可行动修复指引 */
    readonly hint: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "PiRuntimeError";
  }
}

export interface ProbeResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export type RuntimeProbe = (command: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<ProbeResult>;

export interface ResolveRuntimeDeps {
  probe?: RuntimeProbe;
  exists?: (p: string) => boolean;
  resolveBundledCli?: () => string | null;
  env?: NodeJS.ProcessEnv;
}

export interface ResolveRuntimeConfig {
  piRuntime: "auto" | "path" | "bundled";
  piPath: string;
}

/** 默认版本探测：执行 `<pi> --version`，退出码 0 且输出含版本号视为可用。 */
export const defaultProbe: RuntimeProbe = (command, args, env) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (result: ProbeResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    let child;
    try {
      child = nodeSpawn(command, args, { env: env ?? process.env });
    } catch (err) {
      done({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 忽略
      }
      done({ ok: false, error: "版本探测超时（5s）" });
    }, 5000);
    child.stdout?.on("data", (c: Buffer | string) => (out += String(c)));
    child.stderr?.on("data", (c: Buffer | string) => (errOut += String(c)));
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      done({ ok: false, error: err.message });
    });
    // 用 close 而非 exit：close 在 stdio 全部冲刷后触发，避免 stdout 未读完就判定失败的竞态
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const versionMatch = out.match(/\d+\.\d+(\.\d+)?/);
      if (code === 0 && versionMatch) {
        done({ ok: true, version: versionMatch[0] });
      } else {
        done({ ok: false, error: `exit=${code} ${errOut.trim() || out.trim()}`.trim() });
      }
    });
  });

/**
 * 解析内置运行时入口：<pkg>/dist/bundle/cli.js（官方 bin）或 <pkg>/dist/cli.js。
 * 打包布局（<ext>/dist/extension.js + <ext>/node_modules）与开发布局均需覆盖：
 *   ① Node exports 解析（包未限制 exports 条件时可用）；
 *   ② 从 baseDir 逐级向上探测 node_modules（不依赖 exports 映射，兼容仅 `import`
 *      条件的包与 CJS bundle，修复打包形态解析失败）。
 */
export function defaultResolveBundledCli(baseDir?: string, exists: (p: string) => boolean = (p) => fs.existsSync(p)): string | null {
  const candidates: string[] = [];
  const pkgSub = path.join("@earendil-works", "pi-coding-agent");
  const inPackage = (pkgRoot: string): string[] => [
    path.join(pkgRoot, "dist", "bundle", "cli.js"),
    path.join(pkgRoot, "dist", "cli.js"),
  ];

  // ① exports 解析（仅当未显式指定 baseDir：require 以模块位置解析，开发环境可用时优先）
  if (baseDir === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const entry = require.resolve("@earendil-works/pi-coding-agent");
      const distDir = path.dirname(entry); // <pkg>/dist
      candidates.push(path.join(distDir, "bundle", "cli.js"), path.join(distDir, "cli.js"));
      candidates.push(...inPackage(path.dirname(distDir)));
    } catch {
      // exports 限制（如仅 `import` 条件）或未安装时走路径探测
    }
  }

  // ② 从 baseDir（默认 bundle 所在目录）向上逐级探测 node_modules，
  //    不依赖 exports 映射，兼容仅 `import` 条件的包与 CJS bundle（打包布局 <ext>/dist → <ext>/node_modules）
  let dir = path.resolve(baseDir ?? __dirname);
  for (let i = 0; i < 8; i += 1) {
    candidates.push(...inPackage(path.join(dir, "node_modules", pkgSub)));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    try {
      if (exists(candidate)) return candidate;
    } catch {
      // 继续
    }
  }
  return null;
}

/**
 * 按配置解析 pi 运行时来源。失败抛出 PiRuntimeError（含可行动指引与错误详情）。
 */
export async function resolvePiRuntime(
  config: ResolveRuntimeConfig,
  deps: ResolveRuntimeDeps = {}
): Promise<ResolvedRuntime> {
  const probe = deps.probe ?? defaultProbe;
  const exists = deps.exists ?? ((p: string) => fs.existsSync(p));
  const resolveBundledCli = deps.resolveBundledCli ?? defaultResolveBundledCli;
  const env = deps.env ?? process.env;
  const piPath = config.piPath.trim();

  const tryExplicit = async (candidate: string): Promise<ResolvedRuntime> => {
    if (!exists(candidate)) {
      throw new PiRuntimeError(
        `指定的 pi 路径不存在：${candidate}`,
        "请在设置 sdysyhj.piPath 中填写有效的 pi 可执行文件完整路径，或改用自动模式。",
        `path: ${candidate}`
      );
    }
    const result = await probe(candidate, ["--version"], env);
    if (!result.ok) {
      throw new PiRuntimeError(
        `指定的 pi 无法启动：${candidate}`,
        "请检查该文件是否为可执行的 pi 程序（或 node + cli.js），并确认其依赖完整；也可清空 sdysyhj.piPath 回退自动模式。",
        result.error ?? "未知错误"
      );
    }
    const version = result.version ?? "";
    if (version && !isVersionAtLeast(version, MIN_SUPPORTED_PI_VERSION)) {
      throw new PiRuntimeError(
        `指定的 pi 版本过低：${version}（最低支持 ${MIN_SUPPORTED_PI_VERSION}）`,
        "请升级 pi（npm i -g @earendil-works/pi-coding-agent），或清空 sdysyhj.piPath 回退自动模式（使用内置运行时）。",
        `pi --version 输出：${version}`
      );
    }
    return { source: "explicit", command: candidate, baseArgs: [], detail: `显式指定 pi ${version}`.trim() };
  };

  // 显式路径优先（任意模式下 piPath 非空即生效）
  if (piPath.length > 0) {
    return tryExplicit(piPath);
  }

  if (config.piRuntime === "path") {
    throw new PiRuntimeError(
      "已选择 path 模式但未配置 sdysyhj.piPath",
      "请在设置 sdysyhj.piPath 中填写 pi 可执行文件路径，或将 sdysyhj.piRuntime 改回 auto。"
    );
  }

  if (config.piRuntime === "bundled") {
    return resolveBundled();
  }

  // auto：PATH 探测（“可用 pi”判据：exit=0 + 含版本号 + 版本 ≥ 最低支持）
  let pathProbeError: string | undefined;
  const pathResult = await probe("pi", ["--version"], env);
  const pathVersion = pathResult.version ?? "";
  if (pathResult.ok && pathVersion && isVersionAtLeast(pathVersion, MIN_SUPPORTED_PI_VERSION)) {
    return { source: "path", command: "pi", baseArgs: [], detail: `PATH pi ${pathVersion}`.trim() };
  }
  pathProbeError = pathResult.ok
    ? `PATH pi 版本 ${pathVersion} 低于最低支持 ${MIN_SUPPORTED_PI_VERSION}`
    : pathResult.error;
  return resolveBundled();

  function resolveBundled(): ResolvedRuntime {
    const cli = resolveBundledCli();
    if (!cli) {
      throw new PiRuntimeError(
        "未找到可用的 pi 运行时（PATH 无 pi，内置运行时缺失）",
        "请安装 pi CLI（npm i -g @earendil-works/pi-coding-agent），或重新安装本插件以恢复内置运行时。",
        pathProbeError ? `PATH 探测失败：${pathProbeError}` : undefined
      );
    }
    return {
      source: "bundled",
      command: process.execPath,
      baseArgs: [cli],
      detail: `内置运行时 ${path.basename(path.dirname(path.dirname(cli)))}`,
    };
  }
}

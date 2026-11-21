// TASK-009 §10.13 D8 单测：依赖精确版本锁定（FR-AUI-05①，D6 清单）。
// package.json 新增的 @assistant-ui/* 与 react 线依赖一律精确版本（零 ^ / ~ / >= / * 前缀；
// JSON 解析断言，非文本匹配）。清单 = 设计 D6 锁定清单（版本号 2026-11-21 registry 核实）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

/** D6 精确锁定清单：依赖 → 精确版本。 */
const PINNED_DEPENDENCIES: Record<string, string> = {
  "@assistant-ui/vscode": "0.0.1",
  "@assistant-ui/react": "0.15.37",
  "@assistant-ui/ai-sdk": "0.0.19",
  ai: "7.0.153",
  react: "19.3.1",
  "react-dom": "19.3.1",
  zod: "4.6.7",
};
const PINNED_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
};

const isExact = (version: string): boolean => /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(version);

describe("FR-AUI-05① 依赖精确版本锁定（零 ^ / ~ / >= 前缀）", () => {
  it("① 九项锁定清单逐项：精确版本 + 与 D6 清单一致", () => {
    for (const [name, version] of Object.entries(PINNED_DEPENDENCIES)) {
      expect(pkg.dependencies[name], `dependencies 缺 ${name}`).toBe(version);
    }
    for (const [name, version] of Object.entries(PINNED_DEV_DEPENDENCIES)) {
      expect(pkg.devDependencies[name], `devDependencies 缺 ${name}`).toBe(version);
    }
  });

  it("② 全部 dependencies/devDependencies 均无范围前缀（既有依赖亦为精确版，冻结面不变）", () => {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      expect(isExact(version), `${name}=${version} 非精确版本`).toBe(true);
    }
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      expect(isExact(version), `${name}=${version} 非精确版本`).toBe(true);
    }
  });

  it("③ 既有依赖冻结（阶段①前已有的四项运行时依赖不变）", () => {
    expect(pkg.dependencies["@earendil-works/pi-coding-agent"]).toBe("1.5.2");
    expect(pkg.dependencies.dompurify).toBe("3.4.18");
    expect(pkg.dependencies["highlight.js"]).toBe("11.12.0");
    expect(pkg.dependencies.marked).toBe("18.2.1");
  });
});

describe("FR-AUI-05② zod jitless 三件套①：源顺序断言（官方指南：须在任何 zod schema 构建前导入）", () => {
  it("webview/lab/main.tsx 首个 import = ./zod-jitless", () => {
    const main = read("webview/lab/main.tsx");
    // 剥离行注释后再取首个 import 语句（避免头部说明注释中的“import”字样被误捕）
    const codeOnly = main
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const firstImport = /^import\b[^\n]*$/m.exec(codeOnly)?.[0]?.trim() ?? "";
    expect(firstImport).toBe('import "./zod-jitless";');
  });

  it("zod-jitless.ts 内容 = 官方片段 config({ jitless: true })（import config from zod 后调用）", () => {
    const source = read("webview/lab/zod-jitless.ts");
    expect(source).toContain('import { config } from "zod";');
    expect(source).toContain("config({ jitless: true });");
  });
});

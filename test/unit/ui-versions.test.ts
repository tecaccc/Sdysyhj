// 依赖精确版本锁定门禁（原 TASK-009 §10.14 D8 单测 FR-AUI-05①；TASK-011 批次 A 项同步）。
// 2026-11-27 人类还原指令（「还原聊天界面为我们自己编写的版本，去掉外部引入的框架」）后：
// @assistant-ui/* 全族与 react 线依赖（react/react-dom/@types/react/@types/react-dom/
// react-markdown 链/remark-*/@testing-library/*/zod——grep 实证消费方为零，zod 仅新 UI
// zod-jitless 消费）随新 UI 整体移除；jsdom 保留（经典面板 golden DOM 集成测试环境）并去重。
// 本文件 = 还原后依赖基线门禁：① 剩余依赖精确版本锁定；② 全依赖零范围前缀；③ 经典依赖
// 冻结（marked/highlight.js/dompurify/pi 运行时不变）；④ 新 UI 依赖族删除断言（防回流）；
// ⑤ R-01 重复键消除断言（@assistant-ui/react-markdown、remark-breaks、remark-gfm 随删除
// 消除、jsdom 去重单条——依赖块键唯一）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

/** 还原后运行时依赖精确锁定清单（= v0.1.6 时代经典实现依赖集）。 */
const PINNED_DEPENDENCIES: Record<string, string> = {
  "@earendil-works/pi-coding-agent": "1.5.2",
  dompurify: "3.4.18",
  "highlight.js": "11.12.0",
  marked: "18.2.1",
};
/** 还原后开发依赖精确锁定清单（jsdom = 经典面板 golden DOM 集成测试环境，去重后单条）。 */
const PINNED_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/node": "22.20.5",
  "@types/vscode": "1.85.0",
  esbuild: "0.28.2",
  jsdom: "31.0.1",
  typescript: "7.0.2",
  vitest: "5.1.0",
};

const isExact = (version: string): boolean => /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(version);

/** 依赖块键列表（文本级提取——JSON.parse 对重复键静默取后者，重复键须文本核对）。 */
function depKeys(block: "dependencies" | "devDependencies"): string[] {
  const raw = read("package.json");
  const start = raw.indexOf(`"${block}"`);
  expect(start, `package.json 缺 ${block} 块`).toBeGreaterThanOrEqual(0);
  const open = raw.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, `${block} 块未闭合`).toBeGreaterThanOrEqual(0);
  return [...raw.slice(open + 1, end).matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]);
}

describe("依赖精确版本锁定（零 ^ / ~ / >= 前缀）", () => {
  it("① 还原后锁定清单逐项：精确版本 + 经典实现依赖集（v0.1.6 时代形态）", () => {
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

  it("③ 经典实现依赖冻结（还原不得误删：marked/highlight.js/dompurify/pi 运行时不变）", () => {
    expect(pkg.dependencies["@earendil-works/pi-coding-agent"]).toBe("1.5.2");
    expect(pkg.dependencies.dompurify).toBe("3.4.18");
    expect(pkg.dependencies["highlight.js"]).toBe("11.12.0");
    expect(pkg.dependencies.marked).toBe("18.2.1");
  });

  it("④ 新 UI 依赖族删除断言（防回流）：@assistant-ui/* 与 react 线依赖零残留", () => {
    const forbidden = [
      "@assistant-ui/react",
      "@assistant-ui/react-markdown",
      "@assistant-ui/vscode",
      "@assistant-ui/ai-sdk",
      "ai",
      "react",
      "react-dom",
      "react-markdown",
      "remark-gfm",
      "remark-breaks",
      "zod",
      "@types/react",
      "@types/react-dom",
      "@testing-library/react",
      "@testing-library/dom",
    ];
    for (const name of forbidden) {
      expect(pkg.dependencies[name], `dependencies 残留新 UI 依赖 ${name}`).toBeUndefined();
      expect(pkg.devDependencies[name], `devDependencies 残留新 UI 依赖 ${name}`).toBeUndefined();
    }
  });

  it("⑤ R-01 重复键消除：依赖块键唯一（原 @assistant-ui/react-markdown、remark-breaks、remark-gfm ×2 随删除消除；jsdom ×2 去重单条）", () => {
    for (const block of ["dependencies", "devDependencies"] as const) {
      const keys = depKeys(block);
      expect(new Set(keys).size, `${block} 存在重复键`).toBe(keys.length);
    }
  });
});

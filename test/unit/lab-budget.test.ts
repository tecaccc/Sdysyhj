// TASK-009 §10.13 D8 单测：bundle 体积预算（FR-AUI-05③，D6 口径）。
// 实验面板 webview JS = esbuild 构建产物字节（入口 + 全部 chunk；不含 .css 与 .map）≤ 3,145,728；
// 默认面板依赖图不含 react/@assistant-ui 已在 lab-isolation D1④ 断言（本文件不复重）。
// 构建 = esbuild JS API 同参构建（minify + NODE_ENV define），与 esbuild.mjs lab 入口一致。

import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const LAB_JS_BUDGET_BYTES = 3 * 1024 * 1024; // 3 MiB = 3,145,728（FR-AUI-05③ 定值）

describe("FR-AUI-05③ 实验面板 webview JS bundle 预算（≤ 3,145,728 字节）", () => {
  it("esbuild 构建 webview/lab/main.tsx（同参 minify）：JS 字节合计 ≤ 预算", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(root, "webview/lab/main.tsx")],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2020",
      jsx: "automatic",
      minify: true,
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      sourcemap: true,
      write: false,
      outdir: "out",
      logLevel: "silent",
    });
    const jsOutputs = result.outputFiles.filter((f) => f.path.endsWith(".js"));
    const cssOutputs = result.outputFiles.filter((f) => f.path.endsWith(".css"));
    expect(jsOutputs.length).toBeGreaterThanOrEqual(1);
    expect(cssOutputs.length).toBe(1); // theme.css + lab.css 产出存在（CSS 不计入 JS 预算）
    const totalJs = jsOutputs.reduce((sum, f) => sum + f.contents.byteLength, 0);
    expect(totalJs, `lab webview JS ${totalJs} 字节 > 预算 ${LAB_JS_BUDGET_BYTES}`).toBeLessThanOrEqual(LAB_JS_BUDGET_BYTES);
  });
});

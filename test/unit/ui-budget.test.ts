// TASK-009 §10.14 D8 单测：bundle 预算门禁四项之三（FR-AUI-05③ v0.7 口径，D7）。
// 回归重定向：lab-budget.test.ts → 本文件（预算口径 3 MiB → 4 MiB = 默认面板全链；断言扩容）。
// ① 默认面板 media/chat.js（入口+全部 chunk，不含 css/map）≤ 4,194,304 字节；
// ② 宿主 bundle 增量 ≤ 1 MiB（基线 = v0.1.7 构建产物 dist/extension.js 实测 459,382 字节）；
// ③ 经典面板 media/main.js 依赖图不含 react/react-dom/@assistant-ui（回退保证，冻结入口）。
// 构建 = esbuild JS API 同参构建，与 esbuild.mjs 各入口一致。

import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CHAT_JS_BUDGET_BYTES = 4 * 1024 * 1024; // 4 MiB = 4,194,304（FR-AUI-05③ v0.7 定值）
const HOST_BASELINE_BYTES = 459_382; // v0.1.7 dist/extension.js 实测（FR-AUI-05③ 基线）
const HOST_INCREMENT_BUDGET_BYTES = 1 * 1024 * 1024; // 1 MiB

describe("FR-AUI-05③ 预算门禁（v0.7 默认面板口径）", () => {
  it("① 默认面板 webview/ui/main.tsx（同参 minify）：JS 字节合计 ≤ 4,194,304", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(root, "webview/ui/main.tsx")],
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
    expect(cssOutputs.length).toBe(1); // theme.css + chat.css 产出存在（CSS 不计入 JS 预算）
    const totalJs = jsOutputs.reduce((sum, f) => sum + f.contents.byteLength, 0);
    expect(totalJs, `chat webview JS ${totalJs} 字节 > 预算 ${CHAT_JS_BUDGET_BYTES}`).toBeLessThanOrEqual(CHAT_JS_BUDGET_BYTES);
  });

  it("② 宿主 bundle 增量 ≤ 1 MiB（vs v0.1.7 基线 459,382 字节）", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(root, "src/extension.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: ["vscode", "@earendil-works/pi-coding-agent"],
      sourcemap: true,
      write: false,
      outdir: "out",
      logLevel: "silent",
    });
    const jsOutputs = result.outputFiles.filter((f) => f.path.endsWith(".js"));
    expect(jsOutputs.length).toBeGreaterThanOrEqual(1);
    const totalJs = jsOutputs.reduce((sum, f) => sum + f.contents.byteLength, 0);
    const limit = HOST_BASELINE_BYTES + HOST_INCREMENT_BUDGET_BYTES;
    expect(totalJs, `宿主 bundle ${totalJs} 字节 > 基线+增量 ${limit}`).toBeLessThanOrEqual(limit);
  });

  it("③ 经典面板 metafile inputs 零 react/react-dom/@assistant-ui 命中（FR-AUI-05③ 回退保证）", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(root, "webview/main.ts")],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2020",
      write: false,
      outdir: "out",
      metafile: true,
      logLevel: "silent",
    });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.length).toBeGreaterThan(0);
    const forbidden = inputs.filter((name) => /(^|\/)react(-dom)?(\/|$)/.test(name) || name.includes("@assistant-ui/"));
    expect(forbidden).toEqual([]);
  });
});

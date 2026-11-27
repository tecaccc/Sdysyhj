// bundle 预算门禁（原 TASK-009 §10.14 D8 单测；TASK-011 批次 A 项同步）。
// 2026-11-27 人类还原指令后：原①（默认面板 media/chat.js ≤ 4 MiB）随 React 新 UI 入口整体
// 拆除删除；保留两项仍生效的门禁：
//   ② 宿主 bundle ≤ 基线 + 1 MiB（基线 = v0.1.7 构建产物 dist/extension.js 实测 459,382 字节）；
//   ③ 经典面板 media/main.js 依赖图不含 react/react-dom/@assistant-ui——A 项后为唯一 webview
//      入口，本断言 = 自研实现零框架运行时的回归守护（防 React 链回流经典 bundle）。
// 构建 = esbuild JS API 同参构建，与 esbuild.mjs 各入口一致。

import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const HOST_BASELINE_BYTES = 459_382; // v0.1.7 dist/extension.js 实测
const HOST_INCREMENT_BUDGET_BYTES = 1 * 1024 * 1024; // 1 MiB

describe("bundle 预算门禁（还原后双入口口径）", () => {
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

  it("③ 经典面板 metafile inputs 零 react/react-dom/@assistant-ui 命中（唯一 webview 入口的零框架守护）", async () => {
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

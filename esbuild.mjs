// esbuild 打包：宿主（dist/extension.js，cjs，external vscode + pi 运行时包）
// 与 webview（media/main.js，iife，含 marked/dompurify/highlight.js；CSS 同名输出 media/main.css）。
// TASK-009 阶段①新增第三入口：实验面板 webview（media/lab.js + lab.css，React + assistant-ui，
// jsx automatic + NODE_ENV define + minify——预算必要手段；官方指南「Bundle both sides」）。
// 既有两项入口配置冻结不变（docs/technical-design.md §10.13 D1 零变更断言面）。

import { build, context } from "esbuild";
import { mkdirSync } from "fs";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });
mkdirSync("media", { recursive: true });

const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // vscode 由宿主提供；pi 运行时包只作 spawn 目标与路径解析，不打入 bundle
  external: ["vscode", "@earendil-works/pi-coding-agent"],
  outfile: "dist/extension.js",
  sourcemap: true,
  logLevel: "info",
};

const webviewOptions = {
  entryPoints: ["webview/main.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: "media/main.js",
  sourcemap: true,
  logLevel: "info",
};

// 实验面板 webview（TASK-009 阶段①，FR-AUI-01②：默认面板入口配置零改动，此为新增项）
const labWebviewOptions = {
  entryPoints: ["webview/lab/main.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  outfile: "media/lab.js",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const a = await context(extensionOptions);
  const b = await context(webviewOptions);
  const c = await context(labWebviewOptions);
  await a.watch();
  await b.watch();
  await c.watch();
  console.log("watching…");
} else {
  await build(extensionOptions);
  await build(webviewOptions);
  await build(labWebviewOptions);
}

// esbuild 打包：宿主（dist/extension.js，cjs，external vscode + pi 运行时包）
// 与 webview（media/main.js，iife，含 marked/dompurify/highlight.js；CSS 同名输出 media/main.css）。

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

if (watch) {
  const a = await context(extensionOptions);
  const b = await context(webviewOptions);
  await a.watch();
  await b.watch();
  console.log("watching…");
} else {
  await build(extensionOptions);
  await build(webviewOptions);
}

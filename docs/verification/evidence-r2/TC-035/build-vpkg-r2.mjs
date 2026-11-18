// r2-build-vpkg.mjs —— 构造 vsix 安装布局 /tmp/r2-vpkg（仅 /tmp，只读被测检出）：
//   /tmp/r2-vpkg/dist/extension.js                                  ← 扩展 CJS bundle（esbuild，external vscode）
//   /tmp/r2-vpkg/node_modules/vscode/index.js                       ← vscode API stub
//   /tmp/r2-vpkg/node_modules/@earendil-works/pi-coding-agent/...   ← 内置运行时包（自检出 node_modules 原样复制）
// 与 .vscodeignore 打包清单一致（dist + node_modules）。
import { build } from "/tmp/sdysyhj-verify-r2/node_modules/esbuild/lib/main.js";
import fs from "fs";
import path from "path";

const SRC = "/tmp/sdysyhj-verify-r2";
const LAY = "/tmp/r2-vpkg";
fs.rmSync(LAY, { recursive: true, force: true });
fs.mkdirSync(path.join(LAY, "dist"), { recursive: true });
fs.mkdirSync(path.join(LAY, "node_modules", "vscode"), { recursive: true });

await build({
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  loader: { ".css": "empty" },
  logLevel: "warning",
  entryPoints: [`${SRC}/src/extension.ts`],
  outfile: `${LAY}/dist/extension.js`,
});

fs.copyFileSync("/tmp/r2harness/node_modules/vscode/index.js", path.join(LAY, "node_modules", "vscode", "index.js"));

// 复制真实内置运行时包（含 dist/bundle/cli.js）
const pkgSrc = path.join(SRC, "node_modules", "@earendil-works", "pi-coding-agent");
const pkgDst = path.join(LAY, "node_modules", "@earendil-works", "pi-coding-agent");
fs.cpSync(pkgSrc, pkgDst, { recursive: true });

const cli = path.join(pkgDst, "dist", "bundle", "cli.js");
console.log("vpkg layout built:", LAY);
console.log("extension.js exists =", fs.existsSync(path.join(LAY, "dist", "extension.js")));
console.log("bundled cli.js exists =", fs.existsSync(cli), cli);

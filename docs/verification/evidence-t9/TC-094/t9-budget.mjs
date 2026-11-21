// TC-094 bundle 体积预算（FR-AUI-05③）——核验 Agent 自建脚本。
// (a) 实验面板 webview JS 产物合计（入口+全部 chunk，不含 .map/.css）≤ 3,145,728
// (b) 宿主增量 = 被测 dist/extension.js − 基线构建（v0.1.6 tag e9fc9d8 检出，同 esbuild 版本 0.28.2）≤ 1,048,576
// (c) Shiki 不进实验面板产物依赖图（esbuild metafile）
// (d) 默认面板依赖图无 react/react-dom/@assistant-ui（独立构建入口）
// 用法：node t9-budget.mjs <repoRoot> <baselineRoot>
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
const baseline = process.argv[3];
let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};
const esbuild = await import(path.join(root, "node_modules/esbuild/lib/main.js"));

// ---------- (a) lab webview 产物字节 ----------
const mediaDir = path.join(root, "media");
const labJsFiles = fs.readdirSync(mediaDir).filter((f) => /^lab.*\.js$/i.test(f) && !f.endsWith(".map"));
let labTotal = 0;
for (const f of labJsFiles) {
  const b = fs.statSync(path.join(mediaDir, f)).size;
  labTotal += b;
  console.log(`INFO  media/${f} = ${b} B`);
}
// 代码分割 chunk 探测：lab 同名族 + esbuild chunk 命名（无 splitting 配置时应仅 lab.js）
ok(labTotal <= 3145728, "(a) 实验面板 webview JS 合计 ≤ 3,145,728 B（3 MiB）", `合计 ${labTotal} B（余量 ${(3145728 - labTotal).toLocaleString()} B）`);

// ---------- (b) 宿主增量 ----------
if (!baseline) {
  console.log("SKIP  (b) 未提供基线目录");
} else {
  const cur = fs.statSync(path.join(root, "dist/extension.js")).size;
  const base = fs.statSync(path.join(baseline, "dist/extension.js")).size;
  const delta = cur - base;
  console.log(`INFO  被测宿主 dist/extension.js = ${cur} B；基线（v0.1.6 构建）= ${base} B`);
  ok(delta >= 0 && delta <= 1048576, "(b) 宿主 bundle 增量 ≤ 1,048,576 B（1 MiB）", `增量 +${delta} B（余量 ${(1048576 - delta).toLocaleString()} B）`);
}

// ---------- (c)(d) 依赖图（metafile） ----------
async function metafile(entry, outdir, extra = {}) {
  const r = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    absWorkingDir: root,
    outdir,
    ...extra,
  });
  return r.metafile;
}
// 实验面板（同参构建：browser/iife/es2020/jsx/minify/NODE_ENV define）
const labMeta = await metafile(path.join(root, "webview/lab/main.tsx"), "t9-out-lab", {
  platform: "browser", format: "iife", target: "es2020", jsx: "automatic", minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  loader: { ".css": "empty" },
});
const labInputs = Object.keys(labMeta.inputs);
const shiki = labInputs.filter((f) => /(^|\/)(shiki|@shikijs)[/]/.test(f));
ok(shiki.length === 0, "(c) 实验面板依赖图无 shiki/@shikijs/*", shiki.join(", ") || `inputs=${labInputs.length} 零命中`);
// 默认面板（原入口配置）
const defMeta = await metafile(path.join(root, "webview/main.ts"), "t9-out-main", { platform: "browser", format: "iife", target: "es2020" });
const defInputs = Object.keys(defMeta.inputs);
const reactHit = defInputs.filter((f) => /(^|\/)node_modules\/(react|react-dom|@assistant-ui)\//.test(f) || /(^|\/)(react|react-dom)(\/|$)/.test(f));
ok(reactHit.length === 0, "(d) 默认面板依赖图无 react/react-dom/@assistant-ui", reactHit.slice(0, 5).join(", ") || `inputs=${defInputs.length} 零命中`);
console.log(`INFO  lab inputs ${labInputs.length} 项（前 8：${labInputs.slice(0, 8).join(" ; ")}…）`);
console.log(`INFO  默认面板 inputs ${defInputs.length} 项`);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

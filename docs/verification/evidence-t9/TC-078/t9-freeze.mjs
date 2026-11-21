// TC-078 默认面板零变更：冻结面结构断言 + git 归组核对（基线 = v0.1.6 tag，§3 第 12 条裁决）。
// 用法：node t9-freeze.mjs <repoRoot>
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};

// ---------- git diff 归组（v0.1.6..HEAD） ----------
const stat = git(["diff", "--stat", "v0.1.6..HEAD"]);
const nameLines = git(["diff", "--name-status", "v0.1.6..HEAD"]).trim().split("\n").filter(Boolean);
const changes = nameLines.map((l) => { const [st, ...rest] = l.split("\t"); return { status: st, file: rest[rest.length - 1] }; });
console.log(`INFO  git diff --name-status v0.1.6..HEAD 共 ${changes.length} 处`);
// 冻结组（默认面板实现/样式/渲染/宿主面板注册面）
const frozenPatterns = [
  /^src\/panel\//, /^webview\/main\.ts$/, /^webview\/render\//, /^webview\/styles\//, /^webview\/css\.d\.ts$/, /^media\/icon/,
];
const isDocs = (f) => f.startsWith("docs/") || f === ".pi-loop.json";
const groups = { frozen: [], shared: [], added: [], docs: [] };
for (const { status, file } of changes) {
  if (isDocs(file)) { groups.docs.push(`${status} ${file}`); continue; }
  if (status === "A") { groups.added.push(file); continue; }
  if (frozenPatterns.some((p) => p.test(file))) groups.frozen.push(`${status} ${file}`);
  else groups.shared.push(`${status} ${file}`);
}
console.log("INFO  归组：");
console.log("  [默认面板冻结组] " + (groups.frozen.join(" | ") || "（空）"));
console.log("  [共享文件增量组] " + groups.shared.join(" | "));
console.log("  [新增组] " + groups.added.join(" | "));
console.log("  [docs/信息组（不计侵入面）] " + groups.docs.join(" | "));
ok(groups.frozen.length === 0, "TC-078(2) 默认面板冻结文件组零改动");

// ---------- 冻结面内容级断言 ----------
// (b) esbuild.mjs 既有入口选项原样：提取宿主/默认 webview 两个 options 对象文本比对
const esbHead = git(["show", "v0.1.6:esbuild.mjs"]);
const esbNow = fs.readFileSync(path.join(root, "esbuild.mjs"), "utf8");
const grabOptions = (src, varName) => {
  const i = src.indexOf(`const ${varName} = {`);
  if (i < 0) return null;
  const start = src.indexOf("{", i);
  let depth = 0, j = start;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j + 1);
};
const extOptsSame = grabOptions(esbHead, "extensionOptions") === grabOptions(esbNow, "extensionOptions");
const wvOptsSame = grabOptions(esbHead, "webviewOptions") === grabOptions(esbNow, "webviewOptions");
ok(extOptsSame, "TC-078(1b) 宿主入口构建选项逐字原样");
ok(wvOptsSame, "TC-078(1b) 默认面板 webview 入口构建选项逐字原样");

// (c) 默认面板注册冻结值：viewType / retainContextWhenHidden / CSP meta 模板逐字比对
const chatPanelHead = git(["show", "v0.1.6:src/panel/chatPanel.ts"]);
ok(chatPanelHead === fs.readFileSync(path.join(root, "src/panel/chatPanel.ts"), "utf8"), "TC-078(1c) chatPanel.ts 相对 v0.1.6 逐字节一致（viewType/retainContextWhenHidden/CSP 模板冻结）");

// (a) 既有冻结源码文件全部逐字节一致
const frozenFiles = ["src/panel/chatPanel.ts", "src/panel/messages.ts", "webview/main.ts", ...git(["ls-tree", "-r", "--name-only", "v0.1.6"]).split("\n").filter((f) => /^webview\/(render|styles)\//.test(f))];
let byteSame = true;
for (const f of frozenFiles) {
  try {
    const a = git(["show", `v0.1.6:${f}`]);
    const b = fs.readFileSync(path.join(root, f), "utf8");
    if (a !== b) { byteSame = false; console.log(`FAIL  冻结文件内容不一致: ${f}`); fails++; }
  } catch { byteSame = false; console.log(`FAIL  冻结文件缺失/不可读: ${f}`); fails++; }
}
ok(byteSame, `TC-078(1a/1c) 默认面板冻结源码 ${frozenFiles.length} 文件逐字节一致`, frozenFiles.join(", "));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

// TC-077 / TC-078(a) / TC-083(b) 结构断言 / TC-091 依赖锁定 —— 核验 Agent 自建脚本（不依赖交付套件）。
// 用法：node t9-manifest.mjs <repoRoot>
// 判定：任一断言失败 → exit 1 并打印 FAIL 行；全过 → exit 0 打印 PASS 汇总。
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ext = fs.readFileSync(path.join(root, "src/extension.ts"), "utf8");
const chatPanel = fs.readFileSync(path.join(root, "src/panel/chatPanel.ts"), "utf8");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const basePkg = JSON.parse(git(["show", "v0.1.6:package.json"]));

let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};

console.log("== TC-077 实验面板独立注册结构断言 ==");
const views = pkg.contributes.views["sdysyhj"];
ok(Array.isArray(views) && views.length >= 2, "(a) Sdysyhj 容器 ≥2 webview 视图条目", `n=${views?.length}`);
const defaultView = views?.find((v) => v.id === "sdysyhj.chatView");
const labView = views?.find((v) => v.id === "sdysyhj.chatLabView");
ok(!!defaultView && !!labView && labView.id !== defaultView.id, "(a) 实验 viewType ≠ 默认 viewType", `${defaultView?.id} / ${labView?.id}`);
ok(views.indexOf(defaultView) === 0 && views.indexOf(labView) === 1, "(a) 默认面板首位、实验条目其后（不替换不抢占静态面）");
ok(typeof labView?.name === "string" && labView.name.includes("实验"), "(b) 实验面板 name 含「实验」", labView?.name);
const openLab = pkg.contributes.commands.find((c) => c.command === "sdysyhj.openChatLab");
ok(!!openLab, "(c) 打开实验面板贡献命令已注册", openLab?.command);
const baseCmds = basePkg.contributes.commands;
const sameCmds = baseCmds.every((b) => {
  const cur = pkg.contributes.commands.find((c) => c.command === b.command);
  return cur && cur.title === b.title && cur.category === b.category && (cur.icon ?? null) === (b.icon ?? null);
});
ok(sameCmds, "(c) 既有命令逐项 id/title/category/icon 不变（新增允许追加）", `base=${baseCmds.length} cur=${pkg.contributes.commands.length}`);
const labReg = /registerWebviewViewProvider\s*\(\s*(?:LabViewProvider\.viewType|["']sdysyhj\.chatLabView["'])[\s\S]{0,400}?retainContextWhenHidden:\s*true/s;
ok(labReg.test(ext), "(d) 实验面板注册 options 显式 retainContextWhenHidden: true（注册点文本）");
const defReg = /registerWebviewViewProvider\s*\(\s*["'\w.]*["'\s]*["']sdysyhj\.chatView["'][\s\S]{0,400}?retainContextWhenHidden:\s*true/s;
const defRegPanel = /registerWebviewViewProvider[\s\S]{0,200}?ChatPanel\.viewType[\s\S]{0,400}?retainContextWhenHidden:\s*true/s;
ok(defReg.test(ext) || defRegPanel.test(chatPanel), "    默认面板注册 retainContextWhenHidden: true（同值基线，注册点 = chatPanel.ts）");
ok(pkg.activationEvents.includes("onView:sdysyhj.chatLabView"), "(e) activationEvents 含实验面板惰性激活项");
ok(pkg.activationEvents.includes("onView:sdysyhj.chatView"), "    activationEvents 仍含默认视图惰性激活项");

console.log("== TC-078(a) package.json 冻结面 ==");
ok(defaultView && JSON.stringify(defaultView) === JSON.stringify(basePkg.contributes.views["sdysyhj"][0]), "(a1) 默认视图条目原样（id/name/容器归属）");
ok(JSON.stringify(pkg.contributes.viewsContainers) === JSON.stringify(basePkg.contributes.viewsContainers), "(a1) viewsContainer 原样");
ok(pkg.main === basePkg.main, "(a3) 宿主入口 main 不变", pkg.main);

console.log("== TC-083(b) 双切片共存结构前提 ==");
const labViews = views.filter((v) => v.id !== "sdysyhj.chatView" && /lab/i.test(v.id));
ok(labViews.length === 1, "实验类视图条目恰 1 个", `n=${labViews.length}`);
const labCmds = pkg.contributes.commands.filter((c) => /chatlab/i.test(c.command));
ok(labCmds.length === 1, "打开实验面板命令恰 1 条", `n=${labCmds.length}`);
const esb = fs.readFileSync(path.join(root, "esbuild.mjs"), "utf8");
const labEntries = (esb.match(/entryPoints:\s*\["webview\/lab\/main\.tsx"\]/g) ?? []).length;
ok(labEntries === 1, "构建配置实验 webview 入口唯一", `n=${labEntries}`);

console.log("== TC-091 依赖精确版本锁定（零前缀） ==");
const frozen = {
  dependencies: { "@assistant-ui/vscode": "0.0.1", "@assistant-ui/react": "0.15.37", "@assistant-ui/ai-sdk": "0.0.19", ai: "7.0.153", react: "19.3.1", "react-dom": "19.3.1", zod: "4.6.7" },
  devDependencies: { "@types/react": "19.3.0", "@types/react-dom": "19.3.0" },
};
for (const [sec, list] of Object.entries(frozen)) {
  for (const [name, ver] of Object.entries(list)) {
    ok(pkg[sec]?.[name] === ver, `D6 清单 ${sec}:${name} = ${ver}`, `实际 ${pkg[sec]?.[name]}`);
  }
}
const exact = /^\d+\.\d+\.\d+$/;
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const prefixed = Object.entries(allDeps).filter(([, v]) => !exact.test(v));
ok(prefixed.length === 0, "FR 口径扫描：全部依赖零 ^/~/>= 前缀", prefixed.map(([n, v]) => `${n}@${v}`).join(", ") || "零命中");
// 新增依赖差集（相对 v0.1.6）内 react/@assistant-ui 精确（已含于上面全量零前缀）
const added = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])]
  .filter((n) => !(n in (basePkg.dependencies ?? {})) && !(n in (basePkg.devDependencies ?? {})));
console.log(`INFO  基线差集新增依赖 = ${added.join(", ")}`);
ok(added.every((n) => exact.test(allDeps[n])), "清单外新增依赖亦不得带范围前缀");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

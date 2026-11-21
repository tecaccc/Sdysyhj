// TC-092 CSP 指令集断言（FR-AUI-05②）——核验 Agent 自建脚本。
// 载体：以 stub webview（{cspSource, asWebviewUri} 形状）真实调用官方 renderWebviewHtml，
// 以「与交付注册点同参」生成 HTML（labViewProvider.ts 传参：scripts/styles/title/surface/scriptType=classic），
// 解析 <meta http-equiv="Content-Security-Policy"> 断言 (a) 指令集 = 官方 strict 模板逐指令、
// (b) 与默认面板 CSP 差异登记核对、(d) jitless 前置产物顺序。
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
// 官方库 exports：./host → dist/host.js（node ESM）——以绝对路径直接加载
const { renderWebviewHtml } = await import(path.join(root, "node_modules/@assistant-ui/vscode/dist/host.js"));

let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};

const CSP_SOURCE = "https://vscode-webview.test.csp";
const stubWebview = {
  cspSource: CSP_SOURCE,
  asWebviewUri: (u) => ({ toString: () => `vscode-webview-resource.test/resource${u.path ? "/" + String(u.path).replace(/^\//, "") : ""}` }),
};
// 与 src/lab/labViewProvider.ts 同参（除 URI 形状用字符串简写——判定面为 CSP 文本与脚本标签）
const html = renderWebviewHtml(stubWebview, {
  scripts: [{ toString: () => "vscode-webview-resource.test/lab.js" }],
  styles: [{ toString: () => "vscode-webview-resource.test/lab.css" }],
  title: "聊天（实验）",
  lang: "zh-CN",
  surface: "sidebar",
  scriptType: "classic",
});
const meta = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/)?.[0];
ok(!!meta, "产物含 CSP meta");
const cspContent = meta?.match(/content="([^"]*)"/)?.[1] ?? "";
const cspText = cspContent.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
console.log("INFO  CSP 全文：\n      " + cspText);

// 指令解析
const directives = new Map();
for (const d of cspText.split(";").map((s) => s.trim()).filter(Boolean)) {
  const [name, ...values] = d.split(/\s+/);
  directives.set(name, values);
}
console.log("INFO  指令集：" + [...directives.entries()].map(([k, v]) => `${k}=[${v.join(" ")}]`).join(" | "));

console.log("== (a) 官方 strict 模板逐指令 ==");
const nonce = directives.get("script-src")?.[0]?.match(/^'nonce-(.+)'$/)?.[1] ?? "";
ok(nonce.length > 0, "script-src 首值 = 'nonce-…'（仅 nonce）", nonce ? `nonce 长度 ${nonce.length}` : "未取到");
ok(!cspText.includes("'unsafe-eval'"), "无 'unsafe-eval'");
ok(!cspText.includes("'unsafe-inline'"), "无 'unsafe-inline'");
ok((directives.get("default-src") ?? []).join(" ") === "'none'", "default-src 'none'");
ok((directives.get("style-src") ?? []).join(" ") === `${CSP_SOURCE} 'nonce-${nonce}'`, "style-src = cspSource + nonce");
ok((directives.get("img-src") ?? []).join(" ") === `${CSP_SOURCE} blob: data:`, "img-src = cspSource + blob: + data:");
ok((directives.get("media-src") ?? []).join(" ") === `${CSP_SOURCE} blob: data:`, "media-src = cspSource + blob: + data:");
ok((directives.get("font-src") ?? []).join(" ") === `${CSP_SOURCE} data:`, "font-src = cspSource + data:");
ok((directives.get("connect-src") ?? []).join(" ") === CSP_SOURCE, "connect-src = cspSource（fetch 隧道走 postMessage 不新增来源）");
ok((directives.get("frame-src") ?? []).join(" ") === "'none'", "frame-src 'none'");
ok(directives.size === 8, "指令面恰 8 项（无模板外指令）", `n=${directives.size}：${[...directives.keys()].join(",")}`);

console.log("== (b) 与默认面板 CSP 差异逐一登记核对（设计 D5 清单） ==");
const chatPanel = fs.readFileSync(path.join(root, "src/panel/chatPanel.ts"), "utf8");
const defCsp = chatPanel.match(/default-src 'none';[^"'`]*script-src 'nonce-[^']*'[^"'`]*style-src [^'"`]*'unsafe-inline'[^"'`]*/s)?.[0]
  ?? chatPanel.match(/<meta[^>]*Content-Security-Policy[^>]*>/s)?.[0]
  ?? (chatPanel.match(/http-equiv=\\?"Content-Security-Policy\\?"[^>]*/)?.[0] ?? "");
console.log("INFO  默认面板 CSP 模板（chatPanel.ts 摘录）：" + (defCsp.slice(0, 220) || "（正则未命中，见下方全文）"));
const panelCspLine = chatPanel.split("\n").find((l) => l.includes("default-src 'none'")) ?? "";
console.log("INFO  默认面板 CSP 行：" + panelCspLine.trim().slice(0, 240));
const hasUnsafeInlineStyle = panelCspLine.includes("'unsafe-inline'");
ok(hasUnsafeInlineStyle, "登记①：默认面板 style-src 含 'unsafe-inline' → 实验面板改 nonce（收紧）");
ok(panelCspLine.includes("img-src") && panelCspLine.includes("https:"), "登记②：默认面板 img-src 含 https: → 实验面板去除（收紧）");
ok(!panelCspLine.includes("frame-src") && directives.has("frame-src"), "登记③：默认面板无显式 frame-src/media-src/font-src/connect-src → 实验面板显式收紧补齐");
ok(!cspText.includes("'unsafe-inline'"), "产物非 relaxed 回退（style-src 含 unsafe-inline 须报告登记——未观察到）");

console.log("== (d) zod jitless 前置（产物文本顺序） ==");
const labJs = fs.readFileSync(path.join(root, "media/lab.js"), "utf8");
// config 调用锰定位：`({jitless:!0})` 调用形态（zod 库内部对 _n.jitless 的读取不属于配置调用）
const cfgMatch = labJs.match(/\(\{jitless:!0\}\)/) ?? labJs.match(/\(\{jitless: ?!0\}\)/) ?? labJs.match(/\{jitless:!0\}\)/);
ok(!!cfgMatch, "lab.js 含 config({jitless:!0}) 调用形态", cfgMatch ? `offset=${cfgMatch.index}` : "未命中");
const cfgAt = cfgMatch?.index ?? -1;
// schema 构建锰点：`.object({` 工厂调用（zod 库内部定义不含此形态——定义处为 `object=`/类定义）
let objIdx = [];
for (let i = -1; (i = labJs.indexOf(".object({", i + 1)) >= 0; ) objIdx.push(i);
const before = objIdx.filter((x) => x < cfgAt);
ok(cfgAt > 0 && before.length === 0, "jitless 配置先于任何 zod schema 构建调用 `.object({`（产物文本顺序）", `config@${cfgAt}；.object({ 共 ${objIdx.length} 处，先于 config 的 ${before.length} 处`);
const mainTsx = fs.readFileSync(path.join(root, "webview/lab/main.tsx"), "utf8");
const firstImport = mainTsx.split("\n").find((l) => l.startsWith("import"));
ok(firstImport === 'import "./zod-jitless";', "源顺序佐证：main.tsx 首个 import = ./zod-jitless", firstImport);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

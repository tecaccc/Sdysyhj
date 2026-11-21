// TC-089 主题映射审计（FR-AUI-04①②）——核验 Agent 自建静态解析层（不依赖交付审计函数）。
// 输入：@assistant-ui/vscode/src/theme.css + webview/lab/lab.css + VS Code 调色板 fixture
// （Dark/Light Modern --vscode-* 基值快照，来源 microsoft/vscode theme-defaults；键 = 点式命名）。
// 断言：(a) 采样 token 定义链非空且终点 --vscode-*；(b) 浅深两套 ≥1 组采样值不同（联动）；
//       (c) 正文/用户气泡对比度 ≥4.5:1（WCAG 相对亮度公式，浅深各测）。
import fs from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
const themeCss = fs.readFileSync(path.join(root, "node_modules/@assistant-ui/vscode/src/theme.css"), "utf8");
const labCss = fs.readFileSync(path.join(root, "webview/lab/lab.css"), "utf8");
const palette = JSON.parse(
  fs.readFileSync(path.join(root, "test/fixtures/vscode-theme-defaults-palette.json"), "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n")
);

let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};

function declarations(css) {
  const map = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (!map.has(m[1])) map.set(m[1], m[2].trim().replace(/\s+/g, " "));
  }
  return map;
}
const tokens = declarations(themeCss);
const labTokens = declarations(labCss);
const declOf = (name) => (labTokens.has(name) ? labTokens : tokens).get(name);

/** 单层 var() 调用拆解：name + fallback 原文（容忍一层嵌套括号）。 */
function parseVar(value) {
  const m = value.match(/^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (!m) return null;
  let fb = m[2];
  if (fb !== undefined) {
    fb = fb.trim();
    if (fb.startsWith("var(") && fb.endsWith(")")) fb = fb.slice(0, fb.length); // 保留原文递归
  }
  return { name: m[1], fallback: fb };
}
/** 递归解析 token → 具体色值（#hex）。--vscode-x → fixture 键 x（连字符→点式）；缺失走 fallback。 */
function resolve(token, pal, depth = 0) {
  if (depth > 16) return null;
  const v = declOf(token);
  if (v === undefined) return null;
  const pv = parseVar(v);
  if (!pv) {
    // 字面量（#hex / rgb() / 系统色 / color-mix）——仅接受可数值化的 #hex/#rgb
    const hex = v.match(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
    return hex ? v : null;
  }
  if (pv.name.startsWith("--vscode-")) {
    const key = pv.name.slice("--vscode-".length).replace(/-/g, ".");
    if (pal[key]) return pal[key];
  }
  // 非 --vscode-* 引用：继续沿声明链递归
  const nested = resolve(pv.name, pal, depth + 1);
  if (nested) return nested;
  if (pv.fallback !== undefined) {
    const fbParsed = parseVar(pv.fallback);
    if (fbParsed) {
      // fallback 本身是 var()：对 --vscode-* 查表，否则查声明表递归
      if (fbParsed.name.startsWith("--vscode-")) {
        const k = fbParsed.name.slice("--vscode-".length).replace(/-/g, ".");
        if (pal[k]) return pal[k];
        if (fbParsed.fallback !== undefined) return resolveLiteralOrVar(fbParsed.fallback, pal, depth + 1);
        return null;
      }
      return resolve(fbParsed.name, pal, depth + 1);
    }
    return resolveLiteralOrVar(pv.fallback, pal, depth + 1);
  }
  return null;
}
function resolveLiteralOrVar(text, pal, depth) {
  const pv = parseVar(text);
  if (pv) {
    if (pv.name.startsWith("--vscode-")) {
      const k = pv.name.slice("--vscode-".length).replace(/-/g, ".");
      if (pal[k]) return pal[k];
      if (pv.fallback !== undefined) return resolveLiteralOrVar(pv.fallback, pal, depth + 1);
      return null;
    }
    return resolve(pv.name, pal, depth + 1);
  }
  const hex = text.match(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
  return hex ? text : null;
}

console.log("== (a) 采样 token 定义链非空且终点 --vscode-* ==");
const samples = ["--background", "--foreground", "--primary", "--primary-foreground", "--input", "--border"];
const firstVscodeRef = (token) => {
  let cur = token, hops = 0;
  while (hops++ < 16) {
    const v = declOf(cur);
    if (v === undefined) return null;
    const pv = parseVar(v);
    if (!pv) return null;
    if (pv.name.startsWith("--vscode-")) return { token, terminalVar: pv.name, decl: v.slice(0, 100) };
    cur = pv.name;
  }
  return null;
};
for (const t of samples) {
  const definedIn = labTokens.has(t) ? "lab.css" : tokens.has(t) ? "theme.css" : null;
  ok(!!definedIn, `${t} 有定义`, definedIn ?? "未定义");
  const chain = firstVscodeRef(t);
  ok(!!chain, `${t} 主链终点为 --vscode-* 引用（外部终点语义）`, chain ? `${chain.token} → ${chain.terminalVar}` : "链断裂/字面量终点");
}

console.log("== (b) 浅/深两主题联动（调色板 fixture 代入） ==");
const darkPal = palette.darkModern, lightPal = palette.lightModern;
const resolved = {};
let diffCount = 0;
for (const t of samples) {
  const d = resolve(t, darkPal), l = resolve(t, lightPal);
  resolved[t] = { dark: d, light: l };
  if (d && l && d !== l) diffCount++;
  console.log(`INFO  ${t}: dark=${d} light=${l}`);
}
ok(samples.every((t) => resolved[t].dark && resolved[t].light), "全部采样点两主题解析出具体 hex");
ok(diffCount >= 1, `浅深两主题间 ≥1 组采样值不同（联动生效）`, `diff=${diffCount}/${samples.length}`);

console.log("== (c) WCAG 对比度 ≥4.5:1（公式脚本，浅深各测） ==");
const hexToRgb = (h) => {
  const s = h.trim().replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};
const relLum = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fgHex, bgHex) => {
  const a = hexToRgb(fgHex), b = hexToRgb(bgHex);
  if (!a || !b) return null;
  const l1 = relLum(a), l2 = relLum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
for (const [theme, pal] of [["dark", darkPal], ["light", lightPal]]) {
  const c1 = contrast(resolved["--foreground"][theme], resolved["--background"][theme]);
  ok(c1 !== null && c1 >= 4.5, `${theme}: 正文 --foreground vs --background ≥4.5:1`, `实测 ${c1?.toFixed(3)}:1（fg=${resolved["--foreground"][theme]} bg=${resolved["--background"][theme]}）`);
  const c2 = contrast(resolved["--primary-foreground"][theme], resolved["--primary"][theme]);
  ok(c2 !== null && c2 >= 4.5, `${theme}: 用户气泡 --primary-foreground vs --primary ≥4.5:1`, `实测 ${c2?.toFixed(3)}:1`);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

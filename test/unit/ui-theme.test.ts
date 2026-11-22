// TASK-009 §10.14 D8 单测：主题映射审计（FR-AUI-04 自动兜底）+ FR-CHAT-10 五子条 CSS 钉值断言（D6）。
// 回归重定向：lab-theme.test.ts → 本文件（①–⑤ 断言平移，采样面 lab.css→chat.css；无放宽）。
// 审计函数解析 `@assistant-ui/vscode/theme.css` + `webview/ui/chat.css` 文本：
//   ①采样 token 定义链非空且终点为 --vscode-* 引用（FR-AUI-04① 静态等价判据）；
//   ②以 VS Code 默认主题调色板 fixture（Dark/Light Modern 基值快照，§11 #18）代入解析 RGB：
//     浅深两套至少一组采样值不同（主题变量联动生效）；
//   ③正文/气泡 WCAG 相对亮度对比度 ≥4.5:1，浅深各测（FR-AUI-04②）。
// getComputedStyle 字面执行与真实渲染 = FR-AUI-04③ UI 手工 checklist（截图）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const themeCss = fs.readFileSync(path.join(root, "node_modules/@assistant-ui/vscode/src/theme.css"), "utf8");
const chatCss = fs.readFileSync(path.join(root, "webview/ui/chat.css"), "utf8");
const palette = JSON.parse(
  fs
    .readFileSync(path.join(root, "test/fixtures/vscode-theme-defaults-palette.json"), "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
) as {
  darkModern: Record<string, string>;
  lightModern: Record<string, string>;
};

/** CSS 自定义属性声明表（首个声明 = body 基值；surface 覆盖块不计入 sidebar 审计）。 */
function cssDeclarations(css: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of stripped.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    const [, name, value] = match;
    if (!declarations.has(name)) declarations.set(name, value.trim().replace(/\s+/g, " "));
  }
  return declarations;
}

const themeTokens = cssDeclarations(themeCss);

/** var() 引用解析（含嵌套 fallback，容忍规范化后空格）；返回首个 var() 引用。 */
function firstVarRef(value: string): { name: string; fallback: string | null } | null {
  const match = /^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([\s\S]*?))?\s*\)$/.exec(value.trim());
  if (!match) return null;
  return { name: match[1], fallback: match[2] !== undefined && match[2] !== "" ? match[2].trim() : null };
}

/** --vscode-sideBar-background → sideBar.background（CSS 变量不能含点，VS Code 将主题键点号映射为连字符；两形态均尝试）。 */
function paletteLookup(values: Record<string, string>, vscodeToken: string): string | undefined {
  const key = vscodeToken.replace(/^--vscode-/, "");
  return values[key] ?? values[key.replace(/-/g, ".")];
}

/** 代入调色板解析 token 具体值：--vscode-* 取基值，本地 var 链下行，缺省走 fallback，尽头为字面值。 */
function resolveValueString(value: string, values: Record<string, string>, seen: Set<string>): string | null {
  const ref = firstVarRef(value);
  if (!ref) return value; // 字面值（hex 等）
  if (ref.name.startsWith("--vscode-")) {
    const hit = paletteLookup(values, ref.name);
    if (hit) return hit;
    return ref.fallback !== null ? resolveValueString(ref.fallback, values, seen) : null;
  }
  const viaRef = resolveToken(ref.name, values, seen);
  if (viaRef !== null) return viaRef;
  return ref.fallback !== null ? resolveValueString(ref.fallback, values, seen) : null;
}

function resolveToken(name: string, values: Record<string, string>, seen = new Set<string>()): string | null {
  const declaration = themeTokens.get(name);
  if (declaration === undefined) return null;
  if (seen.has(name)) return null;
  seen.add(name);
  return resolveValueString(declaration, values, seen);
}

/** token 定义链的终点是否为 --vscode-* 引用（静态联动判据）。 */
function terminalIsVscodeRef(name: string): boolean {
  let current = name;
  const seen = new Set<string>();
  for (;;) {
    const declaration = themeTokens.get(current);
    if (declaration === undefined) return false;
    const ref = firstVarRef(declaration);
    if (!ref) return false;
    if (ref.name.startsWith("--vscode-")) return true;
    if (seen.has(ref.name)) return false;
    seen.add(ref.name);
    current = ref.name;
  }
}

/** #RRGGBB → WCAG 相对亮度。 */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) throw new Error(`非 6 位 hex：${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(normalized.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度（两色较亮者 +0.05 为分子）。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SAMPLED_TOKENS = ["--background", "--foreground", "--primary", "--primary-foreground", "--input", "--border"] as const;

describe("FR-AUI-04① 主题 token 静态审计（采样点对齐：正文/气泡/输入框背景边框）", () => {
  it("① 六个采样 token 定义链非空且终点为 --vscode-* 引用（theme.css 联动生效）", () => {
    for (const token of SAMPLED_TOKENS) {
      expect(themeTokens.has(token), `theme.css 缺采样 token ${token}`).toBe(true);
      expect(terminalIsVscodeRef(token), `${token} 终点非 --vscode-* 引用`).toBe(true);
    }
  });

  it("② chat.css 外壳实际消费全部采样 token（采样点与外壳样式对齐）", () => {
    for (const token of SAMPLED_TOKENS) {
      expect(chatCss.includes(`var(${token})`), `chat.css 未消费 ${token}`).toBe(true);
    }
  });

  it("③ 调色板代入：浅深两主题解析出具体 hex，且至少一组采样值不同（联动差异）", () => {
    const dark = Object.fromEntries(SAMPLED_TOKENS.map((t) => [t, resolveToken(t, palette.darkModern)]));
    const light = Object.fromEntries(SAMPLED_TOKENS.map((t) => [t, resolveToken(t, palette.lightModern)]));
    for (const token of SAMPLED_TOKENS) {
      expect(dark[token], `Dark Modern 下 ${token} 解析失败`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(light[token], `Light Modern 下 ${token} 解析失败`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    const differing = SAMPLED_TOKENS.filter((t) => dark[t] !== light[t]);
    expect(differing.length).toBeGreaterThanOrEqual(1);
  });

  it("④ 正文文本对比度 ≥4.5:1（--foreground vs --background，浅深各测）", () => {
    for (const [name, values] of [["Dark Modern", palette.darkModern], ["Light Modern", palette.lightModern]] as const) {
      const fg = resolveToken("--foreground", values);
      const bg = resolveToken("--background", values);
      expect(fg).toMatch(/^#/);
      expect(bg).toMatch(/^#/);
      const ratio = contrastRatio(fg!, bg!);
      expect(ratio, `${name} 正文对比度 ${ratio} < 4.5`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("⑤ 用户气泡文本对比度 ≥4.5:1（--primary-foreground vs --primary，浅深各测）", () => {
    for (const [name, values] of [["Dark Modern", palette.darkModern], ["Light Modern", palette.lightModern]] as const) {
      const fg = resolveToken("--primary-foreground", values);
      const bg = resolveToken("--primary", values);
      const ratio = contrastRatio(fg!, bg!);
      expect(ratio, `${name} 气泡对比度 ${ratio} < 4.5`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("FR-CHAT-10 五子条 CSS 钉值断言（D6/#19(a) 全维持口径）", () => {
  /** 取选择器块的声明体（简易解析：首个 { 后至 } 前）。 */
  const blockOf = (selector: string): string => {
    const index = chatCss.indexOf(`${selector} {`);
    expect(index, `chat.css 缺 ${selector}`).toBeGreaterThanOrEqual(0);
    return chatCss.slice(index, chatCss.indexOf("}", index));
  };

  it("① 内容列：max-width: 960px 且左右外边距 auto（.content-col）", () => {
    const block = blockOf(".content-col");
    expect(block).toContain("max-width: 960px");
    expect(block).toContain("margin-left: auto");
    expect(block).toContain("margin-right: auto");
  });

  it("② 输入框容器圆角 8px（.composer-shell）", () => {
    expect(blockOf(".composer-shell")).toContain("border-radius: 8px");
  });

  it("④⑤ 布局钉值：用户气泡（.message-user .message-body 背景+圆角）/ 助手无气泡 / .message-time 存在", () => {
    const userBody = blockOf(".message-user .message-body");
    expect(userBody).toContain("background: var(--primary)");
    expect(userBody).toContain("border-radius: 8px");
    const assistantBody = blockOf(".message-assistant .message-body");
    expect(assistantBody).not.toContain("background:");
    expect(assistantBody).not.toContain("border:");
    expect(chatCss).toContain(".message-time");
    expect(chatCss).toContain("justify-content: flex-end"); // 用户右对齐
    expect(chatCss).not.toContain("avatar"); // 禁 avatar（#19(a)④⑤）
  });
});

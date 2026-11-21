// TC-060 展示口径纯函数独立驱动（formatHHmm / formatContextUsage）+ TC-054(c) HH:mm 边界
// 百分比判据 = 用例基线 TC-060 章节引言解析口径（整数/千分位精确相等 或 k 缩写相对误差≤1%；% 前整数 = half-up）。
import { createRequire } from "node:module";
const { formatHHmm, formatContextUsage } = createRequire(import.meta.url)("./format-bundle.cjs");

const results = [];
let failed = 0;
function check(id, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failed += 1;
}

// ---------- formatHHmm（TC-054⑤ 正则与 24 小时制） ----------
{
  const cases = [
    [new Date(2026, 10, 21, 0, 5).getTime(), "00:05"],   // 补零
    [new Date(2026, 10, 21, 9, 0).getTime(), "09:00"],
    [new Date(2026, 10, 21, 23, 59).getTime(), "23:59"], // 24 小时制上界
    [new Date(2026, 10, 21, 12, 34).getTime(), "12:34"],
  ];
  for (const [ts, want] of cases) {
    const got = formatHHmm(ts);
    check(`formatHHmm(${want})`, got === want && /^\d{2}:\d{2}$/.test(got), `→ ${got}`);
  }
}

// ---------- formatContextUsage（TC-060 展示文本口径） ----------
// (a) 12345 / 200000 → 6%（6.1725 → 6）
// (b) 45600 / 200000 → 23%（22.8 → 23）
// (c) 15000 / 200000 → 8%（7.5 half-up → 8，取整边界）
// (d) null → "—"
function parseUsageLine(text) {
  if (text.trim() === "—") return { token: null, percent: null };
  const m = text.match(/^(.*?)\s*\/\s*(.*?)\s*\((\d+)%\)$/);
  if (!m) return { token: null, percent: null, raw: text };
  return { token: m[1].trim(), window: m[2].trim(), percent: Number(m[3]) };
}
function tokenValue(tok) {
  // 解析口径：整数/千分位精确；k 缩写相对误差 ≤1%
  if (/^\d{1,3}(,\d{3})*$/.test(tok)) return { v: Number(tok.replace(/,/g, "")), mode: "exact" };
  if (/^\d+(\.\d+)?$/.test(tok)) return { v: Number(tok), mode: "exact" };
  const k = tok.match(/^(\d+(?:\.\d+)?)k$/i);
  if (k) return { v: parseFloat(k[1]) * 1000, mode: "k-abbrev" };
  const M = tok.match(/^(\d+(?:\.\d+)?)M$/);
  if (M) return { v: parseFloat(M[1]) * 1_000_000, mode: "M-abbrev" };
  return { v: NaN, mode: "unparsed" };
}
function halfUp(n) { return Math.floor(n + 0.5); }

const usageCases = [
  ["TC-060(a) 12345/200000", 12345, 200000, 12345, 6],
  ["TC-060(b) 45600/200000", 45600, 200000, 45600, 23],
  ["TC-060(c) 15000/200000（7.5→8 半向上取整边界）", 15000, 200000, 15000, 8],
];
for (const [label, tokens, win, wantTokens, wantPct] of usageCases) {
  const text = formatContextUsage(tokens, win);
  const parsed = parseUsageLine(text);
  const tv = tokenValue(parsed.token ?? "");
  const okToken = parsed.percent !== null && (
    (tv.mode === "exact" && tv.v === wantTokens) ||
    (tv.mode === "k-abbrev" && Math.abs(tv.v - wantTokens) / wantTokens <= 0.01));
  const okPct = parsed.percent === wantPct && wantPct === halfUp((wantTokens / win) * 100);
  check(label, okToken && okPct, `文本=${JSON.stringify(text)} → token=${parsed.token}（${tv.mode}, 值=${tv.v}），percent=${parsed.percent}（halfUp(${(wantTokens / win) * 100})=${wantPct}）`);
}

// (d) 无助手消息 → "—"（无 token 数值与百分比数字）
{
  const text = formatContextUsage(null, 200000);
  check("TC-060(d) totalTokens=null → '—' 占位", text === "—" && !/\d/.test(text), `→ ${JSON.stringify(text)}`);
}
// 窗口未知 → 仅 token 数（k 缩写合法：解析口径相对误差≤1%）
{
  const text = formatContextUsage(12345, null);
  const tv = tokenValue(text);
  check("TC-060 观察：窗口未知 → 仅 token 数（无百分比）", !text.includes("%") && Math.abs(tv.v - 12345) / 12345 <= 0.01,
    `→ ${JSON.stringify(text)}（解析=${tv.v}，误差=${((Math.abs(tv.v - 12345) / 12345) * 100).toFixed(2)}%≤1%）`);
}
// 大数 M 缩写（观察项）
{
  const text = formatContextUsage(1_500_000, 2_000_000);
  check("TC-060 观察：≥1M M 缩写 + 百分比", text === "1.5M / 2M (75%)", `→ ${JSON.stringify(text)}`);
}

console.log(results.join("\n"));
console.log(`\n[summary] format assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;

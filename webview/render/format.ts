// 展示格式化纯函数（FR-CHAT-10 ⑤ 时间戳 / FR-MOD-04 上下文用量），无 DOM 依赖，可单测。

/** 时间戳 → HH:mm（24 小时制、本地时区；可断言正则 ^\d{2}:\d{2}$）。 */
export function formatHHmm(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** token 数缩写：<1k 原值；<1M k 缩写（1 位小数，去尾 0）；≥1M M 缩写。 */
function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${oneDecimal(n / 1000)}k`;
  return `${oneDecimal(n / 1_000_000)}M`;
}

function oneDecimal(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

/**
 * 上下文用量行（FR-MOD-04 ③）：无助手消息（totalTokens=null）→ "—"；
 * 有 token 数且窗口已知 → "12.3k / 200k (6%)"（百分比 = tokens ÷ window × 100，四舍五入取整）；
 * 窗口未知/非法（null 或 ≤0）→ 仅展示 token 数。
 */
export function formatContextUsage(totalTokens: number | null, contextWindow: number | null): string {
  if (totalTokens === null || typeof totalTokens !== "number") return "—";
  const tokens = formatTokenCount(totalTokens);
  if (contextWindow === null || typeof contextWindow !== "number" || contextWindow <= 0) return tokens;
  const percent = Math.round((totalTokens / contextWindow) * 100);
  return `${tokens} / ${formatTokenCount(contextWindow)} (${percent}%)`;
}

// 展示格式化纯函数单测：FR-CHAT-10 ⑤ 时间戳 HH:mm / FR-MOD-04 上下文用量行。
// 用 Date(年,月,日,时,分) 本地时间构造，断言与执行时区无关（确定性）。
// 百分比口径 = totalTokens ÷ contextWindow × 100 四舍五入取整；数值 k/M 缩写（1 位小数、去尾 0）。

import { describe, expect, it } from "vitest";
import { formatContextUsage, formatHHmm } from "../../webview/render/format";

describe("formatHHmm（FR-CHAT-10 ⑤）", () => {
  it("格式为 HH:mm（24 小时制、本地时区），可断言 ^\\d{2}:\\d{2}$", () => {
    expect(formatHHmm(new Date(2026, 10, 20, 14, 2).getTime())).toMatch(/^\d{2}:\d{2}$/);
  });

  it("个位数时/分补零", () => {
    expect(formatHHmm(new Date(2026, 0, 15, 9, 5).getTime())).toBe("09:05");
    expect(formatHHmm(new Date(2026, 0, 15, 0, 0).getTime())).toBe("00:00");
  });

  it("24 小时制（不出现 AM/PM 或 24+ 小时）", () => {
    expect(formatHHmm(new Date(2026, 0, 15, 23, 59).getTime())).toBe("23:59");
    expect(formatHHmm(new Date(2026, 0, 15, 13, 7).getTime())).toBe("13:07");
    expect(formatHHmm(new Date(2026, 0, 15, 0, 30).getTime())).toBe("00:30");
  });
});

describe("formatContextUsage（FR-MOD-04 ③）", () => {
  it("无助手消息（totalTokens=null）显示占位 —", () => {
    expect(formatContextUsage(null, 200_000)).toBe("—");
  });

  it("展示 token 数 + 占窗口百分比（四舍五入取整）：12.3k / 200k (6%)", () => {
    // 12345 / 200000 = 6.1725% → 6
    expect(formatContextUsage(12_345, 200_000)).toBe("12.3k / 200k (6%)");
  });

  it("百分比四舍五入：156k / 200k = 78%；157.6k → 79%", () => {
    expect(formatContextUsage(156_000, 200_000)).toBe("156k / 200k (78%)");
    expect(formatContextUsage(157_600, 200_000)).toBe("157.6k / 200k (79%)");
  });

  it("小数值不缩写，千位以下原样展示", () => {
    expect(formatContextUsage(150, 1_000)).toBe("150 / 1k (15%)");
    expect(formatContextUsage(0, 1_000)).toBe("0 / 1k (0%)");
    expect(formatContextUsage(999, 1_000)).toBe("999 / 1k (100%)");
  });

  it("k 缩写去尾 0：1000 → 1k；M 缩写：≥1M", () => {
    expect(formatContextUsage(1_000, 2_000)).toBe("1k / 2k (50%)");
    // 1234567 / 2000000 = 61.73% → 62
    expect(formatContextUsage(1_234_567, 2_000_000)).toBe("1.2M / 2M (62%)");
  });

  it("窗口未知（null）或非法（≤0）时仅展示 token 数", () => {
    expect(formatContextUsage(12_345, null)).toBe("12.3k");
    expect(formatContextUsage(12_345, 0)).toBe("12.3k");
  });
});

// 插件 settings 解析（仅 UI 相关项；纯函数，便于单测）。

export type PiRuntimeMode = "auto" | "path" | "bundled";
export type SendMode = "steer" | "followUp";

export interface SdysyhjConfig {
  piRuntime: PiRuntimeMode;
  piPath: string;
  /** 新建会话默认 thinking 等级：自由字符串透传给 pi（枚举以 pi 侧返回为准，不固化），空 = 继承 */
  thinkingDefault: string;
  outputTailLines: number;
  sendMode: SendMode;
}

export const DEFAULT_CONFIG: SdysyhjConfig = {
  piRuntime: "auto",
  piPath: "",
  thinkingDefault: "",
  outputTailLines: 200,
  sendMode: "steer",
};

const TAIL_MIN = 10;
const TAIL_MAX = 5000;

/**
 * 从 key→value 读取器解析配置；非法值一律回退默认（不抛异常）。
 */
export function readConfig(get: (key: string) => unknown): SdysyhjConfig {
  const piRuntimeRaw = get("piRuntime");
  const piRuntime: PiRuntimeMode =
    piRuntimeRaw === "path" || piRuntimeRaw === "bundled" ? piRuntimeRaw : "auto";

  const piPathRaw = get("piPath");
  const piPath = typeof piPathRaw === "string" ? piPathRaw.trim() : "";

  const thinkingRaw = get("thinkingDefault");
  // 透传不固化：等级枚举以 pi 侧（get_available_thinking_levels）返回为准
  const thinkingDefault = typeof thinkingRaw === "string" ? thinkingRaw.trim() : "";

  const tailRaw = get("outputTailLines");
  let outputTailLines = DEFAULT_CONFIG.outputTailLines;
  if (typeof tailRaw === "number" && Number.isFinite(tailRaw)) {
    outputTailLines = Math.min(TAIL_MAX, Math.max(TAIL_MIN, Math.round(tailRaw)));
  }

  const sendModeRaw = get("sendMode");
  const sendMode: SendMode = sendModeRaw === "followUp" ? "followUp" : "steer";

  return { piRuntime, piPath, thinkingDefault, outputTailLines, sendMode };
}

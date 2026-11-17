// 配置解析单测。

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, readConfig } from "../../src/util/config";

function fromObject(values: Record<string, unknown>): ReturnType<typeof readConfig> {
  return readConfig((key) => values[key]);
}

describe("readConfig", () => {
  it("默认值", () => {
    const config = fromObject({});
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("合法值解析", () => {
    const config = fromObject({
      piRuntime: "bundled",
      piPath: " /opt/pi ",
      thinkingDefault: "high",
      outputTailLines: 50,
      sendMode: "followUp",
    });
    expect(config.piRuntime).toBe("bundled");
    expect(config.piPath).toBe("/opt/pi");
    expect(config.thinkingDefault).toBe("high");
    expect(config.outputTailLines).toBe(50);
    expect(config.sendMode).toBe("followUp");
  });

  it("thinkingDefault 透传不固化（枚举以 pi 侧为准）", () => {
    expect(fromObject({ thinkingDefault: "ultra" }).thinkingDefault).toBe("ultra");
    expect(fromObject({ thinkingDefault: "  xhigh  " }).thinkingDefault).toBe("xhigh");
    expect(fromObject({ thinkingDefault: "" }).thinkingDefault).toBe("");
    expect(fromObject({ thinkingDefault: 42 }).thinkingDefault).toBe("");
  });

  it("非法值回退默认", () => {
    const config = fromObject({
      piRuntime: "wat",
      outputTailLines: "big",
      sendMode: "shout",
    });
    expect(config.piRuntime).toBe("auto");
    expect(config.outputTailLines).toBe(DEFAULT_CONFIG.outputTailLines);
    expect(config.sendMode).toBe("steer");
  });

  it("outputTailLines 默认 200（FR-CHAT-04），并钳制范围", () => {
    expect(DEFAULT_CONFIG.outputTailLines).toBe(200);
    expect(fromObject({}).outputTailLines).toBe(200);
    expect(fromObject({ outputTailLines: 1 }).outputTailLines).toBe(10);
    expect(fromObject({ outputTailLines: 99999 }).outputTailLines).toBe(5000);
  });
});

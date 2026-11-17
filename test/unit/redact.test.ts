// 日志脱敏单测（NFR-03）。

import { describe, expect, it } from "vitest";
import { REDACTED, redactSecrets } from "../../src/util/redact";
import { createRedactingLogger, MemoryLogger } from "../../src/util/log";

describe("redactSecrets", () => {
  it("api_key 键值对脱敏", () => {
    const out = redactSecrets('{"api_key": "sk-abc123456789"}');
    expect(out).not.toContain("sk-abc123456789");
    expect(out).toContain(REDACTED);
  });

  it("Authorization / Bearer 脱敏", () => {
    const out = redactSecrets("Authorization: Bearer abcdef123456789");
    expect(out).not.toContain("abcdef123456789");
  });

  it("sk- 前缀 token 脱敏", () => {
    const out = redactSecrets("using sk-proj-abcdefghijk now");
    expect(out).not.toContain("sk-proj-abcdefghijk");
  });

  it("JWT 脱敏", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abcdefghij12";
    const out = redactSecrets(`token ${jwt}`);
    expect(out).not.toContain(jwt);
  });

  it("普通文本不动", () => {
    const text = "pi 子进程已退出（code=3）；建议运行 pi auth 检查凭证";
    expect(redactSecrets(text)).toBe(text);
  });

  it("空串安全", () => {
    expect(redactSecrets("")).toBe("");
  });
});

describe("createRedactingLogger", () => {
  it("所有级别写入前脱敏", () => {
    const memory = new MemoryLogger();
    const logger = createRedactingLogger(memory);
    logger.info('api_key=sk-secret123456');
    logger.error("password: hunter2xxxxx");
    expect(memory.lines.join("\n")).not.toContain("sk-secret123456");
    expect(memory.lines.join("\n")).not.toContain("hunter2xxxxx");
    expect(memory.lines.length).toBe(2);
  });
});

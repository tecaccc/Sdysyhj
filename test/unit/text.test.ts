// 文本工具单测：输出截断保留尾部（FR-CHAT-04）、工具摘要。

import { describe, expect, it } from "vitest";
import { summarizeToolArgs, truncateToTail } from "../../src/util/text";

describe("truncateToTail", () => {
  it("超过行数时仅保留尾部", () => {
    const out = truncateToTail("a\nb\nc\nd\ne", 2);
    expect(out.text).toBe("d\ne");
    expect(out.truncated).toBe(true);
  });

  it("未超限不动", () => {
    const out = truncateToTail("a\nb", 5);
    expect(out.text).toBe("a\nb");
    expect(out.truncated).toBe(false);
  });

  it("空文本安全", () => {
    expect(truncateToTail("", 5)).toEqual({ text: "", truncated: false });
  });
});

describe("summarizeToolArgs", () => {
  it("bash → 命令", () => {
    expect(summarizeToolArgs("bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("文件类工具 → 路径", () => {
    expect(summarizeToolArgs("read", { path: "src/a.ts" })).toBe("src/a.ts");
    expect(summarizeToolArgs("edit", { filePath: "src/b.ts", oldString: "x" })).toContain("src/b.ts");
  });

  it("通用 → 紧凑 JSON", () => {
    expect(summarizeToolArgs("grep", { pattern: "foo" })).toContain("foo");
  });
});

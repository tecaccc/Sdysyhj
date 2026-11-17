// 严格 JSONL 帧读取单测：只按 LF 切分；U+2028/U+2029 不得当行界；CRLF 容忍；多字节跨 chunk。

import { describe, expect, it } from "vitest";
import { JsonlLineReader } from "../../src/bridge/jsonl";

function collect(): { reader: JsonlLineReader; lines: string[] } {
  const lines: string[] = [];
  const reader = new JsonlLineReader((line) => lines.push(line));
  return { reader, lines };
}

describe("JsonlLineReader", () => {
  it("按 LF 切分多行", () => {
    const { reader, lines } = collect();
    reader.push('{"a":1}\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("U+2028/U+2029 在行内不触发切分（readline 的坑）", () => {
    const { reader, lines } = collect();
    const weird = JSON.stringify({ type: "message_update", delta: "a\u2028b\u2029c" });
    reader.push(`${weird}\n{"type":"agent_settled"}\n`);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).delta).toBe("a\u2028b\u2029c");
  });

  it("容忍 CRLF 行尾（剥掉 \\r）", () => {
    const { reader, lines } = collect();
    reader.push('{"a":1}\r\n{"b":2}\r\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("跨 chunk 的行正确拼接", () => {
    const { reader, lines } = collect();
    reader.push('{"a"');
    reader.push(':1}\n');
    expect(lines).toEqual(['{"a":1}']);
  });

  it("多字节 UTF-8 字符跨 chunk 不撕裂", () => {
    const { reader, lines } = collect();
    const buf = Buffer.from('{"text":"中文测试"}\n', "utf8");
    // 从“中”字中间切断
    const cut = 9;
    reader.push(buf.subarray(0, cut));
    reader.push(buf.subarray(cut));
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).text).toBe("中文测试");
  });

  it("end() 冲刷未换行的尾部", () => {
    const { reader, lines } = collect();
    reader.push('{"tail":true}');
    reader.end();
    expect(lines).toEqual(['{"tail":true}']);
  });

  it("空行被忽略", () => {
    const { reader, lines } = collect();
    reader.push('{"a":1}\n\n\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

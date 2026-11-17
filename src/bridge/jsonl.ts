// 严格 JSONL 帧读取：只按 LF（\n）切分，禁用 Node readline
// （readline 会把 U+2028/U+2029 当行界，破坏协议帧）。
// UTF-8 解码用 StringDecoder 保证多字节字符跨 chunk 不被撕裂。

import { StringDecoder } from "string_decoder";

export class JsonlLineReader {
  private decoder = new StringDecoder("utf8");
  private buffer = "";

  constructor(private readonly onLine: (line: string) => void) {}

  /** 喂入一段字节/文本；每完整一行（LF 结尾）触发一次 onLine。 */
  push(chunk: Buffer | string): void {
    const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    this.buffer += text;
    for (;;) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1); // 容忍 CRLF 输入
      if (line.length > 0) this.onLine(line);
    }
  }

  /** 流结束：冲刷解码器与残留的未换行尾部。 */
  end(): void {
    const rest = this.decoder.end();
    if (rest) this.buffer += rest;
    if (this.buffer.length > 0) {
      let line = this.buffer;
      this.buffer = "";
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length > 0) this.onLine(line);
    }
  }
}

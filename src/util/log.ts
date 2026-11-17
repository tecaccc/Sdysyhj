// 日志接口与脱敏包装。vscode Output Channel 绑定在 extension.ts 中完成，本文件保持纯净可测。

import { redactSecrets } from "./redact";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/** 包装任意 Logger，写入前统一脱敏（NFR-03）。 */
export function createRedactingLogger(inner: Logger): Logger {
  return {
    info: (message) => inner.info(redactSecrets(message)),
    warn: (message) => inner.warn(redactSecrets(message)),
    error: (message) => inner.error(redactSecrets(message)),
    debug: (message) => inner.debug(redactSecrets(message)),
  };
}

/** 测试与降级用内存 Logger。 */
export class MemoryLogger implements Logger {
  lines: string[] = [];
  info(message: string): void {
    this.lines.push(`[info] ${message}`);
  }
  warn(message: string): void {
    this.lines.push(`[warn] ${message}`);
  }
  error(message: string): void {
    this.lines.push(`[error] ${message}`);
  }
  debug(message: string): void {
    this.lines.push(`[debug] ${message}`);
  }
}

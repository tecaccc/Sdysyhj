// 日志脱敏（NFR-03）：任何写入 Output Channel / 日志的文本都必须先经过 redactSecrets。

const SECRET_KV_PATTERN =
  /\b(api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|credential|bearer)(["']?\s*[:=]\s*["']?)([^\s"',;]+)/gi;
const BEARER_PATTERN = /\b(bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi;
const SK_PATTERN = /\b(sk-[A-Za-z0-9_-]{8,})\b/g;
const JWT_PATTERN = /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;

export const REDACTED = "[REDACTED]";

/** 将文本中的 api-key / Authorization / sk-… 等凭证模式替换为 [REDACTED]。 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(BEARER_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(SK_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(SECRET_KV_PATTERN, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);
}

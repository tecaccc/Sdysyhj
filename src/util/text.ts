// 纯文本处理工具。

/**
 * 截断大输出：仅保留尾部 maxLines 行（FR-CHAT-04）。
 * 返回保留文本与截断标记；全量文本由宿主缓存供“复制全部”。
 */
export function truncateToTail(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (maxLines <= 0) return { text: "", truncated: text.length > 0 };
  if (!text) return { text: "", truncated: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(lines.length - maxLines).join("\n"), truncated: true };
}

/** 工具入参的单行摘要（FR-CHAT-04）。 */
export function summarizeToolArgs(tool: string, args: unknown): string {
  const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  const pick = (key: string): string | undefined => {
    const v = record[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  if (tool === "bash") return pick("command") ?? compactJson(args);
  const path = pick("path") ?? pick("filePath") ?? pick("file");
  if (path) {
    const extra = pick("pattern") ?? pick("oldString") ?? pick("newString");
    return extra ? `${path} · ${firstLine(extra)}` : path;
  }
  return compactJson(args);
}

export function compactJson(value: unknown, maxLength = 120): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  text = text.replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function firstLine(text: string, maxLength = 80): string {
  const line = text.split("\n", 1)[0] ?? "";
  return line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
}

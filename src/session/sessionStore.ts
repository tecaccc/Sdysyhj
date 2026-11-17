// 会话存储读取（FR-SESS-02/07）。
// 直接读取 pi 原生 session 存储（~/.pi/agent/sessions/--<cwd>--/*.jsonl），不另建副本（NFR-03）。
// 目录命名与 pi session-manager 一致：cwd 去掉首部分隔符后 [/\\:] → '-'，外层包裹 "--…--"。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface SessionSummary {
  /** 会话 JSONL 文件绝对路径（switch_session 用） */
  path: string;
  id: string;
  /** set_session_name 持久化的显示名（最新 session_info 条目） */
  name?: string;
  /** 列表展示标题：name 优先，否则首条用户消息摘要 */
  title: string;
  createdAt: number;
  modifiedAt: number;
  /** 用户 + 助手消息数 */
  messageCount: number;
}

/** 与 pi getDefaultSessionDirPath 对齐的目录名编码。 */
export function encodeSessionDirName(cwd: string): string {
  const resolved = path.resolve(cwd);
  return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/** pi 会话根目录：$PI_CODING_AGENT_SESSION_DIR 覆盖，否则 $PI_CODING_AGENT_DIR/sessions 或 ~/.pi/agent/sessions。 */
export function defaultSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_CODING_AGENT_SESSION_DIR;
  if (override && override.trim().length > 0) return path.resolve(override);
  const agentDir = env.PI_CODING_AGENT_DIR && env.PI_CODING_AGENT_DIR.trim().length > 0
    ? path.resolve(env.PI_CODING_AGENT_DIR)
    : path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "sessions");
}

function safeReadJson(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  } catch {
    // 跳过损坏行
  }
  return null;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = block as { type?: string; text?: string };
        return b.type === "text" && typeof b.text === "string" ? b.text : "";
      })
      .filter((s) => s.length > 0)
      .join("\n");
  }
  return "";
}

function summarizeTitle(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  return collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed;
}

/**
 * 列出指定工作区（cwd）的历史会话，按修改时间倒序。
 * 标题、时间、消息数均取自 pi 原生 session 文件。
 */
export function listSessions(cwd: string, sessionsRoot?: string): SessionSummary[] {
  const root = sessionsRoot ?? defaultSessionsRoot();
  const dir = path.join(root, encodeSessionDirName(cwd));
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }

  const summaries: SessionSummary[] = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    let raw: string;
    let stat: fs.Stats;
    try {
      raw = fs.readFileSync(fullPath, "utf8");
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    let id = "";
    let createdAt = stat.mtimeMs;
    let name: string | undefined;
    let firstUserText = "";
    let messageCount = 0;
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      const entry = safeReadJson(line);
      if (!entry) continue;
      const type = entry.type;
      if (type === "session") {
        id = typeof entry.id === "string" ? entry.id : id;
        const ts = Date.parse(typeof entry.timestamp === "string" ? entry.timestamp : "");
        if (!Number.isNaN(ts)) createdAt = ts;
      } else if (type === "session_info" && typeof entry.name === "string") {
        name = entry.name; // 取最新
      } else if (type === "message") {
        const message = entry.message as { role?: string; content?: unknown } | undefined;
        if (!message) continue;
        if (message.role === "user" || message.role === "assistant") {
          messageCount += 1;
          if (message.role === "user" && firstUserText.length === 0) {
            firstUserText = summarizeTitle(contentToText(message.content));
          }
        }
      }
    }
    const fallbackTitle = firstUserText.length > 0 ? firstUserText : "(空会话)";
    summaries.push({
      path: fullPath,
      id: id || file.replace(/\.jsonl$/, ""),
      name,
      title: name && name.trim().length > 0 ? name : fallbackTitle,
      createdAt,
      modifiedAt: stat.mtimeMs,
      messageCount,
    });
  }
  summaries.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return summaries;
}

/** 最近一次会话（启动续接用）；无则 null。 */
export function mostRecentSession(cwd: string, sessionsRoot?: string): SessionSummary | null {
  const all = listSessions(cwd, sessionsRoot);
  return all.length > 0 ? all[0] : null;
}

export interface ExternalChangeOptions {
  /** 轮询间隔（毫秒），默认 5000 */
  intervalMs?: number;
  /** 检测到外部变化时回调 */
  onExternalChange: () => void;
}

/**
 * 会话外部修改检测（FR-SESS-07）：
 * 插件空闲时以 mtime/size 对比发现“会话在插件之外被修改”，提示用户刷新，不静默继续陈旧状态。
 * 内部写入（本插件的 pi 子进程）后调用 markSynced() 同步基线即可豁免。
 */
export class SessionFileWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private baseline: { mtimeMs: number; size: number } | null = null;
  private filePath: string | null = null;

  constructor(private readonly options: ExternalChangeOptions) {}

  /** 跟踪目标会话文件（切换会话时更新）。 */
  track(filePath: string | null): void {
    this.filePath = filePath;
    this.markSynced();
  }

  /** 将当前文件状态记为“已同步”（本端写入完成后调用）。 */
  markSynced(): void {
    this.baseline = this.currentStat();
  }

  /** 单次检查；返回是否检测到外部变化。 */
  check(): boolean {
    if (!this.filePath) return false;
    const now = this.currentStat();
    const before = this.baseline;
    this.baseline = now;
    if (before === null && now === null) return false;
    if (before === null || now === null) return true; // 创建/删除均视为外部变化
    return before.mtimeMs !== now.mtimeMs || before.size !== now.size;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.check()) {
        try {
          this.options.onExternalChange();
        } catch {
          // 忽略
        }
      }
    }, this.options.intervalMs ?? 5000);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private currentStat(): { mtimeMs: number; size: number } | null {
    if (!this.filePath) return null;
    try {
      const stat = fs.statSync(this.filePath);
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      return null;
    }
  }
}

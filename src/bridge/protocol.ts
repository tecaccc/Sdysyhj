// RPC 记录/事件的 TS 类型与判别（依据 pi RPC JSONL 协议；类型与 @earendil-works/pi-coding-agent 线格式对齐）。
// 说明：官方 npm 包（1.5.2）exports 未导出 RpcClient/协议类型子路径，按任务约定在此自实现等价类型层。

// ---------- 通用 ----------

export interface RpcCommandBase {
  /** 可选请求 id；响应回带同一 id */
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface RpcResponse<T = unknown> {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  data?: T;
  error?: string;
}

export function isRpcResponse(record: RpcRecord): record is RpcResponse {
  return record.type === "response";
}

// ---------- 消息与内容块 ----------

export interface TextContent {
  type: "text";
  text: string;
}
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}
export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type UserContent = string | (TextContent | ImageContent)[];
export type AssistantContent = (TextContent | ThinkingContent | ToolCallContent)[];
export type ToolResultContent = (TextContent | ImageContent)[];

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

export interface UserMessage {
  role: "user";
  content: UserContent;
  timestamp?: number;
}
export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent;
  api?: string;
  provider?: string;
  model?: string;
  usage?: Usage;
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted" | "pending";
  errorMessage?: string;
  timestamp?: number;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ToolResultContent;
  details?: unknown;
  isError?: boolean;
  timestamp?: number;
}
export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string | null;
  timestamp?: number;
}
export interface CustomMessageLike {
  role: "custom" | "custom_message" | "hookMessage";
  content?: UserContent;
  customType?: string;
  display?: boolean;
  timestamp?: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage | CustomMessageLike;

// ---------- 事件 ----------

export type AssistantMessageEvent =
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; content?: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number; content?: string }
  | { type: "toolcall_start"; contentIndex: number; id: string; toolName: string }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCallContent };

export interface ToolResultPayload {
  content: ToolResultContent;
  details?: unknown;
  truncation?: unknown;
  fullOutputPath?: string | null;
}

export type RpcEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
  | { type: "agent_settled"; aborted?: boolean }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults?: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; usage?: Usage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "bash_execution_update"; id?: string; delta: string }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args?: Record<string, unknown> }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args?: Record<string, unknown>;
      partialResult?: ToolResultPayload;
    }
  | { type: "tool_execution_end"; toolCallId: string; result?: ToolResultPayload; isError?: boolean }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  | { type: "compaction_start"; reason?: string }
  | { type: "compaction_end"; reason?: string; aborted?: boolean; willRetry?: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: string }
  | { type: "entry_appended"; entry: unknown }
  | { type: "extension_error"; extensionPath?: string; event?: string; error?: string };

/** 未识别事件（协议演进容忍）：rpcClient 以 RpcEvent 分发，由消费方 default 分支容错。 */
export interface RpcUnknownEvent {
  type: string;
  [key: string]: unknown;
}

// ---------- 状态与命令数据 ----------

export interface ModelInfo {
  id: string;
  name?: string;
  provider: string;
  api?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

/** get_commands 返回的命令项（扩展命令 / prompt 模板 / skills；名称不含前导 `/`，与 pi rpc-types RpcSlashCommand 对齐） */
export interface RpcSlashCommand {
  /** 命令名（不含前导 `/`） */
  name: string;
  /** 人类可读描述 */
  description?: string;
  /** 命令来源 */
  source?: "extension" | "prompt" | "skill";
  /** 来源元数据 */
  sourceInfo?: unknown;
}

export interface RpcSessionState {
  model?: ModelInfo | null;
  thinkingLevel?: string;
  isStreaming?: boolean;
  isCompacting?: boolean;
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  messageCount?: number;
  pendingMessageCount?: number;
}

export type RpcRecord = RpcResponse | RpcEvent;

export function parseRecord(line: string): RpcRecord | { parseError: string; line: string } {
  try {
    const value = JSON.parse(line) as unknown;
    if (typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string") {
      return value as RpcRecord;
    }
    return { parseError: "record without string `type` field", line };
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err), line };
  }
}

export function isRpcEvent(record: RpcRecord): record is RpcEvent {
  return record.type !== "response";
}

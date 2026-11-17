// 宿主 ↔ Webview 消息协议（判别联合）与共享 UI 模型。
// 宿主（PiBridge/ChatPanel）与 webview 均只依赖此文件的类型与纯函数，不含 vscode 导入。

/** 工具调用卡片的执行状态 */
export type ToolCallStatus = "running" | "success" | "error" | "aborted";

/** UI 内容块：thinking / 正文 / 工具调用卡片 */
export type UiBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "toolcall";
      /** 工具调用 id（与 toolResult 关联） */
      id: string;
      /** 工具名 */
      tool: string;
      /** 完整入参 JSON（字符串化） */
      args: string;
      /** 单行关键参数摘要 */
      summary: string;
      status: ToolCallStatus;
      /** 输出文本（已按 tailLines 截断保留尾部；全量由宿主缓存） */
      output: string;
      outputTruncated: boolean;
    };

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  blocks: UiBlock[];
  timestamp: number;
  /** 中止标记（中止后历史保留） */
  aborted?: boolean;
  errorMessage?: string;
}

/** 运行状态（FR-CHAT-08） */
export type RunState = "idle" | "starting" | "streaming" | "aborted" | "error";

/** 宿主 → Webview */
export type HostToWebview =
  | { kind: "config"; tailLines: number; sendMode: "steer" | "followUp"; workspaceLabel: string }
  | { kind: "session_reset"; sessionId: string; name: string }
  | { kind: "history_loaded"; messages: UiMessage[] }
  | { kind: "user_message"; text: string }
  | { kind: "stream_start"; messageId: string }
  | { kind: "text_delta"; messageId: string; index: number; delta: string }
  | { kind: "thinking_delta"; messageId: string; index: number; delta: string }
  | { kind: "toolcall_start"; messageId: string; index: number; id: string; tool: string; args: string; summary: string }
  | { kind: "toolcall_delta"; messageId: string; index: number; delta: string }
  | { kind: "toolcall_status"; messageId: string; toolCallId: string; status: ToolCallStatus; summary?: string; output?: string; outputTruncated?: boolean }
  | { kind: "message_final"; messageId: string; message: UiMessage }
  | { kind: "run_state"; state: RunState; detail?: string }
  | { kind: "model_info"; model: string; thinkingLevel: string; sessionName: string }
  | { kind: "session_name"; name: string }
  | { kind: "error"; message: string; hint?: string }
  | { kind: "toast"; text: string }
  | { kind: "external_change"; detail: string }
  | { kind: "file_ref"; path: string }
  | { kind: "input_prefill"; text: string };

/** Webview → 宿主 */
export type WebviewToHost =
  | { kind: "ready" }
  | { kind: "prompt"; text: string; mode: "auto" | "steer" | "followUp" }
  | { kind: "abort" }
  | { kind: "open_history" }
  | { kind: "new_session" }
  | { kind: "switch_model" }
  | { kind: "switch_thinking" }
  | { kind: "rename_session" }
  | { kind: "insert_file_ref" }
  | { kind: "open_settings" }
  | { kind: "open_external"; url: string }
  | { kind: "refresh_session" }
  | { kind: "copy_output"; toolCallId: string };

export function isHostToWebview(msg: unknown): msg is HostToWebview {
  return typeof msg === "object" && msg !== null && typeof (msg as { kind?: unknown }).kind === "string";
}

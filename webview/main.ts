// Webview 入口：消息流状态、输入区交互、宿主消息路由。

import type { HostToWebview, RunState, UiMessage, WebviewToHost } from "../src/panel/messages";
import { MessageView } from "./render/messages";
import "./styles/styles.css";
import "highlight.js/styles/github.css";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ---------- DOM 引用 ----------

const messagesEl = document.getElementById("messages") as HTMLElement;
const errorsEl = document.getElementById("errors") as HTMLElement;
const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("btn-send") as HTMLButtonElement;
const stopBtn = document.getElementById("btn-stop") as HTMLButtonElement;
const fileBtn = document.getElementById("btn-file") as HTMLButtonElement;
const newBtn = document.getElementById("btn-new") as HTMLButtonElement;
const historyBtn = document.getElementById("btn-history") as HTMLButtonElement;
const settingsBtn = document.getElementById("btn-settings") as HTMLButtonElement;
const statusLine = document.getElementById("status-line") as HTMLElement;
const sessionNameEl = document.getElementById("session-name") as HTMLElement;
const sendModeEl = document.getElementById("send-mode") as HTMLSelectElement;

// ---------- 状态 ----------

const messageViews = new Map<string, MessageView>();
const streamingViews = new Map<string, MessageView>();
let runState: RunState = "idle";
let lastAtTrigger = 0;
let userSeq = 0;

function isRunning(): boolean {
  return runState === "starting" || runState === "streaming";
}

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

// ---------- 渲染：消息流 ----------

function requestCopy(toolCallId: string): void {
  post({ kind: "copy_output", toolCallId });
}

function appendMessageView(view: MessageView): void {
  messageViews.set(view.id, view);
  messagesEl.appendChild(view.root);
  view.root.scrollIntoView({ block: "end" });
}

function clearMessages(): void {
  messageViews.clear();
  streamingViews.clear();
  messagesEl.innerHTML = "";
}

function loadHistory(messages: UiMessage[]): void {
  clearMessages();
  for (const message of messages) {
    appendMessageView(MessageView.fromUiMessage(message, requestCopy));
  }
}

// ---------- 渲染：错误与提示 ----------

function showError(message: string, hint?: string): void {
  const card = document.createElement("div");
  card.className = "error-card";
  const title = document.createElement("div");
  title.className = "error-title";
  title.textContent = `⚠ ${message}`;
  card.appendChild(title);
  if (hint) {
    const hintEl = document.createElement("div");
    hintEl.className = "error-hint";
    hintEl.textContent = hint;
    card.appendChild(hintEl);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "error-dismiss";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => card.remove());
  card.appendChild(dismiss);
  errorsEl.appendChild(card);
  card.scrollIntoView({ block: "nearest" });
}

function showToast(text: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  errorsEl.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showExternalChangeBanner(detail: string): void {
  const existing = document.getElementById("external-change-banner");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "external-change-banner";
  banner.className = "banner";
  const text = document.createElement("span");
  text.textContent = `⚠ ${detail} 当前显示可能为陈旧状态。`;
  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "刷新";
  refreshBtn.addEventListener("click", () => {
    banner.remove();
    post({ kind: "refresh_session" });
  });
  const dismiss = document.createElement("button");
  dismiss.textContent = "忽略";
  dismiss.addEventListener("click", () => banner.remove());
  banner.appendChild(text);
  banner.appendChild(refreshBtn);
  banner.appendChild(dismiss);
  errorsEl.appendChild(banner);
}

// ---------- 状态展示 ----------

const STATE_TEXT: Record<RunState, string> = {
  idle: "空闲",
  starting: "启动中",
  streaming: "运行中",
  aborted: "已中止",
  error: "错误",
};

function refreshHeader(model: string, thinkingLevel: string, sessionName: string): void {
  statusLine.textContent = `${model || "(未设置模型)"} · ${thinkingLevel || "—"} · ${STATE_TEXT[runState]}`;
  sessionNameEl.textContent = sessionName || "未命名会话";
}

function setRunState(state: RunState): void {
  runState = state;
  const running = isRunning();
  stopBtn.hidden = !running;
  sendBtn.hidden = running;
  inputEl.placeholder = running
    ? `运行中：输入消息以 ${sendModeEl.value === "followUp" ? "follow-up" : "steer"} 方式插话…（Enter 发送）`
    : "输入消息…（Enter 发送 / Shift+Enter 换行；输入 @ 引用文件）";
  statusLine.textContent = statusLine.textContent.replace(/· (空闲|启动中|运行中|已中止|错误)$/, `· ${STATE_TEXT[state]}`);
}

// ---------- 输入区 ----------

function sendInput(): void {
  const text = inputEl.value.trim();
  if (text.length === 0) return;
  post({ kind: "prompt", text, mode: isRunning() ? (sendModeEl.value as "steer" | "followUp") : "auto" });
  inputEl.value = "";
  inputEl.style.height = "auto";
}

sendBtn.addEventListener("click", sendInput);
stopBtn.addEventListener("click", () => post({ kind: "abort" }));
fileBtn.addEventListener("click", () => post({ kind: "insert_file_ref" }));
newBtn.addEventListener("click", () => post({ kind: "new_session" }));
historyBtn.addEventListener("click", () => post({ kind: "open_history" }));
settingsBtn.addEventListener("click", () => post({ kind: "open_settings" }));
sessionNameEl.addEventListener("click", () => post({ kind: "rename_session" }));
statusLine.addEventListener("click", () => post({ kind: "switch_model" }));
statusLine.addEventListener("dblclick", () => post({ kind: "switch_thinking" }));
sendModeEl.addEventListener("change", () => setRunState(runState));

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendInput();
  }
});

inputEl.addEventListener("input", () => {
  // @file 触发（FR-FILE-02）：输入 @ 且前一字符为行首/空白时弹出文件选择器
  const pos = inputEl.selectionStart;
  const value = inputEl.value;
  if (pos > 0 && value[pos - 1] === "@") {
    const before = pos >= 2 ? value[pos - 2] : "";
    const now = Date.now();
    if ((before === "" || /\s/.test(before)) && now - lastAtTrigger > 1000) {
      lastAtTrigger = now;
      post({ kind: "insert_file_ref" });
    }
  }
});

/** 在光标处插入文本（file_ref / sendToPi 预填）。 */
function insertAtCursor(text: string, replaceAt = false): void {
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  const value = inputEl.value;
  if (replaceAt && start > 0 && value[start - 1] === "@") {
    inputEl.value = value.slice(0, start - 1) + text + value.slice(end);
    inputEl.selectionStart = inputEl.selectionEnd = start - 1 + text.length;
  } else {
    inputEl.value = value.slice(0, start) + text + value.slice(end);
    inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
  }
  inputEl.focus();
}

// ---------- 宿主消息路由 ----------

function handleHostMessage(raw: unknown): void {
  const msg = raw as HostToWebview;
  if (!msg || typeof msg !== "object" || typeof (msg as { kind?: unknown }).kind !== "string") return;
  switch (msg.kind) {
    case "config": {
      sendModeEl.value = msg.sendMode;
      break;
    }
    case "session_reset": {
      clearMessages();
      sessionNameEl.textContent = msg.name || "未命名会话";
      break;
    }
    case "history_loaded": {
      loadHistory(msg.messages);
      break;
    }
    case "user_message": {
      const view = new MessageView(`webview-user-${++userSeq}`, "user", requestCopy);
      view.finalize({
        id: view.id,
        role: "user",
        blocks: [{ type: "text", text: msg.text }],
        timestamp: Date.now(),
      });
      appendMessageView(view);
      break;
    }
    case "stream_start": {
      const view = new MessageView(msg.messageId, "assistant", requestCopy);
      streamingViews.set(msg.messageId, view);
      appendMessageView(view);
      break;
    }
    case "text_delta": {
      streamingViews.get(msg.messageId)?.textDelta(msg.index, msg.delta);
      break;
    }
    case "thinking_delta": {
      streamingViews.get(msg.messageId)?.thinkingDelta(msg.index, msg.delta);
      break;
    }
    case "toolcall_start": {
      streamingViews.get(msg.messageId)?.toolcallStart(msg.index, msg.id, msg.tool, msg.args, msg.summary);
      break;
    }
    case "toolcall_delta": {
      streamingViews.get(msg.messageId)?.toolcallDelta(msg.index, msg.delta);
      break;
    }
    case "toolcall_status": {
      const view = streamingViews.get(msg.messageId) ?? messageViews.get(msg.messageId);
      view?.toolcallStatus(msg.toolCallId, msg.status, msg.summary, msg.output, msg.outputTruncated);
      break;
    }
    case "message_final": {
      const view = streamingViews.get(msg.messageId) ?? messageViews.get(msg.messageId);
      if (view) {
        view.finalize(msg.message);
        streamingViews.delete(msg.messageId);
      } else {
        appendMessageView(MessageView.fromUiMessage(msg.message, requestCopy));
      }
      break;
    }
    case "run_state": {
      setRunState(msg.state);
      if (msg.detail && (msg.state === "error" || msg.state === "aborted")) {
        showToast(msg.detail);
      }
      break;
    }
    case "model_info": {
      refreshHeader(msg.model, msg.thinkingLevel, msg.sessionName);
      break;
    }
    case "session_name": {
      sessionNameEl.textContent = msg.name || "未命名会话";
      break;
    }
    case "error": {
      showError(msg.message, msg.hint);
      break;
    }
    case "toast": {
      showToast(msg.text);
      break;
    }
    case "external_change": {
      showExternalChangeBanner(msg.detail);
      break;
    }
    case "file_ref": {
      insertAtCursor(`@${msg.path} `, true);
      break;
    }
    case "input_prefill": {
      inputEl.value = msg.text;
      inputEl.focus();
      break;
    }
    default:
      break;
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  handleHostMessage(event.data);
});

// 通知宿主就绪（宿主回放配置/状态/历史）
post({ kind: "ready" });

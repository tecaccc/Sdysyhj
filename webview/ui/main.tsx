// 新 UI（默认聊天面板）webview 入口（TASK-009 §10.14 D1/D4）。
// ① 首个 import = ./zod-jitless（官方指南：zod jitless 须在任何 zod schema 构建前导入，FR-AUI-05②；
//   ui-versions 测试断言此源顺序）。
// ② 宿主事件入口：window message 泵 → delta 合批缓冲（rAF 冲刷，D4）→ store。
// ③ 通知宿主就绪（宿主回放 config/model_info/usage_info/run_state/history_loaded）。

import "./zod-jitless";
import "./chat.css";
import React from "react";
import { createRoot } from "react-dom/client";
import type { WebviewToHost } from "../../src/panel/messages";
import { ChatApp, attachHostEventPump } from "./shell";
import { EventBuffer, UiStore } from "./store";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const store = new UiStore();
const buffer = new EventBuffer(store);
attachHostEventPump(window, buffer);

vscode.postMessage({ kind: "ready" });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ChatApp store={store} post={(m) => vscode.postMessage(m)} />
    </React.StrictMode>
  );
}

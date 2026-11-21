// 实验面板 webview 入口（FR-AUI-01/02；TASK-009 §10.13 D4/D6）。
// ① 首个 import = ./zod-jitless（官方指南：zod jitless 须在任何 zod schema 构建前导入，
//   CSP 无 eval 环境；lab-isolation 测试断言此源顺序）。
// ② 单 HTML/单 bundle 内顶部 A/B 切换控件（面板内开关，不重载 HTML、不经宿主——D4：
//   页面重载会触发 fetch:reset 中止在途请求）；切换 = 卸载/挂载对应 slice 子树，默认路线 A。
// ③ 路线 B 事件入口：window message 宿主事件泵 → shared store dispatch。

import "./zod-jitless";
import "./lab.css";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { HostToWebview, WebviewToHost } from "../../src/panel/messages";
import { SliceA } from "./sliceA";
import { SliceB, getSharedLabStore } from "./sliceB";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

type LabRoute = "A" | "B";

function App(): React.ReactElement {
  const [route, setRoute] = useState<LabRoute>("A");
  return (
    <div className="lab-app">
      <div className="lab-switch" role="tablist" aria-label="切片切换">
        <button
          role="tab"
          aria-selected={route === "A"}
          className={`lab-switch-btn${route === "A" ? " lab-switch-active" : ""}`}
          onClick={() => setRoute("A")}
        >
          路线 A（fetch-bridge）
        </button>
        <button
          role="tab"
          aria-selected={route === "B"}
          className={`lab-switch-btn${route === "B" ? " lab-switch-active" : ""}`}
          onClick={() => setRoute("B")}
        >
          路线 B（ExternalStoreRuntime）
        </button>
      </div>
      {route === "A" ? <SliceA key="A" /> : <SliceB key="B" post={(m) => vscode.postMessage(m)} />}
    </div>
  );
}

// 路线 B 事件入口：宿主 postMessage → shared store（协议消息判别联合零改动复用）
window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as HostToWebview | undefined;
  if (typeof data === "object" && data !== null && typeof data.kind === "string") {
    getSharedLabStore().dispatch(data);
  }
});

vscode.postMessage({ kind: "ready" });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

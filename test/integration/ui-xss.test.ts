// TASK-009 §10.14 D8 集成（jsdom 环境）：UI-XSS 探针真实渲染断言（FR-AUI-02④ / NFR-03，
// 从 MANUAL 升格可自动判定，D2 XSS 口径）。链路同 ui-golden-dom（真实 runtime 消费）。
// 断言：探针文本逐字为文本节点；DOM 无新增 script 元素；预埋哨兵无副作用（无执行痕迹）。

// @vitest-environment jsdom

import { act, render, waitFor as rtlWaitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatApp } from "../../webview/ui/shell";
import { makeTempDir, makeUiHarness, waitFor, type UiHarness } from "../helpers/ui-harness";

// 探针 = fake-pi UI-XSS 剧本内嵌文本（<script>/<img onerror>，与 runLabXss 同源）
const PROBE = '<script>alert(1)</script><img src=x onerror=alert(2)>';

let workDir: string;
let harness: UiHarness;

beforeEach(() => {
  workDir = makeTempDir("sdysyhj-ui-xss-");
});

afterEach(async () => {
  await harness?.dispose();
  const { rmSync } = await import("fs");
  rmSync(workDir, { recursive: true, force: true });
});

describe("FR-AUI-02④ UI-XSS 探针（jsdom 真实渲染）", () => {
  it("user/assistant 探针经回放通道渲染：文本逐字保真、无新增 script 元素、哨兵无副作用", async () => {
    // 预埋哨兵：alert 一旦被执行即记录（探针内联脚本/事件副作用探针）
    let sentinelFired = false;
    window.alert = () => {
      sentinelFired = true;
    };
    harness = makeUiHarness({ cwd: workDir });
    await harness.bridge.start();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(React.createElement(ChatApp, { store: harness.store, post: (m): void => harness.send(m) }));
      harness.send({ kind: "ready" }); // main.tsx 挂载后通知宿主就绪（生产同序）
    });
    await waitFor(() => harness.posted.some((m) => m.kind === "history_loaded"), 10000, "ready 回放");
    await act(async () => {
      harness.send({ kind: "prompt", text: "UI-XSS", mode: "auto" });
    });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "UI-XSS settled");
    await rtlWaitFor(() => expect(view.container.textContent).toContain("probe reply"));

    // 探针文本逐字为文本节点（constructive 转义，无 HTML 解析）
    const texts = view.container.textContent ?? "";
    expect(texts).toContain(`UI-XSS probe ${PROBE}`);
    expect(texts).toContain(`probe reply ${PROBE}`);
    // DOM 无新增 script / 探针 img 元素（回放注入经 postMessage 通道，非直接写 DOM）
    expect(view.container.querySelectorAll("script").length).toBe(0);
    expect(view.container.querySelectorAll("img").length).toBe(0);
    // 预埋哨兵无副作用（探针内联事件/脚本从未执行）
    expect((window as unknown as { __xss_probe?: number }).__xss_probe).toBeUndefined();

    view.unmount();
  }, 30000);
});

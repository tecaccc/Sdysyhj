// TASK-009 §10.14 D9 集成（jsdom 环境）：双面板行为一致快照（FR-AUI-03④ / FR-AUI-07③）。
// 同一 golden 回放分别驱动两面板消费端、断言同一期望（fixture 逐行推导）：
//   新 UI = jsdom 真实 runtime DOM 断言（ui-golden-dom 同链路）；
//   经典面板 = chatPanel HTML 模板 + webview/main.ts 冻结 bundle（vscode stub 取 HTML，
//   沿既有 prod-vscode-stub 模式；MediaBundle 原样 eval 执行，不改冻结面）。
// 两面板渲染消息条数与消息文本逐条相等即快照成立。
// D9 预登记受控回退（经典侧 jsdom 挂载成本超预期时）：经典侧降级为数据层断言 + 真机 MANUAL 对照。

// @vitest-environment jsdom

import { act, cleanup, render, waitFor as rtlWaitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { DEFAULT_CONFIG, type SdysyhjConfig } from "../../src/util/config";
import { ChatApp } from "../../webview/ui/shell";
import {
  fixtureEchoTexts,
  fixtureSends,
  makeTempDir,
  makeUiHarness,
  PROMPT_BASIC_FIXTURE,
  waitFor,
  type UiHarness,
} from "../helpers/ui-harness";


let workDir: string;

beforeEach(() => {
  workDir = makeTempDir("sdysyhj-ui-dual-");
});

afterEach(async () => {
  cleanup();
  const { rmSync } = await import("fs");
  rmSync(workDir, { recursive: true, force: true });
});

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** 面板渲染结果快照：每条消息正文（.message-body）的规范化文本（按 DOM 顺序；不含 HH:mm 时间戳——两轮时钟独立）。 */
function messageTexts(queryRoot: ParentNode): string[] {
  return [...queryRoot.querySelectorAll(".message")].map((el) => normalize(el.querySelector(".message-body")?.textContent ?? ""));
}

describe("FR-AUI-07③ 双面板行为一致快照（同一 golden 回放两面板 DOM 断言相等）", () => {
  it("golden-prompt-basic：新 UI 与经典面板渲染消息条数与消息文本逐条一致", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    const userTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "assistant");
    const expectedCount = userTexts.length + assistantTexts.length;

    // ---- 侧 A：新 UI（真实 runtime DOM） ----
    let harness: UiHarness = makeUiHarness({ replay: PROMPT_BASIC_FIXTURE, cwd: workDir });
    await harness.bridge.start();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(React.createElement(ChatApp, { store: harness.store, post: (m): void => harness.send(m) }));
      harness.send({ kind: "ready" });
    });
    await waitFor(() => harness.posted.some((m) => m.kind === "history_loaded"), 10000, "新 UI ready");
    await act(async () => {
      harness.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "新 UI settled");
    await rtlWaitFor(() => expect(view.container.querySelectorAll(".message").length).toBe(expectedCount));
    const newUiTexts = messageTexts(view.container);
    expect(newUiTexts).toHaveLength(expectedCount);
    view.unmount();
    await harness.dispose();

    // ---- 侧 B：经典面板（chatPanel HTML 模板 + webview/main.ts 冻结 bundle） ----
    const { ChatPanel } = await import("../../src/panel/chatPanel");
    const { PiBridge } = await import("../../src/bridge/piBridge");
    const { RpcClient } = await import("../../src/bridge/rpcClient");
    const { MemoryLogger } = await import("../../src/util/log");
    const { FAKE_CLI } = await import("../helpers/ui-harness");
    const fs = await import("fs");

    // 取 chatPanel HTML 模板（vscode stub 注入，沿 prod-vscode-stub 模式）
    const bridgeClassic = new PiBridge({
      cwd: workDir,
      runtime: { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" },
      createClient: ({ command, args, cwd }) =>
        new RpcClient({ command, args, cwd, env: { ...process.env, FAKE_PI_REPLAY: PROMPT_BASIC_FIXTURE } }) as never,
      logger: new MemoryLogger(),
      tailLines: 200,
      sendMode: "steer",
    });
    await bridgeClassic.start();
    const panel = new ChatPanel({ extensionUri: { fsPath: workDir, path: workDir } } as never, bridgeClassic, new MemoryLogger(), (): SdysyhjConfig => ({ ...DEFAULT_CONFIG, outputTailLines: 200, sendMode: "steer" }), workDir, false, undefined, () => null);
    const html = (panel as unknown as { getHtml(w: unknown): string }).getHtml({
      asWebviewUri: (u: { path: string }) => ({ toString: () => `vscode-webview-resource://test${u.path}` }),
      cspSource: "https://test.vscode-cdn.net",
    });
    // 装载 HTML（脚本改由本测试 eval 注入，防 CSP nonce 干扰）
    const bodyHtml = html.slice(html.indexOf("<body"), html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
    document.body.innerHTML = bodyHtml.replace(/^<body[^>]*>/, "");
    // rAF polyfill（jsdom 无 pretendToBeVisual；冻结 bundle thinking 合批需要）
    (window as unknown as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
    // jsdom 无 scrollIntoView（经典 showError 接线用）
    (window.Element.prototype as unknown as Record<string, unknown>).scrollIntoView = () => {};

    // 经典 webview → 宿主：acquireVsCodeApi stub 接 ChatController 同形协议泵（ready/prompt 全集）
    const classicPosted: unknown[] = [];
    const classicWebview = {
      postMessage: (message: unknown) => {
        classicPosted.push(structuredClone(message));
        window.dispatchEvent(new MessageEvent("message", { data: structuredClone(message) }));
        return Promise.resolve(true);
      },
    };
    const { ChatController } = await import("../../src/ui/chatController");
    const controller = new ChatController(bridgeClassic, classicWebview, new MemoryLogger(), {
      showHistory: async () => {},
      showModelPicker: async () => {},
      showThinkingPicker: async () => {},
      showRenameInput: async () => {},
      showFilePicker: async () => {},
      sendToPi: () => {},
      copyOutput: async () => {},
      guard: async (fn, label) => {
        try {
          await fn();
        } catch {
          classicPosted.push({ kind: "error", message: label });
        }
      },
      openSettings: () => {},
      openExternal: () => {},
      relativePath: (p: string) => p,
    }, { getConfig: (): SdysyhjConfig => ({ ...DEFAULT_CONFIG, outputTailLines: 200, sendMode: "steer" }), cwd: workDir, noWorkspace: false });

    (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: (m: unknown) => {
        void controller.handleMessage(m);
      },
      getState: () => undefined,
      setState: () => undefined,
    });

    // 冻结 bundle 原样执行（media/main.js 冻结入口构建产物；jsdom 环境内 esbuild JS API
    // 因 realm 混用不可加载——经 node 子进程跑仓库构建脚本产出同一产物，入口零改动）
    const { execFileSync } = await import("node:child_process");
    const repoRoot = decodeURIComponent(import.meta.url.replace(/^file:\/\//, "")).replace(/\/test\/integration\/[^/]*$/, "");
    execFileSync(process.execPath, ["esbuild.mjs"], { cwd: repoRoot, timeout: 60000, stdio: "pipe" });
    const code = fs.readFileSync(`${repoRoot}/media/main.js`, "utf8");
    await act(async () => {
      (window as unknown as { eval(src: string): unknown }).eval(code); // bundle 自发 ready
    });

    await waitFor(() => classicPosted.some((m) => (m as { kind?: string }).kind === "history_loaded"), 10000, "经典面板 ready");
    await act(async () => {
      void controller.handleMessage({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    });
    await waitFor(() => bridgeClassic.getRunState() === "idle", 10000, "经典面板 settled");
    await rtlWaitFor(() => expect(document.querySelectorAll("#messages-col .message").length).toBe(expectedCount));
    const classicTexts = messageTexts(document.querySelector("#messages-col")!);
    expect(classicTexts).toHaveLength(expectedCount);

    // ---- 快照相等（逐条） ----
    expect(classicTexts).toEqual(newUiTexts);
    // 与 fixture 逐行推导同源（防双侧同错）
    for (const text of [...userTexts, ...assistantTexts]) {
      expect(newUiTexts.some((t) => t.includes(normalize(text)))).toBe(true);
    }

    await controller.dispose();
    await bridgeClassic.dispose();
  }, 30000);
});

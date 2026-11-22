// ui 测试共享机架（TASK-009 §10.14 D8/D9）：golden 回放 → fake-pi 子进程 → RpcClient → PiBridge
// → ChatController（postMessage 泵）→ jsdom window MessageEvent → EventBuffer → UiStore →
// ChatApp（真实 AssistantRuntimeProvider + useExternalStoreRuntime）。
// 传输真实性（FR-AUI-02③）：注入点 = PiBridge 之下的 fake-pi 子进程，事件经 window message
// 通道进 store，测试不直接触 store/渲染结果。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// jsdom 环境内 URL 构造器按 document base（http://localhost）解析、Node fileURLToPath 品牌检查不兼容
// ——对 import.meta.url（file://）做字符串归一（含 Windows 盘符），fs 路径容忍 /../ 段。
function fileUrlToPathString(u: string): string {
  let p = decodeURIComponent(u.replace(/^file:\/\//, ""));
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p.replace(/\/[^/]*$/, "");
}
const harnessDir = fileUrlToPathString(import.meta.url);
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import { ChatController } from "../../src/ui/chatController";
import type { HostActions, StartupError } from "../../src/panel/hostActions";
import type { HostToWebview, UiMessage, WebviewToHost } from "../../src/panel/messages";
import { DEFAULT_CONFIG, type SdysyhjConfig } from "../../src/util/config";
import { MemoryLogger } from "../../src/util/log";
import { attachHostEventPump } from "../../webview/ui/shell";
import { EventBuffer, UiStore } from "../../webview/ui/store";

// jsdom 环境缺失的浏览器观察器（@assistant-ui/radix 运行时需要；无行为桩，断言面不在布局）
const g = globalThis as Record<string, unknown>;
if (typeof g.ResizeObserver === "undefined") {
  g.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
if (typeof g.IntersectionObserver === "undefined") {
  g.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  };
}
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

export const FAKE_CLI = `${harnessDir}/fake-pi-cli.js`;
export const GOLDEN_DIR = `${harnessDir}/../fixtures/golden`;
export const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
export const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");

export interface FixtureLine {
  dir: "in" | "out";
  record: Record<string, unknown>;
}

export function fixtureLines(fixturePath: string): FixtureLine[] {
  return fs
    .readFileSync(fixturePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as FixtureLine);
}

export const fixtureSends = (fixturePath: string) =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "in")
    .map((l) => l.record)
    .filter((r) => ["prompt", "steer", "follow_up"].includes(String(r.type)));

/** fixture 内 user/assistant message_end 权威文本（按到达序）。 */
export const fixtureEchoTexts = (fixturePath: string, role: string): string[] =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "out" && l.record.type === "message_end")
    .map((l) => l.record.message as { role: string; content: unknown })
    .filter((m) => m.role === role)
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : (m.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("")
    );

export const textOf = (m: UiMessage): string =>
  m.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");

export async function waitFor(predicate: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** 动作层记录桩（vscode 交互动作不属 DOM 断言面；协议动作经 post 回流）。 */
export function stubActions(post: (m: HostToWebview) => void, calls: string[]): HostActions {
  return {
    showHistory: async () => void calls.push("showHistory"),
    showModelPicker: async () => void calls.push("showModelPicker"),
    showThinkingPicker: async () => void calls.push("showThinkingPicker"),
    showRenameInput: async () => void calls.push("showRenameInput"),
    showFilePicker: async () => void calls.push("showFilePicker"),
    sendToPi: () => void calls.push("sendToPi"),
    copyOutput: async (toolCallId: string) => {
      calls.push(`copy_output:${toolCallId}`);
      post({ kind: "toast", text: "已复制全部输出" });
    },
    guard: async (fn, label) => {
      try {
        await fn();
      } catch (err) {
        post({ kind: "error", message: `${label}：${err instanceof Error ? err.message : String(err)}` });
      }
    },
    openSettings: () => void calls.push("openSettings"),
    openExternal: () => void calls.push("openExternal"),
    relativePath: (p: string) => p,
  };
}

export interface UiHarness {
  bridge: PiBridge;
  events: BridgeEvent[];
  store: UiStore;
  /** 宿主 → webview 投递记录（结构化克隆过，生产 postMessage 序列化边界同构） */
  posted: HostToWebview[];
  /** webview → 宿主协议消息（ChatApp post 捕获） */
  sent: WebviewToHost[];
  actionCalls: string[];
  controller: ChatController;
  send: (message: WebviewToHost) => void;
  dispose: () => Promise<void>;
}

export function makeUiHarness(options: { replay?: string; cwd: string; getStartupError?: () => StartupError | null }): UiHarness {
  const events: BridgeEvent[] = [];
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" };
  const bridge = new PiBridge({
    cwd: options.cwd,
    runtime,
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command,
        args,
        cwd,
        env: options.replay ? { ...process.env, FAKE_PI_REPLAY: options.replay } : { ...process.env },
      }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((event) => events.push(event));

  const store = new UiStore();
  // 合批调度 = setTimeout 0（jsdom 确定性等价 rAF；合批语义由 ui-store 单测钉死）
  const buffer = new EventBuffer(store, (cb) => {
    setTimeout(cb, 0);
  });
  const detachPump = attachHostEventPump(window, buffer);

  const posted: HostToWebview[] = [];
  const webview = {
    postMessage: (message: unknown) => {
      posted.push(structuredClone(message) as HostToWebview);
      // 生产传输通道：宿主 postMessage → webview window message 事件
      window.dispatchEvent(new MessageEvent("message", { data: structuredClone(message) }));
      return Promise.resolve(true);
    },
  };

  const sent: WebviewToHost[] = [];
  const actionCalls: string[] = [];
  // 动作层 post = 宿主 → webview（error/toast 等）：走与 controller 相同的 postMessage 通道
  const actions = stubActions((m) => {
    void webview.postMessage(m);
  }, actionCalls);

  const controller = new ChatController(bridge, webview, new MemoryLogger(), actions, {
    getConfig: (): SdysyhjConfig => ({ ...DEFAULT_CONFIG, outputTailLines: 200, sendMode: "steer" }),
    cwd: options.cwd,
    noWorkspace: false,
    getStartupError: options.getStartupError ?? (() => null),
  });

  const send = (message: WebviewToHost): void => {
    sent.push(message);
    void controller.handleMessage(message);
  };

  return {
    bridge,
    events,
    store,
    posted,
    sent,
    actionCalls,
    controller,
    send,
    dispose: async () => {
      detachPump();
      controller.dispose();
      await bridge.dispose();
    },
  };
}

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// TASK-011 批次 A 项集成（jsdom 环境）：golden E2E DOM 回放——判定载体回经典面板（自研实现）。
// 历史：TASK-009 切换批次（19588eb）本测试面向 assistant-ui React runtime（ui-harness 机架 +
// ChatApp 组件渲染）；2026-11-27 人类还原指令（「还原聊天界面为我们自己编写的版本，去掉外部
// 引入的框架」）落地后，断言对象改回经典面板，机架沿原 ui-dual-panel.test.ts 经典侧同链路
// （该双面板一致快照用例随双轨注册退役删除，机制回收到本文件）：
//   golden fixture → fake-pi FAKE_PI_REPLAY 子进程 → RpcClient → PiBridge → ChatPanel
//   （真实 resolveWebviewView/onDidReceiveMessage 消息路由，vscode 模块经 vitest alias 桩）
//   → jsdom window MessageEvent → webview/main.ts 冻结 bundle（media/main.js 原样 eval，
//   入口零改动）→ DOM 断言。
// 断言面：消息条数 = fixture user+assistant 逐行推导值（澄清 #12）、文本逐条一致、
// FR-CHAT-11 user 气泡三判定时点恒单条（TASK-008 §10.12 口径：乐观即时展示 + 回声就地更新
// + 终稿后仍恰一条）、时间戳 HH:mm（FR-CHAT-10⑤）、工具卡与 thinking 折叠（fake-pi TOOL
// 剧本，FR-CHAT-03/04）。

// @vitest-environment jsdom

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { PiBridge, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import { ChatPanel } from "../../src/panel/chatPanel";
import type { HostToWebview } from "../../src/panel/messages";
import { DEFAULT_CONFIG, type SdysyhjConfig } from "../../src/util/config";
import { MemoryLogger } from "../../src/util/log";

// jsdom 环境内 URL 构造器按 document base 解析、Node fileURLToPath 品牌检查不兼容——
// 对 import.meta.url（file://）做字符串归一（含 Windows 盘符），fs 路径容忍 /../ 段。
function fileUrlToDir(u: string): string {
  let p = decodeURIComponent(u.replace(/^file:\/\//, ""));
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p.replace(/\/[^/]*$/, "");
}
const HERE = fileUrlToDir(import.meta.url); // <repo>/test/integration
const REPO_ROOT = HERE.replace(/\/test\/integration$/, "");
const FAKE_CLI = path.join(HERE, "..", "helpers", "fake-pi-cli.js");
const GOLDEN_DIR = path.join(HERE, "..", "fixtures", "golden");
const PROMPT_BASIC_FIXTURE = path.join(GOLDEN_DIR, "golden-prompt-basic.jsonl");
const STEER_FOLLOWUP_FIXTURE = path.join(GOLDEN_DIR, "golden-steer-followup.jsonl");

// 冻结 bundle 构建（仓库 esbuild.mjs 同参产出 media/main.js；jsdom 环境内 esbuild JS API
// 因 realm 混用不可加载——经 node 子进程跑仓库构建脚本产出同一产物，入口零改动）。
beforeAll(() => {
  execFileSync(process.execPath, [path.join(REPO_ROOT, "esbuild.mjs")], { cwd: REPO_ROOT, timeout: 120000, stdio: "pipe" });
}, 180000);

// ---------- fixture 推导（期望值自 fixture 逐行可推导，防漂移；与 golden-replay 同源） ----------

interface FixtureLine {
  dir: "in" | "out";
  record: Record<string, unknown>;
}

function fixtureLines(fixturePath: string): FixtureLine[] {
  return fs
    .readFileSync(fixturePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as FixtureLine);
}

const fixtureSends = (fixturePath: string) =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "in")
    .map((l) => l.record)
    .filter((r) => ["prompt", "steer", "follow_up"].includes(String(r.type)));

/** fixture 内 user/assistant message_end 权威文本（按到达序）。 */
const fixtureEchoTexts = (fixturePath: string, role: string): string[] =>
  fixtureLines(fixturePath)
    .filter((l) => l.dir === "out" && l.record.type === "message_end")
    .map((l) => l.record.message as { role: string; content: unknown })
    .filter((m) => m.role === role)
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : (m.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("")
    );

async function waitFor(predicate: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

// ---------- 经典面板挂载（ChatPanel 真实消息路由 + 冻结 bundle eval） ----------

interface ClassicPanelHarness {
  bridge: PiBridge;
  panel: ChatPanel;
  /** 宿主 → webview 投递记录（结构化克隆过，生产 postMessage 序列化边界同构） */
  posted: HostToWebview[];
  /** webview → 宿主协议消息（acquireVsCodeApi stub 捕获） */
  sent: unknown[];
  /** webview → 宿主发送（与生产 composer 同通道：acquireVsCodeApi().postMessage） */
  post: (raw: unknown) => void;
  dispose: () => Promise<void>;
}

let workDir: string;
let harness: ClassicPanelHarness | null = null;

function mountClassicPanel(replay: string | undefined): ClassicPanelHarness {
  const posted: HostToWebview[] = [];
  const sent: unknown[] = [];
  // 宿主 → webview：fake webview.postMessage → jsdom window MessageEvent（生产传输通道同构）
  const fakeWebview = {
    cspSource: "https://test.vscode-cdn.net",
    asWebviewUri: (u: { path: string }) => ({ toString: () => `vscode-webview-resource://test${u.path}` }),
    options: {},
    html: "",
    postMessage: (message: unknown) => {
      posted.push(structuredClone(message) as HostToWebview);
      window.dispatchEvent(new MessageEvent("message", { data: structuredClone(message) }));
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (cb: (raw: unknown) => void) => {
      hostHandler = cb;
      return { dispose(): void {} };
    },
  };
  let hostHandler: ((raw: unknown) => void) | null = null;

  const bridge = new PiBridge({
    cwd: workDir,
    runtime: { source: "bundled", command: process.execPath, baseArgs: [FAKE_CLI], detail: "fake cli" },
    createClient: ({ command, args, cwd }) =>
      new RpcClient({
        command,
        args,
        cwd,
        env: replay ? { ...process.env, FAKE_PI_REPLAY: replay } : { ...process.env },
      }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  const panel = new ChatPanel(
    { extensionUri: { fsPath: workDir, path: workDir } } as never,
    bridge,
    new MemoryLogger(),
    (): SdysyhjConfig => ({ ...DEFAULT_CONFIG, outputTailLines: 200, sendMode: "steer" }),
    workDir,
    false,
    undefined,
    () => null
  );
  // 真实 resolveWebviewView：取 HTML 模板 + 挂接 onDidReceiveMessage 路由（handleWebviewMessage 全集）
  panel.resolveWebviewView({ webview: fakeWebview } as never);

  // 装载 HTML（脚本改由本测试 eval 注入，防 CSP nonce 干扰）
  const bodyHtml = fakeWebview.html
    .slice(fakeWebview.html.indexOf("<body"), fakeWebview.html.indexOf("</body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = bodyHtml.replace(/^<body[^>]*>/, "");
  // rAF polyfill（jsdom 无 pretendToBeVisual；冻结 bundle thinking 合批需要）
  (window as unknown as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
  // jsdom 无 scrollIntoView（经典 showError 接线用）
  (window.Element.prototype as unknown as Record<string, unknown>).scrollIntoView = () => {};

  // 经典 webview → 宿主：acquireVsCodeApi stub → ChatPanel.onDidReceiveMessage 路由
  const api = {
    postMessage: (m: unknown) => {
      sent.push(structuredClone(m));
      hostHandler?.(m);
    },
    getState: (): undefined => undefined,
    setState: (): void => {},
  };
  (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => api;

  // 冻结 bundle 原样执行（media/main.js 冻结入口构建产物；bundle 自发 ready）
  const code = fs.readFileSync(path.join(REPO_ROOT, "media", "main.js"), "utf8");
  (window as unknown as { eval(src: string): unknown }).eval(code);

  return {
    bridge,
    panel,
    posted,
    sent,
    post: (raw: unknown) => api.postMessage(raw),
    dispose: async () => {
      panel.dispose();
      await bridge.dispose();
    },
  };
}

async function mountAndReady(replay: string | undefined): Promise<ClassicPanelHarness> {
  harness = mountClassicPanel(replay);
  await harness.bridge.start();
  await waitFor(() => harness!.posted.some((m) => m.kind === "history_loaded"), 10000, "经典面板 ready");
  return harness;
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-ui-dom-"));
});

afterEach(async () => {
  await harness?.dispose();
  harness = null;
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("golden-prompt-basic E2E DOM 回放（经典面板，P0）", () => {
  it("消息条数/文本与 fixture 逐行推导一致；user 气泡三判定时点恒 1（FR-CHAT-11 ①）", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt"]);
    const userTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "assistant");
    const expectedCount = userTexts.length + assistantTexts.length;

    const h = await mountAndReady(PROMPT_BASIC_FIXTURE);

    // 时点①：发送即时展示（乐观 user_message，不等回声）
    h.post({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    await waitFor(() => document.querySelectorAll(".message-user").length === 1, 5000, "发送即时展示");
    await waitFor(() => h.bridge.getRunState() === "idle", 10000, "golden basic settled");

    // 时点②③：user 回声到达 + 助手终稿渲染完成后仍恰一条（回声就地更新，不新增不合并）
    expect(document.querySelectorAll(".message-user").length).toBe(1);
    expect(document.querySelectorAll("#messages-col .message").length).toBe(expectedCount);
    // user 文本 = pi 权威文本（#16 回声就地更新）；assistant 文本逐字一致
    expect(normalize(document.querySelector(".message-user .message-body")?.textContent ?? "")).toContain(normalize(userTexts[0]));
    expect(normalize(document.querySelector(".message-assistant .message-body")?.textContent ?? "")).toContain(normalize(assistantTexts[0]));
    // FR-CHAT-10⑤：时间戳 HH:mm（每条消息）
    const times = document.querySelectorAll(".message-time");
    expect(times.length).toBe(expectedCount);
    for (const t of times) expect(t.textContent).toMatch(/^\d{2}:\d{2}$/);
  }, 30000);
});

describe("golden-steer-followup E2E DOM 回放（经典面板，P1）", () => {
  it("三发送各恰一条 user 气泡 + 三轮 assistant 全量（②steer/follow-up 同口径）", async () => {
    const sends = fixtureSends(STEER_FOLLOWUP_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt", "follow_up", "steer"]);
    const userTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "assistant");

    const h = await mountAndReady(STEER_FOLLOWUP_FIXTURE);
    h.post({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    await waitFor(() => h.bridge.getRunState() === "streaming" || document.querySelectorAll(".message-user").length === 1, 5000, "首条即时展示");
    h.post({ kind: "prompt", text: String(sends[1].message), mode: "followUp" });
    h.post({ kind: "prompt", text: String(sends[2].message), mode: "steer" });
    await waitFor(() => h.bridge.getRunState() === "idle", 10000, "golden mixed settled");

    // user 气泡恰 3 条（每发送一条，回声乱序投递不新增不合并——FR-CHAT-11 ①②）
    expect(document.querySelectorAll(".message-user").length).toBe(sends.length);
    for (const text of userTexts) {
      expect(normalize(document.body.textContent ?? "")).toContain(normalize(text));
    }
    for (const text of assistantTexts) {
      expect(normalize(document.body.textContent ?? "")).toContain(normalize(text));
    }
  }, 30000);
});

describe("FR-CHAT-03/04 工具卡与 thinking 折叠 E2E（经典面板，fake-pi TOOL 剧本）", () => {
  it("工具卡：名称/状态/可展开输入输出齐备；thinking 默认折叠", async () => {
    const h = await mountAndReady(undefined);
    h.post({ kind: "prompt", text: "TOOL", mode: "auto" });
    await waitFor(() => h.bridge.getRunState() === "idle", 10000, "TOOL settled");
    await waitFor(() => document.querySelectorAll(".toolcard").length >= 1, 5000, "工具卡渲染");

    const card = document.querySelector(".toolcard")!;
    expect(card.querySelector(".toolcard-name")?.textContent).toBe("bash");
    // 终态（toolResult 晚于终稿仍更新——#D-04 同语义经真实路由）
    await waitFor(() => (card.querySelector(".toolcard-status")?.textContent ?? "").includes("成功"), 5000, "工具卡终态");
    // 可展开输入输出
    expect(card.querySelector(".toolcard-args")?.textContent?.length ?? 0).toBeGreaterThan(0);
    expect(card.querySelector(".toolcard-output")?.textContent?.length ?? 0).toBeGreaterThan(0);
    // thinking 折叠（FR-CHAT-03：默认折叠）
    const thinking = document.querySelector("details.thinking-details") as HTMLDetailsElement | null;
    expect(thinking).not.toBeNull();
    expect(thinking!.open).toBe(false);
  }, 30000);
});

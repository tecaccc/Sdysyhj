// TASK-009 §10.14 D8 单测：切换批次冻结面/注册结构断言 + XSS 静态扫描。
// 回归重定向：lab-isolation.test.ts → 本文件（冻结面反转为**经典面板**零改动断言；
// 注册断言面 chatLabView→chatView/chatViewClassic；扫描面 webview/lab→webview/ui（sink 白名单）；
// 断言平移扩容，无放宽）。
// ① package.json 结构断言（FR-AUI-07②④：views/命令/activationEvents；「实验/Lab」命名清零）；
// ② esbuild.mjs 三入口断言（宿主 + chat.js + main.js 冻结）；
// ③ 经典面板 chatPanel.ts 冻结面（viewType chatViewClassic / retainContextWhenHidden / CSP meta 模板）；
// ④ 新 UI 注册结构（FR-AUI-05④ retainContextWhenHidden；openChat/openChatClassic 接线）；
// ⑤ XSS 静态扫描（D2：webview/ui/** 禁 innerHTML 系 API，唯一白名单 = markdown.tsx 的
//   DOMPurify 消毒后 dangerouslySetInnerHTML sink）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const pkg = JSON.parse(read("package.json")) as {
  main: string;
  activationEvents: string[];
  contributes: {
    viewsContainers: { activitybar: Array<{ id: string; title: string; icon: string }> };
    views: Record<string, Array<{ type: string; id: string; name: string }>>;
    commands: Array<{ command: string; title: string; category?: string; icon?: string }>;
  };
};

describe("FR-AUI-07②④ package.json 结构断言（切换批次契约面）", () => {
  it("views = [chatView \"Chat\", chatViewClassic \"Chat (Classic)\"]（顺序与定名，#19(b)）", () => {
    expect(pkg.contributes.views.sdysyhj).toEqual([
      { type: "webview", id: "sdysyhj.chatView", name: "Chat" },
      { type: "webview", id: "sdysyhj.chatViewClassic", name: "Chat (Classic)" },
    ]);
    expect(pkg.contributes.viewsContainers.activitybar).toEqual([{ id: "sdysyhj", title: "Sdysyhj", icon: "media/icon.svg" }]);
  });

  it("既有 9 项命令逐项零变更 + openChatClassic 新增 + openChatLab 移除（FR-AUI-07④）", () => {
    const frozen: Array<{ command: string; title: string; category?: string; icon?: string }> = [
      { command: "sdysyhj.openChat", title: "Open Chat", category: "Sdysyhj", icon: "$(comment-discussion)" },
      { command: "sdysyhj.newSession", title: "New Session", category: "Sdysyhj", icon: "$(add)" },
      { command: "sdysyhj.abort", title: "Abort", category: "Sdysyhj", icon: "$(debug-stop)" },
      { command: "sdysyhj.showHistory", title: "Show Session History", category: "Sdysyhj", icon: "$(history)" },
      { command: "sdysyhj.reportIssue", title: "Report Issue", category: "Sdysyhj" },
      { command: "sdysyhj.renameSession", title: "Rename Session", category: "Sdysyhj" },
      { command: "sdysyhj.switchModel", title: "Switch Model", category: "Sdysyhj" },
      { command: "sdysyhj.switchThinking", title: "Switch Thinking Level", category: "Sdysyhj" },
      { command: "sdysyhj.sendToPi", title: "Send to Pi", category: "Sdysyhj" },
    ];
    for (const want of frozen) {
      expect(pkg.contributes.commands).toContainEqual(want);
    }
    expect(pkg.contributes.commands).toContainEqual({ command: "sdysyhj.openChatClassic", title: "Open Chat (Classic)", category: "Sdysyhj", icon: "$(comment-discussion)" });
    expect(pkg.contributes.commands.map((c) => c.command)).not.toContain("sdysyhj.openChatLab");
  });

  it("5 项配置项零变更（FR-AUI-07④）；activationEvents = 两 viewType 惰性；「实验/Lab」命名清零（②）", () => {
    const config = JSON.parse(read("package.json")) as { contributes: { configuration: { properties: Record<string, unknown> } } };
    expect(Object.keys(config.contributes.configuration.properties).sort()).toEqual(
      ["sdysyhj.outputTailLines", "sdysyhj.piPath", "sdysyhj.piRuntime", "sdysyhj.sendMode", "sdysyhj.thinkingDefault"].sort()
    );
    expect(pkg.activationEvents).toEqual(["onView:sdysyhj.chatView", "onView:sdysyhj.chatViewClassic"]);
    expect(pkg.main).toBe("./dist/extension.js");
    const raw = read("package.json");
    expect(raw).not.toContain("Lab");
    expect(raw).not.toContain("实验");
    expect(raw).not.toContain("chatLabView");
    expect(raw).not.toContain("openChatLab");
  });
});

describe("D1 esbuild.mjs 三入口断言（宿主 + chat.js + main.js 冻结）", () => {
  const esbuild = read("esbuild.mjs");

  it("宿主入口（src/extension.ts → dist/extension.js，node/cjs，external 冻结）", () => {
    expect(esbuild).toContain(`const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // vscode 由宿主提供；pi 运行时包只作 spawn 目标与路径解析，不打入 bundle
  external: ["vscode", "@earendil-works/pi-coding-agent"],
  outfile: "dist/extension.js",
  sourcemap: true,
  logLevel: "info",
};`);
  });

  it("经典面板 webview 入口（webview/main.ts → media/main.js，browser/iife）原样", () => {
    expect(esbuild).toContain(`const webviewOptions = {
  entryPoints: ["webview/main.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: "media/main.js",
  sourcemap: true,
  logLevel: "info",
};`);
  });

  it("默认面板 webview 入口（webview/ui/main.tsx → media/chat.js）；lab 入口清零", () => {
    expect(esbuild).toContain(`entryPoints: ["webview/ui/main.tsx"]`);
    expect(esbuild).toContain(`outfile: "media/chat.js"`);
    expect(esbuild).not.toContain("webview/lab");
    expect(esbuild).not.toContain("media/lab.js");
  });
});

describe("经典面板 chatPanel.ts 冻结面（文本断言；行为冻结=回归全绿+D9 一致快照）", () => {
  const chatPanel = read("src/panel/chatPanel.ts");

  it("viewType = sdysyhj.chatViewClassic（#19(b) 迁移常量）", () => {
    expect(chatPanel).toContain(`public static readonly viewType = "sdysyhj.chatViewClassic";`);
  });

  it("retainContextWhenHidden: true 冻结（FR-AUI-05④ 基线同值）", () => {
    expect(chatPanel).toContain(`webviewOptions: { retainContextWhenHidden: true }`);
  });

  it("CSP meta 模板冻结值（default-src 'none' + style-src 'unsafe-inline' + script-src nonce + img-src https:）", () => {
    expect(chatPanel).toContain(
      'content="default-src \'none\'; style-src ${cspSource} \'unsafe-inline\'; script-src \'nonce-${nonce}\'; img-src ${cspSource} https: data:;"'
    );
  });
});

describe("新 UI 注册结构断言（FR-AUI-05④ / FR-AUI-07①）", () => {
  it("chatView 注册显式 retainContextWhenHidden = true；openChat→新 UI、openChatClassic→经典", () => {
    const extension = read("src/extension.ts");
    expect(extension).toContain('import { ChatViewProvider } from "./ui/chatViewProvider";');
    expect(extension).toContain("vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatView, {");
    expect(extension).toContain("webviewOptions: { retainContextWhenHidden: true },");
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.openChat", () => chatView.reveal())');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.openChatClassic", () => panel.reveal())');
    const provider = read("src/ui/chatViewProvider.ts");
    expect(provider).toContain('public static readonly viewType = "sdysyhj.chatView";');
    // 经典面板自注册（冻结面）不受新 UI 接入影响
    expect(extension).toContain("new ChatPanel(");
  });
});

describe("D2 XSS 静态扫描：webview/ui/** 禁 innerHTML 类 API（唯一白名单 = markdown.tsx DOMPurify sink）", () => {
  it("webview/ui/** 无 innerHTML/outerHTML/insertAdjacentHTML/document.write；dangerouslySetInnerHTML 仅 markdown.tsx 且经 sanitize", () => {
    const uiDir = path.join(root, "webview", "ui");
    const files = fs.readdirSync(uiDir).filter((f) => /\.(ts|tsx|css)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(path.join(uiDir, file), "utf8");
      for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
        expect(source.includes(banned), `${file} 含禁用 API：${banned}`).toBe(false);
      }
      if (file !== "markdown.tsx") {
        expect(source.includes("dangerouslySetInnerHTML"), `${file} 含非白名单 sink：dangerouslySetInnerHTML`).toBe(false);
      }
    }
    const markdown = read("webview/ui/markdown.tsx");
    expect(markdown).toContain("dangerouslySetInnerHTML");
    // sink 前必须经 DOMPurify.sanitize（同一消毒口径）
    expect(markdown).toContain("DOMPurify.sanitize");
    expect(markdown.indexOf("DOMPurify.sanitize")).toBeLessThan(markdown.indexOf("dangerouslySetInnerHTML"));
  });
});

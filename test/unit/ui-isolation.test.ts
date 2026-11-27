// TASK-011 批次 A 项结构门禁（2026-11-27 人类还原指令「还原聊天界面为我们自己编写的版本，
// 去掉外部引入的框架」）：还原后单面板注册结构断言 + 经典面板冻结面 + 框架移除残留扫描。
// 历史：本文件原为 TASK-009 切换批次（19588eb）双轨注册断言（chatView = 新 UI、
// chatViewClassic = 经典回退）；A 项还原后断言反转回 v0.1.6 时代单面板形态：
//   ① package.json 结构断言（单视图 chatView；chatViewClassic/openChatClassic 清零；
//      既有 9 命令 + 5 配置零变更）；
//   ② esbuild.mjs 双入口断言（宿主 + media/main.js；chat.js 入口清零）；
//   ③ 经典面板 chatPanel.ts 冻结面（viewType sdysyhj.chatView / retainContextWhenHidden /
//      CSP meta 模板——A 项口径：CSP 不降级，模板逐字冻结）；
//   ④ 激活接线断言（extension.ts：ChatPanel 唯一面板；新 UI provider 接线清零）；
//   ⑤ 框架移除残留扫描（src/**、webview/**、esbuild.mjs 零 @assistant-ui / webview/ui 引用）。

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
    configuration: { properties: Record<string, unknown> };
  };
};

/** 递归收集目录下源码文件（.ts/.tsx/.mjs/.js/.css）。 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("① package.json 单面板结构断言（还原后契约面）", () => {
  it("views = [chatView \"Chat\"] 唯一视图；chatViewClassic 清零（A 项：双轨收敛单面板）", () => {
    expect(pkg.contributes.views.sdysyhj).toEqual([{ type: "webview", id: "sdysyhj.chatView", name: "Chat" }]);
    expect(pkg.contributes.viewsContainers.activitybar).toEqual([{ id: "sdysyhj", title: "Sdysyhj", icon: "media/icon.svg" }]);
    const raw = read("package.json");
    expect(raw).not.toContain("chatViewClassic");
    expect(raw).not.toContain("openChatClassic");
  });

  it("既有 9 项命令逐项零变更；openChatClassic / openChatLab 清零（A 项移除回退入口）", () => {
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
    expect(pkg.contributes.commands).toEqual(frozen);
  });

  it("5 项配置项零变更；activationEvents = 单 viewType 惰性；「实验/Lab」命名清零", () => {
    expect(Object.keys(pkg.contributes.configuration.properties).sort()).toEqual(
      ["sdysyhj.outputTailLines", "sdysyhj.piPath", "sdysyhj.piRuntime", "sdysyhj.sendMode", "sdysyhj.thinkingDefault"].sort()
    );
    expect(pkg.activationEvents).toEqual(["onView:sdysyhj.chatView"]);
    expect(pkg.main).toBe("./dist/extension.js");
    const raw = read("package.json");
    expect(raw).not.toContain("Lab");
    expect(raw).not.toContain("实验");
    expect(raw).not.toContain("chatLabView");
    expect(raw).not.toContain("openChatLab");
  });
});

describe("② esbuild.mjs 双入口断言（宿主 + main.js；React 构建链拆除）", () => {
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

  it("React 新 UI 构建链清零：无 jsx automatic / NODE_ENV define / media/chat.js 入口", () => {
    expect(esbuild).not.toContain("media/chat.js");
    expect(esbuild).not.toContain("jsx:");
    expect(esbuild).not.toContain("process.env.NODE_ENV");
  });
});

describe("③ 经典面板 chatPanel.ts 冻结面（文本断言；行为冻结 = 回归全绿）", () => {
  const chatPanel = read("src/panel/chatPanel.ts");

  it("viewType = sdysyhj.chatView（A 项回迁：唯一聊天面板承载经典实现）", () => {
    expect(chatPanel).toContain(`public static readonly viewType = "sdysyhj.chatView";`);
  });

  it("retainContextWhenHidden: true 冻结（注册历史值不变）", () => {
    expect(chatPanel).toContain(`webviewOptions: { retainContextWhenHidden: true }`);
  });

  it("CSP meta 模板冻结值（A 项口径：CSP 不降级——default-src 'none' + script-src 仅 nonce + 无 unsafe-eval）", () => {
    expect(chatPanel).toContain(
      'content="default-src \'none\'; style-src ${cspSource} \'unsafe-inline\'; script-src \'nonce-${nonce}\'; img-src ${cspSource} https: data:;"'
    );
    expect(chatPanel).not.toContain("unsafe-eval");
  });
});

describe("④ 激活接线断言（extension.ts：ChatPanel 唯一面板，命令入口回经典对象）", () => {
  it("ChatPanel 构造 + 自注册；openChat/newSession/showHistory/sendToPi 均指向经典面板", () => {
    const extension = read("src/extension.ts");
    expect(extension).toContain("new ChatPanel(");
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.openChat", () => panel.reveal())');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.newSession", async () => {\n      panel.reveal();');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.showHistory", async () => {\n      panel.reveal();\n      await panel.showHistory();');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.renameSession", () => panel.showRenameInput())');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.switchModel", () => panel.showModelPicker())');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.switchThinking", () => panel.showThinkingPicker())');
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.sendToPi", (uri?: vscode.Uri) => panel.sendToPi(uri))');
  });

  it("新 UI 接线清零：无 ChatViewProvider 导入/注册；openChatClassic 命令清零；src/ui 目录不存在", () => {
    const extension = read("src/extension.ts");
    expect(extension).not.toContain("ChatViewProvider");
    expect(extension).not.toContain("chatViewProvider");
    expect(extension).not.toContain("openChatClassic");
    expect(extension).not.toContain("chatView.reveal()");
    expect(fs.existsSync(path.join(root, "src", "ui"))).toBe(false);
  });
});

describe("⑤ 框架移除残留扫描（产品面零 @assistant-ui / webview/ui 引用）", () => {
  it("src/**、webview/**、esbuild.mjs 源码零 @assistant-ui / webview/ui 引用；webview/ui 目录不存在", () => {
    const files = [...sourceFiles(path.join(root, "src")), ...sourceFiles(path.join(root, "webview")), path.join(root, "esbuild.mjs")];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source.includes("@assistant-ui"), `${file} 残留 @assistant-ui 引用`).toBe(false);
      expect(source.includes("webview/ui"), `${file} 残留 webview/ui 引用`).toBe(false);
    }
    expect(fs.existsSync(path.join(root, "webview", "ui"))).toBe(false);
  });
});

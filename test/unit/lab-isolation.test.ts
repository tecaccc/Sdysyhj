// TASK-009 §10.13 D8 单测：D1 零变更冻结断言（FR-AUI-01② 默认面板零变更，自动层）。
// 四项：① package.json 解析断言（默认视图条目/容器/既有命令/main/activationEvents 原样，新增允许追加）；
//      ② esbuild.mjs 文本断言（既有两项入口配置逐字原样）；
//      ③ src/panel/chatPanel.ts 文本断言（viewType / retainContextWhenHidden / CSP meta 模板冻结值）；
//      ④ 默认面板依赖图（esbuild metafile：单独构建 webview/main.ts，inputs 不含 react/react-dom/
//        @assistant-ui/**——FR-AUI-05③「独立构建入口断言」）。
// 另含：实验面板源码 innerHTML 禁令扫描（D5 XSS 静态层，扫描面限 webview/lab/**，规范 §5.2 扫描纪律）。

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

describe("D1① package.json 零变更冻结（FR-AUI-01②）", () => {
  it("默认视图条目原样且保持首位（实验面板第二位，不替换不抢占）", () => {
    expect(pkg.contributes.views.sdysyhj[0]).toEqual({ type: "webview", id: "sdysyhj.chatView", name: "Chat" });
    expect(pkg.contributes.views.sdysyhj[1]).toEqual({ type: "webview", id: "sdysyhj.chatLabView", name: "聊天（实验）" });
  });

  it("viewsContainer 原样（Activity Bar 单容器）", () => {
    expect(pkg.contributes.viewsContainers.activitybar).toEqual([{ id: "sdysyhj", title: "Sdysyhj", icon: "media/icon.svg" }]);
  });

  it("既有命令逐项 id/title/category/icon 不变（新增命令允许追加）", () => {
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
    // 新增实验命令存在
    expect(pkg.contributes.commands).toContainEqual({ command: "sdysyhj.openChatLab", title: "Open Chat (Lab)", category: "Sdysyhj", icon: "$(beaker)" });
  });

  it("宿主入口 main 与 activationEvents 冻结（含默认面板 onView，实验面板惰性追加）", () => {
    expect(pkg.main).toBe("./dist/extension.js");
    expect(pkg.activationEvents).toContain("onView:sdysyhj.chatView");
    expect(pkg.activationEvents).toContain("onView:sdysyhj.chatLabView");
  });
});

describe("D1② esbuild.mjs 既有入口配置零变更（文本断言）", () => {
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

  it("默认面板 webview 入口（webview/main.ts → media/main.js，browser/iife）原样", () => {
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

  it("实验面板为新增独立入口（media/lab.js，不触碰既有两项）", () => {
    expect(esbuild).toContain(`entryPoints: ["webview/lab/main.tsx"]`);
    expect(esbuild).toContain(`outfile: "media/lab.js"`);
  });
});

describe("D1③ 默认面板 chatPanel.ts 冻结面（文本断言）", () => {
  const chatPanel = read("src/panel/chatPanel.ts");

  it("viewType 冻结", () => {
    expect(chatPanel).toContain(`public static readonly viewType = "sdysyhj.chatView";`);
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

describe("D1④ 默认面板依赖图无 React/assistant-ui（FR-AUI-05③ 独立构建入口断言）", () => {
  it("单独构建 webview/main.ts：metafile inputs 不含 react/react-dom/@assistant-ui/**", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(root, "webview/main.ts")],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2020",
      write: false,
      outdir: "out",
      metafile: true,
      logLevel: "silent",
    });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.length).toBeGreaterThan(0);
    const forbidden = inputs.filter((name) => /(^|\/)react(-dom)?(\/|$)/.test(name) || name.includes("@assistant-ui/"));
    expect(forbidden).toEqual([]);
  });
});

describe("D5 XSS 静态扫描：实验面板源码禁 innerHTML 类 API（扫描面限 webview/lab/**）", () => {
  it("webview/lab/** 无 innerHTML/outerHTML/insertAdjacentHTML/document.write", () => {
    const labDir = path.join(root, "webview", "lab");
    const files = fs.readdirSync(labDir).filter((f) => /\.(ts|tsx|css)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(path.join(labDir, file), "utf8");
      for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
        expect(source.includes(banned), `${file} 含禁用 API：${banned}`).toBe(false);
      }
    }
  });
});

describe("FR-AUI-05④ retainContextWhenHidden 注册结构断言（行为层自动兑底；DOM 行为层入真机 checklist）", () => {
  it("实验面板注册显式 retainContextWhenHidden = true（与默认面板同值）；入口命令与 viewType 落位", () => {
    const extension = read("src/extension.ts");
    expect(extension).toContain('import { LabViewProvider } from "./lab/labViewProvider";');
    expect(extension).toContain("vscode.window.registerWebviewViewProvider(LabViewProvider.viewType, labPanel, {");
    expect(extension).toContain("webviewOptions: { retainContextWhenHidden: true },");
    expect(extension).toContain('vscode.commands.registerCommand("sdysyhj.openChatLab", () => labPanel.reveal())');
    const provider = read("src/lab/labViewProvider.ts");
    expect(provider).toContain('public static readonly viewType = "sdysyhj.chatLabView";');
    // 默认面板注册（冻结面）不受实验面板接入影响
    expect(extension).toContain("new ChatPanel(");
  });
});

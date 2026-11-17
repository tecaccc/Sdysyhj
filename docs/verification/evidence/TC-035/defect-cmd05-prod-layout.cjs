// 缺陷复现：FR-CMD-05 内置运行时在【打包布局】（<ext>/dist/extension.js + <ext>/node_modules）下解析失败。
// 复现步骤：1) 模拟 vsix 安装布局 /tmp/vpkg（dist/extension.js + node_modules 含 pi 运行时包）
//          2) PATH 无 pi，sdysyhj.piRuntime=auto，激活扩展
// 期望：resolvePiRuntime 回退内置运行时（source=bundled），可对话（开箱即用）
// 实际：抛"未找到可用的 pi 运行时（PATH 无 pi，内置运行时缺失）"
const path = require("path");
const vscodeStub = require("/tmp/vpkg/node_modules/vscode/index.js");
(async () => {
  process.env.PATH = "/usr/bin:/bin";
  const ext = require("/tmp/vpkg/dist/extension.js");
  const context = { subscriptions: [], extensionUri: { fsPath: "/tmp/vpkg" } };
  await ext.activate(context);
  const provider = vscodeStub._control.webviewProviders["sdysyhj.chatView"];
  let handler = null;
  const view = {
    webview: {
      options: {}, html: "", cspSource: "csp",
      asWebviewUri: (u) => u,
      onDidReceiveMessage(cb) { handler = cb; return { dispose() {} }; },
      postMessage(msg) { console.log("HOST->WEBVIEW:", JSON.stringify(msg).slice(0, 300)); return Promise.resolve(true); },
    },
    show() {}, onDidDispose() { return { dispose() {} }; },
  };
  provider.resolveWebviewView(view);
  await handler({ kind: "ready" });
  await new Promise((r) => setTimeout(r, 500));
  console.log("--- Output Channel ---");
  console.log(vscodeStub._control.outputChannels["Sdysyhj"].lines.join("\n"));
  const fs = require("fs");
  const cliExpected = path.join("/tmp/vpkg", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
  console.log("--- 打包布局内置运行时实际存在 ---");
  console.log(cliExpected, "exists =", fs.existsSync(cliExpected));
  await ext.deactivate();
})().catch((e) => { console.error("REPRO ERROR:", e); process.exit(2); });

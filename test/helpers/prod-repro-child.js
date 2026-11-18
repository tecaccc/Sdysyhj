// 打包布局复现脚本（缺陷#1 验收形态，对齐 docs/verification/evidence/TC-035/defect-cmd05-prod-layout.cjs）：
//   node prod-repro-child.js <layout>
// <layout> 为 vsix 安装布局：dist/extension.js + node_modules/{vscode,@earendil-works/pi-coding-agent}。
// 流程：激活扩展 → resolveWebviewView → ready → 发送 prompt → 断言内置运行时（source=bundled）可用。
"use strict";

const path = require("path");

const layout = process.argv[2];
if (!layout) {
  console.error("usage: node prod-repro-child.js <layout>");
  process.exit(2);
}

const vscodeStub = require(path.join(layout, "node_modules", "vscode", "index.js"));

(async () => {
  // 复现条件：PATH 无 pi（强制走内置运行时回退）
  process.env.PATH = "/usr/bin:/bin";

  const fs = require("fs");
  const wsDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "prod-repro-ws-"));
  vscodeStub._control.workspaceFolders = [{ uri: { fsPath: wsDir } }];

  const ext = require(path.join(layout, "dist", "extension.js"));
  const context = { subscriptions: [], extensionUri: { fsPath: layout } };
  await ext.activate(context);

  const provider = vscodeStub._control.webviewProviders["sdysyhj.chatView"];
  const posted = [];
  let handler = null;
  const view = {
    webview: {
      options: {},
      html: "",
      cspSource: "csp",
      asWebviewUri: (u) => u,
      onDidReceiveMessage(cb) {
        handler = cb;
        return { dispose() {} };
      },
      postMessage(msg) {
        posted.push(msg);
        return Promise.resolve(true);
      },
    },
    show() {},
    onDidDispose() {
      return { dispose() {} };
    },
  };
  provider.resolveWebviewView(view);
  await handler({ kind: "ready" });

  // 可对话链路：发送 prompt，等待 message_final
  await handler({ kind: "prompt", text: "prod-repro hello", mode: "auto" });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !posted.some((m) => m.kind === "message_final")) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const channel = vscodeStub._control.outputChannels["Sdysyhj"];
  const dump = channel ? channel.lines.join("\n") : "";
  console.log("--- Output Channel ---");
  console.log(dump);
  console.log("--- 转储结束 ---");

  const ok =
    /source=bundled/.test(dump) &&
    !/未找到可用的 pi 运行时/.test(dump) &&
    posted.some((m) => m.kind === "message_final") &&
    !posted.some((m) => m.kind === "error");
  console.log(ok ? "PROD-REPRO-OK" : "PROD-REPRO-FAIL");
  if (!ok) {
    console.log("POSTED:", JSON.stringify(posted.map((m) => m.kind)));
    process.exitCode = 1;
  }
  await ext.deactivate();
  fs.rmSync(wsDir, { recursive: true, force: true });
})().catch((e) => {
  console.error("REPRO ERROR:", e);
  process.exit(2);
});

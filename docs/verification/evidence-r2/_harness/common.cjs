// /tmp/r2harness/lib/common.cjs —— 核验公共驱动库（一次性脚手架，只读被测仓库）。
"use strict";
const fs = require("fs");
const path = require("path");

const BUILD = "/tmp/r2harness/build";
const JSDOM_PATH = "/data/workspace/marktype/node_modules/jsdom";
const { JSDOM } = require(JSDOM_PATH);

// ---------- 断言 ----------
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  |  " + detail : ""}`);
  return !!cond;
}
function summary(tcId) {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== ${tcId}: ${results.length - fails.length}/${results.length} assertions passed ===`);
  if (fails.length) {
    console.log("FAILED:", fails.map((f) => f.name).join("; "));
    process.exit(1);
  }
  process.exit(0);
}

// ---------- MOCKLOG ----------
function readCalls() {
  const p = path.join(process.env.MOCKLOG, "calls.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ---------- webview 装配（jsdom） ----------
const WEBVIEW_HTML = `<!DOCTYPE html><html lang="zh-CN"><body>
  <header id="header">
    <div class="header-row">
      <span id="session-name" class="session-name">未命名会话</span>
      <span class="header-actions">
        <button id="btn-new">＋</button><button id="btn-history">🕘</button><button id="btn-settings">⚙</button>
      </span>
    </div>
    <div class="header-row"><span id="status-line" class="status-line">—</span></div>
  </header>
  <main id="messages"></main>
  <div id="errors"></div>
  <footer id="input-area">
    <div class="input-toolbar">
      <button id="btn-file">@文件</button>
      <label class="mode-label">插话模式
        <select id="send-mode"><option value="steer">steer</option><option value="followUp">followUp</option></select>
      </label>
    </div>
    <textarea id="input" rows="3"></textarea>
    <div class="input-actions">
      <span id="stream-cursor" hidden>▍</span>
      <button id="btn-send">发送</button>
      <button id="btn-stop" hidden>■ Stop</button>
    </div>
  </footer>
</body></html>`;

function bootWebview() {
  const dom = new JSDOM(WEBVIEW_HTML, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://sdysyhj.test/" });
  const w = dom.window;
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(Date.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  w.Element.prototype.scrollIntoView = function () {};
  const posted = [];
  w.acquireVsCodeApi = () => ({
    postMessage: (m) => posted.push(m),
    getState: () => null,
    setState: () => {},
  });
  w.eval(fs.readFileSync(path.join(BUILD, "webview-main.iife.js"), "utf8"));
  return {
    dom,
    window: w,
    document: w.document,
    posted,
    fromHost(msg) {
      w.dispatchEvent(new w.MessageEvent("message", { data: msg }));
    },
    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },
  };
}

// ---------- 宿主装配（vscode stub + extension.activate） ----------
function bootHost(opts = {}) {
  const vscodeStub = require("/tmp/r2harness/node_modules/vscode/index.js");
  vscodeStub._control.reset();
  Object.assign(vscodeStub._control.config, opts.config || {});
  vscodeStub._control.workspaceFolders = opts.workspaceFolders === undefined ? null : opts.workspaceFolders;
  if (opts.findFilesResult) vscodeStub._control.findFilesResult = opts.findFilesResult;
  if (opts.quickPicks) vscodeStub._control.quickPicks = [...opts.quickPicks];
  if (opts.inputBoxes) vscodeStub._control.inputBoxes = [...opts.inputBoxes];
  if (opts.activeTextEditor) vscodeStub._control.activeTextEditor = opts.activeTextEditor;

  const ext = require(path.join(BUILD, "extension.cjs"));
  const context = { subscriptions: [], extensionUri: { fsPath: "/tmp/sdysyhj-verify-r2" } };

  return {
    vscodeStub,
    control: vscodeStub._control,
    context,
    async activate() {
      await ext.activate(context);
      return this;
    },
    resolveView() {
      const provider = vscodeStub._control.webviewProviders["sdysyhj.chatView"];
      const hostToWebview = [];
      let messageHandler = null;
      const fakeView = {
        webview: {
          options: {},
          html: "",
          cspSource: "csp-source",
          asWebviewUri: (u) => u,
          onDidReceiveMessage(cb) {
            messageHandler = cb;
            return { dispose() {} };
          },
          postMessage(msg) {
            hostToWebview.push(JSON.parse(JSON.stringify(msg))); // 模拟 VS Code 结构化克隆
            return Promise.resolve(true);
          },
        },
        show() {},
        onDidDispose() {
          return { dispose() {} };
        },
      };
      provider.resolveWebviewView(fakeView);
      return {
        view: fakeView,
        html: fakeView.webview.html,
        hostToWebview,
        send: (m) => messageHandler && messageHandler(m),
        async settle() {
          // 让异步消息路由完成
          await new Promise((r) => setTimeout(r, 50));
        },
      };
    },
    async deactivate() {
      await ext.deactivate();
    },
  };
}

/** 等待条件成立（超时抛错）。 */
async function waitFor(fn, timeoutMs = 5000, stepMs = 25) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitFor 超时（${timeoutMs}ms）`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

module.exports = { check, summary, readCalls, bootWebview, bootHost, waitFor, BUILD };

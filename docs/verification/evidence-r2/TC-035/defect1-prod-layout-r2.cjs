// r2-defect1-prod-layout.cjs —— 缺陷#1（FR-CMD-05）打包布局内置运行时回归（R2 独立复现，口径同 R1 defect-cmd05-prod-layout.cjs）
// 复现步骤：1) vsix 安装布局 /tmp/r2-vpkg（dist/extension.js + node_modules 含 pi 内置运行时包）
//          2) PATH=/usr/bin:/bin（无 pi），sdysyhj.piRuntime=auto，无凭证（§12 #9）
//          3) 激活扩展 → resolveWebviewView → ready → 发起一次对话（L2 mock provider 127.0.0.1）
// 期望（修复后）：resolvePiRuntime 回退内置运行时（source=bundled），按 <lay>/node_modules 内置 cli.js 启动，可正常对话（开箱即用）
// 防混淆：拦截 child_process.spawn 记录真实启动的 cli 路径——必须指向布局自身 node_modules（而非宿主 /tmp/node_modules 残留垫片）
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const LAY = "/tmp/r2-vpkg";
const EXPECT_CLI = path.join(LAY, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");

// 拦截 spawn（在 require 扩展之前）
const spawnLog = [];
const realSpawn = spawn;
require("child_process").spawn = function (cmd, args, opts) {
  spawnLog.push({ cmd, args });
  return realSpawn(cmd, args, opts);
};

const vscodeStub = require(`${LAY}/node_modules/vscode/index.js`);

(async () => {
  // L2 mock provider + 配置（临时 HOME，由 run.sh 提供）
  const agentDir = path.join(process.env.HOME, ".pi", "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync("/tmp/r2harness/wsA/src", { recursive: true });
  const aTs = "/tmp/r2harness/wsA/src/a.ts";
  fs.writeFileSync(aTs, 'const hello = "world";\nexport default hello;\n');
  fs.writeFileSync(
    path.join(agentDir, "models.json"),
    JSON.stringify({ providers: { mockllm: { baseUrl: "http://127.0.0.1:18435/v1", api: "openai-completions", apiKey: "MOCK-DUMMY-KEY", models: [{ id: "mock-small" }] } } }, null, 2)
  );
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "mockllm", defaultModel: "mock-small", defaultThinkingLevel: "off" }, null, 2));

  const server = realSpawn(process.execPath, ["/tmp/r2harness/mock-openai.js"], { stdio: "ignore", env: { ...process.env, MOCK_OPENAI_PORT: "18435" } });
  await new Promise((r) => setTimeout(r, 600));

  process.env.PATH = "/usr/bin:/bin"; // 无 pi（口径 #9 离线等价）
  const ext = require(`${LAY}/dist/extension.js`);
  const context = { subscriptions: [], extensionUri: { fsPath: LAY } };
  await ext.activate(context);

  const provider = vscodeStub._control.webviewProviders["sdysyhj.chatView"];
  let handler = null;
  const hostToWebview = [];
  const view = {
    webview: {
      options: {}, html: "", cspSource: "csp",
      asWebviewUri: (u) => u,
      onDidReceiveMessage(cb) { handler = cb; return { dispose() {} }; },
      postMessage(msg) {
        hostToWebview.push(JSON.parse(JSON.stringify(msg)));
        return Promise.resolve(true);
      },
    },
    show() {}, onDidDispose() { return { dispose() {} }; },
  };
  provider.resolveWebviewView(view);
  await handler({ kind: "ready" });
  await new Promise((r) => setTimeout(r, 800));

  let pass = 0, fail = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  |  " + detail : ""}`);
    ok ? pass++ : fail++;
  };

  const dump = (vscodeStub._control.outputChannels["Sdysyhj"] || { lines: [] }).lines.join("\n");
  console.log("--- HOST->WEBVIEW ---");
  for (const m of hostToWebview) console.log(JSON.stringify(m).slice(0, 300));
  console.log("--- Output Channel ---\n" + dump);
  console.log("--- spawn 记录 ---");
  for (const s of spawnLog) console.log(JSON.stringify(s).slice(0, 400));

  check("R2-#1(a) 无『未找到可用的 pi 运行时』错误", !dump.includes("未找到可用的 pi 运行时") && !hostToWebview.some((m) => m.kind === "error" && /未找到可用/.test(m.message || "")));
  check("R2-#1(b) source=bundled（内置运行时回退生效）", /source=bundled/.test(dump), dump.split("\n").find((l) => /pi 运行时/.test(l)) || "");
  check("R2-#1(c) 打包布局内置运行时实际存在", fs.existsSync(EXPECT_CLI), EXPECT_CLI);
  const cliSpawn = spawnLog.find((s) => (s.args || []).some((a) => String(a).includes("pi-coding-agent")));
  check("R2-#1(d) 启动的 cli 指向布局自身 node_modules（防 /tmp/node_modules 垫片混淆）", !!cliSpawn && (cliSpawn.args || []).includes(EXPECT_CLI), cliSpawn ? JSON.stringify(cliSpawn.args) : "no spawn");

  // 开箱即用对话（L2 mock provider）：等待 assistant 回合结束（注意首个 message_final 为 user 消息，不能据此提前退出）
  await handler({ kind: "prompt", text: "hello prod layout", mode: "auto" });
  const t0 = Date.now();
  for (;;) {
    if (hostToWebview.some((m) => m.kind === "message_final" && m.message && m.message.role === "assistant")) break;
    if (Date.now() - t0 > 30000) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const deltas = hostToWebview.filter((m) => m.kind === "text_delta").map((m) => m.delta);
  check("R2-#1(e) 打包布局下对话成功（text deltas ≥8）", deltas.length >= 8, `deltas=${deltas.length} ${JSON.stringify(deltas.slice(0, 12))}`);

  await ext.deactivate();
  server.kill();
  console.log(`\n=== R2 defect#1 prod-layout: ${pass}/${pass + fail} assertions passed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("REPRO ERROR:", e);
  process.exit(2);
});

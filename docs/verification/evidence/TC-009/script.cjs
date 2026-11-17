// TC-009 ｜ FR-CHAT-05 ｜ Abort 命令注册 + RPC abort + 状态恢复（MOCK-SLOW）
const { bootHost, bootWebview, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "slow";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "slow-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "streaming"), 3000);
  await new Promise((r) => setTimeout(r, 1000)); // 运行 1s

  // 触发 Abort（命令面板命令，等价 TC-009 步骤 1 的注册命令）
  await require("/tmp/vharness/node_modules/vscode/index.js")._control.commands["sdysyhj.abort"]();
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "aborted"), 5000);
  await new Promise((r) => setTimeout(r, 300));

  // (b) $MOCKLOG/calls.jsonl 含 RPC abort 调用
  const calls = readCalls();
  check("TC-009(b) calls.jsonl 含 abort 调用", calls.some((c) => c.type === "abort" || c.event === "abort_called"), JSON.stringify(calls.filter((c) => c.type === "abort" || c.event === "abort_called")));

  // (c) 状态流 streaming→aborted→idle
  const states = view.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state);
  const flow = states.join("→");
  check("TC-009(c) 状态流 streaming→aborted→idle", /streaming→aborted→idle/.test(flow), flow);

  // (e) 历史保留该轮并带"已中止"标记
  const ui = host.control ? null : null;
  const finals = view.hostToWebview.filter((m) => m.kind === "message_final");
  check("TC-009(e1) 中止轮保留（message_final 存在且标记 aborted）", finals.length > 0 && finals.some((m) => m.message.aborted === true), JSON.stringify(finals.map((m) => ({ id: m.message.id, aborted: m.message.aborted }))));

  // webview：(d) 输入框恢复可输入；(e) 已中止标记
  const wv = bootWebview();
  for (const msg of view.hostToWebview) wv.fromHost(msg);
  await wv.sleep(300);
  const sendBtn = wv.document.getElementById("btn-send");
  const stopBtn = wv.document.getElementById("btn-stop");
  check("TC-009(d) 中止后恢复可输入（发送按钮可见/Stop 隐藏）", !sendBtn.hidden && stopBtn.hidden, `send.hidden=${sendBtn.hidden}, stop.hidden=${stopBtn.hidden}`);
  const abortedMarker = wv.document.querySelector(".aborted-marker");
  check("TC-009(e2) 历史带『已中止』标记", !!abortedMarker && abortedMarker.textContent.includes("已中止"), abortedMarker && abortedMarker.textContent);

  await host.deactivate();
  summary("TC-009");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

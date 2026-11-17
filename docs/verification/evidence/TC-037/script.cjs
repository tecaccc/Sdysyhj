// TC-037 ｜ NFR-01 ｜ 面板切换/重开不丢运行状态（MOCK-SLOW，webview dispose/recreate）
const { bootHost, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "slow";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view1 = host.resolveView();
  await view1.send({ kind: "ready" });
  await waitFor(() => view1.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view1.send({ kind: "prompt", text: "slow-check", mode: "auto" });
  await waitFor(() => view1.hostToWebview.some((m) => m.kind === "run_state" && m.state === "streaming"), 3000);
  await new Promise((r) => setTimeout(r, 700)); // 流式运行中

  // 面板隐藏 → 重开（webview dispose/recreate：新 view + ready 回放）
  const view2 = host.resolveView();
  await view2.send({ kind: "ready" });
  await waitFor(() => view2.hostToWebview.some((m) => m.kind === "history_loaded"));

  const states = view2.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state);
  check("TC-037(a) 重开后状态仍为 streaming", states.includes("streaming"), states.join("→"));

  // (b) 继续收到后续 delta
  await waitFor(() => view2.hostToWebview.filter((m) => m.kind === "text_delta").length >= 3, 4000);
  check("TC-037(b) 重开后继续收到后续 delta", view2.hostToWebview.filter((m) => m.kind === "text_delta").length >= 3, `deltas=${view2.hostToWebview.filter((m) => m.kind === "text_delta").length}`);

  // (c) Stop 仍可中止（abort 走 TC-009 断言 b/c/d/e）
  await require("/tmp/vharness/node_modules/vscode/index.js")._control.commands["sdysyhj.abort"]();
  await waitFor(() => view2.hostToWebview.some((m) => m.kind === "run_state" && m.state === "aborted"), 5000);
  await new Promise((r) => setTimeout(r, 300));
  const finals = view2.hostToWebview.filter((m) => m.kind === "message_final");
  check("TC-037(c1) abort 生效（calls.jsonl 含 abort）", require("./lib/common.cjs").readCalls().some((c) => c.type === "abort" || c.event === "abort_called"));
  const states2 = view2.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state).join("→");
  check("TC-037(c2) 状态流（TC-009(c) 口径：streaming→aborted→idle）", /streaming→aborted→idle/.test(states2), states2);
  check("TC-037(c3) 中止轮保留带已中止标记", finals.some((m) => m.message.aborted === true), JSON.stringify(finals.map((m) => m.message.aborted)));

  await host.deactivate();
  summary("TC-037");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

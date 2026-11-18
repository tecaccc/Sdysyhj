// TC-014 ｜ FR-CHAT-08 ｜ 状态四字段模型与状态流转
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "stream";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  // 4 字段：模型 / thinking 等级 / 运行状态 / 会话名（宿主状态模型）
  const info = host.control ? null : null;
  const modelInfos = view.hostToWebview.filter((m) => m.kind === "model_info");
  const mi = modelInfos[modelInfos.length - 1] || {};
  check("TC-014(a1) 状态模型含模型字段", typeof mi.model === "string" && mi.model.length > 0, JSON.stringify(mi));
  check("TC-014(a2) 状态模型含 thinking 等级字段", typeof mi.thinkingLevel === "string" && mi.thinkingLevel.length > 0, JSON.stringify(mi));
  check("TC-014(a3) 状态模型含会话名字段", "sessionName" in mi, JSON.stringify(mi));
  const stateEvents = view.hostToWebview.filter((m) => m.kind === "run_state");
  check("TC-014(a4) 运行状态字段（idle/streaming/aborted）", stateEvents.length > 0 && stateEvents.every((m) => ["idle", "starting", "streaming", "aborted", "error"].includes(m.state)), JSON.stringify(stateEvents.map((m) => m.state)));

  // 状态流：一次正常流式（TC-001(c) 口径）
  await view.send({ kind: "prompt", text: "flow-1", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 5000);
  await new Promise((r) => setTimeout(r, 200));
  const states1 = view.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state).join("→");
  check("TC-014(b1) 正常流式状态流与 TC-001(c) 一致（…→streaming→idle）", /streaming→idle$/.test(states1), states1);

  // 状态流：一次中止（TC-009(c) 口径：streaming→aborted→idle）
  process.env.MOCK_SCENARIO = "slow";
  await view.send({ kind: "prompt", text: "slow-flow-2", mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "run_state" && m.state === "streaming").length >= 2, 3000);
  await new Promise((r) => setTimeout(r, 500));
  await require("/tmp/r2harness/node_modules/vscode/index.js")._control.commands["sdysyhj.abort"]();
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "aborted"), 5000);
  await new Promise((r) => setTimeout(r, 500));
  const states2 = view.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state).join("→");
  check("TC-014(b2) 中止状态流与 TC-009(c) 一致（streaming→aborted→idle）", /streaming→aborted→idle/.test(states2), states2);

  // 会话名随重命名更新（与 TC-019 一致）
  host.control.inputBoxes.push("TC-014-name");
  await require("/tmp/r2harness/node_modules/vscode/index.js")._control.commands["sdysyhj.renameSession"]();
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "session_name"), 3000);
  const sn = view.hostToWebview.filter((m) => m.kind === "session_name").pop();
  check("TC-014(c) 会话名随重命名更新", !!sn && sn.name === "TC-014-name", JSON.stringify(sn));

  // webview 状态栏 4 字段可见（自动佐证；视觉项归 TC-015 MANUAL）
  const wv = bootWebview();
  for (const msg of view.hostToWebview) wv.fromHost(msg);
  await wv.sleep(300);
  const statusLine = wv.document.getElementById("status-line").textContent;
  const sessionName = wv.document.getElementById("session-name").textContent;
  check("TC-014(d1) 状态栏含模型·等级·状态", /mock\/mock-alpha/.test(statusLine) && /high/.test(statusLine) && /空闲|运行中|已中止|启动中|错误/.test(statusLine), statusLine);
  check("TC-014(d2) 会话名展示且随重命名更新", sessionName === "TC-014-name", sessionName);

  await host.deactivate();
  summary("TC-014");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

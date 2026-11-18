// TC-011 ｜ FR-CHAT-06 ｜ steer/follow-up 注入与模式切换（MOCK-SLOW）
const { bootHost, bootWebview, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "slow";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "turn-1", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "streaming"), 3000);

  // SC-011a：运行中发送第二条消息（默认 steer）
  await view.send({ kind: "prompt", text: "steer-msg-2", mode: "auto" });
  await waitFor(() => readCalls().some((c) => c.type === "steer"), 3000);

  // SC-011b：切 follow-up 模式后发送第三条消息
  await view.send({ kind: "prompt", text: "followup-msg-3", mode: "followUp" });
  await waitFor(() => readCalls().some((c) => c.type === "follow_up"), 3000);

  const calls = readCalls();
  // (a) 第二条消息以 steer 注入（steer 类请求，而非新会话）
  const steerCalls = calls.filter((c) => c.type === "steer");
  check("TC-011(a1) steer 请求含第二条消息原文", steerCalls.some((c) => c.args.message === "steer-msg-2"), JSON.stringify(steerCalls));
  check("TC-011(a2) 未产生新会话（无 new_session 调用）", !calls.some((c) => c.type === "new_session"));
  // (b) 第三条消息排队、本轮结束后发送
  const fuCalls = calls.filter((c) => c.type === "follow_up");
  check("TC-011(b1) follow_up 请求已受理（queued）", fuCalls.some((c) => c.args.message === "followup-msg-3"), JSON.stringify(fuCalls));

  // 中止本轮 → 队列在本轮结束后发送
  await require("/tmp/r2harness/node_modules/vscode/index.js")._control.commands["sdysyhj.abort"]();
  await waitFor(() => readCalls().some((c) => c.event === "queue_delivered"), 8000);
  const delivered = readCalls().filter((c) => c.event === "queue_delivered");
  check("TC-011(b2) 本轮结束后队列消息被发送", delivered.length > 0 && delivered.every((d) => ["steer-msg-2", "followup-msg-3"].includes(d.message)), JSON.stringify(delivered));

  // (c) 模式可切换且发送行为随模式变化（webview 状态机）
  const wv = bootWebview();
  wv.fromHost({ kind: "config", tailLines: 200, sendMode: "steer", workspaceLabel: "wsA" });
  wv.fromHost({ kind: "run_state", state: "streaming" });
  const sel = wv.document.getElementById("send-mode");
  check("TC-011(c1) 运行中发送框转为插话输入（placeholder 含插话）", wv.document.getElementById("input").placeholder.includes("插话"), wv.document.getElementById("input").placeholder);
  wv.document.getElementById("input").value = "m-steer";
  wv.document.getElementById("btn-send").click();
  sel.value = "followUp";
  sel.dispatchEvent(new wv.window.Event("change"));
  wv.document.getElementById("input").value = "m-follow";
  wv.document.getElementById("btn-send").click();
  const promptPosts = wv.posted.filter((m) => m.kind === "prompt");
  check("TC-011(c2) 发送行为随模式变化（steer→followUp）", promptPosts.length === 2 && promptPosts[0].mode === "steer" && promptPosts[1].mode === "followUp", JSON.stringify(promptPosts));

  await host.deactivate();
  summary("TC-011");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

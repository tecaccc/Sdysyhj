// TC-001 ｜ FR-CHAT-01 ｜ 流式 delta 级增量渲染与状态流转（MOCK-STREAM）
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "stream";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  const tSend = Date.now();
  await view.send({ kind: "prompt", text: "stream-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 5000);
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 5000);

  const deltas = view.hostToWebview.filter((m) => m.kind === "text_delta");
  // (a) ≥8 个 text-delta 级增量，顺序与 d1..d8 一致
  check("TC-001(a) deltas>=8 且顺序 d1..d8", deltas.length >= 8 && JSON.stringify(deltas.map((d) => d.delta)) === JSON.stringify(["d1","d2","d3","d4","d5","d6","d7","d8"]), JSON.stringify(deltas.map((d) => d.delta)));

  // (b) 最后一个增量后出现完成事件（message_final / run_state idle）
  const events = view.hostToWebview;
  const lastDeltaIdx = events.map((m) => m.kind).lastIndexOf("text_delta");
  const finalIdx = events.findIndex((m, i) => i > lastDeltaIdx && (m.kind === "message_final" || (m.kind === "run_state" && m.state === "idle")));
  check("TC-001(b) 末增量后出现完成事件", finalIdx > lastDeltaIdx, `lastDelta@${lastDeltaIdx}, completion@${finalIdx}`);

  // (c) 运行状态流 idle→streaming→idle
  const states = events.filter((m) => m.kind === "run_state").map((m) => m.state);
  const flow = states.join("→");
  check("TC-001(c) 状态流 idle→streaming→idle（可含 starting）", /streaming/.test(flow) && states[states.length - 1] === "idle", flow);

  // (d) 首增量距发送 < 2s
  const firstDeltaTs = deltas[0]._t ?? tSend; // 事件无时间戳，以接收端计时近似：首 delta 在 waitFor 返回前到达
  const elapsed = Date.now() - tSend; // 上界（≥实际首增量延迟）
  check("TC-001(d) 首增量距发送 <2s（计时上界）", elapsed < 2000, `elapsed<=${elapsed}ms`);

  // mock 收到 prompt（calls.jsonl 契约）
  const calls = readCalls();
  check("calls.jsonl 含 prompt 'stream-check'", calls.some((c) => c.type === "prompt" && c.args && c.args.message === "stream-check"));

  await host.deactivate();
  summary("TC-001");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

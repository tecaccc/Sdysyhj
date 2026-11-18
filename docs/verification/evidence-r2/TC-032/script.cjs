// TC-032 ｜ FR-CMD-03（P2 MVP 部分）｜ slash 命令文本直接发送生效
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "stream";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "/review this file", mode: "auto" });
  await waitFor(() => readCalls().some((c) => c.type === "prompt"), 4000);
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 6000);

  // (a) mock 收到消息原文
  const hit = readCalls().filter((c) => c.type === "prompt" && c.args.message === "/review this file");
  check("TC-032(a) mock 收到原文 '/review this file'", hit.length > 0, JSON.stringify(hit.map((h) => h.args.message)));
  // (b) 会话正常继续（有回复、无错误卡片）
  await new Promise((r) => setTimeout(r, 200));
  const finals = view.hostToWebview.filter((m) => m.kind === "message_final");
  const errors = view.hostToWebview.filter((m) => m.kind === "error");
  check("TC-032(b) 会话正常继续（有回复、无错误卡片）", finals.length > 0 && errors.length === 0, `finals=${finals.length}, errors=${errors.length}`);

  await host.deactivate();
  summary("TC-032");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

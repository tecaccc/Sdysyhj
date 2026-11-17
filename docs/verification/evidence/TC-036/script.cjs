// TC-036 ｜ NFR-01 ｜ 10k+ tokens 流式渲染代理断言（MOCK-BIG：600 delta）
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "big";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  const t0 = Date.now();
  await view.send({ kind: "prompt", text: "big-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 30000);
  const elapsed = Date.now() - t0;

  // (a) ≈600 个 delta 全部按序到达（零丢失）
  const deltas = view.hostToWebview.filter((m) => m.kind === "text_delta").map((m) => m.delta);
  const expected = Array.from({ length: 600 }, (_, i) => `b${i + 1} `);
  check("TC-036(a) 600 delta 零丢失且按序", deltas.length === 600 && JSON.stringify(deltas) === JSON.stringify(expected), `count=${deltas.length}, first=${deltas[0]}, last=${deltas[deltas.length - 1]}`);

  // (b) 全量渲染耗时 ≤30s
  check("TC-036(b) 完整渲染耗时 ≤30s", elapsed <= 30000, `elapsed=${elapsed}ms`);

  // (c) 渲染批处理代理：全量重渲染次数 ≤ delta 数/10（webview TextBlockView 300ms 合并）
  const wv = bootWebview();
  // 仅回放流式段（不含 message_final），观察挂载 .md 上的全量重排次数
  let renderCount = 0;
  const obs = new wv.window.MutationObserver((records) => {
    for (const r of records) {
      if (r.target && r.target.classList && r.target.classList.contains("md")) renderCount += 1;
    }
  });
  obs.observe(wv.document.getElementById("messages"), { childList: true, subtree: true });
  const streamingPart = view.hostToWebview.filter((m) => m.kind !== "message_final" && m.kind !== "run_state");
  for (const msg of streamingPart) wv.fromHost(msg);
  await wv.sleep(700);
  const shownLen = ((wv.document.querySelector(".message-assistant .blk-text .md") || {}).textContent || "").length;
  check("TC-036(c) 渲染批处理：全量重渲染次数 ≤ 60", renderCount <= 60 && shownLen > 0, `renders=${renderCount}, deltas=${deltas.length}, renderedTextLen=${shownLen}`);

  await host.deactivate();
  summary("TC-036");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

// TC-005 ｜ FR-CHAT-03 ｜ thinking 默认折叠 + 展开后流式（MOCK-THINK，宿主事件流 + webview DOM）
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "think";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "think-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 5000);

  // 宿主事件序：thinking t1..t4 → text d1..d3
  const kinds = view.hostToWebview;
  const thinking = kinds.filter((m) => m.kind === "thinking_delta").map((m) => m.delta);
  const texts = kinds.filter((m) => m.kind === "text_delta").map((m) => m.delta);
  check("TC-005-host thinking t1..t4 顺序", JSON.stringify(thinking) === JSON.stringify(["t1","t2","t3","t4"]), JSON.stringify(thinking));
  check("TC-005-host 随后 text d1..d3 顺序", JSON.stringify(texts) === JSON.stringify(["d1","d2","d3"]), JSON.stringify(texts));
  const iThink = kinds.findIndex((m) => m.kind === "thinking_delta");
  const iText = kinds.findIndex((m) => m.kind === "text_delta");
  check("TC-005-host thinking 先于 text", iThink >= 0 && iText > iThink);

  // webview DOM：回放宿主事件流
  const wv = bootWebview();
  for (const msg of kinds) wv.fromHost(msg);
  await wv.sleep(500);

  const details = wv.document.querySelector("details.thinking-details");
  check("TC-005(a) thinking 默认折叠（details 无 open 属性）", details && !details.hasAttribute("open"));
  const pre = wv.document.querySelector(".thinking-text");
  check("TC-005(b) 展开体流式内容 t1..t4 依序", pre && pre.textContent === "t1t2t3t4", pre && JSON.stringify(pre.textContent));
  const mdAll = [...wv.document.querySelectorAll(".md")];
  const md = mdAll.find((el) => el.textContent.includes("d1d2d3"));
  check("TC-005(c) thinking 后 d1..d3 渲染", !!md, mdAll.map((el) => JSON.stringify(el.textContent)).join(" / "));

  await host.deactivate();
  summary("TC-005");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

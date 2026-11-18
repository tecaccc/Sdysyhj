// TC-007 ｜ FR-CHAT-04 ｜ 工具卡要素/状态流转/大输出截断保留尾部/复制全部（MOCK-TOOLS，bash stdout≈100KB）
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "tools";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "tools-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final"), 8000);

  const events = view.hostToWebview;
  // 宿主侧：工具卡事件
  const starts = events.filter((m) => m.kind === "toolcall_start");
  check("TC-007(a1) 3 张工具卡（read/edit/bash）", starts.length === 3 && ["read","edit","bash"].every((t) => starts.some((s) => s.tool === t)), JSON.stringify(starts.map((s) => s.tool)));
  const bashStatus = events.filter((m) => m.kind === "toolcall_status" && starts.some((s) => s.id === m.toolCallId && s.tool === "bash"));
  const bashSummary = bashStatus.map((m) => m.summary).filter(Boolean).pop();
  check("TC-007(a2) bash 卡摘要含命令 seq 1 20000", (bashSummary || "").includes("seq 1 20000"), String(bashSummary));
  const readSummary = events.filter((m) => m.kind === "toolcall_status" && m.summary).map((m) => m.summary);
  check("TC-007(a3) 卡片均含关键参数摘要", readSummary.length >= 3, JSON.stringify(readSummary));

  // (b) 状态流转 进行中→成功（每卡 running → success）
  const perTool = {};
  for (const s of starts) {
    perTool[s.tool] = events.filter((m) => m.kind === "toolcall_status" && m.toolCallId === s.id).map((m) => m.status);
  }
  const flowOk = ["read","edit","bash"].every((t) => perTool[t] && perTool[t][0] === "running" && perTool[t].includes("success"));
  check("TC-007(b) 每卡状态 running→success", flowOk, JSON.stringify(perTool));

  // (c) bash 大输出截断且保留尾部
  const bashStart = starts.find((s) => s.tool === "bash");
  const finalBash = bashStatus.filter((m) => m.output !== undefined).pop();
  const orig100k = Array.from({ length: 20000 }, (_, i) => String(i + 1)).join("\n");
  check("TC-007(c1) bash 输出标记截断", finalBash && finalBash.outputTruncated === true, `outputTruncated=${finalBash && finalBash.outputTruncated}`);
  const shown = (finalBash && finalBash.output) || "";
  check("TC-007(c2) 展示文本为原输出尾段（以 20000 结尾）且远小于全量", shown.endsWith("20000") && shown.length < orig100k.length / 10, `shownLen=${shown.length}, origLen=${orig100k.length}, tail=${JSON.stringify(shown.slice(-12))}`);

  // (d) "复制全部" = 完整输出（走真实 chatPanel copy_output 通路 → vscode.env.clipboard）
  const vscodeStub = require("/tmp/r2harness/node_modules/vscode/index.js");
  await view.send({ kind: "copy_output", toolCallId: bashStart.id });
  await new Promise((r) => setTimeout(r, 150));
  const copied = vscodeStub._control.clipboard[0];
  check("TC-007(d) 复制内容 = 完整输出（长度≈原输出且含尾部）", copied !== undefined && copied === orig100k, copied === undefined ? "no clipboard write" : `copiedLen=${copied.length}, origLen=${orig100k.length}`);

  // (e) 卡片可展开查看输入/输出（含完整入参与出参字段）
  const wv = bootWebview();
  for (const msg of events) wv.fromHost(msg);
  await wv.sleep(400);
  const cards = wv.document.querySelectorAll(".toolcard");
  check("TC-007(e1) webview 3 张工具卡", cards.length === 3, `cards=${cards.length}`);
  const bashCard = [...cards].find((c) => c.querySelector(".toolcard-name") && c.querySelector(".toolcard-name").textContent === "bash");
  const argsEl = bashCard && bashCard.querySelector(".toolcard-args");
  const outEl = bashCard && bashCard.querySelector(".toolcard-output");
  check("TC-007(e2) bash 卡含完整入参（seq 1 20000）与出参字段", !!argsEl && argsEl.textContent.includes("seq 1 20000") && !!outEl && outEl.textContent.length > 0);
  check("TC-007(e3) 卡片为 details 可展开结构", !!bashCard.querySelector("details.toolcard-details"));
  const copyBtn = bashCard && bashCard.querySelector(".toolcard-copy");
  check("TC-007(e4) 截断时展示复制全部按钮", copyBtn && !copyBtn.hidden);

  await host.deactivate();
  summary("TC-007");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

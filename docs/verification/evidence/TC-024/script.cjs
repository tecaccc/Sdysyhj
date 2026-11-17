// TC-024 ｜ FR-FILE-02 ｜ '@' 触发文件选择并插入路径
const { bootHost, bootWebview, check, summary, readCalls, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/vharness/node_modules/vscode/index.js");

(async () => {
  const W1 = "/tmp/vharness/wsA";
  // 宿主侧：文件选择器仅枚举当前工作区
  const host = await bootHost({
    workspaceFolders: [{ uri: { fsPath: W1 } }],
    findFilesResult: [
      { fsPath: W1 + "/src/a.ts" },
      { fsPath: W1 + "/src/b.ts" },
      { fsPath: "/tmp/vharness/wsB/outside.ts" }, // 工作区外
    ],
    quickPicks: [(items) => items.find((it) => it.rel === "src/a.ts")],
  }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  // (a) webview 输入 '@' 触发文件选择器请求
  const wv = bootWebview();
  const input = wv.document.getElementById("input");
  input.value = "看下 @";
  input.selectionStart = input.selectionEnd = input.value.length;
  input.dispatchEvent(new wv.window.Event("input"));
  const fileRefReqs = wv.posted.filter((m) => m.kind === "insert_file_ref");
  check("TC-024(a1) 文本含 '@' 触发文件选择器请求", fileRefReqs.length === 1, JSON.stringify(wv.posted));

  // 宿主处理 insert_file_ref（真实 chatPanel.showFilePicker 通路）
  await view.send({ kind: "insert_file_ref" });
  await new Promise((r) => setTimeout(r, 200));
  const picks = vscodeStub._control.lastQuickPickItems || [];
  check("TC-024(a2) 选择器枚举范围限定当前工作区（排除工作区外文件）", picks.length === 2 && picks.every((it) => it.rel.startsWith("src/")), JSON.stringify(picks.map((p) => p.rel)));
  const fileRef = view.hostToWebview.filter((m) => m.kind === "file_ref").pop();
  check("TC-024(b1) 选中后回传路径 src/a.ts", fileRef && fileRef.path === "src/a.ts", JSON.stringify(fileRef));

  // (b) prompt 文本插入该路径（webview 端 replaceAt '@')
  wv.fromHost(fileRef);
  check("TC-024(b2) 输入框 prompt 插入 src/a.ts 路径", input.value.includes("@src/a.ts"), JSON.stringify(input.value));

  // (c) 发送后 mock 收到的消息含该路径（走真实 prompt 通路）
  wv.document.getElementById("btn-send").click();
  const prompt = wv.posted.filter((m) => m.kind === "prompt").pop();
  check("TC-024(c1) 发送 prompt 含路径", prompt && prompt.text.includes("src/a.ts"), JSON.stringify(prompt));
  await view.send(prompt);
  await waitFor(() => readCalls().some((c) => c.type === "prompt" && (c.args.message || "").includes("src/a.ts")), 6000);
  const hit = readCalls().filter((c) => c.type === "prompt" && (c.args.message || "").includes("src/a.ts"));
  check("TC-024(c2) $MOCKLOG/calls.jsonl 收到的消息含该路径", hit.length > 0, JSON.stringify(hit.map((h) => h.args.message)));

  await host.deactivate();
  summary("TC-024");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

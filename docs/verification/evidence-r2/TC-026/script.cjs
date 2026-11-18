// TC-026 ｜ FR-FILE-03 ｜ 右键“发送到 Pi”：文件路径/选区 → prompt 素材
const { bootHost, check, summary, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/r2harness/node_modules/vscode/index.js");

(async () => {
  const W1 = "/tmp/r2harness/wsA";
  // 编辑器场景：有选区
  const host = await bootHost({
    workspaceFolders: [{ uri: { fsPath: W1 } }],
    activeTextEditor: {
      document: {
        uri: { fsPath: W1 + "/src/a.ts" },
        getText: () => "const selected = 1;",
      },
      selection: { isEmpty: false, start: { line: 1 }, end: { line: 2 } },
    },
  }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  // (b) 文件路径 + 选区 → prompt 素材（命令处理逻辑）
  await vscodeStub._control.commands["sdysyhj.sendToPi"]({ fsPath: W1 + "/src/a.ts" });
  await new Promise((r) => setTimeout(r, 100));
  const prefill = view.hostToWebview.filter((m) => m.kind === "input_prefill").pop();
  check("TC-026(b1) 生成 prompt 素材含文件路径", prefill && prefill.text.includes("@src/a.ts"), JSON.stringify(prefill));
  check("TC-026(b2) 选区场景含选区文本", prefill && prefill.text.includes("const selected = 1;"), JSON.stringify(prefill));
  check("TC-026(b3) 选区含行号标注 L2-L3", prefill && /L2-L3/.test(prefill.text), JSON.stringify(prefill));

  // explorer 场景（无编辑器选区）：仅文件路径
  host.control.activeTextEditor = null;
  await vscodeStub._control.commands["sdysyhj.sendToPi"]({ fsPath: W1 + "/src/b.ts" });
  await new Promise((r) => setTimeout(r, 100));
  const prefill2 = view.hostToWebview.filter((m) => m.kind === "input_prefill").pop();
  check("TC-026(b4) explorer 发送含文件路径", prefill2 && prefill2.text.includes("@src/b.ts") && !prefill2.text.includes("选区"), JSON.stringify(prefill2));

  await host.deactivate();
  summary("TC-026");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

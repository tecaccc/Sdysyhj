// TC-038 ｜ NFR-02 ｜ 子进程崩溃自动重启一次 + 宿主异常隔离（MOCK-CRASH）
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/vharness/node_modules/vscode/index.js");

(async () => {
  process.env.MOCK_SCENARIO = "crash";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  const spawnCount = () => readCalls().filter((c) => c.event === "spawn").length;

  // SC-038a 第一次崩溃 → 自动重启一次
  const s0 = spawnCount();
  await view.send({ kind: "prompt", text: "crash-check-1", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "error"), 8000);
  await new Promise((r) => setTimeout(r, 500));
  const s1 = spawnCount();
  check("TC-038(a1) 第一次崩溃后自动重启一次（spawn 计数 +1）", s1 === s0 + 1, `before=${s0} after=${s1}`);
  const errs = view.hostToWebview.filter((m) => m.kind === "error");
  check("TC-038(a2) 产生用户提示（含重启说明）", errs.some((e) => /重启|异常退出/.test(e.message)), JSON.stringify(errs.map((e) => e.message)));

  // 第二次崩溃 → 不再无限重启
  await view.send({ kind: "prompt", text: "crash-check-2", mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "error").length >= errs.length + 1, 8000);
  await new Promise((r) => setTimeout(r, 800));
  const s2 = spawnCount();
  check("TC-038(b1) 第二次崩溃不再重启（spawn 计数不再增长）", s2 === s1, `after1=${s1} after2=${s2}`);
  const errs2 = view.hostToWebview.filter((m) => m.kind === "error");
  check("TC-038(b2) 反复崩溃有提示（停止自动重启）", errs2.some((e) => /停止自动重启|反复崩溃/.test(e.message)), JSON.stringify(errs2.map((e) => e.message).slice(-2)));

  // SC-038b 注入运行时异常（webview postMessage 抛异常）后执行 New Session 命令
  // （在健康宿主上单独验证：面板/宿主异常不得拖垮 VS Code）
  const host2 = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view2 = host2.resolveView();
  await view2.send({ kind: "ready" });
  await waitFor(() => view2.hostToWebview.some((m) => m.kind === "history_loaded"));
  view2.view.webview.postMessage = () => {
    throw new Error("injected webview failure");
  };
  let cmdOk = true;
  try {
    await vscodeStub._control.commands["sdysyhj.newSession"]();
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    cmdOk = false;
    console.log("newSession threw:", e.message);
  }
  const calls = readCalls();
  check("TC-038(c1) 注入异常后宿主存活：New Session 命令执行成功", cmdOk && calls.some((c) => c.type === "new_session"), `cmdOk=${cmdOk}, newSessionCalls=${calls.filter((c) => c.type === "new_session").length}`);
  check("TC-038(c2) 无宿主崩溃（进程存活即断言执行至此）", true);
  await host2.deactivate();

  await host.deactivate();
  summary("TC-038");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

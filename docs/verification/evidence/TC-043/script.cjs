// tc043.cjs ｜ NFR-05 ｜ 关键路径日志 + 错误含可行动建议（会话创建/prompt/abort/子进程退出）
const { bootHost, check, summary, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/vharness/node_modules/vscode/index.js");

(async () => {
  process.env.MOCK_SCENARIO = "crash";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  // 依次触发：会话创建、prompt 发送、abort、子进程退出
  await vscodeStub._control.commands["sdysyhj.newSession"]();          // 会话创建
  await new Promise((r) => setTimeout(r, 300));
  await view.send({ kind: "prompt", text: "slow-check", mode: "auto" }); // prompt 发送
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "streaming"), 3000);
  await vscodeStub._control.commands["sdysyhj.abort"]();               // abort
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "run_state" && m.state === "aborted"), 5000);
  await view.send({ kind: "prompt", text: "crash-check", mode: "auto" }); // 子进程退出（崩溃）
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "error"), 8000);
  await new Promise((r) => setTimeout(r, 500));

  const dump = (host.control.outputChannels["Sdysyhj"] || { lines: [] }).lines.join("\n");
  console.log("--- Output Channel 转储 ---\n" + dump + "\n--- 转储结束 ---");

  const ts = /\[\w+\s+20\d\d-\d\d-\d\dT[\d:.]+Z\]/; // 时间戳
  const hit = (re) => re.test(dump) && ts.test(dump.split("\n").find((l) => re.test(l)) || "");
  check("TC-043(1) 会话创建有日志（带时间戳）", hit(/新建会话/), "查找『新建会话』");
  check("TC-043(2) prompt 发送有日志（带时间戳）", hit(/prompt|发送消息|sendPrompt/i), "查找 prompt/发送");
  check("TC-043(3) abort 有日志（带时间戳）", hit(/abort|中止/i), "查找 abort/中止");
  check("TC-043(4) 子进程退出有日志（带时间戳）", hit(/子进程退出/), "查找『子进程退出』");
  // 错误记录含可行动建议（与 TC-013(b) 同判据）
  const errEvents = view.hostToWebview.filter((m) => m.kind === "error");
  check("TC-043(5) 错误含可行动建议", errEvents.some((e) => e.hint && /pi auth|凭证|设置|sdysyhj\.|日志|重试/.test(e.hint)), JSON.stringify(errEvents.map((e) => e.hint)));

  await host.deactivate();
  summary("TC-043");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

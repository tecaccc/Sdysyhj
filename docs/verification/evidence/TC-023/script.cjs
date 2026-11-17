// TC-023 ｜ FR-FILE-01 ｜ Pi 子进程 cwd 绑定规则（SC-023a/b/c）
const os = require("os");
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/vharness/node_modules/vscode/index.js");

async function run(label, workspaceFolders) {
  const host = await bootHost({ workspaceFolders }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "stream-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 6000);
  const spawns = readCalls().filter((c) => c.event === "spawn");
  const lastSpawn = spawns[spawns.length - 1] || {};
  return { host, view, spawnCwd: lastSpawn.cwd };
}

(async () => {
  const W1 = "/tmp/vharness/wsA";
  const W2 = "/tmp/vharness/wsB";

  const a = await run("SC-023a", [{ uri: { fsPath: W1 } }]);
  check("TC-023(a) SC-023a 单根工作区：子进程 cwd == W1", a.spawnCwd === W1, `cwd=${a.spawnCwd}`);
  await a.host.deactivate();

  const b = await run("SC-023b", [{ uri: { fsPath: W1 } }, { uri: { fsPath: W2 } }]);
  check("TC-023(b) SC-023b 多根工作区：cwd == 第一个文件夹 W1", b.spawnCwd === W1, `cwd=${b.spawnCwd}`);
  await b.host.deactivate();

  const c = await run("SC-023c", null);
  check("TC-023(c1) SC-023c 无工作区：允许聊天且 cwd == 用户主目录", c.spawnCwd === os.homedir(), `cwd=${c.spawnCwd}, homedir=${os.homedir()}`);
  const toasts = c.view.hostToWebview.filter((m) => m.kind === "toast" || m.kind === "error");
  check("TC-023(c2) 无工作区产生『文件工具受限』提示", toasts.some((t) => /文件工具受限/.test(t.text || t.message || "")), JSON.stringify(toasts));
  check("TC-023(c3) 无工作区仍可对话（收到流式回复）", c.view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8);
  await c.host.deactivate();

  summary("TC-023");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

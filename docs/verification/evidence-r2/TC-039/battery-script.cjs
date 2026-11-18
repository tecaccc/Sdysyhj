// tc039-battery.cjs ｜ TC-039 ｜ 触发尽量多的日志路径并转储 Output Channel（供哨兵脱敏扫描）
const fs = require("fs");
const path = require("path");
const { bootHost, waitFor } = require("./lib/common.cjs");

async function runScenario(name, scenario, promptText) {
  process.env.MOCK_SCENARIO = scenario;
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: promptText, mode: "auto" });
  await new Promise((r) => setTimeout(r, 2500));
  const dump = (host.control.outputChannels["Sdysyhj"] || { lines: [] }).lines.join("\n");
  fs.writeFileSync(path.join(process.env.MOCKLOG, "logs", `channel-${name}.txt`), dump);
  console.log(`--- channel-${name}.txt (${dump.length} bytes) ---`);
  console.log(dump);
  await host.deactivate();
}

(async () => {
  fs.mkdirSync(path.join(process.env.MOCKLOG, "logs"), { recursive: true });
  await runScenario("crash", "crash", "crash-check-auth-dump");
  await runScenario("error", "error", "err-check");
  await runScenario("noauth", "noauth", "noauth-check");
  await runScenario("stderr", "stderr", "stderr-check");
  await runScenario("stream", "stream", "stream-check");
  console.log("battery done");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

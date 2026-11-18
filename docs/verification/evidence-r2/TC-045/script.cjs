// tc045.cjs ｜ §8-1 复合 ｜ 端到端：内置运行时开箱即用 + 读文件→修改→执行命令（L2 真实 pi + mock provider）
// 判定组合：TC-035b（内置运行时）+ TC-001（流式）+ TC-005（thinking）+ TC-007（3 工具卡成功）
// 注：vsix 打包/本地安装（code --install-extension）需 VS Code 宿主与 vsce，离线环境不可执行 → 遗留问题。
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

(async () => {
  const agentDir = path.join(process.env.HOME, ".pi", "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync("/tmp/r2harness/wsA/src", { recursive: true });
  const aTs = "/tmp/r2harness/wsA/src/a.ts";
  fs.writeFileSync(aTs, 'const hello = "world";\nexport default hello;\n');
  fs.writeFileSync(
    path.join(agentDir, "models.json"),
    JSON.stringify({ providers: { mockllm: { baseUrl: "http://127.0.0.1:18434/v1", api: "openai-completions", apiKey: "MOCK-DUMMY-KEY", models: [{ id: "mock-small" }] } } }, null, 2)
  );
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "mockllm", defaultModel: "mock-small", defaultThinkingLevel: "off" }, null, 2));
  // 不预置 auth.json（§12 #9）；PATH 无 pi
  process.env.PATH = "/usr/bin:/bin";

  const server = spawn(process.execPath, ["/tmp/r2harness/mock-openai.js"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));

  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));

  const runtimeLog = host.control.outputChannels["Sdysyhj"].lines.join("\n");
  check("TC-045(1) 内置运行时启动（source=bundled，PATH 无 pi）", /source=bundled/.test(runtimeLog), runtimeLog.split("\n").find((l) => /pi 运行时/.test(l)) || "");

  await view.send({ kind: "prompt", text: "读取 src/a.ts，修改它，并执行一条命令（TASK-PLAN）", mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "message_final" && /TASK-COMPLETE/.test(JSON.stringify(m.message))), 60000);

  // TC-001 断言：流式回复（text delta 级）
  const deltas = view.hostToWebview.filter((m) => m.kind === "text_delta").map((m) => m.delta);
  check("TC-045(2) 流式回复（text delta ≥8）", deltas.length >= 8, JSON.stringify(deltas));

  // TC-005 断言：thinking 块（推理 delta，若 pi 映射 reasoning_content）
  const think = view.hostToWebview.filter((m) => m.kind === "thinking_delta").map((m) => m.delta);
  check("TC-045(3) thinking 块（推理增量）", think.length > 0, `thinkingDeltas=${think.length} ${JSON.stringify(think.slice(0, 4))}`);

  // TC-007 断言：read/edit/bash 3 张工具卡全部成功
  const starts = view.hostToWebview.filter((m) => m.kind === "toolcall_start");
  const tools = starts.map((s) => s.tool);
  check("TC-045(4a) 3 个工具调用 read/edit/bash", ["read", "edit", "bash"].every((t) => tools.includes(t)), JSON.stringify(tools));
  const finals = view.hostToWebview.filter((m) => m.kind === "toolcall_status" && m.status !== "running");
  const ok = ["read", "edit", "bash"].every((t) => {
    const s = starts.find((x) => x.tool === t);
    return s && finals.some((f) => f.toolCallId === s.id && f.status === "success");
  });
  check("TC-045(4b) 3 张工具卡全部成功", ok, JSON.stringify(finals.map((f) => ({ id: f.toolCallId, status: f.status }))));

  // 附加：任务真实完成（scratch 工作区 a.ts 被修改、命令输出）
  await new Promise((r) => setTimeout(r, 300));
  const edited = fs.readFileSync(aTs, "utf8");
  check("TC-045(5) 任务真实执行：src/a.ts 被修改", /HELLO-EDITED/.test(edited), JSON.stringify(edited));
  const bashOut = view.hostToWebview.filter((m) => m.kind === "toolcall_status" && /TC-045-ok/.test(m.output || ""));
  check("TC-045(6) 命令执行输出 TC-045-ok", bashOut.length > 0);

  // webview 呈现佐证
  const wv = bootWebview();
  for (const msg of view.hostToWebview) wv.fromHost(msg);
  await wv.sleep(500);
  check("TC-045(7) webview 呈现工具卡/流式/任务文本", wv.document.querySelectorAll(".toolcard").length >= 3 && /TASK-COMPLETE/.test(wv.document.body.textContent));

  await host.deactivate();
  server.kill();
  summary("TC-045");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

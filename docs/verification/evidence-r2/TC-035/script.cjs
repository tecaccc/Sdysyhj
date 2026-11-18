// tc035.cjs ｜ FR-CMD-05 ｜ PATH 优先 / 内置回退 / 显式指定 / 失败指引（SC-035a~d）
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

function setupL2Config() {
  const agentDir = path.join(process.env.HOME, ".pi", "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync("/tmp/r2harness/wsA/src", { recursive: true });
  const aTs = "/tmp/r2harness/wsA/src/a.ts";
  if (!fs.existsSync(aTs)) fs.writeFileSync(aTs, 'const hello = "world";\nexport default hello;\n');
  fs.writeFileSync(
    path.join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        mockllm: {
          baseUrl: "http://127.0.0.1:18434/v1",
          api: "openai-completions",
          apiKey: "MOCK-DUMMY-KEY",
          models: [{ id: "mock-small" }, { id: "mock-large" }],
        },
      },
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(agentDir, "settings.json"),
    JSON.stringify({ defaultProvider: "mockllm", defaultModel: "mock-small", defaultThinkingLevel: "off" }, null, 2)
  );
}

(async () => {
  setupL2Config();
  const server = spawn("node", ["/tmp/r2harness/mock-openai.js"], { stdio: "ignore", detached: false });
  await new Promise((r) => setTimeout(r, 600));

  const invLog = () => {
    const p = path.join(process.env.MOCKLOG, "pi-invocations.log");
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };

  // SC-035a（PATH 优先）：/tmp/r2harness/bin/pi 在 PATH 首位
  {
    const before = invLog().length;
    const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
    const view = host.resolveView();
    await view.send({ kind: "ready" });
    await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
    await view.send({ kind: "prompt", text: "stream-check", mode: "auto" });
    await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 8000);
    const inv = invLog();
    check("TC-035(a1) SC-035a 启动 PATH 中的 pi（pi-invocations.log 非空）", inv.length > before, `logBytes=${inv.length}`);
    const runtimeLog = host.control.outputChannels["Sdysyhj"].lines.join("\n");
    check("TC-035(a2) 运行时来源 = path（日志佐证）", /source=path/.test(runtimeLog), runtimeLog.split("\n").find((l) => /pi 运行时/.test(l)) || "");
    check("TC-035(a3) 对话成功（≥8 deltas）", view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8);
    await host.deactivate();
  }

  // SC-035b（内置回退）：PATH 无 pi → 插件内置运行时 + mock provider 对话成功
  // 注：harness 打包位置 /tmp/r2harness/build 的相对回退路径解析到 /tmp/node_modules（见报告口径说明）；
  //     打包形态（<ext>/dist + <ext>/node_modules）下的解析失败另见 defect-cmd05-prod-layout.cjs 证据。
  {
    const origPath = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
    const view = host.resolveView();
    await view.send({ kind: "ready" });
    await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
    await view.send({ kind: "prompt", text: "hello there", mode: "auto" });
    await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 30000);
    const runtimeLog = host.control.outputChannels["Sdysyhj"].lines.join("\n");
    check("TC-035(b1) SC-035b 使用内置运行时（source=bundled）", /source=bundled/.test(runtimeLog), runtimeLog.split("\n").find((l) => /pi 运行时/.test(l)) || "");
    const openai = fs.existsSync(path.join(process.env.MOCKLOG, "openai-calls.jsonl")) ? fs.readFileSync(path.join(process.env.MOCKLOG, "openai-calls.jsonl"), "utf8") : "";
    check("TC-035(b2) 内置运行时完成对话（mock provider 收到请求且 ≥8 deltas）", /chat\/completions/.test(openai) && view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, `openaiCalls=${(openai.match(/chat\/completions/g) || []).length}`);
    process.env.PATH = origPath;
    await host.deactivate();
  }

  // SC-035c（显式指定）：sdysyhj.piPath = $TMP/bin/pi
  {
    const before = invLog().length;
    const host = await bootHost({
      workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }],
      config: { "sdysyhj.piPath": "/tmp/r2harness/bin/pi" },
    }).activate();
    const view = host.resolveView();
    await view.send({ kind: "ready" });
    await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
    await view.send({ kind: "prompt", text: "stream-check", mode: "auto" });
    await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 8000);
    const runtimeLog = host.control.outputChannels["Sdysyhj"].lines.join("\n");
    check("TC-035(c1) 按显式路径启动（invocations.log 增长）", invLog().length > before);
    check("TC-035(c2) 运行时来源 = explicit（日志佐证）", /source=explicit/.test(runtimeLog), runtimeLog.split("\n").find((l) => /pi 运行时/.test(l)) || "");
    await host.deactivate();
  }

  // SC-035d（显式路径无效）：错误展示含详情 + 可行动指引
  {
    const host = await bootHost({
      workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }],
      config: { "sdysyhj.piPath": "/nonexistent/pi" },
    }).activate();
    const view = host.resolveView();
    await view.send({ kind: "ready" });
    await waitFor(() => view.hostToWebview.some((m) => m.kind === "error"), 4000);
    const err = view.hostToWebview.filter((m) => m.kind === "error").pop();
    console.log("SC-035d error:", JSON.stringify(err));
    check("TC-035(d1) 展示含错误详情（路径 /nonexistent/pi）", err && /nonexistent\/pi/.test(err.message), JSON.stringify(err));
    check("TC-035(d2) 可行动指引（设置/回退建议）", err && err.hint && /sdysyhj\.piPath|设置|自动模式|回退/.test(err.hint), err && err.hint);
    await host.deactivate();
  }

  server.kill();
  summary("TC-035");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

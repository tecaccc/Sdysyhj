// tc_models.cjs —— node tc_models.cjs <027|028|029>（MOCK-MODELS）
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");
const vscodeStub = require("/tmp/r2harness/node_modules/vscode/index.js");
const which = process.argv[2];

(async () => {
  switch (which) {
    case "027": {
      const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
      const view = host.resolveView();
      await view.send({ kind: "ready" });
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
      // (a) 命令/状态栏入口存在
      const manifest = require("/tmp/sdysyhj-verify-r2/package.json");
      const cmds = manifest.contributes.commands.map((c) => (c.command + " " + c.title).toLowerCase()).join("\n");
      check("TC-027(a) manifest 含 switch model 命令/入口", /switch model/.test(cmds), cmds.split("\n").join(" | "));
      // (b) get_available_models 候选进入状态模型
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.label === "mock-large"));
      await vscodeStub._control.commands["sdysyhj.switchModel"]();
      await waitFor(() => readCalls().some((c) => c.type === "set_model"), 4000);
      const calls = readCalls();
      check("TC-027(b) get_available_models 被调用且候选含 mock-small/mock-large", calls.some((c) => c.type === "get_available_models"), JSON.stringify(calls.filter((c) => c.type === "get_available_models")));
      const pickItems = vscodeStub._control.lastQuickPickItems || [];
      check("TC-027(b2) 候选 [mock-small,mock-large] 进入选择列表", pickItems.map((i) => i.label).sort().join(",") === "mock-large,mock-small", JSON.stringify(pickItems.map((i) => i.label)));
      // (c) set_model("mock-large") 调用被记录
      check("TC-027(c) set_model(mock-large) 记录", calls.some((c) => c.type === "set_model" && c.args.modelId === "mock-large"), JSON.stringify(calls.filter((c) => c.type === "set_model")));
      // (d) 状态栏模型字段更新
      const mi = view.hostToWebview.filter((m) => m.kind === "model_info").pop();
      check("TC-027(d) 状态栏模型字段更新为 mock/mock-large", mi && mi.model === "mock/mock-large", JSON.stringify(mi));
      await host.deactivate();
      break;
    }

    case "028": {
      const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
      const view = host.resolveView();
      await view.send({ kind: "ready" });
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
      const before = (view.hostToWebview.filter((m) => m.kind === "model_info").pop() || {}).thinkingLevel;
      // 切换等级命令（选 low）+ cycle 命令各一次
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.label === "low"));
      await vscodeStub._control.commands["sdysyhj.switchThinking"]();
      await waitFor(() => readCalls().some((c) => c.type === "set_thinking_level"), 4000);
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.level === "__cycle__"));
      await vscodeStub._control.commands["sdysyhj.switchThinking"]();
      await waitFor(() => readCalls().some((c) => c.type === "cycle_thinking_level"), 4000);
      const calls = readCalls();
      check("TC-028(a) set_thinking_level 与 cycle_thinking_level 调用被记录", calls.some((c) => c.type === "set_thinking_level") && calls.some((c) => c.type === "cycle_thinking_level"), JSON.stringify(calls.filter((c) => /thinking/.test(c.type || "")).map((c) => c.type)));
      const after = (view.hostToWebview.filter((m) => m.kind === "model_info").pop() || {}).thinkingLevel;
      check("TC-028(b) 状态栏等级字段值发生变化", before !== after && typeof after === "string", `before=${before} after=${after}`);
      await host.deactivate();
      break;
    }

    case "029": {
      // 切模型=mock-large、切等级 → 模拟插件/面板重载（host+webview 重建）→ 状态栏状态
      const host1 = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
      const view1 = host1.resolveView();
      await view1.send({ kind: "ready" });
      await waitFor(() => view1.hostToWebview.some((m) => m.kind === "history_loaded"));
      await view1.send({ kind: "prompt", text: "persist-setup", mode: "auto" });
      await waitFor(() => view1.hostToWebview.filter((m) => m.kind === "text_delta").length >= 8, 6000);
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.label === "mock-large"));
      await vscodeStub._control.commands["sdysyhj.switchModel"]();
      await waitFor(() => readCalls().some((c) => c.type === "set_model"), 4000);
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.label === "low"));
      await vscodeStub._control.commands["sdysyhj.switchThinking"]();
      await waitFor(() => readCalls().filter((c) => c.type === "set_thinking_level").length >= 1, 4000);
      const switched = view1.hostToWebview.filter((m) => m.kind === "model_info").pop();
      await host1.deactivate();

      const host2 = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/r2harness/wsA" } }] }).activate();
      const view2 = host2.resolveView();
      await view2.send({ kind: "ready" });
      await waitFor(() => view2.hostToWebview.some((m) => m.kind === "history_loaded"));
      const restored = view2.hostToWebview.filter((m) => m.kind === "model_info").pop();
      console.log("before reload:", JSON.stringify(switched), "| after reload:", JSON.stringify(restored));
      check("TC-029 重载后状态栏模型/等级与切换后一致（非默认值）", restored && restored.model === switched.model && restored.thinkingLevel === switched.thinkingLevel && restored.model === "mock/mock-large" && restored.thinkingLevel === "low", JSON.stringify({ switched, restored }));
      await host2.deactivate();
      break;
    }

    default:
      console.error("usage: node tc_models.cjs <027|028|029>");
      process.exit(2);
  }
  summary("TC-" + which);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

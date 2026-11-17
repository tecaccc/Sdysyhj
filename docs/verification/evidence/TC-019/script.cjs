// tc_sess.cjs —— 会话族一次性断言：node tc_sess.cjs <016|017|018|019|021|022|046>
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { bootHost, bootWebview, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

const which = process.argv[2];
const vscodeStub = require("/tmp/vharness/node_modules/vscode/index.js");
function sessionsTotal(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"role":"user"') || l.includes('"role":"assistant"')).length;
}

async function boot() {
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  return { host, view };
}

async function sendAndWait(view, text) {
  const before = view.hostToWebview.filter((m) => m.kind === "message_final").length;
  await view.send({ kind: "prompt", text, mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "message_final").length > before, 6000);
}

function lastStateResponse() {
  const rs = readCalls().filter((c) => c.event === "state_response");
  return rs.length ? rs[rs.length - 1].data : null;
}

(async () => {
  switch (which) {
    case "016": {
      const { host, view } = await boot();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "session_reset"));
      await sendAndWait(view, "TC-016-marker-hello");
      const firstReset = view.hostToWebview.filter((m) => m.kind === "session_reset").pop();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await waitFor(() => view.hostToWebview.filter((m) => m.kind === "session_reset").length >= 2);
      const secondReset = view.hostToWebview.filter((m) => m.kind === "session_reset").pop();

      const findOut = execSync(`find "$HOME/.pi" -name '*.jsonl' -type f | sort`, { shell: "/bin/bash" }).toString().trim().split("\n").filter(Boolean);
      fs.writeFileSync(path.join(process.env.MOCKLOG, "sessions-after.txt"), findOut.join("\n") + "\n");
      console.log("sessions-after.txt:\n" + findOut.join("\n"));
      check("TC-016(a1) 会话 A 的 JSONL 文件保留", findOut.length >= 1, `files=${findOut.length}`);
      const rgOut = execSync(`grep -l "TC-016-marker-hello" ${findOut.map((f) => JSON.stringify(f)).join(" ")} 2>/dev/null || true`, { shell: "/bin/bash" }).toString().trim();
      check("TC-016(a2) 旧会话含已发消息内容（marker 命中）", rgOut.length > 0, rgOut);
      check("TC-016(b) A、B 为不同会话 id（文件互异）", firstReset.sessionId !== secondReset.sessionId, `${firstReset.sessionId} vs ${secondReset.sessionId}`);
      check("TC-016(c) 会话文件仅位于 $HOME/.pi/ 下", findOut.every((f) => f.startsWith(process.env.HOME + "/.pi/")), JSON.stringify(findOut));
      await host.deactivate();
      break;
    }

    case "017": {
      const { host, view } = await boot();
      const sends = [2, 5, 9];
      for (let s = 0; s < sends.length; s++) {
        await vscodeStub._control.commands["sdysyhj.newSession"]();
        for (let i = 1; i <= sends[s]; i++) {
          await sendAndWait(view, `TC-017-S${s + 1}-M${i}`);
        }
      }
      const sessions = require("/tmp/vharness/build/sessionStore.cjs").listSessions("/tmp/vharness/wsA");
      console.log("listSessions:", JSON.stringify(sessions.map((s) => ({ title: s.title, modifiedAt: s.modifiedAt, messageCount: s.messageCount, name: s.name })), null, 1));
      check("TC-017(a) 列表恰含 3 项", sessions.length === 3, `items=${sessions.length}`);
      check("TC-017(b1) 每项含标题/时间/消息数三字段", sessions.every((s) => typeof s.title === "string" && s.title.length > 0 && s.modifiedAt > 0 && typeof s.messageCount === "number"));
      const counts = sessions.map((s) => s.messageCount).sort((x, y) => x - y);
      check("TC-017(b2) 消息数与 fixture 一致（2/5/9）", JSON.stringify(counts) === JSON.stringify([2, 5, 9]), `actual=${JSON.stringify(counts)} expected=[2,5,9]`);
      // (c) 选择某项切换：活动会话 id 变更
      const beforeId = lastStateResponse() && lastStateResponse().sessionId;
      vscodeStub._control.quickPicks.push((items) => items[items.length - 1]);
      await vscodeStub._control.commands["sdysyhj.showHistory"]();
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "session_reset"));
      const afterId = lastStateResponse() && lastStateResponse().sessionId;
      check("TC-017(c) 选择项触发切换（活动会话 id 变更）", beforeId !== afterId, `${beforeId} -> ${afterId}`);
      await host.deactivate();
      break;
    }

    case "018": {
      const { host, view } = await boot();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await sendAndWait(view, "TC-018-A1-marker1");
      await sendAndWait(view, "TC-018-A2-marker2");
      const stateA1 = lastStateResponse();
      const fileA = stateA1.sessionFile;
      const wcA1 = fs.readFileSync(fileA, "utf8").split("\n").filter(Boolean).length;
      // 切到 B
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await waitFor(() => view.hostToWebview.filter((m) => m.kind === "session_reset").length >= 2);
      // 切回 A（历史切换）
      vscodeStub._control.quickPicks.push((items) => items.find((it) => it.sessionPath === fileA));
      await vscodeStub._control.commands["sdysyhj.showHistory"]();
      await waitFor(() => view.hostToWebview.filter((m) => m.kind === "history_loaded").length >= 1);
      await new Promise((r) => setTimeout(r, 300));
      const histEvents = view.hostToWebview.filter((m) => m.kind === "history_loaded");
      const lastHist = histEvents[histEvents.length - 1];
      const texts = JSON.stringify(lastHist.messages);
      check("TC-018(a) 切回 A 渲染历史含前 2 条消息 marker", texts.includes("TC-018-A1-marker1") && texts.includes("TC-018-A2-marker2"));
      const stateA2 = lastStateResponse();
      const pick = (s) => ({ model: s.model && s.model.id, thinkingLevel: s.thinkingLevel, isCompacting: s.isCompacting, sessionFile: s.sessionFile, sessionId: s.sessionId, sessionName: s.sessionName });
      check("TC-018(b) 会话状态快照切换前后相等（含压缩状态字段）", JSON.stringify(pick(stateA1)) === JSON.stringify(pick(stateA2)), `before=${JSON.stringify(pick(stateA1))} after=${JSON.stringify(pick(stateA2))}`);
      await sendAndWait(view, "TC-018-A3-marker3");
      const wcA2 = fs.readFileSync(fileA, "utf8").split("\n").filter(Boolean).length;
      check("TC-018(c) 第 3 条消息续写同一会话 JSONL（wc -l 递增）", wcA2 > wcA1, `before=${wcA1} after=${wcA2} file=${fileA}`);
      await host.deactivate();
      break;
    }

    case "019": {
      const { host, view } = await boot();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "session_reset"));
      host.control.inputBoxes.push("TC-019-name");
      await vscodeStub._control.commands["sdysyhj.renameSession"]();
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "session_name"));
      const calls = readCalls();
      check("TC-019(a) calls.jsonl 含 set_session_name('TC-019-name')", calls.some((c) => c.type === "set_session_name" && c.args.name === "TC-019-name"), JSON.stringify(calls.filter((c) => c.type === "set_session_name")));
      const sn = view.hostToWebview.filter((m) => m.kind === "session_name").pop();
      check("TC-019(b) 会话状态名更新", sn && sn.name === "TC-019-name", JSON.stringify(sn));
      const sessions = require("/tmp/vharness/build/sessionStore.cjs").listSessions("/tmp/vharness/wsA");
      const titled = sessions.find((s) => s.title === "TC-019-name");
      check("TC-019(c) 历史列表项标题同步为 TC-019-name", !!titled, JSON.stringify(sessions.map((s) => s.title)));
      await host.deactivate();
      break;
    }

    case "021": {
      const { host, view } = await boot();
      for (let i = 0; i < 3; i++) {
        await vscodeStub._control.commands["sdysyhj.newSession"]();
        await waitFor(() => view.hostToWebview.filter((m) => m.kind === "session_reset").length >= i + 1);
      }
      const resets = view.hostToWebview.filter((m) => m.kind === "session_reset");
      check("TC-021(b1) 连续新建 3 会话各产生一次 session_reset", resets.length >= 3, `resets=${resets.length}`);
      const state = lastStateResponse();
      check("TC-021(b2) 任意时刻活动会话数 = 1（状态模型仅单 sessionId）", state && typeof state.sessionId === "string" && !Array.isArray(state.sessionId), JSON.stringify(state && { sessionId: state.sessionId }));
      const spawnArgs = readCalls().filter((c) => c.event === "spawn");
      const lastSpawn = spawnArgs[spawnArgs.length - 1] || {};
      check("TC-021(b3) 新建仅切换单活动会话（spawn 仅一 --session）", ((lastSpawn.args || []).filter((a) => a === "--session").length) <= 1, JSON.stringify(lastSpawn.args));
      const histAfterNew = view.hostToWebview.filter((m) => m.kind === "history_loaded").pop();
      check("TC-021(c) 新建后历史清空（仅历史项切换，不产生多活动会话）", histAfterNew && histAfterNew.messages.length === 0, JSON.stringify(histAfterNew && histAfterNew.messages.length));
      await host.deactivate();
      break;
    }

    case "022": {
      const { host, view } = await boot();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await sendAndWait(view, "TC-022-setup");
      const file = lastStateResponse().sessionFile;
      await new Promise((r) => setTimeout(r, 600)); // 等 markSynced 基线稳定
      const t0 = Date.now();
      fs.appendFileSync(file, `{"external":"probe","note":"simulated terminal pi write"}\n`);
      await waitFor(() => view.hostToWebview.some((m) => m.kind === "external_change"), 7000);
      const latency = Date.now() - t0;
      const ev = view.hostToWebview.filter((m) => m.kind === "external_change").pop();
      check("TC-022(a1) ≤5s 内发出外部修改提示", latency <= 5000, `latency=${latency}ms`);
      check("TC-022(a2) 提示文案含刷新类关键词/陈旧提示", /刷新/.test(ev.detail) || /陈旧|修改/.test(ev.detail), ev.detail);
      // webview 横幅（含“刷新”按钮）
      const wv = bootWebview();
      for (const msg of view.hostToWebview) wv.fromHost(msg);
      await wv.sleep(200);
      const banner = wv.document.getElementById("external-change-banner");
      check("TC-022(a3) webview 横幅含『刷新』入口", !!banner && banner.textContent.includes("刷新"), banner && banner.textContent);
      // (b) 不静默继续使用陈旧状态：下一次交互被提示拦截或触发自动刷新（二者其一）
      const histCountBefore = view.hostToWebview.filter((m) => m.kind === "history_loaded").length;
      const promptsBefore = readCalls().filter((c) => c.type === "prompt").length;
      await view.send({ kind: "prompt", text: "TC-022-after", mode: "auto" });
      await new Promise((r) => setTimeout(r, 800));
      const promptsAfter = readCalls().filter((c) => c.type === "prompt").length;
      const histCountAfter = view.hostToWebview.filter((m) => m.kind === "history_loaded").length;
      const autoRefreshed = histCountAfter > histCountBefore;
      const intercepted = promptsAfter === promptsBefore;
      console.log(`(b) 观察：未刷新情况下 prompt 被受理=${promptsAfter > promptsBefore}；自动刷新=${autoRefreshed}；横幅驻留=${!!wv.document.getElementById("external-change-banner")}`);
      check("TC-022(b) 下一次交互被提示拦截 或 触发自动刷新（二者其一）", intercepted || autoRefreshed, `拦截=${intercepted} 自动刷新=${autoRefreshed}（prompt 被受理=${promptsAfter > promptsBefore}）`);
      await host.deactivate();
      break;
    }

    case "046": {
      const { host, view } = await boot();
      await vscodeStub._control.commands["sdysyhj.newSession"]();
      await sendAndWait(view, "TC-046-M1");
      await sendAndWait(view, "TC-046-M2");
      await sendAndWait(view, "TC-046-M3");
      const file = lastStateResponse().sessionFile;
      const wc1 = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length;
      await host.deactivate(); // 模拟窗口重载（host+webview 重建）
      const boot2 = await boot(); // 新 host；扩展启动自动续接最近会话
      const hist = boot2.view.hostToWebview.filter((m) => m.kind === "history_loaded").pop();
      const texts = JSON.stringify(hist.messages);
      check("TC-046(a1) 重载后历史完整恢复（3 条 marker）", ["TC-046-M1", "TC-046-M2", "TC-046-M3"].every((mk) => texts.includes(mk)));
      const userCount1 = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"role":"user"')).length;
      await sendAndWait(boot2.view, "TC-046-M4");
      const wc2 = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length;
      const userCount2 = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"role":"user"')).length;
      check("TC-046(a2) 消息数 4（历史列表消息计数字段）", userCount2 === 4 && sessionsTotal(file) === 4, `用户发送=${userCount2}, 列表计数(user+assistant)=${sessionsTotal(file)} expected=4`);
      check("TC-046(a3) JSONL 连续续写（同一文件 wc -l 递增）", wc2 > wc1, `before=${wc1} after=${wc2} file=${file}`);
      const sessions = require("/tmp/vharness/build/sessionStore.cjs").listSessions("/tmp/vharness/wsA");
      console.log("history list after reload:", JSON.stringify(sessions.map((s) => ({ title: s.title, messageCount: s.messageCount }))));
      await boot2.host.deactivate();
      break;
    }

    default:
      console.error("usage: node tc_sess.cjs <016|017|018|019|021|022|046>");
      process.exit(2);
  }
  summary("TC-" + which);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

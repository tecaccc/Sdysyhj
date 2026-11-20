// T5 独立核验（TC-050 ④ 边界）：SC-050a 会话无痕（webview→宿主边界 + 源级）、
// SC-050b 不跨重载持久化（fresh 面板实例）、SC-050c idle 不自动滚动（观察窗 + 探针）。
"use strict";

const { execSync } = require("child_process");
const { createPanel, sleep } = require("/tmp/t5harness/lib/driver.js");

const BUNDLE = "/tmp/verify-t5/media/main.js";
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const DELTA = "x".repeat(100);
const STEP_MS = 360;

(async () => {
  console.log("== SC-050a（TC-050 ④ 会话无痕）：完整滚动交互不出现在 webview→宿主边界与源级 ==");

  // (iii-边界) 交互组：完整「默认跟随→打断→滚回恢复」序列，全量捕获出站消息
  const p = createPanel(BUNDLE);
  p.hostMessage({ kind: "run_state", state: "starting" });
  p.hostMessage({ kind: "run_state", state: "streaming" });
  p.hostMessage({ kind: "stream_start", messageId: "m-50a" });
  for (let i = 0; i < 8; i++) {
    p.hostMessage({ kind: "text_delta", messageId: "m-50a", index: 0, delta: DELTA + `【${i}】` });
    await p.settle(STEP_MS + 40);
    if (i === 3) p.userScrollToDistance(150); // 打断
    if (i === 5) p.userScrollToDistance(0); // 恢复
  }
  p.hostMessage({ kind: "message_final", messageId: "m-50a", message: { id: "m-50a", role: "assistant", blocks: [{ type: "text", text: "done" }], timestamp: 1 } });
  p.hostMessage({ kind: "run_state", state: "idle" });
  await p.settle(STEP_MS + 40);
  const knownKinds = new Set(["ready", "prompt", "abort", "open_history", "new_session", "switch_model", "switch_thinking", "rename_session", "insert_file_ref", "open_settings", "open_external", "refresh_session", "copy_output"]);
  const kinds = [...new Set(p.outbound.map((m) => m && m.kind))];
  check("(iii) 滚动交互期间出站消息 kind 全部 ∈ 已知 WebviewToHost 白名单", kinds.every((k) => knownKinds.has(k)), JSON.stringify(kinds));
  check("(iii) 出站消息无任何携带滚动/跟随状态的消息", !/scroll|follow/i.test(JSON.stringify(p.outbound)), JSON.stringify(p.outbound));
  check("(iii) 除初始 ready 外交互期间零出站（滚动不产生任何宿主可见副作用）", p.outbound.every((m) => m.kind === "ready"), JSON.stringify(p.outbound));

  // (iii-源级) FollowState 仅接线层引用；UiMessage 无跟随字段；扩展不写会话文件
  const grep = (pat, cwd = "/tmp/verify-t5") => execSync(`grep -rn ${pat} src/ webview/ || true`, { cwd, encoding: "utf8", shell: "/bin/bash" });
  const fsRefs = grep("-E '" + "FollowState|followState" + "'");
  const fsFiles = [...new Set(fsRefs.split("\n").filter(Boolean).map((l) => l.split(":")[0]))];
  check("(源级) FollowState 仅被 webview/main.ts 与自身引用", fsFiles.every((f) => f === "webview/main.ts" || f === "webview/render/followState.ts"), JSON.stringify(fsFiles));
  const uiMsg = execSync("sed -n '1,40p' src/panel/messages.ts", { cwd: "/tmp/verify-t5", encoding: "utf8" });
  check("(源级) UiMessage 类型无跟随/滚动字段", !/follow|scroll/i.test(uiMsg));
  const writers = execSync("grep -rn -E 'writeFile|appendFile|createWriteStream' src/ | grep -v -i 'log' || true", { cwd: "/tmp/verify-t5", encoding: "utf8", shell: "/bin/bash" });
  check("(源级) 扩展宿主侧无会话文件写入（会话 JSONL 由 pi 子进程产生）", writers.trim() === "", writers.trim().slice(0, 200));

  console.log("== SC-050b（TC-050 ④ 不跨插件/面板重载持久化）==");
  // 第 1 幕：以打断态收尾
  const p1 = createPanel(BUNDLE);
  p1.hostMessage({ kind: "run_state", state: "starting" });
  p1.hostMessage({ kind: "run_state", state: "streaming" });
  p1.hostMessage({ kind: "stream_start", messageId: "m-r1" });
  for (let i = 0; i < 8; i++) {
    p1.hostMessage({ kind: "text_delta", messageId: "m-r1", index: 0, delta: DELTA });
    await p1.settle(STEP_MS + 40);
  }
  p1.userScrollToDistance(200); // 中途滚离底部 >40px
  // 终稿文本与流式内容等长（真实语义：final 为权威完整终稿，内容不塌缩）
  const finalText = "round1-" + "y".repeat(900);
  p1.hostMessage({ kind: "message_final", messageId: "m-r1", message: { id: "m-r1", role: "assistant", blocks: [{ type: "text", text: finalText }], timestamp: 1 } });
  p1.hostMessage({ kind: "run_state", state: "idle" }); // 本轮自然结束
  await p1.settle(STEP_MS + 40);
  check("前置：第 1 轮以打断态收尾（final 重排后距底仍 >40px）", p1.metrics().distanceFromBottom > 40, JSON.stringify(p1.metrics()));

  // 第 2 幕：面板重载 = 全新浏览器全局 + 重新执行 bundle；宿主回放历史（含第 1 轮消息）
  const p2 = createPanel(BUNDLE);
  p2.hostMessage({ kind: "history_loaded", messages: [
    { id: "u1", role: "user", blocks: [{ type: "text", text: "q1" }], timestamp: 1 },
    { id: "m-r1", role: "assistant", blocks: [{ type: "text", text: finalText }], timestamp: 2 },
  ] });
  await p2.settle(STEP_MS + 40);
  check("前置：重载后历史回放完成（一次性初始定位落定，距底 0）", p2.metrics().distanceFromBottom === 0, JSON.stringify(p2.metrics()));
  await sleep(1000); // ≥1s 起算（TC 口径）
  // 变体 B（可判别）：重载后、第 2 轮发送前模拟用户上滚（若实现错误持久化打断态，则第 2 轮不跟随）
  p2.userScrollToDistance(150);
  check("前置：发送前用户滚至距底 150px（构造可判别初态）", p2.metrics().distanceFromBottom === 150);
  // 第 2 轮 prompt（宿主先回显 user_message——此时 idle，不自动滚动）→ starting/streaming → stream_start
  p2.hostMessage({ kind: "user_message", text: "q2" });
  await p2.settle(STEP_MS + 40);
  const afterUserMsg = p2.metrics();
  await sleep(10);
  check("idle 下 user_message 回显不自动滚动（④）", afterUserMsg.scrollTop === p2.metrics().scrollTop && afterUserMsg.distanceFromBottom >= 150, JSON.stringify(afterUserMsg));
  p2.hostMessage({ kind: "run_state", state: "starting" });
  p2.hostMessage({ kind: "run_state", state: "streaming" });
  p2.hostMessage({ kind: "stream_start", messageId: "m-r2" });
  await p2.settle(STEP_MS + 40);
  p2.hostMessage({ kind: "text_delta", messageId: "m-r2", index: 0, delta: DELTA + "【r2-0】" });
  await p2.settle(STEP_MS + 40);
  const first = p2.metrics();
  check("(b) 重载后第 2 轮首个增量渲染点即“在底部”（默认跟随，未沿用任何持久化旧值）", first.distanceFromBottom <= 40, JSON.stringify(first));
  for (let i = 1; i < 4; i++) {
    p2.hostMessage({ kind: "text_delta", messageId: "m-r2", index: 0, delta: DELTA });
    await p2.settle(STEP_MS + 40);
  }
  check("(b) 第 2 轮后续渲染点持续在底部", p2.metrics().distanceFromBottom <= 40, JSON.stringify(p2.metrics()));
  const probe1 = p1.persistenceProbe();
  const probe2 = p2.persistenceProbe();
  check("(b) 两个面板实例均未调用 vscode.getState/setState（无持久化读写）", probe1.getStateCalls === 0 && probe1.setStateCalls === 0 && probe2.getStateCalls === 0 && probe2.setStateCalls === 0, JSON.stringify([probe1, probe2]));

  console.log("== SC-050c（TC-050 ④ idle 不自动滚动）：载入落定 ≥1s 后 ≥2s 观察窗恒定 ==");
  const p3 = createPanel(BUNDLE);
  const history = [];
  for (let i = 0; i < 20; i++) {
    history.push({ id: `hu${i}`, role: "user", blocks: [{ type: "text", text: "u".repeat(80) + i }], timestamp: i });
    history.push({ id: `ha${i}`, role: "assistant", blocks: [{ type: "text", text: "a".repeat(120) + i }], timestamp: i + 0.5 });
  }
  p3.hostMessage({ kind: "history_loaded", messages: history });
  await p3.settle(STEP_MS + 40);
  const settled0 = p3.metrics();
  check("前置：载入定位落定（一次性初始定位允许，距底 0）", settled0.distanceFromBottom === 0, JSON.stringify(settled0));
  await sleep(1000);
  const samples = [];
  for (let i = 0; i < 21; i++) {
    // 观察窗 ≥2s：无任何用户操作，周期采样（100ms × 21）
    samples.push(p3.metrics().scrollTop);
    await sleep(100);
  }
  check("(c) 观察窗（≥2s）内 scrollTop 恒定（无自动滚动）", samples.every((s) => s === samples[0]), JSON.stringify([...new Set(samples)]));
  // 探针：idle 下消息区 DOM 增长（user_message 回显）也不触发自动滚动
  p3.hostMessage({ kind: "user_message", text: "idle-probe-消息内容".repeat(3) });
  await p3.settle(STEP_MS + 40);
  const probed = p3.metrics();
  check("(c) 探针：idle 下 DOM 增长（user_message 回显）不自动滚动", probed.scrollTop === samples[0] && probed.distanceFromBottom > 40, JSON.stringify(probed));

  console.log(`\nTC-050 接线层判定：${pass} PASS / ${failures.length} FAIL`);
  if (failures.length) {
    console.log("失败项：");
    failures.forEach((x) => console.log(`  - ${x}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

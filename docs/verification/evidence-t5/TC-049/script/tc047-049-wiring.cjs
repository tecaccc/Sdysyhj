// T5 独立核验（接线层）：驱动生产 webview bundle（/tmp/verify-t5/media/main.js），
// 按 TC-047/048/049/050 场景模拟 MOCK-SLOW/MOCK-STREAM 增量与确定性滚动，采样滚动度量序列。
// 观察契约：「跟随态(以滚动行为观测) + 滚动位置采样序列」；SC ↔ 本脚本映射见各场景注释。
"use strict";

const assert = require("assert");
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

const DELTA = "x".repeat(100); // MOCK-SLOW：每增量 100px（确定性布局：字符≈px）
const STEP_MS = 360; // >300ms 节流，保证每个 delta 独立成渲染点

/** MOCK-SLOW 一轮流式：n 个增量，每增量后采样；onAfter(i, m) 在每增量后回调。 */
async function slowStream(panel, { messageId, n, onAfter }) {
  panel.hostMessage({ kind: "stream_start", messageId });
  await panel.settle(STEP_MS + 40);
  const samples = [];
  for (let i = 0; i < n; i++) {
    panel.hostMessage({ kind: "text_delta", messageId, index: 0, delta: DELTA + `【d${i}】` });
    await panel.settle(STEP_MS + 40); // 渲染点（300ms 节流渲染 + MutationObserver 微任务）
    const m = panel.metrics();
    samples.push(m);
    if (onAfter) await onAfter(i, m);
  }
  return samples;
}

(async () => {
  console.log("== SC-047a（TC-047 ① 默认跟随）：MOCK-SLOW 全程无用户滚动，逐增量采样 ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "config", tailLines: 200, sendMode: "steer", workspaceLabel: "/tmp" });
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    const samples = await slowStream(p, { messageId: "m-47a", n: 14 });
    const overflow = samples.filter((s) => s.scrollHeight > s.clientHeight);
    check("(a) 存在超视口内容段（滚动度量有意义，布局代理已溢出）", overflow.length >= 8, `溢出样本 ${overflow.length}/14`);
    check("(a) 每个增量渲染点均“在底部”（≤40px）", samples.every((s) => s.distanceFromBottom <= 40), JSON.stringify(samples.map((s) => s.distanceFromBottom)));
    check("(a) 溢出后各渲染点距底=0（程序滚动到底）", overflow.every((s) => s.distanceFromBottom === 0));
    check("(c) 内容照常渲染：流式阶段末增量标记已入 DOM（跟随不影响渲染本身）", p.renderedHtml().includes("d13"));
    p.hostMessage({ kind: "message_final", messageId: "m-47a", message: { id: "m-47a", role: "assistant", blocks: [{ type: "text", text: "final" }], timestamp: 1 } });
    p.hostMessage({ kind: "run_state", state: "idle" });
    await p.settle(STEP_MS + 40);
    check("(c) 终稿整体替换后含权威终稿文本", p.renderedHtml().includes("final"));
  }

  console.log("== SC-047b（TC-047 ① 每轮重置）：第 1 轮中途打断+aborted 收尾 → 第 2 轮首个渲染点在底部 ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    // 第 1 轮：6 增量后用户上滚打断（同 SC-048 路径），随后 abort 收尾
    let round1AfterInterrupt = null;
    const s1 = await slowStream(p, {
      messageId: "m-47b-1",
      n: 8,
      onAfter: async (i, m) => {
        if (i === 5) {
          p.userScrollToDistance(150); // >40px 打断
          round1AfterInterrupt = p.metrics();
        }
      },
    });
    check("前置：第 1 轮打断后距底 150px（>40）", round1AfterInterrupt && round1AfterInterrupt.distanceFromBottom >= 100, JSON.stringify(round1AfterInterrupt));
    const afterInterruptSamples = s1.slice(6);
    check("前置：打断后增量不拉回底部（第 1 轮确实以打断态收尾）", afterInterruptSamples.every((s) => s.distanceFromBottom > 40), JSON.stringify(afterInterruptSamples.map((s) => s.distanceFromBottom)));
    p.hostMessage({ kind: "message_final", messageId: "m-47b-1", message: { id: "m-47b-1", role: "assistant", blocks: [{ type: "text", text: "r1" }], aborted: true, timestamp: 1 } });
    p.hostMessage({ kind: "run_state", state: "aborted" });
    p.hostMessage({ kind: "run_state", state: "idle" });
    await p.settle(STEP_MS + 40);
    // 第 2 轮
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    const s2 = await slowStream(p, { messageId: "m-47b-2", n: 5 });
    check("(b) 第 2 轮首个增量渲染点即“在底部”（≤40px）", s2[0].distanceFromBottom <= 40, JSON.stringify(s2[0]));
    check("(b) 第 2 轮后续各渲染点均在底部", s2.every((s) => s.distanceFromBottom <= 40), JSON.stringify(s2.map((s) => s.distanceFromBottom)));
    check("(c) 两轮内容均照常渲染（第 2 轮末增量标记 d4 已入 DOM）", p.renderedHtml().includes("d4"));
  }

  console.log("== SC-048（TC-048 ② 打断）：第 k 增量后上滚至 P（距底≥100px），后续 ≥10 增量采样 ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    let P = null;
    let distAtInterrupt = null;
    const samples = await slowStream(p, {
      messageId: "m-48",
      n: 18,
      onAfter: async (i, m) => {
        if (i === 7) {
          // k=8th 增量渲染后：模拟用户上滚到距底 150px（≥100px，明显越过阈值）
          p.userScrollToDistance(150);
          P = p.metrics().scrollTop;
          distAtInterrupt = p.metrics().distanceFromBottom;
        }
      },
    });
    check("前置：打断滚动设定为距底 150px", distAtInterrupt === 150, `实际 ${distAtInterrupt}`);
    const later = samples.slice(8); // 打断后 10 个增量
    check("(a) 打断后首个增量渲染不被拉回底部（跟随态已翻转为不跟随）", later[0].distanceFromBottom > 40, JSON.stringify(later[0]));
    check("(b) 后续每个增量渲染后 scrollTop 恒等于 P", later.every((s) => s.scrollTop === P), JSON.stringify(later.map((s) => s.scrollTop)));
    check("(b) ≥10 个增量样本", later.length >= 10, `实际 ${later.length}`);
    check("(c) 内容持续渲染：内容高度严格单调增长", later.every((s, i) => i === 0 || s.scrollHeight > later[i - 1].scrollHeight));
    check("(c) “停止跟随”≠“停止渲染”：末增量标记 d17 已入渲染 DOM", p.renderedHtml().includes("d17"));
    check("(b) 打断期间距底持续 >40px（未被隐性拉回）", later.every((s) => s.distanceFromBottom > 40), JSON.stringify(later.map((s) => s.distanceFromBottom)));
  }

  console.log("== SC-049（TC-049 ③ 恢复）：打断后分别滚回 0px 与恰 40px，各续 ≥10 增量采样 ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    // 打断
    await slowStream(p, {
      messageId: "m-49",
      n: 8,
      onAfter: async (i) => {
        if (i === 7) p.userScrollToDistance(150);
      },
    });
    // 恢复 1：滚回距底 0px
    p.userScrollToDistance(0);
    check("前置：滚回 0px 时距底=0", p.metrics().distanceFromBottom === 0);
    const after0 = [];
    for (let i = 0; i < 10; i++) {
      p.hostMessage({ kind: "text_delta", messageId: "m-49", index: 0, delta: DELTA + `【r1-${i}】` });
      await p.settle(STEP_MS + 40);
      after0.push(p.metrics());
    }
    check("(a/b) 滚回 0px 后每个增量渲染点均“在底部”（恢复即时生效，无确认操作）", after0.every((s) => s.distanceFromBottom <= 40), JSON.stringify(after0.map((s) => s.distanceFromBottom)));
    // 再次打断，恢复 2：滚回距底恰 40px（界值，界内一侧）
    p.userScrollToDistance(300);
    check("前置：再次打断（距底 300px）", p.metrics().distanceFromBottom === 300);
    p.userScrollToDistance(40);
    check("前置：滚回恰 40px（界值）", p.metrics().distanceFromBottom === 40);
    const after40 = [];
    for (let i = 0; i < 10; i++) {
      p.hostMessage({ kind: "text_delta", messageId: "m-49", index: 0, delta: DELTA + `【r2-${i}】` });
      await p.settle(STEP_MS + 40);
      after40.push(p.metrics());
    }
    check("(a/b) 滚回恰 40px 后每个增量渲染点均“在底部”（界值在界内恢复）", after40.every((s) => s.distanceFromBottom <= 40), JSON.stringify(after40.map((s) => s.distanceFromBottom)));
    check("(c) 恢复后内容照常渲染（r2-9 已入渲染 DOM）", p.renderedHtml().includes("r2-9"));
    // 界外一侧对照：滚回 41px 不恢复
    p.userScrollToDistance(300);
    p.userScrollToDistance(41);
    const after41 = [];
    for (let i = 0; i < 3; i++) {
      p.hostMessage({ kind: "text_delta", messageId: "m-49", index: 0, delta: DELTA + `【e-${i}】` });
      await p.settle(STEP_MS + 40);
      after41.push(p.metrics());
    }
    check("对照：滚回 41px（界外）不恢复跟随（距底持续 >40px）", after41.every((s) => s.distanceFromBottom > 40), JSON.stringify(after41.map((s) => s.distanceFromBottom)));
  }

  console.log(`\n接线层判定：${pass} PASS / ${failures.length} FAIL`);
  if (failures.length) {
    console.log("失败项：");
    failures.forEach((x) => console.log(`  - ${x}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

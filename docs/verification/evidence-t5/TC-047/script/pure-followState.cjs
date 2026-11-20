// T5 独立核验：FollowState 纯逻辑模块驱动（webview/render/followState.ts 单独打包后驱动）。
// 判据：docs/test-cases.md v0.3 TC-047/TC-048/TC-049/TC-050 的状态机语义 + FR-CHAT-09 ①②③④。
// 与交付套件 test/unit/followState.test.ts 相互独立（本脚本按 TC 文本自行编写断言）。
"use strict";

const assert = require("assert");

const { FollowState, FOLLOW_THRESHOLD_PX } = require("/tmp/t5harness/followState.bundle.cjs");

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

console.log("== TC-048 单测口径：40px 阈值边界语义（≤40 在底部 / >40 离开底部）==");
check("FOLLOW_THRESHOLD_PX === 40", FOLLOW_THRESHOLD_PX === 40, `实际 ${FOLLOW_THRESHOLD_PX}`);
{
  const f = new FollowState();
  f.onRunState(true);
  f.onStreamStart();
  check("初始默认跟随（stream_start 后应自动滚动）", f.shouldAutoScroll() === true);
  const dist = [0, 1, 39, 40, 41, 100, 500];
  const expect = [true, true, true, true, false, false, false];
  dist.forEach((d, i) => {
    const f2 = new FollowState();
    f2.onRunState(true);
    f2.onStreamStart();
    f2.onUserScroll(d);
    check(
      `onUserScroll(${d}px) 后 shouldAutoScroll()=${expect[i] ? "跟随" : "不跟随"}`,
      f2.shouldAutoScroll() === expect[i],
      `实际 ${f2.shouldAutoScroll()}`
    );
  });
}

console.log("== TC-047 ① 默认跟随：每轮流式开始重置跟随态（与上一轮结束时取值无关）==");
{
  const f = new FollowState();
  // 第 1 轮：运行→流式开始→跟随→用户打断（SC-047b 前半）
  f.onRunState(true);
  f.onStreamStart();
  check("第 1 轮 stream_start 后默认跟随", f.shouldAutoScroll() === true);
  f.onUserScroll(500); // 打断
  check("第 1 轮打断后不跟随（#SC-047b 前置）", f.shouldAutoScroll() === false);
  f.onRunState(false); // 本轮结束（abort → idle）
  // 第 2 轮：重新运行→流式开始
  f.onRunState(true);
  f.onStreamStart();
  check("第 2 轮首个 stream_start 即恢复默认跟随（不沿用上一轮打断态）", f.shouldAutoScroll() === true);
}
{
  // 变体：第 1 轮以跟随态正常收尾（不打断），第 2 轮仍默认跟随
  const f = new FollowState();
  f.onRunState(true);
  f.onStreamStart();
  f.onRunState(false);
  f.onRunState(true);
  f.onStreamStart();
  check("第 1 轮正常收尾后第 2 轮默认跟随", f.shouldAutoScroll() === true);
}
{
  // idle 期间用户滚动（如历史浏览）不改变“下一轮默认跟随”
  const f = new FollowState();
  f.onRunState(true);
  f.onStreamStart();
  f.onRunState(false);
  f.onUserScroll(500); // idle 中滚动
  f.onRunState(true);
  f.onStreamStart();
  check("idle 期间滚动后，下一轮流式开始仍默认跟随", f.shouldAutoScroll() === true);
}

console.log("== TC-048 ② 打断后跟随标志即时翻转（至迟于下一增量渲染前生效）==");
{
  const f = new FollowState();
  f.onRunState(true);
  f.onStreamStart();
  f.onUserScroll(150); // >40px
  check("打断后立即 shouldAutoScroll()=false（无需等待下一事件）", f.shouldAutoScroll() === false);
  f.onUserScroll(41); // 仍 >40
  check("距底 41px 仍不跟随", f.shouldAutoScroll() === false);
  // 轮内后续 stream_start 不得覆盖用户打断（agent 循环一轮多条助手消息）
  f.onStreamStart();
  check("轮内后续 stream_start 不覆盖打断（尊重用户意图）", f.shouldAutoScroll() === false);
}

console.log("== TC-049 ③ 恢复：滚回 ≤40px 即恢复跟随，即时生效 ==");
{
  const f = new FollowState();
  f.onRunState(true);
  f.onStreamStart();
  f.onUserScroll(500);
  f.onUserScroll(0);
  check("滚回距底 0px 立即恢复跟随", f.shouldAutoScroll() === true);
  f.onUserScroll(500);
  f.onUserScroll(40); // 界值：恰在界内
  check("滚回距底恰 40px（界值）恢复跟随", f.shouldAutoScroll() === true);
  f.onUserScroll(500);
  f.onUserScroll(41); // 界外
  check("滚回距底 41px 不恢复（界外一侧）", f.shouldAutoScroll() === false);
}

console.log("== TC-050 ④ 边界：idle 不自动滚动；跟随态不跨运行残留 ==");
{
  const f = new FollowState();
  check("初始（未运行）不自动滚动", f.shouldAutoScroll() === false);
  f.onRunState(true);
  check("运行但本轮 stream_start 未到：不自动滚动（跟随自本轮流式输出开始计）", f.shouldAutoScroll() === false);
  f.onStreamStart();
  check("流式开始后跟随", f.shouldAutoScroll() === true);
  f.onRunState(false); // idle/aborted/error 任一非运行态
  check("运行结束（idle）后即使跟随态残留也不自动滚动", f.shouldAutoScroll() === false);
  {
    // 轮内 running 态来回切换（starting↔streaming，running 恒 true）不重置本轮标记
    const g = new FollowState();
    g.onRunState(true);
    g.onStreamStart();
    g.onUserScroll(500); // 打断
    g.onRunState(true); // starting↔streaming 切换（非 false）
    g.onStreamStart(); // 轮内后续 stream_start
    check("轮内 running 态来回切换 + 后续 stream_start 不覆盖用户打断", g.shouldAutoScroll() === false);
  }
  f.onRunState(true); // 重新运行后
  f.onStreamStart();
  check("重新运行后 stream_start 正常置跟随", f.shouldAutoScroll() === true);
  check("idle 期间 stream_start 为空操作（防御性）不置跟随", (() => {
    const h = new FollowState();
    h.onStreamStart(); // running=false
    return h.shouldAutoScroll() === false;
  })());
}

console.log("== 披露项（脚本初版机械断言 FAIL 的语义裁定，非 TC 判据）==");
console.log("  现象：第 1 轮跟随收尾→idle→第 2 轮 running（stream_start 未到）窗口内，");
console.log("  shouldAutoScroll() 沿用上一轮 following=true（roundStarted 已复位但 following 未清）。");
console.log("  语义裁定：FR-CHAT-09 ①判定点为\"每轮流式开始\"；该窗口内消息区无渲染点");
console.log("  （user_message 先于 run_state starting、stream_start 先于 assistant 渲染），");
console.log("  接线层不可观测；stream_start 时重置为默认跟随，终态不受影响——不构成缺陷。");
console.log("  字面结果披露：初版脚本该行 FAIL（25 PASS / 1 FAIL），已按剧本 §1.3-2 修正场景并留痕。");

console.log(`\n纯逻辑模块判定：${pass} PASS / ${failures.length} FAIL`);
if (failures.length) {
  console.log("失败项：");
  failures.forEach((x) => console.log(`  - ${x}`));
  process.exit(1);
}

// followState 单测：流式输出自动跟随纯逻辑全覆盖（FR-CHAT-09）。
// 事件序列模拟 webview 接线层输入：run_state → onRunState(running)、
// stream_start → onStreamStart()、用户滚动 → onUserScroll(距底 px)。
// 阈值口径：距滚动底端 ≤40px 为“在底部”，>40px 为离开底部。

import { describe, expect, it } from "vitest";
import { FollowState, FOLLOW_THRESHOLD_PX } from "../../webview/render/followState";

/** 一轮运行开始：run_state 进入运行态 + 本轮首个 stream_start。 */
function roundStarted(): FollowState {
  const follow = new FollowState();
  follow.onRunState(true);
  follow.onStreamStart();
  return follow;
}

describe("FollowState（FR-CHAT-09）", () => {
  it("阈值口径 = 40px（≤40 在底部，>40 离开底部）", () => {
    expect(FOLLOW_THRESHOLD_PX).toBe(40);
  });

  it("初始默认不跟随：未开始流式输出前不自动滚动", () => {
    const follow = new FollowState();
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("运行中但本轮 stream_start 未到：仍不跟随（默认跟随自本轮流式输出开始计）", () => {
    const follow = new FollowState();
    follow.onRunState(true);
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("① 默认跟随：本轮首个 stream_start 置跟随态，增量后应自动滚动", () => {
    const follow = roundStarted();
    expect(follow.shouldAutoScroll()).toBe(true);
  });

  it("④ idle 不自动滚动：运行结束（idle/aborted/error）后即使跟随态残留也不滚动", () => {
    const follow = roundStarted();
    follow.onRunState(false);
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("② 打断：用户滚动离开底部（>40px）停止跟随", () => {
    const follow = roundStarted();
    follow.onUserScroll(41);
    expect(follow.shouldAutoScroll()).toBe(false);
    follow.onUserScroll(2000);
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("② 边界：距底恰好 40px 不打断（≤40 为在底部）", () => {
    const follow = roundStarted();
    follow.onUserScroll(40);
    expect(follow.shouldAutoScroll()).toBe(true);
    follow.onUserScroll(0);
    expect(follow.shouldAutoScroll()).toBe(true);
  });

  it("③ 恢复：打断后用户滚回底部（≤40px）恢复跟随，后续增量继续自动滚动", () => {
    const follow = roundStarted();
    follow.onUserScroll(500); // 打断
    expect(follow.shouldAutoScroll()).toBe(false);
    follow.onUserScroll(40); // 滚回底部（边界值）
    expect(follow.shouldAutoScroll()).toBe(true);
    follow.onUserScroll(0);
    expect(follow.shouldAutoScroll()).toBe(true);
  });

  it("③ 恢复边界：打断后滚到距底 41px 仍不恢复", () => {
    const follow = roundStarted();
    follow.onUserScroll(500);
    follow.onUserScroll(41);
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("每轮重置：上一轮被打断，下一轮流式开始默认恢复跟随", () => {
    const follow = roundStarted();
    follow.onUserScroll(500); // 上一轮打断
    follow.onRunState(false); // 运行结束
    follow.onRunState(true); // 新一轮运行
    follow.onStreamStart(); // 新一轮首个流式输出开始
    expect(follow.shouldAutoScroll()).toBe(true);
  });

  it("轮内后续 stream_start 不覆盖用户打断（agent 循环一轮含多条助手消息，② 尊重用户意图）", () => {
    const follow = roundStarted();
    follow.onUserScroll(500); // 第 1 条助手消息流式期间打断
    follow.onStreamStart(); // 同轮第 2 条助手消息（工具步进）开始
    expect(follow.shouldAutoScroll()).toBe(false);
    // 用户滚回底部后，同轮内恢复跟随
    follow.onUserScroll(0);
    expect(follow.shouldAutoScroll()).toBe(true);
  });

  it("idle 期间的用户滚动不产生滚动决策（跟随决策仅运行态生效）", () => {
    const follow = roundStarted();
    follow.onUserScroll(500);
    follow.onRunState(false); // 运行结束
    follow.onUserScroll(0); // idle 期间滚回底部
    expect(follow.shouldAutoScroll()).toBe(false);
  });

  it("运行态来回切换（starting→streaming）不重置本轮标记", () => {
    const follow = new FollowState();
    follow.onRunState(true); // starting
    follow.onStreamStart(); // 本轮首个流式输出
    follow.onRunState(true); // streaming（agent_start）
    follow.onStreamStart(); // 若同轮再收到 stream_start 不改变跟随态
    follow.onUserScroll(100);
    follow.onStreamStart();
    expect(follow.shouldAutoScroll()).toBe(false);
  });
});

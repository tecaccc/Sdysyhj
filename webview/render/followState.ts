// 流式输出自动跟随（FR-CHAT-09）：纯逻辑状态机，无 DOM 依赖。
// 输入滚动度量（视口底缘距滚动底端的像素距离）与运行/流式事件，输出是否自动滚动的跟随决策；
// DOM 度量与滚动执行由 webview 接线层（main.ts）负责，消息追加/增量后的滚动决策统一走本模块。
// 跟随为会话内瞬时 UI 状态：不持久化、不产生消息级标记（④）。

/** “在底部”判定阈值：视口底缘距滚动底端 ≤40px（FR-CHAT-09 ①）。 */
export const FOLLOW_THRESHOLD_PX = 40;

/** 每轮流式输出自动跟随的跟随决策状态机。 */
export class FollowState {
  private following = false;
  private running = false;
  /** 本轮运行内是否已重置过跟随态（仅本轮首个 stream_start 生效）。 */
  private roundStarted = false;

  /**
   * 运行状态变化（run_state：starting/streaming → true；idle/aborted/error → false）。
   * 运行结束即解除“本轮”标记，下一轮首个 stream_start 重新默认跟随；
   * 非运行（idle 等）期间一律不自动滚动（FR-CHAT-09 ④）。
   */
  onRunState(running: boolean): void {
    this.running = running;
    if (!running) this.roundStarted = false;
  }

  /**
   * 每轮流式开始（本轮运行内首个 stream_start）：默认置跟随态（FR-CHAT-09 ①）。
   * agent 循环一轮可含多条助手消息，轮内后续 stream_start 不重置——
   * 用户打断须跨消息保持，不得被下一步开始覆盖（② 尊重用户意图）。
   */
  onStreamStart(): void {
    if (!this.running || this.roundStarted) return;
    this.roundStarted = true;
    this.following = true;
  }

  /**
   * 用户滚动：距滚动底端 >40px 停止跟随（②打断）；≤40px 恢复跟随（③恢复）。
   * 增量渲染引起的内容增长不产生用户滚动事件，不会误触发打断。
   */
  onUserScroll(distanceFromBottom: number): void {
    this.following = distanceFromBottom <= FOLLOW_THRESHOLD_PX;
  }

  /** 消息追加/增量渲染后的滚动决策：true = 保持“在底部”（滚到底），false = 不推动滚动位置。 */
  shouldAutoScroll(): boolean {
    return this.running && this.following;
  }
}

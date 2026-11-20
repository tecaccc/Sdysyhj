# TASK-003 ｜ Issue #1「第二条消息报错」缺陷修复流水线

> 来源：GitHub Issue #1（tecaccc，2026-11-20 09:54 +0800，type:bug）
> 链接：https://github.com/tecaccc/Sdysyhj/issues/1
> 流水线：缺陷单 → 研发修复 → 交付验收 → 独立核验 → 发版 0.1.1 → 回写 Issue 闭环
> 状态：研发派发中

## 1. 缺陷单

#D-01 ｜ P1 ｜ FR-SESS-07 ｜ 会话外部修改检测误报——插件自身轮转写入被判为"插件之外修改"，第二条消息遭横幅/拦截

- **复现（用户报）**：会话中发送第二条消息即报「当前会话在插件之外被修改（如终端 pi 写入同一会话）。 当前显示可能为陈旧状态。」
- **代码级确定性路径**（总调度分析，2026-11-20）：
  1. 面板激活且续接既有会话时（`mostRecentSession` → `refreshState` → `watcher.track(file)`），会话文件进入跟踪；
  2. 发送消息 → pi 子进程在 **turn_start 边界**将 user 条目落盘（证据：`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` `_commitBoundaryDrafts`——条目追加即 `_emit({type:"entry_appended"})`）；
  3. `SessionFileWatcher` 每 2500ms 轮询 mtime/size，**不区分运行状态**（`src/session/sessionStore.ts` 设计注释明言"插件**空闲时**检测"，实现却无条件轮询）；
  4. `handleEvent` 的 default 分支把 `entry_appended` 仅记 debug 日志，**不参与基线同步**；`markSynced()` 仅在 assistant `message_final`（piBridge.ts:805）、回 idle（:502）等时机调用——**turn_start user 条目写入无任何豁免**；
  5. 模型首响应延迟 > 2.5s（thinking 模型常态）时，轮询必落在"已落盘、未 markSynced"窗口 → `onExternalChange` → `sessionStale=true` + 横幅 + 后续 `sendPrompt` 拦截。
  - 时序旁证：全新会话首轮 `sessionFile=null`（watcher 惰性）→ 首条消息不报；面板重开/重载后续接会话 → 第二条消息进入跟踪态 → 报错。与用户"第二条消息报错"完全吻合。
- **期望**：需求基线 v0.2.2 口径 C + FR-SESS-07——仅**真实外部修改**（非本插件 pi 子进程写入）才提示/拦截；本插件自身轮转写入不得误报。
- **实际**：如上，误报 + 拦截合法发送。
- **裁决**：产品缺陷（总调度，2026-11-20）。

**附带缺陷（同文件同机制，一并修）**

#D-02 ｜ P2 ｜ FR-SESS-07 ｜ 全新会话的外部修改检测失效（漏报方向）：`sessionFile` 仅在 start/crash/new/switch 的 `refreshState` 中学习，新会话首轮结束后仍为 null → watcher 永不跟踪。

## 2. 修复要求（研发 Agent 契约）

- **R1**：`handleEvent` 收到 `entry_appended` → `watcher.markSynced()`（本插件子进程落盘的精确信号）。
- **R2**：运行态门控——`starting/streaming` 期间检测到的变化只吸收（更新基线）不报警；回 `idle/aborted` 时恢复检测并 `markSynced`。建议 `SessionWatcherLike` 增加 `setSuspended(bool)` 语义。
- **R3**：`agent_settled` 时若 `sessionFile` 为 null → `refreshState()` 补学（#D-02）。
- **R4**：回归测试 ≥3 场景（运行中内部写入不误报；空闲外部写入 ≤5s 检出；idle 后迟到 entry_appended 不误报）+ "第二条消息"集成重放；不得放宽既有断言；`npm run typecheck/build/verify:unit/verify:integration` 全绿。
- **R5**：`docs/technical-design.md` FR-SESS-07 机制描述与追溯表同步。
- 边界：只写 `src/`、`test/`、工程文件、`docs/technical-design.md`；**禁 git 写操作**；不碰 requirements/test-cases/verification/tasks。

## 3. 流水线记录

- 2026-11-20 ~09:55 总调度：巡检发现 Issue #1，分诊 type:bug，根因分析完成（证据见 §1）
- 2026-11-20 总调度：缺陷单 #D-01/#D-02 立案，R1-R5 契约下达，派发研发 Agent（fresh context）
- 通道事件：Issue 标签写入（agent:in-progress）触发 MCP 交互表单待人工提交，暂未生效；标签批次合并至闭环回写时重试，不阻塞流水线

## 4. 发版计划

- 版本：0.1.0 → **0.1.1**（versioning.md：PATCH +1、五处一致、`v0.1.1` annotated tag、CHANGELOG 条目注明 Issue #1 与 #D-01/#D-02）
- 触发条件：核验报告相关 TC PASS + 交付验收通过

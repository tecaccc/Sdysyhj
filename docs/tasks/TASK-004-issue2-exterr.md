# TASK-004 ｜ Issue #2「扩展打开之后总是报扩展错误」处置流水线

> 来源：GitHub Issue #2（tecaccc，2026-11-20 13:36 +0800，type:bug）
> 链接：https://github.com/tecaccc/Sdysyhj/issues/2
> 流水线：根因分析 → 双轨（产品澄清 + 研发修复）→ 交付验收 → 独立核验 → 发版 0.1.2 → 回写 Issue 闭环
> 状态：已闭环（发版 0.1.2）；Issue #2 回写评论于 2026-11-21 补发落地，打标+关闭表单待人工提交（见 §8）

## 1. 根因分析（总调度，2026-11-20 14:1x）

**报错文本定位**：错误文案逐字匹配 pi 运行时扩展系统（`@earendil-works/pi-coding-agent`）：
- `core/extensions/runner.js:482` `invalidate(message="This extension ctx is stale after session replacement or reload…")`
- `core/agent-session.js:1081` `dispose()` → invalidate；`:3104` `reload()` → invalidate
- 触发链：会话替换/重载（newSession/switchSession/reload/dispose）后，扩展异步回调（定时器/连接完成等）调用已作废 ctx → `assertActive()` throw → `extension_error` RPC 事件

**本机实测证据**：
- 本机无 `~/.pi/agent/extensions` 目录；每个 pi 子进程仍加载随附扩展（`extension_ui_request` 事件：`setStatus mcp`/`setStatus pi-loop`/`setWidget subagent-async`）——来自 `~/.pi/agent/npm`（loop/subagents）与核心 MCP（github）
- 用户面板子进程会话 `01a1f771`（13:33:16 创建，cwd=本仓库，含真实测试对话）——用户在 v0.1.1 发版后开面板测试，期间创建新会话
- 复现尝试 4 次（spawn+get_state；new_session @300ms/1s/2s 竞态；switch_session；活跃会话 --session 续接）：热 MCP 缓存下均未触发——触发依赖上游异步时序（推断：冷缓存 MCP 连接进行中发生会话替换）；机制与文案已在上游源码钉死
- **结论：上游根因，非 Sdysyhj 源码缺陷；Sdysyhj 无法消除上游事件，只应对展示负责**

## 2. 缺陷单（Sdysyhj 侧）

#D-03 ｜ P1 ｜ FR-CHAT-07（展示通道口径）｜ `extension_error` 展示治理缺陷：上游扩展噪音以持久错误卡片呈现且信息丢失

- 复现（用户报）：开面板即见「⚠ 扩展错误：This extension ctx is stale…」卡片，每次打开重复（Issue #2）
- 期望：需用户行动的错误才进聊天区错误卡片（FR-CHAT-07 原文列举：provider 报错/子进程崩溃/未配置凭证）；上游扩展通知应走非阻断通道且可定位、不重复
- 实际：`piBridge.ts:696` 将 `extension_error` 直接 `emit("error")` → webview `showError` 持久卡片；丢弃 `extensionPath`/`event` 字段（protocol.ts:153 已有）；无去重；hint 硬编码指向本机不存在的目录
- 裁决：产品缺陷（总调度）

## 3. 修复契约（研发 R1-R5）

- R1 `extension_error` 改走 toast（非阻断，一次性）+ `logger.warn` 全字段（extensionPath/event/error）
- R2 同键去重：相同 error+extensionPath 在窗口期（60s）内不重复 toast（日志仍全量）
- R3 toast 文案含扩展路径与错误首行（截断），尾部指引「详情见 Output『Sdysyhj』」；不再输出误导 hint
- R4 回归测试：单测（通道选择/字段透出/去重/日志）+ 集成（fake pi 发 extension_error 断言 toast 与去重）；不放宽既有断言
- R5 technical-design.md：FR-CHAT-07/FR-CMD-02 相关行 + 缺陷表 #D-03 同步
- 边界：只写 src/、test/、工程文件、docs/technical-design.md；禁 git 写操作；不写 requirements（产品轨负责）

## 4. 产品轨（口径澄清落档）

- 产品 Agent：requirements.md §12 续号澄清——`extension_error`（上游 pi 扩展系统通知）展示通道=非阻断通知（toast），完整字段（extensionPath/event/error）写入 Output 日志；FR-CHAT-07 错误卡片范围不变（需用户行动的错误）。属纯澄清，无 FR 范围/优先级变化。

## 5. 发版计划

- 0.1.1 → **0.1.2**（PATCH +1，五处一致，CHANGELOG 注明 Issue #2/#D-03 与上游根因说明）
- Issue #2 回复含：根因说明（上游）、本仓修复（展示治理）、用户侧建议（升级 pi / 规避 / 上游反馈）

## 6. 流水线记录

- 2026-11-20 13:4x-14:1x 总调度：巡检发现 Issue #2，根因分析（上游定位+本机实测+4 次复现尝试）→ 分诊：上游根因 + 本仓 #D-03
- 2026-11-20 总调度：TASK-004 立案，双轨派发：产品 Agent（澄清落档）∥ 研发 Agent（R1-R5）
- 2026-11-20 ~15:0x 产品 Agent：澄清 #14 落档（requirements v0.2.3，仅该文件）；权限核验通过；commit `d101316`
- 2026-11-20 ~15:0x 研发 Agent：R1-R5 交付（handleExtensionError：toast+去重+全字段日志；单测+6/集成+1）；自测 103+31 全绿；commit `95cb259`
- 2026-11-20 总调度 ④ 交付验收：**通过**。写权限合规（双轨各自边界内）；亲自复跑四项全绿；集成 3 连跑稳定。标签 `ready-for-verify-r4` 已推送
- 2026-11-20 15:05-16:10 核验 Agent（fresh context，/tmp 克隆）：独立重放 23/23、套件复跑、TC-013/TC-031 定向；30 分钟超时中断一次（恢复后续）；监督请求：压力项首轮缺失（总调度指令事实错误，已更正负责）→ 裁决 A 补跑 → ALL-PASS（5×31/31）
- 2026-11-20 总调度：报告完整性检查通过（七件套，两处诚实披露）→ **核验裁决：PASS**；cherry-pick 合入 `de52e2f`

## 7. 发版记录（versioning.md §5）

- 前置确认：核验 PASS + 交付验收通过 ✅
- 步骤 2-5（机械步骤，总调度代执行，同 v0.1.1 披露口径）：0.1.1→0.1.2；CHANGELOG 置顶条目（含上游根因说明）；四项自测全绿（103/31）；`sdysyhj-0.1.2.vsix`（8778 文件 20.41MB）；旧 vsix 已移除
- 步骤 6 一致性门禁：四处一致 ✅；密钥扫描 CLEAN ✅
- 步骤 7：commit `chore(release): v0.1.2` + annotated tag `v0.1.2` + push
- 步骤 8：GitHub Release 未启用（保持先例）

## 8. Issue #2 回写预案

- 通道限制（2026-11-20 时）：MCP 令牌无 Issue 评论写权限（403），回复文本留档于此，供人工粘贴；关闭+打标走交互表单（type:bug + agent:done + closed/completed）
- 回复要点：①上游根因（pi 扩展系统 stale-ctx，非本插件缺陷）；②本仓修复 v0.1.2（toast+去重+全字段日志+可定位）；③用户侧建议：升级 pi 版本可试、错误本身不影响聊天功能、持续复现可向上游反馈；④核验报告链接

## 9. 补发回写记录（2026-11-21，总调度巡检第 1 轮）

- 2026-11-21 12:35 巡检发现：Issue #2 仍 open、零评论、无标签（11-20 闭环仅落地到发版，通道两段均未送达：评论 403 + 表单未提交）——与 Issue #1 同病（见 TASK-003 勘误）
- 令牌权限已变：`add_issue_comment` 今已可用（#1 评论同日落地）→ 按 §8 预案补发闭环评论 ✅：`issuecomment-7057394805`（全文含上游根因/#D-03 修复/用户建议/证据链）
- 未竟：打标 `type:bug`+`agent:done` + 关闭（completed）仍需交互表单——与 #1 的待提交表单逐个处理（一次一张，避免叠表）；落地后回填于此

## 闭环终态(2026-11-27)

- Issue #2 已打标 `type:bug` + `agent:done` 并关闭(completed)——**REST 直写通道落地**(github-operations.md §2.4;2026-11-27 14:53 +0800)。
- 勘误:同 TASK-003——表单三天不可提交系 App UI 在终端宿主不可渲染所致;闭环评论(11-21,issuecomment-7057394805)与打标关闭(11-27)双段均落地,本任务彻底闭环。

# TASK-001 · Sdysyhj VS Code 插件 MVP 研发流水线

> 产出者：总调度 Agent ｜ 创建：2026-11-17 ｜ 状态：进行中

## 1. 任务登记

| 项 | 内容 |
|---|---|
| 输入通道 | A（人类直接输入） |
| 需求素材 | `docs/technical-design.md`（人类指定处理对象）+ `docs/requirements.md` v0.1-draft |
| 分诊结论 | `type:feature` → 进入研发流水线（非 question，不需直答回写） |
| 目标 | 依据需求基线与技术基线，完成 Sdysyhj VS Code 插件 MVP 的开发、盲测与独立核验 |
| 失败回路上限 | N = 2 轮 |

## 2. 流水线计划与状态

| 步骤 | 动作 | 执行者 | 状态 |
|---|---|---|---|
| ① 分诊 → 需求素材 | 整理人类输入，分类派发 | 总调度 | ✅ 完成 |
| ② 需求文档 | 按 §6 契约整理 `docs/requirements.md` | 产品 Agent（fresh context） | ✅ 完成（v0.2） |
| ②' 程序化检查 | 契约完整性 + 写权限（git diff）核验 | 总调度 | ✅ 通过（见 §7） |
| 【审批点1】需求基线 | 总调度审查 FR 范围/优先级/边界/验收标准 | 总调度裁决（人类授权） | ✅ 2026-11-17 通过，基线冻结 |
| ③a 开发 + 自测 | 按需求基线 + 技术方案实现 MVP | 研发 Agent（fresh context） | ✅ 完成（P0 全量+P1 尽力） |
| ③b 盲写测试用例 | 仅依据需求基线写 `docs/test-cases.md` | 测试 Agent（fresh context，禁读 src/） | ✅ 完成（TC-001~046） |
| 【审批点2】测试用例 | 总调度审查覆盖度与可判定性 | **总调度裁决**（人类授权） | ✅ 2026-11-17 通过 |
| ④ 研发交付 | 自测全绿 + FR 追溯表 + 标签 `ready-for-verify` | 研发 Agent | ✅ R2 件验收通过（`ce2c7a2`，标签 `ready-for-verify-r2`） |
| ⑤ 独立核验 | 干净工作区检出标签，逐 TC 执行出报告 | 测试 Agent（核验，全新上下文） | 🔄 **第 2 轮核验中**（invocation `2170e0a4`） |
| ⑥ 闭环/失败回路 | PASS → 交付总结；FAIL → 缺陷清单回研发（≤2 轮） | 总调度 | 🔄 第 1 轮修复已交付，待第 2 轮核验结论 |

## 3. 审批点记录

| 审批点 | 发起时间 | 结论 | 备注 |
|---|---|---|---|
| AP1 需求基线 | 2026-11-17 | ✅ **通过（总调度裁决）** | 裁决依据：⑥' 检查全过 + 素材全覆盖 + 验收标准可判定；基线冻结 commit `3116f53` |
| AP2 测试用例 | 2026-11-17 | ✅ **通过（总调度裁决）** | 裁决依据：26/26 FR 映射、P0 全自动可判、UI 项有自动兜底、环境离线隔离；产物 commit `fdda6f2` |

## 4. 失败回路与裁决

- 重试计数：**1 / 2**（第 1 轮修复中）
- 裁决记录：
  - 2026-11-17 口径裁决（核验歧义）：① 运行状态= idle/streaming，"已中止"为消息级标记，中止后回 idle（缺陷 #3 定为产品缺陷）；② 消息数= user+assistant 总数（缺陷 #5 解除）；③ FR-SESS-07 仅提示不拦截 = 静默继续，不满足（缺陷 #4 维持产品缺陷）。均为口径澄清，无范围/优先级变化，无需人类通报；基线 v0.2.2 同步。
  - 2026-11-17 缺陷归属：产品缺陷 #1/#2/#3/#4/#6 → 研发 Agent；用例基线缺陷（TC-026a/TC-039/§0 契约/消息数口径）→ 测试 Agent；均不构成结论冲突，无需上报人类。

## 5. 权限核验约定（写权限矩阵 → git 历史）

| 角色 | 允许写 | 核验方式 |
|---|---|---|
| 总调度 | `docs/tasks/` | — |
| 产品 Agent | `docs/requirements.md` | 收产物时 `git diff --name-only` 逐一核验，越界 = 交付不合格退回 |
| 研发 Agent | `src/`、`webview/`、`test/`、工程文件 | 同上 |
| 测试 Agent | `docs/test-cases.md`、`docs/verification/` | 同上 |

## 6. 事件日志

- 2026-11-17 总调度：接收通道 A 输入（处理对象 `docs/technical-design.md`），分诊为 `type:feature`，登记 TASK-001
- 2026-11-17 总调度：建立 git 基线快照（commit `ae00bbb`，流水线启动前状态，作为权限核验与证据链起点）
- 2026-11-17 总调度：派发产品 Agent（fresh context）按 §6 契约整理需求基线
- 2026-11-17 产品 Agent：交付 `docs/requirements.md` v0.2（最小修订：+FR-CMD-05、+FR-SESS-07、FR-CHAT-04/NFR-03 补充验收细节，详见修订记录）
- 2026-11-17 总调度：程序化检查发现修订记录日期误写 2026-06-10 → 退回产品 Agent → 已修正为 2026-11-17
- 2026-11-17 总调度：发起【审批点1】，等待人类裁决；通过后基线冻结（commit 需求基线）并并行派发研发/测试 Agent
- 2026-11-17 总调度：归档产品 Agent 交付汇报（覆盖结论：素材已全覆盖；汇报中 FR 计数 25 为笔误，程序化扫描实为 26 条，以检查记录为准）
- 2026-11-17 人类裁决：**取消审批点"人类必审"，改由总调度裁决**（流程变更经人类批准）；总调度修订 agent-workflow.md（commit `c9b0b20`），`agent:auto` 豁免机制随之取消，§8 失败/冲突上报人类机制保留
- 2026-11-17 总调度 AP1 裁决：**通过**。依据：契约检查全过、相对素材全覆盖、26 条 FR 验收标准可判定、边界明确；需求基线 v0.2 冻结（commit `3116f53`）
- 2026-11-17 总调度：并行派发 ③a 研发 Agent（invocation `6b37a5f4`，实现 MVP，P0 必达）与 ③b 测试 Agent（invocation `d015c07a`，盲写用例，禁读实现侧）；两者互相不可见，git 写操作统一由总调度代执行（避免并行 index 竞争）
- 2026-11-17 测试 Agent：交付 docs/test-cases.md（TC-001~TC-046，26/26 FR 映射，8 项 UI checklist 均有自动兜底）；权限核验通过（仅新增该文件）；commit `fdda6f2`
- 2026-11-17 总调度 AP2 裁决：**通过**。用例覆盖度与可判定性达标；其上报 10 项需求歧义转入基线修订流程
- 2026-11-17 总调度：10 项歧义影响面评估 = 验收口径澄清，无 FR 范围/优先级变化（不触发人类通报）→ 逐项裁决 → 派产品 Agent 产出 requirements.md v0.2.1（§12 澄清，commit 见下）→ 已 follow_up 通知研发 Agent 对齐口径（#1-#8 摘要）
- 2026-11-17 产品 Agent：交付 requirements.md v0.2.1（10 项澄清入 §12 + 修订记录）；权限核验通过；commit `667b337`
- 2026-11-17 备注：写用例的测试 Agent 已退出，其歧义裁决通知以本任务单与 requirements.md §12 为权威记录（用例经复核无需修改）
- 2026-11-17 研发 Agent：完成 MVP 交付（基线 v0.2.1 口径全对齐：版本下限判据、thinking 透传、600-delta 零丢失集成测试、JSONL 一致性重放等）；自测 build/unit 79/integration 24 全绿
- 2026-11-17 总调度 ④ 交付验收：**通过**。复核项：① 复跑自测一致（build ✅ / unit 9 文件 79 用例 ✅ / integration 3 文件 24 用例 ✅）；② FR 追溯表 26/26；③ 写权限合规（tracked 仅 docs/technical-design.md 变更 + 允许范围内工程文件）；④ .gitignore 覆盖 node_modules；⑤ verify:unit/verify:integration 脚本名未改。交付 commit `e9ae693`，标签 `ready-for-verify` 已打
- 2026-11-17 总调度：派发 ⑤ 测试 Agent（核验，全新上下文，invocation `b022d8e6`）：干净检出标签、按 TC-001~046 逐条执行、产出 verification-plan.md + report-e9ae693.md；UI 手工项标 MANUAL 不计 FAIL（列遗留），三平台项列遗留
- 2026-11-17 测试 Agent（核验）：交付 report-e9ae693.md + verification-plan.md + evidence/（49 项）；权限核验通过；总结论 **FAIL**（PASS 25 / FAIL 8 / SKIP 3 / MANUAL 10；逐 FR：PASS 18 / PARTIAL 5 / FAIL 2（FR-CMD-05、FR-CMD-02）/ 二期 2）；commit `38aef45`
- 2026-11-17 总调度：报告完整性检查通过（§6 契约齐备）；启动失败回路第 1 轮，并行派发：研发 Agent（修复 #1/#2/#3/#4/#6，invocation `b996966f`）、产品 Agent（基线 v0.2.2 口径澄清，invocation `8f4d019e`）、测试 Agent（用例基线 4 项修正，invocation `61bd44fa`）
- 2026-11-17 产品 Agent：交付 requirements.md v0.2.2（口径 #11-#13）；权限核验通过；commit `7b22af1`
- 2026-11-17 测试 Agent：交付 test-cases.md v0.2（消息数口径 + 3 项断言方法学修正，矩阵不变，盲写保持）；权限核验通过；commit `3be510a`
- 2026-11-17 研发 Agent：交付第 1 轮修复件（#1 打包布局解析重写、#2 stderr/异常接线、#3 状态回 idle、#4 stale 拦截、#6 四类日志；回归测试 +10 单测/+5 集成；FR 追溯表同步）
- 2026-11-17 总调度 ④ 交付验收（修复件）：**退回**。写权限 ✅、追溯表 26/26 ✅、build/unit 89 ✅，但 verify:integration 复跑间歇失败 2/6 次（defects-regression#2 MOCK-STDERR：stderr 原文与 agent_settled 时序竞态）→ 违反确定性要求，退回研发（invocation `844ac41f`）：要求产品侧顺序保证或有界确定性等待 + 并行负载下 10 连跑全绿
- 2026-11-17 事件记录：修复任务首派（invocation `844ac41f`）因模型服务端瞬态故障（503 system_memory_overloaded）中断，未产生有效改动（工作区检查与退回时一致，无污染）；同任务已重发（invocation `24aab952`）继续执行
- 2026-11-17 事件记录 2：重发任务再次因 503 中断（服务端内存 91.1%）；本次中断前已产生部分进展（新增 test/unit/stderr-ordering.test.ts，方向=方案1 产品侧顺序保证；rpcClient/piBridge 增量修改，变更量 366+/40- → 424+/44-），现场保留待续做；总调度策略：退避 270s 后重发（定时器已臂），不计失败回路重试次数（基础设施抖动≠产品缺陷回路）
- 2026-11-18 09:35 定时器触发：退避期满，重发研发 Agent 续做竞态修复（invocation `4bf06c71`，从现场部分改动续做，方向=方案 1 顺序保证）
- 2026-11-18 研发 Agent：竞态修复交付——stderr 排空屏障（agent_settled 有序派队 + 两连 setImmediate 让出，FIFO 保序）；新增 stderr-ordering.test.ts 确定性复现；21 次集成全绿（10+10+1，含 3 路并行压测 loadavg 3.2）；自测 tsc/build/unit 91/integration 29 全绿
- 2026-11-18 总调度 ④ 交付验收（R2 件）：**通过**。写权限零越界 ✅、追溯表 26/26 ✅、tsc/build ✅、integration 5×5 并行负载全绿 ✅、unit 91/91 ✅；commit `ce2c7a2`，标签 `ready-for-verify-r2` 已打
- 2026-11-18 总调度：派发第 2 轮核验（全新上下文，invocation `2170e0a4`）：全量重验 TC-001~046 + 缺陷 #1-#6 重点回归 + 集成压测 5 连跑 + NFR 安全专项重测；产物 report-ce2c7a2.md + evidence-r2/；用例判定以 v0.2 + 口径 #11-#13 为准
- 2026-11-18 事件记录 3：pendant 平台工具面整体不可用（wait/message/agent 均 not found，疑与当日服务过载同源）；第 2 轮核验 Agent 疑似中断（evidence-r2 停在 TC-001/005/007 后 50+ 分钟无写入）。处置：① 中断残留证据提交留痕（`5a5fd26`）；② 按“不静默换通道”纪律向人类明示后，启用备用通道——原生 subagent（worker）以独立 worktree 运行第 2 轮核验（run `2946991f`）；③ pendant 恢复后若原核验 Agent 也产出报告，择一采信并留痕对比
- 2026-11-18 事件记录 4：备用通道 worktree 隔离创建失败（EACCES：默认基目录 /data/workspace/worktrees 父目录 root 所有；run `2946991f` 失败留痕于 pi-subagents handoff）。改用零写权隔离：worker 不写主仓库，产物落 /tmp/r2-staging/，测试在 /tmp clone 执行，完成由总调度合入（run `a27abe6b`）——与可能复活的 pendant 核验 Agent 零写冲突
- 2026-11-17 交付检查待办：研发 Agent 施工中已产生 node_modules/、package.json、package-lock.json（未跟踪）；收产物时核验 .gitignore 已覆盖 node_modules，且测试约定（verify:unit/verify:integration）未被改名

## 7. 收产物检查记录（②'）

| 检查项 | 方法 | 结果 |
|---|---|---|
| FR 编号表：26 条 FR 均含优先级与非空验收标准 | grep/awk 程序化扫描 | ✅ |
| 明确不做范围（§5）、非功能需求（§6） | 章节存在性 | ✅ |
| 写权限：仅 `docs/requirements.md` 被修改 | `git diff --name-only`（基线 `ae00bbb` 对比） | ✅ 越界写入 0 处 |
| 事实性核验（日期等） | 人工抽查 | ⚠️ 1 处日期误写，已退回修正 ✅ |

遗留待办（记入后续）：`docs/technical-design.md` 头部"对应需求：v0.1-draft"引用已过期，属研发 Agent 产物，待研发阶段同步为 v0.2。

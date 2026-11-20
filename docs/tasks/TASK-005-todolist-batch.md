# TASK-005 ｜ TODO-List 双项批次（通道 A：滚动跟随优化 + 工具卡状态缺陷）

> 来源：人类输入 TODO-List.md（2026-11-20，通道 A）
> 素材原文：
> 1.【优化】模型在回答的过程中，窗口默认不跟随最新消息。期望默认跟随模型的最新输入，如果鼠标滚动打断了则按照用户意图实现；
> 2.【BUG】所有工具的调用状态始终是"进行中"
> 流水线：产品基线修订 → AP1 → 研发 ∥ 测试盲写 → 交付验收 → 独立核验 → 发版 0.1.3
> 状态：已闭环（发版 0.1.3，tag 推送触发 CI 自动发布）

## 1. 总调度根因分析（#D-04，2026-11-20 16:3x）

#D-04 ｜ P1 ｜ FR-CHAT-04 ｜ 工具调用卡片状态永远"进行中"（直播转）

- 复现：任意含工具调用的对话轮（用户报：所有工具；面板会话 01a1f771 可佐证）
- 根因（webview/render/messages.ts）：
  1. agent 循环时序：含工具卡的助手消息先 `message_final` → webview `finalize()`；`toolResult` 必然**晚于**该 final 到达；
  2. `finalize()` 执行 `this.blocks.clear()`，`createFinalBlock()` 重建 DOM 但不回填 `this.blocks`（:296-313, :318-345）；
  3. `toolcallStatus()` 遍历 `this.blocks` 匹配 ToolCardView（:287-294）——final 后恒为空 → 状态更新必然丢失 → 永远 running。
- 为何历史正常：`refreshHistory` 按序处理 + 尾部收敛循环（piBridge.ts:567-574）修正快照；仅**直播转路径**必现。
- 期望：FR-CHAT-04 验收——工具卡状态随执行结果更新（running→success/error）
- 裁决：产品缺陷（总调度）

## 2. 产品轨任务

- 新增 FR（滚动跟随优化）：默认跟随最新输出；用户向上滚动即停止跟随（尊重意图）；滚回底部恢复跟随；验收标准可判定（总调度 AP1 裁决）
- #D-04 无需新 FR（FR-CHAT-04 既有验收覆盖），缺陷登记随任务单

## 3. 流水线记录

- 2026-11-20 16:3x 总调度：接收通道 A 输入（TODO-List.md 两项），#D-04 根因钉死（§1），TASK-005 立案，派发产品 Agent（基线修订 v0.3）
- 2026-11-20 ~17:2x 产品 Agent：FR-CHAT-09 落档（验收四条全可判定+§5 排除项）；AP1 裁决通过，基线 v0.3 冻结 `9f1a4d2`
- 2026-11-20 ~17:2x 测试 Agent（盲写）：TC-047~052 + 覆盖矩阵 27/27；AP2 裁决通过 `b2c4d33`
- 2026-11-20 ~18:0x 研发 Agent：#D-04 修复（finalize 回填 blocks）+ FR-CHAT-09（followState 纯逻辑+薄接线）；unit 117/integration 31 全绿；5 项设计偏差均有需求依据；commit `13da513`
- 2026-11-20 总调度 ④ 交付验收：**通过**（写权限合规、复跑全绿、3 连跑稳定）。标签 `ready-for-verify-r5` 已推送
- 2026-11-20 18:19-19:0x 核验 Agent（fresh context，/tmp/verify-t5）：分段归档策略生效（11 个增量 commit）；30 分钟超时一次（报告阶段，恢复补写）；**总结论 PASS**（TC-047~050 逐条自动 PASS、TC-052 含负对照 11/11、压力 5/5、负对照 2 项判别力自证、诚实披露 5 项）
- 2026-11-20 总调度：报告完整性检查通过 → **核验裁决 PASS**；核验产物压缩合入 `bd08fbb`

## 4. 发版记录（versioning.md §5 + CI 新剧本）

- 步骤 2-6（机械步骤，总调度代执行，同 v0.1.1/0.1.2 披露口径）：0.1.2→0.1.3；CHANGELOG 置顶；四项自测全绿（117/31）；vsix 打包 8773 文件 20.39MB（首次遇 npm registry 瞬时 404，重试即过，已留痕）；四处一致+密钥扫描 CLEAN
- 追加：.vscodeignore 补 DevelopmentGuidelines//TODO-List.md/.pi-loop.json（对齐 c122da6 本地保留决策，防本地打包与 CI 产物不一致——v0.1.1/0.1.2 本地 vsix 曾含已移出追踪的规范目录，CI 产物不含，无功能影响仅体积差异）
- 步骤 7：commit + annotated tag `v0.1.3` + push——按新剧本（ecc0554/81ae3d8）tag 推送自动触发：一致性门禁→全量测试→打包→Marketplace（Trusted Publishing）+ GitHub Release（附 vsix）
- 观察：CI 首次自动发版执行结果待确认（Trusted Publishing 策略若未配置，Marketplace 步骤将失败、GitHub Release 仍应成功，可用 workflow_dispatch 补跑）
- 流程观察项（核验报告 O-2）：任务单未随交付标签入库（docs/tasks 在交付 commit 后追加）——后续批次改为随研发交付一并提交

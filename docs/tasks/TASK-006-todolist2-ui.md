# TASK-006 ｜ TODO 批次二：聊天面板 UI/UX 改造 + 功能补缺（通道 A）

> 来源：人类输入 TODO-List.md「待实现」8 项（2026-11-20，通道 A）
> 流水线：可行性侦察 → 产品基线修订（v0.3→v0.4）→ AP1 → 研发 ∥ 测试盲写 → 交付验收 → 独立核验 → 发版 0.1.4
> 状态：已闭环（发版 0.1.4，tag 推送触发 CI 自动发布）

## 1. 总调度可行性侦察（2026-11-20 21:0x）

| # | 原文 | 类型 | 可行性与依据 |
|---|---|---|---|
| 1 | 聊天面板居中、宽度适中（当前左至右铺满） | 纯样式 | webview CSS（max-width + margin auto） |
| 2 | 去掉聊天框上方添加文件按钮，改为输入 @ 触发选择 | 交互调整 | `btn-file`（main.ts:24）可移除；@ 触发选择器已有（FR-FILE-02）。注：原文"触发旋转"按"触发选择"理解（口径澄清入基线） |
| 3 | 键入 / 无法触发 PI 相关命令 | **功能补缺**（原二期 P2 → 本次转正） | pi RPC `get_commands` 已支持（扩展命令/prompt 模板/skills，含名称与描述，rpc-mode.js:562-588）——`/` 前缀弹出补全菜单可行 |
| 4 | 聊天框改圆角矩形 | 纯样式 | CSS |
| 5 | 发送按钮改箭头图标（去中文文字） | 纯样式 | CSS/SVG |
| 6 | 用户消息右侧气泡包裹；模型回复左侧无气泡；去 User/assistant 标记改时间 | 布局重构 | webview 消息渲染重构 |
| 7 | 面板下方具备模型选择能力（功能缺失） | **功能补缺** | `listModels`/`setModel` RPC 已有（FR-MOD-01 命令面板路径）——底部内联选择器为 UI 接线 |
| 8 | 面板下方显示上下文用量信息 | **功能补缺** | 协议 `Usage`（input/output/cacheRead/cacheWrite/totalTokens+cost，message_update 携带）+ get_state `contextWindow`——piBridge 当前未消费，需捕获并透出 |

## 2. 流水线记录

- 2026-11-20 21:0x 总调度：接收通道 A 批次二（8 项），可行性侦察完成（§1），TASK-006 立案，派发产品 Agent（基线 v0.4 修订）
- 2026-11-21 ~10:2x 产品 Agent：v0.4 落档（2 新增+4 修订 FR）；AP1 裁决通过 `a5c0339`
- 2026-11-21 ~10:3x 测试 Agent（盲写）：TC-053~061+矩阵 29/29；AP2 裁决通过（含 TC-060 解析容差 ≤1% 采纳）`6165cb4`
- 2026-11-21 研发 Agent：8 项全实现（含 commandMenu/format 纯逻辑模块）；unit 153/integration 31 全绿+并行负载 10 轮；超时一次（汇报阶段，恢复补交）；commit `0791106`；交付验收 PASS `ready-for-verify-r6`
- 2026-11-21 核验 Agent：DOM shim 深度核验超时一次（恢复续做）；**总结论 PASS（R6）**：TC-053~061 全过（126 独立断言+源级断言）、复跑 153/31、压力 5/5、TC-059 方式局限披露；产物合入 `8810782`
- 2026-11-21 总调度：核验裁决 PASS → 发版 0.1.4（§3）

## 3. 发版记录（versioning.md §5 + CI 剧本）

- 0.1.3→0.1.4；CHANGELOG 置顶；四项自测全绿（153/31）；vsix 8774 文件 20.4MB；四处一致+密钥扫描 CLEAN
- commit + annotated tag `v0.1.4` + push → CI 自动发布（Marketplace + GitHub Release）
- 另：.gitignore 增忽略 archive/（人类指令，`a7a1a0a`）

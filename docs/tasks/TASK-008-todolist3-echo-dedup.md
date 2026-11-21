# TASK-008 ｜ TODO 批次三：用户消息重复气泡修复 + 协议 golden fixture 落地（通道 A）

> 来源：人类输入 TODO-List.md「待实现」（2026-11-21，通道 A；人类指令："@todo-list.md 请按照这个需求文档进行修改"）
> 范围裁决（总调度）：批次三 = 待实现条目①「【BUG】消息发送之后存在两条气泡记录」，并合并条目②明示的前置依赖"**user 回声缺陷修复 + golden fixture 落地**"。条目②「【重构】聊天面板 UI 层迁移 assistant-ui」体量为四阶段重写且自带 A/B 路线抉择，**不在本批次流水线内**，另立 TASK-009（前置 = 本任务发版闭环），见 §4。
> 流水线：可行性侦察 → 产品基线修订（v0.4→v0.5，审批点 1）→ 研发设计 + 外部契约依赖清单（审批点 1b）→ 研发实现 ∥ 测试盲写（审批点 2）→ 交付验收（`ready-for-verify`）→ 独立核验 → 发版 0.1.6 → TODO-List 回写归档
> 状态：已闭环（发版 0.1.6，tag 推送触发 CI 自动发布；CI 结果回查已排定时唤醒）

## 1. 总调度可行性侦察（2026-11-21 14:5x）

| # | 原文 | 类型 | 可行性与依据 |
|---|---|---|---|
| 1 | 【BUG】消息发送之后存在两条气泡记录 | **缺陷**（影响 P0 FR-CHAT-01 流式对话的展示正确性；同病：会话历史重放亦出现重复用户条目） | 根因已由代码阅读定位（§2），修复面集中在 `src/bridge/piBridge.ts` 事件翻译与 `webview/main.ts` 终稿处理；**mock 与真实协议失真**是四层验证全绿仍漏的直接原因（§3），须同批修正 |

## 2. 根因分析（总调度代码阅读；研发 Agent 须在设计阶段独立确认或证伪）

**外部契约锚点**：pi 包随附文档 `docs/json.md`「Event sequence」节（`/home/connor/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/json.md` 第 30–46 行）——一次 prompt 的权威事件序列为：

```
agent_start → turn_start → message_start(user) → message_end(user)
→ message_start(assistant, pending) → message_update… → message_end(assistant) → turn_end → agent_end → agent_settled
```

`docs/rpc.md` 第 33/139 行：RPC 模式 stdout 的 session event 以 `json.md` 为权威定义。即 **pi 对用户 prompt 必回发 user 角色 `message_start`/`message_end` 回声**，位于助手消息之前。`docs/extensions.md` 第 756 行亦明示：`message_start`/`message_end` 对 user/assistant/toolResult 等每类消息均触发。

**我方链路（当前 v0.1.5 代码）**：

1. `src/bridge/piBridge.ts:336-337 / 351-353`（`sendPrompt`，含 steer/followUp 分支）：发送时 `emit("user_message", { text })` **并且** `pushUserMessage(text)` 以新 id `u{n}` 推入 `uiMessages`（乐观回声）。
2. webview `main.ts:481-489`：收到 `user_message` → 新建 `webview-user-N` 视图并追加（第一条气泡）。
3. pi 回发 user `message_end` → `piBridge.ts:893` `handleMessageEnd` **不区分角色** → `buildUiMessage(user)`（`:974`）生成**另一个**新 id `u{n+1}` → `upsertUiMessage`（`:951`）按 id 查不到 → push → `uiMessages` 中同一用户消息出现两条；随后 `emit("message_final", { messageId: u{n+1}, … })`。
4. webview `main.ts:516-526`：`message_final` 时 `streamingViews`/`messageViews` 均查不到该 id → `appendMessageView(MessageView.fromUiMessage(...))`（第二条气泡）。
5. 派生症状：`chatPanel.ts:189` 面板重开以 `bridge.getUiMessages()` 回放 → 历史里同一用户消息重复。

**为何四层验证全绿仍漏**：`test/helpers/fake-pi-cli.js` 全部 `run*` 剧本均从 `agent_start` 直接开始，**从未模拟 user 角色 `message_start`/`message_end` 回声**——与 development-guidelines.md 第一部分 §4.3 / 第二部分修订记录（2026-11-21）记载的实战教训完全一致；该教训已升格为制度（mock 必须对照外部权威文档 + 关键协议交互以 golden fixture 兜底），但**代码与 mock 侧的个案修复尚未落地**，本任务即补齐。

## 3. 流水线记录

- 2026-11-21 14:5x 总调度：接收通道 A 批次三，可行性侦察完成（§1–§2），TASK-008 立案；范围裁决（条目②另立 TASK-009）；派发产品 Agent（基线 v0.4 → v0.5 修订）
- 2026-11-21 15:0x 产品 Agent：v0.5 落档——新增 FR-CHAT-11「用户消息单次展示」（P0，①–⑤）+ 澄清 #16（权威文本单条就地更新）+ §8 第 6 条门槛 + §5 不做项 + FR-CHAT-01/FR-SESS-03 交叉引用；run `50ce44f4`
- 2026-11-21 15:0x 总调度 **审批点 1 裁决：通过**。写权限核验：`git status --short` 仅 ` M docs/requirements.md`（`.pi-loop.json` 为巡检任务文件，无关）。亲读 diff 裁决：① FR-CHAT-11 五条均为可观测/可判定口径，无实现细节混入；② **#16 确认**——以 pi 权威文本为准、单条就地更新（与 #5 同源自洽，避免实时/重放文本互相矛盾）；③ 「发送后即时展示、不等待回声」确认（防以延迟展示换单条的退化修复）；④ §8 第 6 条显式门槛保留（缺陷曾穿透四层验证，显式列入有审计价值）；⑤ P0 定级成立。**范围/优先级变化通报人类**：新增 P0 FR 进入 MVP 门禁（§8-5 自动覆盖）。需求基线 v0.5 即刻冻结。下一步：派研发 Agent 出设计（审批点 1b）。

### 审批点 1 裁决记录（2026-11-21，总调度）

- 歧义：pi 回声的权威文本 ≠ 发送原文时，展示文本以哪个为准（保留原文 / 权威文本就地更新 / 双版本并存）
- 裁决：**权威文本单条就地更新**（澄清 #16）；回声到达前展示发送原文，到达后原条目更新，前后均为一条；历史重放以 JSONL 为准（#5）
- 影响面：新增 FR-CHAT-11（P0）——**有 FR 范围与优先级变化**；已向人类通报；无既有 FR 验收标准变更
- 通知：研发 Agent / 测试 Agent（随派发任务书引用 v0.5 冻结版）
- 2026-11-21 15:1x 研发 Agent：设计落档——technical-design.md §1/§4.1 修正（补 user 回声与 steer/follow-up 注入时序）、§3.4 协议增 id、§6 增 golden 回放层、新建 §11 外部契约依赖清单（10 条，锚定 pi 1.5.2）、§10.12 设计决策 D1–D10；run `173a785a`
- 2026-11-21 15:1x 总调度 **审批点 1b 裁决：通过**。写权限核验：仅 ` M docs/technical-design.md`。亲读全文 diff 并抽检 8 个外部锚点（json.md L12–20/L30–46/L121–122、rpc.md L60–71/L139、rpc-commands.md L7–92、extensions.md L752–770、models.md L45–68、environment-variables.md L79–82）均与权威文档一致；三项受控假设（queue_update 与回声顺序、队列文本=回声文本、custom_message 回声两向兼容）均有保守兑底分支且由 golden fixture 实证，接受。设计基线冻结于 commit `<见下一条 commit>`。下一步：研发实现 ∥ 测试盲写并行。

### 审批点 1b 裁决记录（2026-11-21，总调度）

- 审查内容：①外部契约依赖清单完备（10 条，版本锚定 pi 1.5.2）②事件流/接口契约与权威文档一致（抽检 8 锚点通过）③可测性（D8 golden 录制/回放 + D9 U1–U12/I1–I5 映射 FR-CHAT-11①–⑤）
- 裁决：通过，设计基线（含 §11 契约清单）即刻冻结；测试 Agent 盲写以冻结快照为依据
- 并行启动：研发 Agent（fresh，按 D1–D10 实现）∥ 测试 Agent（fresh，盲写 TC-062+）；双方过程产物互不可见（规范第二部分 §4）
- 2026-11-21 16:0x 总调度（瞬态故障处置，规范 §7.2）：研发 Agent golden 录制 spike 的 bash 调用挂死于 `wait $SERVER_PID`（mock server 永不退出 + PORT 提取为空命令）；总调度外部清理挂起进程使调用返回，steer 提示改自终止结构（内嵌 server + spawn pi + 有界超时）。属工具面瞬态，不占失败回路额度（N=2），研发继续
- 2026-11-21 16:2x 测试 Agent（盲写，resume 后交付）：docs/test-cases.md v0.5 落档——TC-062~TC-075（14 条，含 golden 回放兑底 TC-064/068、UI checklist TC-075），三源锚点齐全，T0/T1/T2 合并时间线口径无时钟依赖；run `802fe380`→`3c730ffa`
- 2026-11-21 16:3x 总调度 **审批点 2 第一轮裁决：退回一次**。亲读 TC-062~075 全文：五要素/锚点/推导均合格；发现覆盖缺口——设计 D2.2 保守分支（多通道不可判定→保留原文不错换）为 FR-CHAT-11④“不错换”的关键防线，无 TC 覆盖；同时采纳测试 Agent 上报的口径张力，裁决 **#17**（见下）。退回补 TC-076；其余 14 条预受理。附：测试 Agent 实测 rpc-commands.md「abort 保留队列」实际行号 L128（设计 §11 #6 括注 L126 轻微偏移）——记入研发交付收尾修正项

### 审批点 2 口径裁决 #17（2026-11-21，总调度）

- 歧义：澄清 #16 覆盖“回声可关联”路径；当回声文本与全部待确认条目均无法唯一关联（多通道不可判定）时，“到达后更新为权威文本”无确定目标条目——设计 D2.2 保守分支与 #16 字面存在张力
- 裁决：保守分支为 #16 的受控例外：该场景下各用户消息条目恒 1 条、文本不错换不新增，实时窗口保留发送原文；经会话切换/刷新/重开权威重建后收敛为 JSONL 权威文本（#5/#16 末句）。产品语义不变：单条与不错换优先于即时权威化。无 FR 范围/优先级变化（纯澄清，v0.5 → v0.5.1，产品 Agent 落档）
- 通知：研发（D2.2 实现不变）、测试（据此补 TC-076：不可判定回声→各条目恒单条保留原文、无新增；重建后收敛）
- 2026-11-21 16:4x 产品 Agent（resume）：#17 落档 v0.5.1（三处一致，纯澄清），commit 见上；基线冻结态延续（v0.5 冻结版仍为 TC-062~075 依据，TC-076 引 v0.5.1 #17）
- 2026-11-21 16:5x 测试 Agent（补遗交付）：TC-076（不可关联回声·保守分支，判据依 #17 + D2.2）+ 披露③指向 #17 + 头部/矩阵/§0.3/修订记录同步 v0.5.1；run `14dabcc9`
- 2026-11-21 17:1x 研发 Agent（resume×2 后交付定稿）：D1–D10 全落地（交付汇报七件齐备）；实现期发现并修复 queue diff 绑定候选误含 run-head 的缺陷（U3 回归锁定）；实测补记 RPC 亦回发 system 角色回声（桥侧忽略）；两处锚点行号修正 L126→L128（§11 #6 + §10.12 D2）；run `491e92bd`→`07fa805c`→`12fff8e7`
- 2026-11-21 19:0x 核验 Agent（resume 后交付）：**总结论 PASS（R7 首轮）**——TC-062~074/076 全过（独立自建 harness 68/68 断言，零复用交付代码）、全量回归亲跑全绿、压力 6 轮无竞态、golden 再录制复证、外部锚点逐行核对一致；TC-075 MANUAL 列遗留；TC-064 首跑失败定性为核验脚本自身缺陷（两过留证）；报告 report-d25d689 + evidence-t8（69 文件）；run `a6ece9db`
- 2026-11-21 19:1x 总调度：核验产物合入 `3316d85`（密钥扫描 0 命中）；程序化检查七件套齐全 → 发版裁决：触发（versioning §4 默认触发）
- 2026-11-21 19:2x 研发 Agent（发版步骤 2–4）：package.json 0.1.5→0.1.6；CHANGELOG 置顶条目；四项自测全绿（0 错/成功/166/36）
- 2026-11-21 19:3x 总调度（发版步骤 6–8）：五处一致门禁（①package.json 0.1.6 ②CHANGELOG 置顶 ③v0.1.6 annotated ④⑤CI 承接）+ 密钥扫描 CLEAN → commit `e9fc9d8`（chore(release): v0.1.6）+ tag `v0.1.6` 推送 → CI 自动发布触发；通道 A 回写：TODO-List 条目① `[x]` 归档 archive/2026-11-21.md（批次三节）+ 待实现移除 + 索引更新；**TASK-008 闭环**；CI 结果回查排定 10 分钟定时唤醒；run `e895a2f4`
- 2026-11-21 17:5x 总调度（超时处置，规范 §7.2）：核验 Agent（run `6711f75a`）触 30 分钟默认超时（本次未显式放宽预算，总调度失误）。现场：clone /tmp/verify-task008 就绪、自建 harness /tmp/vt008 完成 TC-062/063 断言，TC-064 进行中（其 runner 内 pi 子进程 code=1 反复崩溃——待核验侧自行诊断定性：harness 环境问题或产品缺陷，独立性不受影响）；无挂起进程、产物未出。resume 续做（预算 90 分钟），不占失败额度
- 2026-11-21 17:2x 总调度 **交付验收 PASS**：①写权限核验（16 文件全在研发矩阵，禁写清单 0 改动）②FR-CHAT-11 追溯表齐备 ③亲复跑 typecheck 0 错/build 成功/unit 166/integration 36 全绿 ④并行负载 3 轮抽查全绿（与研发 10 连跑一致）⑤密钥扫描 CLEAN（fixture 仅 dummy 哨兵）。commit `d25d689`（研发 Agent），标签 **ready-for-verify-r7**（annotated，r1–r6 为历史轮次占用）；下一步：独立核验
- 2026-11-21 16:5x 总调度 **审批点 2 第二轮裁决：通过**。亲读增量：TC-076 五要素齐全（期望含推导、三源锚点、SC-076 实现无关）、披露③/头部区间/覆盖矩阵/修订记录五处同步一致；编号连续 TC-062~TC-076（15 条），FR-CHAT-11 ①–⑤ 全部自动可判定 + TC-075 UI checklist。**用例基线 v0.5.1 冻结**，作为核验剧本依据；审批点 2 关闭（退回一次已消化）
- 2026-11-21 16:1x 总调度（超时处置，规范 §7.2）：两子代理均触 30 分钟默认超时。① 研发（run `fcdef946`）：仓库零改动，spike 已验证真实 pi 1.5.2 + loopback mock 可行（确认 user 回声位于 turn_start 后、timestamp/durationMs/机器相关 system 消息需归一化）——resume 续做实现，超时预算放宽至 90 分钟；② 测试（run `802fe380`）：docs/test-cases.md v0.5 已实质完成（TC-062~075），打断于末尾锚点抽查——resume 补自检与交付汇报。均属基础设施瞬态，不占失败额度

## 4. 范围裁决说明：条目②另立 TASK-009

- 条目②原文自带分期：①实验面板试点 → ②消息渲染 → ③Composer 定制 → ④切默认面板删旧实现；并明示"二选一路线"（A fetch-bridge / B ExternalStoreRuntime）与风险备忘（`@assistant-ui/vscode` 0.0.1、zod jitless、Shiki bundle ≈15MB、retainContextWhenHidden）。
- 其明示前置依赖 = 本任务（回声修复 + golden fixture 作为"重写安全网"）。在安全网落地前启动重写违背 TODO 原文与开发规范第一部分 §4.3。
- 处置：TASK-008 发版闭环后立案 TASK-009，研发 Agent 在设计阶段（审批点 1b）提出 A/B 路线建议与分期验收口径，由总调度裁决并向人类通报（涉及重大范围）。

## 5. 发版记录

- 0.1.5 → 0.1.6（PATCH +1，versioning.md §5 剧本：五处一致、CHANGELOG 置顶、`v0.1.6` annotated tag 推送触发 CI）。
- 发版闭环同一时点执行通道 A 回写：TODO-List.md 条目①改 `[x]` → 归档 `archive/2026-11-21.md`（附 FR/缺陷单/任务单/版本追溯）→ 从待实现移除 → 归档索引更新。

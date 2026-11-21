# TASK-008 ｜ TODO 批次三：用户消息重复气泡修复 + 协议 golden fixture 落地（通道 A）

> 来源：人类输入 TODO-List.md「待实现」（2026-11-21，通道 A；人类指令："@todo-list.md 请按照这个需求文档进行修改"）
> 范围裁决（总调度）：批次三 = 待实现条目①「【BUG】消息发送之后存在两条气泡记录」，并合并条目②明示的前置依赖"**user 回声缺陷修复 + golden fixture 落地**"。条目②「【重构】聊天面板 UI 层迁移 assistant-ui」体量为四阶段重写且自带 A/B 路线抉择，**不在本批次流水线内**，另立 TASK-009（前置 = 本任务发版闭环），见 §4。
> 流水线：可行性侦察 → 产品基线修订（v0.4→v0.5，审批点 1）→ 研发设计 + 外部契约依赖清单（审批点 1b）→ 研发实现 ∥ 测试盲写（审批点 2）→ 交付验收（`ready-for-verify`）→ 独立核验 → 发版 0.1.6 → TODO-List 回写归档
> 状态：进行中

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

## 4. 范围裁决说明：条目②另立 TASK-009

- 条目②原文自带分期：①实验面板试点 → ②消息渲染 → ③Composer 定制 → ④切默认面板删旧实现；并明示"二选一路线"（A fetch-bridge / B ExternalStoreRuntime）与风险备忘（`@assistant-ui/vscode` 0.0.1、zod jitless、Shiki bundle ≈15MB、retainContextWhenHidden）。
- 其明示前置依赖 = 本任务（回声修复 + golden fixture 作为"重写安全网"）。在安全网落地前启动重写违背 TODO 原文与开发规范第一部分 §4.3。
- 处置：TASK-008 发版闭环后立案 TASK-009，研发 Agent 在设计阶段（审批点 1b）提出 A/B 路线建议与分期验收口径，由总调度裁决并向人类通报（涉及重大范围）。

## 5. 发版计划

- 0.1.5 → 0.1.6（PATCH +1，versioning.md §5 剧本：五处一致、CHANGELOG 置顶、`v0.1.6` annotated tag 推送触发 CI）。
- 发版闭环同一时点执行通道 A 回写：TODO-List.md 条目①改 `[x]` → 归档 `archive/2026-11-21.md`（附 FR/缺陷单/任务单/版本追溯）→ 从待实现移除 → 归档索引更新。

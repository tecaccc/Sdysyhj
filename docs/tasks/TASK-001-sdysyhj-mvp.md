# TASK-001 · Sdysyhj VS Code 插件 MVP 研发流水线

> 产出者：总调度 Agent ｜ 创建：2025-11-17 ｜ 状态：进行中

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
| ② 需求文档 | 按 §6 契约整理 `docs/requirements.md` | 产品 Agent（fresh context） | 🔄 进行中 |
| ②' 程序化检查 | 契约完整性 + 写权限（git diff）核验 | 总调度 | ⬜ 未开始 |
| 【审批点1】需求基线 | 人类确认 FR 范围/优先级/边界/验收标准 | **人类必审** | ⬜ 待发起 |
| ③a 开发 + 自测 | 按需求基线 + 技术方案实现 MVP | 研发 Agent（fresh context） | ⬜ 阻塞于 AP1 |
| ③b 盲写测试用例 | 仅依据需求基线写 `docs/test-cases.md` | 测试 Agent（fresh context，禁读 src/） | ⬜ 阻塞于 AP1 |
| 【审批点2】测试用例 | 人类确认覆盖度与可判定性 | **人类必审** | ⬜ 未到达 |
| ④ 研发交付 | 自测全绿 + FR 追溯表 + 标签 `ready-for-verify` | 研发 Agent | ⬜ |
| ⑤ 独立核验 | 干净工作区检出标签，逐 TC 执行出报告 | 测试 Agent（核验，全新上下文） | ⬜ |
| ⑥ 闭环/失败回路 | PASS → 交付总结；FAIL → 缺陷清单回研发（≤2 轮） | 总调度 | ⬜ |

## 3. 审批点记录

| 审批点 | 发起时间 | 结论 | 备注 |
|---|---|---|---|
| AP1 需求基线 | 2025-11-17 | 待人类审批 | 产品 Agent 产出后发起，修订意见退回产品 Agent |
| AP2 测试用例 | — | 未到达 | 用例产出后发起 |

## 4. 失败回路与裁决

- 重试计数：0 / 2
- 裁决记录：无

## 5. 权限核验约定（写权限矩阵 → git 历史）

| 角色 | 允许写 | 核验方式 |
|---|---|---|
| 总调度 | `docs/tasks/` | — |
| 产品 Agent | `docs/requirements.md` | 收产物时 `git diff --name-only` 逐一核验，越界 = 交付不合格退回 |
| 研发 Agent | `src/`、`webview/`、`test/`、工程文件 | 同上 |
| 测试 Agent | `docs/test-cases.md`、`docs/verification/` | 同上 |

## 6. 事件日志

- 2025-11-17 总调度：接收通道 A 输入（处理对象 `docs/technical-design.md`），分诊为 `type:feature`，登记 TASK-001
- 2025-11-17 总调度：建立 git 基线快照（流水线启动前状态，作为权限核验与证据链起点）
- 2025-11-17 总调度：派发产品 Agent（fresh context）按 §6 契约整理需求基线

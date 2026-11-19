# Sdysyhj GitHub 仓库操作规范（GitHub Operations）

> 适用对象：参与 Sdysyhj 研发流水线、需要操作远程 GitHub 仓库的一切智能体（实操以**总调度**为主，其余角色默认只读）
> 上位规范：[`DevelopmentGuidelines/development-guidelines.md`](../DevelopmentGuidelines/development-guidelines.md)——本文件是其 **§3.2「通道 B：GitHub Issue 输入」与 §8「Git 与证据链规范」** 在 GitHub 平台层的操作细则；两者冲突时以上位规范为准。
> 状态：生效中 ｜ 修订需人类批准（同上位规范尾注约定）

---

## 1. 目的与范围

把"如何正确、安全、一致地操作 GitHub 远程仓库"固化为可执行纪律，避免每个 Agent 各凭记忆操作。覆盖：

- 操作通道与工具选型（MCP / git CLI）
- Issue 全生命周期操作（拉取、分诊、标签、回写、关闭）
- PR、分支、远端文件操作
- 安全红线（凭证、密钥、推送前检查）

不在本文件范围：本地 git 提交纪律（见上位规范 §8）、任务分诊的流程裁决（见上位规范第二部分 §3.2/§5/§8）。

## 2. 仓库坐标与操作通道

### 2.1 仓库坐标（以本地 remote 为准，禁止凭记忆写 owner/repo）

```bash
git remote -v
# origin  git@github.com:tecaccc/Sdysyhj.git (fetch/push)
```

- **owner**：`tecaccc` ｜ **repo**：`Sdysyhj`（大小写按 remote 原样传递给 API）
- 仓库坐标变更（改名/迁移）后，首个发现的 Agent 须上报总调度并更新本文件，禁止静默沿用旧坐标。

### 2.2 通道矩阵

| 通道 | 用途 | 说明 |
|---|---|---|
| MCP `github` 服务（49 工具） | Issue / PR / 分支 / release / 远端文件 / 评论等**平台层读写** | 本环境**未安装 `gh` CLI**，平台操作一律走本通道；禁止假设 gh 存在 |
| 本地 `git` CLI | clone/fetch/pull/push、tag、历史核验 | 写操作**仅总调度**可执行（上位规范 §1 硬约束） |
| GitHub Web | 人类操作 | Agent 不使用 |

### 2.3 工具选型纪律（MCP 官方指引固化）

1. **`list_*` 做宽检索**：翻页/简单过滤（如 `list_issues`、`list_pull_requests`、`list_branches`、`list_tags`）。
2. **`search_*` 做定点查询**：语义/条件检索（如 `search_issues`、`search_code`、`search_pull_requests`）。
3. **降载**：只需少数字段时传 `fields` 子集（尤其省略 `body` 与 `field_values`），大仓库防响应超限。
4. **翻页**：优先 `perPage`（≤100）+ 游标 `after`，禁止一次性裸拉全量。

## 3. 参数规范（实战教训固化）

1. **枚举值必须大写**：`list_issues` 的 `state` 只接受 `OPEN` / `CLOSED`——传小写 `open` 会直接报
   `data/state must be equal to one of the allowed values`。**省略 `state` 时返回开+关两类**，做"仅看开放"统计必须显式传 `OPEN`（2026-11-19 实操沉淀）。
2. **排序成对出现**：给 `direction` 就必须给 `orderBy`（`CREATED_AT`/`UPDATED_AT`/`COMMENTS`），反之亦然。
3. **读单条**：`issue_read` / `pull_request_read` 的 `method` 为必填；先读后写，写前必须持有最新版本。
4. **issue_write**：新建不传 `issue_number`；更新必传。`state_reason` 仅在改 `state` 时有意义。
5. **owner/repo/branch 名按远端原样传递**，不自行改大小写、不拼 URL。

## 4. Issue 操作规范（通道 B 全生命周期）

> 流程语义（何时进流水线、审批点、失败回路）以上位规范第二部分 §3.2/§5/§8 为准；本节只固化**操作动作**。

### 4.1 巡检与拉取（总调度）

- 触发：定时巡检（cron）或人类指定编号；目标 = 新建 Issue 或带 `agent:todo` 的既有 Issue。
- 巡检命令口径：`list_issues`（owner=tecaccc, repo=Sdysyhj），**开放与已关闭分别查**（`state: "OPEN"` / `"CLOSED"` 各一次），并按 4.3 汇报两态计数；0 结果如实报 0，禁止臆造。

### 4.2 标签体系（与上位规范 §3.2 一致，禁止自造同义项）

| 标签 | 语义 | 谁打/谁摘 |
|---|---|---|
| `agent:todo` | 既有 Issue 待纳入流水线 | 总调度 |
| `agent:in-progress` | 已开始处理 | 总调度（开始时打，PASS/FAIL 结论落定后换） |
| `agent:done` | 验证 PASS | 总调度 |
| `agent:blocked` | FAIL 重试超限 / 需人类裁决 | 总调度 |
| `type:feature` / `type:bug` / `type:question` | 分诊类型 | 总调度 |

- `question` 类不进流水线：直接整理答案回写 Issue 后关闭。
- 标签操作通过 `issue_write`（更新既有 Issue 的 `labels`）完成；**替换语义**（非追加），传参须包含期望的完整标签集合。

### 4.3 分诊与状态回写（闭环纪律）

1. **素材标准化**：Issue 标题 + 正文 + 复现步骤 + 评论区讨论 合成需求素材；信息不足 → 在 Issue 留言追问（`add_issue_comment`，@人类），打 `agent:todo` 挂起等待，不派发。
2. **去重关联**：与既有需求/任务相似的 Issue，先在评论区写关联说明（引用任务单/Issue 编号），避免重复派发。
3. **回写动作与流水线状态的映射**（缺一即闭环不合格）：

| 流水线事件 | Issue 操作 |
|---|---|
| 开始处理 | 加 `agent:in-progress` |
| 需信息追问 | 评论 @人类 + 挂起 |
| 验证 PASS | 回写报告摘要 + PR/commit 链接，加 `agent:done`；feature 类**合并后**才关闭 |
| FAIL 超限 | 回写缺陷清单与报告链接，加 `agent:blocked`，留人类裁决 |

4. **回写文本纪律**：结论必须带证据引用（报告/commit/PR 链接），与上位规范"证据即事实"一致；评论内容先落任务单再回写，保持 `docs/tasks/` 与 Issue 双留痕。

### 4.4 回写工具

- 追加评论：`add_issue_comment`（可带 reaction 表态，不作为结论载体）。
- 修订既有评论：`update_issue_comment`（仅用于勘误，禁止无痕改写已送达的结论——勘误须在文内注明"勘误于 <日期>"）。

## 5. PR、分支与远端文件操作

1. **写权限**：GitHub 平台层写操作（建分支、建/改/合并 PR、改远端文件、issue/PR 写入）**统一由总调度执行**，与本地 git 写权限口径一致（上位规范 §1）；其余角色只读。
2. **正常交付不走远端文件 API**：代码合入一律走本地 git 流（研发交付 → 总调度验收 → commit/tag → push）。`create_or_update_file`/`push_files`/`delete_file` 仅限**流水线外**的轻量场景（如改 Issue 模板、README 勘误），且须在任务单留痕。
3. **分支**：`create_branch` 用于核验隔离或试验分支，命名 `agent/<用途>-<短哈希>`；用后清理。
4. **PR 纪律**：`create_pull_request` 须填 body（任务单链接 + 验证报告链接 + FR 摘要）；合并用 `merge_pull_request` 并显式选 `merge_method`；合并前核对 `expectedHeadSha` 防竞态。
5. **release/tag 对齐**：远端 `list_tags`/`get_tag` 仅作核对；`ready-for-verify[-rN]` 标签以本地 annotated tag 推送为准（上位规范 §8.2）。

## 6. 安全红线（GitHub 平台层）

1. **凭证**：MCP github 服务持有认证，Agent **不得**读取、打印、落盘任何 token；`github_get_me` 仅用于身份核对，输出中的登录名之外信息不外传。
2. **推送前密钥扫描**（与上位规范 §8.3 同源）：任何 push/远端文件写入前，扫 `sk-…` / `ghp_…` / `AKIA…` 等模式；可用 `run_secret_scanning` 辅助，结论写入任务单。
3. **不外传**：评论/PR/Issue 正文禁止出现本地路径外的敏感信息（密钥、内部端点、临时 HOME 哨兵凭证值）。
4. **最小写入**：只回写流程要求的字段与评论；禁止批量改标签/批量关闭等"清扫"动作，除非人类明示。

## 7. 与主规范及文档集的关系

| 文档 | 关系 |
|---|---|
| development-guidelines.md 第一部分 §8 | Git 与证据链总纪律；本文件是其 GitHub 平台层细则 |
| development-guidelines.md 第二部分 §3.2 | 通道 B 流程语义（审批点/失败回路）；本文件 §4 与其一一对应 |
| docs/tasks/ | 所有 GitHub 写操作（标签变更/评论/PR/合并）必须在任务单留痕 |

---

*修订记录：2026-11-19 总调度（经人类批准）——初版固化：通道矩阵（无 gh CLI、MCP 为唯一平台通道）、枚举大写参数教训、标签体系与回写闭环映射、平台层安全红线。*

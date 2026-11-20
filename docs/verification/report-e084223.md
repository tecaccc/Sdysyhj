# 核验报告 report-e084223 ｜ Issue #1 hotfix（#D-01/#D-02，FR-SESS-07）独立核验

> 产出：测试 Agent（核验报告撰写者）｜ 日期：2026-11-20 ｜ 被测：`ready-for-verify-r3`（HEAD `e084223`）
> 事实来源（唯一）：`docs/verification/evidence-issue1/` 六目录证据原文（ENV-SETUP / SUITES / SC-ISSUE1-D01 / SC-D02 / TC-022 / STRESS，各含 cmd.txt + output.txt ± script/ 原文）。
> 判据基线：`docs/test-cases.md` v0.2；范围裁决：`docs/tasks/TASK-003-issue1-stalewatch.md`；报告契约：`DevelopmentGuidelines/development-guidelines.md` 第一部分 §6。
>
> **接力撰写披露（置顶）**：前核验执行者已完成全部核验执行并归档证据，其执行会话因提供方连续瞬断不可恢复；本报告撰写者依规范 §2.4 以全新上下文接力撰写，与执行者零接触，**未重跑任何核验命令、未复现任何输出**，仅对证据文件做转录、汇总与判定映射。

---

## ① 证据头（摘自 evidence-issue1/ENV-SETUP/env-header.txt + output.txt）

| 项 | 值 |
|---|---|
| `git describe --tags` | `ready-for-verify-r3` |
| HEAD | `e084223c36745ead02d4e53e375643fd8b334865` |
| OS | Linux 5.14.0-687.15.1.el9_8.x86_64（RHEL 9 内核） |
| Node / npm | v24.19.0 / 11.17.0 |
| 日期 | 2026-11-20（+08:00）：npm ci 10:49:44，证据头落笔 10:51:00（执行窗口下沿见 ⑥-3 披露） |

**隔离声明**：

- **干净检出**：`git clone /data/workspace/Sdysyhj /tmp/verify-issue1` → `git checkout ready-for-verify-r3`，`git status --porcelain` 为空（exit 0）；主仓库 /data/workspace/Sdysyhj 全程零写操作。
- **临时 HOME**：`VERIFY_HOME=/tmp/tmp.IQwszueu6m`；各步骤另以 `HOME=$(mktemp -d)` 运行，会话/配置只落临时目录，不触宿主真实 `~/.pi`。
- **环境硬化**：每次运行 `unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`（沿验证剧本 §1.2）。
- **独立脚本**：一次性断言脚本全部位于仓库外 `/tmp/verify-harness`（fake pi 子进程 + 驱动库 + 场景脚本），原文已归档各 `script/`（清单见 ⑦ 自检声明）；断言不依赖被测仓库 `test/` 内任何代码。
- **阴性对照**：`/tmp/verify-issue1-prefix` @ `4c24316`（预修复提交）独立克隆 + 独立 `npm ci` + 独立 esbuild bundle（`bridge-bundle-prefix.cjs`），用于证明场景判别力（预修复必须复现缺陷、修复标签必须通过）。
- **依赖安装**：`npm ci` exit 0（added 167 / audited 168，仅 allow-scripts 警告，无 error）。

---

## ② 逐 TC 判定表

判定四值：PASS / FAIL / SKIP / MANUAL（规范 §6.2）。本轮 SKIP 含两类原因：**hotfix 裁剪**（范围外；TASK-003 §4 裁决——核验范围 = FR-SESS-07 相关 + 回归重放）与 **P2 延后**（基线显式延后项）。基线映射 FR-SESS-07 的 TC 仅 **TC-022**（test-cases.md §2.1 覆盖矩阵）；为留痕裁剪范围，下表全量枚举基线 46 个 TC。

| TC | FR/条目 | 基线摘要 | 判定 | 说明 / 证据 |
|---|---|---|---|---|
| TC-001 | FR-CHAT-01 | 流式 delta 增量渲染与状态流转 | SKIP | hotfix 裁剪（范围外，TASK-003 §4） |
| TC-002 | FR-CHAT-01 | 流式渲染视觉（UI） | SKIP | hotfix 裁剪 |
| TC-003 | FR-CHAT-02 | Markdown 全要素结构渲染 | SKIP | hotfix 裁剪 |
| TC-004 | FR-CHAT-02 | Markdown 渲染视觉（UI） | SKIP | hotfix 裁剪 |
| TC-005 | FR-CHAT-03 | thinking 默认折叠 + 展开流式 | SKIP | hotfix 裁剪 |
| TC-006 | FR-CHAT-03 | 折叠交互视觉（UI） | SKIP | hotfix 裁剪 |
| TC-007 | FR-CHAT-04 | 工具卡要素/状态/截断/复制全部 | SKIP | hotfix 裁剪 |
| TC-008 | FR-CHAT-04 | 卡片展开/复制交互（UI） | SKIP | hotfix 裁剪 |
| TC-009 | FR-CHAT-05 | Abort 命令注册 + RPC + 状态恢复 | SKIP | hotfix 裁剪 |
| TC-010 | FR-CHAT-05 | Stop 按钮交互（UI） | SKIP | hotfix 裁剪 |
| TC-011 | FR-CHAT-06 | steer/follow-up 注入与模式切换 | SKIP | hotfix 裁剪 |
| TC-012 | FR-CHAT-06 | 运行中输入框交互（UI） | SKIP | hotfix 裁剪 |
| TC-013 | FR-CHAT-07 | 三类异常可读错误 + 指引 | SKIP | hotfix 裁剪 |
| TC-014 | FR-CHAT-08 | 状态四字段模型与流转 | SKIP | hotfix 裁剪 |
| TC-015 | FR-CHAT-08 | 顶部状态栏视觉（UI） | SKIP | hotfix 裁剪 |
| TC-016 | FR-SESS-01 | 新建会话 + 旧会话落盘保留 | SKIP | hotfix 裁剪 |
| TC-017 | FR-SESS-02 | 历史列表展示与切换 | SKIP | hotfix 裁剪 |
| TC-018 | FR-SESS-03 | 切换后完整恢复上下文 | SKIP | hotfix 裁剪 |
| TC-019 | FR-SESS-04 | 重命名会话 | SKIP | hotfix 裁剪 |
| TC-020 | FR-SESS-05 | 分支切换 | SKIP | P2 延后（基线显式，二期） |
| TC-021 | FR-SESS-06 | 单活动会话、无并行多会话 | SKIP | hotfix 裁剪 |
| **TC-022** | **FR-SESS-07** | **检测会话外部修改并提示刷新** | **PASS** | `TC-022/`（SC-EXT-IDLE 独立脚本 exit 0：idle 外部写入 2075ms 检出 ≤5s 门禁 + 拦截并引导刷新 + 刷新后恢复 prompt 1→2 + 无新误报）+ `SUITES/`（FR-SESS-07 标注用例 13/13 绿，构成见 ③）+ 反向/正向误报豁免实证见 `SC-ISSUE1-D01/`、`SC-D02/` |
| TC-023 | FR-FILE-01 | 子进程 cwd 绑定规则 | SKIP | hotfix 裁剪 |
| TC-024 | FR-FILE-02 | '@' 触发文件选择并插入路径 | SKIP | hotfix 裁剪 |
| TC-025 | FR-FILE-02 | @file 选择器交互（UI） | SKIP | hotfix 裁剪 |
| TC-026 | FR-FILE-03 | 右键"发送到 Pi" | SKIP | hotfix 裁剪 |
| TC-027 | FR-MOD-01 | 列出并切换模型 | SKIP | hotfix 裁剪 |
| TC-028 | FR-MOD-02 | 切换 thinking 等级 | SKIP | hotfix 裁剪 |
| TC-029 | FR-MOD-03 | 切换结果随会话保留 | SKIP | hotfix 裁剪 |
| TC-030 | FR-CMD-01 | 五命令注册清单断言 | SKIP | hotfix 裁剪 |
| TC-031 | FR-CMD-02 | Output Channel 记录 stderr/异常 | SKIP | hotfix 裁剪 |
| TC-032 | FR-CMD-03 | slash 文本直发生效（MVP 部分） | SKIP | hotfix 裁剪 |
| TC-033 | FR-CMD-03 | '/' 自动补全 | SKIP | P2 延后（基线显式，二期） |
| TC-034 | FR-CMD-04 | MCP 配置自动生效 | SKIP | P2 延后（基线显式，二期） |
| TC-035 | FR-CMD-05 | PATH 优先/内置回退/显式指定 | SKIP | hotfix 裁剪 |
| TC-036 | NFR-01 | 10k+ tokens 流式渲染代理断言 | SKIP | hotfix 裁剪 |
| TC-037 | NFR-01 | 面板切换/重开不丢运行状态 | SKIP | hotfix 裁剪 |
| TC-038 | NFR-02 | 崩溃自动重启 + 宿主隔离 | SKIP | hotfix 裁剪 |
| TC-039 | NFR-03 | 日志脱敏（哨兵零命中） | SKIP | hotfix 裁剪 |
| TC-040 | NFR-03 | Webview 渲染消毒（防 XSS） | SKIP | hotfix 裁剪 |
| TC-041 | NFR-03 | 会话数据仅存 pi 原有位置 | SKIP | hotfix 裁剪 |
| TC-042 | NFR-04 | 版本门槛/打包清单/三平台 | SKIP | hotfix 裁剪 |
| TC-043 | NFR-05 | 关键路径日志 + 可行动建议 | SKIP | hotfix 裁剪 |
| TC-044 | NFR-06 | 卸载/停用无残留 | SKIP | hotfix 裁剪 |
| TC-045 | §8-1 | 端到端冒烟（读改执行） | SKIP | hotfix 裁剪 |
| TC-046 | §8-3 | 宿主重启后历史恢复 | SKIP | hotfix 裁剪 |

**统计**：PASS 1 ｜ FAIL 0 ｜ SKIP 45（hotfix 裁剪 42 + P2 延后 3）｜ MANUAL 0。

表注：
- SKIP 行不因回归重放（③）套件绿而改判：逐 TC 判定需核验剧本建立"逻辑场景 ↔ 套件输出"映射（test-cases.md §0.5-2），本轮未建立，留待后续全量核验轮。
- 8 项 UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025）与三平台 CI（TC-042c）从未执行，一并 SKIP（hotfix 裁剪），不构成 FAIL。

---

## ③ 逐 FR 结论表

### 判定范围（hotfix 核心）

| FR | 优先级 | 结论 | 判定性质 | 证据 |
|---|---|---|---|---|
| **FR-SESS-07 外部修改提示** | P1 | **PASS** | 逐 TC 判定（TC-022，TC-022 基线门禁 (a)(b) 全满足） | `TC-022/`（独立场景 exit 0：检出 2075ms ≤5000ms、拦截文案含"插件之外被修改"+引导"刷新"、刷新后 prompt 1→2 恢复、无新误报）；`SC-ISSUE1-D01/`（正向 3/3：本插件 pi 子进程写入全程无误报）；`SC-D02/`（补学后外部写入 2075ms 可检出）；`SUITES/`（FR-SESS-07 标注用例 13/13 绿） |

FR-SESS-07 标注用例 13 项构成（`SUITES/output.txt` verbose 名录）：检测正向语义 3（watcher 回调→external_change；(c) idle 真实外部写入 ≤5s 检出语义保持；外部修改/删除可检测且无变化不误报）｜ #D-01 误报豁免/门控 4（运行态门控接线 R2；(a) starting/streaming 只吸收不报警；(b) idle 迟到 entry_appended 不误报 R1；setSuspended 挂起/恢复语义）｜ #D-02 补学 1（settled 后补学 sessionFile 并进入跟踪 R3）｜ 口径 C 拦截+刷新 2（unit 缺陷#4 回归 + integration 缺陷#4）｜ watcher 基线机制 2（markSynced 同步基线；start/stop 定时检查）｜ 集成回归重放 1（第二条消息全程无 external_change，随后外部写入检出，997ms）。

### 回归重放覆盖（非逐 TC 判定；套件绿 = 回归通过，无退化证据）

| FR/NFR | verbose 佐证用例（数） | 回归结论 | 证据 |
|---|---|---|---|
| FR-SESS-01 新建会话 | 2（新建/切换 session_reset+历史重建；新建会话清空历史） | 回归通过 | `SUITES/output.txt` |
| FR-SESS-03 继续会话 | 2（历史重建：工具结果绑定卡片；切换会话重放与 JSONL 一致含压缩状态条目） | 回归通过 | 同上 |
| FR-SESS-04 会话命名 | 1（会话命名） | 回归通过 | 同上 |
| FR-CHAT-04 工具调用卡片 | 1（执行状态/输出截断保留尾部/复制全部取全量） | 回归通过 | 同上 |
| FR-CHAT-05 中止-错误恢复 | 1（prompt 被拒：错误展示+恢复可输入） | 回归通过 | 同上 |
| FR-CHAT-06 steer 插话 | 2（unit 排队 + 集成插话排队） | 回归通过 | 同上 |
| FR-CHAT-07 错误展示 | 2（prompt 被拒；崩溃→error 态+可行动指引） | 回归通过 | 同上 |
| FR-MOD-01 切换模型 | 1（模型切换后 model_info 更新） | 回归通过 | 同上 |
| FR-MOD-02 thinking 等级 | 2（切换/循环；thinkingDefault 透传） | 回归通过 | 同上 |
| FR-CMD-02 输出日志 | 2（缺陷#2 stderr/协议异常入日志含脱敏；stderr 尾部退出冲刷） | 回归通过 | 同上 |
| FR-CMD-05 pi 运行时来源 | 1（缺陷#1 打包布局内置运行时 source=bundled 可用） | 回归通过 | 同上 |
| NFR-01 性能 | 1（≥600 delta 零丢失 + 全量渲染 ≤30s） | 回归通过 | 同上 |
| NFR-02 稳定性 | 2（崩溃自动重启一次再崩溃进 error；集成同构） | 回归通过 | 同上 |
| NFR-05 可观测 | 2（缺陷#6 关键路径 4 类日志，unit+集成） | 回归通过 | 同上 |

**全量数字**（`SUITES/output.txt`）：`npm run typecheck` exit 0 ｜ `npm run build` exit 0 ｜ `verify:unit` 10 文件 **97/97** ｜ `verify:integration` 4 文件 **30/30** ｜ verbose 佐证子集 4 文件 **54/54**（全部 exit 0）。

表注：上表仅列 verbose 输出中**显式标注** FR/NFR/缺陷号的条目（用例名全文见 `SUITES/output.txt`）；"回归通过"≠ 逐 TC PASS（映射未建立，见 ② 表注）。

---

## ④ 缺陷回归结论（逐项；双臂判别力 = 预修复提交复现缺陷 + 修复标签通过）

### #D-01（P1 ｜ 误报方向：运行中本插件 pi 子进程写入被判"插件之外修改"，第二条消息被拦截）——**修复核验 PASS**

- **场景**（`SC-ISSUE1-D01/script/scenario1-issue1.cjs`）：续接会话（已跟踪）→ prompt 接受即物理写 user 条目（turn_start 边界）→ 延迟 ≥3s 才回首个 assistant message_end → 断言全程无 external_change、无拦截错误、第二条消息可正常发送并完成。
- **阴性对照（预修复 `4c24316` bundle）3/3 exit 0，均复现用户报障**：窗口内误报 external_change ×1；prompt 命令 1→1（被拦截，未达子进程）；第二条消息拦截错误 ×1；run_state 停在首轮 `starting→streaming→idle`——**场景有判别力**。
- **正向（被测 `ready-for-verify-r3`）3/3 exit 0**：落盘→首响应窗口实测 3504/3505/3504ms（判据 ≥3000ms 成立；watcher 轮询周期 2500ms ⇒ 窗口内必然 ≥1 次轮询）；全程无 external_change、无拦截；第二条消息送达并完成；run_state `starting→streaming→idle→starting→streaming→idle`（两轮完整）。
- **套件回归映射**（`SUITES/output.txt`）：R1（entry_appended 豁免）↔ "(b) idle 下迟到 entry_appended…不误报（#D-01 R1）"；R2（运行态门控 setSuspended）↔ "运行态门控接线：starting 挂起，idle/aborted 恢复并同步基线（#D-01 R2）" + "(a) starting/streaming 期间只吸收不报警" + sessionStore "setSuspended（#D-01）"；R4（回归 ≥3 场景 + 第二条消息集成重放 + 全绿）↔ unit Issue #1 回归 5 项 + integration 回归重放（997ms）+ typecheck/build/unit 97/integration 30 全绿，未见任何既有断言放宽记录（以套件全绿与证据原文为准）。

### #D-02（P2 ｜ 漏报方向：全新会话 sessionFile 永不补学 → watcher 永不跟踪 → 外部写入不可检出）——**修复核验 PASS**

- **场景**（`SC-D02/script/scenario3-d02.cjs`）：全新会话（启动 get_state sessionFile=null 前置断言）→ 首轮 turn 边界物理创建会话文件 → 断言 settled 后发生 get_state 二次调用（refreshState 补学）→ 外部写入须可检出（≤5000ms）且首轮内部写入无误报。
- **阴性对照（预修复 `4c24316`）：复现漏检**——settled 后无 get_state 补学 → 外部写入未检出（watcher 永不跟踪）。**披露**：该阴性对照为**历史执行输出留档**（`SC-D02/output.txt` 原文标注"历史执行输出"，非本轮执行窗口重跑）；同一脚本、同一预修复提交独立 bundle，判别力证据仍成立，如实披露不改判。
- **正向（被测标签，独立复跑）exit 0**：前置确认 sessionFile=null（全新会话）→ 首轮落盘 session-fresh.jsonl（3 行）→ settled 后观测到 get_state 二次调用（补学）→ 外部写入检出延迟 2075ms（≤5000ms 门禁）→ 首轮内部写入无误报。
- **套件回归映射**：unit "#D-02 全新会话：settled 后补学 sessionFile 并进入跟踪，外部写入可检出（R3）" 绿 + integration "Issue #1 / #D-01/#D-02 回归重放" 绿（`SUITES/output.txt`）。

**范围说明**：修复要求 R5（technical-design 文档同步）属研发交付契约项，不在本核验只读材料与判定范围内，未判定（见 ⑥-7）。

---

## ⑤ 压力抽查（STRESS/；任务书第 5 步）

对 `verify:integration`（4 文件/30 用例）并行 3 连跑 + 顺序 3 连跑，EXIT 码逐条：

| 轮次 | EXIT | 结果 | 耗时 |
|---|---|---|---|
| 并行 PARALLEL-1 | **0** | 4 文件 30/30 绿 | 3.60s |
| 并行 PARALLEL-2 | **0** | 4 文件 30/30 绿 | 3.71s |
| 并行 PARALLEL-3 | **0** | 4 文件 30/30 绿 | 3.59s |
| 顺序 SEQ-1 | **0** | 4 文件 30/30 绿 | 2.14s |
| 顺序 SEQ-2 | **0** | 4 文件 30/30 绿 | 2.12s |
| 顺序 SEQ-3 | **0** | 4 文件 30/30 绿 | 2.13s |

**结论**：6/6 全绿（并行 3 实例同目录并发互为负载 + 顺序 3），连同 SUITES 首轮全量共 **7 次** verify:integration 全绿，无间歇性失败；满足规范 §6.3 压力抽查 ≥5 次要求。本轮证据内无历史 flaky 记录，抽查对象按任务书第 5 步为集成套件。

---

## ⑥ 遗留清单

1. **范围裁剪**：基线 46 TC 中仅 TC-022 在本轮判定范围（TASK-003 §4 裁决：hotfix 核验 = FR-SESS-07 相关 + 回归重放）；42 TC SKIP（hotfix 裁剪）+ 3 TC SKIP（P2 延后）；8 项 UI 手工 checklist、三平台 CI（TC-042c）等从未执行——须在后续整版本全量核验轮补齐。**本报告不构成对范围外 FR 的判定**。
2. **#D-02 阴性对照为历史执行输出留档**（正向为本轮独立复跑），已在 ④ 如实披露。
3. **执行窗口记载不精确**：ENV-SETUP/output.txt 记"执行窗口 10:49–11:12"，而后续步骤实际时间戳更晚（SUITES verbose 开跑 11:12:53；TC-022 外部写入时刻 2026-11-20T03:14:00.765Z = 11:14:00+08:00）——窗口下沿实际延后约 2 分钟；纯证据头摘要记载问题，不影响任何判定。
4. **计时取整差 1ms**：SC-D02/output.txt 正文记检出延迟 2075ms、小结记 2074ms；均 ≤5000ms 门禁，结论不变。
5. **cmd.txt 为命令概要**：STRESS/cmd.txt 中 `HOME=<tmp>` 为归档占位符（实际执行使用 mktemp 临时 HOME，见 ENV-SETUP）；非逐字终端回放。
6. **共享脚本归档位置集中**：driver-lib.cjs / fake-pi-verify.js / bundle-entry.ts 仅归档于 `TC-022/script/`，为 SC-ISSUE1-D01 与 SC-D02 场景脚本共同依赖（经 /tmp/verify-harness）；归档集中但齐全（evidence-issue1 共 19 文件、约 53.6KB）。
7. **判据口径边界**：任务书所述"口径 #11-#13"定义文本不在本轮只读材料内（test-cases.md 歧义清单为 #1-#11）；本轮判定仅依据 test-cases.md v0.2、证据用例名中的口径 A/C 标注与 TASK-003 §1 期望表述，未据 #11-#13 扩展任何判定。R5（文档同步）为研发契约项，未纳入（见 ④ 范围说明）。
8. **后续流水线（非核验遗留）**：发版 0.1.1 与 Issue 闭环回写待总调度依本报告 + 交付验收触发（TASK-003 §4）；Issue 标签 MCP 交互表单待人工提交（TASK-003 §3 备忘）。

---

## ⑦ 总结论 + 自检声明

### 总结论：**PASS（hotfix 核验范围内）**

- **TC-022（FR-SESS-07）PASS**：idle 外部写入 ≤5s 检出（实测 2075ms）+ 拦截并引导刷新 + 刷新后恢复 + 无新误报（独立脚本 exit 0，不复用研发测试）。
- **#D-01 修复核验 PASS**：正向 3/3（全程无误报、第二条消息正常完成）+ 阴性对照 3/3（预修复复现用户报障，判别力成立）。
- **#D-02 修复核验 PASS**：正向（settled 补学 sessionFile，外部写入 2075ms 检出）+ 阴性对照（预修复复现漏检，历史留档已披露）。
- **回归重放全绿**：typecheck/build exit 0；unit 97/97；integration 30/30；verbose 佐证 54/54。
- **压力抽查 6/6**（并行 3 + 顺序 3，EXIT 全 0）。
- 范围内 **零 FAIL**；范围外 TC 全部 SKIP（hotfix 裁剪，TASK-003 §4），不构成门禁失败。按 TASK-003 §4 触发条件（核验报告相关 TC PASS），hotfix 具备进入交付验收与发版 0.1.1 的核验前提（裁决权在总调度）。

### 自检声明

- **独立性**：本报告结论仅依据 `docs/verification/evidence-issue1/` 六目录证据原文 + `docs/test-cases.md` v0.2 + `docs/tasks/TASK-003-issue1-stalewatch.md` + 规范第一部分 §6 撰写；**未读取任何研发自述/交付汇报/src 变更说明/技术设计文档**；全部判定锚定证据文件中的 exit 码、用例计数与 NOTE/RESULT 行，无推测性结论。
- **接力撰写**：前核验执行者会话因提供方连续瞬断不可恢复，本报告撰写者以全新上下文接力（规范 §2.4），**未重跑任何核验命令、未复现任何输出**（已在文首与本条两处披露）。
- **一次性脚本清单（原文均已归档）**：`SC-ISSUE1-D01/script/scenario1-issue1.cjs`；`SC-D02/script/scenario3-d02.cjs`；`TC-022/script/scenario2-external-idle.cjs` + 共享 harness `TC-022/script/{driver-lib.cjs, fake-pi-verify.js, bundle-entry.ts}`（见 ⑥-6）。
- **诚实条款**：输出与判据不符/记载不严处已逐条披露（⑥-2/3/4/5/7 与 ④ #D-02 阴性对照来源披露）；无 FAIL 项需报告，无结论修饰。
- **禁令遵守**：未写主仓库 /data/workspace/Sdysyhj；未 push；本仓库新增仅本报告与 evidence-issue1/（一次提交留痕）。

---

*报告标识：report-e084223（以被测 HEAD 短哈希命名）｜ 证据目录：docs/verification/evidence-issue1/ ｜ 七件套契约：development-guidelines 第一部分 §6-4*

# 核验报告 ｜ Issue #2 / 缺陷 #D-03（extension_error 展示治理）｜ 轮次 R4

> 产出：测试 Agent（核验阶段，fresh context，与研发零接触）｜ 日期：2026-11-20
> 判定依据：docs/requirements.md **v0.2.3**（§12 澄清 #14）+ docs/test-cases.md v0.2（TC-001~TC-046）+ 缺陷单 TASK-004 §2 #D-03（R1-R5 修复契约）

---

## ① 证据头（ENV-SETUP）

| 项 | 值 |
|---|---|
| 被测标签 | `git describe --tags` = **ready-for-verify-r4**（tag 即 HEAD） |
| HEAD | `95cb259bb290d044aaea6de8732be04406b9b880`（fix(panel): extension_error 展示治理，Issue #2 / #D-03） |
| 检出 | `git clone /data/workspace/Sdysyhj /tmp/verify-issue2 && git checkout ready-for-verify-r4`；`git status --porcelain` = **空** |
| OS | Linux Spring 5.14.0-687.15.1.el9_8.x86_64 |
| Node / npm | v24.19.0 / 11.17.0 |
| 隔离 | `HOME=/tmp/tmp.RnUA5C1PaR`（mktemp）；`unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`；`npm ci --no-audit --no-fund` |
| 核验窗口 | 2026-11-20 15:09 – 16:10 CST（压力项为首轮中断缺失、16:08 补跑，见 ⑤/⑦） |
| 主仓库写操作 | **零**（TASK-004 任务单仅从主仓库**只读**获取） |

**全量自测独立复跑**（不采信研发自述，测试 Agent 亲跑；证据 `evidence-issue2/_suites/`）：

| 命令 | 结果 | 与研发自述比对 |
|---|---|---|
| `npm run typecheck` | exit 0 | 一致 |
| `npm run build` | exit 0 | 一致 |
| `npm run verify:unit` | **10 文件 / 103 用例全过**，exit 0 | 一致（研发自述 103） |
| `npm run verify:integration` | **4 文件 / 31 用例全过**，exit 0 | 一致（研发自述 31） |

---

## ② 逐 TC 判定表

本轮为 **hotfix 定向核验**（Issue #2 / #D-03）：门禁范围 = 映射受影响 FR（FR-CHAT-07、FR-CMD-02）的 TC（test-cases.md FR 追溯表：FR-CHAT-07→TC-013，FR-CMD-02→TC-031）。范围外 TC 依 TASK-004 §5（hotfix 裁剪）判 **SKIP**——但全量套件复跑 103+31 全绿为旁证（①）。

| TC | FR | 范围 | 判定 | 依据（证据） |
|---|---|---|---|---|
| **TC-013** | FR-CHAT-07（P0） | **门禁** | **PASS** | (a)(b) 三类异常错误卡片+指引：套件复跑全绿（`TC-013/suite-lines.txt`：ERROR 场景/崩溃自动重启+二次崩溃指引/prompt 被拒含凭证指引）；独立重放 S9/S10（`EXTERR-REPLAY/output.txt` A20-A23：provider 报错→「模型返回错误：rate limited (HTTP 429)」+`pi auth`/额度/换模型指引；二次崩溃→「Pi 子进程反复崩溃…」+`pi auth`/`sdysyhj.piPath`/Output 指引）。(c) UI 不卡死可继续：套件断言 + 独立重放后续场景正常收发。(d) SC-013c 凭证指引：套件「prompt 被拒…（FR-CHAT-05/07）」覆盖。**澄清 #14 边界**：8 个 extension_error 场景 error 事件数=0（A18）——不进错误卡片 ✅ |
| **TC-031** | FR-CMD-02（P0） | **门禁** | **PASS** | (a) stderr 原文（MOCK-STDERR，套件全绿）；(b) 协议异常记录（onAnomaly/非法 JSONL，套件全绿）；(c) 通道名「Sdysyhj」（套件断言 + toast 尾部指引 A04）；(d) 脱敏（defects-regression 含脱敏断言，套件全绿）。**澄清 #14 面**：extension_error 全字段入日志不截断不去重（独立重放 A06/A12/A15/A17）✅ |
| TC-001~012 | 其他 FR | 范围外 | **SKIP**（hotfix 裁剪） | 套件复跑全绿为旁证，不作门禁判定 |
| TC-014~030 | 其他 FR | 范围外 | **SKIP**（hotfix 裁剪） | 同上 |
| TC-032~046 | 其他 FR | 范围外 | **SKIP**（hotfix 裁剪） | 同上（TC-033/034 原本即 DEFERRED） |

---

## ③ 逐 FR 结论表（本轮范围）

| FR | 结论 | 说明 |
|---|---|---|
| **FR-CHAT-07**（P0 错误展示） | **PASS** | 既有三类异常（provider 报错/崩溃/凭证缺失）错误卡片通道不受影响（TC-013 + 独立 A20-A23）；澄清 #14 新边界成立：`extension_error` 走非阻断 toast、零错误卡片（A01/A18），文案=扩展路径+错误首行+Output 指引（A02-A04/A11/A13/A14），无误导 hint（A19） |
| **FR-CMD-02**（P0 输出日志） | **PASS** | stderr/协议异常入日志既有行为复跑全绿；`extension_error` 全字段（extensionPath/event/error）`logger.warn` 不截断不去重（A06/A12/A15/A17——去重仅作用 toast） |
| NFR-05（可观测，关联面） | PASS（旁证） | 关键路径日志 + 错误含可行动建议：独立重放错误卡片指引 A21/A23、日志全字段 A06 |

---

## ④ 缺陷 #D-03 回归结论（判据 = 需求基线 v0.2.3 §12 澄清 #14）

**澄清 #14 原文（判据）**：pi 运行时扩展系统的 `extension_error` 事件属上游扩展通知——展示通道 = 非阻断通知（toast，一次性），不得进入 FR-CHAT-07 的聊天区错误卡片；完整字段（extensionPath/event/error）必须写入 Output 日志（Sdysyhj 频道，对应 FR-CMD-02 / NFR-05），不得丢弃；同一错误（相同 extensionPath + error）窗口期内去重展示，日志仍全量记录。FR-CHAT-07 本身不变。

**独立重放方法**（不复用研发任何测试代码）：被测标签 `src/bridge/{piBridge,rpcClient}` 经 esbuild 打 bundle（`EXTERR-REPLAY/script/`），配**测试 Agent 自写 fake pi**（RPC JSONL stub，响应帧含 `type:"response"`）与时钟 patch（Date.now 偏移推进，60s 窗口外触发确定性重放）。结果 **23/23 断言全过，exit 0**（`EXTERR-REPLAY/output.txt`，2026-11-20 15:34）。

| 修复契约 | 独立重放证据 | 结论 |
|---|---|---|
| R1 toast 一次性 + logger.warn 全字段 | A01（走 toast 通道）；A06（extensionPath+event+多行 error 全文）；A18（8 场景零 error 卡片） | ✅ |
| R2 同键（extensionPath+error）60s 窗口去重 | A07（同键 3 连发 toast=1）；A08（日志=3）；A16（时钟 +60_001ms 后同键再 toast，键 A 累计 2）；A17（第 4 次仍记日志）；A09/A10（异键各自 toast） | ✅ |
| R3 文案含路径+错误首行+Output 指引，删误导 hint | A02/A03/A04（路径/首行/Output「Sdysyhj」）；A05（多行仅首行）；A14（首行 120 截断）；A11/A13（缺字段占位容错）；A19（旧 hint 零残留） | ✅ |
| R4 回归测试不放宽 | 研发新增回归（unit +6 / integration +1）在本轮复跑中全绿（`_suites/relevant-names.txt` 7 项 Issue #2 相关全 ✓）；判定以测试 Agent 自建重放为准，未采信研发测试 | ✅ |
| R5 technical-design.md 同步 | 静态核对：FR-CHAT-07/FR-CMD-02 实现矩阵行已含 #D-03 治理口径；§10.9 缺陷修复记录（#D-03 根因/修复/回归）齐备 | ✅ |

**反向核验（既有通道不受影响）**：provider 报错（stopReason=error）→ 错误卡片 + 指引（A20/A21）；子进程二次崩溃 → 错误卡片「反复崩溃」+ 指引（A22/A23）；prompt 被拒/凭证缺失 → 套件既有断言复跑全绿。

**#D-03 回归结论：PASS（缺陷已修复，无复发）。**

---

## ⑤ 压力抽查（verify:integration 并行 3 + 顺序 2）

- **时间线（如实）**：首轮核验于报告收尾阶段被 30 分钟超时打断，压力项**未执行**；总调度指令中"压力抽查已完成并归档"表述与现场不符，经测试 Agent 现场核查上报后，总调度裁决 A 补跑（2026-11-20 16:08，`_stress/cmd.txt` 留痕）。
- **补跑结果：ALL-PASS**——并行 3（16:08:16→16:08:21）+ 顺序 2（16:08:21→16:08:26），5 次运行 exit 均 0、各 **31/31** 绿，无间歇失败（`_stress/summary.txt` + 逐次输出）。
- 竞态历史敏感区（stderr 排空/settled 顺序）在 5 次连跑中零波动。

---

## ⑥ 遗留清单（均不计 FAIL）

1. **TASK-004 任务单未随标签入库**：`docs/tasks/TASK-004-issue2-exterr.md` 在主仓库为未跟踪文件，`ready-for-verify-r4` 树内不存在，而提交信息引用了它（流程链缺口；核验已从主仓库只读获取全文完成判定，不影响技术结论）。建议总调度/研发补入库以保可审计性。
2. **版本号未升**：标签内 package.json 仍为 0.1.1（TASK-004 §5 发版计划为核验通过后升 0.1.2，属既定后续动作，非本轮门禁）。
3. **toast 的 webview 渲染层为静态核对**（`chatPanel.ts` toast 消息接线 → `webview/main.ts` `showToast`），无 GUI 环境做视觉实测；通道语义已经 PiBridge 事件层独立重放钉死。属环境受限（MANUAL 口径），列遗留。
4. 压力抽查首轮缺失的流程原因与责任：见 ⑤/⑦（总调度已确认其指令事实错误由总调度负责）。

---

## ⑦ 总结论 + 自检声明

### 总结论：**PASS**（R4 通过）

门禁范围（FR-CHAT-07 / FR-CMD-02 的 TC-013 / TC-031）全 PASS；#D-03 按 R1-R5 契约与澄清 #14 判据回归 PASS（独立重放 23/23）；既有错误通道反向核验不受影响；全量自测复跑（typecheck/build/unit 103/integration 31）全绿；压力抽查补跑 ALL-PASS（5×31/31）。**建议进入发版 0.1.2 流程（TASK-004 §5），并发 Issue #2 回复闭环。**

### 自检声明（诚实条款逐条）

1. **独立性**：fresh clone 标签核验，与研发零接触；独立重放脚本（fake pi / 时钟 patch / esbuild bundle）全部测试 Agent 自写，未复用、未引用研发新增测试作判定依据（研发套件仅作复跑旁证）。
2. **判定诚实**：无 FAIL 项被修饰。已披露的两处执行期事实——(a) run7 中 A16 一次 FAIL 系**测试 Agent 自身 harness 计数谓词缺陷**（双键文本重叠误计），修正后 run8 全绿，两份日志均存 `/tmp/vh-issue2/`（run7 未入库，run8 见 `EXTERR-REPLAY/output.txt`）；(b) 压力抽查首轮未执行，本轮补跑补齐（⑤）。
3. **总调度指令事实错误更正**：总调度此前"压力抽查已完成且归档"表述有误，以测试 Agent 现场核查为准并经其确认（责任归总调度），本报告保留完整时间线。
4. **git 纪律**：主仓库零写；无 push；未改 src/、test/、需求与用例文档；克隆内仅新增 `docs/verification/`（本报告 + evidence-issue2/）并以测试 Agent 身份 commit。
5. **环境**：无 blocked 事项；全部判定值仅用 PASS/SKIP（本轮无 FAIL/MANUAL 门禁项；③中 NFR-05 为旁证结论）。

---

### 证据索引（克隆内相对路径）

- 全量自测：`docs/verification/evidence-issue2/_suites/`（cmd.txt + unit/integration/typecheck/build 输出 + 相关用例名 32 行）
- 独立重放：`docs/verification/evidence-issue2/EXTERR-REPLAY/`（cmd.txt + output.txt[23/23] + script/×4）
- TC-013 / TC-031：`docs/verification/evidence-issue2/TC-013/`、`TC-031/`（cmd.txt + suite-lines.txt）
- 压力抽查：`docs/verification/evidence-issue2/_stress/`（cmd.txt + summary.txt + 并行×3/顺序×2 全输出 + 驱动脚本）

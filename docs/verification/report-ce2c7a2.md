# Sdysyhj 核验报告（TASK-001 核验阶段·第 2 轮，标签 ready-for-verify-r2）

## 1. 证据头

| 项 | 值 |
|---|---|
| 被测标签 / commit | `ready-for-verify-r2` / `ce2c7a23aa1ef9adb65c13a941197e13437aeaf5`（`git describe --tags` = `ready-for-verify-r2`） |
| 干净工作区 | `git clone /data/workspace/Sdysyhj /tmp/sdysyhj-verify-r2`，检出标签后 `git status --porcelain` 为空；全部核验执行毕复核 `git status --porcelain` 仍为空（0 行） |
| 需求基线 | docs/requirements.md **v0.2.2**（§12 澄清 #1-#13，含 #11 运行状态 / #12 消息数 / #13 FR-SESS-07 拦截语义） |
| 用例基线 | docs/test-cases.md **v0.2**（TC-001~TC-046，消息数口径已修订 4/10/18 与 8） |
| 剧本 | docs/verification-plan.md **v2.0**（本轮产物，含 SC-xxx ↔ 套件输出映射表） |
| 执行环境 | Linux 5.14.0-687.15.1.el9_8.x86_64（x86_64）；Node v24.19.0；npm 11.17.0；日期 2026-11-18（UTC） |
| 交付套件 | `npm run verify:unit` **91/91 绿**；`npm run verify:integration` **29/29 绿**（`evidence-r2/_suites/`）；测试名全文 `evidence-r2/_suites/verbose-names.txt` |
| 压力抽查 | `npm run verify:integration` 连跑 5 次（并行 `verify:unit` 负载 4 轮）：**5/5 全绿**（29/29 ×5），负载 unit 4/4 绿（`evidence-r2/_stress/`） |
| 核验脚手架 | 一次性脚本全部位于 `/tmp/r2harness/`（L1 mock 子进程按 MOCK-* 规范、vscode API stub、jsdom webview、L2 真实内置 pi + 127.0.0.1 mock provider、vsix 生产布局构造）；已归档 `evidence-r2/_harness/` 与各 TC 目录 |

**判定口径声明（重要）**：每条 TC 以**期望结果语义**为判定基准；机械判据与语义不一致处**逐条披露**（见 TC-041 行内注记）；口径钉死预期值（4/10/18、8、`streaming→aborted→idle`、拦截语义）不符一律 FAIL。本轮每条 TC 独立重新执行，未采信任何开发自述结论；交付套件（含研发自加的缺陷回归测试）仅作佐证，判定证据 = 本报告引用的独立脚本输出。断言脚本/命令均在 `/tmp/r2harness/`（仓库外），被测检出与主仓库全程未写入任何文件。

**执行范围**：TC-001~TC-046 全量（46 条，无遗漏）；重点回归第 1 轮缺陷 #1-#6；NFR 安全专项 TC-039/TC-040 重新实测；压力抽查 5×并行负载。

---

## 2. 逐 TC 判定表（46 条）

图例：PASS / FAIL / SKIP（P2 延后）/ MANUAL（UI 手工或环境受限，列遗留不计 FAIL）。证据路径均相对 `/tmp/r2-staging/docs/verification/evidence-r2/`。

| TC | FR | 判定 | 证据引用（摘要） |
|---|---|---|---|
| TC-001 | FR-CHAT-01 | **PASS** | `TC-001/output.txt` 5/5：deltas=[d1..d8] 有序；末增量后完成事件；状态流 idle→starting→streaming→idle；首增量 ≤259ms<2s；calls.jsonl 含 prompt |
| TC-002 | FR-CHAT-01 | **MANUAL** | `TC-002/note.txt`：UI checklist 无图形界面不可执行（兜底 TC-001 ✓） |
| TC-003 | FR-CHAT-02 | **PASS** | `TC-003/output.txt` 7/7：h1/h2、ul/ol/li、table/thead/tbody/tr/td、pre>code.language-js 含 hljs token、https 链接、行内 code 全命中，渲染产物样本在档 |
| TC-004 | FR-CHAT-02 | **MANUAL** | `TC-004/note.txt`（兜底 TC-003 ✓） |
| TC-005 | FR-CHAT-03 | **PASS** | `TC-005/output.txt` 6/6：宿主事件 t1..t4→d1..d3 有序；DOM details 无 open（默认折叠）；thinking 体=t1t2t3t4；正文含 d1d2d3 |
| TC-006 | FR-CHAT-03 | **MANUAL** | `TC-006/note.txt`（兜底 TC-005 ✓） |
| TC-007 | FR-CHAT-04 | **PASS** | `TC-007/output.txt` 11/11：3 卡 read/edit/bash；bash 摘要含 `seq 1 20000`；running→success×3；截断留尾（以 20000 结尾、1199B≪108893B）；复制全部=完整 108893B（真实 clipboard 通路）；details 可展开含完整入参/出参；复制按钮可见 |
| TC-008 | FR-CHAT-04 | **MANUAL** | `TC-008/note.txt`（兜底 TC-007 ✓） |
| TC-009 | FR-CHAT-05 | **PASS** | `TC-009/output.txt` 5/5：abort 命令注册（原文脚本 exit 0）；calls.jsonl 含 abort ✓；**状态流 streaming→aborted→idle ✓（缺陷#3 已修复，口径 #11）**；中止后恢复可输入 ✓；『已中止』标记 ✓ |
| TC-010 | FR-CHAT-05 | **MANUAL** | `TC-010/note.txt`（兜底 TC-009 ✓） |
| TC-011 | FR-CHAT-06 | **PASS** | `TC-011/output.txt` 6/6：steer 注入含原文且无 new_session；follow_up 排队本轮结束送达（queue_delivered）；webview 模式切换发送行为随模式变化 |
| TC-012 | FR-CHAT-06 | **MANUAL** | `TC-012/note.txt`（兜底 TC-011 ✓） |
| TC-013 | FR-CHAT-07 | **PASS** | `TC-013/output.txt` 10/10：SC-013a 429 错误卡+指引+恢复 idle；SC-013b 崩溃卡+指引+重启后续对话；SC-013c 无凭证错误卡+指引含 `pi auth` |
| TC-014 | FR-CHAT-08 | **PASS** | `TC-014/output.txt` 9/9：四字段（模型/thinking/状态/会话名）✓；正常流式 …→streaming→idle ✓；**中止流 streaming→aborted→idle ✓（缺陷#3）**；重命名同步 ✓；状态栏文案 ✓ |
| TC-015 | FR-CHAT-08 | **MANUAL** | `TC-015/note.txt`（兜底 TC-014 ✓） |
| TC-016 | FR-SESS-01 | **PASS** | `TC-016/output.txt` 4/4 + 静态：new session 注册 OK；旧会话 JSONL 保留且 marker 命中；A/B id 互异；文件仅 `$HOME/.pi/` 下 |
| TC-017 | FR-SESS-02 | **PASS** | `TC-017/output.txt` 4/4：3 项 ✓；三字段 ✓；**消息数=总数 [4,10,18] ✓（缺陷#5 按口径 #12 判定，期望 4/10/18）**；切换事件 ✓ |
| TC-018 | FR-SESS-03 | **PASS** | `TC-018/output.txt` 3/3：切回 A 历史含 2 marker；状态快照逐字段相等（含 isCompacting）；第 3 条续写同一 JSONL（5→7 行） |
| TC-019 | FR-SESS-04 | **PASS** | `TC-019/output.txt` 3/3：set_session_name("TC-019-name") 记录；状态名更新；历史列表标题同步 |
| TC-020 | FR-SESS-05 | **SKIP** | `TC-020/note.txt`：P2 二期延后（DEFERRED） |
| TC-021 | FR-SESS-06 | **PASS** | `TC-021/output.txt` 4/4 + 静态：无多会话命令；3 次新建各一次 session_reset；单 sessionId；spawn ≤1 个 --session；新建后历史清空 |
| TC-022 | FR-SESS-07 | **PASS** | `TC-022/output.txt` 7/7：外部修改 1658ms≤5s 提示 ✓、横幅含『刷新』✓；**拦截语义 ✓（缺陷#4 已修复，口径 #13）**：未刷新时 prompt 被拦截（prompt 被受理=false），拦截提示含可行动指引；**刷新完成后交互恢复 ✓（b4）** |
| TC-023 | FR-FILE-01 | **PASS** | `TC-023/output.txt` 5/5：单根 cwd=W1；多根取 W1；无工作区 cwd=HOME 且提示『文件工具受限』且可对话 |
| TC-024 | FR-FILE-02 | **PASS** | `TC-024/output.txt` 6/6：'@' 触发选择器；枚举限工作区（排除外部文件）；file_ref=src/a.ts；输入框插入 `@src/a.ts`；mock 收到含路径消息 |
| TC-025 | FR-FILE-02 | **MANUAL** | `TC-025/note.txt`（兜底 TC-024 ✓） |
| TC-026 | FR-FILE-03 | **PASS** | `TC-026/output.txt` 4/4 + 静态：v0.2 结构化菜单断言（按命令 id）exit 0（R1 用例缺陷 #E1 已随 v0.2 修订消除，字面即过）；路径/选区 prompt 素材、L2-L3 行号、explorer 场景全过 |
| TC-027 | FR-MOD-01 | **PASS** | `TC-027/output.txt` 5/5：manifest switch model 命令；get_available_models 候选入选择列表；set_model(mock-large) 记录；状态栏模型更新 |
| TC-028 | FR-MOD-02 | **PASS** | `TC-028/output.txt` 2/2：set_thinking_level + cycle_thinking_level 均记录；等级 high→medium 变化（枚举透传，§12 #10） |
| TC-029 | FR-MOD-03 | **PASS** | `TC-029/output.txt` 1/1：切换后（mock-large/low）宿主+webview 重建，状态栏恢复切换后值（非默认） |
| TC-030 | FR-CMD-01 | **PASS** | `TC-030/output.txt`：五命令注册原文脚本 exit 0；无显式 Command Palette menus 声明（VS Code 平台默认所有 commands 对命令面板可见），以命令实际经 executeCommand 执行成功佐证（abort→TC-009、newSession→TC-016/021/043、switchModel→TC-027、showHistory→TC-017/018、renameSession→TC-019） |
| TC-031 | FR-CMD-02 | **PASS** | `TC-031/output.txt` 4/4：**通道含 stderr 原文 E2E-STDERR-MARKER ✓、协议异常记录『无法解析的 RPC 输出行：…JSON…』✓（缺陷#2 已修复）**；通道名 Sdysyhj ✓；无哨兵 ✓ |
| TC-032 | FR-CMD-03(MVP) | **PASS** | `TC-032/output.txt` 2/2：mock 收到原文 `/review this file`；会话正常继续（有回复、无错误卡） |
| TC-033 | FR-CMD-03 | **SKIP** | `TC-033/note.txt`：'/' 补全二期延后 |
| TC-034 | FR-CMD-04 | **SKIP** | `TC-034/note.txt`：MCP UI 二期延后 |
| TC-035 | FR-CMD-05 | **PASS** | `TC-035/output.txt`：SC-035a~d 9/9（PATH 优先 source=path + 对话；内置回退 source=bundled + mock provider 对话；显式 source=explicit；/nonexistent/pi 错误详情+回退指引）+ **缺陷#1 生产布局复现 5/5**：vsix 布局（`/tmp/r2-vpkg`）下无『未找到可用的 pi 运行时』、source=bundled、spawn 实际启动 `<布局>/node_modules/…/dist/bundle/cli.js`（防 /tmp/node_modules 垫片混淆）、真实对话 8 deltas |
| TC-036 | NFR-01 | **PASS** | `TC-036/output.txt` 3/3：600 delta 零丢失按序；全量 ≤30s（26ms）；批处理代理：600 delta 仅 1 次全量重渲染（≤60） |
| TC-037 | NFR-01 | **PASS** | `TC-037/output.txt` 5/5：重开后仍 streaming ✓；继续收 delta ✓；abort 生效 ✓；状态流 streaming→aborted→idle ✓（与 TC-009(c) 同口径，缺陷#3 消除）；已中止标记 ✓ |
| TC-038 | NFR-02 | **PASS** | `TC-038/output.txt` 6/6：首崩 spawn+1 并提示；再崩不增长且提示『停止自动重启』；注入 webview 异常后 New Session 正常、宿主存活 |
| TC-039 | NFR-03 | **PASS** | `TC-039/output.txt`：随机哨兵 `PI_TEST_SENTINEL_2a9215e6966f9423`（执行时生成）注入 auth.json；verify:unit/integration + crash/error/noauth/stderr/stream 五场景日志全量触发；**被测产物/日志扫描 rg1/rg3 均 exit=1（零命中）**；脱敏实证：channel-crash.txt 中 `api_key":"[REDACTED]`（崩溃 stderr 的凭证配置出通道前已脱敏）。字面命令口径按 v0.2（docs/ 显式排除）执行，无 R1 #E2 自命中问题 |
| TC-040 | NFR-03 | **PASS** | `TC-040/output.txt` 28/28：PAYLOAD-XSS 7 载荷 × 4 断言全过（无 script 元素、无 on* 属性、href/src 无 javascript:/data:text/html、`window.xss===undefined`）；逐载荷渲染产物在档 |
| TC-041 | NFR-03 | **PASS**（语义，字面披露） | `TC-041/output.txt`：WORKSPACE 新增=空（OK）；HOME 新增 = 仅 `$HOME/.pi/agent/sessions/*`（会话）+ `~/.npm/*`、`~/.local/share/vitest/*`（npm/vitest 工具缓存，本 TC 的 `npm run` 自身产生，非插件写入）。机械检查字面输出 `FAIL: stray files in HOME`（工具缓存所致）已逐条披露并归因（输出尾部『核验注记』）；FAIL 条款"会话/状态副本落于他处"未触发 |
| TC-042 | NFR-04 | **MANUAL** | `TC-042/output.txt` + `note.txt`：(a) engines=^1.85.0 ✓；(b) vsce 离线不可用（npx 缺包），以 .vscodeignore + 依赖清单 + 原生依赖/独立 Node 运行时扫描等价核对（无 `.node` 原生产物、无独立 Node 运行时）；(c) 三平台 CI 矩阵本环境不可执行 → 遗留，不计 FAIL |
| TC-043 | NFR-05 | **PASS** | `TC-043/output.txt` 5/5：**4 类关键路径日志全齐（缺陷#6 已修复）**：`新建会话`/`prompt 发送：slow-check`/`abort：请求中止当前运行（RPC abort）`/`pi 子进程退出（code=3）` 均带时间戳；错误含可行动建议 ✓ |
| TC-044 | NFR-06 | **PASS**（披露） | `TC-044/output.txt`：隐藏文件扫描无插件写入残留（HOME 仅 npm/vitest 工具缓存；WORKSPACE 仅仓库既有 dotfiles 与依赖包自带 dotfiles）；FAIL 条款"插件写入残留"未触发，命中项逐类注明非插件产物 |
| TC-045 | §8-1 复合 | **MANUAL** | `TC-045/output.txt` 8/8（L2 真实内置 pi + 127.0.0.1 mock provider）：source=bundled 启动、流式 ≥8 deltas、thinking 3 deltas、read/edit/bash 3 工具卡全 success、src/a.ts 真实被改写（HELLO-EDITED）、命令输出 TC-045-ok、webview 呈现 ✓；vsix 打包/`code --install-extension` 需 vsce+VS Code 宿主 → 遗留；安装形态开箱即用由 TC-035 缺陷#1 生产布局复现（5/5）自动兜底 |
| TC-046 | §8-3 复合 | **PASS** | `TC-046/output.txt` 3/3：重载后 3 marker 全恢复 ✓；**消息总数=8（user 4 + assistant 4，口径 #12）✓（缺陷#5）**，listSessions.messageCount=8；JSONL 连续续写（7→9 行同文件）✓ |

**统计（共 46）**：**PASS 33** ｜ FAIL 0 ｜ SKIP 3（P2：TC-020/033/034）｜ MANUAL 10（8 项 UI checklist TC-002/004/006/008/010/012/015/025 + 环境受限 TC-042/TC-045）。

---

## 3. 逐 FR 结论表（26 条）

| FR | 优先级 | 结论 | 依据（TC）与说明 |
|---|---|---|---|
| FR-CHAT-01 流式对话 | P0 | **PASS** | TC-001 ✓ 5/5；TC-002 MANUAL（兜底 TC-001） |
| FR-CHAT-02 Markdown 渲染 | P0 | **PASS** | TC-003 ✓ 7/7；TC-004 MANUAL |
| FR-CHAT-03 thinking 折叠 | P0 | **PASS** | TC-005 ✓ 6/6；TC-006 MANUAL |
| FR-CHAT-04 工具调用卡片 | P0 | **PASS** | TC-007 ✓ 11/11（截断留尾/复制全部全量/展开入出参）；TC-008 MANUAL |
| FR-CHAT-05 中止运行 | P0 | **PASS** | TC-009 ✓ 5/5，状态流 `streaming→aborted→idle` 符合口径 #11（R1 缺陷#3 已修复） |
| FR-CHAT-06 steer 插话 | P1 | **PASS** | TC-011 ✓ 6/6 |
| FR-CHAT-07 错误展示 | P0 | **PASS** | TC-013 ✓ 10/10 |
| FR-CHAT-08 状态指示 | P0 | **PASS** | TC-014 ✓ 9/9（含中止状态流口径 #11） |
| FR-SESS-01 新建会话 | P0 | **PASS** | TC-016 ✓ 4/4 |
| FR-SESS-02 历史列表 | P0 | **PASS** | TC-017 ✓ 4/4，消息数=总数 [4,10,18]（口径 #12，R1 缺陷#5 已按裁决解决） |
| FR-SESS-03 继续会话 | P0 | **PASS** | TC-018 ✓ 3/3 + TC-046 ✓ 3/3（消息总数 8，口径 #12） |
| FR-SESS-04 会话命名 | P1 | **PASS** | TC-019 ✓ 3/3 |
| FR-SESS-05 分支切换 | P2 | **二期** | TC-020 DEFERRED（需求明示二期） |
| FR-SESS-06 单会话模式 | P0 | **PASS** | TC-021 ✓ 静态+4/4 |
| FR-SESS-07 外部修改提示 | P1 | **PASS** | TC-022 ✓ 7/7：≤5s 提示 + **拦截后续交互直至刷新、刷新后恢复**（口径 #13，R1 缺陷#4 已修复） |
| FR-FILE-01 工作区绑定 | P0 | **PASS** | TC-023 ✓ 5/5 |
| FR-FILE-02 @file 引用 | P0 | **PASS** | TC-024 ✓ 6/6；TC-025 MANUAL |
| FR-FILE-03 右键发送 | P1 | **PASS** | TC-026 ✓ 静态（v0.2 结构化断言）+4/4 |
| FR-MOD-01 切换模型 | P1 | **PASS** | TC-027 ✓ 5/5 |
| FR-MOD-02 切换 thinking | P1 | **PASS** | TC-028 ✓ 2/2（枚举透传，§12 #10） |
| FR-MOD-03 会话内持久 | P1 | **PASS** | TC-029 ✓ 1/1 |
| FR-CMD-01 命令面板 | P0 | **PASS** | TC-030 ✓ + 命令实测执行佐证（TC-009/016/017/019/027/043） |
| FR-CMD-02 输出日志 | P0 | **PASS** | TC-031 ✓ 4/4：stderr 原文 + 协议异常入通道（R1 缺陷#2 已修复） |
| FR-CMD-03 slash/skills | P2 | **二期**（本期部分 PASS） | TC-032（文本直发）✓；TC-033 DEFERRED |
| FR-CMD-04 MCP | P2 | **二期** | TC-034 DEFERRED |
| FR-CMD-05 pi 运行时来源 | P0 | **PASS** | TC-035 ✓ 9/9 + 生产布局 5/5：PATH 优先/内置回退/显式指定/失败指引 + **打包布局开箱即用成立**（R1 缺陷#1 已修复） |

**门禁结论**：16 条 P0 FR 全部 **PASS**（自动兜底 TC 全绿）；P1 7 条全 PASS；P2 3 条显式二期延后（不计门禁，§12 #1）——**MVP 门禁通过**。

---

## 4. 与第 1 轮对比（缺陷 #1-#6 回归结论）

| 缺陷 | R1 结论 | R2 回归结论 | 证据 |
|---|---|---|---|
| **#1** FR-CMD-05 打包布局内置运行时解析失败 | FAIL（P0） | **已修复** ✅：vsix 生产布局（`/tmp/r2-vpkg`：dist/extension.js + node_modules）下 source=bundled 正常解析、无『未找到可用的 pi 运行时』、真实启动 `<布局>/node_modules/…/cli.js`（spawn 路径断言防宿主垫片混淆）、L2 mock provider 完整对话 8 deltas（5/5）。R1 用例口径复用（defect-cmd05-prod-layout），新增防混淆断言与对话闭环 | `TC-035/output.txt`（后段 defect1-prod-layout-r2：5/5）；佐证：unit `runtime.test.ts > defaultResolveBundledCli 打包布局（缺陷#1 回归）` 5 项、integration `defects-regression > …source=bundled 可用（vsix 布局）` 全绿 |
| **#2** FR-CMD-02 stderr/协议异常未入 Output Channel | FAIL（P0） | **已修复** ✅：MOCK-STDERR 场景下通道收到 stderr 原文（`E2E-STDERR-MARKER`）与协议异常记录（`无法解析的 RPC 输出行：…`），均带时间戳、脱敏（4/4）。另 stderr 无换行尾部冲刷与 settled 排空屏障由 unit `stderr-ordering`/`rpcClient onStderr` 覆盖并在压力抽查 5×5 下无竞态 | `TC-031/output.txt`（4/4，通道转储全文在档） |
| **#3** 中止后状态不回 idle | PARTIAL（P1 口径） | **已修复** ✅（按口径 #11）：状态流 `streaming→aborted→idle`（aborted 瞬态、终态 idle，『已中止』为消息级标记），TC-009(c)/TC-014(b2)/TC-037(c2) 三处一致 | `TC-009/output.txt`、`TC-014/output.txt`、`TC-037/output.txt` |
| **#4** FR-SESS-07 无交互拦截/自动刷新 | FAIL（P1） | **已修复** ✅（按口径 #13）：外部修改后 prompt 被拦截（未受理），错误提示含『刷新』指引；刷新完成后交互恢复（7/7，含 b2/b3/b4 增补断言） | `TC-022/output.txt`（7/7） |
| **#5** 消息数口径 | PARTIAL（P2 口径，待裁决） | **已解决** ✅（口径裁决 #12 = 总数）：实现 messageCount=user+assistant 与新口径一致，TC-017 期望 4/10/18 实测 [4,10,18]、TC-046 期望 8 实测 8（含 listSessions.messageCount=8） | `TC-017/output.txt`、`TC-046/output.txt` |
| **#6** NFR-05 prompt/abort 日志缺失 | FAIL（P1） | **已修复** ✅：4 类关键路径日志全齐且带时间戳（新建会话 / prompt 发送 / abort / 子进程退出），错误含可行动建议（5/5） | `TC-043/output.txt`（含通道转储全文） |

**回归结论：缺陷 #1-#6 全部已修复/已解决，零回归、零新增产品缺陷**（本轮 46 条 TC 无 FAIL；交付套件 120 项 + 压力 5×5 全绿）。

**R1 证据链备注（非产品缺陷）**：R1 归档的 `evidence/TC-035/output.txt` 生产布局段实际显示 source=bundled 成功，与 R1 报告"解析报错"叙述不一致——结合宿主 `/tmp/node_modules` 残留垫片（恰在旧回退路径上，可致假成功），判断 R1 归档的是垫片存在下的复跑输出。本轮已用 spawn 路径断言消除该混淆项（剧本 v2 §1.4），并以对话闭环独立证明修复。

---

## 5. 遗留问题清单

1. **UI 手工 checklist 未执行（8 项）**：TC-002/004/006/008/010/012/015/025——无图形界面；均有自动兜底 TC 且兜底全绿。需在带 VS Code 的环境补录屏/截图证据。
2. **三平台矩阵未覆盖**：TC-042(c)（Windows/macOS/Linux CI 日志）——单机 Linux 不可执行；NFR-04 记 PARTIAL（自动子项 ✓）。
3. **打包/安装链未覆盖**：`vsce package` / `code --install-extension`（TC-042(b) 完整打包清单、TC-045 vsix 安装断言）——离线无 vsce、无 VS Code 宿主；已以 vsix 生产布局构造 + 打包清单静态等价核对兜底（TC-035 布局复现 5/5、TC-042 (b')）。
4. **P2 延后项（DEFERRED，不计门禁）**：TC-020（分支切换）、TC-033（'/' 补全）、TC-034（MCP UI）。
5. **用例脚本遗留（非产品缺陷，建议修订 test-cases）**：TC-041 原文扫描命令不过滤 npm/vitest 工具缓存（由 TC 自身 `npm run` 产生），机械结果恒为 FAIL——本轮按判定口径 v1.3b 语义判定并逐条披露（`TC-041/output.txt` 尾部注记），建议扫描命令豁免 `~/.npm`、`~/.local` 工具缓存。
6. **SC-xxx 命名未被交付套件采用**（R1 遗留 #E3）：已在剧本 v2 §2.4 建立 SC-xxx ↔ 套件输出映射表闭环，判定证据以独立脚本为准，不再阻塞。
7. **环境杂项**：宿主 `PI_CODING_AGENT_*` 注入需 unset（剧本 v1.1/v2 已固化）；宿主 `/tmp/node_modules` 残留垫片（R1 脚手架产物）对旧版解析有假成功风险，已在剧本 §1.4 固化防混淆断言——建议后续清理该残留。

---

## 6. 总结论

**PASS** —— MVP 门禁通过：

- 16 条 P0 FR 自动兜底 TC 全部通过（含第 1 轮 P0 门禁缺陷 **#1 FR-CMD-05**、**#2 FR-CMD-02** 的修复回归）；
- 缺陷 #1-#6 全部已修复/已解决（口径 #11/#12/#13 逐项实测吻合），无新增缺陷、无回归；
- 压力抽查（integration 5× 并行 unit 负载）全绿，历史竞态项未复现；
- NFR 安全专项实测通过：TC-039 随机哨兵产物/日志零命中（含 `[REDACTED]` 脱敏实证）、TC-040 七载荷 28/28；
- 遗留项均为 UI/三平台/打包安装环境受限（MANUAL，列遗留不计 FAIL）与 P2 二期延后，不阻塞门禁。

---

## 7. 自检声明

- 本次核验（第 2 轮）**全新上下文独立执行**，未采信任何开发自述结论（含研发自加的 `defects-regression.test.ts`——仅作佐证，全部重点缺陷均以独立脚本/命令重新实测）；R1 报告仅作缺陷范围参考，46 条 TC 逐条重新执行。
- **未写主仓库任何文件**：全部产物写入 `/tmp/r2-staging/docs/verification/`（report + evidence-r2/）与 `/tmp/r2-staging/docs/verification-plan.md`，由总调度合入；主仓库 `git status --porcelain` 全程 0 行，无任何 git 写操作。
- 一次性断言脚本全部位于 `/tmp/r2harness/`（仓库外），已归档 `evidence-r2/_harness/` 与各 TC 目录（脚本全文 + 输出即证据）；被测检出 `/tmp/sdysyhj-verify-r2` 执行前后 `git status --porcelain` 均为空。
- 判定证据 = 命令输出/脚本原文/文件路径；机械判据与语义不一致处（TC-041）已逐条披露字面结果；口径钉死预期值（4/10/18、8、streaming→aborted→idle、拦截语义）按 v0.2.2 实测判定。
- 证据大输出均完整存档（通道转储/套件输出全文；无超限截断，如个别脚本输出为摘要形态已在 cmd.txt 注明执行命令可复现）。

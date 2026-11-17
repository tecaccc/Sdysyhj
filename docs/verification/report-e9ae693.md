# Sdysyhj 核验报告（TASK-001 核验阶段）

## 1. 证据头

| 项 | 值 |
|---|---|
| 被测标签 / commit | `ready-for-verify` / `e9ae693025f174108e6094c64034197de82f5806`（`git describe --tags` = `ready-for-verify`） |
| 干净工作区 | `git clone /data/workspace/Sdysyhj /tmp/sdysyhj-verify`，检出标签后 `git status --porcelain` 为空 |
| 需求基线 | docs/requirements.md **v0.2.1**（含 §12 验收标准澄清 10 项） |
| 用例基线 | docs/test-cases.md（TC-001~TC-046） |
| 交付物 | docs/technical-design.md §10 FR 追溯表（26 FR） |
| 执行环境 | Linux 5.14.0-687.15.1.el9_8.x86_64（x86_64）；Node v24.19.0；npm 11.17.0；日期 2026-11-17 |
| 剧本版本 | docs/verification-plan.md **v1.1**（v1.0 发布后按执行期发现补记 ENV-SETUP 硬化与判定口径声明） |
| 交付套件 | `npm run verify:unit` 79/79 绿；`npm run verify:integration` 24/24 绿（`evidence/_suites/`） |
| 核验脚手架 | 一次性脚本全部位于 `/tmp/vharness/`（mock 子进程按 MOCK-* 规范、vscode API stub、jsdom webview 装配、L2 真实内置 pi + 127.0.0.1 mock provider）；全量脚本与公共件已归档 `evidence/_harness/` |

**判定口径声明（重要）**：每条 TC 以其**期望结果语义**为判定基准；机械判据（脚本退出码/扫描）与语义不一致处**逐条披露**；产品行为与基线语义不符（含口径钉死的预期值）一律 FAIL。凡因用例脚本自身缺陷导致字面命令不符而语义成立者，判 PASS 并在行内注明字面结果（记入用例基线缺陷清单）。

**套件偏差说明**：test-cases §0.5 要求套件按 SC-xxx 场景名定位，交付套件（vitest，103 个测试）**未使用 SC-xxx 命名**，亦未实现 `$MOCKLOG/calls.jsonl` 契约。核验按行为等价映射（见逐 TC 表证据列），未覆盖断言按 FR 追溯表定位入口以 `/tmp` 一次性脚本执行。

---

## 2. 逐 TC 判定表

图例：PASS / FAIL / SKIP（P2 延后）/ MANUAL（UI 手工，本环境无图形界面）。证据路径均相对 `docs/verification/evidence/`。

| TC | FR | 判定 | 证据引用（摘要） |
|---|---|---|---|
| TC-001 | FR-CHAT-01 | **PASS** | `TC-001/output.txt`：deltas=[d1..d8] 有序；末增量后完成事件；idle→starting→streaming→idle；首增量 ≤253ms<2s；calls.jsonl 含 prompt |
| TC-002 | FR-CHAT-01 | **MANUAL** | `TC-002/note.txt`：流式视觉连续性 checklist，无图形界面无法执行（兜底 TC-001 ✓） |
| TC-003 | FR-CHAT-02 | **PASS** | `TC-003/output.txt`：7 类结构断言全命中（h1/h2、ul/ol/li、table/thead/tbody/tr/td、pre>code.language-js 含 hljs token×6、https 链接、行内 code），渲染产物样本在档 |
| TC-004 | FR-CHAT-02 | **MANUAL** | `TC-004/note.txt`（兜底 TC-003 ✓） |
| TC-005 | FR-CHAT-03 | **PASS** | `TC-005/output.txt`：宿主事件 t1..t4→d1..d3 有序；DOM：details 无 open（默认折叠）；thinking 体=t1t2t3t4；正文含 d1d2d3 |
| TC-006 | FR-CHAT-03 | **MANUAL** | `TC-006/note.txt`（兜底 TC-005 ✓） |
| TC-007 | FR-CHAT-04 | **PASS** | `TC-007/output.txt`：3 卡（read/edit/bash）；bash 摘要含 `seq 1 20000`；状态 running→success×3；输出截断留尾（展示尾=`\n19999\n20000`，1199B≪108893B）；复制全部=完整输出 108893B；details 可展开含完整入参/出参；复制按钮在截断时可见 |
| TC-008 | FR-CHAT-04 | **MANUAL** | `TC-008/note.txt`（兜底 TC-007 ✓） |
| TC-009 | FR-CHAT-05 | **FAIL** | `TC-009/output.txt`：(b) calls.jsonl 含 abort ✓；(d) 中止后恢复可输入 ✓；(e) 已中止标记 ✓；**(c) 状态流不符**：实际 `idle→starting→streaming→aborted`，期望 `streaming→aborted→idle`（缺陷#3）。另：manifest abort 命令注册断言见 `_static/output.txt`（OK） |
| TC-010 | FR-CHAT-05 | **MANUAL** | `TC-010/note.txt`（兜底 TC-009 ✓） |
| TC-011 | FR-CHAT-06 | **PASS** | `TC-011/output.txt`：steer 请求含原文且无 new_session；follow_up 排队；本轮结束后 queue_delivered 送达；webview 模式切换发送行为随模式变化（steer→followUp） |
| TC-012 | FR-CHAT-06 | **MANUAL** | `TC-012/note.txt`（兜底 TC-011 ✓） |
| TC-013 | FR-CHAT-07 | **PASS** | `TC-013/output.txt` 10/10：SC-013a 429 错误卡+指引+恢复 idle；SC-013b 崩溃卡+指引+自动重启后可续对话；SC-013c 无凭证错误卡+指引含 `pi auth`/凭证 |
| TC-014 | FR-CHAT-08 | **FAIL** | `TC-014/output.txt`：4 字段断言 ✓（模型/thinking/状态/会话名，重命名同步 ✓，状态栏文案 ✓）；**(b2) 中止状态流与 TC-009(c) 一致**不成立：实际 …→streaming→aborted（缺陷#3） |
| TC-015 | FR-CHAT-08 | **MANUAL** | `TC-015/note.txt`（兜底 TC-014 除 (b2) 口径外 ✓） |
| TC-016 | FR-SESS-01 | **PASS** | `TC-016/output.txt` + `_static/output.txt`：new session 命令注册 OK；旧会话 JSONL 保留且 rg 命中 marker；A/B 会话 id 互异；文件仅在 `$HOME/.pi/` 下 |
| TC-017 | FR-SESS-02 | **FAIL** | `TC-017/output.txt`：(a) 3 项 ✓；(b1) 三字段 ✓；(c) 切换事件 ✓；**(b2) 消息数口径不符**：实际 [4,10,18]（user+assistant），期望 [2,5,9]（发送条数）（缺陷#5） |
| TC-018 | FR-SESS-03 | **PASS** | `TC-018/output.txt` 3/3：切回 A 历史含 2 marker；状态快照切换前后逐字段相等（含 isCompacting）；第 3 条续写同一 JSONL（5→7 行） |
| TC-019 | FR-SESS-04 | **PASS** | `TC-019/output.txt` 3/3：calls.jsonl 含 set_session_name("TC-019-name")；状态名更新；历史列表标题同步 |
| TC-020 | FR-SESS-05 | **SKIP** | `TC-020/note.txt`：P2 二期延后（DEFERRED），不计门禁 |
| TC-021 | FR-SESS-06 | **PASS** | `TC-021/output.txt` + `_static/output.txt`：无多会话命令（静态 OK）；3 次新建各一次 session_reset；状态模型单 sessionId；spawn 单 --session；新建后历史清空 |
| TC-022 | FR-SESS-07 | **FAIL** | `TC-022/output.txt`：(a) 外部修改 4152ms≤5s 提示 ✓、文案含刷新入口 ✓、webview 横幅含『刷新』✓；**(b) 不符**：未刷新情况下下一次交互既未被拦截也未自动刷新（prompt 被受理），仅驻留横幅（缺陷#4） |
| TC-023 | FR-FILE-01 | **PASS** | `TC-023/output.txt` 5/5：单根 cwd=W1；多根取 W1；无工作区 cwd=HOME 且提示『文件工具受限』且可对话 |
| TC-024 | FR-FILE-02 | **PASS** | `TC-024/output.txt` 6/6：'@' 触发选择器请求；枚举限工作区（排除外部文件）；file_ref=src/a.ts；输入框插入 `@src/a.ts`；mock calls.jsonl 收到含路径消息 |
| TC-025 | FR-FILE-02 | **MANUAL** | `TC-025/note.txt`（兜底 TC-024 ✓） |
| TC-026 | FR-FILE-03 | **PASS** | `TC-026/output.txt` 4/4（行为：路径/选区 prompt 素材、行号 L2-L3、explorer 场景）；`_static/output.txt` 字面结果：TC-026 step1 脚本 exit 1（"MISSING context menu entry"）——**用例脚本缺陷**（正则假设 menus JSON 含标题；VS Code menus 仅含命令 id，标题在 commands 段，实为 "Send to Pi"，explorer/editor 两组均注册）。按判定口径以语义（两菜单组均注册）判 PASS，字面结果在此披露（缺陷#E1） |
| TC-027 | FR-MOD-01 | **PASS** | `TC-027/output.txt` 5/5：manifest switch model 命令；get_available_models 候选 [mock-small,mock-large] 入选择列表；set_model(mock-large) 记录；状态栏模型更新 |
| TC-028 | FR-MOD-02 | **PASS** | `TC-028/output.txt` 2/2：set_thinking_level + cycle_thinking_level 均记录；等级字段 high→medium 变化（枚举透传不固化） |
| TC-029 | FR-MOD-03 | **PASS** | `TC-029/output.txt`：切换后（mock-large/low）模拟宿主+webview 重建，状态栏恢复切换后值（非默认） |
| TC-030 | FR-CMD-01 | **PASS** | `_static/output.txt`：五命令注册脚本 exit 0（OK）；`TC-030/note.txt`：无显式 `Command Palette` menus 声明（VS Code 平台默认所有 contributes.commands 对命令面板可见），以 TC-027/TC-016/TC-009 命令实际经 `commands.executeCommand` 执行成功佐证 |
| TC-031 | FR-CMD-02 | **FAIL** | `TC-031/output.txt`：通道名 Sdysyhj ✓、无哨兵 ✓；**(a) stderr 原文未入通道**（E2E-STDERR-MARKER 缺失）；**(b) 协议异常无记录**（非法 JSONL 行无痕）——缺陷#2。通道转储全文在档（仅 6 行激活/事件日志） |
| TC-032 | FR-CMD-03(MVP) | **PASS** | `TC-032/output.txt`：mock 收到原文 `/review this file`；会话正常继续（有回复、无错误卡） |
| TC-033 | FR-CMD-03 | **SKIP** | `TC-033/note.txt`：'/' 补全二期延后（DEFERRED） |
| TC-034 | FR-CMD-04 | **SKIP** | `TC-034/note.txt`：MCP UI 二期延后（DEFERRED） |
| TC-035 | FR-CMD-05 | **FAIL** | `TC-035/output.txt`：(a) PATH 优先 ✓（invocations.log+source=path+对话成功）；(c) 显式路径 ✓（source=explicit）；(d) 失败指引 ✓（含 /nonexistent/pi 详情+回退建议）；**(b) 打包形态内置回退失效**：同文件后段生产布局复现（`defect-cmd05-prod-layout.cjs`）——`<ext>/node_modules` 内置运行时存在但解析报"未找到可用的 pi 运行时"（缺陷#1）。harness 路径垫片下全链路对话成功（source=bundled、mock provider 收到请求）证明仅解析环节断裂 |
| TC-036 | NFR-01 | **PASS** | `TC-036/output.txt` 3/3：600 delta 零丢失按序；全量 ≤30s（26ms）；批处理代理：600 delta 仅 1 次全量重渲染（≤60），渲染文本 2893B |
| TC-037 | NFR-01 | **PASS** | `TC-037/output.txt`：(a) 重开后仍 streaming ✓；(b) 继续收 delta ✓；(c1) abort 生效 ✓、(c3) 已中止标记 ✓。附注：复用断言含状态流子项（c2）与 TC-009(c) 同口径偏差（streaming→aborted，无回 idle）——计入缺陷#3，本 TC 语义（"Stop 仍可中止"）成立故判 PASS |
| TC-038 | NFR-02 | **PASS** | `TC-038/output.txt` 6/6：首崩 spawn+1 并提示；再崩不增长且提示"停止自动重启"；注入 webview 异常后 New Session 正常执行、宿主存活 |
| TC-039 | NFR-03 | **PASS** | `TC-039/output.txt`（实际扫描输出）：套件绿；哨兵注入 auth.json 后触发 crash/error/noauth/stderr/stream 全日志路径；**产物扫描零命中**（`/tmp/vharness` 扫描 rg2 exit=1）；脱敏实证：`channel-crash.txt` 中 `api_key":"[REDACTED]`（崩溃 stderr 含原始凭证配置，出通道前已脱敏）。字面结果披露：TC-039 原文扫描命令 rg exit=0，命中仅 `docs/test-cases.md`（哨兵定义所在的 ENV-SETUP 规范文本）与 `docs/verification-plan.md`（剧本引用同一 ENV-SETUP）——属用例期望结果明示豁免的"凭证注入点本身"，非日志/输出/构建产物（缺陷#E2：建议扫描命令豁免规范文本） |
| TC-040 | NFR-03 | **PASS** | `TC-040/output.txt` 28/28：PAYLOAD-XSS 7 载荷逐一注入渲染入口（jsdom 活 DOM）：无 script 元素、无 on* 属性、href/src 无 javascript:/data:text/html、`window.xss===undefined`（未执行）；渲染产物逐载荷打印在档 |
| TC-041 | NFR-03 | **PASS** | `TC-041/output.txt`：全场景后 WORKSPACE 新增文件=空（OK）；HOME 新增仅 `$HOME/.pi/agent/sessions/*`（会话）+ 测试工具文件（`~/.npm/*`、`~/.local/share/vitest/*`——npm/vitest 产物，非插件写入，TC 命令自带 npm run 所致，披露之）；FAIL 条款（会话/状态副本落于他处）未触发 |
| TC-042 | NFR-04 | **MANUAL** | `TC-042/note.txt` + `_static/output.txt`：(a) engines=^1.85.0 ✓；(b) vsce 离线不可用，以 .vscodeignore+依赖清单等价静态核对（无原生依赖、无独立 Node 运行时）；(c) 三平台 CI 矩阵本环境不可执行 → 遗留，不计 FAIL |
| TC-043 | NFR-05 | **FAIL** | `TC-043/output.txt`（含通道转储全文）：(1) 会话创建 ✓、(4) 子进程退出 ✓、(5) 错误含可行动建议 ✓；**(2) prompt 发送无日志、(3) abort 无日志**——4 类关键路径缺 2（缺陷#6） |
| TC-044 | NFR-06 | **PASS** | `TC-044/output.txt`：隐藏文件扫描无插件写入残留（命中项为仓库既有 dotfiles/依赖包内容/测试工具缓存，均非插件产物，FAIL 条款"插件写入残留"未触发，披露之） |
| TC-045 | §8-1 复合 | **MANUAL** | `TC-045/output.txt`：组合链路 8/8 全过（真实内置 pi + 127.0.0.1 mock provider：source=bundled 启动、流式 9 delta、thinking 3 delta、read/edit/bash 3 工具卡全 success、src/a.ts 真实被改写、命令输出 TC-045-ok、webview 呈现）；vsix 打包/`code --install-extension` 需 vsce+VS Code 宿主，离线不可执行 → 遗留。注意：其"内置运行时启动"断言在打包形态下受缺陷#1 影响（§8-1 门禁实际受阻，见 FR-CMD-05） |
| TC-046 | §8-3 复合 | **FAIL** | `TC-046/output.txt`：(a1) 重载后 3 marker 全恢复 ✓；(a3) JSONL 连续续写（7→9 行同文件）✓；**(a2) 消息数 4 不符**：列表计数=user+assistant=8（用户发送=4）（缺陷#5，同 TC-017 口径） |

**统计（共 46）**：PASS 25 ｜ FAIL 8（TC-009/014/017/022/031/035/043/046）｜ SKIP 3（P2：TC-020/033/034）｜ MANUAL 10（8 项 UI checklist + TC-042/TC-045 环境受限）。

---

## 3. 逐 FR 结论表（26 条）

| FR | 优先级 | 结论 | 依据（TC）与说明 |
|---|---|---|---|
| FR-CHAT-01 流式对话 | P0 | **PASS** | TC-001 ✓；TC-002 MANUAL（兜底 TC-001） |
| FR-CHAT-02 Markdown 渲染 | P0 | **PASS** | TC-003 ✓ 7/7；TC-004 MANUAL |
| FR-CHAT-03 thinking 折叠 | P0 | **PASS** | TC-005 ✓ 6/6；TC-006 MANUAL |
| FR-CHAT-04 工具调用卡片 | P0 | **PASS** | TC-007 ✓ 11/11（含 200 行尾部截断/复制全部全量）；TC-008 MANUAL |
| FR-CHAT-05 中止运行 | P0 | **PARTIAL** | 中止/RPC abort/恢复可输入/已中止标记均达成（TC-009 b/d/e）；状态流口径不符（TC-009(c)，缺陷#3） |
| FR-CHAT-06 steer 插话 | P1 | **PASS** | TC-011 ✓ 6/6 |
| FR-CHAT-07 错误展示 | P0 | **PASS** | TC-013 ✓ 10/10（三类异常+指引） |
| FR-CHAT-08 状态指示 | P0 | **PARTIAL** | 四字段展示与重命名同步达成（TC-014 a/c/d）；状态流口径不符（TC-014(b2)，缺陷#3） |
| FR-SESS-01 新建会话 | P0 | **PASS** | TC-016 ✓ 4/4 |
| FR-SESS-02 历史列表 | P0 | **PARTIAL** | 列表三字段与切换达成（TC-017 a/b1/c）；消息数口径不符（TC-017(b2)，缺陷#5，待产品裁决口径） |
| FR-SESS-03 继续会话 | P0 | **PARTIAL** | TC-018 ✓ 3/3（含压缩状态快照、JSONL 续写）；TC-046 恢复/续写达成、消息数口径同缺陷#5 |
| FR-SESS-04 会话命名 | P1 | **PASS** | TC-019 ✓ 3/3 |
| FR-SESS-05 分支切换 | P2 | **二期** | TC-020 DEFERRED（需求明示二期） |
| FR-SESS-06 单会话模式 | P0 | **PASS** | TC-021 ✓（静态+动态） |
| FR-SESS-07 外部修改提示 | P1 | **PARTIAL** | ≤5s 提示刷新达成（TC-022 a）；未拦截/未自动刷新（TC-022(b)，缺陷#4） |
| FR-FILE-01 工作区绑定 | P0 | **PASS** | TC-023 ✓ 5/5 |
| FR-FILE-02 @file 引用 | P0 | **PASS** | TC-024 ✓ 6/6；TC-025 MANUAL |
| FR-FILE-03 右键发送 | P1 | **PASS** | TC-026 行为 4/4 ✓；静态字面脚本缺陷披露（缺陷#E1） |
| FR-MOD-01 切换模型 | P1 | **PASS** | TC-027 ✓ 5/5 |
| FR-MOD-02 切换 thinking | P1 | **PASS** | TC-028 ✓ 2/2（枚举透传不固化，符合 §12-#10） |
| FR-MOD-03 会话内持久 | P1 | **PASS** | TC-029 ✓（重载后恢复切换值） |
| FR-CMD-01 命令面板 | P0 | **PASS** | TC-030 ✓ + 命令实测执行（TC-009/016/027/029/038） |
| FR-CMD-02 输出日志 | P0 | **FAIL** | TC-031：stderr 与协议异常均未写入 Output Channel（缺陷#2，接线缺失） |
| FR-CMD-03 slash/skills | P2 | **二期** | TC-032（文本直发）✓ 本期判；TC-033 DEFERRED |
| FR-CMD-04 MCP | P2 | **二期** | TC-034 DEFERRED |
| FR-CMD-05 pi 运行时来源 | P0 | **FAIL** | TC-035：PATH 优先/显式指定/失败指引 ✓，但**打包布局下内置运行时解析失败，"开箱即用"不成立**（缺陷#1） |

**门禁结论**：P0 门禁 FR 中 **FR-CMD-02、FR-CMD-05 为 FAIL**，FR-CHAT-05/08、FR-SESS-02/03 为 PARTIAL（口径类）——**门禁不通过**。

---

## 4. 遗留问题清单

1. **UI 手工 checklist 未执行（8 项）**：TC-002/004/006/008/010/012/015/025——本环境无图形界面；均已有自动兜底 TC（除 TC-009(c)/TC-014(b2) 口径偏差外兜底通过）。需在带 VS Code 的环境补录屏/截图证据。
2. **三平台矩阵未覆盖**：TC-042(c)（Windows/macOS/Linux 各跑 verify:unit+verify:integration 的 CI 日志）——单机 Linux 环境不可执行；NFR-04 仅判 PARTIAL。
3. **打包/安装链未覆盖**：`npx vsce ls` / `vsce package` / `code --install-extension`（TC-042(b)、TC-045 安装产物断言）——离线环境无 vsce、无 VS Code 宿主。注意缺陷#1 正处于该链路，**vsix 打包安装后开箱即用必现失败**，建议优先在打包形态回归。
4. **P2 延后项（DEFERRED，不计门禁）**：TC-020（分支切换）、TC-033（'/' 补全）、TC-034（MCP UI）。
5. **需求/用例口径歧义残留（建议总调度裁决）**：
   - 消息数口径：历史列表"消息数"= 会话消息总数（实现，user+assistant）vs 发送条数（用例 2/5/9、4）；需求未定义。裁决若取"总数"，TC-017/TC-046 应转 PASS。
   - 中止后状态机：aborted 是否应回落 idle（用例 TC-009(c)/TC-014(b2) 期望回 idle；需求 §4.1 将 aborted 列为一等状态、§7 要求"已中止"标记）。
   - FR-SESS-07 "不静默继续"的操作性定义：§12-#7"提示刷新"已满足；TC-022(b) 要求"拦截或自动刷新二者其一"未满足。
6. **用例基线缺陷（建议修订 test-cases.md）**：
   - TC-026(a) 静态脚本正则假定 menus JSON 含标题文本，与 VS Code manifest 惯例不符（menus 仅含命令 id）。
   - TC-039 扫描命令未豁免哨兵定义所在的规范文本（docs/test-cases.md 自身即含哨兵字面量），任何实现均无法字面通过。
   - §0.5 的 SC-xxx 场景命名与 `$MOCKLOG/calls.jsonl` 契约未被交付套件实现（套件以测试名表达行为）。
7. **环境杂项**：核验宿主预置 `PI_CODING_AGENT_DIR` 会击穿 HOME 隔离（已在剧本 v1.1 硬化）；npm/vitest 在 HOME/工作区留工具缓存（TC-041/044 扫描中已注明，非插件行为）。

---

## 5. 缺陷清单（总结论依据）

> 总结论：**FAIL**（P0 门禁 FR-CMD-05、FR-CMD-02 未通过）

### 缺陷#1 ｜ P0 ｜ FR-CMD-05 ｜ 打包布局下内置 pi 运行时解析失败，"开箱即用"不成立
- **复现步骤**：① 按 vsix 安装布局构造 `/tmp/vpkg`（`dist/extension.js` = 扩展 bundle，`node_modules/@earendil-works/pi-coding-agent` = 内置运行时包，与 `.vscodeignore` 打包清单一致）；② `PATH=/usr/bin:/bin`（无 pi），配置 `sdysyhj.piRuntime=auto`；③ 激活扩展并 resolveWebviewView 发送 `ready`。
- **期望**：resolvePiRuntime 回退内置运行时（source=bundled），可正常对话（§8-1、§12-#9 开箱即用）。
- **实际**：报错 `未找到可用的 pi 运行时（PATH 无 pi，内置运行时缺失）`，聊天不可用；而 `<ext>/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js` 实际存在。
- **根因**：`src/bridge/rpcTransport.ts` `defaultResolveBundledCli()` 两级失效——① `require.resolve("@earendil-works/pi-coding-agent")` 因该包 exports 仅有 `import` 条件在 CJS 下抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`；② 相对回退 `path.join(__dirname,"..","..","node_modules",…)` 比打包布局（`<ext>/dist` → `<ext>/node_modules`）多一级 `..`。开发自测（vitest 自 `src/bridge` 运行，`../..` 恰为仓库根）无法暴露。
- **证据**：`evidence/TC-035/output.txt`（后段生产布局复现：HOST->WEBVIEW 错误消息 + Output Channel 转储 + cli.js exists=true）；脚本 `evidence/TC-035/defect-cmd05-prod-layout.cjs`。
- **影响面**：§8-1/§12-#9"从零安装开箱即用"、TC-035(b)、TC-045 安装形态、FR-CMD-05 门禁。

### 缺陷#2 ｜ P0 ｜ FR-CMD-02 ｜ 子进程 stderr 与 RPC 协议异常未写入 Output Channel
- **复现步骤**：MOCK-STDERR 场景（stderr 写 `E2E-STDERR-MARKER` 行 + 输出 1 行非法 JSONL），发起对话后转储 Output Channel。
- **期望**：通道收到 stderr 原文与协议异常记录（含解析失败/非法 JSONL 描述）。
- **实际**：通道仅 6 行激活/调试日志，无 stderr、无协议异常记录。
- **根因**：`RpcClient.onAnomaly` 与 stderr 累积无消费方接线（`src/extension.ts` createClient 未订阅；`PiBridge` 的 PiRpcClient 接口不含 onAnomaly）；stderr 仅在子进程退出时随 handleCrash 错误消息出现（正常运行期间丢失）。
- **证据**：`evidence/TC-031/output.txt`（通道转储全文 + FAIL 断言）。

### 缺陷#3 ｜ P1（口径）｜ FR-CHAT-05/08 ｜ 中止后状态不回 idle
- **复现/期望/实际**：MOCK-SLOW 运行中 abort——期望状态流 `streaming→aborted→idle`（TC-009(c)/TC-014(b2)），实际 `streaming→aborted` 停留（`agent_settled(aborted)` → `setRunState("aborted")` 后无 idle 迁移）。
- **备注**：与需求 §4.1 三态枚举、§7"已中止标记"展示兼容，属状态机口径分歧；技术设计 §3.2 状态图为"回到 idle（aborted 标记）"，与实现不一致。建议产品/架构裁决后二选一对齐。
- **证据**：`evidence/TC-009/output.txt`、`evidence/TC-014/output.txt`、`evidence/TC-037/output.txt`（c2 同口径）。

### 缺陷#4 ｜ P1 ｜ FR-SESS-07 ｜ 外部修改后无交互拦截/自动刷新
- **复现步骤**：创建会话 A 发消息 → 会话 JSONL 外部追加一行 → 观察后续交互。
- **期望**（TC-022(b)）：下一次交互被提示拦截 或 触发自动刷新（二者其一）。
- **实际**：仅驻留"会话已被外部修改"横幅（含刷新按钮）；未刷新时 prompt 照常受理（陈旧状态继续使用）。
- **证据**：`evidence/TC-022/output.txt`（观察输出：prompt 被受理=true，自动刷新=false）。

### 缺陷#5 ｜ P2（口径，待产品裁决）｜ FR-SESS-02/03 ｜ 历史列表"消息数"口径与用例预期不一致
- **复现/期望/实际**：分别发送 2/5/9 条消息的 3 会话——期望列表消息数 2/5/9（TC-017(b2)），实际 4/10/18（user+assistant 总数）；TC-046 同口径（期望 4，实际 8，用户发送数=4）。
- **备注**：需求未定义"消息数"口径；实现口径（会话消息总数）为常见产品行为。裁决若认 口径=总数，TC-017/TC-046 转 PASS；若认 口径=发送数，需改实现（仅计 user 消息）。
- **证据**：`evidence/TC-017/output.txt`、`evidence/TC-046/output.txt`。

### 缺陷#6 ｜ P1 ｜ NFR-05 ｜ prompt/abort 关键路径日志缺失
- **复现/期望/实际**：依次触发会话创建、prompt 发送、abort、子进程崩溃——期望 4 类事件均入日志（TC-043），实际仅"会话创建""子进程退出"2/4 命中，prompt 与 abort 无任何日志记录。
- **根因**：`PiBridge.sendPrompt`/`abort` 路径无 logger 调用（grep 证实 `src/` 内 logger 调用点不含 prompt/abort）。
- **证据**：`evidence/TC-043/output.txt`（通道转储全文）。

### 用例基线缺陷（非产品缺陷，已在 TC 行内披露）
- **#E1** TC-026(a) 静态正则假定 menus JSON 含标题（VS Code 惯例不含）→ 字面必败。
- **#E2** TC-039 扫描命令命中用例文档自身哨兵定义 → 字面必败（产品产物实测零命中）。
- **#E3** §0.5 SC-xxx 场景命名/calls.jsonl 契约与交付套件不一致。

---

## 6. NFR 安全专项（实测输出证据）

### TC-039 日志脱敏
- 哨兵注入：`{"api_key":"PI_TEST_SENTINEL_7f3a9c21"}` → `$HOME/.pi/agent/auth.json`（`evidence/TC-039/output.txt` 首段）。
- 日志路径触发：`npm run verify:unit`（exit=0）、`npm run verify:integration`（exit=0）、crash（stderr 含凭证配置 dump）/error/noauth/stderr/stream 五场景全量 Output Channel 转储（`logs/channel-*.txt`）。
- **扫描输出（实际）**：
  - 产品日志/输出/构建产物扫描 `rg -F "$SENTINEL" /tmp/vharness -g '!run.sh' -g '!t_tc039.sh'` → **exit=1（零命中）**；
  - 脱敏痕迹：`channel-crash.txt: api_key":"[REDACTED]`（崩溃 stderr 中的原始 `{"api_key":"PI_TEST_SENTINEL…"}` 出现在通道前已被 `redactSecrets` 替换）；
  - 字面命令（TC-039 原文口径）rg exit=0，命中 2 处均为**哨兵定义所在的规范文本**（`docs/test-cases.md` ENV-SETUP 行、`docs/verification-plan.md` 引用行），非日志/输出/产物（按期望结果"排除凭证注入点本身"豁免，字面结果如实披露）。
- **结论：PASS**（含字面口径披露与用例修订建议 #E2）。

### TC-040 防 XSS
- 载荷集 7 项逐一对渲染入口（`webview/render/markdown.ts` `renderMarkdown`，marked+DOMPurify）注入，jsdom 活 DOM 检查（同 webview innerHTML 路径）：
  - `<script>window.xss=1</script>`、`<img src=x onerror=…>`、`[x](javascript:…)`、`<a href="javascript:…">`、`<iframe src="javascript:…">`、`<svg onload=…>`、`[x](data:text/html,<script>…)`；
  - 每载荷 4 断言 ×7 = **28/28 PASS**：无 script 元素、无 on* 属性、href/src 无 javascript:/data:text/html 协议、`window.xss === undefined`（脚本未执行）；
  - 渲染产物逐载荷打印于 `evidence/TC-040/output.txt`。
- **结论：PASS**。

---

## 7. 总结论

**FAIL** —— P0 门禁未通过：

1. **FR-CMD-05（P0）FAIL**：打包布局下内置运行时解析失败，"从零安装开箱即用"（§8-1/§12-#9）不成立（缺陷#1，附最小复现）。
2. **FR-CMD-02（P0）FAIL**：stderr 与协议异常未接入 Output Channel（缺陷#2）。

另有口径类 PARTIAL（FR-CHAT-05/08 状态机、FR-SESS-02/03 消息数、FR-SESS-07 拦截语义）与 NFR-05 FAIL（prompt/abort 日志缺失，缺陷#6），详见缺陷清单。

**修复后回归建议**：缺陷#1/#2/#6 修复后重跑 TC-031/035/043/045（含 vsix 安装形态）；口径类（#3/#4/#5）由总调度裁决后对齐基线或实现并重判对应 TC。

---

## 8. 自检声明

- 本次核验**仅写入** `docs/verification/`（本报告与 evidence/）与 `docs/verification-plan.md`；未修改任何源码、测试、需求/用例文档；未执行任何 git 写操作（commit/tag/branch）；报告提交由总调度代执行。
- 全部一次性断言脚本位于 `/tmp/vharness/`（已归档 `docs/verification/evidence/_harness/` 与各 TC 目录），脚本全文+输出即证据；被测仓库（含 /tmp 检出副本）未被写入任何测试文件。
- 所有判定均基于命令输出/文件路径/脚本原文；FAIL 项均附复现步骤、期望、实际与证据路径；未采信任何开发自述结论（FR 追溯表仅用于定位被测入口）。

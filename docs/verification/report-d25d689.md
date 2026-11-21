# TASK-008 独立核验报告（FR-CHAT-11 用户消息单次展示 + 协议 golden fixture）

> 被测：ready-for-verify-r7（commit `d25d689`）｜ 核验 Agent（fresh context，全新执行）｜ 日期：2026-11-21
> 依据：docs/test-cases.md **v0.5.1**（TC-062~TC-076）、docs/requirements.md **v0.5.1**（FR-CHAT-11 + 澄清 #5/#12/#16/#17）、docs/verification-plan.md v2.0（执行口径；其 §2.4 SC 映射表止于 TC-046，本轮 SC-062~076 映射由本报告 §2.0 建立）、docs/tasks/TASK-008-todolist3-echo-dedup.md（背景）
> 本报告及证据由核验 Agent 产出，落档于 clone 内 `docs/verification/evidence-t8/`，由总调度合入主仓库。

---

## 1. 证据头（环境与现场）

| 项 | 值 |
|---|---|
| 干净检出 | `git clone --no-hardlinks /data/workspace/Sdysyhj /tmp/verify-task008 && git checkout ready-for-verify-r7` |
| git describe --tags | `ready-for-verify-r7`（HEAD = `d25d689`，"fix+feat(bridge+webview): TASK-008 用户消息单次展示（FR-CHAT-11）+ 协议 golden fixture 落地"） |
| git status --porcelain（检出后） | **空**（干净；核验结束后仅新增未跟踪 `docs/verification/evidence-t8/`，无任何源码/用例改动，见 §7） |
| OS | Linux Spring 5.14.0-687.15.1.el9_8.x86_64（单机 Linux，无图形界面） |
| Node / npm | v24.19.0 / 11.17.0 |
| 日期 | 2026-11-21（UTC 09:29 起） |
| 临时隔离 HOME | `/tmp/vt008-home-38zv`（`mktemp -d`；所有运行 `unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`，语义见 pi 随附 environment-variables.md L79–82，已核对） |
| 离线 | 无外网、无真实凭证；golden 回放与 mock 均 loopback/静态文件（唯一 registry 访问 = `npm ci`） |
| pi 运行时 | PATH `pi` = 1.5.2；仓库 node_modules 内置 = 1.5.2（golden 再录制用 PATH pi，见 §5.3） |
| 外部锚点核对 | json.md L30–46/L36–45/L38–39/L40/L45/L66–68/L118–124（L121–122）、rpc-commands.md L7–92/L26/L31/L33/L37–40/L42/L46–92/L48/L70–72/L87/L107–128（L128）、rpc.md L60–71（L67）、environment-variables.md L79–82 —— **逐行抽取原文核对，全部与 TC 引用一致**（TC-067 所引"L128 abort 保留队列"确在该行） |

**独立性声明**：mock pi（`/tmp/vt008/mypi.js`）、golden 回放器（`/tmp/vt008/myreplay.js`）、逐 TC 断言驱动（`/tmp/vt008/harness/runner.ts` → esbuild bundle `runner.cjs`）均为核验 Agent 自建，未复用交付 mock/回放器/测试代码；仅 import 被测实现 `src/bridge/*`（被测必需）。脚本已复制存档于 `evidence-t8/_harness/`。

## 2.0 SC-062~SC-076 ↔ 交付套件映射（本轮建立，verification-plan §2.4 未覆盖 v0.5 场景）

| SC | 交付套件等价输出（verbose 全名见 `_suites/unit-verbose.txt` / `integration-verbose.txt`） | 本轮独立判定证据（`evidence-t8/<TC-id>/`） |
|---|---|---|
| SC-062 | unit U1；integration I1 | tc062 驱动 5/5（T0/T1/T2 合并时间线采样） |
| SC-063 | unit U6 | tc063 驱动 6/6（3 轮轮次边界计数） |
| SC-064 | integration I3（golden-prompt-basic 回放） | tc064 驱动 5/5 + fixture 来源核证 + 再录制复证 |
| SC-065 | unit U3/U4；integration I1 | tc065 驱动 4/4（自建 STEERONLY 剧本） |
| SC-066 | unit U5；integration I2（QUEUEMIX） | tc066 驱动 7/7（自建 MIX 剧本，回声序 P1→S1→F1 实证） |
| SC-067 | unit U9 | tc067 驱动 5/5（自建 LONG+abort+迟到投递剧本） |
| SC-068 | integration I4（golden-steer-followup 回放） | tc068 驱动 5/5 + fixture 来源核证 |
| SC-069 | unit U11；integration I5 | tc069 驱动 4/4（getUiMessages + reloadHistory + JSONL 逐条比对） |
| SC-070 | unit U10（重建/回填）；integration I5/TC-018 链路 | tc070 驱动 4/4（switch_session B→A 权威重建 + JSONL 比对） |
| SC-071 | unit U2 | tc071 驱动 6/6（自建 REWRITE 剧本，快照序列变迁恰一次） |
| SC-072 | unit U8 | tc072 驱动 3/3（自建 REJECT 剧本 + 后续 P2 关联） |
| SC-073 | unit U7 | tc073 驱动 3/3（自建 HANDLED 剧本 + 后续 P2 关联） |
| SC-074 | unit U12 + 既有 FR-CHAT-01/03/04 套件 | tc074 驱动 6/6（自建 TOOL 剧本：thinking+工具链+迟到结果收敛） |
| SC-075 | 无套件（UI 手工 checklist） | MANUAL（见 §6 遗留） |
| SC-076 | unit D2.2 兑底用例 | tc076 驱动 5/5（自建 MIX_UNASSOC 剧本 + 重建收敛 + JSONL 比对） |

## 2. 逐 TC 判定表（TC-062~TC-076）

判定 = PASS 的依据双源：①交付套件全绿（§4 全量回归）；②本核验独立脚本断言全过（上表右列，共 **68/68 断言**）。

| TC | 要点 | 判定 | 独立断言 | 关键证据 |
|---|---|---|---|---|
| TC-062 | 基本单条三判定时点恰一条 | **PASS** | 5/5 | T0（索引 5）先于回声终稿（索引 7）；T0/T1/T2 恒 1 条、文本=原文；T2 合计 2（#12） |
| TC-063 | 同文本 3 次独立发送不合并 | **PASS** | 6/6 | 每轮终稿恰 1、轮末累计 1→2→3；终态 user=3/assistant=3/合计 6 |
| TC-064 | golden 回放兜底（基本单条） | **PASS** | 5/5 | fixture 含 user 回声（L17/18）先于 assistant（json.md L38–40）；回放链路 1 user+1 assistant=2；回声先于助手流式（时间线 6<7）。附：首跑 harness 缺陷记录与定性（§5.1） |
| TC-065 | 运行中 steer 注入回声恰一条 | **PASS** | 4/4 | T0/T1/T2 S1 恒 1；总数 2（P1+S1） |
| TC-066 | FU 先发+ST 后发乱序不错换 | **PASS** | 7/7 | 回声到达序 P1→S1→F1（乱序实证）；S1 回声后 F1 仍 1 条原文（不错换）；总数 3、文本两两互异；queue_update 4 次（协议侧日志） |
| TC-067 | abort 后队列保留·迟到回声不污染 | **PASS** | 5/5 | abort 后 F1 仍 1 条原文；P2 即时 1 条；F1 迟到回声与 P2 回声各自正确关联；总数 3（相对次序未断言，按口径披露①） |
| TC-068 | golden 回放兜底（混合注入） | **PASS** | 5/5 | 录制回声序 主→ST→FU（≠发送序 FU,ST）；queue_update 4 次；回放 user=3 按发送序、文本与录制权威一致；assistant=3 |
| TC-069 | 面板重开重放单条且与 JSONL 一致 | **PASS** | 4/4 | 重放 3 marker 各恰 1 次；reloadHistory 重建后 user 文本=发送原文；assistant=3/合计 6；重建序列与 JSONL 提取序列逐条相等（#5） |
| TC-070 | 会话切换权威重建（含 #16 改写） | **PASS** | 4/4 | 切 B 再切 A 后 user=3；第 2 条=Y 非 X（#16 末句）；序列与 JSONL 一致（#5）；无丢失/拼接/错换 |
| TC-071 | 权威文本≠原文：单条就地更新 | **PASS** | 6/6 | T0=1 条 X；T1=1 条 Y 且 **id 不变**（同一逻辑条目）；T2=1 条 Y；变迁恰一次（X→Y）无并存快照；全程恒 1 条 |
| TC-072 | success:false 拒绝路径 | **PASS** | 3/3 | R1 响应后 1 条原文；自 R1 发送起全程恒 1；P2 三时点 1/1/1 且 R1 未被 P2 回声污染；(c) error 通道在场（观察项记录） |
| TC-073 | disposition=handled 无回声 | **PASS** | 3/3 | H1 1 条原文、idle、无回声终稿、无 settled 残留；直至 P2 settled 恒 1；P2 三时点 1 且不错绑 |
| TC-074 | 回归边界（assistant/thinking/工具卡） | **PASS** | 6/6 | assistant 终稿 2 条（工具轮+总结轮，1 发送）；text_delta 按序；thinking_delta 在场；toolcall_status 收敛 running→success ×5；终稿=message_end 权威文本；user 侧单条 |
| TC-075 | 单气泡与就地更新观感 | **MANUAL** | — | 本环境无图形界面/无 jsdom（宿主未装，不新增安装），无法产出录屏+截图；自动兜底 = TC-062~074/076 全 PASS（观感最相关锚点：TC-071(d) 无 X/Y 并存快照、TC-062/066/069/070 恒单条）。列遗留 |
| TC-076 | 不可关联回声保守分支（#17） | **PASS** | 5/5 | 不可关联回声（改写投递文本）在场；其后 S1/F1 各恒 1 条、保留发送原文；全程 user 恒 3、id 无重复；权威重建后 S1 收敛为 JSONL 权威文本（不再保留原文）、F1 各 1 条、序列与 JSONL 逐条一致 |

**缺陷回归锚点**（TASK-008 缺陷直接回归判定项）：TC-062 / TC-063 / TC-069 / TC-070 全部 PASS——原缺陷形态（发送后两条气泡、历史重放重复用户条目）在本实现下未复现。

## 3. 逐 FR 结论表（FR-CHAT-11 ①–⑤）

| 验收标准 | 判定 TC | 结论 |
|---|---|---|
| ① 单条恒成立（发送即时/回声后/终稿后恰 1 条；同文本不跨发送合并） | TC-062/063 + golden TC-064；TC-072/073（拒绝/handled 无回声路径）、TC-076（保守分支） | **PASS**——全判定时点恒 1 条；计数单位=一次发送实证（3 次同文本→3 条）；§8 第 6 条门槛由 TC-062/065/066/069/070 直接判定，全过 |
| ② steer / follow-up 同口径（含乱序投递、abort 后队列保留迟到投递） | TC-065/066/067 + golden TC-068 | **PASS**——插话三判定时点恒 1；回声到达序与发送序相反时不错换；abort 保留队列在新运行投递时正确关联、不污染新发送 |
| ③ 历史重放不重复（面板重开/会话切换，与 JSONL 一致，#5） | TC-069/070 | **PASS**——重放/权威重建每 user 恰 1 条，序列与会话 JSONL 逐条一致（含 #16 改写会话第 2 条=Y） |
| ④ 文本保真（不丢失/截断/拼接/错换；#16 权威文本单条就地更新；#17 不可关联保守例外） | TC-066/070/071/072/073/076 | **PASS**——可关联回声就地更新（同 id 变迁恰一次、无双版本并存）；不可关联回声恒单条不错换不新增，权威重建后收敛 JSONL；拒绝/handled 路径不污染后续关联 |
| ⑤ 回归边界（assistant/thinking/工具卡不受影响） | TC-074（+全量回归 166/36 绿） | **PASS**——含回声事件流下流式按序、thinking 翻译在场、工具卡状态收敛 success、assistant 终稿=message_end 权威文本 |

**FR-CHAT-11 总结论：PASS（P0 门禁满足）**。UI 补充项 TC-075 列 MANUAL 遗留，不入门禁（verification-plan §4 纪律：FR 门禁以自动兜底 TC 判定）。

## 4. 全量回归（核验 Agent 亲跑）

| 命令 | 结果 | 期望对照 |
|---|---|---|
| `npm run typecheck` | exit 0，0 错误 | 0 错 ✓ |
| `npm run build` | exit 0（esbuild 成功） | 成功 ✓ |
| `npm run verify:unit` | exit 0，**166/166**（13 文件） | 166 ✓ |
| `npm run verify:integration` | exit 0，**36/36**（6 文件） | 36 ✓ |

输出全文：`_suites/{typecheck,build,unit,integration}.txt`；verbose 用例名（SC 映射依据）：`_suites/{unit,integration}-verbose.txt`。

## 5. 专项核验

### 5.1 TC-064 首跑失败定性（harness 侧，非产品缺陷；两次经过均留证）

- 现象：核验驱动首跑 golden 回放报「Pi 子进程异常退出（code=1）→自动重启→反复崩溃→发送失败」。
- 根因：**核验脚本自身缺陷**——`runner.ts` makeHarness 误写 `const script = opts.replay ?? MYPI`，回放模式下把 fixture 的 `.jsonl` 路径当作 node 脚本 spawn（node 加载 .jsonl 即 exit 1）。修复为 `opts.replay ? MYREPLAY : MYPI`。
- 定性依据（三方互证）：①交付套件 golden-replay I3/I4 本轮全绿（36/36）；②最小复现脚本（baseArgs 正确写法）全链路正常（user+assistant 恰 2 条，`TC-064/dbg-golden-output.txt`）；③修复后 tc064 5/5。证据：`TC-064/first-run-harness-defect.txt`（含机制级最小复现 `node <fixture>.jsonl --mode rpc` → exit 1）。

### 5.2 golden 来源核证（TC-064/068）

- 头注释：两剧本均含录制命令、录制日期（2026-11-21）、pi 版本（1.5.2 PATH pi）、provider 配置（loopback mock + dummy key）、脱敏与归一化声明、格式说明（`TC-064|TC-068/golden-source-verification.txt`）。
- 结构：in/out 逐行交错（basic 23 条=in 3/out 20；mix 62 条=in 5/out 57）；user 回声 basic=1 条、mix=3 条且到达序 **主→ST→FU**（先于各轮 assistant message_start，json.md L38–40）；mix 含 queue_update 4 次（入队×2+出队×2，L121–122 快照语义）。

### 5.3 golden 再录制一致性复证（环境允许，已执行）

- 命令：scratch 副本 `/tmp/vt008/record-repro`（核验 clone 未动）内 `HOME=$(mktemp -d) node test/tooling/record-golden.mjs`，PATH pi=1.5.2，loopback。
- ① 工具内双录确定性：两剧本各连录两次、归一化后**逐字节一致**（工具自检通过）。
- ② 与入库版逐字节 diff：**非完全一致**——差异仅限嵌入 **system 角色**消息的 3 行/剧本（basic L17-18+L30、mix L17-18+L69；即 message_start/end(system) 与 agent_end.messages 内嵌 system 序言）；user 回声/assistant/queue_update/次序等**行为契约内容逐字节一致**。
- 差异定性（披露，非 FAIL 项）：(a) system 序言 docs 路径占位符形态不同——今日再录制 `--pi-pkg` 归一化生效得 `<PI-PKG-DIR>/…`，入库录制时该归一化未生效（回落 `<HOME>/.nvm/…`），系录制环境/工具路径解析由来差异；(b) system 序言 skills 段有无——pi 序言含 `$HOME/.agents/skills` 技能清单，入库录制时录制 HOME 含 find-skills 技能，本复证用空临时 HOME 故无。system 角色桥侧忽略（README 记载 + 回放实证 uiMessages 仅 user/assistant），不影响任何 FR-CHAT-11 判据。
- **披露项**：fixture README「任意机器重录应得到相同字节」口径对 system 序言 3 行不成立（随录制 HOME 的 skills 清单与归一化路径形态而变）。建议后续把 system.sections 纳入定值归一化（维护项，非本 FR 门禁；判据以回放行为断言为准，全部成立）。证据：`TC-064/rerecord-diff.txt` + `rerecord-tool-output.txt`。

### 5.4 压力抽查（规范 §6.3/剧本 §3.6）

后台 `npm run verify:unit` 连跑 6 轮（CPU/进程负载，全 exit 0）并行负载下：前台 `npm run verify:integration` 连跑 **5/5 次 exit 0 且各 36/36 绿**；golden 回放独立驱动（tc064+tc068）连跑 **5/5 轮全断言过**（10/10 运行）。含时序断言区域（integration 全套 + golden 回放）无竞态回归。证据：`_stress/`。

## 6. 遗留清单

| # | 项 | 类型 | 处置建议 |
|---|---|---|---|
| 1 | TC-075 UI 手工 checklist（单气泡/就地更新观感，5 项 + 录屏≥20s + 关键帧截图） | MANUAL（环境无图形界面；宿主亦无 jsdom 可供 DOM 级自动兜底，不新增安装） | 发版前人工在 VS Code 图形环境执行并存证 `evidence/TC-075/`；自动兜底（TC-062~074/076）已全 PASS |
| 2 | golden fixture README「任意机器重录相同字节」口径对 system 序言 3 行/剧本不成立（§5.3） | 披露/维护项（不影响本 FR 判定） | 后续把 message_start/end(system) 与 agent_end 内嵌 system.sections 纳入定值归一化，或 README 补注豁免说明 |
| 3 | 入库 fixture 录制时 `--pi-pkg` 归一化未生效（docs 路径为 `<HOME>/.nvm/…` 形态，§5.3） | 披露/维护项（行为内容无差异） | 下次维护性重录时自然收敛为 `<PI-PKG-DIR>` 形态 |

## 7. 自检声明

- 干净检出 + `git status --porcelain` 为空后执行；核验全程**无 git 写操作**（无 commit/add/tag/stash；核验产物均为未跟踪新文件 `docs/verification/evidence-t8/` 与本报告，由总调度决定合入）。
- **未修改任何源码与用例**（src/ webview/ test/ docs/test-cases.md 等零改动；golden 再录制在 scratch 副本 `/tmp/vt008/record-repro` 执行）。
- **未启动子代理**；所有命令亲自执行。
- 核验脚本一律临时 HOME + 隔离 PI_* 变量、离线、自终止（每驱动 120s 看门狗、录制 580s/180s 有界超时、无 wait/tail -f 常驻；结束进程现场核查无挂起）。
- 判定纪律：FAIL 即报（本轮自动 TC 无 FAIL）；harness 侧两次脚本口径修正（TC-064 spawn 缺陷、TC-063/068/072/073/076 断言窗口）均已如实记录于 §5.1 与各 output.txt；TC-072(c) 按用例定义为观察项不计判定。

## 8. 总结论

**PASS（FR-CHAT-11 ①–⑤ 全部满足，P0 门禁通过）。** TC-062~TC-076：14 条自动 TC 全部 PASS（独立断言 68/68 + 交付套件全绿），TC-075 MANUAL 列遗留。全量回归 0 错/成功/166/36 与期望一致；压力抽查 5/5 无竞态；golden 来源核证通过、再录制行为内容逐字节复现（system 序言 3 行环境依赖差异已披露）。缺陷回归锚点（TC-062/063/069/070）全部 PASS——「消息发送之后存在两条气泡记录」缺陷已修复且未回归。

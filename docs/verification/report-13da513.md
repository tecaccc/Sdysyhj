# 核验报告 report-13da513 ｜ TASK-005（#D-04 工具卡状态修复 + FR-CHAT-09 流式自动跟随）独立核验 · 轮次 R5

> 产出：测试 Agent（核验阶段，fresh context，与研发零接触，不采信开发自述）｜ 日期：2026-11-20
> 判据基线：docs/requirements.md **v0.3**（FR-CHAT-09 新增；FR-CHAT-04 需求与验收不变）+ docs/test-cases.md **v0.3**（TC-047~TC-052）+ 缺陷单 TASK-005 §1 #D-04（P1，FR-CHAT-04，裁决：产品缺陷）
> 范围裁决：TASK-005 裁决——本批为 hotfix #D-04 + 单条新 FR 裁剪；TC-001~TC-046 范围外（SKIP，回归面以全量套件复跑覆盖）
> 报告契约：DevelopmentGuidelines/development-guidelines.md 第一部分 §6（七件套 + 诚实条款）

---

## ① 证据头

| 项 | 值 |
|---|---|
| 被测锚点 | `git describe --tags` = **ready-for-verify-r5**（检出时精确命中，无 `-N-g` 后缀） |
| 被测 HEAD | `13da513160780e2c6c78f9a3d65aaf955e542340`（annotated tag） |
| OS | Linux 5.14.0-687.15.1.el9_8.x86_64（RHEL 9 内核，单机 Linux，无图形界面） |
| Node / npm | v24.19.0 / 11.17.0 |
| 执行窗口 | 2026-11-20（+08:00）18:2x–18:5x |
| 克隆 | `git clone /data/workspace/Sdysyhj /tmp/verify-t5` → `git checkout ready-for-verify-r5` |
| 工作区 | 检出后 `git status --porcelain` 为空；`npm install --no-audit --no-fund`（任务指定口径）对 package-lock 的 2 行扰动已还原复净 |
| 隔离 | 临时 HOME `/tmp/tmp.EvESgT5g8g`；`unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`；不依赖真实 API key / 外网 |
| 主仓库 | **零写**（本克隆为唯一写侧；对主仓库仅有 clone 源与 TASK-005 缺陷单未跟踪文件的**只读**读取） |
| 产物叠加 | 核验证据以增量 commit 叠加于锚点之上（任务许可的 git 纪律；禁 push；src/test/需求/用例零改动）；执行期 `describe` 带 `-N-g` 后缀，被测对象始终为锚点 13da513 |

判据输入披露：TASK-005 缺陷单（`docs/tasks/TASK-005-todolist-batch.md`）在主仓库为**未跟踪工作区文件，未随标签入库**——本报告依据其只读副本判定（见 ⑤ 遗留/观察项 O-2）。

### 全量自测独立复跑（不信自述，全部亲跑）

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck` | EXIT=0 | `_suites/typecheck-output.txt` |
| `npm run build` | EXIT=0（extension CJS + webview IIFE 均出） | `_suites/build-output.txt` |
| `npm run verify:unit` | **117/117 passed**（11 文件，含 followState 13 条 + #D-04 桥侧时序契约 1 条） | `_suites/unit-output.txt` |
| `npm run verify:integration` | **31/31 passed**（4 文件） | `_suites/integration-output.txt` |

### 本轮判定方法总述（SC ↔ 载体映射，诚实条款前置）

TC-047~050 的观察契约为「跟随态标志 + 滚动位置采样序列（载体形式不限）」。本轮建立**双载体独立驱动**（不复用交付套件断言，脚本原文归档各 `script/`）：

1. **纯逻辑层**（决策级）：`webview/render/followState.ts` 以 esbuild 单独打包后独立驱动（27 断言，`TC-047/output-pure.txt`）——直接观测跟随态标志（`shouldAutoScroll()`）与 40px 阈值边界语义。
2. **接线层**（行为级）：**生产构建产物 `media/main.js`**（`npm run build` 产出）在 node:vm 中以手写极简 DOM shim（~300 行，`script/minidom.js`）加载，宿主→webview 消息驱动真实 main.ts/messages.ts 全链路，确定性模拟用户滚动（设定目标 scrollTop）与 MOCK-SLOW 增量，逐增量渲染点采样 scrollTop/scrollHeight/clientHeight/距底序列。
3. **负对照（判别力证明）**：/tmp 副本 bundle 移除被测修复行后重跑，必须由绿翻红（TC-047、TC-052 各一项，见 ④）。

shim 局限披露（不影响判定，逐条）：
- 布局度量为确定性代理（scrollHeight=字符量+子块基高，单调增长）；**阈值判定（≤40px）与滚动保持（scrollTop 恒等）断言不依赖具体布局数值**，布局模型仅提供增长的内容高度；
- dompurify 在 shim 下 `isSupported=false` 优雅降级（sanitize 原样返回）——markdown 消毒不在本轮断言面（NFR-03 已由 R2 TC-040 以真实 jsdom 覆盖）；
- 滚动事件在 scrollTop 赋值时同步触发（真实浏览器异步）——产品侧 `selfScrollPending` 自标记顺序（先置标志后赋值）不受影响，同步触发对该防护的检验更严格。

---

## ② 逐 TC 判定表

| TC | FR | 判定 | 判定依据（证据引用） |
|---|---|---|---|
| TC-047 | FR-CHAT-09① | **PASS** | 纯逻辑 27/27 + 接线 SC-047a（14 增量采样距底全 `[0,…]`≤40，全程零用户滚动）/ SC-047b（第 1 轮打断态+aborted 收尾→第 2 轮**首个**渲染点距底 0）+ 内容照常渲染；负对照翻红。`TC-047/` |
| TC-048 | FR-CHAT-09② | **PASS** | 单测口径（40px 阈值边界：40 界内跟随/41 界外打断，7 点位）+ SC-048（第 8 增量后上滚至距底 150px，后续 10 增量 scrollTop 恒等于 P、距底持续 >40、内容高度严格单调增长、末增量文本入 DOM）。`TC-048/` |
| TC-049 | FR-CHAT-09③ | **PASS** | SC-049（打断→滚回 0px 恢复后 10 增量逐点在底部；再次打断→滚回恰 40px 界值恢复后 10 增量逐点在底部；恢复即时生效无确认入口；对照滚回 41px 不恢复）。`TC-049/` |
| TC-050 | FR-CHAT-09④ | **PASS** | SC-050a 会话无痕（完整跟随→打断→恢复交互，出站消息全量捕获：**除初始 ready 外零出站**，无任何携带滚动/跟随状态的消息；源级 FollowState 仅 webview/main.ts 引用、UiMessage 无跟随字段、宿主侧无会话文件写入）；SC-050b 不跨重载（fresh 面板实例重放历史→重载后用户上滚 150px 构造可判别初态→第 2 轮首个渲染点距底 0，未沿用旧值；两实例 getState/setState 调用数=0）；SC-050c idle 不滚动（载入落定 ≥1s 后 ≥2s 观察窗 scrollTop 恒定 + 探针：idle 下 DOM 增长不滚动）。16/16。`TC-050/` |
| TC-051 | FR-CHAT-09 UI | **MANUAL**（遗留，不计 FAIL） | 单机 Linux 无图形界面（剧本 §1.5）；自动兜底 = TC-047~050 全 PASS。手工 checklist 3 项+录屏缺失，列 ⑤ 遗留。范围外产出观察：未见需求 §5 排除项 UI（回到底部按钮/跟随指示/设置项）。`TC-051/cmd.txt` |
| TC-052 | FR-CHAT-04（#D-04 回归） | **PASS** | SC-052a（MOCK-TOOLS-LATE：3 工具卡初始"进行中"→含工具卡 message_final 整体重建后仍"进行中"→**final 后 ≥60ms** 迟到 toolcall_status 逐卡更新"成功"，本轮结束无卡停留"进行中"，全程直播路径无刷新类出站）；SC-052b（同时序 bash 失败→"失败"）。11/11；负对照（移除修复回填行）复现"恒进行中"6 FAIL。`TC-052/` |
| TC-001~046 | — | **SKIP（范围外）** | TASK-005 裁决（hotfix+单 FR 裁剪）；回归面由全量套件复跑覆盖（unit 117/117、integration 31/31 全绿）。TC-020/033/034 维持 SKIP-DEFERRED（P2 延后既有裁决）。`_skip/cmd.txt` |

TC-052 判定方式披露（诚实条款）：webview 直播路径 = 生产 bundle 实驱动（上述）；**桥侧**（宿主翻译层"迟到 toolcall_status 仍以同 messageId/toolCallId 发出"）本轮未独立驱动，以 ①交付套件 unit `#D-04 时序契约`用例（全量复跑绿，`_suites/unit-output.txt`）+ ②源级佐证（`src/bridge/piBridge.ts`：message_final 于 :854，handleToolResult 于 :876 依 toolLocations 发出迟到 toolcall_status，:643 为 tool_execution_end 同构路径，不依赖 streaming 状态）共同覆盖——桥侧为佐证非独立复跑，如实记明。

纯逻辑脚本披露项（TC-047 附）：初版脚本 1 项机械断言 FAIL（第 2 轮 pre-stream 窗口沿用上一轮 following=true）——语义裁定：FR ① 判定点为"每轮流式开始"，该窗口内消息区无渲染点（user_message 先于 starting、stream_start 先于 assistant 渲染），接线层不可观测，stream_start 时重置默认跟随，终态不受影响，**不构成缺陷**；字面结果与修正过程留痕于 `TC-047/output-pure.txt` 披露段（终版 27/0）。

---

## ③ 逐 FR 结论表

| FR | 级别 | 结论 | 依据 |
|---|---|---|---|
| FR-CHAT-09 流式输出自动跟随 | P1 | **PASS** | 验收标准①②③④ 一对一由 TC-047/048/049/050 全 PASS；TC-051 UI 手势/视觉项 MANUAL 遗留（自动兜底成立）。P1 尽力项本轮以双载体自动判定达门禁口径 |
| FR-CHAT-04 工具调用卡片 | P0 | **PASS** | #D-04 回归锚点 TC-052 PASS（直播路径迟到结果收敛 进行中→成功/失败，负对照证明判别力）；常规状态流转/大输出截断/复制全部由套件 `工具卡片：执行状态 + 输出截断保留尾部 + 复制全部取全量（FR-CHAT-04）`用例绿佐证（全量复跑 117/117）。#D-04 修复经独立核验确认收敛 |
| 其余 25 条 FR | P0/P1 | **不在本轮判定面**（SKIP） | TASK-005 裁决；回归面 = 全量套件复跑全绿，无既有功能受损迹象。R1-R4 缺陷回归见 ④ |

---

## ④ 与上轮对比（缺陷逐项回归结论）

| 缺陷 | 上轮状态 | 本轮回归结论 |
|---|---|---|
| **#D-04**（FR-CHAT-04 工具卡恒"进行中"，TASK-005 §1，P1） | 待修复（本轮被测修复） | **修复确认**：TC-052 直播路径 11/11（迟到 ≥60ms 结果逐卡收敛成功/失败，无卡停留"进行中"）；**负对照**：移除 bundle 副本中 finalize() 的 blocks 回填行（即修复行，原 bundle :18187）后同场景 **6 FAIL**（三卡恒"进行中"——精确复现缺陷单症状），判别力成立（`TC-052/negative-control/output.txt`） |
| #D-01（Issue #1 外部修改误报，R3 修复） | R3 PASS | 修复代码（src/）本批零改动（13da513 变更面：webview/ + test/unit + technical-design.md，src/ 未触碰）；defects-regression 套件随全量 integration 31/31 绿 |
| #D-02（extension_error 展示，R3 修复） | R3 PASS | 同上（src/ 零改动 + 套件绿） |
| #D-03（Issue #2 exterr 治理，R4 修复） | R4 PASS | 同上（src/ 零改动 + 套件绿） |
| FR-CHAT-09 新增（无缺陷史） | —（本轮首验） | 首验 PASS；**负对照**：bundle 副本移除 onStreamStart 默认跟随置位后 SC-047a 翻红 3 FAIL（距底序列 `[0,0,78,182,…]` 失跟随被捕获，`TC-047/negative-control/output.txt`） |

压力抽查（间歇失败按 FAIL）：`verify:integration` 并行 3 + 顺序 2 共 **5/5 全绿（各 31/31）**，零间歇失败（`_stress/`）。历史 flaky 区（stderr/settled 顺序、退避重发）随全量套件多轮运行无异常。

---

## ⑤ 遗留清单

| # | 项 | 性质 | 处置建议 |
|---|---|---|---|
| L-1 | TC-051 手工 checklist 3 项（未滚动保持底部/打断后不跳动/滚回恢复）+ 录屏 ≥15s 存档 | **MANUAL 遗留**（不计 FAIL，自动兜底 TC-047~050 全 PASS） | 发版前人工在有图形界面环境补验 |
| L-2 | 三平台矩阵（Windows/macOS）与 vsix 实装核对 | 环境受限遗留（沿 R1 起既有） | 维持既有处置 |
| O-1 | TC-052 桥侧为套件+源级佐证（未独立复跑宿主桥驱动）；TC-050a 会话无痕以「webview→宿主出站零滚动消息 + 源级无写入路径」等价判定，未跑真实 pi 双会话 JSONL 字节级 diff | **判定方式局限披露**（不改变结论方向，见 ②） | 若需更强证据可在 L2 运行时环境补双会话 diff |
| O-2 | TASK-005 任务单（含 #D-04 缺陷单与交付汇报留档）在主仓库为未跟踪文件，**未随标签入库** | 流程观察项（证据链完整性；规范 §8 要求产物入库），非产品缺陷 | 总调度收尾时补 commit 归档 |
| O-3 | 纯逻辑层披露：第 2 轮 pre-stream 窗口存在上一轮 following 残留（接线层不可观测、FR 判定点之外，不构成缺陷，见 ②） | 语义披露 | 无需处置；如二期重构可清零 |

---

## ⑥ 总结论

**PASS（TASK-005 核验范围内）**

- 新增 P1 需求 FR-CHAT-09：验收标准①②③④逐条自动判定全 PASS（TC-047/048/049/050，双载体独立驱动 67 项断言 + 2 项负对照判别力证明）；TC-051 UI 项 MANUAL 遗留（不计 FAIL）。
- P0 既有需求 FR-CHAT-09 相邻面无回归；**#D-04 修复确认收敛**（TC-052 直播路径 PASS + 负对照复现缺陷证明判别力）。
- 全量自测独立复跑 4/4 绿（typecheck/build/unit 117/integration 31）；压力抽查 5/5 零间歇；#D-01/#D-02/#D-03 修复面（src/）本批零改动且套件绿。
- 无新增缺陷；遗留仅 L-1/L-2（环境类）与 O-1~O-3（披露/流程观察），均不阻塞门禁。

---

## ⑦ 自检声明

1. **独立性与零接触**：fresh context 克隆核验，未与研发会话接触，全部结论以本轮亲跑证据为唯一事实来源（development-guidelines §6-6 诚实条款）。
2. **不采信自述**：typecheck/build/verify:unit/verify:integration 全量独立复跑；TC-047~052 以自写脚本独立驱动（不复用交付套件断言代码），套件仅作交叉佐证。
3. **判别力自证**：两项负对照（移除 #D-04 修复行 → 6 FAIL 复现"恒进行中"；移除默认跟随置位 → SC-047a 3 FAIL 失跟随），harness 对被测缺陷与被测需求均具检出灵敏度。
4. **诚实条款逐条披露**：TC-052 桥侧佐证性质（②）、TC-050a 等价判定（②/O-1）、shim 布局代理与 dompurify 降级（①）、纯逻辑脚本初版 1 项机械断言 FAIL 的语义裁定与修正留痕（②/O-3）、TASK-005 未入库（证据头/O-2）。
5. **Git 纪律**：核验产物仅新增 `docs/verification/evidence-t5/**` 与本报告，全部在克隆内 commit（作者 测试 Agent <agent@sdysyhj.local>）；src/test/需求/用例零改动；未 push；主仓库零写（package-lock 安装扰动已还原，工作区检出态与归档毕均复核为净）。
6. **无密钥/无大文件**：证据均为文本输出与脚本（单文件 <100KB），无真实密钥。

**证据索引**：`docs/verification/evidence-t5/{env-header.txt, _suites/, _stress/, _skip/, TC-047/, TC-048/, TC-049/, TC-050/, TC-051/, TC-052/}`（各含 cmd.txt + output.txt ± script/ 原文；负对照见 TC-047/、TC-052/ 下 negative-control/）。

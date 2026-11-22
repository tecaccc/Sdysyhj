# TASK-009 切换批次（FR-AUI-02/03/05/07/08）独立核验报告（report-19588eb）

> 核验对象：TASK-009 **切换批次**交付（新 UI 转正默认 + 功能等价迁移 + 旧面板退役），交付 commit `19588eb`（分支 ready-for-verify-r9，2026-11-22）。
> 依据：docs/test-cases.md **v0.7**（TC-098~TC-137 + §0 共用约定）+ docs/requirements.md v0.7（§4 判定载体注记、§4.6、§8-7、#19）+ docs/tasks/TASK-009-assistantui-migration.md。
> 独立性：fresh context 全新执行；重点结论以**自建 harness/断言器**重测（/tmp/v10：static-gates.mjs / vharness.ts / replay-pi.mjs / suite-dom.test.tsx；vitest 5.1.0 + jsdom 31 仅作执行环境）；交付测试仅作对照佐证；未改仓库任何文件；clone 内无 git 写操作。

## ① 证据头（ENV）

| 项 | 值 |
|---|---|
| 检出 | `git clone --no-hardlinks /data/workspace/Sdysyhj /tmp/verify-s234`，`git checkout ready-for-verify-r9`（det @ `19588eb243d3e4ac348f597549821b808f0910bd`），`git status --porcelain` **空** |
| git describe/tags | `ready-for-verify-r9`；tags 含 v0.1.1~v0.1.7、ready-for-verify-r2~r9 |
| OS / Node | Linux 5.14.0-687.15.1.el9_8.x86_64 / Node v24.19.0、npm 11.17.0 |
| 日期（UTC） | 2026-11-22（核验执行 06:18Z–16:3xZ，跨两次会话续做） |
| 临时 HOME | `/tmp/verify-home`（隔离 `~/.pi/agent`；哨兵纪律：无真实凭证、无外网，仅 `npm ci` 触 registry） |
| 基线 | tag `v0.1.7` 经 `git archive v0.1.7` 重建于 `/tmp/base-v017`（同命令构建；`dist/extension.js` = **459,382 B**，与 FR 文本实测值 0 偏差） |
| 证据 | `docs/verification/evidence-t10/`（_scripts 自建脚本 / _suites 全量输出 / TC-098~137 逐目录） |

## ② 逐 TC 判定表（TC-098~TC-137）

> 判定面：静态门禁 117 项（static-gates.mjs 自建断言）+ DOM 核验 133 项（自建 harness：真实 ExternalStoreRuntime + 真实链路 golden/mock 回放）+ 交付套件对照（unit 229 / integration 41）。

| TC | 判值 | 依据要点（自建证据） |
|---|---|---|
| TC-098 | **PASS** | (a) 无 `ai`/`@assistant-ui/ai-sdk`（package+lock+node_modules 三面）；(b) lab/路线 A 词面全清（实现面零命中、测试面仅删除断言）、esbuild 入口恰 3 项；(c) ready 回放 superset 5 类事件各 ≥1（通道观测）；(d) unit 229 + integration 41 全绿（含压测 5 轮） |
| TC-099 | **PASS** | (a)-(f) 全成立：text 逐字 / reasoning 折叠 / 工具卡全要素（argsText·result·isError 透传）/ 空文本块不建 part / 无 L47·L131-134·L169 类 throw / aborted+errorMessage 消息级标记；消费端锚点 L47/L57/L62/L112/L134/L169/L31 与源码逐行一致 + L76–95 保真（`...basePart` 透传 result/isError、parsePartialJsonObject、tool-<generated>）——thread-message-like-anchors.txt |
| TC-100 | **PASS** | 注入 = 自建 replay 子进程（PiBridge 之下）→ RpcClient → PiBridge → ChatController → postMessage → store → 真实 runtime → DOM；通道序列含 user_message/stream_start/text_delta/message_final；DOM == fixture 逐行推导；harness 零 store dispatch/innerHTML/props 直写 |
| TC-101 | **PASS** | 无新增 script、无 on* 属性、探针逐字文本节点、哨兵未改写（`__XSS_PROBE` undefined）、raw HTML 不解析（无 img、`&lt;img` 转义形态）、无 javascript: href、`a[rel="noopener noreferrer"]` |
| TC-102 | **PASS** | 消息数 = 2（1 user + 1 assistant，澄清 #12）；assistant 逐字 == fixture message_end（三方内证）；user 三时点恒 1 且文本收敛权威；无双版并存 |
| TC-103 | **PASS** | 6 条（3 user + 3 assistant）逐条文本一致；投递序 主→steer→follow-up（发送序 F 先 S 后，两序不丢不错换）；queue_update 数据面透出 |
| TC-104 | **PASS** | 无人值守（固定命令退出码 0）；可重复（golden 关键观测在 DOM 套件多轮 + integration 5 连跑中逐次一致，TC-102/103 期望 2/6 恒定）；离线（全程无网络，数据源 = 仓库内 fixture + 自建场景 fixture） |
| TC-105 | **PASS** | 11 项锁定清单逐项精确（零前缀扫描全绿）；删除断言过；`@assistant-ui/vscode 0.0.1` 升级评估三要点（breaking 面/升级流程/退出流程）留痕于 §10.14 交付小节 |
| TC-106 | **PASS** | (a) CSP 八指令 == 官方模板（default-src 'none' / script-src 仅 nonce / 无 unsafe-* / connect-src=cspSource / frame-src 'none'，零新增）；(b) golden 回放在 strict CSP 声明面下全绿（jsdom 不执行 CSP，真机零 violation 层 = TC-108 MANUAL）；(c) 产物级：zod-jitless 模块先于全部 zod 导入者模块（sourcemap 模块序），`jitless:!0` 在产物 |
| TC-107 | **PASS** | (a) chat.js = **1,000,004 B** ≤ 4,194,304（23.8%）；(b) 宿主 104,249 − 基线 459,382 = **−355,133 B** ≤ 1 MiB（基线与 459,382 参考值 0 偏差）；(c) Shiki 依赖/产物/metafile 三面零命中；(d) 经典面板 metafile inputs（49 项）零 react/react-dom/@assistant-ui |
| TC-108 | **自动面 PASS + MANUAL** | 注册显式 `retainContextWhenHidden: true`（extension.ts + chatPanel.ts 两处均 true）；真机 checklist（真实 CSP 零 violation / 隐藏再显 DOM 保留）= **MANUAL**（四值），兜底 = TC-106 + 本 TC 注册断言（全 PASS） |
| TC-109 | **PASS** | 9 命令 + 5 配置逐项 JSON 与 v0.1.7 **逐字段一致**；views 首位 `sdysyhj.chatView`("Chat")；openChat 接线 chatView；activationEvents 双 onView |
| TC-110 | **PASS** | 「实验」零命中；「Lab」词界 `(?<![A-Za-z])Lab(?![A-Za-z])` 零命中（label 误命中口径自证）；chatLabView/openChatLab 移除；定名 "Chat"/"Chat (Classic)"/"Open Chat (Classic)" |
| TC-111 | **自动面 PASS + MANUAL** | 双注册 + `openChatClassic → chatViewClassic.focus`；行为冻结归组核对：chatPanel.ts 改动 = viewType/标题常量 + hostActions 机械提取（5 处删除体逐字命中 hostActions，StartupError 单源，其他组逐行核阅无新功能面）；切换冒烟 = **MANUAL**（四值），兜底 = TC-109/110/112 |
| TC-112 | **PASS** | 同一 golden 回放：新 UI（真实 runtime DOM）= 2 条；经典侧 = 同一 jsdom 基建加载 chatPanel HTML 模板 + 冻结 bundle `media/main.js`（vscode stub）经**同一通道消息流**驱动 = 2 条；文本逐条对位相等。D9 受控回退**未触发**（经典侧挂载成功） |
| TC-113 | **PASS** | 7 采样 token 链非空终点 --vscode-*（sideBar/button/input 系）；浅深联动生效；正文对比度 Dark **11.06:1** / Light **10.55:1** ≥ 4.5（独立 WCAG 复算） |
| TC-114 | **MANUAL** | 浅/深主题截图人工核对（四值 MANUAL，遗留不计 FAIL）；兜底 TC-113 PASS |
| TC-115 | **PASS** | d1..d8 拼接逐字（零丢失）；节奏化回放下 ≥2 次 DOM 增长（实测 9 次）；状态流转 idle→starting→streaming→idle；首增量 9ms < 2s |
| TC-116 | **PASS** | 全要素（h1/h2/ul/ol/table/任务/del/pre>code/https a/行内码/单换行 `<br>`）；36 语言 `language-<名>` 全命中 + 高亮 span 覆盖（仅 plaintext 空语法为其正常渲染，语言集判定按清单口径成立）；集外 haskell 无 token 纯转义（< > 文本节点）；raw HTML 文本形态 |
| TC-117 | **PASS** | 默认折叠（无 open）；展开后 t1t2t3t4 逐字；summary 交互元素存在 |
| TC-118 | **PASS** | 全要素（名称/参数摘要/状态）；#D-04 晚到结果收敛（read 卡 message_end 后回填成功）；失败 marker 可见（isError）；大输出截断保留尾部（line-22000 在、首行不留）；复制全部 → `copy_output` 调用记录（宿主缓存全量） |
| TC-119 | **PASS** | Stop 动作 → abort RPC；状态回 idle、输入恢复；「⏹ 已中止」消息级标记；运行中显示 Stop 隐藏发送 |
| TC-120 | **PASS** | 运行中输入非禁用 + placeholder 运行语义；模式切换控件存在、steer/followUp 分别走对应 RPC（golden-mix 实证）；插话同 user 路径单条 |
| TC-121 | **PASS** | provider 报错 → 错误卡片 + 可行动指引（hint）；extension_error 不入卡片、toast 一次性（含扩展路径+错误首行+Output 指引）；同键 60s 窗口去重（2→1 toast）异键不并、日志全量 2 条含全字段 |
| TC-122 | **PASS** | 四字段可见（`mock/mock-small · off · 状态` + #session-name）；idle→streaming→idle 流转（「已中止」非状态值） |
| TC-123 | **PASS**（判定载体注记） | 四款语义由产品 FollowState 独立驱动全过（40px 阈值两侧边界 40/41、轮内不覆盖打断、idle 门控、不持久化）+ shell 接线面（useLayoutEffect 渲染点/streamStartSeq 重置/isRunning 门控）；**jsdom 无布局**（scrollHeight=0），滚动几何像素采样以状态机语义承载，真机观感 = TC-125 MANUAL |
| TC-124 | **PASS** | ① 960px 内容列（CSS 钉值）② 8px 圆角 ③ 发送图标化 aria「发送」无文字 ④ 用户右气泡/助手无气泡/禁 avatar ⑤ HH:mm 时间戳、无角色前缀（jsdom 结构断言 + CSS 钉值） |
| TC-125 | **MANUAL** | 真机观感/跟随观感/Composer 交互（IME/@ 防抖/焦点）四值 MANUAL；兜底 = TC-124/123/120/129 全 PASS |
| TC-126 | **PASS** | (a) 三时点恒 1（含 paceMs 节奏下时点①显示发送原文）、N 发 → N 条；(b) steer/followUp 各恰一条；(c) 历史重放不重复（会话切换后 user 恰 1，与 JSONL 一致） |
| TC-127 | **PASS** | (a) #16 就地更新（1 条、无双版）；(b) #17 保守分支（steer+followUp 双待确认下垃圾回声不新增不错换、保留原文；权威重建收敛 JSONL）；(c) reject/handled 单条不变量、不污染后续关联（补充场景独立复测）；(d) 回归边界 3 轮 6 条不受影响 |
| TC-128 | **PASS** | `@` 触发 → insert_file_ref → QuickPick 记录；插入光标处替换触发符（终值 `"@src/picked.ts "` = 旧面板 `insertAtCursor('@'+path+' ',true)` 逐字同语义、@ 不叠加）；输入区无添加文件按钮 |
| TC-129 | **PASS** | ① get_commands 全集 4 项名+述 ② `/` 出现/实时过滤（/ZEB 大小写不敏感）/无匹配隐藏 ③ ↑↓ Enter Esc 不触发发送 ④ 选中插入 `/`+名、菜单关、焦点保持 ⑤ 空集不显示 |
| TC-130 | **PASS** | 底部常显、点击弹列表（2 模型）、选中即 set_model RPC 并同步展示；三入口同步（状态栏 model_info 链） |
| TC-131 | **PASS** | 权威取值（45600 覆盖 12345）+ 百分比（45.6k / 200k (23%)，45600/200000=22.8%→23% 四舍五入）；刷新时机（新消息/会话切换 15000）；"—" 占位口径由格式函数承载 |
| TC-132 | **PASS** | 新建会话 → new_session RPC（旧会话 pi 原生落盘——JSONL 文件面由零改动 sessionStore 套件佐证）；重命名 → set_session_name + session_name 同步 |
| TC-133 | **PASS**（载体注记） | 打开历史 → open_history → 宿主 QuickPick 动作面（showHistory 记录）+ 切换（history_loaded 全量替换）；消息数 = user+assistant 口径在 TC-102/103（2/6）与会话 B 重放计数（澄清 #12）实证；列表字段面由零改动 sessionStore 套件佐证 |
| TC-134 | **PASS** | 切换后历史重放与 JSONL 权威一致（含 usage 权威值）；可续写（AFTER-RUN 场景续话链路过）；用户重放单条（TC-126(c)） |
| TC-135 | **PASS** | 单活动会话（无并行标签）；外部修改检出 2,478ms ≤ 5s；陈旧拦截（prompt 不发 RPC、零 user_message）；刷新按钮 → refresh_session |
| TC-136 | **PASS** | 既有套件重指向全绿（unit 229 + integration 41，含 5 轮并行压测）；SC-023/026/028/030/031/035 对应场景由零改动套件 + 自建链路（模型/thinking/命令面）覆盖；P2 口径不变确认；回归重定向核对见 ⑥ |
| TC-137 | **PASS** | 出口门禁 1–6 组合判定全成立（见 ⑦） |

**汇总：32 PASS + 4 MANUAL（TC-108/111/114/125，自动面与兜底全过，遗留不计 FAIL）+ 0 FAIL + 4 组合/方法类 PASS（TC-104/136/137 及 TC-123 载体注记）**（TC-098~137 共 40 条全覆盖）。

## ③ 逐 FR 结论（FR-AUI-02/03/05/07/08 + FR-AUI-08 等价域）

| FR | 结论 | 证据 |
|---|---|---|
| FR-AUI-02①②③④ | **满足** | 路线 B 单实现（路线 A 词面清零、3 入口收敛、协议 superset 通道观测）；part 化映射消费端契约全顺从（TC-099 锚点逐行核对 + 真实 runtime DOM）；传输真实性（TC-100 子进程注入全链）；XSS 自动升格（TC-101） |
| FR-AUI-03①②③④ | **满足** | golden 端到端 2/6 逐行推导（TC-102/103）；确定性方法（TC-104）；双面板一致快照（TC-112，回退预案未触发） |
| FR-AUI-05①②③④ | **满足** | 版本锁定 + 升级评估留痕（TC-105）；CSP 指令集 + jitless 前置（TC-106）；预算 1,000,004/−355,133/零 Shiki/经典零 React（TC-107）；retainContextWhenHidden 注册（TC-108 自动面） |
| FR-AUI-07①②③④ | **满足** | 切默认 + 9 命令 5 配置零变更（TC-109 逐字段 diff）；命名清零 + 定名（TC-110）；双面板可切换（注册面）+ 行为冻结归组（TC-111 自动面）+ 一致快照（TC-112） |
| FR-AUI-08①②③④ | **满足** | §4.1–4.5 判定载体平移：等价域 TC-115~136 逐域全过（流式/Markdown+36 语言/thinking/工具卡/中止/steer·followUp/错误/状态/跟随四款/视觉五子条/单气泡五款含 #16/#17/@ 文件/命令菜单/模型/用量/SESS 系）；P2 二期口径不变 |

## ④ 门禁专项与度量复核（TC-105~108 / TC-107 字节级）

- **预算独立复算**（fs.stat + 独立 esbuild metafile）：chat.js **1,000,004 B**（预算 4,194,304，占 23.8%）；宿主 **104,249 − 459,382 = −355,133 B**（预算 +1,048,576）；v0.1.7 基线重建值与 FR 参考值 459,382 **0 偏差**（无需留痕）；Shiki 依赖/产物文本/metafile 三面零命中；经典 metafile 49 inputs 零 React/assistant-ui。与交付自述（§10.14 交付小节）一致。
- **CSP**：真实调用 `renderWebviewHtml` 解析 meta CSP，八指令 == 官方模板，script-src 仅 nonce，零 unsafe-*（csp-full.txt）。
- **jitless**：sourcemap 模块序证据（zod-jitless.ts@52 先于全部 zod 导入者；全 bundle 唯一 zod 导入者即 zod-jitless 自身）+ `jitless:!0` 在产物（jitless-order.txt）。
- **主题**：独立 token 链解析 + WCAG 复算 = Dark 11.06:1 / Light 10.55:1（theme-chains/contrast.txt），浅深联动生效。

## ⑤ 独立 harness 与失败定性（4 waitFor 超时 + 1 断言 FAIL 的两次经过留证）

5 个失败**全部定性为核验侧 harness/断言缺陷，无产品缺陷**（逐一以最小复现定位后修复重测；修复前后输出均存 `_suites/`：run-latest.txt（修复前）→ run-fix1/run-fix2 → run-final（全绿））：

| 失败 | 定性 | 最小复现与根因 | 修复后 |
|---|---|---|---|
| TC-099 copy_output 超时 | harness 缺陷 | ToolCard「复制全部」为 `onMouseDown` 处理点，自建 click() 仅派发 click 事件不触发 → 补全 mousedown/up/click 序列 | PASS（copy_output:tc-3 记录） |
| TC-122「展示更新」超时 | 断言缺陷 | 产品展示 `provider/id` 格式（refreshState：`mock/mock-large`），自建断言误用精确相等 `==="mock-large"` | PASS |
| TC-128(b) FAIL | 断言缺陷 | 产品 file_ref 插入 `@<path> `（引用语法），与旧面板 `insertAtCursor('@'+path+' ',true)` **逐字同语义**；自建断言误期望裸路径 | PASS（等价面实证） |
| TC-129 二次拉取超时 | harness 缺陷 | switchSession 链含 refreshState(get_state) 未入 fixture + 会话切换失效 effect 与输入事件竞态 | PASS |
| TC-132 外部修改超时 | harness 缺陷 | 本端收尾 markSynced 竞态吸收外部写入（newSession 尾部 track/markSynced 与测试写入竞速）→ 以完成 toast 为同步点 | PASS（2,478ms 检出） |
| （TC-099 aborted / TC-127(d) / TC-115(b)(d) 三个断言误计） | 断言缺陷 | run2 未 settled 即发 run3 被产品正确按 steer 排队（产品语义正确）；消息计数 5→应 6；流式采样未节奏化 | PASS（paced 9 次增长、首增量 9ms） |

补充：TC-127(c) reject/handled 路径以独立补充场景（suite-reject.test.tsx）复测通过。**产品缺陷 0 项。**

## ⑥ 压力抽查 + 回归重定向核对

- **压力抽查**：`verify:unit ∥ verify:integration` 并行 **5 轮**，10/10 次退出码 0（unit 229、integration 41 每轮全绿；stress-summary.txt + stress-*-N.txt）。
- **回归重定向表核对（删 2 / 平移 7 / 新增）**：删除 2（lab-route、lab-slice-a）确认不存在；平移 7（lab-store→ui-store、lab-store-mapping→ui-mapping、lab-csp→ui-csp、lab-theme→ui-theme、lab-budget→ui-budget、lab-versions→ui-versions、lab-isolation→ui-isolation）新用例全在；新增 ui-composer + jsdom 三件套（ui-golden-dom/ui-dual-panel/ui-xss）全在；lab-slice-b 升格 ui-golden-dom。**断言零放宽抽查**（4 组前后断言行对照，redirect-semantic-sample.txt）：旧断言要点在新用例中均有承载且扩容（预算 3→4 MiB 属口径切换非放宽、删除项断言为新增收紧、消费端 store 断言升格真实 runtime DOM 属加强）；保留零改动组（unit 12 + integration 6 文件）与宿主零改动（`src/bridge/**`、`src/panel/messages.ts` vs v0.1.7 零 diff）互证。

## ⑦ §8-7 出口门禁组合结论（TC-137）

1. **§4.6 P0（切换批次）逐条通过**：TC-098~101（FR-AUI-02）、TC-102/104/112（FR-AUI-03）、TC-105~108 自动面（FR-AUI-05）、TC-109/110（FR-AUI-07①②④）、TC-113（FR-AUI-04①②）全 PASS；P1 项 TC-103 尽力通过（不计门禁）✅
2. **功能等价逐条通过**：TC-115~136 全 PASS（含 FR-CHAT-11 五款 TC-126/127 逐款、FR-CHAT-10 五子条 TC-124 逐条）✅
3. **双面板可切换 + 一致快照**：TC-111 自动面 + TC-112 PASS（冒烟 MANUAL 不计 FAIL）✅
4. **契约零变更 + 命名清零**：TC-109/110 PASS ✅
5. **MANUAL 四值处理**：TC-108/111/114/125 记 MANUAL，兜底（TC-106+注册断言 / TC-109+110+112 / TC-113 / TC-124+123+120+129）全 PASS ✅
6. **既有 verify 回归全绿 + MVP 门禁新 UI 载体复验**：TC-098(d)/TC-136 套件面（unit 229 + integration 41，5 轮压测）全绿；§8-1~6 对应判定经等价域 + 零改动套件在新 UI 载体复验 ✅

**§8-7 出口门禁组合结论：PASS（0.1.8 发版门禁项全成立）。**

## ⑧ 遗留清单（均不计 FAIL）

1. **MANUAL 4 项**（TC-108 真机 CSP/隐藏重显、TC-111 双面板切换冒烟、TC-114 浅深截图、TC-125 观感/IME/焦点）——无图形真机环境，按核验四值记 MANUAL，自动兜底全过，建议随发版前真机会话一次性执行（设计 D8 汇总口径）。
2. TC-123 滚动几何像素采样在 jsdom 不可执行（scrollHeight=0），以 FollowState 状态机独立驱动 + 接线面断言承载；真机跟随观感归 TC-125。
3. TC-133 历史列表字段面（标题/时间/消息数）由零改动 sessionStore 套件佐证；自建侧覆盖打开/切换/计数口径（澄清 #12）。
4. 观察项（非缺陷）：hljs `plaintext` 注册为空语法，36 语言集中该语言高亮 span 为空属其正常渲染，语言集覆盖判定按 §11 #23 清单口径成立。

## ⑨ 总结论 + 自检声明

**总结论：TASK-009 切换批次交付（19588eb）独立核验 PASS**——TC-098~137 共 40 条：**32 PASS + 4 MANUAL（兜底全过）+ 4 方法/组合类 PASS，0 FAIL**；FR-AUI-02/03/05/07/08 逐条满足；§8-7 出口门禁组合判定 PASS。核验过程中 5+3 个核验侧失败全部定性为自建 harness/断言缺陷并留两次经过证据，**产品缺陷 0 项**。

自检声明：① 本次核验未修改被测仓库任何文件（clone `git status --porcelain` 全程空；产物仅写 docs/verification/ 核验目录）；② clone 内无 git 写操作（只读 diff/show/tag 查询 + 仓库外 git archive）；③ 重点结论（消费端契约/等价域/门禁组）均以自建 harness/断言器重测，交付测试仅作对照佐证；④ 全部脚本自终止有界超时（timeout 包裹）；⑤ 无真实凭证、无外网（仅 npm ci）。

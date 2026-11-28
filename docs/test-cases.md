# Sdysyhj 测试用例基线（docs/test-cases.md）

> 产出：测试 Agent（写用例阶段，TASK-001；v0.3 追加：TASK-005；v0.4 追加：TASK-006；v0.5 追加：TASK-008；v0.5.1 补遗：审批点 2 第一轮退回，澄清 #17；v0.6 追加：TASK-009 阶段①；v0.7 追加：TASK-009 切换批次）｜ 状态：**待审批点 2 裁决** ｜ 版本：v0.7（2026-11-22 修订）
>
> **还原注记（2026-11-28，对齐 requirements.md §4 头部 v0.8 还原注记与 §4.6 废止注记）**：TC-098~TC-137 为 0.1.8~0.1.9 时代（判定载体 = assistant-ui 新 UI）历史判定——0.1.10 起判定载体回归自研经典面板（人类还原指令，TASK-011 批次 A 项），该段用例文本保留为历史基线留痕，现行判定以实现与守护测试（npm run verify:unit / verify:integration）为准。
>
> **依据（三源，规范第一部分 §5 第 7 条，v0.5 起生效）**：① 需求基线 docs/requirements.md（TC-001~TC-046 依据 v0.2，TC-047~TC-052 依据 v0.3，TC-053~TC-061 依据 v0.4，TC-062~TC-076 依据 v0.5（其中 TC-076 判据另依 v0.5.1 澄清 #17），TC-077~TC-097 依据 v0.6（§4.6 FR-AUI-01~06 + §5 阶段①不做项 + §8 第 7 条出口门禁 + 澄清 #12/#18）**，TC-098~TC-137 依据 v0.7（§4 判定载体注记 + §4.6 FR-AUI-02/03/04/05/07/08 修订版与新增 + §5 切换批次不做项 + §8 第 7 条切换批次出口门禁 + §12 #5/#12/#16/#17/#18/#19 + §3 术语表）**）；② 设计基线**冻结快照**：TC-062~TC-076 引用 docs/technical-design.md @ commit `7f4e586`（TASK-008 审批点 1b 通过时冻结；其 §1、§3.4、§3.5、§4.1、§6、§10.12、§11），TC-077~TC-097 引用 @ commit `42f5e86`（TASK-009 审批点 1b 通过时冻结；其 §6 实验面板行、§10.13 D1–D9、§11 外部契约依赖清单 #11–#18），TC-098~TC-137 引用 @ commit `fab4190`（TASK-009 切换批次审批点 1b 通过时冻结；其 §10.14 D1–D10、§6 新 UI 消费端契约行、§11 外部契约依赖清单 #19–#23）；③ 各快照 §11「外部契约依赖清单」登记的外部权威文档（TC-062~TC-076：**pi 1.5.2 随附 docs/**，绝对路径示例 `/home/connor/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/`，引用 json.md / rpc.md / rpc-commands.md / extensions.md；TC-077~TC-097 另引 **@assistant-ui 生态外部权威**：`@assistant-ui/vscode@0.0.1` npm README（`npm view @assistant-ui/vscode@0.0.1 readme`）与 npm tarball 源码（registry tarball `src/`，含 protocol.ts/host/router.ts/host/html.ts/webview/fetch.ts/theme.css）、官方指南 assistant-ui.com/docs/guides/vscode、`@assistant-ui/react` 官方文档（external-store 等）、React 官方文档、官方测试床 github.com/assistant-ui/assistant-ui examples/with-vscode、microsoft/vscode `extensions/theme-defaults/themes/*.json`——版本以设计 §11 #11–#18 锚定为准）+ **golden fixture**（`test/fixtures/golden/`，TASK-008 落地的真实 pi 事件序列转录，设计 §10.13 D8 登记的外部期望源）；TC-098~TC-137 另引**切换批次外部锚点**（设计 §11 #19–#23 锚定版本，2026-11-22 随包源码/清单核读）：`@assistant-ui/core@0.3.37` 随包源码 `node_modules/@assistant-ui/core/dist/runtime/utils/thread-message-like.js`（**#D-06 消费端锚点**，throw/丢弃/保真语义行号锚定）、`@assistant-ui/react-markdown@0.14.26` 导出面（MarkdownTextPrimitive / SyntaxHighlighterProps / code-fence）、`react-markdown@10.1.0` + `remark-gfm@4.0.1` + `remark-breaks@4.0.0`（raw HTML 不解析 / GFM 表格 / 单换行 `<br>`）、`highlight.js@11.12.0` `lib/common.js` registerLanguage 清单（36 语言）、`@assistant-ui/core` Composer/ExternalStore 接口面（`ComposerRuntime.setText` / ExternalStoreAdapter）、pi 1.5.2 随附 docs（json.md / rpc.md / rpc-commands.md / extensions.md，#1–#10 既有）。**涉及外部系统行为的期望（事件序列/返回结构/时序契约）只锚定上述权威源的章节/示例/源码路径（或 golden trace），不以我方 mock 行为为期望来源**（规范第一部分 §5 第 6 条）。
> **参考**：DevelopmentGuidelines/development-guidelines.md 第一部分 §5（用例编写规范）、第二部分（原 agent-workflow）§6（产物契约）、§4（自测命令约定 `npm run verify:unit` / `npm run verify:integration`）。注：该规范文档仅存本地（不入库）。
> **盲写声明**：本用例为全新上下文盲写产物；**盲写的对象是实现，不是契约**（规范第一部分 §2.2）——未读取 src/、webview/、test/（**唯一例外：`test/fixtures/golden/` 下 fixture 文件本身**——设计基线登记的外部期望源，属依据侧而非实现侧）、media/、项目 package.json、docs/verification/、docs/technical-design.md 工作树副本（研发现期可能仍在修改，TASK-008 依据读取 `7f4e586`、TASK-009 阶段①依据读取 `42f5e86`、TASK-009 切换批次依据读取 `fab4190` 冻结快照导出件）；node_modules 仅读取外部契约锚点指定的随包源码/清单/导出面与依赖版本号（`thread-message-like.js`、highlight.js `lib/common.js`、`@assistant-ui/react-markdown` 导出面、pi 随附 docs）——属「盲实现、不盲契约」的契约面（规范第一部分 §2.2），非实现侧；v0.5 新增用例（TC-062~TC-076，TC-076 为 v0.5.1 补遗）与 v0.6 新增用例（TC-077~TC-097）均按三源推导，不迁就实现（v0.6 的 @assistant-ui 生态外部契约读数为 2026-11-21 registry/npm tarball/官方站点快照，以设计 §11 #11–#18 锚定版本为准）；v0.7 新增用例（TC-098~TC-137）同按三源推导（外部契约读数为 2026-11-22 随包源码/清单核读，以设计 §11 #19–#23 锚定版本为准），实现并行中互不可见）。
> **写权限声明**：本阶段仅写 docs/test-cases.md 一个文件；无任何 git 写操作（只读 git 命令与 `git show` 冻结快照导出除外）。

---

## 0. 执行约定

### 0.1 标准命令（agent-workflow §4 约定）

- 自测/核验套件：`npm run verify:unit`（单元）、`npm run verify:integration`（集成）。
- 用例中的动态行为一律以"逻辑场景（SC-xxx）+ 行为断言"表达（**实现无关**）；静态/结构检查一律以可直接执行的 shell/node 脚本表达。SC-xxx 仅为逻辑场景名，"逻辑场景 ↔ 实际套件输出"的映射由核验剧本（verification-plan.md）在核验时建立；断言以 `npm run verify:unit` / `npm run verify:integration` 输出与行为证据为准。

### 0.2 公共前置 ENV-SETUP（所有 TC 默认继承，不再重复全文）

在干净工作区检出交付标签后执行：

```bash
git status --porcelain                 # 必须为空（干净工作区）
git describe --tags                    # 记录被测版本（证据头）
npm ci                                 # 仅安装依赖；除此之外核验全程离线可执行
export HOME="$(mktemp -d)"             # 隔离 ~/.pi/agent（settings/auth/models/会话），不触宿主真实配置
export WORKSPACE="$(pwd)"
export MOCKLOG="$(mktemp -d)"          # mock 调用记录 + 证据输出目录
export SENTINEL="PI_TEST_SENTINEL_$(head -c8 /dev/urandom | od -An -tx1 | tr -d ' \n')"   # 哨兵假凭证：执行时随机生成（仅测试用，非真实 key；禁止使用文档内固定字面值）
```

**环境约束（硬性）**：

1. 测试**不得依赖真实 API key**：凭证相关场景只用哨兵假凭证（执行时随机生成）或空 HOME（未配置凭证）。
2. 测试**不得依赖外网**：模型/provider 侧一律本地 mock（进程内 stub 或 127.0.0.1），执行期不发起任何外部请求；仅 `npm ci` 允许访问依赖 registry（或离线缓存）。
3. 会话/配置只落临时 HOME；测试结束不得污染仓库与宿主环境。

### 0.3 MOCK 场景目录（确定性 stub 行为规范）

mock stub 共同约定：将收到的每条请求（RPC 方法名 + 参数摘要）记录为**可检查的调用记录**，供断言使用——记录载体实现形式不限（如 `$MOCKLOG/calls.jsonl` 仅为示例实现之一，不构成格式契约）；断言以 verify:unit/verify:integration 输出与行为证据为准，mock 调用记录仅作辅助证据。

> 下文各 TC 中出现的 `$MOCKLOG/calls.jsonl` 均指上述"mock 调用记录"（实现形式不限）；SC-xxx 均为逻辑场景名，与实际套件输出的映射由核验剧本（verification-plan.md）在核验时建立。

| 场景 | 确定性行为 | 主要用途 |
|---|---|---|
| MOCK-STREAM | 任意 prompt → 依次返回 text delta d1..d8（间隔 ≥30ms）→ 正常结束 | FR-CHAT-01 |
| MOCK-THINK | 先返回 thinking delta t1..t4，再返回 text delta d1..d3，结束 | FR-CHAT-03 |
| MOCK-TOOLS | 依次产生工具调用 read(a.ts,成功,输出20行)、edit(a.ts,成功)、bash("seq 1 20000",成功,stdout≈100KB)，随后返回 text delta d1..d2 结束 | FR-CHAT-04 |
| MOCK-TOOLS-LATE | 同 MOCK-TOOLS 的 3 个工具调用，但每个工具的执行结果事件在携带其工具卡的助手消息事件之后 ≥50ms 才到达（确定性时序注入） | FR-CHAT-04（#D-04 回归，v0.3 增补） |
| MOCK-TOOLS-FAIL | 同 MOCK-TOOLS-LATE 时序，其中 bash 执行结果为失败（非零退出码，stderr 含固定 marker `E2E-TOOLFAIL-MARKER`），read/edit 成功 | FR-CHAT-04（#D-04 回归·失败分支，v0.3 增补） |
| MOCK-SLOW | 收到 prompt 后每 200ms 发 1 个 text delta，共 600 个，不主动结束（直至 abort） | FR-CHAT-05/06, NFR-01 |
| MOCK-ERROR | 收到 prompt → 返回 provider 错误事件（rate limited / 429 类） | FR-CHAT-07 |
| MOCK-CRASH | 收到 prompt → 子进程自行 `exit(1)`（崩溃） | FR-CHAT-07, NFR-02 |
| MOCK-BIG | 一次输出 12,000 tokens（≈600 delta）后结束 | NFR-01 |
| MOCK-MODELS | `get_available_models` → ["mock-small","mock-large"]；`set_model`/`set_thinking_level`/`cycle_thinking_level`/`set_session_name`/`abort` 均记录调用 | FR-MOD/SESS-04, FR-CHAT-05 |
| MOCK-STDERR | 子进程写 stderr 行含 marker `E2E-STDERR-MARKER`，随后返回 1 行非法 JSONL（协议异常） | FR-CMD-02 |
| MOCK-CMD | `get_commands` → 固定命令全集 4 项：{name:"review", desc:"审查当前文件"}、{name:"ExPlain", desc:"Explain code in detail"}、{name:"skill-zebra", desc:"zebra skill 斑马线"}、{name:"run-tests", desc:"运行测试"}（名称/描述含可区分子串与大小写差异，供过滤规则断言）；可配置为返回空集或调用失败；收到的 prompt 原文入调用记录 | FR-CMD-03（v0.4 增补） |
| MOCK-USAGE | `get_state` 返回 `contextWindow=200000`；`message_update` 按序携带确定性 Usage（totalTokens 固定）：会话 A 第 1 条助手消息=12345、第 2 条=45600，会话 B 最近一条助手消息=15000；另可触发一次 compaction 事件（会话压缩通知） | FR-MOD-04（v0.4 增补） |
| MOCK-ECHO-REWRITE | prompt 受理后回发的 user 回声文本 ≠ 发送原文（确定性改写映射，模拟 skill/prompt-template「发送/入队前展开」语义：原文 X → 回声文本 Y=固定展开文本）；其余事件序列同 MOCK-STREAM v0.5 口径（含 user 回声，见下述 v0.5 增补） | FR-CHAT-11④（澄清 #16，v0.5 增补） |
| MOCK-QUEUE-MIX | 长运行剧本（≥2 个助手轮 + ≥1 次工具调用）支持运行中 steer/follow_up 注入：入队即发 `queue_update`（快照含全部 steering/followUp 文本）；steer 于当前助手轮工具调用完成后、下一次 LLM 调用前注入并回发 user 回声；follow_up 于 agent 停止（无更多工具调用与 steer）后注入并回发 user 回声——混合使用时回声到达序可与发送序相反（follow-up 先发后投、steer 后发先投）；abort 分支：abort 后 `queue_update` 快照仍含该消息，后续 prompt 启动新运行时投递并回发迟到 user 回声；不可关联回声分支（v0.5.1 增补，澄清 #17 场景）：某条注入回声文本与全部待确认条目的发送原文/入队文本均不精确匹配（多通道不可判定），会话 JSONL 记录确定性权威文本供重建收敛断言 | FR-CHAT-11②④（v0.5 增补；不可关联分支 v0.5.1 增补） |
| MOCK-REJECT | prompt → response `success:false`（受理前拒绝），其后不产生任何会话事件（无 run、无 user 回声、无 settled） | FR-CHAT-11④（拒绝路径，v0.5 增补） |
| MOCK-HANDLED | prompt（扩展命令文本）→ response `success:true` + `disposition:"handled"`（扩展命令/input handler 消费）：不启动 run、不回发 user 回声、不产生 settled | FR-CHAT-11④（handled 路径，v0.5 增补） |
| LAB-XSS | fake-pi 剧本：user 回声与 assistant 回复均含探针文本 `<script>alert(1)</script>` 与 `<img src=x onerror=…>`（事件形状对照 json.md「Event sequence」L30–46 转印，文件头锚点标注——设计 §10.13 D5）；其余事件序列同 GOLDEN-BASIC 形态（prompt → user 回声 → assistant 流式 → settled） | FR-AUI-02⑤（v0.6 增补，TASK-009 阶段①） |

> **v0.5 mock 对齐增补（TASK-008，规范 §4.3）**：凡模拟 pi 会话事件流的 mock 场景（一切运行链路剧本，含既有 MOCK-STREAM/THINK/TOOLS(-LATE/-FAIL)/SLOW/BIG 等），自 v0.5 起必须在 `agent_start` 后、assistant `message_start` 前按 pi 权威文档补发该次发送的 user `message_start`/`message_end` 回声（json.md「Event sequence」L36–40：user 回声先于 assistant；extensions.md L752–770：`message_start`/`message_end` 对 user/assistant/toolResult/custom 每类消息均触发），并保持 L40–45 的 assistant → turn_end → agent_end → agent_settled 次序；运行中 steer/follow_up 注入同样各回发一次 user 回声（rpc-commands.md L46–92）。**user 回声行为的外部期望源 = pi 权威文档行号，我方 mock 仅按锚点转印**（规范 §4.3：mock 与外部契约对齐——mock 遗漏 user 回声即 TASK-008 缺陷根因，需求基线 §11 v0.5 修订记录留痕）。
>
> **golden 回放场景（v0.5 增补，设计基线 §6 + §10.12 D8）**：**GOLDEN-BASIC**（基本 prompt 剧本：prompt → user 回声 → assistant 流式 → agent_settled）与 **GOLDEN-MIX**（运行中 steer + follow_up 混合注入，含 `queue_update` 与乱序投递序列）——两者为**真实 pi 1.5.2 录制的事件序列静态转录**（golden trace 文件随实现交付入库，含录制命令/pi 版本/脱敏与归一化声明；核验时由验证剧本按 FR 追溯表定位）。回放场景的期望源 = 录制的真实事件序列本身（golden trace），非我方 mock 行为——用于防「自建 mock 自证」（规范 §4.3）。
>
> **golden fixture 落位更新（v0.6，TASK-009 阶段①）**：TASK-008 已交付 golden fixture 落位 `test/fixtures/golden/`（`golden-prompt-basic.jsonl`（GOLDEN-BASIC）/ `golden-steer-followup.jsonl`（GOLDEN-MIX）/ `README.md`（录制命令、双录一致、归一化与乱序实证声明））；TASK-009 阶段①用例（TC-077~TC-097）的回放期望值直接由 fixture 文件逐行推导（设计 §10.13 D8 登记的外部期望源），fixture 文件本身属盲写许可读取面（见文件头盲写声明）。
>
> **切换批次用例数据源（v0.7，TASK-009 切换批次）**：等价域用例（TC-115~TC-136）沿用既有 MOCK-* 场景（确定性行为不变，判定载体平移至新 UI 消费端 DOM，见「FR-AUI 切换批次共用约定」）；LAB-XSS 剧本随设计 §10.14 D10 改名 **UI-XSS**（语义不变：user 回声与 assistant 回复均含 `<script>`/`<img onerror>` 探针文本，事件形状对照 json.md「Event sequence」L30–46 转印）；回放期望值由 golden fixture 逐行推导（TC-102：2 = 1 user + 1 assistant；TC-103：6 = 3 user + 3 assistant）。

### 0.4 判定等级

| 等级 | 含义 | 要求 |
|---|---|---|
| **自动** | 命令/脚本退出码 + 显式行为断言，Agent 无人执行即得 PASS/FAIL | 必须给出可执行命令与断言 |
| **UI 手工 checklist** | 仅限无法从外部自动观察的视觉/手势项 | 必须标注证据类型（截图/录屏 + 命令调用日志），且同一 FR 必有**自动兜底 TC** |
| **延后（二期）** | P2 范围 | 显式列出，不计入 MVP 门禁 |

### 0.5 套件与临时断言脚本约定

1. 优先执行 `npm run verify:unit` 与 `npm run verify:integration`，两者退出码必须为 0，输出全文存证。
2. SC-xxx 为逻辑场景名（实现无关）；"逻辑场景 ↔ 实际套件输出"的映射由核验剧本（verification-plan.md）在核验时建立，对应逻辑场景必须 PASS。
3. 套件未覆盖的断言：核验 Agent 依据交付的 **FR 追溯表**（研发交付物）定位被测入口，在**仓库外临时目录**编写一次性断言脚本执行（不得修改仓库任何文件）；脚本全文 + 输出即证据。
4. 证据统一存 `docs/verification/evidence/<TC-id>/`（核验阶段产物）。

---

## 1. 测试用例

> 格式：`TC-id ｜ FR-id（优先级）｜ 一句话 ｜ 判定等级`

### FR-CHAT-01 流式对话（P0）

#### TC-001 ｜ FR-CHAT-01（P0）｜ 流式 delta 级增量渲染与状态流转 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. `npm run verify:integration`（场景 SC-001：向聊天通道发送 prompt "stream-check"）。
  2. 从场景输出与 `$MOCKLOG/calls.jsonl` 提取渲染事件序列，核对下述断言。
- **期望结果**：(a) 渲染事件含 ≥8 个 text-delta 级增量，顺序与 d1..d8 一致；(b) 最后一个增量后出现完成事件；(c) 运行状态流 idle→streaming→idle；(d) 首增量距发送 < 2s。
- **判定方式**：PASS = `verify:integration` 退出码 0 且 (a)-(d) 全部成立；FAIL = 任一不成立或套件红（附失败断言输出）。

#### TC-002 ｜ FR-CHAT-01（P0）｜ 流式渲染视觉连续性（不跳变、可交互） ｜ UI 手工 checklist（兜底 TC-001）
- **前置条件**：同 TC-001。
- **操作步骤**（手工 checklist 项）：
  1. VS Code 窗口打开 Sdysyhj 面板，发送 prompt 触发 MOCK-STREAM。
  2. 逐项核对：① 流式光标 ▍ 随增量推进；② 无整段文本跳变；③ 流式期间聊天区可滚动。
  3. 录屏（≥5s）存 `evidence/TC-002/`（证据类型：录屏 + 时间戳）。
- **期望结果**：三项全符合。
- **判定方式**：PASS = checklist 3/3 且证据齐全；FAIL = 任一不符或证据缺失。（"不阻塞 UI"的量化代理由 TC-036 兜底。）

### FR-CHAT-02 Markdown 渲染（P0）

#### TC-003 ｜ FR-CHAT-02（P0）｜ Markdown 全要素结构渲染 ｜ 自动
- **前置条件**：ENV-SETUP；fixture markdown（含 H1/H2、有序+无序列表、表格、```js 代码块、https 链接、行内代码）。
- **操作步骤**：
  1. `npm run verify:unit`（场景 SC-003：对上述 fixture 执行渲染断言）。
  2. 若套件缺此断言，按 §0.5 以临时脚本对渲染入口（FR 追溯表定位）执行同一 fixture 断言。
- **期望结果**：渲染产物结构断言：存在 h1/h2、ul/ol/li、table/thead/tbody/tr/td、`pre>code.language-js` 且含语法高亮 token 标记、`a[href^="https://"]`、行内 `code`。
- **判定方式**：PASS = 套件绿且 7 类结构断言全部命中；FAIL = 任一结构缺失（附渲染产物样本）。

#### TC-004 ｜ FR-CHAT-02（P0）｜ Markdown 渲染视觉 ｜ UI 手工 checklist（兜底 TC-003）
- **操作步骤**（手工 checklist 项）：发送含全部要素的消息，截图核对标题层级、表格边框、代码块高亮配色、链接样式；截图存 `evidence/TC-004/`（证据类型：截图）。
- **判定方式**：PASS = 视觉要素齐全且截图存证；FAIL = 缺失/错乱。

### FR-CHAT-03 thinking 折叠（P0）

#### TC-005 ｜ FR-CHAT-03（P0）｜ thinking 默认折叠 + 展开后流式 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-THINK。
- **操作步骤**：`npm run verify:integration`（场景 SC-005：发送 prompt，随后触发"展开 thinking"命令）。
- **期望结果**：(a) thinking 块初始状态 = 折叠（默认不可见正文）；(b) 展开后 t1..t4 按序流式渲染；(c) thinking 之后 d1..d3 正常渲染。
- **判定方式**：PASS = (a)-(c) 断言全成立；FAIL = 任一不成立。

#### TC-006 ｜ FR-CHAT-03（P0）｜ 折叠交互视觉 ｜ UI 手工 checklist（兜底 TC-005）
- **操作步骤**（手工 checklist 项）：核对 ▸ 💭 默认折叠样式、展开/收起切换、展开后流式光标；截图存 `evidence/TC-006/`（证据类型：截图）。
- **判定方式**：PASS = 3/3 且证据存证；FAIL = 任一不符。

### FR-CHAT-04 工具调用卡片（P0）

#### TC-007 ｜ FR-CHAT-04（P0）｜ 工具卡要素/状态流转/大输出截断保留尾部/复制全部 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-TOOLS。
- **操作步骤**：`npm run verify:integration`（场景 SC-007），并核对断言：
- **期望结果**：(a) 3 张工具卡，均含工具名 + 关键参数摘要（bash 卡含命令文本 `seq 1 20000`）；(b) 每卡状态流转 进行中→成功；(c) bash 大输出（≈100KB）展示为截断文本且**保留尾部**（展示文本以原输出末段结尾）；(d) "复制全部"数据源 = 完整输出（复制内容长度 ≈ 原输出长度且含尾部）；(e) 卡片可展开查看输入/输出（展开数据断言：含完整入参与出参字段）。
- **判定方式**：PASS = (a)-(e) 全成立（截断阈值本身不断言，见歧义清单 #2）；FAIL = 任一不成立。
- **兜底说明**：本 TC 为 FR-CHAT-04 自动兜底。

#### TC-008 ｜ FR-CHAT-04（P0）｜ 卡片展开/复制交互视觉 ｜ UI 手工 checklist（兜底 TC-007）
- **操作步骤**（手工 checklist 项）：核对单行摘要默认态、点击展开输入/输出、"复制全部"点击后剪贴板内容=完整输出（剪贴板落盘文件长度对比可辅助自动核对）；截图存 `evidence/TC-008/`（证据类型：截图 + 剪贴板落盘文件）。
- **判定方式**：PASS = 3/3 且证据存证；FAIL = 任一不符。

#### TC-052 ｜ FR-CHAT-04（P0）｜ #D-04 回归：工具卡状态随迟到的执行结果更新（进行中→成功/失败）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-TOOLS-LATE；MOCK-TOOLS-FAIL；缺陷单 TASK-005 §1 #D-04（现象：工具卡状态恒“进行中”；时序背景：工具执行结果晚于携带工具卡的助手消息到达，直播路径必现）。
- **操作步骤**：`npm run verify:integration`（场景 SC-052a：MOCK-TOOLS-LATE——3 个工具的执行结果事件均在携带其工具卡的助手消息事件之后 ≥50ms 到达，全程不重载面板；场景 SC-052b：MOCK-TOOLS-FAIL——同时序，bash 工具执行失败）。逐卡断言初始态、随结果事件的更新与最终收敛。
- **期望结果**：(a) 助手消息到达时，每张工具卡初始展示“进行中”；(b) 对应工具的执行结果事件到达后，卡片状态更新为“成功”（SC-052a）或“失败”（SC-052b）；(c) 本轮结束时无任何卡片停留在“进行中”；(d) (a)-(c) 均在直播渲染路径下成立（不依赖会话重载/历史刷新；重载后的展示仅作交叉观察，不作本 TC 达标途径）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一卡片最终仍“进行中”（复现 #D-04）或未随结果事件更新。
- **说明**：契约表述实现无关——仅约束“执行结果事件晚于携带工具卡的消息到达”时序下的状态收敛，不引用内部渲染路径/组件命名；≥50ms 为 mock 时序注入值，非产品契约。与 TC-007(b) 互补：TC-007 断言常规状态流转存在性，本 TC 钉死 #D-04 时序的直播路径回归。FR-CHAT-04 需求与验收标准不变（基线 v0.3 修订记录），本 TC 为 #D-04 的回归判定锚点。

### FR-CHAT-05 中止运行（P0）

#### TC-009 ｜ FR-CHAT-05（P0）｜ Abort 命令注册 + RPC abort + 状态恢复 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-SLOW。
- **操作步骤**：
  1. 命令注册断言：
     ```bash
     node -e 'const p=require("./package.json");const s=JSON.stringify(p.contributes&&p.contributes.commands||[]).toLowerCase();if(!/abort|中止/.test(s)){console.error("MISSING abort command");process.exit(1)}console.log("OK: abort command registered")'
     ```
  2. `npm run verify:integration`（场景 SC-009：MOCK-SLOW 启动后 1s 触发 abort）。
- **期望结果**：(a) 上述脚本 exit 0；(b) `$MOCKLOG/calls.jsonl` 含 RPC `abort` 调用；(c) 状态流 streaming→aborted→idle；(d) 输入框恢复可输入（可输入标志=true）；(e) 历史保留该轮并带"已中止"标记。
- **判定方式**：PASS = 脚本 exit 0 且 (b)-(e) 全成立；FAIL = 任一不成立。

#### TC-010 ｜ FR-CHAT-05（P0）｜ Stop 按钮与命令面板中止交互 ｜ UI 手工 checklist（兜底 TC-009）
- **操作步骤**（手工 checklist 项）：核对运行中显示 [■ Stop]、点击后恢复可输入、命令面板 Abort 同效；截图 + 命令调用日志存 `evidence/TC-010/`（证据类型：截图 + 命令调用日志）。
- **判定方式**：PASS = 3/3 且证据存证；FAIL = 任一不符。

### FR-CHAT-06 steer 插话（P1）

#### TC-011 ｜ FR-CHAT-06（P1）｜ steer/follow-up 注入与模式切换 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-SLOW；MOCK-MODELS。
- **操作步骤**：
  1. `npm run verify:integration`（场景 SC-011a：运行中发送第二条消息；SC-011b：切 follow-up 模式后发送第三条消息）。
  2. `npm run verify:unit`（steer/follow-up 模式状态机单测）。
- **期望结果**：(a) SC-011a 第二条消息以 **steer** 注入（calls.jsonl 中为 steer 类请求，而非新会话）；(b) SC-011b 第三条消息排队、本轮结束后发送；(c) 模式可切换且发送行为随模式变化（状态机断言）。
- **判定方式**：PASS = 两套件绿且 (a)-(c) 全成立；FAIL = 任一不成立。

#### TC-012 ｜ FR-CHAT-06（P1）｜ 运行中输入框交互 ｜ UI 手工 checklist（兜底 TC-011）
- **操作步骤**（手工 checklist 项）：核对运行中发送框转 steer 输入、steer/follow-up 切换控件存在且可切换；截图存 `evidence/TC-012/`（证据类型：截图）。
- **判定方式**：PASS = 2/2 且证据存证；FAIL = 任一不符。

### FR-CHAT-07 错误展示（P0）

#### TC-013 ｜ FR-CHAT-07（P0）｜ 三类异常的可读错误 + 修复指引 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-ERROR；MOCK-CRASH。
- **操作步骤**：`npm run verify:integration`（场景 SC-013a：MOCK-ERROR provider 报错；SC-013b：MOCK-CRASH 子进程崩溃；SC-013c：空 HOME（无 `~/.pi/agent/auth*`）直接发消息）。
- **期望结果**：每类异常在聊天区产生错误卡片，且满足：(a) 含可读错误描述（非空、含错误类别/原因）；(b) 含修复指引区（≥1 条可行动建议：命令、设置入口或文档链接）；(c) UI 不卡死、恢复后可继续输入；(d) SC-013c 的指引指向凭证配置（含 "auth"/"凭证"/"登录" 类关键词之一）。
- **判定方式**：PASS = 3 个场景均满足 (a)-(c)，且 (d) 成立；FAIL = 任一场景缺错误卡片/缺指引/UI 卡死。

### FR-CHAT-08 状态指示（P0）

#### TC-014 ｜ FR-CHAT-08（P0）｜ 状态四字段模型与状态流转 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；MOCK-SLOW。
- **操作步骤**：`npm run verify:unit`（状态模型单测）+ `npm run verify:integration`（场景 SC-014：触发一次正常流式与一次中止）。
- **期望结果**：状态模型始终含 4 字段：当前模型、thinking 等级、运行状态（idle/streaming/aborted）、会话名；状态变更事件序列与 TC-001(c)/TC-009(c) 一致；会话名随重命名更新（与 TC-019 一致）。
- **判定方式**：PASS = 套件绿且 4 字段断言 + 状态流断言全成立；FAIL = 任一不成立。

#### TC-015 ｜ FR-CHAT-08（P0）｜ 顶部状态栏视觉 ｜ UI 手工 checklist（兜底 TC-014）
- **操作步骤**（手工 checklist 项）：核对状态栏 4 字段可见（`● <模型> · <等级> ｜ <状态> ｜ <会话名>` 形态）及可点击入口（切换行为归 TC-027/028 判定）；截图存 `evidence/TC-015/`（证据类型：截图）。
- **判定方式**：PASS = 4 字段可见且证据存证；FAIL = 缺字段/错显示。

### FR-CHAT-09 流式输出自动跟随（P1）

（v0.3 新增章节，TASK-005；对应基线 v0.3 FR-CHAT-09。验收标准 ①②③④ 由 TC-047/TC-048/TC-049/TC-050 一对一覆盖；UI 手势与视觉项 TC-051，由上述自动 TC 兜底。）

#### TC-047 ｜ FR-CHAT-09（P1）｜ ① 默认跟随：每轮流式开始重置跟随态，跟随期间增量渲染后保持“在底部” ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-SLOW。观察契约（FR-CHAT-09 各 TC 共用，实现无关）：“在底部” = 消息区视口底缘距滚动底端 ≤40px（需求口径）；观察量 =「跟随态标志 + 滚动位置采样序列」（载体形式不限，SC ↔ 实际套件输出的映射由核验剧本建立）；用户滚动一律以场景内确定性指令模拟（设定目标滚动位置），非人工手势（手势/视觉项归 TC-051）。
- **操作步骤**：
  1. `npm run verify:unit`（跟随状态机单测：运行状态转入 streaming 时，跟随态无条件置为“跟随”，与其上一轮结束时的取值无关）。
  2. `npm run verify:integration`（场景 SC-047a：发送 prompt 触发 MOCK-SLOW，全程不做任何用户滚动，在每个增量渲染点采样滚动位置；SC-047b：第 1 轮流式中途模拟向上滚动打断（同 SC-048 路径）并以 abort 结束本轮 → 发起第 2 轮 prompt → 在第 2 轮首个及后续增量渲染点采样）。
- **期望结果**：(a) SC-047a 中每个增量渲染点采样均满足“在底部”（≤40px），全程无需任何用户滚动动作；(b) SC-047b 中第 2 轮流式开始即处于跟随态（首个增量渲染点即“在底部”），即使第 1 轮以打断态收尾——每轮流式开始即重置为跟随；(c) 两轮中消息内容均照常流式渲染（跟随行为不改变渲染本身）。
- **判定方式**：PASS = 两套件绿且 (a)-(c) 全成立；FAIL = 任一不成立（如第 2 轮沿用上一轮打断态 / 跟随期间增量渲染后视口脱离底部 >40px）。

#### TC-048 ｜ FR-CHAT-09（P1）｜ ② 打断：向上滚离底部 >40px 即停止跟随，增量渲染不推动滚动位置 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-SLOW；同 TC-047 观察契约。
- **操作步骤**：
  1. `npm run verify:unit`（“在底部”判定单测：距滚动底端 ≤40px 判定在底部、>40px 判定离开底部——40px 阈值边界语义）。
  2. `npm run verify:integration`（场景 SC-048：MOCK-SLOW 流式中，第 k 个增量渲染后模拟用户向上滚动至确定位置 P（距滚动底端 ≥100px，明显越过阈值）；随后继续接收 ≥10 个增量，逐增量记录滚动位置与跟随态）。
- **期望结果**：(a) 滚动离开底部（>40px）后，跟随态翻转为“不跟随”（至迟于下一个增量渲染前生效）；(b) 后续每个增量渲染后滚动位置恒等于 P（scrollTop 语义保持用户所选位置，增量渲染不为跟随而强制滚动）；(c) 增量内容仍持续渲染（内容高度持续增长），仅滚动位置不动——“停止跟随”≠“停止渲染”。
- **判定方式**：PASS = 单测绿且 (a)-(c) 全成立；FAIL = 任一不成立（如后续增量把视口强行拉回底部 / 跟随态未翻转 / 内容停止渲染）。

#### TC-049 ｜ FR-CHAT-09（P1）｜ ③ 恢复：滚回底部 ≤40px 即恢复跟随，后续增量继续“在底部” ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-SLOW；同 TC-047 观察契约。
- **操作步骤**：`npm run verify:integration`（场景 SC-049：同一轮流式中先执行打断（同 SC-048 路径，滚至位置 P）；流式继续期间模拟用户滚回底部——采样点含距滚动底端 0px 与 40px（界值，恰在界内）各一次 → 每次滚回后继续接收 ≥10 个增量，逐增量采样滚动位置）。
- **期望结果**：(a) 每次滚回底部（≤40px）后，跟随态恢复为“跟随”；(b) 恢复后每个增量渲染点采样均满足“在底部”（≤40px，与 ① 同判据）；(c) 恢复即时生效，无需确认操作或任何辅助 UI 入口（§5 排除项不做）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立（如滚回底部后增量仍不跟随 / 跟随态未恢复 / 需重载面板才恢复）。

#### TC-050 ｜ FR-CHAT-09（P1）｜ ④ 边界：跟随态不持久化（会话无痕）+ idle 不自动滚动 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-STREAM；同 TC-047 观察契约（交互窗口不足时，核验剧本可以等价长流式 mock 替换，断言不变）。
- **操作步骤**：`npm run verify:integration`：
  1. SC-050a（不写入会话文件、不产生消息级标记）：同构对照两份会话——交互组：1 轮 MOCK-STREAM，场景内执行“默认跟随 → 中途向上滚动打断 → 滔回底部恢复”完整交互序列；对照组：相同 prompt、相同 mock 场景、无任何滚动交互。对两会话 JSONL 断言：(i) 行数相等；(ii) 逐行消息序列（消息类型 + 内容摘要）一致；(iii) 逐行解析为 JSON 后，交互组顶层键集合 − 对照组顶层键集合 = ∅（滚动交互不引入任何会话级/消息级新记录或新字段）。
  2. SC-050b（不跨插件重启持久化）：第 1 轮以打断态收尾（MOCK-STREAM 中途滚离底部 >40px，本轮自然结束）→ 模拟插件/面板重载（webview + host 重建，同 TC-029/TC-037 方式）→ 发起第 2 轮 prompt → 断言同 SC-047b：第 2 轮流式开始即处于跟随态（重载后跟随态回归默认，未沿用任何持久化旧值）。
  3. SC-050c（idle 不自动滚动）：会话载入/切换完成（一次性初始定位落定，≥1s 后起算）且运行状态 = idle，在无任何用户操作的观察窗（≥2s）内周期采样滚动位置。
- **期望结果**：(a) SC-050a 的 (i)-(iii) 全成立；(b) SC-050b 第 2 轮默认跟随成立；(c) SC-050c 观察窗内滚动位置恒定（无自动滚动）。
- **判定方式**：PASS = 套件绿且 (a)-(c) 全成立；FAIL = 任一不成立（会话文件出现跟随状态痕迹 / 重载后沿用打断态 / idle 期发生自动滚动）。

#### TC-051 ｜ FR-CHAT-09（P1）｜ 跟随手势与视觉连续性 ｜ UI 手工 checklist（兜底 TC-047/TC-048/TC-049/TC-050）
- **前置条件**：同 TC-047（MOCK-SLOW）。
- **操作步骤**（手工 checklist 项）：
  1. 发送 prompt 触发 MOCK-SLOW，逐项核对：① 未滚动时视口随流式输出保持在底部、新内容持续进入视口；② 向上滚动离开底部后，流式继续但视口不再被拉回/跳动；③ 滔回底部后恢复跟随。
  2. 录屏（覆盖上述三段、含滚动操作过程，≥15s）存 `evidence/TC-051/`（证据类型：录屏 + 滚动位置采样数据（如有））。
  3. 范围备注：需求 §5 排除项（“回到底部/跳到最新”悬浮按钮、跟随状态指示、跟随行为设置项）MVP 不做，不设 checklist 项；若核验观察到此类 UI，属范围外产出，记录为观察项、不计入本 TC 判定。
- **期望结果**：3/3 符合。
- **判定方式**：PASS = 3/3 且证据齐全；FAIL = 任一不符或证据缺失。（本 FR 自动兜底 = TC-047/TC-048/TC-049/TC-050。）

### FR-CHAT-10 聊天面板视觉规范（P1）

（v0.4 新增章节，TASK-006；对应基线 v0.4 FR-CHAT-10。验收标准 ①②③ 由 TC-053、④⑤ 由 TC-054 以 CSS/DOM/正则口径自动断言；视觉连续性项 TC-055 为 UI 手工 checklist，由 TC-053/TC-054 自动兜底。观察载体约定（实现无关）：DOM/样式断言一律对"渲染入口"执行——渲染入口与被测样式资源由研发交付的 FR 追溯表（FR-CHAT-10 条目）定位，以 jsdom（或等价环境）挂载后读取计算样式/查询 DOM，不以实现命名耦合断言；`npm run verify:unit`/`verify:integration` 场景 SC-xxx 优先，套件未覆盖时按 §0.5 以临时脚本执行同一断言。下述断言中的口径值（960px、8px、"发送"、`^\d{2}:\d{2}$`）均取自需求验收标准原文，非实现侧易变文本。）

#### TC-053 ｜ FR-CHAT-10（P1）｜ ① 内容列居中 960px ／ ② 输入框圆角 8px ／ ③ 发送按钮图标化（可访问名称"发送"） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；FR 追溯表（FR-CHAT-10 条目：定位渲染入口、消息区/输入区内容容器、输入框容器、发送按钮）。
- **操作步骤**：
  1. `npm run verify:unit`（场景 SC-053：渲染入口挂载并注入被测样式资源，读取 (a)-(c) 各元素的计算样式与 DOM）。
  2. 若套件缺此断言，按 §0.5 以临时脚本对渲染入口执行同一断言。
- **期望结果**：
  - (a) 内容列居中（验收标准①，CSS 口径）：消息区与输入区（含底部模型选择器与上下文用量行）的内容容器计算样式均满足 `max-width = 960px` 且 `margin-left = margin-right = auto`，且四处容器 max-width 取值一致（共享同一内容列约束）；"面板可用宽度超过上限时左右留白相等"由 margin auto 对称口径蕴含，实际渲染留白观感归 TC-055。
  - (b) 输入框圆角（验收标准②，CSS 口径）：输入框容器计算样式 `border-radius = 8px`。
  - (c) 发送图标化（验收标准③，DOM 口径）：发送动作按钮存在；可访问名称（`aria-label` 或 `title` 之一）= "发送"；按钮内无文字标签（可见文本 `textContent.trim()` 为空，图标为图形元素而非文字内容）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立（附计算样式/DOM 快照为证据）。

#### TC-054 ｜ FR-CHAT-10（P1）｜ ④ 用户消息右侧气泡／助手消息左侧无气泡 ／ ⑤ 时间戳 HH:mm 且无角色前缀 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-THINK + MOCK-TOOLS（产出含 thinking 折叠块与工具卡片的助手消息，同步覆盖⑤的豁免项）；FR 追溯表（定位渲染入口与消息行容器）。
- **操作步骤**：`npm run verify:integration`（场景 SC-054：发送 1 条用户消息并收完整回复后，对渲染入口的消息行 DOM 与计算样式断言）；套件未覆盖时按 §0.5 临时脚本执行同一断言。
- **期望结果**：
  - (a) 用户消息（验收标准④）：存在气泡包裹元素——包裹容器计算样式 background-color ≠ transparent 且 border-radius ≠ 0；并满足右对齐语义之一（包裹容器 `margin-left: auto`，或行容器 `justify-content: flex-end`，或等效右对齐声明）。
  - (b) 助手消息（验收标准④）：消息行内无气泡容器——消息行至内容元素的计算样式 background-color 为 transparent/none（或与面板背景一致）且 border 为 0/none；消息内容左对齐（`justify-content: flex-start`、`text-align: left` 或等效左对齐声明）。
  - (c) 时间戳（验收标准⑤）：每条用户消息与助手消息的消息行均含时间文本，匹配正则 `^\d{2}:\d{2}$`；取值（换算为当日分钟数）落在场景执行时刻本地时间的 ±2 分钟窗内（24 小时制、本地时区口径；渲染时钟非确定性以容忍窗吸收）。
  - (d) 无角色前缀（验收标准⑤）：各消息行可见文本不以 "user"/"assistant" 开头（不区分大小写），且不存在独立角色标记元素；豁免项——thinking 折叠块与工具卡片的功能标签（如工具名）存在于 fixture 中且不判为角色前缀，其存在不得导致 (d) 误判。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一不成立（如助手消息被气泡包裹、时间戳缺失/格式不符、出现 User/Assistant 角色前缀；附消息行 DOM 快照为证据）。

#### TC-055 ｜ FR-CHAT-10（P1）｜ 面板视觉连续性（居中留白/圆角/图标样式/气泡配色） ｜ UI 手工 checklist（兜底 TC-053/TC-054）
- **前置条件**：同 TC-054（消息流含用户消息与助手回复）。
- **操作步骤**（手工 checklist 项）：在面板可用宽度 >960px 与 <960px 两档下逐项核对：① 内容列水平居中、左右留白相等，消息区与输入区（含底部模型选择器与用量行）对齐为同一列；② 输入框呈圆角矩形（8px 观感）；③ 发送按钮为向上箭头/纸飞机类图形、无文字；④ 用户消息右侧气泡与助手消息左侧平铺的视觉层级清晰，时间戳对齐且无角色标记混淆。截图两档各 ≥1 张存 `evidence/TC-055/`（证据类型：截图×2 档 + 面板宽度记录）。
- **期望结果**：4/4 符合。
- **判定方式**：PASS = 4/4 且证据齐全；FAIL = 任一不符或证据缺失。（本 FR 自动兜底 = TC-053/TC-054。）

### FR-CHAT-11 用户消息单次展示（P0）

（v0.5 新增章节，TASK-008，TC-076 为 v0.5.1 补遗（审批点 2 第一轮退回）；对应基线 v0.5/v0.5.1 FR-CHAT-11（P0）+ 澄清 #5/#12/#16（TC-076 另依 v0.5.1 澄清 #17）。验收标准①（含前言「计数单位 = 一次发送，同文本不跨发送合并」口径）由 TC-062/TC-063 判定、TC-064 golden 回放兜底；②由 TC-065（steer）/TC-066（follow_up+混合乱序）/TC-067（abort 后队列保留）判定、TC-068 golden 兜底；③由 TC-069（面板重开）/TC-070（会话切换）判定；④由 TC-066/TC-070/TC-071（#16 就地更新）/TC-072（success:false）/TC-073（handled）/TC-076（#17 不可关联保守分支）判定；⑤回归边界 TC-074；观感类 TC-075 为 UI 手工 checklist，由 TC-062~TC-074、TC-076 自动兜底。需求 §8 第 6 条显式门槛由 TC-062/TC-065/TC-066/TC-069/TC-070 直接判定。）

**观察契约（本节各 TC 共用，实现无关）**：

- 观察载体 =「聊天区消息列表快照序列」（每次列表变更记录一份快照：条目角色 + 文本 + 条目标识）与「pi 会话事件流记录」（按到达序：事件 type + 角色 + 文本摘要）的**合并时间线**；快照在事件/指令处理边界采样，无时钟依赖（确定性）；载体实现形式不限，SC-xxx ↔ 实际套件输出的映射由核验剧本（verification-plan.md）建立。
- **判定时点**：T0 = 发送指令受理后、该轮首个 pi 会话事件处理前（合并时间线锚点，非墙钟）；T1 = 该条消息对应 user 角色 `message_end` 回声处理完成后；T2 = 该轮助手终稿渲染完成且 `agent_settled` 处理完成后。无回声路径（拒绝/handled）的判定时点 = 命令响应处理完成后及其后任意稳态点。
- **可见条目数口径**：聊天区消息列表中 role=user 且文本 = 该次发送原文或其 pi 权威文本的条目数；同文本多次发送按发送序逐条对应（计数单位 = 一次发送，需求前言口径）。
- 本节一切外部事件序列期望均锚定 pi 权威文档行号（json.md「Event sequence」L30–46 等，见各 TC 依据锚点），我方 mock 仅按锚点转印（§0.3 v0.5 增补），golden 回放兜底防自证。

**口径披露（用例侧，非歧义，均已写入对应 TC）**：① TC-067 中保留消息与新 prompt 两条 user 回声的**相对到达次序不作断言**——rpc-commands.md L128 仅明示「abort 继续保留队列中消息」，投递次序未明示；② TC-066 不依赖 `queue_update` 与 user 回声的相对先后（设计 §10.12 遗留 1：文档未明示），仅用快照集合语义与各自命中判据；③ 设计 §10.12 D2.2「多通道不可判定时保留原文待权威重建（不错换）」保守分支与澄清 #16 的张力**已由总调度裁决为澄清 #17**（需求基线 v0.5.1 §12：#16 的受控例外，验收判据 = 恒单条、不错换、不新增 + 权威重建后收敛），判定用例见 TC-076。

#### TC-062 ｜ FR-CHAT-11①（P0）｜ 基本单条：发送即时 / pi user 回声后 / 助手终稿后三判定时点恰一条 ｜ 自动
- **前置条件**：ENV-SETUP；含 user 回声的流式 mock（§0.3 v0.5 口径，如 MOCK-STREAM 升级形态）。
- **操作步骤**：`npm run verify:integration`（场景 SC-062：发送 prompt P1="single-echo-check"，走完整运行至 `agent_settled`）；按观察契约在 T0/T1/T2 三个判定时点采样用户消息可见条目数与文本。
- **期望结果**：(a) T0 时 P1 条目已存在且可见条目数 = 1、文本 = 发送原文（发送后即时展示，不等待 pi 确认回声）；(b) T1（user `message_end` 回声处理完成）时可见条目数仍 = 1；(c) T2（助手终稿渲染完成且 settled 处理完成）时可见条目数仍 = 1；(d) T2 时 assistant 消息恰 1 条（推导：1 次发送 = 1 条 user + 1 条 assistant），user+assistant 合计 = 2（澄清 #12 口径）。
- **判定方式**：PASS = `verify:integration` 退出码 0 且 (a)-(d) 全成立；FAIL = 任一时点条目数 ≠ 1（复现「两条气泡」缺陷形态）或 T0 无即时展示。
- **依据锚点（三源）**：FR-CHAT-11①；设计基线 §4.1（发送后即时展示 + 事件流时序）+ §10.12 D1/D5；外部契约 json.md「Event sequence」L30–46（L38–39 user 回声先于 L40 assistant）、「Message events」L66–68（`message_end` 为权威终稿）；设计基线 §11 #1。

#### TC-063 ｜ FR-CHAT-11①（P0）｜ 同文本多次独立发送不跨发送合并（计数单位 = 一次发送） ｜ 自动
- **前置条件**：ENV-SETUP；含 user 回声的流式 mock（§0.3 v0.5 口径）。
- **操作步骤**：`npm run verify:integration`（场景 SC-063：同一文本 "dup-check" 独立发送 N=3 次，每次等待上一轮 `agent_settled` 后再发送——独立发送语义；每轮均经含 user 回声的完整链路）；逐轮在 T1/T2 采样。
- **期望结果**：(a) 每轮 T1/T2 该轮新增 user 条目数恰 +1（每条回声消费一条，不合并）；(b) 全部结束后该文本 user 条目总数 = 3（推导：N=3 次发送 → 3 条 user；不得因文本相同合并为 1 条）；(c) assistant 消息总数 = 3；(d) user+assistant 合计 = 6（澄清 #12 口径；推导 3+3）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 出现合并（总数 < 3）或任一轮重复（增量 > 1）。
- **依据锚点（三源）**：FR-CHAT-11①（前言「同一文本多次独立发送仍逐条展示，不得因文本相同而跨发送合并」）；设计基线 §10.12 D2（精确匹配按序消费，每条回声恰消费一条）；外部契约 json.md L30–46（每轮各回发一次 user 回声）、L66–68；设计基线 §11 #1。

#### TC-064 ｜ FR-CHAT-11①（P0）｜ golden 回放兜底：真实 pi 事件序列下的基本单条（防 mock 自证） ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC（真实 pi 1.5.2 录制 trace 回放，§0.3 v0.5 增补；期望源 = 录制事件序列本身）。
- **操作步骤**：`npm run verify:integration`（场景 SC-064：以 GOLDEN-BASIC 回放驱动全链路，执行 TC-062 同款 T0/T1/T2 断言）；另断言回放输入序列本身含 user `message_start`/`message_end`（json.md L38–39）且先于 assistant `message_start`（L40）。
- **期望结果**：TC-062 (a)-(d) 全部在回放链路成立（含 (d) 数值推导：1 次发送 = 1 条 user + 1 条 assistant，合计 2）；回放序列次序与 json.md L36–45 一致（agent_start → turn_start → user 回声 → assistant → … → agent_settled）。
- **判定方式**：PASS = 同 TC-062 判据以回放链路成立；FAIL = 回放链路出现双条或次序与录制不符。
- **依据锚点（三源）**：FR-CHAT-11①；设计基线 §6（golden fixture 回放层）+ §10.12 D8（golden 剧本一）；外部契约 json.md L30–46（golden trace 对应的权威序列定义）；设计基线 §11 #1。
- **说明**：本 TC 为 TC-062 的权威序列兜底（规范 §4.3：关键协议交互以 golden fixture 回放兜底，防「自建 mock 自证」）。

#### TC-065 ｜ FR-CHAT-11②（P0）｜ 运行中 steer 插话：轮间注入回声后恰一条 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-QUEUE-MIX（steer 单注分支：运行中仅注入 S1，不发 follow_up；剧本含多助手轮与工具调用，含 user 回声）。
- **操作步骤**：`npm run verify:integration`（场景 SC-065：发送 P1 启动运行 → 当前助手轮工具调用执行中以 steer 模式发送 S1="steer-check" → pi 按契约于当前助手轮工具调用完成后、下一次 LLM 调用前注入（rpc-commands.md L26/L48），注入点回发 S1 的 user 回声 → 运行至 `agent_settled`）；对 S1 在 T0/T1/T2 采样。
- **期望结果**：(a) T0（steer 发送受理后、注入回声前）S1 条目 = 1 且文本 = 发送原文；(b) T1（S1 user `message_end` 注入回声处理后）仍 = 1；(c) T2（settled 后）仍 = 1；(d) 会话 user 条目总数 = 2（推导：P1 + S1 = 2 次发送，插话计数单位口径同①）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一时点 S1 条目 ≠ 1 或总数 ≠ 2。
- **依据锚点（三源）**：FR-CHAT-11②（+FR-CHAT-06 交叉）；设计基线 §1（steer/follow-up 注入时序要点）+ §4.1 + §10.12 D2；外部契约 rpc-commands.md L46–68（steer 排队与轮间注入时机）；json.md L30–46（user 回声先于该轮 assistant）；设计基线 §11 #4。

#### TC-066 ｜ FR-CHAT-11②④（P0）｜ follow_up 停后注入 + steer/follow_up 混合乱序回声不错换 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-QUEUE-MIX。
- **操作步骤**：`npm run verify:integration`（场景 SC-066：发送 P1 启动长运行 → 运行中**先**以 follow_up 模式发送 F1="fu-check"（response `disposition:"queued"`，rpc-commands.md L87；`queue_update` 快照含 F1 文本，json.md L121–122）→ **再**以 steer 模式发送 S1="steer-check"（`disposition:"queued"`；快照含 S1）→ pi 按 S1 轮间注入（当前助手轮工具调用完成后、下一次 LLM 调用前，L26/L48）→ S1 user 回声**先到** → agent 停止（无更多工具调用与 steer）后 F1 注入（L72）→ F1 user 回声**后到**（回声到达序与发送序相反）→ 运行至 settled）；全程采样。
- **期望结果**：(a) F1 发送即时（受理后、任一回声前）条目 = 1、文本 = 原文；(b) S1 发送即时条目 = 1、文本 = 原文；(c) S1 回声（先到）处理后：S1 条目仍 1 且文本 = S1 权威文本；F1 条目仍 1 且文本 = F1 原文（未被 S1 回声错换/合并）；(d) F1 回声（后到）处理后：F1 条目仍 1 且文本 = F1 权威文本；(e) settled 后 user 条目总数 = 3（推导：P1+F1+S1 三次发送），S1/F1 条目文本两两互异且各与其权威文本一致（不错换判据）；(f) 若剧本对入队文本有展开改写（skill/template 入队前展开，rpc-commands.md L33/L48/L72），条目文本按澄清 #16 以权威文本单条更新，条数不变。
- **判定方式**：PASS = (a)-(f) 全成立；FAIL = 任一插话条目 ≠ 1、两插话文本互串（错换）或合并。
- **依据锚点（三源）**：FR-CHAT-11②④；设计基线 §1（「混合使用时回声到达顺序可与发送顺序不同」）+ §10.12 D2（队列文本入队绑定与按序消费、乱序不错换论证）；外部契约 rpc-commands.md L46–92（steer 轮间注入 / follow_up 停后注入——时序不同）、L33（入队前展开）；json.md「Queue and state events」L118–124（L121–122 `queue_update` 完整队列快照）；设计基线 §11 #4/#5/#8。

#### TC-067 ｜ FR-CHAT-11②④（P0）｜ abort 后队列保留：后续投递的迟到回声正确关联、不污染新发送 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-QUEUE-MIX（abort 分支）。
- **操作步骤**：`npm run verify:integration`（场景 SC-067：发送 P1 启动长运行 → 运行中以 follow_up 发送 F1（queued）→ 触发 abort（FR-CHAT-05 链路）→ `agent_settled`（aborted=true）且 `queue_update` 快照仍含 F1 → 发送 P2 启动新运行 → F1 于新运行中投递并回发迟到 user 回声、P2 亦回发各自回声 → 至 settled）；全程采样。
- **期望结果**：(a) abort 后 F1 条目仍 1、文本不变；(b) P2 发送即时条目 = 1、文本 = 原文；(c) F1 迟到回声处理后 F1 条目仍 1 且文本 = F1 权威文本（不误绑到 P2 条目）；(d) P2 回声处理后 P2 条目仍 1 且文本 = P2 权威文本（不被 F1 回声污染）；(e) settled 后 user 条目总数 = 3（P1/F1/P2；推导 3 次发送）。F1 与 P2 两条回声的**相对到达次序不作断言**（rpc-commands.md L128 未明示投递次序，见章节口径披露），仅断言关联正确性。
- **判定方式**：PASS = (a)-(e) 全成立；FAIL = F1/P2 任一条目重复或文本互串。
- **依据锚点（三源）**：FR-CHAT-11②④；设计基线 §10.12 D2（残留清理：仍在队列的条目保留）+ D3（残留不得污染下一条关联）；外部契约 rpc-commands.md L107–128（clear_queue/队列语义；L128「abort 继续保留队列中消息」，实测行号——设计基线 §11 #6 括注 L126 为区间内轻微偏移）；json.md L121–122（queue_update）、L45（agent_settled aborted）；设计基线 §11 #6。

#### TC-068 ｜ FR-CHAT-11②④（P0）｜ golden 回放兜底：steer + follow_up 混合注入时序与回声关联 ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-MIX（真实 pi 录制：运行中 steer + follow_up 混合注入，含 `queue_update` 与乱序投递序列）。
- **操作步骤**：`npm run verify:integration`（场景 SC-068：以 GOLDEN-MIX 回放驱动，执行 TC-065/TC-066 同款断言——每插话三判定时点条数、乱序不错换、总数推导）。
- **期望结果**：回放序列含 `queue_update` 事件与先 steer 后 follow_up 的注入次序（期望源 = 录制 trace）；TC-066 (a)-(e) 判据在回放链路全部成立。
- **判定方式**：PASS = 同 TC-065/TC-066 判据以回放链路成立；FAIL = 回放链路双条/错换/次序与录制不符。
- **依据锚点（三源）**：FR-CHAT-11②④；设计基线 §6 + §10.12 D8（golden 剧本二）；外部契约 rpc-commands.md L46–92；json.md L121–122；设计基线 §11 #4/#5/#8。

#### TC-069 ｜ FR-CHAT-11③（P0）｜ 面板重开历史重放：每条 user 恰一条且与会话 JSONL 一致 ｜ 自动
- **前置条件**：ENV-SETUP；含 user 回声的流式 mock（§0.3 v0.5 口径，如 MOCK-STREAM）。
- **操作步骤**：`npm run verify:integration`（场景 SC-069：独立发送 K=3 次（文本含序号 marker "replay-check-1/2/3"，各至 settled）→ 模拟面板关闭重开（webview 重建，同 TC-037 重载方式）→ 对重放后的消息列表断言；另从 `$HOME/.pi` 下该会话 JSONL 文件提取 (role, text) 消息序列比对）。
- **期望结果**：(a) 重放后 user 条目总数 = 3，每个 marker 文本恰出现 1 次（无重复气泡）；(b) 每条文本与该次发送的权威文本一致；(c) assistant 条目 = 3，user+assistant 合计 = 6（澄清 #12；推导 3+3）；(d) 重放消息序列（角色+文本，按序）与会话 JSONL 提取的消息序列一致（澄清 #5）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 重放出现重复 user 条目或与 JSONL 不一致。JSONL 消息序列提取方式由核验剧本按 pi 会话存储格式确定（不与实现命名耦合；既有 TC-016/018 同款落盘比对先例）。
- **依据锚点（三源）**：FR-CHAT-11③；澄清 #5/#12；设计基线 §10.12 D5（回放源单条：回声合并非新增）+ §4.1；外部契约 json.md L66–68（`message_end` 权威终稿为落盘/重放同源依据）；设计基线 §11 #1。

#### TC-070 ｜ FR-CHAT-11③④（P0）｜ 会话切换后权威重建：单条、文本以 JSONL 为准（含 #16 改写会话） ｜ 自动
- **前置条件**：ENV-SETUP；含 user 回声的流式 mock + MOCK-ECHO-REWRITE（至少 1 次发送的回声文本 ≠ 原文）。
- **操作步骤**：`npm run verify:integration`（场景 SC-070：会话 A 独立发送 3 次（第 2 次用改写剧本：原文 X → 权威文本 Y）→ settled → 切换到会话 B 再切回 A（经 FR-SESS-03 历史切换链路触发权威重建，同 TC-018 场景方式）→ 对重放列表断言 + JSONL 比对（提取方式同 TC-069））。
- **期望结果**：(a) 重放后 user 条目 = 3、每条 1 条（推导：3 次发送 → 3 条 user）；(b) 第 2 条文本 = Y（澄清 #16 末句：历史重放中的用户消息文本同以会话 JSONL 为准，不保留发送原文 X——与实时就地更新同源）；(c) 重放消息序列与会话 JSONL 一致（澄清 #5）；(d) 无任何文本丢失/截断/拼接/错换（④）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 重放重复、改写条目回退为原文 X 或与 JSONL 不一致。
- **依据锚点（三源）**：FR-CHAT-11③④（+FR-SESS-03 交叉）；澄清 #5/#16；设计基线 §3.5（会话切换后以 pi 为唯一权威全量重建）+ §10.12 D5；外部契约 json.md L66–68；设计基线 §11 #1。

#### TC-071 ｜ FR-CHAT-11④（P0）｜ pi 权威文本 ≠ 发送原文：单条就地更新（澄清 #16） ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-ECHO-REWRITE（发送原文 X="/review src/a.ts" → 回声权威文本 Y=固定展开文本，模拟 skill/prompt-template 发送前展开语义，rpc-commands.md L33）。
- **操作步骤**：`npm run verify:integration`（场景 SC-071：发送 X → 完整链路至 settled；在 T0/T1/T2 采样条目数与文本，并审查快照序列的变迁次数）。
- **期望结果**：(a) T0：条目 = 1、文本 = X（回声到达前展示发送原文）；(b) T1（user 回声处理后）：条目 = 1、文本 = Y（就地更新为 pi 权威文本）；(c) T2：条目 = 1、文本 = Y；(d) 快照序列中该条目自 X 至 Y 恰一次变迁、发生于同一逻辑条目（条目标识不变），全程任一快照中不同时存在含 X 与含 Y 的两个条目（不得新增条目或双版本并存）；(e) 更新前后条数均 = 1（推导：1 次发送 → 恒 1 条，更新为就地不新增）。
- **判定方式**：PASS = (a)-(e) 全成立；FAIL = 出现第二条、两版并存或文本丢失。
- **依据锚点（三源）**：FR-CHAT-11④；澄清 #16（权威文本单条就地更新）；设计基线 §4.1（回声匹配后就地更新）+ §10.12 D2/D6；外部契约 rpc-commands.md L33（input expansion before sending/queueing）、L37–40（response/disposition 形态）；json.md L38–39（回声携带文本）+ L66–68（`message_end` 权威）；设计基线 §11 #3。
- **说明**：视觉观感（不闪现两版文本）归 TC-075；本 TC 为其自动兜底（快照序列断言变迁恰一次）。

#### TC-072 ｜ FR-CHAT-11①④（P0）｜ success:false 受理前拒绝：单条保留、不污染后续关联 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-REJECT；含 user 回声的流式 mock（后续 P2 链路用）。
- **操作步骤**：`npm run verify:integration`（场景 SC-072：发送 R1="reject-check" → mock 返回 prompt response `success:false`（受理前拒绝，其后无任何会话事件，rpc-commands.md L42）→ 观察消息列表 → 随后发送 P2 走正常含回声链路至 settled → 断言）。
- **期望结果**：(a) R1 响应处理后可见条目 = 1、文本 = 原文（单条保留；推导：1 次发送 → 1 条，拒绝路径不产生回声故不新增）；(b) 直至 P2 链路 settled，R1 条目恒 = 1（无回声路径不得因任何事件追加第二条）；(c) 拒绝错误按 FR-CHAT-07 通道展示（观察项，判据归 TC-013，不计入本 TC PASS 条件）；(d) P2 三判定时点（T0/T1/T2）条目均 = 1 且文本按澄清 #16 正确（T0=原文、T1/T2=P2 权威文本）——R1 残留未被 P2 回声错绑（不错换判据：P2 条目文本不含 R1 文本；R1 条目不因 P2 回声变化）。
- **判定方式**：PASS = (a)(b)(d) 全成立（(c) 仅观察记录）；FAIL = R1 重复或 P2 关联被污染。
- **依据锚点（三源）**：FR-CHAT-11①④；设计基线 §4.1（success:false = 受理前拒绝，无后续事件）+ §10.12 D3（响应事件点出账，残留不污染后续匹配）；外部契约 rpc-commands.md L42（success:false 语义）+ L37–40（response/disposition 形态）；rpc.md「Run lifecycle」L60–71；设计基线 §11 #2/#3。

#### TC-073 ｜ FR-CHAT-11①④（P0）｜ disposition=handled：无 run 无回声，单条且不污染后续关联 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-HANDLED；含 user 回声的流式 mock（后续 P2 链路用）。
- **操作步骤**：`npm run verify:integration`（场景 SC-073：发送 H1（扩展命令文本 "/extcmd-echo-check"）→ mock 返回 response `success:true` + `disposition:"handled"`（扩展命令/input handler 消费：无 run、无 user 回声、不等 settled，rpc-commands.md L31/L40；rpc.md L67）→ 观察消息列表 → 随后发送普通 P2 走正常含回声链路至 settled → 断言）。
- **期望结果**：(a) H1 响应处理后可见条目 = 1、文本 = 原文（推导：1 次发送 → 1 条，handled 路径无回声故不新增）；(b) 直至 P2 settled，H1 条目恒 = 1（handled 无回声，不得出现第二条；无 settled 等待残留）；(c) P2 三判定时点条目 = 1、文本按澄清 #16 正确（H1 不被 P2 回声错绑，判据同 TC-072(d)）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = H1 重复或 P2 关联被污染。
- **依据锚点（三源）**：FR-CHAT-11①④；设计基线 §4.1（handled 不启动 run、无回声、不等 settled）+ §10.12 D3；外部契约 rpc-commands.md L31（扩展命令流式中也立即执行）+ L40（handled 语义）；rpc.md「Run lifecycle」L60–71（L67 handled 无 run）；设计基线 §11 #2/#3。

#### TC-074 ｜ FR-CHAT-11⑤（P0）｜ 回归边界：assistant 流式 / thinking / 工具卡不受 user 回声处理影响 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-THINK + MOCK-TOOLS-LATE（均 v0.5 口径：补发 user 回声）。
- **操作步骤**：`npm run verify:integration`（场景 SC-074：在含 user 回声的完整事件流下执行既有 FR-CHAT-01/03/04 核心断言——流式增量按序渲染与状态流转（TC-001 判据）、thinking 默认折叠/展开后流式（TC-005 判据）、工具卡要素与迟到结果状态收敛（TC-007/TC-052 判据））。
- **期望结果**：(a) assistant 消息条数 = 发送数 N（推导：每发送 1 轮 1 条 assistant 终稿）；(b) TC-001/005/007/052 核心判据在含 user 回声事件流下全部不回归；(c) assistant 终稿内容 = `message_end` 权威文本（json.md L68），user 回声事件的存在不改变 assistant 终稿；(d) 同链路 user 侧同时满足 TC-062 判据（交叉断言）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一既有判据回归。
- **依据锚点（三源）**：FR-CHAT-11⑤（+FR-CHAT-01/03/04 交叉）；设计基线 §10.12 D7（改动面严格限定 user 角色，assistant/toolResult 路径零改动）；外部契约 json.md L30–46（user 与 assistant 事件次序）+ L66–68；设计基线 §11 #1。

#### TC-075 ｜ FR-CHAT-11①②③④（P0）｜ 单气泡与就地更新观感 ｜ UI 手工 checklist（兜底 TC-062~TC-074）
- **前置条件**：同 TC-062/TC-066/TC-071 场景（含 MOCK-ECHO-REWRITE 与 MOCK-QUEUE-MIX）。
- **操作步骤**（手工 checklist 项）：
  1. 发送一条消息：观察发送后即时出现**单个**右侧气泡（无双气泡瞬间）；收到回复后仍单条。
  2. 发送会被 pi 改写的文本（slash/template 类）：观察该条目文本**就地更新**为展开后文本，无双版本并存闪现、无新气泡插入。
  3. 运行中分别以 steer / follow-up 模式发送插话：各出现恰好一个气泡，回声交错时序下无串扰。
  4. 关闭并重开面板、切换会话再切回：无双气泡出现。
  5. 录屏（覆盖上述四段，≥20s）+ 关键帧截图存 `evidence/TC-075/`（证据类型：录屏 + 截图）。
- **期望结果**：5/5 符合。
- **判定方式**：PASS = 5/5 且证据齐全；FAIL = 任一不符或证据缺失。（本 FR 自动兜底 = TC-062~TC-074、TC-076。）
- **依据锚点（三源）**：FR-CHAT-11①②③④；澄清 #16；设计基线 §10.12 D6（就地更新不闪现两版的机制设计）；规范第一部分 §5 第 4 条（UI 项兜底纪律）。外部契约锚点不适用（纯视觉观感项，外部行为期望已由自动 TC 锚定）。

#### TC-076 ｜ FR-CHAT-11①④（P0）｜ 不可关联回声（多通道不可判定）：保守分支恒单条不错换、重建后收敛（澄清 #17）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-QUEUE-MIX（不可关联回声分支，见 §0.3 v0.5.1 增补：注入回声文本与各待确认条目的发送原文/入队文本均不精确匹配，模拟外部文档未覆盖的投递时点变换）。
- **操作步骤**：`npm run verify:integration`（场景 SC-076：发送 P1 启动长运行 → 运行中先后以 steer 模式发送 S1、follow_up 模式发送 F1（均 queued，`queue_update` 快照分别绑定入队文本，json.md L121–122）→ 到达一条 user `message_end` 回声，其文本与 S1/F1 的发送原文与入队文本均不精确匹配，且不满足「未消费条目唯一 / 全部同通道」可判定条件（多通道不可判定，澄清 #17 场景；rpc-commands.md 仅登记发送/入队前展开——L33/L48/L72，投递时点变换未覆盖）→ 该回声处理后采样 → 随后经权威重建（会话切换/刷新链路，同 TC-070 方式）→ 采样收敛结果）。
- **期望结果**（澄清 #17：#16 受控例外——单条与不错换优先于即时权威化）：(a) 该回声处理后 S1、F1 条目各恒 = 1、文本均保持各自发送原文（不错换、实时窗口保留原文；推导：各 1 次发送 → 各恒 1 条）；(b) 不因该回声新增任何条目（全程 user 条目总数 = 3：P1/S1/F1，推导 3 次发送）；(c) 权威重建后 S1/F1 各仍 1 条，文本收敛为会话 JSONL 权威文本（与会话 JSONL 逐条一致，提取方式同 TC-069；不再保持发送原文）；(d) 全程（回声处理后 → 重建完成后）任一快照无第二条气泡。
- **判定方式**：PASS = `verify:integration` 退出码 0 且 (a)-(d) 全成立；FAIL = 任一条目重复、文本被错换/改写为该回声文本，或重建后未收敛（仍为发送原文且与 JSONL 不一致）。
- **依据锚点（三源）**：FR-CHAT-11①④；澄清 #17（需求基线 v0.5.1 §12：#16 受控例外，恒单条、不错换、不新增 + 权威重建后收敛）；设计基线 §10.12 D2.2（不重绑、不追加，保留原文待权威重建；warn 留痕属设计机制，不作本 TC 判定项）+ D4（仅账本空/视图缺失方合法追加）；外部契约 rpc-commands.md L46–92（steer/follow_up 语义；展开时机边界 L33/L48/L72）、json.md L121–122（queue_update 快照）；设计基线 §11 #4/#5/#8。
- **说明**：本 TC 为审批点 2 第一轮退回补遗（总调度裁决澄清 #17 落档需求基线 v0.5.1）；澄清 #16 的可关联就地更新路径判定归 TC-071，本 TC 钉死其不可关联例外分支。

### FR-SESS-01 新建会话（P0）

#### TC-016 ｜ FR-SESS-01（P0）｜ 新建会话 + 旧会话落盘保留 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. 命令注册断言（同 TC-030 脚本方式，断言含 "new session"）。
  2. `npm run verify:integration`（场景 SC-016：新建会话 A → 发 1 条消息 → 新建会话 B）。
  3. 落盘断言：
     ```bash
     find "$HOME/.pi" -name '*.jsonl' -type f | sort > "$MOCKLOG/sessions-after.txt"
     ```
- **期望结果**：(a) 会话 A 的 JSONL 文件保留且含已发消息内容（rg 命中消息文本）；(b) A、B 为不同会话 id（文件互异）；(c) 会话文件仅位于 `$HOME/.pi/` 下（与 TC-041 交叉断言）。
- **判定方式**：PASS = 脚本/套件绿且 (a)-(c) 全成立；FAIL = 任一不成立（如旧会话被删/覆盖）。

### FR-SESS-02 历史列表（P0）

#### TC-017 ｜ FR-SESS-02（P0）｜ 历史列表展示标题/时间/消息数并可切换 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. 场景 SC-017 准备 fixture：通过插件自身依次新建 3 个会话，分别发送 2/5/9 个 prompt（prompt 文本含序号 marker；每 prompt 经 MOCK-STREAM 产生 1 条 user 消息 + 1 条 assistant 回复）。
  2. 触发 "Show Session History"（命令注册断言同 TC-030）打开历史列表并任选一项切换。
- **期望结果**：(a) 列表恰含 3 项；(b) 每项含标题、时间、消息数三个字段，消息数与 fixture 一致——**口径（总调度裁决 2026-11-17，需求基线 v0.2.2）：消息数 = 会话内消息总数（user + assistant 合计）**；期望值计算说明：SC-017 各会话分别发送 2/5/9 个 prompt，MOCK-STREAM 每 prompt 产生 1 条 user + 1 条 assistant，故期望值为 **4/10/18**（user 2/5/9 + assistant 2/5/9）；(c) 选择某项触发会话切换事件（活动会话 id 变更）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。
- **说明**："点击切换"的点击手势本身不可自动观察，本 TC 以切换事件断言替代（自动兜底）；视觉项并入 TC-018 证据。

### FR-SESS-03 继续会话（P0）

#### TC-018 ｜ FR-SESS-03（P0）｜ 切换后完整恢复上下文（含压缩状态） ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：`npm run verify:integration`（场景 SC-018：会话 A 发 2 条消息 → 切到 B → 切回 A → 对 A 的会话状态做快照对比 → 发第 3 条消息）。
- **期望结果**：(a) 切回 A 后渲染历史含前 2 条消息（marker 命中）；(b) A 的会话状态快照与切换前相等（含压缩状态字段，若存在则值不变）；(c) 第 3 条消息续写同一会话 JSONL（同一文件新增行，`wc -l` 递增）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立（上下文丢失/状态漂移/另起文件）。

### FR-SESS-04 会话命名（P1）

#### TC-019 ｜ FR-SESS-04（P1）｜ 重命名会话（set_session_name） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS。
- **操作步骤**：`npm run verify:integration`（场景 SC-019：对当前会话执行重命名命令，输入 "TC-019-name"）。
- **期望结果**：(a) `$MOCKLOG/calls.jsonl` 含 `set_session_name` 且参数为 "TC-019-name"；(b) 会话状态名更新；(c) 历史列表项标题同步为 "TC-019-name"。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。

### FR-SESS-05 分支切换（P2）

#### TC-020 ｜ FR-SESS-05（P2）｜ 编辑历史消息产生分支并切换 ｜ 延后（二期，显式列出）
- **状态**：**延后，不计入 MVP 门禁**（需求明示"UI 延后到二期可接受"）。
- **预留步骤**（二期转正时使用）：编辑某历史消息 → 产生分支 → 切换分支 → 断言上下文 = 该分支祖先链。
- **判定方式**：本期恒记 **DEFERRED**；二期按预留步骤转自动 TC。

### FR-SESS-06 单会话工作模式（P0）

#### TC-021 ｜ FR-SESS-06（P0）｜ 单活动会话，无并行多会话标签 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. 静态断言：
     ```bash
     node -e 'const p=require("./package.json");const s=JSON.stringify(p.contributes||{}).toLowerCase();if(/tab session|split session|new window session|多会话/.test(s)){console.error("FOUND multi-session capability");process.exit(1)}console.log("OK: no multi-session commands")'
     ```
  2. `npm run verify:integration`（场景 SC-021：连续新建 3 个会话）。
- **期望结果**：(a) 静态断言 exit 0（无并行多会话命令）；(b) 任意时刻活动会话数 = 1（状态模型断言）；(c) 新建仅产生历史项切换，不产生多活动会话。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 出现并行多会话能力证据（附命令清单输出）。

### FR-SESS-07 外部修改提示（P1）

#### TC-022 ｜ FR-SESS-07（P1）｜ 检测会话外部修改并提示刷新 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. `npm run verify:integration`（场景 SC-022：创建并激活会话 A，取得其 JSONL 路径 `$SESSION_FILE`，随后模拟外部写入）：
     ```bash
     echo '{"external":"probe","note":"simulated terminal pi write"}' >> "$SESSION_FILE"
     ```
- **期望结果**：(a) ≤5s 内插件发出"会话已被外部修改"提示（提示事件/flag=true，文案含 "刷新" 类关键词）；(b) 不静默继续使用陈旧状态（下一次交互被提示拦截或触发自动刷新，二者其一）。
- **判定方式**：PASS = (a)-(b) 全成立；FAIL = 无提示 / 静默继续陈旧状态。

### FR-FILE-01 工作区绑定（P0）

#### TC-023 ｜ FR-FILE-01（P0）｜ Pi 子进程 cwd 绑定规则 ｜ 自动
- **前置条件**：ENV-SETUP；临时目录 W1、W2。
- **操作步骤**：`npm run verify:integration`（场景 SC-023a：单根工作区 W1；SC-023b：多根工作区 [W1,W2]；SC-023c：无工作区打开）。harness 记录子进程 spawn 参数（cwd）。
- **期望结果**：(a) SC-023a 子进程 cwd == W1；(b) SC-023b cwd == 第一个文件夹 W1；(c) SC-023c 允许聊天且 cwd == 用户主目录，并产生"文件工具受限"提示。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。

### FR-FILE-02 `@file` 引用（P0；v0.4 修订：`@` 为输入区唯一文件引用入口）

（v0.4 修订注：基线 v0.4 移除输入区"添加文件"按钮——`@` 触发选择器为唯一文件引用入口。TC-024/TC-025 断言不变，新增 TC-061 判定修订句。）

#### TC-024 ｜ FR-FILE-02（P0）｜ '@' 触发文件选择并插入路径 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；工作区含文件 `src/a.ts`。
- **操作步骤**：`npm run verify:unit`（输入解析/路径插入逻辑单测）+ `npm run verify:integration`（场景 SC-024：输入 "看下 @a.ts"，触发选择器请求，选中 `src/a.ts` 后发送）。
- **期望结果**：(a) 文本含 '@' 触发文件选择器请求，枚举范围限定当前工作区；(b) 选中后 prompt 文本插入 `src/a.ts` 路径（断言 prompt 内容含该路径）；(c) 发送后 `$MOCKLOG/calls.jsonl` 收到的消息含该路径。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。

#### TC-025 ｜ FR-FILE-02（P0）｜ @file 选择器交互视觉 ｜ UI 手工 checklist（兜底 TC-024）
- **操作步骤**（手工 checklist 项）：核对 '@' 弹出选择器、列表仅当前工作区文件、选中后输入框显示路径；截图存 `evidence/TC-025/`（证据类型：截图）。
- **判定方式**：PASS = 3/3 且证据存证；FAIL = 任一不符。

#### TC-061 ｜ FR-FILE-02（P0，v0.4 修订）｜ 输入区无"添加文件"按钮（DOM 断言）＋ `@` 唯一入口保持 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；工作区含文件 `src/a.ts`；FR 追溯表（定位输入区容器）。
- **操作步骤**：
  1. DOM 断言（v0.4 修订句"输入区不得存在独立'添加文件'按钮或等价固定入口"）：`npm run verify:unit`（场景 SC-061：渲染入口挂载后查询输入区 DOM）；套件未覆盖时按 §0.5 临时脚本执行同一断言：
     - (a) 输入区（输入框容器及其工具行）内不存在 `input[type="file"]` 元素（含隐藏实例）；
     - (b) 输入区内全部按钮元素的可访问名称（aria-label/title/可见文本）均不匹配文件添加语义类正则 `attach|附件|添加文件|add file|upload file|选择文件`（不区分大小写）——输入区合法按钮仅为发送与既有模式类控件。
  2. `npm run verify:integration`（场景 SC-061：输入 "@" → 文件选择器触发 → 选中 `src/a.ts`），断言同 TC-024(a)(b)——`@` 选择器仍为输入区唯一文件引用入口且行为不回归。
- **期望结果**：(a)(b) DOM 断言通过；@ 触发与路径插入行为不回归。
- **判定方式**：PASS = 全部成立；FAIL = 出现"添加文件"按钮/等价入口（DOM 证据）或 @ 触发回归。
- **说明**：FR-FILE-03 右键发送入口不受本修订影响，由 TC-026 判定（交叉引用，不计入本 TC 判定项）；TC-024/TC-025 继续有效。

### FR-FILE-03 右键发送（P1）

#### TC-026 ｜ FR-FILE-03（P1）｜ 资源管理器/编辑器右键"发送到 Pi" ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP。
- **操作步骤**：
  1. 菜单注册断言（**结构化解析**扩展清单 JSON 的菜单贡献项，断言菜单入口指向"发送到 Pi"命令；**不断言标题字面文本**）：
     ```bash
     export SEND_CMD="${SEND_CMD:-}"   # 取值 = FR 追溯表中 FR-FILE-03 对应命令 id；追溯表未给出时留空，脚本退化为命令 id 语义匹配
     node -e "
     const p=require('./package.json');
     const c=p.contributes||{};
     const ids=(c.commands||[]).map(x=>x.command);
     const SEND_CMD=process.env.SEND_CMD||ids.find(id=>/send/i.test(id));
     if(!SEND_CMD||ids.indexOf(SEND_CMD)<0){console.error('FAIL: 发送命令未定位/未注册');process.exit(1)}
     const menus=c.menus||{};
     for(const g of ['explorer/context','editor/context']){
       if(!(menus[g]||[]).some(i=>i.command===SEND_CMD)){console.error('FAIL: '+g+' 缺少指向发送命令的菜单入口');process.exit(1)}
     }
     console.log('OK: explorer/editor context menus reference registered send command');
     "
     ```
  2. `npm run verify:unit`（命令处理逻辑：文件路径 / 选区 → prompt 素材）。
- **期望结果**：(a) 脚本 exit 0——explorer/context 与 editor/context 各存在至少一个菜单入口，其 `command` 字段指向 FR-FILE-03 的"发送到 Pi"命令（FR 追溯表 id，仅结构化字段断言、不比对标题字面文本），且该命令已在 contributes.commands 注册；(b) 生成 prompt 素材含文件路径；选区场景含选区文本。
- **判定方式**：PASS = (a)-(b) 全成立；FAIL = 任一不成立。

### FR-MOD-01 切换模型（P1）

#### TC-027 ｜ FR-MOD-01（P1）｜ 列出并切换模型（get/set_model） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS。
- **操作步骤**：`npm run verify:integration`（场景 SC-027：打开模型列表 → 切换到 "mock-large"）。
- **期望结果**：(a) 命令/状态栏入口存在（manifest 含 model 相关命令/交互入口）；(b) `get_available_models` 被调用且候选 ["mock-small","mock-large"] 进入状态模型；(c) `set_model("mock-large")` 调用被记录；(d) 状态栏模型字段更新为 "mock-large"。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一不成立。

#### TC-058 ｜ FR-MOD-01（P1）｜ 底部内联模型选择器：常显／点击弹出／切换与跨入口同步（入口③） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS；FR 追溯表（定位输入区底部选择器元素）。
- **操作步骤**：`npm run verify:integration`（点击/选中以场景内确定性指令派发，非人工手势；SC-058a 常显、SC-058b 弹出、SC-058c 切换与双向同步）。
- **期望结果**：
  - (a) 常显：面板初始挂载（无任何交互）即存在输入区底部模型名展示元素，文本非空且 = 状态模型字段当前值（常显一致性）。
  - (b) 弹出：对底部选择器派发 click → 弹出可用模型列表 = `get_available_models` 结果 ["mock-small","mock-large"]（逐项为模型名，与 mock 返回一致）。
  - (c) 切换与同步：场景确保切换前当前模型 = "mock-small"（初始即为则直接进行，否则先经底部选择器切至 "mock-small"）→ 经底部选择器选中 "mock-large"：(i) mock 调用记录含 `set_model("mock-large")`；(ii) 底部选择器展示文本更新为 "mock-large"；(iii) 顶部状态栏模型字段同步为 "mock-large"（入口③→①）。反向：经状态栏/命令入口切换回 "mock-small"（同 TC-027 场景路径）→ 底部选择器文本同步为 "mock-small"（①→③）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立（如底部不常显、弹出列表非 get_available_models 数据、切换后任一入口展示不同步）。
- **说明**：FR-MOD-01 三等价入口中①②（状态栏/命令面板）由 TC-027 判定；本 TC 补入口③全链路与"任一入口切换后其余入口展示同步"（v0.4 增补口径）。

### FR-MOD-02 切换 thinking 等级（P1）

#### TC-028 ｜ FR-MOD-02（P1）｜ 切换 thinking 等级（set/cycle_thinking_level） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS。
- **操作步骤**：`npm run verify:integration`（场景 SC-028：执行切换等级命令与 cycle 命令各一次）。
- **期望结果**：(a) `set_thinking_level` 或 `cycle_thinking_level` 调用被记录；(b) 状态栏等级字段值发生变化（具体枚举值不断言，见歧义清单 #11）。
- **判定方式**：PASS = (a)-(b) 全成立；FAIL = 任一不成立。

### FR-MOD-03 会话内持久（P1）

#### TC-029 ｜ FR-MOD-03（P1）｜ 切换结果随会话保留、重启后反映 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS。
- **操作步骤**：`npm run verify:integration`（场景 SC-029：切模型=mock-large、切等级 → 模拟插件/面板重载（webview + host 重建）→ 读取状态栏状态）。
- **期望结果**：重载后状态栏反映切换后的模型与等级（非默认值，从会话状态恢复）。
- **判定方式**：PASS = 两值均与切换后一致；FAIL = 回落默认值或错乱。

#### TC-059 ｜ FR-MOD-03（P1）｜ 重启后底部模型选择器与状态栏反映切换（v0.4 展示口径） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-MODELS；FR 追溯表（定位底部选择器元素）。
- **操作步骤**：`npm run verify:integration`（场景 SC-059：确保当前模型 = "mock-small" → 经底部选择器切换 "mock-large" 并切换 thinking 等级一次 → 模拟插件/面板重载（webview + host 重建，同 TC-029/SC-029 方式）→ 读取底部选择器与状态栏展示）。
- **期望结果**：重载后底部模型选择器展示 "mock-large"（≠ 切换前值 "mock-small"），且状态栏模型字段同值——切换结果随会话保留，重启后反映在状态栏与底部模型选择器两处（v0.4 口径，FR-MOD-01 入口③）。
- **判定方式**：PASS = 两处展示一致且均为切换后值；FAIL = 任一处回落切换前/默认值或两处不一致。
- **说明**：与 TC-029 互补——TC-029 断状态栏，本 TC 钉入口③（底部选择器）的重启反映。

### FR-MOD-04 上下文用量指示（P1）

（v0.4 新增章节，TASK-006；对应基线 v0.4 FR-MOD-04。验收标准①-⑤由 TC-060 子场景 SC-060a~e 一一对应。展示文本解析口径（判定用，供核验脚本统一使用）：从用量行文本解析 token 数与百分比——token 数接受整数/千分位形式（"12345"/"12,345"，须与权威值精确相等）或 k 缩写形式（如 "12.3k"，解析值与权威值相对误差 ≤1%）；百分比为 "%" 前整数，须等于 ①÷②×100 的四舍五入（half-up）整数值。注：k 缩写精度需求未定义，≤1% 为用例侧容差口径（已披露，见 §2.3 第 9 条），如需固化请总调度裁决。）

#### TC-060 ｜ FR-MOD-04（P1）｜ 用量行：权威取值／百分比取整／刷新时机／无助手消息占位／compaction 不受影响 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-USAGE（`contextWindow=200000`；会话 A 助手消息 totalTokens 依次 12345、45600；会话 B 最近一条 15000；可触发 compaction 事件）；FR 追溯表（定位输入区底部用量行元素）。
- **操作步骤**：`npm run verify:integration`（SC-060a~e 按序执行，每步读取用量行展示文本并按章节引言解析口径断言）。
- **期望结果**：
  - (a) SC-060a（权威取值+百分比，验收标准①②③）：会话 A 第 1 条助手消息（`message_update` 携带 Usage，totalTokens=12345）到达后 → 用量行 token = 12345、百分比 = 6（计算说明：12345 ÷ 200000 × 100 = 6.1725 → 四舍五入 = 6）。
  - (b) SC-060b（刷新时机·新助手消息，验收标准④）：第 2 条助手消息（totalTokens=45600）到达后 → 刷新为 45600、23（45600 ÷ 200000 × 100 = 22.8 → 23）；取值 = 最近一条助手消息（若为首条值 12345 或累加值 57945→29% 则 FAIL）。
  - (c) SC-060c（刷新时机·切换会话，验收标准④）：切换到会话 B（其最近一条助手消息 totalTokens=15000）→ 15000、8（15000 ÷ 200000 × 100 = 7.5 → 四舍五入 half-up = 8，钉死取整边界）；切回会话 A → 45600、23。
  - (d) SC-060d（无助手消息占位，验收标准④）：新建空会话（当前会话尚无助手消息）→ 用量行显示 "—" 占位（无 token 数值与百分比数字）。
  - (e) SC-060e（compaction 边界，验收标准⑤）：触发一次 compaction 事件 → 用量行仍按验收标准①口径取最近一条助手消息 totalTokens 刷新展示（不被 compaction 事件清零/置空/另起取值）；compaction 相关 toast 为既有行为，不属本 FR 与本 TC 判定项（仅观察记录）。
- **判定方式**：PASS = (a)-(e) 全成立；FAIL = 任一不成立（附各步用量行文本快照与对应 mock Usage 记录为证据）。

### FR-CMD-01 命令面板（P0）

#### TC-030 ｜ FR-CMD-01（P0）｜ 五命令注册清单断言 ｜ 自动
- **前置条件**：ENV-SETUP。
- **操作步骤**：
  ```bash
  node -e '
  const p=require("./package.json");
  const cmds=(p.contributes&&p.contributes.commands||[]).map(c=>(c.command+" "+c.title).toLowerCase()).join("\n");
  const need=["open chat","new session","abort","show session history","report issue"];
  const miss=need.filter(t=>!cmds.includes(t));
  if(miss.length){console.error("MISSING commands: "+miss.join(", "));process.exit(1)}
  console.log("OK: 5 commands registered");
  '
  ```
- **期望结果**：脚本 exit 0（Open Chat / New Session / Abort / Show Session History / Report Issue 五命令全部注册）；且 Command Palette 菜单可见性有注册（`contributes.menus["Command Palette"]` 或等价声明）。
- **判定方式**：PASS = 脚本 exit 0 且 palette 可见性断言成立（第二项以同一 manifest 检查或 TC-045 实际唤起佐证）；FAIL = 任一命令缺失（附命令清单输出）。

### FR-CMD-02 输出日志（P0）

#### TC-031 ｜ FR-CMD-02（P0）｜ Output Channel 记录 stderr 与协议异常 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STDERR。
- **操作步骤**：`npm run verify:integration`（场景 SC-031：触发 MOCK-STDERR），转储 Output Channel（名称含 "Sdysyhj"）内容。
- **期望结果**：(a) 通道收到 stderr 原文（含 `E2E-STDERR-MARKER`）；(b) 协议异常有记录（含解析失败/非法 JSONL 描述）；(c) 通道名称为 "Sdysyhj"（或含该词）；(d) 记录内容通过脱敏断言（无哨兵凭证，同 TC-039 判据）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一不成立（日志丢失/通道名不符/泄密）。

### FR-CMD-03 `/` 命令补全菜单（slash commands / skills）（P1，v0.4 转正）

（v0.4：基线 v0.4 将 FR-CMD-03 由 P2 转正 P1（§11；TASK-006 素材③"键入 / 无法触发 PI 相关命令"功能补缺）。菜单全链路由 TC-056（验收标准①②⑤：出现条件/数据源/过滤规则/空数据表现）与 TC-057（验收标准③④：键位导航/选中插入不发送/鼠标等价）判定；TC-032（命令文本直发透传）保留。菜单观察载体 = 渲染入口 DOM（菜单容器存在性/可见性与项内容，定位依 FR 追溯表）；键盘/鼠标事件一律以场景内确定性指令派发（非人工手势）。）

#### TC-032 ｜ FR-CMD-03（P1，v0.4 转正）｜ slash 命令文本直接发送生效（透传口径） ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：`npm run verify:integration`（场景 SC-032：输入 "/review this file" 直接发送）。
- **期望结果**：(a) mock 收到消息原文（含 "/review this file"）；(b) 会话正常继续（有回复、无错误卡片）。
- **判定方式**：PASS = (a)-(b) 全成立；FAIL = 任一不成立。
- **备注**：本 TC 覆盖命令文本直发透传口径（v0.4 起对应验收标准⑤"`/` 开头文本仍可直接发送"）；历史归属歧义见歧义清单 #1（基线 v0.4 §11 已裁决转正 P1）；空数据分支另由 TC-056(c) 回归。

#### TC-033 ｜ FR-CMD-03（P1）｜ '/' 自动补全（透传 get_commands） ｜ 已由 TC-056/TC-057 取代（v0.4 延后状态撤销）
- **状态变更**：v0.2 初判"延后（二期）"（时为 P2）；基线 v0.4 将 FR-CMD-03 转正 P1（§11），本 TC 延后状态撤销——原预留步骤"输入 '/' → `get_commands` → 补全列表渲染 → 选中插入"已由 TC-056/TC-057 全量覆盖。
- **判定方式**：不再记 DEFERRED；以 TC-056/TC-057 判定结果为准。

#### TC-056 ｜ FR-CMD-03（P1）｜ 菜单出现条件／数据源与实时过滤／空数据表现（验收标准①②⑤） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-CMD（全集 4 项；含空集与不可用两个配置分支）。
- **操作步骤**：`npm run verify:integration`（场景内确定性指令向输入框逐条写入文本，观察菜单可见性与内容；SC-056a 出现条件、SC-056b 数据源+过滤、SC-056c 空数据）。
- **期望结果**：
  - (a) SC-056a（出现条件，验收标准②前半）：输入 "hello"（非 `/` 开头）→ 菜单不显示；输入 "/rev" → 菜单显示。
  - (b) SC-056b（数据源+过滤，验收标准①②）：输入 "/" → 菜单项 = MOCK-CMD 全集 4 项，每项同时渲染名称与描述两个字段（逐项断言）；输入 "/exp" → 仅剩 "ExPlain"（名称子串、不区分大小写）；输入 "/REVIEW" → 仅剩 "review"（不区分大小写）；输入 "/zeb" → 仅剩 "skill-zebra"（描述子串命中）；输入 "/nomatch" → 菜单隐藏（过滤后无匹配）。
  - (c) SC-056c（空数据，验收标准⑤）：MOCK-CMD 配置为返回空集 → 输入 "/" 菜单不显示；配置为 `get_commands` 调用失败（不可用）→ 同样不显示；且该分支下 "/anything" 文本可直接发送，mock 调用记录收到消息原文（判据同 TC-032）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立（如非 `/` 开头弹菜单、过滤区分大小写或不匹配描述、空数据渲染空菜单或阻断 `/` 文本发送）。

#### TC-057 ｜ FR-CMD-03（P1）｜ 键盘导航与选中插入不发送、鼠标等价（验收标准③④） ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；MOCK-CMD（全集 4 项）。
- **操作步骤**：`npm run verify:integration`（键盘/鼠标事件以场景内确定性指令派发）：
  1. SC-057a（键盘导航，验收标准③）：输入 "/" 打开菜单 → 初始高亮第 1 项；派发 ↓ → 高亮移至第 2 项；派发 ↑ → 回到第 1 项（高亮索引断言；首尾环绕行为需求未定义，不作判定项）。
  2. SC-057b（Enter 选中，验收标准④）：输入 "/exp"（过滤至 "ExPlain"）→ 派发 Enter → 断言：(i) 输入框文本 = "/ExPlain"（`/` + 命令名，替换原 `/` 起始的过滤文本）；(ii) 菜单关闭；(iii) 焦点保持在输入框（活动元素 = 输入框元素）；(iv) 无发送行为（mock 调用记录无 prompt/steer 类请求）；(v) 随后再派发 Enter → 发送发生且 mock 收到消息原文 "/ExPlain"（命令文本透传 pi 端执行）。
  3. SC-057c（Esc 关闭，验收标准③）：输入 "/rev" 打开菜单 → 派发 Esc → 菜单关闭且无发送行为（mock 调用记录无 prompt/steer 类请求）。
  4. SC-057d（鼠标等价，验收标准④末句）：输入 "/run" → 对菜单项 "run-tests" 派发 click → SC-057b 的 (i)-(iv) 同样成立（输入框文本 = "/run-tests"、菜单关闭、焦点在输入框、无发送）。
- **期望结果**：(a) SC-057a 高亮索引断言成立；(b) SC-057b (i)-(v) 全成立；(c) SC-057c 关闭且不发送；(d) SC-057d 等价断言成立。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一不成立（如 Enter 直接发送过滤文本 / 插入后焦点丢失 / 菜单未关闭 / Esc 触发发送）。

### FR-CMD-04 MCP（P2）

#### TC-034 ｜ FR-CMD-04（P2）｜ 复用 pi 的 MCP 配置自动生效 ｜ 延后（二期，显式列出）
- **状态**：**延后，不计入 MVP 门禁**。
- **预留步骤**：fixture MCP 配置 → 启动对话 → 断言 MCP 工具出现在可用工具集；UI 无管理界面（不做检查）。
- **判定方式**：本期恒记 **DEFERRED**。

### FR-CMD-05 pi 运行时来源（P0）

#### TC-035 ｜ FR-CMD-05（P0）｜ PATH 优先 / 内置回退 / 显式指定 / 失败指引 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：
  1. SC-035a（PATH 优先）：构造假 pi 并置于 PATH 首位：
     ```bash
     mkdir -p "$TMP/bin"
     cat > "$TMP/bin/pi" <<'EOF'
     #!/bin/sh
     echo "$@" >> "$MOCKLOG/pi-invocations.log"
     exec node "$MOCK_PI_STUB" "$@"
     EOF
     chmod +x "$TMP/bin/pi"
     export PATH="$TMP/bin:$PATH"
     ```
     发起一次对话，检查 `$MOCKLOG/pi-invocations.log`。
  2. SC-035b（内置回退）：`export PATH=/usr/bin:/bin`（不含 pi）→ 发起对话（MOCK-STREAM 断言通过），核对 spawn 记录指向插件内置运行时（依赖路径）。
  3. SC-035c（显式指定）：设置 pi 路径为 `$TMP/bin/pi` → 发起对话，核对按该路径启动。
  4. SC-035d（显式路径无效）：设置 pi 路径为 `/nonexistent/pi` → 发起对话，核对错误展示。
- **期望结果**：(a) SC-035a 启动的是 PATH 中的 pi（invocations.log 非空）且对话成功；(b) SC-035b 使用内置运行时且对话成功（开箱即用）；(c) SC-035c 按显式路径启动；(d) SC-035d 展示含错误详情 + 可行动指引的错误卡片（断言同 TC-013 (a)(b)）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一不成立（如 PATH 优先级颠倒、回退失败、错误无指引）。

### FR-AUI 实验面板共用约定（TASK-009 阶段①，TC-077~TC-096 共用）

（v0.6 新增章节，TASK-009；对应需求基线 v0.6 §4.6 FR-AUI-01~06 + 澄清 #18 + §5 阶段①不做项 + §8 第 7 条出口门禁；设计依据 = 冻结快照 `42f5e86`（TASK-009 审批点 1b 通过时冻结）的 §10.13（D1–D9）+ §6 实验面板行 + §11 #11–#18。覆盖映射：FR-AUI-01①③→TC-077（自动）+TC-079（真机 MANUAL）、②→TC-078；FR-AUI-02①②③→TC-085/TC-086（双切片最小垂直切片，含 FR-AUI-03① 判定；「基本主题」由 FR-AUI-04 TC-089/TC-090 判定）、④→TC-080、⑤→TC-081（自动兜底）+TC-082（DOM 层 MANUAL）、⑥→TC-083（自动）+TC-084（切换冒烟 MANUAL）；FR-AUI-03①→TC-085（路线 A）/TC-086（路线 B）、②（P1）→TC-087、③→TC-088；FR-AUI-04①②→TC-089、③→TC-090（UI 手工 checklist，兜底 TC-089）；FR-AUI-05①→TC-091、②→TC-092（自动）+TC-093（真机 CSP MANUAL）、③→TC-094、④→TC-095（行为层 MANUAL，兜底 = TC-077 注册断言）；FR-AUI-06①②③→TC-096；§8 第 7 条出口门禁→TC-097（见「验收标准汇总（§8）补充 TC」）。）

**观察契约（TC-077~TC-096 共用，实现无关，判定面依设计 §10.13 D8）**：

- 判定面 = 「通道 + 数据」层，不建 DOM 测试基建：路线 A 判定载体 = **fetch 隧道解码后的流帧**（测试进程内以注入 port 实例化真实 webview 侧 fetch 实现，经官方隧道取回 Response 后解码 UIMessage 流：消息数、text part 拼接、帧序）；路线 B 判定载体 = **面板内消息状态镜像（store 消息状态）**（宿主→面板消息通道输出的事件序列驱动维护的消息集合）与其到 ThreadMessageLike 形状的映射输出。两者均为逻辑载体描述，不与实现命名耦合；SC-xxx 为逻辑场景名，与实际套件输出的映射由核验剧本（verification-plan.md）建立。
- **回放注入点（FR-AUI-02④ 防自证）**：注入位 = 宿主侧 PiBridge 适配层之下——RPC 子进程（golden-driver 确定性回放，TASK-008 既有模式，环境变量注入）；回放数据必须穿越「子进程 JSONL → RPC 帧解析 → PiBridge 事件翻译 → 路线适配（宿主侧 route handler / postMessage 泵）→ 官方隧道（宿主侧 route 服务泵 + webview 侧 fetch / postMessage 协议）」全链路后达判定载体；断言不触 webview DOM/React 状态（注入点低于适配层 ⇒ 杜绝直写渲染结果的自证，设计 D2）。
- 外部契约锚点 = 设计快照 §11 #11–#18（`@assistant-ui/vscode@0.0.1` npm README 节名 / npm tarball `src/` 源码路径 / 官方指南 assistant-ui.com/docs/guides/vscode 章节 / `@assistant-ui/react` 官方文档 / React 官方文档 / 官方测试床 examples/with-vscode / `ai` 写入器 / microsoft/vscode theme-defaults）+ golden fixture（`test/fixtures/golden/`）。期望的外部行为（事件序列/帧型/协议常量/时序）只来自上述权威源，不以我方 mock 行为为期望来源。
- **MANUAL 判定四值**：设计 D8 已定 DOM 行为层/真机层为手工项的 TC（TC-079/082/084/090/093/095）按核验判定四值记 **MANUAL**（遗留不计 FAIL，对应 FR 以自动兜底 TC 为门禁），证据类型逐项标注；全部真机项可在一次真机会话内执行（设计 D8 手工 checklist 汇总）。
- 阶段①不做项护栏（需求 §5）：实验面板用例不断言 Markdown 富渲染 / thinking / toolcall part 化工具卡 / @ 文件引用 / `/` 命令菜单 / 模型选择器 / 用量行 / steer·followUp 队列 UI（阶段②③范围）；最小渲染口径 = 纯文本级（FR-AUI-02③）。

**口径披露（用例侧，非歧义，均已写入对应 TC）**：① FR-AUI-04①② 的自动判定面依设计 D8 落在宿主侧静态解析审计层（token 定义链 + VS Code 调色板代入 + WCAG 公式脚本），getComputedStyle 字面执行与真实渲染归 TC-090 UI 手工 checklist（FR ③ 已给兜底口径）；② FR-AUI-06①「面板加载→首帧 / 数据就绪→首条消息渲染完成」的测量口径依设计 D7②/D8 遗留 2 落为无头通道里程碑（T1 = 驱动发起→通道首个消息事件观测；T2 = pi assistant `message_end` 到达桥→终稿可读），DOM 绘制时延入真机 checklist 定性记录；③ FR-AUI-05③ 宿主 bundle 增量与 FR-AUI-06③ 代码侵入面的「基线提交」已由总调度审批点 2 裁决钉死（§3 第 12 条裁决结论）= **v0.1.6 发版标签（tag `v0.1.6`，commit `e9fc9d8`）**，且侵入面三组归类不含 `docs/**`（docs 变更另列第四「文档留痕（信息组，不计侵入面）」组）。

### FR-AUI-01 独立实验面板·默认面板零变更（P0（阶段①））

#### TC-077 ｜ FR-AUI-01①③（P0（阶段①））｜ 实验面板独立注册结构断言（独立 viewType / 命令入口 / 标题含「实验」/ 非默认视图 / retainContextWhenHidden=true）｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表（定位实验面板注册点与构建配置）。
- **操作步骤**：`npm run verify:unit`（场景 SC-077：结构化解析 package.json 与实验面板注册点，断言 (a)-(e)；套件未覆盖时按 §0.5 以临时脚本执行同一断言）：
  - (a) **独立 viewType**：`contributes.views` 中 Sdysyhj 容器（既有 viewsContainer）含 ≥2 个 webview 视图条目；实验面板条目 id ≠ 默认聊天面板 viewType（FR-AUI-01①），且默认面板条目保持**首位**、实验条目在其后（③「不替换不抢占」的静态面；设计 D1 冻结命名：实验 viewType `sdysyhj.chatLabView`、挂容器第二位——判定以 FR 口径为主，冻结命名作加强断言）。
  - (b) **标题含「实验」**：实验面板视图 name 含「实验」标识（webview view 面板标题 = 视图 name；设计 D1「聊天（实验）」）。
  - (c) **命令入口**：存在打开实验面板的贡献命令且已在 `contributes.commands` 注册（FR-AUI-01① 入口 = 命令面板命令；设计 D1 `sdysyhj.openChatLab`）；同时既有命令逐项 id/title/category 不变（新增允许追加）。
  - (d) **retainContextWhenHidden 显式声明**（FR-AUI-05④ 注册层交叉）：实验面板注册点（FR 追溯表定位）的注册 options 显式含 `retainContextWhenHidden: true`（与默认面板同值，设计 D1）。
  - (e) **惰性激活**（设计 D1）：`activationEvents` 含实验面板视图的惰性激活项（`onView:<实验 viewType>` 或等价声明）。
- **期望结果**：(a)-(e) 全部成立。
- **判定方式**：PASS = 场景绿/脚本 exit 0 且 (a)-(e) 全成立；FAIL = 任一不成立（附 manifest/注册点解析输出为证据）。
- **依据锚点（三源）**：FR-AUI-01①③（+FR-AUI-05④ 注册层交叉）；设计 §10.13 D1（命名/注册/视图序/retainContextWhenHidden 冻结决策）；外部契约 §11 #11（README「Entry points」「Extension host」：host 入口不 import vscode、route 服务形态）+ #13（指南「Hidden views」：`retainContextWhenHidden: true` 保活 webview 页）。
- **说明**：①「执行后面板打开无错误」与③「默认打开的仍是默认聊天面板」的运行时面归 TC-079 真机冒烟；本 TC 为其自动兜底。

#### TC-078 ｜ FR-AUI-01②（P0（阶段①））｜ 默认面板零变更：冻结面断言 + 既有套件全绿回归 ｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表；基线提交（阶段①实现前，口径见 §3 第 12 条；默认面板冻结文件清单 = 设计 §10.13「改动面预估·冻结不改」组，由 FR 追溯表/设计冻结清单定位）。
- **操作步骤**：
  1. 冻结面结构断言（设计 D1 四项，`npm run verify:unit` 场景 SC-078）：(a) package.json：默认视图条目原样（id/name/容器归属不变）、既有命令逐项不变、宿主入口 `main` 不变、`activationEvents` 仍含默认视图惰性激活项；(b) 构建配置：既有两项构建入口（宿主 bundle 与默认面板 webview 入口）的入口/产物路径/平台形态逐项原样（实验面板构建为新增项，允许追加）；(c) 默认面板注册冻结值：默认 viewType、`retainContextWhenHidden: true`、CSP meta 模板逐字匹配既有冻结值；(d) 默认面板依赖图：单独构建默认 webview 入口（esbuild metafile），inputs 不含 react/react-dom/`@assistant-ui/**`（FR-AUI-05③「独立构建入口断言」，与 TC-094(d) 交叉）。
  2. git 层佐证（设计 D1/D7③）：`git diff --stat v0.1.6..HEAD`（基线锚点 = §3 第 12 条裁决的 `v0.1.6` tag）归组核对——默认面板冻结文件组零改动；改动仅限「共享文件增量 + 新增文件」两组（分组口径同 TC-096(a)③，docs/** 变更另列信息组不计入）。
  3. 既有套件全绿：`npm run verify:unit && npm run verify:integration`（既有 TC-001~TC-076 对应全部用例；§4.1–§4.5 既有 FR 行为零变更的行为证据，需求 §8 第 7 条出口门禁第三句）。
- **期望结果**：(a)-(d) 全部成立；git 归组核对通过；两套件退出码 0（既有用例零回归）。
- **判定方式**：PASS = 全部成立；FAIL = 任一冻结面被改动 / 既有用例红（附 diff 分组与套件输出为证据）。
- **依据锚点（三源）**：FR-AUI-01②；设计 §10.13 D1（零变更 diff 断言四项 + git 层）+ D7③；外部契约 §11 #11（README「Webview HTML and Content Security Policy」——CSP 基线锚）+ #13（指南「Add to an existing extension」——增量接入不改既有扩展形态）。

#### TC-079 ｜ FR-AUI-01①③（P0（阶段①））｜ 真机冒烟：命令打开实验面板无错误 + 默认视图不抢占 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-077）
- **前置条件**：真机 VS Code + 安装交付 vsix（或 F5 开发宿主）；TC-077 PASS。
- **操作步骤**（手工 checklist 项）：
  1. 命令面板执行打开实验面板命令（TC-077(c) 定位的贡献命令）：核对实验面板打开、无错误通知/空白面板/控制台异常；面板标题含「实验」标识。
  2. Activity Bar 打开 Sdysyhj 容器：核对默认打开的仍是默认聊天面板（实验面板为容器内后续视图，未替换/未抢占默认视图）。
  3. 证据存 `evidence/TC-079/`（证据类型：截图（实验面板打开态 + 容器双视图态）+ 命令执行与控制台输出记录）。
- **期望结果**：3/3 符合。
- **判定方式**：PASS = 3/3 且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-077 为门禁）；FAIL = 打开报错/空白/抢占默认视图。
- **依据锚点（三源）**：FR-AUI-01①③；设计 §10.13 D1（入口 = 命令面板命令、视图序）；外部契约 §11 #13（指南「Quick start」：F5 开发宿主打开视图的官方形态——辅助锚，运行时观察项，行为期望已由 FR/设计冻结）。

### FR-AUI-02 路线 A/B 双切片最小垂直切片（P0（阶段①））

#### TC-080 ｜ FR-AUI-02④（P0（阶段①））｜ 回放传输真实性（防自证）：注入点位于宿主侧适配层之下，数据穿越官方隧道 ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC（`test/fixtures/golden/golden-prompt-basic.jsonl`；期望源 = 录制序列本身）。
- **操作步骤**：`npm run verify:integration`（场景 SC-080a 路线 A / SC-080b 路线 B：golden 回放注入位 = RPC 子进程环境注入（golden-driver 模式，同 §0.3）；测试进程内以注入 port 实例化官方 webview 侧 fetch 实现，观测 webview 端口消息）。
- **期望结果**：
  - (a) 路线 A：webview 端口观测到宿主侧 route 服务泵出的通道帧——channel 常量为 `aui-vscode`、一次 POST 对应帧型序列 `fetch:head → fetch:chunk(≥1) → fetch:end`（流式回传经 16ms/64KB 合块可为多 chunk）；经真实 webview 侧 fetch 实现取回 Response（status 200、body 可流式读取）。
  - (b) 路线 B：宿主→面板消息通道（postMessage 协议）输出回放驱动的完整事件序列（含该轮 user 与 assistant 消息数据、非空且按到达序），消息数据全部经通道到达面板侧。
  - (c) 防自证结构约束：回放注入点位于 PiBridge 适配层之下（RPC 子进程），测试观测面仅为通道输出与通道解码后数据（渲染结果不经任何直写路径注入；核验剧本按 FR 追溯表确认注入点落位与观测面）。
- **判定方式**：PASS = `verify:integration` 退出码 0 且 (a)-(c) 全成立；FAIL = 通道帧缺失/帧型或 channel 不符/Response 不可读/数据未经通道到达。
- **依据锚点（三源）**：FR-AUI-02④；设计 §10.13 D2（注入位与全链路真实）/D3（路线 B 通道）/D8（判定面）；外部契约 §11 #12（npm tarball `src/protocol.ts`：channel `"aui-vscode"`、`fetch:*` 帧型与校验器；`src/host/router.ts`：`RouteHandler=(request:Request)=>Response|Promise<Response>`、flushInterval 16ms/flushSize 64KB、404/405/500；`src/webview/fetch.ts`：`createVSCodeFetch(port)` 可注入 port）+ #11（README「Extension host」「Webview」：route 回传流式）+ #13（指南「How it works」）。

#### TC-081 ｜ FR-AUI-02⑤（P0（阶段①），NFR-03 交叉）｜ XSS 安全自动兜底：LAB-XSS 回放通道文本保真 + 实验面板源码消毒 API 禁令扫描 ｜ 自动
- **前置条件**：ENV-SETUP；LAB-XSS（§0.3 v0.6 增补）；实验面板 webview 新增源码文件集（设计 §10.13「改动面预估·新增」组，FR 追溯表定位）。
- **操作步骤**：
  1. `npm run verify:integration`（场景 SC-081a/SC-081b：LAB-XSS 剧本经两条切片真实通道回放——注入与通道同 TC-080；断言两切片通道解码文本与探针原文**逐字节一致**：文本作为纯文本运载保真，未被解释为标记/转译/截断）。
  2. 静态扫描（扫描面**仅限**实验面板 webview 新增源码文件，排除依赖产物与既有默认面板源码——规范 §5.2 扫描纪律）：`innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` 零命中。
- **期望结果**：(a) 两切片通道解码文本 == 探针原文（逐字节）；(b) 扫描零命中。
- **判定方式**：PASS = (a)(b) 全成立；FAIL = 文本被改写/截断或扫描命中（附命中位置）。
- **依据锚点（三源）**：FR-AUI-02⑤（+NFR-03 交叉）；设计 §10.13 D5（XSS 探针落点：自动层两项）；外部契约 §11 #15（React 官方文档「Prevents Injection Attacks」：字符串 children 进文本节点的构造性转义——探针以纯文本到达的外部依据）+ #1（json.md「Event sequence」L30–46——LAB-XSS 剧本事件形状对照锚点）。
- **说明**：DOM 行为层（渲染后无新增 script 元素、哨兵无副作用）= TC-082 真机 MANUAL；本 TC 为其自动兜底（FR-AUI-02⑤ 已给兜底口径）。

#### TC-082 ｜ FR-AUI-02⑤（P0（阶段①））｜ XSS DOM 行为层：探针渲染后无新增 script 元素、哨兵无副作用 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-081）
- **前置条件**：真机 VS Code + 交付 vsix；LAB-XSS 剧本可用；预埋哨兵（面板加载时预置全局哨兵，设计 D5 命名 `window.__AUI_XSS_SENTINEL`，值固定）。
- **操作步骤**（手工 checklist 项）：
  1. 实验面板经回放通道渲染 LAB-XSS 剧本消息（路线 A/B 两切片各一次）。
  2. 打开 Webview Developer Tools 逐项核对：(i) DOM 中无新增 `script` 元素（探针以文本形态可见）；(ii) 预埋哨兵全局变量值未被改写、无探针副作用（alert 未触发/无探针写入痕迹）；(iii) 控制台无 XSS 类错误。
  3. 证据存 `evidence/TC-082/`（证据类型：devtools Elements/Snapshot 截图 + 控制台输出记录 + 哨兵取值记录）。
- **期望结果**：3/3 符合（两切片各通过）。
- **判定方式**：PASS = 3/3×2 切片且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-081 为门禁）；FAIL = 新增 script 元素/哨兵被改写/副作用发生。
- **依据锚点（三源）**：FR-AUI-02⑤；设计 §10.13 D5（DOM 层 = 真机手工 checklist，哨兵命名）+ D8；外部契约 §11 #15（React 注入防护）。

#### TC-083 ｜ FR-AUI-02⑥（P0（阶段①））｜ 双切片共存：同一面板内独立运行（各完成 FR-AUI-03①）+ 共存结构前提 ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC。
- **操作步骤**：
  1. `npm run verify:integration`（场景 SC-083：TC-085（路线 A）与 TC-086（路线 B）在同一交付中**各自独立全绿**——两切片各自独立完成 FR-AUI-03① 全量回放判定，任一通过不依赖另一切片的运行状态）。
  2. 共存结构前提断言（设计 D4）：实验面板为单 webview（单 viewType/单 HTML/单构建入口）内双切片——manifest 断言实验类视图条目恰 1 个、打开命令恰 1 条（无第二实验面板视图/命令增量）；构建配置中实验 webview 构建入口唯一。
- **期望结果**：(a) 两切片回放判定各自独立 PASS；(b) 结构前提成立。
- **判定方式**：PASS = (a)(b) 全成立；FAIL = 任一切片不能独立完成 FR-AUI-03① 判定，或出现双面板/双入口结构。
- **依据锚点（三源）**：FR-AUI-02⑥；设计 §10.13 D4（面板内开关：单 HTML/单 bundle、切换卸载/挂载子树不重载——重载会中止在途请求）+ D1（增量注册最小面）；外部契约 §11 #11（README「Webview」：页面重载触发上一页在途请求中止——切换不得以重载实现的外部依据）。
- **说明**：切换交互互不干扰的真机冒烟 = TC-084（MANUAL）。

#### TC-084 ｜ FR-AUI-02⑥（P0（阶段①））｜ A/B 切换互不干扰真机冒烟 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-083）
- **操作步骤**（手工 checklist 项）：真机实验面板内执行「路线 A → 回放/发送一条 → 切换路线 B → 回放/发送一条 → 切回 A」：核对切换不重载页面（无白屏/无整页状态清空）、A 已渲染消息在切回后仍在、两切片互不干扰（无串数据/无报错）。证据存 `evidence/TC-084/`（证据类型：录屏（含切换过程，≥15s）+ 切换前后截图）。
- **期望结果**：核对项全符合。
- **判定方式**：PASS = 全符合且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-083 + TC-085/TC-086 为门禁）；FAIL = 切换后丢消息/串数据/页面重载清空。
- **依据锚点（三源）**：FR-AUI-02⑥；设计 §10.13 D4（切换机制：不重载、不经宿主）+ D8（A/B 切换冒烟 checklist 项）；外部契约 §11 #11（README「Webview」重载中止语义）。

### FR-AUI-03 golden fixture 回放数据源（P0（阶段①））

#### TC-085 ｜ FR-AUI-03① + FR-AUI-02①③（P0（阶段①））｜ 路线 A 切片：经真实 fetch 隧道全量回放 golden-prompt-basic（消息数/文本/帧序）｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC（期望值逐行推导见下）。
- **操作步骤**：`npm run verify:integration`（场景 SC-085：注入与通道同 TC-080(a)；提交一条 user prompt（文本 = fixture 主 prompt 哨兵原文）→ 经真实 webview 侧 fetch 实现取回 Response，解码 UIMessage 流断言）。
- **期望值推导（`test/fixtures/golden/golden-prompt-basic.jsonl` 逐行，共 31 行 = 8 行注释 + 23 条记录）**：user `message_end` ×1（文件 L20 / 记录 #12，文本 `"GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assistant + settled)"`）+ assistant `message_end` ×1（文件 L28 / 记录 #20，文本 `"ack: GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assi"`）→ **user+assistant 消息数 = 2**（澄清 #12 口径 = user+assistant 合计；system 角色回声（L17/L18，记录 #9/#10）不计入）。assistant 终稿三方内证一致：4 个 `text_delta`（记录 #15–18：`"ack: GOLDEN-PROMPT-B" + "ASIC sentinel prompt" + " (single run: echo +" + " assi"`）拼接 == `text_end` content（记录 #19）== `message_end` content（L28）。
- **期望结果**：(a) 驱动渲染的消息数 = 2（1 user + 1 assistant；路线 A 的 user 消息由 webview 侧请求自有渲染——宿主适配层不为 pi user 回声发帧（回声仅作多请求流路由），结构性无双气泡，设计 D2/D7④）；(b) assistant 文本（解码流 text part 拼接，结构化断言非视觉比对）= fixture `message_end` 权威文本；(c) 流式帧序：单 assistant 轮 = 步开始帧 → text part 开始 → 4 个 text 增量帧（序与 fixture delta 一致）→ part 结束 → 步结束 → 流结束帧（帧型族 = 官方测试床 fixtures/route.ts 帧型；阶段①无 reasoning/toolcall 帧，设计 D2）；(d) 全量回放完成（settled 对应流结束，无丢帧/截断）。
- **判定方式**：PASS = 退出码 0 且 (a)-(d) 全成立；FAIL = 消息数 ≠2 / 文本不一致 / 帧序错乱 / 丢帧。
- **依据锚点（三源）**：FR-AUI-03① + FR-AUI-02①③；设计 §10.13 D2（帧映射与「终稿==增量拼接」断言）+ D8（路线 A 判定面）+ D7④（user 回声承载）；外部契约 §11 #16（官方测试床 `src/fixtures/route.ts` 帧型、`src/fixtures/request.ts` 请求解析（取最后一条 user 消息））+ #17（`ai` `createUIMessageStream` 写入器）+ #14（AssistantChatTransport 消费协议）+ golden fixture 文件本体（`test/fixtures/golden/golden-prompt-basic.jsonl`）。
- **说明**：本 TC 同时判定 FR-AUI-02⑥「路线 A 独立完成 FR-AUI-03①」（TC-083 引用）与 FR-AUI-02③ 最小切片口径（收发一条消息 + 纯文本级渲染）。

#### TC-086 ｜ FR-AUI-03① + FR-AUI-02②③（P0（阶段①））｜ 路线 B 切片：经既有 postMessage 协议全量回放 golden-prompt-basic（store 消息状态/映射输出）｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC（推导同 TC-085：期望消息数 = 2，文本 = fixture `message_end` 权威文本）。
- **操作步骤**：`npm run verify:integration`（场景 SC-086：node 内实例化面板核心（vscode-free 形态，构造入参 = PiBridge + WebviewLike 形状，设计 D3）×golden 回放，断言两层：①宿主→面板消息通道输出事件序列（按到达序：类别/角色/文本/消息标识，id 自宿主至面板贯通）== fixture 逐行推导；②以通道输出喂入面板内消息状态镜像（webview store 消息状态），断言最终消息集合与其 ThreadMessageLike 映射输出）。
- **期望结果**：(a) 通道事件序列中 user 类消息数据恰 1 条（文本 = fixture user `message_end` 文本）+ assistant 终稿类恰 1 条（文本 = fixture assistant `message_end` 文本），消息标识贯通一致；(b) store 最终 messages 条数 = 2（1 user + 1 assistant，澄清 #12 口径；同 id 重复终稿就地覆盖不追加——幂等键语义，设计 D3）；(c) 映射输出：条数 = 2，role 与文本逐条一致（user/assistant 直映；阶段① fixture 仅含 text block，断言只覆盖 text——设计 D3 口径）；(d) 映射不做相邻 assistant 消息合并（每轮 assistant 各自成条，设计 D3；本 fixture 单轮，计数断言蕴含）。
- **判定方式**：PASS = 退出码 0 且 (a)-(d) 全成立；FAIL = 事件丢失/计数不符/文本不一致/id 断裂。
- **依据锚点（三源）**：FR-AUI-03① + FR-AUI-02②③；设计 §10.13 D3（映射纯函数/状态源/store 归约幂等/不合并）+ D8（路线 B 判定面）；外部契约 §11 #14（`@assistant-ui/react` 官方文档 external-store：「Quickstart」「Handler matrix」「Streaming responses」（原地变更 assistant 消息）「Message conversion」；`ThreadMessageLike` part 型 text/reasoning/tool-call）+ golden fixture 文件本体。
- **说明**：同 TC-085，本 TC 同时判定 FR-AUI-02⑥（路线 B 独立完成 FR-AUI-03①）与③最小切片。

#### TC-087 ｜ FR-AUI-03②（P1（阶段①））｜ golden-steer-followup 双切片全量回放：steer/followUp 消息序列完整不丢 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；GOLDEN-MIX（`test/fixtures/golden/golden-steer-followup.jsonl`）。
- **期望值推导（fixture 逐行，共 70 行 = 8 行注释 + 62 条记录）**：user `message_end` ×3（L20 主 prompt → L46 steer 回声 → L59 follow-up 回声；到达序与发送序相反：follow_up 先发后投、steer 后发先投——fixture README 录制实证）+ assistant `message_end` ×3（L41 / L54 / L67，终稿文本 `"ack: GOLDEN-STEER-FOLLOWUP main prompt (streaming run for mid-run"`、`"ack: GOLDEN-ST sentinel steer (sent later, delivered at next turn"`、`"ack: GOLDEN-FU sentinel follow-up (sent first, delivered after ag"`）交错成三轮 → **user+assistant 合计 = 6**（推导 3+3）；另含 `queue_update` 快照 4 次（L25 followUp 入队 steering=0/followUp=1 → L28 steer 入队 steering=1/followUp=1 → L44 steer 消费 steering=0/followUp=1 → L57 全部消费归零）。
- **操作步骤**：`npm run verify:integration`（SC-087a 路线 A：按录制时序发起三次请求（主 prompt → follow_up → steer），聚合断言三请求流帧与三轮 assistant 不丢；SC-087b 路线 B：单面板会话内回放全剧本，断言通道事件序列与 store 终态）。
- **期望结果**：(a) 每切片 user 类消息数据 = 3 条且文本与 fixture 回声逐条一致（发送序 F 先 S 后、回声到达序 S 先 F 后——两序均与 fixture 一致，不丢不错换）；(b) assistant 终稿 = 3 条，文本逐条一致；(c) 消息总数 = 6（推导 3+3）；(d) 队列快照事件透出且随注入/消费更新（不断言队列 UI——阶段③不做项）。
- **判定方式**：PASS = 两切片 (a)-(d) 全成立；FAIL = 任一注入消息丢失/计数 ≠6/文本不一致/错换。
- **依据锚点（三源）**：FR-AUI-03②（+FR-AUI-06④ 契合度度量输入交叉）；设计 §10.13 D2（多请求路由：prompt 文本→请求流账本、精确匹配按序消费）/D8（P1 回放断言口径）+ §1（混合注入时序）；外部契约 §11 #4/#5（rpc-commands.md L46–92 steer/follow_up 注入时机、json.md L121–122 queue_update）+ golden fixture 文件本体（含 README 乱序实证记录）。

#### TC-088 ｜ FR-AUI-03③（P0（阶段①））｜ 方法约束：golden-driver 确定性回放（无人值守/可重复/离线）｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC + GOLDEN-MIX。
- **操作步骤**：
  1. 无人值守：TC-085/TC-086/TC-087 全部场景以固定命令执行、退出码判定（无人工步骤）。
  2. 可重复：同环境连跑 ≥2 次上述场景，判定结果与关键观测（消息数/文本/帧序或事件序列）逐次一致（fixture 回放无时钟依赖、无脚本分支——fixture README 口径）。
  3. 离线：核验环境无外网（仅 npm ci 例外），回放数据源 = 仓库内静态 fixture，不接真实 pi / 真实 provider（执行期零外部请求；以断网/代理拒绝环境 + 套件通过为证据）。
- **期望结果**：(a) 无人值守退出码 0；(b) 重复执行结果一致；(c) 断网下全绿。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 需人工介入/结果漂移/依赖外网。
- **依据锚点（三源）**：FR-AUI-03③；设计 §10.13 D8（golden-driver 式确定性驱动）+ §6（golden fixture 回放层：防自建 mock 自证）；外部契约 golden fixture `test/fixtures/golden/README.md`（回放器无脚本分支、无时钟、零网络；双录一致才落盘）。
- **说明**：本 TC 为方法性判定（③），不改各切片断言本体（①②由 TC-085/TC-086/TC-087 判定）。

### FR-AUI-04 主题映射验证（--vscode-* 变量）（P0（阶段①））

#### TC-089 ｜ FR-AUI-04①②（P0（阶段①））｜ 主题审计：采样 token 链非空且终点 --vscode-* / 浅深联动差异 / WCAG 对比度 ≥4.5:1（公式脚本）｜ 自动
- **前置条件**：ENV-SETUP；主题样式资源（实验面板样式入口与 `@assistant-ui/vscode/theme.css`——FR 追溯表/构建产物定位）；VS Code 默认主题调色板 fixture（Dark Modern / Light Modern `colors` 表 `--vscode-*` 基值快照，入库 `test/fixtures/` 并注明来源 microsoft/vscode `extensions/theme-defaults/themes/*.json` + 版本——设计 §11 #18/D8）。
- **操作步骤**：`npm run verify:unit`（场景 SC-089：审计函数为纯函数 + 静态输入，核验可独立复跑）：
  - (a) 采样 token 链断言（验收标准①「计算值非空且非全透明」的静态等价判据，设计 D8）：解析 theme.css 与实验面板样式文本，采样点 token——正文/助手文本 `--foreground`·其背景 `--background`、用户气泡 `--primary`/`--primary-foreground`、输入框 `--input`/边框 `--border`（采样点与设计 D5 对齐）——定义链非空且终点为 `--vscode-*` 变量引用（无未定义/空值/全透明终点）。
  - (b) 主题联动断言（验收标准①末句）：以两套调色板 fixture 代入 token 链解析具体 RGB，浅、深两主题间**至少一组采样值不同**。
  - (c) 对比度断言（验收标准②，浅、深各测）：正文文本采样色 vs 其背景采样色（`--foreground` vs `--background`）相对亮度对比度 ≥ **4.5:1**。WCAG 相对亮度公式（脚本计算）：通道线性化 c ≤ 0.03928 → c/12.92，否则 ((c+0.055)/1.055)^2.4；L = 0.2126R′ + 0.7152G′ + 0.0722B′；对比度 = (L较亮 + 0.05)/(L较暗 + 0.05)。
- **期望结果**：(a)(b)(c) 全成立。
- **判定方式**：PASS = 场景绿且三项全成立；FAIL = token 链断裂/空值或全透明终点/两主题采样全同（联动失效）/任一主题对比度 <4.5:1（附解析链与计算值为证据）。
- **依据锚点（三源）**：FR-AUI-04①②；设计 §10.13 D5（采样点 token 对应）+ D8（主题审计选型：唯一 = 宿主侧静态解析层；调色板 fixture 口径）；外部契约 §11 #11（README「Theme」：shadcn token→`--vscode-*` 映射、`--muted`/`--secondary` color-mix 说明、surface 属性）+ #18（microsoft/vscode theme-defaults `colors` 表——审计基值来源，仅作理解，期望口径以 FR 文本为准）。
- **说明**：getComputedStyle 字面执行与真实渲染观感 = TC-090（FR ③ UI 手工 checklist，同 FR 自动兜底 = 本 TC ①② 判定，共用约定口径披露①）。

#### TC-090 ｜ FR-AUI-04③（P0（阶段①））｜ 主题观感：浅/深主题截图人工核对无样式丢失 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-089）
- **操作步骤**（手工 checklist 项）：真机实验面板完成一次回放渲染（含用户消息与助手回复）；在 VS Code Color Theme 分别切换浅色（Light Modern）与深色（Dark Modern）两档：各截一张面板截图，人工核对无样式丢失——元素错位 / 背景缺失 / 文本不可见任一出现即 FAIL；可顺带记录 getComputedStyle 采样值（FR ① 字面口径的观察证据，不作门禁）。证据存 `evidence/TC-090/`（证据类型：截图 ×2（浅/深各一，注明主题名）+（如有）采样值记录）。
- **期望结果**：两档均无样式丢失。
- **判定方式**：PASS = 2/2 无样式丢失且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-089 为门禁）；FAIL = 任一档出现错位/背景缺失/文本不可见。
- **依据锚点（三源）**：FR-AUI-04③；设计 §10.13 D8（主题截图 checklist 项）；外部契约 §11 #11（README「Theme」：webview 随用户切换 colour theme 重新配色）+ #13（指南「Follow the VS Code theme」）。

### FR-AUI-05 风险门禁判定证据（P0（阶段①））

#### TC-091 ｜ FR-AUI-05①（P0（阶段①））｜ 依赖精确版本锁定（零 ^/~/>= 前缀，JSON 解析断言）｜ 自动
- **前置条件**：ENV-SETUP；基线提交（确定新增依赖集：被测 package.json 与基线的依赖差集）。
- **操作步骤**：node JSON 解析断言（套件场景 SC-091 或 §0.5 临时脚本）：
  1. 设计 D6 冻结清单 9 项全部存在且版本精确（匹配 `^\d+\.\d+\.\d+$`，无 `^`/`~`/`>=` 等任何前缀）：dependencies `@assistant-ui/vscode` 0.0.1、`@assistant-ui/react` 0.15.37、`@assistant-ui/ai-sdk` 0.0.19、`ai` 7.0.153、`react` 19.3.1、`react-dom` 19.3.1、`zod` 4.6.7；devDependencies `@types/react` 19.3.0、`@types/react-dom` 19.3.0。
  2. FR 口径扫描：新增依赖集（基线差集）内 `@assistant-ui/*` 作用域与 react/react-dom 一律精确版本；清单外新增依赖亦不得带范围前缀（设计 D6「全部零前缀」）。
- **期望结果**：(1)(2) 全部成立（附解析输出）。
- **判定方式**：PASS = 全成立；FAIL = 任一依赖缺失/带前缀/版本与冻结清单不符。
- **依据锚点（三源）**：FR-AUI-05①（前半）；设计 §10.13 D6（锁定清单与 2026-11-21 registry 核实记录）；外部契约 §11 #11（`@assistant-ui/vscode` 0.0.1）+ #14（`@assistant-ui/react` 0.15.37 及 peer）+ #17（`ai` 7.0.153 peer 链）+ #15（react 19.3.1 / 18-19 线 peer 依据）。
- **说明**：①后半「0.0.x 升级风险评估留痕于对比报告」由 TC-096(d) 判定（交叉）。

#### TC-092 ｜ FR-AUI-05②（P0（阶段①））｜ CSP 指令集断言（strict 基线、script-src 仅 nonce、无 unsafe-eval/inline、零新增指令）+ 回放运行时证据 + zod jitless 前置 ｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表（定位实验面板 HTML 生成入口）。
- **操作步骤**：`npm run verify:unit`（场景 SC-092：以 stub webview（`{cspSource, asWebviewUri}` 形状）真实调用官方 HTML 生成入口，解析 `<meta http-equiv="Content-Security-Policy">` 断言）：
  - (a) 指令集 = 官方 strict 模板逐指令：`default-src 'none'`；`script-src 'nonce-…'`（仅 nonce，**无 `'unsafe-eval'`/`'unsafe-inline'`**）；`style-src <cspSource> 'nonce-…'`；`img-src <cspSource> blob: data:`；`media-src <cspSource> blob: data:`；`font-src <cspSource> data:`；`connect-src <cspSource>`；`frame-src 'none'`——且无模板外指令/来源（FR ②「新增指令须逐一登记于设计基线并保持最小化」：设计 D5 已裁决零新增——fetch 隧道走 postMessage 不经网络；产物 CSP ⊆ 模板即「未新增」判定）。
  - (b) 与默认面板 CSP 的差异逐一登记且方向为收紧/等强（登记核对：设计 §10.13 D5 差异清单——style-src `'unsafe-inline'`→nonce、显式 media-src/font-src/connect-src(=cspSource)/frame-src `'none'`、img-src 去 `https:`；核验比对产物 CSP 与登记一致；若观察到 relaxed 回退产物（style-src 含 `'unsafe-inline'`），须比对对比报告登记，未登记即 FAIL——设计 D5 唯一预登记回退）。
  - (c) 运行时证据（无头层）：两条切片在该 CSP 基线产物下完成 FR-AUI-03 回放（TC-085/TC-086/TC-087 PASS 即证 zod 校验路径无 eval 运行时异常；无头 node 无 CSP，证 jitless 模式不抛错——设计 D6 三件套③分层）。
  - (d) zod jitless 前置（官方指南「先于一切导入」要求；设计 D6 三件套①）：实验面板 webview 产物中 jitless 配置（`config({jitless:true})` 语义）先于任何 zod schema 构建出现（产物文本顺序断言，不与源文件命名耦合）。
- **期望结果**：(a)-(d) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = script-src 含 unsafe-eval/unsafe-inline、模板外指令、未登记差异/回退、回放异常或 jitless 前置缺失（附解析出的 CSP 全文为证据）。
- **依据锚点（三源）**：FR-AUI-05②；设计 §10.13 D5（CSP 基线与登记、唯一预登记回退）+ D6（三件套）；外部契约 §11 #11（README「Webview HTML and Content Security Policy」：strict 模板全文、`'unsafe-eval'` is never added、relaxed 选项）+ #13（指南「Content Security Policy」：**"The bridge needs no connect-src entry, because it does not use the network"**、zod-jitless 片段）+ #12（tarball `src/host/html.ts`：`createWebviewCsp` 指令集逐字、`renderWebviewHtml` 选项）。
- **说明**：真实 CSP 下回放 + devtools 零 violation 的真机层 = TC-093（MANUAL）。

#### TC-093 ｜ FR-AUI-05②（P0（阶段①））｜ 真机层：真实 CSP 下完成回放且 devtools 零 CSP violation ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-092）
- **操作步骤**（手工 checklist 项）：真机实验面板（产物 CSP 即 TC-092(a) 断言的 strict 基线）完成一次 FR-AUI-03 回放（两切片任一或各一）；打开 Webview Developer Tools 核对控制台**零 CSP violation**（含 zod `new Function` 探测类 violation——指南明示 strict CSP 会报告此类 violation 除非 jitless 前置生效）。证据存 `evidence/TC-093/`（证据类型：控制台输出记录（零 violation）+ 回放完成截图）。
- **期望结果**：回放完成且控制台零 violation。
- **判定方式**：PASS = 成立且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-092 + TC-085/TC-086 为门禁）；FAIL = 出现 CSP violation 或回放因 CSP 报错中断。
- **依据锚点（三源）**：FR-AUI-05②；设计 §10.13 D6（三件套③运行时分层：真机层）+ D8（checklist 项）；外部契约 §11 #13（指南「Content Security Policy」：zod 首个 object schema 探测 `new Function`、strict policy 报告为 violation、jitless 前置消除）。

#### TC-094 ｜ FR-AUI-05③（P0（阶段①））｜ bundle 体积预算（字节级）：webview JS ≤3,145,728 / 宿主增量 ≤1,048,576 / Shiki 不进产物 / 默认面板依赖图无 React·assistant-ui ｜ 自动
- **前置条件**：ENV-SETUP；基线提交 = **v0.1.6 发版标签（tag `v0.1.6`，commit `e9fc9d8`）**（总调度审批点 2 裁决钉死，§3 第 12 条：阶段①下一版为 0.1.7，相对最后发版的增量才是发版将携带的真实增量，且标签是唯一不可变锚点）；两份构建产物（基线构建 = `v0.1.6` tag 检出构建 + 被测构建，同构建命令产出）。
- **操作步骤**（字节级断言，`fs.stat`/metafile 口径，设计 D6）：
  - (a) 实验面板 webview JS 产物合计（入口 + 全部代码分割 chunk + 打包入 bundle 的依赖运行时；**不含** source map（.map）与 .css）≤ **3,145,728 字节**（推导：3 MiB = 3 × 1,048,576；定值理由见 FR 文本——现状零依赖 webview bundle 586,752 字节（v0.1.6 实测）、React + assistant-ui + zod 预计 1.5–2 MiB 量级、Shiki 全量 ≈15 MiB 自然违规）。
  - (b) 宿主 bundle 增量 = 被测构建宿主产物字节 − 基线构建（`v0.1.6` tag 检出）宿主产物字节 ≤ **1,048,576 字节**（1 MiB；基线锚点 = 前置条件钉死的 `v0.1.6` tag，不得替换为其他提交）。
  - (c) Shiki 约束：`shiki`/`@shikijs/*` 不得出现在实验面板产物依赖图（metafile inputs 断言）；若实现引入则必须限语言集或代码分割并计入 (a) 同一预算（全量 ≈15 MiB 必然超限，(a) 即兜底判据）。
  - (d) 默认面板依赖图：单独构建默认 webview 入口（metafile inputs）不含 `react`/`react-dom`/`@assistant-ui/**`（独立构建入口断言，与 TC-078 步骤 1(d) 交叉）。
- **期望结果**：(a)-(d) 全部成立（附字节清单/依赖图清单输出）。
- **判定方式**：PASS = 全成立；FAIL = 超预算或依赖图命中。宿主超限的处置依设计 D9（预登记回退 minify 后重测；再超如实上报）——本 TC 判据不因回退放宽（回退后仍须 ≤1,048,576 方 PASS；不静默改口径）。
- **依据锚点（三源）**：FR-AUI-05③；设计 §10.13 D6（预算核算口径/预估/回退）+ D9（门禁处置）；外部契约 §11 #13（指南「Bundle both sides」：`process.env.NODE_ENV` define、Shiki 单 bundle 携带全部语法 ≈15 MB 与限语言集/代码分割对策）。

#### TC-095 ｜ FR-AUI-05④（P0（阶段①））｜ 行为层：回放后隐藏再显示面板，已渲染消息 DOM 仍存在 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 = TC-077(d) 注册断言）
- **操作步骤**（手工 checklist 项）：真机实验面板完成一次 FR-AUI-03① 回放渲染 → 隐藏面板（切换到其他视图/收起容器）再显示：核对已渲染消息 DOM 仍存在（不重建、不丢失——消息仍可见、无整页重载痕迹）。证据存 `evidence/TC-095/`（证据类型：隐藏前/显示后截图 ×2 + devtools DOM 快照或 Elements 截图）。
- **期望结果**：显示后已渲染消息仍在（DOM 保留）。
- **判定方式**：PASS = 成立且证据齐全；MANUAL 遗留不计 FAIL（对应 FR 以 TC-077(d) 注册结构断言为门禁——FR-AUI-05④「如设计裁决取其他值须在对比报告记录理由」：若注册值非 true，须比对对比报告登记理由，未登记即由 TC-077(d) FAIL）；FAIL = 消息丢失/面板重建。
- **依据锚点（三源）**：FR-AUI-05④；设计 §10.13 D1（显式声明同默认面板）+ D8（行为层 MANUAL + 注册断言兜底）；外部契约 §11 #13（指南「Hidden views」：VS Code 隐藏视图销毁 webview 页面、`retainContextWhenHidden: true` 保活——行为期望的官方依据）。

### FR-AUI-06 双切片对比报告（阶段①交付物）（P0（阶段①））

#### TC-096 ｜ FR-AUI-06①②③（P0（阶段①））｜ 对比报告交付与规格：四维各成节、量化维度附命令+输出、时延 ≥5 次取中位、侵入面三组归类、结论中立、升级评估留痕 ｜ 自动
- **前置条件**：ENV-SETUP；交付的技术设计文档（承载位置 = 设计 §10.13 交付小节「阶段①双切片对比报告」——设计 D7 裁决：研发可写清单内唯一正式载体，不另开新文件）。
- **操作步骤**（结构化断言，解析报告小节；扫描面限该小节——规范 §5.2 扫描纪律）：
  - (a) 四维各成节：① bundle 体积（两切片产物字节级数据，逐切片度量）；② 首帧/首条消息渲染时延（golden 回放口径，**≥5 次取中位数**，双切片各 T1/T2 数值；T1/T2 口径 = 设计 D7② 通道里程碑，见共用口径披露②）；③ 代码侵入面（`git diff --stat v0.1.6..HEAD`——基线一律 = `v0.1.6` 发版标签（tag `v0.1.6`，commit `e9fc9d8`；审批点 2 裁决，§3 第 12 条）；按三组归类：默认面板冻结文件（**须为空**）/共享文件增量/新增文件，含规模统计；**三组归类不含 `docs/**`**——technical-design.md 追溯表/对比报告等 docs 变更属文档留痕，另列第四组「文档留痕（信息组，不计侵入面）」呈现）；④ PiBridge 事件契合度（定性，须覆盖：流式 delta、user 回声（FR-CHAT-11 语义在各自路线的承载方式）、steer/followUp、abort 四主题逐路线填写）。
  - (b) 证据即事实：每个量化维度（①②③）附可复现的测量命令/脚本与输出（每维 ≥1 命令块 + ≥1 输出证据）。
  - (c) 结论中立：报告仅呈现对比数据与观察；扫描报告小节零「预设路线选择」类决定性表述（如「选定/决定采用/切换至路线 X」类句式零命中）；报告含路线选择归属声明（= 总调度阶段①出口裁决，按任务书 §2 向人类通报）。
  - (d) 升级策略留痕（FR-AUI-05①后半 + 设计 D6）：报告含 `@assistant-ui/vscode` 0.0.x 升级风险评估节（0.0.x 无 semver 兼容承诺、breaking 面、升级与退出流程）。
- **期望结果**：(a)-(d) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 缺维/缺证据/时延样本 <5 次/侵入面缺默认面板冻结文件（须为空）核对/预设路线立场/无升级评估（附报告小节解析输出）。
- **依据锚点（三源）**：FR-AUI-06①②③；设计 §10.13 D7（度量方法、报告承载与结构、≥5 次中位、三组归类）+ D9（门禁处置：如实记录失败即有效产出、允许证伪）；外部契约 §11 #16（官方测试床 probes 模式——度量方法参照）+ golden fixture（时延度量数据源：TC-085/TC-087 回放剧本）。
- **说明**：(c) 措辞中性的语义复核并入核验报告观察项（结构扫描为自动判定面）。

### FR-AUI 切换批次共用约定（TASK-009 切换批次，TC-098~TC-137 共用）

（v0.7 新增章节，TASK-009 切换批次；对应需求基线 v0.7 §4 判定载体注记 + §4.6 FR-AUI-02/03/04/05/07/08（FR-AUI-01/06 使命结束，历史条款不再产生新判定项）+ §5 切换批次不做项 + §8 第 7 条切换批次出口门禁 + 澄清 #5/#12/#16/#17/#18/#19；设计依据 = 冻结快照 `fab4190`（TASK-009 切换批次审批点 1b 通过时冻结）的 §10.14（D1–D10）+ §6 新 UI 消费端契约行 + §11 #19–#23。）

**观察契约（TC-098~TC-137 共用，判定面依设计 §10.14 D8）**：

- **消费端契约判定面（#D-06 制度化，硬约束）**：切换批次全部「渲染可见」判定一律以**真实 `@assistant-ui/react` ExternalStoreRuntime + 组件消费**后的 **DOM 断言**为准——链路 = golden/mock 回放（fake-pi 子进程注入）→ RpcClient → PiBridge → 宿主 postMessage 泵 → webview store → 真实 `AssistantRuntimeProvider` + `useExternalStoreRuntime` + 组件渲染 → DOM 断言（jsdom 31 + @testing-library/react 16，文件级 `// @vitest-environment jsdom` 注解，范围限新 UI 相关测试文件，设计 D8 有意偏离「无 DOM 纪律」先例之已批准项）。**禁 store 层驱动绕开**：不得以 store 状态断言、自建解码器、或直接调用映射函数的输出作为等价/回放判定的门禁面（#D-06 根因 = 断言面与真实消费面分歧无从暴露）——store/映射层断言仅作辅助证据，门禁面必须是真实 runtime 消费后的 DOM。
- **消费端锚点（#D-06 期望源，行号锚定）**：`@assistant-ui/core@0.3.37` 随包源码 `node_modules/@assistant-ui/core/dist/runtime/utils/thread-message-like.js`（§11 #21）——L47 `if (role !== "assistant" && status) throw new Error("status is only supported for assistant messages")`（user 带 status 即抛）；L57 assistant 空/纯空白 text part 丢弃（`return null`，L105 filter 后不建 part）、L62 reasoning 空文本且无 summary 丢弃；L76–95 tool-call part 保真（`result`/`isError` 随 basePart 透传、`argsText` 保留、args = `parsePartialJsonObject(argsText)`、toolCallId 缺省 `tool-<generated>`）；L112 `custom: metadata?.custom ?? {}`（metadata.custom 透传）；L131–134 user 带 tool-call/reasoning part 即抛 `Unsupported user message part type`；L169 未知 role 抛 `Unknown message role`；L31 createdAt 缺省 `new Date()`。**期望的转换行为（保真/丢弃/throw）只来自该源码语义 + golden fixture，不以我方映射实现或我方 mock 为期望源**（规范第一部分 §5 第 6 条）。
- **回放注入点（FR-AUI-02③ 防自证，沿用阶段①口径）**：注入位 = 宿主侧 PiBridge 适配层之下（fake-pi 子进程 `FAKE_PI_REPLAY` 既有注入位）；回放数据须穿越「子进程 JSONL → RPC 帧解析 → PiBridge 事件翻译 → postMessage 泵 → store → 真实 runtime 消费渲染」全链路；测试不直接向 webview DOM/store 写渲染结果。
- **等价判定口径（FR-AUI-08③）**：既有验收标准语义与文本不变、判定载体平移（§4 判定载体注记）——判定方式 = 既有验证套件面重指向新 UI（既有 SC 场景在默认面板载体执行）+ golden 回放端到端（TC-102/TC-103）+ 双面板一致快照（TC-112）兜底；既有 TC-001~TC-076 验收语义继续有效，其新 UI 载体判定由本节等价域 TC 承载。NFR TC（TC-036~TC-044）场景经默认面板执行即自动落在新 UI 载体，不另立等价 TC。
- **MANUAL 判定四值与自动兜底映射**：TC-108（FR-AUI-05②④ 真机层）、TC-111（FR-AUI-07③ 切换冒烟）、TC-114（FR-AUI-04③ 主题截图）、TC-125（FR-CHAT-10/09/06 真机观感与 Composer 交互）按核验判定四值记 **MANUAL**（遗留不计 FAIL，对应 FR 以自动兜底 TC 为门禁）；兜底映射：TC-108 → TC-106 + 本 TC 自动注册断言、TC-111 → TC-109/TC-110/TC-112、TC-114 → TC-113、TC-125 → TC-124/TC-123/TC-120/TC-129；全部真机项可在一次真机会话内执行（设计 D8 汇总口径）。
- **口径披露（用例侧，非歧义）**：① FR-AUI-05③ 宿主增量基线 = FR 文本「v0.1.7 构建产物 dist/extension.js（实测 459,382 字节）」——执行口径缺省 = tag `v0.1.7` 检出同命令构建产物为基线（与 §3 第 12 条 v0.1.6 裁决同构：以发版标签构建产物为锚），实测值作校验参考（见 §3 第 13 条上报）；② FR-AUI-07②「Lab」字样清零扫描 = 词界匹配 `(?<![A-Za-z])Lab(?![A-Za-z])` + 「实验」字面子串匹配，扫描面限 package.json `contributes` 结构化字符串字段（定义源/文档排除，哨兵纪律）——防 `label`/`Label` 词内误命中；③ FR-CHAT-10 五子条自动面分工：①② CSS 钉值断言（样式文本/构建产物解析）、③④⑤ jsdom 结构断言（#19(a) 全维持口径），观感归 TC-125 MANUAL；④ 消息数口径 = 澄清 #12（user+assistant 合计），golden 期望值逐行推导（TC-102：2 = 1+1；TC-103：6 = 3+3）。

### FR-AUI-02 路线 B 单实现（修订，切换批次）（P0（切换批次））

#### TC-098 ｜ FR-AUI-02①（P0（切换批次））｜ 路线 A 淘汰 + 路线 B 单实现（依赖/构建/代码面移除断言 + postMessage 协议承载保留）｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表（定位新 UI 实现位置与构建配置）。
- **操作步骤**：`npm run verify:unit`（场景 SC-098；套件未覆盖时按 §0.5 以临时脚本执行同一断言）：
  - (a) 路线 A 依赖消失：package.json JSON 解析断言 dependencies/devDependencies 无 `@assistant-ui/ai-sdk`、无 `ai`（#D-06 裁决随批次移除路线 A 专属消费者）；`@assistant-ui/react`/`@assistant-ui/vscode`/`react`/`react-dom` 保留（版本面归 TC-105）。
  - (b) 路线 A 切片与对照组移除（设计 D1/D10 移除清单，FR 追溯表定位路径断言）：fetch-bridge 宿主路由、双切片开关、度量入口、路线 A 测试载体全部不存在；构建入口集 = 宿主 + 新默认 webview（`media/chat.js`）+ 经典 webview（`media/main.js`）三项，无第四入口。
  - (c) 路线 B 承载保留：webview↔宿主 postMessage 协议全集处理保留——回放驱动下通道透出 ready 回放 superset 事件类别（config / model_info / usage_info / run_state / history_loaded，设计 D1）各 ≥1 次到达面板侧（通道观测断言）。
  - (d) 既有套件回归：`npm run verify:unit && npm run verify:integration` 全绿（已删除的路线 A 测试载体除外）。
- **期望结果**：(a)-(d) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 任一依赖/切片残留、协议事件缺失或套件红（附 package.json 解析输出/路径清单/通道观测为证据）。
- **依据锚点（三源）**：FR-AUI-02①（#D-06 裁决：路线 A 真机无法回复消息、随批次移除并关闭、不再修复）；设计 §10.14 D1（移除清单与构建入口收敛）+ D7（依赖变更）+ D10（冻结面）；外部契约 §11 #14（`@assistant-ui/react@0.15.37` ExternalStoreRuntime 消费契约面）。
- **说明**：#D-06（路线 A 消费端契约盲区）随路线 A 移除关闭；v0.6 路线 A 判定项（TC-080(a)/TC-085/TC-087 路线 A 面等）自本批次起判「已移除/不适用」（历史条款），不复执行。

#### TC-099 ｜ FR-AUI-02② + FR-AUI-08②（P0（切换批次））｜ part 化映射消费端契约（真实 runtime 消费下三类 part 保真 + 转换契约陷阱顺从）｜ 自动（#D-06 制度化核心）
- **前置条件**：ENV-SETUP；构造型回放剧本（MOCK-THINK + MOCK-TOOLS(-FAIL) 组合 + 空文本块/aborted/errorMessage 注入变体，事件形状对照 json.md「Event sequence」L30–46 转印）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-099：剧本经真实链路渲染，消费端 DOM 断言 (a)-(f)）：
  - (a) text part → Markdown 文本渲染，文本逐字 == 注入文本（结构化断言）；
  - (b) thinking → reasoning 折叠块存在（默认折叠；展开/流式全语义归 TC-117）；
  - (c) toolcall → 工具卡全要素经 tool-call part 透传（消费锚点 L76–95）：工具名、参数摘要（argsText/args 解析）、result（status/summary/output/outputTruncated）、失败态 isError（status="error"）各渲染值 == 剧本注入值（DOM 断言）；
  - (d) 空文本块不建 part（L57 丢弃语义顺从）：空块注入不产生空白气泡/空段落，消息条目数不因空块增加；
  - (e) status 不注入（L47 throw 语义规避）：全程无转换异常（无 `status is only supported for assistant messages` 类 throw），消息渲染完整；
  - (f) metadata.custom 透传（L112）：`aborted` → 消息尾部「已中止」消息级标记渲染、`errorMessage` → 消息级「⚠ …」提示渲染（DOM 断言）；映射全程无 `Unsupported user message part type`（L131–134）/ `Unknown message role`（L169）类 throw。
- **期望结果**：(a)-(f) 全部成立。
- **判定方式**：PASS = 场景绿且 (a)-(f) 全成立；FAIL = 任一要素缺失/错值/转换异常（附 DOM 快照与异常栈为证据）。
- **依据锚点（三源）**：FR-AUI-02② + FR-AUI-08②；设计 §10.14 D2（映射扩容表）+ D5（aborted/errorMessage）+ D8（消费端契约验证面）；外部契约 §11 #21（`thread-message-like.js` L47/L57/L62/L76–95/L112/L131–134/L169 throw/丢弃/保真语义）+ #14（part 型 text/reasoning/tool-call）+ #1（json.md 事件形状）。
- **说明**：判定约束 = 共用约定「禁 store 层驱动绕开」；store/映射函数输出断言仅作辅助证据。

#### TC-100 ｜ FR-AUI-02③（P0（切换批次））｜ 回放传输真实性（防自证）：注入点低于 PiBridge、数据经 postMessage 全链达消费端 DOM ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-100：golden 回放注入 = fake-pi 子进程（`FAKE_PI_REPLAY`）；观测面 = 宿主→面板通道输出 + 消费端 DOM）：
  - (a) 通道事件序列完整（含 user/assistant 消息数据，按到达序非空）；
  - (b) 消费端 DOM 渲染 == fixture 逐行推导（断言面同 TC-102）；
  - (c) 防自证结构约束：注入点位于 PiBridge 之下，渲染结果不经任何直写路径（测试不触 store dispatch/组件 props/innerHTML 系 API；核验剧本按 FR 追溯表确认注入位落位与观测面）。
- **期望结果**：(a)-(c) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 事件缺失/渲染与 fixture 不符/存在直写渲染路径（附通道观测与注入点定位为证据）。
- **依据锚点（三源）**：FR-AUI-02③；设计 §10.14 D8（注入点 = PiBridge 之下 fake-pi 子进程、真实 runtime 消费断言）；外部契约 §11 #1（json.md「Event sequence」L30–46）+ golden fixture 本体。

#### TC-101 ｜ FR-AUI-02④（P0（切换批次），NFR-03 交叉）｜ XSS 探针真实渲染 DOM 断言（UI-XSS 回放：无新增 script / 哨兵无副作用 / raw HTML 不解析）｜ 自动
- **前置条件**：ENV-SETUP；UI-XSS 剧本（§0.3 v0.7 注：原 LAB-XSS 改名，设计 D10，语义不变）：user 回声与 assistant 回复均含探针 `<script>window.__XSS_PROBE=1</script>` 与 `<img src=x onerror="window.__XSS_PROBE=2">`；预埋哨兵（面板加载时预置全局哨兵变量，值固定，执行时核对）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-101：UI-XSS 经真实链路渲染，消费端 DOM 断言）：
  - (a) DOM 无新增 `script` 元素、无带 `on*` 事件属性的注入元素（探针以文本节点形态存在，文本逐字 == 探针原文）；
  - (b) 预埋哨兵值未被改写、无探针副作用（探针脚本未执行——`window.__XSS_PROBE` 为 undefined 类等价断言）；
  - (c) raw HTML 不解析（react-markdown 10.1.0 无 rehype-raw 通道，§11 #20）：`<img …>` 不生成 img 元素（以文本/转义形态呈现）；
  - (d) 危险协议过滤：`[x](javascript:…)` 渲染后 href 无 `javascript:` 协议（默认 urlTransform）；渲染出的 `a[href]` 含 `rel="noopener noreferrer"`（设计 D2）。
- **期望结果**：(a)-(d) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 任一探针残留可执行注入/哨兵被改写/raw HTML 被解析（附 DOM 快照为证据）。
- **依据锚点（三源）**：FR-AUI-02④（+NFR-03 交叉；「DOM 无新增 script/哨兵无副作用」自本批次由 MANUAL 升格自动判定——设计 D2）；设计 §10.14 D2（XSS 口径：react-markdown 构造性转义 + urlTransform + DOMPurify 唯一 sink）；外部契约 §11 #20（react-markdown 不解析 raw HTML、默认 urlTransform 过滤危险协议）+ #15（React「JSX Prevents Injection Attacks」构造性转义）+ #1（json.md 事件形状）。
- **说明**：唯一受控 HTML sink（SyntaxHighlighter 输出经 DOMPurify.sanitize 后入 DOM）由 (a)(b) 覆盖断言 + 源码禁令扫描（`webview/ui` 源码 innerHTML 系 API 仅该 sink 白名单，扫描面按 FR 追溯表定位）辅助；真机 devtools 层归 TC-108 MANUAL。

### FR-AUI-03 golden fixture 回放数据源（修订，切换批次）（P0（切换批次））

#### TC-102 ｜ FR-AUI-03①（P0（切换批次））｜ golden-prompt-basic 端到端全量回放：真实 runtime DOM 断言（消息数 = 2 逐行推导 / 文本逐字 / user 单条三时点）｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC（`test/fixtures/golden/golden-prompt-basic.jsonl`，期望源 = fixture 本体）。
- **期望值推导（fixture 逐行，共 31 行 = 8 行注释 + 23 条记录）**：user `message_end` ×1（L20/记录 #12，文本 `"GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assistant + settled)"`）+ assistant `message_end` ×1（L28/记录 #20，文本 `"ack: GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assi"`）→ **渲染消息数 = 2（1 user + 1 assistant，澄清 #12 口径；system 回声 L17/L18 不计入）**；assistant 终稿三方内证一致：4 个 `text_delta`（L23–26：`"ack: GOLDEN-PROMPT-B"+"ASIC sentinel prompt"+" (single run: echo +"+" assi"`）拼接 == `text_end` content（L27）== `message_end` content（L28）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-102：注入与链路同 TC-100；发送一条 user prompt（文本 = fixture 主 prompt 哨兵原文）→ 全量回放至 settled → 消费端 DOM 断言）。
- **期望结果**：(a) 渲染消息条数 = 2（DOM 计数）；(b) assistant 消息文本逐字 == fixture `message_end` 权威文本（结构化断言，非视觉比对）；(c) user 气泡条目数 = 1 且文本 == fixture user 文本，在三个判定时点（发送后即时 / user 回声后 / 本轮终稿后）各采样一次均为 1（FR-CHAT-11① 联动）；(d) 全量回放完成（settled 后无丢帧/截断，文本完整）。
- **判定方式**：PASS = 退出码 0 且 (a)-(d) 全成立；FAIL = 条数 ≠2 / 文本不一致 / 任一时点 user 计数 ≠1 / 丢帧截断。
- **依据锚点（三源）**：FR-AUI-03① + FR-AUI-08③（golden 回放兜底层）；设计 §10.14 D5（三时点判定）+ D8（端到端 golden 链路）；外部契约 §11 #21（消费端转换语义）+ #1（json.md L30–46 user 回声序列）+ golden fixture 本体（逐行推导如上）。

#### TC-103 ｜ FR-AUI-03②（P1（切换批次））｜ golden-steer-followup 全量回放：steer/followUp 插话序列完整不丢不错换 ｜ 自动（P1 尽力）
- **前置条件**：ENV-SETUP；GOLDEN-MIX（`test/fixtures/golden/golden-steer-followup.jsonl`）。
- **期望值推导（fixture 逐行，共 70 行 = 8 行注释 + 62 条记录）**：user `message_end` ×3（L20 主 prompt → L46 steer 回声 → L59 follow-up 回声）+ assistant `message_end` ×3（L41/L54/L67）→ **消息数 = 6（3 user + 3 assistant，澄清 #12 口径）**；发送序 = prompt（L13）→ follow_up（L24）→ steer（L27），投递回声序 = 主 prompt → steer → follow-up（乱序实证，fixture README）；`queue_update` ×4（L25/L28/L44/L57）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-103：按录制时序驱动三命令（prompt → follow_up → steer），消费端 DOM 断言）。
- **期望结果**：(a) user 条目 = 3、文本逐条 == fixture 回声文本（发送序 F 先 S 后、投递序 S 先 F 后，两序均不丢不错换）；(b) assistant 条目 = 3、文本逐条一致；(c) 总数 = 6；(d) 队列快照事件经通道透出且随注入/消费更新（数据面不丢；队列 UI 断言归 TC-120）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 任一注入消息丢失/计数 ≠6/文本不一致/错换。
- **依据锚点（三源）**：FR-AUI-03②（P1 尽力）；设计 §10.14 D8；外部契约 §11 #4/#5（rpc-commands.md L46–92 steer/follow_up 注入时机）+ #8（json.md L121–122 queue_update 快照）+ golden fixture 本体（含 README 乱序实证）。

#### TC-104 ｜ FR-AUI-03③（P0（切换批次））｜ 方法约束：golden-driver 确定性回放（无人值守/可重复/离线）｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC + GOLDEN-MIX。
- **操作步骤**：① 无人值守：TC-102/TC-103 场景以固定命令执行、退出码判定（无人工步骤）；② 可重复：同环境连跑 ≥2 次，判定结果与关键观测（消息数/文本/序列）逐次一致；③ 离线：断网/代理拒绝环境下全绿（数据源 = 仓库内静态 fixture，不接真实 pi / 真实 provider）。
- **期望结果**：(a) 无人值守退出码 0；(b) 重复结果一致；(c) 断网全绿。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 需人工介入/结果漂移/依赖外网。
- **依据锚点（三源）**：FR-AUI-03③；设计 §10.14 D8 + §6（golden fixture 回放层）；外部契约 golden fixture `test/fixtures/golden/README.md`（无脚本分支/无时钟/零网络/双录一致才落盘）。

### FR-AUI-05 风险门禁判定证据（修订，切换批次）（P0（切换批次））

#### TC-105 ｜ FR-AUI-05①（P0（切换批次））｜ 依赖精确版本锁定（修订清单）+ 0.0.x 升级风险评估留痕 ｜ 自动
- **前置条件**：ENV-SETUP；基线提交（确定依赖差集）。
- **操作步骤**：node JSON 解析断言（套件场景 SC-105 或 §0.5 临时脚本）：
  1. 锁定清单（设计 D7）逐项存在且版本精确（匹配 `^\d+\.\d+\.\d+$`，无 `^`/`~`/`>=` 前缀）：dependencies `react` 19.3.1、`react-dom` 19.3.1、`@assistant-ui/react` 0.15.37、`@assistant-ui/vscode` 0.0.1、`@assistant-ui/react-markdown` 0.14.26、`remark-gfm` 4.0.1、`remark-breaks` 4.0.0、`zod` 4.6.7；devDependencies `@testing-library/react` 16.3.3、`@testing-library/dom` 10.4.2、`jsdom` 31.0.1。
  2. 删除断言：package.json 无 `@assistant-ui/ai-sdk`、无 `ai`（与 TC-098(a) 交叉）。
  3. FR 口径扫描：`@assistant-ui/*` 作用域与 react/react-dom 一律精确版本；清单外新增依赖亦零范围前缀。
  4. 升级评估留痕（FR-AUI-05① 后半）：交付物（FR 追溯表 / 设计偏差清单）含 `@assistant-ui/vscode` 0.0.x 升级风险评估（0.0.x 无 semver 兼容承诺、breaking 面、升级与退出流程）——结构化断言（节存在 + 三要点齐）。
- **期望结果**：(1)-(4) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 任一依赖缺失/带前缀/清单不符/删除项残留/评估缺失（附解析输出）。
- **依据锚点（三源）**：FR-AUI-05①；设计 §10.14 D7（锁定清单与 2026-11-22 核值）；外部契约 §11 #14/#15（react 19.3.1 与 peer）+ #19（react-markdown 0.14.26）+ #20（remark-gfm 4.0.1/remark-breaks 4.0.0）。

#### TC-106 ｜ FR-AUI-05②（P0（切换批次））｜ CSP 指令集断言（默认面板 strict 基线、script-src 仅 nonce）+ 回放运行时证据 + zod jitless 前置 ｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表（定位默认面板 HTML 生成入口）。
- **操作步骤**：`npm run verify:unit`（场景 SC-106：以 stub webview（`{cspSource, asWebviewUri}` 形状）真实调用 HTML 生成入口，解析 CSP meta 断言）：
  - (a) 指令集 = 官方 strict 模板逐指令（`default-src 'none'`；`script-src` 仅 nonce，无 `'unsafe-eval'`/`'unsafe-inline'`；`style-src` cspSource+nonce；`img-src` cspSource blob: data:；`media-src`/`font-src`/`connect-src`(=cspSource)/`frame-src 'none'` 族），无模板外指令（FR ②「新增指令须逐一登记并保持最小化」：设计 D7 零新增口径——产物 CSP ⊆ 模板即「未新增」判定）；
  - (b) 回放运行时证据：TC-102/TC-103 在该 CSP 基线下 PASS（zod 校验路径无 eval 运行时异常）；
  - (c) zod jitless 前置：默认面板 webview 产物中 jitless 配置（`config({jitless:true})` 语义）先于任何 zod schema 构建出现（产物文本顺序断言，不与源文件命名耦合）。
- **期望结果**：(a)-(c) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = unsafe-eval/unsafe-inline 命中、模板外指令、回放异常、jitless 前置缺失（附解析出的 CSP 全文为证据）。
- **依据锚点（三源）**：FR-AUI-05②；设计 §10.14 D2（zod-jitless 三件套平移）+ D7；外部契约 §11 #11（README「Webview HTML and Content Security Policy」：strict 模板、`'unsafe-eval'` is never added）+ #12（tarball `src/host/html.ts` createWebviewCsp 指令集）+ #13（指南 zod-jitless 片段与 CSP 节）。
- **说明**：真机 devtools 零 CSP violation 层 = TC-108 MANUAL。

#### TC-107 ｜ FR-AUI-05③（P0（切换批次））｜ bundle 预算 v0.7 口径：默认面板 JS ≤4 MiB / 宿主增量 ≤1 MiB（v0.1.7 基线）/ Shiki 不进产物 / 经典面板依赖图无 React·assistant-ui ｜ 自动
- **前置条件**：ENV-SETUP；基线 = **tag `v0.1.7` 检出同命令构建产物**（FR 文本「基线 = v0.1.7 构建产物 dist/extension.js，实测 459,382 字节」；执行口径见共用约定披露①/§3 第 13 条）；基线构建 + 被测构建。
- **操作步骤**（字节级断言，fs.stat/metafile 口径）：
  - (a) 默认面板 webview JS 产物合计（入口 + 全部代码分割 chunk，含打包入 bundle 的依赖运行时；**不含** source map 与 .css）≤ **4,194,304 字节**（推导：4 MiB = 4 × 1,048,576；FR 定值理由：全链预计 2–3 MiB 量级、阶段①最小切片实测 1,157,591 字节、Shiki 全量 ≈15 MiB 自然违规）；
  - (b) 宿主 bundle 增量 = 被测 `dist/extension.js` 字节 − 基线构建同产物字节 ≤ **1,048,576 字节**（1 MiB；基线实测参考值 459,382 字节——基线构建实测与参考值偏差 >±10% 须留痕说明）；
  - (c) Shiki 约束：`shiki`/`@shikijs/*` 不出现在默认面板产物依赖图（metafile inputs 断言；FR 文本：若进入产物必须限语言集或代码分割并计入 (a) 同一预算——高亮方案 = highlight.js common 同集平移（设计 D2），预期零命中）；
  - (d) 经典面板依赖图：单独构建经典 webview 入口，metafile inputs 零 `react`/`react-dom`/`@assistant-ui/**` 命中（回退可用保证，FR-AUI-05③ 末句）。
- **期望结果**：(a)-(d) 全部成立（附字节清单/依赖图清单）。
- **判定方式**：PASS = 全成立；FAIL = 超预算或依赖图命中（判据不因任何回退放宽——处置记设计偏差留痕后重测）。
- **依据锚点（三源）**：FR-AUI-05③（v0.7 口径）；设计 §10.14 D7（预算核算表：默认面板预估 ≈1.3–1.8 MiB ≤ 4 MiB、hljs common ≈0.26 MiB 计入）；外部契约 §11 #23（highlight.js 11.12.0 `lib/common` 36 语言注册清单）+ #13（指南「Bundle both sides」：Shiki 全 bundle ≈15 MB、NODE_ENV define）。

#### TC-108 ｜ FR-AUI-05②④（P0（切换批次））｜ retainContextWhenHidden 注册断言（自动）+ 真机层 checklist（真实 CSP 零 violation / 隐藏再显示 DOM 保留）｜ 自动 + UI 手工 checklist（核验四值 MANUAL；兜底 = TC-106 + 本 TC 注册断言）
- **自动面**：默认面板（新 UI）注册 options 显式 `retainContextWhenHidden: true`（FR 追溯表定位注册点结构断言；FR-AUI-05④「如设计裁决取其他值须在交付物记录理由」——非 true 且无登记理由即 FAIL）。
- **手工 checklist 项（真机，设计 D8 汇总）**：
  1. 默认面板在真实 CSP 下完成一次 golden 回放渲染；Webview Developer Tools 控制台**零 CSP violation**（含 zod `new Function` 探测类——指南明示 strict CSP 会报告此类除非 jitless 前置生效）。
  2. 回放完成后隐藏面板（切到其他视图/收起容器）再显示：已渲染消息 DOM 仍存在（不重建、不丢失、无整页重载痕迹）。
  3. 证据存 `evidence/TC-108/`（证据类型：控制台输出记录（零 violation）+ 隐藏前/显示后截图 ×2 + DOM 快照）。
- **期望结果**：自动面成立；checklist 2/2。
- **判定方式**：PASS = 自动面成立且 checklist 2/2；MANUAL 遗留不计 FAIL（对应 FR 以 TC-106 + 注册断言为门禁）；FAIL = 注册值无理由偏离 / CSP violation / 消息丢失重建。
- **依据锚点（三源）**：FR-AUI-05②（真机层）+ FR-AUI-05④；设计 §10.14 D1（显式声明 retainContextWhenHidden: true）+ D8（MANUAL 清单）；外部契约 §11 #13（指南「Content Security Policy」zod 探测 violation 与「Hidden views」隐藏销毁/保活语义）。

### FR-AUI-07 切换与旧面板退役（P0（切换批次））

#### TC-109 ｜ FR-AUI-07①④（P0（切换批次））｜ 切默认 + 对外契约零变更：viewType / 命令 / 配置 contributes 结构断言 ｜ 自动
- **前置条件**：ENV-SETUP；FR 追溯表（定位新 UI 注册承载）。
- **操作步骤**：`npm run verify:unit`（场景 SC-109：结构化解析 package.json 与注册点，断言 (a)-(e)）：
  - (a) 切默认：`contributes.views` 含 `sdysyhj.chatView`（name "Chat"）且为容器**首位**条目；`sdysyhj.openChat` 存在且打开该视图（注册接线断言）；该 viewType 注册承载 = 新 UI 实现（FR 追溯表确认，默认面板产物 `media/chat.js`，设计 D1）；
  - (b) 命令零变更：既有 9 项命令逐项 id 存在且不变——`sdysyhj.openChat` / `newSession` / `abort` / `showHistory` / `reportIssue` / `renameSession` / `switchModel` / `switchThinking` / `sendToPi`（FR-AUI-07④ 明文清单；允许新增 `openChatClassic`）；
  - (c) 配置零变更：既有 5 项配置键逐项存在且键名不变——`sdysyhj.piRuntime` / `piPath` / `thinkingDefault` / `outputTailLines` / `sendMode`；
  - (d) activationEvents 含 `onView:sdysyhj.chatView` 与 `onView:sdysyhj.chatViewClassic`（均惰性，设计 D1）；
  - (e) 既有文档/脚本引用面不受影响：contributes 中既有命令/配置的 id 字符串与 0.1.7 基线逐项一致（diff 断言——「既有文档/脚本引用不失效」的结构面）。
- **期望结果**：(a)-(e) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = viewType/命令/配置任一变更或默认承载非新 UI（附 manifest 解析输出为证据）。
- **依据锚点（三源）**：FR-AUI-07①④；设计 §10.14 D1（contributes 迁移方案：9 命令 5 配置逐项零变更、视图序、运行接线）；外部契约 §11 #13（指南「Add to an existing extension」——增量接入不改既有扩展契约面）。
- **说明**：运行时「用户无感切换」观感归 TC-111 MANUAL 冒烟；sendToPi/input_prefill 目标 = 新 UI 面板由 FR 追溯表确认（设计 D1），右键发送全链归 TC-136。

#### TC-110 ｜ FR-AUI-07②（P0（切换批次））｜ 「实验/Lab」命名清零 + 定名断言（澄清 #19(b)）｜ 自动
- **前置条件**：ENV-SETUP。
- **操作步骤**：`npm run verify:unit`（场景 SC-110：JSON 解析 package.json，递归取 `contributes` 全部字符串字段值断言）：
  - (a) 「实验」字面子串零命中；「Lab」按词界匹配 `(?<![A-Za-z])Lab(?![A-Za-z])` 零命中（防 `label`/`Label` 词内误命中——共用约定披露②）；
  - (b) 移除断言：contributes 无 `sdysyhj.chatLabView`、无 `sdysyhj.openChatLab`（0.1.7 实验入口随本批次移除，#19(b) 主案）；
  - (c) 定名断言：视图名 = "Chat"（`sdysyhj.chatView`）与 "Chat (Classic)"（`sdysyhj.chatViewClassic`）；命令 `sdysyhj.openChatClassic` 标题 = "Open Chat (Classic)"。
- **期望结果**：(a)-(c) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 任一字样命中/实验入口残留/定名不符（附 contributes 字符串清单为证据）。
- **依据锚点（三源）**：FR-AUI-07② + 澄清 #19(b)（命名定值）；设计 §10.14 D1（contributes 全文清零与定名冻结）；外部契约：无（纯我方 manifest 结构断言，期望源 = FR/设计文本）。
- **说明**：若总调度改判 #19(b) 备选方案（`openChatLab` 保留为隐藏弃用别名转发 `openChatClassic`、0.2.x 随经典面板删除），(b) 断言改为「别名存在 + 转发接线 + 删除预告留痕」——改判须留痕，本 TC 不自行放宽。

#### TC-111 ｜ FR-AUI-07③（P0（切换批次））｜ 双面板可切换 + 经典面板行为冻结 ｜ 自动 + UI 手工 checklist（核验四值 MANUAL；兜底 = TC-109/TC-110/TC-112）
- **自动面**：(a) 双注册结构：`sdysyhj.chatViewClassic` 注册承载 = 经典面板（FR 追溯表），`sdysyhj.openChatClassic` → `chatViewClassic.focus` 接线断言；(b) 行为冻结口径 = **行为冻结非字节冻结**（设计 D3）：既有回归套件零放宽全绿（`npm run verify:unit && npm run verify:integration`）+ 双面板一致快照（TC-112）；宿主改动收敛断言：经典面板宿主接线文件 git diff 归组核对 ≈ viewType/标题常量迁移 + 宿主动作层机械提取两处（设计 D3）。
- **手工 checklist 项**：同一工作区依次执行 `sdysyhj.openChat` → `sdysyhj.openChatClassic` → `sdysyhj.openChat`：两面板分别打开无错误（无错误通知/空白面板/控制台异常）、可来回切换（0.1.8 全程用户自救入口可用，#19(c)）。证据存 `evidence/TC-111/`（证据类型：截图 ×2（两面板）+ 命令执行与控制台输出记录）。
- **期望结果**：自动面成立；checklist 通过。
- **判定方式**：PASS = 全成立；MANUAL 遗留不计 FAIL（对应 FR 以 TC-109/110/112 为门禁）；FAIL = 注册缺失/套件红/切换报错（附 diff 归组与截图）。
- **依据锚点（三源）**：FR-AUI-07③ + 澄清 #19(c)（0.1.8 全程可切回、行为冻结、0.2.x 前删除——删除判定 = contributes 无 chatViewClassic/openChatClassic，属下一批次，不在本批次判定）；设计 §10.14 D3（行为冻结口径与 hostActions 机械提取）+ D9；外部契约 §11 #13（视图打开行为辅助锚）。

#### TC-112 ｜ FR-AUI-03④ + FR-AUI-07③（P0（切换批次））｜ 双面板行为一致快照：同一 golden 回放两面板消费端断言逐条相等 ｜ 自动
- **前置条件**：ENV-SETUP；GOLDEN-BASIC。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-112：同一 golden 回放分别驱动两面板消费端）：
  - (a) 新 UI 侧 = 真实 runtime DOM 断言（TC-102 断言面）；
  - (b) 经典面板侧 = 同一 jsdom 基建加载经典面板 HTML 模板 + 冻结 bundle（`media/main.js`，vscode stub 模式，设计 D9）DOM 断言消息条数与文本；预登记受控回退：若经典 bundle jsdom 挂载成本超预期，经典侧降级为数据层断言 + 真机 MANUAL 对照——须设计偏差留痕、不静默降级，核验核对留痕；
  - (c) 一致快照：两面板渲染消息条数相等（均 = 2）且消息文本逐条相等（user/assistant 对位一致，结构化断言）。
- **期望结果**：(a)-(c) 全部成立。
- **判定方式**：PASS = 全成立；FAIL = 任一断言面缺失/两面板结果不等/回退未留痕（附双侧断言输出为证据）。
- **依据锚点（三源）**：FR-AUI-03④ + FR-AUI-07③；设计 §10.14 D9（双载体 jsdom 对比、受控回退预登记）；外部契约 golden fixture 本体（期望值推导同 TC-102：2 = 1 user + 1 assistant）。

### FR-AUI-04 主题映射验证（载体平移，切换批次）（P0（切换批次））

#### TC-113 ｜ FR-AUI-04①②（P0（切换批次））｜ 主题审计平移至默认面板：token 链非空终点 --vscode-* / 浅深联动 / WCAG ≥4.5:1 ｜ 自动
- **前置条件**：ENV-SETUP；默认面板样式资源（新 UI 样式入口 + `@assistant-ui/vscode/theme.css` 映射——FR 追溯表定位）；VS Code 默认主题调色板 fixture（Dark Modern / Light Modern `colors` 基值快照，来源 microsoft/vscode `extensions/theme-defaults/themes/*.json`——设计 §11 #18）。
- **操作步骤**：`npm run verify:unit`（场景 SC-113：TC-089 同一审计断言面平移至默认面板采样点）：(a) 采样 token 链非空且终点 `--vscode-*`（正文文本/背景、用户气泡背景/文本、助手文本、输入框背景/边框）；(b) 浅深两套调色板代入 token 链解析具体 RGB，至少一组采样值变化（主题联动生效）；(c) 正文文本 vs 其背景相对亮度对比度 ≥ **4.5:1**（WCAG 相对亮度公式脚本，浅深各测）。
- **期望结果**：(a)(b)(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = token 链断裂/两主题采样全同/任一对比度 <4.5:1（附解析链与计算值为证据）。
- **依据锚点（三源）**：FR-AUI-04①②；设计 §10.14 D6（FR-AUI-04 验证面平移：ui-theme 静态审计 + 真机截图 checklist）；外部契约 §11 #11（README「Theme」：shadcn token→`--vscode-*` 映射）+ #18（theme-defaults 调色板基值）。

#### TC-114 ｜ FR-AUI-04③（P0（切换批次））｜ 浅/深主题截图人工核对无样式丢失 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 TC-113）
- **操作步骤**（手工 checklist 项）：真机默认面板完成一次回放渲染（含用户消息与助手回复）；在 VS Code Color Theme 分别切换浅色（Light Modern）与深色（Dark Modern）：各截一张面板截图，人工核对无样式丢失（元素错位/背景缺失/文本不可见任一即 FAIL）。证据存 `evidence/TC-114/`（证据类型：截图 ×2（注明主题名））。
- **期望结果**：两档均无样式丢失。
- **判定方式**：PASS = 2/2 无样式丢失且证据齐全；MANUAL 遗留不计 FAIL（兜底 TC-113）；FAIL = 任一档样式丢失。
- **依据锚点（三源）**：FR-AUI-04③ + 澄清 #19(a)（shadcn 默认视觉仅在既有 FR 未约束处采纳）；设计 §10.14 D6（截图 checklist 平移）；外部契约 §11 #11（webview 随用户切换 colour theme 重新配色）+ #13（指南「Follow the VS Code theme」）。

### FR-AUI-08 功能等价域（判定载体平移，TC-115~TC-136）

（v0.7 新增；FR-AUI-08①③：§4.1–4.5 全部 FR 判定载体平移至新 UI，验收标准语义与文本不变（§4 判定载体注记）；等价判定 = 既有验收标准在新 UI 载体逐条执行 + golden 回放（TC-102/TC-103）+ 双面板一致快照（TC-112）兜底。以下逐能力 TC 均按消费端契约判定面执行（共用约定：真实 runtime DOM 断言、禁 store 层驱动绕开）；既有 TC-001~TC-076 验收语义不变，其断言口径在新 UI 载体上等价执行。）

#### FR-CHAT-01 等价：流式对话

#### TC-115 ｜ FR-CHAT-01（P0）+ FR-AUI-08②（P0（切换批次））｜ 新 UI 流式 delta 级增量渲染（等价域）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM（d1..d8）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-115：发送 prompt "stream-check-eq"，消费端 DOM 断言）。
- **期望结果**：(a) 终稿文本逐字 == d1..d8 拼接（零丢失）；(b) 流式中间态存在：回放过程中观测到 ≥2 次 DOM 文本增长（delta 级增量渲染；Markdown defer 中间态跳过不影响——判据挂渲染 commit 点，设计 D4）；(c) 运行状态流转 idle→streaming→idle（run_state 事件 + 状态栏联动，澄清 #11）；(d) 首增量距发送 < 2s（沿用 TC-001(d) 预算）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 丢 delta/无增量渲染迹象/状态流转断裂。
- **依据锚点（三源）**：FR-CHAT-01 + FR-AUI-08②③；设计 §10.14 D4（delta 合批缓冲零丢失、rAF 冲刷）+ D2（defer 渐进解析）；外部契约 §11 #14（「Streaming responses」原地变更 assistant 消息）+ #1（json.md text_delta 序列）。
- **说明**：NFR-01 ≥600 delta 大流量代理判据（TC-036）经默认面板执行即新 UI 载体（共用约定）。

#### FR-CHAT-02 等价：Markdown 渲染 + 代码高亮

#### TC-116 ｜ FR-CHAT-02（P0）+ FR-AUI-08②（P0（切换批次））｜ Markdown 全要素 + 高亮语言集 ≥36（hljs common 口径）+ 集外回退转义 ｜ 自动
- **前置条件**：ENV-SETUP；fixture markdown（H1/H2、有序+无序列表、GFM 表格、任务列表、删除线、单换行、36 语言代码块各一（语言 tag = §11 #23 清单逐项）、集外语言代码块（如 `haskell`）、`https` 链接、行内代码、raw HTML 探针 `<b>x</b>`）。
- **期望值推导（语言数）**：highlight.js 11.12.0 `lib/common.js` `registerLanguage` 清单 = **36**（§11 #23；bash, c, cpp, csharp, css, diff, go, graphql, ini, java, javascript, json, kotlin, less, lua, makefile, markdown, objectivec, perl, php, php-template, plaintext, python, python-repl, r, ruby, rust, scss, shell, sql, swift, typescript, vbnet, wasm, xml, yaml）——断言口径 = 语言集不得窄于该清单（#19(a) 附注定值，与旧实现逐字同一注册集）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-116：fixture 渲染 DOM 断言）：
  - (a) 全要素结构：h1/h2、ul/ol/li、table/thead/tbody/tr/td、任务列表复选项、del、`pre>code`、`a[href^="https:"]`、行内 `code`；单换行渲染为 `<br>`（对齐旧 marked `breaks:true`，设计 D2）；
  - (b) 语言集覆盖：36 语言代码块逐一带语法高亮 token 结构（code 内嵌套 span 元素类等价断言，`language-<名>` 类名保持）；
  - (c) 集外语言回退：集外语言代码块无高亮 token、内容为纯代码**转义**展示（文本逐字 == 源码、`<`/`>` 以文本节点呈现不生成元素——与旧实现未收录语言行为同构，不构成回退）；
  - (d) raw HTML 不解析：`<b>x</b>` 以文本形态呈现（不生成 b 元素——§11 #20 无 rehype-raw 通道）。
- **期望结果**：(a)-(d) 全成立。
- **判定方式**：PASS = 全成立（语言覆盖以 36 逐项清单判定）；FAIL = 任一要素缺失/语言集窄于清单/集外语言被解释或高亮/HTML 被解析。
- **依据锚点（三源）**：FR-CHAT-02 + FR-AUI-08②③ + 澄清 #19(a) 附注（语言集边界与集外回退转义）；设计 §10.14 D2（MarkdownTextPrimitive + remarkGfm/remarkBreaks + hljs SyntaxHighlighter 同集平移、集外回退纯代码转义）；外部契约 §11 #19（@assistant-ui/react-markdown 0.14.26 导出面：MarkdownTextPrimitive / SyntaxHighlighterProps / code-fence）+ #20（react-markdown 10.1.0 不解析 raw HTML；remark-gfm 表格/任务列表/删除线；remark-breaks 单换行 `<br>`）+ #23（36 语言清单，随包 `lib/common.js` registerLanguage 核读）。

#### FR-CHAT-03 等价：thinking 折叠

#### TC-117 ｜ FR-CHAT-03（P0）+ FR-AUI-08②（P0（切换批次））｜ thinking 默认折叠 + 展开后流式 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-THINK（t1..t4 → d1..d3）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-117：回放 + 触发展开操作，DOM 断言）。
- **期望结果**：(a) 默认折叠：reasoning 折叠块存在且内容区默认不可见；(b) 展开后 thinking 文本 == t1..t4 拼接（流式期增量渲染至终稿，零丢失）；(c) 折叠块为可展开块（交互元素存在——展开动作以 DOM 事件派发判定）；(d) thinking 折叠块功能标签不受 FR-CHAT-10⑤ 约束（不计入角色标记断言，#19(a)⑤）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 不折叠/展开无内容/文本不一致。
- **依据锚点（三源）**：FR-CHAT-03 + FR-AUI-08②③；设计 §10.14 D2（thinking→reasoning part、Reasoning 折叠组件）；外部契约 §11 #21（reasoning 空文本丢弃语义 L62——空 thinking 不建块顺从）+ #14（part 型 reasoning）。

#### FR-CHAT-04 等价：工具调用卡片

#### TC-118 ｜ FR-CHAT-04（P0）+ FR-AUI-08②（P0（切换批次））｜ 工具卡全要素（名称/参数摘要/状态收敛/展开输入输出/bash 摘要/大输出截断保留尾部 + 复制全部）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-TOOLS（read 成功 20 行 / edit 成功 / bash `seq 1 20000` ≈100KB 成功）+ MOCK-TOOLS-LATE（#D-04 晚到回归）+ MOCK-TOOLS-FAIL（bash 失败 marker `E2E-TOOLFAIL-MARKER`）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-118a/b/c：三剧本各经真实链路渲染，DOM 断言）：
  - (a) 全要素：每张工具卡含工具名、关键参数摘要、执行状态（进行中/成功/失败）、可展开输入输出（展开动作 DOM 事件派发后输入/输出区可见）；bash 卡展示命令与输出摘要；
  - (b) 状态收敛（#D-04 回归）：工具执行结果晚于携带工具卡的助手消息到达时（MOCK-TOOLS-LATE），卡片状态由「进行中」收敛为「成功/失败」；MOCK-TOOLS-FAIL 中 bash 卡状态 = 失败（isError 语义经 tool-call part 透传，TC-099(c) 契约面）且失败 marker 可见；
  - (c) 大输出截断：bash 大输出（≈100KB）展示为截断 + **保留尾部**（默认 200 行口径，澄清 #2 / `sdysyhj.outputTailLines` 默认 200）；「复制全部」动作经 `copy_output` 取宿主缓存全量（调用记录断言 + 剪贴板落盘 == 完整输出）。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 要素缺失/状态不收敛/截断无保留尾部/复制全量不完整。
- **依据锚点（三源）**：FR-CHAT-04 + FR-AUI-08②③ + 澄清 #2（截断阈值口径）；设计 §10.14 D2（ToolFallback 工具卡：result{status,summary,output,outputTruncated}、copy_output 取宿主缓存全量）；外部契约 §11 #21（tool-call part result/isError/argsText 透传 L76–95）+ #1（json.md message_update/工具结果事件序列）。

#### FR-CHAT-05 等价：中止运行

#### TC-119 ｜ FR-CHAT-05（P0）+ FR-AUI-08②（P0（切换批次））｜ 中止：Stop/命令面板 abort + UI 恢复可输入 + 「已中止」消息级标记 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-SLOW（600 delta 慢速）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-119a：流式中以发送区 Stop 动作（取消控件 DOM 事件）触发中止；SC-119b：以命令面板 `sdysyhj.abort` 触发）。
- **期望结果**：(a) 两次均产生 abort RPC 调用记录（对应 RPC `abort`）；(b) 中止后运行状态回到 idle、UI 恢复可输入（澄清 #11：「已中止」为消息级标记非运行状态）；(c) 当前助手消息尾部渲染「已中止」消息级标记（metadata.custom.aborted 链路，TC-099(f) 契约面）；(d) 运行中显示 Stop、隐藏发送（设计 D3 同构）。
- **判定方式**：PASS = (a)-(d) 全成立；FAIL = 无调用/状态不回 idle/无标记/按钮态错误。
- **依据锚点（三源）**：FR-CHAT-05 + FR-AUI-08②③ + 澄清 #11（运行状态口径）；设计 §10.14 D2（aborted→消息级标记）+ D3（ComposerPrimitive.Cancel → post abort）；外部契约 §11 #22（ExternalStoreAdapter `onCancel` handler 契约）+ #2（rpc.md「Run lifecycle」L60–71）。

#### FR-CHAT-06 等价：steer / follow-up

#### TC-120 ｜ FR-CHAT-06（P1）+ FR-AUI-08②（P0（切换批次））｜ 运行中插话：steer/followUp 模式切换与排队注入 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-QUEUE-MIX（长运行剧本 + steer/follow_up 注入）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-120：运行中继续输入并按模式发送，DOM + 协议记录断言）：
  - (a) 运行中输入区可继续输入（非禁用态），placeholder 提示运行中语义（设计 D3 同构）；
  - (b) 模式切换控件存在（steer/follow-up），切换后发送对应 `steer`/`follow_up` RPC 调用（调用记录）；默认模式随 config `sendMode`（config 事件透传）；
  - (c) 注入消息经同一 user 消息路径渲染且单条（与 TC-126(b) 交叉：插话用户消息条目数 = 1/发送）。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 运行中输入被禁/模式不生效/调用错命令/插话多条。
- **依据锚点（三源）**：FR-CHAT-06 + FR-AUI-08②③；设计 §10.14 D3（steer/followUp 模式切换与发送语义）+ D5（插话同一 user_message 路径）；外部契约 §11 #4/#5（rpc-commands.md L46–92：steer run 中排队、follow_up 停后注入）+ #6（set_steering_mode/set_follow_up_mode 口径）。

#### FR-CHAT-07 等价：错误展示

#### TC-121 ｜ FR-CHAT-07（P0）+ FR-AUI-08②（P0（切换批次））｜ 错误卡片 + extension_error toast 边界（澄清 #14）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-ERROR（provider 429）/ MOCK-CRASH（子进程 exit(1)）/ 空 HOME（未配置凭证）；extension_error 注入剧本（#14 场景）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-121a/b/c：三路错误注入 + extension_error 边界，DOM + 日志断言）：
  - (a) provider 报错 / 子进程崩溃 / 未配置凭证均在聊天区渲染可读错误信息 + 修复指引（错误卡片，DOM 断言含可行动建议语义）；
  - (b) `extension_error` **不进**聊天区错误卡片（#14 边界）：以非阻断 toast 呈现（一次性），完整字段（extensionPath/event/error）写入 Output Channel 日志；
  - (c) 同错误（相同 extensionPath + error）窗口期去重展示、日志仍全量（#14）。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 错误不可读/无指引/extension_error 入聊天区/日志丢字段。
- **依据锚点（三源）**：FR-CHAT-07 + FR-AUI-08②③ + 澄清 #14（extension_error 展示通道边界）；设计 §10.14 D3（错误卡片/toast 重写，error/toast 协议复用）；外部契约 §11 #1（json.md 事件序列——错误事件形状）+ #2（rpc.md lifecycle 异常路径）。

#### FR-CHAT-08 等价：状态指示

#### TC-122 ｜ FR-CHAT-08（P0）+ FR-AUI-08②（P0（切换批次））｜ 状态栏四字段展示与状态流转 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-MODELS + MOCK-SLOW。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-122：DOM 断言顶部状态区）。
- **期望结果**：(a) 四字段可见：当前模型、thinking 等级、运行状态、会话名（model_info/run_state/session_name 事件驱动）；(b) 运行状态流转 idle→streaming→idle（澄清 #11：取值 idle/streaming，error/restarting 为瞬态；「已中止」非状态值）；(c) 状态栏点击可切换行为归 FR-MOD-01/02 判定（澄清 #6），本 TC 不判交互。
- **判定方式**：PASS = (a)(b) 全成立；FAIL = 字段缺失/状态流转断裂。
- **依据锚点（三源）**：FR-CHAT-08 + FR-AUI-08②③ + 澄清 #6/#11；设计 §10.14 D3（头部状态行重写，协议复用）；外部契约 §11 #2（rpc.md run lifecycle 状态口径）。

#### FR-CHAT-09 等价：流式输出自动跟随（四款）

#### TC-123 ｜ FR-CHAT-09（P1）+ FR-AUI-08②（P0（切换批次））｜ 跟随四款逐款判定（默认跟随 / 40px 打断 / 回底恢复 / 瞬时状态边界）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-SLOW（600 delta，可控步进）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-123a-d：滚动容器 `scrollHeight/clientHeight/scrollTop` 采样断言，口径同 TC-047~050）：
  - (a) ① 默认跟随：每轮流式开始即处于跟随态（每轮重置，轮内后续消息不覆盖用户打断——设计 D4 roundStarted 口径不变），跟随期间每次增量渲染后视口底缘距滚动底端 ≤40px；
  - (b) ② 打断：用户向上滚动离开底部（>40px）即停止自动跟随，后续增量渲染不推动滚动位置（scrollTop 保持用户所选位置）；
  - (c) ③ 恢复：滚回底部（≤40px）恢复自动跟随，后续增量满足 (a)；
  - (d) ④ 边界：跟随态不写会话文件、无消息级标记、不跨插件重启持久化（会话 JSONL/重放断言）；运行状态 idle 时不自动滚动；会话载入/切换的一次性初始定位不属本条（断言排除项）。
- **期望结果**：(a)-(d) 四款逐款成立。
- **判定方式**：PASS = 四款全成立；FAIL = 任一款语义不符（附滚动位置采样序列为证据）。
- **依据锚点（三源）**：FR-CHAT-09①②③④ + FR-AUI-08②③；设计 §10.14 D4（FollowState 纯状态机零改动复用 + useLayoutEffect 渲染点等价；预登记回退 = rAF 再锚定，语义不放宽）；外部契约 §11 #14（「Streaming responses」原地变更口径）。
- **说明**：跟随观感 = TC-125 MANUAL（兜底本 TC）。

#### FR-CHAT-10 等价：聊天面板视觉规范（五子条，#19(a) 全维持口径）

#### TC-124 ｜ FR-CHAT-10①–⑤（P1）+ FR-AUI-08②（P0（切换批次））｜ 五子条自动判定（CSS 钉值 + jsdom 结构断言）｜ 自动
- **前置条件**：ENV-SETUP；golden 回放渲染（含 user/assistant/thinking/工具卡各形态）；默认面板样式文本（FR 追溯表定位）。
- **操作步骤**：`npm run verify:unit`（CSS 钉值断言）+ `npm run verify:integration`（jsdom 文件级注解，场景 SC-124：DOM/结构断言）：
  - (a) ① 内容列居中：消息区与输入区（含底部模型选择器与上下文用量行）共享同一内容列，`max-width: 960px` 且左右外边距 auto（CSS 显式钉值断言——shadcn 默认宽度不采纳，#19(a)①）；
  - (b) ② 输入框圆角：输入框容器 `border-radius: 8px`（显式钉值，#19(a)②）；
  - (c) ③ 发送图标化：发送按钮无文字子节点（图标图形），可访问性名称（aria-label 或 title）= 「发送」（#19(a)③：覆盖 assistant-ui 默认英文 aria 文案）；
  - (d) ④ 消息布局：用户消息右对齐且由气泡容器包裹（背景色 + 圆角）；助手消息左对齐且无气泡包裹（无独立背景/边框）；消息子树无 avatar/img 头像元素（#19(a)④⑤ 禁 avatar）；
  - (e) ⑤ 时间替代角色标记：每条用户/助手消息含时间戳且匹配 `^\d{2}:\d{2}$`（24 小时制、本地时区）；消息行无 User/Assistant 角色文字前缀（thinking 折叠块与工具卡功能标签除外，#19(a)⑤）。
- **期望结果**：(a)-(e) 五子条全成立。
- **判定方式**：PASS = 五子条全成立；FAIL = 任一子条不符（附 CSS 解析值与 DOM 快照为证据）。
- **依据锚点（三源）**：FR-CHAT-10①–⑤ + FR-AUI-08②③ + 澄清 #19(a)（全部维持既有口径逐子条裁决）；设计 §10.14 D6（五子条落地：.content-col 960px / composer-shell 8px / Send aria「发送」/ 禁 avatar / formatHHmm）；外部契约 §11 #19（组件挂接面）+ #21（createdAt 语义 L31）。

#### TC-125 ｜ FR-CHAT-10（P1）+ FR-CHAT-09（P1）+ FR-CHAT-06（P1）（真机观感汇总）｜ 视觉观感 / 流式跟随观感 / Composer 交互细节 ｜ UI 手工 checklist（核验四值 MANUAL；兜底 = TC-124/TC-123/TC-120/TC-129）
- **操作步骤**（手工 checklist 项，设计 D8 汇总，一次真机会话执行）：
  1. 视觉观感：五子条观感核对（内容列居中留白相等、用户右气泡/助手左无气泡、时间戳 HH:mm、发送按钮图形与可访问性名称「发送」）；
  2. 流式跟随观感：长回复流式中默认跟随、上滚打断不回拽、回底恢复（录屏 ≥15s）；
  3. Composer 交互细节：IME 组合输入不误发（isComposing）、`@` 防抖触发、命令菜单打开时焦点保持与键盘导航不发送；
  4. 证据存 `evidence/TC-125/`（证据类型：截图 + 录屏）。
- **期望结果**：checklist 全项符合。
- **判定方式**：PASS = 全项符合且证据齐全；MANUAL 遗留不计 FAIL（兜底 TC-124/TC-123/TC-120/TC-129 全 PASS 为门禁）；FAIL = 观感回退/交互破坏。
- **依据锚点（三源）**：FR-CHAT-10 + FR-CHAT-09 + FR-CHAT-06（观感/交互层）+ FR-AUI-08②；设计 §10.14 D8（MANUAL 清单：跟随观感、Composer 交互细节）+ D10 风险③（IME/@ 防抖/焦点保持）；外部契约 §11 #14（官方文档 external-store 交互面）。

#### FR-CHAT-11 等价：用户消息单次展示（五款）

#### TC-126 ｜ FR-CHAT-11①②③（P0）+ FR-AUI-08②（P0（切换批次））｜ 单气泡不变量：三时点恰一条 / steer·followUp 同口径 / 历史重放不重复 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM（含 user 回声）；MOCK-QUEUE-MIX；GOLDEN-BASIC/GOLDEN-MIX（回放兜底）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-126a-c：消费端 DOM 计数断言）：
  - (a) ① 单条恒成立：发送后即时（不等待 pi 确认回声）条目数 = 1；user 回声（user 角色 `message_end`，json.md L36–40）到达后、本轮助手终稿渲染完成后两个判定时点各采样一次仍均为 1；同文本多次独立发送 N 次 → N 条（不跨发送合并）；
  - (b) ② steer/followUp 同口径：运行中插话每条用户消息各判定时点条目数 = 1（与 TC-120(c) 交叉）；
  - (c) ③ 历史重放不重复：面板重开 / 会话切换（`history_loaded` 全量替换为唯一重建入口，设计 D5）后每条用户消息条目数 = 1，重放内容与会话 JSONL 一致（澄清 #5）；golden 回放兜底（TC-102：user 计数 1；TC-103：user 计数 3 逐条对应）。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 任一时点条目数 >1/跨发送合并/重放重复（附 DOM 计数采样为证据）。
- **依据锚点（三源）**：FR-CHAT-11①②③ + FR-AUI-08②③ + 澄清 #5/#12；设计 §10.14 D5（user_message→push 单条、history_loaded 全量替换、一 UiMessage→一 ThreadMessage 无合并）；外部契约 §11 #1（json.md「Event sequence」L30–46 user 回声必发）+ #7（extensions.md L752–770 回声覆盖面）+ golden fixture 本体。

#### TC-127 ｜ FR-CHAT-11④⑤（P0）+ FR-AUI-08②（P0（切换批次））｜ 文本保真：#16 就地更新 / #17 保守分支 / ⑤回归边界 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-ECHO-REWRITE（回声文本 ≠ 发送原文，#16 场景）；MOCK-QUEUE-MIX 不可关联回声分支（#17 场景）；MOCK-REJECT / MOCK-HANDLED（拒绝/handled 路径）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-127a-d）：
  - (a) #16 就地更新：回声可关联时，pi 权威文本到达前显示发送原文、到达后**该条目文本就地更新**为权威文本——更新前后条目数均为 1、不新增条目、不同时展示两版文本（同 id 就地覆盖幂等语义，设计 D5）；
  - (b) #17 保守分支：回声不可关联（多通道不可判定）时，各条目恒 1 条、文本不错换、不因该回声新增条目，实时窗口保留发送原文；经会话切换/刷新/面板重开权威重建后文本收敛为会话 JSONL 权威文本；
  - (c) 拒绝/handled 路径：`success:false`（受理前拒绝）与 `disposition:"handled"` 不产生用户消息错增/错换（单条不变量保持）；
  - (d) ⑤ 回归边界：助手消息（thinking 折叠、工具卡）条目数与内容展示不受单气泡判定影响（TC-117/TC-118 交叉）。
- **期望结果**：(a)-(d) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 双文本并存/条目新增/错换/权威重建不收敛（附 DOM 文本采样序列为证据）。
- **依据锚点（三源）**：FR-CHAT-11④⑤ + FR-AUI-08②③ + 澄清 #16（pi 权威文本单条就地更新）/#17（不可关联回声保守分支）；设计 §10.14 D5（就地覆盖幂等键 = 消息 id、#17 无事件被动保留、权威重建收敛）；外部契约 §11 #3（rpc-commands.md prompt disposition started/queued/handled）+ #1（回声语义）。

#### FR-FILE-02 等价：`@` 文件引用

#### TC-128 ｜ FR-FILE-02（P0）+ FR-AUI-08②（P0（切换批次））｜ `@` 触发选择器唯一入口 + 光标插入 + 输入区无添加文件按钮 ｜ 自动
- **前置条件**：ENV-SETUP；工作区含可选文件集。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-128）：
  - (a) 触发：输入 `@`（前一字符为行首/空白，触发谓词口径同旧实现）弹出文件选择器（宿主 QuickPick 调用记录 `insert_file_ref`），可过滤；
  - (b) 插入：选中后文件路径插入输入框**光标处**并替换触发用 `@`（ComposerRuntime.setText 全文重写语义，§11 #22；输入上下文保持）；
  - (c) 唯一入口：输入区 DOM 无独立「添加文件」按钮或等价固定入口元素（FR-FILE-02 修订句 DOM 断言面）；`@` 选择器为输入区唯一文件引用入口；FR-FILE-03 右键发送入口不受影响（归 TC-136）。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 不触发/插入错位/存在添加文件按钮。
- **依据锚点（三源）**：FR-FILE-02（v0.4 修订句）+ FR-AUI-08②③；设计 §10.14 D3（fileRefTrigger 纯函数 + hostActions QuickPick + setText 替换 `@` 语义）；外部契约 §11 #22（`ComposerRuntime.setText`，composer-runtime.d.ts L92/L169）。

#### FR-CMD-03 等价：`/` 命令补全菜单

#### TC-129 ｜ FR-CMD-03①–⑤（P1）+ FR-AUI-08②（P0（切换批次））｜ `/` 命令菜单全链路（数据源/出现与过滤/键盘导航/选中插入/边界）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-CMD（4 项固定命令全集；可配置空集/调用失败）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-129a-e，逐条对应验收标准①–⑤）：
  - (a) ① 数据源 = `get_commands` 返回的命令全集（扩展命令/prompt 模板/skills），菜单每项展示名称与描述（DOM 断言）；
  - (b) ② 出现条件：输入框文本 `/` 开头显示菜单、非 `/` 不显示；`/` 后文本实时过滤（名称/描述子串匹配、不区分大小写——MOCK-CMD 含 `ExPlain`/`zebra` 大小写与子串区分用例）；过滤后无匹配则菜单隐藏；
  - (c) ③ 键盘导航：↑/↓ 移动高亮项、Enter 选中高亮项、Esc 关闭菜单，二者均不触发发送（prompt 调用记录零命中）；
  - (d) ④ 选中行为：选中命令（`/` + 命令名）写入输入框（替换原 `/` 起始过滤文本）并关闭菜单、焦点保持在输入框；鼠标点击菜单项等价于键盘选中；
  - (e) ⑤ 边界：`get_commands` 不可用或返回空时不显示菜单，`/` 开头文本仍可直接发送透传（调用记录含命令文本）。
- **期望结果**：(a)-(e) 五款逐款成立。
- **判定方式**：PASS = 五款全成立；FAIL = 任一款不符。
- **依据锚点（三源）**：FR-CMD-03①–⑤ + FR-AUI-08②③；设计 §10.14 D3（CommandMenuState/filterCommands 纯逻辑零改动复用 + React 菜单组件同构接线）；外部契约 §11 #3（rpc-commands.md prompt 透传/skill 展开语义）。

#### FR-MOD 等价：模型选择器与上下文用量

#### TC-130 ｜ FR-MOD-01③ + FR-MOD-03（P1）+ FR-AUI-08②（P0（切换批次））｜ 底部模型选择器 + 三入口同步 + 会话内持久 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-MODELS（`get_available_models` → ["mock-small","mock-large"]）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-130）：
  - (a) 入口③：输入区底部常显当前模型名；点击弹出可用模型列表（DOM 断言）；选中即切换（`set_model` 调用记录）并同步更新展示；
  - (b) 三入口同步：入口③切换后状态栏（入口①）与命令面板（入口②）展示同步（FR-MOD-01 任一入口切换后其余入口同步，model_info 事件链）；
  - (c) 持久（FR-MOD-03）：切换结果随会话保留，模拟插件重启后状态栏与底部模型选择器反映切换。
- **期望结果**：(a)-(c) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 不同步/不持久/协议调用缺失。
- **依据锚点（三源）**：FR-MOD-01③ + FR-MOD-03 + FR-AUI-08②③；设计 §10.14 D3（底部模型选择器重写、request_models/models_list/set_model 协议复用、终接同一 setModel）；外部契约 §11 #3（rpc-commands.md 模型命令族）。

#### TC-131 ｜ FR-MOD-04（P1）+ FR-AUI-08②（P0（切换批次））｜ 上下文用量指示（权威取值/百分比/刷新时机/占位）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-USAGE（`get_state` 返回 `contextWindow=200000`；会话 A 两条助手消息 totalTokens=12345/45600、会话 B =15000；可触发一次 compaction 事件）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-131a-d 逐条对应验收标准①–⑤）：
  - (a) ①② 取值：token 数值 = 最近一条助手消息 `usage.totalTokens`（`message_update` Usage）；上下文窗口 = `get_state` `contextWindow`；
  - (b) ③ 展示：token 数值 + 百分比（= ①÷②×100 四舍五入取整；数值允许千分位或 k 缩写，解析容差 ≤1% 口径沿用 TC-060）；
  - (c) ④ 刷新时机：新助手消息用量刷新（45600 覆盖 12345）；切换会话后按新会话最近一条取值（15000）；当前会话无助手消息显示 "—" 占位；
  - (d) ⑤ 回归边界：compaction 相关 toast 行为不变（不属本 FR 断言范围，核对无回归）。
- **期望结果**：(a)-(d) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 取值错/百分比错/不刷新/占位缺失。
- **依据锚点（三源）**：FR-MOD-04①–⑤ + FR-AUI-08②③；设计 §10.14 D3（formatContextUsage 纯函数复用、usage_info 协议复用）；外部契约 §11 #1（json.md `message_update` Usage 结构）。

#### FR-SESS 等价：会话管理系

#### TC-132 ｜ FR-SESS-01 + FR-SESS-04（P0/P1）+ FR-AUI-08②（P0（切换批次））｜ 新建会话（旧会话落盘）+ 手动重命名 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-132）：
  - (a) 新建会话动作（头部按钮/命令）→ 旧会话 JSONL 落盘保留（文件断言）+ 面板进入新会话；
  - (b) 重命名（FR-SESS-04）→ `set_session_name` 调用记录 + 状态栏会话名同步（session_name 事件）。
- **期望结果**：(a)(b) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 旧会话丢失/命名不生效。
- **依据锚点（三源）**：FR-SESS-01/04 + FR-AUI-08②③；设计 §10.14 D3（头部新会话/重命名，协议复用）；外部契约 §11 #3（rpc-commands.md `set_session_name`）。

#### TC-133 ｜ FR-SESS-02（P0）+ FR-AUI-08②（P0（切换批次））｜ 历史列表（标题/时间/消息数（#12 口径）/点击切换）｜ 自动
- **前置条件**：ENV-SETUP；3 个既有会话（消息数分别为 4/10/18——计算说明同 TC-017：N 次发送 → N user + N assistant）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-133：打开历史列表 DOM 断言 + 切换动作）。
- **期望结果**：(a) 列表每项含标题、时间、消息数；消息数 = user+assistant 合计（4/10/18 逐项，澄清 #12）；(b) 点击切换到对应会话（切换事件断言）。
- **判定方式**：PASS = (a)(b) 全成立；FAIL = 字段缺失/计数口径错/切换失败。
- **依据锚点（三源）**：FR-SESS-02 + FR-AUI-08②③ + 澄清 #12（消息数口径）；设计 §10.14 D3（历史列表/协议复用）；外部契约 §11 #1（json.md 消息/会话语义）。

#### TC-134 ｜ FR-SESS-03（P0）+ FR-AUI-08②（P0（切换批次））｜ 继续会话：上下文完整恢复（含压缩状态）+ 重放与 JSONL 一致（#5）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；会话 A（含压缩状态场景）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-134：切换到会话 A 断言 + 再发一条 prompt 续写）。
- **期望结果**：(a) 历史重放消息与会话 JSONL 一致（含压缩状态，澄清 #5 等价判据）；(b) 切换后可继续对话、JSONL 连续续写；(c) 用户消息重放单条（TC-126(c) 交叉）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 上下文丢失/另起会话/重放不一致。
- **依据锚点（三源）**：FR-SESS-03 + FR-AUI-08②③ + 澄清 #5；设计 §10.14 D5（history_loaded 权威重建）；外部契约 §11 #1（json.md 消息/会话语义）。

#### TC-135 ｜ FR-SESS-06 + FR-SESS-07（P0/P1）+ FR-AUI-08②（P0（切换批次））｜ 单会话工作模式 + 外部修改提示（≤5s 拦截/刷新）｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；会话文件外部修改剧本（同 TC-022 口径）。
- **操作步骤**：`npm run verify:integration`（jsdom 文件级注解，场景 SC-135a/b）：
  - (a) FR-SESS-06：单活动会话 + 历史切换，无并行多会话标签（DOM/状态断言）；
  - (b) FR-SESS-07：外部修改（终端 pi 写同一会话）后 ≤5s 内提示刷新（澄清 #7），且阻止陈旧状态继续使用——拦截后续交互直至刷新完成或自动刷新（澄清 #13：仅展示提示但继续受理交互 = FAIL）；刷新按钮动作 → `refresh_session` 调用记录（设计 D3）。
- **期望结果**：(a)(b) 全成立。
- **判定方式**：PASS = 全成立；FAIL = 并行会话出现/提示超时/陈旧交互被受理。
- **依据锚点（三源）**：FR-SESS-06/07 + FR-AUI-08②③ + 澄清 #7（≤5s）/#13（拦截或自动刷新）；设计 §10.14 D3（外部修改横幅 + 刷新按钮重写）；外部契约 §11 #2（rpc.md 会话独占口径）。

#### 等价域复合重指向（宿主侧 / 命令面板层 FR）

#### TC-136 ｜ FR-AUI-08①③（P0（切换批次）；复合 FR-FILE-01/FR-FILE-03/FR-MOD-02/FR-CMD-01/FR-CMD-02/FR-CMD-05）｜ 既有套件载体重指向全绿 + P2 口径不变 ｜ 自动（组合判定）
- **前置条件**：ENV-SETUP；既有验证套件（TC-001~TC-076 对应逻辑场景）。
- **操作步骤**：
  1. 既有套件面重指向新 UI 载体后 `npm run verify:unit && npm run verify:integration` 全绿（FR-AUI-08③ 判定方式首件；对应逻辑场景逐条在新 UI 载体执行：SC-023（FR-FILE-01 工作区绑定：Pi 子进程 cwd = 打开的文件夹、多根取第一）/ SC-026（FR-FILE-03 右键发送：文件路径/选区作为 prompt 素材 + `input_prefill` 预填至**新 UI** 输入区——设计 D1）/ SC-028（FR-MOD-02 thinking 等级切换）/ SC-030（FR-CMD-01 命令面板 5 命令注册：Open Chat / New Session / Abort / Show Session History / Report Issue）/ SC-031（FR-CMD-02 stderr + 协议异常写入 Output Channel）/ SC-035（FR-CMD-05 pi 运行时来源：PATH 优先/内置回退/显式指定））。
  2. P2 口径不变（FR-AUI-08④）：FR-SESS-05（分支切换）、FR-CMD-04（MCP）维持二期，载体平移不改优先级与范围（矩阵显式列出，不新增判定项）。
- **期望结果**：(1) 全绿；(2) 口径确认无变更。
- **判定方式**：PASS = (1) 全绿 + (2) 确认；FAIL = 任一既有场景在新 UI 载体红（附套件输出）。
- **依据锚点（三源）**：FR-AUI-08①③④；设计 §10.14 D3（input_prefill/sendToPi 目标 = 新 UI 面板）+ D8（回归清单重定向）；外部契约 §11 #2（rpc.md lifecycle）+ #3（rpc-commands.md prompt/get_commands 族）。
- **说明**：口径披露⑤（共用约定）——宿主侧/命令面板层 FR（FILE-01/FILE-03/MOD-02/CMD-01/CMD-02/CMD-05）判定载体平移的影响面为「面板交互端」，验收语义不变；本 TC 以组合判定承载（每 FR 均有专属逻辑场景逐条判定），如总调度要求逐 FR 独立等价 TC 可再拆分。

### NFR-01 性能

#### TC-036 ｜ NFR-01 ｜ 10k+ tokens 流式渲染代理断言 ｜ 自动（代理指标）
- **前置条件**：ENV-SETUP；MOCK-BIG。
- **操作步骤**：`npm run verify:integration`（场景 SC-036）。
- **期望结果**：(a) ≈600 个 delta 全部按序到达（零丢失）；(b) 完整渲染耗时 ≤ 预算（建议 ≤30s，阈值待基线确认，见歧义清单 #3）；(c) 渲染批处理代理：全量重渲染次数 ≤ delta 数/10（代理"不掉帧"）。
- **判定方式**：PASS = (a)-(c) 成立；FAIL = 丢事件/超预算/无批处理迹象。（辅助 UI checklist：观感流畅录屏存 `evidence/TC-036/`，证据类型：录屏。）

#### TC-037 ｜ NFR-01 ｜ 面板切换/重开不丢运行状态 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-SLOW。
- **操作步骤**：`npm run verify:integration`（场景 SC-037：流式运行中模拟面板隐藏→重开（webview dispose/recreate））。
- **期望结果**：重开后 (a) 状态仍为 streaming；(b) 继续收到后续 delta；(c) Stop 仍可中止（abort 走 TC-009 断言）。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。

### NFR-02 稳定性

#### TC-038 ｜ NFR-02 ｜ 子进程崩溃自动重启一次 + 宿主异常隔离 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-CRASH。
- **操作步骤**：`npm run verify:integration`（场景 SC-038a：连续两次触发 MOCK-CRASH；SC-038b：向 webview/面板注入运行时异常后执行 New Session 命令）。
- **期望结果**：(a) 第一次崩溃后自动重启一次（spawn 计数 +1）并产生用户提示；(b) 第二次崩溃不再无限重启（spawn 计数不再增长）且有提示；(c) SC-038b 注入异常后宿主存活：New Session 命令仍执行成功、无 VS Code 崩溃。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 重启缺失/无限重启/宿主被拖垮。

### NFR-03 安全

#### TC-039 ｜ NFR-03 ｜ 日志脱敏（不得明文输出凭证） ｜ 自动
- **前置条件**：ENV-SETUP。
- **操作步骤**：
  1. 生成并注入哨兵假凭证（**执行时随机生成哨兵值**，禁止使用文档内固定字面值——见 ENV-SETUP；格式以 pi 约定为准，凭证本体用 `$SENTINEL`）：
     ```bash
     mkdir -p "$HOME/.pi/agent"
     printf '{"api_key":"%s"}\n' "$SENTINEL" > "$HOME/.pi/agent/auth.json"
     ```
  2. 触发尽量多的日志路径：`npm run verify:unit && npm run verify:integration`（含 SC-013、SC-031、SC-035 等），并保存 Output Channel 转储到 `$MOCKLOG/logs/`。
  3. 脱敏断言（断言对象**仅限被测产物/日志**：构建产物、Output Channel 转储、会话/状态文件；docs/（含本用例文档）为哨兵定义源显式排除；且哨兵为执行时随机值，不存在自命中）：
     ```bash
     for d in "$MOCKLOG/logs" "$HOME/.pi" "$WORKSPACE/dist" "$WORKSPACE/out" "$WORKSPACE/build"; do
       [ -e "$d" ] || continue
       if rg -F "$SENTINEL" "$d" --hidden -g '!*auth.json'; then echo "FAIL: 明文泄漏 in $d"; exit 1; fi
     done
     echo "OK: 被测产物/日志中无哨兵明文"
     ```
- **期望结果**：被测产物与日志（构建产物、Output Channel 转储、`$HOME/.pi` 会话/状态文件）均无哨兵明文；排除项仅限凭证注入点 auth.json 本身、mock 期望载荷与定义源文档 docs/。
- **判定方式**：PASS = 扫描脚本输出 OK（零命中）且套件绿；FAIL = 任一命中（附命中行与文件路径为证据）。

#### TC-040 ｜ NFR-03 ｜ Webview 渲染消毒（防 XSS） ｜ 自动
- **前置条件**：ENV-SETUP；载荷集 PAYLOAD-XSS：
  1. `<script>window.xss=1</script>`
  2. `<img src=x onerror="window.xss=1">`
  3. `[x](javascript:window.xss=1)`
  4. `<a href="javascript:window.xss=1">x</a>`
  5. `<iframe src="javascript:window.xss=1"></iframe>`
  6. `<svg onload="window.xss=1"></svg>`
  7. `[x](data:text/html,<script>window.xss=1</script>)`
- **操作步骤**：`npm run verify:unit`（消毒断言，载荷作为 assistant 消息内容渲染）；若套件缺此断言，按 §0.5 以临时脚本对渲染入口（FR 追溯表定位，jsdom 执行渲染）逐一注入 7 个载荷。
- **期望结果**：每个载荷渲染后：(a) DOM 无 `script` 元素；(b) 无 `on*` 事件属性；(c) `href`/`src` 无 `javascript:` 与 `data:text/html` 协议；(d) jsdom 中 `window.xss` 为 undefined（注入脚本未执行）。
- **判定方式**：PASS = 7/7 载荷均满足 (a)-(d)；FAIL = 任一载荷残留可执行注入（附渲染产物/执行痕迹证据）。

#### TC-041 ｜ NFR-03 ｜ 会话数据仅存 pi 原有位置（不另建副本） ｜ 自动
- **前置条件**：ENV-SETUP。
- **操作步骤**：
  ```bash
  find "$HOME" -type f | sort > "$MOCKLOG/home-before.txt"
  find "$WORKSPACE" -mindepth 1 | sort > "$MOCKLOG/ws-before.txt"
  npm run verify:integration          # 全场景（含 SC-016/017/018 产生会话）
  find "$HOME" -type f | sort > "$MOCKLOG/home-after.txt"
  find "$WORKSPACE" -mindepth 1 | sort > "$MOCKLOG/ws-after.txt"
  comm -13 "$MOCKLOG/home-before.txt" "$MOCKLOG/home-after.txt" | grep -v '^'"$HOME"'/\.pi/' && echo "FAIL: stray files in HOME" || echo "OK"
  comm -13 "$MOCKLOG/ws-before.txt" "$MOCKLOG/ws-after.txt" | grep -v '/\.vscode/' && echo "FAIL: stray files in workspace" || echo "OK"
  ```
- **期望结果**：新增文件仅位于 `$HOME/.pi/`（pi 原有位置）与工作区 `.vscode/` 内；无会话副本/状态副本落于他处。
- **判定方式**：PASS = 两段检查均输出 OK；FAIL = 出现 `$HOME/.pi/` 之外的新增会话/状态文件（附 comm 输出为证据）。

### NFR-04 兼容性

#### TC-042 ｜ NFR-04 ｜ 版本门槛/打包清单/三平台冒烟 ｜ 自动（三平台部分=CI checklist）
- **前置条件**：ENV-SETUP。
- **操作步骤**：
  1. 版本门槛断言：
     ```bash
     node -e 'const p=require("./package.json");const v=(p.engines&&p.engines.vscode||"").replace(/[^\d.]/g,"");const [M,m]=v.split(".").map(Number);if(!v||M<1||(M===1&&m<85)){console.error("engines.vscode < 1.85: "+p.engines.vscode);process.exit(1)}console.log("OK engines.vscode="+p.engines.vscode)'
     ```
  2. 打包清单：`npx vsce ls`（或等价打包清单命令），核对不捆绑独立 Node 运行时、无未声明的平台原生依赖。
  3. 三平台冒烟（CI checklist 项）：Windows / macOS / Linux 各执行一次 `npm run verify:unit && npm run verify:integration`（证据类型：三平台 CI 日志各一份，存 `evidence/TC-042/`）。
- **期望结果**：(a) 脚本 exit 0；(b) 打包清单合规；(c) 三平台日志证据齐全且全绿。
- **判定方式**：PASS = (a)(b) 自动通过 + (c) CI 证据齐全；FAIL = 任一不符/证据缺失。

### NFR-05 可观测

#### TC-043 ｜ NFR-05 ｜ 关键路径日志 + 错误含可行动建议 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-CRASH。
- **操作步骤**：`npm run verify:integration`（场景 SC-043：依次触发会话创建、prompt 发送、abort、子进程退出），转储 Output Channel 日志。
- **期望结果**：日志含 4 类事件记录（会话创建 / prompt / abort / 子进程退出，均带时间戳）；错误记录含可行动建议（与 TC-013 (b) 同判据）。
- **判定方式**：PASS = 4/4 事件命中且错误建议断言成立；FAIL = 任一关键路径无日志（附日志转储为证据）。

### NFR-06 可卸载

#### TC-044 ｜ NFR-06 ｜ 卸载/停用无残留 ｜ 自动
- **前置条件**：ENV-SETUP；已执行 TC-041 全场景。
- **操作步骤**：
  ```bash
  find "$HOME" -path "$HOME/.pi" -prune -o -name '.*' -print
  find "$WORKSPACE" -path "$WORKSPACE/.vscode" -prune -o -name '.*' -print
  ```
  （模拟停用/卸载：结束扩展宿主后再次执行上述扫描。）
- **期望结果**：两处扫描均无插件写入的隐藏文件/状态残留（`$HOME/.pi` 为 pi 原有位置豁免；工作区 `.vscode` 豁免）。
- **判定方式**：PASS = 两次扫描输出均为空（豁免路径外）；FAIL = 任一残留（附 find 输出为证据）。

### 验收标准汇总（§8）补充 TC

#### TC-045 ｜ §8-1（复合：FR-CMD-05/CHAT-01/03/04/FILE-01）｜ 端到端冒烟：读文件→修改→执行命令 ｜ 自动（组合判定）
- **前置条件**：ENV-SETUP；无 pi CLI（PATH=/usr/bin:/bin）；无凭证；MOCK-TOOLS。
- **操作步骤**：
  1. `npx vsce package` → 本地安装产物（`code --install-extension <pkg>.vsix`，离线等价于"从零安装"）。
  2. 打开面板，发送任务 prompt："读取 src/a.ts，修改它，并执行一条命令"（MOCK-TOOLS 场景）。
- **期望结果**：一次完整任务流通过：内置运行时启动（TC-035b 断言）、流式回复（TC-001 断言）、thinking 块（TC-005 断言）、3 张工具卡全成功（TC-007 断言）。
- **判定方式**：PASS = 组合断言全成立 + 安装产物存在；FAIL = 任一环节断链。

#### TC-046 ｜ §8-3（复合：FR-SESS-03）｜ 宿主重启后历史恢复 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：`npm run verify:integration`（场景 SC-046：会话 A 发送 3 个 prompt → 模拟窗口重载（workbench/host+webview 重建）→ 从历史选 A → 再发第 4 个 prompt）。
- **期望结果**：上下文完整恢复（同 TC-018 断言）、消息总数 = **8**（口径：user + assistant 合计，总调度裁决 2026-11-17，基线 v0.2.2；计算说明：MOCK-STREAM 每 prompt 产生 1 条 user + 1 条 assistant，共 4 个 prompt → user 4 + assistant 4 = 8）、JSONL 连续续写。
- **判定方式**：PASS = 断言全成立；FAIL = 上下文丢失/另起会话。

#### TC-097 ｜ §8-7（复合：FR-AUI-01~06 全部 P0（阶段①）子条）｜ TASK-009 阶段①出口门禁自检 ｜ 自动（组合判定）
- **前置条件**：ENV-SETUP；阶段①交付（ready-for-verify 标签检出）；本文件 TC-077~TC-096 各项已执行。
- **操作步骤**（汇总判定，无新增执行；逐项核对下列门禁要件，需求基线 v0.6 §8 第 7 条 + 澄清 #18）：
  1. **§4.6 全部「P0（阶段①）」子条对应自动 TC 全 PASS**：TC-077/TC-078（FR-AUI-01①②③自动面）、TC-080/TC-081/TC-083（FR-AUI-02④⑤自动兜底/⑥自动面）、TC-085/TC-086/TC-088（FR-AUI-03①③）、TC-089（FR-AUI-04①②）、TC-091/TC-092/TC-094（FR-AUI-05①②③）、TC-096（FR-AUI-06）；P1 项 TC-087（FR-AUI-03②）尽力、不计入门禁（澄清 #18）。
  2. **MANUAL 项四值处理**：TC-079/TC-082/TC-084/TC-090/TC-093/TC-095 按核验四值记 MANUAL（遗留不计 FAIL），但其各自自动兜底 TC 必须全 PASS（兜底映射：TC-077 / TC-081 / TC-083+TC-085+TC-086 / TC-089 / TC-092+TC-085+TC-086 / TC-077(d)）。
  3. **双切片对比报告交付**：TC-096 PASS（四维数据齐备 + 证据可复现 + 结论中立）。
  4. **默认面板既有行为零变更**：TC-078 PASS（冻结面断言 + 既有 verify:unit/verify:integration 全绿）——§8 第 1–6 条 MVP 门禁既有判定不回归（以 TC-078 步骤 3 既有套件全绿为判定面；既有 TC-001~TC-076 的核验执行按验证计划/核验剧本进行）。
- **期望结果**：门禁要件 1–4 全部成立。
- **判定方式**：PASS = 1–4 全成立；FAIL = 任一门禁要件不成立（阶段①出口不通过；处置依设计 §10.13 D9：不放宽断言、失败证据上报总调度裁决——调整重试/证伪终止迁移/退出）。
- **依据锚点（三源）**：需求基线 v0.6 §8 第 7 条 + 澄清 #18；设计 §10.13 D9（门禁处置原则：如实记录失败证据即阶段①有效产出，允许「证伪」）；本文件 §2 覆盖矩阵 FR-AUI 行与阶段①出口门禁自检行。

#### TC-137 ｜ §8-7（复合：FR-AUI-02~08 全部 P0（切换批次）子条 + §4.1–4.5 等价域）｜ TASK-009 切换批次出口门禁自检 ｜ 自动（组合判定）
- **前置条件**：ENV-SETUP；切换批次交付（ready-for-verify 标签检出）；本文件 TC-098~TC-136 各项已执行。
- **操作步骤**（汇总判定，无新增执行；逐项核对下列门禁要件，需求基线 v0.7 §8 第 7 条）：
  1. **§4.6 全部「P0（切换批次）」子条逐条通过**（§8-7①）：TC-098/TC-099/TC-100/TC-101（FR-AUI-02①②③④）、TC-102/TC-104（FR-AUI-03①③）、TC-105/TC-106/TC-107/TC-108 自动面（FR-AUI-05①②③④）、TC-109/TC-110（FR-AUI-07①②④）、TC-112（FR-AUI-03④ + FR-AUI-07③ 快照）、TC-113（FR-AUI-04①②）全 PASS；P1 项 TC-103（FR-AUI-03②）尽力、不计门禁（澄清 #18 同构）。
  2. **功能等价逐条通过**（§8-7②）：等价域 TC-115~TC-136 全 PASS（判定载体 = 新 UI，FR-AUI-08③ 三件套：既有套件重指向 + golden 回放 + 双面板快照兜底）；其中 **FR-CHAT-11 五款**（TC-126(a)(b)(c) / TC-127(a)(b)(c)(d)，含 #16 就地更新与 #17 保守分支）与 **FR-CHAT-10 五子条**（TC-124(a)-(e)，维持既有口径，澄清 #19(a)）逐款判定全过；P2（FR-SESS-05/FR-CMD-04）二期口径不变（FR-AUI-08④）。
  3. **双面板可切换且行为一致快照**（§8-7③）：TC-111（可切换 + 行为冻结）+ TC-112（一致快照）PASS。
  4. **对外契约零变更 + 「实验」命名清零**（§8-7④）：TC-109（viewType `sdysyhj.chatView`、9 项既有命令、5 项配置逐项不变）+ TC-110（「实验/Lab」清零 + #19(b) 定名）PASS。
  5. **MANUAL 项四值处理**：TC-108/TC-111/TC-114/TC-125 的 MANUAL 部分按核验四值记 MANUAL（遗留不计 FAIL），其自动兜底（TC-106 + TC-108 注册断言 / TC-109+TC-110+TC-112 / TC-113 / TC-124+TC-123+TC-120+TC-129）全 PASS。
  6. **既有 verify 套件回归全绿 + §8 第 1–6 条 MVP 门禁新 UI 载体复验**（§8-7⑤）：TC-098(d)/TC-136(1) 既有套件全绿；§8-1~6 对应判定（TC-045/TC-046/TC-038/TC-042/TC-062 系等）在新 UI 载体复验通过（既有 TC 核验执行按验证计划/核验剧本进行）。
- **期望结果**：门禁要件 1–6 全部成立。
- **判定方式**：PASS = 1–6 全成立；FAIL = 任一要件不成立（0.1.8 发版阻塞项；处置不放宽断言、不静默降级——设计 §10.14 D10 回退预案：注册切换原子开关回退 / `sdysyhj.openChatClassic` 用户自救入口全程可用，失败证据上报总调度裁决）。
- **依据锚点（三源）**：需求基线 v0.7 §8 第 7 条 + 澄清 #18/#19；设计 §10.14 D9/D10（门禁处置与回退预案）；本文件 §2 覆盖矩阵 FR-AUI 修订行 + 等价域行 + §8-7 切换批次行。

> §8-2 由 TC-001/003/005/007 覆盖；§8-4 由 TC-038（崩溃恢复）+ TC-042（三平台）覆盖；§8-5（P0 逐条勾选）由全部 P0 自动 TC 覆盖；§8-6 由 TC-062/TC-065/TC-066/TC-069/TC-070 直接判定；§8-7（阶段①出口门禁，历史）由 TC-097 组合判定（v0.6，使命结束）；§8-7（**切换批次出口门禁**）由 TC-137 组合判定（v0.7）。

---

## 2. TC ↔ FR 覆盖矩阵

### 2.1 功能需求（38 条 FR 全集：MVP 30 + TASK-009 8——阶段① 6 + 切换批次新增 2）

| FR-id | 摘要 | 优先级 | TC-id | 判定等级 | 状态 |
|---|---|---|---|---|---|
| FR-CHAT-01 | 流式对话 | P0 | TC-001, TC-002, TC-115 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-002；TC-115 = 新 UI 等价域，v0.7） |
| FR-CHAT-02 | Markdown 渲染 | P0 | TC-003, TC-004, TC-116 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-004；TC-116 = 新 UI 等价域（语言集 ≥36/集外回退转义），v0.7） |
| FR-CHAT-03 | thinking 折叠 | P0 | TC-005, TC-006, TC-117 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-006；TC-117 = 新 UI 等价域，v0.7） |
| FR-CHAT-04 | 工具调用卡片 | P0 | TC-007, TC-008, TC-052, TC-118 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-008；TC-052 为 #D-04 回归锚点，v0.3 追加；TC-118 = 新 UI 等价域（全要素/状态收敛/截断+复制全部），v0.7） |
| FR-CHAT-05 | 中止运行 | P0 | TC-009, TC-010, TC-119 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-010；TC-119 = 新 UI 等价域，v0.7） |
| FR-CHAT-06 | steer 插话 | P1 | TC-011, TC-012, TC-120 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（P1 尽力；TC-120 = 新 UI 等价域，v0.7） |
| FR-CHAT-07 | 错误展示 | P0 | TC-013, TC-121 | 自动 | ✅ 已覆盖·可自动判定（TC-121 = 新 UI 等价域（含 #14 边界），v0.7） |
| FR-CHAT-08 | 状态指示 | P0 | TC-014, TC-015, TC-122 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-015；TC-122 = 新 UI 等价域，v0.7） |
| FR-CHAT-09 | 流式输出自动跟随 | P1 | TC-047, TC-048, TC-049, TC-050, TC-051, TC-123 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①②③④逐条对应 TC-047/048/049/050；UI 补充 TC-051；TC-123 = 新 UI 等价域四款逐款，v0.7；P1 尽力） |
| FR-CHAT-10 | 聊天面板视觉规范 | P1 | TC-053, TC-054, TC-055, TC-124, TC-125 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①②③→TC-053、④⑤→TC-054，CSS/DOM/正则口径逐条自动断言；UI 补充 TC-055 由 TC-053/TC-054 兜底；TC-124 = 新 UI 等价域五子条逐款（#19(a) 全维持口径）+ TC-125 真机观感 MANUAL（兜底 TC-124 等），v0.7） |
| FR-CHAT-11 | 用户消息单次展示 | P0 | TC-062, TC-063, TC-064, TC-065, TC-066, TC-067, TC-068, TC-069, TC-070, TC-071, TC-072, TC-073, TC-074, TC-075, TC-076 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①含前言计数单位口径→TC-062/063+golden TC-064、②→TC-065/066/067+golden TC-068、③→TC-069/070、④→TC-066/070/071/072/073/076、⑤→TC-074；UI 补充 TC-075 由 TC-062~TC-074、TC-076 兜底；外部行为期望均锚定 pi 权威文档行号；v0.5 新增，TC-076 为 v0.5.1 补遗——澄清 #17；TC-126/TC-127 = 新 UI 等价域五款（含 #16 就地更新/#17 保守分支），v0.7） |
| FR-SESS-01 | 新建会话 | P0 | TC-016, TC-132 | 自动 | ✅ 已覆盖·可自动判定（TC-132 = 新 UI 等价域（含 FR-SESS-04 重命名），v0.7） |
| FR-SESS-02 | 历史列表 | P0 | TC-017, TC-133 | 自动 | ✅ 已覆盖·可自动判定（点击手势以切换事件断言替代；TC-133 = 新 UI 等价域，v0.7） |
| FR-SESS-03 | 继续会话 | P0 | TC-018, TC-046, TC-134 | 自动 | ✅ 已覆盖·可自动判定（TC-134 = 新 UI 等价域（含 #5 重放一致），v0.7） |
| FR-SESS-04 | 会话命名 | P1 | TC-019, TC-132 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-132 等价域，v0.7） |
| FR-SESS-05 | 分支切换 | P2 | TC-020 | 延后 | 📅 二期/延后（显式列出，不计入门禁；载体平移不改二期口径，FR-AUI-08④/TC-136(2)，v0.7） |
| FR-SESS-06 | 单会话工作模式 | P0 | TC-021, TC-135 | 自动 | ✅ 已覆盖·可自动判定（TC-135 = 新 UI 等价域（含 FR-SESS-07），v0.7） |
| FR-SESS-07 | 外部修改提示 | P1 | TC-022, TC-135 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-135 等价域（≤5s 拦截/刷新），v0.7） |
| FR-FILE-01 | 工作区绑定 | P0 | TC-023, TC-136 | 自动 | ✅ 已覆盖·可自动判定（TC-136 复合重指向 SC-023 新 UI 载体，v0.7） |
| FR-FILE-02 | @file 引用（v0.4 修订：@ 唯一入口） | P0 | TC-024, TC-025, TC-061, TC-128 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-025；TC-061 判定 v0.4 修订句：无添加文件按钮 DOM 断言 + @ 唯一入口保持；TC-128 = 新 UI 等价域，v0.7） |
| FR-FILE-03 | 右键发送 | P1 | TC-026, TC-136 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-136 复合重指向 SC-026（input_prefill 预填新 UI），v0.7） |
| FR-MOD-01 | 切换模型（v0.4 增入口③） | P1 | TC-027, TC-058, TC-130 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-058 补底部内联选择器常显/弹出/切换与跨入口同步，v0.4；TC-130 = 新 UI 等价域（入口③+三入口同步+持久），v0.7） |
| FR-MOD-02 | 切换 thinking 等级 | P1 | TC-028, TC-136 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-136 复合重指向 SC-028，v0.7） |
| FR-MOD-03 | 会话内持久（v0.4 展示口径含底部选择器） | P1 | TC-029, TC-059, TC-130 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-059 钉入口③重启反映，v0.4；TC-130 等价域，v0.7） |
| FR-MOD-04 | 上下文用量指示 | P1 | TC-060, TC-131 | 自动 | ✅ 已覆盖·可自动判定（验收标准①-⑤ → SC-060a~e 逐条；TC-131 = 新 UI 等价域 SC-131a-d，v0.7；P1 尽力，v0.4 新增） |
| FR-CMD-01 | 命令面板 | P0 | TC-030, TC-136 | 自动（静态） | ✅ 已覆盖·可自动判定（TC-136 复合重指向 SC-030（5 命令注册），v0.7） |
| FR-CMD-02 | 输出日志 | P0 | TC-031, TC-136 | 自动 | ✅ 已覆盖·可自动判定（TC-136 复合重指向 SC-031，v0.7） |
| FR-CMD-03 | `/` 命令补全菜单 | P1（v0.4 转正） | TC-032, TC-056, TC-057, TC-129 | 自动 | ✅ 已覆盖·可自动判定（TC-056 判验收标准①②⑤、TC-057 判③④；TC-032 文本直发透传保留；TC-129 = 新 UI 等价域全链路①–⑤，v0.7；原 TC-033 延后状态撤销，v0.4） |
| FR-CMD-04 | MCP | P2 | TC-034 | 延后 | 📅 二期/延后（显式列出，不计入门禁；载体平移不改二期口径，FR-AUI-08④/TC-136(2)，v0.7） |
| FR-CMD-05 | pi 运行时来源 | P0 | TC-035, TC-136 | 自动 | ✅ 已覆盖·可自动判定（TC-136 复合重指向 SC-035，v0.7） |
| FR-AUI-01 | 独立实验面板（默认面板零变更） | P0（阶段①，已完结） | TC-077, TC-078, TC-079 | 自动 + 真机 MANUAL | ✅ 已覆盖·可自动判定（①③→TC-077 注册结构断言（含 retainContextWhenHidden 注册层，交叉 FR-AUI-05④）+TC-079 真机冒烟 MANUAL（兜底 TC-077）；②→TC-078 冻结面四项断言 + git 归组 + 既有套件全绿回归；v0.6 新增，TASK-009。**v0.7 注：使命结束（历史条款，不再产生新判定项）——本条约束由 FR-AUI-07 切换与退役语义取代** |
| FR-AUI-02 | 路线 B 单实现（v0.7 修订；历史：路线 A/B 双切片） | P0（切换批次） | TC-098, TC-099, TC-100, TC-101（历史阶段①：TC-080~TC-086） | 自动 | ✅ 已覆盖·可自动判定（①→TC-098 路线 A 淘汰 + 路线 B 单实现（#D-06 关闭）；②→TC-099 part 化映射消费端契约（#D-06 制度化核心）；③→TC-100 传输真实性（注入点低于 PiBridge）；④→TC-101 XSS 真实渲染 DOM 断言（自动升格）；v0.7 新增） |
| FR-AUI-03 | golden fixture 回放数据源（切换批次验收依据） | P0（切换批次）；②为 P1（切换批次） | TC-102, TC-103, TC-104, TC-112（历史阶段①：TC-085~TC-088） | 自动 | ✅ 已覆盖·可自动判定（①→TC-102 golden-prompt-basic 端到端真实 runtime DOM 断言（消息数 = 2 逐行推导）；②（P1 尽力）→TC-103 golden-steer-followup（消息数 = 6，乱序序列不丢不错换）；③方法约束→TC-104（无人值守/可重复/离线）；④→TC-112 双面板一致快照；v0.7 新增） |
| FR-AUI-04 | 主题映射验证（--vscode-* 变量） | P0（切换批次） | TC-113, TC-114（历史阶段①：TC-089, TC-090） | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（①②→TC-113 主题审计平移至默认面板（token 链/浅深联动/WCAG ≥4.5:1）；③→TC-114 浅/深截图 UI 手工 checklist（证据类型 = 截图，兜底 TC-113）；v0.7 载体平移新增，验收标准不变） |
| FR-AUI-05 | 风险门禁判定证据（v0.7 修订：预算新口径） | P0（切换批次） | TC-105, TC-106, TC-107, TC-108（历史阶段①：TC-091~TC-095） | 自动 + 真机 MANUAL | ✅ 已覆盖·可自动判定（①→TC-105 版本锁定 JSON 断言（修订清单：删 ai/ai-sdk + 增 react-markdown 链）+ 升级评估留痕；②→TC-106 CSP 指令集 + 回放运行时证据 + jitless 前置 + TC-108 真机零 violation MANUAL；③→TC-107 字节级预算（默认面板 ≤4,194,304 / 宿主增量 ≤1,048,576（v0.1.7 基线）/ Shiki 不进产物 / 经典面板依赖图无 React·assistant-ui）；④→TC-108 注册断言自动面 + 隐藏再显示 MANUAL；v0.7 新增） |
| FR-AUI-06 | 双切片对比报告（阶段①交付物） | P0（阶段①，已完结） | TC-096 | 自动 | ✅ 已覆盖·可自动判定（①②③→TC-096 报告结构断言：四维各成节 / 量化维度附命令+输出 / 时延 ≥5 次取中位 / 侵入面三组归类含默认面板冻结文件=空 / 结论中立零预设表述 / 升级评估留痕；v0.6 新增。**v0.7 注：使命结束（历史条款）——本批次不再双切片对比，路线结论 = 路线 B 主线、路线 A 淘汰（#D-06）** |
| FR-AUI-07 | 切换与旧面板退役（v0.7 新增） | P0（切换批次） | TC-109, TC-110, TC-111, TC-112 | 自动 + 真机 MANUAL | ✅ 已覆盖·可自动判定（①→TC-109 切默认（viewType `sdysyhj.chatView` 沿用 + openChat 接线）；②→TC-110 「实验/Lab」命名清零 + #19(b) 定名断言；③→TC-111 双面板可切换 + 行为冻结（MANUAL 冒烟）+ TC-112 一致快照；④→TC-109 契约零变更（9 命令 5 配置逐项不变）；v0.7 新增） |
| FR-AUI-08 | 功能等价口径（判定载体平移，v0.7 新增） | P0（切换批次） | TC-115~TC-136 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（①③→全部等价域 TC 在新 UI 载体逐条执行 + 既有套件重指向（TC-136）+ golden 回放（TC-102/103）+ 双面板快照（TC-112）兜底；②→FR-CHAT-11 五款（TC-126/127）与 FR-CHAT-10 五子条（TC-124）逐款判定 + 各能力等价 TC（TC-115~TC-135）；④→P2 二期口径不变（TC-136(2)）；v0.7 新增） |
| §8 第 7 条 | TASK-009 阶段①出口门禁（历史自检行，已完结） | P0（阶段①，复合） | TC-097 | 自动（组合判定） | ✅ 已覆盖·可自动判定（FR-AUI 全部 P0（阶段①）子条自动 TC 全 PASS + MANUAL 项四值处理与兜底全 PASS + 对比报告交付（TC-096）+ 默认面板零变更回归（TC-078）；P1 项 TC-087 尽力不计门禁（澄清 #18）；v0.6 新增。v0.7 注：阶段①已闭环，本行不再产生新判定） |
| §8 第 7 条 | TASK-009 **切换批次**出口门禁（v0.7 新增） | P0（切换批次，复合） | TC-137 | 自动（组合判定） | ✅ 已覆盖·可自动判定（① P0（切换批次）子条逐条（TC-098~TC-114）+ ② 功能等价逐条（TC-115~TC-136，含 FR-CHAT-11 五款/FR-CHAT-10 五子条逐款）+ ③ 双面板切换与一致快照（TC-111/112）+ ④ 契约零变更与命名清零（TC-109/110）+ ⑤ 既有套件回归与 MVP 门禁新 UI 载体复验；P1 项 TC-103 尽力不计门禁；v0.7 新增） |

**FR 计数核对**：CHAT 11 + SESS 7 + FILE 3 + MOD 4 + CMD 5 = **30/30 全部映射**（v0.3 新增 FR-CHAT-09；v0.4 新增 FR-CHAT-10、FR-MOD-04，FR-CMD-03 由 P2 转正 P1；v0.5 新增 FR-CHAT-11）。P0 = 17 条（全部可自动判定）；P1 = 11 条（全部有自动 TC）；P2 = 2 条（整条延后，均显式列出）。另：TASK-009 阶段①新增 FR-AUI-01~06 = **6/6 全部映射**（v0.6；含 §8-7 门禁自检行 TC-097）——P0（阶段①）子条全部具备自动判定 TC（DOM 行为层/真机层 6 项 MANUAL 均有自动兜底），P1（阶段①）1 项（FR-AUI-03②，TC-087 尽力）；阶段①优先级不入 §8-5 MVP P0 门禁（澄清 #18），入 §8-7 阶段①出口门禁。**v0.7 追加**：TASK-009 切换批次新增 FR-AUI-07/08 = **2/2 全部映射**（TC-109~TC-112 / TC-115~TC-136）；FR-AUI-02/03/04/05 修订版映射 TC-098~TC-108、TC-113/TC-114；FR-AUI 合计 8 条（FR 全集 38 = MVP 30 + TASK-009 8）。等价域 TC-115~TC-136 覆盖 §4.1–4.5 全部 FR 的新 UI 载体判定（逐能力 TC 见矩阵各行；宿主侧/命令面板层 6 条 FR 由复合 TC-136 逐场景承载），P2 两项二期口径不变（FR-AUI-08④）；切换批次出口门禁 = TC-137（§2.1 新增行）。

### 2.2 非功能需求（NFR 补充矩阵）

| NFR-id | 摘要 | TC-id | 判定等级 | 状态 |
|---|---|---|---|---|
| NFR-01 | 性能（不掉帧/状态不丢/10k+ tokens） | TC-036, TC-037 | 自动（代理指标）+ 录屏辅助 | ✅ 已覆盖（量化阈值待基线确认） |
| NFR-02 | 稳定性（崩溃重启/宿主隔离） | TC-038 | 自动 | ✅ 已覆盖·可自动判定 |
| NFR-03 | 安全（日志脱敏 / 防 XSS / 会话数据位置） | TC-039（脱敏）、TC-040（XSS）、TC-041（数据位置） | 自动 | ✅ 已覆盖·可自动判定（任务要求的脱敏、防 XSS 各有独立 TC） |
| NFR-04 | 兼容性（VS Code ≥1.85 / 三平台 / 免装 Node） | TC-042 | 自动 + CI checklist | ⚠ 自动项覆盖；三平台以 CI 日志证据判定 |
| NFR-05 | 可观测（关键路径日志/可行动建议） | TC-043 | 自动 | ✅ 已覆盖·可自动判定 |
| NFR-06 | 可卸载（无残留） | TC-044 | 自动 | ✅ 已覆盖·可自动判定 |

### 2.3 覆盖自检结论

1. **FR 全覆盖**：30/30 条 MVP FR 均有 TC 映射（v0.3 起含 FR-CHAT-09；v0.4 起含 FR-CHAT-10、FR-MOD-04；v0.5 起含 FR-CHAT-11），无遗漏；无 TC 脱离 FR/验收汇总（TC-045/046 映射 §8 验收条目并复合映射其依赖 FR；TC-047~TC-051 映射 FR-CHAT-09 验收标准①②③④+UI；TC-052 属 FR-CHAT-04 既有验收的 #D-04 场景补充，无需求变更；TC-053~TC-055 映射 FR-CHAT-10 验收标准①②③④⑤+UI，TC-056/TC-057 映射 FR-CMD-03 验收标准①-⑤，TC-058 映射 FR-MOD-01 入口③与跨入口同步，TC-059 映射 FR-MOD-03 v0.4 展示口径，TC-060 映射 FR-MOD-04 验收标准①-⑤，TC-061 映射 FR-FILE-02 v0.4 修订句；TC-062~TC-076 映射 FR-CHAT-11 验收标准①（含前言计数单位口径）②③④（含澄清 #17 不可关联例外）⑤+UI 及 §8 第 6 条显式门槛）；v0.6 起新增 FR-AUI-01~06（6/6）与 §8 第 7 条门禁自检行全部映射（TC-077~TC-096 映射见 FR-AUI 共用约定节首段与 §2.1 矩阵行；TC-097 映射 §8-7）。
2. **P0 逐条可判定**：17 条 MVP P0 FR 全部具备**自动判定** TC（TC-001/003/005/007/009/013/014/016/017/018/021/023/024/030/031/035；v0.3 另为 FR-CHAT-04 追加 #D-04 回归 TC-052；v0.4 另为 FR-FILE-02 修订句追加 TC-061；v0.5 新增 FR-CHAT-11 由 TC-062~TC-076（UI 补充 TC-075 除外）全自动判定——每条含确定性 SC-xxx 场景与行为断言，判定时点/采样在事件处理边界进行、无时钟依赖；TC-076 为 v0.5.1 补遗（澄清 #17）），每条给出确定性命令/脚本与 PASS/FAIL 判据。v0.6 新增：FR-AUI-01~06 全部「P0（阶段①）」子条均具备自动判定 TC（TC-077/078/080/081/083/085/086/088/089/091/092/094/096——判定面依设计 D8 落「通道 + 数据」层与静态结构层，期望值由 golden fixture 逐行推导 / 字节级公式 / WCAG 公式可复算），DOM 行为层与真机层 6 项按核验四值 MANUAL 处理且均有自动兜底（澄清 #18：阶段① P0 口径，入 §8-7 门禁）。
3. **P1 尽力覆盖**：11 条 MVP P1 FR 全部有自动 TC（TC-011/019/022/026/027/028/029，v0.3 新增 FR-CHAT-09 的 TC-047/048/049/050，及 v0.4：FR-CHAT-10 的 TC-053/054、FR-CMD-03 转正后的 TC-056/057、FR-MOD-01③ 的 TC-058、FR-MOD-03 的 TC-059、FR-MOD-04 的 TC-060），判定依赖 mock 调用记录、状态断言、DOM/计算样式断言与滚动位置采样，可无人执行；v0.6 新增 P1（阶段①）项 FR-AUI-03② → TC-087（双切片 golden-steer-followup 回放，尽力、不计 §8-7 门禁，澄清 #18）。
4. **P2 显式列出**：FR-SESS-05（TC-020）、FR-CMD-04（TC-034）整条延后，均在矩阵中标注 📅 二期/延后，不计入 MVP 门禁；FR-CMD-03 原 P2 拆分口径（TC-033 延后）随基线 v0.4 转正 P1（§11）而撤销，由 TC-056/TC-057 全链路判定。
5. **安全要求**：NFR-03 的**日志脱敏**（TC-039，随机哨兵在被测产物/日志中 rg 零命中）与**防 XSS**（TC-040，7 载荷×4 断言）各有独立自动 TC；另附 TC-041（会话数据位置）、TC-031(d)（日志通道脱敏交叉）加固。
6. **UI 交互项纪律**：MVP 段共 11 项 UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025/051/055/075），均标注证据类型（截图/录屏/命令调用日志/剪贴板落盘/滚动位置采样数据/两档宽度截图），且其 FR **均另有自动 TC 兜底**（TC-001/003/005/007/009/011/014/024，TC-047~TC-050 兜底 TC-051，TC-053/TC-054 兜底 TC-055，TC-062~TC-074、TC-076 兜底 TC-075）；"点击 Stop/点击切换/点击菜单项/滚动"类手势一律以命令注册断言、RPC 调用记录、状态事件断言、DOM 事件派发、滚动位置采样序列做自动兜底判定。v0.6 新增阶段①真机 MANUAL 6 项（TC-079/082/084/090/093/095——均标注证据类型：截图/录屏/devtools 记录/哨兵取值/主题名注明；均按核验判定四值 MANUAL 处理且各有自动兜底：TC-077 / TC-081 / TC-083+TC-085+TC-086 / TC-089 / TC-092+TC-085+TC-086 / TC-077(d)，见 FR-AUI 共用约定；依设计 D8 可在一次真机会话内汇总执行）。
7. **环境约束**：全部用例可在**无真实 API key、无外网**（仅 npm ci 例外）下执行：临时 HOME 隔离凭证与会话、本地 mock 场景（MOCK-*，v0.4 增补 MOCK-CMD / MOCK-USAGE，v0.5 增补 MOCK-ECHO-REWRITE / MOCK-QUEUE-MIX / MOCK-REJECT / MOCK-HANDLED 与 golden 回放 GOLDEN-BASIC / GOLDEN-MIX，v0.6 增补 LAB-XSS，且 v0.5 起一切运行链路 mock 按权威文档补发 user 回声——§0.3；golden fixture 已于 TASK-008 交付落位 `test/fixtures/golden/`——§0.3 v0.6 注）；哨兵假凭证；标准自测命令仅约定 `npm run verify:unit` / `npm run verify:integration`；阶段①用例数据源 = 仓库内静态 golden fixture，不接真实 pi / 真实 provider（TC-088 离线/可重复判定）。
8. **盲写纪律**：用例仅从 docs/requirements.md 推导（TC-001~TC-046 对应基线 v0.2，TC-047~TC-052 对应基线 v0.3，TC-053~TC-061 对应基线 v0.4）；TC-052 的时序场景背景取自任务单 TASK-005 §1（#D-04 缺陷单，本阶段许可输入），断言本身仅锚定 FR-CHAT-04 既有验收标准；TC-053~TC-061 的素材↔FR 对应关系取自任务单 TASK-006 §1 素材映射表（本阶段许可输入，仅用于确认对应关系，不构成断言来源），断言本身仅锚定 docs/requirements.md v0.4 验收标准；**TC-062~TC-076（v0.5；TC-076 为 v0.5.1 补遗，判据依澄清 #17）依据三源：需求基线 v0.5/v0.5.1 + 设计基线冻结快照 `7f4e586`（§10.12/§11 等）+ 其 §11 清单登记的 pi 1.5.2 权威文档，全部外部行为期望均锚定权威文档行号（json.md/rpc.md/rpc-commands.md/extensions.md），未以我方 mock 行为为期望源**；**TC-077~TC-097（v0.6，TASK-009 阶段①）依据三源：需求基线 v0.6（§4.6/澄清 #12/#18/§8-7）+ 设计基线冻结快照 `42f5e86`（§10.13 D1–D9/§6/§11 #11–#18）+ @assistant-ui 生态外部权威（npm README 节名 / npm tarball src 路径与协议常量（channel `aui-vscode`、`fetch:*` 帧型、flush 16ms/64KB）/ 官方指南章节原文（"The bridge needs no connect-src entry…"、zod-jitless 片段、Hidden views、Bundle both sides）/ `@assistant-ui/react` 官方文档 / React 官方文档 / microsoft/vscode theme-defaults）+ golden fixture（`test/fixtures/golden/` 文件本体，期望值逐行推导），未以我方 mock 行为为期望源**；本阶段仅产出 docs/test-cases.md，未读取实现侧内容（唯一例外 = golden fixture 文件本体，属设计登记的外部期望源），无 git 写操作。
9. **遗留**：11 项需求歧义/缺漏（§3）此前已上报总调度，未自行脑补实现；其中第 1-10 项已由基线 v0.2.1 §12 #1-#10 裁决（既有 TC-001~TC-046 对应断言的收紧不属本次改动范围），第 11 项为备忘性处理（自动兜底 + UI checklist）。本次新增 TC-047~TC-052 未发现新歧义：FR-CHAT-09 验收口径（40px 阈值、每轮流式开始重置、瞬时状态不持久化、idle 例外）均可判定，无上报项。v0.4 新增 TC-053~TC-061 亦未发现阻塞歧义；唯一用例侧判定口径（FR-MOD-04③ token 数值允许千分位/k 缩写并存，k 缩写精度需求未定义——TC-060 以解析容差 ≤1% 判定）已在 TC-060 章节引言披露，如需固化精度请总调度裁决。v0.5 新增 TC-062~TC-076 未发现阻塞歧义，三处用例侧口径披露见 FR-CHAT-11 章节引言（TC-067 两条回声相对次序不判定 / TC-066 不依赖 queue_update 与回声先后次序 / 设计 D2.2 多通道不可判定保守分支与澄清 #16 的张力——已由总调度裁决为澄清 #17（需求基线 v0.5.1 §12），判定用例 TC-076）。
10. **缺陷回归锚点**：TASK-005 §1 #D-04（FR-CHAT-04 工具卡状态恒“进行中”，P1）由 TC-052 以实现无关时序契约回归判定（工具执行结果晚于携带工具卡的助手消息到达 → 直播路径状态收敛“成功/失败”）；#D-04 修复后的重新核验以 TC-052 PASS 为判定项之一。TASK-008 用户消息重复气泡缺陷（通道 A 批次三条目①，FR-CHAT-11）回归锚点 = TC-062（基本单条三判定时点）/ TC-063（同文本不合并）/ TC-069/TC-070（重放不重复），缺陷修复后的重新核验以之为判定项。
11. **阶段①出口门禁自检（v0.6，需求 §8 第 7 条 + 澄清 #18）**：§4.6 FR-AUI-01~06 全部「P0（阶段①）」子条均有逐条可判定的自动 TC（见第 2 条）；6 项真机 MANUAL（TC-079/082/084/090/093/095）均有自动兜底且四值处理不计 FAIL；双切片对比报告交付判定 = TC-096；默认面板零变更与既有 MVP 门禁回归 = TC-078；门禁汇总判定 = TC-097（§2.1 矩阵含「§8 第 7 条·阶段①出口门禁」自检行）；阶段①优先级不入 §8-5 MVP 门禁。
12. **切换批次出口门禁自检（v0.7，需求 §8 第 7 条切换批次口径）**：① §4.6 全部「P0（切换批次）」子条（FR-AUI-02①②③④/03①③④/04①②/05①②③④/07①②③④/08）均有逐条可判定的自动 TC（TC-098~TC-113，判定面 = 消费端真实 runtime DOM 断言 + 静态结构/字节级断言，期望值可推导：golden 消息数 2/6、hljs 语言数 36、预算 4,194,304/1,048,576/459,382 字节）；② 功能等价 = §4.1–4.5 全部 FR 在新 UI 载体逐条可判定（逐能力 TC-115~TC-135 + 复合 TC-136 逐场景，FR-CHAT-11 五款（TC-126/127）与 FR-CHAT-10 五子条（TC-124）逐款）；③ 双面板切换与一致快照 = TC-111/TC-112；④ 契约零变更与命名清零 = TC-109/TC-110；⑤ MANUAL 4 项（TC-108/111/114/125）均有自动兜底且四值处理不计 FAIL；⑥ 门禁汇总判定 = TC-137；P1 项 FR-AUI-03②（TC-103）尽力不计门禁（澄清 #18 同构）。
13. **#D-06 制度化落地核对（v0.7）**：消费端契约 TC（TC-099/102/103/112/115~127）全部以**真实 ExternalStoreRuntime + 组件消费后的 DOM 断言**为门禁面（共用约定「禁 store 层驱动绕开」显式标注），期望源 = `fromThreadMessageLike` 随包源码 throw/丢弃语义（行号锚定）+ golden fixture，不以我方 mock/映射实现为期望源（规范 §5.6）；外部行为锚点三源齐全（需求 FR + 设计 §10.14/§6 + §11 #19–#23 外部权威）。

---

## 3. 发现的需求歧义/缺漏（上报总调度，不自行脑补）

| # | 位置 | 问题 | 用例当前处理 | 建议 |
|---|---|---|---|---|
| 1 | FR-CMD-03 | 优先级 P2，但验收标准含"MVP 阶段命令文本直接发送即可生效"——MVP 门禁边界模糊 | 拆为 TC-032（本期判定）与 TC-033（延后） | 产品 Agent 明确：MVP 门禁是否含"文本直发生效" |
| 2 | FR-CHAT-04 | "大输出截断保留尾部"未定义阈值（多大算大/保留多少尾部） | TC-007 只断言行为存在（截断+保留尾部+复制全部=完整），不断言阈值 | 基线补充默认阈值与保留策略 |
| 3 | NFR-01 | "不掉帧/流畅"无量化指标（掉帧阈值、10k tokens 时间预算） | TC-036 用代理指标（零丢失+时间预算建议值+批处理迹象） | 基线补充量化门槛 |
| 4 | FR-CMD-05 | "PATH 中存在**可用** pi"的判定标准未定义（版本检查？`pi --version`？启动成功？） | TC-035 以"启动成功并完成一次 mock 对话"为可用判据 | 基线补充"可用"判据 |
| 5 | FR-SESS-03 | "与 pi 端行为一致"缺可判定边界 | TC-018 以"同一会话 JSONL 续写 + 状态快照相等（含压缩状态）"近似 | 基线明确等价判据 |
| 6 | FR-CHAT-08 vs §7 | §7 布局注明状态栏"点击可切换"，但 FR-CHAT-08 验收未含交互 | 切换行为归 FR-MOD-01/02（TC-027/028）判定，TC-015 仅查可见性 | 明确交互归属 |
| 7 | FR-SESS-07 | 外部修改检测需要定位当前会话文件，但会话文件路径/格式仅说"pi 原有位置" | TC-022 由场景从会话状态取 `$SESSION_FILE`，fixture 经插件自身创建以规避格式知识 | 技术基线/核验剧本明确会话存储路径 |
| 8 | NFR-03 | "会话数据仅存 pi 原有位置"的精确边界未定义（`~/.pi/agent/`？含哪些子目录？） | TC-041 以"`$HOME/.pi/` 之外无新增会话/状态文件"为界 | 基线明确位置边界 |
| 9 | §8-1 | "从零安装插件"在离线/CI 环境的等价物未定义 | TC-045 以 `vsce package` + 本地安装 vsix 近似 | 确认离线等价口径 |
| 10 | FR-MOD-02 | thinking 等级枚举值未定义（§7 显示 "high"） | TC-028 仅断言"可切换+持久"，不断言具体枚举 | 基线补充枚举取值 |
| 11 | FR-CHAT-05/SESS-02 等 | "点击 Stop/点击"类手势与自动化边界 | 一律给自动兜底（命令/事件/状态断言）+ UI checklist 项 | 无需修改需求，仅备忘核验时 UI 项凭证据判定 |
| 12 | FR-AUI-05③ / FR-AUI-06③（v0.6） | 宿主 bundle 增量与代码侵入面的「基线」未钉死唯一锚点：设计 §10.13 D7③ 表述为「阶段①实现前的发版标签/提交」——候选 = 阶段①前最后发版标签（v0.1.6）或审批点 1b 提交（`6738d13`），两者 diff 面不同，直接影响字节增量与 `git diff --stat` 数值；另「共享文件增量」中 `docs/technical-design.md`（交付期追溯表+报告）是否计入侵入面统计未明示 | TC-078/TC-094/TC-096 缺省取「阶段①实现前最后发版标签」为基线（与 D6「基线 = 干净检出基线提交的构建产物」口径一致），侵入面统计默认含全部 git 变更文件（按三组归类各归其组，文档与代码不区分） | 总调度裁决钉死唯一基线锚点（建议 = 最后发版标签）与文档类文件是否计入统计；裁决后核验剧本同步 → **已裁决（2026-11-21，审批点 2，总调度）**：① 度量基线一律 = **v0.1.6 发版标签（tag `v0.1.6`，commit `e9fc9d8`）**——阶段①下一版为 0.1.7，相对最后发版的增量才是发版将携带的真实增量，且标签是唯一不可变锚点；② 侵入面「三组归类」**不含 `docs/**`**——technical-design.md 追溯表/对比报告属文档留痕，另列第四「文档留痕（信息组，不计侵入面）」呈现。TC-094/TC-096 已按裁决钉死措辞，核验剧本同步 |
| 13 | FR-AUI-05③（v0.7） | 宿主 bundle 增量的「基线 = v0.1.7 构建产物 dist/extension.js（实测 459,382 字节）」的**执行口径**未明示产物来源（发版标签检出重建 vs 交付保存产物）；与 §3 第 12 条同构问题（基线锚点唯一性） | TC-107 缺省取 **tag `v0.1.7` 检出同命令构建产物**为基线（与第 12 条裁决同构：以发版标签构建产物为锚），实测值 459,382 字节作校验参考（偏差 >±10% 须留痕说明） | 请总调度确认执行口径（建议同第 12 条：发版标签检出重建）；裁决后核验剧本同步 |

---

## 修订记录

| 日期 | 版本 | 改动点 |
|---|---|---|
| 2026-11-17 | v0.1 | 初稿（盲写产出）。 |
| 2026-11-17 | v0.2 | 消息数口径修正（总调度裁决：FR-SESS-02"消息数"= 会话内消息总数 user+assistant 合计；TC-017(b) 期望值 2/5/9 → 4/10/18、TC-046 期望值 4 → 8，均附计算说明）+ 3 项断言方法学修正（① TC-026 菜单断言改结构化解析、不断言标题字面文本；② TC-039 哨兵执行时随机生成、断言对象限定被测产物/日志并排除定义源文档，消除自命中；③ §0 中 SC-xxx/calls.jsonl 契约改实现无关表述，逻辑场景↔套件输出映射移交核验剧本建立）。 |
| 2026-11-20 | v0.3 | TASK-005 追加（依据基线 v0.3）：① 新增 FR-CHAT-09「流式输出自动跟随」（P1）用例 TC-047~TC-051——逐条覆盖验收标准 ①默认跟随（含每轮流式开始重置跟随态，TC-047）/②40px 打断与滚动位置保持（TC-048）/③滚回恢复（TC-049）/④不持久化与 idle 不滚动（TC-050）；UI 手势与视觉项 TC-051 标 UI 手工 checklist + 证据类型，由 TC-047~TC-050 自动兜底（SC-xxx 逻辑场景、实现无关契约，与套件输出的映射留核验剧本）；② FR-CHAT-04 既有验收下追加 #D-04 回归用例 TC-052（工具执行结果晚于含工具卡的助手消息到达时，卡片状态由“进行中”更新为“成功/失败”）；③ §0.3 增补 MOCK-TOOLS-LATE / MOCK-TOOLS-FAIL 两行；④ §2 矩阵更新为 27/27（新增 FR-CHAT-09 行、FR-CHAT-04 增 TC-052）并同步自检结论；⑤ 头部依据基线 v0.2 → v0.3，版本号递增。 |
| 2026-11-20 | v0.4 | TASK-006 追加（依据基线 v0.4，盲写）：① 新增 FR-CHAT-10「聊天面板视觉规范」（P1）用例 TC-053~TC-055——TC-053 断验收标准①②③（内容列 max-width 960px + margin auto、输入框 border-radius 8px、发送按钮图标化且可访问名称="发送"，CSS/DOM 口径自动断言）、TC-054 断④⑤（用户右气泡/助手左无气泡、时间戳 `^\d{2}:\d{2}$` 且无 User/Assistant 角色前缀，DOM/计算样式/正则口径）、TC-055 视觉连续性 UI 手工 checklist（由 TC-053/TC-054 自动兜底）；② FR-CMD-03 转正 P1：新增 TC-056（出现条件/数据源与实时过滤/空数据表现，验收标准①②⑤）与 TC-057（↑↓ 导航、Enter 选中插入不发送、Esc 关闭、鼠标等价，验收标准③④），TC-033 延后状态撤销；③ 新增 FR-MOD-01 入口③ 用例 TC-058（底部选择器常显/弹出/切换与跨入口同步）与 FR-MOD-03 用例 TC-059（重启后底部选择器反映切换）；④ 新增 FR-MOD-04「上下文用量指示」用例 TC-060（SC-060a~e 逐条：权威取值/百分比四舍五入/新消息与会话切换刷新/无助手消息"—"占位/compaction 不受影响）；⑤ 新增 FR-FILE-02 v0.4 修订句用例 TC-061（输入区无"添加文件"按钮 DOM 断言 + @ 唯一入口保持）；⑥ §0.3 增补 MOCK-CMD / MOCK-USAGE 两行；⑦ §2 矩阵更新为 29/29（新增 FR-CHAT-10/FR-MOD-04 行，FR-CMD-03 转 P1，FR-FILE-02/MOD-01/MOD-03 行增补）并同步自检结论（含 TC-060 解析容差口径披露）；⑧ 头部依据基线 v0.3 → v0.4，版本号递增。 |
| 2026-11-21 | v0.5 | TASK-008 追加（依据三源：需求基线 v0.5 + 设计基线冻结快照 7f4e586 + 其 §11 外部契约清单登记的 pi 1.5.2 随附权威文档；盲写）：① 新增 FR-CHAT-11「用户消息单次展示」（P0）用例 TC-062~TC-075——TC-062/TC-063 判验收标准①（三判定时点恰一条、发送即时不等待回声 / 同文本多次独立发送不跨发送合并，期望值 N 次发送 → N 条 user + N 条 assistant 附推导）、TC-064 golden 回放兜底；TC-065/TC-066/TC-067 判②（steer 轮间注入回声单条 / follow_up 停后注入 + steer·follow_up 混合乱序回声不错换 / abort 后队列保留·迟到回声不污染新发送）、TC-068 golden 兜底；TC-069/TC-070 判③（面板重开 / 会话切换历史重放单条且与会话 JSONL 一致，澄清 #5）；TC-071/TC-072/TC-073 判④（澄清 #16 pi 权威文本单条就地更新 / success:false 受理前拒绝路径 / disposition=handled 无回声路径——均单条且不污染后续关联）；TC-074 判⑤回归边界（assistant 流式/thinking/工具卡不受影响）；TC-075 观感 UI 手工 checklist（由 TC-062~TC-074 自动兜底）；② §0.3 增补 MOCK-ECHO-REWRITE / MOCK-QUEUE-MIX / MOCK-REJECT / MOCK-HANDLED 四行 + v0.5 mock 对齐增补（一切运行链路剧本按 json.md L30–46 补发 user 回声，外部期望源 = 权威文档而非我方 mock）+ golden 回放场景（GOLDEN-BASIC / GOLDEN-MIX，设计 §10.12 D8）说明；③ §2 矩阵更新为 30/30（新增 FR-CHAT-11 行，P0 计 16→17）并同步自检结论（含三处用例侧口径披露）；④ 头部依据声明升级为三源口径（规范第一部分 §5 第 7 条）、盲写声明与写权限声明更新，版本号递增。 |
| 2026-11-21 | v0.5.1 | 审批点 2 第一轮退回补遗（总调度裁决：澄清 #17 落档需求基线 v0.5.1 §12）：① 新增 TC-076（FR-CHAT-11①④ 不可关联回声·多通道不可判定保守分支——判据依 #17 原文与设计基线 §10.12 D2.2：各条目恒 1 条、文本不错换、不新增 + 权威重建后收敛会话 JSONL；§0.3 MOCK-QUEUE-MIX 增不可关联回声分支）；② FR-CHAT-11 章节口径披露③ 更新为指向已裁决的 #17；③ 头部依据声明 TC 区间 TC-062~TC-075 → TC-062~TC-076、§2 矩阵与自检结论同步（含 TC-075 兜底集合补 TC-076）；④ 版本号 v0.5 → v0.5.1。其余内容零改动。 |
| 2026-11-21 | v0.6 | TASK-009 阶段①追加（依据三源：需求基线 v0.6 §4.6/澄清 #12/#18/§8-7 + 设计基线冻结快照 `42f5e86`（§10.13 D1–D9/§6/§11 #11–#18）+ @assistant-ui 生态外部权威（npm README/tarball src/官方指南/react 官方文档/theme-defaults）+ golden fixture 文件本体；盲写，实现并行中互不可见）：① 新增「FR-AUI 实验面板共用约定」节（观察契约：判定面 = 通道+数据层、回放注入点低于适配层防自证、MANUAL 四值、阶段①不做项护栏；三处口径披露）；② 新增 FR-AUI-01~06 六节用例 TC-077~TC-096——TC-077（①③注册结构断言，含 retainContextWhenHidden 注册层）/TC-078（②零变更冻结面四项 + git 归组 + 既有套件全绿）/TC-079（真机冒烟 MANUAL）；TC-080（④传输真实性：aui-vscode 通道帧观测）/TC-081（⑤XSS 自动兜底：通道文本保真 + 消毒 API 禁令扫描）/TC-082（⑤DOM 层 MANUAL）/TC-083（⑥双切片共存自动面）/TC-084（⑥切换冒烟 MANUAL）；TC-085/TC-086（03①双切片 golden-prompt-basic 回放，期望消息数 = 2 = user 1 + assistant 1，文本 = fixture message_end 权威文本，逐行推导）/TC-087（03② P1 golden-steer-followup 双切片，消息数 = 6，乱序回声序列完整）/TC-088（03③方法约束：无人值守/可重复/离线）；TC-089（04①②主题审计静态解析层：token 链/WCAG 公式 ≥4.5:1）/TC-090（04③浅深截图 MANUAL）；TC-091（05①版本锁定 JSON 断言）/TC-092（05②CSP 指令集 + 回放运行时证据 + jitless 前置）/TC-093（05②真机零 violation MANUAL）/TC-094（05③字节级预算 3,145,728/1,048,576 + 默认依赖图）/TC-095（05④隐藏再显示 MANUAL，兜底 TC-077(d)）；TC-096（06 报告结构断言：四维各成节/命令+输出/≥5 次中位/三组归类/结论中立/升级评估留痕）；③ 新增 TC-097（§8 第 7 条阶段①出口门禁组合判定）；④ §0.3 增 LAB-XSS 行 + golden fixture 落位 v0.6 注；⑤ §2 矩阵增 FR-AUI 六行 + 「§8 第 7 条」门禁自检行，计数 30+6=36，自检结论同步（第 1/2/3/6/7/8 条更新 + 新增第 11 条阶段①门禁自检）；⑥ §3 新增第 12 条上报（基线提交锚点未钉死）；⑦ 头部依据/盲写声明更新（设计快照双版本 7f4e586/42f5e86 分段；golden fixture 例外披露），版本号 v0.5.1 → v0.6；⑧ 审批点 2 预受理裁决落档（2026-11-21，总调度）：度量基线锚点一律 = v0.1.6 发版标签（tag `v0.1.6`，commit `e9fc9d8`）、侵入面三组归类不含 `docs/**`（docs 变更另列第四「文档留痕（信息组，不计侵入面）」组）——§3 第 12 条补裁决结论，TC-094/TC-096 按裁决钉死措辞，共用口径披露③ 同步。 |
| 2026-11-22 | v0.7 | TASK-009 切换批次追加（依据三源：需求基线 v0.7（§4 判定载体注记 + §4.6 FR-AUI-02/03/04/05/07/08 修订版与新增 + §5 切换批次不做项 + §8-7 切换批次出口门禁 + 澄清 #5/#12/#16/#17/#18/#19）+ 设计基线冻结快照 `fab4190`（§10.14 D1–D10 / §6 新 UI 消费端契约行 / §11 #19–#23）+ 切换批次外部锚点（`@assistant-ui/core@0.3.37` `thread-message-like.js` 随包源码（#D-06 消费端锚点，行号锚定）/ `@assistant-ui/react-markdown@0.14.26` 导出面 / react-markdown 10.1.0 + remark-gfm/remark-breaks / highlight.js 11.12.0 `lib/common` 36 语言清单 / pi 1.5.2 随附 docs / golden fixture 本体逐行推导）；盲写，实现并行中互不可见）：① 新增「FR-AUI 切换批次共用约定」节（消费端契约判定面 = 真实 ExternalStoreRuntime + 组件 DOM 断言、**禁 store 层驱动绕开**（#D-06 制度化）、消费端锚点行号、回放注入点、等价判定口径、MANUAL 四值与兜底映射、四条口径披露）；② 新增 FR-AUI-02/03/05/07/04（载体平移）修订用例 TC-098~TC-114——TC-098（①路线 A 淘汰 + 路线 B 单实现）/TC-099（②part 化映射消费端契约（#D-06 制度化核心：L47 status throw / L57·L62 空文本丢弃 / L76–95 tool-call 保真 / L112 metadata.custom 透传 / L131–134 user part throw））/TC-100（③传输真实性）/TC-101（④XSS 真实渲染 DOM 断言，自动升格）；TC-102（03①golden-prompt-basic 端到端真实 runtime DOM 断言，消息数 = 2 逐行推导）/TC-103（03② P1 golden-steer-followup，消息数 = 6，乱序不丢不错换）/TC-104（03③方法约束）；TC-105（05①版本锁定修订清单（删 ai/ai-sdk + 增 react-markdown 链）+ 升级评估留痕）/TC-106（05②CSP + 回放运行时证据 + jitless 前置）/TC-107（05③预算 v0.7 口径：默认面板 ≤4,194,304 B / 宿主增量 ≤1,048,576 B（v0.1.7 基线 459,382 B）/ Shiki 不进产物 / 经典面板依赖图无 React）/TC-108（05④retainContextWhenHidden 注册断言 + 真机层 MANUAL）；TC-109（07①④切默认 + 契约零变更：9 命令 5 配置逐项）/TC-110（07②「实验/Lab」命名清零 + #19(b) 定名）/TC-111（07③双面板可切换 + 行为冻结）/TC-112（03④+07③双面板一致快照）；TC-113/TC-114（04①②③主题审计/截图载体平移）；③ 新增 FR-AUI-08 等价域用例 TC-115~TC-136（逐能力：FR-CHAT-01 流式 TC-115 / 02 Markdown+高亮（36 语言集 + 集外回退转义）TC-116 / 03 thinking 折叠 TC-117 / 04 工具卡全要素 TC-118 / 05 中止 TC-119 / 06 steer·followUp TC-120 / 07 错误（含 #14 边界）TC-121 / 08 状态 TC-122 / 09 跟随四款 TC-123 / 10 视觉五子条 TC-124（#19(a) 口径）+ 真机观感 MANUAL TC-125 / 11 单气泡五款 TC-126/TC-127（含 #16 就地更新/#17 保守分支）/ FR-FILE-02 TC-128 / FR-CMD-03 TC-129 / FR-MOD-01③·03·04 TC-130/TC-131 / FR-SESS 系 TC-132~TC-135 / 宿主侧复合重指向 TC-136）；④ 新增 TC-137（§8-7 切换批次出口门禁组合判定）；⑤ §0.3 增切换批次数据源注（LAB-XSS→UI-XSS 改名、等价域 MOCK 复用、golden 期望推导）；⑥ §2.1 矩阵：标题改 38 条 FR 全集、§4.x 各行增等价域 TC、FR-AUI-01/06 标历史使命结束、FR-AUI-02/03/04/05 行修订、新增 FR-AUI-07/08 行与「§8-7 切换批次出口门禁」行、FR 计数核对同步；⑦ §2.3 新增第 12/13 条（切换批次门禁自检 + #D-06 制度化落地核对）；⑧ §3 新增第 13 条上报（FR-AUI-05③ 宿主增量基线执行口径——缺省取 tag `v0.1.7` 检出构建，待裁决确认）；⑨ 头部依据/盲写声明更新（冻结快照 `fab4190` 分段、node_modules 契约面读取披露：「盲实现、不盲契约」），版本号 v0.6 → v0.7。既有 TC-001~TC-097 零改动（TC-097 保留为阶段①历史门禁）。 |

---

*本文件为测试 Agent（写用例阶段）唯一产物，交付审批点 2 裁决。*

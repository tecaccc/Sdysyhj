# Sdysyhj 测试用例基线（docs/test-cases.md）

> 产出：测试 Agent（写用例阶段，TASK-001；v0.3 追加：TASK-005；v0.4 追加：TASK-006；v0.5 追加：TASK-008；v0.5.1 补遗：审批点 2 第一轮退回，澄清 #17）｜ 状态：**待审批点 2 裁决** ｜ 版本：v0.5.1（2026-11-21 修订）
>
> **依据（三源，规范第一部分 §5 第 7 条，v0.5 起生效）**：① 需求基线 docs/requirements.md（TC-001~TC-046 依据 v0.2，TC-047~TC-052 依据 v0.3，TC-053~TC-061 依据 v0.4，TC-062~TC-076 依据 v0.5，其中 TC-076 判据另依 v0.5.1 澄清 #17）；② 设计基线**冻结快照** docs/technical-design.md @ commit `7f4e586`（TASK-008 审批点 1b 通过时冻结；TC-062~TC-076 引用其 §1、§3.4、§3.5、§4.1、§6、§10.12、§11）；③ 该快照 §11「外部契约依赖清单」登记的外部权威文档（**pi 1.5.2 随附 docs/**，绝对路径示例 `/home/connor/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/`；本版引用 json.md / rpc.md / rpc-commands.md / extensions.md）。**涉及外部系统行为的期望（事件序列/返回结构/时序契约）只锚定上述权威文档的章节/行号（或 golden trace），不以我方 mock 行为为期望来源**（规范第一部分 §5 第 6 条）。
> **参考**：DevelopmentGuidelines/development-guidelines.md 第一部分 §5（用例编写规范）、第二部分（原 agent-workflow）§6（产物契约）、§4（自测命令约定 `npm run verify:unit` / `npm run verify:integration`）。注：该规范文档仅存本地（不入库）。
> **盲写声明**：本用例为全新上下文盲写产物；**盲写的对象是实现，不是契约**（规范第一部分 §2.2）——未读取 src/、webview/、test/、media/、package.json、docs/verification/、node_modules 及 docs/technical-design.md 工作树副本（研发现期可能仍在修改，设计依据读取的是上述 `7f4e586` 冻结快照导出件）；v0.5 新增用例（TC-062~TC-076，TC-076 为 v0.5.1 补遗）按三源推导，不迁就实现。
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

> **v0.5 mock 对齐增补（TASK-008，规范 §4.3）**：凡模拟 pi 会话事件流的 mock 场景（一切运行链路剧本，含既有 MOCK-STREAM/THINK/TOOLS(-LATE/-FAIL)/SLOW/BIG 等），自 v0.5 起必须在 `agent_start` 后、assistant `message_start` 前按 pi 权威文档补发该次发送的 user `message_start`/`message_end` 回声（json.md「Event sequence」L36–40：user 回声先于 assistant；extensions.md L752–770：`message_start`/`message_end` 对 user/assistant/toolResult/custom 每类消息均触发），并保持 L40–45 的 assistant → turn_end → agent_end → agent_settled 次序；运行中 steer/follow_up 注入同样各回发一次 user 回声（rpc-commands.md L46–92）。**user 回声行为的外部期望源 = pi 权威文档行号，我方 mock 仅按锚点转印**（规范 §4.3：mock 与外部契约对齐——mock 遗漏 user 回声即 TASK-008 缺陷根因，需求基线 §11 v0.5 修订记录留痕）。
>
> **golden 回放场景（v0.5 增补，设计基线 §6 + §10.12 D8）**：**GOLDEN-BASIC**（基本 prompt 剧本：prompt → user 回声 → assistant 流式 → agent_settled）与 **GOLDEN-MIX**（运行中 steer + follow_up 混合注入，含 `queue_update` 与乱序投递序列）——两者为**真实 pi 1.5.2 录制的事件序列静态转录**（golden trace 文件随实现交付入库，含录制命令/pi 版本/脱敏与归一化声明；核验时由验证剧本按 FR 追溯表定位）。回放场景的期望源 = 录制的真实事件序列本身（golden trace），非我方 mock 行为——用于防「自建 mock 自证」（规范 §4.3）。

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

> §8-2 由 TC-001/003/005/007 覆盖；§8-4 由 TC-038（崩溃恢复）+ TC-042（三平台）覆盖；§8-5（P0 逐条勾选）由全部 P0 自动 TC 覆盖。

---

## 2. TC ↔ FR 覆盖矩阵

### 2.1 功能需求（30 条 FR 全集）

| FR-id | 摘要 | 优先级 | TC-id | 判定等级 | 状态 |
|---|---|---|---|---|---|
| FR-CHAT-01 | 流式对话 | P0 | TC-001, TC-002 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-002） |
| FR-CHAT-02 | Markdown 渲染 | P0 | TC-003, TC-004 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-004） |
| FR-CHAT-03 | thinking 折叠 | P0 | TC-005, TC-006 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-006） |
| FR-CHAT-04 | 工具调用卡片 | P0 | TC-007, TC-008, TC-052 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-008；TC-052 为 #D-04 回归锚点，v0.3 追加） |
| FR-CHAT-05 | 中止运行 | P0 | TC-009, TC-010 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-010） |
| FR-CHAT-06 | steer 插话 | P1 | TC-011, TC-012 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-CHAT-07 | 错误展示 | P0 | TC-013 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-CHAT-08 | 状态指示 | P0 | TC-014, TC-015 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-015） |
| FR-CHAT-09 | 流式输出自动跟随 | P1 | TC-047, TC-048, TC-049, TC-050, TC-051 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①②③④逐条对应 TC-047/048/049/050；UI 补充 TC-051；P1 尽力，v0.3 追加） |
| FR-CHAT-10 | 聊天面板视觉规范 | P1 | TC-053, TC-054, TC-055 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①②③→TC-053、④⑤→TC-054，CSS/DOM/正则口径逐条自动断言；UI 补充 TC-055 由 TC-053/TC-054 兜底；v0.4 新增） |
| FR-CHAT-11 | 用户消息单次展示 | P0 | TC-062, TC-063, TC-064, TC-065, TC-066, TC-067, TC-068, TC-069, TC-070, TC-071, TC-072, TC-073, TC-074, TC-075, TC-076 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（验收标准①含前言计数单位口径→TC-062/063+golden TC-064、②→TC-065/066/067+golden TC-068、③→TC-069/070、④→TC-066/070/071/072/073/076、⑤→TC-074；UI 补充 TC-075 由 TC-062~TC-074、TC-076 兜底；外部行为期望均锚定 pi 权威文档行号；v0.5 新增，TC-076 为 v0.5.1 补遗——澄清 #17） |
| FR-SESS-01 | 新建会话 | P0 | TC-016 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-02 | 历史列表 | P0 | TC-017 | 自动 | ✅ 已覆盖·可自动判定（点击手势以切换事件断言替代） |
| FR-SESS-03 | 继续会话 | P0 | TC-018, TC-046 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-04 | 会话命名 | P1 | TC-019 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-SESS-05 | 分支切换 | P2 | TC-020 | 延后 | 📅 二期/延后（显式列出，不计入门禁） |
| FR-SESS-06 | 单会话工作模式 | P0 | TC-021 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-07 | 外部修改提示 | P1 | TC-022 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-FILE-01 | 工作区绑定 | P0 | TC-023 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-FILE-02 | @file 引用（v0.4 修订：@ 唯一入口） | P0 | TC-024, TC-025, TC-061 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-025；TC-061 判定 v0.4 修订句：无添加文件按钮 DOM 断言 + @ 唯一入口保持） |
| FR-FILE-03 | 右键发送 | P1 | TC-026 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-MOD-01 | 切换模型（v0.4 增入口③） | P1 | TC-027, TC-058 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-058 补底部内联选择器常显/弹出/切换与跨入口同步，v0.4） |
| FR-MOD-02 | 切换 thinking 等级 | P1 | TC-028 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-MOD-03 | 会话内持久（v0.4 展示口径含底部选择器） | P1 | TC-029, TC-059 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力；TC-059 钉入口③重启反映，v0.4） |
| FR-MOD-04 | 上下文用量指示 | P1 | TC-060 | 自动 | ✅ 已覆盖·可自动判定（验收标准①-⑤ → SC-060a~e 逐条；P1 尽力，v0.4 新增） |
| FR-CMD-01 | 命令面板 | P0 | TC-030 | 自动（静态） | ✅ 已覆盖·可自动判定 |
| FR-CMD-02 | 输出日志 | P0 | TC-031 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-CMD-03 | `/` 命令补全菜单 | P1（v0.4 转正） | TC-032, TC-056, TC-057 | 自动 | ✅ 已覆盖·可自动判定（TC-056 判验收标准①②⑤、TC-057 判③④；TC-032 文本直发透传保留；原 TC-033 延后状态撤销，v0.4） |
| FR-CMD-04 | MCP | P2 | TC-034 | 延后 | 📅 二期/延后（显式列出，不计入门禁） |
| FR-CMD-05 | pi 运行时来源 | P0 | TC-035 | 自动 | ✅ 已覆盖·可自动判定 |

**FR 计数核对**：CHAT 11 + SESS 7 + FILE 3 + MOD 4 + CMD 5 = **30/30 全部映射**（v0.3 新增 FR-CHAT-09；v0.4 新增 FR-CHAT-10、FR-MOD-04，FR-CMD-03 由 P2 转正 P1；v0.5 新增 FR-CHAT-11）。P0 = 17 条（全部可自动判定）；P1 = 11 条（全部有自动 TC）；P2 = 2 条（整条延后，均显式列出）。

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

1. **FR 全覆盖**：30/30 条 FR 均有 TC 映射（v0.3 起含 FR-CHAT-09；v0.4 起含 FR-CHAT-10、FR-MOD-04；v0.5 起含 FR-CHAT-11），无遗漏；无 TC 脱离 FR/验收汇总（TC-045/046 映射 §8 验收条目并复合映射其依赖 FR；TC-047~TC-051 映射 FR-CHAT-09 验收标准①②③④+UI；TC-052 属 FR-CHAT-04 既有验收的 #D-04 场景补充，无需求变更；TC-053~TC-055 映射 FR-CHAT-10 验收标准①②③④⑤+UI，TC-056/TC-057 映射 FR-CMD-03 验收标准①-⑤，TC-058 映射 FR-MOD-01 入口③与跨入口同步，TC-059 映射 FR-MOD-03 v0.4 展示口径，TC-060 映射 FR-MOD-04 验收标准①-⑤，TC-061 映射 FR-FILE-02 v0.4 修订句；TC-062~TC-076 映射 FR-CHAT-11 验收标准①（含前言计数单位口径）②③④（含澄清 #17 不可关联例外）⑤+UI 及 §8 第 6 条显式门槛）。
2. **P0 逐条可判定**：17 条 P0 FR 全部具备**自动判定** TC（TC-001/003/005/007/009/013/014/016/017/018/021/023/024/030/031/035；v0.3 另为 FR-CHAT-04 追加 #D-04 回归 TC-052；v0.4 另为 FR-FILE-02 修订句追加 TC-061；v0.5 新增 FR-CHAT-11 由 TC-062~TC-076（UI 补充 TC-075 除外）全自动判定——每条含确定性 SC-xxx 场景与行为断言，判定时点/采样在事件处理边界进行、无时钟依赖；TC-076 为 v0.5.1 补遗（澄清 #17）），每条给出确定性命令/脚本与 PASS/FAIL 判据。
3. **P1 尽力覆盖**：11 条 P1 FR 全部有自动 TC（TC-011/019/022/026/027/028/029，v0.3 新增 FR-CHAT-09 的 TC-047/048/049/050，及 v0.4：FR-CHAT-10 的 TC-053/054、FR-CMD-03 转正后的 TC-056/057、FR-MOD-01③ 的 TC-058、FR-MOD-03 的 TC-059、FR-MOD-04 的 TC-060），判定依赖 mock 调用记录、状态断言、DOM/计算样式断言与滚动位置采样，可无人执行。
4. **P2 显式列出**：FR-SESS-05（TC-020）、FR-CMD-04（TC-034）整条延后，均在矩阵中标注 📅 二期/延后，不计入 MVP 门禁；FR-CMD-03 原 P2 拆分口径（TC-033 延后）随基线 v0.4 转正 P1（§11）而撤销，由 TC-056/TC-057 全链路判定。
5. **安全要求**：NFR-03 的**日志脱敏**（TC-039，随机哨兵在被测产物/日志中 rg 零命中）与**防 XSS**（TC-040，7 载荷×4 断言）各有独立自动 TC；另附 TC-041（会话数据位置）、TC-031(d)（日志通道脱敏交叉）加固。
6. **UI 交互项纪律**：共 11 项 UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025/051/055/075），均标注证据类型（截图/录屏/命令调用日志/剪贴板落盘/滚动位置采样数据/两档宽度截图），且其 FR **均另有自动 TC 兜底**（TC-001/003/005/007/009/011/014/024，TC-047~TC-050 兜底 TC-051，TC-053/TC-054 兜底 TC-055，TC-062~TC-074、TC-076 兜底 TC-075）；"点击 Stop/点击切换/点击菜单项/滚动"类手势一律以命令注册断言、RPC 调用记录、状态事件断言、DOM 事件派发、滚动位置采样序列做自动兜底判定。
7. **环境约束**：全部用例可在**无真实 API key、无外网**（仅 npm ci 例外）下执行：临时 HOME 隔离凭证与会话、本地 mock 场景（MOCK-*，v0.4 增补 MOCK-CMD / MOCK-USAGE，v0.5 增补 MOCK-ECHO-REWRITE / MOCK-QUEUE-MIX / MOCK-REJECT / MOCK-HANDLED 与 golden 回放 GOLDEN-BASIC / GOLDEN-MIX，且 v0.5 起一切运行链路 mock 按权威文档补发 user 回声——§0.3）、哨兵假凭证；标准自测命令仅约定 `npm run verify:unit` / `npm run verify:integration`。
8. **盲写纪律**：用例仅从 docs/requirements.md 推导（TC-001~TC-046 对应基线 v0.2，TC-047~TC-052 对应基线 v0.3，TC-053~TC-061 对应基线 v0.4）；TC-052 的时序场景背景取自任务单 TASK-005 §1（#D-04 缺陷单，本阶段许可输入），断言本身仅锚定 FR-CHAT-04 既有验收标准；TC-053~TC-061 的素材↔FR 对应关系取自任务单 TASK-006 §1 素材映射表（本阶段许可输入，仅用于确认对应关系，不构成断言来源），断言本身仅锚定 docs/requirements.md v0.4 验收标准；**TC-062~TC-076（v0.5；TC-076 为 v0.5.1 补遗，判据依澄清 #17）依据三源：需求基线 v0.5/v0.5.1 + 设计基线冻结快照 `7f4e586`（§10.12/§11 等）+ 其 §11 清单登记的 pi 1.5.2 权威文档，全部外部行为期望均锚定权威文档行号（json.md/rpc.md/rpc-commands.md/extensions.md），未以我方 mock 行为为期望源**；本阶段仅产出 docs/test-cases.md，未读取实现侧内容，无 git 写操作。
9. **遗留**：11 项需求歧义/缺漏（§3）此前已上报总调度，未自行脑补实现；其中第 1-10 项已由基线 v0.2.1 §12 #1-#10 裁决（既有 TC-001~TC-046 对应断言的收紧不属本次改动范围），第 11 项为备忘性处理（自动兜底 + UI checklist）。本次新增 TC-047~TC-052 未发现新歧义：FR-CHAT-09 验收口径（40px 阈值、每轮流式开始重置、瞬时状态不持久化、idle 例外）均可判定，无上报项。v0.4 新增 TC-053~TC-061 亦未发现阻塞歧义；唯一用例侧判定口径（FR-MOD-04③ token 数值允许千分位/k 缩写并存，k 缩写精度需求未定义——TC-060 以解析容差 ≤1% 判定）已在 TC-060 章节引言披露，如需固化精度请总调度裁决。v0.5 新增 TC-062~TC-076 未发现阻塞歧义，三处用例侧口径披露见 FR-CHAT-11 章节引言（TC-067 两条回声相对次序不判定 / TC-066 不依赖 queue_update 与回声先后次序 / 设计 D2.2 多通道不可判定保守分支与澄清 #16 的张力——已由总调度裁决为澄清 #17（需求基线 v0.5.1 §12），判定用例 TC-076）。
10. **缺陷回归锚点**：TASK-005 §1 #D-04（FR-CHAT-04 工具卡状态恒“进行中”，P1）由 TC-052 以实现无关时序契约回归判定（工具执行结果晚于携带工具卡的助手消息到达 → 直播路径状态收敛“成功/失败”）；#D-04 修复后的重新核验以 TC-052 PASS 为判定项之一。TASK-008 用户消息重复气泡缺陷（通道 A 批次三条目①，FR-CHAT-11）回归锚点 = TC-062（基本单条三判定时点）/ TC-063（同文本不合并）/ TC-069/TC-070（重放不重复），缺陷修复后的重新核验以之为判定项。

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

---

*本文件为测试 Agent（写用例阶段）唯一产物，交付审批点 2 裁决。*

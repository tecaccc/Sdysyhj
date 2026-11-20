# Sdysyhj 测试用例基线（docs/test-cases.md）

> 产出：测试 Agent（写用例阶段，TASK-001；v0.3 追加：TASK-005）｜ 状态：**待审批点 2 裁决** ｜ 版本：v0.3（2026-11-20 修订）
>
> **依据（唯一）**：docs/requirements.md（需求基线；TC-001~TC-046 依据 v0.2，TC-047~TC-052 依据 v0.3）。
> **参考**：DevelopmentGuidelines/development-guidelines.md 第二部分（原 agent-workflow）§6（产物契约）、§4（自测命令约定 `npm run verify:unit` / `npm run verify:integration`）。注：该规范文档仅存本地（不入库）。
> **盲写声明**：本用例为全新上下文盲写产物，未读取 src/、webview/、test/、media/、package.json、docs/technical-design.md 等任何实现侧内容；全部用例仅从需求推导，不迁就实现。
> **写权限声明**：本阶段仅写 docs/test-cases.md 一个文件；无任何 git 写操作。

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

### FR-FILE-02 `@file` 引用（P0）

#### TC-024 ｜ FR-FILE-02（P0）｜ '@' 触发文件选择并插入路径 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM；工作区含文件 `src/a.ts`。
- **操作步骤**：`npm run verify:unit`（输入解析/路径插入逻辑单测）+ `npm run verify:integration`（场景 SC-024：输入 "看下 @a.ts"，触发选择器请求，选中 `src/a.ts` 后发送）。
- **期望结果**：(a) 文本含 '@' 触发文件选择器请求，枚举范围限定当前工作区；(b) 选中后 prompt 文本插入 `src/a.ts` 路径（断言 prompt 内容含该路径）；(c) 发送后 `$MOCKLOG/calls.jsonl` 收到的消息含该路径。
- **判定方式**：PASS = (a)-(c) 全成立；FAIL = 任一不成立。

#### TC-025 ｜ FR-FILE-02（P0）｜ @file 选择器交互视觉 ｜ UI 手工 checklist（兜底 TC-024）
- **操作步骤**（手工 checklist 项）：核对 '@' 弹出选择器、列表仅当前工作区文件、选中后输入框显示路径；截图存 `evidence/TC-025/`（证据类型：截图）。
- **判定方式**：PASS = 3/3 且证据存证；FAIL = 任一不符。

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

### FR-CMD-03 slash commands / skills（P2）

#### TC-032 ｜ FR-CMD-03（P2，MVP 部分）｜ slash 命令文本直接发送生效 ｜ 自动
- **前置条件**：ENV-SETUP；MOCK-STREAM。
- **操作步骤**：`npm run verify:integration`（场景 SC-032：输入 "/review this file" 直接发送）。
- **期望结果**：(a) mock 收到消息原文（含 "/review this file"）；(b) 会话正常继续（有回复、无错误卡片）。
- **判定方式**：PASS = (a)-(b) 全成立；FAIL = 任一不成立。
- **备注**：本 TC 覆盖验收标准"MVP 阶段命令文本直接发送即可生效"；归属歧义见歧义清单 #1。

#### TC-033 ｜ FR-CMD-03（P2）｜ '/' 自动补全（透传 get_commands） ｜ 延后（二期，显式列出）
- **状态**：**延后，不计入 MVP 门禁**。
- **预留步骤**：输入 '/' → 调用 `get_commands` → 补全列表渲染 → 选中插入。
- **判定方式**：本期恒记 **DEFERRED**。

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

### 2.1 功能需求（27 条 FR 全集）

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
| FR-SESS-01 | 新建会话 | P0 | TC-016 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-02 | 历史列表 | P0 | TC-017 | 自动 | ✅ 已覆盖·可自动判定（点击手势以切换事件断言替代） |
| FR-SESS-03 | 继续会话 | P0 | TC-018, TC-046 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-04 | 会话命名 | P1 | TC-019 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-SESS-05 | 分支切换 | P2 | TC-020 | 延后 | 📅 二期/延后（显式列出，不计入门禁） |
| FR-SESS-06 | 单会话工作模式 | P0 | TC-021 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-SESS-07 | 外部修改提示 | P1 | TC-022 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-FILE-01 | 工作区绑定 | P0 | TC-023 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-FILE-02 | @file 引用 | P0 | TC-024, TC-025 | 自动 + UI 补充 | ✅ 已覆盖·可自动判定（UI 补充 TC-025） |
| FR-FILE-03 | 右键发送 | P1 | TC-026 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-MOD-01 | 切换模型 | P1 | TC-027 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-MOD-02 | 切换 thinking 等级 | P1 | TC-028 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-MOD-03 | 会话内持久 | P1 | TC-029 | 自动 | ✅ 已覆盖·可自动判定（P1 尽力） |
| FR-CMD-01 | 命令面板 | P0 | TC-030 | 自动（静态） | ✅ 已覆盖·可自动判定 |
| FR-CMD-02 | 输出日志 | P0 | TC-031 | 自动 | ✅ 已覆盖·可自动判定 |
| FR-CMD-03 | slash commands / skills | P2 | TC-032（MVP 部分）, TC-033（补全） | 自动 + 延后 | ⚠ 部分覆盖：文本直发生效（TC-032）本期判；'/' 补全（TC-033）📅 二期/延后 |
| FR-CMD-04 | MCP | P2 | TC-034 | 延后 | 📅 二期/延后（显式列出，不计入门禁） |
| FR-CMD-05 | pi 运行时来源 | P0 | TC-035 | 自动 | ✅ 已覆盖·可自动判定 |

**FR 计数核对**：CHAT 9 + SESS 7 + FILE 3 + MOD 3 + CMD 5 = **27/27 全部映射**（v0.3 新增 FR-CHAT-09）。P0 = 16 条（全部可自动判定）；P1 = 8 条（全部有自动 TC）；P2 = 3 条（2 条整条延后 + 1 条部分延后，均显式列出）。

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

1. **FR 全覆盖**：27/27 条 FR 均有 TC 映射（v0.3 起含 FR-CHAT-09），无遗漏；无 TC 脱离 FR/验收汇总（TC-045/046 映射 §8 验收条目并复合映射其依赖 FR；TC-047~TC-051 映射 FR-CHAT-09 验收标准①②③④+UI；TC-052 属 FR-CHAT-04 既有验收的 #D-04 场景补充，无需求变更）。
2. **P0 逐条可判定**：16 条 P0 FR 全部具备**自动判定** TC（TC-001/003/005/007/009/013/014/016/017/018/021/023/024/030/031/035；v0.3 另为 FR-CHAT-04 追加 #D-04 回归 TC-052），每条给出确定性命令/脚本与 PASS/FAIL 判据。
3. **P1 尽力覆盖**：8 条 P1 FR 全部有自动 TC（TC-011/019/022/026/027/028/029，及 v0.3 新增 FR-CHAT-09 的 TC-047/048/049/050——验收标准①②③④一对一口径），判定依赖 mock 调用记录、状态断言与滚动位置采样，可无人执行。
4. **P2 显式列出**：FR-SESS-05（TC-020）、FR-CMD-04（TC-034）整条延后；FR-CMD-03 拆分——TC-032（MVP"文本直发生效"）本期判定、TC-033（'/' 补全）延后。三条 P2 均在矩阵中标注 📅 二期/延后，不计入 MVP 门禁。
5. **安全要求**：NFR-03 的**日志脱敏**（TC-039，随机哨兵在被测产物/日志中 rg 零命中）与**防 XSS**（TC-040，7 载荷×4 断言）各有独立自动 TC；另附 TC-041（会话数据位置）、TC-031(d)（日志通道脱敏交叉）加固。
6. **UI 交互项纪律**：共 9 项 UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025/051），均标注证据类型（截图/录屏/命令调用日志/剪贴板落盘/滚动位置采样数据），且其 FR **均另有自动 TC 兜底**（TC-001/003/005/007/009/011/014/024，及 TC-047~TC-050 兜底 TC-051）；“点击 Stop/点击切换/滚动”类手势一律以命令注册断言、RPC 调用记录、状态事件断言、滚动位置采样序列做自动兜底判定。
7. **环境约束**：全部用例可在**无真实 API key、无外网**（仅 npm ci 例外）下执行：临时 HOME 隔离凭证与会话、本地 mock 场景（MOCK-*）、哨兵假凭证；标准自测命令仅约定 `npm run verify:unit` / `npm run verify:integration`。
8. **盲写纪律**：用例仅从 docs/requirements.md 推导（TC-001~TC-046 对应基线 v0.2，TC-047~TC-052 对应基线 v0.3）；TC-052 的时序场景背景取自任务单 TASK-005 §1（#D-04 缺陷单，本阶段许可输入），断言本身仅锚定 FR-CHAT-04 既有验收标准；本阶段仅产出 docs/test-cases.md，未读取实现侧内容，无 git 写操作。
9. **遗留**：11 项需求歧义/缺漏（§3）此前已上报总调度，未自行脑补实现；其中第 1-10 项已由基线 v0.2.1 §12 #1-#10 裁决（既有 TC-001~TC-046 对应断言的收紧不属本次改动范围），第 11 项为备忘性处理（自动兜底 + UI checklist）。本次新增 TC-047~TC-052 未发现新歧义：FR-CHAT-09 验收口径（40px 阈值、每轮流式开始重置、瞬时状态不持久化、idle 例外）均可判定，无上报项。
10. **缺陷回归锚点**：TASK-005 §1 #D-04（FR-CHAT-04 工具卡状态恒“进行中”，P1）由 TC-052 以实现无关时序契约回归判定（工具执行结果晚于携带工具卡的助手消息到达 → 直播路径状态收敛“成功/失败”）；#D-04 修复后的重新核验以 TC-052 PASS 为判定项之一。

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

---

*本文件为测试 Agent（写用例阶段）唯一产物，交付审批点 2 裁决。*

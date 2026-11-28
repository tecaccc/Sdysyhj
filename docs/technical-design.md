# Sdysyhj 技术方案

> Sdysyhj（山巅一石一壶酒）— Pi Agent for VS Code
>
> 状态：**已实现（MVP）**；TASK-008（FR-CHAT-11 用户消息单次展示）已实现（§10.12）；TASK-009 阶段①（FR-AUI-01~06）已实现并闭环（v0.1.7 + report-f7a3518，§10.13 + §10.5.1 追溯行）；TASK-009 **切换批次**（新 UI 转正默认 + 旧面板退役，FR-AUI-02/03/05/07/08）：已实现（0.1.8 交付，§10.14 交付小节；**0.1.10 起随 TASK-011 批次 A 项还原退役，历史留痕**）；TASK-011 **批次 A 项**（聊天界面还原自研实现 + assistant-ui 框架整体移除，需求基线 v0.8 §4.6 废止注记）：**已实现（§10.15）** ｜ 版本：v0.8 ｜ 对应需求：docs/requirements.md v0.9（2026-11-27 修订）｜ 修订日期：2026-11-27

---

## 1. 总体架构

```
┌────────────────────────────────────────────────────────┐
│ VS Code 插件宿主 (Extension Host, Node.js)              │
│                                                        │
│  ┌────────────────┐   postMessage   ┌───────────────┐  │
│  │ Webview        │◄───────────────►│ ChatPanel     │  │
│  │ (聊天 UI)       │                 │ (宿主侧中介)   │  │
│  │ - Markdown渲染  │                 └──────┬────────┘  │
│  │ - 工具卡片      │                        │           │
│  │ - thinking折叠  │                 ┌──────▼────────┐  │
│  └────────────────┘                 │ PiBridge      │  │
│                                     │ - 会话生命周期  │  │
│  ┌────────────────┐                 │ - 事件分发     │  │
│  │ Output Channel │◄── 日志 ────────│ - 状态管理     │  │
│  └────────────────┘                 └──────┬────────┘  │
│                                            │ JSONL     │
│                                     ┌──────▼────────┐  │
│                                     │ RpcClient     │  │
│                                     │ (官方包)       │  │
│                                     └──────┬────────┘  │
└────────────────────────────────────────────┼───────────┘
                                             │ stdin/stdout
                                      ┌──────▼────────┐
                                      │ pi --mode rpc │  ← 子进程（进程隔离）
                                      │ 会话/配置/凭证  │
                                      │ ~/.pi/agent/  │
                                      └───────────────┘
```

**核心决策：RPC 子进程集成（而非 SDK 进程内嵌入）。**

| 维度 | RPC 子进程（选定） | SDK 进程内嵌入 |
|---|---|---|
| 进程隔离 | ✅ agent 崩溃不影响 VS Code | ❌ 同进程，异常可波及宿主 |
| 版本独立 | ✅ 可随插件内置独立升级 | ❌ 与宿主依赖耦合 |
| 官方推荐 | ✅ 文档明确"IDEs 用 RPC" | 面向 Node/Bun 嵌入场景 |
| 实现成本 | 中（需协议层，但官方 `RpcClient` 已封装） | 低 |
| 交互丰富度 | RPC 命令全集可用（prompt/steer/abort/set_model…） | 直接 API |

RPC 协议要点（依据官方 `rpc.md` / `rpc-commands.md` / `json.md`，版本锚定 **pi 1.5.2**；逐条锚点见 §11 外部契约依赖清单）：

- 严格 JSONL 帧：每行一个 JSON 对象，**只能按 LF 切分**（禁用 Node `readline`，其会把 `U+2028/U+2029` 当行界）
- stdin 写命令（可带 `id` 关联），stdout 收 `response` + 会话事件流
- 事件流（`json.md`「Event sequence」L30–46）：`agent_start` → `turn_start` → **user 回声**（`message_start`(user) → `message_end`(user)——pi 对每条到达模型的用户消息（初始 prompt 与 steer / follow-up 注入）必回发，先于该轮助手消息；`extensions.md` L752–770：`message_start`/`message_end` 对 user/assistant/toolResult/custom 每类消息均触发）→ `message_start`(assistant) → `message_update`*（text/thinking/toolcall delta）→ `message_end`（权威终稿，`json.md`「Message events」L68）→ `turn_end` → `agent_end` → `agent_settled`
- steer / follow-up 注入时序（`rpc-commands.md` L46–92）：`steer` 在 run 中排队、当前助手轮工具执行完后下一次 LLM 调用前注入；`follow_up` 仅在 agent 停下（无更多工具调用与 steer）后注入——**混合使用时回声到达顺序可与发送顺序不同**（follow-up 先发后投、steer 后发先投），关联设计见 §10.12 D2；队列变化经 `queue_update` 事件透出完整 steering/followUp 队列（`json.md`「Queue and state events」L121–122）
- `agent_end` ≠ `agent_settled`：重试/压缩恢复/steer/follow-up 仍可在 `agent_end` 后继续；完成判定以 `agent_settled` 为准（本次运行真正结束）
- 关机：关闭 stdin 即有序退出

## 2. 技术选型

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript（strict） | VS Code 插件标准；与官方包类型（`JsonAgentSessionEvent` 等）直接互通 |
| 构建 | esbuild（bundle） | 快速、产物单文件；webview 脚本单独打包 |
| Pi 集成包 | `@earendil-works/pi-coding-agent` | 官方包，含 `RpcClient` + `dist/cli.js`（自带运行时，免用户安装 pi） |
| pi 进程来源 | ① PATH 上的 `pi`（版本探测可用时）→ ② 内置 `dist/cli.js`（`node <cliPath> --mode rpc`） | 开箱即用 + 尊重用户自装版本 |
| Webview UI | 原生 TS + DOM（无 React/Vue） | 控制包体；渲染逻辑以流式 append 为主，框架收益低 |
| Markdown | `marked` + `highlight.js`（或 `shiki`，视包体取舍） | 成熟稳定；输出经 DOMPurify 消毒 |
| 测试 | Vitest（单元：协议层/状态机）+ `@vscode/test-e2e`（冒烟） | 协议层是纯逻辑，单测价值高 |
| 打包 | `vsce` / `@vscode/vsce` | Marketplace 标准 |

## 3. 模块设计

### 3.1 目录结构（预期）

```
Sdysyhj/
├── docs/
│   ├── requirements.md
│   └── technical-design.md
├── src/
│   ├── extension.ts          # 激活入口：注册命令/面板/输出通道
│   ├── bridge/
│   │   ├── piBridge.ts       # PiBridge：会话编排、事件→UI 状态的翻译
│   │   ├── rpcTransport.ts   # 子进程来源解析（PATH pi / 内置 cli）、RpcClient 封装
│   │   └── protocol.ts       # RPC 记录/事件的 TS 类型与判别
│   ├── panel/
│   │   ├── chatPanel.ts      # WebviewViewProvider、postMessage 路由
│   │   └── messages.ts       # 宿主↔webview 消息协议（判别联合）
│   ├── session/
│   │   └── sessionStore.ts   # 历史列表/切换/命名（RPC 会话命令封装）
│   └── util/
│       ├── log.ts            # Output Channel
│       └── config.ts         # 插件 settings（仅 UI 项）
├── webview/
│   ├── main.ts               # webview 入口
│   ├── render/               # markdown、工具卡片、thinking、消息流
│   └── styles/
├── media/                    # 打包后的 webview 资源
├── esbuild.mjs
├── package.json
└── tsconfig.json
```

### 3.2 PiBridge（核心状态机）

宿主侧唯一权威状态持有者，管理运行生命周期：

```
idle ──prompt()──► starting ──agent_start──► streaming
  ▲                                             │
  │◄────────── agent_settled ───────────────────┘
  │                  (aborted?: true 表示中止)
  └── 子进程异常退出 → restarting(限 1 次) → error
```

职责：

1. **命令通道**：`prompt / steer / followUp / abort / setModel / setThinkingLevel / getState / getMessages…` 全部经 `RpcClient`，带 `id` 关联，超时可取消
2. **事件翻译**：将 `message_update` 等流式事件翻译为 UI 增量消息（见 3.4）；以 `message_end` 为权威终稿覆盖增量结果
3. **完成判定**：对外暴露 `agent_settled`（而非 `agent_end`）作为"运行结束"信号（`agent_end` 后仍可能有重试/压缩/排队）
4. **崩溃恢复**：子进程退出 → 记录 stderr → 自动重启一次 → 失败则 UI 呈现可行动错误（如"检查 pi auth"）
5. **会话切换**：`switch_session` / `new_session` 后重放历史消息到 UI

### 3.3 rpcTransport（子进程来源解析）

```
resolvePiRuntime():
  1. spawn("pi", ["--version"]) 成功且版本 ≥ 最低支持版本 → 使用 PATH pi
  2. 否则 → 使用内置 node_modules/@earendil-works/pi-coding-agent/dist/cli.js
  3. 启动失败 → 报错并指引（附 stderr）
```

要点：

- `RpcClientOptions` 提供 `cliPath / cwd / provider / model / args`；`cwd` 固定为工作区根目录
- 帧解析使用官方 `RpcClient`（其内部已按 LF 正确切分）；若未来自实现协议层，须用字节/UTF-8 解码 + LF 切分
- stdout 事件持续消费防止管道写满阻塞；stderr 累积入 Output Channel

### 3.4 宿主 ↔ Webview 消息协议

判别联合、单向数据流 + 增量渲染。示意：

```ts
// 宿主 → Webview
type HostToWebview =
  | { kind: "session_reset"; sessionId: string; name: string }
  | { kind: "history_loaded"; messages: UiMessage[] }
  | { kind: "user_message"; id: string; text: string }   // id 由宿主生成并贯通（TASK-008 §10.12 D1）
  | { kind: "stream_start"; messageId: string }
  | { kind: "text_delta"; messageId: string; index: number; delta: string }
  | { kind: "thinking_delta"; messageId: string; index: number; delta: string }
  | { kind: "toolcall_start"; messageId: string; index: number; id: string; tool: string }
  | { kind: "toolcall_delta"; messageId: string; index: number; delta: string }
  | { kind: "message_final"; messageId: string; message: UiMessage }   // message_end 权威覆盖
  | { kind: "run_state"; state: "idle" | "streaming" | "aborted" | "error"; detail?: string }
  | { kind: "model_info"; model: string; thinkingLevel: string }
  | { kind: "error"; message: string; hint?: string };

// Webview → 宿主
type WebviewToHost =
  | { kind: "prompt"; text: string; mode: "auto" | "steer" | "followUp" }
  | { kind: "abort" }
  | { kind: "open_history" }
  | { kind: "new_session" }
  | { kind: "switch_model" }
  | { kind: "switch_thinking" }
  | { kind: "insert_file_ref" }    // 请求宿主弹文件选择器
  | { kind: "open_settings" };
```

渲染策略：`*_delta` 追加到对应内容块（`contentIndex` 分块，含 thinking / text / toolcall 三类）；`message_final` 整体替换该消息 DOM，保证与权威数据一致。大输出仅保留尾部 N 行在 DOM（"复制全部"取自宿主缓存）。

### 3.5 会话管理（sessionStore）

- 历史列表：经 RPC 会话命令（`get_state` / 会话树 / `switch_session`）读取 pi 原生 session 存储，**不另建副本**
- 恢复：切换会话后用 `get_messages` 重建 UI 历史；上下文/压缩状态由 pi 侧权威管理
- 命名：`set_session_name`
- 外部修改检测（FR-SESS-07）：`SessionFileWatcher` 以 mtime/size 2500ms 轮询（保证 ≤5s 检测时限）发现“插件之外”的写入。本插件 pi 子进程写入的三重豁免（Issue #1 / #D-01）：
  1. `entry_appended` 事件 = 本端条目落盘的精确信号，到达即 `markSynced` 同步基线（覆盖 turn_start 边界 user 条目写入与迟到事件）；
  2. 运行态门控 `setSuspended`：starting/streaming 期间轮询只吸收变化（更新基线）不报警，回 idle/aborted 恢复检测并先 `markSynced`；
  3. assistant `message_final`、回 idle/aborted、刷新/切换等时机的 `markSynced` 兑底。
  另：`agent_settled` 时若 `sessionFile` 为空则 `refreshState` 补学新会话路径（#D-02：全新会话首轮落盘后路径才可见，否则 watcher 永不跟踪 → 漏报）。
- 分支（P2）：`get_tree` / `fork`，UI 二期实现

### 3.6 配置项（package.json contributes.configuration，仅 UI 相关）

| 配置 | 默认 | 说明 |
|---|---|---|
| `sdysyhj.piRuntime` | `"auto"` | `auto` / `path` / `bundled`，见 3.3 |
| `sdysyhj.piPath` | `""` | 显式指定 pi 可执行文件 |
| `sdysyhj.thinkingDefault` | 继承 pi 设置 | 新会话默认 thinking 等级（空=继承） |
| `sdysyhj.outputTailLines` | `200` | 工具输出卡片保留行数 |
| `sdysyhj.sendMode` | `"steer"` | 运行中默认插话模式 |

provider / model / api-key / MCP / skills 一律走 pi 自身配置（`~/.pi/agent/`、`pi auth`、`pi config`），插件不提供配置界面。

## 4. 关键流程

### 4.1 发送 prompt

```
用户 Enter → webview.post({prompt}) → PiBridge
  → 乐观回声：emit("user_message", { id, text })
     （宿主生成 id 并随事件下发；发送后即时展示，不等待 pi 确认；关联设计见 §10.12 D1）
  → RpcClient.prompt(text, images?, streamingBehavior?)   // 运行中自动 steer/followUp
  → response.disposition = started|queued|handled；success:false = 受理前拒绝（无后续事件）
  → 事件流（json.md「Event sequence」L30–46）:
       agent_start → turn_start
       → message_start(user) → message_end(user)      ← pi 回发 user 回声（权威文本；
                                                        桥侧匹配乐观条目后就地更新，澄清 #16）
       → message_start(assistant) → message_update* → message_end(assistant)
       → turn_end → agent_end → agent_settled
  → run_state = idle
```

注意：`prompt` 的响应只代表"已受理"，完成以 `agent_settled` 为准；`disposition: "handled"` 时（扩展命令 / input handler 消费）不启动 run、无 user 回声、不等 settled（`rpc-commands.md` L40–42、`rpc.md`「Run lifecycle」）。运行中 `steer` / `follow_up` 注入同样各回发一次 user 回声，注入时机见 §1「RPC 协议要点」；发送后用户消息恰好展示一条（FR-CHAT-11）的事件关联设计见 §10.12。

### 4.2 中止

`RpcClient.abort()` → 等待 `agent_settled(aborted: true)` → UI 标记"已中止"，历史保留。

### 4.3 模型切换

`get_available_models()` 生成 QuickPick（或 webview 下拉）→ `set_model` / `set_thinking_level` → 状态栏刷新。

### 4.4 会话切换

历史面板选择 → `switch_session` → `get_messages` → `session_reset + history_loaded` → UI 重建。

## 5. 安全与隐私

- 日志脱敏：stderr / 事件日志过滤 `api_key / Authorization / sk-…` 等模式
- Webview CSP：`default-src 'none'`，脚本走 nonce，样式白名单；`DOMPurify` 消毒 Markdown 输出；不启用 `enableFindWidget` 之外的危险选项
- 不落盘任何会话副本；不引入遥测
- 子进程 env 继承用户环境（凭证由 pi 自行解析），插件不代管凭证

## 6. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest | 事件→UI 消息翻译状态机、运行状态机（含 aborted/error/重试）、配置解析、运行时来源解析（mock spawn）；TASK-008 增：user 回声关联/匹配账本（§10.12 D2）|
| 集成 | Vitest + 真实 `--mode rpc` 子进程（`--no-session`） | 帧解析、prompt→settled 全链路、abort、崩溃重启；fake-pi 剧本已对照 json.md 补发 user 回声（§10.12 D8）|
| **Golden fixture 回放** | Vitest + 静态 JSONL（`test/fixtures/golden/`，真实 pi 事件序列转录） | **防"自建 mock 自证"兑底（规范 §4.3）**：按真实 pi 录制的事件序列回放断言 user 回声关联、steer/follow-up 注入时序、settled 边界（FR-CHAT-11）；录制与回放方案见 §10.12 D8 |
| **实验面板（TASK-009 阶段①）** | Vitest unit（映射纯函数 / 零变更冻结与预算 / CSP 指令集 / 主题审计结构断言）+ Vitest integration **in-node 真实通道回放**（路线 A = `serveWebviewHost`×`createVSCodeFetch`×PiBridge(`FAKE_PI_REPLAY`)；路线 B = LabChatPanel postMessage 泵×webview store）+ 真机手工 checklist（主题截图 / XSS DOM 探针 / CSP 下 zod jitless / retainContextWhenHidden / A-B 切换） | FR-AUI-01~06（判定面 = 通道 + 数据层，DOM 行为层 MANUAL，选型与锚点见 §10.13 D8） |
| **新 UI 消费端契约（TASK-009 切换批次，#D-06 制度化）** | Vitest unit（node，纯逻辑）+ Vitest integration **jsdom 31 + @testing-library/react 16 真实 runtime 消费**（golden 回放端到端：FAKE_PI_REPLAY 子进程→PiBridge→postMessage 泵→store→真实 `AssistantRuntimeProvider`+`useExternalStoreRuntime`+组件→DOM 断言；文件级 `// @vitest-environment jsdom` 注解，范围限 webview/ui 测试）+ 真机 checklist（MANUAL：主题截图 / 真实 CSP violation / retainContextWhenHidden / 双面板切换 / 跟随观感） | FR-AUI-02/03/05/07/08 与 §4.1–4.5 判定载体平移（FR-CHAT-11 三时点单气泡、FR-CHAT-09 跟随、FR-CHAT-10 五子条、工具卡/Markdown 等价）；映射/流式/交互断言一律以真实 runtime 消费为准（非自建解码器）；选型与回归重定向见 §10.14 D8 |
| E2E 冒烟 | `@vscode/test-e2e` | 激活、开面板、发一条 prompt（mock provider 或录制回放）、切会话 |
| 手工 | 三平台 checklist | 第 8 节验收标准 |

集成测试用 provider 使用本地 mock / 录制回放，避免测试依赖真实 API key。

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| RPC 协议随 pi 版本演进 | 事件/命令不兼容 | 锁定内置包版本；协议层类型取自官方包导出；PATH pi 做版本探测下限 |
| Webview 大输出卡顿 | UI 掉帧 | DOM 尾部截断 + 宿主缓存全量；delta 批量合并（rAF 节流） |
| Windows 管道/编码 | 帧错乱 | 严格 LF 字节切分，禁用 readline；三平台纳入测试 |
| 子进程僵尸/泄漏 | 资源占用 | 插件 deactivate 强制 stop()；会话切换前 abort + dispose |
| Marketplace 审核（内置运行时体积） | 包体过大 | esbuild tree-shake；评估仅打包 `dist/cli.js` bundle 产物 |
| 双端（终端 pi ↔ 插件）并发写同一会话 | 状态竞争 | MVP 明确"同一会话同时仅一端活跃"，检测到外部修改时提示刷新 |

## 8. 里程碑与工作量

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 骨架 | 工程/esbuild/激活/输出通道；rpcTransport + PiBridge 最小链路；webview 纯文本流式 | 2–3 天 |
| M2 聊天完备 | Markdown/thinking/工具卡片/abort/steer/错误处理/状态栏 | 3–5 天 |
| M3 会话与模型 | 历史/切换/命名、模型与 thinking 切换、@file、右键发送 | 3–4 天 |
| M4 打磨发布 | 命令面板补全、日志、E2E、三平台测试、打包、图标 README | 2–3 天 |

## 9. 二期方向（不在本方案范围）

- Diff & Apply：将 edit/write 工具调用转为 VS Code `TextDocumentContentProvider` diff 预览 + 确认应用
- 图片粘贴/拖拽（`ImageContent` 走 prompt.images）
- 多会话并行标签、费用/token 统计面板
- 输入框 slash command / skill 自动补全、MCP 管理 UI
- VS Code Chat API 可选适配层

## 10. FR 追溯表（实现映射，依据需求基线 v0.4；v0.5 新增 FR-CHAT-11 的映射行随 TASK-008 实现交付补齐，设计见 §10.12）

实现文件位置以本仓库为准；未实现项标注原因。P0 全部实现，P1 全部实现，P2 标“二期”（不计 MVP 门禁）。验收口径按基线 v0.4 对齐（大输出默认尾部 200 行；“可用 pi”含最低版本判据；历史重放与会话 JSONL 一致；FR-CHAT-08 仅状态展示；thinking 枚举透传不固化；运行状态 settled 后回 idle、『已中止』为消息级标记；FR-SESS-07 外部修改后拦截交互直至刷新；消息数=消息总数 user+assistant；`extension_error` 展示通道=非阻断 toast + 全字段 Output 日志 + 同错误去重，FR-CHAT-07 错误卡片范围不变；FR-CHAT-09 跟随判定阈值 40px、每轮流式开始默认跟随、跟随为会话内瞬时 UI 状态不持久化；FR-CHAT-10 内容列 max-width 960px 居中/输入框圆角 8px/发送图标化/用户右侧气泡、助手左侧无气泡/HH:mm 时间戳替代角色前缀；FR-FILE-02 `@` 选择器为唯一文件引用入口；FR-CMD-03 P1 转正（get_commands 命令全集、实时过滤、键盘导航、选中插入）；FR-MOD-01③ 底部内联选择器与状态栏/命令面板三入口等价；FR-MOD-04 token 权威取值=最近一条助手消息 usage.totalTokens、窗口=get_state contextWindow、百分比四舍五入取整、无助手消息显示 —）。

### 10.1 聊天（FR-CHAT）

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-CHAT-01 | P0 | ✅ 已实现 | `src/bridge/piBridge.ts`（`handleMessageUpdate`：text/thinking/toolcall delta 翻译）；`webview/main.ts`（消息路由）；`webview/render/messages.ts`（`TextBlockView` 流式追加 + 300ms 节流重排） | text delta 级实时渲染，不阻塞 UI |
| FR-CHAT-02 | P0 | ✅ 已实现 | `webview/render/markdown.ts`（marked + highlight.js 语言高亮 + DOMPurify 消毒） | 支持标题/列表/表格/代码块/链接/行内代码；输出经消毒（NFR-03） |
| FR-CHAT-03 | P0 | ✅ 已实现 | `webview/render/messages.ts`（`ThinkingBlockView`：`<details>` 默认折叠，展开后流式）；`src/bridge/piBridge.ts`（thinking_delta） | — |
| FR-CHAT-04 | P0 | ✅ 已实现 | `webview/render/messages.ts`（`ToolCardView`：工具名/摘要/状态/展开输入输出；`MessageView.finalize` 终稿块视图回填 `this.blocks`——#D-04 修复：toolResult 晚于 message_final 到达时 `toolcallStatus` 仍能按 toolCallId 命中卡片，状态随执行结果更新 running→success/error）；`src/util/text.ts`（`truncateToTail`/`summarizeToolArgs`）；`src/bridge/piBridge.ts`（`tool_execution_*` 翻译、`getToolOutput` 宿主全量缓存）；`src/panel/chatPanel.ts`（`copy_output` → `vscode.env.clipboard`） | bash 展示命令与输出；默认保留尾部 200 行（`sdysyhj.outputTailLines` 默认 200），“复制全部”取完整输出；#D-04 详见 §10.10 |
| FR-CHAT-05 | P0 | ✅ 已实现 | `src/bridge/piBridge.ts`（`abort`：RPC `abort`，`agent_settled(aborted)` → 瞬态 `aborted` 后回 `idle`）；`webview/main.ts`（Stop 按钮，中止后恢复可输入 + “已中止”标记）；`src/extension.ts`（`sdysyhj.abort` 命令） | 历史保留；状态流 streaming→aborted→idle（v0.2.2 口径 A：『已中止』为消息级标记，运行状态最终回 idle） |
| FR-CHAT-06 | P1 | ✅ 已实现 | `src/bridge/piBridge.ts`（`sendPrompt` 运行中 → `steer`/`followUp`）；`webview/main.ts`（插话模式下拉：steer/follow-up） | 默认模式取 `sdysyhj.sendMode` |
| FR-CHAT-07 | P0 | ✅ 已实现 | `src/bridge/piBridge.ts`（error 事件：prompt 被拒、`stopReason=error`、崩溃恢复；`handleExtensionError`：`extension_error` → 非阻断 toast + 全字段日志，Issue #2 / #D-03）；`src/bridge/rpcTransport.ts`（`PiRuntimeError` 含可行动指引与详情）；`webview/main.ts`（`showError` 错误卡片 + hint；`showToast` 一次性提示） | 未配置凭证/子进程崩溃/provider 报错均有可读信息与修复指引；上游扩展通知（`extension_error`）不进错误卡片——toast 一次性提示（60s 同键去重，文案含扩展路径+错误首行+Output 指引）+ 日志全字段（v0.2.3 澄清 #14） |
| FR-CHAT-08 | P0 | ✅ 已实现 | `webview/main.ts`（头部 `status-line`）；`src/extension.ts`（VS Code 状态栏 `refreshStatusBar`）；`src/panel/messages.ts`（`run_state`/`model_info`/`session_name`） | 仅负责四字段（模型/thinking/运行状态/会话名）展示与状态流转（idle→starting→streaming→aborted/idle/error，settled 后回 idle，v0.2.2 口径 A）；点击切换交互归属 FR-MOD-01/02 |
| FR-CHAT-09 | P1 | ✅ 已实现 | `webview/render/followState.ts`（纯逻辑状态机：跟随决策，无 DOM 依赖，40px 阈值/每轮默认跟随/打断/恢复/idle 门控）；`webview/main.ts`（接线薄层：`stream_start`→`onStreamStart` 默认置跟随态；`run_state`→`onRunState`；`#messages` 滚动容器 scroll 监听→`onUserScroll(距底 px)`（程序滚动自标记区分）；消息追加/增量（text/thinking/toolcall delta、toolcall_status、message_final）后滚动决策统一走 `applyFollowScroll`；`loadHistory` 尾部一次性初始定位，不走向量决策） | 流式期间默认跟随（每轮流式开始重置为跟随态）；用户上滚距底 >40px 停止跟随且增量渲染不推动滚动位置；滚回 ≤40px 恢复；idle 不自动滚动；不持久化、无消息级标记（④）；“每轮”=一次 agent 运行，轮内多条助手消息的后续 stream_start 不覆盖用户打断（实现口径见 §10.10；v0.4 消息区拆分滚动容器/内容列后度量仍取自 `#messages` 滚动容器） |
| FR-CHAT-10 | P1 | ✅ 已实现 | `webview/styles/styles.css`（① `.content-col` 内容列 `max-width: 960px` + 左右 `margin: auto`，消息区/错误区/输入区共用于同一列；② `.input-shell` 输入框容器 `border-radius: 8px`；④ `.message-user` 右对齐 + `.message-body` 气泡包裹（背景色+圆角）、`.message-assistant` 左对齐无气泡；`.message-time`）；`src/panel/chatPanel.ts`（HTML：`#messages-col`/`#errors-col`/`#input-col` 内容列容器、`#input-shell`、③ 图标发送按钮 `#btn-send`（内联 SVG 上箭头，无文字标签，`aria-label="发送"`/`title="发送"`）、底部行 `#model-selector`/`#usage-line`）；`webview/render/messages.ts`（⑤ 去 User/Assistant 角色前缀，改 `.message-time` HH:mm 时间戳，终稿以权威 timestamp 覆盖）；`webview/render/format.ts`（`formatHHmm` 纯函数） | ① 内容列最大宽度定值 960px（面板更宽时左右留白相等）；② 输入框容器圆角 8px；③ 发送图标化，可访问性名称="发送"；④ 用户右侧气泡/助手左侧无气泡；⑤ 每条用户/助手消息展示 HH:mm（本地时区，可断言 `^\d{2}:\d{2}$`）；thinking 折叠块与工具卡片功能标签不受影响 |
| FR-CHAT-11 | P0 | ✅ 已实现（TASK-008） | `src/bridge/piBridge.ts`（D1 宿主单源 id：`openPendingEcho` 入账 + `user_message` 事件携带 id；D2 待回声账本：`matchPendingEcho`（精确匹配 run-head 优先→发送序 + 确定性兑底）/`handleUserEcho`（回声复用乐观条目 id 合并更新 + message_final 就地 finalize）/`bindQueuedTexts`（queue_update 快照 diff 绑定展开文本，run-head prompt 不入候选）/`settlePendingEchoes`（settled 残留清理，队列保留者留存）；D3 `disposition:"handled"` 与 `success:false` 响应即到即出账，零时间阈值；D5 `refreshHistory` 权威重建后仍入队条目按发送序回填尾部）；`src/panel/messages.ts`（协议 `user_message` 增 `id`，与 §3.4 一致）；`webview/main.ts`（D1 视图直接用宿主 id，删 `webview-user-N`/`userSeq`；D4 append 兑底收敛两合法场景且按消息 id 幂等）；`test/helpers/fake-pi-cli.js`（所有 `run*` 剧本按 json.md L30–46 补发 user 回声、queue_update 全量快照、QUEUEMIX 混合注入剧本、`FAKE_PI_REPLAY` 回放模式）；`test/fixtures/golden/`（D8：真实 pi 1.5.2 录制，`npm run record:golden` 双录一致落盘，回放进 verify:integration 零网络） | 回归索引（D9）：U1–U12 + D2.2 兑底 = `test/unit/piBridge.test.ts`；I1/I2/I5 = `test/integration/user-echo.test.ts`；I3/I4 = `test/integration/golden-replay.test.ts`；①–⑤ 逐条映射见 §10.12 D9；视觉层入 UI 手工 checklist（webview 无 DOM 测试基建，兑底 = U1/I1/I3 的 id 贯通断言） |

### 10.2 会话管理（FR-SESS）

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-SESS-01 | P0 | ✅ 已实现 | `src/bridge/piBridge.ts`（`newSession`：RPC `new_session`）；`src/extension.ts`（命令）；`webview/main.ts`（＋按钮） | 旧会话由 pi 原生落盘保留 |
| FR-SESS-02 | P0 | ✅ 已实现 | `src/session/sessionStore.ts`（`listSessions`：读 pi 原生 session 存储，标题/时间/消息数）；`src/panel/chatPanel.ts`（`showHistory` QuickPick） | 不另建副本（NFR-03） |
| FR-SESS-03 | P0 | ✅ 已实现 | `src/bridge/piBridge.ts`（`switchSession`：RPC `switch_session` + `get_messages` 历史重放）；`src/extension.ts`（启动续接最近会话） | 重放历史与会话 JSONL 一致（含压缩状态由 pi 侧权威恢复）；集成测试按 JSONL fixture 逐条校验（含 compaction 条目会话） |
| FR-SESS-04 | P1 | ✅ 已实现 | `src/bridge/piBridge.ts`（`renameSession`：RPC `set_session_name` + `session_info_changed`）；`src/panel/chatPanel.ts`（`showRenameInput`）；`webview/main.ts`（点会话名重命名） | — |
| FR-SESS-05 | P2 | ⏭ 二期 | — | 依赖 pi 分支树 UI（`fork`/`get_tree`），UI 延后到二期 |
| FR-SESS-06 | P0 | ✅ 已实现 | 单活动会话 + 历史切换（`webview/main.ts` 单消息流；无并行标签） | — |
| FR-SESS-07 | P1 | ✅ 已实现 | `src/session/sessionStore.ts`（`SessionFileWatcher`：mtime/size 对比，2.5s 轮询 + `setSuspended` 运行态门控）；`src/bridge/piBridge.ts`（`external_change` 事件 + `sessionStale` 拦截；`entry_appended` → `markSynced` 豁免；`setRunState` 挂起/恢复接线；`agent_settled` 补学 `sessionFile`）；`webview/main.ts`（提示横幅 + 刷新按钮） | v0.2.2 口径 C：检测后提示刷新且拦截后续 prompt（不发 RPC、引导刷新）；刷新/新建/切换会话后解除；仅真实外部修改触发——本端写入经 `entry_appended` 豁免 + 运行态挂起（starting/streaming 只吸收不报警，回 idle/aborted 恢复并同步基线；Issue #1 #D-01）+ 全新会话路径 settled 后补学跟踪（#D-02）；检测时限 ≤5s（2.5s 轮询，一个周期内检出） |

### 10.3 文件与工作区（FR-FILE）

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-FILE-01 | P0 | ✅ 已实现 | `src/extension.ts`（cwd = `workspaceFolders[0]`，多根取第一个；无工作区 = 用户主目录并提示文件工具受限）；`src/bridge/piBridge.ts`（子进程 cwd） | — |
| FR-FILE-02 | P0 | ✅ 已实现 | `webview/main.ts`（输入 `@` 触发选择器，v0.4 起为唯一文件引用入口）；`src/panel/chatPanel.ts`（`showFilePicker`：工作区文件 QuickPick；`file_ref` 插入路径；v0.4 修订：输入区已无 `btn-file` 添加文件按钮及其接线） | v0.4 修订：`@` 选择器为唯一文件引用入口，输入区无独立“添加文件”按钮（DOM 可断言：无 `#btn-file`）；FR-FILE-03 右键发送不受影响 |
| FR-FILE-03 | P1 | ✅ 已实现 | `package.json`（explorer/editor 右键菜单）；`src/extension.ts`（`sdysyhj.sendToPi`）；`src/panel/chatPanel.ts`（`sendToPi`：路径/选区预填 prompt 素材） | 选区含行号标注；预填输入框可编辑后发送 |

### 10.4 模型控制（FR-MOD）

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-MOD-01 | P1 | ✅ 已实现 | `src/bridge/piBridge.ts`（`listModels`/`setModel`：RPC `get_available_models`/`set_model`）；`src/panel/chatPanel.ts`（① 状态栏入口 `showModelPicker`；② 命令面板 `sdysyhj.switchModel`；③ 底部内联选择器：`request_models`→`models_list` 数据通道 + `set_model` 切换通道，复用同一 `bridge.setModel`）；`webview/main.ts`（③ `#model-selector` 常显当前模型、点击弹 `#model-menu` 列表、选中即切换，`model_info` 事件驱动展示同步）；状态栏刷新（`src/extension.ts`） | 三入口等价（均终接 `bridge.setModel` → `refreshState` → `model_info` 事件 → 状态栏/头部/底部选择器同步更新）；v0.4 增补入口③ |
| FR-MOD-02 | P1 | ✅ 已实现 | `src/bridge/piBridge.ts`（`setThinkingLevel`/`cycleThinkingLevel`：RPC `set_thinking_level`/`cycle_thinking_level`）；`src/panel/chatPanel.ts`（`showThinkingPicker`，含“循环切换”项）；`src/util/config.ts`（`thinkingDefault` 透传） | 等级枚举以 pi 侧 `get_available_thinking_levels` 返回为准，透传不固化（`sdysyhj.thinkingDefault` 为自由字符串） |
| FR-MOD-03 | P1 | ✅ 已实现 | pi 会话文件持久（`model_change`/`thinking_level_change` 条目）；`src/extension.ts`（启动续接最近会话 + `get_state` 回显状态栏）；`webview/main.ts`（底部模型选择器随 `model_info` 事件同步展示，重启后 ready 回放 `model_info` 同样覆盖） | 切换结果随会话保留，重启插件后反映在状态栏与底部模型选择器（v0.4 展示口径补齐） |
| FR-MOD-04 | P1 | ✅ 已实现 | `src/bridge/piBridge.ts`（① `captureUsage`：`message_update` 携带 Usage 即时捕获 + `message_end` 权威终稿覆盖；② `refreshState` 读 `get_state` `model.contextWindow`；`emitUsageInfo` 变化即透出（同值去重）；④ `refreshHistory` 取新会话最后一条助手消息 usage、无则重置 null，`newSession` 同步重置；`getUsageInfo` 快照供 ready 重放）；`src/panel/messages.ts`（`usage_info` 协议消息）；`src/panel/chatPanel.ts`（ready 重放 `usage_info`）；`webview/render/format.ts`（`formatContextUsage` 纯函数：k/M 缩写 + 百分比四舍五入取整）；`webview/main.ts`（`#usage-line` 展示，`usageEl.title` 含千分位详情） | ③ 展示 token 数及占窗口百分比（`12.3k / 200k (6%)`）；无助手消息显示 —；窗口未知仅展示 token 数；compaction toast 行为不变（不在本 FR 范围） |

### 10.5 命令与集成（FR-CMD）

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-CMD-01 | P0 | ✅ 已实现 | `package.json`（`contributes.commands`/`menus`）；`src/extension.ts`（注册） | Open Chat / New Session / Abort / Show Session History / Report Issue 齐备 |
| FR-CMD-02 | P0 | ✅ 已实现 | `src/util/log.ts`（Logger + 脱敏包装）；`src/util/redact.ts`（NFR-03）；`src/extension.ts`（Output Channel「Sdysyhj」）；`src/bridge/rpcClient.ts`（`onStderr` 行缓冲原文转发、`onAnomaly` 协议异常）；`src/bridge/piBridge.ts`（`attach` 接线 stderr/异常→日志；`handleExtensionError`：`extension_error` 全字段 warn 入日志，Issue #2 / #D-03） | 子进程 stderr 原文、RPC 协议异常实时入 Output Channel（脱敏）；退出时冲刷无换行尾部；`extension_error` 全字段（extensionPath/event/error，不截断不去重）入日志 |
| FR-CMD-03 | P1 | ✅ 已实现 | `src/bridge/protocol.ts`（`RpcSlashCommand` 类型：name 不含前导 `/`，与 pi rpc-types 对齐）；`src/bridge/rpcClient.ts`（`getCommands`：RPC `get_commands`，解析 `data.commands`）；`src/bridge/piBridge.ts`（`PiRpcClient.getCommands` 接口 + `listCommands` 封装：失败记日志返回空）；`src/panel/chatPanel.ts`（`request_commands`→`commands` 回发）；`src/panel/messages.ts`（`SlashCommandInfo` 协议）；`webview/render/commandMenu.ts`（纯逻辑：`/` 前缀触发、名称/描述子串不区分大小写过滤、↑/↓ 环绕导航、`insertText`=`/`+命令名，无匹配/空全集隐藏）；`webview/main.ts`（接线：input 事件实时过滤、Enter 选中插入不发送、Esc 关闭、鼠标点击等效选中、首次 `/` 请求命令全集、会话切换后缓存失效重取） | v0.4 P2→P1 转正；⑤ `get_commands` 不可用/返回空不显示菜单，`/` 开头文本可直接发送透传；选中后焦点保持输入框，后续沿用 Enter 发送 |
| FR-CMD-04 | P2 | ⏭ 二期 | — | 复用 pi 的 MCP 配置自动生效，无专门 UI（二期） |
| FR-CMD-05 | P0 | ✅ 已实现 | `src/bridge/rpcTransport.ts`（`resolvePiRuntime`：auto=PATH 探测→内置回退；path=显式指定；bundled=内置；失败抛 `PiRuntimeError` 含详情+指引；`defaultResolveBundledCli` 逐级向上探测 node_modules，兼容打包布局）；`package.json`（`sdysyhj.piRuntime`/`sdysyhj.piPath`）；`src/bridge/piBridge.ts`（`buildArgs`） | “可用 pi”判据：`pi --version` 退出 0 且含版本号且 ≥ 最低支持版本（`MIN_SUPPORTED_PI_VERSION` = 0.84.0）；不满足则回退内置运行时；打包布局（<ext>/dist + <ext>/node_modules）已回归验证 |

### 10.5.1 实验面板：assistant-ui 迁移试点（FR-AUI，TASK-009 阶段①）

> 需求基线 v0.6 §4.6（阶段①出口口径，不入 MVP 门禁，澄清 #18）；设计/实现记录见 §10.13（含交付小节双切片对比报告）。

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-AUI-01 | P0（阶段①） | ✅ 已实现 | `package.json`（视图条目 `sdysyhj.chatLabView` 第二位 + 命令 `sdysyhj.openChatLab` + activationEvents 惰性 `onView:sdysyhj.chatLabView`）；`src/lab/labViewProvider.ts`（vscode 薄壳：viewType/HTML「聊天（实验）」/options）；`src/extension.ts`（增量注册，retainContextWhenHidden:true）；`src/lab/labChatPanel.ts`（vscode-free 面板核心，与默认面板共享同一 PiBridge）；`esbuild.mjs`（第三入口 `media/lab.js`，默认面板两项入口零改动） | ①②③ 零变更自动层 = `test/unit/lab-isolation.test.ts` D1①–④（package.json 解析/esbuild 文本/chatPanel.ts 冻结面/默认面板依赖图无 react）；既有 verify 全绿（见交付小节） |
| FR-AUI-02 | P0（阶段①） | ✅ 已实现 | ①路线 A：`src/lab/chatRoute.ts`（`createLabChatRoute`：RouteHandler + `LabFrameTranslator` 帧 + 多请求账本 + abort 传播）+ `webview/lab/sliceA.tsx`（useChatRuntime+AssistantChatTransport+vscodeFetch）；②路线 B：`webview/lab/store.ts`（纯 reducer）+ `webview/lab/threadMessageLike.ts`（映射）+ `webview/lab/sliceB.tsx`（useExternalStoreRuntime）；③④⑤⑥：`webview/lab/main.tsx`/`shell.tsx`（A/B 面板内开关）+ `test/helpers/fake-pi-cli.js`（LAB-XSS 剧本）；回放注入点 = FAKE_PI_REPLAY 子进程（低于适配层，防自证） | 判定面 = 通道+数据层（D8）；`test/unit/lab-route.test.ts`（帧翻译/请求解析）、`lab-store.test.ts`、`lab-store-mapping.test.ts`；集成 `test/integration/lab-slice-a.test.ts`/`lab-slice-b.test.ts`（真实隧道/postMessage 泵全链路）；XSS DOM 层入真机 checklist |
| FR-AUI-03 | P0（阶段①）/P1（阶段①） | ✅ 已实现 | 集成回放：`test/integration/lab-slice-a.test.ts`（A：golden-prompt-basic 解码流帧序/文本一致 P0 + golden-steer-followup 三流不丢 P1 + 400 解析 + abort + LAB-XSS）；`test/integration/lab-slice-b.test.ts`（B：泵事件 id 贯通 + store 终态 = fixture 全量 + toThreadMessageLike 输出 + LAB-XSS） | 回放驱动 = fake-pi FAKE_PI_REPLAY（录制游标一致性断言，零网络零时钟）；期望值自 fixture 逐行推导（防漂移） |
| FR-AUI-04 | P0（阶段①） | ✅ 已实现（自动兜底层） | `webview/lab/lab.css`（@import `@assistant-ui/vscode/theme.css` + 手写外壳消费 shadcn token）；`test/unit/lab-theme.test.ts`（静态审计：token 链终点 --vscode-*、调色板代入浅深差异、WCAG ≥4.5）；`test/fixtures/vscode-theme-defaults-palette.json`（Dark/Light Modern 基值，源 microsoft/vscode theme-defaults，§11 #18） | 实测：正文对比度 Dark 11.06 / Light 10.55，气泡 4.53/6.31（均 ≥4.5）；getComputedStyle 字面执行与真实渲染 = UI 手工 checklist（截图） |
| FR-AUI-05 | P0（阶段①） | ✅ 已实现（四项证据全出） | ①版本锁定：`package.json` 九项精确版本 + `test/unit/lab-versions.test.ts`（含 zod-jitless 源顺序断言）；②CSP：`renderWebviewHtml` strict + `test/unit/lab-csp.test.ts`（八项指令、无 unsafe-eval/inline）；③预算：`test/unit/lab-budget.test.ts`（≤3,145,728 字节断言）+ `lab-metrics.mjs` 实测（lab 1,157,559 B / 宿主增量 +368,758 B / 默认依赖图零命中）；④retainContextWhenHidden：`src/extension.ts` 显式声明 + `lab-isolation.test.ts` 注册结构断言 | 实测数据与门禁结论见 §10.13 交付小节；DOM 行为层（隐藏重显/零 CSP violation）入真机 checklist（D8 遗留上报①） |
| FR-AUI-06 | P0（阶段①） | ✅ 已交付 | `test/tooling/lab-metrics.mjs` + `lab-metrics-driver.ts`（四维无人值守度量，自终止）；报告 = §10.13 末尾「阶段①双切片对比报告」交付小节（含升级评估要点与中性结论） | 路线选择不预设（裁决权 = 总调度阶段①出口）；复现命令：`node test/tooling/lab-metrics.mjs --baseline v0.1.6 --runs 7` |

#### FR-AUI 切换批次（TASK-009，发版 0.1.8；需求基线 v0.7 §4.6）实现行

> 上表为阶段①历史追溯行（阶段①判定已交付）；本表为切换批次（FR-AUI-02/03/05/07/08）实现位置与回归索引（交付小节详见 §10.14）。

| 编号 | 优先级 | 状态 | 实现位置 | 备注 |
|---|---|---|---|---|
| FR-AUI-02 | P0（切换批次） | ✅ 已实现 | 路线 B 单实现：`webview/ui/threadMessageLike.ts`（D2 全量映射：text/reasoning/tool-call result·isError·argsText/metadata.custom/空块滤除/#21 契约顺从）+ `webview/ui/store.ts`（reducer+delta 合批）+ `webview/ui/shell.tsx`（真实 useExternalStoreRuntime）；part 渲染：`markdown.tsx`（MarkdownTextPrimitive+remark-gfm/remark-breaks+hljs common 渐进高亮+DOMPurify sink）/`toolCard.tsx`（FR-CHAT-04 全要素）；Composer 全量 `composer.tsx`+`fileRefTrigger.ts`；路线 A 随 `src/lab/**`/`webview/lab/**` 移除（#D-06 关闭） | 判定面 = `test/integration/ui-golden-dom.test.ts`（真实 runtime DOM）+ `ui-xss.test.ts`；回放注入点 = FAKE_PI_REPLAY 子进程（防自证口径不变） |
| FR-AUI-03 | P0/P1（切换批次） | ✅ 已实现 | golden-prompt-basic 全量回放 P0 + golden-steer-followup P1 + 双面板一致快照（FR-AUI-03④）：`test/integration/ui-golden-dom.test.ts`、`ui-dual-panel.test.ts` | 期望值自 fixture 逐行推导；条数=澄清 #12 口径 |
| FR-AUI-05 | P0（切换批次） | ✅ 已实现（四项证据全出） | ①版本锁定：`package.json`（删 ai/ai-sdk，增 react-markdown 链+devDeps jsdom/RTL，全精确锁）+ `test/unit/ui-versions.test.ts`（含删除项断言+zod-jitless 源顺序）；②CSP：`renderWebviewHtml` strict + `test/unit/ui-csp.test.ts`（八项指令）；③预算：`test/unit/ui-budget.test.ts`（三项：chat.js≤4MiB / 宿主增量≤1MiB vs v0.1.7 基线 459,382B / 经典依赖图零 React）+ ④retainContextWhenHidden：`src/extension.ts` 注册 + `ui-isolation.test.ts` 结构断言 | 实测：chat.js 1,000,004B（23.8% 预算）/ 宿主 −355,133B（删 ai 链后净减）/ 经典零命中；隐藏重显行为层入真机 checklist |
| FR-AUI-07 | P0（切换批次） | ✅ 已实现 | ①切默认：`src/ui/chatViewProvider.ts`+`chatController.ts`（viewType `sdysyhj.chatView`）+ `webview/ui/`（产物 `media/chat.js`）；②命名清零：`package.json`（views/命令/activationEvents 结构断言，无「实验/Lab」）；③经典回退：`src/panel/chatPanel.ts`（viewType `sdysyhj.chatViewClassic`）+ 命令 `sdysyhj.openChatClassic`；④契约零变更：既有 9 命令+5 配置逐项断言 | 判定面 = `test/unit/ui-isolation.test.ts` + `ui-dual-panel.test.ts`（双面板一致快照）+ 双面板切换 MANUAL 冒烟 |
| FR-AUI-08 | P0（切换批次） | ✅ 已实现 | §4.1–4.5 判定载体平移新 UI：FR-CHAT-01/03/04/05/06/09/10/11 → `webview/ui/**`（渲染/跟随/Composer/视觉/回声两规则，D2–D6）；FR-SESS-01/02/03/04/06/07、FR-FILE-01/02/03、FR-MOD-01~04、FR-CMD-01/02/03/05 → 宿主零改动（`src/bridge/**` 零改动）+ `webview/ui` 协议接线 + `src/panel/hostActions.ts` 共享动作层；等价判定 = 既有验收语义 + golden 回放 + 双面板一致快照 | 回归重定向表见 §10.14 交付小节；P2 项（FR-SESS-05/FR-CMD-04）维持二期 |

### 10.6 设计偏差与实现说明

1. **协议层自实现 RpcClient（等价封装）**。官方 npm 包 `@earendil-works/pi-coding-agent`（1.5.2）的 `exports` 未导出 `RpcClient` 子路径（deep import 触发 `ERR_PACKAGE_PATH_NOT_EXPORTED`），故按任务约定以 §1 的 JSONL 约定自实现：`src/bridge/jsonl.ts`（严格 LF 切分、`StringDecoder`、禁用 readline）、`src/bridge/rpcClient.ts`（请求/响应 id 关联、超时、事件分发、stdin 关闭有序退出）。集成测试以 mock 子进程（`test/helpers/fake-pi-cli.js`）全链路验证帧解析与命令语义。该包仍作为 dependency 提供内置运行时（`dist/bundle/cli.js`）。
2. **宿主↔webview 消息协议补充**。在 3.4 节示意判别联合基础上补充实现所需消息：`config`/`ready`（就绪回放）、`toolcall_status`（工具执行状态/输出增量，FR-CHAT-04 必需）、`session_name`、`toast`、`external_change`、`file_ref`、`input_prefill`（FR-FILE-02/03）。语义与渲染策略（delta 追加、`message_final` 权威覆盖、DOM 尾部截断 + 宿主缓存复制全部）与 3.4 节一致。v0.4（TASK-006）追加：`request_commands`/`commands`（FR-CMD-03 命令全集拉取）、`request_models`/`models_list`/`set_model`（FR-MOD-01③ 底部内联选择器，与既有入口同源）、`usage_info`（FR-MOD-04 用量透出，桥侧变化即发 + ready 重放快照）。
3. **启动自动续接最近会话**。为满足 FR-MOD-03“重启插件后反映在状态栏”，扩展启动时以 `--session` 续接当前工作区最近会话（等价 `pi -c`）；与 FR-SESS-01/03 行为兼容。
4. **依赖未降级**。`marked` + `dompurify` + `highlight.js` 均经 npm 安装成功（pinned：marked 18.2.1 / dompurify 3.4.18 / highlight.js 11.12.0），未启用轻量自实现替代。
5. **测试工具链**。Vitest 5（unit + integration 均 `vitest run`，离线可重跑）；`@types/node@22` 仅为满足 vitest 工具链 peer 约束，扩展编译目标仍为 node18（esbuild target）。
6. **基线 v0.2.1 验收口径对齐**：① 大输出默认保留尾部 200 行（`sdysyhj.outputTailLines` 默认 200，单测断言），“复制全部”取完整输出（宿主缓存）；② “可用 pi”判据 = `pi --version` 退出 0 + 含版本号 + 版本 ≥ `MIN_SUPPORTED_PI_VERSION`（0.84.0，`src/bridge/rpcTransport.ts` 声明），不满足自动回退内置运行时（显式路径则报含详情错误）；③ 历史重放与会话 JSONL 一致（集成测试以含 compaction 条目的 session JSONL fixture 逐条校验，含 toolResult 折叠）；④ FR-CHAT-08 仅状态展示与状态流转，点击切换交互归属 FR-MOD-01/02；⑤ thinking 等级枚举透传不固化（`sdysyhj.thinkingDefault` 自由字符串，合法枚举以 pi `get_available_thinking_levels` 为准）。
7. **NFR-03 落盘位置**：会话/状态仅落 `$HOME/.pi/agent/`（pi 原有位置，含 `PI_CODING_AGENT_DIR`/`PI_CODING_AGENT_SESSION_DIR` 环境覆盖）；插件源码无任何写盘逻辑（仅读 session 存储与监视），不产生副本。
8. **NFR-01 代理判据自测**：集成测试“NFR-01 代理”验证 600 个 text delta 零丢失（逐段拼接 == 权威终稿）+ 全量渲染 ≤30s；webview 增量合并批处理（thinking 按 rAF 合批、正文 300ms 合并重排）。

### 10.7 失败回路第 1 轮修复记录（核验报告 report-e9ae693，需求基线 v0.2.2 口径）

| 缺陷 | 根因 | 修复位置 | 回归测试 |
|---|---|---|---|
| #1（P0，FR-CMD-05）打包布局内置运行时解析失败 | ① `require.resolve` 受包 exports 限制（仅 `import` 条件，CJS 下抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`）；② 相对回退路径比打包布局（`<ext>/dist` → `<ext>/node_modules`）多一级 `..` | `src/bridge/rpcTransport.ts`（`defaultResolveBundledCli(baseDir?, exists?)`：从 bundle 所在目录逐级向上探测 `node_modules`，不依赖 exports 映射；显式 baseDir 时确定性跳过 require.resolve） | `test/unit/runtime.test.ts`（打包布局/旧式入口/深层目录/负例 5 组）；`test/integration/defects-regression.test.ts`（复现脚本形态：esbuild 真实 bundle + vscode stub + 子进程激活→ready→prompt，断言 `source=bundled` 且 `PROD-REPRO-OK`） |
| #2（P0，FR-CMD-02）stderr/协议异常未入 Output Channel | RpcClient 的 stderr 累积与 `onAnomaly` 无消费方接线 | `src/bridge/rpcClient.ts`（新增 `onStderr` 行缓冲原文转发 + 退出冲刷尾部）；`src/bridge/piBridge.ts`（`attach` 接线 stderr/异常→logger，经脱敏入通道） | `test/unit/rpcClient.test.ts`（行缓冲/跨 chunk/尾部冲刷）；`test/unit/piBridge.test.ts`（日志写入+脱敏）；`test/integration/defects-regression.test.ts`（MOCK-STDERR 口径：哨兵原文+非法 JSONL 异常+脱敏） |
| #3（P1，口径 A）中止后状态不回 idle | `agent_settled(aborted)` 后停畵 `aborted`，未迁回 `idle` | `src/bridge/piBridge.ts`（settled 后先发瞬态 `aborted`（消息级『已中止』标记独立保留）再发 `idle`；崩溃致中止同口径） | `test/unit/piBridge.test.ts`（状态流 `streaming→aborted→idle`）；`test/integration/pi-bridge.test.ts`（同口径断言） |
| #4（P1，FR-SESS-07 口径 C）外部修改后未拦截/未自动刷新 | 仅提示不拦截，陈旧状态可继续交互 | `src/bridge/piBridge.ts`（`sessionStale` 标记：检测后拦截 prompt（不发 RPC）并引导刷新；刷新/新建/切换会话解除）；`src/session/sessionStore.ts`（轮询 5s→2.5s 保 ≤5s 检测） | `test/unit/piBridge.test.ts`（拦截+引导+解除×2）；`test/integration/defects-regression.test.ts`（MOCK 真子进程：拦截时无 prompt RPC，刷新后恢复） |
| #6（P1，NFR-05）prompt/abort 日志缺失 | `sendPrompt`/`abort` 路径无 logger 调用 | `src/bridge/piBridge.ts`（prompt 发送（含 steer 排队）/abort 请求入日志；与既有『新建会话』『子进程退出』凑齐 4 类关键路径） | `test/unit/piBridge.test.ts`（4 类齐全）；`test/integration/defects-regression.test.ts`（4 类齐全，含崩溃退出） |
| #2 补（交付验收退回）：stderr 转发与 `agent_settled` 时序竞态（负载下间歇失败） | stdout/stderr 为两个独立 fd，libuv 同一 poll 批次内回调顺序不与子进程写入顺序一致；旧实现同步派发 settled，stderr 可能尚未进入日志 | `src/bridge/rpcClient.ts`（有序派发队列 + `stderrDrainBarrier`：`agent_settled` 经两连 `setImmediate` 让出（poll 阶段及其 nextTick/微任务先于 check 阶段，已就绪 stderr 必先落地）后再派发；FIFO 保序不打乱其他事件） | `test/unit/stderr-ordering.test.ts`（可控子进程确定性复现竞态：settled 先处理、stderr 后送达→ 断言 stderr 全部先于 settled；FIFO 保序）；验收：verify:integration 连续 10+10 次全绿（含并行 verify:unit 负载） |

口径 B（消息数=消息总数 user+assistant）：实现已符合，无改动。

### 10.8 Issue #1 缺陷修复记录（TASK-003，#D-01/#D-02）

| 缺陷 | 根因 | 修复位置 | 回归测试 |
|---|---|---|---|
| #D-01（P1，FR-SESS-07）外部修改检测误报：pi 子进程在 turn_start 边界落盘 user 条目后、首个 assistant `message_final` 前，2500ms 轮询落入“已落盘、未 markSynced”窗口 → 误报“会话在插件之外被修改”并拦截第二条消息（Issue #1） | ① `entry_appended` 事件在 `handleEvent` default 分支仅记 debug 日志，不参与基线同步；② `SessionFileWatcher` 轮询不区分运行状态（无运行态门控） | `src/bridge/piBridge.ts`（`handleEvent` 新增 `entry_appended` 分支 → `watcher.markSynced()`；`setRunState`：starting→`setSuspended(true)`，idle/aborted→`setSuspended(false)`+`markSynced`；`SessionWatcherLike` 增加 `setSuspended` 语义）；`src/session/sessionStore.ts`（`SessionFileWatcher.setSuspended`：挂起期间轮询只吸收变化不报警，恢复时先 `markSynced` 再检测） | `test/unit/piBridge.test.ts`（运行态门控接线；(a) starting/streaming 期间会话文件变化只吸收不报警、settled 后恢复正常检测；(b) idle 下迟到 `entry_appended` 不误报；(c) idle 下真实外部写入一个轮询周期内检出）；`test/unit/sessionStore.test.ts`（`setSuspended` 原语）；`test/integration/pi-bridge.test.ts`（“第二条消息”全链路重放：fake 子进程 prompt 接受时物理写会话文件 + `entry_appended` + 延迟首响应，全程无 `external_change`，随后外部追加检出并拦截） |
| #D-02（P2，FR-SESS-07）全新会话外部修改检测失效（漏报）：`sessionFile` 仅在 start/crash/new/switch 的 `refreshState` 中学习，新会话首轮结束后仍为空 → watcher 永不跟踪 | `agent_settled` 处理无补学逻辑 | `src/bridge/piBridge.ts`（`agent_settled` 回 idle 后若 `sessionFile` 为空 → `await refreshState()` 补学路径并 `track`；此时已回 idle，`track`→`markSynced` 不会吞掉真实外部修改） | `test/unit/piBridge.test.ts`（#D-02：settled 补学后进入跟踪，随后的外部写入可检出）；`test/integration/pi-bridge.test.ts`（重放场景检出段） |

稳定性：修复后 `verify:unit`（97 用例）与 `verify:integration`（30 用例）并行负载下连跑 10 轮全绿（时序类断言均有界确定性等待）。

### 10.9 Issue #2 缺陷修复记录（TASK-004，#D-03）

| 缺陷 | 根因 | 修复位置 | 回归测试 |
|---|---|---|---|
| #D-03（P1，FR-CHAT-07 展示通道口径）`extension_error` 展示治理缺陷：上游扩展噪音以持久错误卡片呈现且信息丢失——`emit("error")` 进 webview `showError` 持久卡片；丢弃 `extensionPath`/`event` 字段；无去重；hint 硬编码指向本机不存在的 `~/.pi/agent/extensions`（Issue #2；上游根因：会话重载后陈旧 ctx 异步回调触发扩展报错，本仓无法消除事件，只对展示负责） | `handleEvent` 的 `extension_error` 分支直接走错误卡片通道，与 FR-CHAT-07「需用户行动的错误」范围不符（v0.2.3 澄清 #14：展示通道=非阻断通知） | `src/bridge/piBridge.ts`（`handleExtensionError`：① toast 非阻断一次性提示；② 60s 同键（extensionPath+error）去重（仅抑制重复 toast，日志始终全量；过期键清理防无界增长）；③ toast 文案=扩展路径+错误首行（`firstLine` 120 截断）+尾部「详情见 Output「Sdysyhj」」指引；④ `logger.warn` 全字段 extensionPath/event/error（不截断不去重）；⑤ 删除误导 hint） | `test/unit/piBridge.test.ts`（Issue #2 回归 6 项：通道选择/文案字段/日志全字段/同键去重+日志不去重/不同键不去重/60s 窗口过期（fake timers）/缺字段容错）；`test/integration/pi-bridge.test.ts`（fake pi `EXTERR` 脚本：同键×2+异键×1 → toast 2 条、error 卡片 0、日志 3 条全量）；`test/helpers/fake-pi-cli.js`（新增 `EXTERR` 脚本化事件） |

稳定性：修复后 `verify:unit` 与 `verify:integration` 并行负载下连跑 10 轮全绿（去重断言不依赖真实等待：同键同刻注入、窗口过期用 fake timers）。

### 10.10 TASK-005 缺陷修复与实现记录（TODO-List 双项批次，需求基线 v0.3）

#### 缺陷表（追加 #D-04）

| 缺陷 | 根因 | 修复位置 | 回归验证 |
|---|---|---|---|
| #D-04（P1，FR-CHAT-04）工具调用卡片状态恒“进行中”（直播转路径必现） | agent 循环时序上 toolResult（toolcall_status）必然晚于含工具卡的助手消息 `message_final` 到达；`MessageView.finalize()` 执行 `this.blocks.clear()` 后 `createFinalBlock()` 重建 DOM 但不回填 `this.blocks`，而 `toolcallStatus()` 遍历 `this.blocks` 按 toolCallId 匹配——final 后恒为空 → 状态更新必然丢失（历史路径因 `refreshHistory` 按序处理 + 尾部收敛循环不触发，仅直播转必现） | `webview/render/messages.ts`（`finalize()`：终稿块视图按终稿块数组下标回填 `this.blocks`；`toolcallStatus` 按 toolCallId 匹配与键无关；流式期间行为不变；`ToolCardView.setStatus/setSummary` 经 `refresh()` 直接更新已挂载 DOM，finalize 后仍生效） | DOM 层无 jsdom 基建不硬造（基线 §5.4）：UI 手工 checklist + 自动兜底=桥侧既有测试（`test/unit/piBridge.test.ts` 工具卡状态用例：toolResult 晚于 message_end 时 `toolcall_status` 终态 success/error 断言）+ `test/unit/followState.test.ts`（同批次新增纯逻辑测试） |

#### FR-CHAT-09 实现注记（流式输出自动跟随）

- 架构：跟随决策抽为纯逻辑模块 `webview/render/followState.ts`（无 DOM 依赖，单测全覆盖）；`webview/main.ts` 仅做度量（`scrollHeight - clientHeight - scrollTop`，下限 0）与滚动执行接线。
- 滚动决策统一入口 `applyFollowScroll()`，触发点两类：① 消息追加（`appendMessageView`：user_message/stream_start/message_final 兜底）与 message_final 终稿重排后同步调用；② 增量渲染点——`MutationObserver`（childList/subtree/characterData）监听 `messagesEl`，合批渲染（正文 300ms / thinking rAF）真正改 DOM 后立刻回底，使两次渲染之间视口始终距底 0px（①“每次增量渲染后保持底部”）；delta 事件到达时 DOM 尚未变化，不在此时滚动。错误卡片/提示（`errorsEl`）不属消息流，不入此决策。
- 程序滚动自标记（`selfScrollPending`）：跟随逻辑发起的滚动同样触发 scroll 事件，须与用户滚动区分；已在底部时无位移不产生 scroll 事件亦不自标记，避免误吞下一次用户滚动。
- 会话载入/切换（`loadHistory`）尾部一次性定位到底部：属 FR-CHAT-09 ④明确排除的“一次性初始定位”，不走向量决策；idle 期间消息追加（如发送消息回显）不自动滚动（④），下一轮 stream_start 重置跟随后即回底部。
- 口径界定：“每轮” = 一次 agent 运行（run_state 进入 starting/streaming 起、回 idle/aborted/error 止）；每轮默认跟随的重置点取本轮运行内首个 `stream_start`（“自本轮流式输出开始计”）。agent 循环一轮含多条助手消息，轮内后续 `stream_start`（下一步消息）不重置跟随态——否则用户打断会在下一步开始时被覆盖，违反 ②“尊重用户意图”（打断后增量渲染不得为跟随而强制滚动）。

稳定性：修复/实现后 `npm run typecheck` / `build` / `verify:unit`（11 文件 116 用例）/ `verify:integration`（4 文件 31 用例）全绿；新增测试均为确定性纯逻辑断言（无定时器/无异步等待）。

### 10.11 TASK-006 实现记录（TODO 批次二 8 项 → 5 组 FR 变动，需求基线 v0.4）

来源：通道 A 人类直接指令（docs/tasks/TASK-006-todolist2-ui.md）；产品基线 v0.3→v0.4。8 项素材 → FR 映射：素材①④⑤⑥→FR-CHAT-10；素材②→FR-FILE-02 修订；素材③→FR-CMD-03（P2→P1 转正）；素材⑦→FR-MOD-01③/FR-MOD-03 修订；素材⑧→FR-MOD-04 新增。

| 变更 | 实现要点 | 主要位置 |
|---|---|---|
| FR-CHAT-10 聊天面板视觉规范 | ① 内容列：`#messages`/`#errors`/`#input-area` 各自内层 `.content-col`（`max-width: 960px` + `margin-left/right: auto`）共享同一居中列；消息区拆分滚动容器（`#messages`）与内容列（`#messages-col`），FR-CHAT-09 度量仍取滚动容器；② 输入框容器 `.input-shell` 圆角 8px；③ 发送按钮图标化：内联 SVG 上箭头、无文字、`aria-label="发送"`；④ 用户消息右对齐 + 气泡（`.message-user .message-body` 背景+圆角），助手消息左对齐无气泡包裹；⑤ 去 User/Assistant 前缀，改 `.message-time` HH:mm（`formatHHmm` 纯函数，流式期间以创建时刻占位、终稿以权威 timestamp 覆盖） | `src/panel/chatPanel.ts`（HTML）、`webview/styles/styles.css`、`webview/render/messages.ts`、`webview/render/format.ts`、`webview/main.ts` |
| FR-FILE-02 修订（唯一文件引用入口） | 移除输入区 `btn-file` 按钮及其 DOM/事件接线；`@` 触发选择器保持既有行为（前一字符行首/空白 + 1s 防抖） | `src/panel/chatPanel.ts`（HTML 删 `btn-file`）、`webview/main.ts`（删 `fileBtn` 引用与监听） |
| FR-CMD-03 `/` 命令补全菜单（P1 转正） | 桥侧：`RpcSlashCommand` 类型 + `getCommands` RPC 封装 + `listCommands`（失败返回空并记日志）；webview：纯逻辑 `CommandMenuState`（触发=文本以 `/` 开头、名称/描述子串不区分大小写过滤、↑/↓ 环绕导航、选中 `insertText`=`/`+命令名、无匹配/空全集隐藏），接线层负责 input 实时过滤、Enter 选中插入不发送、Esc 关闭、mousedown 选中（保持焦点）、首次 `/` 时拉取命令全集、会话切换（session_reset/history_loaded）缓存失效重取 | `src/bridge/protocol.ts`、`src/bridge/rpcClient.ts`、`src/bridge/piBridge.ts`、`src/panel/chatPanel.ts`、`src/panel/messages.ts`、`webview/render/commandMenu.ts`、`webview/main.ts` |
| FR-MOD-01③/03 底部内联模型选择器 | `#model-selector` 常显当前模型（`model_info` 驱动，与状态栏/头部同源）；点击弹 `#model-menu`（`request_models`→`models_list`），选中项发 `set_model` 走既有 `bridge.setModel` 通道 → `refreshState` → `model_info` 事件 → 三入口同步；当前项 ✓ 标记；Esc/点击外部关闭；重启后 ready 回放 `model_info` 覆盖底部展示 | `src/panel/chatPanel.ts`、`src/panel/messages.ts`、`webview/main.ts` |
| FR-MOD-04 上下文用量指示 | 桥侧捕获：`message_update.usage.totalTokens` 即时 + `message_end`（assistant）权威覆盖 + `refreshHistory` 会话重建取最后一条助手 usage（无则 null）+ `newSession` 重置；`refreshState` 读 `get_state` `model.contextWindow`；`usage_info` 事件变化即透出（同值去重，避免既有精确序列断言被噪音事件破坏）；webview `#usage-line` 用 `formatContextUsage`（k/M 缩写、百分比 `Math.round`）展示，无助手消息显示 —；compaction toast 未动 | `src/bridge/piBridge.ts`、`src/panel/chatPanel.ts`、`src/panel/messages.ts`、`webview/render/format.ts`、`webview/main.ts` |

新增测试（均确定性、无定时器依赖）：`test/unit/commandMenu.test.ts`（16 用例：过滤/触发/导航/选中/晚到全集/空全集）；`test/unit/format.test.ts`（9 用例：HH.mm 补零与 24 小时制、k/M 缩写、百分比四舍五入、null/非法窗口兑底）；`test/unit/piBridge.test.ts`（+9 用例：usage 捕获/覆盖/去重/历史重建/重置/contextWindow 透出、listCommands 透传与失败容错）；`test/unit/rpcClient.test.ts`（+2 用例：get_commands 请求/解析与空数据）。DOM 层（FR-CHAT-10 视觉/底部选择器/菜单交互）无 jsdom 基建不硬造，UI 手工 checklist + 纯逻辑/桥侧自动兑底（同 §10.10 #D-04 口径）。

实现口径说明：① ↑/↓ 导航采用首尾环绕（标准补全菜单惯例，FR 未规定边界行为）；② 选中插入为精确 `/`+命令名（不加尾随空格，后续 Enter 发送即透传）；③ `usage_info` 采用变化即发（同值去重）而非逐事件透出，属实现优化不影响验收口径（刷新时机仍满足④）。

---

### 10.12 TASK-008 设计与修复记录（TODO 批次三：用户消息单次展示 + 协议 golden fixture，需求基线 v0.5）

> 来源：docs/tasks/TASK-008-todolist3-echo-dedup.md（通道 A 批次三）；FR-CHAT-11（P0，①–⑤）+ 澄清 #5/#16。
> 状态：**已实现（待交付验收）**——D1–D10 已落地：实现见 §10.1 FR-CHAT-11 行（实现位置与回归索引），golden fixture 已录制入库（test/fixtures/golden/，双录一致实证）；三项受控假设经 golden 录制实证（见下）；自测全绿。

**根因确认（研发侧独立复核，与任务单 §2 一致）**：

1. 协议层：pi 对每条用户 prompt 必回发 user `message_start`/`message_end` 回声，先于助手消息（§11 #1 锚点；`handleMessageEnd` 现不区分角色）。
2. 缺陷链：`sendPrompt` 乐观回声双 id 域（宿主 `pushUserMessage` 生成 `u{n}`，webview 另建 `webview-user-N`）→ pi user `message_end` 回声经 `buildUiMessage(user)` 再生成新 id `u{n+1}` → `upsertUiMessage` 按 id 查不到 → push 第二条 → `emit("message_final", { messageId: u{n+1} })` 在 webview 无视图 → 兜底 append 第二气泡；`getUiMessages()` 面板重开回放携带双条（chatPanel ready → `history_loaded`）。
3. mock 失真：`test/helpers/fake-pi-cli.js` 所有 `run*` 剧本从 `agent_start` 开始，从未模拟 user 回声（规范 §4.3 实战教训的制度化修复本批落地）。

#### D1 关联策略：宿主单源 id 贯通（消除双 id 域）

- **决策**：消息 id 只在宿主生成一个域：`sendPrompt`（含 steer / followUp 分支）以既有 `u{++messageIdSeq}` 生成 id，`user_message` 事件负载增发该 id（`{ kind: "user_message"; id: string; text: string }`，§3.4 已同步）；webview 建视图直接用宿主 id（删除 `webview-user-N` 序列与 `userSeq`）。pi user `message_end` 回声到达时，桥侧匹配到乐观条目并**复用其 id** 组装 `message_final` → webview `messageViews.get(id)` 命中 → 既有 `view.finalize()` 就地更新（D6）。
- **理由**：双气泡的直接根因是两个不可对账的编号域；pi 回声不携带任何客户端关联键（json.md L38–39：回声仅含 content/timestamp），关联只能由我方在发送侧建立。宿主单源 id 使"乐观条目 ↔ 回声终稿 ↔ 历史回放"三点同键，`message_final` 既有就地 finalize 路径无需新增消息种类；webview 改动最小（一行 id 接线）。
- **锚点**：json.md L30–46（回声无关联键）；FR-CHAT-11 ①④；澄清 #16（回声到达前展示发送原文、到达后原条目更新）。

#### D2 匹配策略：pending 账本 + 文本精确匹配优先 + 确定性兜底（禁止时间阈值）

- **决策**：桥侧维护待回声账本 `pendingUserEcho: Array<{ id, channel: "prompt"|"steer"|"followUp", sentText, queuedText?, consumed }>`（全局发送序），全部状态迁移由协议事件触发：
  - **入账**：每次发送（prompt/steer/followUp）即入账；`steer`/`followUp` 获 `disposition:"queued"` 后，以随后 `queue_update` 快照 diff 将新增队列文本绑定为 `queuedText`（多条新增按序对应；同文本重复按出现次序一一对应）——skill/template 展开发生在入队前（rpc-commands.md L48/L72），故队列文本即回声将携带的展开后文本；`prompt` 获 `disposition:"started"` 时将该条目标记为 **run-head**（其回声是下一 run 的首条 user 回声，json.md L36–39 序列）。
  - **消账（user `message_end` 回声文本 T 到达）**：
    1. **精确匹配**：按「run-head 条目优先 → 全局发送序」找首个未消费且 `sentText===T || queuedText===T` 的条目 → 消费，`message_final` 以该条 id 就地更新；
    2. **确定性兜底**（无精确命中，即存在快照未覆盖的发送后变换）：若未消费条目唯一 → 绑定之；若全部未消费条目同通道 → 通道内 FIFO（队列投递序 = 入队序：rpc-commands.md L46–92 + set_steering_mode/set_follow_up_mode one-at-a-time 语义）；否则（多通道不可判定）**不重绑、不追加**：保留乐观条目原文，`logger.warn` 留痕，待权威重建（refreshHistory / get_messages）收敛；
    3. **账本空**：该回声属本端从未发送的 user 消息（如扩展 `custom_message`，extensions.md L754）→ 以宿主新 id 建条目并 `message_final`（D4 合法追加）。
  - **残留清理**（确定性事件点）：`agent_settled` 时取最近 `queue_update` 快照：未消费且 `queuedText` 仍在队列 → 保留（abort 后队列保留、后续 prompt 继续投递，rpc-commands.md L128）；未消费、已不在队列且从未收到回声 → 终结（保留单条乐观展示，出账不再参与匹配）。会话切换/刷新重建后，未消费且仍入队的条目按发送序回填到重建列表尾部。
- **不错换论证（④）**：同文本多次发送——精确匹配按序消费、每条回声恰消费一条，不跨发送合并（①）；steer/followUp 乱序投递（follow-up 先发后投、steer 后发先投）——未变换文本直接精确命中各自条目，变换文本经 `queuedText`（入队即绑定，与投递顺序无关）命中；文档明示的全部变换时机（发送/入队前展开）均被 `queuedText` 覆盖，超出者走 D2.2 保守分支——**宁保留原文待权威重建，不错换**。
- **锚点**：rpc-commands.md L7–92（展开时机/disposition/注入时序）、L107–128（clear_queue 与 abort 后队列语义）、json.md L121–122（queue_update）、extensions.md L752–770；FR-CHAT-11 ①②④。

#### D3 无回声 / 拒绝路径：响应事件点出账，零时间阈值

- **决策**：`disposition:"handled"`（扩展命令 / input handler 消费：无 run、无回声）与 `success:false`（受理前拒绝：无任何后续事件）均在**命令响应到达时即刻出账**，乐观条目保留为单条展示（拒绝路径已有错误卡片提示，handled 路径已有 toast/后续扩展自身事件）；不等待任何超时。`clear_queue` 本插件不发送；pi 内扩展若清空队列，经 `queue_update` 快照 + D2 残留清理兼容（条目仍单条、不污染后续匹配——已出账/已终结条目不再参与精确匹配）。
- **理由**：三条路径的"无回声"均由**响应本身**或**队列快照**确定性判定（rpc.md L60–71：response 即受理结论；rpc-commands.md L40–42：handled 无 run；L107–128：清空队列即从快照消失），无一处需要 wall-clock 推测，满足"禁止依赖时间阈值（非确定性）"。
- **锚点**：rpc.md「Run lifecycle」；rpc-commands.md L40–42 / L107–128；FR-CHAT-11 ①④（残留待确认项不得污染下一条消息的关联）。

#### D4 webview `message_final` 兜底追加：受控且幂等

- **决策**：append 分支保留但收敛为两条合法场景：① **账本空时的全新 user 回声**（扩展 `custom_message` 等本端从未发送的 user 消息）；② **视图缺失的迟到终稿**（webview 运行中重载后流内消息尚不在 `uiMessages`、或崩溃重启后迟到 `message_end`——消息本体合法但对应视图不存在）。控制规则：user 终稿的 `message.id` 一律由宿主提供（匹配条目 id 或宿主新 id，D1/D2）；append 以 `message.id` 注册进 `messageViews`，**同 id 重复 `message_final` → 第二次就地 finalize，不再追加**（幂等）；查视图顺序保持 `streamingViews` → `messageViews`。双气泡的旧根因（id 域不一致导致必 append）随 D1 消除，append 不再可能命中"已有乐观条目对应的消息"。
- **理由**：append 本身是重载/恢复链路的必要兑底，缺陷在于它与乐观条目各持异 id；幂等键 = 消息 id，与宿主单源 id（D1）配套后重复不可能。
- **锚点**：extensions.md L752–770（custom 消息也走 message_start/end）；FR-CHAT-11 ①③④；NFR-01（面板切换/重开不丢运行状态）。

#### D5 `uiMessages`（历史回放源）单条：回声合并而非新增

- **决策**：user 回声终稿走 **upsert 合并**（按匹配条目 id 原位覆盖 blocks/timestamp，绝不 push 第二条）；`refreshHistory` / 会话切换（`get_messages`）仍以 pi 为唯一权威全量重建（现行逻辑不变），重建后按 D2 回填仍入队的待回声条目；面板重开回放（chatPanel ready → `history_loaded` ← `getUiMessages()`）因源数组已单条而单条。
- **理由**：`uiMessages` 是回放的唯一源，双条一旦入数组就会在每次重开复制；合并发生在入数组之前（D2 匹配 + D1 同 id），回放路径无需任何去重逻辑；权威重建边界（切换/刷新）自然纠正任何残余不一致。
- **锚点**：FR-CHAT-11 ①③；澄清 #5（历史重放与会话 JSONL 一致）；#16（重放文本以 JSONL 为准，与实时就地更新同源）。

#### D6 就地更新渲染：既有 `MessageView.finalize` 满足 #16，无需新渲染路径

- **决策**：user 条目复用既有 `finalize()`：清空 bodyEl → 按权威 blocks 重建（单个 text 块）+ `timeEl` 以权威 timestamp 覆盖；role=user 无流式光标；生命周期内一视图一 DOM 根节点，更新前后均为一条、不会闪现两版。重复 `finalize`（幂等）为再次原位替换，无累积 DOM。渲染层无必需改动（用户文本渲染路径不变）。
- **理由**：`finalize` 本就是"整体替换该消息 DOM"的权威终稿路径（§3.4 渲染策略），#16 要求的"单条就地更新"恰是其语义；缺陷从不在渲染层，在 id 关联层（D1）。
- **锚点**：FR-CHAT-11 ④；澄清 #16；#D-04 先例（finalize 后块视图回填已验证该路径可原位更新）。

#### D7 回归边界：助手流式与工具卡零改动

- **决策**：改动面严格限定于 user 角色 `message_start`/`message_end` 的处理与关联账本；assistant `stream_start`/`*_delta`/`message_final`、toolResult `message_end`、`toolcall_status`（含 #D-04 终稿后状态更新）路径零改动。既有 verify:unit / verify:integration 全绿（断言未动）+ D9 边界组新断言共同证明。
- **锚点**：FR-CHAT-11 ⑤；§10.10 #D-04。

#### D8 golden fixture 方案（规范 §4.3 强制）

- **位置与格式**：`test/fixtures/golden/*.jsonl`（静态提交入库）+ 同目录 `README.md`；文件头为 `#` 引导的注释行（回放器剥离，rpcClient 永不接触文件本身）：录制命令、日期、pi 版本（1.5.2）、provider 配置摘要、脱敏声明（哨兵 prompt 文本、无真实凭证、timestamp/session id 已在录制时归一化：`"timestamp":<num>` → `0`、session id → 定值，保证再录制可 diff）。
- **确定性录制**：`node test/tooling/record-golden.mjs`（实现阶段新增，含内嵌 OpenAI 兼容 mock server）：临时 `PI_CODING_AGENT_DIR` 写 `models.json` 定义 provider `baseUrl=http://127.0.0.1:<port>/v1`、`api="openai-completions"`、dummy `apiKey`（§11 #10 锚点）→ 启动真实 pi（内置 1.5.2）`--mode rpc` → 驱动固定剧本：prompt → 等 settled；运行中 steer + follow_up 混合注入（覆盖乱序投递）→ stdout 全量归一化落盘。全程仅 loopback、无真实 key、无外网；录制不进 CI（仅回放进 CI），端口冲突不影响确定性。
- **剧本文件**：`golden-prompt-basic.jsonl`（prompt → user 回声 → assistant 流式 → agent_settled）；`golden-steer-followup.jsonl`（运行中 steer + follow_up 混合注入，含 queue_update 与乱序投递序列）。
- **fake-pi-cli.js 对齐**：① 所有 `run*` 剧本在 `agent_start` 后、assistant `message_start` 前补发 user `message_start`/`message_end` 回声，文件头注释标注锚点（json.md L30–46；规范 §4.3）；② steer/followUp 剧本按 rpc-commands.md L46–92 语义模拟队列（queue_update + 轮间/停后注入回声）；③ 新增回放模式 `FAKE_PI_REPLAY=<fixture>`：维护录制游标，stdin 每收到命令即回放对应 response 行及其后至下一命令 response 前的全部事件行，并对输入命令序列与录制一致性断言（确定性最强：无脚本分支、无时钟）。
- **再生成命令**：npm script `record:golden`（实现阶段加入 package.json，仅人工/维护触发）。
- **锚点**：规范 §4.3（mock 对齐 + golden 兜底）；§11 #1/#4/#5/#8/#10。

#### D9 回归测试清单（设计级；逐条对应 FR-CHAT-11 子条）

**单元（`test/unit/piBridge.test.ts` 增补，fake RpcClient 注入事件）**

| # | 用例 | 子条 |
|---|---|---|
| U1 | prompt → user 回声：`uiMessages` 恰一条 user；`message_final` 的 id = `user_message` 下发的乐观条目 id | ① |
| U2 | #16 文本更新：回声文本 ≠ 发送原文 → 同 id 同条目文本更新为权威文本，更新前后条数均 1 | ④ |
| U3 | 运行中 steer：注入回声后恰一条；queue_update 绑定展开文本（slash 展开）命中 | ② |
| U4 | follow_up：agent 停后注入回声恰一条 | ② |
| U5 | 乱序：followUp 先发、steer 后发，steer 回声先到 → 各自命中不错换 | ②④ |
| U6 | 同文本两次独立发送 → 两条各一次回声逐条消费，不跨发送合并 | ① |
| U7 | `disposition:"handled"`：单条、即时出账；后续无关回声不错绑 | ①④ |
| U8 | `success:false`：单条、即时出账；下一条消息回声正确关联 | ①④ |
| U9 | abort 后队列保留（settled + queue_update 仍含该文本）→ 条目单条保留；后续 prompt 继续投递时迟到回声正确命中 | ②④ |
| U10 | `refreshHistory` 权威重建无重复；仍入队条目按发送序回填尾部 | ③④ |
| U11 | `getUiMessages()` 回放快照：每次发送恰一条 user 条目（面板重开数据源） | ③ |
| U12 | 回归边界：assistant stream_start/delta/message_final 与 toolcall_status 事件序列与现状一致 | ⑤ |

**集成（fake-pi 子进程 / golden 回放）**

| # | 用例 | 子条 |
|---|---|---|
| I1 | fake-pi（补发回声后）全链路：prompt → user 回声 → assistant → settled 事件序列断言；bridge 事件流中 `user_message.id == message_final(user).id` 且无重复 append 语义 | ① |
| I2 | steer + follow_up 混合运行（fake-pi 队列剧本）：两条插话各恰一条、乱序不错换 | ②④ |
| I3 | golden-prompt-basic 回放：同 I1 断言（以真实 pi 录制序列为期望源） | ① |
| I4 | golden-steer-followup 回放：注入时序与回声关联断言 | ②④ |
| I5 | 面板重开链路：settled 后重放 `history_loaded(getUiMessages())` → user 条目数 = 发送数 | ③ |

**webview 侧**：无 DOM 测试基建（§10.10/§10.11 先例：不硬造 jsdom）——自动兑底 = U1/I1 断言 `user_message` 携带宿主 id 且与 `message_final` 同键（webview 改动仅为该 id 接线，一行）；视觉层（右对齐气泡单条、无两版闪现）入 UI 手工 checklist（证据类型：截图/录屏）。

#### D10 交付期预告

FR 追溯表（§10.1）将在实现交付时新增 FR-CHAT-11 行（状态、实现位置、回归测试索引）；本阶段不写"已实现"。§10 头部已加注记。

#### 遗留问题与受控假设（上报总调度，无需求歧义）

未发现需裁决的需求歧义（FR-CHAT-11 ①–⑤与澄清 #5/#16 口径均可判定）。以下为实现期受控假设（均已规避依赖、不阻塞设计）：

1. **queue_update 与 user 回声的相对顺序未在文档明示**（投递移除事件与回声谁先到）。设计不依赖其顺序：主判据 `queuedText` 在入队时绑定，回声与移除的先后不影响命中；兜底分支仅用快照集合语义。
2. **queue_update 队列文本 = 回声文本**依据：skill/template "expanded before sending/queueing"（rpc-commands.md L24/L48/L72）。若实现期发现 input handler 在投递时点再变换（文档未明示），走 D2.2 保守分支（保留原文待权威重建），不会错换；golden fixture 会实证此假设。
3. **扩展 `custom_message` 是否产生实时 user 回声**（extensions.md L754 述其为 user 角色 model 消息）：设计两向兼容——有回声则走 D4 合法追加（单条），无回声则仅历史重建可见；均不产生重复。

---

### 10.13 TASK-009 阶段①设计记录（assistant-ui 迁移试点，需求基线 v0.6 §4.6）

> 来源：docs/tasks/TASK-009-assistantui-migration.md（人类确认启动 2026-11-21）；需求基线 v0.6 §4.6 FR-AUI-01~06 + 澄清 #18 + §5 阶段①不做项。任务书 §5 生态实测为外部事实底座。
> 状态：**已实现（待交付验收）**——D1–D9 已全部落地（设计基线于审批点 1b 冻结后实施，本节设计内容未改动）；实现交付与四维对比报告见本节末尾「阶段①双切片对比报告（交付填写）」；自测全绿（typecheck/build/verify:unit 21 文件 218 用例/verify:integration 8 文件 45 用例，既有 166/36 断言零放宽 + 并行负载 10 连跑全绿）。
> 外部证据核读（2026-11-21，逐源）：`@assistant-ui/vscode@0.0.1` npm tarball 全量源码（包随附 src/；dist shasum 76d9adbd…）、官方指南 assistant-ui.com/docs/guides/vscode 全文、官方测试床 github.com/assistant-ui/assistant-ui examples/with-vscode（fixtures/route.ts、fixtures/request.ts、webviews.ts、webview/zod-jitless.ts、test/）、`@assistant-ui/react@0.15.37` + `@assistant-ui/core@0.3.37` tarball 类型面。**关键新证据（超出任务书 §5）**：① fetch 隧道走 postMessage 不经网络——官方指南明文「The bridge needs no connect-src entry, because it does not use the network」；② `createVSCodeFetch(port)` 可注入自定义 port（DOM-free），测试进程内可驱动真实隧道两端；③ zod jitless 官方片段 `import { config } from "zod"; config({ jitless: true })`，须在任何 zod schema 构建前导入；④ UIMessage 流帧型以官方测试床 fixtures/route.ts（`ai` 包 `createUIMessageStream`）为权威样例；⑤ `ThreadMessageLike`/`useExternalStoreRuntime`/`ThreadPrimitive`/`ComposerPrimitive` 均由 `@assistant-ui/react`（类型面经 `@assistant-ui/core`）导出。

#### D1 实验面板注册与零变更保障（FR-AUI-01）

**决策**：
- **命名（一概念一拼写；实验统一缀 `Lab`）**：viewType `sdysyhj.chatLabView`；贡献命令 `sdysyhj.openChatLab`（title「Open Chat (Lab)」，category Sdysyhj，执行 = `sdysyhj.chatLabView.focus`）；视图名「**聊天（实验）**」（= 面板标题，「实验」标识即落于此，HTML `<title>` 同名）。宿主文件 `src/lab/labViewProvider.ts`（vscode 侧薄 provider）+ `src/lab/labChatPanel.ts`（**不 import vscode** 的面板核心，构造入参 = PiBridge + WebviewLike 形状（postMessage/onDidReceiveMessage）——与 `serveWebviewHost` 的 `WebviewLike` 同形，供 in-node 测试直接实例化）。
- **注册与共存隔离**：extension.ts 增量注册 `registerWebviewViewProvider(sdysyhj.chatLabView, provider, { webviewOptions: { retainContextWhenHidden: true } })`（FR-AUI-05④ 显式声明，与默认面板同值）；`activationEvents` 增 `onView:sdysyhj.chatLabView`（惰性激活，不打开即零成本）；视图条目挂既有 `sdysyhj` viewsContainer **第二位**（默认面板条目保持首位，FR-AUI-01③ 非默认视图）。构建隔离：实验 webview 独立入口独立产物 `media/lab.js(+.css)`（esbuild 第三项），默认面板 `media/main.js` 构建配置零改动。运行隔离：LabChatPanel 独立订阅 `bridge.onAny`（emitter 多订阅互不影响）；`serveWebviewHost` 只挂实验面板 webview。数据：与默认面板**共享同一 PiBridge/会话**（同源数据零副本，NFR-03；两面板同开时事件各投各的 webview，默认面板订阅路径不变）。
- **零变更 diff 断言（FR-AUI-01②，自动层 = 结构化冻结断言 unit 测试，无人值守）**：① package.json 解析断言：默认视图条目 `{type:"webview",id:"sdysyhj.chatView",name:"Chat"}` 与 viewsContainer `sdysyhj` 原样、既有全部命令逐项 id/title/category 不变（新增命令允许追加，既有项不得变）、`main` 不变、`activationEvents` 仍含 `onView:sdysyhj.chatView`；② esbuild.mjs 文本断言：既有两项入口（`src/extension.ts→dist/extension.js` node/cjs、`webview/main.ts→media/main.js` browser/iife）逐项原样；③ `src/panel/chatPanel.ts` 文本断言：`viewType = "sdysyhj.chatView"`、`retainContextWhenHidden: true`、CSP meta 模板（`default-src 'none'; style-src … 'unsafe-inline'; script-src 'nonce-…'; img-src …`）逐字匹配冻结值；④ 默认面板依赖图：单独构建 `webview/main.ts`（esbuild metafile）断言 inputs 不含 react/react-dom/@assistant-ui/**（FR-AUI-05③「独立构建入口断言」）。git 层 = 交付时 `git diff --stat`（D7③）佐证默认面板冻结文件零改动。

**理由**：独立 viewType + 追加视图条目是 VS Code 形态下唯一的不替换共存（不抢占默认视图 = 视图序不动）；冻结断言把「零变更」从承诺变为可判定证据（新增即失败），测试 Agent 可直接锚定本断言面写 TC。
**锚点**：FR-AUI-01①②③、FR-AUI-05③④；§11 #11（renderWebviewHtml）；package.json v0.1.6 现状。

#### D2 路线 A 架构（fetch-bridge，FR-AUI-02①）

**决策**：宿主新增路由适配层 `src/lab/chatRoute.ts`：`createLabChatRoute(bridge: PiBridge): RouteHandler`（`(req: Request) => Promise<Response>`，即 `@assistant-ui/vscode` 宿主 route 形态），注册于实验面板 `serveWebviewHost(webview, { routes: { "/api/chat": { POST: route } } })`。
- **请求解析**：POST body = AI SDK ChatRequest（`{ messages, … }`）——取最后一条 role==="user" 消息的 text part 拼接为 prompt 文本（官方测试床 `fixtures/request.ts` `readFixtureRequest` 同口径）；解析失败 → 400。
- **流式映射（PiBridge 事件 → Response body 流）**：用 `ai` 包 `createUIMessageStream`/`createUIMessageStreamResponse` 构造 Response（官方测试床同款）；适配器订阅 `bridge.onAny`，帧映射：`stream_start`→`start-step`+按 contentIndex 开 part；`text_delta`(index)→`text-start`(首见)/`text-delta`(id=index)；`thinking_delta`→`reasoning-start`/`reasoning-delta`（同型）；`message_final`(assistant)→关闭打开 part（`text-end`/`reasoning-end`）+`finish-step`（阶段①纯文本：终稿==增量拼接，harness 断言相等；`tool-input-available` 等工具帧型留阶段②）；run 结束（`run_state` 回 idle/aborted）→`finish`；`error`→`error` 帧。**user 事件不发帧**：user 消息由 webview 侧 transport 请求自有渲染，pi user 回声仅用于多请求路由归属（下条）——路线 A 的 FR-CHAT-11 承载方式（结构性无双气泡），记入 D7④ 契合度框架。
- **abort 传播**：`req.signal.addEventListener("abort")` → `bridge.abort()`（README：webview 中止请求即中止 handler 的 req.signal；页面重载 `fetch:reset` 中止全部在途——**run 生命周期绑定请求**，与默认面板「run 绑定 bridge」的差异记入 D7④）。
- **多请求路由（P1 steer/followUp 回放所需）**：适配器维护「prompt 文本 → 请求流」账本：POST 到达即登记；pi user 回声（`message_final(user)`）按文本精确匹配（同文本按到达序消费）登记项，其后至下一回声前的 assistant 轮事件路由到该请求的 writer；失配归主流并 logger.warn（§10.12 D2 匹配原则的最小子集，只做精确文本+序，不做通道兜底）。
- **golden 回放注入点（FR-AUI-02④ 防自证，精确到层）**：注入位 = **PiBridge 依赖的 RpcClient 子进程**——集成测试以 `FAKE_PI_REPLAY=<fixture>` 环境变量启动 `test/helpers/fake-pi-cli.js`（与 TASK-008 golden-replay.test.ts 同一注入位，经 `PiBridgeOptions.createClient` 的 env）。事件流**全链路真实**：fake-pi stdout JSONL → RpcClient 帧解析 → PiBridge 事件翻译 → 路由适配层 → UIMessageStream Response body → `serveWebviewRoutes` 泵（16ms/64KB 合块，`fetch:chunk` postMessage）→ **真实 `createVSCodeFetch(port)`**（官方 webview 侧 fetch 实现 + 测试注入 port）→ 测试进程内取 Response 解码 SSE 断言。断言不触 webview DOM/React 状态（判定面见 D8）；隧道两端消息协议（channel `aui-vscode`、fetch:request/head/chunk/end/error/abort）均为包源码真实实现。
- **webview 侧（sliceA.tsx）**：`useChatRuntime({ transport: new AssistantChatTransport({ api: "/api/chat", fetch: vscodeFetch }) })`（`@assistant-ui/ai-sdk`）+ `AssistantRuntimeProvider` + 共享最小外壳（D4）。

**理由**：route handler 是 `@assistant-ui/vscode` 的官方宿主形态；`createUIMessageStream` 是 AssistantChatTransport 消费协议的官方生产侧（官方测试床实证）；注入点低于适配层 ⇒ 回放数据必须穿越全部自有翻译与官方隧道，杜绝直写渲染结果的自证。
**锚点**：§11 #11（Extension host/Webview 节）、#12（RouteHandler/泵/协议）、#13（How it works）、#16（fixtures/route.ts 帧型、request 解析）、#17（ai 写入器）；FR-AUI-02①④、FR-AUI-03①③。

#### D3 路线 B 架构（ExternalStoreRuntime，FR-AUI-02②）

**决策**：
- **映射纯函数** `webview/lab/threadMessageLike.ts`：`toThreadMessageLike(ui: UiMessage): ThreadMessageLike`——role user/assistant 直映；blocks 最小映射（阶段①纯文本级口径）：`text`→`{type:"text",text}`、`thinking`→`{type:"reasoning",text}`、`toolcall`→`{type:"tool-call",toolCallId:id,toolName:tool,argsText:args}`（不注入 result/artifact，工具卡渲染归阶段②；三类齐全仅为零数据丢失，fixture 断言只覆盖 text）；`id`=ui.id、`createdAt:new Date(ui.timestamp)`。不用 `useExternalMessageConverter`/joinStrategy（直接 `convertMessage` 内联，相邻 assistant 消息不合并——pi 多轮 assistant 各自成条，与澄清 #12 计数口径一致）。
- **状态源** = 宿主 `getUiMessages()` 快照 + 增量事件的 webview 侧镜像：`webview/lab/store.ts` **纯 reducer**（输入 HostToWebview 事件，输出 `{messages: UiMessage[], isRunning: boolean}`）：`ready`（宿主回放 `history_loaded(getUiMessages())`）→ 初始化；`user_message`→push（宿主单源 id）；`stream_start`/`text_delta`/`message_final`→按 id upsert/append（§10.12 D4 同幂等键语义：同 id 重复 final 就地覆盖不追加）；`run_state`→isRunning。sliceB.tsx 以 `useSyncExternalStore` 挂 store + `useExternalStoreRuntime({ messages, convertMessage: toThreadMessageLike, isRunning, onNew, onCancel })`：`onNew`→`post({kind:"prompt",text,mode:"auto"})`；`onCancel`→`post({kind:"abort"})`。流式 = 终稿前 `text_delta` 对 assistant 消息原地追加（ExternalStoreRuntime 官方流式口径同型）。
- **与既有 postMessage 协议复用面**：`src/panel/messages.ts` 判别联合**零改动**复用；宿主 `src/lab/labChatPanel.ts`（vscode-free）处理 `ready`（回放 `model_info`/`run_state`/`history_loaded` 最小子集）/`prompt`/`abort`；vscode 薄壳 `src/lab/labViewProvider.ts` 只做 options/HTML/挂 serveWebviewHost。**PiBridge 零改动**（§10.12 D1/D2 回声账本原样生效——FR-CHAT-11 全语义由宿主承载，是路线 B 核心卖点，记入 D7④）。

**理由**：ExternalStoreRuntime 为官方「自带状态」路线；复用既有协议+宿主账本使路线 B 的用户消息单条语义零新增逻辑；面板核心去 vscode 化使集成测试可在 node 内直接实例化（WebviewLike 同形）。
**锚点**：§11 #14（ThreadMessageLike/Handler matrix/Streaming responses）；FR-AUI-02②④、FR-AUI-03①；§3.4、§10.12 D1/D2/D4。

#### D4 双切片切换机制（FR-AUI-02⑥）

**决策**：**面板内开关**——实验面板单 HTML/单 bundle（`webview/lab/main.tsx`）内顶部 A/B 切换控件（「路线 A（fetch-bridge）」/「路线 B（ExternalStoreRuntime）」），切换 = React 卸载/挂载对应 slice 子树（共享最小外壳 `shell.tsx`：ThreadPrimitive 消息列表 + ComposerPrimitive 输入），**不重载 HTML、不经宿主**；默认展示路线 A。
**理由**：① webview 页面重载触发 `fetch:reset` 中止上一页全部在途请求（README「Webview」节）——以重载实现切换会破坏在途回放与度量；② 命令/boot 参数方案须宿主状态与 contributes 增面（与 D1 最小增量冲突）且同样依赖重载；③ 面板内开关天然满足「两切片同面板独立运行互不干扰」，且切换行为入 D8 手工 checklist；④ 单 bundle 双切片不影响预算口径（FR-AUI-05③ = 实验面板产物合计），逐切片体积经 D6/D7 度量专用入口拆分核算。
**锚点**：§11 #11（Webview 节 fetch:reset）；FR-AUI-02⑥、FR-AUI-05③。

#### D5 主题与 CSP（FR-AUI-04 / FR-AUI-05②）

**决策**：
- **主题**：CSS 入口 `webview/lab/lab.css` 导入 `@assistant-ui/vscode/theme.css`（esbuild 经 package exports `./theme.css` 解析，随 `media/lab.css` 产出）+ 手写外壳样式直接消费 shadcn token：正文/助手文本 `--foreground` on `--background`、用户气泡 `--primary`/`--primary-foreground`、输入框背景 `--input`/边框 `--border`——采样点与 FR-AUI-04① 对齐。**不引入 Tailwind**（阶段① 用 ThreadPrimitive 无头原语 + 手写 CSS；模板组件/Tailwind 归后续阶段评估）。`renderWebviewHtml` 传 `surface:"sidebar"`。
- **CSP 基线与登记**：实验面板 HTML 由 `renderWebviewHtml`（strict 默认）生成，指令集 = 官方模板：`default-src 'none'; script-src 'nonce-…'; style-src <cspSource> 'nonce-…'; img-src <cspSource> blob: data:; media-src <cspSource> blob: data:; font-src <cspSource> data:; connect-src <cspSource>; frame-src 'none'`。**不新增任何指令/来源**：fetch 隧道走 postMessage 不经网络（官方指南明文无需 connect-src）；无远程图源需求（imgSrc/mediaSrc 不加）；无 WASM。与默认面板 CSP 的差异**逐一登记**（均为收紧/等强方向）：style-src `'unsafe-inline'`→nonce（官方 strict）；显式新增 media-src/font-src/connect-src(=cspSource)/frame-src `'none'`；img-src 收紧（去 `https:`）。唯一预登记回退：真机冒烟若库注入无 nonce `<style>` 被拦 → `csp:"relaxed"`（style-src 换 `'unsafe-inline'`，官方内建模式；script-src 仍仅 nonce，README 明文 `'unsafe-eval'` is never added），须经 §10.13 对比报告登记后生效。
- **CSP 断言（自动）**：unit 测试以 stub webview（`{cspSource, asWebviewUri}`）**真实调用 `renderWebviewHtml`**，解析 `<meta http-equiv="Content-Security-Policy">` 断言指令集 = 上述模板（script-src 仅 nonce、无 `'unsafe-eval'`/`'unsafe-inline'`、connect-src ⊆ cspSource、frame-src `'none'`）。
- **XSS 探针落点（FR-AUI-02⑤）**：自动层 = ① **LAB-XSS 回放剧本**（fake-pi-cli.js 新增：user 回声与 assistant 回复均含 `<script>alert(1)</script>` 与 `<img src=x onerror=…>` 探针文本，事件形状对照 json.md，文件头标注锚点）经 D2/D3 真实通道回放，断言两切片通道解码文本与探针原文逐字节一致（文本保真、未被解释为标记）；② 静态扫描断言：`webview/lab/**` 源码零 `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`（扫描面限实验面板新文件、排除依赖产物与既有源码——规范 §5.2 扫描纪律）。DOM 层（无新增 script 元素、预埋哨兵 `window.__AUI_XSS_SENTINEL` 无副作用）= 真机手工 checklist（依据：React JSX 字符串 children 进文本节点不进 HTML 解析，构造性转义）。

**理由/锚点**：§11 #11（CSP 节/relaxed/unsafe-eval never）、#13（「bridge needs no connect-src」）、#15（React 注入防护）；FR-AUI-04①②、FR-AUI-05②、FR-AUI-02⑤；NFR-03。

#### D6 构建与依赖（FR-AUI-05①③）

**决策**：
- **esbuild 扩展（增量，不改既有两项）**：新增实验 webview 构建 `webview/lab/main.tsx → media/lab.js(+.css)`：`platform:"browser", format:"iife", target:"es2020", jsx:"automatic", minify:true, define:{"process.env.NODE_ENV":JSON.stringify("production")}, sourcemap:true`（React 读 `process.env.NODE_ENV` 而 webview 无该全局，必须 define——官方指南「Bundle both sides」；minify 为预算必要手段，默认面板构建零改动）。宿主不新增入口：lab 宿主代码经既有 `src/extension.ts → dist/extension.js` 打入（tree-shaking 后仅含 `@assistant-ui/vscode/host` 纯 TS 切片 + `ai` 流写入器子集，**无 React**——React 只进 webview bundle）。
- **预算核算口径（FR-AUI-05③）**：实验面板 webview JS = `media/lab.js` + 全部代码分割 chunk（本设计单入口无 chunk，后续若启分割则计入）+ 打包入 bundle 的依赖运行时，**不含 .css 与 .map**，`fs.stat` 字节合计 ≤ 3,145,728；宿主增量 = 实现前后 `dist/extension.js` 字节差（基线 = 干净检出基线提交的构建产物）≤ 1,048,576；默认面板依赖图 = 单独构建 `webview/main.ts`（metafile inputs）不含 react/react-dom/@assistant-ui/**（D1③④ 断言）。
- **预算预估（设计期估算，门禁以 D7 实测为准）**：lab webview（minified）≈ react+react-dom 0.45–0.55 MiB + `@assistant-ui/react` 链（core/store/zustand/radix-ui/assistant-stream/zod4）0.8–1.2 MiB + `@assistant-ui/ai-sdk`/`@ai-sdk/react`/`ai` 客户端子集 + zod 0.3–0.6 MiB + 外壳 0.02 MiB ≈ **1.6–2.3 MiB**（≤3 MiB，余量 0.7–1.4 MiB；**Shiki 全量不进产物**——阶段①无 Markdown 渲染、react-streamdown 未引入，≈15 MiB 自然违规源不存在）。宿主增量（现口径未 minify）= `ai` 子集+zod ≈ **0.4–1.0 MiB**（≤1 MiB，**中风险**）——预登记回退：实测超限则宿主 bundle 开 minify（不触 FR-AUI-01② 冻结面：viewType/注册配置/CSP/入口路径均不变）；再超限如实上报，不静默放宽口径。
- **精确版本锁定清单（package.json 新增，全部零 `^`/`~`/`>=` 前缀，JSON 解析断言；版本号均已于 2026-11-21 registry 核实存在）**：dependencies `@assistant-ui/vscode 0.0.1`、`@assistant-ui/react 0.15.37`、`@assistant-ui/ai-sdk 0.0.19`、`ai 7.0.153`、`react 19.3.1`、`react-dom 19.3.1`、`zod 4.6.7`；devDependencies `@types/react 19.3.0`、`@types/react-dom 19.3.0`。（zod 为直依：`webview/lab/zod-jitless.ts` 显式 `import { config } from "zod"`；react 19 线 = 上游 vscode 包 devDeps react ^19.3.1 测试矩阵主线，peer `^18||^19` 均合法；ai 7.0.153 同时满足 vscode 包 devDeps `^7.0.153` 与 ai-sdk peer `^7.0.101`；`@assistant-ui/core 0.3.37` 为传递依赖由 lockfile 锁定，不加直依——无直接 import。）
- **zod jitless 验证（FR-AUI-05②）三件套**：① 源顺序断言（`webview/lab/main.tsx` 首个 import = `./zod-jitless`，内容同官方片段 `config({jitless:true})`，esbuild 产物内顺序同断言）；② CSP 指令集断言（D5，无 unsafe-eval）；③ 运行时证据分层登记：无头回放（node 无 CSP，证「jitless 模式下 zod 校验路径不抛错」）+ 真机手工 checklist（真实 CSP 下完成一次回放、Webview devtools 控制台零 CSP violation——FR-AUI-05②「以回放通过为运行时证据」的真机层）。
- **`@assistant-ui/vscode` 0.0.1 升级/退出策略评估要点（留痕于对比报告）**：0.0.x 无 semver 兼容承诺（0.0.x→0.0.y 均可能 breaking）——升级评估清单：① host/webview 协议常量与消息形状（channel、`fetch:*`/`rpc:*` 帧）；② CSP 模板与 renderWebviewHtml 选项面；③ 导出面（serveWebviewHost/createVSCodeFetch/theme.css）；④ peer/依赖矩阵（react 线、core 线、zod 线）；逐项对照 CHANGELOG/源码 diff 后小步升级 + 全量回放回归。**退出** = 双切片全部为增量代码（D1 隔离），删除注册与依赖即回默认面板基线；实验面板不落任何会话/状态副本（NFR-03），无数据残留。

**锚点**：§11 #13（双构建/NODE_ENV define/Shiki 15MB/Hidden views）、#11（exports 面）；FR-AUI-05①②③、FR-AUI-01②。

#### D7 度量与对比报告规格（FR-AUI-06）

**决策**（四维均无人值守可复现；脚本 `test/tooling/lab-metrics.mjs`（实现期新增）+ 既有命令；**报告承载于本 §10.13 交付小节「阶段①双切片对比报告」**——研发可写文件清单内唯一合适的正式载体，不另开新文件、不开 docs/ 新目录）：
- **① bundle 体积**：脚本产出——实验面板合计字节（口径同 D6）；**逐切片** = 两个度量专用入口（`slice-a.measure`/`slice-b.measure`：同一外壳仅挂对应 slice，临时构建到 /tmp，不入产物）同参构建字节；宿主增量 = 基线提交（worktree 干净检出）构建 `dist/extension.js` 与当前构建的字节差；默认面板依赖图 = metafile inputs 清单。输出 JSON+表格贴报告。
- **② 首帧/首消息时延**（golden-prompt-basic 回放，**≥5 次取中位**，无头 harness 测通道里程碑）：T1 首帧 = 驱动发起（prompt 请求/事件发出）→ 切片侧**首个消息事件观测**（A：Response 首个 SSE 帧；B：store 首个 run 事件回调）；T2 首消息完成 = pi assistant `message_end` 到达桥 → 切片侧**终稿可读**（A：finish 帧解码且文本齐；B：store.messages 含终稿文本）。DOM 绘制时延不在此口径（无头无 DOM，见 D8），真机响应性入手工 checklist 定性记录。
- **③ 代码侵入面**：`git diff --stat <基线>..HEAD`（基线 = 阶段①实现前的发版标签/提交），按「默认面板冻结文件（须为空）/共享文件增量（package.json、esbuild.mjs、src/extension.ts、test/helpers/fake-pi-cli.js）/新增文件」三组归类贴表——与 D1 零变更断言互证。
- **④ PiBridge 事件契合度（定性框架，逐路线填写，结论中立）**：流式 delta（delta→帧/增量的保真与粒度）；**user 回声承载**（A：客户端自有 user 消息渲染、回声仅作流路由不重发——结构性无双气泡；B：宿主账本 §10.12 D1/D2 就地合并，FR-CHAT-11 全语义直接复用）；steer/followUp（A：run 绑定请求、注入=新请求经账本路由到所属流；B：复用 queue 语义与队列快照；以 golden-steer-followup P1 回放为实证输入）；abort（A：请求中止/页面重载→bridge.abort；B：onCancel→协议 abort；「中止后回 idle」两路线同口径）。每项观察结论+证据指针，不预设路线立场。
- **报告小节结构（交付时填写）**：四维各一节 + 数据表 + 复现命令与输出 + `@assistant-ui/vscode` 升级评估要点 + 中性结论（路线选择 = 总调度阶段①出口裁决，按任务书 §2 向人类通报）。

**锚点**：FR-AUI-06①②③、FR-AUI-05①③；规范 §0.3（证据即事实）。

#### D8 测试策略（阶段①一层；判定面与 DOM 纪律选型）

**决策**：**断言落「通道 + 数据」层，不建 DOM 测试基建**（沿 §10.10/§10.11 先例：webview 无 DOM 基建不硬造、不引 jsdom）。「渲染消息条数/文本一致」的可判定面 = **驱动渲染的消息数据**：路线 A = fetch 隧道解码后的 UIMessage 流帧（消息数、文本拼接、帧序）；路线 B = webview store 的 `messages` 状态 + `toThreadMessageLike` 输出。像素/组件 DOM 渲染 = 真机手工 checklist（证据 = 截图/控制台输出）。分层：
- **unit（verify:unit）**：映射纯函数（toThreadMessageLike 三类 block；chatRoute 事件→帧翻译器纯函数化（事件序列→帧序列）；store reducer 增量/终稿/幂等）；结构断言（D1 零变更冻结面四项；lab 源码 innerHTML 禁令扫描；新依赖精确版本零前缀 JSON 断言）；CSP 指令集（D5）；**主题审计（FR-AUI-04 自动兜底，唯一选型 = 宿主侧静态解析层）**——`test/unit/lab-theme.test.ts` 内置审计函数：解析 `@assistant-ui/vscode/theme.css` + `webview/lab/lab.css` 文本 → ①采样 token（--background/--foreground/--primary/--primary-foreground/--input/--border）定义链非空且终点为 `--vscode-*` 引用（FR-AUI-04①「非空非全透明」的静态等价判据）；②以 VS Code 默认主题调色板 fixture（Dark Modern/Light Modern 的 --vscode-* 基值快照，锚定 microsoft/vscode `extensions/theme-defaults/themes/*.json`，入库 test/fixtures 并注明来源+版本）代入 token 链解析具体 RGB：浅深两套**至少一组采样值不同**（主题联动生效）+ 正文/背景 WCAG 相对亮度对比度 ≥4.5:1 各测（公式脚本计算）。getComputedStyle 字面执行与真实渲染 = FR-AUI-04③ UI 手工 checklist（截图）。选型理由：无 DOM 纪律下唯一可无人值守离线判定的层，核验可独立复跑（纯函数+静态输入）；lab 预算（esbuild api 构建 lab 入口断言 ≤3,145,728 + 默认入口 metafile 无 react/@assistant-ui）。
- **integration（verify:integration，离线无人值守）**：`test/integration/lab-slice-a.test.ts`（D2 全链路：真实 serveWebviewHost+createVSCodeFetch×PiBridge(FAKE_PI_REPLAY golden-prompt-basic)——断言消息数=fixture user+assistant 数（逐行可推导）、assistant 文本与 fixture `message_end` 一致、流式帧序、abort 探针（`fetch:abort`→req.signal→bridge.abort）、LAB-XSS 探针文本保真；golden-steer-followup **P1**：三 POST 按录制时序、聚合断言三回声与三轮 assistant 不丢）；`test/integration/lab-slice-b.test.ts`（LabChatPanel（node 内直接实例化）×FAKE_PI_REPLAY：断言 postMessage 泵输出事件序列（user_message/message_final 计数、文本、id 贯通）== fixture 逐行推导；再喂**真实 store reducer** 断言最终 messages == user+assistant 全量 + 文本一致 + toThreadMessageLike 输出条数/文本）。
- **手工 checklist 汇总（一次真机执行，证据类型括注）**：浅/深主题截图×2（FR-AUI-04③）；XSS 探针 DOM 检查无新增 script/哨兵无副作用（FR-AUI-02⑤ DOM 层）；CSP 下回放 + devtools 零 violation（FR-AUI-05② 真机层）；隐藏再显示面板已渲染消息仍存（FR-AUI-05④ 行为层——**自动兜底 = 注册结构断言 retainContextWhenHidden:true**，行为层按核验判定四值记 MANUAL 不计 FAIL）；A/B 切换互不干扰冒烟（FR-AUI-02⑥）。
- **测试 Agent 盲写锚点（外部契约点）**：§11 #11–#18（vscode 包 README 节名 / tarball 源码协议与 Router 行为 / 官方指南章节 / ThreadMessageLike 与 useExternalStoreRuntime 官方文档 / fixtures-route 帧型 / ai 写入器 / VS Code 调色板）+ golden fixture（`test/fixtures/golden/`，期望值逐行可推导）+ 本节 D1–D9 判定面定义。

**锚点**：FR-AUI-02③④⑤⑥、FR-AUI-03①②③、FR-AUI-04①②③、FR-AUI-05②③④；规范 §4.3/§5；§6（本版已增补阶段①行）。

#### D9 风险与回退（FR-AUI-05 / FR-AUI-06②）

**决策**：① **门禁处置原则 = 如实记录失败证据即阶段①有效产出（允许「证伪」结论）**：任一门禁（预算/CSP/回放/主题/零变更断言）不过 → 不放宽断言、不静默改口径，失败证据与最小化定位写入 §10.13 对比报告，上报总调度裁决（调整重试 / 证伪终止迁移 / 退出）。② **禁用出口**：实验面板全部为增量注册（独立 viewType/命令/视图条目，activationEvents 惰性 `onView:sdysyhj.chatLabView`，不打开即零运行时成本），**不新增设置项开关**（阶段①无运行时 flag 需求，阶段④切默认时再立）；应急回退 = revert 阶段①增量提交即回默认面板零变更基线（D1 冻结断言保证可回退性）。③ **主要风险登记**：宿主 bundle 增量超预算（D6 预登记回退 minify；再超=上报）；`@assistant-ui/vscode` 0.0.1 上游 breaking/缺陷（锁版+D6 升级评估清单，阶段①内不受影响）；react 19 与 VS Code webview Chromium 兼容（engines vscode ^1.85 内嵌 Chromium 满足，真机冒烟覆盖）；zod jitless 真机 violation（三件套+真机 checklist 覆盖）；官方 strict CSP 拦截库注入样式（D5 预登记 relaxed 回退，须报告登记后生效）；`@assistant-ui/ai-sdk` 将 `ai` 客户端子集带入 webview bundle 致预算趋紧（D6 预估已计入；超限即上报）。

**锚点**：FR-AUI-05①③、FR-AUI-06②；任务书 §2（试点允许证伪）；规范 §0.3/§0.6。

#### 实现阶段改动面预估（供审批点 1b 与 D7③ 基线核对）

- **新增**：`src/lab/chatRoute.ts`、`src/lab/labChatPanel.ts`、`src/lab/labViewProvider.ts`、`webview/lab/main.tsx`、`webview/lab/zod-jitless.ts`、`webview/lab/shell.tsx`、`webview/lab/sliceA.tsx`、`webview/lab/sliceB.tsx`、`webview/lab/store.ts`、`webview/lab/threadMessageLike.ts`、`webview/lab/lab.css`、`test/unit/lab-*.test.ts`（mapping/store/isolation/csp/theme/budget/versions）、`test/integration/lab-slice-a.test.ts`、`test/integration/lab-slice-b.test.ts`、`test/tooling/lab-metrics.mjs`、调色板 fixture（`test/fixtures/`，来源锚点 §11 #18）。
- **修改（共享文件增量，均不触默认面板冻结面）**：`package.json`（依赖 9 项精确版本 + 视图/命令/activationEvents 增量）、`esbuild.mjs`（新增 lab webview 构建项）、`src/extension.ts`（实验面板注册接线）、`test/helpers/fake-pi-cli.js`（LAB-XSS 剧本，文件头锚点注释）、`docs/technical-design.md`（交付期 FR 追溯表 FR-AUI 行 + §10.13 对比报告小节）。
- **冻结不改（D1 断言面）**：`src/panel/chatPanel.ts`、`src/panel/messages.ts`、`src/bridge/**`、`webview/main.ts`、`webview/render/**`、`webview/styles/**`、esbuild 既有两项入口配置、package.json 既有视图/命令/配置项。

#### 遗留上报（无需求歧义；供总调度知悉，不阻塞 1b）

1. **DOM 行为层断言的可达性**：FR-AUI-05④「隐藏再显示已渲染消息 DOM 仍存」与 FR-AUI-02⑤「DOM 无新增 script 元素」的 DOM 行为层，在无 DOM 测试基建纪律（§10.10/§10.11 先例）下无法无人值守离线断言——本设计按核验判定四值制度落为 MANUAL 项（自动兜底 = 注册结构断言 / 通道文本保真+静态扫描）。若总调度认为必须全自动，需批准引入 `@vscode/test-electron` + 显示环境（xvfb）基建（官方测试床模式，成本与 CI 环境要求显著增加）。
2. **「面板加载→首帧」口径**：无头环境不可测 DOM 绘制——本设计把口径定为「驱动发起→通道首个消息事件」（D7②），DOM 绘制时延入真机 checklist 定性记录；如需字面「首帧绘制」时延，同样依赖上条第 1 项基建。

#### 阶段①双切片对比报告（交付填写，FR-AUI-06）

> 交付留痕：实现 Agent 于 2026-11-22 填写；度量环境 = 本仓工作区（Node v24.19.0，离线，golden 回放零网络）；基线 = 发版标签 `v0.1.6`（d121438，审批点 2 裁决钉死）。复现命令：`node test/tooling/lab-metrics.mjs --baseline v0.1.6 --runs 7 [--json out.json]`（自终止 + 有界超时；四维全部无人值守）。

**① bundle 体积（字节级实测，口径 D6）**

| 项 | 路线 A | 路线 B | 合计/预算 | 结论 |
|---|---|---|---|---|
| 实验面板 webview JS（入口+chunk，不含 .css/.map） | 度量入口 1,154,098 B | 度量入口 611,407 B | 单 bundle 合计 = **1,157,559 B** ≤ 3,145,728（占 36.8%；esbuild API 同参无 sourcemap 口径；`npm run build` 产物含 sourceMappingURL 注释为 1,157,591 B，同预算内） | ✅ 预算内（Shiki 未进产物——阶段①无 Markdown 渲染，react-streamdown 未引入） |
| 宿主 bundle 增量（vs v0.1.6 检出构建 90,586 B） | — | — | 当前 459,344 B，**增量 +368,758 B** ≤ 1,048,576（占 35.2%；未启用预登记 minify 回退） | ✅ 预算内 |
| 默认面板依赖图（webview/main.ts metafile） | — | — | 49 项 inputs，react/react-dom/@assistant-ui 命中 **0** | ✅ 无污染 |
| 实验面板 CSS（不计预算，参考） | — | — | 9,097 B（theme.css + 外壳） | — |

逐切片差异观察：路线 A 度量入口比 B 大 ≈543 KB——`@assistant-ui/ai-sdk`/`ai` 客户端子集（UIMessage 流消费端）只进 A；B 仅携带 react+react-dom+@assistant-ui/react 外部库运行时。两切片共用单 bundle（D4 面板内开关），逐切片数据仅供依赖面对比。

**② 首帧/首消息时延（golden-prompt-basic 回放 ×7 取中位，通道里程碑口径 D7②）**

| 切片 | T1 首帧（驱动发起→首个消息事件） | T2 首消息完成（pi message_end→切片侧终稿可读） |
|---|---|---|
| 路线 A（fetch-bridge） | **2.94 ms**（首个 SSE 帧解码；首跑 44.8 ms 为冷启动离群，后续 2.3–4.0 ms） | **0.93 ms**（finish 帧解码且文本齐） |
| 路线 B（ExternalStoreRuntime） | **0.06 ms**（store 首个事件回调） | **0.01 ms**（store.messages 含终稿） |

观察：A 的 T1 含官方隧道两端（fetch:request→route→SSE 首 chunk→fetch:chunk 合块→Response 流）与 16ms 合块窗口下的事件首帧；B 为进程内 postMessage 泵→reducer，同 tick 内完成。两者均为回放通道里程碑，非 DOM 绘制时延（D8 遗留上报②）；数值在无头进程内为微秒—毫秒级，真实 webview 环境以真机 checklist 定性补充。

**③ 代码侵入面（基线 v0.1.6，三组归类；docs/** 另列信息组）**

| 组 | 内容 |
|---|---|
| 默认面板冻结文件（须为空） | **（无 ✓）**——src/panel/**、src/bridge/**、webview/main.ts、webview/render/**、webview/styles/** 零改动 |
| 共享文件增量（7 项） | package.json（9 项精确版本依赖 + 视图/命令/activationEvents）、package-lock.json、esbuild.mjs（第三入口）、src/extension.ts（仅注册接线）、test/helpers/fake-pi-cli.js（新增 LAB-XSS 剧本 + 头注释锚点；abort 实验复用既有 LONG 剧本）、tsconfig.json（`"jsx": "react-jsx"`，tsx 类型检查必需）、.gitignore（media/lab.js/lab.css 构建产物排除） |
| 新增文件（26 项） | src/lab/ ×3、webview/lab/ ×11（含 2 个度量入口）、test/unit/lab-*.test.ts ×8、test/integration/lab-slice-*.test.ts ×2、test/tooling/lab-metrics.mjs + lab-metrics-driver.ts、test/fixtures/vscode-theme-defaults-palette.json |
| 信息组（不计入） | docs/** ×5（基线..当前的各角色落档：需求 v0.6、设计 §10.13、任务单 ×2、用例基线）；.pi-loop.json（总调度运行时文件，非本任务产物） |

`git diff --stat v0.1.6`（已跟踪文件，含 docs 信息组）：12 files changed, 3,123 insertions(+), 109 deletions(-)。

**④ PiBridge 事件契合度（定性框架，逐路线观察+证据指针；结论中立）**

| 维度 | 路线 A（fetch-bridge） | 路线 B（ExternalStoreRuntime） |
|---|---|---|
| 流式 delta | text_delta→`text-start`/`text-delta` 帧（帧型 = `ai` UIMessageChunk 官方协议，官方测试床 fixtures/route.ts 同款；终稿==增量拼接由 lab-slice-a 断言） | text_delta→store 尾块原地追加（官方「Streaming responses」原地变更 assistant 消息口径同型；终稿 message_final 权威覆盖，幂等键 = 消息 id） |
| user 回声承载（FR-CHAT-11） | **结构性无双气泡**：user 消息由 webview 侧 transport 请求自有渲染，服务端不发 user 帧（lab-slice-a 断言流内无 user 帧）；代价 = 宿主回声账本语义不进入 A 的消息流，多请求路由靠 A 自有的文本精确匹配账本（D2 最小子集，无通道兜底） | **全语义复用**：宿主账本（§10.12 D1/D2）就地合并，`user_message.id == message_final(user).messageId` 贯通断言；代价 = webview 侧维护一份镜像 reducer（含幂等/回填逻辑的同步面） |
| steer/followUp | run 绑定 HTTP 请求：运行中注入 = 新 POST（body.sendMode 透传），注入轮事件经回声匹配路由到所属流（golden-steer-followup 三流不丢实证）；语义映射层在 route（P1 实证） | 复用 PiBridge 全部队列语义（steer/followUp/queue_update 快照/乱序投递，零新逻辑；golden-steer-followup 终态 = fixture 全量实证） |
| abort | 请求 AbortController→`fetch:abort`→req.signal→bridge.abort（LONG 剧本实证：客户端流 AbortError + 宿主 settled(aborted)→idle）；另得页面重载 `fetch:reset` 批量中止（官方语义） | ComposerPrimitive.Cancel→postMessage `{kind:"abort"}`→bridge.abort（同一终点；中止后回 idle 两路线同口径） |
| 传输与安全面 | 官方隧道（fetch:* 帧 over postMessage，CSP 无需 connect-src）+ UIMessage 流双端协议约束（帧型/zod 校验路径，需 jitless 三件套） | 既有 HostToWebview 协议零改动复用（无新消息型）；webview 侧状态源与 React 外部库对接（useSyncExternalStore） |

**`@assistant-ui/vscode` 0.0.1 升级评估要点（FR-AUI-05① 留痕）**

- 0.0.x 无 semver 兼容承诺（0.0.x→0.0.y 均可能 breaking）。升级评估清单：① host/webview 协议常量与消息形状（channel `aui-vscode`、`fetch:*`/`rpc:*` 帧、校验器）；② CSP 模板与 `renderWebviewHtml` 选项面（lab-csp 断言面直接锁定）；③ 导出面（serveWebviewHost/createVSCodeFetch/theme.css，labChatPanel/chatRoute/sliceA/lab.css 四处 import）；④ peer/依赖矩阵（react 线、`@assistant-ui/core` 线、zod 线）。逐项对照 CHANGELOG/源码 diff 后小步升级 + 全量回放回归（verify:integration 双切片 golden 回放即回归面）。
- 退出：双切片全部为增量代码（独立 viewType/命令/视图条目，惰性激活），删除注册与依赖即回默认面板基线；实验面板不落任何会话/状态副本（NFR-03），无数据残留。

**中性结论（路线选择不预设；裁决权 = 总调度阶段①出口，按任务书 §2 向人类通报）**

- 四项门禁全部实测通过，两条路线在未项目均可用：A 贴合官方集成形态（隧道/帧协议/abort 语义内建，后续升级跟官方），B 复用既有协议与回声账本（FR-CHAT-11 零新增逻辑，宿主依赖面小）。
- 量化差异：bundle 逐切片 A>B（ai 客户端子集）；时延两者无头环境均为毫秒级；侵入面共享文件均为最小增量；契合度差异主要是 user 回声承载方式（结构性 vs 账本复用）与 steer/followUp 语义承载层（route vs bridge）。
- 需要权衡的后续阶段风险：阶段②③的 Markdown/thinking/toolcall part 化与 Composer 定制在 A 下可直接用官方组件生态，在 B 下需自维护映射与同步面；反之 B 的会话管理/历史重放与默认面板完全同源。以上仅为观察，不构成路线预判。

---

### 10.14 TASK-009 切换批次设计记录（新 UI 转正默认 + 旧面板退役，需求基线 v0.7 §4.6）

> 来源：docs/tasks/TASK-009-assistantui-migration.md（人类指令 2026-11-22「直接切换到新的 UI 界面，不要使用这种实验性的内容」+ 真机反馈路线 A 无法回复 → #D-06 裁决路线 A 淘汰 + 计划修订：阶段②③④压缩为单一切换批次，发版 0.1.8 = 功能等价迁移 + 新 UI 转正默认 + 旧面板退役过渡）；需求基线 v0.7 §4.6（FR-AUI-02 修订为路线 B 单实现、FR-AUI-05③ 预算新口径、FR-AUI-07 切换与退役、FR-AUI-08 功能等价口径）+ 澄清 #19（视觉取舍/命名/退役节奏）+ §5 切换批次不做项。
> 状态：**已实现（0.1.8 交付）**——实现位置与 FR 追溯表见本节末尾「切换批次交付小节」（对应 §10.5.1 切换批次实现行）。
> 起点代码锚点（设计期只读核验）：`webview/lab/`（sliceB.tsx / store.ts / threadMessageLike.ts / shell.tsx = 路线 B 切片，切换批次起点）、`src/lab/labChatPanel.ts`（vscode-free 面板核心）、`webview/main.ts` + `webview/render/`（旧 vanilla 面板全交互能力迁移参照）、`src/panel/chatPanel.ts`（旧面板宿主接线与 HTML 模板）。
> 外部证据核读（2026-11-22，设计期只读核验，未装依赖）：`@assistant-ui/react-markdown@0.14.26` npm tarball 全量导出面（§11 #19：MarkdownTextPrimitive / SyntaxHighlighterProps / code-fence；依赖 `react-markdown ^10.1.0`——**无 Shiki**，证实任务书 §5 #5）；`@assistant-ui/core@0.3.37` `fromThreadMessageLike` 实现级消费契约（§11 #21，#D-06 教训的直接锚点）；`ComposerRuntime.setText` / ExternalStoreAdapter 接口面（§11 #22）；highlight.js 11.12.0 `lib/common` 语言注册清单（§11 #23）；npm registry 版本核值（remark-gfm 4.0.1 / remark-breaks 4.0.0 / @testing-library/react 16.3.3 / @testing-library/dom 10.4.2 / jsdom 31.0.1）。§10.13 D1–D9 中与本批次冲突的约束（默认面板冻结面、实验面板零变更）随 FR-AUI-01 使命结束自然解除，下文逐处显式声明取代范围。

#### D1 面板架构切换（FR-AUI-07①②④）

**决策**：
- **新 UI 转正为默认面板**：viewType `sdysyhj.chatView`（视图名 "Chat"，首位条目不变）改由新 UI 承载——宿主 = `src/ui/chatViewProvider.ts`（vscode 薄壳，`renderWebviewHtml` strict CSP + `retainContextWhenHidden: true`，labViewProvider 演进）+ `src/ui/chatController.ts`（vscode-free 面板核心，labChatPanel 演进：`bridge.onAny` → postMessage 泵 + **WebviewToHost 协议全集处理**（ready 回放 superset：config/model_info/usage_info/run_state/history_loaded，对齐 chatPanel.ts 现行为））；webview = `webview/ui/`（现 shell.tsx 演进的 React 壳 + Composer 全量，见 D3）；产物 `media/chat.js` + `media/chat.css`。
- **经典面板冻结迁移**：viewType `sdysyhj.chatViewClassic`（视图名 "Chat (Classic)"，#19(b)）承载旧 vanilla 实现——`src/panel/chatPanel.ts` 仅两类改动：① viewType/标题常量迁移；② 宿主动作层机械提取（D3，行为零变化）；`webview/main.ts`、`webview/render/**`、`webview/styles/**`、`media/main.js` 构建参数**零改动**（经典面板字节冻结面）。命令 `sdysyhj.openChatClassic`（标题 "Open Chat (Classic)"）→ `chatViewClassic.focus`。
- **移除（实验命名清零 + #D-06 随之关闭）**：viewType `sdysyhj.chatLabView`、命令 `sdysyhj.openChatLab`、`activationEvents` 条目 `onView:sdysyhj.chatLabView`、`webview/lab/**`（含 sliceA/切片 A/B 开关/度量入口）、`src/lab/**`（含 chatRoute.ts——路线 A 宿主路由）、esbuild lab 第三入口、依赖 `@assistant-ui/ai-sdk` 与 `ai`（路线 A 专属消费者消失）。
- **package.json contributes 迁移方案**：views 数组 = `[{sdysyhj.chatView,"Chat"},{sdysyhj.chatViewClassic,"Chat (Classic)"}]`；commands 删 `openChatLab`、增 `openChatClassic`，既有 9 项命令（openChat/newSession/abort/showHistory/reportIssue/renameSession/switchModel/switchThinking/sendToPi）与 5 项配置（piRuntime/piPath/thinkingDefault/outputTailLines/sendMode）**逐项零变更**（FR-AUI-07④ 结构断言面）；activationEvents = `[onView:sdysyhj.chatView, onView:sdysyhj.chatViewClassic]`（均惰性）；contributes 全文「实验/Lab」字符串清零（FR-AUI-07② 断言面）。
- **构建入口收敛**：esbuild 三入口重定义 = 宿主 `src/extension.ts → dist/extension.js`（参数不变）+ 新默认 webview `webview/ui/main.tsx → media/chat.js`（lab 第三入口转正改名）+ 经典 webview `webview/main.ts → media/main.js`（冻结不变）。
- **运行接线**：两面板共享同一 PiBridge（现状延续；emitter 多订阅互不影响）；`sdysyhj.openChat` 仍指向 `sdysyhj.chatView.focus`（用户无感）；`sendToPi`/`input_prefill` 目标 = 新 UI 面板（经典面板保持自有行为不迁移）。

**理由**：FR-AUI-07① 钦定 viewType 不变 = 用户无感切换；#19(b) 钦定命名与 openChatLab 移除（实验入口存活一个版本、非对外契约）；「实验/Lab」命名清零贯彻到源码层（`webview/lab`→`webview/ui`、`src/lab`→`src/ui`，一概念一拼写）；构建产物改名 `media/chat.js` 避免「lab」语义残留且不触经典面板冻结路径。
**锚点**：FR-AUI-07①②③④、FR-AUI-05④、#19(b)(c)；package.json v0.1.7 现状；§10.13 D1（实验面板注册形态——本批次语义反转，由 FR-AUI-07 取代）。

#### D2 消息渲染 part 化（FR-CHAT-01/02/03/04 等价；FR-AUI-02②）

**决策（映射扩容表，`webview/ui/threadMessageLike.ts`——threadMessageLike.ts 平移扩容）**：

| UiBlock/字段 | ThreadMessageLike 映射 | 渲染组件（MessagePrimitive.Content components） |
|---|---|---|
| `text` | `{type:"text", text}` | `Text` = **MarkdownTextPrimitive**（@assistant-ui/react-markdown，D2 下半） |
| `thinking` | `{type:"reasoning", text}` | `Reasoning` = 折叠块（默认折叠、展开后流式显示，FR-CHAT-03） |
| `toolcall` | `{type:"tool-call", toolCallId: block.id, toolName: block.tool, argsText: block.args}`；终端态注入 `result: {status, summary, output, outputTruncated}`（running 态不注入 result）、`isError: status==="error"` | `ToolFallback` 覆盖 = 工具卡（FR-CHAT-04 全要素：工具名/关键参数摘要/状态（进行中/成功/失败/已中止）/可展开输入输出/bash 命令与输出摘要/大输出截断保留尾部 +「复制全部」→ `post copy_output` 取宿主缓存全量） |
| `UiMessage.aborted` | `metadata.custom.aborted = true` | AssistantMessage 尾部「⏹ 已中止」消息级标记（与旧 `finalize` 同构） |
| `UiMessage.errorMessage` | `metadata.custom.errorMessage` | 消息级「⚠ …」提示（旧实现同构） |
| 空文本块 | **不建 part**（映射期滤除） | ——（消费契约 #21：空 text/reasoning part 会被 `fromThreadMessageLike` 丢弃，提前滤除保序） |

- **status 不注入**：运行态经 `isRunning` 驱动（ExternalStoreAdapter 既定口径）；`status` 仅 assistant 消息合法（#21：user 带 status 即 throw），不注入可规避消费契约陷阱。相邻 assistant 消息**不合并**（无 joinStrategy）——pi 多轮 assistant 各自成条，与澄清 #12 计数口径一致。
- **Markdown 与高亮（唯一决策 = 渐进高亮：highlight.js common 同集平移 + Markdown 解析 defer；Shiki 全系不引入）**：`MarkdownTextPrimitive`（@assistant-ui/react-markdown 0.14.26）+ `remarkPlugins: [remarkGfm, remarkBreaks]`（表格/删除线/任务列表 = FR-CHAT-02 表格；单换行→`<br>` 对齐旧 marked `breaks:true`）；代码高亮经 `components.SyntaxHighlighter`（§11 #19 挂接契约）自研适配器 = **highlight.js 11.12.0 `lib/common`**（既有依赖，与旧实现逐字同一语言集——回归为零）；`defer: true`（官方渐进解析：流式期低优先级重解析、终稿必渲染）。**否决 Shiki/限语言/代码分割方案**：FR-CHAT-02 边界只要求「不窄于 hljs common」——同集平移零回归；Shiki 需 TextMate 语法链 + oniguruma（限语言仍 1–2 MiB 且引入 wasm/CSP 复杂度，全量 ≈15 MiB 直接违 FR-AUI-05③）；`@assistant-ui/react-streamdown`（Shiki 唯一入口）不引入。
- **高亮语言集定值（#19(a) 附注「具体清单由设计基线定值」）= highlight.js lib/common 36 语言**（node_modules 实测 registerLanguage 清单，§11 #23）：bash, c, cpp, csharp, css, diff, go, graphql, ini, java, javascript, json, kotlin, less, lua, makefile, markdown, objectivec, perl, php, php-template, plaintext, python, python-repl, r, ruby, rust, scss, shell, sql, swift, typescript, vbnet, wasm, xml, yaml。集外语言回退纯代码转义展示（与旧实现未收录语言行为同构，不构成回退）。
- **XSS 口径（NFR-03 / FR-AUI-02④）**：Markdown 主体 = react-markdown 构造性转义（rehype-raw 不引入 = 无 raw HTML 通道）+ 默认 `urlTransform` 过滤危险协议 + 链接组件补 `rel="noopener noreferrer"`（点击行为沿用 VS Code webview 内建外开，与旧面板同口径）；唯一受控 HTML sink = SyntaxHighlighter 内 `hljs.highlight` 输出经 **DOMPurify.sanitize**（既有依赖，与旧实现同一消毒口径）后 `dangerouslySetInnerHTML`——源码扫描对 `webview/ui/**` 禁 innerHTML 系 API，仅该 sink 白名单。XSS 探针（UI-XSS 回放剧本）断言升级：jsdom 真实渲染下 DOM 无新增 script 元素、探针文本逐字为文本节点（FR-AUI-02④ 从 MANUAL 升格可自动判定）。

**理由**：part 化字段保真走官方转换契约（#21 实现级核实：result/isError/argsText/metadata.custom 均透传），工具卡数据经 tool-call part 承载 = 全部渲染数据穿越真实 runtime 转换链（#D-06 教训正向制度化：消费面即测试面）；高亮同集平移是 FR-CHAT-02「零回退」的最短路径。
**锚点**：FR-CHAT-01/02/03/04、FR-AUI-02②④、FR-AUI-08②；#19(a) 附注；§11 #19/#20/#21/#23；§10.13 D3（最小映射 → 本批次全量取代）。

#### D3 Composer 等价迁移（FR-FILE-02 / FR-CMD-03 / FR-MOD-01③ / FR-MOD-04 / FR-CHAT-05/06）

**逐能力决策表**（旧实现参照 = `webview/main.ts` + `webview/render/*` + `src/panel/chatPanel.ts`）：

| 能力（FR） | 旧实现 | 决策（复用/重写） |
|---|---|---|
| 输入主体：Enter 发送 / Shift+Enter 换行 / isComposing 防误发 | main.ts keydown | **重写**（React 接线，语义同构：命令菜单打开时 ↑/↓/Enter/Esc 导航优先不发送） |
| 发送按钮 + 中止（FR-CHAT-05） | btn-send 图标 / btn-stop | **重写**：ComposerPrimitive.Send（图标化 + aria-label「发送」，D6③）/ ComposerPrimitive.Cancel → `post abort`；运行中显示 Stop、隐藏发送（ThreadPrimitive.If running 同构） |
| `@` 文件选择器（FR-FILE-02） | input 处理器（前一字符行首/空白 + 1s 防抖）→ insert_file_ref → 宿主 QuickPick → file_ref → insertAtCursor(replaceAt `@`) | **半复用**：触发谓词机械提取为纯函数 `webview/ui/fileRefTrigger.ts`（可单测）；宿主 QuickPick 经 hostActions 复用；光标插入 = textarea ref 读选区 + `ComposerRuntime.setText` 全文重写（§11 #22，保 replaceAt `@` 语义）；输入区无添加文件按钮（DOM 断言面） |
| `/` 命令菜单（FR-CMD-03） | `render/commandMenu.ts`（纯逻辑）+ main.ts 接线 | **纯逻辑原样复用**（CommandMenuState/filterCommands 零改动，随 UI 目录平移）；React 菜单组件按状态机快照渲染；request_commands/commands 协议复用；↑/↓ 环绕、Enter 选中插入 `/`+命令名、Esc 关闭、鼠标 mousedown 等效（保持焦点）逐条同构 |
| 底部模型选择器（FR-MOD-01③） | model-selector/model-menu | **重写**（React 组件）；request_models/models_list/set_model 协议复用，终接同一 `bridge.setModel` 三入口同步（FR-MOD-01） |
| 上下文用量行（FR-MOD-04） | usage-line + format.ts | **纯函数复用**（formatContextUsage/formatHHmm 零改动）；usage_info 协议复用；React 组件重写 |
| steer/followUp 模式切换与发送语义（FR-CHAT-06） | send-mode select；运行中 mode=select 值、否则 auto | **重写**（React 状态 + 同语义）；config 事件（sendMode 默认）复用；placeholder 运行中提示同构 |
| 头部：状态行/会话名/新会话/历史/设置（FR-CHAT-08/FR-SESS-01/04） | header DOM | **重写**（React 组件）；model_info/run_state/session_name/new_session/open_history/rename_session/open_settings 协议复用 |
| 错误卡片 / toast / 外部修改横幅（FR-CHAT-07/FR-SESS-07） | showError/showToast/showExternalChangeBanner | **重写**（React 组件，含刷新按钮 → refresh_session）；error/toast/external_change 协议复用 |
| input_prefill（FR-FILE-03 右键发送预填） | insertAtCursor | **重写**：ComposerRuntime.setText 预填（协议复用） |

- **纯逻辑模块复用总表**：`commandMenu.ts`（复用）、`format.ts`（复用）、`followState.ts`（复用，D4）；`markdown.ts`（**弃用**——Markdown 渲染换 @assistant-ui/react-markdown，DOMPurify 仅存于 hljs sink）；`render/messages.ts` MessageView（**弃用**——React 组件化，D2）。
- **宿主动作层提取（`src/panel/hostActions.ts`，新文件）**：chatPanel.ts 的 vscode 交互动作（showHistory/showFilePicker/showModelPicker/showThinkingPicker/showRenameInput/guard/relativePath/copy_output 约 120 行）机械提取为共享模块，chatPanel.ts 改为同名委托（**行为零变化**），`chatController.ts` 复用同一模块。FR-AUI-07③「行为冻结」口径 = **行为冻结非字节冻结**：判定 = 既有回归套件零放宽全绿 + 双面板一致快照（D9）；chatPanel.ts 改动收敛为 viewType 常量 + 该机械提取两处。否决方案：复制 120 行到新宿主（一概念两拼写，维护性不可接受）；chatPanel.ts 字节冻结（则新宿主无法复用 QuickPick 面，同样落复制）。

**锚点**：FR-FILE-02、FR-CMD-03 ①–⑤、FR-MOD-01③/03/04、FR-CHAT-05/06、FR-CHAT-08、FR-SESS-01/04/07、FR-FILE-03；§11 #22；§10.11（各能力实现口径逐条迁移基线）。

#### D4 流式与跟随（FR-CHAT-01 / FR-CHAT-09 四款；NFR-01）

**决策**：
- **增量渲染链**：postMessage 泵 → **delta 合批缓冲**（rAF 冲刷；`message_final`/`history_loaded`/`session_reset` 前强制冲刷 = 零丢失保证）→ store reducer（appendDelta 既有语义）→ React commit。批处理痕迹 = 每 rAF 至多一次 store 演进（NFR-01 #3 代理判据沿用：≥600 delta 零丢失 + 全量渲染 ≤30s + 批处理迹象）。
- **FR-CHAT-09 40px 跟随语义等价（React 适配层）**：
  - 决策点 = **`useLayoutEffect`（依赖 store 快照）**：每次 React commit（= 一次增量渲染）后调用 `applyFollowScroll()`——对应旧实现「MutationObserver 渲染点」口径（①“每次增量渲染后保持底部”）；useLayoutEffect 在 DOM 变更后、绘制前执行，等价且优于旧异步回调（无可见闪烁窗口）；
  - 度量与执行：滚动容器 `scrollHeight/clientHeight/scrollTop` 同公式（distanceFromBottom 下限 0）；
  - 用户滚动识别：scroll 事件 + **selfScrollPending 程序滚动自标记**同构迁移（React 合成事件不改变语义；已在底部无位移不自标记）；>40px 打断（②，增量渲染不推动滚动位置）、≤40px 恢复（③）；
  - 每轮默认跟随重置 = `FollowState.onStreamStart`（本轮首个 stream_start，roundStarted 口径不变——轮内后续消息不覆盖用户打断）；`onRunState` 门控 idle 不自动滚动（④）；会话载入/切换尾部一次性定位不走向量决策（④排除项）；
  - 跟随态 = FollowState 实例存活 React 组件内（不入 store、不写会话、不持久化——④）。
- Markdown `defer`（D2）中间态跳过不影响①判据：判据挂在 commit 点（每次实际 DOM 变更后回底），跳过的中间态即未渲染、无「增量渲染」发生。

**理由**：FollowState 纯状态机零改动复用使四款语义判定（单测 13 用例）原样生效，React 侧仅替换「渲染点观测」与「滚动执行」两个接线面；useLayoutEffect 是 React 语义下“渲染后”的精确定义（D10 风险登记备选：若真机发现时序缺口，回退 = 滚动执行再锚定一次 rAF，语义不放宽）。
**锚点**：FR-CHAT-01、FR-CHAT-09①②③④；§10.10 FR-CHAT-09 实现注记（口径界定「每轮」定义原样迁移）；NFR-01；§11 #14（「Streaming responses」原地变更口径）。

#### D5 user 回声与单气泡（FR-CHAT-11 ①–⑤全语义）

**决策**：
- **宿主零改动**：§10.12 D1–D7（单源 id 贯通 + pending 账本 + 就地 finalize + 权威重建）原样承载 FR-CHAT-11 全语义——路线 B 既定卖点，切换批次对 `src/bridge/**` 零改动（D10 冻结面）。
- **store 消费侧单条映射口径**：
  - `user_message`（宿主单源 id）→ push 单条（①发送即时展示，不等回声）；
  - `message_final(user)`（回声终稿，同 id）→ `applyMessageEvent` **就地覆盖**（幂等键 = 消息 id，§10.12 D4 同语义）——澄清 #16 就地更新：更新前后条目数均为 1，文本收敛为 pi 权威文本；
  - 澄清 #17 保守分支：宿主不重绑不追加 → store 收不到该条 message_final → 保留发送原文单条（不错换/不新增）；权威重建（`history_loaded` 全量替换 store.messages）后收敛 JSONL 权威文本（③④）；
  - steer / followUp 插话经同一 `user_message` 路径（②同口径）；历史重放（面板重开/会话切换）以 `history_loaded` 全量替换为唯一重建入口（③）；
  - 映射层一 UiMessage → 一 ThreadMessage（无合并/无 joinStrategy），转换契约遵守 #21（user 仅 text part；assistant part 保真）；⑤回归边界 = assistant 流式/工具卡路径不涉 user 事件（§10.12 D7 同边界）。
- **判定**：jsdom golden E2E 三判定时点（发送后 / user 回声后 / 本轮终稿后）user 气泡 DOM 计数恒 1 + 就地更新文本断言 + 历史重放计数断言（D8）。

**理由**：FR-CHAT-11 的全部关联复杂度已在宿主账本收敛（TASK-008 核验 PASS），消费侧只需「同 id 就地更新 + 权威重建替换」两条规则；#17 的多通道不可判定性在 store 层天然成立（无回声 = 无事件，被动保留即正确）。
**锚点**：FR-CHAT-11①–⑤、澄清 #5/#12/#16/#17；§10.12 D1/D2/D4/D5/D6；§11 #21。

#### D6 主题与视觉（FR-CHAT-10 五子条 + FR-AUI-04；#19(a) 全维持口径）

**决策（五子条逐条落地）**：
- **token 映射载体**：`webview/ui/chat.css` = `@import "@assistant-ui/vscode/theme.css"`（shadcn token → `--vscode-*` 映射，§11 #11 Theme 节）+ 显式覆盖层（lab.css 平移扩容）。FR-AUI-04 验证面平移：ui-theme.test.ts 静态审计（token 链终点 --vscode-*、浅深调色板差异、WCAG ≥4.5）+ 真机截图 checklist。
- ① **内容列 960px 居中**：消息视口内层与 Composer（含底部模型选择器/用量行）共享同一 `.content-col { max-width: 960px; margin: 0 auto; }`（shadcn 默认宽度不采纳，CSS 显式钉值断言）。
- ② **输入框圆角 8px**：`.composer-shell { border-radius: 8px; }` 显式钉值（shadcn rounded-lg 恰合仍断言钉值）。
- ③ **发送图标化**：自定义 Send 组件 = 上箭头 SVG、无文字内容、`aria-label="发送"` + `title="发送"`（覆盖 assistant-ui 默认英文 aria 文案——#19(a)③ 钦定）；jsdom 断言按钮无文本子节点 + 可访问性名称。
- ④ **消息布局**：用户消息右对齐 + 气泡容器（背景色+圆角包裹）；助手消息左对齐无气泡包裹；**禁 avatar**（自定义 UserMessage/AssistantMessage 组件不渲染头像槽位；jsdom 断言消息子树无 img/avatar 元素——#19(a)④⑤）。
- ⑤ **HH:mm 时间戳替代角色标记**：MessageRoot 自定义渲染 `.message-time` = `formatHHmm(createdAt.getTime())`（format.ts 复用，本地时区 24 小时制）；不显示 User/Assistant 文字前缀；jsdom 断言 `^\d{2}:\d{2}$`；thinking 折叠块与工具卡功能标签不受约束（FR-CHAT-10⑤ 原文）。
- **判定载体**：③④⑤ jsdom 结构断言（FR-CHAT-10 从 MANUAL 全量升格可自动判定）+ ①② CSS 钉值断言 + FR-AUI-04①② 采样/对比度自动兜底 + 浅/深主题截图 MANUAL（证据类型：截图）。

**锚点**：FR-CHAT-10①–⑤、FR-AUI-04①②③、#19(a)；§11 #11；§10.11 FR-CHAT-10 实现注记（口径平移基线）。

#### D7 预算与构建（FR-AUI-05①③（v0.7 新口径））

**决策**：
- **构建参数**：`webview/ui/main.tsx → media/chat.js(+.css)` 沿 lab 入口既定参数（platform browser / iife / es2020 / `jsx:"automatic"` / minify / `define NODE_ENV=production`）；`zod-jitless.ts` 首 import 保留（zod 经 @assistant-ui/react 传递依赖仍在 bundle，jitless 三件套平移）；宿主入口与 `webview/main.ts → media/main.js` 参数零改动。
- **依赖变更（全部精确锁定，零 ^/~/>= 前缀）**：删 `@assistant-ui/ai-sdk 0.0.19`、`ai 7.0.153`（路线 A 专属）；增 `@assistant-ui/react-markdown 0.14.26`、`remark-gfm 4.0.1`、`remark-breaks 4.0.0`；devDependencies 增 `@testing-library/react 16.3.3`、`@testing-library/dom 10.4.2`、`jsdom 31.0.1`（D8 测试基建）；保留 react 19.3.1 / react-dom 19.3.1 / @assistant-ui/react 0.15.37 / @assistant-ui/vscode 0.0.1 / zod 4.6.7 / marked·dompurify·highlight.js（经典面板冻结面依赖，不删）。
- **预算核算预估（设计期估算，门禁以实现期实测为准）**：

| 项 | 预估 | 预算 | 依据 |
|---|---|---|---|
| 默认面板 `media/chat.js`（入口+chunk，不含 css/map） | **≈1.3–1.8 MiB** | ≤ 4 MiB（4,194,304 B，FR-AUI-05③） | react+react-dom ≈0.45 MiB + @assistant-ui/react 链 ≈0.6 MiB（阶段①切片 B 度量 611 KB 内含 react 实测锚）+ react-markdown/remark-gfm/remark-breaks 链 ≈0.3–0.5 MiB + highlight.js common ≈0.26 MiB + 应用壳 ≈0.05 MiB；占用 ≈31–43%，余量充足 |
| 宿主 bundle 增量 | **≈−50 KB ~ 0**（净变化或负向） | ≤ 1 MiB（基线 v0.1.7 = 459,382 B） | +hostActions/controller 全协议 ≈+10 KB，−chatRoute（`ai` 流写入器子集）≈−30~60 KB |
| 经典面板 `media/main.js` | 0（不变） | 依赖图无 react/@assistant-ui（断言平移） | 冻结入口 |
| VSIX | 略缩 | — | 删 ai/ai-sdk 依赖链（v0.1.7 实测 31,176,757 B 为参照） |

- **门禁断言（ui-budget.test.ts 平移扩容）**：chat.js+全部 chunk `fs.stat` 合计 ≤ 4,194,304 B；宿主增量 ≤ 1,048,576 B（vs v0.1.7 构建产物基线）；经典入口 metafile inputs 零 react/react-dom/@assistant-ui 命中；依赖精确版本 JSON 断言（ui-versions.test.ts，含删除项断言：package.json 无 `@assistant-ui/ai-sdk`/`ai`）。

**理由**：FR-AUI-05③ v0.7 口径（默认面板全链 4 MiB）为本设计定值的上位口径；高亮方案选型（D2）对预算影响已核算（hljs common 0.26 MiB vs Shiki 限语言 1–2 MiB——选型与预算互证）。
**锚点**：FR-AUI-05①③（v0.7）、§10.13 D6（阶段①实测基线）、§11 #19/#23。

#### D8 测试策略（#D-06 教训制度化：消费端契约验证）

**唯一选型 = headless React 测试基建（jsdom 31 + @testing-library/react 16）引入为新 UI 消费端契约验证面**；至少一条端到端 golden 回放链路以**真实 @assistant-ui/react runtime 消费**断言（非自建解码器）。

**理由（对备选的裁决）**：① #D-06 根因 = 断言以自建解码器消费、真实 runtime 消费面从未被验证——「真实 runtime 的 store/订阅层驱动」仍绕开 `fromThreadMessageLike` 转换与组件消费层，与自建解码器**同构风险**（§11 #21 的消费契约陷阱：status 仅 assistant 即 throw、空文本 part 丢弃、user 无 tool-call part——这些分歧只有真实 runtime 消费才暴露）；② 「无 DOM 纪律」先例（§10.10/§10.11）针对旧 vanilla 面板（手写 DOM 测试收益低），而切换批次后产品面即 React 组件——jsdom + RTL 是 React 组件的标准测试面，属**有意的、范围受限的纪律演进**（仅 `webview/ui` 相关测试文件以 `// @vitest-environment jsdom` 文件级注解启用；经典面板与桥侧测试维持 node 零 DOM）；③ 基建全部 devDependencies（jsdom 31.0.1 / @testing-library/react 16.3.3 / @testing-library/dom 10.4.2，peer react ^18||^19 已核），不进产物、不触 CSP/构建面。

**端到端 golden 回放链路（P0，≥1 条）**：`golden-prompt-basic.jsonl` → fake-pi `FAKE_PI_REPLAY` 子进程（§10.12 D8 注入位）→ RpcClient → PiBridge → chatController（postMessage 泵）→ jsdom window MessageEvent → store dispatch → **真实 `AssistantRuntimeProvider` + `useExternalStoreRuntime` + MarkdownTextPrimitive/自定义组件渲染** → DOM 断言：消息条数 = fixture user+assistant 逐行推导值、assistant 文本逐字一致、user 气泡三时点计数 = 1（D5）、工具卡状态/摘要/输出/复制接线、reasoning 折叠存在、时间戳 `^\d{2}:\d{2}$`、无 avatar、XSS 探针文本保真且无新增 script 元素。`golden-steer-followup.jsonl`（P1）同链路断言插话序列不丢不错换。**传输真实性（FR-AUI-02③ 防自证口径不变）**：注入点 = PiBridge 之下的 fake-pi 子进程，事件经真实 postMessage 通道进 store，测试不直接触 store/渲染结果。

**分层**：
- unit（verify:unit，node 环境，确定性纯逻辑）：映射纯函数扩容（tool-call result/isError、metadata.custom、空文本不建块、#21 契约顺从）；store reducer（含 delta 合批缓冲零丢失）；fileRefTrigger；commandMenu/format/followState 复用件回归（原用例平移）；ui-budget/ui-csp/ui-versions/ui-theme/ui-isolation（经典面板冻结面 + 预算 + 依赖锁 + 主题审计）。
- integration（verify:integration，node 环境）：宿主零改动判定面原样保留（golden-replay/user-echo/pi-bridge/defects-regression/rpc-client/runtime-resolve 等）。
- integration（verify:integration，jsdom 环境文件级注解）：ui-golden-dom.test.ts（上列 E2E 链路）、ui-dual-panel.test.ts（D9 一致快照）、ui-xss.test.ts（UI-XSS 探针真实渲染断言）。
- MANUAL（真机 checklist，核验四值制度）：浅/深主题截图（FR-AUI-04③）、真实 CSP 下 devtools 零 violation（FR-AUI-05② 真机层）、retainContextWhenHidden 行为层（FR-AUI-05④）、双面板切换冒烟（FR-AUI-07③）、流式跟随观感、Composer 交互细节（IME/焦点保持）。

**回归清单重定向（基线 = 218 unit / 45 integration）**：
- **删除**（#D-06 随路线 A 关闭）：`test/unit/lab-route.test.ts`、`test/integration/lab-slice-a.test.ts`；
- **平移改判**：lab-store/lab-store-mapping → ui-store/ui-mapping（断言扩容）；lab-csp/lab-theme/lab-budget/lab-versions/lab-isolation → ui-*（预算口径 3→4 MiB、HTML/注册断言面改 chatView、冻结面反转为**经典面板**零改动断言）；lab-slice-b → **ui-golden-dom**（store 数据断言升格为真实 runtime DOM 断言，#D-06 制度化的落点）；
- **保留零改动**：commandMenu/format/followState/text/protocol/redact/config/jsonl/runtime/rpcClient/stderr-ordering/sessionStore/piBridge（unit）+ golden-replay/user-echo/pi-bridge/defects-regression/rpc-client/runtime-resolve（integration）——宿主零改动 = 用例零改动；
- **新增**：jsdom 组（上列）+ ui-composer.test.ts（@ 触发谓词/命令菜单接线纯逻辑）。

**锚点**：规范 §4.3（mock 对齐 + golden 兑底）/#D-06 任务单裁决；FR-AUI-02③④、FR-AUI-03①②③、FR-AUI-08③；§11 #21（消费契约）；§10.13 D8（先例与本次有意偏离的理由）。

#### D9 经典面板回退与退役（FR-AUI-07③④；#19(c)）

**决策**：
- **双面板行为一致快照（FR-AUI-03④/FR-AUI-07③）**：同一 golden 回放分别驱动两面板消费端、断言同一期望（fixture 逐行推导）——新 UI = jsdom 真实 runtime DOM 断言（D8）；经典面板 = **同一 jsdom 基建**加载 chatPanel HTML 模板 + `media/main.js` 冻结 bundle（vscode stub 取 HTML，沿既有 prod-vscode-stub 模式），DOM 断言消息条数与消息文本；两面板断言结果逐条相等即快照成立。**受控回退（预登记）**：若经典 bundle 在 jsdom 挂载成本超预期，经典侧降级为数据层断言（消息视图计数/文本经其公开路径）+ 真机 MANUAL 对照，自动断言以新 UI 为准——如触发，记设计偏差留痕，不静默降级。
- **双面板可切换**：同一工作区分别打开两面板无错误 = MANUAL 冒烟 + 命令/注册结构断言（openChatClassic → chatViewClassic.focus、两 viewType 注册齐全）。
- **并存期行为冻结**：经典面板仅缺陷级修复（FR-AUI-07③）；0.1.8 全程可经 `sdysyhj.openChatClassic` 切回（用户自救入口）。
- **0.2.x 删除步骤预告（#19(c) 删除判定 = contributes 无 chatViewClassic/openChatClassic 结构断言）**：① package.json 删 viewType `sdysyhj.chatViewClassic`、命令 `sdysyhj.openChatClassic`、activationEvents 对应条目；② 删 `src/panel/chatPanel.ts`、`webview/main.ts`、`webview/render/**`、`webview/styles/**`、esbuild `media/main.js` 入口与产物；③ `src/panel/hostActions.ts` 留存（新 UI 继续消费，删除不涉）；④ 测试删除 ui-dual-panel 经典侧、ui-isolation 经典冻结断言与相关回归载体，回归清单去经典行；⑤ docs/README/CHANGELOG 同步。

**理由**：一致快照是 FR-AUI-08③「既有验收 + golden 回放 + 双面板一致兜底」三件套的兜底层；jsdom 双载体对比使「行为一致」字面可判定（两面板渲染同一 fixture 同一期望），不依赖肉眼对照。
**锚点**：FR-AUI-03④、FR-AUI-07③④、FR-AUI-08③、#19(c)。

#### D10 改动面与迁移顺序（含风险与回退）

**文件清单**：
- **移除**：`webview/lab/**`（12 文件：main.tsx/sliceA/sliceB/slice-a.measure/slice-b.measure/shell.tsx/store.ts/threadMessageLike.ts/lab.css/zod-jitless.ts 等——实现体平移扩容至 webview/ui 后原路径删）、`src/lab/**`（3 文件）、`test/unit/lab-route.test.ts`、`test/integration/lab-slice-a.test.ts`、依赖 `@assistant-ui/ai-sdk` + `ai`。
- **新增**：`webview/ui/`（main.tsx 入口 / shell.tsx（全壳：header+消息区+Composer+错误区）/ store.ts（reducer+delta 合批）/ threadMessageLike.ts（D2 全量映射）/ markdown.tsx（MarkdownTextPrimitive+hljs SyntaxHighlighter）/ toolCard.tsx / composer.tsx / fileRefTrigger.ts / zod-jitless.ts / chat.css）；`src/ui/chatViewProvider.ts`、`src/ui/chatController.ts`；`src/panel/hostActions.ts`；测试：`test/unit/ui-mapping|ui-store|ui-composer|ui-theme|ui-budget|ui-csp|ui-versions|ui-isolation.test.ts`、`test/integration/ui-golden-dom|ui-dual-panel|ui-xss.test.ts`。
- **修改**：`package.json`（contributes/依赖，D1/D7）、`package-lock.json`、`esbuild.mjs`（入口重定义）、`src/extension.ts`（注册接线反转：chatView→新 UI、chatViewClassic→经典、删 lab）、`src/panel/chatPanel.ts`（viewType 常量 + hostActions 委托）、`test/helpers/fake-pi-cli.js`（LAB-XSS 剧本改名 UI-XSS 并按需扩充，文件头锚点注释保留）、`.gitignore`（media/chat.* 构建产物）、`docs/technical-design.md`（本节 + FR 追溯表交付期）。
- **冻结零改动**：`src/bridge/**`、`src/panel/messages.ts`（协议零改动）、`webview/main.ts`、`webview/render/**`、`webview/styles/**`、esbuild 宿主与 main.js 入口参数。

**实施顺序**（每步可独立绿灯，判定面自第一天成立）：① 依赖 + 构建入口重定义（chat.js 空壳可构建、预算断言就位）→ ② store/映射扩容 + **ui-golden-dom E2E 骨架先行**（真实 runtime 消费断言从首个实现提交即存在）→ ③ 消息渲染（text/Markdown/高亮 → reasoning 折叠 → 工具卡）→ ④ Composer 全量 + 宿主协议全集（hostActions 提取与 chatPanel 委托同提交，回归全绿护航）→ ⑤ 跟随（D4）/头部/错误/toast/横幅 → ⑥ 主题五子条 + CSP/预算/版本门禁全绿 → ⑦ 切注册（chatView 换新 + chatViewClassic 上线 + lab 移除）→ ⑧ 双面板一致快照 + 回归重定向 + 全量 verify + 10 连跑稳定性。

**风险登记**：① FR-CHAT-09 跟随语义 React 等价性（useLayoutEffect 时序——回退 = 滚动执行补一次 rAF 锚定，语义不放宽）；② 高亮/Markdown 预算（react-markdown 链超预估——回退 = defer+代码分割，仍 ≤4 MiB；hljs common 已按 0.26 MiB 计入）；③ Composer 交互细节（IME isComposing、@ 防抖、命令菜单焦点保持——jsdom 部分可断言 + 真机 checklist）；④ `@assistant-ui/react-markdown 0.14.26` × react 19.3.1 × remark-gfm 4.0.1 实际构建兼容（实现期首步核验项，导出面已 tarball 核读）；⑤ Markdown defer 中间态跳过对 FR-CHAT-01「实时」观感（判据 = delta 级渲染存在性，defer 仅调优先级）。

**回退**：注册切换是原子开关（extension.ts 注册面单点）；用户自救 = `sdysyhj.openChatClassic` 公开命令全程可用；发版回退 = revert 切换提交即回经典默认（经典面板冻结断言保证回退可用，FR-AUI-05③④）；#D-06 相关代码已删除，无路线 A 残留。

**交付期预告（FR 追溯表）**：交付时 §10.1 FR-AUI-02/03/05/07/08 行更新为实现位置 + 回归索引，§4.1–4.5 各 FR 行「实现位置」补新 UI 载体（判定载体平移注记，FR-AUI-08①）；本阶段不写「已实现」。

#### 遗留上报（无需求歧义；供总调度知悉，不阻塞 1b）

1. **jsdom 基建引入 = 对「无 DOM 纪律」先例的有意偏离**（D8 理由已裁决选型；本条为透明度披露）：范围限 webview/ui 测试文件、devDependencies、不进产物。若总调度不采纳，替代口径 = 真实 runtime store/订阅层驱动 + DOM 层全 MANUAL——消费端覆盖显著变薄（#D-06 同类盲区部分回归），不推荐。
2. **实现期首步核验项**（设计期不装依赖，导出面已 tarball 核读）：react-markdown 0.14.26 × react 19.3.1 × remark-gfm/remark-breaks 构建兼容与表格/换行渲染实测（D2/D10 风险④）；若 remark-breaks 行为与旧 marked `breaks:true` 有可见差异，按「用户可见行为零回退」取齐并记设计偏差。
3. **ui-dual-panel 经典侧 jsdom 挂载**已预登记受控回退（D9）；如触发按设计偏差留痕。（交付注：未触发——经典侧 jsdom 挂载成功，双面板快照自动断言成立，无需降级。）

#### 切换批次交付小节（0.1.8，FR 追溯表 + 实现位置 + 回归索引）

**实现文件映射（D1–D10 逐条落实）**：D1 = `src/ui/chatViewProvider.ts`（vscode 薄壳，renderWebviewHtml strict CSP + retainContextWhenHidden:true）+ `src/ui/chatController.ts`（vscode-free 核心：事件泵 + WebviewToHost 全集，ready 回放 superset 对齐 chatPanel）+ `webview/ui/`（产物 `media/chat.js`/`chat.css`）；`src/panel/chatPanel.ts` 仅 viewType 常量（`sdysyhj.chatViewClassic`）+ hostActions 同名委托；lab 全移除（`src/lab/**`、`webview/lab/**`、viewType `sdysyhj.chatLabView`、命令 `sdysyhj.openChatLab`、依赖 `@assistant-ui/ai-sdk`/`ai`）；esbuild 三入口收敛 = 宿主 + `media/chat.js` + `media/main.js`（冻结）。D2 = `webview/ui/threadMessageLike.ts`（映射扩容）+ `markdown.tsx`（MarkdownTextPrimitive + remark-gfm 4.0.1/remark-breaks 4.0.0 + hljs common 36 语言渐进高亮（§11 #23 清单）+ DOMPurify sink）+ `toolCard.tsx`。D3 = `composer.tsx`（commandMenu/format 纯逻辑零改动复用 `webview/render/**`）+ `fileRefTrigger.ts` + `src/panel/hostActions.ts`（共享动作层，chatPanel 同名委托）。D4/D5 = `store.ts`（rAF 合批 EventBuffer + #16 就地覆盖/#17 被动保留两规则）+ `shell.tsx`（FollowState 零改动复用 + useLayoutEffect 决策点）；`src/bridge/**`/`src/panel/messages.ts` 零改动（宿主账本 §10.12 原样承载）。D6 = `chat.css` 五子条钉值（960px/8px/aria-label「发送」/禁头像/HH:mm）。D7 = package.json 依赖增删（全精确锁）+ `test/unit/ui-budget.test.ts` 门禁。D8/D9 = jsdom 测试组（下表）。

**回归重定向表（基线 218 unit / 45 integration；现 229 unit / 41 integration，断言无放宽）**：

| 原用例 | 处置 | 新用例 | 留痕 |
|---|---|---|---|
| `test/unit/lab-route.test.ts` | 删除（#D-06 随路线 A 关闭） | —— | 断言面（fetch 隧道帧）随路线 A 淘汰，无平移 |
| `test/integration/lab-slice-a.test.ts` | 删除（同上） | —— | 同上 |
| `test/unit/lab-store.test.ts` | 平移 | `test/unit/ui-store.test.ts` | ①–⑨ 断言平移 + 扩容（toolcall 链/#D-04 同语义/EventBuffer 合批/600 delta 零丢失） |
| `test/unit/lab-store-mapping.test.ts` | 平移 | `test/unit/ui-mapping.test.ts` | ①–⑤ 平移 + 扩容（result/isError/metadata.custom/空块滤除/user 仅 text/status 不注入） |
| `test/unit/lab-csp.test.ts` | 平移 | `test/unit/ui-csp.test.ts` | 八项指令断言平移（面改 chat.js/标题 Chat） |
| `test/unit/lab-theme.test.ts` | 平移 | `test/unit/ui-theme.test.ts` | ①–⑤ 平移（面改 chat.css）+ FR-CHAT-10 五子条钉值断言新增 |
| `test/unit/lab-budget.test.ts` | 平移 | `test/unit/ui-budget.test.ts` | 预算口径 3→4 MiB + 宿主增量 + 经典零 React 两项扩容 |
| `test/unit/lab-versions.test.ts` | 平移 | `test/unit/ui-versions.test.ts` | 锁定清单更新 + 删除项断言 + zod-jitless 源顺序面改 webview/ui |
| `test/unit/lab-isolation.test.ts` | 平移 | `test/unit/ui-isolation.test.ts` | 冻结面反转为经典面板断言 + 注册面改 chatView/chatViewClassic + XSS 扫描面改 webview/ui（sink 白名单） |
| `test/integration/lab-slice-b.test.ts` | 升格 | `test/integration/ui-golden-dom.test.ts` + `ui-xss.test.ts` | store 数据断言升格为真实 runtime DOM 断言（#D-06 制度化落点）+ XSS 探针升格可自动判定 |
| 保留零改动（unit 12 文件） | 保留 | commandMenu/format/followState/text/protocol/redact/config/jsonl/runtime/rpcClient/stderr-ordering/sessionStore/piBridge | 宿主零改动 = 用例零改动 |
| 保留零改动（integration 6 文件） | 保留 | golden-replay/user-echo/pi-bridge/defects-regression/rpc-client/runtime-resolve | 同上 |
| 新增 | —— | unit：ui-composer；integration（jsdom）：ui-golden-dom/ui-dual-panel/ui-xss | D8 清单齐备 |

**D7 预算门禁四项证据（实测）**：① 默认面板 `media/chat.js` = 1,000,004 字节 ≤ 4,194,304（23.8% 预算；含 react 链 + @assistant-ui 链 + react-markdown 链 + hljs common）；② 宿主 bundle = 104,249 字节，较 v0.1.7 基线 459,382 **净减 355,133 字节**（≤ +1 MiB；删 `ai`/chatRoute 链后远低于估算上界）；③ 经典面板 `media/main.js` metafile inputs 零 react/react-dom/@assistant-ui 命中（ui-budget③）；④ 全部依赖精确版本 + 删除项断言（ui-versions）。另 retainContextWhenHidden 注册断言（ui-isolation）。另 `@assistant-ui/vscode 0.0.1` 升级风险评估（FR-AUI-05① 留痕）：0.0.x breaking 面 = renderWebviewHtml/serve 接口与 CSP 模板；升级流程 = 精确锁 + ui-csp/ui-budget 回归锁定模板与产物；退出流程 = 版本回退即回旧模板（HTML 由该包生成，无本地分叉）。

**实现期首步兼容实测结论（预登记核验项）**：react-markdown 0.14.26 × react 19.3.1 × remark-gfm 4.0.1 / remark-breaks 4.0.0 构建兼容**成立**（tsc strict 零错 + esbuild iife/es2020/jsx automatic/minify 构建过 + 运行时导出面验证）；breaks 行为 = 单换行→`<br>`，与旧 marked `breaks:true` 语义一致；GFM 表格/删除线/任务列表渲染一致（仅序列化差异 `<br/>`/类名，非用户可见差异）。无需 D2 备注处置。

**设计偏差清单**：① **无功能偏差**。② 实现口径注记：raw-HTML 降级为文本节点（`markdown.tsx` `remarkRawHtmlAsText`）——D2 XSS 口径「无 raw HTML 通道 + 探针文本逐字为文本节点」的实现机制（react-markdown 默认丢弃 raw HTML 会使探针文本丢失、违反 FR-CHAT-11④ 文本保真；降级为文本节点同时满足保真与安全，MarkdownTextPrimitive 构造性转义呈现）；旧面板同场景经 DOMPurify 丢弃 script 内容，本实现按 D2 钉死的断言口径呈现原文，属安全面收紧。③ `MarkdownText` 取 `smooth={false}`（对齐旧面板无打字动画口径）。④ 新增工程文件 `vitest.config.ts`（'vscode' 模块测试桩 alias，承载 D9 经典侧 chatPanel HTML 模板提取；devDeps 不进产物）——研发角色工程文件权限矩阵覆盖，任务书枚举未含，披露留痕。⑤ jsdom 测试基建 = D8 已批准选型（jsdom 31.0.1 / @testing-library/react 16.3.3 / @testing-library/dom 10.4.2，均 devDeps）。

**自测计数**：`npm run typecheck` 0 错；`npm run build` 三入口（dist/extension.js + media/chat.js + media/main.js）全出；`verify:unit` 21 文件 229 用例 ✅；`verify:integration` 9 文件 41 用例 ✅；时序断言并行负载 10 连跑（unit ∥ integration 并发）全绿。

---

### 10.15 TASK-011 批次 A 项设计记录（聊天界面还原自研实现 + assistant-ui 框架整体移除，需求基线 v0.8 §4.6 废止注记）

> 来源：人类指令（2026-11-27）「还原聊天界面为我们自己编写的版本，去掉外部引入的框架」（任务单 docs/tasks/TASK-011-ui-revert-feature-batch.md 批次 A 项）。需求基线 v0.8：§4.6 FR-AUI 系列条目整体废止；§4 头部 v0.8 还原注记——§4.1–§4.5 判定载体 0.1.10 起回归自研经典实现，验收标准文本与语义不变。**本节为还原实现记录；§10.13/§10.14 全部 FR-AUI 实现行与交付小节随批次转为历史留痕（不再判定）**。

#### A1 还原面（wiring 单面板化，v0.1.6 时代形态）

- **回归点**：`src/panel/chatPanel.ts` `viewType` 回迁 `sdysyhj.chatView`（唯一聊天面板 = 自研经典实现，ChatPanel 构造器自注册 + `retainContextWhenHidden: true` 不变）；`src/extension.ts` 回归单面板接线（新 UI ChatViewProvider/ChatController 拆除，命令入口 openChat/newSession/showHistory/renameSession/switchModel/switchThinking/sendToPi 全部指向 ChatPanel，与 v0.1.6 同形）；`package.json` contributes 双轨收敛（views 仅 `sdysyhj.chatView`「Chat」；`chatViewClassic` 视图与 `sdysyhj.openChatClassic` 命令、`onView:sdysyhj.chatViewClassic` activation 移除；既有 9 命令 + 5 配置零变更——对外契约零变更）。历史参考 = v0.1.6 tag wiring（只读核对）。
- **拆除面**：`webview/ui/**`（React 新 UI 全部源码）与 `src/ui/**`（chatViewProvider 薄壳 + chatController vscode-free 面板核心）删除；`esbuild.mjs` 第三入口（jsx automatic + NODE_ENV define + minify 的 React 构建链）拆除，回归宿主 + 经典面板双入口。
- **冻结面（行为零变化）**：经典实现 `webview/main.ts` + `webview/render/**` + `webview/styles/styles.css` 与 CSP meta 模板（`default-src 'none'` + `script-src` 仅 nonce，无 `unsafe-eval`——CSP 不降级，ui-isolation③ 冻结断言）零改动；`src/panel/hostActions.ts`（TASK-009 D3 机械提取的 vscode 交互动作层）保留为 ChatPanel 独家消费，同名委托零变化。

#### A2 依赖清理（grep 实证消费方为零后删除）

| 处置 | 依赖 | grep 证据（移除前唯一消费方） |
|---|---|---|
| 删除 | `@assistant-ui/react`、`@assistant-ui/react-markdown`、`@assistant-ui/vscode` | `webview/ui/{threadMessageLike,toolCard,composer,shell,markdown}.tsx`、`src/ui/chatViewProvider.ts`、`test/unit/ui-csp.test.ts`/`ui-theme.test.ts`（均随 A 项删除） |
| 删除 | `react`、`react-dom`、`@types/react`、`@types/react-dom` | `webview/ui/*.tsx` + 新 UI 集成测试（均随 A 项删除）；经典实现与宿主零引用 |
| 删除 | `remark-gfm`、`remark-breaks`（R-01 ×2 重复键随删消除） | `webview/ui/markdown.tsx`（随 A 项删除）；经典 Markdown = marked `gfm:true, breaks:true`（内置，无 remark 依赖） |
| 删除 | `zod` | `webview/ui/zod-jitless.ts`（随 A 项删除）；v0.1.6 时代本无 zod，src/webview/test 零其他引用 |
| 删除 | `@testing-library/react`、`@testing-library/dom` | 新 UI React 组件渲染测试（随 A 项删除）；经典面板 DOM 断言用原生 querySelector + 自带 waitFor |
| 去重保留 | `jsdom`（R-01 ×2 重复键去重为单条） | 经典面板 golden DOM 集成测试环境（`@vitest-environment jsdom`） |
| 保留 | `marked` / `highlight.js` / `dompurify` / `@earendil-works/pi-coding-agent` | 经典实现 `webview/render/markdown.ts`、`webview/main.ts`、宿主运行时（冻结，严禁误删） |

package-lock.json 同步（`npm install --package-lock-only`，离线剪枝；`npm ci` 一致性复验）。门禁 = `test/unit/ui-versions.test.ts`（还原后依赖表同步 + 新 UI 依赖族删除断言 + R-01 重复键消除断言）。

#### A3 测试外科（判定载体回经典面板）

| 处置 | 用例 | 说明 |
|---|---|---|
| 删除 | `test/unit/ui-store.test.ts`、`ui-composer.test.ts`、`ui-mapping.test.ts`、`ui-theme.test.ts`、`ui-csp.test.ts` | 新 UI 专属（store/composer/fileRefTrigger/threadMessageLike 映射/theme.css 审计/@assistant-ui host CSP），对象随源码删除 |
| 删除 | `test/integration/ui-dual-panel.test.ts`、`test/integration/ui-xss.test.ts`；`test/helpers/ui-harness.tsx`；`test/fixtures/vscode-theme-defaults-palette.json` | 双面板一致快照（双轨注册不存在）、React runtime XSS 探针（React 渲染链不存在）、React 测试机架与主题 fixture（无消费方） |
| 回经典版 | `test/integration/ui-golden-dom.test.ts` | 判定对象改回经典面板：机架 = 原 ui-dual-panel 经典侧链路（ChatPanel 真实 `resolveWebviewView`/`onDidReceiveMessage` 消息路由 + `media/main.js` 冻结 bundle 原样 eval + jsdom window MessageEvent）；断言面 = golden 回放消息条数/文本、FR-CHAT-11 user 气泡三判定时点恒单条、HH:mm 时间戳、TOOL 剧本工具卡/thinking 折叠 |
| 同步 | `test/unit/ui-versions.test.ts`（A2 门禁）、`test/unit/ui-isolation.test.ts`（单面板结构/冻结面/框架移除残留扫描/esbuild 双入口）、`test/unit/ui-budget.test.ts`（原① chat.js 预算随入口删除；保留宿主增量 + 经典零框架两项） | 门禁依赖表与结构断言随还原同步，无放宽 |
| 保留零改动 | 经典面板测试全集：unit（commandMenu/followState/format/…12 文件）+ integration（golden-replay/user-echo/defects-regression/pi-bridge/rpc-client/runtime-resolve） | 宿主与经典实现零改动 = 用例零改动 |

#### A4 交付证据（四门禁 + 零残留 + 体积对比，2026-11-27 实测）

- **四门禁**：`npm run typecheck` 0 错；`npm run build` 双入口全出；`npm run verify:unit` 16 文件 185 用例 ✅；`npm run verify:integration` 7 文件 39 用例 ✅（含经典面板 golden DOM 回放 3 用例）。
- **零残留**：`src/**`、`webview/**`、`esbuild.mjs`、`package.json` grep 零 `@assistant-ui` / `webview/ui` 引用（ui-isolation⑤ 结构化断言固化；残留面仅历史文档留痕）。
- **体积对比（还原前 HEAD vs 还原后，同参构建）**：webview JS 产物 1,587,511 B（main.js 586,752 + chat.js 1,000,759）→ 586,752 B（**净减 1,000,759 B，−63.1%**，React 链整体退场）；宿主 `dist/extension.js` 104,278 B → 92,366 B（−11,912 B，新 UI 宿主薄壳/控制器拆除）；经典面板 `media/main.js`/`main.css` 字节不变（实现零改动）。
- **CSP 不降级**：经典面板 CSP meta 模板逐字冻结（ui-isolation③；`default-src 'none'` + `script-src` 仅 nonce + 无 `unsafe-eval`），较新 UI 时代的差异仅 style-src（经典为 cspSource + `'unsafe-inline'` 样式白名单，v0.1.6 以来冻结值）与 img-src 允许 https: 远程图——均属经典实现历史口径，本次零改动零放宽。

---

## 11. 外部契约依赖清单（规范 §6 必填项，2026-11-21 新建）

> 本节登记本设计依赖的全部外部系统行为：外部系统 → 权威文档路径 + 版本锚定 → 关键行为章节/行号 → 我方依赖的行为 → 对应设计章节。供测试 Agent 用例锚点引用与审批点 1b 审查；设计中的事件流/接口契约须与本清单一致。**版本锚定：pi 1.5.2**（`pi --version`；依赖包随附文档，路径 = `node_modules/@earendil-works/pi-coding-agent/docs/`，绝对路径示例 `/home/connor/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/`）。**TASK-009 阶段①起增列 @assistant-ui 生态条目 #11–#18**（版本锚定 2026-11-21 registry/仓库实测，设计依据见 §10.13）；**TASK-009 切换批次增列 #19–#23**（版本锚定 2026-11-22 registry/npm tarball/随包源码实测，设计依据见 §10.14；#1–#10 仍为 pi 1.5.2 契约）。

| # | 外部系统 / 行为 | 权威文档（pi 1.5.2 随附） | 关键章节 / 行号 | 我方依赖的行为（一句话） | 对应设计章节 |
|---|---|---|---|---|---|
| 1 | RPC 事件序列（user 回声） | `docs/json.md` | 「Event sequence」L30–46；「Message events」L66–68 | pi 对每条到达模型的用户消息必回发 user `message_start`/`message_end`（先于该轮助手消息）；`message_end.message` 为权威终稿 | §1 RPC 协议要点、§4.1、§10.12 D1/D2 |
| 2 | RPC 生命周期与 disposition | `docs/rpc.md` | 「Run lifecycle」L60–71；L33（stdout 事件以 json.md 为准）；Reference L139 | prompt 响应只代表受理（started/queued/handled）；`handled` 无 run 不等 settled；完成判定以 `agent_settled` 为准（`agent_end` 后 steer/follow-up/重试仍可继续） | §3.2、§4.1、§10.12 D3 |
| 3 | `prompt` 命令 | `docs/rpc-commands.md` | 「Prompting › prompt」L7–42 | disposition = started/queued/handled；`success:false` 为受理前拒绝（无后续事件）；skill/prompt-template 在发送/入队前展开；扩展命令流式中也立即执行 | §4.1、§10.12 D2/D3 |
| 4 | `steer` 命令 | `docs/rpc-commands.md` | L46–68 | run 中排队，当前助手轮工具执行完后、下一次 LLM 调用前注入；可被 input handler 消费为 `handled`（无回声）；skill/template 入队前展开 | §1、§10.12 D2/D3 |
| 5 | `follow_up` 命令 | `docs/rpc-commands.md` | L70–92 | 仅 agent 停下后注入（与 steer 注入时序不同→回声可能乱序）；`handled`/展开语义同 steer | §1、§10.12 D2 |
| 6 | `clear_queue` / `set_steering_mode` / `set_follow_up_mode` | `docs/rpc-commands.md` | clear_queue L107–128；set_steering_mode L331–345；set_follow_up_mode L348–360 | 清空队列并返回文本；abort 后队列保留、后续 prompt 会继续投递（L128）；投递模式 all/one-at-a-time（默认逐条）。本插件未调用这三命令，但队列快照与残留清理须兼容其效果 | §10.12 D2/D3 |
| 7 | 消息生命周期事件覆盖面 | `docs/extensions.md` | L752–770（message_start / message_update / message_end） | `message_start`/`message_end` 对 user/assistant/toolResult/custom 每类消息均触发；扩展可经 `custom_message` 注入 user 角色消息（不经本插件发送） | §10.12 D2（回声覆盖面）、D4（合法追加场景） |
| 8 | 队列事件 | `docs/json.md` | 「Queue and state events」L121–122 | `queue_update` 携带完整当前 steering/followUp 队列（含展开后文本），入队/投递/清除均触发 | §10.12 D2（快照绑定与残留清理） |
| 9 | JSONL 帧约定 | `docs/json.md` + `docs/rpc.md` | json.md「Framing and process I/O」L12–20；rpc.md「Framing」 | 严格 LF 切分（U+2028/29 非行界）、stdout 持续消费、stdout 仅 JSONL、诊断走 stderr | §1、§3.3 |
| 10 | 离线 provider 配置（仅 golden fixture 录制用） | `docs/models.md` + `docs/environment-variables.md` | models.md「Configure a compatible endpoint」L49–66；environment-variables.md L81–82 | `models.json` 可定义 OpenAI 兼容 provider（`baseUrl`+`api`+dummy `apiKey`）指向本地 mock；`PI_CODING_AGENT_DIR`/`PI_CODING_AGENT_SESSION_DIR` 可隔离配置与会话目录 | §6、§10.12 D8 |
| 11 | `@assistant-ui/vscode@0.0.1` 宿主/桥接行为 | npm README（随包发布；`npm view @assistant-ui/vscode@0.0.1 readme`；仓库 packages/vscode@0.0.1） | 「Entry points」（host 不 import vscode）；「Extension host」（serveWebviewRoutes/serveWebviewHost、404/405/500、abort 传播、dispose 拒绝在途、非路由 origin TypeError）；「Webview」（vscodeFetch、页面重载中止旧请求）；「Webview HTML and Content Security Policy」（strict 模板全文、`'unsafe-eval'` never added、relaxed 选项）；「Theme」（shadcn token→`--vscode-*` 映射、surface 属性） | 宿主 route handler `(req)=>Response` 形态、流式回传、abort/reset 语义、CSP 模板与主题变量映射 | §10.13 D2/D5/D6 |
| 12 | `@assistant-ui/vscode@0.0.1` 源码级协议/路由器 | npm tarball `src/`+`dist/`（registry.npmjs.org/@assistant-ui/vscode/-/vscode-0.0.1.tgz，dist shasum 76d9adbd，2026-11-21 核读） | `src/protocol.ts`（channel `"aui-vscode"`、虚拟 origin `https://webview.vscode.invalid`、`fetch:*`/`rpc:*` 帧型与校验器）；`src/host/router.ts`（`RouteHandler=(request:Request)=>Response\|Promise<Response>`、flushInterval 16ms/flushSize 64KB、in-flight abort、404/405/500）；`src/host/serve.ts`（serveWebviewHost、storage/openExternal、externalSchemes 默认 http/https/mailto）；`src/host/html.ts`（createWebviewCsp 指令集逐字、renderWebviewHtml 选项）；`src/webview/fetch.ts`（`createVSCodeFetch(port)` 可注入 port、abort→`fetch:abort`） | 隧道两端消息形状、注入式 fetch 的可测面、CSP 指令集精确值、abort 链路 | §10.13 D2/D5/D8 |
| 13 | 官方 VS Code 集成指南 | https://www.assistant-ui.com/docs/guides/vscode（canonical .md） | 「How it works」；「Add to an existing extension」步骤 1–4（**zod-jitless 片段** `config({jitless:true})` 须最先导入、`process.env.NODE_ENV` define、esbuild 双构建示例）；「Follow the VS Code theme」；「Content Security Policy」（**"The bridge needs no connect-src entry, because it does not use the network"**）；「Runtimes」（useChatRuntime+AssistantChatTransport 唯一可过桥）；「Testing」（examples/with-vscode、@vscode/test-electron、Linux xvfb-run）；「Hidden views」（retainContextWhenHidden: true） | zod jitless 前置、构建约束、隧道无需 connect-src、retainContextWhenHidden、官方测试床模式 | §10.13 D2/D5/D6/D8 |
| 14 | `@assistant-ui/react@0.15.37`（ExternalStoreRuntime / ThreadMessageLike / 无头原语；类型面经 `@assistant-ui/core@0.3.37`） | npm tarball `dist/*.d.ts`（`ThreadMessageLike` re-export 自 core）+ 官方文档 https://www.assistant-ui.com/docs/runtimes/custom/external-store 与 /docs/api-reference/external-store/message-conversion | 「Quickstart」「Handler matrix」（onNew 必需、onCancel→取消、setMessages→分支…）「Streaming responses」（**原地变更 assistant 消息**）「Message conversion」（convertMessage/useExternalMessageConverter/joinStrategy）；类型：`ThreadMessageLike={role:"assistant"\|"user"\|"system"; content:string\|readonly ThreadMessageLikePart[]; id?; createdAt?; …}`、part 型 `text`/`reasoning`/`tool-call`（core `dist/types/message.d.ts`、`dist/runtime/utils/thread-message-like.d.ts`）；`ThreadPrimitive`/`ComposerPrimitive` 由 react 包导出（`dist/index.d.ts`） | 路线 B 映射与运行时接线契约（消息形状、流式口径、handler 能力矩阵） | §10.13 D3/D8 |
| 15 | react 19.3.1 / react-dom 19.3.1（+ @types/react、@types/react-dom 19.3.0） | npm registry（精确版 2026-11-21 核实）；React 官方文档 react.dev | React 文档「Rendering the DOM」/「JSX Prevents Injection Attacks」（字符串 children 进文本节点，构造性转义）；peer 要求 `react ^18\|\|^19`（@assistant-ui/react@0.15.37 peerDeps；@assistant-ui/vscode devDeps react ^19.3.1 实证 19 线为上游测试主线） | XSS 探针依据、版本锁定与 18/19 线选择 | §10.13 D5/D6 |
| 16 | 官方测试床 examples/with-vscode | github.com/assistant-ui/assistant-ui（main 分支：examples/with-vscode） | `src/fixtures/route.ts`（`ai` `createUIMessageStream`/`createUIMessageStreamResponse`；帧型 start-step/text-start/text-delta/text-end/reasoning-*/tool-input-available/tool-output-*/source-url/file/data-*/error/finish-step；`req.signal` 中止观测）；`src/fixtures/request.ts`（ChatRequest 解析：取最后 user 消息）；`src/webviews.ts`（renderWebviewHtml scriptType classic + bodyAttributes boot + serveWebviewHost 接线）；`webview/zod-jitless.ts`；`test/`（@vscode/test-electron probes 模式，Readiness 视图跑 fetch bridge/abort/CSP/theme 等探针） | 路线 A 帧协议与请求解析权威样例、宿主接线形态、测试床参照 | §10.13 D2/D7/D8 |
| 17 | `ai@7.0.153`（UIMessage 流写入器） | npm（@assistant-ui/vscode devDeps `ai ^7.0.153` 实证；满足 @assistant-ui/ai-sdk peer `^7.0.101`） | `createUIMessageStream`/`createUIMessageStreamResponse`（官方测试床 fixtures/route.ts 实证用法）＝ AssistantChatTransport 消费协议的生产侧 | 路线 A Response 构造（帧写入器） | §10.13 D2/D6 |
| 18 | VS Code 默认主题调色板（FR-AUI-04 主题审计 fixture 基值） | github.com/microsoft/vscode `extensions/theme-defaults/themes/dark_modern.json` / `light_modern.json`（随 VS Code 发布；采样用 `--vscode-*` 基值快照入库 `test/fixtures/` 并注明来源+版本） | 主题 JSON `colors` 表 | `--vscode-*` 变量在浅/深主题的具体取值来源（审计脚本代入 token 链计算联动差异与 WCAG 对比度） | §10.13 D8 |
| 19 | `@assistant-ui/react-markdown@0.14.26`（Markdown 渲染组件） | npm tarball 全量导出面（registry.npmjs.org/@assistant-ui/react-markdown/-/react-markdown-0.14.26.tgz，2026-11-22 核读） | `dist/index.d.ts`：`MarkdownTextPrimitive`（props = react-markdown `Options` 减 components/children + `components.SyntaxHighlighter/CodeHeader` + `componentsByLanguage` + `smooth` + `defer`（useDeferredValue 渐进解析：流式中间态可跳过、终稿必渲染）+ `preprocess`）；`dist/code-fence.d.ts`：`SyntaxHighlighterProps={node, components:{Pre,Code}, language, code}`、`CodeHeaderProps`、`parseLanguageClass`；依赖 `react-markdown ^10.1.0`（**无 Shiki**——Shiki 仅经 `@assistant-ui/react-streamdown` 引入，本设计不引入该包）；peer `react ^18\|\|^19`、`@assistant-ui/react ^0.15.0` | 文本 part 的 Markdown 渲染与代码高亮挂接契约（SyntaxHighlighter 插槽、defer 渐进解析） | §10.14 D2/D7 |
| 20 | `react-markdown@10.1.0` + `remark-gfm@4.0.1` + `remark-breaks@4.0.0`（Markdown 解析链） | npm registry（版本核值 2026-11-22）；react-markdown README | react-markdown：**不解析 raw HTML**（rehype-raw 未引入即无 HTML 注入通道，字符串 children 构造性转义）；默认 `urlTransform` 过滤危险协议（javascript: 等）；`remarkPlugins` 挂载面。remark-gfm：GFM 表格/删除线/任务列表（FR-CHAT-02 表格要素）。remark-breaks：单换行 → `<br>`（对齐旧 marked `breaks:true` 行为） | XSS 口径（NFR-03）；FR-CHAT-02 全要素（表格/换行）等价依据 | §10.14 D2 |
| 21 | `@assistant-ui/core@0.3.37` `fromThreadMessageLike` 消费契约（实现级，#D-06 消费端契约直接锚点） | node_modules 随包 `dist/runtime/utils/thread-message-like.js`（2026-11-22 核读；同 #12 tarball 源码级先例） | assistant role：`status` 仅 assistant 合法（user 带 status **throw**）；空/纯空白 text part **丢弃**、reasoning 同；tool-call 展开保留 `result`/`isError`/`argsText`（args 由 argsText `parsePartialJsonObject`）；`metadata.custom` 透传（`custom: metadata?.custom ?? {}`）；user role 的 tool-call/reasoning part **throw**；`createdAt` 缺省 `new Date()` | 映射扩容的字段保真契约（工具卡数据经 result 透传、aborted/errorMessage 经 metadata.custom、空文本不建块、status 不注入）；真实 runtime 消费测试的期望锚点 | §10.14 D2/D5/D8 |
| 22 | `@assistant-ui/core` Composer/ExternalStore 运行时接口面 | node_modules 随包 `dist/runtime/api/composer-runtime.d.ts`、`dist/runtimes/external-store/external-store-adapter.d.ts`（2026-11-22 核读） | `ComposerRuntime.setText(text, options?)`（composer-runtime.d.ts L92/L169，ComposerSetTextOptions）；ExternalStoreAdapter：`convertMessage` L51、`onNew(message: AppendMessage)` L164、`onCancel` L182、`isRunning` L67（isRunning→thread.isRunning 直通） | Composer 文本注入（file_ref 光标插入 / input_prefill 预填）与发送/取消 handler 契约 | §10.14 D3/D5 |
| 23 | highlight.js 11.12.0 `lib/common` 语言集（FR-CHAT-02 高亮语言集定值来源） | node_modules 随包 `lib/common.js` `registerLanguage` 清单（2026-11-22 核读；既有依赖零新增） | 36 语言：bash, c, cpp, csharp, css, diff, go, graphql, ini, java, javascript, json, kotlin, less, lua, makefile, markdown, objectivec, perl, php, php-template, plaintext, python, python-repl, r, ruby, rust, scss, shell, sql, swift, typescript, vbnet, wasm, xml, yaml | #19(a) 附注「高亮语言集不得窄于旧实现 highlight.js common」的定值清单（= 旧实现同一注册集，同集平移零回归） | §10.14 D2/D7 |

---

*本文档为技术基线，架构变更需重新评审。*

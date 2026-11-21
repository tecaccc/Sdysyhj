# Sdysyhj 技术方案

> Sdysyhj（山巅一石一壶酒）— Pi Agent for VS Code
>
> 状态：**已实现（MVP）**；TASK-008（FR-CHAT-11 用户消息单次展示）设计修订已落档、实现待交付（§10.12） ｜ 版本：v0.5 ｜ 对应需求：docs/requirements.md v0.5（2026-11-21 冻结）｜ 修订日期：2026-11-21

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
> 状态：**设计阶段（审批点 1b 待裁决）**——实现、自测与 FR 追溯表 FR-CHAT-11 行随实现交付补齐（D10）；本节每个设计问题给出唯一决策、理由与锚点。

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
  - **残留清理**（确定性事件点）：`agent_settled` 时取最近 `queue_update` 快照：未消费且 `queuedText` 仍在队列 → 保留（abort 后队列保留、后续 prompt 继续投递，rpc-commands.md L126）；未消费、已不在队列且从未收到回声 → 终结（保留单条乐观展示，出账不再参与匹配）。会话切换/刷新重建后，未消费且仍入队的条目按发送序回填到重建列表尾部。
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

## 11. 外部契约依赖清单（规范 §6 必填项，2026-11-21 新建）

> 本节登记本设计依赖的全部外部系统行为：外部系统 → 权威文档路径 + 版本锚定 → 关键行为章节/行号 → 我方依赖的行为 → 对应设计章节。供测试 Agent 用例锚点引用与审批点 1b 审查；设计中的事件流/接口契约须与本清单一致。**版本锚定：pi 1.5.2**（`pi --version`；依赖包随附文档，路径 = `node_modules/@earendil-works/pi-coding-agent/docs/`，绝对路径示例 `/home/connor/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/`）。

| # | 外部系统 / 行为 | 权威文档（pi 1.5.2 随附） | 关键章节 / 行号 | 我方依赖的行为（一句话） | 对应设计章节 |
|---|---|---|---|---|---|
| 1 | RPC 事件序列（user 回声） | `docs/json.md` | 「Event sequence」L30–46；「Message events」L66–68 | pi 对每条到达模型的用户消息必回发 user `message_start`/`message_end`（先于该轮助手消息）；`message_end.message` 为权威终稿 | §1 RPC 协议要点、§4.1、§10.12 D1/D2 |
| 2 | RPC 生命周期与 disposition | `docs/rpc.md` | 「Run lifecycle」L60–71；L33（stdout 事件以 json.md 为准）；Reference L139 | prompt 响应只代表受理（started/queued/handled）；`handled` 无 run 不等 settled；完成判定以 `agent_settled` 为准（`agent_end` 后 steer/follow-up/重试仍可继续） | §3.2、§4.1、§10.12 D3 |
| 3 | `prompt` 命令 | `docs/rpc-commands.md` | 「Prompting › prompt」L7–42 | disposition = started/queued/handled；`success:false` 为受理前拒绝（无后续事件）；skill/prompt-template 在发送/入队前展开；扩展命令流式中也立即执行 | §4.1、§10.12 D2/D3 |
| 4 | `steer` 命令 | `docs/rpc-commands.md` | L46–68 | run 中排队，当前助手轮工具执行完后、下一次 LLM 调用前注入；可被 input handler 消费为 `handled`（无回声）；skill/template 入队前展开 | §1、§10.12 D2/D3 |
| 5 | `follow_up` 命令 | `docs/rpc-commands.md` | L70–92 | 仅 agent 停下后注入（与 steer 注入时序不同→回声可能乱序）；`handled`/展开语义同 steer | §1、§10.12 D2 |
| 6 | `clear_queue` / `set_steering_mode` / `set_follow_up_mode` | `docs/rpc-commands.md` | clear_queue L107–128；set_steering_mode L331–345；set_follow_up_mode L348–360 | 清空队列并返回文本；abort 后队列保留、后续 prompt 会继续投递（L126）；投递模式 all/one-at-a-time（默认逐条）。本插件未调用这三命令，但队列快照与残留清理须兼容其效果 | §10.12 D2/D3 |
| 7 | 消息生命周期事件覆盖面 | `docs/extensions.md` | L752–770（message_start / message_update / message_end） | `message_start`/`message_end` 对 user/assistant/toolResult/custom 每类消息均触发；扩展可经 `custom_message` 注入 user 角色消息（不经本插件发送） | §10.12 D2（回声覆盖面）、D4（合法追加场景） |
| 8 | 队列事件 | `docs/json.md` | 「Queue and state events」L121–122 | `queue_update` 携带完整当前 steering/followUp 队列（含展开后文本），入队/投递/清除均触发 | §10.12 D2（快照绑定与残留清理） |
| 9 | JSONL 帧约定 | `docs/json.md` + `docs/rpc.md` | json.md「Framing and process I/O」L12–20；rpc.md「Framing」 | 严格 LF 切分（U+2028/29 非行界）、stdout 持续消费、stdout 仅 JSONL、诊断走 stderr | §1、§3.3 |
| 10 | 离线 provider 配置（仅 golden fixture 录制用） | `docs/models.md` + `docs/environment-variables.md` | models.md「Configure a compatible endpoint」L49–66；environment-variables.md L81–82 | `models.json` 可定义 OpenAI 兼容 provider（`baseUrl`+`api`+dummy `apiKey`）指向本地 mock；`PI_CODING_AGENT_DIR`/`PI_CODING_AGENT_SESSION_DIR` 可隔离配置与会话目录 | §6、§10.12 D8 |

---

*本文档为技术基线，架构变更需重新评审。*

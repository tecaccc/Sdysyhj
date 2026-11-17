# Sdysyhj（山巅一石一壶酒）— Pi Agent for VS Code

将 Pi 编程智能体带入 VS Code 的聊天式编程插件：在编辑器内以自然语言完成代码阅读、编写、重构与命令执行，与 pi 共享同一套会话、配置与凭证（`~/.pi/agent/`）。

## 功能

- **流式对话**：text delta 级实时渲染，Markdown（标题/列表/表格/代码高亮/链接），渲染内容经 DOMPurify 消毒
- **thinking 折叠**：思考过程默认折叠，展开后流式显示
- **工具调用卡片**：工具名、关键参数摘要、执行状态（进行中/成功/失败/已中止），可展开输入/输出；大输出截断保留尾部，一键"复制全部"
- **运行控制**：Stop 中止（RPC `abort`）、运行中 steer / follow-up 插话切换
- **会话管理**：新建 / 历史列表（标题、时间、消息数）/ 切换恢复（含压缩状态，pi 侧权威管理）/ 重命名；外部修改检测提示刷新
- **模型控制**：切换模型与 thinking 等级，随会话持久，重启后状态栏反映
- **@file 引用**：输入框输入 `@` 触发工作区文件选择器；资源管理器/编辑器右键"发送到 Pi"
- **运行时来源**：PATH 有 pi 优先使用；否则自动回退插件内置运行时（免安装、开箱即用）；可显式指定 pi 路径
- **排障**：Output Channel「Sdysyhj」记录子进程 stderr 与协议异常（日志自动脱敏，不落凭证）

## 命令

| 命令 | 说明 |
|---|---|
| Sdysyhj: Open Chat | 打开聊天面板 |
| Sdysyhj: New Session | 新建会话（旧会话落盘保留） |
| Sdysyhj: Abort | 中止当前运行 |
| Sdysyhj: Show Session History | 会话历史列表（点击切换） |
| Sdysyhj: Rename Session | 会话命名 |
| Sdysyhj: Switch Model / Switch Thinking Level | 切换模型 / thinking 等级 |
| Sdysyhj: Send to Pi | 右键发送文件路径或选区作为 prompt 素材 |
| Sdysyhj: Report Issue | 反馈问题 |

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `sdysyhj.piRuntime` | `auto` | `auto` / `path` / `bundled`，见上"运行时来源" |
| `sdysyhj.piPath` | `""` | 显式指定 pi 可执行文件路径 |
| `sdysyhj.thinkingDefault` | `""` | 新会话默认 thinking 等级（空=继承 pi 设置） |
| `sdysyhj.outputTailLines` | `200` | 工具输出卡片保留尾部行数 |
| `sdysyhj.sendMode` | `steer` | 运行中默认插话模式（steer / followUp） |

provider / 模型 / api-key / MCP / skills 一律复用 pi 自身配置（`~/.pi/agent/`、`pi auth`、`pi config`）。

## 开发

```bash
npm install
npm run build            # esbuild 打包（dist/extension.js + media/main.js）
npm run typecheck        # tsc --noEmit
npm run verify:unit      # 单元测试（Vitest）
npm run verify:integration  # 集成测试（mock 子进程，离线可重跑）
```

集成测试使用 `test/helpers/fake-pi-cli.js` 模拟 `pi --mode rpc` 子进程，不依赖真实 API key 或网络。

## 架构

```
Webview（聊天 UI）⇄ ChatPanel ⇄ PiBridge（状态机/事件翻译）⇄ RpcClient（JSONL RPC）⇄ pi --mode rpc（子进程）
```

- RPC 协议严格 JSONL（LF 切分，禁用 readline）；事件流 `message_update` → `message_end`（权威终稿）→ `agent_settled`
- pi 运行时来源：PATH pi（须 ≥ 最低支持版本 0.84.0）→ 内置 `@earendil-works/pi-coding-agent`（`dist/bundle/cli.js`）
- 会话数据只存 pi 原生位置（`~/.pi/agent/sessions/`），插件不另建副本

详见 `docs/requirements.md`（需求基线）与 `docs/technical-design.md`（技术基线 + FR 追溯表）。

## 兼容性

VS Code ≥ 1.85；Windows / macOS / Linux（Node 运行时随 VS Code）。

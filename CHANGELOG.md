# Changelog

## 0.1.1 — 缺陷修复批次（Issue #1）

- 修复会话外部修改检测误报（#D-01，Issue #1）：发送第二条消息时，插件自身 pi 子进程的合法写入被误判为"会话在插件之外被修改"并遭拦截——改为本端写入三重豁免：`entry_appended` 事件即时同步基线、运行中（starting/streaming）挂起检测只吸收不报警、回空闲恢复并重置基线
- 修复全新会话外部修改检测失效（#D-02，漏报方向）：首轮结束后补学会话文件路径，恢复跟踪与检出能力
- 核验：`docs/verification/report-e084223.md`（hotfix 范围 PASS；含预修复提交阴性对照双臂验证；压测 6/6）

## 0.1.0 — MVP

首个可用版本（对应 docs/requirements.md v0.2）：

- 聊天：流式对话、Markdown 渲染（高亮 + 消毒）、thinking 折叠、工具调用卡片（状态/展开/大输出截断+复制全部）、中止、steer/follow-up 插话、错误展示、状态栏（模型/thinking/运行状态/会话名）
- 会话：新建、历史列表、切换恢复（含压缩状态）、命名、单会话工作模式、外部修改检测提示
- 文件：工作区绑定（多根取第一个）、@file 引用、右键"发送到 Pi"
- 模型：切换模型 / thinking 等级，随会话持久
- 命令面板：Open Chat / New Session / Abort / Show Session History / Report Issue 等；Output Channel 日志（脱敏）
- pi 运行时来源：PATH 优先 / 内置运行时回退 / 显式指定（含可行动错误指引）
- 稳定性：子进程崩溃自动重启一次并提示；插件停用强制回收子进程

二期规划见 docs/requirements.md §5（Diff & Apply、图片粘贴、多会话并行、slash 补全、MCP UI 等）。

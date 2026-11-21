# TASK-009 ｜ TODO 批次三条目②：聊天面板 UI 层迁移 assistant-ui（通道 A）

> 来源：人类输入 TODO-List.md「待实现」条目②（2026-11-21；原文自带四阶段分期与 A/B 路线抉择、风险备忘）
> 前置依赖：TASK-008 已闭环（2026-11-21，发版 v0.1.6）——user 回声缺陷修复 + golden fixture 安全网均已落地 ✓；附带核验遗留维护项 3 条（见 §3）
> 状态：**待人类确认分期计划后启动**（涉及重大架构变更，按 development-guidelines §3.1 向人类通报）

## 1. 原文素材（TODO-List.md 条目②）

【重构】聊天面板 UI 层迁移 assistant-ui（React，webview/）：官方有 VS Code 一等支持（`@assistant-ui/vscode`，含 vscodeFetch/serveWebviewHost 桥接、renderWebviewHtml 严格 CSP、theme.css 将 shadcn token 映射 --vscode-* 变量、官方 vscode 模板与测试床 examples/with-vscode）；二选一路线：A）fetch-bridge（宿主侧把 PiBridge 适配为 route handler + webview useChatRuntime）或 B）ExternalStoreRuntime（保留现有 postMessage 协议，UiMessage→ThreadMessageLike 映射）；分阶段：①实验面板试点（golden trace 回放 + 主题映射验证，参考官方测试床模式）→ ②消息渲染（text/thinking→reasoning/toolcall 三类 part + 工具卡）→ ③Composer 定制（@ 文件引用、/ 命令菜单、模型选择器、用量行、steer/followUp 队列）→ ④切默认面板删旧实现；风险备忘：@assistant-ui/vscode 尚为 0.0.1、zod 需 jitless、Shiki 单 bundle 约 15MB 需限语言或代码分割、需 retainContextWhenHidden。

## 2. 总调度立案意见（供人类决策参考）

| 项 | 建议 |
|---|---|
| 分期 | 遵原文四阶段，**每阶段独立走一遍流水线**（可行性侦察→基线修订→设计（1b）→实现∥盲写→核验→发版），阶段①产物为实验面板（不切默认），风险最低 |
| 路线 A/B | 由研发 Agent 在阶段①设计期出对比实证（同为试点实现两条最小垂直切片后度量子集），总调度 1b 裁决后向人类通报——素材原文明示"二选一"但未给判据，宜实证不宜预判 |
| 依赖风险 | `@assistant-ui/vscode` 0.0.1：阶段①须先做版本锁定与升级策略（package.json 锁定 + 变更评估）；zod jitless / Shiki 15MB / retainContextWhenHidden 入阶段①验收清单 |
| 安全网 | TASK-008 落地的 golden fixture（golden-prompt-basic / golden-steer-followup）+ TC-062~TC-076 即重写安全网；阶段②起每个能力等价迁移须先建"旧面板行为锚点"用例 |
| 兼容期 | 阶段①–③期间旧面板保持默认可用（feature flag 或独立 view），阶段④才切默认删旧——每阶段可独立发版回退 |

## 3. 前置小项（TASK-008 核验遗留维护项，可并入阶段①）

1. TC-075 UI 手工 checklist（单气泡/就地更新观感，录屏+截图证据）——需图形界面环境，人工执行；
2. fixture README「任意机器重录相同字节」措辞修正（system 序言 3 行有环境依赖差异，已披露）；
3. `record:golden` 的 `--pi-pkg` 路径归一化未生效（维护项，不影响回放）。

## 4. 流水线记录

- 2026-11-21 19:3x 总调度：立案（TASK-008 闭环后自动获得启动资格）；**待人类确认分期计划**（§2）后进入可行性侦察与产品基线修订（预计 v0.5.1 → v0.6）

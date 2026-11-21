# TASK-009 ｜ TODO 批次三条目②：聊天面板 UI 层迁移 assistant-ui（通道 A）

> 来源：人类输入 TODO-List.md「待实现」条目②（2026-11-21；原文自带四阶段分期与 A/B 路线抉择、风险备忘）
> 前置依赖：TASK-008 已闭环（2026-11-21，发版 v0.1.6）——user 回声缺陷修复 + golden fixture 安全网均已落地 ✓；附带核验遗留维护项 3 条（见 §3）
> 状态：**进行中**（人类确认启动，2026-11-21 21:4x："直接开工吧"；阶段①可行性侦察完成，派发产品 Agent）

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

- 2026-11-21 19:3x 总调度：立案（TASK-008 闭环后自动获得启动资格）；待人类确认分期计划（§2）
- 2026-11-21 21:4x 人类：**确认启动**（"直接开工吧"，采纳 §2 分期方案）
- 2026-11-21 21:4x 总调度：可行性侦察完成（§5），生态声称全部证实；派发产品 Agent（基线 v0.5.1 → v0.6，阶段①范围）

## 4.1 流水线记录（续）

- 2026-11-21 22:0x 产品 Agent：v0.6 落档——新增 §4.6 FR-AUI-01~06（独立编号段，阶段④退役）+ 术语表 4 条 + §5 阶段①不做项与②③④路线图 + §8 第 7 条阶段①出口门禁 + 澄清 #18（阶段① P0 不入 MVP 门禁）+ 修订记录；run `4768208a`
- 2026-11-21 22:0x 总调度 **审批点 1 裁决：通过**。写权限核验：仅 ` M docs/requirements.md`（删除行 3 处均为授权修订点，既有 FR 与澄清 #1–#17 语义零变更）；亲读 diff：FR-AUI-01~06 逐条可判定，FR-AUI-02"回放注入须经各自真实传输通道"采纳（防自证教训制度化进需求层）；口径确认——①bundle 预算 webview JS ≤3 MiB（≈5× 现状 0.56 MiB，自然禁全量 Shiki）+ 宿主增量 ≤1 MiB + 默认面板产物依赖图无 React；②阶段① P0 不入 §8-5 MVP 门禁、以 §8-7 出口门禁判定（#18）。**有 FR 范围变化（新增 FR-AUI-01~06），已随人类"直接开工"指令覆盖，不另行通报**。需求基线 v0.6 冻结。下一步：派研发 Agent 出设计（审批点 1b，含 A/B 双切片架构与 §11 契约清单扩容）

- 2026-11-21 22:3x 总调度（超时处置，规范 §7.2）：设计 Agent（run `47fe6697`）触 30 分钟默认超时（派发漏传预算，总调度失误）。现场：仓库零改动、无挂起进程，外部侦察（官方测试床结构/既有 golden 回放模式/无 DOM 断言先例）已完成，正要动笔。resume 续做（预算 90 分钟），不占失败额度

- 2026-11-21 23:0x 研发 Agent（resume 后设计交付）：technical-design.md §10.13（D1–D9）+ §11 扩容 #11–#18（含 npm tarball 源码级协议核读）+ §6 阶段①层 + 文件头 v0.6；run `47fe6697`→`3c5e37e6`
- 2026-11-21 23:1x 总调度 **审批点 1b 裁决：通过**。写权限核验：仅 ` M docs/technical-design.md`。抽检锚点：①版本锁定 4 项 registry 核实存在（ai-sdk 0.0.19 / ai 7.0.153 / react·dom 19.3.1）；②官方指南原文逐字证实"bridge 无需 connect-src"与 zod-jitless 片段；③§11 #12 tarball 源码级协议（channel/帧型/flush 16ms·64KB）与 D2 一致。遗留 2 项裁决：DOM 行为层断言落 MANUAL + 自动兜底（符合核验四值制度与无 DOM 纪律先例，接受；不引入 @vscode/test-electron）；首帧口径 = 通道里程碑（T1/T2），DOM 绘制入真机 checklist。设计基线冻结（快照见下一条 commit）。下一步：实现 ∥ 盲写并行

- 2026-11-21 23:5x 测试 Agent（盲写交付 + resume 钉死）：docs/test-cases.md v0.6——TC-077~TC-097（21 条：14 自动 + 6 真机 MANUAL 配自动兜底 + 1 出口门禁复合行 TC-097），矩阵 6+1 行，36/36 覆盖；TC-080 防自证断言锚到 tarball 源码协议；run `4edde684`→`2c4665d3`
- 2026-11-21 23:5x 总调度 **审批点 2 两轮裁决：通过**。第一轮预受理 + 裁决度量口径（基线 = v0.1.6 tag e9fc9d8；侵入面三组不含 docs/**，另列信息组）；第二轮核钉死措辞与随动一致性（6 处）。**用例基线 v0.6 冻结**（TC-097 为阶段①出口门禁判定行）

- 2026-11-22 00:4x 总调度（超时处置，规范 §7.2）：实现 Agent（run `b214fcc6`）用满 90 分钟预算被截断。现场：+2657 行全部改动面就位（src/lab×3、webview/lab×12、单测 8 文件、集成 2 文件、lab-metrics、主题调色板 fixture），构建产物 media/lab.js 1,157,591 B < 3MiB 预算、lab.css 9KB、dist/extension.js 459KB；断点 = unit 217/218（lab-versions.test.ts zod-jitless 源顺序断言提取了断言描述而非 import 语句——断言自身缺陷）。resume 收尾（预算 60 分钟），不占失败额度

- 2026-11-22 01:2x 研发 Agent（resume 后交付）：FR-AUI-01~06 全实现——lab.js 1,157,591B（36.8% 预算）、宿主增量 +368,758B、冻结面零改动、9 依赖零前缀、四维对比报告入 §10.13（时延 A T1 2.94ms / B T1 0.06ms，结论中立）；unit 218/integration 45 全绿 + 10 连跑；run `b214fcc6`→`c3b721cd`
- 2026-11-22 01:3x 总调度 **交付验收 PASS**：①写权限 23 项全在矩阵内（研发披露的 tsconfig/.gitignore 实为矩阵明列工程文件——任务书枚举窄于矩阵属任务书瑕疵，非代理越界）②冻结面 vs v0.1.6 零改动亲验 ③亲复跑 typecheck 0 错/build/unit 218/integration 45 全绿 ④3 轮并行抽查与 10 连跑一致 ⑤bundle/依赖锁定/CSP 亲验 ⑥对比报告可复现命令齐备。commit `f7a3518`（研发 Agent），标签 **ready-for-verify-r8** 已推送；下一步：独立核验（TC-077~097）

## 5. 可行性侦察（2026-11-21 21:3x–21:4x，外部证据均为当日实测）

| # | 素材声称 | 实测结论 | 证据 |
|---|---|---|---|
| 1 | `@assistant-ui/vscode` 存在且为 VS Code 一等支持 | ✅ **0.0.1**（2026-11-12 更新，活跃）；双入口 `…/host`（扩展宿主，不 import vscode）+ `…/webview`；能力：`vscodeFetch`（fetch 隧道）、`serveWebviewRoutes`/`serveWebviewHost`（宿主 route handler `(req)=>Response`）、`installLinkInterceptor`（链接拦截 + externalSchemes 白名单）、`createVSCodeStorage`（Memento 线程持久化）、abort 传播、页面重载中止旧请求、非路由 origin 拒绝（TypeError/404/405/500 语义齐全） | npm view（registry）+ README 全文 |
| 2 | 官方 vscode 模板 | ✅ `npx assistant-ui@latest create my-extension -t vscode` + 官方指南 https://www.assistant-ui.com/docs/guides/vscode | README |
| 3 | 官方测试床 examples/with-vscode | ✅ 存在于 assistant-ui/assistant-ui（13.4k stars，当日仍有提交）：含 src/webview/test/scripts 完整目录 | GitHub contents API |
| 4 | zod 需 jitless | ✅ `@assistant-ui/react@0.15.37` 直接依赖 **zod ^4.6.7**（另 zustand/radix-ui/assistant-stream 等）；webview CSP 环境需验证 jitless/免 eval | npm view |
| 5 | Shiki 单 bundle 约 15MB | ⚠️ 部分证实：Shiki 非直依（`react-markdown@0.14.26` 无 shiki），经 `@assistant-ui/react-streamdown@0.3.23` 引入（shiki 4.6.0）；限语言/代码分割决策留给设计阶段（1b） | npm search/view |
| 6 | 需 retainContextWhenHidden | 属 VS Code webview 生命周期配置（现有面板已在用 retainContextWhenHidden？阶段①清单核对项） | 待设计阶段核实 |
| 7 | React 生态要求 | `react/react-dom ^18||^19`（当前 webview 为零依赖 vanilla TS，引入 React 为新增构建面，esbuild 已具备） | npm view peerDeps |

**路线可行性初判（供阶段①双切片实证，不预判结论）**：路线 A（fetch-bridge）贴合 @assistant-ui/vscode 设计（route handler 包装 PiBridge）；路线 B（ExternalStoreRuntime）保留现有 postMessage 协议、UiMessage→ThreadMessageLike 映射，不依赖 fetch 隧道。两者阶段①各做最小垂直切片对比后由总调度 1b 裁决。

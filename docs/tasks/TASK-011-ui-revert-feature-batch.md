# TASK-011 ｜ 自研 UI 还原 + 框架移除 + GitHub 特性全量批次

> 来源:**人类指令(2026-11-27 17:5x)**:"github上新提出来的新特性请你逐一实现吧,另外还原聊天界面为我们自己编写的版本,去掉外部引入的框架"
> 性质:批次归并(versioning.md §4:多个小闭环合并一版 = **0.1.10**)
> 审批口径:本批次审批点 1/1b/2 的批准 = 人类 2026-11-27 上述指令(预先授权,范围以 10 张 open Issue + 还原指令为界;中途范围歧义暂停询问)

## 0. 批次构成

| 项 | Issue | 内容 | 状态 |
|---|---|---|---|
| **A. UI 还原(主项)** | —(人类指令) | chatView 还原为自研经典实现(webview/main.ts + render/*),整体移除 assistant-ui React UI(webview/ui/*)与 @assistant-ui/* 依赖族,双轨注册收敛为单面板 | 待研发 |
| B | #3(R-01) | package.json 重复键去重 + 结构门禁(P-03:键数一致/无依赖漂移) | 待研发 |
| C | #5(R-04) | #D-08(TASK-008 回声)补登记 + #D-NN 集中索引归宿 | 待研发 |
| D | #7(R-06) | golden fixture 时序类剧本(P-06 类别①)+覆盖表 | 待研发 |
| E | #8(R-07) | 需求基线增"外部输入→展示通道"必填节(基线修订留痕) | 待研发 |
| F | #9(R-08) | 用例规范交互消费面义务(P-05;A 项落地后第三方 UI 组件面=0,条款保留为未来引入时的前置义务) | 待研发 |
| G | #10(R-09) | 商店元数据本地校验(类目枚举/publisher 入库比对,挂 verify) | 待研发 |
| H | #13(R-15) | 对端漂移监视固化(周期轮 npm view 比对)+ 真实 pi 冒烟 ≥1 场景(P-08;本环境有 pi 二进制) | 待研发 |
| I | #4(R-03) | **前置失效**:经典面板删除备忘 → A 项反向(删新留旧);待 A 落地后以证据关闭(not_planned,评论留痕) | 挂起 |
| J | #11(R-13)、#12(R-14) | **前置失效**:assistant-ui 升级备忘/批次时序 → 框架移除后无升级对象;待 A 落地后关闭(not_planned,留痕) | 挂起 |

## 1. A 项验收口径(UI 还原)

1. `sdysyhj.chatView` 打开即自研经典实现(行为=v0.1.6 时代:流式/Markdown/thinking/工具卡/steer/会话管理全量);`chatViewClassic` 双注册与 Open Chat (Classic) 命令移除,单面板;
2. `webview/ui/**` 删除;`@assistant-ui/*` 全族 + 仅新 UI 消费的依赖(react/react-dom/react-markdown/remark-*/@types/react 等,grep 实证后定)从 package.json 移除;esbuild 入口/构建配置同步;
3. 测试外科:新 UI 专属用例(ui-store/ui-dual-panel/golden DOM 新 UI 断言)移除或回经典版(git 历史可考);集成面以经典面板为对象全绿;ui-versions 门禁同步依赖表;
4. 四门禁全绿(typecheck/build/verify:unit/verify:integration);CSP 不降级;webview 产物体积下降留证;
5. 基线留痕:requirements/technical-design 增修订记录(人类 2026-11-27 还原决策,FR-AUI 系列条目废止标注);CHANGELOG 0.1.10 用户可见说明。

## 2. 执行顺序(单写者纪律,顺序派发)

A(UI 还原)→ B/C(小项,可与 A 后半并行评审)→ G → D → H → E/F(文档基线项)→ 核验 → 发版 0.1.10 → 回写关闭 #3/#5/#7/#8/#9/#10/#13 + I/J 挂起项证据关闭。

## 3. 进度日志

- 2026-11-27 17:5x 总调度:人类指令立项;A 项研发子代理派发;

# TASK-011 全批次独立核验报告

> 核验对象:TASK-011「自研 UI 还原 + 框架移除 + GitHub 特性全量批次」(A~F 已提交 f034515 / 4b68db9 / 67d39d1 / df252c2;E 项 requirements v0.9;F/C 项 DevelopmentGuidelines 本地规范)
> 核验者:独立核验 Agent(fresh context,不采信研发自述,其报告仅作线索)
> 核验时点:2026-11-27 19:41–19:52(本机)｜ HEAD = `df252c2`(`df252c28002ce72c43ac986a473644ab486670ea`)
> 核验方式:门禁亲复跑 + git 历史比对(v0.1.6 / v0.1.9) + /tmp 隔离注入演练 + 独立探针(不经测试框架)+ 文档交叉核对
> 结论口径:任何一项 FAIL 即批次 FAIL;边缘疑点列观察项不阻塞

## 结论:**PASS**(6/6 核验义务全过;观察项 12 条,无阻塞项)

---

## 1. 门禁亲复跑 —— PASS

| 门禁 | 命令 | 结果 | 独立证据 |
|---|---|---|---|
| typecheck | `npm run typecheck` | ✅ exit 0 | tsc --noEmit 零输出 |
| build | `npm run build` | ✅ exit 0 | `dist/extension.js 92,366 B` / `media/main.js 586,752 B` / `media/main.css 12,974 B` + sourcemap |
| verify:unit | `npm run verify:unit` | ✅ 18 文件 / **192 用例**全绿(4.36s) | 与研发自述计数一致,亲复跑确认 |
| verify:integration | `npm run verify:integration` | ✅ 8 文件 / **42 用例**全绿(5.36s) | 同上 |
| pi-real-smoke | `npx vitest run test/integration/pi-real-smoke.test.ts` | ✅ **真跑非 skip** | 控制台留痕 `[pi-real-smoke] 本机 pi --version 实测:1.5.2`;`which pi` = PATH 实机(1.5.2);用例耗时 3806ms(raw spawn `pi --mode rpc --no-session`,get_state 协议握手断言);文件内零 mock/fake import、零 FAKE_* 环境注入,代码审查确认 skip 分支仅在 PATH 无 pi 时触发(本机未触发) |

## 2. A 项还原完备性 —— PASS

### 2.1 框架残留 grep(误命中甄别后)

- `@assistant-ui` / `remark` / `zod-ui` 命中面全量甄别:**功能性残留为零**。全部命中落在三类合法位置:① 源码历史注记注释(`src/panel/chatPanel.ts:5`、`src/extension.ts:92`,说明退役事实);② 守护测试的反向断言本体(`ui-versions/ui-budget/ui-isolation` 断言"零残留");③ 基线文档历史留痕(requirements §4.6 废止注记、technical-design §10.13~10.15、test-cases 历史节)。
- `react` 命中:src/webview/esbuild/package.json/.github **零功能性命中**;`.github/`(ci.yml + release.yml)零命中;README 零 react/assistant 文字;`tsconfig.json` 有一处 `"jsx": "react-jsx"`(惰性配置残留,见观察项 O1)。
- `package-lock.json`:269 个 packages 中**零** `node_modules/(react|react-dom|react-markdown|@assistant-ui/*|remark-*|zod)` 路径;文件内 4 处 `"zod"` 命中均为传递依赖 `@anthropic-ai/sdk` / `@aws-sdk/*` 的 **optional peerDependencies 元数据**(未安装,无害)。
- `chatViewClassic` / `openChatClassic` / `Chat (Classic)`:src/package.json/esbuild/.github **零残留**(命中仅在注释与守护断言、docs 历史留痕)。

### 2.2 依赖与结构

- **runtime deps 恰为四件套**:`@earendil-works/pi-coding-agent@1.5.2` + `dompurify@3.4.18` + `highlight.js@11.12.0` + `marked@18.2.1`(与 ui-versions PINNED_DEPENDENCIES 一致);devDeps 7 项全精确锁定。
- **contributes 单视图**:`views.sdysyhj` = 仅 `sdysyhj.chatView`(name "Chat");commands 9 项全经典集合,无 `openChatClassic`/`openChatLab`;`activationEvents` = 仅 `onView:sdysyhj.chatView`。

### 2.3 CSP 与 v0.1.6 经典冻结值比对

`git show v0.1.6:src/panel/chatPanel.ts` 与 HEAD 逐字比对:nonce 生成(`crypto.randomBytes(16)`→base64)、CSP 指令串 `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:;`、script/styles URI(media/main.js|main.css)**完全一致**——CSP 未降级。

### 2.4 webview 产物体积下降实证(同参构建对比)

git worktree @ v0.1.9(/tmp,`npm ci` + `npm run build` 同参重跑,528ms 完成):

| 产物 | v0.1.9 同参构建 | HEAD 构建 | 差 |
|---|---|---|---|
| media/main.js(经典) | 586,752 B | 586,752 B | **字节级一致**(md5 `f0f26db8092eac3a8cc450bcc8449b07` 两端相同) |
| media/chat.js(新 UI) | 1,000,759 B | —(入口已拆除) | 整体消失 |
| webview JS 合计 | **1,587,511 B(1.51 MiB)** | **586,752 B(0.56 MiB)** | **−1,000,759 B(−63.0%)** |
| dist/extension.js | 104,249 B | 92,366 B | −11,883 B |

辅助锚点:`git diff v0.1.6 HEAD -- webview/` **零 diff**(经典 webview 源码与 v0.1.6 字节一致——media/main.js 与 v0.1.9 经典 bundle md5 相同亦旁证双轨期经典实现冻结、本次还原=删新留旧);src 侧差异 = chatPanel.ts 双轨注册拆除 + hostActions 委托重构(TASK-009 D3 机械提取,注释自证行为零变化)。

## 3. B/G 门禁有效性抽查(/tmp 注入演练)—— PASS

演练环境:`/tmp/sdysyhj-drill`(rsync 拷贝 + node_modules 符号链接,零触及主仓);基线先行确认两门禁 11 用例全绿(首轮因演练环境漏拷 media/icon.png 出现 icon 断言红——修正后基线绿,该失误本身反向证实 icon 存在性检查真实生效)。

| 注入 | 目标门禁 | 结果 |
|---|---|---|
| ① devDependencies 追加重复键 `vitest` | B(ui-versions ⑤⑥) | ✅ 必红:⑤「devDependencies 存在重复键:expected 6 to be 7」+ ⑥「全文件键数一致:111≠112」双双红 |
| ② dependencies 加假依赖 `left-pad@1.0.0` | B(ui-versions ⑦) | ✅ 必红:⑦「依赖 left-pad 在 src/ webview/ test/ esbuild.mjs 零消费——无用依赖应删除」 |
| ③ categories 注入非法类目 `Chatbots`(#D-05 原案值) | G(pkg-metadata ①) | ✅ 必红:①「非法类目『Chatbots』不在 Marketplace 公开类目枚举内(#D-05:en-us 枚举外值发版通道①必拒)」 |

演练后清理:`/tmp/sdysyhj-drill`、`/tmp/sdysyhj-v019` worktree、探针文件全部删除;`git worktree list` 仅剩主仓;主仓 `git status` 干净(仅 `.pi-loop.json` 运行时产物,见观察项 O6);`git diff package.json` 为空;演练后主仓 verify:unit 复核 **192/192 全绿**——**工作区零污染**。

## 4. D 项剧本实效 —— PASS

- **真实文件系统面独立探针**(不经 vitest,直接 spawn `node test/helpers/fake-pi-cli.js --mode rpc`,`FAKE_PI_REPLAY=物化fixture` + `FAKE_PI_SESSION_FILE=真实路径`,依序喂入 fixture 全部 in 命令):**PASS——磁盘条目 ids=[probe, e-timing-1, e-timing-2, e-timing-3, e-timing-4]**(会话头 + 4 条 entry 物理落盘,顺序与 fixture 一致)。落盘机制 = fake-pi-cli.js `replayOutRecord`:`fs.appendFileSync(sessionFilePath, JSON.stringify(record.entry)+"\n")`(真实 fs,非 stub)。
- **I5 协议级用例**(golden-replay.test.ts):测试本体断言 `fs.readFileSync(sessionFile)` 读出的磁盘行 id 序列 = `["timing-interleave","e-timing-1".."e-timing-4"]`——即用例自带物理落盘实证;并挂**真实 `SessionFileWatcher`(50ms 轮询)**验证 #D-01 窗口零误报、真实外部 appendFile 检出、拦截、刷新后零复发。亲复跑 ✓(1009ms)。
- **UI 状态通道**(ui-golden-dom.test.ts 时序交织 describe):真实 ChatPanel + 冻结 bundle(media/main.js)+ 真实 watcher,横幅出现/刷新消失/零复发。亲复跑 ✓(1141ms)。
- **README 覆盖表**(`test/fixtures/golden/README.md`):四类别口径与 ledger P-04/P-06 提案及 review report 2026-11-25 §D① **一致**——①时序交织(已落地)②会话生命周期(遗留)③异常路径(遗留,允许 synthetic 留痕)④多轮/中止(遗留);②③④遗留如实标注不虚报;synthetic 剧本头注释留痕规则与 fixture 头部声明齐备。

## 5. E/F 文档一致性 —— PASS

- **E(requirements §4.7 vs 澄清 #14)**:§4.7 范例①(extension_error)与澄清 #14(v0.2.3)口径一致——非阻断 toast + Output 全字段日志 + 同错误去重;§4.7 进一步钉定去重键 = `extensionPath+error`、窗口 60s。三方比对(§4.7 ↔ 澄清 #14 ↔ 实现 `src/bridge/piBridge.ts`:`EXTENSION_ERROR_TOAST_DEDUP_MS = 60_000`,key=`extensionPath+\0+error`,仅抑制 toast、日志全量)**零矛盾**。requirements 头部版本 v0.9 + 修订记录(2026-11-27 v0.9 行)齐备;既有 FR 本体与澄清 #1–#19 零改动属实(修订记录自述与 grep 抽查一致)。
- **F(development-guidelines 第一部分 §5 第 8 条)**:条款存在(「交互消费面验证义务(P-05)」)且**同时引用审批点 1b**(「设计侧清单经第二部分 §5 审批点 1b 审查」)与**审批点 2**(「用例侧断言组经第二部分 §5 审批点 2 审查」);含当前状态注记(第三方 UI 组件面=0,作为未来引入时的前置义务)。
- **两份修订记录齐**:① requirements.md v0.9 修订记录(E 项);② development-guidelines.md 修订记录 ×2——2026-11-27 C 项(附录 #D-NN 缺陷登记索引 #D-01~#D-08 集中登记 + #D-08 补登记与版本考证修正「修复随 0.1.6 落地」)与 F 项(§5 第 8 条)。C 项落地本体(DevelopmentGuidelines 附录索引)逐条抽查 ✓(#D-08 行含编号来源、任务单、修复发版考证)。

## 6. 批次级对抗审查 —— PASS

| 审查点 | 结论 |
|---|---|
| 版本号仍 0.1.9 | ✅ 正确——发版 0.1.10 属核验后流程(任务单 §2 执行顺序:核验→发版),未提前 |
| CHANGELOG 顶部仍 0.1.9 | ✅ 正确——0.1.10 用户可见说明(任务单 §1.5)为发版步骤产物,未提前 |
| `.gitignore` `media/chat.js`/`media/chat.css` 惰性残留 | **无害**——构建已不产出该两文件(media/ 实存仅 main.*),纯 gitignore 死模式;无功能影响(见观察项 O4,建议发版提交顺手清理) |
| esbuild 双入口与经典构建链自洽 | ✅ 自洽——宿主(src/extension.ts→dist/extension.js,cjs,external vscode+pi)+ 经典面板(webview/main.ts→media/main.js,iife)双入口;jsx/NODE_ENV define/minify 链已拆除(esbuild.mjs 注释自证);ui-isolation ② 断言「无 jsx automatic / NODE_ENV define / media/chat.js 入口」;build 亲跑绿 |
| ui-golden-dom 回经典版后 3 用例实际覆盖面 | ✅ 见 §6.1 |
| I/J 挂起项与 Issue 回写 | 未执行 = 正确状态(发版后动作,本核验禁平台操作) |

### 6.1 ui-golden-dom 经典版用例覆盖面(实证)

文件历史:生于 TASK-009 切换批次(19588eb,面向 assistant-ui runtime),f034515 回经典版,67d39d1 增第 4 例。当前 **4 用例**(3 经典回迁 + 1 新增),全部亲复跑绿:

1. **golden-prompt-basic(P0)**:消息条数/文本与 fixture 逐行推导一致;user 气泡三判定时点恒 1(FR-CHAT-11①);每条消息 HH:mm 时间戳(FR-CHAT-10⑤)。
2. **golden-steer-followup(P1)**:三发送各恰一条 user 气泡 + 三轮 assistant 全量文本(FR-CHAT-11②④)。
3. **TOOL 剧本**:工具卡名称(bash)/终态(成功)/可展开 args+output;thinking `<details>` 默认折叠(FR-CHAT-03/04)。
4. **golden-timing-interleave(D 项新增)**:见 §4。

挂载真实性:beforeAll 经 node 子进程跑仓库 esbuild.mjs 产出冻结 `media/main.js`,jsdom 内 `window.eval` 原样执行真实经典 bundle;宿主侧真实 ChatPanel.resolveWebviewView + 真实 PiBridge/RpcClient→fake-pi 回放;webview→宿主经 acquireVsCodeApi stub 捕获、宿主→webview 经 postMessage→MessageEvent(生产传输通道同构)。**真实 E2E DOM 面,非渲染桩**。

覆盖 delta(vs v0.1.9 新 UI 版,如实记录):新 UI 版 TOOL 用例中的「复制全部接线」DOM 断言回经典版后未保留(经典实现复制全部按钮存在于 `webview/render/messages.ts:154`,桥级全量缓存取用由 `piBridge.test.ts:214` 单测覆盖);主题对比度采样(FR-AUI-04)与 XSS 探针 DOM 断言(FR-AUI-02④)随 FR-AUI 系列废止一并退役——见观察项 O2/O3。

---

## 观察项(不阻塞,供总调度/发版轮处置)

- **O1|tsconfig `"jsx": "react-jsx"` 惰性残留**:全仓已无 .tsx 文件,typecheck 绿、零功能影响;属 react 构建链配置残留,任何门禁未覆盖;建议 0.1.10 发版提交顺手移除。
- **O2|NFR-03 webview 渲染消毒的自动化 DOM 断言面为零**:v0.1.9 的 `ui-xss.test.ts` 随新 UI 删除,经典时代(v0.1.6)同样为零——口径一致非回退;经典实现 DOMPurify 消毒在场(markdown.ts)+ 依赖冻结门禁在场(ui-versions ③)。但 NFR-03 条款仍活跃,建议后续补经典面板 XSS 探针 DOM 用例(回放通道现成)。
- **O3|fake-pi-cli.js 的 UI-XSS 剧本成死代码**:6 处引用、零测试消费方(原消费方 ui-xss.test.ts/ui-store.test.ts 已删);惰性残留,无害,建议随 O2 一并处置(补用例或删剧本)。
- **O4|.gitignore `media/chat.js`/`media/chat.css` 死模式**:无害(见 §6);发版提交可清理。
- **O5|technical-design.md 头部「对应需求 v0.8」滞后 requirements v0.9**:E 项为纯需求基线口径新增(不改设计),无实质矛盾;跨文档引用滞后,可在下次设计文档修订时同步。
- **O6|`.pi-loop.json` 未跟踪且未入 .gitignore**:gitignore 仅列 `.pi-loop.json.lock`;该文件为 pi-loop 扩展机器状态(mtime 19:06,早于本核验,非本轮产物),任务前提「工作区干净」对跟踪文件成立。建议 gitignore 补条目防未来误提交。
- **O7|archive/ 本地目录(12K)未列 .vscodeignore**:若 vsce 打包不读 .gitignore,本地存在时将入 VSIX;属既有状态(早于本批次),非 TASK-011 引入;发版轮可顺手补 `.vscodeignore` 条目。
- **O8|docs/test-cases.md 仍为 v0.7,未随还原批次加废止注记**:TC-111 等双面板断言(chatViewClassic 存在)与当前单面板形态不符,但作为 0.1.8 时代历史判定留痕口径有效(requirements §4.6 同采「文本保留为历史基线」模式);建议后续基线修订加一行还原注记防误读。
- **O9|H 项「周期轮 npm view 漂移比对」未见机器固化**:pi-peer-version.test.ts 纪律注记明确其属螺旋循环(人类/调度)职责不入测试(下界红线+黄线已单测固化,pi-real-smoke 已真跑);本地 .pi-loop.json 两个 cron 任务(螺旋审查/Issue 巡检)均不含 npm view 漂移比对步骤——任务单 H 描述的「周期轮比对」落地形态待发版轮与调度侧确认。
- **O10|ui-golden-dom 经典版 3 用例的「复制全部」DOM 断言缺口**:见 §6.1 覆盖 delta;FR-CHAT-04 桥级已覆盖,DOM 级按钮接线无断言,建议补。
- **O11|/tmp 既有遗留**:`/tmp/sdysyhj-verify*`、`sdysyhj-stab.log`、`sdysyhj-lab-metrics-*` 为往轮(11-17~11-22)产物,非本轮污染,本轮探针已全清。
- **O12|.pi-loop.json 未跟踪文件在 git status 出现**:同 O6;主仓跟踪面零污染已由演练后复核(192/192 + git diff 空)证实。

## 附:核验执行记录(时间线,本机 2026-11-27)

19:41 typecheck/build → 19:41 unit 192 → 19:41 integration 42 → 19:42 pi-real-smoke 单跑留痕 → 19:42 A 项 grep 全仓 + lock 剖析 → 19:43 CSP v0.1.6 比对 + worktree v0.1.9 同参构建 → 19:44-19:45 B/G 注入演练(三组必红+清理+复核) → 19:46-19:48 D 项 I5/ui-golden-dom 亲跑 + 独立落盘探针 PASS → 19:48-19:51 E/F/C/H 文档交叉核对 → 19:52 报告落盘。全程预算内(约 11 分钟),无断点。

---

*本报告为独立核验产物(fresh context,只读主仓 + /tmp 探针;唯一写权限 = 本文件)。逐项证据均可由文中命令/git 引用复现。*

# TASK-009 阶段①（assistant-ui 迁移试点，FR-AUI-01~06）核验报告

> 核验 Agent（独立核验，fresh context）｜ 被测：`ready-for-verify-r8` ＝ 交付 commit **f7a3518** ｜ 报告日期：2026-11-22
> 依据：docs/test-cases.md **v0.6**（TC-077~TC-097 + §0.3 LAB-XSS + §3 第 12 条裁决）+ docs/requirements.md v0.6（§4.6 + 澄清 #18 + §8-7）+ docs/tasks/TASK-009-assistantui-migration.md
> 证据：`docs/verification/evidence-t9/<TC-id>/`（cmd.txt + output.txt + 脚本原文）

## 1. 证据头（ENV）

| 项 | 值 |
|---|---|
| 干净检出 | `git clone --no-hardlinks /data/workspace/Sdysyhj /tmp/verify-task009`；`git checkout ready-for-verify-r8`；`git status --porcelain` **空** |
| git describe | `ready-for-verify-r8`（HEAD = f7a3518） |
| 基线锚点 | tag `v0.1.6`：tag 对象 d121438、commit **e9fc9d8**（§3 第 12 条裁决口径，二者为同一标签的两层指向，一致） |
| 环境 | Linux 5.14.0（el9）x86_64；Node v24.19.0；npm 11.17.0；日期 2026-11-22 |
| 隔离 | 临时 HOME=/tmp/verify-home-t9；unset PI_CODING_AGENT_DIR/PI_CODING_AGENT_SESSION_DIR/PI_CODING_AGENT/PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT；无真实凭证；回放/度量全 loopback 或静态 fixture |
| 依赖 | clone 内 `npm ci` 成功（唯一 registry 访问步骤）；lockfile 9 项精确版本新依赖安装齐全 |
| 独立性纪律 | 核验 harness 全部自研（/tmp/t9harness/：自研回放 CLI + 自建断言脚本），**未复用**交付 mock/驱动（fake-pi-cli.js、lab-metrics-driver、交付测试 harness 均**未 import**）；仅 import 被测实现（src/bridge/*、src/lab/*、webview/lab/*）与官方库；期望值全部由 golden fixture / 官方源码 / v0.1.6 tag 逐行独立推导；clone 内无 git 写操作（基线经 `git archive` 只读检出）；一次性脚本自终止 + 有界超时 |

## 2. 总结论

**TASK-009 阶段①交付通过核验：TC-077~TC-097 = 15 PASS + 6 MANUAL（遗留不计 FAIL，兜底全过）+ 0 FAIL + 0 SKIP；TC-097 出口门禁（§8-7）四要件全部成立 → PASS。**

全量回归亲跑：typecheck 0 错 / build 成功 / verify:unit **218/218** / verify:integration **45/45**（与期望计数一致；两轮重复 + 断网独立 netns 下同样全绿；并行 5 连跑全绿）。度量类（TC-094/TC-096）独立复算与 §10.13 报告数值**逐项一致**（lab bundle 1,157,591 B、宿主增量 +368,758 B 精确吻合；时延同数量级）。外部锚点抽查 10 处证实（2 处环境受限已披露）。

## 3. 逐 TC 判值

| TC | FR | 判值 | 判定依据（详见 evidence-t9/<TC>/） |
|---|---|---|---|
| TC-077 | AUI-01①③ | **PASS** | 自建 manifest 脚本 28 断言全过：(a) 独立 viewType `sdysyhj.chatLabView` ≠ 默认、默认首位/实验第二位；(b) name「聊天（实验）」含实验；(c) `sdysyhj.openChatLab` 注册且既有 9 命令逐项不变；(d) 注册点显式 `retainContextWhenHidden: true`（默认面板同值，注册点 = chatPanel.ts）；(e) `onView:sdysyhj.chatLabView` 惰性激活 |
| TC-078 | AUI-01② | **PASS** | 自建 freeze 脚本：git `v0.1.6..HEAD` 38 处变更归组——**默认面板冻结组空**；冻结源码 9 文件（chatPanel/messages/main.ts/render×5/styles）**逐字节一致**；esbuild 既有两入口选项逐字原样；既有套件 218/218 + 45/45 ×2 全绿（断网亦绿） |
| TC-079 | AUI-01①③ | **MANUAL** | 真机冒烟（无图形界面环境）；兜底 TC-077 PASS |
| TC-080 | AUI-02④ | **PASS** | 自建 harness（自研回放 CLI，注入位 = RPC 子进程 env，低于适配层）：(a) 路线 A 隧道帧 channel=`aui-vscode`、`fetch:head → fetch:chunk(≥1) → fetch:end`、Response 200 可流读；(b) 路线 B 泵输出完整事件序列（id 贯通）；(c) 观测面仅通道输出/解码数据，无直写路径（harness 结构即证） |
| TC-081 | AUI-02⑤ | **PASS** | 自建 XSS 剧本（形状转印 golden 骨架 + 探针文本）：路线 A/B 通道解码文本与探针原文**逐字节一致**（user 回声 + assistant 回复，store/映射层同验）；静态扫描 `webview/lab/**`（10 文件）innerHTML/outerHTML/insertAdjacentHTML/document.write **零命中** |
| TC-082 | AUI-02⑤ | **MANUAL** | DOM 行为层真机；兜底 TC-081 PASS |
| TC-083 | AUI-02⑥ | **PASS** | 双切片在核验 harness 中**各自独立**完成 FR-AUI-03① 全量回放（route A/B 测试互不依赖）；结构前提：实验视图条目恰 1、打开命令恰 1、构建入口唯一（自建 manifest 断言） |
| TC-084 | AUI-02⑥ | **MANUAL** | 切换冒烟真机；兜底 TC-083+TC-085+TC-086 PASS |
| TC-085 | AUI-03①+AUI-02①③ | **PASS** | 路线 A 独立回放 GOLDEN-BASIC：帧序 start-step→text-start→4×text-delta（序与 fixture 一致）→text-end→finish-step→finish；assistant 文本 == fixture `message_end` 权威文本（且 fixture 内证三方一致：delta 拼接==text_end==message_end）；流内无 user 帧（结构性无双气泡）+ 请求侧 1 user = 消息数 2；settled 完成 |
| TC-086 | AUI-03①+AUI-02②③ | **PASS** | 路线 B 独立回放：泵事件 user_message/message_final(user) **id 贯通一致**、文本逐字节一致；store 终态 messages=2（同 id 重复终稿就地覆盖，幂等实证）；ThreadMessageLike 映射 2 条 role/文本逐条一致 |
| TC-087 | AUI-03②（P1 尽力） | **PASS** | 双切片 GOLDEN-MIX：三请求按录制时序（主→follow_up→steer），三 assistant 终稿逐条一致、回声到达序 **S 先 F 后**（与 fixture 实证一致）、总数 = 3+3 = 6；路线 B 终态 6 条 = 3 user + 3 assistant；(d) 队列快照 ×4 到达宿主且内容演进（FU 入队→ST 入队→ST 消费→归零，核验自建 RPC 事件面断言）——P1 不计门禁 |
| TC-088 | AUI-03③ | **PASS** | (a) 全场景固定命令退出码判定；(b) 同环境连跑 2 次结果与观测一致（+核验 harness 复跑）；(c) `unshare -rn` 独立网络命名空间下 218/218 + 45/45 全绿（执行期零外部请求） |
| TC-089 | AUI-04①② | **PASS** | 自建静态解析层（自研 var() 链解析器）：6 采样 token 定义链非空且终点 `--vscode-*`；浅深调色板代入全部解析出 hex 且 5/6 组不同（联动生效）；WCAG 公式对比度 dark 11.057:1 / light 10.548:1（正文）、气泡 4.529:1 / 6.308:1 —— 全部 ≥4.5:1 |
| TC-090 | AUI-04③ | **MANUAL** | 主题截图真机；兜底 TC-089 PASS |
| TC-091 | AUI-05① | **PASS** | 自建 JSON 断言：D6 九项冻结清单逐项精确版本（0.0.1/0.15.37/0.0.19/7.0.153/19.3.1/19.3.1/4.6.7/@types 19.3.0×2）；**全部依赖零 ^/~/>= 前缀**（全量扫描，含基线差集 9 项新增） |
| TC-092 | AUI-05② | **PASS** | 自建 CSP 脚本（真实调用官方 renderWebviewHtml，stub webview）：指令集 = 官方 strict 模板逐指令 8 项、script-src 仅 nonce、无 unsafe-eval/unsafe-inline、无模板外指令；与默认面板差异三项登记核对（均为收紧）；非 relaxed 回退；(d) 产物文本顺序：config({jitless:!0})@offset 329568 **先于全部 137 处 `.object({` schema 构建**（源顺序佐证 main.tsx 首个 import = ./zod-jitless）。⚠交付套件对 (d) 仅实现源顺序断言——见 §6 披露① |
| TC-093 | AUI-05② | **MANUAL** | 真机 CSP 零 violation；兜底 TC-092 + TC-085/086 PASS |
| TC-094 | AUI-05③ | **PASS** | 自建字节级度量：(a) lab webview JS 合计 **1,157,591 B** ≤ 3,145,728（余 1,988,137）；(b) 宿主增量 = 459,382 − 90,624（v0.1.6 tag `git archive` 检出 + 同 esbuild 0.28.2 构建对比）= **+368,758 B** ≤ 1,048,576；(c) lab 依赖图 973 inputs 无 shiki/@shikijs；(d) 默认面板 49 inputs 无 react/react-dom/@assistant-ui |
| TC-095 | AUI-05④ | **MANUAL** | 行为层真机；兜底 TC-077(d) 注册断言 PASS（注册值 = true，无须对比报告例外登记） |
| TC-096 | AUI-06①②③ | **PASS** | 自建结构扫描：四维各成节、②×7 取中位（≥5）、③三组归类（冻结组**空** + docs 另列信息组）、复现命令+输出在文、预设路线句式**零命中** + 裁决归属声明、升级评估留痕；度量独立复算一致（见 §4） |
| TC-097 | §8-7 | **PASS** | 组合判定：要件 1（13 项 P0 自动 TC 全 PASS）+ 要件 2（6 MANUAL 四值处理，兜底全 PASS）+ 要件 3（TC-096 报告交付）+ 要件 4（TC-078 零变更回归）全部成立 |

## 4. 度量复核（TC-094/TC-096 独立重跑 vs §10.13 报告）

| 指标 | 报告值 | 核验独立复算 | 一致性 |
|---|---|---|---|
| lab webview JS（npm run build 产物） | 1,157,591 B | 1,157,591 B（fs.stat） | **精确一致** |
| 宿主增量（vs v0.1.6 构建） | +368,758 B | +368,758 B（459,382 − 90,624） | **精确一致**（核验用 npm run build 全量构建口径；交付 lab-metrics 复跑 459,344−90,586 亦 = +368,758，同差值） |
| 默认面板依赖图 | 49 inputs / 命中 0 | 49 inputs / 命中 0 | 一致 |
| 时延 A T1/T2 | 2.94 / 0.93 ms（×7） | 3.56 / 1.10 ms（×5，中位） | 同数量级（时延类天然波动，符合口径） |
| 时延 B T1/T2 | 0.06 / 0.01 ms | 0.09 / 0.01 ms | 同数量级 |
| 侵入面三组 | 冻结空/共享 7/新增 26/docs 另列 | 冻结空/共享 7/新增 26/docs 5+1 | 一致 |

## 5. 门禁专项（FR-AUI-05）与全量回归

- **依赖零前缀**（TC-091）：自建 JSON 断言全过（9 项冻结清单 + 全量零前缀）。
- **CSP 指令集**（TC-092）：官方 strict 模板逐指令一致、零新增指令/来源、与默认面板差异登记核对。
- **bundle 字节**（TC-094）：lab.js + 全 chunk（实测仅单入口 lab.js，无分割 chunk）1,157,591 ≤ 3,145,728；宿主 +368,758 ≤ 1,048,576；Shiki 零进图。
- **宿主增量基线**：v0.1.6 tag（e9fc9d8）`git archive` 只读检出 + 硬链接 node_modules（同 esbuild 0.28.2，消除 symlink realpath 路径伪影——见 §6 披露④）构建对比。
- **默认面板依赖图无 react**：49 inputs 零命中。
- **回归**：typecheck exit 0；build exit 0；verify:unit **21 文件 218/218**；verify:integration **8 文件 45/45**（×2 轮 + 断网 netns 全绿）。
- **压力**：integration 并行 5 连跑 **5/5 exit 0，各 45/45**。

## 6. 发现与披露（机械判据/语义核对逐条）

1. **TC-092(d) 产物顺序断言在交付套件中未实现**：用例要求「产物中 jitless 配置先于任何 zod schema 构建出现（产物文本顺序断言）」；交付 lab-versions.test.ts 仅断言**源**顺序（main.tsx 首个 import）与 zod-jitless.ts 内容，未读产物。核验以自建脚本补齐产物级断言：config 调用（`({jitless:!0})` @329568）先于全部 137 处 `.object({` 构建调用 → 语义成立，TC-092 仍判 PASS；此为交付测试覆盖缺口（非产品缺陷），建议后续补入 lab-versions。
2. **§10.13 报告③末行 git stat 标签与口径不符**：报告写「`git diff --stat v0.1.6`（已跟踪文件…）：12 files changed, 3,123 insertions(+)」；实测全量 `git diff --stat v0.1.6..HEAD` = **38 files / 6,053 insertions / 109 deletions**（含 26 个新增文件）；报告数字实为「仅修改（M）文件」口径（实测 M-only = 11 files / 3,132 / 109，差 1 文件 ≈ .pi-loop.json 运行时漂移）。三组归类表本身准确；末行 stat 标签失准为报告瑕疵，不触 TC-096 FAIL 判据（缺维/缺证据/样本<5/预设立场/无升级评估均未发生）。
3. **TC-097 门禁口径注**：TC-087 为 P1 尽力不计门禁（澄清 #18）——本次实测 PASS，无影响。
4. **核验方法披露（基线构建伪影）**：以 symlink node_modules 构建基线会使 esbuild 将依赖路径解析为 `../<主仓>/node_modules/...` 并写入产物注释（实测 main.js 膨胀 1,422 B）；核验改用硬链接拷贝消除伪影后基线 main.js = 586,752 B，与 FR 文本引用的 v0.1.6 实测值**精确一致**（交叉印证）。交付 lab-metrics.mjs 的基线构建采用 symlink（其宿主 bundle 无 node_modules 打包、不受伪影影响，增量值不受影响）。
5. **交付套件序列化边界处理正确**：核验 harness 初版以引用直传进程内 postMessage 被 bridge 侧 `uiMessages` 就地变更污染（history_loaded 事件载荷被后续变异）；交付套件 FakeWebview 用 `structuredClone` 正确模拟真实 postMessage 快照语义。核验 harness 修正后一致——实现侧无缺陷，此处记录为核验过程中的独立验证收获。
6. **外部锚点受限 2 处**：raw.githubusercontent.com/microsoft/vscode（theme-defaults，#18）超时不可达——fixture 文件头已注明来源与取样 commit，且该锚按用例定位「仅作理解，期望口径以 FR 文本为准」；react.dev 页面客户端渲染无法静态核对「Prevents Injection Attacks」节名（#15 辅助锚）。其余 10 处锚点（官方指南 6 处逐字 + README 节名 + tarball 源码 3 文件 + core 类型面 + 测试床 fixtures/route.ts + pi json.md L30-46）全部证实，见 evidence-t9/ANCHORS/。
7. **lab-metrics 侵入面扫描包含核验产物**：交付 lab-metrics 复跑时未跟踪文件栏出现核验 harness（.t9harness/）与证据文件——核验活动所致噪音，其 `frozenTouched: []` 结论不受影响（跟踪文件判定）。

## 7. FR-AUI-01~06 逐条结论

| FR | 结论 | 判定载体 |
|---|---|---|
| FR-AUI-01 独立实验面板·默认零变更 | **满足**（①③ TC-077；② TC-078；真机面 TC-079 MANUAL 兜底成立） | 自动 PASS |
| FR-AUI-02 双切片最小垂直切片 | **满足**（①②③ TC-085/086；④ TC-080；⑤ TC-081（TC-082 MANUAL 兜底成立）；⑥ TC-083（TC-084 MANUAL 兜底成立）） | 自动 PASS |
| FR-AUI-03 golden 回放数据源 | **满足**（① TC-085/086；② P1 TC-087 亦过；③ TC-088） | 自动 PASS |
| FR-AUI-04 主题映射验证 | **满足**（①② TC-089；③ TC-090 MANUAL 兜底成立） | 自动 PASS |
| FR-AUI-05 风险门禁证据 | **满足**（① TC-091+报告升级评估；② TC-092（TC-093 MANUAL 兜底成立）；③ TC-094；④ TC-095 MANUAL 兜底 = TC-077(d) 成立） | 自动 PASS |
| FR-AUI-06 双切片对比报告 | **满足**（TC-096：四维齐备、证据可复现、结论中立） | 自动 PASS |

## 8. §8-7 出口门禁组合结论（TC-097 口径）

**PASS。** ①阶段①全部 P0 自动 TC（TC-077/078/080/081/083/085/086/088/089/091/092/094/096）全 PASS；②6 项真机/DOM 层 TC（079/082/084/090/093/095）按四值 MANUAL、全部自动兜底 PASS；③双切片对比报告交付（TC-096 PASS，度量独立复算一致）；④默认面板零变更回归（TC-078 PASS + 既有套件全绿 ×2 轮 + 断网全绿 + 并行 5× 全绿）。阶段①出口门禁达标，可提交总调度出口裁决（路线选择归属 = 总调度，报告结论中立未预设）。

## 9. 遗留与建议

- 6 项真机 MANUAL（TC-079/082/084/090/093/095）待真机会话执行（可在一次会话内完成，含 TC-093 的 CSP 零 violation 与 TC-082 的哨兵核对）。
- 建议：①lab-versions 补产物级 jitless 顺序断言（核验脚本可复用，见 evidence-t9/TC-092/t9-csp.mjs）；②§10.13 报告③末行 stat 标签改为全量口径或注明「仅 M 文件」。

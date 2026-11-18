# Sdysyhj 验证剧本（核验阶段，TASK-001）

> 产出：测试 Agent（核验阶段）｜ 版本：**v2.0**（R2 重订）｜ 日期：2026-11-18
>
> 被测标签：`ready-for-verify-r2`（commit ce2c7a23aa1ef9adb65c13a941197e13437aeaf5）
> 基线：docs/requirements.md **v0.2.2**（含 §12 澄清 #1-#13）、docs/test-cases.md **v0.2**（TC-001~TC-046，含 §0 执行约定）
> 本版变更（相对 v1.1）：① 被测标签/路径更新为 R2；② 按 v0.2.2 口径 #11/#12/#13 钉死状态流、消息数、拦截语义断言；③ 哨兵改执行时随机生成（test-cases v0.2）；④ 新增 **SC-xxx ↔ 交付套件输出映射表**（§2.4）与压力抽查规程（§3.6）；⑤ 吸收 R1 执行期发现（/tmp/node_modules 残留垫片混淆项，§1.4）。
>
> 本剧本只定义**执行口径与环境**，不降低任何 TC 的期望断言；凡剧本口径与 TC 期望冲突，以 TC 期望判定并上报歧义。

---

## 1. 环境搭建（ENV-SETUP，所有 TC 默认继承）

### 1.1 干净检出

```bash
git clone /data/workspace/Sdysyhj /tmp/sdysyhj-verify-r2
cd /tmp/sdysyhj-verify-r2
git checkout ready-for-verify-r2
git status --porcelain        # 必须为空
git describe --tags           # = ready-for-verify-r2（证据头）
git rev-parse HEAD            # = ce2c7a23aa1ef9adb65c13a941197e13437aeaf5
```

### 1.2 公共环境变量（继承 test-cases §0.2）

```bash
export HOME="$(mktemp -d)"                       # 隔离 ~/.pi/agent
export WORKSPACE=/tmp/sdysyhj-verify-r2
export MOCKLOG="$(mktemp -d)"                    # mock 调用记录 + 证据输出
export SENTINEL="PI_TEST_SENTINEL_$(head -c8 /dev/urandom | od -An -tx1 | tr -d ' \n')"   # 执行时随机（v0.2）
npm ci                                           # 唯一允许访问 registry 的步骤
```

硬性约束（继承 test-cases §0.2）：不依赖真实 API key；不依赖外网（npm ci 例外）；会话/配置只落临时 HOME；核验脚本全部写在 `/tmp`（本剧本使用 `/tmp/r2harness/`），不向被测仓库写任何文件。

**ENV-SETUP 硬化（沿自 v1.1）**：宿主可能预置 `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR`，击穿 HOME 隔离——所有运行必须 `unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`（见 `/tmp/r2harness/run.sh`）。webview DOM 断言使用宿主离线 jsdom（不新增安装）。

### 1.3 判定口径（沿自 v1.1，报告同步声明）

1. 以每条 TC 的**期望结果语义**为判定基准；命令/脚本作为证据生成器。
2. TC 机械判据（脚本退出码/扫描）与语义不一致时（如脚本缺陷导致任何合规实现均不可满足），按语义判定并**逐条披露字面结果**，不得隐藏。
3. 产品行为与基线语义不符（含口径钉死的具体预期值，如口径 #12 的 4/10/18 与 8）一律 FAIL，归类"口径/行为缺陷"。
4. R2 口径钉死项（requirements v0.2.2 §12）：
   - **#11 运行状态**：中止后状态流必须 `streaming→aborted→idle`（aborted 为瞬态，终态 idle，"已中止"是消息级标记）——TC-009(c)/TC-014(b2)/TC-037(c2) 按此断言；
   - **#12 消息数**：= user + assistant 总数——TC-017 期望 **4/10/18**、TC-046 期望 **8**；
   - **#13 FR-SESS-07**：检测到外部修改后必须**拦截后续交互直至刷新完成**（或自动刷新）；仅驻留提示继续受理 = FAIL——TC-022(b) 按此断言，并验证刷新后交互恢复。

### 1.4 混淆项控制（R2 执行期发现）

宿主 `/tmp/node_modules` 可能残留 `@earendil-works/pi-coding-agent`（R1 脚手架"路径垫片"），恰好位于打包布局回退探测的逐级向上路径上——旧版解析逻辑在生产布局下可能**借该垫片假成功**。生产布局回归（缺陷#1）必须：
1. 布局独立构造于 `/tmp/r2-vpkg`（`dist/extension.js` + `node_modules/`），见 `evidence-r2/TC-035/build-vpkg-r2.mjs`；
2. 以 spawn 拦截记录**实际启动的 cli 路径**，断言其指向 `<布局>/node_modules/…`（防垫片混淆），见 `evidence-r2/TC-035/defect1-prod-layout-r2.cjs` 断言 (d)。

### 1.5 三平台口径（沿自 v1.1）

单机 Linux（无 Windows/macOS 矩阵、无图形界面）：
- UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025）→ **MANUAL**，列遗留不计 FAIL；FR 门禁以其自动兜底 TC 判定。
- TC-042(c) 三平台 CI 日志、TC-045 的 vsix 打包/`code --install-extension` → 本环境无法产出证据，列**遗留**；TC-042/TC-045 的可自动执行子项仍逐条执行并记证据。
- 所有 Linux 单平台可执行的断言一律执行，不得以"环境限制"豁免。

## 2. Mock provider（两层）与 SC-xxx 映射

### 2.1 L1：pi RPC mock 子进程（MOCK-* 规范 stub）

`/tmp/r2harness/mock-pi.js`：按 `pi --mode rpc` JSONL 约定实现确定性 stub，请求记录追加 `$MOCKLOG/calls.jsonl`（§0.3 契约）；MOCK-STREAM/THINK/TOOLS/SLOW/ERROR/CRASH/BIG/MODELS/STDERR 场景由 prompt 文本或 `MOCK_SCENARIO` 触发；会话持久化 `$HOME/.pi/agent/sessions/--<enc>--/*.jsonl`（pi session-format 条目）。`/tmp/r2harness/bin/pi` 为 PATH 假 pi（记录调用 + `--version` 返回 1.99.0-mock + 转交 stub）。

### 2.2 L2：真实内置 pi 运行时 + 本地 mock provider（127.0.0.1）

`/tmp/r2harness/mock-openai.js`（OpenAI 兼容 SSE，确定性，零外网）+ 临时 HOME `models.json`（mockllm provider，apiKey=MOCK-DUMMY-KEY，不预置 auth.json，§12 #9）。用于 TC-035(b)/TC-045 与缺陷#1 生产布局对话。

### 2.3 装配层

- **宿主链路**：vscode API stub（`/tmp/r2harness/node_modules/vscode/index.js`）+ `src/extension.ts` activate() 全链路（命令、QuickPick、状态栏、Output Channel、cwd、运行时解析、会话管理、日志）。
- **webview**：jsdom 加载 `webview/main.ts` 打包产物（esbuild IIFE）+ `webview/render/markdown.ts`，驱动宿主→webview 消息断言 DOM。
- **构建**：`/tmp/r2harness/build.mjs`（esbuild CJS/IIFE，只读被测检出）。

### 2.4 SC-xxx ↔ 交付套件输出映射（R2 建立）

交付套件（vitest：`test/unit` 91 项 + `test/integration` 29 项，命名见 `evidence-r2/_suites/verbose-names.txt`）未使用 SC-xxx 命名，本表按行为等价建立映射；**"核验判定证据"列为本轮逐 TC 独立执行的证据**（套件输出 `evidence-r2/_suites/`，一次性脚本 `evidence-r2/<TC-id>/`）；套件与独立脚本互为佐证，判定以独立脚本断言为准。

| SC | 逻辑场景 | 交付套件等价输出（verify:unit / verify:integration） | 核验判定证据（独立执行） |
|---|---|---|---|
| SC-001 | 流式 delta 渲染与状态流 | unit: `piBridge > prompt → 流式 → settled 全链路；run_state starting→streaming→idle`；integration: `pi-bridge > 启动 → prompt → 工具调用链 → settled` | TC-001/script.cjs（5/5） |
| SC-003 | Markdown 全要素渲染 | unit: `text > truncateToTail`/`redact` 等不覆盖渲染；套件无渲染断言 → 映射到 webview 脚本 | TC-003/script.cjs（7/7，jsdom DOM） |
| SC-005 | thinking 折叠 | unit: `piBridge > 工具卡片/事件翻译`（thinking 事件翻译）；integration: `pi-bridge > 启动 → prompt → …（含 thinking 事件）` | TC-005/script.cjs（6/6） |
| SC-007 | 工具卡/大输出截断/复制全部 | unit: `piBridge > 工具卡片：执行状态 + 输出截断保留尾部 + 复制全部取全量` | TC-007/script.cjs（11/11） |
| SC-009 | abort + 状态恢复 | unit: `piBridge > abort：…streaming→aborted→idle（缺陷#3 回归）`；integration: `rpc-client > abort：LONG 运行中中止` | TC-009（静态+script.cjs，5/5） |
| SC-011a/b | steer/follow-up | unit: `piBridge > 运行中发送 → steer 排队 / follow-up 模式`；integration: `rpc-client > steer/followUp 排队`、`pi-bridge > steer 插话排队` | TC-011/script.cjs（6/6） |
| SC-013a/b/c | 三类异常错误卡 | unit: `piBridge > prompt 被拒 / provider 报错 / 子进程崩溃自动重启`；integration: `pi-bridge > 错误运行（ERROR）`、`子进程崩溃 → 自动重启一次` | TC-013/script.cjs（10/10） |
| SC-014 | 状态四字段与状态流 | unit: `piBridge > prompt → 流式 → settled…`（model_info/run_state 事件） | TC-014/script.cjs（9/9） |
| SC-016 | 新建会话+落盘 | unit: `piBridge > 新建/切换会话：session_reset + 历史重建`；integration: `pi-bridge > 新建会话清空历史` | TC-016（静态+script.cjs，4/4） |
| SC-017 | 历史列表（消息数口径 #12） | unit: `sessionStore > listSessions 解析标题、消息数、时间` | TC-017/script.cjs（4/4，4/10/18） |
| SC-018 | 切换恢复上下文 | unit: `sessionStore > listSessions…`；integration: `pi-bridge > FR-SESS-03：切换会话重放历史与会话 JSONL 一致（含压缩状态条目）` | TC-018/script.cjs（3/3） |
| SC-019 | 重命名 | unit: `piBridge > 会话命名（FR-SESS-04）`；integration: `rpc-client > 响应 id 关联与命令覆盖（…session_name）` | TC-019/script.cjs（3/3） |
| SC-021 | 单活动会话 | unit: `piBridge > 新建/切换会话…` | TC-021（静态+script.cjs，4/4） |
| SC-022 | 外部修改拦截（口径 #13） | unit: `sessionStore > SessionFileWatcher…`、`piBridge > 缺陷#4 回归：…拦截并引导刷新；刷新后恢复`；integration: `defects-regression > 缺陷#4…` | TC-022/script.cjs（7/7） |
| SC-023a/b/c | cwd 绑定 | unit: `config > readConfig`（无 cwd）；integration: spawn 参数断言（`rpc-client > 启动 spawn…`） | TC-023/script.cjs（5/5） |
| SC-024 | @file 引用 | 套件无覆盖 → 一次性脚本 | TC-024/script.cjs（6/6） |
| SC-026 | 右键发送 | 套件无覆盖 → 静态菜单断言 + 一次性脚本 | TC-026（静态+script.cjs，4/4） |
| SC-027 | 切模型 | unit: `piBridge > 模型切换后 model_info 更新`；integration: `rpc-client > …get_state/set_model/thinking…` | TC-027/script.cjs（5/5） |
| SC-028 | 切 thinking | unit: `piBridge > thinking 等级切换/循环` | TC-028/script.cjs（2/2） |
| SC-029 | 会话内持久 | unit: `sessionStore > listSessions…` + mock 持久化 | TC-029/script.cjs（1/1） |
| SC-030 | 五命令注册 | 静态 manifest 断言（无套件） | TC-030/output.txt |
| SC-031 | stderr/协议异常入日志（缺陷#2） | unit: `rpcClient > 无法解析的行进入 onAnomaly`、`onStderr：行缓冲转发…`、`stderr-ordering > 排空屏障…`；integration: `defects-regression > MOCK-STDERR…`、`stderr 无换行尾部…` | TC-031/script.cjs（4/4） |
| SC-032 | slash 文本直发 | integration: `pi-bridge > 启动 → prompt → …`（prompt 透传） | TC-032/script.cjs（2/2） |
| SC-035a-d | 运行时来源 | unit: `runtime > resolvePiRuntime …`（含版本判据）；integration: `runtime-resolve > …`（真实探测） | TC-035/script.cjs（9/9）+ 缺陷#1 布局复现（5/5） |
| SC-036 | 10k tokens 代理 | integration: `pi-bridge > NFR-01 代理：≥600 delta 零丢失 + 全量渲染 ≤30s` | TC-036/script.cjs（3/3） |
| SC-037 | 面板重开不丢状态 | 套件无覆盖 → 一次性脚本 | TC-037/script.cjs（5/5） |
| SC-038 | 崩溃重启/宿主隔离 | unit: `piBridge > 子进程崩溃自动重启一次…`；integration: `pi-bridge > 子进程崩溃 → 自动重启一次…`、`dispose 强制停止子进程` | TC-038/script.cjs（6/6） |
| SC-039 | 日志脱敏 | unit: `redact > redactSecrets…`/`createRedactingLogger`、`piBridge > 缺陷#2 回归：…并脱敏` | TC-039/script.sh（随机哨兵零命中） |
| SC-040 | 防 XSS | 套件无覆盖 → jsdom 一次性脚本（渲染入口） | TC-040/script.cjs（28/28） |
| SC-041 | 会话位置 | unit: `sessionStore > encodeSessionDirName/defaultSessionsRoot` | TC-041/script.sh + 归因注记 |
| SC-042 | 版本门槛/打包 | 静态断言 + 依赖扫描 | TC-042/output.txt |
| SC-043 | 关键路径日志（缺陷#6） | unit: `piBridge > 缺陷#6 回归：…4 类齐全`；integration: `defects-regression > 缺陷#6…` | TC-043/script.cjs（5/5） |
| SC-044 | 卸载无残留 | 静态扫描（无套件） | TC-044/output.txt |
| SC-045 | 端到端组合 | integration: `runtime-resolve > 内置运行时冒烟（离线）` + 上述组合项 | TC-045/script.cjs（8/8，L2）+ 布局复现 |
| SC-046 | 重启后历史恢复（消息数 8） | integration: `pi-bridge > FR-SESS-03…`、`rpc-client > switch_session 恢复消息` | TC-046/script.cjs（3/3，messageCount=8） |

## 3. 执行顺序

1. ENV-SETUP（1.1/1.2），记录 `git describe --tags`、OS/Node/日期为证据头。
2. `npm run verify:unit` 与 `npm run verify:integration` 全量执行，输出全文存证（`evidence-r2/_suites/`）。
3. 逐 TC 执行（TC-001~046）：套件等价项引用套件输出并以独立脚本复核；套件未覆盖项按 FR 追溯表定位入口，以 `/tmp/r2harness/` 一次性脚本执行（脚本全文 + 输出存证）。
4. 一次性脚本分层（同 v1.1）：静态脚本（TC-009/016/021/026/030/042 原文 `node -e`）；宿主链路脚本；webview 脚本（jsdom）；真实运行时脚本（L2，TC-035b/TC-045/缺陷#1 布局）。
5. **压力抽查（§3.6）**：`npm run verify:integration` 连跑 5 次，与 `npm run verify:unit` 并行负载同跑（历史竞态项：stderr/settled 顺序、退避重发）。
6. 证据归档 `docs/verification/evidence-r2/<TC-id>/`：`cmd.txt`、`output.txt`（大输出截断须注明）、`script.*`（一次性脚本原文）。

### 3.6 压力抽查规程

并行负载 = 后台循环 `npm run verify:unit`（4 轮，作 CPU/进程负载）；前台 `npm run verify:integration` 连跑 5 次；5 次退出码均须 0 且各 29/29 绿，否则 FAIL 并附逐次输出（`evidence-r2/_stress/`）。竞态专项由 unit `stderr-ordering.test.ts`（排空屏障顺序保证）+ 本抽查共同覆盖。

## 4. 判定等级与规则

| 等级 | 适用 | 规则 |
|---|---|---|
| 自动 | 命令/脚本退出码 + 显式断言 | PASS = 断言全成立；FAIL = 任一不成立或套件红（附证据） |
| UI 手工 checklist | TC-002/004/006/008/010/012/015/025 | **MANUAL**（无图形界面），列遗留；FR 门禁以其自动兜底 TC 判定 |
| 环境受限 | TC-042(c)、TC-045 vsix 安装部分 | 可自动子项逐条执行记证据；受限子项列**遗留**不计 FAIL |
| 延后（二期） | TC-020/033/034（P2） | **SKIP（DEFERRED）**，不计入门禁 |

- 每 TC 只给一个判定：PASS / FAIL / SKIP / MANUAL。
- FAIL 必附：复现步骤 / 期望 / 实际 / 证据引用。
- NFR 安全专项：TC-039 须有随机哨兵 `rg -F` 扫描输出（断言对象限被测产物/日志，docs/ 与 auth.json 显式豁免）；TC-040 须有 7 载荷逐一注入 + 渲染产物/执行痕迹输出。
- 需求歧义按 requirements §12（含 #11/#12/#13）执行；未覆盖而影响判定的歧义列入遗留，判定从 TC 字面期望。

## 5. 门禁与结论

- MVP 门禁 = 全部 P0 FR 的自动兜底 TC 通过（§8-5、§12 #1：P2 不入门禁）。
- 逐 FR 结论：PASS / FAIL / PARTIAL（P2 延后项显式标"二期"）。
- 总结论：PASS（门禁 FR 全通过）或 FAIL（附缺陷清单）。

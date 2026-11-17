# Sdysyhj 验证剧本（核验阶段，TASK-001）

> 产出：测试 Agent（核验阶段）｜ 版本：v1.0 ｜ 日期：2026-11-17
>
> 被测标签：`ready-for-verify`（commit e9ae693）
> 基线：docs/requirements.md v0.2.1（含 §12 澄清 10 项）、docs/test-cases.md（TC-001~TC-046，含 §0 执行约定）、docs/technical-design.md §10（FR 追溯表）
>
> 本剧本将 test-cases.md §0 的执行约定整理为可执行步骤。剧本只定义**执行口径与环境**，不降低任何 TC 的期望断言；凡剧本口径与 TC 期望冲突，以 TC 期望判定并上报歧义。

---

## 1. 环境搭建（ENV-SETUP，所有 TC 默认继承）

### 1.1 干净检出

```bash
git clone /data/workspace/Sdysyhj /tmp/sdysyhj-verify
cd /tmp/sdysyhj-verify
git checkout ready-for-verify
git status --porcelain        # 必须为空
git describe --tags           # 证据头（= ready-for-verify）
git rev-parse HEAD            # 必须 = e9ae693...
```

### 1.2 公共环境变量

```bash
export HOME="$(mktemp -d)"                       # 隔离 ~/.pi/agent
export WORKSPACE=/tmp/sdysyhj-verify
export MOCKLOG="$(mktemp -d)"                    # mock 调用记录 + 证据输出
export SENTINEL="PI_TEST_SENTINEL_7f3a9c21"      # 哨兵假凭证
npm ci                                           # 唯一允许访问 registry 的步骤
```

硬性约束（继承 test-cases §0.2）：不依赖真实 API key；不依赖外网（npm ci 例外）；会话/配置只落临时 HOME；核验脚本全部写在 `/tmp`（本剧本使用 `/tmp/vharness/`），不向被测仓库写任何文件。

**ENV-SETUP 硬化（v1.1 补充，执行期发现）**：核验宿主环境可能预置 `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR`（指向真实 HOME），会击穿 HOME 隔离——所有运行必须 `unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT`（见 `/tmp/vharness/run.sh`）。另：执行期发现宿主环境离线已有 jsdom（依赖解析自宿主路径，非新增安装），用于 webview DOM 断言；不向任何仓库/registry 写入。

### 1.3b 判定口径（v1.1 补充，报告同步声明）

1. 以每条 TC 的**期望结果语义**为判定基准；命令/脚本作为证据生成器。
2. TC 机械判据（脚本退出码/扫描命令）与语义不一致时（如脚本缺陷导致任何合规实现均不可满足），按语义判定并在报告中**逐条披露字面结果**，不得隐藏。
3. 产品行为与基线语义不符（含口径钉死的具体预期值）一律 FAIL，归类“口径/行为缺陷”，不得因“意图可接受”而转 PASS。

### 1.3 三平台口径

本核验环境为单机 Linux（无 Windows/macOS 矩阵、无图形界面）。按任务裁决：

- UI 手工 checklist TC（TC-002/004/006/008/010/012/015/025）→ 记 **MANUAL**，列遗留问题，不计 FAIL；以其自动兜底 TC 判定对应 FR 门禁。
- TC-042(c) 三平台冒烟 CI 日志、TC-045 的 vsix 安装部分（需 VS Code 宿主 `code --install-extension`）→ 本环境无法产出证据，列**遗留问题**（三平台/安装矩阵未覆盖）；TC-042/TC-045 的可自动执行子项仍逐条执行并记证据。
- 所有 Linux 单平台可执行的断言一律执行，不得以"环境限制"豁免。

## 2. Mock provider 搭建（两层）

### 2.1 L1：pi RPC mock 子进程（MOCK-* 规范 stub）

被测插件的 RPC 桥接层（PiBridge/RpcClient/协议层）以 `/tmp/vharness/mock-pi.js` 驱动：它按 `pi --mode rpc` JSONL 约定实现确定性 stub，将每条收到的请求（方法名 + 参数摘要）追加到 `$MOCKLOG/calls.jsonl`（§0.3 契约），并按下表实现 MOCK-* 场景（由 prompt 文本触发）：

| 场景 | stub 行为（对齐 §0.3） |
|---|---|
| MOCK-STREAM | prompt → text delta `d1..d8`（间隔 30ms）→ message_end → agent_settled |
| MOCK-THINK | thinking delta `t1..t4` → text delta `d1..d3` → 结束 |
| MOCK-TOOLS | 工具链 read(a.ts,成功,输出20行) → edit(a.ts,成功) → bash(`seq 1 20000`,成功,stdout≈100KB) → text `d1..d2` 结束 |
| MOCK-SLOW | 每 200ms 一个 text delta，共 600 个，不主动结束（直至 abort） |
| MOCK-ERROR | prompt → message_end(stopReason=error, errorMessage 含 rate limited/429) |
| MOCK-CRASH | prompt → 子进程 exit(1) |
| MOCK-BIG | 一次输出 600 个 text delta 后结束 |
| MOCK-MODELS | get_available_models→[mock-small,mock-large]；set_model/set_thinking_level/cycle_thinking_level/set_session_name/abort 均记录调用 |
| MOCK-STDERR | stderr 写 `E2E-STDERR-MARKER` 行，随后输出 1 行非法 JSONL（协议异常） |

stub 同时实现会话持久化（`$HOME/.pi/agent/sessions/--<enc>--/*.jsonl`，条目格式对齐 pi session-format：`session`/`session_info`/`message` 类型行），使 TC-016/017/018/019/022/046 的落盘断言作用于真实文件。

### 2.2 L2：真实内置 pi 运行时 + 本地 mock provider（127.0.0.1）

TC-035(b)/TC-045 的"内置运行时开箱即用对话成功"要求真实 `@earendil-works/pi-coding-agent` 的 `dist/bundle/cli.js --mode rpc` 能完成对话。按 pi 文档（models.md "Configure a compatible endpoint"）在临时 HOME 配置：

```json
// $HOME/.pi/agent/models.json
{
  "providers": {
    "mockllm": {
      "baseUrl": "http://127.0.0.1:<port>/v1",
      "api": "openai-completions",
      "apiKey": "MOCK-DUMMY-KEY",
      "models": [{ "id": "mock-small" }, { "id": "mock-large" }]
    }
  }
}
```

mock provider 为 `/tmp/vharness/mock-openai.js`（127.0.0.1 HTTP，OpenAI completions 流式 SSE，确定性输出，零外网）。凭证侧不预置 auth.json（§12 #9 离线等价口径）。

## 3. 执行顺序

1. ENV-SETUP（1.1/1.2），记录 `git describe --tags`、OS/Node 版本为证据头。
2. `npm run verify:unit` 与 `npm run verify:integration` 全量执行，输出全文存证；按行为定位与 SC-xxx/TC 的映射（注意：交付套件**未使用 SC-xxx 场景命名**，映射以测试名与断言内容为准，偏差记入遗留问题）。
3. 逐 TC 执行：套件已覆盖且断言与 TC 期望等价 → 引用套件输出；否则按 FR 追溯表定位入口，在 `/tmp/vharness/` 写一次性脚本执行（脚本全文 + 输出存证）。
4. 一次性脚本分层：
   - **静态脚本**：test-cases 中给定的 `node -e` manifest 断言（TC-009/016/021/026/030/042）按原文执行。
   - **宿主链路脚本**：vscode API stub（`/tmp/vharness/vscode-stub`）+ `src/extension.ts` activate() 全链路 + L1 mock（覆盖命令注册、QuickPick、状态栏、Output Channel、cwd 绑定、运行时解析、会话管理、日志）。
   - **webview 脚本**：jsdom（宿主环境离线已有，不引入新依赖）加载 `webview/main.ts` 打包产物 + `webview/render/*`，驱动宿主→webview 消息，断言 DOM（渲染、折叠、工具卡、状态栏、XSS）。
   - **真实运行时脚本**：L2 mock provider + 内置 cli.js（TC-035b、TC-045 组合链路）。
5. 证据归档 `docs/verification/evidence/<TC-id>/`：`cmd.txt`（执行命令）、`output.txt`（命令输出全文；截断须注明）、`script.*`（一次性脚本原文）。

## 4. 判定等级与规则

| 等级 | 适用 | 规则 |
|---|---|---|
| 自动 | 命令/脚本退出码 + 显式断言 | PASS = 断言全成立；FAIL = 任一不成立或套件红（附证据） |
| UI 手工 checklist | TC-002/004/006/008/010/012/015/025 | 判 **MANUAL**（无图形界面），列遗留；FR 门禁以其自动兜底 TC 判定 |
| 延后（二期） | TC-020/033/034（P2） | 记 **SKIP（DEFERRED）**，不计入门禁 |

- 每 TC 只给一个判定：PASS / FAIL / SKIP / MANUAL。
- FAIL 必附：复现步骤 / 期望 / 实际 / 证据引用。
- NFR 安全专项：TC-039 须有 `rg -F $SENTINEL` 全量扫描输出；TC-040 须有 7 载荷逐一注入 + 渲染产物/执行痕迹输出。
- 需求歧义按 requirements §12 裁决口径执行；§12 未覆盖而影响判定的歧义列入遗留问题，判定从 TC 字面期望。

## 5. 门禁与结论

- MVP 门禁 = 全部 P0 FR 的自动兜底 TC 通过（§8-5、§12 #1：P2 不入门禁）。
- 逐 FR 结论：PASS / FAIL / PARTIAL（P2 延后项显式标"二期"）。
- 总结论：PASS（门禁 FR 全通过）或 FAIL（附缺陷清单）。

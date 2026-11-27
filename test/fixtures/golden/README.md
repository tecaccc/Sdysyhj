# Golden fixture（协议级兜底证据，TASK-008 §10.12 D8）

本目录存放**真实 pi 事件序列的静态转录**，作为"自建 mock 自证"的兜底（开发规范第一部分 §4.3）：
回放测试以这些录制序列为期望源，校验 Sdysyhj 对 user 回声、steer/follow-up 注入时序、settled
边界的处理——期望不来自我方 mock 的行为。

| 文件 | 剧本 | 覆盖 |
|---|---|---|
| `golden-prompt-basic.jsonl` | 单次 prompt → user 回声 → assistant 流式 → settled | FR-CHAT-11 ①④；json.md「Event sequence」L30–46 |
| `golden-steer-followup.jsonl` | 运行中 follow_up（先发）+ steer（后发）混合注入 | FR-CHAT-11 ②④；rpc-commands.md L46–92、json.md L121–122；**乱序投递实证**（steer 回声先于 follow_up 回声到达） |
| `golden-timing-interleave.jsonl` | 时序交织类①（synthetic 留痕）：prompt → turn 边界 entry_appended 落盘 → 流式中途 steer 入队（轮间边界投递 + 落盘）→ 终稿落盘 → settled → 末条 get_messages（刷新通道） | **P-06 类别①（TASK-011 批次 D / Issue #7 R-06）**：#D-01 落盘 × watcher 轮询 × markSynced 窗口；FR-SESS-07 外部修改检出/刷新；见下「剧本类别覆盖表」 |

## 剧本类别覆盖表（P-06，TASK-011 批次 D 落地 2026-11-27）

四类剧本义务（review report 2026-11-25 §D①/P-06）：涉及相关 FR 的批次须声明「已覆盖哪类 / 豁免留痕」；
本表为判定载体（DevelopmentGuidelines 本地用例规范不动，覆盖表在此落地）。

| 类别 | 覆盖义务 | 状态 | 剧本 / 通道 |
|---|---|---|---|
| ① 时序交织 | pi 落盘 × watcher 轮询 × markSynced 窗口交织（#D-01 / #D-02）；须扩展回放层文件系统面 | **已落地（TASK-011 D）** | `golden-timing-interleave.jsonl`（synthetic 留痕）；回放层 fs 面 = fake-pi-cli.js `replayOutRecord`（FAKE_PI_SESSION_FILE 时 entry_appended 事件行同步物理落盘）+ 真实 `SessionFileWatcher`；测试 = `golden-replay.test.ts` I5（协议级：零误报/检出/零复发）+ `ui-golden-dom.test.ts` 时序交织 describe（UI 状态：横幅出现/消失/零复发） |
| ② 会话生命周期 | new session / switch / 重启续接（resume；G3：get_state sessionName/sessionFile 恒归一化定值） | 遗留 | —（待录：需录制管道支持 --session 续接剧本） |
| ③ 异常路径 | 错误事件 / 子进程崩溃重启（G2：录制健全性门 golden-driver 剔除异常 trace——允许人工构造 synthetic trace，标注来源与录制门并行不悖） | 遗留 | —（待建 synthetic 异常 trace 剧本） |
| ④ 多轮 / 中止 | settled 后续轮、abort 中止（G4：现有 fixture 恒 aborted:false） | 遗留 | —（待录多轮连续/abort 剧本） |

**synthetic 剧本留痕规则**（P-06 ③口径，类别①同适用）：stdin/stdout 转录无法捕获文件系统面，
真实录制管道（`--no-extensions`）亦不产生 entry_appended——故时序交织类剧本为人工构造 synthetic
trace，须在 fixture 头注释标注来源（synthetic 声明 + 事件形状锚点文档行号），与录制健全性门并行不悖；
期望值仍以事件形状权威文档（json.md / rpc-commands.md）与既有真实录制序列骨架为锚。

## 格式

- 每行一个 JSON：`{"dir":"in","record":{…}}` = 录制时写入 pi stdin 的命令；`{"dir":"out","record":{…}}`
  = pi stdout 的响应/事件，**按到达序**与 in 交错。
- 行首 `#` 为注释（录制命令/日期/pi 版本/provider 配置/脱敏声明），回放器加载时剥离；
  rpcClient 永不接触本文件。
- 回放（`FAKE_PI_REPLAY=<fixture>`，见 `test/helpers/fake-pi-cli.js` 文件头）：启动时回放首个
  in 前的全部前置事件；此后 stdin 每收到一条命令即与录制游标做一致性断言（type+message），
  命中后回放该命令的响应及其后至下一 in 前的全部事件行。无脚本分支、无时钟、零网络。
- **回放层文件系统面**（TASK-011 批次 D，G1 封堵）：`FAKE_PI_SESSION_FILE` 设置时，回放的
  `entry_appended` 事件行同步物理落盘该条目（可注入 fs stub = 环境变量指定路径）——时序交织类
  剧本（#D-01）由此可在 golden 通道复现「pi 落盘 × watcher 轮询 × markSynced 窗口」；未设置时
  与旧版一致（既有两剧本零影响）。

## 录制（再生成）

```bash
npm run record:golden                 # 全部剧本（等价 --scenario=all）
npm run record:golden -- --scenario=prompt-basic
npm run record:golden -- --scenario=steer-followup
```

- **不进 CI**（仅人工/维护触发；CI 只做回放，`verify:integration` 零网络）。
- 流程（`test/tooling/record-golden.mjs` → 打包 `test/tooling/golden-driver.ts`，转录经
  `test/tooling/pi-tee.mjs`）：内嵌 OpenAI 兼容 loopback mock server → 临时
  `PI_CODING_AGENT_DIR` 写 `models.json`（provider `golden/golden-mock`、api
  `openai-completions`、dummy key，锚点 models.md「Configure a compatible endpoint」L49–66）→
  临时 `PI_CODING_AGENT_SESSION_DIR` + `PI_OFFLINE=1` → 真实 pi（先 `pi --version` 确认
  1.5.2，PI_BIN 可指定；回退内置 `node_modules` 运行时）`--mode rpc`，经 PiBridge+RpcClient
  （与生产同链路）驱动固定剧本 → stdin/stdout 全量转录归一化落盘。
- **仅 loopback、无外网、无真实凭证**；prompt 文本为哨兵值。
- **确定性**：每剧本连录两次并逐字节比对（归一化后），一致才落盘；归一化项 =
  `timestamp`/`durationMs`→0、`sessionId`/`sessionFile`→定值、`127.0.0.1` 端口→`:0`、
  临时目录/pi 包路径/HOME→占位符。任意机器重录应得到相同字节（差异即录制不确定，脚本会拒绝落盘）。
- pi 启动参数固定：`--model golden/golden-mock --no-skills --no-extensions --no-mcp
  --no-context-files --no-prompt-templates --no-themes`（隔离机器差异；不影响被测事件契约）。

## 录制实证（2026-11-21，pi 1.5.2 PATH）

- RPC 模式确认回发 user 角色 `message_start`/`message_end` 回声（先于该轮助手消息），
  且伴随 system 角色回声（桥侧忽略非 user/assistant 角色）。
- 运行中注入：`follow_up` 先发后投、`steer` 后发先投——回声到达顺序 = 主 prompt → steer →
  follow_up；投递时 `queue_update`（出队快照）先于 user 回声到达（设计受控假设①实证：
  桥侧匹配不依赖两者先后）。
- 队列文本 = 回声文本（哨兵原文透传，无投递时点再变换；设计受控假设②实证）。

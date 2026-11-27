# 核验报告 report-ea0d0e51 ｜ #D-07（R-05 流式渲染性能回退）修复批次独立核验

> 产出：独立核验 Agent（fresh context，不携带研发 Agent 结论，研发输出仅作线索）｜ 执行窗口 2026-11-27 15:44–15:57 CST
> 核验对象：**工作区未提交改动**（`git diff`：webview/ui/store.ts +83 行 / test/unit/ui-store.test.ts +240 行），基线 commit `14f3f34`（main = origin/main）
> 判据：docs/tasks/TASK-010-r05-stream-perf-fix.md §2（四条硬约束）+ docs/review/report-2026-11-24.md §1 R-05（缺陷定义）
> 写权纪律：仅写本报告；探针全部置于 /tmp（用后已清理）；仓库源码/测试/其他文件零改动（`git status` 复核：仍仅研发两文件 M + 既有 `?? .pi-loop.json`）；无平台操作。

---

## ① 证据头（ENV）

| 项 | 值 |
|---|---|
| 被测形态 | 工作区未提交 diff（store.ts 通知层节流 + ui-store.test.ts 新增 fake timers 段 ⑮–⑳、改写 ⑬） |
| 基线 | `14f3f34617a9e200d0ca9d569a89be4c2572e2ec`（main，与 origin/main 一致） |
| OS / Node | Linux 5.14.0（RHEL 9 内核，无图形界面）/ Node v24.19.0 |
| 独立探针 | `/tmp/d07-probe/`：虚拟时钟（Date.now/setTimeout/clearTimeout 全接管，只前进不回拨）+ 手动 rAF 注入 EventBuffer，**直接驱动被测 store 源码的 esbuild 转译副本**（Node strip-only 不支持 TS parameter property，故经 `node_modules/.bin/esbuild --format=esm` 转译至 /tmp；纯转译零语义变换；官方门禁仍以 vitest 跑真实 TS 源）。探针共 **49 项独立断言，0 FAIL**（关键输出见附录 A；用后已删除） |
| 交付用例态度 | 仅作对照佐证（⑮–⑳ 名称与断言面已逐条读核），全部结论以自建探针独立重证 |

---

## ② 门禁亲复跑（不信自述，全部亲跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（exit 0，无输出） |
| `npm run verify:unit` | **PASS：21 文件 / 235 用例全绿**（4.38s；基线 229 → +6 新用例 ⑮–⑳；ui-store.test.ts 单跑 20/20 verbose 复核） |
| `npm run verify:integration` | **PASS：9 文件 / 41 用例全绿**（6.02s） |

与任务书 §2 验证条款（typecheck / unit 229 基线+新增 / integration 41）一致。golden DOM 单独复跑（ui-golden-dom.test.ts）stderr 无 act 警告。

---

## ③ 四条硬约束逐条独立验证（探针 P1–P5，49 断言全绿）

### a) 零丢失 / 零乱序：节流只影响通知时机，状态累积不受影响（getSnapshot 恒最新）—— **成立**

- **代码级**：`requestNotify` 只做通知时机决策，不触碰 `this.state`；reducer 折叠发生在决策之前（dispatch/dispatchMany 中 `this.state = next` 先于 `requestNotify`）。结构性保证「通知可延迟、状态不可延迟」。
- **探针 P2**：首窗内（零通知期）逐帧断言 `getSnapshot()` 文本 == 已推 delta 全量拼接（40 帧逐帧一致）；窗口内 10 次演进零通知（P2.2）而状态照常累积；尾随通知触发后快照 == 累积。
- **乱序**：text(idx0)/thinking(idx1)/toolcall_delta(idx2) 交错 30 事件——三块位逐字节拼接序全对（P2.4）；600 delta 跨多窗全量按序零丢失（P2.5，len 2890/2890）。
- **EventBuffer 冲刷序**（零丢失前置）：非 delta 事件前 `flush()` 先派发队列 delta 再派发自身——message_final 前置 delta 恒先入 state（P4.8/P5.15b：final 到达当下累积态 = 全量增量含末段）。

### b) 终态一致：message_final / run_state 终态后状态与逐事件 reduce 逐字节等价 —— **成立**

- 探针 P3（`JSON.stringify` 全量比对，同一虚拟时钟下 Date.now 派生字段同源）：富事件序列（run 起始 / text·thinking·toolcall 三类块 / usage_info / toast / message_final / **final 后迟到 toolcall_status** / idle）在三种时序变体下终态均与 `events.reduce(uiReducer, initialUiState)` **逐字节等价**：
  - 变体 A：半窗交错推进（P3.1）；变体 B：全窗合批零推进（P3.2）；变体 C：137ms 素数步长跨多窗 + 多次尾随触发（P3.3）；
  - **P3.4（严格口径）**：message_final 到达**当下**（未推进任何时钟）状态即与逐事件等价——不依赖后续窗口收敛。
- 交付用例 ⑯ 同口径复核一致（其 `vi.setSystemTime` 双侧同钟处理正确）。

### c) abort/急停立即冲刷、无悬挂 timer（flushNotify 先 clearTimeout）—— **成立**

- **flushNotify 代码级**：先 `clearTimeout + notifyTimer=null` 再 `lastNotifyAt=now` 再通知——即时冲刷取代尾随 timer，无悬挂路径。
- **探针 P4**：
  - 尾随 timer 挂起中（P4.1 pending=1）`run_state(aborted)` 到达 → **同步立即冲刷**（P4.2，零时钟推进）+ 冲刷时刻快照含全部增量（P4.3）+ 生产同序 aborted→idle 双冲刷（P4.4）+ 终态逐字节一致（P4.5）+ **5s 推进零新增通知、零 pending timer**（P4.6）；
  - message_final 到达时 timer 挂着 → 同步冲刷 + 3s 推进零新增零悬挂（P4.7–P4.9）；`run_state(error)` 同语义（P4.10–P4.11）；
  - 尾随 timer 自然路径：恰在窗口终点（lastNotify+300）通知一次（P4.12），触发后 10s 零幽灵通知（P4.13）。

### d) 频率上界：流式期间 ≤1次/300ms + 终态冲刷 —— **成立**

- **探针 P1**（60Hz×188 帧、每帧 5 delta、rAF 合批演进，虚拟时钟精确推进）：通知时刻序列 = `[0,300,600,…,3000]`，**相邻间隔恒 = 300ms（minGap=300）**；通知数 11 ≤ floor(3008/300)+2（P1.4）；实际频率 ≈3.3Hz（对 rAF ≤60Hz 全量重析的 18× 回退，收敛回旧实现 ≈3.3Hz 量级，P1.5）；
- run 起始（run_state starting）立即通知 = 流式期首事件（P1.1）；运行中 stream_start 入窗不通知（P1.2）；
- 终态冲刷豁免语义：message_final 距上次通知 8ms 也立即照发（P1.6/P1.7），run_state(idle) 同（P1.8），终态后 5s 零新增零悬挂（P1.9）。
- 真实环境推演：`delay = 300-(now-lastNotifyAt)` 使尾随触发点 ≥ lastNotifyAt+300（setTimeout 不早燃），即立即分支的两通知间距亦 ≥300ms——上界在真实时钟下不弱化。

---

## ④ 对抗性审查（重点逐项）

| # | 审查点 | 结论 | 独立证据 |
|---|---|---|---|
| 1 | **requestNotify 三分支边界 / wasRunning 语义（事件前状态）** | **正确** | run 开始转换点：`run_state(starting)` 事件前 isRunning=false → 非流式 → 立即通知（P5.2；探针 P1.1 同证）；run 结束转换点：`run_state(idle/aborted/error)` 为 flush 事件 → 立即冲刷（P5.4/P4.2）；`run_state(streaming)` 为流生命周期事件（非汇合点）→ 入窗不通知（P5.3）。`streaming = wasRunning \|\| events.every(isDeltaEvent)` 补集完备：运行中非终态事件（P5.6）、纯 delta 未运行（P5.10）均入节流；空闲非 delta 非终态（P5.5）即时。`events.every` 空数组不可达（dispatchMany 早退） |
| 2 | **尾随 timer 与立即冲刷的竞态** | **正确** | 终态到达时 timer 挂着 → flushNotify 先 clearTimeout（P4.1→P4.2 同步冲刷、P4.6/P4.9 长推进零悬挂零重复）；同窗多次演进至多 1 个尾随 timer、恰一次通知（P5.12，maxPending=1）；setTimeout 迟燃场景（now-lastNotify≥300 时 timer 仍挂）走立即分支 → flushNotify 清除，无双发路径（代码级推演 + P4 全组） |
| 3 | **非流式事件（用户交互/就绪回放）零空闲延迟** | **成立** | 空闲期 user_message（P5.1）与 history_loaded/config/toast/error/models_list/commands/session_name/ui_dismiss_toast 七类（P5.5）全部同步即时通知（通知时刻 == 派发时刻）；就绪回放路径（ready 回放 history_loaded 等）即时 |
| 4 | **useSyncExternalStore 与节流的交互** | **成立** | getSnapshot 引用稳定性：真 no-op 事件零通知 + 引用不变（P5.13，ui_dismiss_banner 无横幅 / ui_dismiss_toast 无命中）；每次通知各 listener 读到同一 state 引用（P5.17 无撕裂）；非终态通知内容恒为终量单调前缀（P5.15，无回退无空洞）；终态通知读到终稿（P5.16）。shell.tsx 接线复核：uSES(subscribe,getSnapshot,getSnapshot) 与节流兼容——通知延迟只推迟 re-render 时点，快照取数恒最新 |
| 5 | **usage_info / toolcall_start / toast 等运行期非 delta 事件落入节流分支（研发声称刻意包含）** | **必要且正确**（观察项 O-1 记延迟） | 正确性：不即时通知但状态即时累积（P5.7 totalTokens 先于通知就位），尾随恰一次送达（P5.8），延迟恰 = 窗口终点 ≤300ms（P5.9 delay=300ms）；settle 后迟到 toolcall_status（#D-04 回填同族）≤300ms 可见不丢失（P5.14）。必要性：若豁免此类事件，运行期每次 toolcall_start/usage_info/toast 都将绕过节流立即触发全量 reconciliation + Markdown 重析——节流上界被侧门击穿（d 约束失效）；而真正的急停语义载体 run_state(aborted/error)/message_final 已全部豁免。取舍合理 |
| 6 | **EventBuffer 与节流的组合**（超出指定重点的补充） | **正确** | EventBuffer 逻辑本批次零改动（diff 仅注释）；非 delta 事件先 flush 队列再派发（保序），flush 事件入 dispatch 后 flushNotify 冲刷整段累积（P3/P4）；rAF 挂起（隐藏 webview）时 delta 只在队列累积不丢失，恢复后单次演进+通知 |
| 7 | **生产事件序列对照**（flush 事件集是否覆盖真实汇合点） | **成立** | RunState 联合类型恰为 idle/starting/streaming/aborted/error（src/panel/messages.ts:38），isNotifyFlushEvent 的 run_state 终态三值完备无漏；piBridge 生产侧：message_end → message_final（:1009/:1064/:1072）、abort 路径 aborted→idle 同序（:801–804，与代码注释一致）、崩溃/退出 → error（:342/:349）、各 settle → idle——全部落入豁免集 |

**对抗性结论：无 FAIL 级发现。**

---

## ⑤ 回归面评估（问题 4：golden DOM 41 项对终态文本逐字一致性的覆盖是否足以守护本修复）

- 41 项集成（golden DOM E2E 4 项 + dual-panel/XSS/echo/bridge 等）复跑全绿。golden DOM 链路为真实全链（fake-pi 子进程 → RpcClient → PiBridge → ChatController postMessage 泵 → jsdom MessageEvent → EventBuffer/UiStore → 真实 AssistantRuntimeProvider/uSES → DOM），**终态断言在 settle 后逐字校验 assistant 文本（toContain fixture 逐行推导值）+ 消息条数 + user 气泡三时点恒 1**——因 message_final/run_state(idle) 立即冲刷，终态文本断言对本修复的「终态一致性 + 零丢失」是**有效守护**（若终态冲刷或冲刷前 delta 派发被破坏，golden DOM 即红）。
- 边界（记观察项 O-2/O-3）：golden DOM 对**流式中途可见性**无断言（全部 assistant 文本断言在 settle 后；若尾随通知彻底损坏、只靠终态冲刷也能全绿）——该维度由单测 ⑮/⑲（fake timers 通知计数/快照追平）守护，已在门禁内；jsdom 仍不度量真实流畅度（R-05 原盲区，任务书已明示非目标，见 O-4）。

---

## ⑥ 观察项（不阻塞，边缘疑点）

- **O-1 运行期非关键 UI 面延迟 ≤300ms**：usage_info/toolcall_start/toast（及运行期 steer 的 user_message）落入节流分支，展示延迟上界 300ms。经证为刻意取舍（必要性见 ④-5）；急停/终态/error-run_state 均即时。不构成 FAIL，建议在真机验收时顺手感知确认。
- **O-2 交付用例 ⑬ 的真实时钟邻接假设**：`expect(notified).toBe(1)` 依赖 stream_start 通知与 rAF 冲刷之间真实耗时 <300ms（同一同步块内，实际亚毫秒；仅极端 GC 暂停 ≥300ms 理论可致 flake）。概率可忽略；⑬ 尾部 message_final 冲刷会清掉该 timer，无残留。
- **O-3 流式中途可见性仅单测层守护**：golden DOM 无 mid-stream 文本断言（settle 前断言仅有「首 delta 事件已到」级 waitFor）。建议后续 P-01/P-02 落地时补一条 DOM 层 mid-stream 前缀断言（非本批义务）。
- **O-4 真机流畅度仍未被门禁度量**：本修复以通知频率上界（≈3.3Hz）为机制级代理判据，符合任务书 §2 口径与「非目标」（增量 Markdown 解析另立项）；R-05 原盲区（感知级流畅度）依旧留待真机 MANUAL/性能基线提案。
- **O-5 重复 run_state 终态会通知**（修复前已存在，非本批回退）：reducer 对 run_state 恒返回新引用（值相等引用不等）→ 重复终态事件各通知一次。旧代码同此行为（next!==state 即 notify），时序语义无变化；就绪回放路径频率极低。若日后收紧需改 reducer 短路，属独立改进项。
- **O-6 package.json 存在重复 devDependencies 键**（@assistant-ui/react-markdown / remark-breaks / remark-gfm / jsdom 各两行同值，esbuild 解析时告警）——与本批次无关的既有仓库卫生问题，顺带记录。

---

## ⑦ 结论

**PASS** —— 四条硬约束（a 零丢失零乱序 / b 终态逐字节一致 / c 急停立即冲刷无悬挂 / d ≤1次/300ms+终态冲刷）全部独立验证成立；三道门禁亲复跑全绿（typecheck / unit 235 / integration 41）；对抗性审查七项无 FAIL 级发现；观察项六条均不阻塞。修复达成 R-05 机制级目标（流式渲染驱动频率由 ≤60Hz 收敛至 ≈3.3Hz 量级，恢复旧实现的工程节流智慧），可进入发版流程（versioning.md / 0.1.9 / 回写关闭 #6）。

---

## 附录 A ｜ 独立探针关键输出（/tmp/d07-probe/probe.mjs，49/49 PASS，用后已清理）

探针形态：虚拟时钟（Date.now/setTimeout/clearTimeout 接管，绝对时间轴只前进）+ 手动 rAF 的 EventBuffer + 被测 store 源码 esbuild 转译副本。分组：P1 频率上界（9 项）、P2 零丢失/乱序（5 项）、P3 终态一致（4 项）、P4 急停/timer 竞态（13 项）、P5 对抗边界（16 项）、P5b 前置（2 项）。代表性输出（原文摘录）：

```
P1.3  相邻通知间隔恒 ≥300ms  | minGap=300, notifies=[0,300,600,900,1200,1500,1800,2100,2400,2700,3000]
P1.4  通知数 ≤ 时长/300ms+2  | count=11, upper=12
P1.5  频率上界实际值          | count=11, ~3.66/s（含 t=0 首事件，净频率 3.33/s）
P1.7  终态冲刷不受 300ms 上界约束（豁免语义）| gap=8ms < 300
P2.5  600 delta 跨多窗零丢失  | len=2890/2890
P2.4  多类型 delta 各块位零乱序| b0=true, b1=true, args=true
P3.1  变体A（半窗交错推进）终态与逐事件 reduce 逐字节等价（JSON）| clock=1750
P3.4  message_final 到达当下（未推进时钟）状态 = 逐事件（含前置 delta 全量）
P4.2  run_state(aborted) 同步立即冲刷（未推进时钟）
P4.6  急停后尾随 timer 已清除 | timers=0（5s 推进零新增）
P4.12 尾随 timer 恰在窗口终点（lastNotify+300）通知一次 | first=49360, second=49660
P5.5  空闲期全部交互/回放事件即时通知（7 事件 7 通知，零空闲延迟）| count=7
P5.8  尾随通知恰一次送达全部累积 | notifies=2, delay=300ms
P5.12 同窗 10 次演进 → 至多 1 个尾随 timer、恰一次通知 | count=2, maxPending=1
P5.14 settle 后迟到 toolcall_status 最终可见（≤300ms，不丢失）| notifies=+1, delay=300ms
== 探针结束：FAIL=0 ==
```

## 附录 B ｜ 交付 diff 量与守恒复核

- webview/ui/store.ts：+83 行——常量 `STREAM_NOTIFY_THROTTLE_MS`、`isNotifyFlushEvent`（5 事件类/3 run_state 终值）、UiStore 新增 `lastNotifyAt`/`notifyTimer` 字段与 `requestNotify`/`flushNotify` 两私有方法、dispatch/dispatchMany 改走时机决策、EventBuffer 逻辑零改动（仅注释）。reducer 与事件协议零改动。
- test/unit/ui-store.test.ts：+240 行——⑬ 断言改写（通知时机断言调整为新契约，零丢失/顺序/终态断言原样保留并加强）、新增 fake timers 段 ⑮（频率上界）/⑯（终态逐字节一致）/⑰（flush 语义零 timer 推进）/⑱（abort 急停）/⑲（累积不受节流影响）/⑳（权威重建汇合点）。
- 单一职责与最小改动面符合任务书「主修复=通知层节流」的方案边界；无 speculative 脚手架。

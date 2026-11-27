# TASK-010 ｜ #D-07 流式渲染性能回退修复批次(R-05 → Issue #6)

> 来源:螺旋上升循环 v1.2 直接回流(Issue #6,type:bug;2026-11-27 15:00 巡检轮分诊:分析验证属实 → 进流水线)
> 缺陷登记:**#D-07**(P1 产品缺陷;部分回应 Issue #5/R-04 的补登记诉求——#D-08 TASK-008 回声仍待)
> 流水线:研发(子代理)→ 总调度核验 → 发版 0.1.9(versioning.md)→ 回写关闭 #6
> 时序约束:**R-14(Issue #12)——修复先行,assistant-ui 升级独立立项,禁同批混行;升级须以 R-13(Issue #11)delta 清单为强制输入**

## 1. 缺陷定义(#D-07 = R-05,根因三轮实证)

**现象**:v0.1.8(assistant-ui 迁移)发版后,长回答流式输出卡顿,会话越长越卡,影响全体用户;核验当时五道门禁全绿(判据不度量流畅度,jsdom 近恒真)。

**机制级根因**(证据:docs/review/report-2026-11-24.md §1 R-05):
- 旧实现:delta→rAF 合批 textContent 追加 + Markdown 重排 **300ms 节流**(webview/render/messages.ts:69)——工程智慧未入基线,迁移无义务保留;
- 新实现:`EventBuffer` 每 rAF(≤60Hz)一次 store 演进 + 单次通知(webview/ui/store.ts:338-345)→ React 全量 reconciliation → `MarkdownTextPrimitive`(webview/ui/markdown.tsx:46)对**全文**重走 remark 链(无增量解析);
- 频率算术:全文重析 ≈3.3Hz→≤60Hz ≈ **18×**;10k+ token 单消息尾段每帧全量重析饱和主线程;
- 二次放大:uiReducer 每 delta 执行 `[...state.messages]` 拷贝 + copyBlocks(每帧 O(delta 数 × 全会话消息数))。

## 2. 修复方案(验收口径)

1. **主修复**:store 通知层对 text/thinking 流式增量增设 **≥300ms 量级重排节流**——通知合批,同窗口多次演进仅通知一次;终态事件(message_end / agent_settled / turn_end 等汇合点)**立即 flush**,保证终态精确、零丢失、零乱序;
2. **正确性硬约束**:全部 delta 最终可见(节流只影响通知时机,不影响状态累积);message_end 后状态与逐事件处理完全一致;急停(abort/settled)立即冲刷;
3. **验证**:单测(fake timers)断言通知频率上界 + 终态一致 + flush 语义;typecheck / verify:unit 229 / verify:integration 41 全绿;新增用例入套件;
4. **非目标**(本批次不做):reducer 全量拷贝重构(独立改进项)、assistant-ui 升级(R-14 禁同批)、增量 Markdown 解析(若节流后仍不达标再立项,须真机数据)。

## 3. 进度日志

- 2026-11-27 14:5x 总调度:Issue #6 直建(v1.2 回流);15:0x 巡检分诊属实 → 本任务单立项 + #D-07 登记;研发子代理派发(见下);
- 2026-11-27 16:1x 研发交付(子代理 ea0d0e51):UiStore 通知层三分支节流(终态冲刷/非流式即时/流式 ≤1次/300ms 合批),EventBuffer 零改动;新增用例 ⑮~⑳,235 单测/41 集成全绿
- 2026-11-27 16:2x 总调度交付验收 PASS:改动面合规(仅 store.ts + 测试)、亲复跑三门禁全绿、diff 审阅(节流仅作用通知时机,状态累积不受影响)
- 2026-11-27 16:3x 独立核验 PASS(report-ea0d0e51):四条硬约束独立验证成立(49 项探针断言:600 delta 零丢失、终态逐字节等价、abort 无悬挂、频率实测 3.33Hz);对抗性七项全立;观察项六条不阻塞(真机感知级流畅度仍非门禁,P-01/P-02 提案跟进)
- 2026-11-27 16:4x 发版执行(versioning.md §5):自测四门禁全绿、五处一致(①package.json 0.1.9 ②CHANGELOG 置顶 ③v0.1.9 annotated tag ④⑤CI 承接)、密钥扫描 CLEAN → fix commit + release commit + tag 推送,CI 双通道发布触发;CI 回查排定

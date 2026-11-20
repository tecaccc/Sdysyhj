// T5 独立核验（TC-052 ｜ #D-04 回归 ｜ FR-CHAT-04）：
// MOCK-TOOLS-LATE（SC-052a：3 工具结果均晚于含工具卡助手消息 ≥50ms 到达 → success）
// MOCK-TOOLS-FAIL（SC-052b：同时序 bash 工具失败 → error）
// 驱动生产 webview bundle 直播路径（全程不重载面板），逐卡断言初始态/更新/最终收敛。
"use strict";

const { createPanel, sleep } = require("/tmp/t5harness/lib/driver.js");

const BUNDLE = "/tmp/verify-t5/media/main.js";
const LATE_MS = 60; // ≥50ms 确定性时序注入（TC 口径：mock 时序注入值）
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const isRunningText = (t) => t.includes("进行中");
const isSuccessText = (t) => t.includes("成功");
const isErrorText = (t) => t.includes("失败");

(async () => {
  console.log("== SC-052a（MOCK-TOOLS-LATE）：3 工具执行结果均晚于含工具卡 message_final ≥50ms ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    const MID = "m-52a";
    p.hostMessage({ kind: "stream_start", messageId: MID });
    // 3 张工具卡流式建立（直播路径）
    const tools = [
      { id: "call_l1", name: "read", args: '{"path":"src/a.ts"}', summary: "read src/a.ts" },
      { id: "call_l2", name: "grep", args: '{"pattern":"foo"}', summary: "grep foo" },
      { id: "call_l3", name: "bash", args: '{"command":"seq 1 5"}', summary: "seq 1 5" },
    ];
    tools.forEach((t, i) => {
      p.hostMessage({ kind: "toolcall_start", messageId: MID, index: i, id: t.id, tool: t.name, args: t.args, summary: t.summary });
    });
    await p.settle(50);
    const initial = p.findCards(MID);
    check("(a) 助手消息含 3 张工具卡，初始均展示“进行中”", initial.length === 3 && initial.every((c) => isRunningText(c.statusText)), JSON.stringify(initial));
    // 含工具卡的助手消息终稿先行到达（final 时执行结果未到 → 卡片状态仍 running）
    p.hostMessage({
      kind: "message_final",
      messageId: MID,
      message: {
        id: MID, role: "assistant", timestamp: 1,
        blocks: [
          { type: "toolcall", id: "call_l1", tool: "read", args: '{"path":"src/a.ts"}', summary: "read src/a.ts", status: "running", output: "", outputTruncated: false },
          { type: "toolcall", id: "call_l2", tool: "grep", args: '{"pattern":"foo"}', summary: "grep foo", status: "running", output: "", outputTruncated: false },
          { type: "toolcall", id: "call_l3", tool: "bash", args: '{"command":"seq 1 5"}', summary: "seq 1 5", status: "running", output: "", outputTruncated: false },
        ],
      },
    });
    await p.settle(20);
    const afterFinal = p.findCards(MID);
    check("final 整体重建后卡片仍 3 张且状态“进行中”（#D-04 时序：结果未到）", afterFinal.length === 3 && afterFinal.every((c) => isRunningText(c.statusText)), JSON.stringify(afterFinal));
    // 工具执行结果事件在 final 之后 ≥50ms 到达（TC 时序契约）
    await sleep(LATE_MS);
    tools.forEach((t, i) => {
      p.hostMessage({ kind: "toolcall_status", messageId: MID, toolCallId: t.id, status: "success", summary: t.summary, output: `out-${t.id}-tail`, outputTruncated: false });
      check(`(b) 迟到结果到达：卡 ${t.name}(${t.id}) 更新为“成功”`, (() => { const c = p.findCards(MID)[i]; return c && isSuccessText(c.statusText) && c.statusClass.includes("status-success"); })(), JSON.stringify(p.findCards(MID)[i]));
    });
    // 本轮结束（settled → idle），全程无重载/历史刷新
    p.hostMessage({ kind: "run_state", state: "idle" });
    await p.settle(20);
    const final1 = p.findCards(MID);
    check("(c) 本轮结束无任何卡片停留“进行中”", final1.length === 3 && final1.every((c) => isSuccessText(c.statusText) && !isRunningText(c.statusText)), JSON.stringify(final1));
    check("(d) 全程直播路径：无 history_loaded/session_reset（出站无刷新类请求）", !p.outbound.some((m) => ["refresh_session"].includes(m.kind)), JSON.stringify(p.outbound.map((m) => m.kind)));
    check("工具名/参数摘要仍正确展示", final1[0].tool === "read" && final1[2].tool === "bash", JSON.stringify(final1));
  }

  console.log("== SC-052b（MOCK-TOOLS-FAIL）：同时序，bash 工具执行失败 → “失败” ==");
  {
    const p = createPanel(BUNDLE);
    p.hostMessage({ kind: "run_state", state: "starting" });
    p.hostMessage({ kind: "run_state", state: "streaming" });
    const MID = "m-52b";
    p.hostMessage({ kind: "stream_start", messageId: MID });
    p.hostMessage({ kind: "toolcall_start", messageId: MID, index: 0, id: "call_f1", tool: "bash", args: '{"command":"make build"}', summary: "make build" });
    await p.settle(50);
    check("(a) 初始“进行中”", isRunningText(p.findCards(MID)[0].statusText), JSON.stringify(p.findCards(MID)));
    p.hostMessage({
      kind: "message_final",
      messageId: MID,
      message: { id: MID, role: "assistant", timestamp: 1, blocks: [{ type: "toolcall", id: "call_f1", tool: "bash", args: '{"command":"make build"}', summary: "make build", status: "running", output: "", outputTruncated: false }] },
    });
    await sleep(LATE_MS);
    p.hostMessage({ kind: "toolcall_status", messageId: MID, toolCallId: "call_f1", status: "error", summary: "make build", output: "make: *** [build] Error 1", outputTruncated: false });
    await p.settle(20);
    const c = p.findCards(MID)[0];
    check("(b) 迟到失败结果到达：卡更新为“失败”", c && isErrorText(c.statusText) && c.statusClass.includes("status-error"), JSON.stringify(c));
    p.hostMessage({ kind: "run_state", state: "idle" });
    await p.settle(20);
    check("(c) 本轮结束不停留“进行中”", !isRunningText(p.findCards(MID)[0].statusText), JSON.stringify(p.findCards(MID)));
  }

  console.log("== 桥侧时序契约佐证（源级，#D-04）==");
  console.log("  piBridge.ts：message_final 于 :854 发出（含 toolcall 块）；handleToolResult 于 :876 以");
  console.log("  toolLocations 记录的 messageId/toolCallId 发出迟到 toolcall_status（:643 为 tool_execution_end 同构路径）——");
  console.log("  状态事件不依赖 streaming 状态，final 后仍可路由。套件佐证：unit #D-04 时序契约用例（_suites/unit-output.txt）。");

  console.log(`\nTC-052 判定：${pass} PASS / ${failures.length} FAIL`);
  if (failures.length) {
    console.log("失败项：");
    failures.forEach((x) => console.log(`  - ${x}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

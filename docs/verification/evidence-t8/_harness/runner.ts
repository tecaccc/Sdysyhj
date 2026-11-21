// TASK-008 独立核验驱动（核验 Agent 自建；导入被测实现 src/bridge/*，mock 与断言全部独立）。
// 用法：node runner.cjs <tcid>（tcid ∈ tc062 tc063 tc065 tc066 tc067 tc069 tc070 tc071 tc072 tc073 tc074 tc076 tc064 tc068）
// 判定输出：逐断言 PASS/FAIL + 总结；退出码 0=全过，1=有 FAIL，3=看门狗超时。
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../verify-task008/src/bridge/piBridge";
import { RpcClient } from "../../verify-task008/src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../verify-task008/src/bridge/rpcTransport";
import { MemoryLogger } from "../../verify-task008/src/util/log";

const MYPI = "/tmp/vt008/mypi.js";
const MYREPLAY = "/tmp/vt008/myreplay.js";
const REPO = "/tmp/verify-task008";

interface Snap { role: string; id: string; text: string }
interface TLine { kind: string; detail: string; ui: Snap[]; mark?: string }

const results: Array<{ id: string; ok: boolean; note: string }> = [];
function check(id: string, ok: boolean, note: string) {
  results.push({ id, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${note}`);
}
const textOf = (m: { blocks?: Array<{ type: string; text?: string }> }) =>
  (m.blocks ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");

function makeHarness(opts: { env?: Record<string, string>; replay?: string; cwd?: string }) {
  const cwd = opts.cwd ?? fs.mkdtempSync(path.join(os.tmpdir(), "vt008-run-"));
  const events: BridgeEvent[] = [];
  const timeline: TLine[] = [];
  const script = opts.replay ? MYREPLAY : MYPI; // 回放模式下执行体仍是 myreplay.js，fixture 路径经 MYREPLAY_FILE 传入（此前误把 .jsonl 当脚本 spawn → node exit 1，已定性 harness 缺陷并修复）
  const runtime: ResolvedRuntime = { source: "bundled", command: process.execPath, baseArgs: [script], detail: "vt008 harness" };
  const bridge = new PiBridge({
    cwd,
    runtime,
    createClient: ({ command, args, cwd: c }) =>
      new RpcClient({ command, args, cwd: c, env: { ...process.env, ...(opts.replay ? { MYREPLAY_FILE: opts.replay } : {}), ...(opts.env ?? {}) } }) as unknown as PiRpcClient,
    logger: new MemoryLogger(),
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((e) => {
    events.push(e);
    const ui = bridge.getUiMessages().map((m) => ({ role: m.role, id: m.id, text: textOf(m as unknown as { blocks?: Array<{ type: string; text?: string }> }) }));
    let detail = "";
    const any = e as unknown as Record<string, unknown>;
    if (e.kind === "message_final") detail = `role=${(any.message as { role: string }).role} text=${textOf(any.message as { blocks: Array<{ type: string; text?: string }> }).slice(0, 50)}`;
    else if (e.kind === "run_state") detail = String(any.state);
    else if (e.kind === "text_delta" || e.kind === "thinking_delta") detail = String(any.delta).slice(0, 40);
    else if (e.kind === "toolcall_status") detail = String(any.status);
    else if (e.kind === "error") detail = String(any.message).slice(0, 120);
    else if (e.kind === "toast") detail = String(any.text).slice(0, 40);
    else if (e.kind === "user_message") detail = `text=${String(any.text).slice(0, 40)}`;
    else if (e.kind === "queue_update") detail = JSON.stringify(any);
    timeline.push({ kind: e.kind, detail, ui });
  });
  return { bridge, events, timeline, cwd };
}

function mark(timeline: TLine[], label: string, bridge: PiBridge) {
  const ui = bridge.getUiMessages().map((m) => ({ role: m.role, id: m.id, text: textOf(m as unknown as { blocks?: Array<{ type: string; text?: string }> }) }));
  timeline.push({ kind: "__MARK__", detail: label, ui, mark: label });
}
function snapUsers(ui: Snap[]) { return ui.filter((m) => m.role === "user"); }
function countText(ui: Snap[], text: string) { return snapUsers(ui).filter((m) => m.text === text).length; }
function userEntriesById(ui: Snap[]) { return snapUsers(ui); }

async function waitFor(pred: () => boolean, label: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
/** T1/T2 采样：时间线中该事件处理后记录的快照。 */
function uiAfter(timeline: TLine[], kind: string, detailIncludes: string): Snap[] | null {
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].kind === kind && timeline[i].detail.includes(detailIncludes)) return timeline[i].ui;
  }
  return null;
}
function markUi(timeline: TLine[], label: string): Snap[] | null {
  const t = timeline.find((x) => x.kind === "__MARK__" && x.mark === label);
  return t ? t.ui : null;
}
function idleState(bridge: PiBridge) { return bridge.getRunState(); }

function readJsonlMessages(file: string): Array<{ role: string; text: string }> {
  const out: Array<{ role: string; text: string }> = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.type !== "message" || !e.message) continue;
    const role = e.message.role;
    if (role !== "user" && role !== "assistant") continue;
    let text = "";
    if (typeof e.message.content === "string") text = e.message.content;
    else if (Array.isArray(e.message.content)) text = e.message.content.filter((b: { type: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
    out.push({ role, text });
  }
  return out;
}

// ---------- TC drivers ----------

async function tc062() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  const P1 = "single-echo-check";
  await bridge.sendPrompt(P1);
  mark(timeline, "T0", bridge); // 受理后、事件流前（mock 延迟 80ms 才发事件）
  await waitFor(() => idleState(bridge) === "idle", "settled");
  const t0 = markUi(timeline, "T0")!;
  const firstFinalIdx = timeline.findIndex((t) => t.kind === "message_final" && t.detail.includes("role=user"));
  const t0Idx = timeline.findIndex((t) => t.kind === "__MARK__" && t.mark === "T0");
  check("062-a-T0-先于回声", t0Idx < firstFinalIdx, `T0 索引=${t0Idx} 首个 user 终稿索引=${firstFinalIdx}`);
  check("062-a", countText(t0, P1) === 1 && snapUsers(t0)[0]?.text === P1, `T0 条目=${JSON.stringify(snapUsers(t0))}`);
  const t1 = uiAfter(timeline, "message_final", `role=user text=${P1.slice(0, 20)}`);
  check("062-b-T1", t1 !== null && countText(t1, P1) === 1, `T1 快照=${JSON.stringify(snapUsers(t1 ?? []))}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  check("062-c-T2", !!t2Line && countText(t2Line.ui, P1) === 1, `T2 user=${JSON.stringify(snapUsers(t2Line?.ui ?? []))}`);
  const t2 = t2Line!.ui;
  check("062-d", t2.filter((m) => m.role === "assistant").length === 1 && t2.length === 2, `T2 全量=${t2.map((m) => m.role).join(",")}（澄清 #12 合计应 2）`);
  await bridge.dispose();
}

async function tc063() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile, MYPI_DELAY_MS: "40" } });
  await bridge.start();
  const T = "dup-check";
  const roundEndIdx: number[] = [];
  for (let i = 1; i <= 3; i++) {
    await bridge.sendPrompt(T);
    mark(timeline, `T0-${i}`, bridge);
    await waitFor(() => idleState(bridge) === "idle", `round ${i} settled`);
    roundEndIdx.push(timeline.length);
  }
  // 每轮 T1/T2：本轮新增 user 终稿恰 1 条、轮末累计恰 +1（同文本无法前缀区分，按时间线轮次边界计数）
  for (let i = 0; i < 3; i++) {
    const start = i === 0 ? 0 : roundEndIdx[i - 1];
    const end = roundEndIdx[i];
    const finalsInRound = timeline.slice(start, end).filter((t) => t.kind === "message_final" && t.detail.includes("role=user") && t.detail.includes("dup-check")).length;
    const uiAtRoundEnd = timeline[end - 1]?.ui ?? [];
    check(`063-a-r${i + 1}-T1/T2`, finalsInRound === 1 && countText(uiAtRoundEnd, T) === i + 1, `第 ${i + 1} 轮：本轮终稿=${finalsInRound}（应 1，逐条消费），轮末累计=${countText(uiAtRoundEnd, T)}`);
  }
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  check("063-b", countText(t2, T) === 3, `同文本 user 总数=${countText(t2, T)}（应 3，不跨发送合并）`);
  check("063-c", t2.filter((m) => m.role === "assistant").length === 3, `assistant 总数=${t2.filter((m) => m.role === "assistant").length}`);
  check("063-d", t2.length === 6, `user+assistant 合计=${t2.length}（澄清 #12：应 6）`);
  await bridge.dispose();
}

async function tc065() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  await bridge.sendPrompt("MYPI_STEERONLY:main");
  await waitFor(() => idleState(bridge) === "streaming" || timeline.some((t) => t.kind === "text_delta"), "main streaming");
  const S1 = "steer-check";
  await bridge.sendPrompt(S1, "steer");
  mark(timeline, "T0-S1", bridge);
  await waitFor(() => idleState(bridge) === "idle", "settled");
  const t0 = markUi(timeline, "T0-S1")!;
  check("065-a", countText(t0, S1) === 1, `T0 S1 条目=${countText(t0, S1)}`);
  const t1 = uiAfter(timeline, "message_final", `role=user text=${S1.slice(0, 12)}`);
  check("065-b", t1 !== null && countText(t1, S1) === 1, `T1 S1=${countText(t1 ?? [], S1)}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  check("065-c", countText(t2, S1) === 1, `T2 S1=${countText(t2, S1)}`);
  check("065-d", snapUsers(t2).length === 2, `会话 user 总数=${snapUsers(t2).length}（P1+S1 应 2）`);
  await bridge.dispose();
}

async function tc066() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-"));
  const sessionFile = path.join(dir, "a.jsonl");
  const mockLog = path.join(dir, "mypi-events.log");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile, MYPI_LOG: mockLog } });
  await bridge.start();
  await bridge.sendPrompt("MYPI_MIX:main");
  await waitFor(() => timeline.some((t) => t.kind === "text_delta"), "main streaming");
  const F1 = "fu-check", S1 = "steer-check";
  await bridge.sendPrompt(F1, "followUp"); // 先发 follow_up（停后投递）
  mark(timeline, "T0-F1", bridge);
  await bridge.sendPrompt(S1, "steer"); // 后发 steer（轮间先投）
  mark(timeline, "T0-S1", bridge);
  await waitFor(() => idleState(bridge) === "idle", "settled");
  const f1T0 = markUi(timeline, "T0-F1")!, s1T0 = markUi(timeline, "T0-S1")!;
  check("066-a", countText(f1T0, F1) === 1, `F1 即时=${countText(f1T0, F1)}`);
  check("066-b", countText(s1T0, S1) === 1, `S1 即时=${countText(s1T0, S1)}`);
  // 回声到达序与发送序相反：S1 先到
  const finals = timeline.filter((t) => t.kind === "message_final" && t.detail.startsWith("role=user"));
  const order = finals.map((t) => (t.detail.includes("fu-check") ? "F1" : t.detail.includes("steer-check") ? "S1" : t.detail.includes("MYPI_MIX") ? "P1" : "?"));
  check("066-echo-order", order.join(",") === "P1,S1,F1", `回声到达序=${order.join(",")}（期望 P1,S1,F1 乱序实证）`);
  const s1Final = finals.find((t) => t.detail.includes("steer-check"));
  check("066-c", !!s1Final && countText(s1Final.ui, S1) === 1 && countText(s1Final.ui, F1) === 1 && snapUsers(s1Final.ui).find((m) => m.text === F1) !== undefined, `S1 回声处理后：S1=${countText(s1Final?.ui ?? [], S1)} F1=${countText(s1Final?.ui ?? [], F1)}，F1 文本未错换=${snapUsers(s1Final?.ui ?? []).some((m) => m.text === F1)}`);
  const f1Final = finals.find((t) => t.detail.includes("fu-check"));
  check("066-d", !!f1Final && countText(f1Final.ui, F1) === 1, `F1 回声处理后 F1=${countText(f1Final?.ui ?? [], F1)}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  const userTexts = snapUsers(t2).map((m) => m.text);
  check("066-e", snapUsers(t2).length === 3 && new Set(userTexts).size === 3, `总数=${snapUsers(t2).length} 文本=${JSON.stringify(userTexts)}`);
  // queue_update 观测：桥不向 webview 转发该 kind，从 mock 协议侧日志计数（json.md L121–122 快照；回声关联已由 066-c/d 证明桥已消费）
  const protocolLog = fs.readFileSync(mockLog, "utf8");
  const quCount = (protocolLog.match(/queue_update/g) ?? []).length;
  check("066-queue_update", quCount >= 4, `mock 协议侧 queue_update=${quCount} 次（应 ≥4：入队×2+出队×2）`);
  await bridge.dispose();
}

async function tc067() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  await bridge.sendPrompt("MYPI_LONG:main");
  await waitFor(() => timeline.some((t) => t.kind === "text_delta"), "long streaming");
  const F1 = "fu-after-abort";
  await bridge.sendPrompt(F1, "followUp");
  mark(timeline, "T0-F1", bridge);
  await bridge.abort();
  await waitFor(() => idleState(bridge) === "idle", "aborted settled");
  const afterAbort = markUi(timeline, "T0-F1")!;
  check("067-a", countText(afterAbort, F1) === 1, `abort 后 F1=${countText(afterAbort, F1)}（队列保留单条）`);
  const P2 = "second-prompt";
  await bridge.sendPrompt(P2);
  mark(timeline, "T0-P2", bridge);
  await waitFor(() => idleState(bridge) === "idle", "second settled");
  const p2T0 = markUi(timeline, "T0-P2")!;
  check("067-b", countText(p2T0, P2) === 1 && snapUsers(p2T0).find((m) => m.text === P2)?.text === P2, `P2 即时=${countText(p2T0, P2)}`);
  const f1Late = uiAfter(timeline, "message_final", `role=user text=${F1.slice(0, 8)}`);
  check("067-c", f1Late !== null && countText(f1Late, F1) === 1, `F1 迟到回声后=${countText(f1Late ?? [], F1)}（不误绑 P2）`);
  const p2Final = uiAfter(timeline, "message_final", `role=user text=${P2.slice(0, 8)}`);
  check("067-d", p2Final !== null && countText(p2Final, P2) === 1, `P2 回声后=${countText(p2Final ?? [], P2)}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  check("067-e", snapUsers(t2Line!.ui).length === 3, `user 总数=${snapUsers(t2Line!.ui).length}（P1/F1/P2 应 3）`);
  await bridge.dispose();
}

async function tc069() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-"));
  const sessionFile = path.join(dir, "a.jsonl");
  const { bridge, timeline, events } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  for (const m of ["replay-check-1", "replay-check-2", "replay-check-3"]) {
    await bridge.sendPrompt(m);
    await waitFor(() => idleState(bridge) === "idle", `${m} settled`);
  }
  // 面板重开数据源（chatPanel ready → history_loaded ← getUiMessages()）
  const reopen = bridge.getUiMessages().map((m) => ({ role: m.role, id: m.id, text: textOf(m as unknown as { blocks: Array<{ type: string; text?: string }> }) }));
  check("069-a", reopen.filter((m) => m.role === "user").length === 3 && new Set(reopen.filter((m) => m.role === "user").map((m) => m.text)).size === 3, `重放 user=${JSON.stringify(reopen.filter((m) => m.role === "user").map((m) => m.text))}`);
  // 刷新重建（refresh_session 链路）同样无重复
  await bridge.reloadHistory();
  const history = (events.filter((e) => e.kind === "history_loaded").pop() as unknown as { messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }> }).messages;
  const histSeq = history.map((m) => ({ role: m.role, text: textOf(m) }));
  check("069-b", histSeq.filter((m) => m.role === "user").every((m, i) => m.text === `replay-check-${i + 1}`), `重建 user 文本=${JSON.stringify(histSeq.filter((m) => m.role === "user"))}`);
  check("069-c", histSeq.filter((m) => m.role === "assistant").length === 3 && histSeq.length === 6, `assistant=${histSeq.filter((m) => m.role === "assistant").length} 合计=${histSeq.length}（应 3/6）`);
  const jsonl = readJsonlMessages(sessionFile);
  check("069-d", JSON.stringify(jsonl) === JSON.stringify(histSeq), `JSONL 序列=${JSON.stringify(jsonl.map((m) => m.role + ":" + m.text.slice(0, 14)))} vs 重建=${JSON.stringify(histSeq.map((m) => m.role + ":" + m.text.slice(0, 14)))}（澄清 #5）`);
  void timeline;
  await bridge.dispose();
}

async function tc070() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-"));
  const sessionA = path.join(dir, "a.jsonl");
  const sessionB = path.join(dir, "b.jsonl");
  fs.writeFileSync(sessionB, JSON.stringify({ type: "session", id: "b", timestamp: new Date(0).toISOString(), cwd: "/tmp" }) + "\n" +
    JSON.stringify({ type: "message", id: "b1", parentId: null, timestamp: new Date(0).toISOString(), message: { role: "user", content: [{ type: "text", text: "B-session-msg" }] } }) + "\n");
  const { bridge, events } = makeHarness({ env: { MYPI_SESSION_FILE: sessionA, MYPI_REWRITE: "/rewrite-me=>AUTHORITATIVE-REWRITTEN-2" } });
  await bridge.start();
  await bridge.sendPrompt("A-one");
  await waitFor(() => idleState(bridge) === "idle", "1 settled");
  await bridge.sendPrompt("/rewrite-me");
  await waitFor(() => idleState(bridge) === "idle", "2 settled");
  await bridge.sendPrompt("A-three");
  await waitFor(() => idleState(bridge) === "idle", "3 settled");
  await bridge.switchSession(sessionB);
  await bridge.switchSession(sessionA);
  const history = (events.filter((e) => e.kind === "history_loaded").pop() as unknown as { messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }> }).messages;
  const seq = history.map((m) => ({ role: m.role, text: textOf(m) }));
  const users = seq.filter((m) => m.role === "user");
  check("070-a", users.length === 3, `重建 user 数=${users.length}（应 3，各恰一条）`);
  check("070-b", users[1]?.text === "AUTHORITATIVE-REWRITTEN-2", `第 2 条文本=${JSON.stringify(users[1]?.text)}（澄清 #16：应 Y 非 X）`);
  const jsonl = readJsonlMessages(sessionA);
  check("070-c", JSON.stringify(jsonl) === JSON.stringify(seq), `JSONL vs 重建一致（澄清 #5）：jsonl=${JSON.stringify(jsonl.map((m) => m.role + ":" + m.text.slice(0, 18)))}`);
  check("070-d", seq.length === 6, `总条目=${seq.length}（3 user + 3 assistant，无丢失/拼接/错换）`);
  await bridge.dispose();
}

async function tc071() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const X = "/review src/a.ts", Y = "EXPANDED-AUTHORITATIVE full text";
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile, MYPI_REWRITE: `${X}=>${Y}` } });
  await bridge.start();
  await bridge.sendPrompt(X);
  mark(timeline, "T0", bridge);
  await waitFor(() => idleState(bridge) === "idle", "settled");
  const t0 = markUi(timeline, "T0")!;
  const t0Id = snapUsers(t0)[0]?.id;
  check("071-a", countText(t0, X) === 1 && snapUsers(t0)[0].text === X, `T0：条目=${JSON.stringify(snapUsers(t0))}`);
  const t1 = uiAfter(timeline, "message_final", `role=user text=${Y.slice(0, 14)}`);
  check("071-b", t1 !== null && snapUsers(t1).length === 1 && snapUsers(t1)[0].text === Y, `T1：${JSON.stringify(snapUsers(t1 ?? []))}`);
  check("071-b-id", t1 !== null && snapUsers(t1)[0].id === t0Id, `T1 条目 id=${snapUsers(t1 ?? [])[0]?.id} 与 T0=${t0Id} 同一逻辑条目`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  check("071-c", snapUsers(t2Line!.ui).length === 1 && snapUsers(t2Line!.ui)[0].text === Y, `T2：${JSON.stringify(snapUsers(t2Line!.ui))}`);
  // (d) 变迁恰一次、无 X/Y 并存快照
  const series = timeline.map((t) => snapUsers(t.ui));
  const transitions: string[] = [];
  for (const s of series) { const txt = s[0]?.text ?? ""; if (transitions.length === 0 || transitions[transitions.length - 1] !== txt) transitions.push(txt); }
  const xToY = transitions.filter((t) => t === X).length === 1 && transitions.filter((t) => t === Y).length >= 1;
  check("071-d", xToY && series.every((s) => !(s.some((m) => m.text === X) && s.some((m) => m.text === Y)) && series.every((s) => s.length <= 1)), `变迁序列=${JSON.stringify(transitions)}（X→Y 恰一次，无并存）`);
  const fromSend = series.slice(series.findIndex((s) => s.some((m) => m.text === X) || s.some((m) => m.text === Y)));
  check("071-e", fromSend.every((s) => s.length === 1), `发送后至 T2 条数恒 1（发送前空快照不计，首快照索引=${series.findIndex((s) => s.some((m) => m.text === X) || s.some((m) => m.text === Y))}）`);
  await bridge.dispose();
}

async function tc072() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline, events } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  const R1 = "MYPI_REJECT:reject-check";
  await bridge.sendPrompt(R1);
  mark(timeline, "T0-R1", bridge);
  const r1T0 = markUi(timeline, "T0-R1")!;
  check("072-a", snapUsers(r1T0).length === 1 && snapUsers(r1T0)[0].text === R1, `R1 条目=${JSON.stringify(snapUsers(r1T0))}`);
  const P2 = "reject-followup-p2";
  await bridge.sendPrompt(P2);
  mark(timeline, "T0-P2", bridge);
  await waitFor(() => idleState(bridge) === "idle", "p2 settled");
  const r1Always = timeline.slice(timeline.findIndex((t) => t.kind === "__MARK__" && t.mark === "T0-R1")).every((t) => countText(t.ui, R1) === 1);
  check("072-b", r1Always, `自 R1 发送起全程恒 1 条（响应事件点出账，无第二条；发送前空快照不计）`);
  const errSeen = events.some((e) => e.kind === "error");
  console.log(`OBSERVE  072-c  拒绝错误经 error 通道展示=${errSeen}（观察项，不计判定）`);
  const p2T0 = markUi(timeline, "T0-P2")!;
  const p2Final = uiAfter(timeline, "message_final", `role=user text=${P2.slice(0, 9)}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  check("072-d", countText(p2T0, P2) === 1 && p2Final !== null && countText(p2Final, P2) === 1 && countText(t2Line!.ui, P2) === 1 && !P2.includes(R1) && countText(t2Line!.ui, R1) === 1 && snapUsers(t2Line!.ui).find((m) => m.text === R1)?.text === R1, `P2 三时点=1/1/1；R1 未被 P2 回声污染`);
  await bridge.dispose();
}

async function tc073() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  const H1 = "MYPI_HANDLED:/extcmd-echo-check";
  await bridge.sendPrompt(H1);
  mark(timeline, "T0-H1", bridge);
  const h1T0 = markUi(timeline, "T0-H1")!;
  const noEchoForH1 = !timeline.some((t) => t.kind === "message_final" && t.detail.includes("role=user"));
  check("073-a", snapUsers(h1T0).length === 1 && snapUsers(h1T0)[0].text === H1 && idleState(bridge) === "idle" && noEchoForH1, `H1 条目=1 原文、idle=${idleState(bridge)}、无回声=${noEchoForH1}（无 settled 等待残留）`);
  const P2 = "normal-after-handled";
  await bridge.sendPrompt(P2);
  mark(timeline, "T0-P2", bridge);
  await waitFor(() => idleState(bridge) === "idle", "p2 settled");
  const h1Always = timeline.slice(timeline.findIndex((t) => t.kind === "__MARK__" && t.mark === "T0-H1")).every((t) => countText(t.ui, H1) === 1);
  check("073-b", h1Always, `自 H1 发送起直至 P2 settled 恒 1 条（发送前空快照不计）`);
  const p2T0 = markUi(timeline, "T0-P2")!;
  const p2Final = uiAfter(timeline, "message_final", `role=user text=${P2.slice(0, 9)}`);
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  check("073-c", countText(p2T0, P2) === 1 && p2Final !== null && countText(p2Final, P2) === 1 && countText(t2Line!.ui, P2) === 1 && countText(t2Line!.ui, H1) === 1, `P2 三时点=1；H1 未被错绑`);
  await bridge.dispose();
}

async function tc074() {
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-")), "a.jsonl");
  const { bridge, timeline } = makeHarness({ env: { MYPI_SESSION_FILE: sessionFile } });
  await bridge.start();
  await bridge.sendPrompt("MYPI_TOOL:run tools");
  await waitFor(() => idleState(bridge) === "idle", "tool settled");
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  check("074-a", t2.filter((m) => m.role === "assistant").length === 2, `assistant 终稿数=${t2.filter((m) => m.role === "assistant").length}（1 次发送 → 2 条轮终稿：工具轮 + 总结轮，TC-001 口径每轮一条）`);
  // (b) TC-001 核心判据：流式增量按序到达且渲染
  const deltas = timeline.filter((t) => t.kind === "text_delta").map((t) => t.detail);
  check("074-b1", deltas.length >= 2 && deltas.join("|").includes("Checking.") && deltas.join("|").includes("tool done summary"), `text_delta 按序=${JSON.stringify(deltas)}`);
  // TC-005 判据：thinking 事件翻译在场
  check("074-b2", timeline.some((t) => t.kind === "thinking_delta" && t.detail.includes("need to inspect")), `thinking_delta 在场=${timeline.some((t) => t.kind === "thinking_delta")}`);
  // TC-007/052 判据：工具卡状态收敛（start → running/partial → success）
  const statuses = timeline.filter((t) => t.kind === "toolcall_status").map((t) => t.detail);
  check("074-b3", timeline.some((t) => t.kind === "toolcall_start") && statuses.length >= 2 && statuses[statuses.length - 1].includes("success"), `toolcall_status 序列=${JSON.stringify(statuses)}`);
  // (c) assistant 终稿 = message_end 权威文本
  const finals = timeline.filter((t) => t.kind === "message_final" && t.detail.includes("role=assistant"));
  const finalTexts = t2.filter((m) => m.role === "assistant").map((m) => m.text);
  check("074-c", finalTexts.includes("tool done summary") && finals.length >= 2, `assistant 终稿=${JSON.stringify(finalTexts)}（message_end 权威文本）`);
  // (d) user 侧 TC-062 判据交叉
  check("074-d", snapUsers(t2).length === 1 && snapUsers(t2)[0].text === "MYPI_TOOL:run tools", `user 侧单条=${JSON.stringify(snapUsers(t2))}`);
  await bridge.dispose();
}

async function tc076() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt008-s-"));
  const sessionA = path.join(dir, "a.jsonl");
  const sessionB = path.join(dir, "b.jsonl");
  fs.writeFileSync(sessionB, JSON.stringify({ type: "session", id: "b", timestamp: new Date(0).toISOString(), cwd: "/tmp" }) + "\n" +
    JSON.stringify({ type: "message", id: "b1", parentId: null, timestamp: new Date(0).toISOString(), message: { role: "user", content: [{ type: "text", text: "B-session-msg" }] } }) + "\n");
  const { bridge, timeline, events } = makeHarness({ env: { MYPI_SESSION_FILE: sessionA } });
  await bridge.start();
  await bridge.sendPrompt("MYPI_MIX_UNASSOC:main");
  await waitFor(() => timeline.some((t) => t.kind === "text_delta"), "streaming");
  const S1 = "unassoc-steer-orig", F1 = "unassoc-fu-orig";
  await bridge.sendPrompt(S1, "steer");
  mark(timeline, "T0-S1", bridge);
  await bridge.sendPrompt(F1, "followUp");
  mark(timeline, "T0-F1", bridge);
  await waitFor(() => idleState(bridge) === "idle", "settled");
  // (a)(b)(d)：快照窗口 = 两条插话均已发送（T0-F1）→ 重建前；窗口内逐份快照断言
  const winStart = timeline.findIndex((t) => t.kind === "__MARK__" && t.mark === "T0-F1");
  const rebuildIdx = timeline.findIndex((t) => t.kind === "__MARK__" && t.mark === "REBUILD");
  const window = timeline.slice(winStart, rebuildIdx >= 0 ? rebuildIdx : timeline.length);
  const transformedEcho = timeline.find((t) => t.kind === "message_final" && t.detail.includes("UNASSOC-TRANSFORMED"));
  check("076-echo-seen", transformedEcho !== undefined, `不可关联回声已到达并处理（终稿事件在场，澄清 #17 场景成立）`);
  const aOk = window.every((t) => countText(t.ui, S1) === 1 && countText(t.ui, F1) === 1);
  const textsKept = window.every((t) => snapUsers(t.ui).find((m) => m.text === S1) !== undefined && snapUsers(t.ui).find((m) => m.text === F1) !== undefined);
  check("076-a", aOk && textsKept, `回声处理后 S1/F1 各恒 1 条且保留发送原文（澄清 #17 保守分支）`);
  check("076-b", window.every((t) => snapUsers(t.ui).length === 3), `全程 user 总数恒 3（P1/S1/F1，不新增）`);
  const idsOk = window.every((t) => new Set(snapUsers(t.ui).map((m) => m.id)).size === snapUsers(t.ui).length);
  check("076-d", idsOk && window.every((t) => snapUsers(t.ui).length === 3), `全程无第二条气泡（快照序列逐份核验）`);
  // 权威重建（会话切换链路，同 TC-070 方式）
  mark(timeline, "REBUILD", bridge);
  await bridge.switchSession(sessionB);
  await bridge.switchSession(sessionA);
  const history = (events.filter((e) => e.kind === "history_loaded").pop() as unknown as { messages: Array<{ role: string; blocks: Array<{ type: string; text?: string }> }> }).messages;
  const seq = history.map((m) => ({ role: m.role, text: textOf(m) }));
  const jsonl = readJsonlMessages(sessionA);
  const s1After = seq.find((m) => m.text === `UNASSOC-TRANSFORMED(${S1})`);
  const f1After = seq.find((m) => m.text === F1);
  check("076-c", seq.filter((m) => m.role === "user").length === 3 && s1After !== undefined && f1After !== undefined && !seq.some((m) => m.role === "user" && m.text === S1) && JSON.stringify(jsonl) === JSON.stringify(seq), `重建后 S1 收敛为 JSONL 权威文本（不再保留发送原文）、F1 各 1 条、序列与 JSONL 逐条一致：users=${JSON.stringify(seq.filter((m) => m.role === "user").map((m) => m.text.slice(0, 28)))}`);
  await bridge.dispose();
}

// ---------- golden 回放（TC-064/TC-068；期望源 = 录制 trace） ----------

function fixtureLines(file: string) {
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l) as { dir: string; record: Record<string, unknown> });
}
function fixtureUserEchoTexts(file: string): string[] {
  const out: string[] = [];
  for (const { dir, record } of fixtureLines(file)) {
    if (dir !== "out" || record.type !== "message_end") continue;
    const m = record.message as { role?: string; content?: unknown };
    if (m?.role !== "user") continue;
    out.push(typeof m.content === "string" ? m.content : (m.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join(""));
  }
  return out;
}

async function goldenRun(fixture: string, drive: "basic" | "mix") {
  const { bridge, timeline } = makeHarness({ replay: fixture });
  await bridge.start();
  const commands = fixtureLines(fixture).filter((l) => l.dir === "in").map((l) => l.record);
  const sends = commands.filter((c) => ["prompt", "steer", "follow_up"].includes(String(c.type)));
  await bridge.sendPrompt(String(sends[0].message));
  if (drive === "mix") {
    await waitFor(() => timeline.some((t) => t.kind === "text_delta"), "first delta");
    await bridge.sendPrompt(String(sends[1].message), "followUp");
    await bridge.sendPrompt(String(sends[2].message), "steer");
  }
  await waitFor(() => bridge.getRunState() === "idle", "golden settled");
  return { bridge, timeline, sends };
}

async function tc064() {
  const fixture = path.join(REPO, "test/fixtures/golden/golden-prompt-basic.jsonl");
  // fixture 自身断言：回放输入序列含 user message_start/end 且先于 assistant message_start（json.md L38–40）
  const outs = fixtureLines(fixture).filter((l) => l.dir === "out");
  const types = outs.map((l) => String(l.record.type));
  const echoStart = types.findIndex((t, i) => t === "message_start" && (outs[i].record.message as { role?: string }).role === "user");
  const echoEnd = types.findIndex((t, i) => t === "message_end" && (outs[i].record.message as { role?: string }).role === "user");
  const assistStart = types.findIndex((t, i) => t === "message_start" && (outs[i].record.message as { role?: string }).role === "assistant");
  check("064-fixture-echo", echoStart >= 0 && echoEnd > echoStart && assistStart > echoEnd, `录制序列含 user 回声（start=${echoStart} end=${echoEnd}）先于 assistant（${assistStart}；json.md L38–40）`);
  const seqOk = types[types.indexOf("agent_start") + 1] === "turn_start";
  const settledLast = types[types.length - 1] === "agent_settled";
  check("064-fixture-order", seqOk && settledLast && types.filter((t) => t === "message_end").length >= 2, `录制序列形态：agent_start→turn_start…→agent_settled=${settledLast}`);
  const { bridge, timeline } = await goldenRun(fixture, "basic");
  const P = fixtureUserEchoTexts(fixture)[0];
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  check("064-a-b-c", snapUsers(t2).length === 1 && snapUsers(t2)[0].text === P, `回放链路 user 恰 1 条=${JSON.stringify(snapUsers(t2))}（TC-062 (a)-(c) 同款）`);
  check("064-d", t2.filter((m) => m.role === "assistant").length === 1 && t2.length === 2, `合计=${t2.length}（应 2，澄清 #12）`);
  const userFinal = timeline.find((t) => t.kind === "message_final" && t.detail.includes("role=user"));
  const streamStart = timeline.find((t) => t.kind === "stream_start");
  if (!streamStart || !userFinal) {
    console.log("DEBUG timeline:", JSON.stringify(timeline.map((t) => t.kind + ":" + t.detail.slice(0, 30)), null, 1));
    console.log("DEBUG errors:", JSON.stringify(timeline.map((t) => t.detail)));
  }
  check("064-order-in-bridge", userFinal !== undefined && streamStart !== undefined && timeline.indexOf(streamStart) > timeline.indexOf(userFinal), `回声先于助手流式（时间线索引 ${userFinal ? timeline.indexOf(userFinal) : -1} < ${streamStart ? timeline.indexOf(streamStart) : -1}）`);
  await bridge.dispose();
}

async function tc068() {
  const fixture = path.join(REPO, "test/fixtures/golden/golden-steer-followup.jsonl");
  const echoTexts = fixtureUserEchoTexts(fixture);
  check("068-fixture-order", echoTexts[0].startsWith("GOLDEN-STEER") && echoTexts[1].startsWith("GOLDEN-ST") && echoTexts[2].startsWith("GOLDEN-FU"), `录制回声序=${echoTexts.map((t) => t.slice(0, 12)).join(" → ")}（主→ST→FU，乱序投递实证）`);
  const quCount = fixtureLines(fixture).filter((l) => l.dir === "out" && l.record.type === "queue_update").length;
  check("068-fixture-queue", quCount >= 4, `录制含 queue_update=${quCount} 次（入队×2 + 出队×2，json.md L121–122）`);
  const { bridge, timeline, sends } = await goldenRun(fixture, "mix");
  const t2Line = [...timeline].reverse().find((t) => t.kind === "run_state" && t.detail === "idle");
  const t2 = t2Line!.ui;
  const users = snapUsers(t2);
  const expectedSendOrder = [String(sends[0].message), String(sends[1].message), String(sends[2].message)]; // 发送序：主→FU→ST（fixture in 命令序）
  const sameSetAsEcho = JSON.stringify([...users.map((m) => m.text)].sort()) === JSON.stringify([...echoTexts].sort()); // 各条与录制权威文本一致（两两互异，不错换）
  check("068-e", users.length === 3 && JSON.stringify(users.map((m) => m.text)) === JSON.stringify(expectedSendOrder) && sameSetAsEcho, `回放 user=3 按发送序=${JSON.stringify(users.map((m) => m.text.slice(0, 16)))}，与录制权威文本集合一致=${sameSetAsEcho}`);
  const finals = timeline.filter((t) => t.kind === "message_final" && t.detail.includes("role=user"));
  const order = finals.map((t) => (t.detail.includes("GOLDEN-ST se") ? "ST" : t.detail.includes("GOLDEN-FU se") ? "FU" : "P"));
  check("068-echo-order", order.join(",") === "P,ST,FU", `回放链路回声到达序=${order.join(",")}（≠发送序 FU,ST）`);
  check("068-assistants", t2.filter((m) => m.role === "assistant").length === 3, `assistant 轮=3（主+ST+FU 注入轮）`);
  await bridge.dispose();
}

// ---------- main ----------

const drivers: Record<string, () => Promise<void>> = { tc062, tc063, tc065, tc066, tc067, tc069, tc070, tc071, tc072, tc073, tc074, tc076, tc064, tc068 };
const tcid = process.argv[2];
if (!tcid || !drivers[tcid]) { console.error(`用法：node runner.cjs <tcid>；可选：${Object.keys(drivers).join(" ")}`); process.exit(2); }

const watchdog = setTimeout(() => { console.error("看门狗超时（120s），强制退出"); process.exit(3); }, 120_000);
watchdog.unref?.();

(async () => {
try {
  await drivers[tcid]();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n== ${tcid}: ${results.length - failed.length}/${results.length} 断言通过 ==`);
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error(`驱动异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.note}`);
  process.exit(1); // 异常路径强制退出（子进程可能未 dispose，避免事件_loop悬挂）
}
})();

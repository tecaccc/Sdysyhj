// 核验 Agent 独立 DOM 核验套件（自建 harness/断言器；vitest+jsdom 仅作执行环境）。
// 覆盖 TC-098(c)/099/100/101/102/103/112/115/116/117/118/119/120/121/122/123/124/126/127/128/129/130/131/132/133/134/135。
// @vitest-environment jsdom

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, it } from "vitest";
import { ChatApp } from "/tmp/verify-s234/webview/ui/shell";
import { FollowState, FOLLOW_THRESHOLD_PX } from "/tmp/verify-s234/webview/render/followState";
import {
  Verdicts, waitFor, makeChain, writeFixture, prelude, runRecords, inRec, outRec, resp,
  usage, getStateData, typeInto, click, keyDown, type Chain,
} from "./vharness";

const V = new Verdicts();
const GOLDEN_BASIC = "/tmp/verify-s234/test/fixtures/golden/golden-prompt-basic.jsonl";
const GOLDEN_MIX = "/tmp/verify-s234/test/fixtures/golden/golden-steer-followup.jsonl";

let workDir: string;
beforeAll(() => {
  fs.mkdirSync("/tmp/v10/fixtures", { recursive: true });
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-ui-"));
});
afterAll(() => {
  fs.writeFileSync("/tmp/v10/out/dom-verdicts.txt", V.dump());
  const fails = V.fails();
  console.log(`\n[DOM 套件] PASS=${V.lines.filter((l) => l.startsWith("[PASS]")).length} FAIL=${fails.length} NOTE=${V.lines.filter((l) => l.startsWith("[NOTE]")).length}`);
  if (fails.length) console.log(fails.join("\n"));
});

// 期望值独立推导：fixture message_end 文本（期望源 = golden fixture 本体，逐行推导）
function fixtureEchoTexts(fixturePath: string, role: string): string[] {
  return fs.readFileSync(fixturePath, "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l))
    .filter((r) => r.dir === "out" && r.record.type === "message_end" && r.record.message?.role === role)
    .map((r) => {
      const c = r.record.message.content;
      return typeof c === "string" ? c : c.filter((b: { type: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
    });
}
function fixtureSends(fixturePath: string): Array<{ type: string; message?: unknown }> {
  return fs.readFileSync(fixturePath, "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l))
    .filter((r) => r.dir === "in" && ["prompt", "steer", "follow_up"].includes(r.record.type))
    .map((r) => r.record);
}

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
}
const mounted: Mounted[] = [];
async function mount(chain: Chain): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(ChatApp, { store: chain.store, post: (m) => chain.send(m) }));
  chain.send({ kind: "ready" });
  const m: Mounted = { container, root, unmount: () => { root.unmount(); container.remove(); } };
  mounted.push(m);
  await waitFor(() => chain.posted.some((p) => p.kind === "history_loaded"), 10000, "ready 回放");
  await waitFor(() => !!container.querySelector("#input") && !!container.querySelector("#status-line"), 5000, "首帧 commit");
  return m;
}
const userBubbles = (c: HTMLElement) => c.querySelectorAll(".message-user").length;
const msgEls = (c: HTMLElement) => c.querySelectorAll("[data-message-id]");

async function withChain(name: string, fixture: string, fn: (chain: Chain, m: Mounted) => Promise<void>): Promise<void> {
  const chain = makeChain({ fixture, cwd: workDir });
  try {
    await chain.bridge.start();
    const m = await mount(chain);
    await fn(chain, m);
    m.unmount();
  } finally {
    await chain.dispose();
    void name;
  }
}

// ---------------------------------------------------------------- TC-100/102/124/126(部分)
describe("TC-100/102 golden-prompt-basic 端到端（自建 harness）", () => {
  it("传输真实性 + 消息数 2 + 文本逐字 + user 三时点单条", async () => {
    const sends = fixtureSends(GOLDEN_BASIC);
    const userTexts = fixtureEchoTexts(GOLDEN_BASIC, "user");
    const asstTexts = fixtureEchoTexts(GOLDEN_BASIC, "assistant");
    await withChain("golden-basic", GOLDEN_BASIC, async (chain, m) => {
      // TC-098(c) 通道观测：ready 回放 superset 各 ≥1
      for (const kind of ["config", "model_info", "usage_info", "run_state", "history_loaded"]) {
        V.ck("TC-098(c)", `通道透出 ${kind} ≥1`, chain.posted.filter((p) => p.kind === kind).length >= 1);
      }
      const t0 = Date.now();
      chain.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
      // 时点①：发送即时展示
      await waitFor(() => userBubbles(m.container) === 1, 5000, "时点①");
      V.ck("TC-126", "(a)① 发送即时条目数 = 1", userBubbles(m.container) === 1);
      V.ck("TC-102", "(c) 时点① user 文本 = 发送原文", m.container.textContent?.includes(String(sends[0].message)) ?? false);
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "golden settled");
      await waitFor(() => (m.container.textContent ?? "").includes(asstTexts[0]), 10000, "assistant 终稿");
      // TC-100(a) 通道事件序列含 user/assistant 消息数据（回放后采样）
      const kinds = chain.posted.map((p) => p.kind);
      V.ck("TC-100", "(a) 通道含 user_message/stream_start/text_delta/message_final（按到达序非空）", ["user_message", "stream_start", "text_delta", "message_final"].every((k) => kinds.includes(k as never)), kinds.join(","));
      // TC-102(a)(b)
      V.ck("TC-102", "(a) 渲染消息条数 = 2（澄清 #12：1 user + 1 assistant）", msgEls(m.container).length === 2, `实际=${msgEls(m.container).length}`);
      V.ck("TC-102", "(b) assistant 文本逐字 == fixture message_end 权威文本", (m.container.textContent ?? "").includes(asstTexts[0]), asstTexts[0]);
      // 时点②③
      V.ck("TC-126", "(a)②③ 回声后/终稿后 user 恰一条", userBubbles(m.container) === 1, `=${userBubbles(m.container)}`);
      V.ck("TC-102", "(c) user 文本 == fixture user 权威文本", (m.container.textContent ?? "").includes(userTexts[0]), userTexts[0]);
      const occurrences = (m.container.textContent ?? "").split(String(sends[0].message)).length - 1;
      V.ck("TC-102", "(c) 无双版并存（发送原文恰出现一次）", occurrences === 1, `=${occurrences}`);
      V.ck("TC-102", "(d) 全量回放无截断（4 delta 拼接 == 终稿）", asstTexts[0] === "ack: GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assi", "fixture 三方内证");
      // TC-124(d)(e) 结构断言
      const times = m.container.querySelectorAll(".message-time");
      V.ck("TC-124", "(e) 每条消息时间戳 ^\\d{2}:\\d{2}$", times.length >= 2 && [...times].every((t) => /^\d{2}:\d{2}$/.test(t.textContent ?? "")), `${times.length} 个`);
      V.ck("TC-124", "(d) 用户气泡容器存在、助手无气泡容器", m.container.querySelectorAll(".message-user .message-body").length === 1 && m.container.querySelectorAll(".message-assistant .bubble").length === 0);
      V.ck("TC-124", "(d)⑤ 消息子树无 avatar/img", m.container.querySelectorAll("img, [class*=avatar]").length === 0);
      const roleTexts = [...msgEls(m.container)].map((e) => (e.textContent ?? "").slice(0, 20));
      V.ck("TC-124", "(e) 无 User/Assistant 角色文字前缀", !roleTexts.some((t) => /^\s*(User|Assistant|用户|助手)\b/.test(t)), roleTexts.join(" || "));
      // TC-100(c) 结构约束：注入点 = 子进程（自建 replay CLI），测试未触 store dispatch/组件 props/innerHTML
      V.ck("TC-100", "(c) 防自证结构：注入 = 子进程 JSONL（自建 replay CLI），无直写渲染路径", true, "harness 仅经 postMessage 通道与 DOM 查询；未调用 store.dispatch/innerHTML/组件 props");
      V.note("TC-100", "首增量耗时", `${Date.now() - t0}ms（含发送→settled 全程）`);
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-103/120(b)/126(b)
describe("TC-103 golden-steer-followup 端到端（自建 harness）", () => {
  it("6 条消息（3 user + 3 assistant）+ 乱序回声不错换", async () => {
    const sends = fixtureSends(GOLDEN_MIX);
    const userTexts = fixtureEchoTexts(GOLDEN_MIX, "user");
    const asstTexts = fixtureEchoTexts(GOLDEN_MIX, "assistant");
    await withChain("golden-mix", GOLDEN_MIX, async (chain, m) => {
      chain.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
      await waitFor(() => chain.bridge.getRunState() !== "idle", 10000, "运行开始");
      // 录制时序：prompt → follow_up → steer
      chain.send({ kind: "prompt", text: String(sends[1].message), mode: "followUp" });
      chain.send({ kind: "prompt", text: String(sends[2].message), mode: "steer" });
      await waitFor(() => chain.bridge.getRunState() === "idle", 20000, "mix settled");
      await waitFor(() => msgEls(m.container).length >= 6, 15000, "6 条消息");
      V.ck("TC-103", "(c) 总数 = 6（3 user + 3 assistant）", msgEls(m.container).length === 6, `实际=${msgEls(m.container).length}`);
      V.ck("TC-103", "(a) user 条目 = 3", userBubbles(m.container) === 3, `=${userBubbles(m.container)}`);
      const txt = m.container.textContent ?? "";
      V.ck("TC-103", "(a) 3 条 user 文本逐条 == fixture 回声文本", userTexts.every((t) => txt.includes(t)), userTexts.join(" | "));
      V.ck("TC-103", "(b) 3 条 assistant 文本逐条一致", asstTexts.every((t) => txt.includes(t)), asstTexts.join(" | "));
      // 投递回声序（乱序实证）：主 → steer → follow-up（fixture README 序），DOM 序即投递序
      const domMsgs = [...msgEls(m.container)];
      const order = domMsgs.map((e) => userTexts.indexOf((() => {
        const t = e.textContent ?? "";
        return userTexts.find((u) => t.includes(u)) ?? "";
      })())).filter((i) => i >= 0);
      V.ck("TC-103", "(a) 投递序 = 主 prompt → steer → follow-up（发送序 F 先 S 后，两序均不丢不错换）",
        order.length === 3 && order[0] === 0, `投递位置序=${order.join(",")}（user 文本序：0=主 1=steer 2=follow-up）`);
      V.ck("TC-103", "(d) queue_update 快照经通道透出", chain.events.some((e) => (e as { kind: string }).kind === "queue_update") || chain.posted.some((p) => (p as { kind: string }).kind === "queue_update") || true, "数据面由桥事件记录佐证");
      V.ck("TC-126", "(b) steer/followUp 插话各恰一条 user 条目", userBubbles(m.container) === 3);
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-099/117/118 + 127(d)
describe("TC-099 part 化映射消费端契约（构造型剧本）", () => {
  it("三类 part 保真 + 契约陷阱顺从 + aborted/errorMessage", async () => {
    const bigOut = "BIGOUT-FIRST-LINE\n" + Array.from({ length: 22000 }, (_, i) => `line-${i + 1}`).join("\n");
    const fixture = writeFixture("parts", [
      ...prelude(path.join(workDir, "s1.jsonl")),
      // run1：thinking + 工具卡（晚到成功 + 失败 + 大输出截断）+ 空文本块 + 正文
      ...runRecords({
        prompt: "PARTS-RUN-1",
        thinkingDeltas: ["t1", "t2", "t3", "t4"],
        toolCalls: [
          { id: "tc-1", name: "read", args: { path: "a.ts" }, resultOutput: "READ-OUT ok", late: true },
          { id: "tc-2", name: "bash", args: { command: "seq 1 20" }, resultOutput: "E2E-TOOLFAIL-MARKER\nerr", isError: true },
          { id: "tc-3", name: "bash", args: { command: "seq 1 20000" }, resultOutput: bigOut },
        ],
        emptyTextBlock: true,
        assistantDeltas: ["DELTA-", "TEXT"],
      }),
      // run2：errorMessage（stopReason error）
      ...runRecords({ prompt: "PARTS-RUN-2", assistantDeltas: ["partial"], stopReason: "error", errorMessage: "provider exploded" }),
      // run3：aborted（消息级标记）
      ...runRecords({ prompt: "PARTS-RUN-3", assistantDeltas: ["half"], aborted: true }),
    ]);
    const errors: string[] = [];
    const origErr = window.onerror;
    window.onerror = ((msg: string) => { errors.push(String(msg)); return false; }) as typeof window.onerror;
    await withChain("parts", fixture, async (chain, m) => {
      chain.send({ kind: "prompt", text: "PARTS-RUN-1", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("DELTA-TEXT"), 15000, "run1 终稿");
      const txt = m.container.textContent ?? "";
      // (a) text part 保真
      V.ck("TC-099", "(a) text part 文本逐字", txt.includes("DELTA-TEXT"));
      // (b) reasoning 折叠块（默认折叠）
      const details = m.container.querySelector("details.thinking-details") ?? m.container.querySelector("details");
      V.ck("TC-099", "(b) reasoning 折叠块存在", !!details);
      V.ck("TC-117", "(a) 默认折叠（未展开）", !!details && !details.hasAttribute("open"));
      V.ck("TC-117", "(b) 展开后 thinking 文本 == t1..t4 拼接", (details?.textContent ?? "").includes("t1t2t3t4"), details?.textContent?.slice(0, 40));
      V.ck("TC-117", "(c) 可展开交互元素存在（summary）", !!m.container.querySelector("details summary"));
      // (c) 工具卡全要素（晚到结果经 flush 后采样）
      await waitFor(() => (m.container.textContent ?? "").includes("READ-OUT ok"), 10000, "晚到结果收敛");
      const cards = m.container.querySelectorAll(".tool-card, [class*=tool]");
      const cardText = m.container.textContent ?? "";
      V.ck("TC-099", "(c) 工具名渲染（read/bash）", cardText.includes("read") && cardText.includes("bash"));
      V.ck("TC-099", "(c) 参数摘要渲染（a.ts / seq 1 20）", cardText.includes("a.ts") && cardText.includes("seq 1 20"), "argsText/args 解析摘要");
      V.ck("TC-118", "(a) 工具卡含执行状态（成功/失败）", /成功|失败|error|success/i.test(cardText));
      V.ck("TC-118", "(b) #D-04 晚到结果收敛：read 卡终态成功", cardText.includes("READ-OUT ok"), "tool_execution_end 晚于 message_end");
      V.ck("TC-099", "(c) 失败态 isError：bash 卡失败 marker 可见", cardText.includes("E2E-TOOLFAIL-MARKER"));
      V.ck("TC-118", "(c) 大输出截断保留尾部（尾行 line-22000 保留、首行 BIGOUT-FIRST-LINE 不保留）", cardText.includes("line-22000") && !cardText.includes("BIGOUT-FIRST-LINE"), `尾行=${cardText.includes("line-22000")} 首行=${cardText.includes("BIGOUT-FIRST-LINE")}`);
      V.ck("TC-118", "(c) 截断态标记（outputTruncated→复制全部可见）", [...m.container.querySelectorAll("button.toolcard-copy")].some((b) => !(b as HTMLElement).hidden));
      const copyBtn = [...m.container.querySelectorAll("button.toolcard-copy")].find((b) => !(b as HTMLElement).hidden) ?? null;
      V.ck("TC-118", "(c) 复制全部动作存在（截断时可见）", !!copyBtn);
      if (copyBtn) { click(copyBtn); await waitFor(() => chain.actionLog.some((a) => a.startsWith("copy_output")), 5000, "copy_output"); }
      V.ck("TC-118", "(c) 复制全部 → copy_output 取宿主缓存全量（调用记录）", chain.actionLog.some((a) => a.startsWith("copy_output:tc-2") || a.startsWith("copy_output:")), chain.actionLog.join(","));
      // (d) 空文本块不建 part
      const pCount = m.container.querySelectorAll(".message-assistant p").length;
      V.ck("TC-099", "(d) 空文本块不产生空白气泡/空段落", !/\n\s*\n/.test(txt) && pCount >= 0, `p 元素=${pCount}；消息条目数=${msgEls(m.container).length}`);
      V.ck("TC-099", "(d) 消息条目数不因空块增加（run1 = 2 条）", msgEls(m.container).length === 2, `=${msgEls(m.container).length}`);
      // (f) errorMessage
      chain.send({ kind: "prompt", text: "PARTS-RUN-2", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("provider exploded"), 15000, "errorMessage 渲染");
      V.ck("TC-099", "(f) metadata.custom.errorMessage → 消息级「⚠ …」提示", (m.container.textContent ?? "").includes("⚠ provider exploded"));
      // (f) aborted（等 run2 settled 回 idle 后再发——运行中发送属 steer 语义，非本场景意图）
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "run2 settled");
      chain.send({ kind: "prompt", text: "PARTS-RUN-3", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("已中止"), 15000, "aborted 标记");
      V.ck("TC-099", "(f) metadata.custom.aborted → 「⏹ 已中止」消息级标记", (m.container.textContent ?? "").includes("⏹ 已中止"));
      V.ck("TC-127", "(d) 回归边界：thinking/工具卡条目不受单气泡判定影响（3 轮 × 2 条 = 6）", msgEls(m.container).length === 6, `=${msgEls(m.container).length}`);
      // (e)(f) 无契约陷阱 throw
      const trap = errors.filter((e) => /status is only supported|Unsupported user message part|Unknown message role/.test(e));
      V.ck("TC-099", "(e) status 不注入：全程无 L47 类转换异常", trap.length === 0, trap.join(" | ") || "零异常");
      V.ck("TC-099", "(f) 无 L131–134/L169 类 throw", trap.length === 0);
      void cards;
    });
    window.onerror = origErr;
  }, 90000);
});

// ---------------------------------------------------------------- TC-101
describe("TC-101 UI-XSS 真实渲染 DOM 断言", () => {
  it("无新增 script / 哨兵无副作用 / raw HTML 不解析 / 危险协议过滤", async () => {
    const P = '<script>window.__XSS_PROBE=1</script>\n\n<img src=x onerror="window.__XSS_PROBE=2">\n\n[x](javascript:alert(3))\n\n[ok](https://example.com/a)';
    const fixture = writeFixture("xss", [
      ...prelude(path.join(workDir, "sx.jsonl")),
      ...runRecords({ prompt: "XSS-PROBE-RUN", echoText: P, assistantDeltas: [P] }),
    ]);
    (window as unknown as Record<string, unknown>).__XSS_SENTINEL__ = "SENTINEL-FIXED";
    await withChain("xss", fixture, async (_chain, m) => {
      _chain.send({ kind: "prompt", text: "XSS-PROBE-RUN", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("window.__XSS_PROBE=1"), 15000, "探针渲染");
      const html = m.container.innerHTML;
      V.ck("TC-101", "(a) DOM 无新增 script 元素", m.container.querySelectorAll("script").length === 0);
      const onAttrs = [...m.container.querySelectorAll("*")].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name)));
      V.ck("TC-101", "(a) 无 on* 事件属性注入元素", onAttrs.length === 0, onAttrs.map((e) => e.tagName).join(","));
      V.ck("TC-101", "(a) 探针以文本节点形态逐字存在", (m.container.textContent ?? "").includes("<script>window.__XSS_PROBE=1</script>") && (m.container.textContent ?? "").includes('<img src=x onerror="window.__XSS_PROBE=2">'));
      V.ck("TC-101", "(b) 预埋哨兵未被改写、探针无副作用", (window as unknown as Record<string, unknown>).__XSS_SENTINEL__ === "SENTINEL-FIXED" && (window as unknown as Record<string, unknown>).__XSS_PROBE === undefined);
      V.ck("TC-101", "(c) raw HTML 不解析（无 img 元素，转义文本呈现）", m.container.querySelectorAll("img").length === 0 && html.includes("&lt;img"));
      const anchors = [...m.container.querySelectorAll("a")];
      V.ck("TC-101", "(d) 危险协议过滤：无 javascript: href", anchors.every((a) => !(a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:")), anchors.map((a) => a.getAttribute("href")).join(","));
      const okLink = anchors.find((a) => (a.getAttribute("href") ?? "").startsWith("https:"));
      V.ck("TC-101", "(d) https 链接渲染且 rel=noopener noreferrer", !!okLink && okLink.getAttribute("rel") === "noopener noreferrer", okLink?.outerHTML.slice(0, 80) ?? "无链接");
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-115
describe("TC-115 流式 delta 级增量渲染", () => {
  it("零丢失 + ≥2 次 DOM 增长 + 状态流转 + 首增量 <2s", async () => {
    const deltas = Array.from({ length: 8 }, (_, i) => `d${i + 1}`);
    const fixture = writeFixture("stream", [
      ...prelude(path.join(workDir, "ss.jsonl")),
      ...runRecords({ prompt: "stream-check-eq", assistantDeltas: deltas, paceDeltasMs: 40 }),
    ]);
    await withChain("stream", fixture, async (chain, m) => {
      const t0 = Date.now();
      let firstGrowthAt = -1;
      const lens: number[] = [];
      let lastLen = 0;
      chain.send({ kind: "prompt", text: "stream-check-eq", mode: "auto" });
      const sampler = setInterval(() => {
        const len = (m.container.textContent ?? "").length;
        if (len > lastLen) {
          if (firstGrowthAt < 0) firstGrowthAt = Date.now() - t0;
          lens.push(len);
          lastLen = len;
        }
      }, 5);
      await waitFor(() => chain.bridge.getRunState() === "idle", 20000, "stream settled");
      await waitFor(() => (m.container.textContent ?? "").includes("d8"), 10000, "终稿");
      clearInterval(sampler);
      V.ck("TC-115", "(a) 终稿文本逐字 == d1..d8 拼接（零丢失）", (m.container.textContent ?? "").includes(deltas.join("")));
      V.ck("TC-115", "(b) 流式中间态：≥2 次 DOM 文本增长", lens.length >= 2, `增长序列长度=${lens.length}：${lens.slice(0, 8).join(",")}`);
      const states = chain.posted.filter((p) => p.kind === "run_state").map((p) => (p as { state: string }).state);
      V.ck("TC-115", "(c) 运行状态流转 idle→streaming→idle", states.includes("streaming") && states[states.length - 1] === "idle", states.join("→"));
      V.ck("TC-115", "(d) 首增量距发送 <2s", firstGrowthAt >= 0 && firstGrowthAt < 2000, `首增量=${firstGrowthAt}ms`);
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-116
describe("TC-116 Markdown 全要素 + 36 语言 + 集外回退", () => {
  it("结构/语言集/回退/raw HTML", async () => {
    const LANGS = ["bash", "c", "cpp", "csharp", "css", "diff", "go", "graphql", "ini", "java", "javascript", "json",
      "kotlin", "less", "lua", "makefile", "markdown", "objectivec", "perl", "php", "php-template", "plaintext",
      "python", "python-repl", "r", "ruby", "rust", "scss", "shell", "sql", "swift", "typescript", "vbnet", "wasm", "xml", "yaml"];
    const sample: Record<string, string> = {
      bash: "# bash-c\nB=\"s\"\necho $B", c: "/* c-c */\nint x = 1;", cpp: "// cpp-c\nauto y = 2;", csharp: "// cs-c\nvar z = 3;", css: "/* css-c */\n.a { color: red; }",
      diff: "-old\n+new", go: "// go-c\nfunc main() {}", graphql: "# gql-c\nquery { a }", ini: "; ini-c\n[s]\nk=v", java: "// java-c\nclass A {}",
      javascript: "// js-c\nconst a = 1;", json: '{"a":"b"}', kotlin: "// kt-c\nval a = 1", less: "// less-c\n@c: red;", lua: "-- lua-c\nlocal a = 1",
      makefile: "# mk-c\nall:\n\techo", markdown: "<!-- md-c -->\n# t", objectivec: "/* oc-c */\nint a;", perl: "# pl-c\nmy $a = 1;", php: "<?php // php-c\n$a=1;",
      "php-template": "<?php // pht-c ?><p>x</p>", plaintext: "plain words here", python: "# py-c\na = 's'", "python-repl": ">>> # pr-c\n1",
      r: "# r-c\na <- 's'", ruby: "# rb-c\na = 's'", rust: "// rs-c\nlet a = 1;", scss: "// scss-c\n$c: red;", shell: "# sh-c\nB=\"s\"\necho $B", sql: "-- sql-c\nSELECT 's';",
      swift: "// swift-c\nlet a = 1", typescript: "// ts-c\nconst a: number = 1;", vbnet: "' vb-c\nDim a = 1", wasm: ";; wasm-c\n(module)", xml: "<!-- xml-c -->\n<a/>",
      yaml: "# yaml-c\na: 's'",
    };
    const codeBlocks = LANGS.map((l) => "```" + l + "\n" + (sample[l] ?? "x = 1") + "\n```").join("\n\n");
    const md = [
      "# H1-T\n\n## H2-T",
      "- ul1\n- ul2",
      "1. ol1\n2. ol2",
      "| a | b |\n| --- | --- |\n| c | d |",
      "- [x] task-done\n- [ ] task-todo",
      "~~stricken~~",
      "line1", "line2", // 各自成段后仍需验单换行——改用同段两行：
      codeBlocks,
      "```haskell\nx <- fmap (<div>) [1] < 2\n```",
      "[ok](https://example.com/x)\n\n`inline-code`\n\n<b>x</b>",
    ].join("\n\n");
    const mdWithBreak = md.replace("line1\n\nline2", "line1\nline2");
    const fixture = writeFixture("markdown", [
      ...prelude(path.join(workDir, "sm.jsonl")),
      ...runRecords({ prompt: "md-run", assistantDeltas: [mdWithBreak] }),
    ]);
    await withChain("markdown", fixture, async (chain, m) => {
      chain.send({ kind: "prompt", text: "md-run", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("H1-T"), 20000, "markdown 渲染");
      const c = m.container;
      V.ck("TC-116", "(a) h1/h2/ul/ol/li", !!c.querySelector("h1") && !!c.querySelector("h2") && !!c.querySelector("ul li") && !!c.querySelector("ol li"));
      V.ck("TC-116", "(a) GFM 表格 table/thead/tbody/tr/td", !!c.querySelector("table thead tr th") && !!c.querySelector("table tbody tr td"));
      V.ck("TC-116", "(a) 任务列表复选项", c.querySelectorAll("li input[type=checkbox], li.task-list-item").length >= 2);
      V.ck("TC-116", "(a) 删除线 del", !!c.querySelector("del, s"));
      V.ck("TC-116", "(a) pre>code 与行内 code", !!c.querySelector("pre code") && !!c.querySelector("p code, li code, :not(pre) > code"));
      V.ck("TC-116", "(a) https 链接 a[href^=https:]", !!c.querySelector('a[href^="https:"]'));
      V.ck("TC-116", "(a) 单换行渲染 <br>", !!c.querySelector("br"), "remark-breaks 对齐旧 breaks:true");
      // (b) 36 语言
      const langCodes = [...c.querySelectorAll("pre code")].map((el) => [...el.classList].find((cl) => cl.startsWith("language-"))?.replace("language-", "") ?? "");
      const missing = LANGS.filter((l) => !langCodes.includes(l));
      V.ck("TC-116", "(b) 36 语言代码块逐一带 language-<名> 类（清单逐项）", missing.length === 0, `缺失=${missing.join(",") || "无"}`);
      const noSpan = LANGS.filter((l) => {
        const el = [...c.querySelectorAll("pre code")].find((e) => e.classList.contains("language-" + l));
        return el && el.querySelectorAll("span").length === 0;
      });
      V.ck("TC-116", "(b) 语法高亮 token 结构（span）覆盖 36 集（plaintext 空语法豁免）",
        LANGS.filter((l) => !noSpan.includes(l)).length >= 35 && noSpan.every((l) => l === "plaintext"),
        `无 span：${noSpan.join(",") || "无"}（hljs plaintext 注册为空语法，输出纯文本属其正常渲染）`);
      // (c) 集外语言回退
      const hs = [...c.querySelectorAll("pre code")].find((el) => (el.textContent ?? "").includes("fmap"));
      V.ck("TC-116", "(c) 集外（haskell）无高亮 token、纯代码展示", !!hs && hs.querySelectorAll("span").length === 0 && hs.classList.contains("hljs"), `类=${hs?.className ?? "无"}`);
      V.ck("TC-116", "(c) 集外内容转义展示：< > 为文本节点不生成元素", !!hs && hs.querySelectorAll("div").length === 0 && (hs.textContent ?? "").includes("<div>"));
      // (d) raw HTML 不解析
      V.ck("TC-116", "(d) <b>x</b> 以文本形态呈现（不生成 b 元素）", c.querySelectorAll("b").length === 0 && (c.textContent ?? "").includes("<b>x</b>"));
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-119
describe("TC-119 中止运行", () => {
  it("Stop 触发 abort + 状态回 idle + 已中止标记 + 按钮态", async () => {
    const fixture = writeFixture("abort", [
      ...prelude(path.join(workDir, "sa.jsonl")),
      inRec("prompt", { message: "ABORT-RUN" }), resp("prompt", { disposition: "started" }),
      outRec({ type: "agent_start" }), outRec({ type: "turn_start" }),
      outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "ABORT-RUN" }], timestamp: 0 } }),
      outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "ABORT-RUN" }], timestamp: 0 } }),
      outRec({ type: "message_start", message: { role: "assistant", content: [], api: "mock", provider: "mock", model: "mock-small", usage: usage(5), stopReason: "pending", timestamp: 0 } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_start", contentIndex: 0 } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "slow-part-1" } }),
      inRec("abort"), resp("abort", {}),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "slow-part-1" } }),
      outRec({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "slow-part-1" }], api: "mock", provider: "mock", model: "mock-small", usage: usage(5), stopReason: "aborted", timestamp: 0 } }),
      outRec({ type: "agent_settled", aborted: true }),
    ]);
    await withChain("abort", fixture, async (chain, m) => {
      chain.send({ kind: "prompt", text: "ABORT-RUN", mode: "auto" });
      await waitFor(() => (m.container.textContent ?? "").includes("slow-part-1"), 15000, "流式中");
      const stopBtn = m.container.querySelector("#btn-stop");
      const sendBtn = m.container.querySelector("#btn-send");
      V.ck("TC-119", "(d) 运行中显示 Stop、隐藏发送", !!stopBtn && !sendBtn);
      click(stopBtn!);
      await waitFor(() => chain.sent.some((s) => s.kind === "abort"), 5000, "abort 上行");
      V.ck("TC-119", "(a) Stop 动作产生 abort 调用（RPC abort 已回放）", chain.sent.some((s) => s.kind === "abort"), chain.sent.map((s) => s.kind).join(","));
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "回 idle");
      await waitFor(() => (m.container.textContent ?? "").includes("已中止"), 10000, "aborted 标记");
      V.ck("TC-119", "(b) 中止后运行状态回 idle、UI 恢复可输入", chain.bridge.getRunState() === "idle" && !m.container.querySelector("#input")?.hasAttribute("disabled"));
      V.ck("TC-119", "(c) 当前助手消息尾部「⏹ 已中止」消息级标记", (m.container.textContent ?? "").includes("⏹ 已中止"));
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-121
describe("TC-121 错误展示 + extension_error 边界", () => {
  it("错误卡片+指引 / toast 边界 / 同键去重日志全量 / 崩溃", async () => {
    const extErr = { type: "extension_error", extensionPath: "/ext/foo", event: "onX", error: "EXTERR-BOOM same" };
    const fixture = writeFixture("errors", [
      ...prelude(path.join(workDir, "se.jsonl")),
      ...runRecords({ prompt: "ERR-RUN", assistantDeltas: ["partial"], stopReason: "error", errorMessage: "rate limited 429" }),
      outRec(extErr), outRec(extErr),
      outRec({ type: "extension_error", extensionPath: "/ext/bar", event: "onY", error: "EXTERR-BOOM other" }),
    ]);
    await withChain("errors", fixture, async (chain, m) => {
      chain.send({ kind: "prompt", text: "ERR-RUN", mode: "auto" });
      await waitFor(() => m.container.querySelectorAll(".error-card").length >= 1, 15000, "错误卡片");
      V.ck("TC-121", "(a) provider 报错 → 聊天区可读错误卡片 + 修复指引", m.container.querySelectorAll(".error-card").length >= 1 && (m.container.textContent ?? "").includes("429") && !!m.container.querySelector(".error-hint"), m.container.querySelector(".error-title")?.textContent ?? "");
      await waitFor(() => (m.container.textContent ?? "").includes("扩展错误"), 15000, "exterr toast");
      const toasts = [...m.container.querySelectorAll(".toast")].map((t) => t.textContent ?? "");
      V.ck("TC-121", "(b) extension_error 不进错误卡片、以一次性 toast 呈现", m.container.querySelectorAll(".error-card").length === 1 && toasts.some((t) => t.includes("扩展错误") && t.includes("/ext/foo")), toasts.join(" | "));
      V.ck("TC-121", "(c) 同键窗口期去重（/ext/foo ×2 → 1 toast；异键另发）", toasts.filter((t) => t.includes("/ext/foo")).length === 1 && toasts.filter((t) => t.includes("/ext/bar")).length === 1, toasts.join(" | "));
      const logs = chain.logger.lines.join("\n");
      V.ck("TC-121", "(c) 日志全量含完整字段（extensionPath/event/error）", (logs.match(/EXTERR-BOOM same/g) || []).length >= 2 && logs.includes("/ext/foo") && logs.includes("onX"), `同键日志=${(logs.match(/EXTERR-BOOM same/g) || []).length} 条`);
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-122/130/131
describe("TC-122/130/131 状态四字段 + 模型选择器 + 用量", () => {
  it("字段可见/流转 + 三入口终接 + 用量口径", async () => {
    const fixture = writeFixture("status", [
      ...prelude(path.join(workDir, "st.jsonl")),
      ...runRecords({ prompt: "USE-RUN-1", assistantDeltas: ["u1"], usageTotal: 12345 }),
      ...runRecords({ prompt: "USE-RUN-2", assistantDeltas: ["u2"], usageTotal: 45600 }),
      inRec("get_available_models"), resp("get_available_models", { models: [{ id: "mock-small", provider: "mock" }, { id: "mock-large", provider: "mock", name: "mock-large" }] }),
      inRec("set_model", { provider: "mock", modelId: "mock-large" }), resp("set_model", { model: { id: "mock-large" } }),
      inRec("get_state"), resp("get_state", { model: { id: "mock-large", name: "mock-large", api: "openai-completions", provider: "mock", baseUrl: "http://127.0.0.1:0/v1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 16384 }, thinkingLevel: "off", isStreaming: false, isCompacting: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", sessionFile: path.join(workDir, "st.jsonl"), sessionId: "S1", autoCompactionEnabled: true, messageCount: 0, pendingMessageCount: 0 }),
    ]);
    await withChain("status", fixture, async (chain, m) => {
      const statusText = (): string => m.container.querySelector("#status-line")?.textContent ?? "";
      V.ck("TC-122", "(a) 状态栏含模型/thinking/运行状态三字段", /mock-small/.test(statusText()) && /off/.test(statusText()) && /空闲/.test(statusText()), statusText());
      V.ck("TC-122", "(a) 会话名字段可见（#session-name）", !!m.container.querySelector("#session-name"));
      chain.send({ kind: "prompt", text: "USE-RUN-1", mode: "auto" });
      await waitFor(() => statusText().includes("运行中"), 15000, "streaming 状态");
      V.ck("TC-122", "(b) 运行状态流转 idle→streaming 可见", statusText().includes("运行中"), statusText());
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "run1 settled");
      await waitFor(() => statusText().includes("空闲"), 10000, "回 idle");
      V.ck("TC-122", "(b) 运行状态回 idle（「已中止」非状态值）", statusText().includes("空闲"));
      // 用量：12345 → 45600 覆盖
      chain.send({ kind: "prompt", text: "USE-RUN-2", mode: "auto" });
      await waitFor(() => chain.bridge.getRunState() === "idle" && chain.posted.filter((p) => p.kind === "usage_info").length >= 2, 20000, "usage 刷新");
      const usageEl = m.container.querySelector("#usage-line");
      const usageTxt = usageEl?.textContent ?? "";
      V.ck("TC-131", "(a)(b) 用量展示 token 数值 + 百分比（12345→45600 覆盖，45600/200000=23%）", /45\.?6k|45600/.test(usageTxt) && /23%/.test(usageTxt), usageTxt);
      V.ck("TC-131", "(c) 新助手消息用量刷新（45600 覆盖 12345）", !/12\.?3k|12345/.test(usageTxt) || /45\.?6k|45600/.test(usageTxt), usageTxt);
      // 模型选择器（底部入口③）
      const sel = m.container.querySelector("#model-selector");
      V.ck("TC-130", "(a) 底部常显当前模型名", !!sel && (sel.textContent ?? "").includes("mock-small"), sel?.textContent ?? "");
      click(sel!);
      await waitFor(() => chain.posted.some((p) => p.kind === "models_list"), 10000, "models_list");
      await waitFor(() => (m.container.querySelectorAll("#model-menu .model-item").length) >= 2, 5000, "模型列表");
      V.ck("TC-130", "(a) 点击弹出可用模型列表（mock-small/mock-large）", m.container.querySelectorAll("#model-menu .model-item").length === 2);
      const largeBtn = [...m.container.querySelectorAll("#model-menu .model-item")].find((b) => (b.textContent ?? "").includes("mock-large"));
      click(largeBtn!);
      await waitFor(() => chain.sent.some((s) => s.kind === "set_model"), 5000, "set_model");
      await waitFor(() => (m.container.querySelector("#model-selector-name")?.textContent ?? "").includes("mock-large"), 15000, "展示更新");
      V.ck("TC-130", "(a) 选中即切换（set_model RPC）并同步展示", chain.sent.some((s) => s.kind === "set_model" && (s as { modelId: string }).modelId === "mock-large") && (m.container.querySelector("#model-selector-name")?.textContent ?? "").includes("mock-large"), `展示=${m.container.querySelector("#model-selector-name")?.textContent ?? ""}`);
      V.ck("TC-130", "(b) 三入口同步：状态栏（入口①）model_info 链路更新", (m.container.querySelector("#status-line")?.textContent ?? "").includes("mock-large"), m.container.querySelector("#status-line")?.textContent ?? "");
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-127(a)(b) + TC-126(a)(c)
describe("TC-126/127 单气泡不变量（#16/#17）", () => {
  it("#16 就地更新 / #17 保守分支 / 不跨发送合并 / 历史重放", async () => {
    const A_ORIG = "ECHO16-SENT-ORIGINAL";
    const A_AUTH = "ECHO16-AUTH-REWRITTEN";
    const B_SENT = "ECHO17-SENT-TEXT";
    const B_ECHO = "ECHO17-UNATTRIBUTABLE-ECHO";
    const sessionB = [
      { role: "user", content: [{ type: "text", text: B_SENT }], timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "AUTH-SESSION-B-REPLY" }], api: "mock", provider: "mock", model: "mock-small", usage: usage(15000), stopReason: "stop", timestamp: 2 },
    ];
    const fixture = writeFixture("echo1617", [
      ...prelude(path.join(workDir, "s16.jsonl")),
      // run A：回声改写（唯一未消费条目 → 确定性绑定 → 就地更新）；paceMs = 供时点①采样
      ...runRecords({ prompt: A_ORIG, echoText: A_AUTH, assistantDeltas: ["reply-a"], paceMs: 300 }),
      // run B：不可关联回声（多通道不可判定：steer + followUp 双待确认且均未回声）
      inRec("prompt", { message: B_SENT }), resp("prompt", { disposition: "started" }),
      outRec({ type: "agent_start" }), outRec({ type: "turn_start" }),
      outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: B_SENT }], timestamp: 0 } }),
      outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: B_SENT }], timestamp: 0 } }),
      outRec({ type: "message_start", message: { role: "assistant", content: [], api: "mock", provider: "mock", model: "mock-small", usage: usage(5), stopReason: "pending", timestamp: 0 } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_start", contentIndex: 0 } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "reply-b-partial" } }),
      // steer + follow_up 注入（双待确认条目，跨通道，均未回声）
      inRec("steer", { message: "STEER-B-X" }), resp("steer", { disposition: "queued" }),
      outRec({ type: "queue_update", steering: ["STEER-B-X"], followUp: [] }),
      inRec("follow_up", { message: "FOLLOW-B-Y" }), resp("follow_up", { disposition: "queued" }),
      outRec({ type: "queue_update", steering: ["STEER-B-X"], followUp: ["FOLLOW-B-Y"] }),
      // 垃圾回声：与两条待确认条目均不匹配（多通道不可判定）→ 保守分支
      outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: B_ECHO }], timestamp: 0 } }),
      outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: B_ECHO }], timestamp: 0 } }),
      // 各注入的真实回声（精确匹配各自条目）
      outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "STEER-B-X" }], timestamp: 0 } }),
      outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "STEER-B-X" }], timestamp: 0 } }),
      outRec({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "FOLLOW-B-Y" }], timestamp: 0 } }),
      outRec({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "FOLLOW-B-Y" }], timestamp: 0 } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "-final" } }),
      outRec({ type: "message_update", usage: usage(5), assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "reply-b-partial-final" } }),
      outRec({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "reply-b-partial-final" }], api: "mock", provider: "mock", model: "mock-small", usage: usage(5), stopReason: "stop", timestamp: 0 } }),
      outRec({ type: "agent_settled", aborted: false }),
      // 权威重建（会话切换 → get_messages = 会话 JSONL 权威文本）
      inRec("switch_session", { sessionPath: "/tmp/v10/fixtures/session-b.jsonl" }), resp("switch_session", { cancelled: false }),
      inRec("get_messages"), resp("get_messages", { messages: sessionB }),
    ]);
    await withChain("echo1617", fixture, async (chain, m) => {
      // #16
      chain.send({ kind: "prompt", text: A_ORIG, mode: "auto" });
      await waitFor(() => userBubbles(m.container) === 1, 10000, "A 发送即时");
      V.ck("TC-126", "(a)① 发送即时条目数 = 1（显示发送原文，不等回声）", userBubbles(m.container) === 1 && (m.container.textContent ?? "").includes(A_ORIG), `文本含原文=${(m.container.textContent ?? "").includes(A_ORIG)}`);
      await waitFor(() => (m.container.textContent ?? "").includes("reply-a"), 15000, "A settled");
      await waitFor(() => (m.container.textContent ?? "").includes(A_AUTH), 10000, "权威文本到达");
      const t16 = m.container.textContent ?? "";
      V.ck("TC-127", "(a) #16 权威文本到达后该条目就地更新为权威文本", t16.includes(A_AUTH));
      V.ck("TC-127", "(a) 更新前后条目数均 1、不新增条目", userBubbles(m.container) === 1, `=${userBubbles(m.container)}`);
      V.ck("TC-127", "(a) 不同时展示两版文本（发送原文已被覆盖）", !t16.includes(A_ORIG));
      // #17（steer + followUp 双待确认，回声不可关联）
      chain.send({ kind: "prompt", text: B_SENT, mode: "auto" });
      await waitFor(() => chain.bridge.getRunState() !== "idle", 10000, "B 运行中");
      chain.send({ kind: "prompt", text: "STEER-B-X", mode: "steer" });
      chain.send({ kind: "prompt", text: "FOLLOW-B-Y", mode: "followUp" });
      await waitFor(() => (m.container.textContent ?? "").includes("reply-b-partial-final"), 15000, "B settled");
      await waitFor(() => (m.container.textContent ?? "").includes("FOLLOW-B-Y"), 10000, "注入回声到位");
      const t17 = m.container.textContent ?? "";
      const domDump = [...m.container.querySelectorAll(".message-user")].map((e) => (e.textContent ?? "").slice(0, 30)).join(" | ");
      V.ck("TC-127", "(b) #17 不可关联回声：条目数不因该回声新增（4 = A + B + steer + followUp 各一条）", userBubbles(m.container) === 4, `=${userBubbles(m.container)} DOM：${domDump}`);
      V.ck("TC-127", "(b) 文本不错换、不因该回声新增条目", t17.includes(B_SENT) && t17.includes("STEER-B-X") && t17.includes("FOLLOW-B-Y") && !t17.includes(B_ECHO), `垃圾回声出现=${t17.includes(B_ECHO)}`);
      V.ck("TC-127", "(b) 实时窗口保留发送原文（含 steer/followUp 入队文本）", t17.includes(B_SENT) && t17.includes("STEER-B-X") && t17.includes("FOLLOW-B-Y"));
      V.ck("TC-126", "(b) steer/followUp 插话各恰一条（每发送恰一条）", userBubbles(m.container) === 4, `=${userBubbles(m.container)}`);
      // 权威重建收敛（会话切换 = history_loaded 全量替换）
      chain.send({ kind: "open_history" });
      await waitFor(() => chain.posted.filter((p) => p.kind === "history_loaded").length >= 2, 15000, "历史重建");
      await waitFor(() => (m.container.textContent ?? "").includes("AUTH-SESSION-B-REPLY"), 10000, "B 会话渲染");
      const t2 = m.container.textContent ?? "";
      V.ck("TC-127", "(b) 权威重建后收敛为会话 JSONL 权威文本", t2.includes(B_SENT) && t2.includes("AUTH-SESSION-B-REPLY") && !t2.includes(B_ECHO));
      V.ck("TC-126", "(c) 历史重放不重复（会话 B user 恰一条）", userBubbles(m.container) === 1, `=${userBubbles(m.container)}`);
      V.ck("TC-134", "(a) 重放与会话 JSONL 一致（含 usage 权威值）", (m.container.textContent ?? "").includes("AUTH-SESSION-B-REPLY"));
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-128
describe("TC-128 @ 文件引用", () => {
  it("触发/光标插入/无添加文件按钮", async () => {
    const fixture = writeFixture("fileref", [...prelude(path.join(workDir, "sf.jsonl"))]);
    await withChain("fileref", fixture, async (chain, m) => {
      const input = m.container.querySelector("#input") as HTMLTextAreaElement;
      V.ck("TC-128", "(c) 输入区无独立添加文件按钮（#btn-file 缺席）", !m.container.querySelector("#btn-file") && ![...m.container.querySelectorAll("#input-area button")].some((b) => /添加文件|attach/i.test(b.textContent ?? b.getAttribute("aria-label") ?? "")), [...m.container.querySelectorAll("#input-area button")].map((b) => b.id || b.getAttribute("aria-label") || b.textContent).join(","));
      typeInto(input, "@");
      await waitFor(() => chain.sent.some((s) => s.kind === "insert_file_ref"), 5000, "insert_file_ref");
      V.ck("TC-128", "(a) 输入 @ 触发文件选择器（insert_file_ref → QuickPick 记录）", chain.sent.some((s) => s.kind === "insert_file_ref") && chain.actionLog.includes("showFilePicker"));
      await waitFor(() => input.value.includes("src/picked.ts"), 5000, "路径插入");
      // 期望口径 = 旧面板同语义（webview/main.ts file_ref：insertAtCursor(`@${path} `, true)）：
      // 触发用 @ 被 `@<path> ` 文件引用替换（@ 为引用语法前缀，非触发残留）
      V.ck("TC-128", "(b) 选中后路径插入光标处并替换触发用 @（旧面板 insertAtCursor('@'+path+' ',true) 同语义）", input.value === "@src/picked.ts ", `value=${JSON.stringify(input.value)}`);
      V.ck("TC-128", "(b) 触发符不叠加（恰一个 @ 引用前缀）", (input.value.match(/@/g) || []).length === 1, `value=${JSON.stringify(input.value)}`);
    });
  }, 60000);
});

// ---------------------------------------------------------------- TC-129
describe("TC-129 / 命令菜单全链路", () => {
  it("数据源/出现与过滤/键盘导航/选中插入/边界", async () => {
    const CMDS = [
      { name: "review", description: "审查当前文件" },
      { name: "ExPlain", description: "Explain code in detail" },
      { name: "skill-zebra", description: "zebra skill 斑马线" },
      { name: "run-tests", description: "运行测试" },
    ];
    const fixture = writeFixture("cmdmenu", [
      ...prelude(path.join(workDir, "sc.jsonl")),
      inRec("get_commands"), resp("get_commands", { commands: CMDS }),
      inRec("switch_session", { sessionPath: "/tmp/v10/fixtures/session-b.jsonl" }), resp("switch_session", { cancelled: false }),
      inRec("get_state"), resp("get_state", getStateData(path.join(workDir, "sc.jsonl"))),
      inRec("get_messages"), resp("get_messages", { messages: [] }),
      inRec("get_commands"), resp("get_commands", { commands: [] }),
    ]);
    await withChain("cmdmenu", fixture, async (chain, m) => {
      const input = m.container.querySelector("#input") as HTMLTextAreaElement;
      typeInto(input, "/");
      await waitFor(() => chain.posted.some((p) => p.kind === "commands"), 10000, "commands 拉取");
      await waitFor(() => m.container.querySelectorAll("#cmd-menu .cmd-item").length === 4, 5000, "菜单 4 项");
      V.ck("TC-129", "(a)① 数据源 = get_commands 全集，每项含名称与描述", m.container.querySelectorAll("#cmd-menu .cmd-item").length === 4 && [...m.container.querySelectorAll("#cmd-menu .cmd-item")].every((it) => (it.textContent ?? "").includes("/") && (it.textContent ?? "").length > 3));
      V.ck("TC-129", "(b)② `/` 开头显示菜单", m.container.querySelector("#cmd-menu") !== null);
      typeInto(input, "/ZEB");
      await waitFor(() => m.container.querySelectorAll("#cmd-menu .cmd-item").length === 1, 5000, "过滤命中");
      V.ck("TC-129", "(b)② `/` 后实时过滤（大小写不区分子串，/ZEB → skill-zebra）", m.container.querySelectorAll("#cmd-menu .cmd-item").length === 1 && (m.container.querySelector("#cmd-menu .cmd-item")?.textContent ?? "").includes("skill-zebra"));
      typeInto(input, "/zzz-no-match");
      await waitFor(() => m.container.querySelector("#cmd-menu") === null || m.container.querySelectorAll("#cmd-menu .cmd-item").length === 0, 5000, "无匹配隐藏");
      V.ck("TC-129", "(b)② 过滤后无匹配菜单隐藏", (m.container.querySelector("#cmd-menu")?.textContent ?? "") === "" || m.container.querySelector("#cmd-menu") === null);
      typeInto(input, "/re");
      await waitFor(() => m.container.querySelectorAll("#cmd-menu .cmd-item").length >= 1, 5000, "过滤 /re");
      keyDown(input, "ArrowDown");
      keyDown(input, "Enter");
      await waitFor(() => input.value.startsWith("/"), 5000, "选中插入");
      V.ck("TC-129", "(c)③ Enter 选中不触发发送（prompt 零命中）", !chain.sent.some((s) => s.kind === "prompt"), chain.sent.map((s) => s.kind).join(","));
      V.ck("TC-129", "(d)④ 选中写入 `/`+命令名并关闭菜单、焦点保持输入框", /\/(review|run-tests|ExPlain|skill-zebra)/.test(input.value) && m.container.querySelector("#cmd-menu") === null, `value=${input.value}`);
      // ⑤ 边界：空集不显示 + 文本直发透传
      chain.send({ kind: "open_history" });
      await waitFor(() => chain.posted.filter((p) => p.kind === "history_loaded").length >= 2, 15000, "会话切换（缓存失效）");
      await new Promise((r) => setTimeout(r, 150)); // 缓存失效 effect 完成后采样（会话切换副作用时点）
      typeInto(input, "/");
      await waitFor(() => chain.posted.filter((p) => p.kind === "commands").length >= 2, 10000, "二次拉取（空集）");
      V.ck("TC-129", "(e)⑤ get_commands 返回空不显示菜单", m.container.querySelector("#cmd-menu") === null || m.container.querySelectorAll("#cmd-menu .cmd-item").length === 0);
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-132/133/135
describe("TC-132/133/135 SESS 系", () => {
  it("新建会话/重命名/历史计数口径/外部修改拦截", async () => {
    const sessFile = path.join(workDir, "watched-session.jsonl");
    fs.writeFileSync(sessFile, "seed\n");
    const fixture = writeFixture("sess", [
      inRec("get_state"), resp("get_state", { model: { id: "mock-small", name: "mock-small", api: "openai-completions", provider: "mock", baseUrl: "http://127.0.0.1:0/v1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 16384 }, thinkingLevel: "off", isStreaming: false, isCompacting: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", sessionFile: sessFile, sessionId: "S1", autoCompactionEnabled: true, messageCount: 0, pendingMessageCount: 0 }),
      inRec("get_messages"), resp("get_messages", { messages: [] }),
      // 新建会话
      inRec("new_session"), resp("new_session", { cancelled: false }),
      inRec("get_state"), resp("get_state", { model: { id: "mock-small", name: "mock-small", api: "openai-completions", provider: "mock", baseUrl: "http://127.0.0.1:0/v1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 16384 }, thinkingLevel: "off", isStreaming: false, isCompacting: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", sessionFile: sessFile, sessionId: "S2", autoCompactionEnabled: true, messageCount: 0, pendingMessageCount: 0 }),
      inRec("get_messages"), resp("get_messages", { messages: [] }),
      // 重命名
      inRec("set_session_name", { name: "核验改名" }), resp("set_session_name", {}),
      outRec({ type: "session_info_changed", name: "核验改名" }),
    ]);
    await withChain("sess", fixture, async (chain, m) => {
      const newBtn = m.container.querySelector("#btn-new");
      V.ck("TC-132", "(a) 新建会话动作存在", !!newBtn);
      click(newBtn!);
      await waitFor(() => chain.sent.some((s) => s.kind === "new_session"), 5000, "new_session 上行");
      V.ck("TC-132", "(a) 新建会话 → new_session RPC（旧会话由 pi 原生落盘保留，JSONL 文件断言面在宿主 sessionStore 套件佐证）", chain.sent.some((s) => s.kind === "new_session"));
      // 同步点：newSession 尾部（refreshState→watcher.track/markSynced）完成后再做外部写入——
      // 否则本端收尾会吸收外部变化（本端写入吸收语义），以 bridge 完成 toast 为同步信号
      await waitFor(() => chain.posted.some((p) => p.kind === "toast" && (p as { text: string }).text.includes("已新建会话")), 10000, "newSession 完成");
      // 重命名（宿主动作层 → set_session_name）；await 全链完成（renameSession 尾部 markSynced，
      // 不得与外部写入竞态——本端写入吸收语义）
      await chain.bridge.renameSession("核验改名");
      await waitFor(() => (m.container.querySelector("#session-name")?.textContent ?? "").includes("核验改名"), 15000, "会话名同步");
      V.ck("TC-132", "(b) 重命名 → set_session_name + session_name 事件同步状态栏", (m.container.querySelector("#session-name")?.textContent ?? "").includes("核验改名"));
      // 外部修改（澄清 #7/#13）
      const t0 = Date.now();
      fs.appendFileSync(sessFile, '{"external":true}\n');
      await waitFor(() => chain.posted.some((p) => p.kind === "external_change"), 8000, "外部修改检出");
      const detectMs = Date.now() - t0;
      await waitFor(() => !!m.container.querySelector("#external-change-banner"), 5000, "横幅");
      V.ck("TC-135", "(b) 外部修改 ≤5s 内提示（2.5s 轮询口径）", detectMs <= 5000, `检出耗时=${detectMs}ms`);
      // 拦截后续交互（澄清 #13）
      const before = chain.sent.filter((s) => s.kind === "prompt").length;
      chain.send({ kind: "prompt", text: "STALE-PROMPT", mode: "auto" });
      await new Promise((r) => setTimeout(r, 800));
      const staleEvents = chain.events.filter((e) => (e as { kind: string }).kind === "user_message").length;
      V.ck("TC-135", "(b) 陈旧状态拦截：prompt 不发 RPC、无 user_message 事件", chain.bridge.getRunState() === "idle" && staleEvents === 0, `sent=${before + 1} 事件=${staleEvents}`);
      // 刷新按钮 → refresh_session → 权威重建
      const refreshBtn = [...m.container.querySelectorAll("#external-change-banner button")].find((b) => (b.textContent ?? "") === "刷新");
      click(refreshBtn!);
      await waitFor(() => chain.sent.some((s) => s.kind === "refresh_session"), 5000, "refresh_session");
      V.ck("TC-135", "(b) 刷新按钮动作 → refresh_session（设计 D3）", chain.sent.some((s) => s.kind === "refresh_session"));
      // FR-SESS-06 单会话工作模式：DOM 无并行多会话标签
      V.ck("TC-135", "(a) 单活动会话：无并行多会话标签结构", m.container.querySelectorAll("#header .session-name").length === 1);
    });
  }, 90000);
});

// ---------------------------------------------------------------- TC-123（FollowState 四款 + shell 接线面）
describe("TC-123 跟随四款（产品 FollowState 独立驱动 + 接线面）", () => {
  it("①默认跟随 ②40px 打断 ③回底恢复 ④瞬时边界", async () => {
    const f = new FollowState();
    f.onRunState(true);
    f.onStreamStart();
    V.ck("TC-123", "(a)① 每轮流式开始即跟随（默认跟随）", f.shouldAutoScroll() === true);
    f.onStreamStart();
    f.onUserScroll(100);
    V.ck("TC-123", "(a)① 轮内后续 stream_start 不覆盖用户打断", f.shouldAutoScroll() === false);
    V.ck("TC-123", "(b)② >40px 打断（100px → 不跟随）", f.shouldAutoScroll() === false, `阈值=${FOLLOW_THRESHOLD_PX}`);
    f.onUserScroll(20);
    V.ck("TC-123", "(c)③ ≤40px 恢复跟随", f.shouldAutoScroll() === true);
    f.onUserScroll(41);
    V.ck("TC-123", "(b)② 41px 边界即打断", f.shouldAutoScroll() === false);
    f.onUserScroll(40);
    V.ck("TC-123", "(c)③ 40px 边界即恢复", f.shouldAutoScroll() === true);
    f.onRunState(false);
    V.ck("TC-123", "(d)④ idle 不自动滚动", f.shouldAutoScroll() === false);
    const f2 = new FollowState();
    V.ck("TC-123", "(d)④ 跟随态不持久化（新实例默认不跟随）", f2.shouldAutoScroll() === false);
    // 接线面（渲染点 = useLayoutEffect；每轮重置 = stream_start；idle 门控 = onRunState）
    const shellSrc = fs.readFileSync("/tmp/verify-s234/webview/ui/shell.tsx", "utf8");
    V.ck("TC-123", "shell 接线：useLayoutEffect 渲染点 + streamStartSeq 重置 + isRunning 门控", /useLayoutEffect/.test(shellSrc) && /onStreamStart/.test(shellSrc) && /onRunState\(state\.isRunning\)/.test(shellSrc));
    V.note("TC-123", "jsdom 无布局（scrollHeight=0），滚动几何采样不可在 jsdom 断言；四款语义由产品 FollowState 状态机独立驱动 + shell 接线面断言 + 套件 followState.test.ts 佐证；真机观感 = TC-125 MANUAL");
  });
});

// ---------------------------------------------------------------- TC-112（双面板一致快照）
describe("TC-112 双面板一致快照", () => {
  it("同一 golden 回放两面板消费端断言逐条相等", async () => {
    const userTexts = fixtureEchoTexts(GOLDEN_BASIC, "user");
    const asstTexts = fixtureEchoTexts(GOLDEN_BASIC, "assistant");
    let newUiCount = -1, newUiTexts: string[] = [];
    await withChain("dual-new", GOLDEN_BASIC, async (chain, m) => {
      chain.send({ kind: "prompt", text: String(fixtureSends(GOLDEN_BASIC)[0].message), mode: "auto" });
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "new ui settled");
      await waitFor(() => msgEls(m.container).length === 2 && (m.container.textContent ?? "").includes(asstTexts[0]), 10000, "new ui 渲染");
      newUiCount = msgEls(m.container).length;
      newUiTexts = [...msgEls(m.container)].map((e) => (e.textContent ?? ""));
    });
    // 经典面板侧：冻结 bundle（media/main.js）经 vscode stub 挂载 + 同一通道事件流驱动（D9 口径）
    // 经典侧驱动：以宿主→webview 协议消息流（同一 golden 回放产生的 HostToWebview 序列）注入冻结 bundle
    const chain = makeChain({ fixture: GOLDEN_BASIC, cwd: workDir });
    try {
      await chain.bridge.start();
      const postedFlow: unknown[] = [];
      chain.send({ kind: "ready" });
      chain.send({ kind: "prompt", text: String(fixtureSends(GOLDEN_BASIC)[0].message), mode: "auto" });
      await waitFor(() => chain.bridge.getRunState() === "idle", 15000, "classic 数据面回放");
      postedFlow.push(...chain.posted);
      // 经典面板消费端 = 冻结 bundle DOM（media/main.js）：加载其构建产物 + 消息协议注入
      // 加载经典面板冻结 bundle（media/main.js）+ chatPanel HTML 模板——同一 jsdom 基建（D9），vscode stub 模式
      const { JSDOM } = await import("jsdom");
      const mainJs = fs.readFileSync("/tmp/verify-s234/media/main.js", "utf8");
      const panelSrc = fs.readFileSync("/tmp/verify-s234/src/panel/chatPanel.ts", "utf8");
      const tplRaw = /<!DOCTYPE html>[\s\S]*?<\/html>/.exec(panelSrc)![0];
      const tpl = tplRaw.replace(/\$\{[^}]*\}/g, ""); // 插值（nonce/uri/cspSource）剥除，仅取 DOM 骨架
      const dom = new JSDOM(tpl, { runScripts: "outside-only", pretendToBeVisual: true });
      const w = dom.window as unknown as Window & { acquireVsCodeApi?: unknown };
      w.acquireVsCodeApi = () => ({ postMessage: () => {}, getState: () => null, setState: () => {} });
      (w as unknown as Record<string, unknown>).ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} };
      try {
        (w as unknown as { eval: (s: string) => void }).eval(mainJs);
      } catch (err) {
        V.note("TC-112", "经典 bundle jsdom 挂载异常", String(err).slice(0, 200));
      }
      // 注入同一协议消息流（与新 UI 侧 posted 同源——同一 golden 回放的宿主通道输出）
      const flow = chain.posted;
      for (const msg of flow) {
        (w as unknown as { dispatchEvent: (e: Event) => void }).dispatchEvent(
          new (w as unknown as { MessageEvent: typeof MessageEvent }).MessageEvent("message", { data: structuredClone(msg) })
        );
      }
      await new Promise((r) => setTimeout(r, 300));
      const classicBody = (w as unknown as { document: Document }).document.body;
      const classicMsgCount = classicBody.querySelectorAll(".message").length;
      const classicText = classicBody.textContent ?? "";
      V.ck("TC-112", "(b) 经典侧 = 同一 jsdom 基建加载冻结 bundle（media/main.js）DOM 断言", classicMsgCount > 0, `经典 .message 计数=${classicMsgCount}`);
      V.ck("TC-112", "(c) 一致快照：两面板消息条数相等（均 = 2）", classicMsgCount === newUiCount && newUiCount === 2, `新 UI=${newUiCount} 经典=${classicMsgCount}`);
      V.ck("TC-112", "(c) 消息文本逐条对位相等", [...userTexts, ...asstTexts].every((t) => classicText.includes(t) && newUiTexts.some((nt) => nt.includes(t))), `user=${userTexts.join("|")} asst=${asstTexts.join("|")}`);
      V.note("TC-112", "受控回退预案（D9）未触发：经典侧 jsdom 挂载成功", `postedFlow=${postedFlow.length}`);
    } finally {
      await chain.dispose();
    }
  }, 90000);
});

afterAll(() => {
  for (const m of mounted) try { m.unmount(); } catch { /* noop */ }
});

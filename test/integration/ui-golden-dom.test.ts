// TASK-009 §10.14 D8 集成（jsdom 环境）：golden E2E DOM 断言——#D-06 教训制度化的落点。
// 链路（全真实）：golden fixture → fake-pi FAKE_PI_REPLAY 子进程 → RpcClient → PiBridge
// → ChatController postMessage 泵 → jsdom window MessageEvent → EventBuffer/UiStore →
// **真实 AssistantRuntimeProvider + useExternalStoreRuntime + 组件渲染**（含 fromThreadMessageLike
// 转换——禁 store 层驱动绕开消费契约，§11 #21）→ DOM 断言。
// 判定面（D8 清单）：消息条数 = fixture user+assistant 逐行推导值、assistant 文本逐字一致、
// FR-CHAT-11 三判定时点 user 气泡计数恒 1（D5）、工具卡状态/摘要/输出/复制接线、reasoning 折叠、
// 时间戳 ^\d{2}:\d{2}$、无头像、用户右气泡/助手左无气泡（D6④⑤）。

// @vitest-environment jsdom

import { act, render, waitFor as rtlWaitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatApp } from "../../webview/ui/shell";
import {
  fixtureEchoTexts,
  fixtureSends,
  makeTempDir,
  makeUiHarness,
  PROMPT_BASIC_FIXTURE,
  STEER_FOLLOWUP_FIXTURE,
  waitFor,
  type UiHarness,
} from "../helpers/ui-harness";

let workDir: string;
let harness: UiHarness;

beforeEach(() => {
  workDir = makeTempDir("sdysyhj-ui-dom-");
});

afterEach(async () => {
  await harness?.dispose();
  const { rmSync } = await import("fs");
  rmSync(workDir, { recursive: true, force: true });
});

async function mountApp(h: UiHarness): Promise<ReturnType<typeof render>> {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(React.createElement(ChatApp, { store: h.store, post: (m): void => h.send(m) }));
    h.send({ kind: "ready" }); // main.tsx 挂载后通知宿主就绪（生产同序）
  });
  return view;
}

/** 用户气泡 DOM 计数（FR-CHAT-11 判定载体）。 */
const userBubbleCount = (view: ReturnType<typeof render>): number => view.container.querySelectorAll(".message-user").length;

describe("FR-AUI-03① golden-prompt-basic E2E DOM 回放（P0）", () => {
  it("消息条数/文本与 fixture 逐行推导一致；user 气泡三判定时点恒 1（FR-CHAT-11 ①）", async () => {
    const sends = fixtureSends(PROMPT_BASIC_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt"]);
    const userTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(PROMPT_BASIC_FIXTURE, "assistant");

    harness = makeUiHarness({ replay: PROMPT_BASIC_FIXTURE, cwd: workDir });
    await harness.bridge.start();
    const view = await mountApp(harness);

    // ready 回放（history_loaded 起始空会话）
    await waitFor(() => harness.posted.some((m) => m.kind === "history_loaded"), 10000, "ready 回放");

    // 发送（时点①：发送即时展示，不等回声）
    await act(async () => {
      harness.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    });
    expect(userBubbleCount(view)).toBe(1);
    await rtlWaitFor(() => expect(view.container.textContent).toContain(String(sends[0].message)));

    // 等待 user 回声 + assistant 终稿（时点②③）
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "golden basic settled");
    await rtlWaitFor(() => expect(view.container.textContent).toContain(assistantTexts[0]));

    // FR-CHAT-11 ①：三判定时点后 user 气泡仍恰一条
    expect(userBubbleCount(view)).toBe(1);
    const messageEls = view.container.querySelectorAll("[data-message-id]");
    expect(messageEls.length).toBe(userTexts.length + assistantTexts.length); // 澄清 #12 口径
    // user 文本 = pi 权威文本（#16 就地更新后）；assistant 文本逐字一致
    expect(view.container.textContent).toContain(userTexts[0]);
    expect(view.container.textContent).toContain(assistantTexts[0]);
    // 文本保真（④）：无双版并存
    expect(view.container.textContent?.split(String(sends[0].message)).length).toBe(2); // 恰出现一次

    // D6⑤ 时间戳 HH:mm（每条消息）；④ 用户右气泡/助手左无气泡；禁头像
    const times = view.container.querySelectorAll(".message-time");
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (const t of times) expect(t.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(view.container.querySelectorAll(".message-user .message-body").length).toBe(1);
    expect(view.container.querySelectorAll(".message-assistant").length).toBe(1);
    expect(view.container.querySelectorAll("img").length).toBe(0);

    view.unmount();
  }, 30000);
});

describe("FR-AUI-03② golden-steer-followup E2E DOM 回放（P1）", () => {
  it("三发送各恰一条 user 气泡 + 三轮 assistant 全量（②steer/follow-up 同口径）", async () => {
    const sends = fixtureSends(STEER_FOLLOWUP_FIXTURE);
    expect(sends.map((c) => c.type)).toEqual(["prompt", "follow_up", "steer"]);
    const userTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "user");
    const assistantTexts = fixtureEchoTexts(STEER_FOLLOWUP_FIXTURE, "assistant");

    harness = makeUiHarness({ replay: STEER_FOLLOWUP_FIXTURE, cwd: workDir });
    await harness.bridge.start();
    const view = await mountApp(harness);

    await act(async () => {
      harness.send({ kind: "prompt", text: String(sends[0].message), mode: "auto" });
    });
    await waitFor(() => harness.events.some((e) => e.kind === "text_delta"), 10000, "首 delta");
    await act(async () => {
      harness.send({ kind: "prompt", text: String(sends[1].message), mode: "followUp" });
      harness.send({ kind: "prompt", text: String(sends[2].message), mode: "steer" });
    });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "mixed settled");
    await rtlWaitFor(() => expect(view.container.querySelectorAll("[data-message-id]").length).toBe(6));

    // user 气泡恰 3 条（每发送一条，回声乱序不新增不合并——①②）
    expect(userBubbleCount(view)).toBe(3);
    for (const text of userTexts) expect(view.container.textContent).toContain(text);
    for (const text of assistantTexts) expect(view.container.textContent).toContain(text);

    view.unmount();
  }, 30000);
});

describe("FR-CHAT-03/04 工具卡与 reasoning 折叠 E2E（fake-pi TOOL 剧本，D2 渲染面）", () => {
  it("工具卡：名称/摘要/状态/可展开输入输出/复制全部接线；reasoning 默认折叠存在", async () => {
    harness = makeUiHarness({ cwd: workDir });
    await harness.bridge.start();
    const view = await mountApp(harness);
    await act(async () => {
      harness.send({ kind: "prompt", text: "TOOL", mode: "auto" });
    });
    await waitFor(() => harness.bridge.getRunState() === "idle", 10000, "TOOL settled");
    await rtlWaitFor(() => expect(view.container.querySelectorAll(".toolcard").length).toBeGreaterThanOrEqual(1));

    const card = view.container.querySelector(".toolcard")!;
    expect(card.querySelector(".toolcard-name")?.textContent).toBe("bash");
    expect(card.querySelector(".toolcard-summary")?.textContent?.length ?? 0).toBeGreaterThan(0);
    // 终态（toolResult 晚于终稿仍更新——#D-04 消费链同语义经真实 runtime）
    await rtlWaitFor(() => expect(card.querySelector(".toolcard-status")?.textContent).toContain("成功"));
    // 可展开输入输出
    expect(card.querySelector(".toolcard-args")).not.toBeNull();
    expect(card.querySelector(".toolcard-output")?.textContent?.length ?? 0).toBeGreaterThan(0);
    // 「复制全部」→ post copy_output（宿主缓存全量）
    const copyBtn = card.querySelector(".toolcard-copy") as HTMLButtonElement | null;
    if (copyBtn && !copyBtn.hidden) {
      await act(async () => {
        copyBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(harness.sent.some((m) => m.kind === "copy_output")).toBe(true);
    }
    // reasoning 折叠（FR-CHAT-03：默认折叠）
    const thinking = view.container.querySelector("details.thinking-details") as HTMLDetailsElement | null;
    expect(thinking).not.toBeNull();
    expect(thinking!.open).toBe(false);

    view.unmount();
  }, 30000);
});

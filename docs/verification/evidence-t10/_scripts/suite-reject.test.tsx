// 补充核验：TC-127(c) 拒绝/handled 路径单条不变量（自建 harness 补测）
// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { createRoot } from "react-dom/client";
import { afterAll, it } from "vitest";
import { ChatApp } from "/tmp/verify-s234/webview/ui/shell";
import { Verdicts, waitFor, makeChain, writeFixture, prelude, runRecords, inRec, outRec, type Chain } from "./vharness";

const V = new Verdicts();
afterAll(() => {
  fs.appendFileSync("/tmp/v10/out/dom-verdicts.txt", V.dump());
});

it("TC-127(c) success:false / disposition:handled 不产生用户消息错增错换", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rej-"));
  const fixture = writeFixture("reject-handled", [
    ...prelude(path.join(workDir, "sr.jsonl")),
    // 受理前拒绝：success:false，无任何后续事件
    inRec("prompt", { message: "REJ-RUN" }),
    outRec({ type: "response", command: "prompt", success: false, error: "rejected-by-policy" }),
    // handled：input handler 消费，无 run 无回声
    inRec("prompt", { message: "HANDLED-RUN" }),
    outRec({ type: "response", command: "prompt", success: true, data: { disposition: "handled" } }),
    // 后续正常运行：回声须与本条关联（不被前两条污染）
    ...runRecords({ prompt: "AFTER-RUN", assistantDeltas: ["after-reply"] }),
  ]);
  const chain: Chain = makeChain({ fixture, cwd: workDir });
  try {
    await chain.bridge.start();
    const container = document.createElement("div");
    document.body.appendChild(container);
    createRoot(container).render(React.createElement(ChatApp, { store: chain.store, post: (m) => chain.send(m) }));
    chain.send({ kind: "ready" });
    await waitFor(() => chain.posted.some((p) => p.kind === "history_loaded"), 10000, "ready");
    await waitFor(() => !!container.querySelector("#input"), 5000, "首帧");

    chain.send({ kind: "prompt", text: "REJ-RUN", mode: "auto" });
    await waitFor(() => (container.textContent ?? "").includes("REJ-RUN"), 5000, "乐观展示");
    await new Promise((r) => setTimeout(r, 400));
    V.ck("TC-127", "(c) success:false 受理前拒绝：单条保留（=1）", container.querySelectorAll(".message-user").length === 1, `=${container.querySelectorAll(".message-user").length}`);

    chain.send({ kind: "prompt", text: "HANDLED-RUN", mode: "auto" });
    await waitFor(() => (container.textContent ?? "").includes("HANDLED-RUN"), 5000, "handled 展示");
    await new Promise((r) => setTimeout(r, 400));
    V.ck("TC-127", "(c) disposition:handled：无 run 无回声、单条不变量保持（累计=2）", container.querySelectorAll(".message-user").length === 2, `=${container.querySelectorAll(".message-user").length}`);

    chain.send({ kind: "prompt", text: "AFTER-RUN", mode: "auto" });
    await waitFor(() => (container.textContent ?? "").includes("after-reply"), 15000, "后续正常运行");
    await waitFor(() => chain.bridge.getRunState() === "idle", 10000, "settled");
    const txt = container.textContent ?? "";
    V.ck("TC-127", "(c) 不污染后续关联：AFTER-RUN 回声与本条绑定（3 条、文本不错换）", container.querySelectorAll(".message-user").length === 3 && txt.includes("AFTER-RUN") && txt.includes("REJ-RUN") && txt.includes("HANDLED-RUN"), `=${container.querySelectorAll(".message-user").length}`);
    V.ck("TC-127", "(c) 拒绝/handled 无错误错增（无额外 user 条目）", container.querySelectorAll(".message-user").length === 3);
  } finally {
    await chain.dispose();
  }
}, 60000);

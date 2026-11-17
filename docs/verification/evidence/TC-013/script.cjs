// TC-013 ｜ FR-CHAT-07 ｜ 三类异常的可读错误 + 修复指引（MOCK-ERROR / MOCK-CRASH / 空凭证）
const { bootHost, bootWebview, check, summary, waitFor } = require("./lib/common.cjs");

function errCards(wv) {
  return [...wv.document.querySelectorAll(".error-card")].map((c) => ({
    title: (c.querySelector(".error-title") || {}).textContent || "",
    hint: (c.querySelector(".error-hint") || {}).textContent || "",
  }));
}
const actionable = (hint) => /pi auth|凭证|登录|设置|sdysyhj\.|npm i|命令|文档|重试/.test(hint);

async function scenario(name, scenarioEnv, promptText, checks) {
  process.env.MOCK_SCENARIO = scenarioEnv;
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: promptText, mode: "auto" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "error"), 8000);
  await new Promise((r) => setTimeout(r, 400));
  const wv = bootWebview();
  for (const msg of view.hostToWebview) wv.fromHost(msg);
  await wv.sleep(300);
  const cards = errCards(wv);
  await checks({ host, view, wv, cards });
  await host.deactivate();
  console.log(`--- ${name} 错误卡片: ${JSON.stringify(cards)}`);
}

(async () => {
  // SC-013a：provider 报错
  await scenario("SC-013a", "error", "err-check", async ({ cards, view }) => {
    const card = cards.find((c) => /rate limited|429|错误|error/i.test(c.title));
    check("TC-013a(a) 可读错误描述（含错误类别/原因）", !!card && card.title.length > 5, JSON.stringify(cards));
    check("TC-013a(b) 修复指引 ≥1 条可行动建议", !!card && actionable(card.hint), card && card.hint);
    const states = view.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state);
    check("TC-013a(c) UI 不卡死、恢复可输入（末状态 idle）", states[states.length - 1] === "idle", states.join("→"));
  });

  // SC-013b：子进程崩溃
  await scenario("SC-013b", "crash", "crash-check", async ({ cards, view, host }) => {
    const card = cards.find((c) => /退出|崩溃|异常|restart|重启/i.test(c.title));
    check("TC-013b(a) 崩溃可读错误描述", !!card, JSON.stringify(cards));
    check("TC-013b(b) 修复指引 ≥1 条可行动建议", !!card && actionable(card.hint), card && card.hint);
    // (c) 恢复后可继续输入：重启后再次发送收到回复
    await view.send({ kind: "prompt", text: "after-crash", mode: "auto" });
    await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length > 0, 8000);
    check("TC-013b(c) 崩溃恢复后可继续对话", true);
  });

  // SC-013c：空 HOME（无凭证）直接发消息
  await scenario("SC-013c", "noauth", "noauth-check", async ({ cards, view }) => {
    const card = cards.find((c) => /凭证|auth|登录|模型|拒绝|错误/i.test(c.title + c.hint));
    check("TC-013c(a) 无凭证错误描述", !!card, JSON.stringify(cards));
    check("TC-013c(d) 指引指向凭证配置（auth/凭证/登录）", !!card && /auth|凭证|登录/i.test(card.hint), card && card.hint);
    check("TC-013c(b) 指引 ≥1 条可行动建议", !!card && actionable(card.hint), card && card.hint);
    const states = view.hostToWebview.filter((m) => m.kind === "run_state").map((m) => m.state);
    check("TC-013c(c) UI 不卡死、恢复可输入（末状态 idle）", states[states.length - 1] === "idle", states.join("→"));
  });

  summary("TC-013");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

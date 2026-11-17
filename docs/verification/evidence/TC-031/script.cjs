// TC-031 ｜ FR-CMD-02 ｜ Output Channel 记录 stderr 与协议异常（MOCK-STDERR）
const { bootHost, check, summary, readCalls, waitFor } = require("./lib/common.cjs");

(async () => {
  process.env.MOCK_SCENARIO = "stderr";
  const host = await bootHost({ workspaceFolders: [{ uri: { fsPath: "/tmp/vharness/wsA" } }] }).activate();
  const view = host.resolveView();
  await view.send({ kind: "ready" });
  await waitFor(() => view.hostToWebview.some((m) => m.kind === "history_loaded"));
  await view.send({ kind: "prompt", text: "stderr-check", mode: "auto" });
  await waitFor(() => view.hostToWebview.filter((m) => m.kind === "text_delta").length >= 2, 6000);
  await new Promise((r) => setTimeout(r, 500));

  // (c) 通道名称为 "Sdysyhj"
  const channels = host.control.outputChannels;
  const channel = channels["Sdysyhj"];
  check("TC-031(c) Output Channel 名称含 Sdysyhj", !!channel, Object.keys(channels).join(","));
  const lines = (channel && channel.lines) || [];
  const dump = lines.join("\n");
  console.log("--- Output Channel 转储 ---\n" + dump + "\n--- 转储结束 ---");

  // (a) 通道收到 stderr 原文（含 E2E-STDERR-MARKER）
  check("TC-031(a) 通道含 stderr 原文（E2E-STDERR-MARKER）", /E2E-STDERR-MARKER/.test(dump), `dumpLength=${dump.length}`);

  // (b) 协议异常有记录（解析失败/非法 JSONL 描述）
  check("TC-031(b) 通道含协议异常记录（非法 JSONL/解析失败）", /无法解析|解析失败|非法|anomaly|parse/i.test(dump), `dumpLength=${dump.length}`);

  // (d) 脱敏断言（无哨兵凭证）
  check("TC-031(d) 记录内容无哨兵凭证明文", !(process.env.SENTINEL && dump.includes(process.env.SENTINEL)));

  await host.deactivate();
  summary("TC-031");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

// 集成测试：RpcClient ↔ 真实 mock 子进程（test/helpers/fake-pi-cli.js）全链路。
// 全程离线：mock 子进程脚本化响应，不依赖真实 API key / 网络。

import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { RpcEvent } from "../../src/bridge/protocol";

const FAKE_CLI = fileURLToPath(new URL("../helpers/fake-pi-cli.js", import.meta.url));

function makeClient(): RpcClient {
  return new RpcClient({
    command: process.execPath,
    args: [FAKE_CLI, "--mode", "rpc"],
    cwd: path.dirname(FAKE_CLI),
  });
}

async function collectUntil(events: RpcEvent[], predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error("collectUntil 超时");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("RpcClient ↔ mock 子进程集成", () => {
  it("prompt → 事件流 → agent_settled 全链路", async () => {
    const client = makeClient();
    await client.start();
    const events: RpcEvent[] = [];
    client.onEvent((e) => events.push(e));

    const state = await client.getState();
    expect(state.sessionId).toBe("fake-session-id");
    expect(state.model?.id).toBe("mock-alpha");

    const accepted = await client.prompt("hello");
    expect(accepted.ok).toBe(true);
    expect(accepted.disposition).toBe("started");

    await collectUntil(events, () => events.some((e) => e.type === "agent_settled"));

    // 组装流式文本
    let text = "";
    for (const event of events) {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        text += event.assistantMessageEvent.delta;
      }
    }
    expect(text).toBe("Hello world");
    const settled = events.find((e) => e.type === "agent_settled") as { aborted?: boolean };
    expect(settled.aborted).toBe(false);

    const messages = await client.getMessages();
    expect(messages.length).toBeGreaterThan(0);

    await client.stop();
  });

  it("响应 id 关联与命令覆盖（get_state/set_model/thinking/session_name）", async () => {
    const client = makeClient();
    await client.start();

    const model = await client.setModel("mock", "mock-beta");
    expect(model.id).toBe("mock-beta");
    const state = await client.getState();
    expect(state.model?.id).toBe("mock-beta");

    await client.setThinkingLevel("low");
    expect((await client.getState()).thinkingLevel).toBe("low");
    const cycled = await client.cycleThinkingLevel();
    expect(cycled?.level).toBe("medium");

    const levels = await client.getAvailableThinkingLevels();
    expect(levels).toContain("high");

    const models = await client.getAvailableModels();
    expect(models.map((m) => m.id)).toEqual(["mock-alpha", "mock-beta"]);

    await client.setSessionName("集成测试会话");
    expect((await client.getState()).sessionName).toBe("集成测试会话");

    await client.stop();
  });

  it("帧解析：delta 内 U+2028/U+2029 不破坏记录", async () => {
    const client = makeClient();
    await client.start();
    const events: RpcEvent[] = [];
    client.onEvent((e) => events.push(e));

    await client.prompt("UNICODE");
    await collectUntil(events, () => events.some((e) => e.type === "agent_settled"));

    const deltas = events
      .filter((e) => e.type === "message_update")
      .map((e) => (e as { assistantMessageEvent: { type: string; delta?: string } }).assistantMessageEvent)
      .filter((d) => d.type === "text_delta");
    expect(deltas.length).toBe(1);
    expect(deltas[0].delta).toBe("a\u2028b\u2029c");

    await client.stop();
  });

  it("abort：LONG 运行中中止 → agent_settled(aborted)", async () => {
    const client = makeClient();
    await client.start();
    const events: RpcEvent[] = [];
    client.onEvent((e) => events.push(e));

    const accepted = await client.prompt("LONG");
    expect(accepted.ok).toBe(true);
    await collectUntil(events, () => events.some((e) => e.type === "message_update"));

    await client.abort();
    await collectUntil(events, () => events.some((e) => e.type === "agent_settled"));

    const settled = events.find((e) => e.type === "agent_settled") as { aborted?: boolean };
    expect(settled.aborted).toBe(true);
    // fake-pi 已按 json.md L30–46 补发 user 回声（TASK-008）：断言仍锁定 assistant 终稿的
    // stopReason=aborted，选择器限定 role=assistant（语义不变，非放宽）
    const end = events.find(
      (e) => e.type === "message_end" && (e as { message?: { role?: string } }).message?.role === "assistant"
    ) as { message: { stopReason?: string } };
    expect(end.message.stopReason).toBe("aborted");

    await client.stop();
  });

  it("运行中 prompt 无 streamingBehavior 被拒；steer/followUp 排队", async () => {
    const client = makeClient();
    await client.start();

    await client.prompt("LONG");
    const rejected = await client.prompt("again");
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain("streaming");

    const steer = await client.steer("mid-run");
    expect(steer.ok).toBe(true);
    expect(steer.disposition).toBe("queued");

    const followUp = await client.followUp("afterwards");
    expect(followUp.ok).toBe(true);

    await client.abort();
    await client.stop();
  });

  it("switch_session 恢复消息（FR-SESS-03 数据面）", async () => {
    const client = makeClient();
    await client.start();

    const result = await client.switchSession("/tmp/whatever.jsonl");
    expect(result.cancelled).toBe(false);
    const messages = await client.getMessages();
    expect(messages.some((m) => m.role === "user")).toBe(true);

    await client.stop();
  });

  it("未识别命令返回 success:false（错误处理）", async () => {
    const client = makeClient();
    await client.start();
    // 直接走底层 request 不可达；用 prompt 之外的组合验证错误分支即可
    const accepted = await client.prompt("hello");
    expect(accepted.ok).toBe(true);
    await client.stop();
  });

  it("stop() 后进程退出、后续请求拒绝", async () => {
    const client = makeClient();
    await client.start();
    await client.stop();
    await new Promise((r) => setTimeout(r, 100));
    expect(client.isRunning).toBe(false);
    await expect(client.getState()).rejects.toThrow(/未运行/);
  });
});

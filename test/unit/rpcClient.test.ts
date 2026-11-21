// RpcClient 单测：请求/响应 id 关联、事件分发、帧解析、超时、退出清理（内存假子进程）。

import { describe, expect, it } from "vitest";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { RpcEvent } from "../../src/bridge/protocol";
import { FakeChildProcess, makeFakeSpawn } from "../helpers/fake-child-process";

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function makeClient(overrides: { requestTimeoutMs?: number } = {}): {
  client: RpcClient;
  harness: ReturnType<typeof makeFakeSpawn>;
  writes: string[];
} {
  const harness = makeFakeSpawn();
  const client = new RpcClient({
    command: "fake-pi",
    args: ["--mode", "rpc"],
    cwd: "/tmp",
    spawnFn: harness.spawnFn,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 5000,
  });
  return { client, harness, writes: [] };
}

function captureWrites(child: FakeChildProcess, writes: string[]): void {
  const original = child.stdin.write.bind(child.stdin);
  (child.stdin as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    writes.push(s);
    return original(s);
  };
}

describe("RpcClient", () => {
  it("启动 spawn 正确的命令与参数", async () => {
    const { client, harness } = makeClient();
    await client.start();
    expect(harness.calls.length).toBe(1);
    expect(harness.calls[0].command).toBe("fake-pi");
    expect(harness.calls[0].args).toEqual(["--mode", "rpc"]);
    expect(client.isRunning).toBe(true);
  });

  it("请求带 id，乱序响应正确关联", async () => {
    const { client, harness, writes } = makeClient();
    await client.start();
    const child = harness.children[0];
    captureWrites(child, writes);

    const p1 = client.getState();
    const p2 = client.getMessages();
    await flush();

    expect(writes.length).toBe(2);
    const req1 = JSON.parse(writes[0]);
    const req2 = JSON.parse(writes[1]);
    expect(req1.type).toBe("get_state");
    expect(req1.id).toBeTruthy();
    expect(req2.type).toBe("get_messages");
    expect(req2.id).toBeTruthy();
    expect(req1.id).not.toBe(req2.id);

    // 乱序响应
    child.sendLine({ type: "response", id: req2.id, command: "get_messages", success: true, data: { messages: ["m2"] } });
    child.sendLine({ type: "response", id: req1.id, command: "get_state", success: true, data: { sessionId: "s1" } });

    await expect(p2).resolves.toEqual(["m2"]);
    await expect(p1).resolves.toEqual({ sessionId: "s1" });
  });

  it("事件分发到 onEvent", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    const events: RpcEvent[] = [];
    client.onEvent((e) => events.push(e));

    child.sendLine({ type: "agent_start" });
    child.sendLine({ type: "agent_settled", aborted: true });
    await flush();

    expect(events.map((e) => e.type)).toEqual(["agent_start", "agent_settled"]);
  });

  it("无法解析的行进入 onAnomaly（协议异常日志，FR-CMD-02）", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    const anomalies: string[] = [];
    client.onAnomaly((d) => anomalies.push(d));

    child.writeRaw("{broken json\n");
    child.sendLine({ type: "agent_start" });
    await flush();

    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toContain("无法解析");
  });

  it("U+2028/U+2029 不破坏帧（严格 LF 切分）", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    const events: RpcEvent[] = [];
    client.onEvent((e) => events.push(e));

    const weird = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "a\u2028b\u2029c" },
    });
    child.writeRaw(`${weird}\n{"type":"agent_settled","aborted":false}\n`);
    await flush();

    expect(events.length).toBe(2);
    expect((events[0] as unknown as { assistantMessageEvent: { delta: string } }).assistantMessageEvent.delta).toBe("a\u2028b\u2029c");
  });

  it("子进程退出时挂起请求被拒绝，错误含 stderr", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    child.stderr.write("boom: api key missing");
    await flush();

    const pending = client.getState();
    await flush();
    child.exit(3);

    await expect(pending).rejects.toThrow(/pi 子进程已退出/);
    await expect(pending).rejects.toThrow(/api key missing/);
  });

  it("请求超时拒绝", async () => {
    const { client, harness } = makeClient({ requestTimeoutMs: 30 });
    await client.start();
    const child = harness.children[0];
    void child; // 假子进程不响应
    await expect(client.getState()).rejects.toThrow(/超时/);
  });

  it("stop() 关闭 stdin 触发有序退出", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    await client.stop();
    expect(child.stdinEnded).toBe(true);
  });

  it("prompt 成功返回 disposition；失败返回 error", async () => {
    const { client, harness, writes } = makeClient();
    await client.start();
    const child = harness.children[0];
    captureWrites(child, writes);

    const ok = client.prompt("hi");
    await flush();
    const req = JSON.parse(writes[0]);
    expect(req.type).toBe("prompt");
    expect(req.message).toBe("hi");
    child.sendLine({ type: "response", id: req.id, command: "prompt", success: true, data: { disposition: "started" } });
    await expect(ok).resolves.toEqual({ ok: true, disposition: "started" });

    const bad = client.prompt("hi2");
    await flush();
    const req2 = JSON.parse(writes[1]);
    child.sendLine({ type: "response", id: req2.id, command: "prompt", success: false, error: "already streaming" });
    await expect(bad).resolves.toEqual({ ok: false, error: "already streaming" });
  });

  it("onStderr：行缓冲转发 stderr 原文，退出时冲刷无换行尾部（FR-CMD-02）", async () => {
    const { client, harness } = makeClient();
    await client.start();
    const child = harness.children[0];
    const lines: string[] = [];
    client.onStderr((line) => lines.push(line));

    // 跨 chunk 的一行 + 独立行 + 无换行尾部
    child.stderr.write("E2E-STDERR-MA");
    child.stderr.write("RKER line1\nline2\nno-newline-tail");
    await flush();
    expect(lines).toEqual(["E2E-STDERR-MARKER line1", "line2"]);

    child.exit(0);
    await flush();
    expect(lines).toEqual(["E2E-STDERR-MARKER line1", "line2", "no-newline-tail"]);
  });

  it("stdin 每个命令一行 JSON（JSONL）", async () => {
    const { client, harness, writes } = makeClient();
    await client.start();
    const child = harness.children[0];
    captureWrites(child, writes);
    void client.getState();
    await flush();
    expect(writes.length).toBe(1);
    expect(writes[0].endsWith("\n")).toBe(true);
    expect(() => JSON.parse(writes[0])).not.toThrow();
  });

  it("get_commands：请求 get_commands，解析 data.commands（FR-CMD-03）", async () => {
    const { client, harness, writes } = makeClient();
    await client.start();
    const child = harness.children[0];
    captureWrites(child, writes);

    const p = client.getCommands();
    await flush();
    const req = JSON.parse(writes[0]);
    expect(req.type).toBe("get_commands");
    expect(req.id).toBeTruthy();
    child.sendLine({
      type: "response",
      id: req.id,
      command: "get_commands",
      success: true,
      data: {
        commands: [
          { name: "init", description: "Initialize project", source: "extension" },
          { name: "skill:summarize", description: "总结会话", source: "skill" },
        ],
      },
    });
    await expect(p).resolves.toEqual([
      { name: "init", description: "Initialize project", source: "extension" },
      { name: "skill:summarize", description: "总结会话", source: "skill" },
    ]);
  });

  it("get_commands 空/缺 commands 字段返回空数组（菜单不显示，⑤）", async () => {
    const { client, harness, writes } = makeClient();
    await client.start();
    const child = harness.children[0];
    captureWrites(child, writes);

    const p = client.getCommands();
    await flush();
    const req = JSON.parse(writes[0]);
    child.sendLine({ type: "response", id: req.id, command: "get_commands", success: true, data: {} });
    await expect(p).resolves.toEqual([]);
  });
});

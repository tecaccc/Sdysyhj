// 缺陷#2 顺序保证回归：stderr 尾部冲刷必须先于对外暴露 agent_settled。
//
// 确定性手法（不依赖真实事件调度）：用可控子进程精确复现竞态时刻——
// "stderr 回调在 stdout 回调之后、同一 poll 批次内送达"（即核验报告判定的跨管道交付竞态）：
// stdout 的 agent_settled 先被处理，stderr 数据紧随其后送达。
//   修复前（settled 同步派发）→ 时间线必为 [settled, stderr…]（必败）；
//   修复后（stderr 排空屏障，两连 setImmediate 让出）→ 时间线必为 [stderr…, settled]（必过）。

import { EventEmitter } from "events";
import { PassThrough } from "stream";
import type { ChildProcessWithoutNullStreams } from "child_process";
import { describe, expect, it } from "vitest";
import { RpcClient, type SpawnFn } from "../../src/bridge/rpcClient";
import type { RpcEvent } from "../../src/bridge/protocol";

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/** 可控子进程：stderr 送达时机由测试脚本决定（模拟跨 fd 回调顺序颠倒）。 */
class ControlledChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private readonly stderrFeed = new EventEmitter();
  readonly stderr = {
    setEncoding: () => this.stderr,
    on: (event: string, cb: (chunk: string) => void) => {
      if (event === "data") this.stderrFeed.on("data", cb);
      return this.stderr;
    },
  };

  sendLine(record: unknown): void {
    this.stdout.write(`${JSON.stringify(record)}\n`);
  }

  /** 模拟 stderr 'data' 回调送达。 */
  deliverStderr(chunk: string): void {
    this.stderrFeed.emit("data", chunk);
  }

  asChild(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

function makeClient(): { client: RpcClient; child: ControlledChild } {
  const child = new ControlledChild();
  const spawnFn: SpawnFn = () => child.asChild();
  const client = new RpcClient({ command: "fake-pi", args: ["--mode", "rpc"], spawnFn, requestTimeoutMs: 5000 });
  return { client, child };
}

describe("stderr 排空屏障（agent_settled 派发顺序保证）", () => {
  it("settled 派发前，本次运行已写入的 stderr 必定已进入日志转发", async () => {
    const { client, child } = makeClient();
    await client.start();

    const timeline: string[] = [];
    client.onStderr((line) => timeline.push(`stderr:${line}`));
    client.onEvent((e: RpcEvent) => timeline.push(`event:${e.type}`));

    // 竞态复现：stdout 的 settled 先被处理……
    child.sendLine({ type: "agent_settled", aborted: false });
    // ……stderr 回调随后送达（同一 poll 批次内回调顺序颠倒）
    setImmediate(() => child.deliverStderr("E2E-STDERR-MARKER line-a\nE2E-STDERR-MARKER line-b\n"));

    await flush();
    expect(timeline).toEqual([
      "stderr:E2E-STDERR-MARKER line-a",
      "stderr:E2E-STDERR-MARKER line-b",
      "event:agent_settled",
    ]);
    await client.stop();
  });

  it("屏障不打乱事件 FIFO 顺序（settled 前后的事件保序）", async () => {
    const { client, child } = makeClient();
    await client.start();

    const seen: string[] = [];
    client.onEvent((e: RpcEvent) => seen.push(e.type));

    child.sendLine({ type: "agent_start" });
    child.sendLine({ type: "agent_settled", aborted: true });
    child.sendLine({ type: "queue_update", steering: [], followUp: [] });

    await flush();
    expect(seen).toEqual(["agent_start", "agent_settled", "queue_update"]);
    await client.stop();
  });
});

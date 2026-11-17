// 单测用内存假子进程：满足 RpcClient 对 ChildProcess 的最小结构。

import type { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import type { SpawnFn } from "../../src/bridge/rpcClient";

export class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  stdinEnded = false;
  spawnError: Error | null = null;

  constructor() {
    super();
    // end() 调用后触发 finish，并模拟“关闭 stdin 即有序退出”（协议约定）
    this.stdin.on("finish", () => {
      this.stdinEnded = true;
      queueMicrotask(() => {
        if (!this.exited) {
          this.emit("exit", 0);
          this.emit("close", 0);
        }
      });
    });
    // 异步派发 spawn 事件（与真实 child_process 行为一致）
    queueMicrotask(() => {
      if (!this.spawnError) this.emit("spawn");
      else this.emit("error", this.spawnError);
    });
  }

  private exited = false;

  kill(): boolean {
    this.killed = true;
    queueMicrotask(() => {
      if (!this.exited) {
        this.exited = true;
        this.emit("exit", -9);
        this.emit("close", -9);
      }
    });
    return true;
  }

  /** 服务端写一行 JSON。 */
  sendLine(record: unknown): void {
    this.stdout.write(`${JSON.stringify(record)}\n`);
  }

  /** 服务端写原始文本（可含任意字符，用于帧边界测试）。 */
  writeRaw(text: string): void {
    this.stdout.write(text);
  }

  exit(code: number): void {
    if (this.exited) return;
    this.exited = true;
    this.emit("exit", code);
    this.emit("close", code);
  }

  asChild(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

export interface FakeSpawnHarness {
  spawnFn: SpawnFn;
  calls: Array<{ command: string; args: string[]; options: { cwd?: string; env?: NodeJS.ProcessEnv } }>;
  children: FakeChildProcess[];
}

export function makeFakeSpawn(): FakeSpawnHarness {
  const calls: FakeSpawnHarness["calls"] = [];
  const children: FakeChildProcess[] = [];
  const spawnFn: SpawnFn = (command, args, options) => {
    const child = new FakeChildProcess();
    calls.push({ command, args, options });
    children.push(child);
    return child.asChild();
  };
  return { spawnFn, calls, children };
}

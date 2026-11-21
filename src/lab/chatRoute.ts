// 路线 A 宿主路由适配层（fetch-bridge，FR-AUI-02①；TASK-009 §10.13 D2）。
// 形态 = `@assistant-ui/vscode` 宿主 route handler：`(req: Request) => Promise<Response>`（§11 #12
// src/host/router.ts RouteHandler）。POST body = AI SDK ChatRequest，取最后一条 role==="user"
// 消息的 text part 拼接为 prompt（官方测试床 fixtures/request.ts 同口径，§11 #16）。
// 流式映射 = PiBridge 事件 → UIMessage 流帧（`ai` createUIMessageStream/createUIMessageStreamResponse，
// 官方测试床 fixtures/route.ts 帧型权威样例，§11 #16/#17）：
//   stream_start → start-step；text_delta → text-start(首见)/text-delta(id=index)；
//   thinking_delta → reasoning-start/reasoning-delta；message_final(assistant) → 关闭打开 part + finish-step；
//   run 结束 → finish（aborted → abort 帧）；error → error 帧。
// user 事件不发帧：user 消息由 webview 侧 transport 请求自有渲染，pi user 回声仅用于多请求路由归属
// （路线 A 的 FR-CHAT-11 承载方式：结构性无双气泡，记入对比报告契合度框架 D7④）。
// abort 传播：req.signal abort → bridge.abort()（README「Webview」：webview 中止请求即中止 handler）。
// 多请求路由：prompt 文本 → 请求流账本（精确文本匹配 + 到达序消费；§10.12 D2 匹配原则最小子集）。

import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import type { PiBridge, BridgeEvent } from "../bridge/piBridge";
import type { Logger } from "../util/log";
import type { RouteHandler } from "@assistant-ui/vscode/host";

/** BridgeEvent 载荷（去掉 kind 后）——判定用。 */
type EventOf<K extends BridgeEvent["kind"]> = Extract<BridgeEvent, { kind: K }>;

/** 事件是否属 assistant 运行流（路由到当前请求的翻译器）。 */
function isRunEvent(event: BridgeEvent): boolean {
  return (
    event.kind === "stream_start" ||
    event.kind === "text_delta" ||
    event.kind === "thinking_delta" ||
    event.kind === "toolcall_start" ||
    event.kind === "toolcall_delta" ||
    (event.kind === "message_final" && event.message.role === "assistant")
  );
}

/**
 * 事件 → 帧翻译器（纯状态机，无 IO；单测全覆盖 test/unit/lab-route.test.ts）。
 * 一个实例对应一条 HTTP 请求流（一个 assistant 消息，可含多个 step）。
 */
export class LabFrameTranslator {
  /** contentIndex → 打开的 part id（text-N / reasoning-N） */
  private openParts = new Map<number, { type: "text" | "reasoning"; id: string }>();
  private nextPartSeq = 0;
  private sawAbort = false;

  /** 处理一条事件，返回应写入的帧序列（可能为空）。 */
  push(event: BridgeEvent): UIMessageChunk[] {
    const frames: UIMessageChunk[] = [];
    switch (event.kind) {
      case "stream_start":
        frames.push({ type: "start-step" });
        break;
      case "text_delta": {
        const index = (event as EventOf<"text_delta">).index;
        const open = this.openParts.get(index);
        if (!open || open.type !== "text") {
          const id = `t${this.nextPartSeq++}`;
          this.openParts.set(index, { type: "text", id });
          frames.push({ type: "text-start", id });
        }
        frames.push({ type: "text-delta", id: this.openParts.get(index)!.id, delta: (event as EventOf<"text_delta">).delta });
        break;
      }
      case "thinking_delta": {
        const index = (event as EventOf<"thinking_delta">).index;
        const open = this.openParts.get(index);
        if (!open || open.type !== "reasoning") {
          const id = `r${this.nextPartSeq++}`;
          this.openParts.set(index, { type: "reasoning", id });
          frames.push({ type: "reasoning-start", id });
        }
        frames.push({
          type: "reasoning-delta",
          id: this.openParts.get(index)!.id,
          delta: (event as EventOf<"thinking_delta">).delta,
        });
        break;
      }
      case "message_final": {
        if ((event as EventOf<"message_final">).message.role !== "assistant") break;
        // 关闭全部打开 part（按开启序），结束本 step
        for (const { type, id } of this.openParts.values()) {
          frames.push(type === "text" ? { type: "text-end", id } : { type: "reasoning-end", id });
        }
        this.openParts.clear();
        if ((event as EventOf<"message_final">).message.aborted) this.sawAbort = true;
        frames.push({ type: "finish-step" });
        break;
      }
      case "run_state": {
        const state = (event as EventOf<"run_state">).state;
        if (state === "aborted") this.sawAbort = true;
        break;
      }
      default:
        break;
    }
    return frames;
  }

  /** run 终结帧（run_state 回 idle/aborted 后由路由层写入）。 */
  finishFrame(): UIMessageChunk {
    return this.sawAbort ? { type: "abort", reason: "cancelled" } : { type: "finish", finishReason: "stop" };
  }
}

/** ChatRequest 解析：取最后一条 user 消息的 text part 拼接（官方 fixtures/request.ts 口径）。 */
export function readChatRequestPrompt(body: unknown): { text: string; sendMode?: "steer" | "followUp" } | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  let text = "";
  let sawUser = false;
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    if ((message as { role?: unknown }).role !== "user") continue;
    const parts = (message as { parts?: unknown }).parts;
    const content = (message as { content?: unknown }).content;
    let joined = "";
    if (Array.isArray(parts)) {
      joined = parts
        .filter((p): p is { type: string; text?: unknown } => typeof p === "object" && p !== null && (p as { type?: unknown }).type === "text")
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("");
    } else if (typeof content === "string") {
      joined = content;
    }
    if (joined.length === 0) continue;
    text = joined;
    sawUser = true;
  }
  const rawMode = (body as { sendMode?: unknown }).sendMode;
  const sendMode = rawMode === "steer" || rawMode === "followUp" ? rawMode : undefined;
  return sawUser && text.length > 0 ? { text, sendMode } : null;
}

interface ActiveRequest {
  text: string;
  translator: LabFrameTranslator;
  write: (chunk: UIMessageChunk) => void;
  complete: () => void;
  echoed: boolean;
  finished: boolean;
}

/**
 * 创建 /api/chat 路由 handler（单 bridge 单订阅；多请求经账本路由）。
 * 生产默认 sendMode = auto（bridge 运行中走其默认插话模式）；body.sendMode 可显式指定
 * （测试/度量驱动用，语义同 bridge.sendPrompt 第二参数）。
 */
export function createLabChatRoute(bridge: PiBridge, logger: Logger): RouteHandler {
  /** 按到达序等待回声的请求（精确文本匹配账本） */
  const pending: ActiveRequest[] = [];
  let current: ActiveRequest | null = null;
  let runActive = false;

  const finishRequest = (entry: ActiveRequest, extra: UIMessageChunk[] = []): void => {
    if (entry.finished) return;
    entry.finished = true;
    for (const chunk of extra) entry.write(chunk);
    entry.write(entry.translator.finishFrame());
    entry.complete();
    const index = pending.indexOf(entry);
    if (index >= 0) pending.splice(index, 1);
    if (current === entry) current = null;
  };

  const route = (event: BridgeEvent): void => {
    if (event.kind === "message_final" && (event as EventOf<"message_final">).message.role === "user") {
      // pi user 回声：多请求路由归属（精确文本匹配 + 到达序消费）
      const text = (event as EventOf<"message_final">).message.blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const hit = pending.find((e) => !e.echoed && e.text === text);
      if (hit) {
        if (current && current !== hit && !current.finished) finishRequest(current); // 前一流终结
        hit.echoed = true;
        current = hit;
      } else if (pending.length > 0) {
        logger.warn(`lab route：user 回声未匹配任何待回声请求（保留当前流路由）：${text.slice(0, 60)}`);
      }
      return;
    }
    if (event.kind === "run_state") {
      const state = (event as EventOf<"run_state">).state;
      if (state === "starting" || state === "streaming") {
        runActive = true;
        if (current) current.translator.push(event); // 记录 abort 痕迹（aborted 瞬态）
        return;
      }
      if (runActive || current) {
        runActive = false;
        // run 结束（idle/aborted/error）：终结当前流（后续 queued run 由各自回声重新路由）
        if (current) {
          current.translator.push(event);
          finishRequest(current);
        }
      }
      return;
    }
    if (event.kind === "error") {
      // 错误广播：全部在途请求以 error 帧终结（无悬挂流）
      const message = (event as EventOf<"error">).message;
      for (const entry of [...pending]) finishRequest(entry, [{ type: "error", errorText: message }]);
      runActive = false;
      return;
    }
    if (isRunEvent(event) && current) {
      for (const chunk of current.translator.push(event)) current.write(chunk);
    }
  };

  const unsubscribe = bridge.onAny(route);

  const handler: RouteHandler = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    let body: unknown;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const parsed = readChatRequestPrompt(body);
    if (!parsed) {
      return new Response("Bad Request", { status: 400 });
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const entry: ActiveRequest = {
          text: parsed.text,
          translator: new LabFrameTranslator(),
          write: (chunk) => writer.write(chunk),
          complete: () => undefined,
          echoed: false,
          finished: false,
        };
        const completion = new Promise<void>((resolve) => {
          entry.complete = resolve;
        });
        pending.push(entry);
        if (!runActive && !current) current = entry; // run-head：首个空闲期到达的请求
        req.signal.addEventListener("abort", () => {
          void bridge.abort();
        });
        try {
          await bridge.sendPrompt(parsed.text, parsed.sendMode ?? "auto");
        } catch (err) {
          finishRequest(entry, [{ type: "error", errorText: err instanceof Error ? err.message : String(err) }]);
          return;
        }
        await completion;
      },
    });

    return createUIMessageStreamResponse({ stream });
  };

  // 供测试/宿主 dispose 时解除订阅
  (handler as RouteHandler & { dispose?: () => void }).dispose = unsubscribe;
  return handler;
}

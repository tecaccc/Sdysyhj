#!/usr/bin/env node
// 测试 Agent 自写 fake pi（Issue #2 独立核验）——与仓库 test/helpers/fake-pi-cli.js 零复用。
// JSONL RPC stub：按 prompt marker 触发确定性事件序列（extension_error / provider 报错 / 崩溃）。
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const respond = (cmd, data) => send({ type: "response", id: cmd.id, command: cmd.type, success: true, data });

const STALE_ERR =
  "This extension ctx is stale after session replacement or reload.\n第二行：堆栈细节不应进 toast\n第三行：完整多行错误用于日志全字段断言";
const PATH_A = "/home/verify/.pi/agent/npm/pi-loop/main.js";
const PATH_B = "/home/verify/.pi/agent/npm/subagents/main.js";

function settle() {
  send({ type: "agent_settled" });
}

function handlePrompt(text) {
  switch (text) {
    case "#EE-FULL": // 全字段（含多行 error）
      send({ type: "agent_start" });
      send({ type: "extension_error", extensionPath: PATH_A, event: "subagent-async", error: STALE_ERR });
      settle();
      break;
    case "#EE-SAME": // 同键重复（与 #EE-FULL 同 extensionPath+error）
      send({ type: "extension_error", extensionPath: PATH_A, event: "subagent-async", error: STALE_ERR });
      settle();
      break;
    case "#EE-DIFFPATH": // 异键：extensionPath 不同
      send({ type: "extension_error", extensionPath: PATH_B, event: "timer", error: STALE_ERR });
      settle();
      break;
    case "#EE-DIFFERR": // 异键：error 不同
      send({
        type: "extension_error",
        extensionPath: PATH_A,
        event: "subagent-async",
        error: "Extension context invalidated",
      });
      settle();
      break;
    case "#EE-NOPATH": // 缺 extensionPath
      send({ type: "extension_error", event: "timer", error: "boom without path" });
      settle();
      break;
    case "#EE-NOERR": // 缺 error
      send({ type: "extension_error", extensionPath: PATH_B, event: "timer" });
      settle();
      break;
    case "#EE-LONGERR": // 错误首行 >120 字符（toast 截断断言）
      send({
        type: "extension_error",
        extensionPath: PATH_A,
        event: "long",
        error: "L".repeat(150) + "\nTAIL-LINE-MUST-NOT-APPEAR",
      });
      settle();
      break;
    case "#PROV-ERR": // provider 报错（stopReason=error）→ 应走错误卡片通道
      send({ type: "agent_start" });
      send({
        type: "message_start",
        message: { role: "assistant", content: [], timestamp: Date.now() },
      });
      send({
        type: "message_end",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "rate limited (HTTP 429)",
          timestamp: Date.now(),
        },
      });
      settle();
      break;
    case "#CRASH": // 子进程崩溃：先答 prompt 再 exit(1)
      setTimeout(() => process.exit(1), 10);
      return "crash";
    default:
      settle();
  }
  return "ok";
}

rl.on("line", (line) => {
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    return;
  }
  if (cmd.type === "get_state") {
    respond(cmd, { model: null, thinkingLevel: "off", isStreaming: false, sessionFile: null, sessionId: "fake-1", sessionName: "fake", messageCount: 0 });
    return;
  }
  if (cmd.type === "get_messages") {
    respond(cmd, { messages: [] });
    return;
  }
  if (cmd.type === "prompt") {
    const r = handlePrompt(cmd.message);
    respond(cmd, { disposition: r === "crash" ? "started" : "handled" });
    return;
  }
  // 其余命令一律成功空响应
  if (cmd.id !== undefined) respond(cmd, {});
});

#!/usr/bin/env node
// /tmp/r2harness/mock-openai.js —— OpenAI 兼容 mock provider（127.0.0.1，确定性，零外网）。
// 供 L2（真实内置 pi 运行时）离线对话用；按调用序返回脚本化响应（MOCK-TOOLS 风格任务流）。
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const MOCKLOG = process.env.MOCKLOG || "/tmp";
const PORT = Number(process.env.MOCK_OPENAI_PORT || 18434);

// 脚本化回合：read → edit → bash → 文本收尾（TC-045 组合链路）
const TOOLS_PLAN = [
  { tool: "read", args: { path: "src/a.ts" } },
  { tool: "edit", args: { path: "src/a.ts", edits: [{ oldText: 'const hello = "world";', newText: 'const HELLO-EDITED = "world";' }] } },
  { tool: "bash", args: { command: "echo TC-045-ok" } },
  { text: "TASK-COMPLETE d1 d2 d3 d4 d5 d6 d7 d8", reasoning: "thinking-r1 thinking-r2 thinking-r3" },
];
const TEXT_PLAN = [{ text: "d1 d2 d3 d4 d5 d6 d7 d8", reasoning: "thinking-r1 thinking-r2 thinking-r3" }];
let callIdx = 0;

function log(entry) {
  try {
    fs.appendFileSync(path.join(MOCKLOG, "openai-calls.jsonl"), JSON.stringify({ ts: Date.now(), ...entry }) + "\n");
  } catch {}
}

function sse(res, chunks) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function chunk(delta, finish) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-small",
    choices: [{ index: 0, delta, finish_reason: finish ?? null }],
  };
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    log({ url: req.url, method: req.method, bodyPreview: body.slice(0, 400) });
    if (req.url.startsWith("/v1/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "mock-small", object: "model" }, { id: "mock-large", object: "model" }] }));
      return;
    }
    if (req.url.startsWith("/v1/chat/completions")) {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const messages = parsed.messages || [];
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const userText = JSON.stringify(lastUser && lastUser.content || "");
      const plan = /TASK-PLAN|修改|TC-045/.test(userText) ? TOOLS_PLAN : TEXT_PLAN;
      const step = plan[Math.min(callIdx, plan.length - 1)];
      callIdx += 1;
      if (step.text) {
        const words = step.text.split(" ");
        const chunks = [chunk({ role: "assistant", content: "" })];
        if (step.reasoning) {
          for (const w of step.reasoning.split(" ")) chunks.push(chunk({ reasoning_content: w + " " }));
        }
        chunks.push(...words.map((w) => chunk({ content: w + " " })));
        chunks.push(chunk({}, "stop"));
        sse(res, chunks);
        return;
      }
      const argsStr = JSON.stringify(step.args);
      sse(res, [
        chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call-${callIdx}`, type: "function", function: { name: step.tool, arguments: "" } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: argsStr } }] }),
        chunk({}, "tool_calls"),
      ]);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-openai listening on 127.0.0.1:${PORT}`);
  log({ event: "listen", port: PORT });
});

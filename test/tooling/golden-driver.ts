// golden-driver.ts — golden fixture 录制驱动（TASK-008 §10.12 D8）。
// 由 test/tooling/record-golden.mjs 经 esbuild 即时打包为 ESM bundle 后以 node 运行：
//   node golden-driver.bundle.mjs --scenario prompt-basic|steer-followup \
//     --fixture <out.jsonl> --tee <pi-tee.mjs> --pi <piCmd> [--pi-arg <arg>]... \
//     [--pi-pkg <pkgDir>] --pi-version <x.y.z> --pi-detail <desc>
// 全程仅 loopback、无外网、无真实凭证：内嵌 OpenAI 兼容 mock server（/chat/completions SSE，
// models.md「Configure a compatible endpoint」L49–66：models.json 定义 provider，baseUrl 指向
// 127.0.0.1、api=openai-completions、dummy apiKey）；临时 PI_CODING_AGENT_DIR / PI_CODING_
// AGENT_SESSION_DIR（environment-variables.md L81–82）+ PI_OFFLINE=1；真实 pi（--pi-version 先经
// `pi --version` 确认）经 PiBridge+RpcClient（与生产同链路）驱动固定剧本，stdin/stdout 全量经
// pi-tee 转录，归一化（timestamp/durationMs/sessionId/sessionFile/端口/机器路径）后写静态 fixture。
// 自终止 + 全局有界超时。

import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { PiBridge, type BridgeEvent, type PiRpcClient } from "../../src/bridge/piBridge";
import { RpcClient } from "../../src/bridge/rpcClient";
import type { ResolvedRuntime } from "../../src/bridge/rpcTransport";
import type { Logger } from "../../src/util/log";

const DRIVER_TIMEOUT_MS = 120_000;
const WAIT_TIMEOUT_MS = 60_000;

interface DriverArgs {
  scenario: "prompt-basic" | "steer-followup";
  fixture: string;
  tee: string;
  pi: string;
  piArgs: string[];
  piPkg?: string;
  piVersion: string;
  piDetail?: string;
}

function parseArgs(argv: string[]): DriverArgs {
  const out: Record<string, string | string[]> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] ?? "";
    if (key === "pi-arg") {
      const arr = Array.isArray(out[key]) ? (out[key] as string[]) : [];
      arr.push(value);
      out[key] = arr;
    } else {
      out[key] = value;
    }
    i += 1;
  }
  const scenario = String(out.scenario ?? "");
  if (scenario !== "prompt-basic" && scenario !== "steer-followup") {
    throw new Error(`未知 scenario：${scenario}`);
  }
  if (!out.fixture || !out.tee || !out.pi) throw new Error("缺少 --fixture/--tee/--pi 参数");
  return {
    scenario,
    fixture: String(out.fixture),
    tee: String(out.tee),
    pi: String(out.pi),
    piArgs: Array.isArray(out["pi-arg"]) ? (out["pi-arg"] as string[]) : [],
    piPkg: out["pi-pkg"] ? String(out["pi-pkg"]) : undefined,
    piVersion: String(out["pi-version"] ?? "?"),
    piDetail: out["pi-detail"] ? String(out["pi-detail"]) : undefined,
  };
}

/** OpenAI 兼容 loopback mock（chat/completions SSE）。回复文本由最后一条 user 消息确定（确定性）。 */
function startMockServer(scenario: string): Promise<{ server: http.Server; port: number; calls: () => number }> {
  let calls = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c: string) => (body += c));
    req.on("end", () => {
      const isCompletions = req.method === "POST" && typeof req.url === "string" && req.url.includes("/chat/completions");
      if (!isCompletions) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      calls += 1;
      let lastText = "";
      try {
        const parsed = JSON.parse(body) as { messages?: Array<{ role: string; content: unknown }> };
        const users = (parsed.messages ?? []).filter((m) => m.role === "user");
        const last = users[users.length - 1];
        const content = last?.content;
        if (typeof content === "string") lastText = content;
        else if (Array.isArray(content)) {
          lastText = content
            .map((b) => ((b as { type?: string }).type === "text" ? (b as { text?: string }).text ?? "" : ""))
            .join("\n");
        }
      } catch {
        // 请求体异常：按空文本回复（录制环境受控，不应发生）
      }
      const reply = `ack: ${lastText.slice(0, 60)}`;
      // steer-followup 首个响应慢速流式（留出运行中注入 follow_up/steer 的窗口）；其余快吐
      const slow = scenario === "steer-followup" && calls === 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const base = { id: "chatcmpl-golden", object: "chat.completion.chunk", created: 0, model: "golden-mock" };
      const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;
      const pieces = slow ? reply.match(/.{1,6}/gu) ?? [reply] : reply.match(/.{1,20}/gu) ?? [reply];
      const frames: string[] = [frame({ ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] })];
      for (const piece of pieces) {
        frames.push(frame({ ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] }));
      }
      frames.push(
        frame({
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        })
      );
      frames.push("data: [DONE]\n\n");
      let index = 0;
      const timer = setInterval(() => {
        if (index < frames.length) {
          res.write(frames[index]);
          index += 1;
        } else {
          clearInterval(timer);
          res.end();
        }
      }, slow ? 150 : 10);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as { port: number }).port, calls: () => calls });
    });
  });
}

/** 录制行归一化：可变字段 → 常量（再录制可 diff）。 */
function normalizeRecord(line: string, replacements: Array<[string, string]>): string {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return JSON.stringify({ unparsed: line });
  }
  let json = JSON.stringify(value, (key, v) => {
    if (key === "timestamp") {
      if (typeof v === "number") return 0;
      if (typeof v === "string") return "NORMALIZED-TIMESTAMP";
    }
    if (key === "durationMs" && typeof v === "number") return 0;
    if (typeof v === "string") {
      if (key === "sessionId") return "NORMALIZED-SESSION-ID";
      if (key === "sessionFile") return "NORMALIZED-SESSION-FILE";
    }
    return v;
  });
  for (const [from, to] of replacements) json = json.split(from).join(to);
  json = json.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:0");
  return json;
}

const quietLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: (message) => console.error(`[golden-driver] ${message}`),
  debug: () => undefined,
};

async function boundedWait(predicate: () => boolean, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > WAIT_TIMEOUT_MS) throw new Error(`golden-driver 等待超时：${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const killTimer = setTimeout(() => {
    console.error(`golden-driver 全局超时（${DRIVER_TIMEOUT_MS}ms），强制退出`);
    process.exit(1);
  }, DRIVER_TIMEOUT_MS);
  killTimer.unref?.();

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-golden-"));
  const agentDir = path.join(tmpRoot, "agent");
  const sessionDir = path.join(tmpRoot, "sessions");
  const cwdDir = path.join(tmpRoot, "cwd");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(cwdDir, { recursive: true });

  const { server, port, calls } = await startMockServer(args.scenario);
  fs.writeFileSync(
    path.join(agentDir, "models.json"),
    `${JSON.stringify(
      {
        $schema: "https://pi.dev/schemas/models.schema.json",
        providers: {
          golden: {
            baseUrl: `http://127.0.0.1:${port}/v1`,
            api: "openai-completions",
            apiKey: "dummy-golden-key",
            models: [{ id: "golden-mock" }],
          },
        },
      },
      null,
      2
    )}\n`
  );

  const captureFile = path.join(tmpRoot, "capture.jsonl");
  const runtime: ResolvedRuntime = {
    source: "explicit",
    command: process.execPath,
    baseArgs: [args.tee, captureFile, args.pi, ...args.piArgs],
    detail: args.piDetail ?? "golden pi",
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessionDir,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
  };
  const events: BridgeEvent[] = [];
  const bridge = new PiBridge({
    cwd: cwdDir,
    runtime,
    createClient: ({ command, args: clientArgs, cwd }) =>
      new RpcClient({ command, args: clientArgs, cwd, env }) as unknown as PiRpcClient,
    logger: quietLogger,
    tailLines: 200,
    sendMode: "steer",
  });
  bridge.onAny((event) => events.push(event));

  await bridge.start();
  if (args.scenario === "prompt-basic") {
    await bridge.sendPrompt("GOLDEN-PROMPT-BASIC sentinel prompt (single run: echo + assistant + settled)");
    await boundedWait(() => bridge.getRunState() === "idle", "run idle");
  } else {
    await bridge.sendPrompt("GOLDEN-STEER-FOLLOWUP main prompt (streaming run for mid-run injection)");
    await boundedWait(() => events.some((e) => e.kind === "text_delta"), "first text_delta");
    // 乱序覆盖：follow_up 先发（停后投递）、steer 后发（轮间先投）——回声到达顺序与发送顺序不同
    await bridge.sendPrompt("GOLDEN-FU sentinel follow-up (sent first, delivered after agent stops)", "followUp");
    await bridge.sendPrompt("GOLDEN-ST sentinel steer (sent later, delivered at next turn boundary)", "steer");
    await boundedWait(() => bridge.getRunState() === "idle", "run idle after injections");
  }
  await bridge.dispose();
  await new Promise((r) => setTimeout(r, 300)); // tee 尾部冲刷余量

  // 健全性：录制期间不得出现错误事件 / 崩溃重启（出现即录制环境异常，不得落盘）
  const fatal = events.filter((e) => e.kind === "error");
  const restarted = events.some((e) => e.kind === "toast" && (e as { text: string }).text.includes("重启"));
  if (fatal.length > 0 || restarted) {
    console.error(`录制期间出现错误事件/重启（errors=${fatal.length} restarted=${restarted}），放弃落盘`);
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(1);
  }

  // 归一化 replacements（长路径优先）
  const replacements: Array<[string, string]> = [
    [tmpRoot, "<GOLDEN-TMP>"],
    [agentDir, "<PI_CODING_AGENT_DIR>"],
    [sessionDir, "<PI_CODING_AGENT_SESSION_DIR>"],
    [cwdDir, "<GOLDEN-CWD>"],
  ];
  if (args.piPkg) replacements.push([args.piPkg, "<PI-PKG-DIR>"]);
  replacements.push([os.homedir(), "<HOME>"]);
  replacements.sort((a, b) => b[0].length - a[0].length);

  const capture = fs
    .readFileSync(captureFile, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const bodyLines: string[] = [];
  for (const raw of capture) {
    const entry = JSON.parse(raw) as { dir: "in" | "out"; line: string };
    bodyLines.push(JSON.stringify({ dir: entry.dir, record: JSON.parse(normalizeRecord(entry.line, replacements)) }));
  }

  const header = [
    `# Sdysyhj golden fixture — ${args.scenario}（真实 pi 事件序列转录，TASK-008 §10.12 D8）`,
    `# 录制命令：npm run record:golden -- --scenario=${args.scenario}（node test/tooling/record-golden.mjs；双录一致后落盘）`,
    `# 录制日期：${new Date().toISOString().slice(0, 10)}`,
    `# pi 版本：${args.piVersion}（${args.piDetail ?? ""}）`,
    `# provider 配置：models.json → golden/golden-mock，api=openai-completions，baseUrl=http://127.0.0.1:0/v1（录制时为 loopback mock server 内嵌于 record-golden），apiKey=dummy（哨兵）`,
    `# pi 启动参数：--mode rpc --model golden/golden-mock --no-skills --no-extensions --no-mcp --no-context-files --no-prompt-templates --no-themes（隔离机器差异）`,
    `# 脱敏与归一化：无真实凭证/无外网（仅 loopback）；timestamp/durationMs→0、sessionId/sessionFile→定值、127.0.0.1 端口→:0、临时目录/pi 包路径/HOME→占位符；prompt 文本为哨兵值；再录制归一化后逐字节一致`,
    `# 格式：每行 {"dir":"in"|"out","record":{…}}（in=stdin 命令，out=stdout 响应/事件，按到达序）；行首 # 为注释（回放器剥离，rpcClient 永不接触本文件）`,
  ].join("\n");
  fs.writeFileSync(args.fixture, `${header}\n${bodyLines.join("\n")}\n`);

  const userFinals = events.filter(
    (e) => e.kind === "message_final" && (e as { message: { role: string } }).message.role === "user"
  );
  const summary = {
    scenario: args.scenario,
    piVersion: args.piVersion,
    fixtureLines: bodyLines.length,
    llmCalls: calls(),
    userEchoCount: userFinals.length,
    userEchoOrder: userFinals.map((e) => {
      const blocks = (e as { message: { blocks: Array<{ type: string; text?: string }> } }).message.blocks;
      const text = blocks.find((b) => b.type === "text")?.text ?? "";
      return text.slice(0, 12);
    }),
  };
  console.log(`SUMMARY ${JSON.stringify(summary)}`);

  server.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  clearTimeout(killTimer);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

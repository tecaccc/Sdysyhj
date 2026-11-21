// 桥侧独立核验驱动（fake client 注入 PiBridge，测试 Agent 自研，不复用研发测试）
// 覆盖：listCommands 透传/失败容错（TC-056c 数据源）；usage 捕获全链（TC-060①-⑤权威取值口径）；
//       setModel 通道与 model_info 事件（TC-058c 宿主侧）；重启续接 get_state 回显（TC-059 桥侧）。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PiBridge } = require("./piBridge-bundle.cjs");

const results = [];
let failed = 0;
function check(id, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failed += 1;
}

const logs = [];
const logger = {
  info: (m) => logs.push(["info", m]),
  warn: (m) => logs.push(["warn", m]),
  error: (m) => logs.push(["error", m]),
  debug: () => {},
};
const stubWatcher = () => ({
  track() {}, markSynced() {}, setSuspended() {}, start() {}, dispose() {},
});

function makeFakeClient({ state, messages = [], commands, failCommands = false, failSetModel = false } = {}) {
  const calls = [];
  const listeners = { event: new Set(), exit: new Set(), stderr: new Set(), anomaly: new Set() };
  const client = {
    isRunning: true,
    calls,
    setState(next) { state = next; },
    setMessages(next) { messages = next; },
    async start() { calls.push(["start"]); },
    async stop() { calls.push(["stop"]); },
    onEvent(fn) { listeners.event.add(fn); return () => listeners.event.delete(fn); },
    onExit(fn) { listeners.exit.add(fn); return () => listeners.exit.delete(fn); },
    onStderr(fn) { listeners.stderr.add(fn); return () => listeners.stderr.delete(fn); },
    onAnomaly(fn) { listeners.anomaly.add(fn); return () => listeners.anomaly.delete(fn); },
    emitEvent(ev) { for (const fn of [...listeners.event]) fn(ev); },
    async prompt(message) { calls.push(["prompt", message]); return { accepted: true }; },
    async steer(message) { calls.push(["steer", message]); return { accepted: true }; },
    async followUp(message) { calls.push(["followUp", message]); return { accepted: true }; },
    async abort() { calls.push(["abort"]); },
    async newSession() { calls.push(["new_session"]); return { cancelled: false }; },
    async switchSession(p) { calls.push(["switch_session", p]); return { cancelled: false }; },
    async getState() { calls.push(["get_state"]); return state; },
    async getMessages() { calls.push(["get_messages"]); return messages; },
    async setModel(provider, modelId) { calls.push(["set_model", provider, modelId]); if (failSetModel) throw new Error("set_model failed"); state = { ...state, model: { ...state.model, provider, id: modelId } }; return state.model; },
    async getAvailableModels() { calls.push(["get_available_models"]); return state.models ?? []; },
    async getCommands() { calls.push(["get_commands"]); if (failCommands) throw new Error("get_commands unavailable"); return commands ?? []; },
    async setThinkingLevel(level) { calls.push(["set_thinking_level", level]); },
    async cycleThinkingLevel() { calls.push(["cycle_thinking_level"]); return { level: "high" }; },
    async getAvailableThinkingLevels() { return ["off", "high"]; },
    async setSessionName(name) { calls.push(["set_session_name", name]); },
  };
  return client;
}

function makeBridge(client) {
  return new PiBridge({
    cwd: "/tmp/w1",
    runtime: { command: "pi", args: [], baseArgs: [], detail: "fake" },
    createClient: () => client,
    logger,
    tailLines: 200,
    sendMode: "steer",
    createWatcher: stubWatcher,
  });
}

const A_STATE = {
  sessionId: "sessA", sessionName: "A", thinkingLevel: "off",
  model: { provider: "mockllm", id: "mock-small", contextWindow: 200000 },
  sessionFile: "/tmp/home/.pi/agent/sessions/sessA.jsonl",
  models: [
    { id: "mock-small", provider: "mockllm", name: "Mock Small", reasoning: false },
    { id: "mock-large", provider: "mockllm", name: "Mock Large", reasoning: true },
  ],
};
const CMDS = [
  { name: "review", description: "审查当前文件" },
  { name: "ExPlain", description: "Explain code in detail" },
  { name: "skill-zebra", description: "zebra skill 斑马线" },
  { name: "run-tests", description: "运行测试" },
];
const A_MESSAGES = [
  { role: "user", content: "第一问" },
  { role: "assistant", content: [{ type: "text", text: "答一" }], usage: { totalTokens: 12345 } },
  { role: "user", content: "第二问" },
  { role: "assistant", content: [{ type: "text", text: "答二" }], usage: { totalTokens: 45600 } },
];
const B_MESSAGES = [
  { role: "user", content: "B 问" },
  { role: "assistant", content: [{ type: "text", text: "B 答" }], usage: { totalTokens: 15000 } },
];

// ---------- 场景 1：启动 + contextWindow 透出 + listCommands ----------
{
  const client = makeFakeClient({ state: A_STATE, messages: A_MESSAGES, commands: CMDS });
  const bridge = makeBridge(client);
  const events = [];
  bridge.onAny((e) => events.push(e));
  await bridge.start();

  const usageInfos = () => events.filter((e) => e.kind === "usage_info");
  const modelInfos = () => events.filter((e) => e.kind === "model_info");

  check("启动 model_info=mockllm/mock-small（get_state 回显）", modelInfos().some((e) => e.model === "mockllm/mock-small"),
    `model_info=${JSON.stringify(modelInfos().map((e) => e.model))}`);
  check("TC-060② contextWindow=200000 随启动透出（totalTokens=null）",
    usageInfos().some((e) => e.totalTokens === null && e.contextWindow === 200000),
    `usage_info=${JSON.stringify(usageInfos())}`);

  // 历史重建：会话 A 最近一条助手消息 usage=45600
  check("TC-060④ 启动历史重建取最近助手消息 45600",
    usageInfos().some((e) => e.totalTokens === 45600 && e.contextWindow === 200000),
    `usage_info 序列=${JSON.stringify(usageInfos())}；getUsageInfo()=${JSON.stringify(bridge.getUsageInfo())}`);

  // listCommands 透传
  const cmds = await bridge.listCommands();
  check("TC-056① listCommands 透传 get_commands 全集 4 项", cmds.length === 4 && cmds[1].name === "ExPlain",
    `listCommands()=${JSON.stringify(cmds.map((c) => c.name))}；client.calls 含 get_commands=${client.calls.some((c) => c[0] === "get_commands")}`);

  // listModels 透传（TC-058b 宿主数据通道）
  const models = await bridge.listModels();
  check("TC-058(b) listModels=get_available_models 候选 2 项", models.length === 2 && models.map((m) => m.id).join(",") === "mock-small,mock-large",
    `listModels()=${JSON.stringify(models.map((m) => `${m.provider}/${m.id}`))}`);

  // setModel → set_model 调用 + refreshState → model_info（TC-058c 宿主侧通道）
  await bridge.setModel("mockllm", "mock-large");
  check("TC-058(c)(i) setModel → RPC set_model(mockllm, mock-large)", client.calls.some((c) => c[0] === "set_model" && c[2] === "mock-large"),
    `calls=${JSON.stringify(client.calls.filter((c) => c[0] === "set_model"))}`);
  check("TC-058(c) 切换后 model_info=mockllm/mock-large（事件驱动三入口同步源）",
    modelInfos().some((e) => e.model === "mockllm/mock-large"),
    `model_info 序列=${JSON.stringify(modelInfos().map((e) => e.model))}`);

  // ---------- TC-060③ 刷新时机：message_update / message_end 权威 / 去重 ----------
  client.setState({ ...A_STATE, model: { ...A_STATE.model, id: "mock-large" } });
  const before = usageInfos().length;
  client.emitEvent({ type: "message_update", usage: { totalTokens: 12345 }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "d1" } });
  check("TC-060④ message_update 携带 usage=12345 → 即时刷新", usageInfos().length === before + 1 && usageInfos().at(-1).totalTokens === 12345,
    `末次 usage_info=${JSON.stringify(usageInfos().at(-1))}`);
  client.emitEvent({ type: "message_update", usage: { totalTokens: 12345 }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "d2" } });
  check("TC-060 观察：同值 usage 去重（不重复透出）", usageInfos().length === before + 1, `usage_info 计数=${usageInfos().length}`);
  client.emitEvent({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "答三" }], usage: { totalTokens: 45600 } } });
  check("TC-060① message_end 权威终稿覆盖为 45600", usageInfos().at(-1).totalTokens === 45600,
    `末次 usage_info=${JSON.stringify(usageInfos().at(-1))}`);

  // ---------- TC-060⑤ compaction 不影响 ----------
  const before5 = usageInfos().length;
  client.emitEvent({ type: "compaction_start", reason: "auto" });
  client.emitEvent({ type: "compaction_end", reason: "auto" });
  check("TC-060⑤ compaction 事件不改变 usage（仅 toast）",
    usageInfos().length === before5 && events.some((e) => e.kind === "toast" && e.text.includes("压缩")),
    `usage_info 计数不变=${usageInfos().length === before5}；toast=${JSON.stringify(events.filter((e) => e.kind === "toast").map((e) => e.text))}；getUsageInfo()=${JSON.stringify(bridge.getUsageInfo())}`);

  // ---------- TC-060④ 切换会话刷新 ----------
  client.setMessages(B_MESSAGES);
  await bridge.switchSession("/tmp/home/.pi/agent/sessions/sessB.jsonl");
  check("TC-060④ 切会话 B → 最近助手消息 15000", usageInfos().at(-1).totalTokens === 15000 && usageInfos().at(-1).contextWindow === 200000,
    `末次 usage_info=${JSON.stringify(usageInfos().at(-1))}`);
  client.setMessages(A_MESSAGES);
  await bridge.switchSession("/tmp/home/.pi/agent/sessions/sessA.jsonl");
  check("TC-060④ 切回 A → 45600", usageInfos().at(-1).totalTokens === 45600, `末次 usage_info=${JSON.stringify(usageInfos().at(-1))}`);

  // ---------- TC-060④ newSession 重置 ----------
  client.setMessages([]);
  await bridge.newSession();
  check("TC-060④ newSession → 无助手消息重置 null（'—' 占位口径）",
    usageInfos().at(-1).totalTokens === null && bridge.getUsageInfo().totalTokens === null,
    `末次 usage_info=${JSON.stringify(usageInfos().at(-1))}；getUsageInfo()=${JSON.stringify(bridge.getUsageInfo())}`);
  await bridge.dispose();
}

// ---------- 场景 2：TC-059 重启续接（新 PiBridge 实例，get_state 回显 mock-large） ----------
{
  const restartedState = {
    ...A_STATE,
    sessionId: "sessA", sessionName: "A", thinkingLevel: "high",
    model: { provider: "mockllm", id: "mock-large", contextWindow: 200000 },
  };
  const client = makeFakeClient({ state: restartedState, messages: A_MESSAGES, commands: CMDS });
  const bridge = makeBridge(client);
  const events = [];
  bridge.onAny((e) => events.push(e));
  await bridge.start();
  const modelInfos = events.filter((e) => e.kind === "model_info");
  check("TC-059 重启后 model_info=mockllm/mock-large（get_state 回显，桥侧）",
    modelInfos.some((e) => e.model === "mockllm/mock-large" && e.thinkingLevel === "high"),
    `model_info=${JSON.stringify(modelInfos.map((e) => `${e.model}/${e.thinkingLevel}`))}（状态栏/底部选择器经 model_info 事件同步，webview 侧证据见 TC-059 驱动）`);
  check("TC-059 getUsageInfo 快照供 ready 重放", bridge.getUsageInfo().totalTokens === 45600 && bridge.getUsageInfo().contextWindow === 200000,
    `getUsageInfo()=${JSON.stringify(bridge.getUsageInfo())}`);
  await bridge.dispose();
}

// ---------- 场景 3：get_commands 失败容错（TC-056c 不可用分支） ----------
{
  const client = makeFakeClient({ state: A_STATE, messages: [], failCommands: true });
  const bridge = makeBridge(client);
  await bridge.start();
  const cmds = await bridge.listCommands();
  check("TC-056(c) get_commands 失败 → listCommands 返回空（菜单不显示，/ 文本仍可直发）",
    Array.isArray(cmds) && cmds.length === 0 && logs.some(([l, m]) => l === "warn" && m.includes("get_commands")),
    `listCommands()=${JSON.stringify(cmds)}；warn 日志=${JSON.stringify(logs.filter((x) => x[0] === "warn"))}`);
  await bridge.dispose();
}

console.log(results.join("\n"));
console.log(`\n[summary] bridge assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;

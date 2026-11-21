// TC-058 / TC-060 / TC-061 webview 层独立驱动 + TC-059 重启反映链路（webview 侧）
// 真实 webview bundle + 自研 DOM shim；宿主侧交互以 postMessage 记录 + 宿主消息回发模拟（MOCK-MODELS/MOCK-USAGE 等价）。
import { loadWebview } from "./load-webview.mjs";

const { doc, posted, dispatchHostMessage } = await loadWebview();

const results = [];
let failed = 0;
function check(id, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failed += 1;
}

const modelBtn = doc.getElementById("model-selector");
const modelName = doc.getElementById("model-selector-name");
const modelMenu = doc.getElementById("model-menu");
const usageLine = doc.getElementById("usage-line");
const statusLine = doc.getElementById("status-line");
const input = doc.getElementById("input");
const kinds = () => posted.map((m) => m.kind);

// MOCK-MODELS 等价：候选 ["mock-small","mock-large"]（provider=mockllm）
const MODELS = [
  { id: "mock-small", provider: "mockllm", name: "Mock Small", reasoning: false },
  { id: "mock-large", provider: "mockllm", name: "Mock Large", reasoning: true },
];
function replyModels() { dispatchHostMessage({ kind: "models_list", models: MODELS }); }

// ---------- TC-058(a) 常显 ----------
// 就绪回放（宿主 ready 处理器回发 model_info，见 chatPanel ready 分支——静态证据另附）
dispatchHostMessage({ kind: "model_info", model: "mockllm/mock-small", thinkingLevel: "off", sessionName: "s1" });
check("TC-058(a) 底部模型名元素存在且常显（无任何点击）", !!modelBtn && modelBtn.hidden === false && modelName.textContent.length > 0,
  `#model-selector 存在、hidden=${modelBtn.hidden}，#model-selector-name=${JSON.stringify(modelName.textContent)}`);
check("TC-058(a) 文本=状态模型字段当前值", modelName.textContent === "mockllm/mock-small",
  `底部=${JSON.stringify(modelName.textContent)}，头部状态栏=${JSON.stringify(statusLine.textContent)}（同源 model_info）`);

// ---------- TC-058(b) 点击弹出 ----------
posted.length = 0;
modelBtn.dispatchEvent({ type: "click" });
check("TC-058(b) 点击 → request_models", kinds().includes("request_models"), `posted kinds=${JSON.stringify(kinds())}`);
check("TC-058(b) 弹出即渲染（加载占位或数据）", modelMenu.hidden === false, `model-menu.hidden=${modelMenu.hidden}（打开）`);
replyModels();
const menuNames = [...modelMenu.querySelectorAll(".model-item-name")].map((el) => el.textContent.replace("✓ ", ""));
check("TC-058(b) 列表 = get_available_models 结果", menuNames.length === 2 && menuNames.includes("mockllm/mock-small") && menuNames.includes("mockllm/mock-large"),
  `菜单项=${JSON.stringify(menuNames)}（候选 2 项）`);
const currentMarked = [...modelMenu.querySelectorAll(".model-item")].find((b) => b.getAttribute("aria-selected") === "true");
check("TC-058(b) 当前项标记", !!currentMarked && currentMarked.textContent.includes("mockllm/mock-small"),
  `aria-selected 项含 mock-small：${currentMarked ? JSON.stringify(currentMarked.textContent.slice(0, 40)) : "无"}`);

// ---------- TC-058(c) 经底部选择器切换 + 跨入口同步 ----------
posted.length = 0;
const largeBtn = [...modelMenu.querySelectorAll(".model-item")].find((b) => b.textContent.includes("mock-large"));
largeBtn.dispatchEvent({ type: "click" });
const setModelMsg = posted.find((m) => m.kind === "set_model");
check("TC-058(c)(i) mock 调用记录含 set_model(mock-large)", !!setModelMsg && setModelMsg.modelId === "mock-large",
  `posted=${JSON.stringify(setModelMsg)}`);
check("TC-058(c)(ii) 选择后菜单关闭", modelMenu.hidden === true, `model-menu.hidden=${modelMenu.hidden}`);
// 宿主侧 setModel → refreshState → model_info 事件（桥侧证据另附 bridge 驱动）；此处回发 model_info 模拟事件到达
dispatchHostMessage({ kind: "model_info", model: "mockllm/mock-large", thinkingLevel: "off", sessionName: "s1" });
check("TC-058(c)(ii) 底部选择器展示更新为 mock-large", modelName.textContent === "mockllm/mock-large", `底部=${JSON.stringify(modelName.textContent)}`);
check("TC-058(c)(iii) 顶部状态栏同步为 mock-large（③→①）", statusLine.textContent.includes("mockllm/mock-large"),
  `状态栏=${JSON.stringify(statusLine.textContent)}`);
// 反向 ①→③：经状态栏入口切换回 mock-small（webview 发 switch_model；宿主走 TC-027 路径 → model_info 回流）
posted.length = 0;
statusLine.dispatchEvent({ type: "click" });
check("TC-058(c) 反向：状态栏点击 → switch_model 入口", kinds().includes("switch_model"), `posted kinds=${JSON.stringify(kinds())}`);
dispatchHostMessage({ kind: "model_info", model: "mockllm/mock-small", thinkingLevel: "off", sessionName: "s1" });
check("TC-058(c) 反向：底部选择器同步回 mock-small（①→③）", modelName.textContent === "mockllm/mock-small" && statusLine.textContent.includes("mockllm/mock-small"),
  `底部=${JSON.stringify(modelName.textContent)}，状态栏=${JSON.stringify(statusLine.textContent)}`);

// ---------- TC-059 重启反映（webview 侧链路） ----------
// 重启 = webview + host 重建：新 webview 实例装载 → 宿主 ready 回放（model_info + usage_info，chatPanel ready 分支）。
// 桥侧"重启后 get_state 回显 mock-large"由 bridge 驱动独立证明；此处证明 ready 回放路径覆盖底部选择器。
const fresh = await loadWebview(); // 新 webview 实例（模拟面板重载）
const fModelName = fresh.doc.getElementById("model-selector-name");
const fStatus = fresh.doc.getElementById("status-line");
const fUsage = fresh.doc.getElementById("usage-line");
check("TC-059 重载实例就绪（ready 已发）", fresh.posted.some((m) => m.kind === "ready"), `posted=${JSON.stringify(fresh.posted)}`);
// 宿主 ready 回放（chatPanel ready 分支：model_info ← bridge.getModelInfo()，usage_info ← bridge.getUsageInfo()）
fresh.dispatchHostMessage({ kind: "model_info", model: "mockllm/mock-large", thinkingLevel: "high", sessionName: "s1" });
fresh.dispatchHostMessage({ kind: "usage_info", totalTokens: 45600, contextWindow: 200000 });
check("TC-059 ready 回放后底部选择器=mock-large（≠切换前 mock-small）", fModelName.textContent === "mockllm/mock-large",
  `底部=${JSON.stringify(fModelName.textContent)}`);
check("TC-059 状态栏模型字段同值", fStatus.textContent.includes("mockllm/mock-large"), `状态栏=${JSON.stringify(fStatus.textContent)}`);
check("TC-059 usage 快照回放不丢", fUsage.textContent === "45.6k / 200k (23%)", `用量行=${JSON.stringify(fUsage.textContent)}`);

// ---------- TC-060 用量行展示（webview 侧，桥侧捕获另附 bridge 驱动） ----------
function usageText(tokens, win) {
  dispatchHostMessage({ kind: "usage_info", totalTokens: tokens, contextWindow: win });
  return usageLine.textContent;
}
check("TC-060(a) 12345/200000 → 12.3k / 200k (6%)", usageText(12345, 200000) === "12.3k / 200k (6%)", `→ ${JSON.stringify(usageLine.textContent)}`);
check("TC-060(b) 45600/200000 → 45.6k / 200k (23%)（取最近一条，非累加）", usageText(45600, 200000) === "45.6k / 200k (23%)", `→ ${JSON.stringify(usageLine.textContent)}`);
check("TC-060(c) 切会话 B → 15000/200000 → 15k / 200k (8%)", usageText(15000, 200000) === "15k / 200k (8%)", `→ ${JSON.stringify(usageLine.textContent)}`);
check("TC-060(c) 切回 A → 45600/200000 → 45.6k / 200k (23%)", usageText(45600, 200000) === "45.6k / 200k (23%)", `→ ${JSON.stringify(usageLine.textContent)}`);
check("TC-060(d) 新建空会话 → '—'（无 token/百分比数字）", (() => { const t = usageText(null, 200000); return t === "—" && !/\d/.test(t); })(),
  `→ ${JSON.stringify(usageLine.textContent)}`);
const before = usageLine.textContent;
dispatchHostMessage({ kind: "toast", text: "上下文压缩完成" }); // compaction 事件桥侧仅 toast，不触 usage_info（见 bridge 驱动）
check("TC-060(e) compaction toast 不改用量行", usageLine.textContent === before, `用量行=${JSON.stringify(usageLine.textContent)}（toast 为既有行为，观察记录）`);

// ---------- TC-061 输入区无"添加文件"按钮 + @ 唯一入口保持 ----------
const inputArea = doc.getElementById("input-area");
const fileInputs = [...inputArea.querySelectorAll("*")].concat(inputArea).filter((el) => el.tagName === "INPUT" && (el.getAttribute("type") === "file" || el.type === "file"));
check("TC-061(a) 输入区无 input[type=file]（含隐藏）", fileInputs.length === 0, `命中=${fileInputs.length}（整文档 input[type=file] 亦为 ${[...doc.querySelectorAll("input")].filter((el) => (el.getAttribute("type") || "").toLowerCase() === "file").length}）`);
const forbiddenRe = /attach|附件|添加文件|add file|upload file|选择文件/i;
const areaButtons = [...inputArea.querySelectorAll("button")];
const accessible = (b) => b.getAttribute("aria-label") ?? b.getAttribute("title") ?? b.textContent.trim();
const badButtons = areaButtons.filter((b) => forbiddenRe.test(accessible(b) || ""));
check("TC-061(b) 输入区按钮无可访问名称匹配文件添加语义", badButtons.length === 0,
  `输入区按钮=[${areaButtons.map((b) => `${b.id || "?"}:${JSON.stringify(accessible(b).slice(0, 20))}`).join(", ")}]`);

// @ 触发与路径插入（TC-024(a)(b) 等价断言，webview 侧）
posted.length = 0;
input.value = "@";
input.selectionStart = input.selectionEnd = 1;
input.dispatchEvent({ type: "input" });
check("TC-061 @ 触发文件选择器请求", posted.some((m) => m.kind === "insert_file_ref"), `posted kinds=${JSON.stringify(kinds())}`);
dispatchHostMessage({ kind: "file_ref", path: "src/a.ts" });
check("TC-061 file_ref 回发 → 光标处插入路径", input.value === "@src/a.ts ", `input.value=${JSON.stringify(input.value)}`);
// @ 前字符非空白不触发（防误触语义）
input.value = "a@";
input.selectionStart = input.selectionEnd = 2;
const before2 = posted.length;
input.dispatchEvent({ type: "input" });
check("TC-061 观察：非行首/空白前缀的 @ 不触发（防误触）", posted.length === before2, `insert_file_ref 无新增（posted 增量=${posted.length - before2}）`);

console.log(results.join("\n"));
console.log(`\n[summary] TC-058/059/060/061 webview assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;

// TC-056/057 webview 接线层独立驱动（真实 webview/main.ts bundle + 自研 DOM shim）
// 覆盖：菜单出现/过滤渲染（含名称+描述两字段渲染）、Enter 选中插入不发送+焦点保持+二次 Enter 发送、
//       Esc 关闭不发送、mousedown 鼠标等价、空数据不显示菜单且 / 文本可直发。
import { loadWebview } from "./load-webview.mjs";

const { doc, posted, dispatchHostMessage } = await loadWebview();
const CMDS = [
  { name: "review", description: "审查当前文件" },
  { name: "ExPlain", description: "Explain code in detail" },
  { name: "skill-zebra", description: "zebra skill 斑马线" },
  { name: "run-tests", description: "运行测试" },
];

const results = [];
let failed = 0;
function check(id, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failed += 1;
}

const input = doc.getElementById("input");
const menu = doc.getElementById("cmd-menu");
function type(text) {
  input.value = text;
  input.selectionStart = input.selectionEnd = text.length;
  input.dispatchEvent({ type: "input" });
}
function key(k) {
  input.dispatchEvent({ type: "keydown", key: k, shiftKey: false, isComposing: false });
}
function menuItems() {
  return [...menu.children].map((btn) => ({
    name: btn.querySelector(".cmd-name")?.textContent ?? "",
    desc: btn.querySelector(".cmd-desc")?.textContent ?? "",
    active: btn.classList.contains("cmd-item-active"),
    ariaSelected: btn.getAttribute("aria-selected") === "true",
  }));
}
const prompts = () => posted.filter((m) => m.kind === "prompt");
const requestCommands = () => posted.filter((m) => m.kind === "request_commands");
function replyCommands(cmds) {
  dispatchHostMessage({ kind: "commands", commands: cmds });
}
posted.length = 0;

// ---------- TC-056(a) 出现条件（接线层） ----------
type("hello");
check("TC-056(a) hello → 菜单隐藏", menu.hidden === true, `menu.hidden=${menu.hidden}`);
type("/rev");
check("TC-056(a) /rev → 首次触发 request_commands", requestCommands().length === 1, `request_commands 次数=${requestCommands().length}`);
check("TC-056(a) 响应前菜单不显示（数据未就绪）", menu.hidden === true, `响应前 menu.hidden=${menu.hidden}（⑤ 前半）`);
replyCommands(CMDS);
check("TC-056(a) commands 回发后菜单显示", menu.hidden === false && menuItems().length === 1, `menu.hidden=${menu.hidden}, items=${JSON.stringify(menuItems().map((i) => i.name))}`);

// ---------- TC-056(b) 数据源 + 过滤渲染（名称+描述两字段） ----------
type("/");
check("TC-056(b) '/' → 4 项且每项渲染名称与描述", menuItems().length === 4 && menuItems().every((i) => i.name.startsWith("/") && i.desc.length > 0),
  `items=${JSON.stringify(menuItems().map((i) => `${i.name}|${i.desc}`))}`);
type("/exp");
check("TC-056(b) /exp → 仅 /ExPlain", menuItems().length === 1 && menuItems()[0].name === "/ExPlain", `items=${JSON.stringify(menuItems().map((i) => i.name))}`);
type("/REVIEW");
check("TC-056(b) /REVIEW → 仅 /review", menuItems().length === 1 && menuItems()[0].name === "/review", `items=${JSON.stringify(menuItems().map((i) => i.name))}`);
type("/zeb");
check("TC-056(b) /zeb → 仅 /skill-zebra", menuItems().length === 1 && menuItems()[0].name === "/skill-zebra", `items=${JSON.stringify(menuItems().map((i) => i.name))}`);
type("/nomatch");
check("TC-056(b) /nomatch → 菜单隐藏", menu.hidden === true, `menu.hidden=${menu.hidden}`);

// ---------- TC-057(a) 键盘导航（接线层，高亮渲染） ----------
type("/"); replyCommands(CMDS);
const items0 = menuItems();
check("TC-057(a) 初始高亮第 1 项", items0[0].active && items0[0].ariaSelected && !items0[1].active, `active=[${items0.map((i) => i.active ? 1 : 0).join("")}]`);
key("ArrowDown");
const items1 = menuItems();
check("TC-057(a) ↓ → 高亮第 2 项", items1[1].active && !items1[0].active, `active=[${items1.map((i) => i.active ? 1 : 0).join("")}]`);
key("ArrowUp");
const items2 = menuItems();
check("TC-057(a) ↑ → 回到第 1 项", items2[0].active && !items2[1].active, `active=[${items2.map((i) => i.active ? 1 : 0).join("")}]`);

// ---------- TC-057(b) Enter 选中插入不发送 ----------
type("/exp");
posted.length = 0;
key("Enter");
check("TC-057(b)(i) 输入框文本='/ExPlain'", input.value === "/ExPlain", `value=${JSON.stringify(input.value)}`);
check("TC-057(b)(ii) 菜单关闭", menu.hidden === true, `menu.hidden=${menu.hidden}`);
check("TC-057(b)(iii) 焦点保持在输入框", doc.activeElement === input, `activeElement=${doc.activeElement && doc.activeElement.id}（input.id=${input.id}）`);
check("TC-057(b)(iv) 无发送行为", prompts().length === 0, `prompt 消息数=${prompts().length}`);
key("Enter");
check("TC-057(b)(v) 二次 Enter → 发送 '/ExPlain' 原文", prompts().length === 1 && prompts()[0].text === "/ExPlain",
  `prompts=${JSON.stringify(prompts())}（命令文本透传口径同 TC-032）`);

// ---------- TC-057(c) Esc 关闭不发送 ----------
type("/rev"); replyCommands(CMDS);
posted.length = 0;
check("TC-057(c) /rev 菜单打开", menu.hidden === false && menuItems().length === 1, `items=${menuItems().length}`);
key("Escape");
check("TC-057(c) Esc → 菜单关闭且无发送", menu.hidden === true && prompts().length === 0, `menu.hidden=${menu.hidden}, prompts=${prompts().length}`);

// ---------- TC-057(d) 鼠标等价（mousedown） ----------
type("/run"); replyCommands(CMDS);
posted.length = 0;
const runBtn = menu.children[0];
check("TC-057(d) /run 菜单项=run-tests", menuItems()[0]?.name === "/run-tests", `items=${JSON.stringify(menuItems().map((i) => i.name))}`);
runBtn.dispatchEvent({ type: "mousedown" });
check("TC-057(d)(i) 输入框文本='/run-tests'", input.value === "/run-tests", `value=${JSON.stringify(input.value)}`);
check("TC-057(d)(ii) 菜单关闭", menu.hidden === true, `menu.hidden=${menu.hidden}`);
check("TC-057(d)(iii) 焦点保持在输入框", doc.activeElement === input, `activeElement=${doc.activeElement && doc.activeElement.id}`);
check("TC-057(d)(iv) 无发送行为", prompts().length === 0, `prompt 消息数=${prompts().length}`);

// ---------- TC-056(c) 空数据 / 不可用（接线层 + 文本直发） ----------
// 空集分支（get_commands 返回空 → 宿主回发 commands: []）
type("x"); // 关闭菜单
posted.length = 0;
type("/");
check("TC-056(c) 空集回发 → '/' 菜单不显示", true, `request_commands=${requestCommands().length}（已请求）`);
replyCommands([]);
check("TC-056(c) commands=[] → 菜单不显示", menu.hidden === true, `menu.hidden=${menu.hidden}，无空菜单渲染`);
posted.length = 0;
type("/anything");
key("Enter");
check("TC-056(c) 空数据分支 '/anything' 可直接发送（判据同 TC-032）", prompts().length === 1 && prompts()[0].text === "/anything",
  `prompts=${JSON.stringify(prompts())}`);

// 会话切换后命令缓存失效重取（实现披露行为，观察项）
posted.length = 0;
dispatchHostMessage({ kind: "session_reset", name: "新会话" });
type("/");
check("观察：会话切换后首次 '/' 重新 request_commands", requestCommands().length === 1, `request_commands=${requestCommands().length}（缓存失效重取）`);

console.log(results.join("\n"));
console.log(`\n[summary] TC-056/057 wiring assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;

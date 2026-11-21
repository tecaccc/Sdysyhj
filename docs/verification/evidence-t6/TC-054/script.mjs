// TC-053 / TC-054 独立核验驱动（测试 Agent 自研 DOM shim + CSS 级联，不复用研发测试）
// 载体：真实 chatPanel HTML 模板（静态提取）+ 真实 webview bundle + 真实 styles.css 解析级联。
import fs from "node:fs";
import { parseStylesheet, computedStyle } from "./domshim.mjs";
import { loadWebview } from "./load-webview.mjs";

const results = [];
let failed = 0;
function check(id, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failed += 1;
}

const { doc, dispatchHostMessage } = await loadWebview();
const cssText = fs.readFileSync("/tmp/verify-t6/webview/styles/styles.css", "utf8");
const rules = parseStylesheet(cssText);
const styleOf = (el) => computedStyle(el, rules);

// ---------- TC-053 ----------

// (a) 内容列居中：四个 .content-col 容器（消息区/错误区/输入区内容列）max-width=960 + margin auto 对称
const colIds = ["messages-col", "errors-col", "input-col"];
const colEls = colIds.map((id) => doc.getElementById(id));
check("TC-053(a) 容器存在", colEls.every(Boolean) && colEls.every((el) => el.classList.contains("content-col")),
  `content-col 元素 = ${colIds.join("/")}，class=content-col`);
const widths = colEls.map((el) => styleOf(el)["max-width"]);
check("TC-053(a) max-width=960px（四处一致）", widths.every((w) => w === "960px"), `computed max-width = [${widths.join(", ")}]`);
const margins = colEls.map((el) => `${styleOf(el)["margin-left"]}/${styleOf(el)["margin-right"]}`);
check("TC-053(a) 左右 margin=auto（留白相等蕴含）", margins.every((m) => m === "auto/auto"), `margin-left/right = [${margins.join(" | ")}]`);
// 底部模型选择器与用量行须在输入区内容列内（同一内容列约束，验收标准①括注）
const inputCol = doc.getElementById("input-col");
const modelSel = doc.getElementById("model-selector");
const usageLine = doc.getElementById("usage-line");
check("TC-053(a) 模型选择器/用量行位于输入区内容列内", inputCol.contains(modelSel) && inputCol.contains(usageLine),
  `#model-selector、#usage-line ⊂ #input-col（.content-col）`);

// (b) 输入框圆角
const inputShell = doc.getElementById("input-shell");
check("TC-053(b) 输入框容器 border-radius=8px", styleOf(inputShell)["border-radius"] === "8px",
  `.input-shell computed border-radius = ${styleOf(inputShell)["border-radius"]}`);

// (c) 发送按钮图标化
const sendBtn = doc.getElementById("btn-send");
const aria = sendBtn.getAttribute("aria-label");
const title = sendBtn.getAttribute("title");
check("TC-053(c) 可访问名称=发送", aria === "发送" || title === "发送", `aria-label=${JSON.stringify(aria)}, title=${JSON.stringify(title)}`);
check("TC-053(c) 按钮内无文字标签", sendBtn.textContent.trim() === "",
  `textContent.trim()=${JSON.stringify(sendBtn.textContent.trim())}；子元素=${sendBtn.children.map((c) => c.tagName).join(",")}(图形元素)`);

// ---------- TC-054：渲染含 thinking 折叠块与工具卡的完整消息流 ----------

const now = Date.now();
function simulateKey(key) {
  const input = doc.getElementById("input");
  input.dispatchEvent({ type: "keydown", key, shiftKey: false, isComposing: false });
}

// 用户消息（宿主回发 user_message；Enter 在 webview 侧仅发 prompt）
doc.getElementById("input").value = "看下 @a.ts 并解释";
simulateKey("Enter");
dispatchHostMessage({ kind: "user_message", text: "看下 @a.ts 并解释" });
// 助手回复：thinking 折叠块 + 工具卡 + 正文（MOCK-THINK+MOCK-TOOLS 等价 fixture）
dispatchHostMessage({ kind: "stream_start", messageId: "m1" });
dispatchHostMessage({ kind: "thinking_delta", messageId: "m1", index: 0, delta: "考虑先读取文件" });
dispatchHostMessage({ kind: "toolcall_start", messageId: "m1", index: 1, id: "tc1", tool: "read", args: '{"path":"a.ts"}', summary: "read a.ts" });
dispatchHostMessage({ kind: "text_delta", messageId: "m1", index: 2, delta: "该文件导出一个函数。" });
dispatchHostMessage({
  kind: "message_final",
  messageId: "m1",
  message: {
    id: "m1", role: "assistant", timestamp: now,
    blocks: [
      { type: "thinking", text: "考虑先读取文件" },
      { type: "toolcall", id: "tc1", tool: "read", args: '{"path":"a.ts"}', summary: "read a.ts", status: "success", output: "export function f() {}", outputTruncated: false },
      { type: "text", text: "该文件导出一个函数。" },
    ],
  },
});

const rows = [...doc.getElementById("messages-col").children].filter((el) => el.classList.contains("message"));
check("TC-054 fixture 消息行数=2", rows.length === 2, `rows=${rows.length}（1 user + 1 assistant）`);
const userRow = rows.find((r) => r.classList.contains("message-user"));
const asstRow = rows.find((r) => r.classList.contains("message-assistant"));

// (a) 用户消息右侧气泡
const userBody = userRow.querySelector(".message-body");
const ub = styleOf(userBody);
check("TC-054(a) 用户消息气泡背景≠transparent", ub["background-color"] !== "transparent" && ub["background-color"] !== "",
  `.message-user .message-body background-color = ${ub["background-color"]}`);
check("TC-054(a) 气泡圆角≠0", ub["border-radius"] !== "0" && parseFloat(ub["border-radius"]) > 0, `border-radius = ${ub["border-radius"]}`);
const userRowStyle = styleOf(userRow);
const userBodyStyle = styleOf(userBody);
const rightAligned = userRowStyle["align-items"] === "flex-end" || userBodyStyle["margin-left"] === "auto" || userRowStyle["justify-content"] === "flex-end";
check("TC-054(a) 右对齐声明", rightAligned, `行 align-items=${userRowStyle["align-items"]}（column flex 交叉轴末端=右侧）, body margin-left=${userBodyStyle["margin-left"]}, justify-content=${userRowStyle["justify-content"]}`);

// (b) 助手消息左侧无气泡
const asstBody = asstRow.querySelector(".message-body");
const ab = styleOf(asstBody);
check("TC-054(b) 助手消息体背景 transparent", ab["background-color"] === "transparent", `.message-assistant .message-body background-color = ${ab["background-color"]}`);
check("TC-054(b) 助手消息体无边框", ab["border"] === "0" || ab["border-style"] === "none" || ab["border-width"] === "0", `border = ${ab["border"]}`);
const asstRowStyle = styleOf(asstRow);
const leftAligned = asstRowStyle["align-items"] === "flex-start" || asstRowStyle["justify-content"] === "flex-start" || asstRowStyle["text-align"] === "left";
check("TC-054(b) 助手消息左对齐声明", leftAligned, `行 align-items=${asstRowStyle["align-items"]}`);

// (c) 时间戳 HH:mm + ±2 分钟窗
const times = rows.map((r) => r.querySelector(".message-time")?.textContent ?? "");
const hhmmRe = /^\d{2}:\d{2}$/;
const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
const inWindow = times.map((t) => {
  if (!hhmmRe.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  const diff = Math.abs(h * 60 + m - nowMin);
  return diff <= 2 || diff >= 1438; // 跨日界容忍
});
check("TC-054(c) 每行含 HH:mm 时间戳", times.every((t) => hhmmRe.test(t)), `时间戳 = [${times.join(", ")}]（正则 ^\\d{2}:\\d{2}$）`);
check("TC-054(c) 时间落在执行时刻±2分钟（本地时区）", inWindow.every(Boolean), `换算分钟偏差 = [${times.map((t) => { const [h, m] = t.split(":").map(Number); return Math.abs(h * 60 + m - nowMin); }).join(", ")}]`);

// (d) 无角色前缀（豁免 thinking 折叠块与工具卡功能标签）
const noPrefix = rows.map((r) => !/^\s*(user|assistant)/i.test(r.textContent));
check("TC-054(d) 可见文本不以 user/assistant 开头", noPrefix.every(Boolean), `逐行首词检查 = [${rows.map((r) => JSON.stringify(r.textContent.trim().slice(0, 8))).join(", ")}]`);
const roleMarkers = rows.flatMap((r) => [...r.querySelectorAll("*")].filter((el) => /role/i.test(el.className) || /role/i.test(el.id)));
check("TC-054(d) 无独立角色标记元素", roleMarkers.length === 0, `role 类/ id 元素数 = ${roleMarkers.length}；fixture 含 thinking 折叠块（"thinking" 功能标签）与工具卡（read 名标签），按豁免项不计`);

// DOM 快照（证据）
const snapshot = rows.map((r) => r.outerHTML.slice(0, 600)).join("\n...\n");

console.log(results.join("\n"));
console.log(`\n[summary] TC-053/054 assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;
fs.writeFileSync("/tmp/t6harness/tc053-054-snapshot.html", `<html><head><style>\n${cssText}\n</style></head><body>${doc.body.innerHTML}</body></html>`);
console.log("\n----- message row DOM snapshot (truncated per row) -----");
console.log(snapshot);

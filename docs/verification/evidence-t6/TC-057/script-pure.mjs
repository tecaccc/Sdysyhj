// TC-056/057 纯逻辑层独立驱动（filterCommands / CommandMenuState，无 DOM 依赖）
// 用例基线 MOCK-CMD 全集 4 项（v0.4 §0.3），逐断言对应 TC-056(a)(b)(c) 与 TC-057(a)(b)(c) 的状态机口径。
import { createRequire } from "node:module";
const { filterCommands, CommandMenuState } = createRequire(import.meta.url)("./commandMenu-bundle.cjs");

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
const names = (list) => list.map((c) => c.name).join(",");

// ---------- TC-056(a) 出现条件 ----------
{
  const m = new CommandMenuState();
  m.setCommands(CMDS);
  m.onInput("hello");
  check("TC-056(a) 非 / 开头不显示菜单", m.isOpen === false, `onInput("hello") → isOpen=${m.isOpen}`);
  m.onInput("/rev");
  check("TC-056(a) / 开头显示菜单", m.isOpen === true, `onInput("/rev") → isOpen=${m.isOpen}, items=[${names(m.items)}]`);
}

// ---------- TC-056(b) 数据源 + 实时过滤 ----------
{
  const m = new CommandMenuState();
  m.setCommands(CMDS);
  m.onInput("/");
  check("TC-056(b) '/' → 全集 4 项", m.items.length === 4 && names(m.items) === "review,ExPlain,skill-zebra,run-tests",
    `items=[${names(m.items)}]（与 MOCK-CMD 全集一致）`);
  m.onInput("/exp");
  check("TC-056(b) /exp → 仅 ExPlain（名称子串、不区分大小写）", m.items.length === 1 && m.items[0].name === "ExPlain", `items=[${names(m.items)}]`);
  m.onInput("/REVIEW");
  check("TC-056(b) /REVIEW → 仅 review（不区分大小写）", m.items.length === 1 && m.items[0].name === "review", `items=[${names(m.items)}]`);
  m.onInput("/zeb");
  check("TC-056(b) /zeb → 仅 skill-zebra（描述子串命中）", m.items.length === 1 && m.items[0].name === "skill-zebra", `items=[${names(m.items)}]（desc="zebra skill 斑马线" 含 zeb）`);
  m.onInput("/nomatch");
  check("TC-056(b) /nomatch → 无匹配隐藏", m.isOpen === false, `isOpen=${m.isOpen}（过滤后无匹配）`);
}

// ---------- TC-056(c) 空数据 / 不可用 ----------
{
  const m = new CommandMenuState();
  m.setCommands([]); // 空集（MOCK-CMD 空配置 / get_commands 返回空）
  m.onInput("/");
  check("TC-056(c) 空全集 → '/' 不显示菜单", m.isOpen === false, `isOpen=${m.isOpen}`);
  m.onInput("/anything");
  check("TC-056(c) 空全集下 /anything 菜单不显示（文本直发归宿主路径）", m.isOpen === false, `isOpen=${m.isOpen}；状态机不阻断输入文本（发送由输入框接线层负责，见 webview 层证据）`);
  // 不可用分支：宿主回发 commands 消息为空（listCommands 失败返回 []）→ 同一状态机口径
  const m2 = new CommandMenuState();
  m2.onInput("/");
  check("TC-056(c) 命令未就绪（晚到）→ 菜单不显示", m2.isOpen === false, `先输 '/' 后全集仍空 → isOpen=${m2.isOpen}`);
  m2.setCommands(CMDS);
  check("TC-056(c) 全集晚到 → 菜单显示（重算）", m2.isOpen === true, `setCommands(4 项) 后 isOpen=${m2.isOpen}, items=${m2.items.length}`);
}

// ---------- TC-057(a) 键盘导航 ----------
{
  const m = new CommandMenuState();
  m.setCommands(CMDS);
  m.onInput("/");
  check("TC-057(a) 初始高亮第 1 项", m.highlightedItem?.name === "review", `highlighted=${m.highlightedItem?.name}`);
  m.moveDown();
  check("TC-057(a) ↓ → 高亮第 2 项", m.highlightedItem?.name === "ExPlain", `highlighted=${m.highlightedItem?.name}`);
  m.moveUp();
  check("TC-057(a) ↑ → 回到第 1 项", m.highlightedItem?.name === "review", `highlighted=${m.highlightedItem?.name}`);
  m.moveUp();
  check("TC-057(a) 首项 ↑ 环绕到末项（观察项，需求未定义不判定）", m.highlightedItem?.name === "run-tests", `highlighted=${m.highlightedItem?.name}（环绕行为记录，不作判定项）`);
}

// ---------- TC-057(b) Enter 选中插入不发送 ----------
{
  const m = new CommandMenuState();
  m.setCommands(CMDS);
  m.onInput("/exp");
  check("TC-057(b) insertText='/'+命令名", m.insertText === "/ExPlain", `insertText=${JSON.stringify(m.insertText)}`);
  m.close(); // Enter 接线调用 selectCommand：置文本 + close
  check("TC-057(b) 选中后菜单关闭", m.isOpen === false, `isOpen=${m.isOpen}`);
  check("TC-057(b) 选中后 highlightedItem=null（不残留选中态）", m.highlightedItem === null, `highlightedItem=${m.highlightedItem}`);
}

// ---------- TC-057(c) Esc 关闭 ----------
{
  const m = new CommandMenuState();
  m.setCommands(CMDS);
  m.onInput("/rev");
  check("TC-057(c) /rev 菜单打开", m.isOpen === true, `isOpen=${m.isOpen}, items=[${names(m.items)}]`);
  m.close();
  check("TC-057(c) Esc → 关闭", m.isOpen === false, `isOpen=${m.isOpen}（close 不改输入文本、不发送——发送仅经接线层 Enter 路径）`);
}

// ---------- filterCommands 直驱（过滤规则独立复核） ----------
{
  const f = (q) => names(filterCommands(CMDS, q));
  check("filter 直驱 query='' → 4 项", f("") === "review,ExPlain,skill-zebra,run-tests", `→ ${f("")}`);
  check("filter 直驱 'plain'（小写命中 ExPlain）", f("plain") === "ExPlain", `→ ${f("plain")}`);
  check("filter 直驱 '斑马'（中文描述子串）", f("斑马") === "skill-zebra", `→ ${f("斑马")}`);
  check("filter 直驱 'TESTS' → run-tests", f("TESTS") === "run-tests", `→ ${f("TESTS")}`);
  check("filter 直驱 'zzz' → 空", f("zzz") === "", `→ ${f("zzz")}`);
  check("filter 直驱 空名命令防御剔除", filterCommands([{ name: "" }, { name: "ok" }], "").length === 1, "name='' 被剔除");
}

console.log(results.join("\n"));
console.log(`\n[summary] TC-056/057 pure-logic assertions: ${results.length - failed}/${results.length} passed, failed=${failed}`);
if (failed > 0) process.exitCode = 1;

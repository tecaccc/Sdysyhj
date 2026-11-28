// 依赖精确版本锁定门禁（原 TASK-009 §10.14 D8 单测 FR-AUI-05①；TASK-011 批次 A 项同步）。
// 2026-11-27 人类还原指令（「还原聊天界面为我们自己编写的版本，去掉外部引入的框架」）后：
// @assistant-ui/* 全族与 react 线依赖（react/react-dom/@types/react/@types/react-dom/
// react-markdown 链/remark-*/@testing-library/*/zod——grep 实证消费方为零，zod 仅新 UI
// zod-jitless 消费）随新 UI 整体移除；jsdom 保留（经典面板 golden DOM 集成测试环境）并去重。
// 本文件 = 还原后依赖基线门禁：① 剩余依赖精确版本锁定；② 全依赖零范围前缀；③ 经典依赖
// 冻结（marked/highlight.js/dompurify/pi 运行时不变）；④ 新 UI 依赖族删除断言（防回流）；
// ⑤ R-01 重复键消除断言（@assistant-ui/react-markdown、remark-breaks、remark-gfm 随删除
// 消除、jsdom 去重单条——依赖块键唯一）。
// TASK-011 批次 B 项（Issue #3/R-01，P-03 结构门禁补全）新增：
// ⑥ 全文件键数一致（解析后键总数 == 原文键总数；字符级字符串感知扫描——⑤ 依赖块口径的超集，
//    顶层键与 contributes 等嵌套层级的重复键同样检出）；
// ⑦ 无用依赖检测（dependencies+devDependencies 每键须在 src/ webview/ test/ esbuild.mjs 有
//    ≥1 语法锚定消费：import/export from、副作用 import、动态 import()、require/require.resolve、
//    vitest 文件级环境注解指令（注解值为环境包名，jsdom 的消费形态；工具链类豁免——清单与理由见
//    UNUSED_DEP_EXEMPTIONS））。TASK-012 批次 D 项（Issue #17/R-19，P-03+P-10）修复：①~④ 的
//    匹配面先经 stripComments 剥离 // 行注释与 /* */ 块注释段再匹配（修复前注释态 import 即
//    满足门禁——死依赖恒绿滞留）；⑤ 注解指令为注释形态的编译器指令，匹配面保留原文；
// ⑧ R-19 反证探针（P-10 自查：注释态零消费/真实语句消费/剥离边界不误伤/⑤ 例外——锁进套件防回退）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
/** package.json 全量解析（⑥ 全文件键数一致口径用）。 */
const pkgWhole: unknown = JSON.parse(read("package.json"));

/** 还原后运行时依赖精确锁定清单（= v0.1.6 时代经典实现依赖集）。 */
const PINNED_DEPENDENCIES: Record<string, string> = {
  "@earendil-works/pi-coding-agent": "1.5.2",
  dompurify: "3.4.18",
  "highlight.js": "11.12.0",
  marked: "18.2.1",
};
/** 还原后开发依赖精确锁定清单（jsdom = 经典面板 golden DOM 集成测试环境，去重后单条）。 */
const PINNED_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/node": "22.20.5",
  "@types/vscode": "1.85.0",
  esbuild: "0.28.2",
  jsdom: "31.0.1",
  typescript: "7.0.2",
  vitest: "5.1.0",
};

const isExact = (version: string): boolean => /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(version);

/** 依赖块键列表（文本级提取——JSON.parse 对重复键静默取后者，重复键须文本核对）。 */
function depKeys(block: "dependencies" | "devDependencies"): string[] {
  const raw = read("package.json");
  const start = raw.indexOf(`"${block}"`);
  expect(start, `package.json 缺 ${block} 块`).toBeGreaterThanOrEqual(0);
  const open = raw.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, `${block} 块未闭合`).toBeGreaterThanOrEqual(0);
  return [...raw.slice(open + 1, end).matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]);
}

/**
 * ⑥ 原文键总数（字符级扫描、字符串字面量感知）：键 = 收引号后下一个非空白字符为 `:` 的字符串 token
 * （合法 JSON 中仅键后随冒号；值字符串内的 `"x":` 形态因字符串态跟踪不误计）。
 */
function rawKeyTotal(raw: string): number {
  let count = 0;
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== "\"") {
      i++;
      continue;
    }
    let close = i + 1;
    while (close < raw.length) {
      if (raw[close] === "\\") {
        close += 2;
        continue;
      }
      if (raw[close] === "\"") break;
      close++;
    }
    let next = close + 1;
    while (next < raw.length && /\s/.test(raw[next])) next++;
    if (raw[next] === ":") count++;
    i = close + 1;
  }
  return count;
}

/** ⑥ 解析后键总数（全层级递归求和；JSON.parse 对同级重复键静默取后者 → 与原文键总数之差即重复键数）。 */
function parsedKeyTotal(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + parsedKeyTotal(item), 0);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const values = Object.values(record).reduce((sum: number, item) => sum + parsedKeyTotal(item), 0);
    return Object.keys(record).length + values;
  }
  return 0;
}

/**
 * ⑦ 无用依赖豁免清单（devDependencies 测试/构建类——按用途豁免：无源码 import 消费面属其正常形态）。
 * 豁免项必须真实存在于 devDependencies（⑦ 内对账，防豁免清单过期漂移成恒假门禁）。
 */
const UNUSED_DEP_EXEMPTIONS: Readonly<Record<string, string>> = {
  "@types/node": "TS ambient 类型（tsconfig compilerOptions.types:[\"node\"] 自动加载，src/ 的 Node API 类型来源，无 import 消费面）",
  "@types/vscode": "TS ambient 类型（tsconfig types:[\"vscode\"]，import \"vscode\" 的类型声明来源，实现由 VS Code 宿主提供）",
  typescript: "构建工具链（package.json scripts `tsc --noEmit` 命令行调用，不入源码 import）",
};

/** ⑦ 消费检测扫描面：src/ + webview/ + test/ 递归源码文件 + esbuild.mjs（P-03 口径；node_modules/dist/media 构建产物不在面内）。 */
const SOURCE_FILE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(p));
    else if (SOURCE_FILE_EXT.test(entry.name)) out.push(p);
  }
  return out;
}

const SCAN_SURFACE: { file: string; text: string }[] = [
  ...["src", "webview", "test"].flatMap((dir) => walkSourceFiles(path.join(root, dir))),
  path.join(root, "esbuild.mjs"),
].map((file) => ({ file: path.relative(root, file), text: fs.readFileSync(file, "utf8") }));

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const VITEST_ENV_DIRECTIVE = "@vitest" + "-environment";

/** 正则字面量起始判据：关键字（return/typeof/…）或正则友好标点之后；标识符/数字/）/]/./++/-- 之后为除法。 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);

/** 判定 text[at] 处的 `/` 是否正则字面量起始（回看非空白有效字符；关键字/标点后 → 正则）。 */
function regexLiteralAllowed(text: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && /\s/.test(text[j]!)) j--;
  if (j < 0) return true; // 文件起始
  const ch = text[j]!;
  if (/[A-Za-z0-9_$]/.test(ch)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k]!)) k--;
    return REGEX_PRECEDING_KEYWORDS.has(text.slice(k + 1, j + 1));
  }
  if (ch === ")" || ch === "]" || ch === ".") return false; // 除法
  if ((ch === "+" || ch === "-") && j > 0 && text[j - 1] === ch) return false; // ++/-- 后缀后为除法
  return true; // 其余标点（含 => 的 >、{、}、;、:、,、(、[、!、&、|、?、=、+、-）后为正则
}

/**
 * R-19 修复（Issue #17）：⑦ 匹配前先剥离注释段——字符级扫描状态机（代码 / 行注释 / 块注释 /
 * 单双引号字符串 / 模板字面量 / 正则字面量），注释段替换为等长空白（保留换行与行结构）。
 * 防误剥（假阴性方向）：字符串/模板/正则内的 `//` 与 `/*` 不视为注释（⑧ 反证探针锁定：
 * `/^file:\/\//`、`"https://…"`、模板内 `//` 其后的真实 import 不丢）；模板 `${…}` 插值段按
 * 代码态扫描（花括号平衡栈回填，嵌套模板不发散）；正则字面量按 regexLiteralAllowed 启发式判定。
 */
function stripComments(text: string): string {
  const out: string[] = [];
  let state: "code" | "line" | "block" | "sq" | "dq" | "tpl" | "regex" = "code";
  const tplBraceDepth: number[] = []; // 模板插值嵌套：每层 `${` 的花括号平衡计数
  let inClass = false; // 正则字符类 [...] 内
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    switch (state) {
      case "line":
        if (c === "\n") state = "code";
        out.push(c === "\n" ? c : " ");
        i += 1;
        break;
      case "block":
        if (c === "*" && text[i + 1] === "/") {
          state = "code";
          out.push("  ");
          i += 2;
        } else {
          out.push(c === "\n" ? c : " ");
          i += 1;
        }
        break;
      case "sq":
      case "dq": {
        out.push(c);
        if (c === "\\") {
          out.push(text[i + 1] ?? "");
          i += 2;
        } else {
          if (c === (state === "sq" ? "'" : '"')) state = "code";
          i += 1;
        }
        break;
      }
      case "tpl":
        if (c === "\\") {
          out.push(c, text[i + 1] ?? "");
          i += 2;
        } else if (c === "`") {
          state = "code";
          out.push(c);
          i += 1;
        } else if (c === "$" && text[i + 1] === "{") {
          state = "code";
          tplBraceDepth.push(0);
          out.push(c, "{");
          i += 2;
        } else {
          out.push(c);
          i += 1;
        }
        break;
      case "regex":
        out.push(c);
        if (c === "\\") {
          out.push(text[i + 1] ?? "");
          i += 2;
        } else if (c === "[") {
          inClass = true;
          i += 1;
        } else if (c === "]") {
          inClass = false;
          i += 1;
        } else if (c === "/" && !inClass) {
          state = "code";
          i += 1;
        } else {
          i += 1;
        }
        break;
      case "code":
      default:
        if (c === "/" && text[i + 1] === "/") {
          state = "line";
          out.push("  ");
          i += 2;
        } else if (c === "/" && text[i + 1] === "*") {
          state = "block";
          out.push("  ");
          i += 2;
        } else if (c === "/" && regexLiteralAllowed(text, i)) {
          state = "regex";
          inClass = false;
          out.push(c);
          i += 1;
        } else if (c === "'") {
          state = "sq";
          out.push(c);
          i += 1;
        } else if (c === '"') {
          state = "dq";
          out.push(c);
          i += 1;
        } else if (c === "`") {
          state = "tpl";
          out.push(c);
          i += 1;
        } else if (c === "{" && tplBraceDepth.length > 0) {
          tplBraceDepth[tplBraceDepth.length - 1] += 1;
          out.push(c);
          i += 1;
        } else if (c === "}" && tplBraceDepth.length > 0 && tplBraceDepth[tplBraceDepth.length - 1] === 0) {
          tplBraceDepth.pop();
          state = "tpl";
          out.push(c);
          i += 1;
        } else {
          out.push(c);
          i += 1;
        }
        break;
    }
  }
  return out.join("");
}

/**
 * ⑦ 依赖消费检测（语法锚定）：
 * ① import/export … from "N[/子路径]"；② 副作用 import "N[/子路径]"；③ 动态 import("N…")；
 * ④ require / require.resolve("N…")；⑤ vitest 文件级环境注解指令（值为环境包名，jsdom 的消费形态）。
 * R-19 修复（Issue #17）：①~④ 匹配面 = stripComments 剥离注释后的代码文本——注释态
 * import/require 不再计消费（修复前注释行即满足门禁，死依赖恒绿滞留；⑧ 反证探针锁定）；
 * ⑤ 例外：注解本身是注释形态的编译器指令（vitest 环境解析器消费，非 JS 语法），匹配面保留
 * 原文——若入剥离面会连指令一起剔成空白，jsdom 恒假阴性。
 * 注：⑤ 的注解标记以字符串拼接构造，避免本门禁文件自身携带该标记被 vitest 环境解析器误读
 * （同源纪律：扫描类断言杜绝自命中）。返回命中文件相对路径列表（空 = 零消费 = 无用依赖）；
 * surface 参数：⑧ 反证探针注入合成样本用（默认 = 真实扫描面）。
 */
function consumptionFiles(name: string, surface: { file: string; text: string }[] = SCAN_SURFACE): string[] {
  const spec = `${escapeRegExp(name)}(?:/[^"']+)?`;
  const codePatterns = [
    new RegExp(`\\bfrom\\s+["']${spec}["']`),
    new RegExp(`\\bimport\\s+["']${spec}["']`),
    new RegExp(`\\bimport\\s*\\(\\s*["']${spec}["']`),
    new RegExp(`\\brequire(?:\\.resolve)?\\(\\s*["']${spec}["']`),
  ];
  const directivePattern = new RegExp(`${escapeRegExp(VITEST_ENV_DIRECTIVE)}\\s+${escapeRegExp(name)}\\b`);
  return surface
    .filter(({ text }) => codePatterns.some((re) => re.test(stripComments(text))) || directivePattern.test(text))
    .map(({ file }) => file);
}

describe("依赖精确版本锁定（零 ^ / ~ / >= 前缀）", () => {
  it("① 还原后锁定清单逐项：精确版本 + 经典实现依赖集（v0.1.6 时代形态）", () => {
    for (const [name, version] of Object.entries(PINNED_DEPENDENCIES)) {
      expect(pkg.dependencies[name], `dependencies 缺 ${name}`).toBe(version);
    }
    for (const [name, version] of Object.entries(PINNED_DEV_DEPENDENCIES)) {
      expect(pkg.devDependencies[name], `devDependencies 缺 ${name}`).toBe(version);
    }
  });

  it("② 全部 dependencies/devDependencies 均无范围前缀（既有依赖亦为精确版，冻结面不变）", () => {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      expect(isExact(version), `${name}=${version} 非精确版本`).toBe(true);
    }
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      expect(isExact(version), `${name}=${version} 非精确版本`).toBe(true);
    }
  });

  it("③ 经典实现依赖冻结（还原不得误删：marked/highlight.js/dompurify/pi 运行时不变）", () => {
    expect(pkg.dependencies["@earendil-works/pi-coding-agent"]).toBe("1.5.2");
    expect(pkg.dependencies.dompurify).toBe("3.4.18");
    expect(pkg.dependencies["highlight.js"]).toBe("11.12.0");
    expect(pkg.dependencies.marked).toBe("18.2.1");
  });

  it("④ 新 UI 依赖族删除断言（防回流）：@assistant-ui/* 与 react 线依赖零残留", () => {
    const forbidden = [
      "@assistant-ui/react",
      "@assistant-ui/react-markdown",
      "@assistant-ui/vscode",
      "@assistant-ui/ai-sdk",
      "ai",
      "react",
      "react-dom",
      "react-markdown",
      "remark-gfm",
      "remark-breaks",
      "zod",
      "@types/react",
      "@types/react-dom",
      "@testing-library/react",
      "@testing-library/dom",
    ];
    for (const name of forbidden) {
      expect(pkg.dependencies[name], `dependencies 残留新 UI 依赖 ${name}`).toBeUndefined();
      expect(pkg.devDependencies[name], `devDependencies 残留新 UI 依赖 ${name}`).toBeUndefined();
    }
  });

  // 口径核验（TASK-011 B-1）：JSON.parse 对同级重复键静默取后者 → 解析后键数 = 原文唯一键数，
  // 故「原文键唯一」⟺「解析后键数 == 原文键数」——本断言即 P-03 键数一致口径在依赖两块的作用域实现（全文件口径见 ⑥）。
  it("⑤ R-01 重复键消除：依赖块键唯一（原 @assistant-ui/react-markdown、remark-breaks、remark-gfm ×2 随删除消除；jsdom ×2 去重单条）", () => {
    for (const block of ["dependencies", "devDependencies"] as const) {
      const keys = depKeys(block);
      expect(new Set(keys).size, `${block} 存在重复键`).toBe(keys.length);
    }
  });

  it("⑥ P-03 键数一致（全文件口径）：解析后键总数 == 原文键总数（顶层/嵌套任意层级重复键均检出）", () => {
    const raw = read("package.json");
    expect(
      parsedKeyTotal(pkgWhole),
      "package.json 存在重复键（JSON.parse 静默取后者）：解析后键总数 ≠ 原文键总数",
    ).toBe(rawKeyTotal(raw));
  });

  it("⑦ P-03 无用依赖检测：dependencies+devDependencies 每键在 src/ webview/ test/ esbuild.mjs 有 ≥1 消费（R-19 修复后：①~④ 匹配面 = 剥离行/块注释后的代码文本；豁免清单见 UNUSED_DEP_EXEMPTIONS）", () => {
    for (const [name, reason] of Object.entries(UNUSED_DEP_EXEMPTIONS)) {
      expect(
        pkg.devDependencies[name],
        `豁免项 ${name}（${reason}）已不在 devDependencies——请同步移除豁免登记，防清单过期漂移`,
      ).toBeDefined();
    }
    const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(allDeps)) {
      if (UNUSED_DEP_EXEMPTIONS[name]) continue;
      const hits = consumptionFiles(name);
      expect(
        hits.length,
        `依赖 ${name} 在 src/ webview/ test/ esbuild.mjs 零消费——无用依赖应删除；若属测试/构建类用途，请在 UNUSED_DEP_EXEMPTIONS 登记豁免并注明理由`,
      ).toBeGreaterThan(0);
    }
  });

  // R-19 反证探针（P-10 语义：门禁类断言附可绕过性自查——假阳性/假阴性双方向各 ≥1 实测锁进套件）。
  // 样本名 left-pad 非真实依赖（同源纪律：杜绝扫描类断言自命中）；⑤ 探针经 VITEST_ENV_DIRECTIVE
  // 拼接构造，本文件不携带连续注解标记原文。
  it("⑧ R-19 反证探针（P-10 自查）：注释态 import/require 零消费、真实语句消费、字符串/正则/模板内 // 不误剥、⑤ 注解指令仍计消费", () => {
    const probe = (text: string): { file: string; text: string }[] => [{ file: "<probe>.ts", text }];
    // 假阳性反证（修复豁口——修复前注释态即满足门禁，consumed=true）
    expect(consumptionFiles("left-pad", probe('// import x from "left-pad";\n'))).toEqual([]);
    expect(consumptionFiles("left-pad", probe('/* import "left-pad" */\n'))).toEqual([]);
    expect(consumptionFiles("left-pad", probe('/*\n  import x from "left-pad";\n*/\n'))).toEqual([]);
    expect(consumptionFiles("left-pad", probe('const a = 1; // require("left-pad");\n'))).toEqual([]);
    // 假阴性反证（真实消费语句在剥离后仍命中）
    expect(consumptionFiles("left-pad", probe('import x from "left-pad";\n'))).toEqual(["<probe>.ts"]);
    expect(consumptionFiles("left-pad", probe('const x = require("left-pad");\n'))).toEqual(["<probe>.ts"]);
    expect(consumptionFiles("left-pad", probe('const x = await import("left-pad");\n'))).toEqual(["<probe>.ts"]);
    // 剥离边界反证（注释剔除不误伤：字符串/正则/模板内的 // 与其后真实消费不丢）
    expect(consumptionFiles("left-pad", probe('const u = "https://example.com/"; import x from "left-pad";\n'))).toEqual(["<probe>.ts"]);
    expect(consumptionFiles("left-pad", probe('const re = /^file:\\/\\//; import x from "left-pad";\n'))).toEqual(["<probe>.ts"]);
    expect(consumptionFiles("left-pad", probe('const t = `http://a // b`; import x from "left-pad";\n'))).toEqual(["<probe>.ts"]);
    // ⑤ 例外反证：注释形态的环境注解指令仍计消费（jsdom 的合法消费形态）
    expect(consumptionFiles("jsdom", probe(`// ${VITEST_ENV_DIRECTIVE} jsdom\n`))).toEqual(["<probe>.ts"]);
  });
});

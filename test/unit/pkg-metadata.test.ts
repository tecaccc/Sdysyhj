// 商店元数据本地校验门禁（TASK-011 G 项 / Issue #10 / R-09，挂 verify:unit——vitest 自动发现）。
// 背景：#D-05（TASK-007）——v0.1.4 package.json categories 写入 Marketplace 非法类目 `Chatbots`，
// 发版通道①（Marketplace en-us 类目枚举校验）直接被拒，而本地 `vsce package` 不校验类目——
// 「发版通道即首次验证」即 R-09 缺口；本文件将该验证前移为本地门禁（四断言：类目子集 /
// publisher-repository 一致性 / icon 存在非空 / engines.vscode 合法区间）。
// 合法类目枚举清单入库为测试常量，对照 VS Code Marketplace 公开类目集，来源锚点：
//   ① VS Code 官方文档「Extension Manifest · categories」公开枚举（Azure / Chat / Data Science /
//     Debuggers / Extension Packs / Formatters / Keymaps / Language Packs / Linters / Machine Learning /
//     Notebooks / Programming Languages / SCM / Snippets / Testing / Themes / Visualization / Other）；
//   ② 本仓 TASK-007（#D-05 修复）实测有效值 AI（GitHub Copilot 同用；本仓 0.1.5~0.1.9 通道①
//     发布成功、gallery API 类目生效）。
// 后续新增类目须先扩本常量并附等效锚点（官方文档 / gallery API 实测 / 发布通道实证），再改 package.json。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  publisher?: unknown;
  categories?: unknown;
  icon?: unknown;
  engines?: { vscode?: unknown };
  repository?: unknown;
};

/** Marketplace 合法类目枚举（en-us）——来源锚点见文件头注释。 */
const MARKETPLACE_CATEGORIES: readonly string[] = [
  "AI",
  "Azure",
  "Chat",
  "Data Science",
  "Debuggers",
  "Extension Packs",
  "Formatters",
  "Keymaps",
  "Language Packs",
  "Linters",
  "Machine Learning",
  "Notebooks",
  "Programming Languages",
  "SCM",
  "Snippets",
  "Testing",
  "Themes",
  "Visualization",
  "Other",
];

/** 发布身份基线：publisher / repository 属发布载体（#D-05 教训——元数据改动手滑即发版失败或身份漂移），本地先行比对。 */
const EXPECTED_PUBLISHER = "tecacc";
const EXPECTED_REPO_OWNER_NAME = "tecaccc/Sdysyhj"; // 仓库 owner=tecaccc 与 publisher=tecacc 为既定配对，如实入库比对
const EXPECTED_REPO_URL = `https://github.com/${EXPECTED_REPO_OWNER_NAME}`;

/**
 * npm semver 区间合法性校验（engines.vscode 口径）。支持文法：`||` 并集的 comparator 集；
 * comparator = 可选算子（= / > / >= / < / <= / ^ / ~）+ 完整 semver（X.Y.Z[-prerelease][+build]）；
 * 单独 `*` 视作任意版本。npm 其余文法（x 通配、部分版本、hyphen 区间）不在支持集——出现即红，
 * 须先扩本函数并注明锚点（现基线值为 ^1.85.0）。
 */
function isValidSemverRange(range: unknown): boolean {
  if (typeof range !== "string" || range.trim() === "") return false;
  const COMPARATOR = /^(?:=|>=|<=|>|<|\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  return range.split("||").every((alternative) => {
    const part = alternative.trim();
    if (part === "*") return true;
    if (part === "") return false;
    return part.split(/\s+/).every((token) => COMPARATOR.test(token));
  });
}

describe("商店元数据本地校验（#D-05 复防 / R-09）", () => {
  it("① categories ⊆ Marketplace 公开类目枚举（非法类目本地即红，不再等发版通道报错）", () => {
    expect(Array.isArray(pkg.categories), "categories 必须为数组").toBe(true);
    const categories = pkg.categories as unknown[];
    expect(categories.length, "categories 不得为空").toBeGreaterThan(0);
    for (const category of categories) {
      expect(typeof category, "类目必须为字符串").toBe("string");
      expect(
        MARKETPLACE_CATEGORIES.includes(category as string),
        `非法类目「${String(category)}」不在 Marketplace 公开类目枚举内（#D-05：en-us 枚举外值发版通道①必拒）`,
      ).toBe(true);
    }
  });

  it("② 发布身份一致性：publisher==tecacc 且 repository 指向 tecaccc/Sdysyhj（github git 仓）", () => {
    expect(pkg.publisher, "publisher 与既定发布身份（tecacc）不一致").toBe(EXPECTED_PUBLISHER);
    const repository =
      typeof pkg.repository === "string"
        ? pkg.repository
        : (pkg.repository as { url?: unknown } | undefined)?.url;
    expect(typeof repository, "repository.url 缺失").toBe("string");
    const normalized = String(repository).replace(/^git\+/, "").replace(/\.git$/, "");
    expect(normalized, "repository 与既定发布身份（tecaccc/Sdysyhj）不一致").toBe(EXPECTED_REPO_URL);
    if (typeof pkg.repository === "object" && pkg.repository !== null) {
      expect((pkg.repository as { type?: unknown }).type, "repository.type 必须为 git").toBe("git");
    }
  });

  it("③ icon 已声明、路径存在且文件非空", () => {
    expect(typeof pkg.icon, "icon 字段缺失（Marketplace 商店卡片无图标）").toBe("string");
    expect(String(pkg.icon).length, "icon 路径为空串").toBeGreaterThan(0);
    const iconPath = path.join(root, String(pkg.icon));
    expect(fs.existsSync(iconPath), `icon 文件不存在：${String(pkg.icon)}`).toBe(true);
    expect(fs.statSync(iconPath).size, `icon 文件为空（0 字节）：${String(pkg.icon)}`).toBeGreaterThan(0);
  });

  it("④ engines.vscode 存在且为合法 semver 区间（支持文法见 isValidSemverRange 注释）", () => {
    expect(pkg.engines, "engines 块缺失").toBeDefined();
    const vscodeEngine = pkg.engines?.vscode;
    expect(typeof vscodeEngine, "engines.vscode 缺失").toBe("string");
    expect(
      isValidSemverRange(vscodeEngine),
      `engines.vscode=${String(vscodeEngine)} 非合法 semver 区间`,
    ).toBe(true);
  });
});

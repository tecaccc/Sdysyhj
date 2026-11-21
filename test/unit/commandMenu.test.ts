// CommandMenuState 单测：`/` 命令补全菜单纯逻辑全覆盖（FR-CMD-03）。
// 事件序列模拟 webview 接线层输入：输入变化 → onInput(全文)、命令全集就绪 → setCommands、
// 键盘 → moveUp/moveDown/close、选中 → highlightedItem / insertText。
// 口径：文本以 `/` 开头才显示；`/` 之后文本按名称/描述子串过滤（不区分大小写）；无匹配/空全集隐藏；
// ↑/↓ 环绕移动高亮；选中插入 `/` + 命令名。

import { describe, expect, it } from "vitest";
import { CommandMenuState, filterCommands, type CommandEntry } from "../../webview/render/commandMenu";

const COMMANDS: CommandEntry[] = [
  { name: "init", description: "Initialize project config", source: "extension" },
  { name: "review", description: "Review code changes", source: "prompt" },
  { name: "skill:summarize", description: "总结当前会话", source: "skill" },
];

function openedMenu(commands: CommandEntry[] = COMMANDS, text = "/"): CommandMenuState {
  const menu = new CommandMenuState();
  menu.setCommands(commands);
  menu.onInput(text);
  return menu;
}

describe("filterCommands（FR-CMD-03 ② 过滤）", () => {
  it("空过滤词匹配全部", () => {
    expect(filterCommands(COMMANDS, "")).toEqual(COMMANDS);
  });

  it("名称子串过滤，不区分大小写", () => {
    expect(filterCommands(COMMANDS, "INI").map((c) => c.name)).toEqual(["init"]);
    expect(filterCommands(COMMANDS, "Sum").map((c) => c.name)).toEqual(["skill:summarize"]);
  });

  it("描述子串过滤，不区分大小写（含中文）", () => {
    expect(filterCommands(COMMANDS, "REVIEW CODE").map((c) => c.name)).toEqual(["review"]);
    expect(filterCommands(COMMANDS, "总结").map((c) => c.name)).toEqual(["skill:summarize"]);
  });

  it("无匹配返回空", () => {
    expect(filterCommands(COMMANDS, "nosuchcommand")).toEqual([]);
  });

  it("空名命令防御性剔除", () => {
    expect(filterCommands([{ name: "" }, { name: "ok" }], "").map((c) => c.name)).toEqual(["ok"]);
  });
});

describe("CommandMenuState（FR-CMD-03 ②③④）", () => {
  it("② 非 `/` 开头不显示菜单（即使已有命令全集）", () => {
    const menu = openedMenu();
    menu.onInput("hello world");
    expect(menu.isOpen).toBe(false);
    menu.onInput("");
    expect(menu.isOpen).toBe(false);
    menu.onInput("a/b");
    expect(menu.isOpen).toBe(false);
  });

  it("② `/` 开头显示菜单，`/` 后为空匹配全部", () => {
    const menu = openedMenu();
    expect(menu.isOpen).toBe(true);
    expect(menu.items).toHaveLength(3);
  });

  it("② 随 `/` 之后文本实时过滤；过滤后无匹配则隐藏", () => {
    const menu = openedMenu();
    menu.onInput("/ini");
    expect(menu.isOpen).toBe(true);
    expect(menu.items.map((c) => c.name)).toEqual(["init"]);
    menu.onInput("/ini-nope");
    expect(menu.isOpen).toBe(false);
    expect(menu.items).toEqual([]);
  });

  it("⑤ 命令全集为空时不显示菜单", () => {
    const menu = openedMenu([]);
    expect(menu.isOpen).toBe(false);
  });

  it("⑤ 命令全集晚到（空 → 就绪）按当前输入重求值", () => {
    const menu = new CommandMenuState();
    menu.onInput("/rev"); // 尚无命令全集：不显示
    expect(menu.isOpen).toBe(false);
    menu.setCommands(COMMANDS); // 宿主 commands 消息到达
    expect(menu.isOpen).toBe(true);
    expect(menu.items.map((c) => c.name)).toEqual(["review"]);
  });

  it("③ ↑/↓ 移动高亮项，末端环绕", () => {
    const menu = openedMenu();
    expect(menu.highlightedItem?.name).toBe("init"); // 默认首项
    menu.moveDown();
    expect(menu.highlightedItem?.name).toBe("review");
    menu.moveDown();
    expect(menu.highlightedItem?.name).toBe("skill:summarize");
    menu.moveDown(); // 末项 → 首项（环绕）
    expect(menu.highlightedItem?.name).toBe("init");
    menu.moveUp(); // 首项 → 末项（环绕）
    expect(menu.highlightedItem?.name).toBe("skill:summarize");
  });

  it("③ 过滤变化后高亮重置首项", () => {
    const menu = openedMenu();
    menu.moveDown();
    menu.moveDown();
    expect(menu.highlightedItem?.name).toBe("skill:summarize");
    menu.onInput("/re");
    expect(menu.highlightedItem?.name).toBe("review"); // 过滤后仅 1 项，高亮回退
  });

  it("③ 菜单未打开时 ↑/↓ 无操作、无高亮项", () => {
    const menu = openedMenu();
    menu.onInput("plain text");
    menu.moveDown();
    menu.moveUp();
    expect(menu.isOpen).toBe(false);
    expect(menu.highlightedItem).toBeNull();
  });

  it("③ close() 关闭（Esc）；输入 `/` 文本可重新触发", () => {
    const menu = openedMenu(COMMANDS, "/re");
    menu.close();
    expect(menu.isOpen).toBe(false);
    menu.onInput("/re");
    expect(menu.isOpen).toBe(true);
    expect(menu.highlightedItem?.name).toBe("review"); // 重开高亮自首项起
  });

  it("④ 选中插入文本 = `/` + 命令名；关闭后为 null", () => {
    const menu = openedMenu();
    menu.moveDown();
    expect(menu.insertText).toBe("/review");
    menu.close();
    expect(menu.insertText).toBeNull();
  });

  it("④ 过滤后无匹配项时插入文本为 null", () => {
    const menu = openedMenu();
    menu.onInput("/zzz");
    expect(menu.insertText).toBeNull();
  });
});

// TASK-009 §10.14 D8 单测：Composer 纯逻辑（D3）——@ 触发谓词/防抖（fileRefTrigger）。
// `/` 命令菜单纯逻辑复用件回归见 commandMenu.test.ts（保留零改动，本文件不复重）。

import { describe, expect, it } from "vitest";
import { FileRefTriggerState, shouldTriggerFileRef } from "../../webview/ui/fileRefTrigger";

describe("shouldTriggerFileRef（FR-FILE-02 @ 触发谓词，旧实现逐字平移）", () => {
  it("① 光标前为 @ 且前一字符为行首 → 触发", () => {
    expect(shouldTriggerFileRef("@", 1)).toBe(true);
    expect(shouldTriggerFileRef("@file", 1)).toBe(true);
  });

  it("② 前一字符为空白 → 触发", () => {
    expect(shouldTriggerFileRef("hi @", 4)).toBe(true);
    expect(shouldTriggerFileRef("hi\n@", 4)).toBe(true);
    expect(shouldTriggerFileRef("hi\t@", 4)).toBe(true);
  });

  it("③ 前一字符非空白（如邮箱）→ 不触发", () => {
    expect(shouldTriggerFileRef("a@b", 2)).toBe(false);
    expect(shouldTriggerFileRef("mail a@b", 7)).toBe(false);
  });

  it("④ 光标前非 @ / 空输入 → 不触发", () => {
    expect(shouldTriggerFileRef("abc", 3)).toBe(false);
    expect(shouldTriggerFileRef("", 0)).toBe(false);
    expect(shouldTriggerFileRef("@", 0)).toBe(false);
  });
});

describe("FileRefTriggerState（1s 防抖，旧 lastAtTrigger 同语义）", () => {
  it("⑤ 首次触发记账；1s 内重复不触发；1s 后再触发", () => {
    const t = new FileRefTriggerState();
    expect(t.check("@", 1, 10000)).toBe(true);
    expect(t.check("@", 1, 10500)).toBe(false);
    expect(t.check("@", 1, 11000)).toBe(false); // 恰 1000ms 不触发（>1000 才触发）
    expect(t.check("@", 1, 11001)).toBe(true);
  });

  it("⑥ 谓词未命中不记账（无效触发不影响后续有效触发）", () => {
    const t = new FileRefTriggerState();
    expect(t.check("a@", 2, 20000)).toBe(false);
    expect(t.check("@", 1, 20001)).toBe(true);
  });
});

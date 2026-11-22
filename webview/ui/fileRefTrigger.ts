// @ 触发谓词（FR-FILE-02，TASK-009 §10.14 D3）：从旧 webview/main.ts input 处理器机械提取的纯逻辑。
// 口径（v0.4 起）：刚输入 `@`（光标前一字符）且其前一字符为行首/空白时触发文件选择器；1s 防抖。
// 无 DOM 依赖，可单测（test/unit/ui-composer.test.ts）。

/** 刚输入 `@` 且前一字符为行首/空白（旧实现同一谓词，逐字平移）。 */
export function shouldTriggerFileRef(value: string, cursor: number): boolean {
  if (cursor > 0 && value[cursor - 1] === "@") {
    const before = cursor >= 2 ? value[cursor - 2] : "";
    return before === "" || /\s/.test(before);
  }
  return false;
}

/** 触发防抖（1s 内不重复触发，旧实现 lastAtTrigger 同语义）。 */
export class FileRefTriggerState {
  private lastAt = 0;

  /** 谓词命中且距上次触发 >1s 时记账并返回 true。 */
  check(value: string, cursor: number, now: number): boolean {
    if (!shouldTriggerFileRef(value, cursor)) return false;
    if (now - this.lastAt <= 1000) return false;
    this.lastAt = now;
    return true;
  }
}

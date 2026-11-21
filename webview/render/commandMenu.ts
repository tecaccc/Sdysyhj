// `/` 命令补全菜单（FR-CMD-03）：纯逻辑状态机，无 DOM 依赖。
// 输入框文本与命令全集 → 菜单可见性 / 过滤结果 / 高亮项；DOM 渲染与键盘接线由 webview/main.ts 负责。
// 口径：文本以 `/` 开头才显示菜单（②）；`/` 之后文本按名称/描述子串过滤、不区分大小写；
// 过滤后无匹配（或命令全集为空）则菜单隐藏（②⑤）；↑/↓ 环绕移动高亮；选中插入 `/` + 命令名（④）。

/** 命令菜单项（源自宿主 get_commands 转发；名称不含前导 `/`）。 */
export interface CommandEntry {
  name: string;
  description?: string;
  source?: string;
}

/** 按名称/描述子串过滤（不区分大小写）；query 为空匹配全部。空名命令防御性剔除。 */
export function filterCommands(commands: CommandEntry[], query: string): CommandEntry[] {
  const q = query.toLowerCase();
  return commands.filter((command) => {
    if (typeof command.name !== "string" || command.name.length === 0) return false;
    if (q.length === 0) return true;
    const name = command.name.toLowerCase();
    const description = typeof command.description === "string" ? command.description.toLowerCase() : "";
    return name.includes(q) || description.includes(q);
  });
}

/** `/` 命令菜单状态：过滤 + 高亮导航 + 选中决策。 */
export class CommandMenuState {
  private commands: CommandEntry[] = [];
  private query = "";
  private highlighted = 0;
  private open = false;

  /** 更新输入框全文（含前导 `/`）：重算可见性与过滤结果，过滤变化时高亮重置首项。 */
  onInput(text: string): void {
    this.query = text;
    if (!this.isTrigger(text)) {
      this.open = false;
      return;
    }
    this.reevaluate();
  }

  /** 命令全集就绪/更新（宿主 commands 消息）：按当前输入重算（晚到场景）。 */
  setCommands(commands: CommandEntry[]): void {
    this.commands = commands;
    if (this.isTrigger(this.query)) this.reevaluate();
  }

  /** ↑：上移高亮（首项环绕到末项）。菜单未打开时无操作。 */
  moveUp(): void {
    this.move(-1);
  }

  /** ↓：下移高亮（末项环绕回首项）。菜单未打开时无操作。 */
  moveDown(): void {
    this.move(1);
  }

  /** Esc / 选中后关闭：不发送、不改输入文本。 */
  close(): void {
    this.open = false;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** 当前过滤结果（仅菜单打开时有意义）。 */
  get items(): CommandEntry[] {
    return filterCommands(this.commands, this.filterText(this.query));
  }

  /** 当前高亮项（菜单关闭或无项时 null）。 */
  get highlightedItem(): CommandEntry | null {
    if (!this.open) return null;
    return this.items[this.highlighted] ?? null;
  }

  /** 选中插入文本：`/` + 命令名（④）。无高亮项时 null。 */
  get insertText(): string | null {
    const item = this.highlightedItem;
    return item ? `/${item.name}` : null;
  }

  private move(delta: number): void {
    if (!this.open) return;
    const count = this.items.length;
    if (count === 0) return;
    this.highlighted = (this.highlighted + delta + count) % count;
  }

  /** 触发口径（②）：输入框文本以 `/` 开头。 */
  private isTrigger(text: string): boolean {
    return typeof text === "string" && text.startsWith("/");
  }

  private filterText(text: string): string {
    return text.slice(1);
  }

  private reevaluate(): void {
    const items = this.items;
    this.open = items.length > 0;
    if (this.highlighted >= items.length) this.highlighted = 0;
  }
}

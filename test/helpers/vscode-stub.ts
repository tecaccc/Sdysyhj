// vscode API 测试桩（vitest alias：'vscode' → 本文件；沿 test/helpers/prod-vscode-stub.js 模式）。
// 仅支撑 chatPanel.ts 可加载与 ui-dual-panel 的 HTML 模板提取；不模拟任何行为语义。

export class Disposable {
  constructor(private readonly fn?: () => void) {}
  dispose(): void {
    this.fn?.();
  }
}

export const window = {
  registerWebviewViewProvider: (): Disposable => new Disposable(),
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  activeTextEditor: undefined,
  createOutputChannel: () => ({ appendLine: () => {}, dispose: () => {} }),
  createStatusBarItem: () => ({ text: "", tooltip: "", command: "", show: () => {}, dispose: () => {} }),
};

export const workspace = {
  workspaceFolders: undefined,
  findFiles: async (): Promise<never[]> => [],
  getConfiguration: () => ({ get: () => undefined }),
};

export const commands = {
  executeCommand: async () => undefined,
  registerCommand: () => new Disposable(),
};

export const env = {
  openExternal: async () => undefined,
  clipboard: { writeText: async () => undefined },
};

export const Uri = {
  joinPath: (...parts: Array<{ path?: string } | string>): { path: string; fsPath: string; toString: () => string } => {
    const path = parts.map((p) => (typeof p === "string" ? p : (p.path ?? ""))).join("/");
    return { path, fsPath: path, toString: () => path };
  },
  parse: (s: string): { path: string; fsPath: string } => ({ path: s, fsPath: s }),
  file: (s: string): { path: string; fsPath: string } => ({ path: s, fsPath: s }),
};

export const StatusBarAlignment = { Left: 1, Right: 2 };

export default undefined;

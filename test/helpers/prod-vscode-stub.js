// vscode API stub（打包布局复现/回归用，复制到 <layout>/node_modules/vscode/index.js）。
// 仅覆盖扩展激活与 webview 就绪链路所需的最小 API 面；记录输出通道/命令/面板以便断言。
"use strict";

const path = require("path");

const outputChannels = {};
const webviewProviders = {};
const registeredCommands = {};

class Disposable {
  constructor(fn) {
    this._fn = fn;
  }
  dispose() {
    if (typeof this._fn === "function") this._fn();
  }
}

const Uri = {
  joinPath: (base, ...parts) => ({
    fsPath: path.join(base.fsPath || String(base), ...parts),
    toString() {
      return this.fsPath;
    },
  }),
  parse: (s) => ({ fsPath: s, toString: () => s }),
  file: (p) => ({ fsPath: p, toString: () => p }),
};

const window = {
  createOutputChannel: (name) => {
    const channel = {
      name,
      lines: [],
      appendLine: (line) => channel.lines.push(String(line)),
      append: (line) => channel.lines.push(String(line)),
      clear: () => (channel.lines = []),
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    };
    outputChannels[name] = channel;
    return channel;
  },
  registerWebviewViewProvider: (viewType, provider) => {
    webviewProviders[viewType] = provider;
    return new Disposable();
  },
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: undefined,
    show: () => undefined,
    hide: () => undefined,
    dispose: () => undefined,
  }),
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  activeTextEditor: undefined,
};

const workspace = {
  workspaceFolders: undefined,
  getConfiguration: () => ({
    get: () => undefined,
    has: () => false,
    update: async () => undefined,
  }),
  findFiles: async () => [],
  onDidChangeConfiguration: () => new Disposable(),
};

const commands = {
  registerCommand: (id, fn) => {
    registeredCommands[id] = fn;
    return new Disposable();
  },
  executeCommand: async () => undefined,
};

const env = {
  openExternal: async () => true,
  clipboard: { writeText: async () => undefined },
};

module.exports = {
  window,
  workspace,
  commands,
  env,
  Uri,
  Disposable,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, Beside: -2 },
  _control: {
    outputChannels,
    webviewProviders,
    commands: registeredCommands,
  },
};

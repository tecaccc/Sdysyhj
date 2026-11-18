// /tmp/r2harness/node_modules/vscode —— vscode API stub（核验用，非被测代码）。
// 可编程行为集中在 module.exports._control。
"use strict";

const control = {
  config: {}, // { "sdysyhj.piRuntime": "auto", ... }
  workspaceFolders: null, // [{ uri: { fsPath } }] | undefined
  quickPicks: [], // 队列：每次 showQuickPick 弹出时 shift 一项作为选中（null=取消）
  inputBoxes: [],
  findFilesResult: [],
  activeTextEditor: null,
  messages: [], // { type: "error"|"warning"|"info", text }
  executedCommands: [], // { command, args }
  clipboard: [],
  openedExternal: [],
  outputChannels: {},
  statusBarItems: [],
  webviewProviders: {},
  commands: {},
  reset() {
    control.config = {};
    control.workspaceFolders = null;
    control.quickPicks = [];
    control.inputBoxes = [];
    control.findFilesResult = [];
    control.activeTextEditor = null;
    control.messages = [];
    control.executedCommands = [];
    control.clipboard = [];
    control.openedExternal = [];
    control.outputChannels = {};
    control.statusBarItems = [];
    control.webviewProviders = {};
    control.commands = {};
  },
};

class Disposable {
  constructor(fn) { this._fn = fn; }
  dispose() { if (this._fn) this._fn(); }
}

const Uri = {
  parse(s) { return { fsPath: s.replace(/^file:\/\//, ""), toString: () => s, scheme: s.startsWith("http") ? "https" : "file" }; },
  file(p) { return { fsPath: p, toString: () => "file://" + p, scheme: "file" }; },
  joinPath(base, ...parts) {
    const path = require("path");
    return { fsPath: path.join(base.fsPath || String(base), ...parts), toString: () => path.join(base.fsPath || String(base), ...parts), scheme: "file" };
  },
};

const vscode = {
  Disposable,
  Uri,
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createOutputChannel(name) {
      const channel = {
        name,
        lines: [],
        appendLine(m) { channel.lines.push(m); },
        append(m) { channel.lines.push(m); },
        clear() { channel.lines = []; },
        show() {},
        dispose() {},
      };
      control.outputChannels[name] = channel;
      return channel;
    },
    registerWebviewViewProvider(viewType, provider, opts) {
      control.webviewProviders[viewType] = provider;
      return new Disposable();
    },
    createStatusBarItem(alignment, priority) {
      const item = { text: "", tooltip: "", command: "", shown: false, show() { item.shown = true; }, hide() { item.shown = false; }, dispose() {} };
      control.statusBarItems.push(item);
      return item;
    },
    async showQuickPick(items) {
      control.lastQuickPickItems = items;
      if (control.quickPicks.length === 0) return undefined;
      const next = control.quickPicks.shift();
      return typeof next === "function" ? next(items) : next;
    },
    async showInputBox(opts) {
      control.lastInputBox = opts;
      return control.inputBoxes.length > 0 ? control.inputBoxes.shift() : undefined;
    },
    async showErrorMessage(text) { control.messages.push({ type: "error", text }); },
    async showWarningMessage(text) { control.messages.push({ type: "warning", text }); },
    async showInformationMessage(text) { control.messages.push({ type: "info", text }); },
    get activeTextEditor() { return control.activeTextEditor; },
  },
  workspace: {
    get workspaceFolders() { return control.workspaceFolders === null ? undefined : control.workspaceFolders; },
    getConfiguration(section) {
      return { get: (key) => control.config[`${section}.${key}`] };
    },
    async findFiles() { return control.findFilesResult; },
  },
  commands: {
    registerCommand(command, fn) {
      control.commands[command] = fn;
      return new Disposable(() => { delete control.commands[command]; });
    },
    async executeCommand(command, ...args) {
      control.executedCommands.push({ command, args });
      const fn = control.commands[command];
      if (fn) return fn(...args);
      return undefined;
    },
  },
  env: {
    async openExternal(uri) { control.openedExternal.push(uri); return true; },
    clipboard: { async writeText(t) { control.clipboard.push(t); } },
  },
};

module.exports = vscode;
module.exports._control = control;

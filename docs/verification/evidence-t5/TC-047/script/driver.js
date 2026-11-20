// T5 核验驱动：在 vm 沙箱内加载生产 webview bundle（media/main.js，esbuild IIFE），
// 以宿主→webview 消息驱动真实产品代码，模拟滚动并采样滚动度量。
"use strict";

const fs = require("fs");
const vm = require("vm");
const { createBrowserGlobals } = require("./minidom");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 创建一个“面板实例”（fresh = 模拟插件/面板重载）。返回驱动 API。 */
function createPanel(bundlePath, options = {}) {
  const code = fs.readFileSync(bundlePath, "utf8");
  const g = createBrowserGlobals(options);
  const outbound = []; // webview → 宿主 全量出站消息（TC-050a 边界断言用）
  let getStateCalls = 0;
  let setStateCalls = 0;
  const acquireVsCodeApi = () => ({
    postMessage: (m) => outbound.push(m),
    getState: () => {
      getStateCalls++;
      return null;
    },
    setState: () => {
      setStateCalls++;
    },
  });
  const sandbox = {
    window: g.window,
    document: g.document,
    MutationObserver: require("./minidom").MutationObserver,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
    acquireVsCodeApi,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = g.window;
  g.window.acquireVsCodeApi = acquireVsCodeApi;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: bundlePath });

  const messages = g.messages;
  const metrics = () => ({
    scrollTop: messages.scrollTop,
    scrollHeight: messages.scrollHeight,
    clientHeight: messages.clientHeight,
    distanceFromBottom: Math.max(0, messages.scrollHeight - messages.clientHeight - messages.scrollTop),
  });
  /** 模拟用户滚动：直接设定目标 scrollTop（触发 scroll 事件 → 产品按距底值判定打断/恢复）。 */
  const userScrollToDistance = (dist) => {
    const m = metrics();
    const target = m.scrollHeight - m.clientHeight - dist;
    if (target < 0) throw new Error(`内容不足以下滚到距底 ${dist}px（可滚高度=${m.scrollHeight - m.clientHeight}px）`);
    messages.scrollTop = target;
  };
  const hostMessage = (msg) => {
    g.window.fire("message", { data: msg });
  };
  /** 等待渲染落定：300ms 节流渲染 + 微任务 MutationObserver 排空。 */
  const settle = async (ms = 340) => {
    await sleep(ms);
    await sleep(0);
    await sleep(0);
  };
  const findCards = (messageId) => {
    const root = g.document.querySelectorAll(".message").find((el) => el.dataset.messageId === messageId);
    if (!root) return [];
    return root.querySelectorAll(".toolcard").map((card) => {
      const status = card.querySelector(".toolcard-status");
      const name = card.querySelector(".toolcard-name");
      return {
        tool: name ? name.textContent : null,
        statusText: status ? status.textContent : null,
        statusClass: status ? status.className : null,
      };
    });
  };
  /** 渲染文本采样：流式正文渲染走 innerHTML（marked 输出），归并原始文本与子树。 */
  const renderedHtml = (el = messages) => {
    let s = el._ownText !== undefined && el._ownText ? el._ownText : "";
    if (el._innerHTML) s += el._innerHTML;
    for (const c of el._children) s += renderedHtml(c);
    return s;
  };
  return {
    metrics,
    userScrollToDistance,
    hostMessage,
    settle,
    sleep,
    findCards,
    renderedHtml,
    outbound,
    persistenceProbe: () => ({ getStateCalls, setStateCalls }),
    document: g.document,
    messages,
  };
}

module.exports = { createPanel, sleep };

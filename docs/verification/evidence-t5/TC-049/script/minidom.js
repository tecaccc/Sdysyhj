// 极简 DOM shim（T5 核验专用，/tmp 一次性脚本）：仅实现 webview 生产 bundle 所需的
// createElement/getElementById/appendChild/querySelector(.cls/#id)/textContent/innerHTML/
// dataset/classList/hidden/setAttribute/remove/scroll 度量/事件目标/MutationObserver/rAF。
// 不模拟样式与真实布局：scrollHeight 以内容字符量+子块基高为确定性代理（布局引擎替身）。
"use strict";

let MUTATION_OBSERVERS = [];

function isAncestorOrSelf(ancestor, el) {
  let cur = el;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parentNode;
  }
  return false;
}

function notifyMutation(el) {
  for (const obs of MUTATION_OBSERVERS) {
    if (isAncestorOrSelf(obs._target, el) && !obs._queued) {
      obs._queued = true;
      queueMicrotask(() => {
        obs._queued = false;
        try {
          obs._callback([], obs);
        } catch (e) {
          /* 观察者异常不影响宿主行为 */
        }
      });
    }
  }
}

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type) || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  dispatchEvent(ev) {
    if (ev.target === undefined) ev.target = this;
    for (const fn of (this._listeners.get(ev.type) || []).slice()) fn(ev);
    return true;
  }
  fire(type, init) {
    return this.dispatchEvent(Object.assign({ type }, init || {}));
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this._children = [];
    this.parentNode = null;
    this._class = "";
    this.id = "";
    this._ownText = "";
    this._innerHTML = "";
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.attributes = {};
    this._scrollTop = 0;
    this.clientHeight = 0;
    this._value = "";
    this.placeholder = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }
  get className() {
    return this._class;
  }
  set className(v) {
    this._class = String(v);
    notifyMutation(this);
  }
  get textContent() {
    let s = this._ownText;
    for (const c of this._children) s += c.textContent;
    return s;
  }
  set textContent(v) {
    this._ownText = String(v);
    this._children = [];
    this._innerHTML = "";
    notifyMutation(this);
  }
  get innerHTML() {
    return this._innerHTML !== "" ? this._innerHTML : this.textContent;
  }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this._children = [];
    this._ownText = "";
    notifyMutation(this);
  }
  appendChild(child) {
    if (child.parentNode) {
      const arr = child.parentNode._children;
      const i = arr.indexOf(child);
      if (i >= 0) arr.splice(i, 1);
    }
    child.parentNode = this;
    this._children.push(child);
    notifyMutation(child);
    return child;
  }
  removeChild(child) {
    const i = this._children.indexOf(child);
    if (i >= 0) this._children.splice(i, 1);
    child.parentNode = null;
    notifyMutation(child);
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  get parentElement() {
    return this.parentNode;
  }
  get childNodes() {
    return this._children.slice();
  }
  get firstChild() {
    return this._children[0] || null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }
  get classList() {
    const self = this;
    return {
      add(...cs) {
        const set = new Set(self._class.split(/\s+/).filter(Boolean));
        cs.forEach((c) => set.add(c));
        self._class = [...set].join(" ");
        notifyMutation(self);
      },
      remove(...cs) {
        const set = new Set(self._class.split(/\s+/).filter(Boolean));
        cs.forEach((c) => set.delete(c));
        self._class = [...set].join(" ");
        notifyMutation(self);
      },
      toggle(c, force) {
        const set = new Set(self._class.split(/\s+/).filter(Boolean));
        const on = force === undefined ? !set.has(c) : !!force;
        if (on) set.add(c);
        else set.delete(c);
        self._class = [...set].join(" ");
        notifyMutation(self);
        return on;
      },
      contains(c) {
        return self._class.split(/\s+/).filter(Boolean).includes(c);
      },
    };
  }
  // 确定性布局替身：字符长度 + 每子块 8px 基高。仅用于 scrollHeight 度量。
  get scrollHeight() {
    let h = this._ownText.length + this._innerHTML.length;
    for (const c of this._children) h += c.scrollHeight + 8;
    return h;
  }
  get scrollTop() {
    return this._scrollTop;
  }
  set scrollTop(v) {
    const nv = Number(v) || 0;
    const old = this._scrollTop;
    this._scrollTop = nv;
    if (nv !== old) this.fire("scroll", { target: this }); // 滚动事件（程序/用户滚动同源，由产品侧 selfScrollPending 区分）
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }
  scrollIntoView() {}
  focus() {}
  blur() {}
  querySelectorAll(sel) {
    const out = [];
    const sels = String(sel).split(",").map((s) => s.trim()).filter(Boolean);
    const matches = (el) =>
      sels.some((s) => {
        if (s.startsWith(".")) return el._class.split(/\s+/).filter(Boolean).includes(s.slice(1));
        if (s.startsWith("#")) return el.id === s.slice(1);
        return el.tagName === s.toUpperCase();
      });
    const walk = (el) => {
      for (const c of el._children) {
        if (matches(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  getElementsByTagName(tag) {
    return this.querySelectorAll(tag);
  }
}

class FakeDocument extends FakeEventTarget {
  constructor(ids) {
    super();
    this.nodeType = 9;
    this._byId = new Map();
    for (const id of ids) {
      const el = new FakeElement(id === "input" ? "textarea" : id === "send-mode" ? "select" : "div");
      el.id = id;
      this._byId.set(id, el);
    }
    const body = new FakeElement("body");
    body.id = "body";
    this._byId.set("body", body);
  }
  createElement(tag) {
    return new FakeElement(tag);
  }
  createTextNode(text) {
    const el = new FakeElement("#text");
    el.textContent = String(text);
    return el;
  }
  getElementById(id) {
    return this._byId.get(id) || null;
  }
}

class MutationObserver {
  constructor(callback) {
    this._callback = callback;
    this._target = null;
    this._queued = false;
  }
  observe(target) {
    this._target = target;
    MUTATION_OBSERVERS.push(this);
  }
  disconnect() {
    MUTATION_OBSERVERS = MUTATION_OBSERVERS.filter((o) => o !== this);
    this._target = null;
  }
}

const VIEW_IDS = [
  "messages",
  "errors",
  "input",
  "btn-send",
  "btn-stop",
  "btn-file",
  "btn-new",
  "btn-history",
  "btn-settings",
  "status-line",
  "session-name",
  "send-mode",
];

/** 构造一套隔离的浏览器全局（每次调用 = 一次“面板重载”）。 */
function createBrowserGlobals(options = {}) {
  const document = new FakeDocument(VIEW_IDS);
  const messages = document.getElementById("messages");
  messages.clientHeight = options.clientHeight !== undefined ? options.clientHeight : 300;
  const window = new FakeEventTarget();
  window.document = document;
  window.addEventListener = FakeEventTarget.prototype.addEventListener.bind(window);
  // dompurify 初始化面：提供 Element/Node 原型使其定义 sanitize；不提供 implementation.createHTMLDocument
  // → isSupported=false，sanitize(文本) 原样返回输入（不影响工具卡/滚动断言；markdown 走 marked 原样落 innerHTML）。
  window.Element = class Element {};
  window.Node = class Node {};
  window.NodeFilter = { SHOW_ELEMENT: 1, SHOW_COMMENT: 2, SHOW_TEXT: 4, SHOW_PROCESSING_INSTRUCTION: 8, SHOW_CDATA_SECTION: 8 };
  window.DOMParser = class DOMParser {};
  document.currentScript = null;
  document.implementation = {};
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.getComputedStyle = () => ({ getPropertyValue: () => "" });
  return { document, window, messages };
}

module.exports = { FakeElement, FakeDocument, MutationObserver, createBrowserGlobals, notifyMutation };

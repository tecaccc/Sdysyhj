// 核验自研 DOM shim（测试 Agent 独立实现，不复用研发测试基建）
// 能力：迷你 HTML 解析器（解析 chatPanel HTML 模板与 markdown 输出）、
//       元素树（appendChild/remove/contains/innerHTML/textContent/querySelector）、
//       事件（addEventListener/dispatch）、focus 跟踪、textarea value/selection、
//       CSS 解析器 + 级联计算（simple selector + 后代/子组合器 + var() 回退解析）。
// 局限（如实披露）：非真实浏览器引擎——不支持真实布局/继承盒模型；本 shim 的
//       "computed style" 为声明级联结果 + CSS 初始值，不执行 VS Code 运行时变量注入
//       （var(--vscode-*, fallback) 一律取 fallback）。足以支撑 TC 字面口径的
//       max-width / margin / border-radius / background-color / border / 对齐声明断言。

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "source", "path", "circle", "rect", "line", "polyline", "polygon", "use", "col", "area", "base", "embed", "track", "wbr"]);

export class ShimNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = new Map();
    this._className = "";
    this._value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.nodeType = 1;
  }
  get id() { return this.getAttribute("id") ?? ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this._className; }
  set className(v) { this._className = String(v); }
  get classList() {
    const self = this;
    return {
      contains(c) { return self._className.split(/\s+/).filter(Boolean).includes(c); },
      add(c) { if (!this.contains(c)) self._className = (self._className + " " + c).trim(); },
      remove(c) { self._className = self._className.split(/\s+/).filter(Boolean).filter((x) => x !== c).join(" "); },
      toggle(c, force) {
        const on = force === undefined ? !this.contains(c) : force;
        if (on) this.add(c); else this.remove(c);
      },
    };
  }
  getAttribute(name) {
    if (name === "class") return this._className || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, v) {
    if (name === "class") { this._className = String(v); return; }
    if (name === "hidden") { this.hidden = true; }
    this.attributes.set(name, String(v));
  }
  removeAttribute(name) {
    if (name === "class") { this._className = ""; return; }
    if (name === "hidden") this.hidden = false;
    this.attributes.delete(name);
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() {
    return this.childNodes
      .map((n) => (n.nodeType === 3 ? n.data : n.textContent))
      .join("");
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== "") this.appendChild(new ShimText(String(v)));
  }
  set innerHTML(html) {
    this.childNodes = [];
    if (typeof html === "string" && html.length > 0) {
      for (const node of parseHTML(html)) this.appendChild(node);
    }
  }
  get innerHTML() { return this.childNodes.map((n) => (n.nodeType === 3 ? n.data : n.outerHTML)).join(""); }
  get outerHTML() {
    const cls = this._className ? ` class="${this._className}"` : "";
    const h = this.hidden ? " hidden" : "";
    const attrs = [...this.attributes].map(([k, v]) => ` ${k}="${v}"`).join("");
    const tag = this.tagName.toLowerCase();
    return `<${tag}${attrs}${cls}${h}>${this.childNodes.map((n) => (n.nodeType === 3 ? n.data : n.outerHTML)).join("")}</${tag}>`;
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; }
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(ev) {
    ev.target = ev.target ?? this;
    ev.currentTarget = this;
    ev.preventDefault = ev.preventDefault ?? (() => {});
    ev.stopPropagation = ev.stopPropagation ?? (() => {});
    const fns = [...(this.listeners.get(ev.type) ?? [])];
    for (const fn of fns) fn(ev);
    return true;
  }
  click() { this.dispatchEvent({ type: "click" }); }
  focus() { ShimDocument.activeElement = this; this.dispatchEvent({ type: "focus" }); }
  blur() { if (ShimDocument.activeElement === this) ShimDocument.activeElement = null; }
  scrollIntoView() {}
  matches(selector) { return matchesSimple(this, selector); }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchesSimple(n, selector)) return n;
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const out = [];
    walk(this, (n) => { if (n.nodeType === 1 && matchesCompound(n, selector)) out.push(n); });
    return out;
  }
  getElementsByTagName(tag) {
    const out = [];
    walk(this, (n) => { if (n.nodeType === 1 && n.tagName === tag.toUpperCase()) out.push(n); });
    return out;
  }
  // value（textarea/input/select 语义）
  get value() { return this._value; }
  set value(v) {
    this._value = String(v);
    if (this.tagName === "TEXTAREA" || this.tagName === "INPUT") {
      this.selectionStart = this.selectionEnd = this._value.length;
    }
  }
}

export class ShimText {
  constructor(data) { this.data = data; this.nodeType = 3; this.parentNode = null; }
  get textContent() { return this.data; }
}

function walk(node, fn) {
  for (const child of [...(node.childNodes ?? [])]) {
    fn(child);
    if (child.childNodes) walk(child, fn);
  }
}

// ---------- 迷你 HTML 解析 ----------

const ENTITY = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY[m] ?? m);
}

export function parseHTML(html) {
  const root = { childNodes: [], insert(node) { node.parentNode = null; this.childNodes.push(node); } };
  const stack = [root];
  let i = 0;
  const text = String(html);
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { pushText(text.slice(i)); break; }
    if (lt > i) pushText(text.slice(i, lt));
    if (text.startsWith("<!--", lt)) { const end = text.indexOf("-->", lt); i = end < 0 ? text.length : end + 3; continue; }
    const gt = text.indexOf(">", lt);
    if (gt < 0) { pushText(text.slice(lt)); break; }
    let tag = text.slice(lt + 1, gt).trim();
    if (tag.startsWith("/")) {
      const closeName = tag.slice(1).split(/\s/)[0].toLowerCase();
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].tagName && stack[s].tagName.toLowerCase() === closeName) { stack.length = s; break; }
      }
      i = gt + 1;
      continue;
    }
    const selfClose = tag.endsWith("/") || VOID_TAGS.has(tag.split(/\s/)[0].toLowerCase());
    tag = tag.replace(/\/$/, "").trim();
    const m = tag.match(/^([^\s]+)([\s\S]*)$/);
    const name = (m ? m[1] : tag).toLowerCase();
    const el = new ShimNode(name === "svg" ? "svg" : name);
    const attrStr = m ? m[2] : "";
    // 支持无值布尔属性（如 hidden）与带引号/裸值属性
    const attrRe = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g;
    let am;
    while ((am = attrRe.exec(attrStr))) {
      if (am[1] === "/" || am[1].length === 0) continue;
      el.setAttribute(am[1], decodeEntities(am[2] ?? am[3] ?? am[4] ?? ""));
    }
    const voidNoText = name === "script" || name === "style";
    top().insert ? insertInto(top(), el) : top().appendChild(el);
    if (!selfClose && !VOID_TAGS.has(name) && !voidNoText) stack.push(el);
    i = gt + 1;
  }
  function top() { return stack[stack.length - 1]; }
  function insertInto(container, el) { el.parentNode = null; container.childNodes.push(el); }
  function pushText(s) {
    if (s.length === 0) return;
    const t = new ShimText(decodeEntities(s));
    top().insert ? (t.parentNode = null, top().childNodes.push(t)) : top().appendChild(t);
  }
  return root.childNodes;
}

// ---------- 选择器匹配 ----------

function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** 复合选择器（含后代/子组合器）匹配。 */
export function matchesCompound(el, selector) {
  return splitSelectors(selector).some((s) => matchComplex(el, s));
}

function matchComplex(el, selector) {
  const parts = selector.split(/\s*(>)\s*|\s+/).filter((p) => p && p !== ">");
  // 重新生成带组合器类型的序列
  const seq = [];
  const re = /\s*([>])\s*|\s+/g;
  let last = 0, m;
  const pieces = [];
  while ((m = re.exec(selector))) {
    pieces.push({ sel: selector.slice(last, m.index).trim(), comb: m[1] ?? " " });
    last = re.lastIndex;
  }
  pieces.push({ sel: selector.slice(last).trim(), comb: null });
  const list = pieces.filter((p) => p.sel.length > 0);
  if (list.length === 0) return false;
  // 从最右段向前匹配
  let node = el;
  let idx = list.length - 1;
  if (!matchesSimple(node, list[idx].sel)) return false;
  idx -= 1;
  while (idx >= 0 && node) {
    const { sel, comb } = list[idx];
    if (comb === ">") {
      node = node.parentElement;
      if (!node || !matchesSimple(node, sel)) return false;
    } else {
      let anc = node.parentElement;
      while (anc) {
        if (matchesSimple(anc, sel)) { node = anc; break; }
        anc = anc.parentElement;
      }
      if (!anc) return false;
      node = anc;
    }
    idx -= 1;
  }
  return idx < 0;
}

/** 简单选择器（tag / .class / #id / * / 伪类:first-child/:last-child/:hover/:focus-within）。 */
function matchesSimple(el, selector) {
  // 拆成 [tag][#id][.class...][:pseudo...] 序列
  const tokens = selector.match(/^[a-zA-Z][a-zA-Z0-9-]*|[#.][a-zA-Z0-9_-]+|:[a-zA-Z-]+(\([^)]*\))?|\*/g) ?? [];
  if (tokens.join("") !== selector.replace(/\s+/g, "")) return false; // 不支持的选择器语法 → 不匹配（保守）
  let tag = null, id = null; const classes = []; const pseudos = [];
  for (const t of tokens) {
    if (t === "*") continue;
    else if (t.startsWith("#")) id = t.slice(1);
    else if (t.startsWith(".")) classes.push(t.slice(1));
    else if (t.startsWith(":")) pseudos.push(t.split("(")[0]);
    else tag = t.toLowerCase();
  }
  if (tag && tag !== "*" && el.tagName.toLowerCase() !== tag) return false;
  if (id && el.id !== id) return false;
  for (const c of classes) if (!el.classList.contains(c)) return false;
  for (const p of pseudos) {
    if (p === ":first-child") {
      const pe = el.parentElement;
      if (!pe || pe.children[0] !== el) return false;
    } else if (p === ":last-child") {
      const pe = el.parentElement;
      if (!pe || pe.children[pe.children.length - 1] !== el) return false;
    } else if (p === ":hover" || p === ":focus-within" || p === ":focus") {
      return false; // 静态 shim 不模拟交互态伪类
    }
  }
  return true;
}

// ---------- CSS 解析与级联 ----------

export function parseStylesheet(cssText) {
  const rules = [];
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const selectors = splitSelectors(m[1].trim());
    const decls = {};
    for (const kv of m[2].split(";")) {
      const i = kv.indexOf(":");
      if (i < 0) continue;
      const prop = kv.slice(0, i).trim().toLowerCase();
      const val = kv.slice(i + 1).trim();
      if (prop) decls[prop] = val;
    }
    for (const s of selectors) {
      let spec = [0, 0, 0];
      for (const t of s.match(/#[a-zA-Z0-9_-]+/g) ?? []) { spec[0] += 1; }
      for (const t of s.match(/\.[a-zA-Z0-9_-]+/g) ?? []) { spec[1] += 1; }
      for (const t of s.match(/(^|[\s>+~])[a-zA-Z][a-zA-Z0-9-]*/g) ?? []) { spec[2] += 1; }
      rules.push({ selector: s, declarations: decls, specificity: spec, order: rules.length });
    }
  }
  return rules;
}

const CSS_INITIAL = {
  "max-width": "none", "margin-left": "0", "margin-right": "0",
  "background-color": "transparent", "border-radius": "0", "border": "0",
  "align-items": "normal", "justify-content": "normal", "text-align": "left",
  "display": "inline", "width": "auto",
};

/** 解析 var(--x, fallback)：shim 无 VS Code 变量注入，一律取 fallback；无 fallback 取初始 null。 */
function resolveVar(value) {
  return value.replace(/var\(\s*--[^,)]+(?:,\s*([^)]*))?\)/g, (_m, fallback) => (fallback !== undefined ? fallback.trim() : ""));
}

export function computedStyle(el, rules) {
  const matched = [];
  for (const rule of rules) {
    if (matchComplex(el, rule.selector)) matched.push(rule);
  }
  matched.sort((a, b) => (a.specificity[0] - b.specificity[0]) || (a.specificity[1] - b.specificity[1]) || (a.specificity[2] - b.specificity[2]) || (a.order - b.order));
  const style = { ...CSS_INITIAL };
  for (const rule of matched) {
    for (let [prop, val] of Object.entries(rule.declarations)) {
      val = resolveVar(val);
      if (prop === "margin") {
        const parts = val.split(/\s+/);
        style["margin-top"] = parts[0];
        style["margin-right"] = parts[1] ?? parts[0];
        style["margin-bottom"] = parts[2] ?? parts[0];
        style["margin-left"] = parts[3] ?? parts[1] ?? parts[0];
      } else if (prop === "background") {
        // 简写展开：仅取颜色语义（首个非位置/重复关键字词组；本项目用法均为纯色/var 回退）
        style["background-color"] = val;
      } else if (prop === "border") {
        const parts = val.split(/\s+/);
        const w = parts.find((p) => /^\d+(\.\d+)?(px|em|rem|pt)$/.test(p));
        const s = parts.find((p) => /^(none|solid|dashed|dotted|double)$/.test(p));
        if (w) style["border-width"] = w;
        if (s) style["border-style"] = s;
        const colorParts = parts.filter((p) => p !== w && p !== s);
        if (colorParts.length) style["border-color"] = colorParts.join(" ");
        if (s === "none" || (!w && !s)) style["border"] = "0";
        else if (w) style["border"] = w;
      } else if (prop === "border-radius") {
        style[prop] = val;
      } else style[prop] = val;
    }
  }
  return style;
}

// ---------- document / window ----------

export class ShimDocument {
  constructor() {
    this.body = new ShimNode("body");
    this.documentElement = new ShimNode("html");
    this.documentElement.appendChild(this.body);
  }
  static activeElement = null;
  get activeElement() { return ShimDocument.activeElement; }
  createElement(tag) { return new ShimNode(tag); }
  createTextNode(data) { return new ShimText(data); }
  getElementById(id) {
    let found = null;
    walk(this.documentElement, (n) => { if (!found && n.nodeType === 1 && n.getAttribute("id") === id) found = n; });
    return found;
  }
  querySelector(sel) { return this.documentElement.querySelector(sel); }
  querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
  addEventListener(type, fn) { this.documentElement.addEventListener(type, fn); }
  dispatchEvent(ev) { return this.documentElement.dispatchEvent(ev); }
}

export class ShimMutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
}

export function installGlobals(doc, { onPostMessage } = {}) {
  const posted = [];
  const messageListeners = new Set();
  const vscodeApi = {
    postMessage(message) { posted.push(message); return true; },
    getState() { return null; },
    setState() {},
  };
  const windowObj = {
    addEventListener(type, fn) { if (type === "message") messageListeners.add(fn); },
    removeEventListener(type, fn) { messageListeners.delete(fn); },
    dispatchHostMessage(data) { for (const fn of [...messageListeners]) fn({ data }); },
  };
  const g = globalThis;
  g.document = doc;
  g.window = windowObj;
  g.ShimWindow = windowObj;
  g.MutationObserver = ShimMutationObserver;
  g.requestAnimationFrame = (cb) => { cb(0); return 0; };
  g.cancelAnimationFrame = () => {};
  g.acquireVsCodeApi = () => vscodeApi;
  g.Node = ShimNode;
  return { posted, vscodeApi, windowObj, dispatchHostMessage: windowObj.dispatchHostMessage };
}

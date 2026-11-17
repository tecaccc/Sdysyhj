// tc040.cjs ｜ NFR-03 ｜ Webview 渲染消毒（防 XSS）：PAYLOAD-XSS 7 载荷 × 4 断言
const { bootWebview, check, summary, BUILD } = require("./lib/common.cjs");

const PAYLOADS = [
  `<script>window.xss=1</script>`,
  `<img src=x onerror="window.xss=1">`,
  `[x](javascript:window.xss=1)`,
  `<a href="javascript:window.xss=1">x</a>`,
  `<iframe src="javascript:window.xss=1"></iframe>`,
  `<svg onload="window.xss=1"></svg>`,
  `[x](data:text/html,<script>window.xss=1</script>)`,
];

(async () => {
  // 渲染入口：webview/render/markdown.ts（FR 追溯表 FR-CHAT-02/NFR-03）
  const wv = bootWebview();
  global.window = wv.window;
  global.document = wv.document;
  const { renderMarkdown } = require(BUILD + "/markdown.cjs");

  for (let i = 0; i < PAYLOADS.length; i++) {
    const payload = PAYLOADS[i];
    const html = renderMarkdown(payload);
    console.log(`--- payload #${i + 1}: ${payload}`);
    console.log(`    rendered: ${html.replace(/\n/g, " ").slice(0, 300)}`);

    // 在 jsdom 活 DOM 中插入（同 webview innerHTML 路径）
    wv.window.xss = undefined;
    const host = wv.document.createElement("div");
    host.innerHTML = html;
    wv.document.body.appendChild(host);

    // (a) DOM 无 script 元素
    check(`XSS#${i + 1}(a) 无 script 元素`, host.querySelectorAll("script").length === 0);
    // (b) 无 on* 事件属性
    const onAttrs = [...host.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => /^on/i.test(n)));
    check(`XSS#${i + 1}(b) 无 on* 事件属性`, onAttrs.length === 0, onAttrs.join(","));
    // (c) href/src 无 javascript: 与 data:text/html 协议
    const badProto = [...host.querySelectorAll("[href],[src]")]
      .map((el) => el.getAttribute("href") || el.getAttribute("src") || "")
      .filter((v) => /^\s*(javascript:|data:text\/html)/i.test(v));
    check(`XSS#${i + 1}(c) href/src 无 javascript:/data:text/html`, badProto.length === 0, badProto.join(","));
    // (d) jsdom 中 window.xss 为 undefined（注入脚本未执行）
    check(`XSS#${i + 1}(d) window.xss === undefined（未执行）`, wv.window.xss === undefined, `window.xss=${wv.window.xss}`);
    host.remove();
  }

  summary("TC-040");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

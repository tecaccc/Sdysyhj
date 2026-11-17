// TC-003 ｜ FR-CHAT-02 ｜ Markdown 全要素结构渲染（fixture 断言，jsdom 查询）
const fs = require("fs");
const { check, summary, bootWebview, BUILD } = require("./lib/common.cjs");

const FIXTURE = `# 标题一

## 标题二

- 无序项 A
- 无序项 B

1. 有序项 1
2. 有序项 2

| 列1 | 列2 |
|---|---|
| 单元格1 | 单元格2 |

\`\`\`js
const hello = "world";
function foo() { return hello; }
\`\`\`

[链接](https://example.com/path) 与行内 \`inlineCode\`。
`;

(async () => {
  const wv = bootWebview();
  // 驱动 webview 渲染该 fixture（assistant 消息）
  wv.fromHost({ kind: "stream_start", messageId: "m1" });
  wv.fromHost({ kind: "text_delta", messageId: "m1", index: 0, delta: FIXTURE });
  wv.fromHost({
    kind: "message_final",
    messageId: "m1",
    message: { id: "m1", role: "assistant", blocks: [{ type: "text", text: FIXTURE }], timestamp: Date.now() },
  });
  await wv.sleep(400); // 等 300ms 节流重排

  const doc = wv.document;
  const md = doc.querySelector(".md");
  const html = md ? md.innerHTML : "(no .md)";
  console.log("--- 渲染产物样本（前 1200 字符）---");
  console.log(html.slice(0, 1200));

  check("TC-003-1 h1/h2", !!doc.querySelector(".md h1") && !!doc.querySelector(".md h2"));
  check("TC-003-2 ul>li", !!doc.querySelector(".md ul li"));
  check("TC-003-3 ol>li", !!doc.querySelector(".md ol li"));
  check("TC-003-4 table/thead/tbody/tr/td", !!doc.querySelector(".md table") && !!doc.querySelector(".md table thead tr") && !!doc.querySelector(".md table tbody tr td"));
  const code = doc.querySelector(".md pre code");
  check("TC-003-5 pre>code.language-js 且含语法高亮 token", !!code && /language-js/.test(code.className) && !!code.querySelector("[class*=hljs-]"), code ? code.className + " tokens=" + code.querySelectorAll("[class*=hljs-]").length : "none");
  check("TC-003-6 a[href^=https://]", !!doc.querySelector('.md a[href^="https://"]'));
  check("TC-003-7 行内 code", [...doc.querySelectorAll(".md code")].some((c) => c.textContent === "inlineCode"));

  summary("TC-003");
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

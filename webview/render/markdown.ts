// Markdown 渲染：marked + highlight.js 语言高亮 + DOMPurify 消毒（NFR-03 防 XSS）。

import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

marked.use({
  renderer: {
    code(token: { text: string; lang?: string }): string {
      const lang = (token.lang ?? "").split(/\s+/)[0];
      let body: string;
      let langClass = "";
      if (lang && hljs.getLanguage(lang)) {
        body = hljs.highlight(token.text, { language: lang }).value;
        langClass = ` language-${lang}`;
      } else {
        body = escapeHtml(token.text);
      }
      return `<pre class="code-block"><code class="hljs${langClass}">${body}</code></pre>\n`;
    },
    link(token: { href: string; title?: string | null; text: string }): string {
      const href = token.href ?? "";
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${escapeHtml(href)}"${title} rel="noopener noreferrer">${token.text}</a>`;
    },
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 渲染并消毒 Markdown → 安全 HTML。 */
export function renderMarkdown(text: string): string {
  let html: string;
  try {
    html = marked.parse(text, { async: false }) as string;
  } catch {
    html = `<pre>${escapeHtml(text)}</pre>`;
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "srcset"],
  });
}

export function escapeText(text: string): string {
  return escapeHtml(text);
}

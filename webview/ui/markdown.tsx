// Markdown 渲染（TASK-009 §10.14 D2）：MarkdownTextPrimitive + remark-gfm/remark-breaks +
// 渐进高亮（highlight.js lib/common 36 语言，§11 #23；Shiki 全系不引入）。
// XSS 口径（NFR-03 / FR-AUI-02④）：Markdown 主体 = react-markdown 构造性转义（rehype-raw 不引入
// = 无 raw HTML 通道）+ 默认 urlTransform 过滤危险协议 + 链接补 rel="noopener noreferrer"；
// 唯一受控 HTML sink = 本文件 SyntaxHighlighter 内 hljs 输出经 DOMPurify.sanitize 后
// dangerouslySetInnerHTML（与旧实现 webview/render/markdown.ts 同一消毒配置）——
// webview/ui/** HTML 注入系 API 禁令的唯一白名单点（ui-isolation 测试断言）。
// defer: true = 官方渐进解析（流式中间态可跳过、终稿必渲染，D4）。

import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { MarkdownTextPrimitive, type SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/** hljs 消毒配置（与旧 webview/render/markdown.ts renderMarkdown 同配置，同一消毒口径）。 */
function sanitizeHljs(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "srcset"],
  });
}

/** 代码块高亮适配器（§11 #19 SyntaxHighlighter 挂接契约）：hljs common 集内高亮、集外纯代码转义展示。 */
function SyntaxHighlighter({ components: { Pre, Code }, language, code }: SyntaxHighlighterProps): React.ReactElement {
  if (language && hljs.getLanguage(language)) {
    const html = sanitizeHljs(hljs.highlight(code, { language }).value);
    return (
      <Pre>
        <Code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
      </Pre>
    );
  }
  // 集外语言回退纯代码转义展示（与旧实现未收录语言行为同构，React 构造性转义）
  return (
    <Pre>
      <Code className="hljs">{code}</Code>
    </Pre>
  );
}

/** 文本 part 的 Markdown 渲染组件（MessagePrimitive.Content components.Text）。
 *  文本经 part 上下文读取（MarkdownTextPrimitive 既定机制）；smooth=false 对齐旧面板无打字动画口径。 */
export function MarkdownTextPart(_props: { text: string }): React.ReactElement {
  return <MarkdownTextPrimitive remarkPlugins={remarkPlugins} components={markdownComponents} defer smooth={false} />;
}

/** MarkdownTextPrimitive 挂接参数（remark 链 + 高亮适配器 + 链接加固；组件引用保持恒定）。 */
export const markdownComponents = {
  SyntaxHighlighter,
  a: ({ href, title, children }: { href?: string; title?: string | null; children?: React.ReactNode }): React.ReactElement => (
    <a href={href} title={title ?? undefined} rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/** remark 插件：mdast raw-HTML 节点降级为文本节点（D2 XSS 口径：无 raw HTML 通道，
 *  `<script>`/inline 事件探针等逐字渲染为文本节点；code 节点不受影响）。 */
export function remarkRawHtmlAsText(): (tree: { children?: unknown[] }) => void {
  return remarkRawHtmlAsTextTransformer();
}

function remarkRawHtmlAsTextTransformer(): (tree: { children?: unknown[] }) => void {
  const walk = (node: { children?: unknown[] }): void => {
    const children = node.children as Array<{ type: string; value?: string; children?: unknown[] }> | undefined;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === "html" && typeof child.value === "string") {
        children[i] = { type: "text", value: child.value };
      } else {
        walk(child);
      }
    }
  };
  return walk;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkPlugins = [remarkGfm, remarkBreaks, remarkRawHtmlAsText as any];

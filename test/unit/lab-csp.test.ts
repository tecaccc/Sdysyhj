// TASK-009 §10.13 D8 单测：实验面板 CSP 指令集断言（FR-AUI-05②，D5）。
// 方法：stub webview（{ cspSource, asWebviewUri }）真实调用 `@assistant-ui/vscode`
// renderWebviewHtml（strict 默认），解析 <meta http-equiv="Content-Security-Policy">，
// 断言指令集 = 官方模板（§11 #11/#12：default-src 'none'；script-src 仅 nonce——
// 'unsafe-eval' is never added；style-src nonce（strict）；connect-src ⊆ cspSource——
// fetch 隧道走 postMessage 不经网络（官方指南「bridge needs no connect-src」）；
// frame-src 'none'）。零新增指令/来源（相对默认面板差异逐一登记于设计 D5）。

import { describe, expect, it } from "vitest";
import { renderWebviewHtml } from "@assistant-ui/vscode/host";

const CSP_SOURCE = "https://test.vscode-cdn.net";

function renderLabHtml(): { html: string; csp: Map<string, string[]> } {
  const webview = {
    cspSource: CSP_SOURCE,
    asWebviewUri: (uri: { path: string }) => ({ toString: () => `vscode-webview-resource://test${uri.path}` }),
  };
  const html = renderWebviewHtml(webview, {
    scripts: [{ path: "/lab.js" }],
    styles: [{ path: "/lab.css" }],
    title: "聊天（实验）",
    lang: "zh-CN",
    surface: "sidebar",
    scriptType: "classic",
    nonce: "testnonce1234",
  });
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  expect(meta).not.toBeNull();
  // renderWebviewHtml 对属性值做 HTML 转义（' → &#39; 等）；解析前反转义
  const cspText = meta![1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const directives = new Map<string, string[]>();
  for (const directive of cspText.split("; ")) {
    const [name, ...values] = directive.split(" ");
    directives.set(name, values);
  }
  return { html, csp: directives };
}

describe("实验面板 CSP（FR-AUI-05②：default-src 'none' 基线 + 零新增指令）", () => {
  it("① default-src 'none'；script-src 仅 nonce（无 'unsafe-eval'/'unsafe-inline'——zod jitless 前提）", () => {
    const { csp } = renderLabHtml();
    expect(csp.get("default-src")).toEqual(["'none'"]);
    const scriptSrc = csp.get("script-src") ?? [];
    expect(scriptSrc).toHaveLength(1);
    expect(scriptSrc[0]).toMatch(/^'nonce-[A-Za-z0-9+/=_-]+'$/);
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("② style-src = cspSource + nonce（strict；无 'unsafe-inline'）", () => {
    const { csp } = renderLabHtml();
    expect(csp.get("style-src")).toEqual([CSP_SOURCE, `'nonce-testnonce1234'`]);
  });

  it("③ connect-src ⊆ cspSource（fetch 隧道走 postMessage 不经网络，不新增来源）", () => {
    const { csp } = renderLabHtml();
    expect(csp.get("connect-src")).toEqual([CSP_SOURCE]);
  });

  it("④ img-src/media-src = cspSource + blob: + data:（不添 https:）；font-src cspSource + data:；frame-src 'none'", () => {
    const { csp } = renderLabHtml();
    expect(csp.get("img-src")).toEqual([CSP_SOURCE, "blob:", "data:"]);
    expect(csp.get("media-src")).toEqual([CSP_SOURCE, "blob:", "data:"]);
    expect(csp.get("font-src")).toEqual([CSP_SOURCE, "data:"]);
    expect(csp.get("frame-src")).toEqual(["'none'"]);
  });

  it("⑤ 指令集面 = 官方模板八项，无额外指令；脚本带 nonce；surface 标记与标题落位", () => {
    const { html, csp } = renderLabHtml();
    expect([...csp.keys()].sort()).toEqual(
      ["connect-src", "default-src", "font-src", "frame-src", "img-src", "media-src", "script-src", "style-src"].sort()
    );
    expect(html).toContain('<script defer nonce="testnonce1234" src="vscode-webview-resource://test/lab.js"></script>');
    expect(html).toContain('data-aui-vscode-surface="sidebar"');
    expect(html).toContain("<title>聊天（实验）</title>");
  });
});

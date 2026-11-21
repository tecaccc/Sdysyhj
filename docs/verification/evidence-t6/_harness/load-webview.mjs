// 公共装载器：从被测源码静态提取 chatPanel HTML 模板 → 解析为 shim DOM → 装载 webview bundle。
import fs from "node:fs";
import { ShimDocument, parseHTML, installGlobals } from "./domshim.mjs";

export function extractChatPanelBodyHtml() {
  const src = fs.readFileSync("/tmp/verify-t6/src/panel/chatPanel.ts", "utf8");
  const start = src.indexOf("<body>");
  const end = src.indexOf("</body>");
  if (start < 0 || end < 0) throw new Error("chatPanel.ts 中未找到 <body> 模板");
  return src.slice(start + "<body>".length, end);
}

export async function loadWebview() {
  const doc = new ShimDocument();
  const nodes = parseHTML(extractChatPanelBodyHtml());
  for (const n of nodes) doc.body.appendChild(n);
  const { posted, dispatchHostMessage } = installGlobals(doc);
  // 装载被测 bundle（真实 webview/main.ts 产物；dompurify 透传 stub 已披露）。
  // 以全局 eval 执行源码而非 import：绕过 ESM 模块缓存，支持同进程多实例（TC-059 重载场景）。
  const src = fs.readFileSync(new URL("./webview-bundle.js", import.meta.url), "utf8");
  (0, eval)(src);
  return { doc, posted, dispatchHostMessage };
}

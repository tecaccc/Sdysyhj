// 构建核验驱动对象（esbuild，只读被测检出）：
// 1) webview bundle（IIFE）：dompurify 以透传 stub 替换（消毒本身非本轮断言面，TC-040 范围外；如实披露）；
// 2) bridge bundle（CJS）：piBridge 独立打包供 fake client 驱动。
import { build } from "/tmp/verify-t6/node_modules/esbuild/lib/main.js";

const dompurifyStub = `
export default { sanitize: (html) => html };
export const sanitize = (html) => html;
`;

const stubPlugin = {
  name: "verify-dompurify-stub",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^dompurify$/ }, () => ({
      path: "dompurify-stub", namespace: "verify-stub",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "verify-stub" }, () => ({
      contents: dompurifyStub, loader: "js",
    }));
  },
};

await build({
  entryPoints: ["/tmp/verify-t6/webview/main.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: "/tmp/t6harness/webview-bundle.js",
  plugins: [stubPlugin],
  logLevel: "error",
});

await build({
  entryPoints: ["/tmp/verify-t6/src/bridge/piBridge.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: "/tmp/t6harness/piBridge-bundle.cjs",
  logLevel: "error",
});

console.log("built: webview-bundle.js (iife, dompurify=stub), piBridge-bundle.cjs (node cjs)");

await build({
  entryPoints: ["/tmp/verify-t6/webview/render/commandMenu.ts"],
  bundle: true, format: "cjs", platform: "node",
  outfile: "/tmp/t6harness/commandMenu-bundle.cjs", logLevel: "error",
});
await build({
  entryPoints: ["/tmp/verify-t6/webview/render/format.ts"],
  bundle: true, format: "cjs", platform: "node",
  outfile: "/tmp/t6harness/format-bundle.cjs", logLevel: "error",
});
console.log("built: commandMenu-bundle.cjs, format-bundle.cjs");

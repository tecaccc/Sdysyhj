// /tmp/r2harness/build.mjs —— 将被测仓库源码打包为 /tmp 可驱动的 CJS/IIFE（只读，不改仓库）。
import { build } from "/tmp/sdysyhj-verify-r2/node_modules/esbuild/lib/main.js";

const SRC = "/tmp/sdysyhj-verify-r2";
const OUT = "/tmp/r2harness/build";
const common = {
  bundle: true,
  platform: "node",
  sourcemap: false,
  logLevel: "warning",
  loader: { ".css": "empty" },
};

await build({ ...common, entryPoints: [`${SRC}/src/extension.ts`], outfile: `${OUT}/extension.cjs`, format: "cjs", external: ["vscode"] });
await build({ ...common, entryPoints: [`${SRC}/src/bridge/piBridge.ts`], outfile: `${OUT}/piBridge.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/src/bridge/rpcClient.ts`], outfile: `${OUT}/rpcClient.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/src/bridge/rpcTransport.ts`], outfile: `${OUT}/rpcTransport.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/src/session/sessionStore.ts`], outfile: `${OUT}/sessionStore.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/src/panel/chatPanel.ts`], outfile: `${OUT}/chatPanel.cjs`, format: "cjs", external: ["vscode"] });
await build({ ...common, entryPoints: [`${SRC}/src/util/text.ts`], outfile: `${OUT}/text.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/src/util/redact.ts`], outfile: `${OUT}/redact.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/webview/render/markdown.ts`], outfile: `${OUT}/markdown.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/webview/render/messages.ts`], outfile: `${OUT}/render-messages.cjs`, format: "cjs" });
await build({ ...common, entryPoints: [`${SRC}/webview/main.ts`], outfile: `${OUT}/webview-main.iife.js`, format: "iife" });
console.log("build OK:", OUT);

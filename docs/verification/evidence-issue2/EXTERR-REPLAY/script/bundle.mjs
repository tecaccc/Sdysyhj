// 独立核验 bundle 构建：从被测标签 src 打包 PiBridge+RpcClient（不依赖仓库 test/ 与 vitest）
import { build } from "/tmp/verify-issue2/node_modules/esbuild/lib/main.js";
await build({
  entryPoints: ["/tmp/vh-issue2/entry.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "/tmp/vh-issue2/piBridge-bundle.cjs",
  logLevel: "info",
});

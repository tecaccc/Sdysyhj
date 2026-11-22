// vitest 配置：'vscode' 模块解析桩（宿主代码 import "vscode" 由 VS Code 运行时提供，
// 测试加载 chatPanel.ts 等模块时经 alias 落 test/helpers/vscode-stub.ts）。
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "test/helpers/vscode-stub.ts"),
    },
  },
});

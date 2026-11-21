// zod jitless 前置（FR-AUI-05②，TASK-009 §10.13 D6 三件套之一）。
// 官方指南 assistant-ui.com/docs/guides/vscode「Add to an existing extension」原片段：
//   import { config } from "zod";
//   config({ jitless: true });
// 须在任何 zod schema 构建之前导入——本文件必须是 webview/lab/main.tsx 的首个 import
// （lab-isolation/lab-versions 测试对该顺序与产物内顺序做源断言）。
// 依据：CSP 下禁 eval（default-src 'none' + 仅 nonce script），zod jit 模式走 new Function 不兼容。

import { config } from "zod";

config({ jitless: true });

export {}; // 纯副作用模块

// 测试 Agent 独立重放入口（核验 Issue #2 / #D-03）
// 仅 re-export 被测标签源码中的 PiBridge/RpcClient，esbuild 打 CJS bundle 驱动。
export { PiBridge } from "/tmp/verify-issue2/src/bridge/piBridge";
export { RpcClient } from "/tmp/verify-issue2/src/bridge/rpcClient";

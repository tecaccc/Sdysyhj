// 核验用打包入口：仅导出被测模块（PiBridge/RpcClient/SessionFileWatcher/MemoryLogger），
// 由被测仓库的 esbuild 打为 CJS bundle，供 /tmp 独立驱动脚本 require。
// 不含任何断言逻辑（断言全部在驱动脚本内）。
export { PiBridge } from "/tmp/verify-issue1/src/bridge/piBridge";
export { RpcClient } from "/tmp/verify-issue1/src/bridge/rpcClient";
export { SessionFileWatcher } from "/tmp/verify-issue1/src/session/sessionStore";
export { MemoryLogger } from "/tmp/verify-issue1/src/util/log";

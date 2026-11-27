// TASK-011 批次 H（Issue #13 / R-15 / P-08）：对端漂移监视固化——锁定版本 × 最低支持版本下界一致性。
// 纪律（任务单口径）：
//   - 网络查询不做（测试离线稳定）：周期轮 npm view 漂移比对是螺旋循环（人类/调度）职责，不入测试；
//     本测试只锁「package.json 锁定版本 ≥ MIN_SUPPORTED_PI_VERSION」下界一致性（零网络、确定性）。
//   - 黄线（不红，人类裁决）：MIN_SUPPORTED 与锁定值差距 >2 个 minor 时 console.warn 提示——
//     下界过旧可能掩盖对端契约漂移；是否抬高 MIN_SUPPORTED 由人类在螺旋周期裁决（不自动判定、不红）。
// 版本解析复用生产实现（src/bridge/rpcTransport.ts isVersionAtLeast，与 resolvePiRuntime「可用 pi」
// 判据同一函数——测试锁的即生产用的比较器）。

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { MIN_SUPPORTED_PI_VERSION, isVersionAtLeast } from "../../src/bridge/rpcTransport";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PI_SPEC = "@earendil-works/pi-coding-agent";

/** 读 package.json 的 pi 锁定声明（dependencies 优先，devDependencies 兜底；剥 ^/~ 前缀）。 */
function lockedPiVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const spec = pkg.dependencies?.[PI_SPEC] ?? pkg.devDependencies?.[PI_SPEC];
  expect(spec, `package.json 须声明 ${PI_SPEC}（锁定版本读取来源）`).toBeDefined();
  const match = String(spec).match(/^[\^~]?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
  expect(match, `${PI_SPEC} 声明须为可解析的（点分）版本：实际 ${String(spec)}`).not.toBeNull();
  return match![1];
}

function parseMajorMinor(version: string): { major: number; minor: number } {
  const [major, minor] = version.split(".");
  return { major: Number(major), minor: Number(minor) };
}

describe("对端漂移监视固化（TASK-011 H / Issue #13 R-15 / P-08）", () => {
  it("锁定版本 ≥ MIN_SUPPORTED_PI_VERSION（下界一致性；离线零网络，周期轮漂移比对不入测试）", () => {
    const locked = lockedPiVersion();

    // 黄线（不红，人类裁决）：MIN_SUPPORTED 与锁定值差距 >2 个 minor → 运行时提示留痕；
    // 跨 major 时 minor 差不可比，按「必超 2 个 minor」处理（如锁定 1.x vs 下界 0.8x）。
    const lockedMm = parseMajorMinor(locked);
    const minMm = parseMajorMinor(MIN_SUPPORTED_PI_VERSION);
    const gap = lockedMm.major === minMm.major ? lockedMm.minor - minMm.minor : Number.POSITIVE_INFINITY;
    if (gap > 2) {
      console.warn(
        `[pi-peer-version] 黄线（不红，人类裁决）：MIN_SUPPORTED_PI_VERSION=${MIN_SUPPORTED_PI_VERSION} 与锁定版本 ${locked}` +
          `（package.json ${PI_SPEC}）差距超过 2 个 minor——下界可能过旧，或掩盖对端契约漂移；` +
          `请在螺旋周期以 npm view ${PI_SPEC} versions 离线外人工比对后裁决是否抬高下界。`
      );
    }

    // 下界一致性（红线）：锁定版本必须不低于插件声明的最低支持版本——
    // 否则打包的内置运行时低于自身判据，resolvePiRuntime 版本门槛自相矛盾。
    expect(isVersionAtLeast(locked, MIN_SUPPORTED_PI_VERSION)).toBe(true);
  });
});

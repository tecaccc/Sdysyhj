// TC-096 对比报告交付与规格断言（FR-AUI-06）——核验 Agent 自建结构扫描。
// 扫描面 = docs/technical-design.md §10.13 末尾「阶段①双切片对比报告（交付填写）」小节（规范 §5.2 扫描纪律）。
// (a) 四维各成节 ①bundle 体积 ②时延（≥5 次中位）③侵入面三组归类（docs 另列信息组、冻结组须为空）
// (b) 量化维附复现命令+输出  (c) 结论中立（预设路线句式零命中 + 路线选择归属声明）  (d) 升级评估留痕
import fs from "fs";

const root = process.argv[2] ?? process.cwd();
const doc = fs.readFileSync(`${root}/docs/technical-design.md`, "utf8");
const start = doc.indexOf("#### 阶段①双切片对比报告（交付填写");
const end = doc.indexOf("\n## 11.", start);
if (start < 0 || end < 0) { console.log("FAIL  报告小节未定位"); process.exit(1); }
const sec = doc.slice(start, end);
console.log(`INFO  报告小节 ${sec.split("\n").length} 行（offset ${start}..${end}）`);

let fails = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
  if (!cond) fails++;
};

console.log("== (a) 四维各成节 ==");
ok(/①\s*bundle\s*体积/.test(sec), "① bundle 体积成节");
ok(/②\s*首帧\/首消息渲染时延|②\s*首帧\/首消息时延/.test(sec), "② 时延成节");
ok(/③\s*代码侵入面/.test(sec), "③ 代码侵入面成节");
ok(/④\s*PiBridge\s*事件契合度/.test(sec), "④ PiBridge 事件契合度成节");
ok(/×\s*7\s*取中位|×7\s*取中位|≥5\s*次取中位/.test(sec), "② 时延 ≥5 次取中位声明", sec.match(/×\s*\d+\s*取中位/)?.[0] ?? "");
ok(/默认面板冻结文件（须为空）/.test(sec) && /（无\s*✓\s*）|\*\*（无/.test(sec), "③ 冻结组呈现且为空");
ok(/共享文件增量/.test(sec) && /新增文件/.test(sec), "③ 共享增量组 + 新增组归类呈现");
ok(/信息组（不计入）/.test(sec) && /docs\/\*\*/.test(sec), "③ docs/** 另列信息组（不计侵入面）");
ok(/流式\s*delta/.test(sec) && /user\s*回声/.test(sec) && /steer\/followUp/.test(sec) && /abort/.test(sec), "④ 四主题逐路线填写（流式 delta/user 回声/steer·followUp/abort）");

console.log("== (b) 证据即事实（量化维附命令+输出） ==");
ok(/node test\/tooling\/lab-metrics\.mjs --baseline v0\.1\.6 --runs 7/.test(sec), "①②③ 复现命令附于报告（lab-metrics --baseline v0.1.6 --runs 7）");
ok(/1,157,559\s*B/.test(sec) && /368,758/.test(sec) && /3,145,728/.test(sec) && /1,048,576/.test(sec), "① 字节级数据与预算值在文");
ok(/T1|T2/.test(sec) && /\d+\.\d+\s*ms/.test(sec), "② T1/T2 数值在文");
ok(/git diff --stat/.test(sec), "③ git diff --stat 口径在文");

console.log("== (c) 结论中立 ==");
const biased = [...sec.matchAll(/(选定|决定采用|切换至|选择路线\s*[AB]|采用路线\s*[AB]|最终选用)/g)];
ok(biased.length === 0, "预设路线选择类句式零命中", biased.length ? biased.map((m) => m[0]).join(",") : "零命中");
ok(/路线选择.*总调度.*阶段①出口|裁决权\s*=\s*总调度/.test(sec), "路线选择归属声明（= 总调度阶段①出口裁决）");

console.log("== (d) 升级策略留痕 ==");
ok(/升级评估/.test(sec) && /0\.0\.x\s*无\s*semver\s*兼容承诺/.test(sec), "0.0.x 升级风险评估节在文（breaking 面）");
ok(/退出/.test(sec) && /删除注册与依赖/.test(sec), "退出流程在文（增量代码可回退）");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);

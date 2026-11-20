// 负对照（negative control）：验证 T5 harness 对 #D-04 缺陷的检出灵敏度。
// 取生产 bundle 的 /tmp 副本，删除 finalize() 内的 blocks 回填（即 #D-04 修复行），
// 模拟修复前实现 → 重跑 TC-052 场景，期望 (b)/(c) FAIL（卡片恒“进行中”）。
// 仅改动 /tmp 副本，不触碰被测仓库。
"use strict";
const fs = require("fs");
const src = fs.readFileSync("/tmp/verify-t5/media/main.js", "utf8");
const lines = src.split("\n");
// finalize() 内的回填行（bundle 行 18187，1-based）：上下文校验防误删
const idx = 18187 - 1;
const expect = lines[idx].trim() === "this.blocks.set(index, view);" ? idx : lines.findIndex((l, i) => i > 18150 && l.trim() === "this.blocks.set(index, view);" && lines[i - 1].trim() === "this.bodyEl.appendChild(view.root);");
if (expect < 0) {
  console.error("NEGATIVE-CONTROL: 未定位到 finalize 回填行");
  process.exit(2);
}
// 删除该行并以注释留痕（语法安全）
lines[expect] = "/* t5-negative-control: blocks 回填已移除（模拟 #D-04 修复前） */";
fs.writeFileSync("/tmp/t5harness/main.negctl.js", lines.join("\n"));
console.log(`NEGATIVE-CONTROL bundle 写入 /tmp/t5harness/main.negctl.js（移除行 ${expect + 1}）`);

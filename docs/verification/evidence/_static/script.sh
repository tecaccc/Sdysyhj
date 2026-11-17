#!/bin/bash
# t_static.sh —— test-cases.md 给定 manifest 静态断言脚本（原文执行）。
# 覆盖：TC-009(1) TC-016(1) TC-021(1) TC-026(1) TC-030 TC-042(1)
set -u
cd /tmp/sdysyhj-verify || exit 2
FAIL=0
section() { echo; echo "===== $1 ====="; }

section "TC-009 step1: abort command registered"
node -e 'const p=require("./package.json");const s=JSON.stringify(p.contributes&&p.contributes.commands||[]).toLowerCase();if(!/abort|中止/.test(s)){console.error("MISSING abort command");process.exit(1)}console.log("OK: abort command registered")' || FAIL=1

section "TC-016 step1: new session command registered"
node -e 'const p=require("./package.json");const s=JSON.stringify(p.contributes&&p.contributes.commands||[]).toLowerCase();if(!/new session/.test(s)){console.error("MISSING new session command");process.exit(1)}console.log("OK: new session command registered")' || FAIL=1

section "TC-021 step1: no multi-session commands"
node -e 'const p=require("./package.json");const s=JSON.stringify(p.contributes||{}).toLowerCase();if(/tab session|split session|new window session|多会话/.test(s)){console.error("FOUND multi-session capability");process.exit(1)}console.log("OK: no multi-session commands")' || FAIL=1

section "TC-026 step1: context menus registered"
node -e 'const p=require("./package.json");const m=JSON.stringify((p.contributes&&p.contributes.menus)||{});if(!/发送到 pi|send to pi/i.test(m)){console.error("MISSING context menu entry");process.exit(1)}if(!/"explorer\/context"|\"editor\/context\"/.test(m)){console.error("MISSING explorer/editor context menu group");process.exit(1)}console.log("OK: context menus registered")' || FAIL=1

section "TC-030: 5 commands registered"
node -e '
const p=require("./package.json");
const cmds=(p.contributes&&p.contributes.commands||[]).map(c=>(c.command+" "+c.title).toLowerCase()).join("\n");
const need=["open chat","new session","abort","show session history","report issue"];
const miss=need.filter(t=>!cmds.includes(t));
if(miss.length){console.error("MISSING commands: "+miss.join(", "));process.exit(1)}
console.log("OK: 5 commands registered");
' || FAIL=1

section "TC-030 (supp): Command Palette menu visibility (manifest 检查)"
node -e '
const p=require("./package.json");
const menus=(p.contributes&&p.contributes.menus)||{};
console.log("menus keys:", Object.keys(menus).join(", "));
if (menus["Command Palette"]) { console.log("OK: Command Palette visibility declared"); process.exit(0); }
console.log("NOTE: no explicit contributes.menus[\"Command Palette\"] — 所有 contributes.commands 默认对命令面板可见（VS Code 平台默认行为），以 TC-045/命令调用佐证");
' || FAIL=1

section "TC-042 step1: engines.vscode >= 1.85"
node -e 'const p=require("./package.json");const v=(p.engines&&p.engines.vscode||"").replace(/[^\d.]/g,"");const [M,m]=v.split(".").map(Number);if(!v||M<1||(M===1&&m<85)){console.error("engines.vscode < 1.85: "+p.engines.vscode);process.exit(1)}console.log("OK engines.vscode="+p.engines.vscode)' || FAIL=1

section "TC-042 step2: 打包清单（vsce 可用性探测）"
if npx --no-install vsce --version >/dev/null 2>&1; then
  npx --no-install vsce ls || FAIL=1
else
  echo "vsce NOT available offline (npx --no-install fails) — 记入遗留问题（离线环境无法执行 vsce ls）；以 .vscodeignore + 依赖清单静态核对代替"
  echo "--- .vscodeignore ---"; cat .vscodeignore
  echo "--- 原生依赖探测（应为空）---"
  node -e 'const p=require("./package.json");const deps=Object.keys({...p.dependencies,...p.devDependencies});const native=deps.filter(d=>/node-gyp|prebuild|binding|native|-cpp/i.test(d));console.log("deps:",deps.join(","));console.log("native-ish deps:",native.length?native.join(","):"(none)")'
fi

echo
echo "STATIC RESULT: FAIL=$FAIL"
exit $FAIL

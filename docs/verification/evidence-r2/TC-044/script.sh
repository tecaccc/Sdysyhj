#!/bin/bash
# t_files041.sh ｜ TC-041 ｜ 会话数据仅存 pi 原有位置（不另建副本）
set -u
export HOME="$(mktemp -d)"
export MOCKLOG="$(mktemp -d)"
export WORKSPACE=/tmp/sdysyhj-verify-r2
export PATH="/tmp/r2harness/bin:$PATH"
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
mkdir -p /tmp/r2harness/wsA
echo "[env] HOME=$HOME MOCKLOG=$MOCKLOG"

find "$HOME" -type f | sort > "$MOCKLOG/home-before.txt"
find "$WORKSPACE" -mindepth 1 | sort > "$MOCKLOG/ws-before.txt"

# 全场景（TC-041 步骤：verify:integration + 会话产生场景 SC-016/017/018 等价驱动）
cd "$WORKSPACE"
npm run verify:integration > "$MOCKLOG/logs-integration.txt" 2>&1 || echo "integration exit=$?"
node /tmp/r2harness/tc_sess.cjs 016 > /dev/null 2>&1 || echo "tc016 exit=$?"
node /tmp/r2harness/tc_sess.cjs 017 > /dev/null 2>&1 || echo "tc017 exit=$?"
node /tmp/r2harness/tc_sess.cjs 018 > /dev/null 2>&1 || echo "tc018 exit=$?"
node /tmp/r2harness/tc_sess.cjs 046 > /dev/null 2>&1 || echo "tc046 exit=$?"

find "$HOME" -type f | sort > "$MOCKLOG/home-after.txt"
find "$WORKSPACE" -mindepth 1 | sort > "$MOCKLOG/ws-after.txt"

echo "--- HOME 新增文件（应仅 \$HOME/.pi/ 内）---"
comm -13 "$MOCKLOG/home-before.txt" "$MOCKLOG/home-after.txt"
echo "--- HOME 违规检查 ---"
if comm -13 "$MOCKLOG/home-before.txt" "$MOCKLOG/home-after.txt" | grep -v '^'"$HOME"'/\.pi/' | grep -q .; then
  echo "FAIL: stray files in HOME"
else
  echo "OK"
fi
echo "--- WORKSPACE 新增文件（应仅 .vscode/ 内）---"
comm -13 "$MOCKLOG/ws-before.txt" "$MOCKLOG/ws-after.txt"
echo "--- WORKSPACE 违规检查 ---"
if comm -13 "$MOCKLOG/ws-before.txt" "$MOCKLOG/ws-after.txt" | grep -v '/\.vscode/' | grep -q .; then
  echo "FAIL: stray files in workspace"
else
  echo "OK"
fi

# ---- TC-044 ｜ 卸载/停用无残留（已执行 TC-041 全场景后扫描隐藏文件）----
echo
echo "===== TC-044 隐藏文件扫描 ====="
echo "--- HOME 隐藏文件（豁免 \$HOME/.pi）---"
find "$HOME" -path "$HOME/.pi" -prune -o -name '.*' -print
echo "--- WORKSPACE 隐藏文件（豁免 .vscode）---"
find "$WORKSPACE" -path "$WORKSPACE/.vscode" -prune -o -name '.*' -print
echo "（两段输出均应仅有目录本身/空）"

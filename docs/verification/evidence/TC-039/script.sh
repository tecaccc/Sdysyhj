#!/bin/bash
# t_tc039.sh ｜ TC-039 ｜ 日志脱敏（哨兵凭证全局扫描）
set -u
export HOME="$(mktemp -d)"
export MOCKLOG="$(mktemp -d)"
export WORKSPACE=/tmp/sdysyhj-verify
export SENTINEL="PI_TEST_SENTINEL_7f3a9c21"
export PATH="/tmp/vharness/bin:$PATH"
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
mkdir -p "$MOCKLOG/logs" "$HOME/.pi/agent"

echo "[env] HOME=$HOME MOCKLOG=$MOCKLOG SENTINEL=$SENTINEL"

# 1. 注入哨兵假凭证
printf '{"api_key":"%s"}\n' "$SENTINEL" > "$HOME/.pi/agent/auth.json"
echo "--- auth.json（注入点，豁免扫描）---"; cat "$HOME/.pi/agent/auth.json"

# 2. 触发尽量多的日志路径
cd "$WORKSPACE"
npm run verify:unit > "$MOCKLOG/logs/unit.txt" 2>&1 && echo "verify:unit exit=0" || echo "verify:unit exit=$?"
npm run verify:integration > "$MOCKLOG/logs/integration.txt" 2>&1 && echo "verify:integration exit=0" || echo "verify:integration exit=$?"
node /tmp/vharness/tc039-battery.cjs > "$MOCKLOG/logs/battery.txt" 2>&1 && echo "battery exit=0" || echo "battery exit=$?"

# 3. 脱敏断言（test-cases TC-039 原文命令口径）
echo "--- rg 扫描开始（期望无命中，rg exit=1）---"
set +e
rg -F "$SENTINEL" "$MOCKLOG" "$WORKSPACE" --hidden -g '!node_modules' -g '!*auth.json' -g '!docs/verification/**'
RG_EXIT=$?
set -e
echo "rg exit=$RG_EXIT（1=无命中）"
echo "--- 同时扫描 /tmp/vharness 构建产物与脚本目录（豁免 run.sh 注入点与本脚本）---"
set +e
rg -F "$SENTINEL" /tmp/vharness -g '!run.sh' -g '!t_tc039.sh'
RG2_EXIT=$?
set -e
echo "rg2 exit=$RG2_EXIT（1=无命中）"
echo "--- 脱敏痕迹（期望命中 [REDACTED]）---"
rg -o 'api_key.{0,6}\[REDACTED\]' "$MOCKLOG/logs" | head -5

if [ "$RG_EXIT" -eq 1 ] && [ "$RG2_EXIT" -eq 1 ]; then
  echo "TC-039 RESULT: PASS（哨兵零命中）"
else
  echo "TC-039 RESULT: FAIL（存在哨兵明文）"
fi

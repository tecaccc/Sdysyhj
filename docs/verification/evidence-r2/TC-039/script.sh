#!/bin/bash
# t_tc039.sh ｜ TC-039 ｜ 日志脱敏（随机哨兵凭证全局扫描，test-cases v0.2 口径）
# 断言对象仅限被测产物/日志（构建产物、Output Channel 转储、会话/状态文件）；
# docs/ 为哨兵定义源显式排除；auth.json 为凭证注入点豁免。
set -u
export HOME="$(mktemp -d)"
export MOCKLOG="$(mktemp -d)"
export WORKSPACE=/tmp/sdysyhj-verify-r2
export SENTINEL="PI_TEST_SENTINEL_$(head -c8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export PATH="/tmp/r2harness/bin:$PATH"
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
mkdir -p "$MOCKLOG/logs" "$HOME/.pi/agent"

echo "[env] HOME=$HOME MOCKLOG=$MOCKLOG SENTINEL=$SENTINEL"

# 1. 注入哨兵假凭证（凭证注入点，豁免扫描）
printf '{"api_key":"%s"}\n' "$SENTINEL" > "$HOME/.pi/agent/auth.json"
echo "--- auth.json（注入点，豁免扫描）---"; cat "$HOME/.pi/agent/auth.json"

# 2. 触发尽量多的日志路径
cd "$WORKSPACE"
npm run verify:unit > "$MOCKLOG/logs/unit.txt" 2>&1 && echo "verify:unit exit=0" || echo "verify:unit exit=$?"
npm run verify:integration > "$MOCKLOG/logs/integration.txt" 2>&1 && echo "verify:integration exit=$?" || echo "verify:integration exit=$?"
node /tmp/r2harness/tc039-battery.cjs > "$MOCKLOG/logs/battery.txt" 2>&1 && echo "battery exit=0" || echo "battery exit=$?"

# 3. 脱敏断言（被测产物/日志扫描：Output Channel 转储、会话/状态文件、构建产物）
echo "--- 扫描 1：\$MOCKLOG 日志/转储 + \$HOME/.pi 会话/状态（豁免 auth.json 注入点）---"
set +e
rg -F "$SENTINEL" "$MOCKLOG" "$HOME/.pi" --hidden -g '!*auth.json'
RG1=$?
set -e
echo "rg1 exit=$RG1（1=零命中）"

echo "--- 扫描 2：\$WORKSPACE 构建产物（dist/out/build/media）---"
set +e
for d in "$WORKSPACE/dist" "$WORKSPACE/out" "$WORKSPACE/build" "$WORKSPACE/media"; do
  [ -e "$d" ] || continue
  rg -F "$SENTINEL" "$d" --hidden
  echo "  [$d] rg exit=$?"
done
set -e

echo "--- 扫描 3：核验构建产物/驱动脚本目录 /tmp/r2harness（豁免本脚本与 run.sh 注入点）---"
set +e
rg -F "$SENTINEL" /tmp/r2harness -g '!run.sh' -g '!t_tc039.sh'
RG3=$?
set -e
echo "rg3 exit=$RG3（1=零命中）"

echo "--- 脱敏痕迹（期望命中 [REDACTED]）---"
rg -o 'api_key.{0,6}\[REDACTED\]' "$MOCKLOG/logs" | head -5

if [ "$RG1" -eq 1 ] && [ "$RG3" -eq 1 ]; then
  echo "TC-039 RESULT: PASS（被测产物/日志中哨兵零命中）"
else
  echo "TC-039 RESULT: FAIL（存在哨兵明文）"
fi

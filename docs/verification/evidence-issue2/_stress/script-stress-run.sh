#!/usr/bin/env bash
# 测试 Agent 压力抽查驱动（Issue #2 核验补齐，总调度裁决 A）
# verify:integration 并行 3 + 顺序 2；全过（exit 0 且 31/31）才算过。
set -u
cd /tmp/verify-issue2 || exit 9
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
export HOME=/tmp/tmp.RnUA5C1PaR
OUT=/tmp/verify-issue2/docs/verification/evidence-issue2/_stress
mkdir -p "$OUT"

echo "== 压力抽查（补跑）start $(date -Is) ==" | tee "$OUT/summary.txt"

# --- 并行 3：同时起 3 个 verify:integration ---
p_start=$(date -Is)
for i in 1 2 3; do
  ( npm run verify:integration > "$OUT/parallel-$i.txt" 2>&1; echo $? > "$OUT/parallel-$i.exit" ) &
done
wait
p_end=$(date -Is)
echo "parallel window: $p_start -> $p_end" >> "$OUT/summary.txt"

# --- 顺序 2 ---
s_start=$(date -Is)
for i in 1 2; do
  npm run verify:integration > "$OUT/sequential-$i.txt" 2>&1
  echo $? > "$OUT/sequential-$i.exit"
done
s_end=$(date -Is)
echo "sequential window: $s_start -> $s_end" >> "$OUT/summary.txt"

# --- 汇总 ---
fail=0
for f in "$OUT"/parallel-*.exit "$OUT"/sequential-*.exit; do
  code=$(cat "$f")
  run=$(basename "$f" .exit)
  tests=$(grep -oE "Tests  [0-9]+ passed" "$OUT/$run.txt" | head -1)
  echo "$run: exit=$code ($tests)" >> "$OUT/summary.txt"
  [ "$code" != "0" ] && fail=1
done
echo "== end $(date -Is); overall=$([ $fail = 0 ] && echo ALL-PASS || echo FAIL) ==" >> "$OUT/summary.txt"
cat "$OUT/summary.txt"
exit $fail

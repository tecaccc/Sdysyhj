#!/bin/bash
# /tmp/r2harness/run.sh —— 统一 ENV-SETUP 运行器（隔离 HOME/MOCKLOG，清除宿主 pi agent 注入的 PI_CODING_AGENT_*）
export HOME="${VHOME:-$(mktemp -d)}"
export MOCKLOG="${VLOG:-$(mktemp -d)}"
export WORKSPACE=/tmp/sdysyhj-verify-r2
export SENTINEL="${SENTINEL:-PI_TEST_SENTINEL_$(head -c8 /dev/urandom | od -An -tx1 | tr -d " \n")}"   # 哨兵执行时随机生成（test-cases v0.2 ENV-SETUP）
export PATH="/tmp/r2harness/bin:$PATH"
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
mkdir -p /tmp/r2harness/wsA /tmp/r2harness/wsB
echo "[env] HOME=$HOME MOCKLOG=$MOCKLOG SCENARIO=${MOCK_SCENARIO:-stream} ARGS=$*"
exec node "$@"

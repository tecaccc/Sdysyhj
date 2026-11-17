#!/bin/bash
# /tmp/vharness/run.sh —— 统一 ENV-SETUP 运行器（隔离 HOME/MOCKLOG，清除宿主 pi agent 注入的 PI_CODING_AGENT_*）
export HOME="${VHOME:-$(mktemp -d)}"
export MOCKLOG="${VLOG:-$(mktemp -d)}"
export WORKSPACE=/tmp/sdysyhj-verify
export SENTINEL="PI_TEST_SENTINEL_7f3a9c21"
export PATH="/tmp/vharness/bin:$PATH"
unset PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR PI_CODING_AGENT PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT
mkdir -p /tmp/vharness/wsA /tmp/vharness/wsB
echo "[env] HOME=$HOME MOCKLOG=$MOCKLOG SCENARIO=${MOCK_SCENARIO:-stream} ARGS=$*"
exec node "$@"

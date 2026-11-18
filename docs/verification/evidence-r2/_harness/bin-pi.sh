#!/bin/sh
# 核验用 PATH 假 pi（test-cases SC-035a 口径）：记录调用；--version 返回版本号（口径 #4 可用 pi 判据）；其余转交 mock 子进程
echo "$@" >> "$MOCKLOG/pi-invocations.log"
if [ "$1" = "--version" ]; then
  echo "pi, version 1.99.0-mock"
  exit 0
fi
exec node /tmp/r2harness/mock-pi.js "$@"

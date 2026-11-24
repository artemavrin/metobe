#!/bin/sh
# Repeat of 50 and add 60 on a quieter machine.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1
set -a; . ./.env; set +a
run() {
  psql "$DATABASE_URL" -qc "truncate chats, model_runs cascade" 2>&1 | grep -v NOTICE
  redis-cli -p 6380 -n 9 flushdb > /dev/null
  echo "level $1: $(uptime)"
  N=$1 TAG=$1 HOLD=$2 SETTLE=$3 SETTLE2=$4 node --import tsx run.ts > "out/level-$1.txt" 2>&1
}
run 50 90 10 10
run 60 90 10 10
echo finished

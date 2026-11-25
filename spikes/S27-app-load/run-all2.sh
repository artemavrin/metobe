#!/bin/sh
# Levels around and above the ceiling: 20 (with the long settle, for the 120 s recorder retention), 30, 40, then 100/200/400.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1
set -a; . ./.env; set +a
run() { # N HOLD SETTLE SETTLE2
  psql "$DATABASE_URL" -qc "truncate chats, model_runs cascade" 2>&1 | grep -v NOTICE
  redis-cli -p 6380 -n 9 flushdb > /dev/null
  echo "level $1: $(uptime)"
  N=$1 TAG=$1 HOLD=$2 SETTLE=$3 SETTLE2=$4 node --import tsx run.ts > "out/level-$1.txt" 2>&1
}
run 20 90 20 110
run 30 90 10 10
run 40 90 10 10
run 100 60 10 10
run 200 60 10 10
run 400 60 10 10
echo finished

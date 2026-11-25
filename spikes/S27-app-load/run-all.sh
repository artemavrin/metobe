#!/bin/sh
# The four levels one after another, each on a fresh app process and cleaned chat tables.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1
set -a; . ./.env; set +a
for n in ${LEVELS:-50 100 200 400}; do
  psql "$DATABASE_URL" -qc "truncate chats, model_runs cascade" 2>&1 | grep -v NOTICE
  redis-cli -p 6380 -n 9 flushdb > /dev/null
  uptime
  N=$n TAG=$n node --import tsx run.ts > "out/level-$n.txt" 2>&1
done
echo finished

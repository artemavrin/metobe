#!/bin/sh
# The minimal stand with 100 ms coalescing.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1
set -a; . ./.env; set +a
run() { # coalesce N users-per
  redis-cli -p 6380 -n 9 flushdb > /dev/null
  echo "standalone c$1 level $2: $(uptime)"
  COALESCE_MS=$1 STANDALONE=1 START_CMD="$HERE/start-standalone.sh" N=$2 USERS_PER=$3 TAG=sa-c$1-$2 HOLD=60 SETTLE=5 SETTLE2=5 node --import tsx run.ts > "out/level-sa-c$1-$2.txt" 2>&1
}
run 100 400 1
run 100 800 2
echo finished

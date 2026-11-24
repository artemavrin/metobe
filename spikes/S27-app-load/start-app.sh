#!/bin/sh
# Starts the product's production build on :3427 against spike_s27, with the lag preload. Run from anywhere.
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/out"
rm -f "$HERE/out/lag.jsonl"
cd "$HERE/../../apps/web" || exit 1
set -a; . "$HERE/.env"; set +a
export NEXT_TELEMETRY_DISABLED=1 S27_LAG_FILE="$HERE/out/lag.jsonl"
export NODE_OPTIONS="--import=$HERE/lag.mjs ${APP_NODE_OPTIONS:-}"
exec env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy PORT=3427 HOSTNAME=127.0.0.1 node .next/standalone/apps/web/server.js

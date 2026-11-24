#!/bin/sh
# The minimal stand (standalone.ts) on :3427 with the lag preload. COALESCE_MS=0|50.
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/out"
rm -f "$HERE/out/lag.jsonl"
cd "$HERE" || exit 1
set -a; . "$HERE/.env"; set +a
export S27_LAG_FILE="$HERE/out/lag.jsonl"
exec env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy node --expose-gc --import "$HERE/lag.mjs" --import tsx standalone.ts

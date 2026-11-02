#!/usr/bin/env bash
# An update over several releases (DECISIONS D35): the oldest release we promise to update from, installed by its own
# installer, with a row of data in it; then this checkout's image with this checkout's compose.yml — what the updater
# does. Passes when every migration of the checkout is applied, the row is still there and /api/health says ok.
#
#   .github/scripts/upgrade-check.sh            # from 0.4.0
#   UPGRADE_FROM=0.5.1 .github/scripts/upgrade-check.sh
#
# Its own compose project and port, so a Metobe already running on the machine is not touched; cleaned up at the end.
set -euo pipefail

FROM="${UPGRADE_FROM:-0.4.0}"
CHECKOUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${UPGRADE_PORT:-3990}"
IMAGE="metobe:upgrade-check"
export COMPOSE_PROJECT_NAME="metobe-upgrade-check"

cd "$WORK"
compose() { docker compose -f compose.yml --env-file .env "$@" </dev/null; }
sql() { compose exec -T postgres psql -U metobe -d metobe -tAc "$1"; }
cleanup() {
  local code=$?
  if [ -f "$WORK/metobe/compose.yml" ]; then
    cd "$WORK/metobe"
    [ "$code" -eq 0 ] || compose logs --no-color --tail 200 app || true
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT

echo "== Metobe $FROM by its own installer"
curl -fsSL "https://github.com/artemavrin/metobe/releases/download/v$FROM/install.sh" -o install.sh
METOBE_YES=1 METOBE_DIR="$WORK/metobe" METOBE_PORT="$PORT" METOBE_URL="http://localhost:$PORT" bash install.sh </dev/null
cd "$WORK/metobe"

echo "== data written on $FROM"
sql "insert into \"user\" (id, name, email, email_verified, created_at, updated_at)
     values ('upgrade-check', 'Upgrade check', 'upgrade-check@example.com', true, now(), now())"
before="$(sql 'select count(*) from drizzle.__drizzle_migrations')"

echo "== this checkout's image"
(cd "$CHECKOUT" && METOBE_IMAGE="$IMAGE" docker compose -f compose.yml -f docker/compose.build.yml build --quiet app </dev/null)

echo "== update: this checkout's compose.yml, the image pinned in .env (as the updater does)"
cp "$CHECKOUT/compose.yml" compose.yml
if grep -q '^METOBE_IMAGE=' .env; then
  sed -i.bak "s#^METOBE_IMAGE=.*#METOBE_IMAGE=$IMAGE#" .env && rm -f .env.bak
else
  echo "METOBE_IMAGE=$IMAGE" >> .env
fi
compose up -d --wait --wait-timeout 900 app worker

expected="$(find "$CHECKOUT/packages/db/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
applied="$(sql 'select count(*) from drizzle.__drizzle_migrations')"
row="$(sql "select count(*) from \"user\" where id = 'upgrade-check'")"
health="$(curl -fsS "http://localhost:$PORT/api/health")"
echo "migrations: $before on $FROM → $applied (expected $expected); row: $row; health: $health"

[ "$applied" = "$expected" ] || { echo "not every migration was applied" >&2; exit 1; }
[ "$row" = "1" ] || { echo "the data written on $FROM is gone" >&2; exit 1; }
echo "$health" | grep -q '"status":"ok"' || { echo "/api/health is not ok" >&2; exit 1; }
echo "== $FROM → this checkout: ok"

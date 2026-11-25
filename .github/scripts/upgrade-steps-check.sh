#!/usr/bin/env bash
# An update release by release, with the previous release still writing in between (ARCH §20.4): a migration in two
# releases — expand + backfill in N, contract in N+1 — must survive the code of the release before N writing after
# N's migrations ran (a rollback by image only, or a second `app` not yet replaced). Steps:
#
#   1. the latest release (or UPGRADE_FROM), by its own installer, with people in it;
#   2. release N — UPGRADE_VIA, a git ref built into an image, when it has migrations the release of step 1 has not
#      (in CI: the PR's base, which for a contract PR is the expand); otherwise this checkout; its migrations run;
#   3. the release of step 1 again, by image only, as the updater's rollback does: it must come up healthy on the
#      migrated base; while that release predates organizations, rows are written the way it writes accounts and
#      invitations (no organization, no role in it) — by SQL of that shape: from outside, CI has no session to make
#      them through the release's own code;
#   4. this checkout's image (N+1, or N again); its migrations run.
#
# Passes when every migration is applied, the install has one organization with one owner, every person is in it —
# with a role, once contract is among the migrations — and /api/health says ok at every step.
#
#   .github/scripts/upgrade-steps-check.sh                           # latest → checkout → latest → checkout
#   UPGRADE_VIA=origin/main .github/scripts/upgrade-steps-check.sh   # latest → main → latest → checkout
#
# Its own compose project and port, so a Metobe already running on the machine is not touched; cleaned up at the end.
set -euo pipefail

REPO="artemavrin/metobe"
# The API turns away a runner's anonymous calls once its shared limit is spent: with GH_TOKEN they count as the repo's.
latest() {
  curl -fsSL ${GH_TOKEN:+-H "Authorization: Bearer $GH_TOKEN"} "https://api.github.com/repos/$REPO/releases/latest" |
    sed -nE 's/.*"tag_name": *"v?([^"]+)".*/\1/p' | head -1
}
FROM="${UPGRADE_FROM:-$(latest)}"
VIA="${UPGRADE_VIA:-}"
CHECKOUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations() { git -C "$CHECKOUT" ls-tree --name-only "$1" packages/db/migrations/ | grep -c '\.sql$' || true; }
if [ -n "$VIA" ] && [ "$(migrations "$VIA")" = "$(migrations "v$FROM")" ]; then
  echo "== $VIA has no migration $FROM lacks: it is not a release of its own here"
  VIA=""
fi
# Whether the release of step 1 writes accounts without an organization (it predates them).
before_orgs=0
git -C "$CHECKOUT" ls-tree --name-only "v$FROM" packages/db/migrations/ | grep -q orgs_expand || before_orgs=1
WORK="$(mktemp -d)"
PORT="${UPGRADE_PORT:-3991}"
export COMPOSE_PROJECT_NAME="metobe-upgrade-steps"

[ -n "$FROM" ] || { echo "no release to update from" >&2; exit 1; }

cd "$WORK"
compose() { docker compose -f compose.yml --env-file .env "$@" </dev/null; }
sql() { compose exec -T postgres psql -U metobe -d metobe -v ON_ERROR_STOP=1 -tAc "$1"; }
cleanup() {
  local code=$?
  if [ -f "$WORK/metobe/compose.yml" ]; then
    cd "$WORK/metobe"
    [ "$code" -eq 0 ] || compose logs --no-color --tail 200 app || true
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -d "$WORK/via" ] && git -C "$CHECKOUT" worktree remove --force "$WORK/via" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT

# Builds the image of a source tree (the way the CI e2e and the installer's METOBE_BUILD do).
# Quiet unless it fails: then the end of the build's own output says why.
build() {
  (cd "$1" && METOBE_IMAGE="$2" docker compose -f compose.yml -f docker/compose.build.yml build --progress plain app \
    </dev/null >"$WORK/build.log" 2>&1) || { tail -n 120 "$WORK/build.log" >&2; return 1; }
}
# Runs an image with a compose.yml, as the updater does: the file beside the base, the image pinned in .env.
run() {
  cp "$2" compose.yml
  sed -i.bak "s#^METOBE_IMAGE=.*#METOBE_IMAGE=$1#" .env && rm -f .env.bak
  compose up -d --wait --wait-timeout 900 app worker
  curl -fsS "http://localhost:$PORT/api/health" | grep -q '"status":"ok"' || { echo "/api/health is not ok on $1" >&2; exit 1; }
  echo "   $1: healthy, $(sql 'select count(*) from drizzle.__drizzle_migrations') migrations"
}

echo "== Metobe $FROM by its own installer"
curl -fsSL "https://github.com/$REPO/releases/download/v$FROM/install.sh" -o install.sh
METOBE_YES=1 METOBE_DIR="$WORK/metobe" METOBE_PORT="$PORT" METOBE_URL="http://localhost:$PORT" bash install.sh </dev/null
cd "$WORK/metobe"
grep -q '^METOBE_IMAGE=' .env || echo "METOBE_IMAGE=ghcr.io/$REPO:$FROM" >> .env
from_image="$(sed -n 's/^METOBE_IMAGE=//p' .env)"
cp compose.yml "$WORK/compose.from.yml"

echo "== people written on $FROM: the superuser, an admin, a user, an open invitation"
sql "insert into \"user\" (id, name, email, email_verified, role, created_at, updated_at) values
     ('steps-owner', 'Owner', 'owner@steps.example', true, 'superuser', now() - interval '3 days', now()),
     ('steps-admin', 'Admin', 'admin@steps.example', true, 'admin', now() - interval '2 days', now()),
     ('steps-user', 'User', 'user@steps.example', true, 'user', now() - interval '1 day', now())"
sql "insert into invitations (role, token_hash, expires_at) values ('user', 'steps-1', now() + interval '1 day')"

build "$CHECKOUT" "metobe:upgrade-steps"
if [ -n "$VIA" ]; then
  echo "== release N: $VIA"
  git -C "$CHECKOUT" worktree add --detach "$WORK/via" "$VIA" >/dev/null
  build "$WORK/via" "metobe:upgrade-via"
  run "metobe:upgrade-via" "$WORK/via/compose.yml"
else
  echo "== release N: this checkout"
  run "metobe:upgrade-steps" "$CHECKOUT/compose.yml"
fi

echo "== $FROM again, by image only: it runs on the migrated base"
run "$from_image" "$WORK/compose.from.yml"
if [ "$before_orgs" = 1 ]; then
  echo "   and writes as it does: an account by an invitation, and an invitation — no organization, no role in it"
  sql "insert into \"user\" (id, name, email, email_verified, role, created_at, updated_at)
       values ('steps-late', 'Late', 'late@steps.example', true, 'admin', now(), now())"
  sql "insert into invitations (role, token_hash, expires_at) values ('admin', 'steps-2', now() + interval '1 day')"
fi

echo "== this checkout"
run "metobe:upgrade-steps" "$CHECKOUT/compose.yml"

expected="$(find "$CHECKOUT/packages/db/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
applied="$(sql 'select count(*) from drizzle.__drizzle_migrations')"
orgs="$(sql 'select count(*) from organizations')"
owners="$(sql "select string_agg(id, ',') from \"user\" where org_role = 'owner'")"
outside="$(sql "select count(*) from \"user\" where organization_id is distinct from (select id from organizations)")"
no_role="$(sql "select count(*) from \"user\" where org_role is null")"
late="$(sql "select coalesce(org_role, '-') from \"user\" where id = 'steps-late'")"
echo "migrations: $applied (expected $expected); organizations: $orgs; owner: $owners; outside it: $outside;" \
  "without a role: $no_role (steps-late: $late)"

[ "$applied" = "$expected" ] || { echo "not every migration was applied" >&2; exit 1; }
[ "$orgs" = "1" ] || { echo "the install has $orgs organizations, not one" >&2; exit 1; }
[ "$owners" = "steps-owner" ] || { echo "the superuser is not the one owner: '$owners'" >&2; exit 1; }
[ "$outside" = "0" ] || { echo "$outside people are outside the organization" >&2; exit 1; }
# Contract fills in the role of what the previous release wrote; before it, the role is read from the install's role.
if [ "$before_orgs" = 1 ] && ls "$CHECKOUT/packages/db/migrations/"*orgs_contract*.sql >/dev/null 2>&1; then
  [ "$no_role" = "0" ] || { echo "$no_role people have no role in the organization after contract" >&2; exit 1; }
  [ "$late" = "admin" ] || { echo "what $FROM wrote got the role '$late', not admin" >&2; exit 1; }
fi
echo "== $FROM → ${VIA:-this checkout} → $FROM → this checkout: ok"

#!/usr/bin/env bash
# Whether going from BASE to HEAD changes code: prints «true» or «false».
# Not code: docs and Markdown only; release-please's own commit — changelog, manifest and the version line of
# package.json (its code was checked as its parent). No BASE, or one this clone does not have: code, to be safe.
set -euo pipefail
base="${1:-}"
head="${2:-HEAD}"
if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo true
  exit 0
fi
files="$(git diff --name-only "$base" "$head")"
if ! echo "$files" | grep -qvE '^docs/|\.md$'; then
  echo false
elif ! echo "$files" | grep -qvxE 'CHANGELOG\.md|\.release-please-manifest\.json|package\.json' &&
  ! git diff -U0 "$base" "$head" -- package.json | grep -E '^[-+][^-+]' | grep -qv '"version":'; then
  echo false
else
  echo true
fi

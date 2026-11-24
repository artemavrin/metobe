#!/bin/sh
# Links the packages the workspace already installed (better-auth 1.7.5, drizzle-orm, postgres, tsx) into
# ./node_modules: the spike pins nothing of its own and needs no registry. Run `pnpm install` at the root first.
set -e
cd "$(dirname "$0")"
ROOT=../..
mkdir -p node_modules/@better-auth
ln -sfn "$(cd $ROOT/packages/core/node_modules/better-auth && pwd -P)" node_modules/better-auth
BA="$(cd $ROOT/packages/core/node_modules/better-auth && pwd -P)"
ln -sfn "$(cd "$BA/../@better-auth/core" && pwd -P)" node_modules/@better-auth/core
ln -sfn "$(cd $ROOT/packages/core/node_modules/drizzle-orm && pwd -P)" node_modules/drizzle-orm
ln -sfn "$(cd $ROOT/packages/db/node_modules/postgres && pwd -P)" node_modules/postgres
ln -sfn "$(cd $ROOT/packages/core/node_modules/tsx 2>/dev/null && pwd -P || cd $ROOT/node_modules/.pnpm/tsx@*/node_modules/tsx && pwd -P)" node_modules/tsx

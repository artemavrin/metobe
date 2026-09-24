#!/bin/sh
set -e

case "$1" in
  web)
    # Migrations run under a Postgres advisory lock, so concurrent starts are safe.
    metobe migrate
    # Refuses to start when SECRETS_KEY is not the key this installation was set up with (ARCH §17.2).
    metobe secrets:check
    # An install-time proxy becomes a record in the admin, used by nothing until the admin says so.
    metobe proxies:import-env
    # Prints a one-time claim link until the first superuser exists.
    metobe claim-link
    exec node apps/web/server.js
    ;;
  worker)
    exec node --conditions=react-server worker/index.js
    ;;
  *)
    exec "$@"
    ;;
esac

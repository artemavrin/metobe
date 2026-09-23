#!/bin/sh
set -e

case "$1" in
  web)
    # Migrations run under a Postgres advisory lock, so concurrent starts are safe.
    purr migrate
    # Prints a one-time claim link until the first superuser exists.
    purr claim-link
    exec node apps/web/server.js
    ;;
  worker)
    exec node --conditions=react-server worker/index.js
    ;;
  *)
    exec "$@"
    ;;
esac

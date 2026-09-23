#!/bin/sh
# CLI inside the container: docker compose exec app purr <command>
exec node --conditions=react-server /app/cli/index.js "$@"

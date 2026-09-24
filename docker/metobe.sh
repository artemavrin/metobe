#!/bin/sh
# CLI inside the container: docker compose exec app metobe <command>
exec node --conditions=react-server /app/cli/index.js "$@"

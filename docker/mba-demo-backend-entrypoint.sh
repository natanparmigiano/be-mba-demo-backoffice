#!/bin/sh
set -eu

role="${1:-}"

case "$role" in
  app)
    node /app/lib/db/dist/migrate.js
    cd /app/apps/api
    exec node dist/index.js
    ;;
  worker)
    cd /app/apps/api
    exec node dist/worker.js
    ;;
  *)
    echo "Usage: mba-demo-backend-entrypoint {app|worker}" >&2
    exit 64
    ;;
esac

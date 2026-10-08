#!/bin/sh
set -eu

usage() {
  echo "Usage: mba-desk-backend-entrypoint {workspace-app|manager-app|migrate|workspace-worker|manager-worker}" >&2
  exit 64
}

case "${1:-}" in
  workspace-app)
    [ "$#" -eq 1 ] || usage
    cd /app/apps/api-workspace
    exec node dist/index.js
    ;;
  manager-app)
    [ "$#" -eq 1 ] || usage
    cd /app/apps/api-manager
    exec node dist/index.js
    ;;
  migrate)
    [ "$#" -eq 1 ] || usage
    exec node /app/lib/db/dist/migrate.js
    ;;
  workspace-worker)
    [ "$#" -eq 1 ] || usage
    cd /app/lib/api-workspace-core
    exec node dist/worker.js
    ;;
  manager-worker)
    [ "$#" -eq 1 ] || usage
    cd /app/lib/api-manager-core
    exec node dist/worker.js
    ;;
  *)
    usage
    ;;
esac

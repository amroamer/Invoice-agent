#!/bin/sh
set -e

cd /app

echo "[entrypoint] applying database migrations..."
alembic upgrade head

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] running seed..."
  python -m app.db.seed || echo "[entrypoint] seed failed (non-fatal)"
fi

echo "[entrypoint] launching: $*"
exec "$@"

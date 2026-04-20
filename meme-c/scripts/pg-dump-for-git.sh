#!/usr/bin/env bash
# Dump DB to text SQL under meme/data/portable/ — safe to commit and restore on another clone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/data/portable/memec.sql"
mkdir -p "$(dirname "$OUT")"
if ! docker ps --format '{{.Names}}' | grep -qx 'memec-postgres'; then
  echo "memec-postgres container is not running." >&2
  exit 1
fi
docker exec memec-postgres pg_dump -U memec --clean --if-exists memec >"$OUT"
echo "Wrote $OUT (add/commit it to move data with git)"

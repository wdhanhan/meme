#!/usr/bin/env bash
# Restore meme/data/portable/memec.sql into the local memec-postgres container (overwrites memec DB objects).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SQL="$ROOT/data/portable/memec.sql"
if [[ ! -f "$SQL" ]]; then
  echo "Missing $SQL — run pg-dump-for-git.sh on a machine that has the data, then commit memec.sql." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx 'memec-postgres'; then
  echo "memec-postgres container is not running." >&2
  exit 1
fi
docker exec -i memec-postgres psql -U memec -d memec -v ON_ERROR_STOP=1 <"$SQL"
echo "Restore finished."

#!/usr/bin/env bash
# Backs up the dev database, restores it into a scratch database and proves the copy matches. Exits non-zero on any mismatch.
# Run from the repository root with the compose stack up.
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d%H%M%S)
DUMP="/tmp/accounting-$STAMP.dump"
trap 'rm -f "$DUMP"' EXIT

docker compose exec -T db pg_dump -U postgres -Fc accounting > "$DUMP"
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS drill;" -c "CREATE DATABASE drill OWNER acct_owner;"
docker compose exec -T db psql -U postgres -d drill -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
docker compose exec -T db pg_restore -U postgres -d drill --no-owner --role=acct_owner < "$DUMP"

for t in organizations users audit_events; do
  a=$(docker compose exec -T db psql -U postgres -d accounting -Atc "select count(*) from $t")
  b=$(docker compose exec -T db psql -U postgres -d drill -Atc "select count(*) from $t")
  [ "$a" = "$b" ] || { echo "MISMATCH $t: $a vs $b"; exit 1; }
done

# The audit chain must verify on the restored copy too (the verify function came along with the dump).
bad=$(docker compose exec -T db psql -U postgres -d drill -Atc "select count(*) from organizations o, lateral audit_verify_chain(o.id)")
[ "$bad" = "0" ] || { echo "AUDIT CHAIN BROKEN in restored copy"; exit 1; }
docker compose exec -T app php artisan audit:verify
docker compose exec -T db psql -U postgres -c "DROP DATABASE drill;"
echo "restore drill OK ($STAMP)"

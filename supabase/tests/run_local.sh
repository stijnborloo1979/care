#!/usr/bin/env bash
# Draait alle migraties op een lege, lokale Postgres met de Supabase-shim,
# en daarna alle SQL-tests. Voor ontwikkeling en CI; niet nodig om de app
# te gebruiken.
#
#   supabase/tests/run_local.sh            alle migraties + alle tests
#   UPTO=46 supabase/tests/run_local.sh    alleen migraties t/m 46
#
# Vereist: PostgreSQL 15+ met pgvector en pg_cron (Ubuntu:
# postgresql-16-pgvector, postgresql-16-cron). Draait niet als root.
set -euo pipefail

HIER="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HIER/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
DB=lifeangle
UPTO="${UPTO:-999}"

opruimen() { "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap opruimen EXIT

"$BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
cat >> "$DATA/postgresql.conf" <<CONF
port = $PORT
listen_addresses = ''
unix_socket_directories = '$DATA'
shared_preload_libraries = 'pg_cron'
cron.database_name = '$DB'
wal_level = logical
CONF
"$BIN/pg_ctl" -D "$DATA" -l "$DATA/log" -w start >/dev/null

PSQL=("$BIN/psql" -h "$DATA" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database $DB"
sed "s/current_database_placeholder/$DB/" "$HIER/supabase_shim.sql" | "${PSQL[@]}" -d "$DB" >/dev/null
# 02_demo_data zoekt een bestaand account; hier maken we het nep-adres aan.
"${PSQL[@]}" -d "$DB" -c "insert into auth.users (email) values ('vervang@door-jouw-email.be')"

for f in $(ls "$SUPA"/[0-9][0-9]_*.sql | sort); do
  nr=$(basename "$f" | cut -c1-2)
  [ "$nr" = "10" ] && continue            # 10 is een testscript
  [ "$((10#$nr))" -gt "$UPTO" ] && break
  if ! out=$("${PSQL[@]}" -d "$DB" -f "$f" 2>&1); then
    echo "MIGRATIE MISLUKT: $(basename "$f")"; echo "$out" | grep -v NOTICE | tail -20; exit 1
  fi
  echo "migratie ok: $(basename "$f")"
done

rc=0
for t in "$SUPA/10_rls_tests.sql" $(ls "$HIER"/test_*.sql 2>/dev/null | sort); do
  [ -f "$t" ] || continue
  # Tests die bij een latere migratie horen, overslaan als die niet gedraaid is.
  need=$(grep -m1 -o 'VEREIST_MIGRATIE [0-9]*' "$t" | awk '{print $2}' || true)
  if [ -n "$need" ] && [ "$need" -gt "$UPTO" ]; then echo "overgeslagen: $(basename "$t")"; continue; fi
  if out=$("${PSQL[@]}" -d "$DB" -f "$t" 2>&1); then
    echo "TEST GESLAAGD: $(basename "$t") ($(echo "$out" | grep -c 'NOTICE:  ok:') controles)"
  else
    echo "TEST GEZAKT:  $(basename "$t")"; echo "$out" | grep -E "GEZAKT|ERROR|FOUT" | head -10; rc=1
  fi
done
exit $rc

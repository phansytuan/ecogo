#!/usr/bin/env bash
set -euo pipefail

SCRATCH_DB=ecogo_restore_check
target=$SCRATCH_DB
dump_file=
destructive_confirmed=no
api_stopped=no

fail() {
  printf 'restore failed: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  status=$?
  if [ "$api_stopped" = yes ]; then
    printf 'restore interrupted; restarting api\n' >&2
    docker compose start api >/dev/null || true
  fi
  if [ "$status" -ne 0 ]; then
    printf 'restore failed with exit status %s\n' "$status" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || fail '--target requires a database name'
      target=$2
      shift 2
      ;;
    --i-know-this-destroys-data)
      destructive_confirmed=yes
      shift
      ;;
    -*)
      fail "unknown option: $1"
      ;;
    *)
      [ -z "$dump_file" ] || fail 'provide exactly one dump file'
      dump_file=$1
      shift
      ;;
  esac
done

[ "${RESTORE_CONFIRM:-}" = yes ] ||
  fail 'set RESTORE_CONFIRM=yes to authorize the restore drill'
[ -n "$dump_file" ] || fail 'usage: restore-db.sh PATH.dump [--target ecogo --i-know-this-destroys-data]'
[ -s "$dump_file" ] || fail "dump file is missing or empty: $dump_file"

case "$target" in
  "$SCRATCH_DB")
    ;;
  ecogo)
    [ "$destructive_confirmed" = yes ] ||
      fail 'live restore also requires --i-know-this-destroys-data'
    ;;
  *)
    fail "target must be $SCRATCH_DB or ecogo"
    ;;
esac

docker compose exec -T db pg_restore --list < "$dump_file" >/dev/null

if [ "$target" = ecogo ]; then
  docker compose stop api
  api_stopped=yes
fi

docker compose exec -T db psql -U ecogo -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '$target' AND pid <> pg_backend_pid();" >/dev/null

docker compose exec -T db psql -U ecogo -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $target;" >/dev/null

docker compose exec -T db psql -U ecogo -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE $target OWNER ecogo;" >/dev/null

docker compose exec -T db \
  pg_restore -U ecogo -d "$target" --no-owner < "$dump_file"

printf 'Restore verification for database %s:\n' "$target"
docker compose exec -T db psql -U ecogo -d "$target" \
  -v ON_ERROR_STOP=1 -At -F ': ' <<'SQL'
SELECT 'public tables', count(*)::bigint
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'users rows', count(*)::bigint FROM users
UNION ALL
SELECT 'rides rows', count(*)::bigint FROM rides
UNION ALL
SELECT 'bookings rows', count(*)::bigint FROM bookings
UNION ALL
SELECT 'transactions rows', count(*)::bigint FROM transactions
UNION ALL
SELECT 'rides columns', count(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rides';
SQL

if [ "$target" = ecogo ]; then
  docker compose start api
  api_stopped=no
  printf 'live database restored and api restarted\n'
else
  printf 'scratch database retained for inspection\n'
  printf 'drop it with: docker compose exec -T db dropdb -U ecogo %s\n' \
    "$SCRATCH_DB"
fi

trap - EXIT

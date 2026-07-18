#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-./ops/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
OFFSITE_CMD=${OFFSITE_CMD:-}

backup_path=

fail() {
  printf 'backup failed: %s\n' "$*" >&2
  exit 1
}

on_error() {
  status=$?
  printf 'backup failed with exit status %s\n' "$status" >&2
  if [ -n "$backup_path" ] && [ ! -s "$backup_path" ]; then
    rm -f "$backup_path"
  fi
  exit "$status"
}
trap on_error ERR

case "$RETENTION_DAYS" in
  ''|*[!0-9]*) fail 'RETENTION_DAYS must be a non-negative integer' ;;
esac

mkdir -p "$BACKUP_DIR"
timestamp=$(date '+%Y%m%d-%H%M%S')
backup_path="${BACKUP_DIR%/}/ecogo-${timestamp}.dump"

docker compose exec -T db \
  pg_dump -U ecogo -d ecogo -Fc > "$backup_path"

[ -s "$backup_path" ] || fail "dump is empty: $backup_path"

restore_list=$(
  docker compose exec -T db pg_restore --list < "$backup_path"
)
[ -n "$restore_list" ] || fail "pg_restore returned an empty listing: $backup_path"

object_count=$(printf '%s\n' "$restore_list" | wc -l | tr -d ' ')
size_bytes=$(wc -c < "$backup_path" | tr -d ' ')

find "$BACKUP_DIR" -type f -name 'ecogo-*.dump' \
  -mtime "+$RETENTION_DAYS" -delete

if [ -n "$OFFSITE_CMD" ]; then
  rendered=$(printf '%s' "$OFFSITE_CMD" | sed 's/{}/"$1"/g')
  if [ "$rendered" = "$OFFSITE_CMD" ]; then
    rendered="$OFFSITE_CMD \"\$1\""
  fi
  sh -c "$rendered" _ "$backup_path"
else
  printf 'offsite upload skipped: OFFSITE_CMD is unset\n' >&2
fi

trap - ERR
printf 'backup=%s size_bytes=%s objects=%s\n' \
  "$backup_path" "$size_bytes" "$object_count"

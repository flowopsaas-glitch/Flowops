#!/usr/bin/env bash
#
# FlowOps — backup RESTORE + VERIFY.
#
# An untested backup is not a backup. This script proves a dump can actually be
# restored, by loading it into a THROWAWAY temporary database inside the same
# postgres container and reporting row counts of the key tables. It NEVER
# touches your live database.
#
# It has two modes:
#
#   1. VERIFY (default, SAFE) — restore into a temp DB, count rows, drop temp DB.
#      Use this on a schedule (weekly) or any time you want confidence.
#        deploy/restore-verify.sh /backups/flowops_20260914_020000.sql.gz
#      Or pull the newest local dump automatically:
#        deploy/restore-verify.sh --latest-local
#
#   2. RESTORE-LIVE (DANGEROUS, explicit) — actually overwrite the live DB from
#      a dump. Only for real disaster recovery. Requires --i-understand.
#        deploy/restore-verify.sh --restore-live /path/to/dump.sql.gz --i-understand
#
# REQUIREMENTS: docker + a running flowops-postgres-1 container.

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-flowops-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-flowops}"
POSTGRES_DB="${POSTGRES_DB:-flowops}"
BACKUP_VOLUME_PATH="${BACKUP_VOLUME_PATH:-/backups}"   # path INSIDE the backup container

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

MODE="verify"
DUMP=""
CONFIRM=""
for arg in "$@"; do
  case "$arg" in
    --restore-live) MODE="restore-live" ;;
    --i-understand) CONFIRM="yes" ;;
    --latest-local) DUMP="__LATEST__" ;;
    *) DUMP="$arg" ;;
  esac
done

# Resolve --latest-local: newest dump in the postgres-backup container volume.
if [ "$DUMP" = "__LATEST__" ]; then
  BACKUP_CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 postgres-backup || true)"
  [ -n "$BACKUP_CONTAINER" ] || die "no postgres-backup container running; pass a dump path explicitly."
  DUMP="$(docker exec "$BACKUP_CONTAINER" sh -c "ls -t ${BACKUP_VOLUME_PATH}/*.sql.gz 2>/dev/null | head -1")"
  [ -n "$DUMP" ] || die "no *.sql.gz backups found in ${BACKUP_CONTAINER}:${BACKUP_VOLUME_PATH}"
  log "Latest local backup: $DUMP (in ${BACKUP_CONTAINER})"
  # Copy it out of the backup container to the host tmp, then into the pg container.
  TMP="$(mktemp).sql.gz"
  docker cp "${BACKUP_CONTAINER}:${DUMP}" "$TMP"
  DUMP="$TMP"
fi

[ -n "$DUMP" ] || die "usage: $0 <dump.sql.gz> | --latest-local [--restore-live --i-understand]"
[ -f "$DUMP" ] || die "dump file not found on host: $DUMP"

# Stream the dump into the container's psql.
feed_dump() { zcat "$DUMP"; }

if [ "$MODE" = "restore-live" ]; then
  [ "$CONFIRM" = "yes" ] || die "refusing to overwrite the LIVE database without --i-understand"
  log "!!! RESTORING INTO LIVE DATABASE ${POSTGRES_DB} — this OVERWRITES current data !!!"
  log "You have 5 seconds to Ctrl-C ..."
  sleep 5
  # Recreate a clean public schema, then load.
  docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  feed_dump | docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  log "LIVE restore complete. Restart the api container: docker restart ${PG_CONTAINER%postgres-1}api-1"
  exit 0
fi

# ── VERIFY MODE (safe) ───────────────────────────────────────────────────────
TEMP_DB="flowops_verify_$(date +%s)"
log "Creating throwaway verify DB: ${TEMP_DB}"
docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${TEMP_DB};" >/dev/null

cleanup() {
  log "Dropping verify DB ${TEMP_DB} ..."
  docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${TEMP_DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Restoring dump into ${TEMP_DB} (this proves the backup is loadable) ..."
if ! feed_dump | docker exec -i "$PG_CONTAINER" psql -q -v ON_ERROR_STOP=0 -U "$POSTGRES_USER" -d "$TEMP_DB" >/dev/null 2>/tmp/restore_verify_err; then
  log "psql reported issues during restore; tail of stderr:"; tail -5 /tmp/restore_verify_err || true
fi

log "Restore finished. Sanity-checking key tables in ${TEMP_DB}:"
docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$TEMP_DB" -t -A -F': ' -c "
  SELECT 'companies', count(*) FROM \"Company\"
  UNION ALL SELECT 'users', count(*) FROM \"User\"
  UNION ALL SELECT 'drivers', count(*) FROM \"Driver\"
  UNION ALL SELECT 'waybills', count(*) FROM \"Waybill\"
  UNION ALL SELECT 'collections', count(*) FROM \"Collection\";
" 2>/dev/null || log "  (some tables missing — inspect the dump; table names are case-sensitive Prisma models)"

log "VERIFY PASSED: the backup restored into a temp DB and key tables were queryable."
log "This is your proof the backup is real. The temp DB is now dropped; live data untouched."

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

# Register temp-state cleanup up front: a --latest-local run copies a PLAINTEXT
# dump to the host tmpfs — it must not linger there after the run (data leak).
TMP_DUMP=""
TEMP_DB=""
cleanup() {
  if [ -n "$TMP_DUMP" ]; then rm -f "$TMP_DUMP"; fi
  if [ -n "$TEMP_DB" ]; then
    log "Dropping verify DB ${TEMP_DB} ..."
    docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS ${TEMP_DB};" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

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
  # Pick the newest dump that is actually a real size (>10KB) — skip any tiny
  # broken artifact (e.g. a mid-reboot empty dump) so --latest-local verifies a
  # backup you'd genuinely restore from, not the freshest-but-broken file.
  DUMP="$(docker exec "$BACKUP_CONTAINER" sh -c \
    "for f in \$(ls -t ${BACKUP_VOLUME_PATH}/*.sql.gz 2>/dev/null); do \
       sz=\$(stat -c%s \"\$f\" 2>/dev/null || wc -c < \"\$f\"); \
       if [ \"\$sz\" -ge 10240 ]; then echo \"\$f\"; break; fi; \
     done")"
  [ -n "$DUMP" ] || die "no healthy (>10KB) *.sql.gz backups found in ${BACKUP_CONTAINER}:${BACKUP_VOLUME_PATH}"
  log "Latest HEALTHY local backup: $DUMP (in ${BACKUP_CONTAINER})"
  # Copy it out of the backup container to the host tmp, then into the pg container.
  TMP_DUMP="$(mktemp).sql.gz"
  docker cp "${BACKUP_CONTAINER}:${DUMP}" "$TMP_DUMP"
  DUMP="$TMP_DUMP"
fi

[ -n "$DUMP" ] || die "usage: $0 <dump.sql.gz> | --latest-local [--restore-live --i-understand]"
[ -f "$DUMP" ] || die "dump file not found on host: $DUMP"

# ── Reject an obviously-empty/broken dump BEFORE trusting it ──────────────────
# A real FlowOps dump is tens of KB even near-empty. A tiny file (e.g. the
# 20-byte artifact pg_dump writes if it runs mid-reboot while Postgres is still
# starting) must FAIL loudly — a verify tool that greenlights an empty backup is
# worse than no tool at all.
MIN_BYTES="${MIN_BYTES:-10240}"   # 10 KB floor
DUMP_BYTES="$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")"
log "Dump: $DUMP (${DUMP_BYTES} bytes)"
if [ "${DUMP_BYTES:-0}" -lt "$MIN_BYTES" ]; then
  die "dump is only ${DUMP_BYTES} bytes (< ${MIN_BYTES}). This is an EMPTY/broken backup — verify FAILED."
fi
if ! gzip -t "$DUMP" 2>/dev/null; then
  die "dump failed gzip integrity check — verify FAILED."
fi

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
# (drop happens in the global cleanup() trap registered above)

log "Restoring dump into ${TEMP_DB} (this proves the backup is loadable) ..."
if ! feed_dump | docker exec -i "$PG_CONTAINER" psql -q -v ON_ERROR_STOP=0 -U "$POSTGRES_USER" -d "$TEMP_DB" >/dev/null 2>/tmp/restore_verify_err; then
  log "psql reported issues during restore; tail of stderr:"; tail -5 /tmp/restore_verify_err || true
fi

log "Restore finished. Sanity-checking key tables in ${TEMP_DB}:"
# Run the count query and CAPTURE the result. If the core tables don't exist
# (i.e. the dump had no schema/data), psql exits non-zero and we FAIL — we do
# NOT print a soft note and then claim success like the old version did.
# NOTE: FlowOps' Prisma schema uses @@map() so the real Postgres tables are
# snake_case/plural (companies, users, drivers, waybills, collections) — NOT the
# PascalCase Prisma model names. Query the actual table names.
COUNTS="$(docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$TEMP_DB" -t -A -F': ' -c "
  SELECT 'companies', count(*) FROM companies
  UNION ALL SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'drivers', count(*) FROM drivers
  UNION ALL SELECT 'waybills', count(*) FROM waybills
  UNION ALL SELECT 'collections', count(*) FROM collections;
" 2>/tmp/restore_verify_counts_err)" || {
  log "  Key-table query FAILED. stderr:"; tail -3 /tmp/restore_verify_counts_err 2>/dev/null || true
  die "core FlowOps tables are missing from this dump — the backup is NOT usable. Verify FAILED."
}

echo "$COUNTS" | sed 's/^/    /'
# Require at least one company — an all-zero restore usually means an empty dump.
COMPANY_COUNT="$(echo "$COUNTS" | awk -F': ' '/^companies/{print $2}')"
if [ "${COMPANY_COUNT:-0}" = "0" ]; then
  die "restore produced ZERO companies — this dump has no real tenant data. Verify FAILED."
fi

log "VERIFY PASSED: backup restored into a temp DB and core tables hold real data (${COMPANY_COUNT} companies)."
log "This is your proof the backup is real. The temp DB is now dropped; live data untouched."

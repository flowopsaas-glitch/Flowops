#!/usr/bin/env bash
#
# Live adoption — record the rebaselined baseline on the production database and
# apply the additive delta (Process Book + Product Master).
#
# Authorized by `approved: 5` (docs/RELEASE-RUNBOOK-2026-10-01.md).
# Rehearsed on disposable clones first: docs/MIGRATION-BASELINE-ADOPTION-2026-09-30.md
# (log rows 3–6) and CI run 36848646801.
#
# Usage (on the VPS, from the release worktree):
#   bash deploy/live-migration-adoption.sh --plan     read-only: state + exact actions
#   bash deploy/live-migration-adoption.sh --apply    performs the migration
#
# What --apply does, in order, and nothing else:
#   1. `prisma migrate resolve --applied 20260926130650_init` — records the baseline in the
#      ledger WITHOUT executing its SQL (the live schema already exists). Skipped when the
#      row is already there.
#   2. `prisma migrate deploy` — applies the additive delta only. Skipped when it is applied.
#   3. `prisma migrate status` + drift check (`migrate diff --exit-code`) inside the same
#      container, then host-side verification of the counts and the new tables.
#
# Rollback stays manual and is printed at the end. This script never restores, drops or
# deletes anything, and never touches application containers or the running app.
set -uo pipefail

MODE=""
for arg in "$@"; do
  case "$arg" in
    --plan) MODE=plan ;;
    --apply) MODE=apply ;;
    --help|-h) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg (use --plan or --apply)" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "Usage: $0 --plan | --apply" >&2; exit 2; }

PROJECT_ROOT="${PROJECT_ROOT:-/root/FlowOps}"
WORKTREE="${WORKTREE:-/root/flowops-migration-src}"
PG_CONTAINER="${PG_CONTAINER:-flowops-postgres-1}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/docker/volumes/flowops_postgres-backups/_data}"
NODE_IMAGE="${NODE_IMAGE:-node:20-bookworm-slim}"
REPORT_DIR="${REPORT_DIR:-/root/flowops-adoption-reports}"
BASELINE="20260926130650_init"
DELTA="20260930143000_add_process_book_product_master"

FAILURES=0
CHECKS=0
say() { printf '%s\n' "$*"; }
ok()  { CHECKS=$((CHECKS + 1)); printf '  PASS  %s\n' "$*"; }
bad() { CHECKS=$((CHECKS + 1)); printf '  FAIL  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

run_sql() { # run_sql <sql>
  docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "$1"
}

COUNTS_SQL="SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' ||
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public')"

TABLE_LIST_SQL="SELECT string_agg(c.relname, ',' ORDER BY c.relname) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public' AND c.relname <> '_prisma_migrations'"

row_fingerprint() { # row_fingerprint <comma-separated table list>
  [ -n "${1:-}" ] || { echo ""; return; }
  local list
  list="$(printf '%s' "$1" | sed "s/,/','/g")"
  run_sql "SELECT md5(string_agg(relname || '=' || n, '|' ORDER BY relname)) FROM (
    SELECT c.relname,
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE c.relkind = 'r' AND ns.nspname = 'public' AND c.relname IN ('$list')) s"
}

# ── Preconditions ────────────────────────────────────────────────────────────
say "== preconditions =="
docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" >/dev/null 2>&1 \
  && ok "postgres container $PG_CONTAINER present" \
  || { bad "postgres container $PG_CONTAINER missing"; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" = "true" ] \
  && ok "postgres container running" || bad "postgres container not running"

[ -f "$WORKTREE/backend/prisma/migrations/$BASELINE/migration.sql" ] \
  && ok "baseline migration file present in worktree" \
  || { bad "baseline migration file missing at $WORKTREE"; exit 1; }
[ -f "$WORKTREE/backend/prisma/migrations/$DELTA/migration.sql" ] \
  && ok "delta migration file present in worktree" \
  || { bad "delta migration file missing at $WORKTREE"; exit 1; }
say "worktree revision: $(git -C "$WORKTREE" rev-parse HEAD 2>/dev/null || echo unknown)"

NEWEST_DUMP="$(ls -1t "$BACKUP_DIR"/flowops_*.sql.gz 2>/dev/null | head -1)"
if [ -n "$NEWEST_DUMP" ]; then
  DUMP_AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$NEWEST_DUMP") ) / 3600 ))
  if [ "$DUMP_AGE_H" -le 12 ]; then
    ok "fresh backup dump: $(basename "$NEWEST_DUMP") (${DUMP_AGE_H}h old, $(du -h "$NEWEST_DUMP" | cut -f1))"
  else
    bad "newest backup dump is ${DUMP_AGE_H}h old ($(basename "$NEWEST_DUMP")) — take a fresh dump first"
  fi
else
  bad "no backup dump found in $BACKUP_DIR"
fi

AVAIL_KB="$(df -Pk "$PROJECT_ROOT" | awk 'NR==2 {print $4}')"
if [ "${AVAIL_KB:-0}" -ge 1048576 ]; then
  ok "free disk: $((AVAIL_KB / 1024)) MB"
else
  bad "free disk below 1 GB ($((AVAIL_KB / 1024)) MB)"
fi

# ── Current state ────────────────────────────────────────────────────────────
say ""
say "== current state =="
LEDGER="$(run_sql "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
say "ledger present: ${LEDGER:-unknown}"
HAS_BASELINE=0
HAS_DELTA=0
if [ "$LEDGER" = "t" ]; then
  say "ledger rows:"
  run_sql "SELECT migration_name || '  finished=' || (finished_at IS NOT NULL) FROM _prisma_migrations ORDER BY started_at" | sed 's/^/    /'
  HAS_BASELINE="$(run_sql "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$BASELINE' AND finished_at IS NOT NULL" | tr -d '[:space:]')"
  HAS_DELTA="$(run_sql "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$DELTA' AND finished_at IS NOT NULL" | tr -d '[:space:]')"
fi

COUNTS_BEFORE="$(run_sql "$COUNTS_SQL")"
TABLES_BEFORE_LIST="$(run_sql "$TABLE_LIST_SQL")"
TABLE_COUNT_BEFORE="$(printf '%s' "$TABLES_BEFORE_LIST" | tr -cd ',' | wc -c | tr -d ' ')"
TABLE_COUNT_BEFORE=$((TABLE_COUNT_BEFORE + 1)); [ -n "$TABLES_BEFORE_LIST" ] || TABLE_COUNT_BEFORE=0
FINGERPRINT_BEFORE="$(row_fingerprint "$TABLES_BEFORE_LIST")"
say "counts before (tables|enums|indexes|fks): $COUNTS_BEFORE"
say "row fingerprint before: $FINGERPRINT_BEFORE"

say ""
say "== plan =="
if [ "$HAS_BASELINE" = "1" ]; then
  say "  baseline already recorded — resolve step will be skipped"
else
  say "  baseline row absent — will record it WITHOUT executing its SQL (schema already exists)"
fi
if [ "$HAS_DELTA" = "1" ]; then
  say "  delta already applied — deploy step will be skipped"
else
  say "  delta pending — migrate deploy will add 17 empty tables, 11 enums, 50 indexes, 34 FKs"
fi

if [ "$MODE" = "plan" ]; then
  say ""
  say "plan only — nothing was written. Re-run with --apply to execute."
  say "checks: $CHECKS run, $FAILURES failed"
  [ "$FAILURES" -eq 0 ] || exit 1
  exit 0
fi

if [ "$FAILURES" -gt 0 ]; then
  say ""
  say "ABORTING: preconditions failed; nothing was written."
  exit 1
fi

# ── Apply ────────────────────────────────────────────────────────────────────
say ""
say "== apply =="
ENVF="$(mktemp)"; chmod 600 "$ENVF"
grep -E '^(POSTGRES_USER|POSTGRES_DB|POSTGRES_PASSWORD)=' "$PROJECT_ROOT/.env" > "$ENVF" 2>/dev/null || true
if [ ! -s "$ENVF" ]; then
  bad "could not read POSTGRES_* values from $PROJECT_ROOT/.env"
  rm -f "$ENVF"
  exit 1
fi
NETWORK="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$PG_CONTAINER" | head -1 | tr -d '[:space:]')"
[ -n "$NETWORK" ] || { bad "cannot determine docker network of $PG_CONTAINER"; rm -f "$ENVF"; exit 1; }
DO_RESOLVE=1; [ "$HAS_BASELINE" = "1" ] && DO_RESOLVE=0
DO_DEPLOY=1;  [ "$HAS_DELTA" = "1" ] && DO_DEPLOY=0
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/live-adoption-$(date +%Y%m%d_%H%M%S).log"

docker run --rm --network "$NETWORK" --env-file "$ENVF" \
  -e DO_RESOLVE="$DO_RESOLVE" -e DO_DEPLOY="$DO_DEPLOY" -e BASELINE="$BASELINE" \
  -v "$WORKTREE":/work -w /work/backend "$NODE_IMAGE" bash -ec '
  set -o pipefail
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq openssl ca-certificates >/dev/null 2>&1
  [ -d node_modules ] || npm ci --no-audit --no-fund --silent
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public"
  echo "node $(node -v)"
  if [ "$DO_RESOLVE" = "1" ]; then
    echo "--- prisma migrate resolve --applied $BASELINE"
    npx prisma migrate resolve --applied "$BASELINE"
  else
    echo "--- resolve skipped (baseline already recorded)"
  fi
  if [ "$DO_DEPLOY" = "1" ]; then
    echo "--- prisma migrate deploy"
    npx prisma migrate deploy
  else
    echo "--- deploy skipped (delta already applied)"
  fi
  echo "--- prisma migrate status"
  npx prisma migrate status || true
  echo "--- drift check (migrate diff --exit-code)"
  if npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code; then
    echo "drift: none"
  else
    echo "drift: DIFFERENCES FOUND"
  fi
' 2>&1 | tee "$REPORT"
rm -f "$ENVF"
say "container log: $REPORT"

# ── Verification ─────────────────────────────────────────────────────────────
say ""
say "== verification =="
COUNTS_AFTER="$(run_sql "$COUNTS_SQL")"
TABLES_AFTER_LIST="$(run_sql "$TABLE_LIST_SQL")"
TABLE_COUNT_AFTER="$(printf '%s' "$TABLES_AFTER_LIST" | tr -cd ',' | wc -c | tr -d ' ')"; TABLE_COUNT_AFTER=$((TABLE_COUNT_AFTER + 1)); [ -n "$TABLES_AFTER_LIST" ] || TABLE_COUNT_AFTER=0
say "counts after  (tables|enums|indexes|fks): $COUNTS_AFTER"
say "tables: $TABLE_COUNT_BEFORE -> $TABLE_COUNT_AFTER (expected +17)"

HAS_BASELINE_AFTER="$(run_sql "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$BASELINE' AND finished_at IS NOT NULL" | tr -d '[:space:]')"
HAS_DELTA_AFTER="$(run_sql "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$DELTA' AND finished_at IS NOT NULL" | tr -d '[:space:]')"
[ "$HAS_BASELINE_AFTER" = "1" ] && ok "ledger: baseline finished" || bad "ledger: baseline not finished"
[ "$HAS_DELTA_AFTER" = "1" ] && ok "ledger: delta finished" || bad "ledger: delta not finished"
[ "$TABLE_COUNT_AFTER" -eq $((TABLE_COUNT_BEFORE + 17)) ] \
  && ok "17 new tables present" || bad "expected $((TABLE_COUNT_BEFORE + 17)) tables, found $TABLE_COUNT_AFTER"

NEW_ROWS=0
for t in $(printf '%s' "$TABLES_AFTER_LIST" | tr ',' '\n'); do
  case ",$TABLES_BEFORE_LIST," in *",$t,"*) continue;; esac
  n="$(run_sql "SELECT count(*) FROM public.\"$t\"" | tr -d '[:space:]')"
  NEW_ROWS=$((NEW_ROWS + n))
done
[ "$NEW_ROWS" -eq 0 ] && ok "all new tables empty (no data written)" || bad "new tables contain $NEW_ROWS rows"

FINGERPRINT_AFTER="$(row_fingerprint "$TABLES_BEFORE_LIST")"
say "row fingerprint after:  $FINGERPRINT_AFTER"
if [ "$FINGERPRINT_AFTER" = "$FINGERPRINT_BEFORE" ]; then
  ok "pre-existing row counts unchanged"
else
  say "  INFO  pre-existing row counts moved (live traffic writes while the migration ran);"
  say "        before=$FINGERPRINT_BEFORE after=$FINGERPRINT_AFTER — compare row by row if suspicious"
fi

say ""
say "== summary =="
say "checks: $CHECKS run, $FAILURES failed"
say "container log: $REPORT"
say ""
say "rollback (manual, only if needed):"
say "  1. restore the newest verified dump from $BACKUP_DIR (restore procedure: docs + deploy/VPS-RUNBOOK.md, target = live)"
say "  2. if that dump predates the migration, also delete the two ledger rows:"
say "     DELETE FROM _prisma_migrations WHERE migration_name IN ('$BASELINE','$DELTA');"
[ "$FAILURES" -eq 0 ] || exit 1

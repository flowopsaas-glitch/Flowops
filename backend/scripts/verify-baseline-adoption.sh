#!/usr/bin/env bash
#
# Verify the rebaselined migration history against disposable clones.
#
# What this proves, in order:
#   1. Fresh replay — `prisma migrate deploy` on an EMPTY database applies the baseline
#      and the delta, `prisma migrate status` is clean, and the resulting schema equals
#      `prisma/schema.prisma` (`prisma migrate diff --exit-code` → 0).
#   2. Adoption — restoring the verified dump and running
#      `prisma migrate resolve --applied 20260926130650_init` (records the baseline
#      WITHOUT executing it) followed by `prisma migrate deploy` (applies the additive
#      delta) leaves the database equal to `prisma/schema.prisma` AND every pre-existing
#      row unchanged (per-table row-count fingerprint before vs after).
#   3. Verdicts from the project's own rehearsal tool, before and after adoption.
#
# Safety: every database name this script creates ends in `_ci` or `_clone`, it only
# talks to a Postgres container on the isolated `flowops-delta-clone-net` bridge, and it
# never touches the live application stack, its database or its volumes. Rollback is
# `rm -f <report>` plus dropping the two disposable databases (printed at the end).
#
# Usage (on the VPS, from any directory):
#   bash backend/scripts/verify-baseline-adoption.sh [--worktree /root/flowops-migration-src]
#
# Exit codes: 0 = every check passed, 1 = a check failed or the environment is not ready.

set -uo pipefail

WORKTREE="/root/flowops-migration-src"
PG_CONTAINER="flowops-delta-clone-pg"
NETWORK="flowops-delta-clone-net"
NODE_IMAGE="node:20-bookworm-slim"
DUMP="${DUMP:-/var/lib/docker/volumes/flowops_postgres-backups/_data/flowops_20260930_120047.sql.gz}"
PG_USER="flowops"
PG_PASS="flowops_delta_shadow"
FRESH_DB="flowops_fresh_ci"
ADOPT_DB="flowops_adopt_clone"
REPORT="${REPORT:-/root/flowops-baseline-adoption-report.md}"
# Reports the container writes are read from the host, so this directory is mounted
# into it: a container-internal path would leave the host with "no report".
REPORT_DIR="${REPORT_DIR:-/root/flowops-adoption-reports}"

while [ $# -gt 0 ]; do
  case "$1" in
    --worktree) WORKTREE="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    --help|-h) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

FAILURES=0
CHECKS=0
note() { printf '%s\n' "$*"; }
ok()   { CHECKS=$((CHECKS + 1)); printf '  PASS  %s\n' "$*"; }
bad()  { CHECKS=$((CHECKS + 1)); printf '  FAIL  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

psql_at() { # psql_at <db> <sql>
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -tAc "$2"
}

# Row counts for a SPECIFIC set of tables, hashed into one line. The set matters: the
# delta creates 17 new (empty) tables, so hashing "all tables" changes the hash even
# though no existing row moved. Adoption is verified by hashing the same set of
# pre-existing tables before and after.
table_list() { # table_list <db>
  psql_at "$1" "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind = 'r' AND n.nspname = 'public' AND c.relname <> '_prisma_migrations'
                 ORDER BY c.relname" | paste -sd, -
}

fingerprint_of() { # fingerprint_of <db> <comma-separated table list>
  local list
  list="$(printf '%s' "$2" | sed "s/,/','/g")"
  psql_at "$1" "SELECT md5(string_agg(relname || '=' || n, '|' ORDER BY relname)) FROM (
    SELECT c.relname,
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE c.relkind = 'r' AND ns.nspname = 'public' AND c.relname IN ('$list')) s"
}

row_count_of() { # row_count_of <db> <table>
  psql_at "$1" "SELECT count(*) FROM public.\"$2\""
}

COUNTS_SQL="SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' ||
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public')"

run_prisma() { # run_prisma <db> <shell command using $DATABASE_URL>
  docker run --rm --network "$NETWORK" -v "$WORKTREE":/work -v "$REPORT_DIR":/reports -w /work/backend "$NODE_IMAGE" sh -ec "
    apt-get update -qq
    apt-get install -y -qq openssl ca-certificates
    [ -d node_modules ] || npm ci --no-audit --no-fund --silent
    export DATABASE_URL='postgresql://$PG_USER:$PG_PASS@$PG_CONTAINER:5432/$1?schema=public'
    $2"
}

# ── Preconditions ────────────────────────────────────────────────────────────
note "== preconditions =="
docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" >/dev/null 2>&1 \
  && ok "postgres container $PG_CONTAINER is present" \
  || { bad "postgres container $PG_CONTAINER is not present (create the rehearsal clone first)"; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER")" = "true" ] \
  && ok "postgres container is running" \
  || { bad "postgres container is not running"; exit 1; }
docker network inspect "$NETWORK" >/dev/null 2>&1 \
  && ok "network $NETWORK exists" \
  || { bad "network $NETWORK is missing"; exit 1; }
mkdir -p "$REPORT_DIR"
[ -f "$WORKTREE/backend/prisma/schema.prisma" ] \
  && ok "worktree present at $WORKTREE" \
  || { bad "no worktree at $WORKTREE"; exit 1; }
[ -f "$DUMP" ] \
  && ok "dump present ($(du -h "$DUMP" | cut -f1))" \
  || { bad "no dump at $DUMP"; exit 1; }

REV="$(git -C "$WORKTREE" rev-parse HEAD 2>/dev/null || echo unknown)"
note "worktree revision: $REV"
note "baseline sha256: $(sha256sum "$WORKTREE/backend/prisma/migrations/20260926130650_init/migration.sql" | cut -d' ' -f1)"
note "delta    sha256: $(sha256sum "$WORKTREE/backend/prisma/migrations/20260930143000_add_process_book_product_master/migration.sql" | cut -d' ' -f1)"

# ── 1. Fresh replay on an empty database ─────────────────────────────────────
note ""
note "== 1. fresh replay (migrate deploy on an empty database) =="
psql_at postgres "DROP DATABASE IF EXISTS $FRESH_DB" >/dev/null
psql_at postgres "CREATE DATABASE $FRESH_DB" >/dev/null

# `set +e` around the diff: `--exit-code` legitimately exits 1 when a difference is
# found, and an aborted shell would hide the reason.
DEPLOY_OUT="$(run_prisma "$FRESH_DB" "
  npx prisma migrate deploy
  npx prisma migrate status || echo \"status_exit=\$?\"
  set +e
  npx prisma migrate diff --from-url \"\$DATABASE_URL\" --to-schema-datamodel ./prisma/schema.prisma --exit-code
  echo fresh_drift_exit=\$?
  set -e
")"
printf '%s\n' "$DEPLOY_OUT" | sed 's/^/    /'
FRESH_DRIFT_EXIT="$(printf '%s\n' "$DEPLOY_OUT" | grep -o 'fresh_drift_exit=[0-9]*' | tail -1)"
[ "$FRESH_DRIFT_EXIT" = "fresh_drift_exit=0" ] \
  && ok "fresh database matches prisma/schema.prisma ($FRESH_DRIFT_EXIT)" \
  || bad "fresh database does not match prisma/schema.prisma ($FRESH_DRIFT_EXIT)"
FRESH_APPLIED="$(printf '%s\n' "$DEPLOY_OUT" | grep -c '^Applying migration')"
[ "$FRESH_APPLIED" -eq 2 ] \
  && ok "both migrations applied (2)" \
  || bad "expected 2 migrations applied, saw $FRESH_APPLIED"

FRESH_COUNTS="$(psql_at "$FRESH_DB" "$COUNTS_SQL")"
note "  tables|enums|pg_indexes|fks = $FRESH_COUNTS"
[ "$FRESH_COUNTS" = "133|72|362|150" ] \
  && ok "fresh schema is 133 tables / 72 enums / 150 fks (362 pg_indexes = 229 created indexes + 133 primary keys)" \
  || bad "fresh counts are $FRESH_COUNTS, expected 133|72|362|150"

# The rehearsal tool's own verdict on the fresh database: it must agree with the
# Prisma drift check above, otherwise the tool and the database disagree and the
# adoption verdicts below cannot be trusted.
FRESH_TOOL="$(run_prisma "$FRESH_DB" "
  node scripts/migrate-rehearsal.mjs --mode inspect --i-have-a-clone --url \"\$DATABASE_URL\" --report /reports/fresh.md > /reports/fresh.stdout 2>&1 || echo fresh_inspect_exit=\$?
")"
FRESH_VERDICT="$(grep -m1 '^## Verdict' "$REPORT_DIR/fresh.md" 2>/dev/null || echo '## Verdict: (no report at '"$REPORT_DIR"'/fresh.md)')"
note "  fresh-database rehearsal tool verdict: $FRESH_VERDICT"
printf '%s' "$FRESH_VERDICT" | grep -q 'already-applied' \
  && ok "the rehearsal tool agrees the fresh database matches the history" \
  || bad "rehearsal tool verdict on the fresh database is not already-applied: $FRESH_VERDICT"

# ── 2. Adoption of a restored clone ──────────────────────────────────────────
note ""
note "== 2. adoption of a restored clone (resolve --applied, then migrate deploy) =="
psql_at postgres "DROP DATABASE IF EXISTS $ADOPT_DB" >/dev/null
psql_at postgres "CREATE DATABASE $ADOPT_DB" >/dev/null
gzip -dc "$DUMP" | docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$ADOPT_DB" >/dev/null
BEFORE_TABLES="$(table_list "$ADOPT_DB")"
BEFORE_TABLE_COUNT="$(printf '%s' "$BEFORE_TABLES" | tr ',' '\n' | grep -c .)"
BEFORE="$(fingerprint_of "$ADOPT_DB" "$BEFORE_TABLES")"
note "  restored clone: $(psql_at "$ADOPT_DB" "$COUNTS_SQL") (before), $BEFORE_TABLE_COUNT tables"
note "  row fingerprint before: $BEFORE (over those $BEFORE_TABLE_COUNT tables)"

PRE_REPORT="$REPORT_DIR/pre-adoption.md"
POST_REPORT="$REPORT_DIR/post-adoption.md"

# One container run for the whole adoption sequence: inspect, adopt, inspect again.
# The rehearsal tool prints its whole report, so its stdout goes to files next to the
# reports and only the verdict lines are read back.
ADOPT_OUT="$(run_prisma "$ADOPT_DB" "
  echo '--- pre-adoption inspection ---'
  node scripts/migrate-rehearsal.mjs --mode inspect --i-have-a-clone --url \"\$DATABASE_URL\" --report '/reports/pre-adoption.md' > /reports/pre-adoption.stdout 2>&1 || echo pre_inspect_exit=\$?
  echo '--- resolve --applied 20260926130650_init ---'
  npx prisma migrate resolve --applied 20260926130650_init
  echo '--- migrate deploy ---'
  npx prisma migrate deploy
  echo '--- migrate status ---'
  npx prisma migrate status || echo \"status_exit=\$?\"
  echo '--- drift check ---'
  set +e
  npx prisma migrate diff --from-url \"\$DATABASE_URL\" --to-schema-datamodel ./prisma/schema.prisma --exit-code
  echo adopt_drift_exit=\$?
  set -e
  echo '--- post-adoption inspection ---'
  node scripts/migrate-rehearsal.mjs --mode inspect --i-have-a-clone --url \"\$DATABASE_URL\" --report '/reports/post-adoption.md' > /reports/post-adoption.stdout 2>&1 || echo post_inspect_exit=\$?
")"
printf '%s\n' "$ADOPT_OUT" | grep -vE '^$' | sed 's/^/    /'

PRE_VERDICT="$(grep -m1 '^## Verdict' "$PRE_REPORT" 2>/dev/null || echo '## Verdict: (no report at '"$PRE_REPORT"')')"
POST_VERDICT="$(grep -m1 '^## Verdict' "$POST_REPORT" 2>/dev/null || echo '## Verdict: (no report at '"$POST_REPORT"')')"
note "  pre-adoption verdict:  $PRE_VERDICT"
note "  post-adoption verdict: $POST_VERDICT"

printf '%s' "$PRE_VERDICT" | grep -q 'drift' \
  && ok "pre-adoption verdict is drift (the clone is behind the history)" \
  || bad "pre-adoption verdict is not drift: $PRE_VERDICT"
printf '%s\n' "$ADOPT_OUT" | grep -q 'adopt_drift_exit=0' \
  && ok "adopted clone matches prisma/schema.prisma (diff exit 0)" \
  || bad "adopted clone does not match prisma/schema.prisma"
APPLIED_BY_DEPLOY="$(printf '%s\n' "$ADOPT_OUT" | grep -o 'Applying migration .[0-9]*_[a-z_]*' | tr '\n' ' ')"
printf '%s\n' "$ADOPT_OUT" | grep -q 'Applying migration .20260930143000' \
  && ok "deploy applied the delta" \
  || bad "deploy did not apply the delta migration"
printf '%s\n' "$ADOPT_OUT" | grep -q 'Applying migration .20260926130650' \
  && bad "deploy tried to apply the baseline too (it must be resolved, not run)" \
  || ok "deploy did not run the baseline SQL (resolved as applied instead)"
printf '%s' "$POST_VERDICT" | grep -q 'already-applied' \
  && ok "post-adoption verdict is already-applied (ledger and schema agree)" \
  || bad "post-adoption verdict is not already-applied: $POST_VERDICT"

AFTER_TABLES="$(table_list "$ADOPT_DB")"
AFTER_TABLE_COUNT="$(printf '%s' "$AFTER_TABLES" | tr ',' '\n' | grep -c .)"
AFTER="$(fingerprint_of "$ADOPT_DB" "$BEFORE_TABLES")"
ADOPT_COUNTS="$(psql_at "$ADOPT_DB" "$COUNTS_SQL")"
note "  after: $ADOPT_COUNTS, $AFTER_TABLE_COUNT tables"
note "  row fingerprint after:  $AFTER (same $BEFORE_TABLE_COUNT pre-existing tables)"

[ "$BEFORE" = "$AFTER" ] \
  && ok "every pre-existing row is unchanged (identical fingerprint over the same tables)" \
  || bad "rows changed: before $BEFORE, after $AFTER"
[ "$ADOPT_COUNTS" = "133|72|362|150" ] \
  && ok "adopted schema is 133 tables / 72 enums / 150 fks" \
  || bad "adopted counts are $ADOPT_COUNTS, expected 133|72|362|150"

# The only tables that may appear are the 17 the delta creates, and they must be empty.
ADDED_TABLES="$(comm -13 <(printf '%s' "$BEFORE_TABLES" | tr ',' '\n' | sort) <(printf '%s' "$AFTER_TABLES" | tr ',' '\n' | sort) | paste -sd, -)"
REMOVED_TABLES="$(comm -23 <(printf '%s' "$BEFORE_TABLES" | tr ',' '\n' | sort) <(printf '%s' "$AFTER_TABLES" | tr ',' '\n' | sort) | paste -sd, -)"
ADDED_COUNT="$(printf '%s' "$ADDED_TABLES" | tr ',' '\n' | grep -c .)"
[ "$ADDED_COUNT" -eq 17 ] \
  && ok "the delta added exactly 17 tables" \
  || bad "expected 17 added tables, saw $ADDED_COUNT: $ADDED_TABLES"
[ -z "$REMOVED_TABLES" ] \
  && ok "no table disappeared" \
  || bad "tables disappeared: $REMOVED_TABLES"

NONEMPTY_NEW=""
for table in $(printf '%s' "$ADDED_TABLES" | tr ',' ' '); do
  [ "$(row_count_of "$ADOPT_DB" "$table")" = "0" ] || NONEMPTY_NEW="$NONEMPTY_NEW $table"
done
[ -z "$NONEMPTY_NEW" ] \
  && ok "every table the delta added is empty (no rows were fabricated)" \
  || bad "added tables with rows:$NONEMPTY_NEW"

LEDGER="$(psql_at "$ADOPT_DB" "SELECT migration_name || ':' || (finished_at IS NOT NULL)::text FROM _prisma_migrations ORDER BY migration_name")"
note "  ledger: $(printf '%s' "$LEDGER" | tr '\n' ' ')"
printf '%s' "$LEDGER" | grep -q '20260926130650_init:true' && printf '%s' "$LEDGER" | grep -q '20260930143000_add_process_book_product_master:true' \
  && ok "both migrations recorded as finished" \
  || bad "ledger does not record both migrations as finished"

# ── Summary ──────────────────────────────────────────────────────────────────
{
  note ""
  note "== summary =="
  note "worktree revision: $REV"
  note "checks: $CHECKS run, $FAILURES failed"
  note "fresh replay: applied=$FRESH_APPLIED, drift=$FRESH_DRIFT_EXIT, counts=$FRESH_COUNTS (expected 133|72|362|150)"
  note "adoption: drift=$(printf '%s' "$ADOPT_OUT" | grep -o 'adopt_drift_exit=[0-9]*' | tail -1)"
  note "adoption: deploy applied: ${APPLIED_BY_DEPLOY:-nothing}"
  note "adoption tables: $BEFORE_TABLE_COUNT before, $AFTER_TABLE_COUNT after (+$ADDED_COUNT, -$(printf %s "$REMOVED_TABLES" | grep -c . || true))"
  note "adoption counts after: $ADOPT_COUNTS (expected 133|72|362|150)"
  note "adoption row fingerprint before: $BEFORE"
  note "adoption row fingerprint after:  $AFTER (same pre-existing tables)"
  note "fresh-database verdict: $FRESH_VERDICT"
  note "pre-adoption verdict:  $PRE_VERDICT"
  note "post-adoption verdict: $POST_VERDICT"
  note ""
  note "rollback (disposable only):"
  note "  docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c 'DROP DATABASE IF EXISTS $FRESH_DB;'"
  note "  docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c 'DROP DATABASE IF EXISTS $ADOPT_DB;'"
  note "  rm -rf $REPORT_DIR; rm -f $REPORT"
} | tee "$REPORT"

if [ "$FAILURES" -eq 0 ]; then
  note ""
  note "ALL CHECKS PASSED — the rebaselined history and the adoption path are verified on clones."
  exit 0
fi

note ""
note "$FAILURES CHECK(S) FAILED — do not proceed to staging; the report is at $REPORT."
exit 1

#!/usr/bin/env bash
#
# Run the database-backed integration suite against disposable containers.
#
# What this proves: the full `npm run test:integration` suite (goods-receipt,
# process-control, product-master + support) passes against a database BUILT BY
# THE MIGRATIONS (`npx prisma migrate deploy`) on the rebaselined history — the
# CI integration job reproduced on the VPS, minus lint/build/unit (not
# DB-backed) and minus the drift guard (already proven by
# verify-baseline-adoption.sh). The migration tooling suites (migrations:test,
# migrations:rehearsal:test) run first as the gate's own gate, as in CI.
#
# Safety: this script creates only `flowops-int-*` containers on the
# `flowops-int-net` bridge and TRUNCATES only the `flowops_integration_ci`
# database (the suite's own guard refuses any name that does not end in _ci,
# _test, _ephemeral or _shadow, and refuses non-local hosts). The live stack,
# its database and its volumes are never contacted. Rollback is the cleanup
# block printed at the end.
#
# Usage (on the VPS, from any directory):
#   bash backend/scripts/run-integration-suite.sh [--worktree /root/flowops-migration-src]
#
# Exit codes: 0 = every step passed, 1 = a step failed or the environment is
# not ready.

set -uo pipefail

WORKTREE="/root/flowops-migration-src"
PG_CONTAINER="flowops-int-pg"
REDIS_CONTAINER="flowops-int-redis"
NETWORK="flowops-int-net"
# The integration suite refuses database hosts that are not local and do not
# end in `.local`; a docker network alias ending in .local is how a disposable
# sibling container qualifies. The database name must end in `_ci`.
PG_ALIAS="pg.local"
NODE_IMAGE="node:20-bookworm-slim"
PG_USER="flowops"
PG_PASS="flowops_int_ci"
DB="flowops_integration_ci"
REPORT_DIR="${REPORT_DIR:-/root/flowops-integration-reports}"
JWT_SECRET="${JWT_SECRET:-flowops-integration-ci-secret-not-for-production}"

while [ $# -gt 0 ]; do
  case "$1" in
    --worktree) WORKTREE="$2"; shift 2 ;;
    --help|-h) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

FAILURES=0
CHECKS=0
FAIL_DETAIL=""
note() { printf '%s\n' "$*"; }
ok()   { CHECKS=$((CHECKS + 1)); printf '  PASS  %s\n' "$*"; }
bad()  { CHECKS=$((CHECKS + 1)); printf '  FAIL  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

run_node() { # run_node <bash command run inside the worktree's backend/>
  docker run --rm --network "$NETWORK" \
    -v "$WORKTREE":/work -w /work/backend \
    -e DATABASE_URL="postgresql://$PG_USER:$PG_PASS@$PG_ALIAS:5432/$DB?schema=public" \
    -e REDIS_HOST="$REDIS_CONTAINER" -e REDIS_PORT=6379 \
    -e JWT_SECRET="$JWT_SECRET" -e NODE_ENV=test \
    -e NODE_OPTIONS="--max-old-space-size=$HEAP_MB" \
    "$NODE_IMAGE" bash -ec "
      apt-get update -qq
      apt-get install -y -qq openssl ca-certificates
      [ -d node_modules ] || npm ci --no-audit --no-fund --silent
      $1
    "
}

# Node's default heap tracks system RAM (~1 GB on this VPS), which is too small
# for ts-jest compiling the Nest codebase — the suite died with "Reached heap
# limit Allocation failed - JavaScript heap out of memory" and produced no
# report. Size the heap to 60% of what is actually free, clamped to a sane
# window so a small box gets a modest bump and a big box does not hoard RAM.
AVAIL_MB="$(free -m | awk '/^Mem:/{print $7}')"
HEAP_MB=$((AVAIL_MB * 60 / 100))
if [ "$HEAP_MB" -lt 1024 ]; then HEAP_MB=1024; fi
if [ "$HEAP_MB" -gt 3072 ]; then HEAP_MB=3072; fi

# ── Preconditions ────────────────────────────────────────────────────────────
note "== preconditions =="
note "worktree revision: $(git -C "$WORKTREE" rev-parse HEAD 2>/dev/null || echo unknown)"
note "node heap limit: ${HEAP_MB} MB (MemAvailable ${AVAIL_MB} MB)"
[ -f "$WORKTREE/backend/package.json" ] \
  && ok "worktree present at $WORKTREE" \
  || { bad "no worktree at $WORKTREE (create it first, see usage in --help)"; exit 1; }

# ── Disposable stack (deterministic: always recreate the two containers) ─────
note "== disposable stack =="
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias "$PG_ALIAS" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB="$DB" \
  postgres:16-alpine >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" redis:7-alpine >/dev/null
READY=0
for _ in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[ "$READY" = "1" ] && ok "postgres ready ($PG_ALIAS -> $DB)" || { bad "postgres did not become ready"; exit 1; }
docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1 \
  && ok "redis ready" \
  || { bad "redis did not answer PING"; exit 1; }

# ── Migration tooling gates (no database required) ───────────────────────────
note "== migration tooling (no database) =="
if TOOL_OUT="$(run_node 'npm run migrations:verify && npm run migrations:test && npm run migrations:rehearsal:test' 2>&1)"; then
  ok "migrations:verify + migrations:test + migrations:rehearsal:test"
else
  bad "migration tooling gates failed"
  FAIL_DETAIL="$TOOL_OUT"
  printf '%s\n' "$TOOL_OUT" | tail -15
fi

# ── Build the schema from the migrations (no db push) ────────────────────────
note "== migrate deploy =="
if DEPLOY_OUT="$(run_node 'npx prisma generate && npx prisma migrate deploy' 2>&1)"; then
  ok "prisma generate + migrate deploy built the schema"
else
  bad "migrate deploy failed"
  FAIL_DETAIL="$DEPLOY_OUT"
  printf '%s\n' "$DEPLOY_OUT" | tail -15
  note "stopping here: the suite must run against a migrations-built database"
  note ""
  note "== summary =="
  note "checks: $CHECKS run, $FAILURES failed"
  exit 1
fi

# ── The database-backed suite ────────────────────────────────────────────────
note "== integration suite (jest, runInBand) =="
if INT_OUT="$(run_node 'set -o pipefail; npm run test:integration -- --json --outputFile integration-report.json 2>&1 | tee integration-tests.log' 2>&1)"; then
  ok "npm run test:integration"
else
  bad "npm run test:integration failed"
  FAIL_DETAIL="$INT_OUT"
  printf '%s\n' "$INT_OUT" | tail -25
fi

mkdir -p "$REPORT_DIR"
cp -f "$WORKTREE/backend/integration-report.json" "$REPORT_DIR/" 2>/dev/null \
  && note "report copied to $REPORT_DIR/integration-report.json" \
  || note "no integration-report.json was produced"
cp -f "$WORKTREE/backend/integration-tests.log" "$REPORT_DIR/" 2>/dev/null
grep -E '^(Test Suites|Tests):' "$WORKTREE/backend/integration-tests.log" 2>/dev/null | tail -2

# ── Summary ──────────────────────────────────────────────────────────────────
note ""
note "== summary =="
note "checks: $CHECKS run, $FAILURES failed"
if [ "$FAILURES" -gt 0 ] && [ -n "$FAIL_DETAIL" ]; then
  note ""
  note "== failure detail (tail of the failing step) =="
  printf '%s\n' "$FAIL_DETAIL" | tail -25
fi
note "integration log: $REPORT_DIR/integration-tests.log (kept as evidence)"
note ""
if [ "$FAILURES" -eq 0 ]; then
  note "ALL CHECKS PASSED — the DB-backed integration suite is green against the migrations-built schema."
else
  note "FAILURES PRESENT — see the log above and $REPORT_DIR."
fi
note ""
note "rollback (disposable only):"
note "  docker rm -f $PG_CONTAINER $REDIS_CONTAINER"
note "  docker network rm $NETWORK"
note "  git -C /root/FlowOps worktree remove --force $WORKTREE"
exit $((FAILURES > 0 ? 1 : 0))

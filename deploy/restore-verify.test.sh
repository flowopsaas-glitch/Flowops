#!/usr/bin/env bash
#
# FlowOps — behaviour tests for deploy/restore-verify.sh.
#
# No Docker, no Postgres. `docker` is stubbed on PATH, so what runs here is the
# script's real ordering and decision logic with fake hands.
#
# WHY THIS EXISTS
# ---------------
# This script is the disaster path. It runs for the first time on the worst day
# you have with this system, which is precisely why it needs a test: it gets no
# second chance to be right.
#
# The defect it pins, found on review and never reported by an operator:
#
#   --restore-live dropped `public` on the LIVE database first, then restored
#   into the wreckage. Two things failed together:
#
#     1. a dump that could not load left you with an empty database, and
#     2. psql without ON_ERROR_STOP prints SQL errors and still EXITS 0, so the
#        script logged "LIVE restore complete" over a half-loaded database.
#
#   The one moment this script exists for was the moment that ordering failed.
#   item2-r2-runner.sh, which does the same job for the R2 path, already gets
#   it right — it passes ON_ERROR_STOP=1. That asymmetry is the proof this was
#   an oversight rather than a design choice.
#
# So these tests assert ORDER, not just outcome. "It exited 0" is not the
# question; "did DROP SCHEMA run before the dump was proven?" is.
#
# Run:  ./deploy/restore-verify.test.sh    (also wired into the CI Tooling Guards job)
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/deploy/restore-verify.sh"

TMPROOT="$(mktemp -d)"
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: $SCRIPT not found" >&2
  exit 1
fi

PASSED=0
FAILED=0
ok()  { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
no()  { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
section() { echo ""; echo "$1"; }

# A dump that loads but carries no tenant data — the shape that must never be
# restored over a live database.
ZERO_COUNTS="companies: 0
users: 0
drivers: 0
waybills: 0
collections: 0"

# ── a sandbox per case: a docker stub + a healthy dump fixture ───────────────

new_case() {
  local d
  d="$(mktemp -d "$TMPROOT/case.XXXXXX")"
  mkdir -p "$d/bin" "$d/tmp"
  : >"$d/stub.log"

  cat >"$d/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Every invocation is recorded, in order, so tests can assert on ORDERING.
printf '%s\n' "$*" >>"$STUB_LOG"

# Work out which psql this is.
#
#   - a LOAD pipes a dump in on stdin: it has -i and no -c.
#   - a one-off SQL command has -c. The `DROP SCHEMA public CASCADE` call also
#     carries -i (harmlessly, since psql with -c never reads stdin), so -i
#     alone is NOT enough to tell them apart — without the -c test this stub
#     fails the drop instead of the load, and case 5 passes for the wrong
#     reason.
#   - the LIVE load targets the production database, not a flowops_verify_ one.
target_db=""; is_load=0; has_c=0; prev=""
for a in "$@"; do
  case "$prev" in -d) target_db="$a" ;; -c) has_c=1 ;; esac
  [ "$a" = "-i" ] && is_load=1
  prev="$a"
done

if [ "$is_load" = "1" ] && [ "$has_c" = "0" ] \
   && [ "$target_db" = "${STUB_LIVE_DB:-flowops}" ] \
   && [[ "$target_db" != flowops_verify_* ]]; then
  cat >/dev/null || true
  exit "${STUB_LIVE_LOAD_EXIT:-0}"
fi

for a in "$@"; do
  case "$a" in
    # The core-table count query. Its output decides pass/fail, so it is the
    # one command whose stdout the script actually parses.
    *"SELECT 'companies'"*)
      printf '%s\n' "${STUB_COUNTS:-companies: 2
users: 5
drivers: 3
waybills: 40
collections: 7}"
      exit "${STUB_COUNTS_EXIT:-0}"
      ;;
  esac
done

# Any other psql reading a dump from stdin must DRAIN it. If it exits early the
# writer gets SIGPIPE, and under `set -o pipefail` that alone fails the load —
# the same class of bug as backup-to-r2.sh's header check.
[ "$is_load" = "1" ] && cat >/dev/null
exit "${STUB_PSQL_EXIT:-0}"
STUB

  chmod +x "$d/bin/docker"

  # Clears the script's own 10KB floor. Random bytes do not compress, so the
  # gzipped size stays above it.
  { printf -- '--\n-- PostgreSQL database dump\n--\n'; head -c 20480 /dev/urandom; } \
    | gzip >"$d/dump.sql.gz"

  echo "$d"
}

run_script() {
  local d="$1"; shift
  (
    export PATH="$d/bin:$PATH"
    export STUB_LOG="$d/stub.log"
    export RESTORE_GRACE_SECONDS=0
    export VERIFY_ERR_FILE="$d/tmp/verify_err"
    export VERIFY_COUNTS_ERR_FILE="$d/tmp/counts_err"
    export PG_CONTAINER=flowops-postgres-1
    export POSTGRES_USER=flowops
    export POSTGRES_DB=flowops
    # Knobs are forwarded only when the caller set them, so a case reads as
    #   rc="$( STUB_X=1; run_script "$d" ... )"
    # and the subshell keeps that setting from leaking into the next case.
    [ -n "${STUB_COUNTS:-}" ]         && export STUB_COUNTS
    [ -n "${STUB_COUNTS_EXIT:-}" ]    && export STUB_COUNTS_EXIT
    [ -n "${STUB_PSQL_EXIT:-}" ]      && export STUB_PSQL_EXIT
    [ -n "${STUB_LIVE_LOAD_EXIT:-}" ] && export STUB_LIVE_LOAD_EXIT
    bash "$SCRIPT" "$@" >"$d/out.log" 2>&1
  )
  echo "$?"
}

dropped_live_schema() { grep -c "DROP SCHEMA public CASCADE" "$1/stub.log" 2>/dev/null | tr -d ' '; }
ran_verify()          { grep -c "CREATE DATABASE flowops_verify" "$1/stub.log" 2>/dev/null | tr -d ' '; }
used_on_error_stop()  { grep -c "ON_ERROR_STOP=1" "$1/stub.log" 2>/dev/null | tr -d ' '; }

# ── 1. verify mode ──────────────────────────────────────────────────────────

section "Verify mode"

d="$(new_case)"
rc="$(run_script "$d" "$d/dump.sql.gz")"
[ "$rc" -eq 0 ] && ok "exits 0 on a healthy dump" || no "exited $rc: $(tail -2 "$d/out.log")"
grep -q "VERIFY PASSED" "$d/out.log" && ok "reports VERIFY PASSED" \
  || no "did not report VERIFY PASSED"
[ "$(dropped_live_schema "$d")" -eq 0 ] && ok "never drops the live schema" \
  || no "verify mode dropped the live schema"

# ── 2. verify mode refuses a dump with no tenant data ───────────────────────

section "Verify mode refuses a dump with no real data"

d="$(new_case)"
rc="$( STUB_COUNTS="$ZERO_COUNTS"; run_script "$d" "$d/dump.sql.gz" )"
[ "$rc" -ne 0 ] && ok "refuses a zero-company dump" || no "accepted a zero-company dump"
grep -q "ZERO companies" "$d/out.log" && ok "refusal names the reason" \
  || no "refusal did not name the reason"

# ── 3. THE REGRESSION: restore-live verifies BEFORE it destroys ─────────────

section "restore-live proves the dump before dropping the live schema"

d="$(new_case)"
# A dump that loads but carries no tenant data. On the original script this
# case silently destroyed the database and then reported success.
rc="$( STUB_COUNTS="$ZERO_COUNTS"; run_script "$d" --restore-live --i-understand "$d/dump.sql.gz" )"
[ "$rc" -ne 0 ] && ok "refuses to restore an unverified dump" \
  || no "proceeded with a dump that did not verify"
[ "$(dropped_live_schema "$d")" -eq 0 ] \
  && ok "DROP SCHEMA never ran — live data survives" \
  || no "dropped the live schema despite a failed verification"
[ "$(ran_verify "$d")" -ge 1 ] && ok "verification actually ran" \
  || no "no verification attempted before the restore"

# ── 4. restore-live on a dump that verifies ─────────────────────────────────

section "restore-live on a dump that verifies"

d="$(new_case)"
rc="$(run_script "$d" --restore-live --i-understand "$d/dump.sql.gz")"
[ "$rc" -eq 0 ] && ok "exits 0" || no "exited $rc: $(tail -2 "$d/out.log")"
[ "$(ran_verify "$d")" -ge 1 ] && ok "verified first" || no "did not verify first"
[ "$(dropped_live_schema "$d")" -eq 1 ] && ok "then dropped the live schema exactly once" \
  || no "live schema drops: $(dropped_live_schema "$d")"
[ "$(used_on_error_stop "$d")" -ge 1 ] \
  && ok "live load uses ON_ERROR_STOP=1" \
  || no "live load lacks ON_ERROR_STOP — partial restores would exit 0"
grep -q "LIVE restore complete" "$d/out.log" && ok "reports completion" \
  || no "did not report completion"

# ── 5. a part-way failure is loud, not a success message ────────────────────

section "A part-way restore failure is loud"

d="$(new_case)"
# Only the LIVE load fails, so verification still passes and the script reaches
# the drop-and-reload. It then has to admit it broke part-way rather than
# printing "LIVE restore complete" over a half-loaded database.
rc="$( STUB_LIVE_LOAD_EXIT=3; run_script "$d" --restore-live --i-understand "$d/dump.sql.gz" )"
[ "$rc" -ne 0 ] && ok "exits non-zero when the live load fails" \
  || no "exited 0 despite a failed live load"
grep -q "RESTORE FAILED PART-WAY" "$d/out.log" && ok "says so explicitly" \
  || no "did not say the restore failed part-way"
if grep -q "LIVE restore complete" "$d/out.log"; then
  no "claimed 'LIVE restore complete' over a failed restore"
else
  ok "does not claim success over a failed restore"
fi

# ── 6. restore-live still requires explicit confirmation ────────────────────

section "restore-live refuses without --i-understand"

d="$(new_case)"
rc="$(run_script "$d" --restore-live "$d/dump.sql.gz")"
[ "$rc" -ne 0 ] && ok "refuses without --i-understand" || no "ran without --i-understand"
[ "$(dropped_live_schema "$d")" -eq 0 ] && ok "nothing dropped" || no "dropped anyway"

# ── 7. the script itself ────────────────────────────────────────────────────

section "Script hygiene"

bash -n "$SCRIPT" && ok "bash -n" || no "syntax error"
[ -x "$SCRIPT" ] && ok "is executable" || no "not executable"
grep -q 'set -euo pipefail' "$SCRIPT" && ok "strict mode" || no "not strict"

# ── result ──────────────────────────────────────────────────────────────────

echo ""
echo "───────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then
  echo "restore-verify: ${PASSED} passed, 0 failed"
  exit 0
fi
echo "restore-verify: ${PASSED} passed, ${FAILED} failed"
exit 1

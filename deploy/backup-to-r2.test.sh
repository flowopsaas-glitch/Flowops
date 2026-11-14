#!/usr/bin/env bash
#
# FlowOps — behaviour tests for deploy/backup-to-r2.sh.
#
# No Docker, no network, no R2 credentials. `docker` and `rclone` are stubbed on
# PATH, so what runs here is the script's real verification and upload logic
# with fake hands.
#
# What is pinned, and why each one is worth a test:
#
#   1. THE HEADER CHECK. This is the bug that made an operator distrust a good
#      backup. `zcat "$f" | head -c 4096 | grep -q "PostgreSQL database dump"`
#      is wrong under `set -o pipefail`: `head` exits after 4096 bytes, `zcat`
#      is killed by SIGPIPE (141), pipefail makes the pipeline non-zero, and the
#      `if !` reports it as "dump does not look like a pg_dump file". The dump
#      was healthy. The check was broken and asserted the opposite of the truth,
#      which is the worst property a safety check can have — it is the same
#      shape as the empty-encryption-key incident, where a green deploy hid a
#      broken feature.
#
#      It survived because the script shipped without the executable bit, so no
#      run ever reached the line. Two latent defects, each masking the other.
#
#   2. THE REFUSALS. A backup is only worth having if the script refuses to
#      upload a bad one: a dump with no pg_dump header, and a dump too small to
#      be real (the classic "auth error piped into gzip"). Each refusal is a
#      test, and each one also asserts that nothing was uploaded — a script that
#      detects a bad dump and uploads it anyway is worse than one that does not
#      look.
#
#   3. THE HAPPY PATH. The regression test for (1) is the positive case: a
#      well-formed dump must reach the upload. On the broken version this case
#      died at verification and never called rclone at all.
#
# Run:  ./deploy/backup-to-r2.test.sh     (also wired into the CI Tooling Guards job)
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/deploy/backup-to-r2.sh"

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

# ── a sandbox per case: stubs on PATH + a capture dir for the upload ─────────

new_case() {
  local d
  d="$(mktemp -d "$TMPROOT/case.XXXXXX")"
  mkdir -p "$d/bin" "$d/capture"
  : >"$d/stub.log"

  # `docker` stands in for `docker exec … pg_dump …`: emit the fixture.
  cat >"$d/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >>"$STUB_LOG"
[ -n "${DUMP_FIXTURE:-}" ] && cat "$DUMP_FIXTURE"
exit 0
STUB

  # `rclone` stands in for the R2 upload. copyto lands the file in a capture
  # dir so the test can assert on what would have been uploaded.
  cat >"$d/bin/rclone" <<'STUB'
#!/usr/bin/env bash
echo "rclone $*" >>"$STUB_LOG"
case "$1" in
  listremotes) echo "flowops-r2:" ;;
  copyto)
    mkdir -p "$CAPTURE"
    cp "$2" "$CAPTURE/$(basename "$3")"
    ;;
  delete) : ;;
esac
exit 0
STUB

  chmod +x "$d/bin/docker" "$d/bin/rclone"
  echo "$d"
}

# Run the script under test inside a case sandbox. Echoes the exit status.
run_backup() {
  local d="$1"
  (
    export PATH="$d/bin:$PATH"
    export STUB_LOG="$d/stub.log"
    export CAPTURE="$d/capture"
    export DUMP_FIXTURE="$d/dump.sql"
    export R2_TRANSPORT=rclone
    export R2_RCLONE_REMOTE=flowops-r2
    export R2_RCLONE_PATH=backups
    export RETENTION_DAYS=30
    bash "$SCRIPT" >"$d/out.log" 2>&1
  )
  echo "$?"
}

uploaded_count() { find "$1/capture" -type f | wc -l | tr -d ' '; }

# ── fixtures ────────────────────────────────────────────────────────────────

# Two sizes are load-bearing here, and getting either wrong makes the test lie.
#
#   - GZIPPED size must clear the script's 10KB floor, so the payload has to be
#     incompressible. Random bytes are; a wall of repeated characters collapses
#     to nothing and trips the size check instead of the one under test.
#
#   - UNCOMPRESSED size must exceed the pipe buffer (64KB on Linux). Under the
#     bug, SIGPIPE only happens when `zcat` still has data to write after `head`
#     exits at 4096 bytes — a dump that fits in the buffer is written in full,
#     so no SIGPIPE, and the broken check passes. Measured: 20KB -> status 0,
#     128KB -> status 141.
#
#     That size dependence is why this defect survived every small test anyone
#     might have run, and why it took a real 376KB backup to surface. 256KB is
#     comfortably past the threshold.
random_tail() { head -c 262144 /dev/urandom; }

valid_dump() {
  {
    printf -- '--\n-- PostgreSQL database dump\n--\n\n'
    printf 'SET statement_timeout = 0;\n'
    random_tail
  } >"$1/dump.sql"
}

# Same size, no header: pg_dump wrote something that is not a dump.
headerless_dump() {
  {
    printf -- 'ERROR:  relation "nonexistent" does not exist\n'
    random_tail
  } >"$1/dump.sql"
}

# The "auth error piped into gzip" shape — a few bytes of stderr.
tiny_dump() {
  printf 'pg_dump: error: connection to server failed\n' >"$1/dump.sql"
}

# ── 1. a healthy dump reaches the upload ────────────────────────────────────

section "A healthy dump is uploaded"

d="$(new_case)"; valid_dump "$d"
rc="$(run_backup "$d")"
[ "$rc" -eq 0 ] \
  && ok "script exits 0 on a well-formed dump" \
  || no "script exited $rc on a well-formed dump: $(tail -3 "$d/out.log")"
grep -q "Verification passed" "$d/out.log" \
  && ok "verification passes (the SIGPIPE regression)" \
  || no "verification failed: $(grep -i "aborting\|error" "$d/out.log" | head -2)"
[ "$(uploaded_count "$d")" -eq 1 ] \
  && ok "exactly one file uploaded" \
  || no "expected 1 upload, got $(uploaded_count "$d")"

# ── 2. a dump with no pg_dump header is refused ─────────────────────────────

section "A dump with no pg_dump header is refused and not uploaded"

d="$(new_case)"; headerless_dump "$d"
rc="$(run_backup "$d")"
[ "$rc" -ne 0 ] \
  && ok "script refuses to upload it" \
  || no "script exited 0 on a headerless dump"
grep -q "does not look like a pg_dump file" "$d/out.log" \
  && ok "refusal names the right reason" \
  || no "refusal did not name the reason"
[ "$(uploaded_count "$d")" -eq 0 ] \
  && ok "nothing uploaded" \
  || no "uploaded $(uploaded_count "$d") file(s) it had just rejected"

# ── 3. a suspiciously small dump is refused ─────────────────────────────────

section "A suspiciously small dump is refused and not uploaded"

d="$(new_case)"; tiny_dump "$d"
rc="$(run_backup "$d")"
[ "$rc" -ne 0 ] \
  && ok "script refuses to upload it" \
  || no "script exited 0 on a tiny dump"
grep -q "suspiciously small" "$d/out.log" \
  && ok "refusal names the right reason" \
  || no "refusal did not name the reason"
[ "$(uploaded_count "$d")" -eq 0 ] \
  && ok "nothing uploaded" \
  || no "uploaded $(uploaded_count "$d") file(s) it had just rejected"

# ── 4. the verification predicate itself ────────────────────────────────────

section "The header check is not a pipefail trap"

# Reject the shape that caused the incident outright. It looks correct, reads
# correct, and is wrong: under pipefail a SIGPIPE from `head` is reported as a
# bad dump. Kept as a guard so nobody reintroduces it while tidying up.
# Comment lines are excluded: the script's own header comment quotes the broken
# shape as a warning, and matching that would flag the very commit that fixed it.
if grep -vE '^[[:space:]]*#' "$SCRIPT" | grep -qE 'zcat[^|]*\|[^|]*head[^|]*\|[^|]*grep'; then
  no "header check is a zcat|head|grep pipeline (SIGPIPE under pipefail)"
else
  ok "header check is not a zcat|head|grep pipeline"
fi

# ── 5. the script itself ────────────────────────────────────────────────────

section "Script hygiene"

bash -n "$SCRIPT" && ok "bash -n" || no "syntax error"
[ -x "$SCRIPT" ] && ok "is executable" || no "not executable"
grep -q 'set -euo pipefail' "$SCRIPT" && ok "strict mode" || no "not strict"

# ── result ──────────────────────────────────────────────────────────────────

echo ""
echo "───────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then
  echo "backup-to-r2: ${PASSED} passed, 0 failed"
  exit 0
fi
echo "backup-to-r2: ${PASSED} passed, ${FAILED} failed"
exit 1

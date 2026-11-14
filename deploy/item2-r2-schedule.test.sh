#!/usr/bin/env bash
#
# FlowOps — schedule-consistency tests for deploy/item2-r2-runner.sh.
#
# No Docker, no network, no R2 credentials. This is a static-consistency suite,
# not a behavioural one, and that is a deliberate choice: what it guards is the
# gap BETWEEN files, which no amount of unit-testing either file alone can close.
#
# Why these tests exist — the incident they are shaped by:
#
#   The backup runner was installed on the VPS and working. The docs described a
#   DIFFERENT script. An operator followed the documented script, overwrote the
#   installed binary, and silently broke both the nightly off-box backup and the
#   weekly restore proof. Nothing in the repo caught it, because no test knew
#   that two files were supposed to agree.
#
#   Worse, the replacement script took no arguments, so the weekly restore proof
#   began running a backup instead of a verify. It exited 0 the whole time. The
#   system reported success while doing the wrong job — the same shape as the
#   empty-encryption-key incident and the SIGPIPE false-negative.
#
# So each test below ties two things together that must not drift apart. Each
# one also states what the failure mode is, because a guard whose purpose is not
# written down gets "simplified" away in six months.
#
#   TEST 1 — the cron lines keep their marker. The runner's own installer removes
#            only lines carrying FLOWOPS_ITEM2_R2. Drop the marker and every
#            re-run stacks a duplicate entry that nothing will ever clean up.
#
#   TEST 2 — runner and runbook agree on the schedule. The drift that caused the
#            incident above. Both directions are covered by one equality.
#
#   TEST 3 — upload cadence keeps up with dump cadence. The backup container
#            dumps on a `sleep` loop while cron uploads on wall-clock time. If
#            someone makes dumps more frequent, a slower upload silently caps
#            the real RPO at the upload cadence and nothing fails.
#
#   TEST 4 — the hourly upload is idempotent. Hourly only works because
#            remote_dump_present() skips an upload R2 already holds. Remove that
#            guard and the cost jumps ~6x in storage and egress for no gain.
#
# Run:  ./deploy/item2-r2-schedule.test.sh     (also wired into the CI Tooling Guards job)
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$REPO_ROOT/deploy/item2-r2-runner.sh"
RUNBOOK="$REPO_ROOT/deploy/VPS-RUNBOOK.md"
COMPOSE="$REPO_ROOT/deploy/docker-compose.vps.yml"

PASSED=0
FAILED=0
ok() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
no() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
section() { echo ""; echo "$1"; }

for f in "$RUNNER" "$RUNBOOK" "$COMPOSE"; do
  if [ ! -f "$f" ]; then
    echo "FAIL: $f not found" >&2
    exit 1
  fi
done

# ── helpers ──────────────────────────────────────────────────────────────────

# Pull a readonly constant's value out of the runner.
#
# Accepts both `readonly FOO="bar"` and `readonly FOO=30` (RETENTION_DAYS is
# declared bare). Returning empty for a value that exists is the failure mode to
# avoid: every downstream check would then compare against '' and quietly pass.
constant() {
  local name="$1" value
  value="$(grep -oE "^readonly ${name}=(\"[^\"]*\"|[^[:space:]]+)" "$RUNNER" \
    | head -1 | sed "s/^readonly ${name}=//; s/^\"//; s/\"$//")"
  printf '%s' "$value"
}

# Smallest gap between consecutive runs, in seconds.
#
# Deliberately conservative for the comma case: the binding interval is the
# SMALLEST gap, not the average. `0,12,18` fires every 6 hours at its tightest,
# so reporting 8 hours (24/3) would let a real gap go unnoticed. The wraparound
# past midnight counts, because cron schedules do wrap.
#
# Returns 0 on an unrecognised schedule so the caller fails loudly rather than
# passing on input it did not understand — a guard that shrugs at novelty is not
# a guard.
cron_interval_seconds() {
  local sched="$1" hour_field hours n min_gap prev h gap first last
  hour_field="$(printf '%s' "$sched" | awk '{print $2}')"
  [ -n "$hour_field" ] || { echo 0; return; }
  case "$hour_field" in
    '*') echo 3600; return ;;
  esac
  hours="$(printf '%s\n' "${hour_field//,/$'\n'}" | sort -n)"
  n=0; min_gap=""; prev=""; first=""; last=""
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    n=$((n + 1))
    [ -n "$first" ] || first="$h"
    if [ -n "$prev" ]; then
      gap=$((h - prev))
      if [ -z "$min_gap" ] || [ "$gap" -lt "$min_gap" ]; then min_gap="$gap"; fi
    fi
    prev="$h"; last="$h"
  done <<<"$hours"
  [ "$n" -ge 1 ] || { echo 0; return; }
  [ "$n" -eq 1 ] && { echo 86400; return; }
  gap=$(((first + 24) - last))
  if [ -z "$min_gap" ] || [ "$gap" -lt "$min_gap" ]; then min_gap="$gap"; fi
  echo $((min_gap * 3600))
}

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
STALE_HITS="$(grep -rlF '15 2 * * *' "$REPO_ROOT/deploy" 2>/dev/null | grep -vF "$SELF" | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"

BACKUP_SCHED="$(constant BACKUP_CRON_SCHEDULE)"
PROOF_SCHED="$(constant RESTORE_PROOF_CRON_SCHEDULE)"
MARKER="$(constant CRON_MARKER)"
INSTALL_PATH="$(constant INSTALL_PATH)"

# ── TEST 1 — the cron lines keep their marker ────────────────────────────────

section "TEST 1 — cron lines carry the marker the installer cleans up by"

[ -n "$MARKER" ] \
  && ok "CRON_MARKER is defined ($MARKER)" \
  || no "CRON_MARKER is missing — the installer cannot find its own lines"

grep -qE "^[[:space:]]*printf '%s\\\\n' \"\\\$\{BACKUP_CRON_SCHEDULE\}[^\"]*# \\\$\{CRON_MARKER\}_BACKUP\"" "$RUNNER" \
  && ok "backup cron line is tagged ${MARKER}_BACKUP (installer can replace it)" \
  || no "backup cron line lost its ${MARKER}_BACKUP tag — re-runs would stack duplicates"

grep -qE "^[[:space:]]*printf '%s\\\\n' \"\\\$\{RESTORE_PROOF_CRON_SCHEDULE\}[^\"]*# \\\$\{CRON_MARKER\}_RESTORE\"" "$RUNNER" \
  && ok "restore-proof cron line is tagged ${MARKER}_RESTORE" \
  || no "restore-proof cron line lost its ${MARKER}_RESTORE tag"

# The install path must come from the constant, not be pasted in. A hardcoded
# path here is how a schedule change ends up editing the wrong string.
grep -qE 'BACKUP_CRON_SCHEDULE\}[^"]*\$\{INSTALL_PATH\}' "$RUNNER" \
  && ok "cron lines reference \${INSTALL_PATH}, not a pasted path" \
  || no "cron lines hardcode the install path instead of using \${INSTALL_PATH}"

# ── TEST 2 — runner and runbook agree ────────────────────────────────────────

section "TEST 2 — the documented schedule matches the installed one"

[ -n "$BACKUP_SCHED" ] \
  && ok "BACKUP_CRON_SCHEDULE is defined ($BACKUP_SCHED)" \
  || no "BACKUP_CRON_SCHEDULE is missing — cannot check the runbook against it"

if [ -n "$BACKUP_SCHED" ]; then
  grep -qF "$BACKUP_SCHED" "$RUNBOOK" \
    && ok "VPS-RUNBOOK.md documents the backup schedule '$BACKUP_SCHED'" \
    || no "VPS-RUNBOOK.md does not mention '$BACKUP_SCHED' — the docs describe a schedule the box does not run"
fi

if [ -n "$PROOF_SCHED" ]; then
  grep -qF "$PROOF_SCHED" "$RUNBOOK" \
    && ok "VPS-RUNBOOK.md documents the restore-proof schedule '$PROOF_SCHED'" \
    || no "VPS-RUNBOOK.md does not mention '$PROOF_SCHED' — drift between docs and cron"
fi

# A stale schedule left anywhere in deploy/ is how the next operator gets it
# wrong. Flag the old daily entry specifically so it cannot quietly survive.
#
# This file is excluded from its own scan: it has to name the old schedule in
# order to look for it, and a guard that matches itself is worse than no guard.
# Historical references elsewhere should be phrased without the literal string.
if [ -z "$STALE_HITS" ]; then
  ok "no stale '15 2 * * *' (old daily schedule) left in deploy/"
else
  no "stale '15 2 * * *' still present in: $STALE_HITS — the docs would contradict cron"
fi

# ── TEST 3 — upload cadence keeps up with dump cadence ───────────────────────

section "TEST 3 — the upload schedule can keep up with the dump loop"

DUMP_SECS="$(grep -oE 'sleep [0-9]+' "$COMPOSE" | awk '{print $2}' | sort -n | tail -1)"

[ -n "$DUMP_SECS" ] && [ "$DUMP_SECS" -gt 0 ] \
  && ok "dump loop interval found in docker-compose.vps.yml (${DUMP_SECS}s)" \
  || no "could not read the dump loop interval from docker-compose.vps.yml"

UPLOAD_SECS="$(cron_interval_seconds "$BACKUP_SCHED")"

if [ "$UPLOAD_SECS" -gt 0 ] 2>/dev/null; then
  ok "backup schedule '$BACKUP_SCHED' parses to a ${UPLOAD_SECS}s interval"
else
  no "backup schedule '$BACKUP_SCHED' is not a shape this test understands — extend cron_interval_seconds() before changing it"
fi

if [ "$UPLOAD_SECS" -gt 0 ] 2>/dev/null && [ "$DUMP_SECS" -gt 0 ] 2>/dev/null; then
  # Uploading at least as often as dumps appear is what keeps the real RPO equal
  # to the dump cadence rather than the (slower) upload cadence.
  [ "$UPLOAD_SECS" -le "$DUMP_SECS" ] \
    && ok "upload interval ${UPLOAD_SECS}s <= dump interval ${DUMP_SECS}s (RPO is set by the dump cadence, not by cron)" \
    || no "upload interval ${UPLOAD_SECS}s is SLOWER than the ${DUMP_SECS}s dump cadence — dumps would be stranded on the VPS"

  # Retention has to survive the higher object count, or pruning quietly eats
  # history faster than it used to.
  PER_DAY=$((86400 / DUMP_SECS))
  RETENTION="$(constant RETENTION_DAYS)"
  [ -n "$RETENTION" ] && [ "$RETENTION" -ge 7 ] \
    && ok "retention ${RETENTION}d still covers >=7 days at ${PER_DAY} dumps/day" \
    || no "retention '${RETENTION}' is too short to be useful at ${PER_DAY} dumps/day"
else
  no "skipped cadence comparison — could not resolve both intervals"
fi

# ── TEST 4 — the frequent upload is idempotent ───────────────────────────────

section "TEST 4 — repeated runs do not re-upload the same dump"

grep -qE '^remote_dump_present\(\)' "$RUNNER" \
  && ok "remote_dump_present() is defined" \
  || no "remote_dump_present() is missing — every cron run would re-upload"

BACKUP_BODY="$(awk '/^backup_latest\(\) \{/,/^\}/' "$RUNNER")"

printf '%s' "$BACKUP_BODY" | grep -q 'remote_dump_present' \
  && ok "backup_latest() consults remote_dump_present() before uploading" \
  || no "backup_latest() uploads unconditionally — an hourly cron would 6x the storage and egress cost"

# Ordering, not mere presence. An earlier version of this check grepped
# `^\s*upload_and_roundtrip` and passed against an UNGUARDED call too, because a
# 2-space indent matches `\s*` just as well as a 4-space one — the assertion was
# green while proving nothing. What matters is that the skip test is REACHED
# before the upload runs, so compare line positions.
UPLOAD_LINE="$(printf '%s\n' "$BACKUP_BODY" | grep -n 'upload_and_roundtrip' | head -1 | cut -d: -f1)"
GUARD_LINE="$(printf '%s\n' "$BACKUP_BODY" | grep -n 'remote_dump_present' | head -1 | cut -d: -f1)"

if [ -n "$UPLOAD_LINE" ] && [ -n "$GUARD_LINE" ] && [ "$GUARD_LINE" -lt "$UPLOAD_LINE" ]; then
  ok "skip test is reached before the upload (guard line $GUARD_LINE < upload line $UPLOAD_LINE)"
else
  no "upload_and_roundtrip() runs before/at the skip test, so the guard cannot prevent the upload"
fi

# Pruning must still run on a skipped cycle, or a long quiet period leaves old
# objects around with nothing ever deleting them.
printf '%s' "$BACKUP_BODY" | grep -q 'min-age' \
  && ok "retention prune runs even when the upload is skipped" \
  || no "retention prune is skipped with the upload — old objects would accumulate"

# ── summary ─────────────────────────────────────────────────────────────────

echo ""
echo "  ─────────────────────────────────────────────"
echo "  PASSED: $PASSED   FAILED: $FAILED"
echo ""

[ "$FAILED" -eq 0 ] || exit 1

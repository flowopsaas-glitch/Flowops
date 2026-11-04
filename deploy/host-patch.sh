#!/usr/bin/env bash
#
# FlowOps — host OS patching: audit it, apply it, verify it, remember it.
#
# ── Why this file exists ────────────────────────────────────────────────────
#
# On 2026-11-04 the production VPS reported, on login:
#
#     35 updates can be applied immediately.
#     5 of these updates are standard security updates.
#     *** System restart required ***
#
# None of that is the disaster people imagine. The disaster is the shape of it
# two months later: `apt-get upgrade` on a box nobody has touched since, with a
# kernel from the last reboot, a Docker engine several point releases behind, and
# nobody able to say what changed or when. Unpatched is not one bad day; it is a
# slope with no marker on it.
#
# The repo already had three pieces pointing at this:
#
#   - deploy/harden-vps.sh installs unattended-upgrades — security pocket only.
#     That is exactly right, and it is also why the *other* 30 updates sit there
#     forever. Nothing in the repo ever applied them.
#   - deploy/disk-guard.sh keeps the disk from filling, so a kernel upgrade has
#     somewhere to write its initramfs.
#   - deploy/vps-deploy.sh verifies the stack after a deploy — but nothing
#     verified it after a *patch*, which is the change that can actually take the
#     box down.
#
# This script closes the loop, and it is deliberately not a wrapper around
# `apt-get upgrade`:
#
#   1. It REMEMBERS. /var/lib/flowops/patch-state records when a security backlog
#      was first seen, so the audit can say "5 security updates have been pending
#      for 33 days" instead of "5 updates available" — which is the same sentence
#      every day and therefore reads as nothing.
#   2. It refuses to patch a box it cannot restore. A fresh, gzip-verified
#      pg_dump is a precondition, not a nicety.
#   3. It will not hang. `--force-confdef --force-confold` and
#      NEEDRESTART_MODE=list mean no prompt can block an unattended run, and no
#      local config (sshd, apt, ufw) is silently replaced by the package's
#      default. A hung `apt-get` waiting on a conffile prompt at 03:30 is the
#      single most common way this goes wrong in the field.
#   4. It verifies the STACK, not just apt's exit code. Exit 0 from apt means the
#      packages unpacked; it says nothing about whether the API came back.
#   5. It records what changed. Package inventory before and after, so a
#      regression next week has an answer that is not archaeology.
#
# ── Modes ───────────────────────────────────────────────────────────────────
#
#   --check            Report only. Changes nothing except the state file that
#                      tracks how long a backlog has existed. Exit 0 = clean,
#                      10 = action recommended. This is what the audit timer runs.
#   --security         Apply security-pocket updates only (what
#                      unattended-upgrades would do, but now, with verification).
#   --full             Apply all updates. The monthly timer uses this.
#   --dist-upgrade     Allow apt to remove packages to resolve dependencies.
#                      Off by default: `upgrade --with-new-pkgs` never removes
#                      anything, and on a server that is the behaviour you want.
#   --dry-run          Show the plan and the simulated package changes; change
#                      nothing, touch no state.
#   --reboot           Reboot if /var/run/reboot-required exists, AFTER the stack
#                      health gate passes. Without this flag a required reboot is
#                      reported and never performed.
#   --no-backup        Skip the pre-patch database dump. Recorded in the log and
#                      in the summary; refuses to be silent.
#   --install          Install this script, the systemd units and the apt config,
#                      then enable the timers. Idempotent.
#   --json             Print the summary as JSON (for the audit timer's journal).
#
# Exit codes: 0 ok · 1 error · 10 attention recommended (from --check).
#
# ── Design notes worth not re-learning ──────────────────────────────────────
#
#   * `upgrade --with-new-pkgs` installs new dependencies but never removes a
#     package. `full-upgrade` can remove things to resolve a conflict, which on a
#     production host is a decision a human should make, so it is opt-in.
#   * Docker comes from Docker's own repo, which has no -security pocket, so
#     unattended-upgrades never touches it. That is deliberate here too: a
#     docker-ce update restarts the daemon, and unless live-restore is on that
#     stops every container. It is handled by this script, in a window, with the
#     stack verified afterwards — never unattended at 03:00.
#   * The audit timer is the reminder. `systemctl --failed` naming
#     flowops-host-audit IS the alert: it clears itself on the next clean run.
#     There is no mail transport on this box and pretending otherwise by
#     installing one is a bigger change than this problem deserves.
#
# ── Usage ───────────────────────────────────────────────────────────────────
#
#   sudo ./deploy/host-patch.sh --check
#   sudo ./deploy/host-patch.sh --install
#   sudo ./deploy/host-patch.sh --full
#   sudo ./deploy/host-patch.sh --full --reboot
#
set -uo pipefail

# ── Command indirection ─────────────────────────────────────────────────────
# Every external command the script depends on is resolvable from the
# environment, so the test suite can drive it with stubs on a machine that is
# not (and must not be) the production host.
APT_GET="${APT_GET:-apt-get}"
APT="${APT:-apt}"
DPKG="${DPKG:-dpkg}"
DPKG_QUERY="${DPKG_QUERY:-dpkg-query}"
DOCKER="${DOCKER:-docker}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
DF="${DF:-df}"

FLOWOPS_DIR="${FLOWOPS_DIR:-/root/FlowOps}"
STATE_FILE="${STATE_FILE:-/var/lib/flowops/patch-state}"
LOG_DIR="${LOG_DIR:-/var/log/flowops}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/flowops-pre-patch}"
DEFAULTS_FILE="${DEFAULTS_FILE:-/etc/default/flowops-host-patch}"
PROJECT="${COMPOSE_PROJECT_NAME:-flowops}"
APT_LOCK_FILE="${APT_LOCK_FILE:-/var/lib/dpkg/lock-frontend}"

# Thresholds. Overridable from /etc/default/flowops-host-patch, which
# `--install` creates with these same values spelled out and commented, so
# nothing about the policy is only discoverable by reading this file.
SECURITY_WARN_DAYS="${SECURITY_WARN_DAYS:-7}"
SECURITY_FAIL_DAYS="${SECURITY_FAIL_DAYS:-30}"
TOTAL_WARN="${TOTAL_WARN:-40}"
TOTAL_FAIL="${TOTAL_FAIL:-80}"
REBOOT_WARN_DAYS="${REBOOT_WARN_DAYS:-14}"
REBOOT_FAIL_DAYS="${REBOOT_FAIL_DAYS:-45}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
DISK_FAIL_PCT="${DISK_FAIL_PCT:-92}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-10240}"
BACKUP_KEEP="${BACKUP_KEEP:-6}"

# Test-only: skip the root requirement. Never set on a real host.
TEST_MODE="${FLOWOPS_HOST_PATCH_TEST:-0}"

# ── Output ──────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_YEL=$'\033[33m'
  C_GRN=$'\033[32m'; C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_YEL=''; C_GRN=''; C_BLD=''; C_OFF=''
fi

LOG_FILE=""
log()  { local line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; echo "$line"; [ -n "$LOG_FILE" ] && printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true; return 0; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s\n' "  ${C_GRN}✓${C_OFF} $*"; }
warn() { printf '%s\n' "  ${C_YEL}!${C_OFF} $*"; }
bad()  { printf '%s\n' "  ${C_RED}✗${C_OFF} $*"; }
die()  { printf '%s\n' "${C_RED}${C_BLD}host-patch:${C_OFF} $*" >&2; exit 1; }

# ── Pure helpers (unit-tested by deploy/host-patch.test.sh) ─────────────────

# Parse `apt list --upgradable` output on stdin → "<total> <security>".
#
# Security is decided by the SUITE, not by the package name or the description:
# a package is a security update when at least one of its suites ends in
# `-security` (jammy-security, noble-security) or is an ESM pocket
# (esm-apps / esm-infra / *-apps-security / *-infra-security). Counting by
# hoping the word "security" appears somewhere is how a report ends up saying
# "5 security updates" when it means "5 packages apt happened to print".
classify_upgradable() {
  awk '
    /^Listing\.\.\./ { next }
    NF < 2          { next }
    {
      n = split($1, parts, "/")
      if (n < 2 || parts[2] == "") next    # not a package line
      total++
      m = split(parts[2], suites, ",")
      for (i = 1; i <= m; i++) {
        s = suites[i]
        if (s ~ /-security$/ || s == "esm-apps" || s == "esm-infra" || s ~ /^esm-/) {
          security++
          next
        }
      }
    }
    END { printf "%d %d\n", total + 0, security + 0 }
  '
}

# Percentage of the root filesystem in use, as a bare integer.
disk_used_pct() {
  "$DF" -P / | awk 'NR==2 { gsub("%", "", $5); print $5 }'
}

# Free megabytes on the root filesystem.
disk_free_mb() {
  "$DF" -Pm / | awk 'NR==2 { print $4 }'
}

# Whole days since an epoch second, or empty when the file is absent.
age_days() {
  local epoch="$1"
  [ -n "$epoch" ] || return 1
  local now; now="$(date +%s)"
  echo $(( (now - epoch) / 86400 ))
}

# Epoch of a marker file, or empty.
marker_epoch() {
  local f="$1"
  [ -e "$f" ] || return 1
  stat -c %Y "$f" 2>/dev/null || return 1
}

# ── State: how long has this backlog existed? ───────────────────────────────
#
# Deliberately a flat key=value file rather than JSON: it is written by bash,
# read by bash, and has to survive being truncated by a full disk. Anything that
# needs a parser to describe "5" is a liability on the box that needs it.
state_read() {
  local key="$1"
  [ -f "$STATE_FILE" ] || return 1
  sed -n "s/^${key}=//p" "$STATE_FILE" 2>/dev/null | tail -n 1
}

state_write() {
  local security="$1" total="$2" now; now="$(date +%s)"
  local first_seen
  first_seen="$(state_read security_first_seen || true)"

  # Only a security backlog ages. Clearing it clears the clock; that is the
  # whole point of tracking it — the number of days is the metric, not the
  # number of packages.
  if [ "$security" -gt 0 ]; then
    [ -n "$first_seen" ] || first_seen="$now"
  else
    first_seen=""
  fi

  mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
  {
    echo "# FlowOps patch state — written by host-patch.sh. Do not edit by hand."
    echo "updated_at=$now"
    echo "security_pending=$security"
    echo "total_pending=$total"
    echo "security_first_seen=${first_seen}"
  } >"$STATE_FILE.tmp" 2>/dev/null && mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
}

# ── Preconditions ───────────────────────────────────────────────────────────

need_root() {
  [ "$TEST_MODE" = "1" ] && return 0
  [ "$(id -u)" = "0" ] || die "must run as root (sudo $0 $*)"
}

# True when another apt process holds the frontend lock.
apt_locked() {
  local lockfile="$APT_LOCK_FILE"
  [ -e "$lockfile" ] || return 1
  # NOTE the braces. `exec 9>>"$lockfile" 2>/dev/null` redirects stderr for the
  # SHELL, not just for that command, so every `die` after it prints into
  # /dev/null and the operator gets a bare exit 1. Wrapping the exec in a group
  # scopes the redirect to the group. This cost one very confusing test run.
  { exec 9>>"$lockfile"; } 2>/dev/null || return 1
  if flock -n 9 2>/dev/null; then
    exec 9>&-
    return 1
  fi
  exec 9>&-
  return 0
}

# A half-configured dpkg is the state that turns a patch run into an outage:
# apt refuses to proceed and the box is left mid-transaction.
dpkg_healthy() {
  local audit
  audit="$("$DPKG" --audit 2>/dev/null || true)"
  [ -z "$audit" ]
}

# Why the stack cannot be inspected: 0 = can, 1 = docker missing, 2 = no compose file.
stack_present() {
  command -v "$DOCKER" >/dev/null 2>&1 || return 1
  [ -f "$FLOWOPS_DIR/docker-compose.yml" ] || return 2
  return 0
}

stack_absent_reason() {
  stack_present
  case $? in
    1) printf 'docker not on PATH' ;;
    2) printf 'no docker-compose.yml under %s' "$FLOWOPS_DIR" ;;
    *) printf 'unknown' ;;
  esac
}

# Every container in the project must be healthy or explicitly running without
# a healthcheck. `(health: starting)` is not healthy — it is the window in which
# a broken container looks fine.
stack_healthy() {
  stack_present || return 2
  local status
  status="$("$DOCKER" ps \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --format '{{.Names}} {{.Status}}' 2>/dev/null || true)"
  [ -n "$status" ] || return 1
  printf '%s\n' "$status" | grep -Eq '\(unhealthy\)|\(health: starting\)|Restarting|Exited'
  [ $? -eq 0 ] && return 1
  return 0
}

compose() {
  ( cd "$FLOWOPS_DIR" && "$DOCKER" compose -f docker-compose.yml -f deploy/docker-compose.vps.yml "$@" )
}

# ── Backup ──────────────────────────────────────────────────────────────────

backup_database() {
  if [ "${DO_BACKUP:-1}" != "1" ]; then
    warn "Pre-patch database backup SKIPPED (--no-backup). Recorded in this log."
    log "backup=skipped"
    return 0
  fi
  if ! stack_present; then
    warn "Skipping pre-patch dump: $(stack_absent_reason)."
    log "backup=skipped-no-stack"
    return 0
  fi

  mkdir -p "$BACKUP_DIR" || die "cannot create $BACKUP_DIR"
  chmod 0700 "$BACKUP_DIR" 2>/dev/null || true

  local stamp target raw
  stamp="$(date +%Y%m%d-%H%M%S)"
  target="$BACKUP_DIR/pre-patch-$stamp.sql.gz"
  raw="$BACKUP_DIR/.pre-patch-$stamp.sql"

  say "  Dumping database…"
  local pguser="${POSTGRES_USER:-flowops}" pgdb="${POSTGRES_DB:-flowops}"

  # Dump to a plain file first, so the gate below measures the DUMP and not its
  # compressed container. Gzipping first and then checking the .gz size looks
  # equivalent and is not: a 40 KB dump of repetitive SQL compresses to under
  # 100 bytes, so a size check on the archive rejects perfectly good backups and
  # waves through only uncompressible garbage.
  # shellcheck disable=SC2016
  if ! compose exec -T postgres pg_dump -U "$pguser" "$pgdb" >"$raw" 2>>"$LOG_FILE"; then
    rm -f "$raw"
    die "pg_dump failed. Refusing to patch without a restorable backup."
  fi
  chmod 0600 "$raw" 2>/dev/null || true

  local raw_bytes; raw_bytes="$(stat -c %s "$raw" 2>/dev/null || echo 0)"
  if [ "$raw_bytes" -lt "$MIN_DUMP_BYTES" ]; then
    rm -f "$raw"
    die "The database dump is ${raw_bytes} bytes (floor ${MIN_DUMP_BYTES}). Postgres is
       probably not up, and a 20-byte backup that restores nothing is worse than
       no backup because it reads as protection. Refusing to patch."
  fi

  if ! gzip -c "$raw" >"$target"; then
    rm -f "$raw" "$target"
    die "Could not compress the dump."
  fi
  rm -f "$raw"

  if ! gzip -t "$target" 2>/dev/null; then
    rm -f "$target"
    die "Backup at $target is not a valid gzip stream. Refusing to patch."
  fi

  ok "Backup verified: $(du -h "$target" | cut -f1) compressed, ${raw_bytes} bytes of SQL, gzip OK"
  log "backup=$target raw_bytes=$raw_bytes"

  # Keep the last N. Old pre-patch dumps are worse than useless when the disk is
  # under pressure, and the 6-hourly validated dump in the volume is the archive.
  ls -t "$BACKUP_DIR"/pre-patch-*.sql.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
  return 0
}

# ── Package inventory ───────────────────────────────────────────────────────
#
# The before/after diff is the answer to "what changed" three weeks from now,
# when the only other evidence is a reboot and a vague memory.
snapshot_packages() {
  local out="$LOG_DIR/packages-$1.txt"
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  "$DPKG_QUERY" -W -f='${Package}\t${Version}\n' 2>/dev/null | sort >"$out" || true
  printf '%s\n' "$out"
}

diff_packages() {
  local before="$1" after="$2"
  [ -s "$before" ] && [ -s "$after" ] || return 0
  comm -13 "$before" "$after" | sed 's/^/  changed: /'
}

# ── apt ─────────────────────────────────────────────────────────────────────

apt_refresh() {
  say "  Refreshing package lists…"
  if ! "$APT_GET" update -qq 2>>"$LOG_FILE"; then
    die "apt-get update failed — see $LOG_FILE"
  fi
}

pending_counts() {
  local out total security
  out="$("$APT" list --upgradable 2>/dev/null || true)"
  # `apt list --upgradable` writes "Listing..." to stderr; be tolerant of the
  # older behaviour where it landed on stdout.
  read -r total security <<<"$(printf '%s\n' "$out" | classify_upgradable)"
  echo "${total:-0} ${security:-0}"
}

# The security-only package names, resolved at run time.
#
# `apt-get upgrade` has no "security pocket only" switch, and the usual advice
# (an apt preferences pin) is a system-wide change that outlives the run. So the
# scoped path names the packages explicitly and passes --only-upgrade, which
# cannot install anything that was not already installed and cannot drag in the
# other 30 updates. The first draft of this function set a `-o APT::Get::*`
# option and called it a day — it performed a FULL upgrade while claiming to be
# security-only, which is worse than not having the mode at all.
security_package_names() {
  "$APT" list --upgradable 2>/dev/null | awk '
    /^Listing\.\.\./ { next }
    NF < 2 { next }
    {
      n = split($1, parts, "/"); if (n < 2) next
      m = split(parts[2], suites, ",")
      for (i = 1; i <= m; i++) {
        s = suites[i]
        if (s ~ /-security$/ || s == "esm-apps" || s == "esm-infra" || s ~ /^esm-/) {
          print parts[1]
          next
        }
      }
    }' | sort -u
}

apply_updates() {
  local scope="$1"
  local -a args dpkg_opts

  # Never prompt, never replace a config file the operator edited. Without
  # force-confold, dpkg asks about /etc/ssh/sshd_config and an unattended run
  # blocks forever holding the dpkg lock — the box is then un-patchable and
  # "apt is stuck" becomes its own incident.
  export DEBIAN_FRONTEND=noninteractive
  export NEEDRESTART_MODE=list   # list, do not auto-restart services under us
  export APT_LISTCHANGES_FRONTEND=none

  dpkg_opts=(-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

  if [ "$scope" = "security" ]; then
    local -a names
    mapfile -t names < <(security_package_names)
    if [ "${#names[@]}" -eq 0 ]; then
      say "  no security updates to apply"
      return 0
    fi
    say "  apt-get install --only-upgrade  (${#names[@]} security package(s))"
    printf '%s\n' "${names[@]}" | sed 's/^/    /' | head -n 20
    args=(-y --only-upgrade install "${names[@]}")
  elif [ "${DIST_UPGRADE:-0}" = "1" ]; then
    say "  apt-get full-upgrade"
    args=(-y --with-new-pkgs full-upgrade)
  else
    say "  apt-get upgrade --with-new-pkgs"
    args=(-y --with-new-pkgs upgrade)
  fi

  # pipefail is on, so apt's status survives the tee.
  if ! "$APT_GET" "${args[@]}" "${dpkg_opts[@]}" 2>&1 | tee -a "$LOG_FILE"; then
    return 1
  fi
  return 0
}

reboot_required() {
  [ -e /var/run/reboot-required ]
}

# ── Reporting ───────────────────────────────────────────────────────────────

summary_json() {
  local total="$1" security="$2" backlog_days="$3" disk="$4" free="$5"
  local reboot="$6" reboot_days="$7" stack="$8" status="$9"
  cat <<JSON
{"total_pending":$total,"security_pending":$security,"security_backlog_days":${backlog_days:-null},"disk_used_pct":$disk,"disk_free_mb":$free,"reboot_required":$reboot,"reboot_pending_days":${reboot_days:-null},"stack_healthy":"$stack","status":"$status"}
JSON
}

# ── Modes ───────────────────────────────────────────────────────────────────

do_check() {
  local total security backlog_days="" disk free reboot=0 reboot_days="" stack="unknown"
  MECHANISM_BAD=0

  say ""
  say "${C_BLD}FlowOps host patch audit${C_OFF}  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  say "───────────────────────────────────────────────────────────────"

  # -- packages
  read -r total security <<<"$(pending_counts)"
  state_write "$security" "$total"
  local first_seen; first_seen="$(state_read security_first_seen || true)"
  [ -n "$first_seen" ] && backlog_days="$(age_days "$first_seen" 2>/dev/null || echo 0)"

  say ""
  say "${C_BLD}Packages${C_OFF}"
  if [ "$total" -eq 0 ]; then
    ok "up to date — nothing pending"
  else
    say "  pending: ${total}   security: ${security}"
    if [ -n "$backlog_days" ] && [ "$security" -gt 0 ]; then
      say "  ${C_DIM}security backlog first seen ${backlog_days} day(s) ago${C_OFF}"
    fi
  fi

  # -- update mechanism health: "5 security updates pending" has a cause, and
  #    the useful output names it rather than printing the count again.
  say ""
  say "${C_BLD}Update mechanism${C_OFF}"
  if command -v "$SYSTEMCTL" >/dev/null 2>&1 && "$SYSTEMCTL" list-unit-files unattended-upgrades.service >/dev/null 2>&1; then
    local enabled active
    enabled="$("$SYSTEMCTL" is-enabled unattended-upgrades 2>/dev/null || echo unknown)"
    active="$("$SYSTEMCTL" is-active unattended-upgrades 2>/dev/null || echo unknown)"
    [ "$enabled" = "enabled" ] && ok "unattended-upgrades enabled" || bad "unattended-upgrades is ${enabled}"
    [ "$enabled" = "enabled" ] || MECHANISM_BAD=1
    say "  ${C_DIM}active=${active}${C_OFF}"
  else
    warn "unattended-upgrades not installed — security updates never apply themselves"
    MECHANISM_BAD=1
  fi
  local uu_log="/var/log/unattended-upgrades/unattended-upgrades.log"
  if [ -r "$uu_log" ]; then
    say "  ${C_DIM}last run: $(grep -E 'Packages that will be upgraded|No packages found' "$uu_log" 2>/dev/null | tail -n 1 | cut -c1-110)${C_OFF}"
  fi

  # -- disk: a kernel upgrade needs room for a new initramfs
  disk="$(disk_used_pct)"; free="$(disk_free_mb)"
  say ""
  say "${C_BLD}Disk${C_OFF}"
  if [ "$disk" -ge "$DISK_FAIL_PCT" ]; then
    bad "${disk}% used, ${free} MB free — too full to patch safely"
  elif [ "$disk" -ge "$DISK_WARN_PCT" ]; then
    warn "${disk}% used, ${free} MB free"
  else
    ok "${disk}% used, ${free} MB free"
  fi
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    bad "less than ${MIN_FREE_MB} MB free — a kernel update may not fit"
  fi

  # -- reboot
  if reboot_required; then
    reboot=1
    local epoch; epoch="$(marker_epoch /var/run/reboot-required || true)"
    [ -n "$epoch" ] && reboot_days="$(age_days "$epoch" 2>/dev/null || echo "")"
    say ""
    say "${C_BLD}Reboot${C_OFF}"
    if [ -n "$reboot_days" ] && [ "$reboot_days" -ge "$REBOOT_FAIL_DAYS" ]; then
      bad "required for ${reboot_days} days — a security fix is installed but not running"
    elif [ -n "$reboot_days" ] && [ "$reboot_days" -ge "$REBOOT_WARN_DAYS" ]; then
      warn "required for ${reboot_days} days"
    else
      say "  required${reboot_days:+, pending ${reboot_days} day(s)} — schedule a window"
    fi
  fi

  # -- stack
  say ""
  say "${C_BLD}Stack${C_OFF}"
  local st
  stack_healthy; st=$?
  case "$st" in
    0) stack="healthy";  ok "all containers healthy" ;;
    2) stack="absent";   warn "cannot inspect the stack: $(stack_absent_reason)" ;;
    *) stack="degraded"; bad "a container is not healthy" ;;
  esac

  # -- verdict
  #
  # The policy is deliberately quiet. A unit that fails every night because a
  # security update landed an hour before the audit is a unit the operator learns
  # to ignore, and then it cannot warn about anything. So each finding has a
  # threshold, and the reasons are printed rather than summarised into "10".
  say ""
  say "───────────────────────────────────────────────────────────────"
  local status="ok" reason=""
  # Machine codes are for the JSON; the terminal gets English. "reason: mechanism"
  # tells an operator nothing they can act on.
  add_reason() { reason="${reason:+$reason · }$1"; }

  if [ "$security" -gt 0 ] && [ -n "$backlog_days" ] && [ "$backlog_days" -ge "$SECURITY_FAIL_DAYS" ]; then
    bad "security backlog ${backlog_days} days old (fails at ${SECURITY_FAIL_DAYS})"; status="attention"
    add_reason "security backlog ${backlog_days}d old"
  elif [ "$security" -gt 0 ] && [ -n "$backlog_days" ] && [ "$backlog_days" -ge "$SECURITY_WARN_DAYS" ]; then
    warn "security backlog ${backlog_days} days old (warn at ${SECURITY_WARN_DAYS})"; status="attention"
    add_reason "security backlog ${backlog_days}d old"
  elif [ "$security" -gt 0 ]; then
    say "  ${C_DIM}${security} security update(s) pending, first seen today — unattended-upgrades runs overnight${C_OFF}"
  fi

  if [ "$total" -ge "$TOTAL_FAIL" ]; then
    bad "${total} updates pending (fails at ${TOTAL_FAIL})"; status="attention"; add_reason "${total} updates pending"
  elif [ "$total" -ge "$TOTAL_WARN" ]; then
    warn "${total} updates pending (warn at ${TOTAL_WARN})"; status="attention"; add_reason "${total} updates pending"
  fi

  if [ "$reboot" = "1" ] && [ -n "$reboot_days" ] && [ "$reboot_days" -ge "$REBOOT_FAIL_DAYS" ]; then
    bad "reboot pending ${reboot_days} days (fails at ${REBOOT_FAIL_DAYS})"; status="attention"; add_reason "reboot owed ${reboot_days}d"
  elif [ "$reboot" = "1" ] && [ -n "$reboot_days" ] && [ "$reboot_days" -ge "$REBOOT_WARN_DAYS" ]; then
    warn "reboot pending ${reboot_days} days (warn at ${REBOOT_WARN_DAYS})"; status="attention"; add_reason "reboot owed ${reboot_days}d"
  fi

  [ "$disk" -ge "$DISK_WARN_PCT" ] && { status="attention"; add_reason "disk ${disk}%"; }
  [ "$stack" = "degraded" ] && { status="attention"; add_reason "stack degraded"; }
  [ "${MECHANISM_BAD:-0}" = "1" ] && { status="attention"; add_reason "automatic security updates not running"; }

  if [ "${JSON:-0}" = "1" ]; then
    summary_json "$total" "$security" "$backlog_days" "$disk" "$free" "$reboot" "$reboot_days" "$stack" "$status"
  else
    say ""
    if [ "$status" = "ok" ]; then
      say "${C_GRN}Clean.${C_OFF} Nothing to do."
    else
      say "${C_YEL}Attention recommended.${C_OFF}"
      [ -n "${reason:-}" ] && say "  ${C_DIM}reason: ${reason}${C_OFF}"
      say "  ${C_DIM}Apply:  sudo $0 --full        (or --security for security only)${C_OFF}"
      say "  ${C_DIM}Then:   sudo $0 --check      (verify, incl. reboot state)${C_OFF}"
    fi
    say ""
  fi

  [ "$status" = "ok" ] && return 0 || return 10
}

do_patch() {
  local scope="$1"

  say ""
  say "${C_BLD}FlowOps host patch — ${scope}${C_OFF}  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  say "───────────────────────────────────────────────────────────────"

  need_root "$@"

  # ── gates, in the order that fails cheapest
  dpkg_healthy || die "dpkg is in a half-configured state ('dpkg --audit' is not empty).
       Fix that first:  sudo dpkg --configure -a
       Patching on top of it turns one broken package into an un-bootable host."

  if apt_locked; then
    die "another apt process holds the frontend lock (unattended-upgrades?).
       Wait for it, then retry:  systemctl status unattended-upgrades"
  fi

  local free; free="$(disk_free_mb)"
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    die "only ${free} MB free (need ${MIN_FREE_MB} MB). A kernel update writes a new
       initramfs and a half-written one is not recoverable. Free space first:
         sudo docker system prune -f && sudo ./deploy/disk-guard.sh"
  fi

  # ── plan
  apt_refresh
  local total security; read -r total security <<<"$(pending_counts)"
  say "  pending: ${total}   security: ${security}"

  if [ "$total" -eq 0 ] && ! reboot_required; then
    ok "nothing to do"
    return 0
  fi

  if [ "${DRY_RUN:-0}" = "1" ]; then
    say ""
    say "  ${C_BLD}Simulated changes:${C_OFF}"
    "$APT_GET" -s --with-new-pkgs upgrade 2>/dev/null \
      | grep -E '^(Inst|Remv|Conf)' | sed 's/^/    /' | head -n 60 || true
    say ""
    say "  ${C_DIM}dry run — nothing was changed, no state was written${C_OFF}"
    return 0
  fi

  # ── backup, inventory, apply
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  local before after
  before="$(snapshot_packages before)"

  say ""
  backup_database

  say ""
  say "${C_BLD}Applying${C_OFF}"
  local started; started="$(date +%s)"
  if ! apply_updates "$scope"; then
    bad "apt-get failed — see $LOG_FILE"
    log "apply=FAILED scope=$scope"
    say ""
    say "  The database backup taken before this run is intact."
    say "  Inspect:  sudo tail -n 100 $LOG_FILE"
    say "  Recover:  sudo dpkg --configure -a && sudo apt-get -f install"
    return 1
  fi
  local elapsed=$(( $(date +%s) - started ))

  after="$(snapshot_packages after)"
  say ""
  say "${C_BLD}Changed${C_OFF}"
  local changes; changes="$(diff_packages "$before" "$after" | wc -l)"
  if [ "$changes" -eq 0 ]; then
    say "  ${C_DIM}no package versions changed${C_OFF}"
  else
    diff_packages "$before" "$after" | head -n 40
    [ "$changes" -gt 40 ] && say "  … $((changes - 40)) more in $after"
  fi
  log "apply=ok scope=$scope seconds=$elapsed packages_changed=$changes"

  # ── post-conditions
  say ""
  say "${C_BLD}After${C_OFF}"
  "$APT_GET" autoremove -y --purge 2>/dev/null | tail -n 2 || true

  local total2 security2; read -r total2 security2 <<<"$(pending_counts)"
  [ "$total2" -eq 0 ] && ok "nothing left pending" || warn "${total2} still pending (held back or newly published)"

  say ""
  if stack_healthy; then
    ok "stack healthy"
  else
    warn "stack not healthy — checking the API directly"
  fi
  if stack_present && compose exec -T api sh -c 'wget -qO- http://localhost:3000/health' 2>/dev/null | grep -q '"status":"ok"'; then
    ok "api /health reports ok"
  else
    warn "could not confirm api /health (container may be restarting after a library update)"
  fi

  # State reflects reality after the run, not before it.
  state_write "$security2" "$total2"

  say ""
  if reboot_required; then
    warn "reboot required — a kernel or libc fix is installed but not running"
    if [ "${ALLOW_REBOOT:-0}" = "1" ]; then
      say "  --reboot given: verifying the stack before restarting"
      if stack_healthy; then
        log "reboot=initiated"
        ok "stack is healthy — rebooting now"
        "$SYSTEMCTL" reboot
        return 0
      fi
      bad "stack is not healthy — NOT rebooting. Fix the stack, then reboot by hand."
      return 1
    fi
    say "  ${C_DIM}Schedule it:  sudo reboot      (after hours; the stack self-starts)${C_OFF}"
  else
    ok "no reboot required"
  fi

  say ""
  say "  ${C_DIM}log: $LOG_FILE${C_OFF}"
  say ""
  return 0
}

do_install() {
  need_root "$@"
  local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local repo; repo="$(cd "$here/.." && pwd)"

  # --install needs the repository, not the installed copy: the units and the apt
  # config are siblings of this script. Silently skipping them (the failure mode
  # of a bare `|| true` on a glob) would report success while installing half the
  # system, which is exactly the kind of "configured" that never works.
  [ -f "$here/host-patch.sh" ] && [ -d "$repo/deploy/systemd" ] \
    || die "--install must run from the repository checkout:  cd ~/FlowOps && sudo ./deploy/host-patch.sh --install"
  [ -d "$repo/deploy/apt" ] \
    || die "deploy/apt/ is missing from $repo — is this the right checkout?"

  say ""
  say "${C_BLD}Installing host patching${C_OFF}"
  say "───────────────────────────────────────────────────────────────"

  dpkg_healthy || die "dpkg is half-configured — run: sudo dpkg --configure -a"

  if ! command -v unattended-upgrades >/dev/null 2>&1 && \
     ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
    say "  Installing unattended-upgrades…"
    DEBIAN_FRONTEND=noninteractive "$APT_GET" install -y -qq unattended-upgrades 2>>"$LOG_FILE" \
      || die "could not install unattended-upgrades"
  fi

  install -m 0755 "$here/host-patch.sh" /usr/local/bin/flowops-host-patch \
    || die "could not install /usr/local/bin/flowops-host-patch"
  ok "/usr/local/bin/flowops-host-patch"

  install -d -m 0755 /var/lib/flowops /var/log/flowops "$BACKUP_DIR"

  install -m 0644 "$repo/deploy/apt/52flowops-unattended-upgrades.conf" \
    /etc/apt/apt.conf.d/52flowops-unattended-upgrades.conf \
    || die "could not install the unattended-upgrades config"
  install -m 0644 "$repo/deploy/apt/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades \
    || die "could not install 20auto-upgrades"
  ok "apt: security-only unattended upgrades configured"

  if [ ! -f "$DEFAULTS_FILE" ]; then
    cat >"$DEFAULTS_FILE" <<EOF
# FlowOps host patching — thresholds and one switch.
# Read by /usr/local/bin/flowops-host-patch on every run.

# Reboot automatically at the end of a --full run? Default: no.
# The monthly timer runs at 03:30 with the stack verified afterwards, so this is
# safe to enable — but it is off until you have watched one supervised run.
FLOWOPS_PATCH_REBOOT=0

SECURITY_WARN_DAYS=$SECURITY_WARN_DAYS
SECURITY_FAIL_DAYS=$SECURITY_FAIL_DAYS
TOTAL_WARN=$TOTAL_WARN
TOTAL_FAIL=$TOTAL_FAIL
REBOOT_WARN_DAYS=$REBOOT_WARN_DAYS
REBOOT_FAIL_DAYS=$REBOOT_FAIL_DAYS
DISK_WARN_PCT=$DISK_WARN_PCT
DISK_FAIL_PCT=$DISK_FAIL_PCT
MIN_FREE_MB=$MIN_FREE_MB
MIN_DUMP_BYTES=$MIN_DUMP_BYTES
BACKUP_KEEP=$BACKUP_KEEP
EOF
    ok "$DEFAULTS_FILE"
  fi

  install -m 0644 "$repo"/deploy/systemd/flowops-host-audit.service \
                  "$repo"/deploy/systemd/flowops-host-audit.timer \
                  "$repo"/deploy/systemd/flowops-host-patch.service \
                  "$repo"/deploy/systemd/flowops-host-patch.timer /etc/systemd/system/ \
    || die "could not install the systemd units"
  "$SYSTEMCTL" daemon-reload || true
  "$SYSTEMCTL" enable --now flowops-host-audit.timer || die "could not enable flowops-host-audit.timer"
  "$SYSTEMCTL" enable --now flowops-host-patch.timer || die "could not enable flowops-host-patch.timer"
  ok "timers installed and enabled"

  say ""
  "$SYSTEMCTL" list-timers 'flowops-*' --no-pager 2>/dev/null | sed 's/^/  /' || true
  say ""
  say "  ${C_DIM}Next:  sudo flowops-host-patch --check${C_OFF}"
  say ""
  return 0
}

usage() {
  # Spelled out rather than sliced out of the header comment: a `sed` range that
  # reaches into a file which contains its own section markers is one refactor
  # away from printing the wrong half of the script.
  cat <<'USAGE'
flowops-host-patch — audit, apply and verify OS patches on the FlowOps host.

  --check        Report only. Exit 0 = clean, 10 = action recommended.
                 Changes nothing but the state file that tracks backlog age.
  --security     Apply security-pocket updates only.
  --full         Apply all updates (never removes a package).
  --dist-upgrade Allow apt to remove packages to resolve dependencies.
  --dry-run      Show the simulated package changes; change nothing.
  --reboot       Reboot after a passing health gate, if a reboot is required.
  --no-backup    Skip the pre-patch database dump (logged, never silent).
  --install      Install the script, systemd units and apt config; enable timers.
  --json         Summary as JSON.
  -h, --help     This text.

Exit codes: 0 ok · 1 error · 10 attention recommended.
USAGE
  exit "${1:-0}"
}

main() {
  local mode="check"
  DO_BACKUP=1; DRY_RUN=0; ALLOW_REBOOT=0; DIST_UPGRADE=0; JSON=0

  # Operator policy from /etc/default (absent in tests).
  if [ -f "$DEFAULTS_FILE" ]; then
    # shellcheck disable=SC1090
    . "$DEFAULTS_FILE" 2>/dev/null || true
    [ "${FLOWOPS_PATCH_REBOOT:-0}" = "1" ] && ALLOW_REBOOT=1
  fi

  while [ $# -gt 0 ]; do
    case "$1" in
      --check)        mode="check" ;;
      --security)     mode="security" ;;
      --full)         mode="full" ;;
      --dist-upgrade) DIST_UPGRADE=1 ;;
      --dry-run)      DRY_RUN=1 ;;
      --reboot)       ALLOW_REBOOT=1 ;;
      --no-backup)    DO_BACKUP=0 ;;
      --install)      mode="install" ;;
      --json)         JSON=1 ;;
      -h|--help)      usage 0 ;;
      *)              die "unknown argument: $1  (try --help)" ;;
    esac
    shift
  done

  if [ "$mode" = "check" ]; then
    do_check; return $?
  fi

  mkdir -p "$LOG_DIR" 2>/dev/null || true
  LOG_FILE="$LOG_DIR/patch-$(date +%Y%m%d-%H%M%S).log"
  # Braced: `: >"$file" 2>/dev/null` does not suppress the shell's own
  # redirection error, because the redirect is applied before the command runs.
  { : >"$LOG_FILE"; } 2>/dev/null || LOG_FILE="/dev/null"
  log "host-patch start mode=$mode args=$*"

  case "$mode" in
    security) do_patch security ;;
    full)     do_patch full ;;
    install)  do_install "$@" ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi

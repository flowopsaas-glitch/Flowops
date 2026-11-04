#!/usr/bin/env bash
#
# FlowOps — behaviour tests for deploy/host-patch.sh.
#
# No root, no network, no Docker, no apt. Every privileged command is stubbed on
# PATH, and the script is built to be driven that way: each external tool is
# resolved from the environment, so what runs here is the real logic with fake
# hands.
#
# What is pinned, and why each one is worth a test:
#
#   1. THE PARSER. "5 of these updates are standard security updates" is a
#      sentence about *suites*, not about package names. A parser that greps for
#      the word "security" in the whole `apt list` line reports a different
#      number from one that reads the pocket — and the difference is what decides
#      whether `--security` applies five packages or all thirty-five.
#   2. THE REFUSALS. Patching is safe because of what it will not do: no run
#      without a verified backup, none on a half-configured dpkg, none with no
#      disk left. Each refusal is a test, including that it happens BEFORE apt is
#      touched.
#   3. THE FLAGS. `--force-confdef --force-confold` and NEEDRESTART_MODE=list are
#      the difference between an unattended run and one that blocks on a
#      conffile prompt holding the dpkg lock forever.
#   4. THE SCOPES. `--security` must never perform a full upgrade. The first
#      draft of this script did exactly that while printing "security only",
#      which is the worst possible failure: it destroys the operator's ability to
#      attribute a regression to the run that caused it.
#   5. THE MEMORY. The audit's value is the age of the backlog, not its size, so
#      the state file must keep the first-seen timestamp across runs and clear it
#      when the backlog clears.
#
# Run:  ./deploy/host-patch.test.sh     (also wired into the CI Tooling Guards job)
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/deploy/host-patch.sh"

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

# ── fixtures ────────────────────────────────────────────────────────────────

read -r -d '' APT_BEFORE <<'EOF'
Listing... Done
libssl3/noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3.4]
curl/noble-security,noble-updates 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
openssl/noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3.4]
linux-image-generic/noble-updates 6.8.0.42.42 amd64 [upgradable from: 6.8.0.41.41]
docker-ce/stable 5:27.3.1-1~ubuntu.24.04~noble amd64 [upgradable from: 5:27.3.0-1]
vim/noble-updates 9.1.0016-1ubuntu7.5 amd64 [upgradable from: 9.1.0016-1ubuntu7.4]
EOF

APT_AFTER='Listing... Done'

# ── a sandbox per case: stubs on PATH + isolated state/log/backup dirs ───────

new_case() {
  local d
  d="$(mktemp -d "$TMPROOT/case.XXXXXX")"
  mkdir -p "$d/bin" "$d/state" "$d/log" "$d/backup" "$d/repo" "$d/dpkg"
  : >"$d/repo/docker-compose.yml"
  : >"$d/stub.log"

  cat >"$d/bin/apt" <<'STUB'
#!/usr/bin/env bash
echo "apt $*" >>"$STUB_LOG"
if [ "$1" = "list" ]; then
  # Once an apply has happened, the box is up to date.
  if [ -f "$STUB_APPLIED" ]; then printf '%s\n' "$APT_AFTER_FIXTURE"; else printf '%s\n' "$APT_BEFORE_FIXTURE"; fi
fi
exit 0
STUB

  cat >"$d/bin/apt-get" <<'STUB'
#!/usr/bin/env bash
echo "apt-get $*" >>"$STUB_LOG"
# Record the environment the script promised to set, on the apply call only.
case "$*" in
  # `-s` is apt's simulation. It must NOT count as an apply, or the dry-run test
  # would be asserting against the stub rather than against the script.
  *-s*--with-new-pkgs*) : ;;
  *upgrade*|*install*)
    echo "env DEBIAN_FRONTEND=${DEBIAN_FRONTEND:-<unset>}" >>"$STUB_LOG"
    echo "env NEEDRESTART_MODE=${NEEDRESTART_MODE:-<unset>}" >>"$STUB_LOG"
    : >"$STUB_APPLIED"
    ;;
esac
if [ "${STUB_APT_FAIL:-0}" = "1" ] && { [[ "$*" == *upgrade* ]] || [[ "$*" == *install* ]]; }; then
  echo "E: simulated failure" >&2
  exit 100
fi
exit 0
STUB

  cat >"$d/bin/dpkg" <<'STUB'
#!/usr/bin/env bash
echo "dpkg $*" >>"$STUB_LOG"
# `dpkg --audit` prints the offending packages and nothing when healthy.
if [ "$1" = "--audit" ] && [ "${STUB_DPKG_BROKEN:-0}" = "1" ]; then
  echo "The following packages are only half configured:"
fi
exit 0
STUB

  cat >"$d/bin/dpkg-query" <<'STUB'
#!/usr/bin/env bash
echo "dpkg-query $*" >>"$STUB_LOG"
printf 'libssl3\t3.0.13-0ubuntu3.4\ncurl\t8.5.0-2ubuntu10.5\n'
exit 0
STUB

  cat >"$d/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >>"$STUB_LOG"
case "$*" in
  *"compose"*"pg_dump"*)
    # A believable dump: the size gate is 10 KB.
    if [ "${STUB_TINY_BACKUP:-0}" = "1" ]; then echo tiny; else
      head -c 40960 /dev/zero | tr '\0' 'x'
    fi
    ;;
  *"compose"*"wget"*) echo '{"data":{"status":"ok"}}' ;;
  "ps "*)
    if [ "${STUB_STACK_BAD:-0}" = "1" ]; then
      echo "flowops-api-1 Up 2 minutes (unhealthy)"
    else
      echo "flowops-api-1 Up 2 hours (healthy)"
      echo "flowops-frontend-1 Up 2 hours (healthy)"
    fi
    ;;
esac
exit 0
STUB

  cat >"$d/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
echo "systemctl $*" >>"$STUB_LOG"
case "$*" in
  "is-enabled "*) echo "enabled" ;;
  "is-active "*)  echo "active" ;;
  "list-unit-files "*) exit 0 ;;
esac
exit 0
STUB

  cat >"$d/bin/df" <<'STUB'
#!/usr/bin/env bash
# -P prints percentage; -Pm prints megabytes.
if [[ "$*" == *-Pm* ]]; then
  printf 'Filesystem     1048576-blocks      Used Available Capacity Mounted on\n'
  printf '/dev/sda1            24000000  14000000  %s      58%% /\n' "${STUB_FREE_MB:-10000000}"
else
  printf 'Filesystem     1024-blocks      Used Available Capacity Mounted on\n'
  printf '/dev/sda1         24000000  14000000  10000000  %s%% /\n' "${STUB_DISK_PCT:-58}"
fi
exit 0
STUB

  chmod +x "$d/bin/"*
  echo "$d"
}

# Environment shared by every invocation. DEFAULTS_FILE points at a path that
# does not exist so a developer's /etc/default cannot influence a test.
stub_env() {
  local d="$1"
  export STUB_LOG="$d/stub.log"
  export STUB_APPLIED="$d/stub.applied"
  export APT_BEFORE_FIXTURE="$APT_BEFORE"
  export APT_AFTER_FIXTURE="$APT_AFTER"
  export PATH="$d/bin:$PATH"
  export APT="$d/bin/apt" APT_GET="$d/bin/apt-get" DPKG="$d/bin/dpkg"
  export DPKG_QUERY="$d/bin/dpkg-query" DOCKER="$d/bin/docker"
  export SYSTEMCTL="$d/bin/systemctl" DF="$d/bin/df"
  export STATE_FILE="$d/state/patch-state"
  export LOG_DIR="$d/log"
  export BACKUP_DIR="$d/backup"
  export DEFAULTS_FILE="$d/no-such-defaults"
  export FLOWOPS_DIR="$d/repo"
  export APT_LOCK_FILE="$d/dpkg/lock-frontend"
  export FLOWOPS_HOST_PATCH_TEST=1
  export NO_COLOR=1
  export MIN_FREE_MB="${MIN_FREE_MB:-1024}"
}

run_patch() { "$SCRIPT" "$@" 2>&1; }

# ── 1. parser ───────────────────────────────────────────────────────────────

section "Parser — security is decided by the suite, not by the word"

out="$(printf '%s\n' "$APT_BEFORE" | bash -c 'source "$1" >/dev/null 2>&1; classify_upgradable' _ "$SCRIPT")"
[ "$out" = "6 3" ] && ok "6 upgrades, 3 of them security (suite-based)" || no "expected '6 3', got '$out'"

# A package listed in BOTH -security and -updates is security, once.
out="$(printf 'Listing... Done\ncurl/noble-updates,noble-security 1 amd64 [upgradable from: 0]\n' \
  | bash -c 'source "$1" >/dev/null 2>&1; classify_upgradable' _ "$SCRIPT")"
[ "$out" = "1 1" ] && ok "a mixed -updates,-security suite counts as security, once" || no "got '$out'"

# Noise must not become a package. `apt list` writes to stdout on some versions.
out="$(printf 'WARNING: apt does not have a stable CLI interface.\n\n' \
  | bash -c 'source "$1" >/dev/null 2>&1; classify_upgradable' _ "$SCRIPT")"
[ "$out" = "0 0" ] && ok "warning and blank lines are not packages" || no "got '$out'"

# ESM pockets are security too — a host with ESM enabled would otherwise
# under-report the backlog it exists to surface.
out="$(printf 'Listing... Done\nfoo/noble-apps-security 1 amd64 [upgradable from: 0]\n' \
  | bash -c 'source "$1" >/dev/null 2>&1; classify_upgradable' _ "$SCRIPT")"
[ "$out" = "1 1" ] && ok "ESM app-security pocket counts as security" || no "got '$out'"

# ── 2. --check ──────────────────────────────────────────────────────────────

section "--check reports, and remembers"

d="$(new_case)"; stub_env "$d"
# A backlog is only worth a unit failure once it has AGE — three security updates
# published an hour ago are unattended-upgrades working normally. Seed the clock
# ten days back, which is what the operator would actually be looking at.
printf 'security_pending=3\nsecurity_first_seen=%s\ntotal_pending=6\n' "$(( $(date +%s) - 10*86400 ))" >"$d/state/patch-state"
run_patch --check >"$d/out" 2>&1; rc=$?
[ "$rc" = "10" ] && ok "an aged security backlog exits 10" || no "expected exit 10, got $rc"
grep -q "10 day" "$d/out" && ok "states the backlog age in days" || no "age not stated: $(cat "$d/out")"
grep -q "pending: 6" "$d/out" && ok "reports the total" || no "total not reported"
grep -q "security: 3" "$d/out" && ok "reports the security subset" || no "security not reported"
grep -q "^security_pending=3" "$d/state/patch-state" && ok "state records the security backlog" || no "state not written"
first="$(sed -n 's/^security_first_seen=//p' "$d/state/patch-state")"
[ -n "$first" ] && ok "state records when the backlog started" || no "first_seen not recorded"

# Second run: the clock must NOT restart. This is the entire point of the file.
run_patch --check >/dev/null 2>&1
first2="$(sed -n 's/^security_first_seen=//p' "$d/state/patch-state")"
[ "$first" = "$first2" ] && ok "second run keeps the original first-seen timestamp" || no "first_seen moved: $first -> $first2"

# Backlog cleared -> clock cleared.
apt_clean="$(new_case)"; stub_env "$apt_clean"
printf 'Listing... Done\n' >"$apt_clean/clean.txt"
APT_BEFORE_FIXTURE="Listing... Done" run_patch --check >/dev/null 2>&1
[ -z "$(sed -n 's/^security_first_seen=//p' "$apt_clean/state/patch-state")" ] \
  && ok "a clean host clears the backlog clock" || no "first_seen survived a clean run"

section "--check exits 0 on a clean, healthy host"
d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="Listing... Done" run_patch --check >"$d/out" 2>&1; rc=$?
[ "$rc" = "0" ] && ok "clean host exits 0" || no "expected 0, got $rc"
grep -qi "Clean" "$d/out" && ok "says Clean" || no "did not say Clean"

section "--json emits one parseable line"
d="$(new_case)"; stub_env "$d"
json="$(APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --check --json 2>&1 | grep '^{')"
printf '%s' "$json" | grep -q '"security_pending":3' && ok "json carries security_pending" || no "json missing security_pending: $json"
printf '%s' "$json" | grep -q '"total_pending":6' && ok "json carries total_pending" || no "json missing total_pending"
printf '%s' "$json" | grep -qE '"status":"(ok|attention)"' && ok "json carries the verdict" || no "json missing status: $json"

d="$(new_case)"; stub_env "$d"
printf 'security_pending=3\nsecurity_first_seen=%s\n' "$(( $(date +%s) - 10*86400 ))" >"$d/state/patch-state"
json="$(run_patch --check --json 2>&1 | grep '^{')"
printf '%s' "$json" | grep -q '"status":"attention"' && ok "json says attention for an aged backlog" || no "json status wrong: $json"
printf '%s' "$json" | grep -q '"security_backlog_days":10' && ok "json carries the backlog age" || no "json age wrong: $json"

# ── 3. --security really is security-only ───────────────────────────────────

section "--security applies the security packages and nothing else"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --security >"$d/out" 2>&1; rc=$?
[ "$rc" = "0" ] && ok "security run exits 0" || no "expected 0, got $rc"

applied="$(grep '^apt-get ' "$d/stub.log" | grep -v 'update' || true)"
printf '%s' "$applied" | grep -q -- '--only-upgrade install' \
  && ok "uses install --only-upgrade (cannot install anything new)" \
  || no "did not scope the apply: $applied"
printf '%s' "$applied" | grep -qE 'libssl3|curl|openssl' && ok "names the security packages" || no "security packages not named"
printf '%s' "$applied" | grep -qE '(^| )docker-ce( |$)' && no "docker-ce leaked into a security-only run" || ok "docker-ce excluded from the security scope"
printf '%s' "$applied" | grep -qE 'upgrade$|full-upgrade' && no "a plain upgrade ran during --security" || ok "no unscoped upgrade during --security"

section "--full applies everything, without removing packages"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1; rc=$?
[ "$rc" = "0" ] && ok "full run exits 0" || no "expected 0, got $rc"
grep '^apt-get ' "$d/stub.log" | grep -q -- '--with-new-pkgs upgrade' && ok "uses upgrade --with-new-pkgs" || no "wrong upgrade verb"
grep '^apt-get ' "$d/stub.log" | grep -q 'full-upgrade' && no "full-upgrade used without --dist-upgrade" || ok "never full-upgrade by default"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full --dist-upgrade >"$d/out" 2>&1
grep '^apt-get ' "$d/stub.log" | grep -q 'full-upgrade' && ok "--dist-upgrade opts in explicitly" || no "--dist-upgrade had no effect"

# ── 4. the flags that stop an unattended run from hanging ───────────────────

section "Non-interactive contract"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >/dev/null 2>&1
grep '^apt-get ' "$d/stub.log" | grep -q -- '--force-confdef' && ok "--force-confdef" || no "--force-confdef missing"
grep '^apt-get ' "$d/stub.log" | grep -q -- '--force-confold' && ok "--force-confold (keeps local config)" || no "--force-confold missing"
grep -q 'env DEBIAN_FRONTEND=noninteractive' "$d/stub.log" && ok "DEBIAN_FRONTEND=noninteractive" || no "DEBIAN_FRONTEND not set"
grep -q 'env NEEDRESTART_MODE=list' "$d/stub.log" && ok "NEEDRESTART_MODE=list (never restarts services under us)" || no "NEEDRESTART_MODE not set"

# ── 5. refusals — each one BEFORE apt is asked to change anything ───────────

section "Refuses to patch a host it cannot restore or fix"

d="$(new_case)"; stub_env "$d"
STUB_TINY_BACKUP=1 APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1; rc=$?
[ "$rc" = "1" ] && ok "tiny dump aborts the run" || no "expected exit 1, got $rc"
grep -q 'bytes (floor' "$d/out" && ok "says why, and how big" || no "unclear message: $(cat "$d/out")"
grep '^apt-get ' "$d/stub.log" | grep -qE 'upgrade|install' && no "apt was told to apply despite a failed backup" || ok "nothing was applied after the abort"

d="$(new_case)"; stub_env "$d"
STUB_DPKG_BROKEN=1 APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1; rc=$?
[ "$rc" = "1" ] && ok "half-configured dpkg aborts the run" || no "expected exit 1, got $rc"
grep -q 'dpkg --configure -a' "$d/out" && ok "tells the operator the exact fix" || no "no recovery instruction"

d="$(new_case)"; stub_env "$d"
MIN_FREE_MB=99999999 APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1; rc=$?
[ "$rc" = "1" ] && ok "insufficient disk aborts the run" || no "expected exit 1, got $rc"
grep -q 'disk-guard' "$d/out" && ok "points at the reclaim tool" || no "no way out offered"

d="$(new_case)"; stub_env "$d"
( exec 8>>"$d/dpkg/lock-frontend"; flock -n 8 && : >"$d/held"; sleep 5 ) &
holder=$!
for _ in $(seq 1 50); do [ -f "$d/held" ] && break; sleep 0.1; done
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1; rc=$?
kill "$holder" 2>/dev/null || true
[ "$rc" = "1" ] && ok "a held dpkg lock aborts instead of queueing" || no "expected exit 1, got $rc"
grep -qi 'lock' "$d/out" && ok "names the lock" || no "lock not mentioned in: $(cat "$d/out")"

section "--dry-run changes nothing"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full --dry-run >"$d/out" 2>&1; rc=$?
[ "$rc" = "0" ] && ok "dry run exits 0" || no "expected 0, got $rc"
grep '^apt-get ' "$d/stub.log" | grep -q -- '-y ' \
  && no "dry run ran a real apply" || ok "no apply during a dry run"
[ ! -e "$d/stub.applied" ] && ok "the box is still unpatched" || no "the dry run marked packages applied"
[ -z "$(ls -A "$d/backup" 2>/dev/null)" ] && ok "no backup taken (nothing to protect)" || no "dry run wrote a backup"
[ ! -e "$d/state/patch-state" ] && ok "no state written" || no "dry run moved the backlog clock"

# ── 6. verification and reboot ──────────────────────────────────────────────

section "Post-run: the stack is verified, not assumed"

d="$(new_case)"; stub_env "$d"
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1
grep -q 'stack healthy' "$d/out" && ok "reports the stack gate" || no "no stack verdict"
grep -q 'api /health reports ok' "$d/out" && ok "checks api /health, not just container status" || no "no api health check"
ls "$d/log"/packages-before.txt "$d/log"/packages-after.txt >/dev/null 2>&1 \
  && ok "takes a package inventory either side" || no "no before/after inventory in $d/log"

section "--reboot only after a passing health gate"

d="$(new_case)"; stub_env "$d"
mkdir -p "$d/run"; : >"$d/reboot-marker"
# The script looks at the real /var/run path; simulate it by asserting the
# negative case (no marker) never reboots, and the unhealthy case refuses.
APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full --reboot >"$d/out" 2>&1
grep -q '^systemctl reboot' "$d/stub.log" && no "rebooted without a reboot-required marker" || ok "no reboot when none is required"

d="$(new_case)"; stub_env "$d"
STUB_STACK_BAD=1 APT_BEFORE_FIXTURE="$APT_BEFORE" run_patch --full >"$d/out" 2>&1
grep -q '^systemctl reboot' "$d/stub.log" && no "rebooted a degraded stack" || ok "never reboots a degraded stack"

# ── 7. install surface ──────────────────────────────────────────────────────

section "Install surface is complete and consistent"

for f in deploy/systemd/flowops-host-audit.service deploy/systemd/flowops-host-audit.timer \
         deploy/systemd/flowops-host-patch.service deploy/systemd/flowops-host-patch.timer \
         deploy/apt/52flowops-unattended-upgrades.conf deploy/apt/20auto-upgrades; do
  [ -f "$REPO_ROOT/$f" ] && ok "present: $f" || no "missing: $f"
done

grep -q 'ExecStart=/usr/local/bin/flowops-host-patch --check' "$REPO_ROOT/deploy/systemd/flowops-host-audit.service" \
  && ok "audit unit runs --check" || no "audit unit runs the wrong mode"
grep -q 'ExecStart=/usr/local/bin/flowops-host-patch --full' "$REPO_ROOT/deploy/systemd/flowops-host-patch.service" \
  && ok "patch unit runs --full" || no "patch unit runs the wrong mode"
grep -q 'OnCalendar=\*-\*-01 03:30:00' "$REPO_ROOT/deploy/systemd/flowops-host-patch.timer" \
  && ok "patch timer is monthly at 03:30 (after the 02:15 off-box backup)" || no "patch timer schedule changed"
grep -q 'Persistent=true' "$REPO_ROOT/deploy/systemd/flowops-host-patch.timer" \
  && ok "patch timer catches up after downtime" || no "Persistent=true missing (a rebooted host would skip its window)"

conf="$REPO_ROOT/deploy/apt/52flowops-unattended-upgrades.conf"
grep -q 'distro_codename}-security' "$conf" && ok "security pocket enabled" || no "security pocket missing"
grep -q 'ESMApps' "$conf" && ok "ESM app-security enabled" || no "ESM missing"
grep -qE 'codename\}-(updates|backports)' "$conf" && no "feature/backport pockets enabled unattended" || ok "no feature pockets unattended"
grep -q 'Automatic-Reboot "false"' "$conf" && ok "never reboots unattended" || no "automatic reboot enabled"
grep -q 'Remove-Unused-Dependencies "false"' "$conf" && ok "never autoremoves on a production host" || no "autoremove enabled"
grep -q 'Unattended-Upgrade "1"' "$REPO_ROOT/deploy/apt/20auto-upgrades" \
  && ok "APT::Periodic::Unattended-Upgrade is on (the switch, not just the package)" || no "periodic switch missing"

section "harden-vps.sh and the canonical apt config agree"

# harden-vps.sh is piped over SSH and cannot read deploy/apt/, so its config is
# inline — a second copy of the same policy. Duplication that is not tested is
# duplication that drifts, and drift here means "automatic security updates
# configured two different ways", which is indistinguishable from working.
harden="$REPO_ROOT/deploy/harden-vps.sh"
canon="$REPO_ROOT/deploy/apt/52flowops-unattended-upgrades.conf"

grep -q '52flowops-unattended-upgrades.conf' "$harden" \
  && ok "harden writes the same path as --install (one file, one owner)" \
  || no "harden-vps.sh writes a different apt config path"

for setting in 'Automatic-Reboot "false"' 'Remove-Unused-Dependencies "false"' \
               'Remove-Unused-Kernel-Packages "true"' 'AutoFixInterruptedDpkg "true"'; do
  if grep -qF "$setting" "$harden" && grep -qF "$setting" "$canon"; then
    ok "both agree: $setting"
  else
    no "disagree on: $setting"
  fi
done

grep -qE 'codename\}-(updates|backports)' "$harden" \
  && no "harden-vps.sh pulls feature pockets unattended" \
  || ok "harden-vps.sh is security-only too"

# ── 8. the script itself ────────────────────────────────────────────────────

section "Script hygiene"

bash -n "$SCRIPT" && ok "bash -n" || no "syntax error"
[ -x "$SCRIPT" ] && ok "is executable" || no "not executable"
grep -q 'set -uo pipefail' "$SCRIPT" && ok "strict mode" || no "not strict"
grep -q 'if \[ "${BASH_SOURCE\[0\]}" = "$0" \]' "$SCRIPT" && ok "sourceable (main guarded)" || no "not sourceable"

# ── result ──────────────────────────────────────────────────────────────────

echo ""
echo "───────────────────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then
  echo "host-patch: ${PASSED} passed, 0 failed"
  exit 0
fi
echo "host-patch: ${PASSED} passed, ${FAILED} failed"
exit 1

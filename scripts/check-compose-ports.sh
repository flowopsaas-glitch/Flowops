#!/usr/bin/env bash
#
# FlowOps — assert a merged Compose config publishes no host ports.
#
# The VPS/production posture is "tunnel-only": cloudflared reaches the
# containers over the Docker network by service name, so nothing should be
# bound to a host interface. This script catches the failure mode where an
# override file *looks* like it removes ports but Compose's list-merge rules
# keep the base file's bindings (see deploy/docker-compose.vps.yml).
#
# Usage:
#   ./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml
#   ALLOW_LOOPBACK=1 ./scripts/check-compose-ports.sh -f docker-compose.yml -f docker-compose.prod.yml
#
# Env:
#   ALLOW_LOOPBACK=1   permit ports bound explicitly to 127.0.0.1 / ::1
#   COMPOSE_MIN_VERSION  minimum Docker Compose release (default 2.24.4 —
#                        the release that understands !reset / !override)
#
# Exit codes:
#   0  no unexpected host port bindings
#   1  host port bindings found (or Compose too old / config invalid)
#   2  bad usage
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_MIN_VERSION="${COMPOSE_MIN_VERSION:-2.24.4}"
ALLOW_LOOPBACK="${ALLOW_LOOPBACK:-0}"

if [[ $# -eq 0 ]]; then
  echo "usage: $0 -f <compose file> [-f <compose file> ...]" >&2
  exit 2
fi

die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

command -v python3 >/dev/null || die "python3 is required to parse the merged compose config"

# ── 1. Compose version gate ──────────────────────────────────────────────────
# `!reset` needs Compose 2.24+, `!override` needs 2.24.4+. Older releases
# either error on the tag or silently ignore it, re-publishing host ports.
command -v docker >/dev/null      || die "docker not installed"
docker compose version >/dev/null || die "docker compose v2 plugin not installed"

COMPOSE_VERSION="$(docker compose version --short 2>/dev/null || true)"
COMPOSE_VERSION="${COMPOSE_VERSION#v}"
[[ -n "$COMPOSE_VERSION" ]] || die "could not determine docker compose version"

if ! printf '%s\n%s\n' "$COMPOSE_MIN_VERSION" "$COMPOSE_VERSION" | sort -V -C; then
  die "Docker Compose >= ${COMPOSE_MIN_VERSION} required, found ${COMPOSE_VERSION}.
       docker-compose.vps.yml / docker-compose.prod.yml use !reset / !override
       to unbind host ports; older Compose merges port lists instead.
       Upgrade: sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
fi
ok "Docker Compose ${COMPOSE_VERSION} (>= ${COMPOSE_MIN_VERSION})"

# ── 2. Resolve the merged config ─────────────────────────────────────────────
CONFIG_JSON="$(docker compose "$@" config --format json 2>&1)" \
  || die "docker compose config failed for: $*
$CONFIG_JSON"

# ── 3. Assert no host-facing ports ───────────────────────────────────────────
printf '%s' "$CONFIG_JSON" | ALLOW_LOOPBACK="$ALLOW_LOOPBACK" python3 -c '
import json, os, sys

allow_loopback = os.environ.get("ALLOW_LOOPBACK") == "1"
try:
    cfg = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    print("could not parse compose config as JSON: %s" % exc, file=sys.stderr)
    sys.exit(1)

offenders = []
allowed = []
for name, svc in sorted((cfg.get("services") or {}).items()):
    for port in (svc.get("ports") or []):
        published = port.get("published")
        if published in (None, ""):
            continue  # container-internal port only (expose-style) - fine
        host_ip = port.get("host_ip") or "0.0.0.0"
        target = port.get("target")
        proto = port.get("protocol") or "tcp"
        entry = "%-16s %s:%s -> %s/%s" % (name, host_ip, published, target, proto)
        if host_ip in ("127.0.0.1", "::1", "localhost") and allow_loopback:
            allowed.append(entry)
        else:
            offenders.append(entry)

if allowed:
    print("Loopback-only bindings (permitted by ALLOW_LOOPBACK=1):")
    for entry in allowed:
        print("  " + entry)
    print()

if offenders:
    print("FAIL: these services publish ports on a non-loopback host interface:")
    for entry in offenders:
        print("  " + entry)
    print()
    print("Compose APPENDS list fields across -f files. To remove a binding set")
    print("in a base file, the override must use `ports: !reset []` (or")
    print("`ports: !override [...]` to replace it) - a bare `ports: []` is a no-op.")
    sys.exit(1)

print("PASS: no host ports published (tunnel-only posture intact)")
'

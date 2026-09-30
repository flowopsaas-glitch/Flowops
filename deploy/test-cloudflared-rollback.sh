#!/usr/bin/env bash
#
# FlowOps — controlled Compose-level rollback rehearsal for cloudflared.
#
# This test renders both the approved target and a previous pinned image. It
# never calls `up`, never reads /etc/cloudflared, and never contacts a real
# tunnel. It is therefore safe in CI and on an operator workstation before a
# maintenance window. A live staging rehearsal remains required by the VPS
# runbook before any production maintenance is approved.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET_IMAGE="cloudflare/cloudflared:2026.9.3"
PREVIOUS_IMAGE="cloudflare/cloudflared:2026.9.2"
COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml)

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
command -v rg >/dev/null || { echo "ripgrep (rg) is required" >&2; exit 1; }

# These are rendering-only throwaway values for required interpolation in the
# base compose file. Do not source an operator .env into a CI/test process.
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-test-placeholder}"
export JWT_SECRET="${JWT_SECRET:-test-placeholder}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-test-placeholder}"
export OWNER_SEED_PASSWORD="${OWNER_SEED_PASSWORD:-test-placeholder}"

assert_model() {
  local expected_image="$1"
  local model="$2"
  printf '%s' "$model" | EXPECTED_IMAGE="$expected_image" python3 -c '
import json
import os
import sys

cfg = json.load(sys.stdin)
cf = cfg["services"]["cloudflared"]
expected = os.environ["EXPECTED_IMAGE"]
assert cf["image"] == expected, (cf["image"], expected)
assert cf["healthcheck"]["test"] == ["CMD", "cloudflared", "tunnel", "ready"]
env = cf.get("environment", {})
if isinstance(env, list):
    env = dict(x.split("=", 1) for x in env if "=" in x)
assert env["TUNNEL_METRICS"] == "127.0.0.1:2000"
assert not cf.get("ports"), cf.get("ports")
volumes = cf.get("volumes") or []
def is_expected_mount(volume):
    if isinstance(volume, str):
        return volume == "/etc/cloudflared:/etc/cloudflared:ro"
    return (
        volume.get("type") == "bind"
        and volume.get("source") == "/etc/cloudflared"
        and volume.get("target") == "/etc/cloudflared"
        and volume.get("read_only") is True
    )
assert len(volumes) == 1 and is_expected_mount(volumes[0]), volumes
print("PASS:", expected)
'
}

# Bootstrap scripts may inspect a legacy host service, but must never install or
# enable one again. Keep that regression check with the Compose rehearsal.
if rg -n 'cloudflared service install|systemctl +(enable|start) +cloudflared|/etc/systemd/system/cloudflared|releases/latest/download/cloudflared' \
  deploy/setup-vps.sh deploy/oracle-setup.sh deploy/vps-bootstrap.sh; then
  echo "FAIL: a bootstrap script can recreate the deprecated host cloudflared agent" >&2
  exit 1
fi
echo "PASS: bootstrap scripts cannot recreate the host cloudflared agent."

# Forward render: proves the target is fixed at an explicit release tag.
FORWARD="$(${COMPOSE[@]} config --format json)"
assert_model "$TARGET_IMAGE" "$FORWARD"

# Rollback render: the only override is image; all health, readonly credential
# mount, command, dependencies, and network settings are inherited unchanged.
OVERRIDE="$(mktemp)"
trap 'rm -f "$OVERRIDE"' EXIT
cat > "$OVERRIDE" <<EOF
services:
  cloudflared:
    image: ${PREVIOUS_IMAGE}
EOF
ROLLBACK="$(${COMPOSE[@]} -f "$OVERRIDE" config --format json)"
assert_model "$PREVIOUS_IMAGE" "$ROLLBACK"

echo "PASS: cloudflared rollback overlay changes only the pinned image reference."

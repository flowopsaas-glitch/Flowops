#!/usr/bin/env bash
#
# FlowOps — Cloudflare Tunnel single-owner guard.
#
# A tunnel must be owned by exactly one Docker Compose cloudflared container.
# A host-level cloudflared systemd service (or a second compose project) creates
# a second connector for the same credentials and was the root cause of an
# unstable tunnel during the original VPS cut-over.
#
# Usage:
#   ./deploy/check-cloudflared-owner.sh                  # static config + no host service
#   ./deploy/check-cloudflared-owner.sh --require-running # also assert one healthy live container
#
# This guard never starts, stops, disables, or masks anything. It is safe to
# run in a pre-flight check. Use cloudflared-maintenance.sh only in an approved
# maintenance window for a controlled change.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml)
REQUIRE_RUNNING=false

usage() {
  cat <<'EOF'
Usage: deploy/check-cloudflared-owner.sh [--require-running]

  --require-running  also require exactly one healthy live Compose tunnel
EOF
}

die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }

for arg in "$@"; do
  case "$arg" in
    --require-running) REQUIRE_RUNNING=true ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $arg (use --require-running)" ;;
  esac
done

command -v docker >/dev/null || die "docker is required"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
command -v python3 >/dev/null || die "python3 is required"

# A unit that merely exists but is disabled is historical evidence, not a
# competing connector. Active OR enabled is unsafe because it can claim the
# tunnel now or on the next reboot.
if command -v systemctl >/dev/null; then
  if systemctl is-active --quiet cloudflared.service; then
    die "Host-level cloudflared.service is active. Do not run a compose tunnel alongside it. Retire it through the approved maintenance action."
  fi

  UNIT_STATE="$(systemctl is-enabled cloudflared.service 2>/dev/null || true)"
  case "$UNIT_STATE" in
    enabled|enabled-runtime|linked|linked-runtime|alias)
      die "Host-level cloudflared.service is ${UNIT_STATE}. It could reclaim the tunnel after reboot; disable and mask it in the approved maintenance action."
      ;;
    masked|disabled|static|indirect|not-found|"")
      ;;
    *)
      warn "cloudflared.service has unexpected enablement state: ${UNIT_STATE}"
      ;;
  esac
fi
ok "No active or boot-enabled host cloudflared.service"

# Render the actual merged model rather than grepping YAML. The health command
# is native to cloudflared >= 2024.11 and probes its local /ready endpoint.
CONFIG_JSON="$(${COMPOSE[@]} config --format json)" \
  || die "Could not render the VPS Compose configuration"
printf '%s' "$CONFIG_JSON" | python3 -c '
import json
import sys

cfg = json.load(sys.stdin)
service = (cfg.get("services") or {}).get("cloudflared")
if not service:
    raise SystemExit("cloudflared service is missing from the VPS compose model")

expected_image = "cloudflare/cloudflared:2026.9.3"
if service.get("image") != expected_image:
    raise SystemExit(
        "cloudflared must use %s, got %r" % (expected_image, service.get("image"))
    )

health = service.get("healthcheck") or {}
if health.get("test") != ["CMD", "cloudflared", "tunnel", "ready"]:
    raise SystemExit(
        "cloudflared healthcheck must run native `cloudflared tunnel ready`, got %r"
        % health.get("test")
    )

env = service.get("environment") or {}
if isinstance(env, list):
    env = dict(item.split("=", 1) for item in env if "=" in item)
if env.get("TUNNEL_METRICS") != "127.0.0.1:2000":
    raise SystemExit(
        "cloudflared must bind TUNNEL_METRICS to 127.0.0.1:2000, got %r"
        % env.get("TUNNEL_METRICS")
    )

if service.get("ports"):
    raise SystemExit("cloudflared metrics must not publish a host port")

print("Compose tunnel shape is pinned, health-checked, and has no published metrics port.")
'
ok "Pinned compose tunnel configuration is valid"

if ! $REQUIRE_RUNNING; then
  exit 0
fi

# A service label catches a duplicate cloudflared service from a stale Compose
# project even when it uses an older image tag. The image check catches an
# unlabelled ad-hoc `docker run cloudflare/cloudflared …` container.
mapfile -t SERVICE_IDS < <(docker ps -q --filter 'label=com.docker.compose.service=cloudflared')
if [[ ${#SERVICE_IDS[@]} -ne 1 ]]; then
  printf 'Running compose cloudflared containers:\n' >&2
  docker ps --filter 'label=com.docker.compose.service=cloudflared' \
    --format '  {{.ID}} {{.Image}} {{.Names}}' >&2 || true
  die "Expected exactly one running compose cloudflared container; found ${#SERVICE_IDS[@]}"
fi

EXPECTED_ID="$(${COMPOSE[@]} ps -q cloudflared)"
[[ -n "$EXPECTED_ID" ]] || die "The FlowOps cloudflared service is not running"
[[ "$EXPECTED_ID" == "${SERVICE_IDS[0]}" ]] \
  || die "The only compose cloudflared container belongs to another project (${SERVICE_IDS[0]}), not this FlowOps stack (${EXPECTED_ID})"

mapfile -t IMAGE_IDS < <(docker ps --format '{{.ID}} {{.Image}}' | awk '$2 ~ /(^|\/)cloudflare\/cloudflared(:|@|$)/ {print $1}')
if [[ ${#IMAGE_IDS[@]} -ne 1 || "${IMAGE_IDS[0]:-}" != "$EXPECTED_ID" ]]; then
  printf 'Running Cloudflare cloudflared-image containers:\n' >&2
  docker ps --format '  {{.ID}} {{.Image}} {{.Names}}' \
    | awk '$2 ~ /(^|\/)cloudflare\/cloudflared(:|@|$)/ {print}' >&2 || true
  die "A second cloudflared image container may own the same tunnel"
fi

HEALTH="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$EXPECTED_ID")"
[[ "$HEALTH" == "healthy" ]] \
  || die "Cloudflared container is ${HEALTH}, not healthy"

${COMPOSE[@]} exec -T cloudflared cloudflared tunnel ready >/dev/null \
  || die "Cloudflared /ready endpoint is not ready"
ok "Exactly one healthy Docker-owned tunnel agent is running"

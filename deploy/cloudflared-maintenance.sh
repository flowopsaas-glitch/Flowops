#!/usr/bin/env bash
#
# FlowOps — Cloudflared-only maintenance action.
#
# This is deliberately separate from vps-deploy.sh. It never pulls application
# source, builds application images, runs Prisma, seeds data, or starts any
# service other than cloudflared. Default mode is read-only pre-flight.
#
# Run only during an explicitly approved maintenance window:
#   sudo ./deploy/cloudflared-maintenance.sh --check
#   sudo ./deploy/cloudflared-maintenance.sh --apply
#   sudo ./deploy/cloudflared-maintenance.sh --rollback
#
# If the legacy host systemd service is still enabled/active, the approved
# action must explicitly include its retirement:
#   sudo ./deploy/cloudflared-maintenance.sh --apply --retire-host-agent
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml)
TARGET_IMAGE="cloudflare/cloudflared:2026.9.3"
STATE_DIR="${FLOWOPS_CLOUDFLARED_STATE_DIR:-/var/lib/flowops/cloudflared}"
ROLLBACK_FILE="${STATE_DIR}/rollback-compose.yml"
ACTION="check"
ACTION_EXPLICIT=false
RETIRE_HOST_AGENT=false
HAD_PREVIOUS_CONTAINER=false

usage() {
  cat <<'EOF'
Usage: deploy/cloudflared-maintenance.sh [--check | --apply | --rollback] [--retire-host-agent]

  --check              read-only pre-flight (default)
  --apply              recreate only cloudflared with the approved pinned image
  --rollback           recreate only cloudflared with the captured prior image
  --retire-host-agent  with --apply only, stop/disable/mask cloudflared.service
EOF
}

die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }

for arg in "$@"; do
  case "$arg" in
    --check|--apply|--rollback)
      $ACTION_EXPLICIT && die "Choose exactly one action: --check, --apply, or --rollback"
      ACTION="${arg#--}"
      ACTION_EXPLICIT=true
      ;;
    --retire-host-agent) RETIRE_HOST_AGENT=true ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done
$RETIRE_HOST_AGENT && [[ "$ACTION" == "apply" ]] \
  || ! $RETIRE_HOST_AGENT \
  || die "--retire-host-agent is valid only with --apply"

command -v docker >/dev/null || die "docker is required"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"

legacy_agent_present() {
  command -v systemctl >/dev/null \
    && { systemctl is-active --quiet cloudflared.service \
      || [[ "$(systemctl is-enabled cloudflared.service 2>/dev/null || true)" =~ ^(enabled|enabled-runtime|linked|linked-runtime|alias)$ ]]; }
}

retire_legacy_agent() {
  command -v systemctl >/dev/null || die "systemctl is unavailable; manually prove no host cloudflared process exists"
  warn "Stopping, disabling, and masking only the legacy host cloudflared.service"
  systemctl stop cloudflared.service || true
  systemctl disable cloudflared.service || true
  systemctl mask cloudflared.service
  ok "Host cloudflared.service is stopped, disabled, and masked"
}

require_safe_tunnel_config() {
  local config="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
  [[ -f "$config" ]] || die "Tunnel config not found: $config"
  if grep -Eq 'service:[[:space:]]*https?://(127\.0\.0\.1|localhost)(:[0-9]+)?' "$config"; then
    die "${config} still targets localhost. The Docker tunnel must use http://frontend:80 and http://driver-portal:80."
  fi
}

require_healthy_origins() {
  local service id status
  for service in frontend driver-portal api; do
    id="$(${COMPOSE[@]} ps -q "$service")"
    [[ -n "$id" ]] || die "${service} is not running; do not change the public tunnel before application origins are healthy"
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$id")"
    [[ "$status" == "healthy" ]] \
      || die "${service} is ${status}, not healthy; do not change the public tunnel before application origins are healthy"
  done
  ok "Tunnel origins are healthy"
}

wait_until_healthy() {
  local id="" status="" i
  for i in $(seq 1 30); do
    id="$(${COMPOSE[@]} ps -q cloudflared)"
    if [[ -n "$id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$id")"
      if [[ "$status" == "healthy" ]]; then
        ./deploy/check-cloudflared-owner.sh --require-running
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

capture_rollback_image() {
  local id image image_id
  id="$(${COMPOSE[@]} ps -q cloudflared)"
  [[ -n "$id" ]] || die "Cannot capture a rollback image: FlowOps cloudflared is not running"
  image_id="$(docker inspect --format '{{.Image}}' "$id")"

  # RepoDigests live on the image object, not the container object. They are
  # immutable and survive a mutable :latest tag being moved by a later pull.
  # Fall back to the container image value only when Docker did not retain a
  # registry digest (for example, an offline local image).
  image="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" | head -n1)"
  if [[ -z "$image" ]]; then
    image="$(docker inspect --format '{{.Config.Image}}' "$id")"
    warn "No RepoDigest available for ${id}; rollback will use local image reference ${image}"
  fi

  install -d -m 0700 "$STATE_DIR"
  umask 077
  cat > "$ROLLBACK_FILE" <<EOF
# Generated by cloudflared-maintenance.sh before the approved change.
# Do not edit: this captures the exact previously-running tunnel image.
services:
  cloudflared:
    image: ${image}
EOF
  chmod 0600 "$ROLLBACK_FILE"
  ok "Captured rollback image in ${ROLLBACK_FILE}"
}

case "$ACTION" in
  check)
    require_safe_tunnel_config
    ./deploy/check-cloudflared-owner.sh
    echo
    echo "Read-only pre-flight passed. No container, service, image, or application state changed."
    ;;

  apply)
    require_safe_tunnel_config
    require_healthy_origins
    if legacy_agent_present; then
      if $RETIRE_HOST_AGENT; then
        retire_legacy_agent
      else
        die "A host cloudflared.service is active or boot-enabled. Re-run only with --retire-host-agent after that exact retirement has been approved."
      fi
    fi

    # A first install has no prior tunnel container to roll back to; an update
    # must capture the immutable previously-running image before it changes.
    if ${COMPOSE[@]} ps -q cloudflared | grep -q .; then
      HAD_PREVIOUS_CONTAINER=true
      ./deploy/check-cloudflared-owner.sh --require-running
      capture_rollback_image
    else
      ./deploy/check-cloudflared-owner.sh
      warn "No existing cloudflared container: this is a first start, so no automatic image rollback is available."
    fi

    echo "Pulling pinned tunnel image ${TARGET_IMAGE} …"
    docker pull "$TARGET_IMAGE"
    echo "Recreating only the cloudflared service; application/database services are excluded …"
    ${COMPOSE[@]} up -d --no-deps --force-recreate cloudflared

    if wait_until_healthy; then
      ok "Cloudflared-only maintenance completed with ${TARGET_IMAGE}"
      exit 0
    fi

    if $HAD_PREVIOUS_CONTAINER && [[ -f "$ROLLBACK_FILE" ]]; then
      warn "New cloudflared container did not become healthy; automatically rolling back only cloudflared"
      ${COMPOSE[@]} -f "$ROLLBACK_FILE" up -d --no-deps --force-recreate cloudflared
      if wait_until_healthy; then
        die "New cloudflared image failed. The previous tunnel image is restored; investigate before retrying."
      fi
      die "New cloudflared image failed and automatic rollback did not become healthy. Follow the incident runbook immediately."
    fi
    die "First-start cloudflared container did not become healthy and has no previous image to restore. Follow the incident runbook immediately."
    ;;

  rollback)
    require_safe_tunnel_config
    require_healthy_origins
    [[ -f "$ROLLBACK_FILE" ]] || die "No captured rollback file at ${ROLLBACK_FILE}; a prior approved --apply must create it first"
    if legacy_agent_present; then
      die "A host cloudflared.service is active or boot-enabled; do not introduce a second connector during rollback"
    fi

    ./deploy/check-cloudflared-owner.sh --require-running
    echo "Recreating only cloudflared with the captured prior image …"
    ${COMPOSE[@]} -f "$ROLLBACK_FILE" up -d --no-deps --force-recreate cloudflared
    wait_until_healthy || die "Rollback cloudflared container did not become healthy"
    ok "Cloudflared-only rollback completed"
    ;;
esac

#!/usr/bin/env bash
#
# FlowOps — Oracle Cloud VPS quick-setup script.
#
# Run this ON the Oracle VPS after cloning the repo and copying .env + tunnel
# credentials. It handles: Docker install, swap (for low-RAM instances),
# Docker-owned tunnel validation and the first deploy.
#
# Usage:
#   ./deploy/oracle-setup.sh                      # interactive
#   ./deploy/oracle-setup.sh --skip-docker        # Docker already installed
#   ./deploy/oracle-setup.sh --skip-tunnel        # tunnel already configured
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

SKIP_DOCKER=false
SKIP_TUNNEL=false
for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=true ;;
    --skip-tunnel) SKIP_TUNNEL=true ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

# ── 0. Pre-checks ────────────────────────────────────────────────────────────
[[ -f .env ]] || die "No .env found at $REPO_ROOT/.env — copy it from your desktop first."
log "Running on: $(uname -m) / $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"

# ── 1. Swap (for 1-4GB RAM instances — prevents OOM during Docker builds) ────
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [[ $TOTAL_RAM_MB -lt 4096 ]] && [[ ! -f /swapfile ]]; then
  log "Low RAM detected (${TOTAL_RAM_MB}MB). Creating 4GB swap..."
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
  ok "4GB swap activated and persisted"
elif [[ -f /swapfile ]]; then
  ok "Swap already exists"
else
  ok "Sufficient RAM (${TOTAL_RAM_MB}MB) — no swap needed"
fi

# ── 2. Docker ────────────────────────────────────────────────────────────────
if ! $SKIP_DOCKER; then
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    ok "Docker + Compose already installed ($(docker --version | cut -d' ' -f3))"
  else
    log "Installing Docker + Compose v2"
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER" || true
    ok "Docker installed. You may need to log out/in for group permissions."
    # Try to activate group immediately
    if ! docker ps >/dev/null 2>&1; then
      warn "Docker group not active yet. Re-run this script after logging out/in."
      warn "Or run: newgrp docker && ./deploy/oracle-setup.sh --skip-docker"
      exit 0
    fi
  fi
fi

# ── 3. Docker-owned Cloudflare Tunnel ────────────────────────────────────────
# The supported VPS design has exactly one tunnel agent: the pinned Compose
# service. Do NOT install cloudflared on the host and do NOT create a
# cloudflared.service. Either would create a competing connector for the same
# tunnel and can make the public route flap.
if ! $SKIP_TUNNEL; then
  CF_CONFIG="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
  [[ -f "$CF_CONFIG" ]] || die "No tunnel config at ${CF_CONFIG}. Provision /etc/cloudflared with the short-lived pinned Docker commands in deploy/VPS-RUNBOOK.md."

  CRED_FILE=$(find /etc/cloudflared -maxdepth 1 -name "*.json" -type f -print -quit 2>/dev/null || true)
  [[ -n "$CRED_FILE" ]] || die "No tunnel credentials JSON in /etc/cloudflared. Do not copy it to ~/.cloudflared or install a host service."

  if grep -Eq 'service:[[:space:]]*https?://(127\.0\.0\.1|localhost)(:[0-9]+)?' "$CF_CONFIG"; then
    die "${CF_CONFIG} targets localhost, but the Docker-owned tunnel must use http://frontend:80 / http://driver-portal:80."
  fi

  if systemctl is-active --quiet cloudflared.service 2>/dev/null \
    || [[ "$(systemctl is-enabled cloudflared.service 2>/dev/null || true)" =~ ^(enabled|enabled-runtime|linked|linked-runtime|alias)$ ]]; then
    die "A host cloudflared.service is active or boot-enabled. This script will not create a second agent. Retire it only through deploy/cloudflared-maintenance.sh in an approved maintenance window."
  fi

  ok "Docker-owned tunnel config and credentials are present"
fi

# ── 4. Deploy FlowOps ────────────────────────────────────────────────────────
log "Ready to deploy FlowOps"
echo ""
echo "  Your .env is in place."
echo "  Docker is installed."
echo "  Cloudflare tunnel configuration is validated; the Compose sidecar is managed separately."
echo ""
read -r -p "Deploy application services now (no schema/seed change)? [Y/n] " ans
if [[ "$ans" =~ ^[Nn]$ ]]; then
  echo ""
  echo "Run manually when ready:"
  echo "  cd ~/FlowOps && ./deploy/vps-deploy.sh"
  exit 0
fi

log "Deploying FlowOps application services (schema/seed gate remains blocked)"
./deploy/vps-deploy.sh

# ── Done ─────────────────────────────────────────────────────────────────────
cat <<'EOF'

══════════════════════════════════════════════════════════════════════════
  FlowOps application stack is prepared on Oracle Cloud.
  
  ✓ Docker application services running (api + frontend + postgres + redis + driver-portal)
  ✓ Database schema/seed intentionally unchanged (migration gate remains blocked)
  ✓ Cloudflare sidecar intentionally NOT changed by this setup script
  
  Before public access, only in an approved tunnel maintenance window:
    sudo ./deploy/cloudflared-maintenance.sh --check
    sudo ./deploy/cloudflared-maintenance.sh --apply
    ./deploy/check-cloudflared-owner.sh --require-running
  
  Next steps on your DESKTOP:
    1. Stop the local tunnel:
       stop any desktop/manual tunnel only after the VPS Compose agent is healthy
    
    2. Test the app in your browser — it's now served from Oracle.
  
  To deploy updates later:
    ssh ubuntu@<ORACLE_IP> "cd ~/FlowOps && ./deploy/vps-deploy.sh"
══════════════════════════════════════════════════════════════════════════
EOF

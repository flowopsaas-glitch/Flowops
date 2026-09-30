#!/usr/bin/env bash
#
# FlowOps — Oracle Cloud VPS quick-setup script.
#
# Run this ON the Oracle VPS after cloning the repo and copying .env + tunnel
# credentials. It handles: Docker install, swap (for low-RAM instances),
# cloudflared install, systemd service creation, and the first deploy.
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

# ── 3. cloudflared ───────────────────────────────────────────────────────────
if ! $SKIP_TUNNEL; then
  if command -v cloudflared >/dev/null; then
    ok "cloudflared already installed ($(cloudflared --version 2>&1 | head -1))"
  else
    log "Installing cloudflared"
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
    sudo dpkg -i /tmp/cloudflared.deb
    rm -f /tmp/cloudflared.deb
    ok "cloudflared installed"
  fi

  # Check for tunnel credentials
  CRED_FILE=$(find /etc/cloudflared/ ~/.cloudflared/ -name "*.json" 2>/dev/null | head -1)
  if [[ -z "$CRED_FILE" ]]; then
    warn "No tunnel credentials found in ~/.cloudflared/ or /etc/cloudflared/"
    warn "Copy your credentials JSON from your desktop:"
    warn "  scp ~/.cloudflared/<tunnel-id>.json ubuntu@<this-vps>:~/.cloudflared/"
    warn "Then re-run this script."
    die "Tunnel credentials required"
  fi
  ok "Tunnel credentials found: $CRED_FILE"

  # Check for config.yml
  CONFIG_FILE=""
  if [[ -f /etc/cloudflared/config.yml ]]; then
    CONFIG_FILE="/etc/cloudflared/config.yml"
  elif [[ -f ~/.cloudflared/config.yml ]]; then
    CONFIG_FILE="$HOME/.cloudflared/config.yml"
  fi

  if [[ -z "$CONFIG_FILE" ]]; then
    warn "No config.yml found — creating a default one"
    TUNNEL_ID=$(basename "$CRED_FILE" .json)
    mkdir -p ~/.cloudflared
    cat > ~/.cloudflared/config.yml <<YAML
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE}

ingress:
  - hostname: app.flowop.work
    service: http://127.0.0.1:8080
  - hostname: driver.flowop.work
    service: http://127.0.0.1:8083
  - service: http_status:404
YAML
    CONFIG_FILE="$HOME/.cloudflared/config.yml"
    ok "Created config at $CONFIG_FILE"
  else
    ok "Tunnel config found: $CONFIG_FILE"
  fi

  # ── Place config/credentials where the Compose sidecar expects them ────
  # IMPORTANT: cloudflared runs INSIDE the compose stack (service
  # `cloudflared` in deploy/docker-compose.vps.yml). We deliberately DO NOT
  # install or enable a host systemd service here — a host + container
  # tunnel connected to the same tunnel ID creates duplicate connections,
  # request flapping and 502s. The CLI binary is available for diagnostics.
  log "Preparing /etc/cloudflared for the Compose sidecar (no host systemd service)"

  sudo mkdir -p /etc/cloudflared
  sudo cp "$CRED_FILE" /etc/cloudflared/
  sudo cp "$CONFIG_FILE" /etc/cloudflared/config.yml

  TUNNEL_ID=$(basename "$CRED_FILE" .json)
  sudo sed -i "s|credentials-file:.*|credentials-file: /etc/cloudflared/${TUNNEL_ID}.json|" /etc/cloudflared/config.yml

  if command -v cloudflared >/dev/null; then
    ok "cloudflared CLI present ($(cloudflared --version 2>&1 | head -1))"
  fi
  if [[ -d /run/systemd/system ]]; then
    sudo systemctl stop cloudflared 2>/dev/null || true
    sudo systemctl disable cloudflared 2>/dev/null || true
    sudo systemctl mask cloudflared 2>/dev/null || true
    ok "host cloudflared.service disabled/masked (Compose sidecar owns the tunnel)"
  fi
fi

# ── 4. Deploy FlowOps ────────────────────────────────────────────────────────
log "Ready to deploy FlowOps"
echo ""
echo "  Your .env is in place."
echo "  Docker is installed."
echo "  Cloudflare tunnel is running."
echo ""
read -r -p "Deploy now with demo seed data? [Y/n] " ans
if [[ "$ans" =~ ^[Nn]$ ]]; then
  echo ""
  echo "Run manually when ready:"
  echo "  cd ~/FlowOps && ./deploy/vps-deploy.sh --seed"
  exit 0
fi

log "Deploying FlowOps (first time — with seed data)"
./deploy/vps-deploy.sh --seed

# ── Done ─────────────────────────────────────────────────────────────────────
cat <<'EOF'

══════════════════════════════════════════════════════════════════════════
  FlowOps is live on Oracle Cloud!
  
  ✓ Docker stack running (api + frontend + postgres + redis + driver-portal)
  ✓ Cloudflare tunnel active (auto-starts on boot)
  ✓ Database seeded with demo data
  
  Access:
    • https://app.flowop.work        (main app)
    • https://driver.flowop.work     (driver PWA)
  
  Next steps on your DESKTOP:
    1. Stop the local tunnel:
       sudo systemctl stop cloudflared  (or Ctrl+C the manual process)
    
    2. Test the app in your browser — it's now served from Oracle.
  
  To deploy updates later:
    ssh ubuntu@<ORACLE_IP> "cd ~/FlowOps && ./deploy/vps-deploy.sh"
══════════════════════════════════════════════════════════════════════════
EOF

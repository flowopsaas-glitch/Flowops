#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  FlowOps — VPS Setup Script
#  Target: Ubuntu 26.04 LTS (Elite Host — 1 CPU, 2GB RAM, 25GB SSD)
#
#  This script:
#   1. Updates the system & installs essentials
#   2. Installs Docker & Docker Compose
#   3. Installs Cloudflare Tunnel (cloudflared)
#   4. Creates the project directory structure
#   5. Configures swap (for 2GB RAM safety)
#   6. Sets up UFW firewall (only SSH + Cloudflare)
#   7. Clones the repo and prepares deployment
#
#  Usage (as root on a fresh Ubuntu 26.04 VPS):
#    curl -fsSL https://raw.githubusercontent.com/flowopsaas-glitch/Flowops/main/deploy/setup-vps.sh | bash
#
#  Or copy/paste this file to the server and run:
#    chmod +x setup-vps.sh && ./setup-vps.sh
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colors for output ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[FlowOps]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Checks ────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "This script must be run as root. Use: sudo bash setup-vps.sh"

log "Starting FlowOps VPS setup..."
log "Target: Ubuntu $(lsb_release -rs 2>/dev/null || echo '26.04') on Elite Host"
echo ""

# ══════════════════════════════════════════════════════════════════════════
#  STEP 1: System update & essentials
# ══════════════════════════════════════════════════════════════════════════
log "Step 1/7: Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip htop nano \
  ca-certificates gnupg lsb-release \
  fail2ban ufw

log "System updated ✓"

# ══════════════════════════════════════════════════════════════════════════
#  STEP 2: Configure swap (2GB — gives breathing room on 2GB RAM)
# ══════════════════════════════════════════════════════════════════════════
log "Step 2/7: Configuring swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Reduce swappiness — only use swap under pressure
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
  sysctl -p
  log "2GB swap configured ✓"
else
  log "Swap already exists ✓"
fi

# ══════════════════════════════════════════════════════════════════════════
#  STEP 3: Install Docker
# ══════════════════════════════════════════════════════════════════════════
log "Step 3/7: Installing Docker..."
if ! command -v docker &> /dev/null; then
  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # Add the repository to Apt sources
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$(lsb_release -cs)}") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Enable and start Docker
  systemctl enable docker
  systemctl start docker
  log "Docker installed ✓"
else
  log "Docker already installed ✓"
fi

# Verify
docker --version
docker compose version

# ══════════════════════════════════════════════════════════════════════════
#  STEP 4: Cloudflared CLI (diagnostics only — NO host systemd service)
# ══════════════════════════════════════════════════════════════════════════
# The production tunnel runs as a Compose sidecar (see deploy/docker-compose.vps.yml).
# Installing/enabling a host systemd cloudflared service here creates a second
# tunnel agent and splits connections. The CLI binary is still useful for
# `cloudflared tunnel info` and one-off diagnostics.
log "Step 4/7: Installing cloudflared CLI (diagnostics only)..."
if ! command -v cloudflared &> /dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod 0755 /usr/local/bin/cloudflared
  log "cloudflared CLI installed to /usr/local/bin/cloudflared (no systemd service) ✓"
else
  log "cloudflared CLI already installed ✓"
fi
# Belt-and-braces: ensure the legacy host service never auto-starts on new
# VPS builds. Existing disabled/inactive units are left alone; we only
# prevent `systemctl enable cloudflared` from claiming the tunnel.
if [[ -d /run/systemd/system ]]; then
  systemctl stop cloudflared 2>/dev/null || true
  systemctl disable cloudflared 2>/dev/null || true
  systemctl mask cloudflared 2>/dev/null || true
fi
cloudflared --version

# ══════════════════════════════════════════════════════════════════════════
#  STEP 5: Firewall (UFW)
# ══════════════════════════════════════════════════════════════════════════
log "Step 5/7: Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh

# No need to open 80/443 — Cloudflare Tunnel makes outbound connections only!
# But if you ever need direct access for debugging:
# ufw allow 80/tcp
# ufw allow 443/tcp

ufw --force enable
log "Firewall configured (SSH only — tunnel handles web traffic) ✓"

# ══════════════════════════════════════════════════════════════════════════
#  STEP 6: Create project structure
# ══════════════════════════════════════════════════════════════════════════
log "Step 6/7: Setting up project directory..."
FLOWOPS_DIR="/opt/flowops"
mkdir -p "$FLOWOPS_DIR"
mkdir -p /etc/cloudflared

# Clone the repo
if [ ! -d "$FLOWOPS_DIR/.git" ]; then
  git clone https://github.com/flowopsaas-glitch/Flowops.git "$FLOWOPS_DIR"
  log "Repository cloned to $FLOWOPS_DIR ✓"
else
  cd "$FLOWOPS_DIR" && git pull
  log "Repository updated ✓"
fi

# ══════════════════════════════════════════════════════════════════════════
#  STEP 7: Prepare .env and display next steps
# ══════════════════════════════════════════════════════════════════════════
log "Step 7/7: Preparing environment..."
cd "$FLOWOPS_DIR"

if [ ! -f .env ]; then
  cp deploy/.env.production .env

  # Auto-generate secrets
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
  OWNER_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
  INTEGRATIONS_KEY=$(openssl rand -base64 32)

  # Replace placeholder values with generated secrets
  sed -i "s|CHANGE_ME_RUN_openssl_rand_hex_32|${JWT_SECRET}|" .env
  sed -i "s|CHANGE_ME_DIFFERENT_FROM_JWT_SECRET|${JWT_REFRESH_SECRET}|" .env
  sed -i "s|CHANGE_ME_STRONG_DB_PASSWORD|${POSTGRES_PASSWORD}|" .env
  sed -i "s|CHANGE_ME_STRONG_OWNER_PASSWORD|${OWNER_PASSWORD}|" .env
  sed -i "s|CHANGE_ME_RUN_openssl_rand_base64_32|${INTEGRATIONS_KEY}|" .env

  log ".env created with auto-generated secrets ✓"
  warn "You still need to set OWNER_SEED_EMAIL in .env"
else
  log ".env already exists ✓"
fi

# ══════════════════════════════════════════════════════════════════════════
#  DONE — Print next steps
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  FlowOps VPS setup complete! 🚀${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "  1. SET UP CLOUDFLARE TUNNEL:"
echo "     ─────────────────────────"
echo "     cloudflared tunnel login"
echo "     cloudflared tunnel create flowops-app"
echo ""
echo "     # Copy the tunnel ID from the output, then:"
echo "     cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml"
echo "     nano /etc/cloudflared/config.yml   # Replace CHANGE_ME_TUNNEL_ID"
echo ""
echo "     # Move credentials (replace <TUNNEL_ID> with actual ID):"
echo "     cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/"
echo ""
echo "  2. UPDATE DNS IN CLOUDFLARE (if not already done):"
echo "     ────────────────────────────────────────────────"
echo "     Add CNAME records → <TUNNEL_ID>.cfargotunnel.com for:"
echo "       app.flowop.work, api.flowop.work, driver.flowop.work,"
echo "       flowop.work, www.flowop.work"
echo ""
echo "  3. EDIT YOUR .env FILE:"
echo "     ─────────────────────"
echo "     cd /opt/flowops"
echo "     nano .env"
echo "     # Set: OWNER_SEED_EMAIL (your login email)"
echo "     # Optional: SENDGRID_API_KEY, PAYSTACK keys, GROQ_API_KEY"
echo ""
echo "  4. LAUNCH FLOWOPS:"
echo "     ───────────────"
echo "     cd /opt/flowops"
echo "     docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --build"
echo ""
echo "  5. VERIFY:"
echo "     ───────"
echo "     docker compose ps                  # All services should be 'healthy'"
echo "     docker compose logs -f api         # Watch for startup errors"
echo "     curl http://localhost:8080/healthz  # Frontend health check"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "  Project dir: /opt/flowops"
echo -e "  Docker logs: docker compose logs -f"
echo -e "  Restart:     docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml restart"
echo -e "  Stop:        docker compose down"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

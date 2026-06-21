#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  FlowOps — one-command production deploy
#
#  Usage:
#    ./deploy.sh            # full rebuild + restart
#    ./deploy.sh --no-build # restart containers without rebuilding images
#    ./deploy.sh --down     # stop and remove all containers + volumes
#
#  Prerequisites:
#    1. .env file exists (copy from .env.production.example and fill in)
#    2. Docker + docker compose v2 installed
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[FlowOps]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Preflight checks ───────────────────────────────────────────────────────
[[ -f .env ]] || error ".env not found. Copy .env.production.example → .env and fill in all CHANGE_ME values."

# Abort if required secrets are still placeholder values
grep -q "CHANGE_ME" .env && {
  warn "Your .env still contains CHANGE_ME placeholders. Fill them in before deploying."
  grep "CHANGE_ME" .env | grep -v "^#" | cut -d= -f1 | while read -r k; do echo "  → $k"; done
  error "Deployment aborted. Fix the values above."
}

command -v docker &>/dev/null || error "Docker not found. Install from https://docs.docker.com/get-docker/"

# ── Handle flags ──────────────────────────────────────────────────────────
case "${1:-}" in
  --down)
    info "Stopping and removing all FlowOps containers..."
    $COMPOSE down --remove-orphans
    info "Done."
    exit 0
    ;;
  --no-build)
    info "Restarting containers without rebuilding..."
    $COMPOSE up -d --remove-orphans
    ;;
  *)
    info "Building and starting FlowOps (this takes 2-5 min on first run)..."
    $COMPOSE up -d --build --remove-orphans
    ;;
esac

# ── Wait for health ────────────────────────────────────────────────────────
info "Waiting for services to become healthy..."
sleep 5

MAX_WAIT=120
ELAPSED=0
until docker compose ps api | grep -q "healthy" 2>/dev/null; do
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "API did not become healthy within ${MAX_WAIT}s. Check logs with: docker compose logs api"
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo -n "."
done
echo ""

# ── Status ────────────────────────────────────────────────────────────────
info "Container status:"
$COMPOSE ps

echo ""
info "FlowOps is running!"
echo -e "  Platform:   ${GREEN}https://app.flowop.work${NC}"
echo -e "  Marketing:  ${GREEN}https://www.flowop.work${NC}"
echo -e "  API Health: ${GREEN}http://localhost:3000/health${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "  ${YELLOW}docker compose logs -f api${NC}       → backend logs"
echo -e "  ${YELLOW}docker compose logs -f frontend${NC}  → nginx logs"
echo -e "  ${YELLOW}docker compose exec api sh${NC}       → shell into backend"
echo -e "  ${YELLOW}./deploy.sh --down${NC}               → stop everything"

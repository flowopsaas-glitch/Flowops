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

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[FlowOps]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Compose selection ────────────────────────────────────────────────────────
# The single-VPS production topology (deploy/VPS-RUNBOOK.md) is
# docker-compose.yml + deploy/docker-compose.vps.yml: no host ports at all,
# traffic enters only through the cloudflared sidecar, and a backup service
# runs alongside Postgres. Prefer that overlay when it exists so this script can
# never publish 0.0.0.0:8080/8081 or fight the tunnel-only design on the VPS.
# On hosts without the VPS overlay, fall back to the generic production
# overlay (loopback-only bindings for a host reverse proxy).
if [[ -f deploy/docker-compose.vps.yml ]]; then
  COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
  info "Using VPS topology (deploy/docker-compose.vps.yml — tunnel-only, no host ports)"
else
  COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
  info "Using generic production topology (docker-compose.prod.yml)"
fi

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

# ── Wait for Postgres, then sync schema ─────────────────────────────────────
# The VPS overlay unbinds every host port, so the API is only reachable inside
# the compose network — always probe it with `exec`, never via a host port.
info "Waiting for Postgres to become healthy..."
for i in $(seq 1 30); do
  if $COMPOSE ps postgres 2>/dev/null | grep -q "healthy"; then break; fi
  sleep 2
  [[ $i -eq 30 ]] && warn "Postgres not healthy yet — attempting migration anyway"
done

info "Applying Prisma migrations (migrate deploy — non-destructive)..."
if ! $COMPOSE exec -T api ./node_modules/.bin/prisma migrate deploy; then
  error "prisma migrate deploy failed. Fix the migration state before serving traffic."
fi
info "Schema in sync"

# ── Wait for API health ─────────────────────────────────────────────────────
info "Waiting for the API to become healthy..."
sleep 5

MAX_WAIT=120
ELAPSED=0
until $COMPOSE ps api 2>/dev/null | grep -q "healthy"; do
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "API did not become healthy within ${MAX_WAIT}s. Check logs with: $COMPOSE logs api"
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo -n "."
done
echo ""

API_HEALTH="$($COMPOSE exec -T api sh -c 'wget -qO- http://localhost:3000/health 2>/dev/null || true')"

# ── Status ────────────────────────────────────────────────────────────────
info "Container status:"
$COMPOSE ps

echo ""
info "FlowOps is running!"
echo -e "  Platform:   ${GREEN}https://app.flowop.work${NC}"
echo -e "  Marketing:  ${GREEN}https://www.flowop.work${NC}"
echo -e "  API Health: ${GREEN}${API_HEALTH:-<no response>}${NC}   (checked inside the api container — no host port is published)"
echo ""
echo -e "  Useful commands:"
echo -e "  ${YELLOW}$COMPOSE logs -f api${NC}        → backend logs"
echo -e "  ${YELLOW}$COMPOSE logs -f frontend${NC}   → nginx logs"
echo -e "  ${YELLOW}$COMPOSE exec api sh${NC}        → shell into backend"
echo -e "  ${YELLOW}./deploy.sh --down${NC}            → stop everything"
echo -e "  ${YELLOW}./deploy/vps-deploy.sh${NC}        → full VPS deploy (pre-flight + migrate + plan guard)"

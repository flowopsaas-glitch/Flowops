#!/usr/bin/env bash
#
# FlowOps — VPS deploy (pure Docker Compose).
#
# ONE stack, ONE database, ONE backend. This script is idempotent: run it for
# the first deploy and for every subsequent update. It never creates a second
# parallel backend/DB (the mistake that caused the "wrong/empty DB" confusion
# on the dev box).
#
# Architecture (single VPS):
#   cloudflared ──> 127.0.0.1:8080 ──> frontend (nginx, SPA)
#                                         │  location /api/      ─┐
#                                         │  location /socket.io/ │ (same-origin proxy)
#                                         └────────────────────────┘──> api:3000  (NestJS)
#                                                                          │
#                                                              postgres:5432  redis:6379
#                                                              (internal-only, named volumes)
#
# Usage:
#   ./deploy/vps-deploy.sh           # build + deploy + migrate
#   ./deploy/vps-deploy.sh --seed    # also run first-time demo seeds
#
# Prereqs (one-time, see deploy/VPS-RUNBOOK.md):
#   - Docker + Docker Compose v2 installed
#   - A real .env at repo root (copy from .env.production.example and fill in)
#   - cloudflared tunnel routing app.flowop.work -> http://localhost:8080
#
set -euo pipefail

# ── Resolve repo root (this script lives in <repo>/deploy) ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
SEED=false
[[ "${1:-}" == "--seed" ]] && SEED=true

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. Pre-flight ────────────────────────────────────────────────────────────
command -v docker >/dev/null      || die "docker not installed"
docker compose version >/dev/null || die "docker compose v2 not installed"
[[ -f .env ]] || die "No .env at repo root. Copy .env.production.example -> .env and fill it in."

# Critical env sanity — these are the exact traps that bit us in dev.
grep -q '^VITE_API_URL=/api/v1' .env \
  || die "VITE_API_URL must be /api/v1 in .env (NOT /api). The SPA 404s otherwise."
for k in POSTGRES_PASSWORD JWT_SECRET OWNER_SEED_EMAIL OWNER_SEED_PASSWORD CORS_ORIGINS; do
  grep -q "^${k}=" .env || die "Missing ${k} in .env"
done
ok "Pre-flight checks passed"

# ── 1. Pull latest source ────────────────────────────────────────────────────
log "Pulling latest from git ($(git rev-parse --abbrev-ref HEAD))"
git pull --ff-only || die "git pull failed (commit/stash local changes first)"

# ── 2. Build images from current source (frontend bakes VITE_API_URL) ────────
log "Building images"
$COMPOSE build

# ── 3. Bring the stack up (postgres + redis + api + frontend) ────────────────
log "Starting stack"
$COMPOSE up -d

# ── 4. Wait for Postgres to be healthy, then sync schema ─────────────────────
log "Waiting for Postgres to be healthy"
for i in $(seq 1 30); do
  if $COMPOSE ps postgres | grep -q "healthy"; then ok "Postgres healthy"; break; fi
  sleep 2
  [[ $i -eq 30 ]] && die "Postgres did not become healthy in 60s"
done

log "Applying Prisma schema (db push — repo uses push, not migrations)"
$COMPOSE exec -T api npx prisma db push --skip-generate || die "prisma db push failed"
ok "Schema in sync"

# ── 5. Optional first-time demo seed ─────────────────────────────────────────
if $SEED; then
  log "Seeding demo data (first-time only — safe/idempotent scripts)"
  $COMPOSE exec -T api node prisma/seed-demo-company.js   || true
  $COMPOSE exec -T api node prisma/seed-full-data.js      || true
  $COMPOSE exec -T api node prisma/seed-driver-pins.js    || true
  $COMPOSE exec -T api node prisma/seed-link-driver-user.js || true
  ok "Seed scripts finished"
fi

# ── 6. Health verification ───────────────────────────────────────────────────
log "Verifying"
sleep 3
$COMPOSE ps
HEALTH=$($COMPOSE exec -T api sh -c 'wget -qO- http://localhost:3000/health 2>/dev/null || true')
echo "api /health -> ${HEALTH:-<no response>}"

cat <<'EOF'

──────────────────────────────────────────────────────────────────────
Deploy complete.

  • Frontend (SPA + proxy):  http://127.0.0.1:8080   (point cloudflared here)
  • API (internal only):     api:3000 inside the compose network
  • One Postgres, one volume (postgres-data) — no parallel DBs.

Next:
  • Confirm the Cloudflare tunnel maps app.flowop.work -> http://localhost:8080
  • Owner login: OWNER_SEED_EMAIL / OWNER_SEED_PASSWORD from .env
  • Tail logs:   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

To update later: just re-run  ./deploy/vps-deploy.sh
──────────────────────────────────────────────────────────────────────
EOF

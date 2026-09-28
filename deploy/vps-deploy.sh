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
#   cloudflared ──> frontend:80 (compose network) ──> frontend (nginx, SPA)
#                                         │  location /api/      ─┐
#                                         │  location /socket.io/ │ (same-origin proxy)
#                                         └────────────────────────┘──> api:3000  (NestJS)
#                                                                          │
#                                                              postgres:5432  redis:6379
#                                                              (internal-only, named volumes)
#
# Usage:
#   ./deploy/vps-deploy.sh           # build + deploy + migrate + pre-flight guard
#   ./deploy/vps-deploy.sh --seed    # also run first-time demo seeds
#   ./deploy/vps-deploy.sh --yes     # don't prompt if tenants are over plan limits
#   (flags combine, e.g. --seed --yes)
#
# Prereqs (one-time, see deploy/VPS-RUNBOOK.md):
#   - Docker + Docker Compose v2 installed
#   - A real .env at repo root (copy from .env.production.example and fill in)
#   - cloudflared tunnel routing app.flowop.work -> http://frontend:80
#     (Docker service name — no host port is published, so localhost:8080
#      does NOT work; the deploy script refuses to run if your tunnel config
#      still points at 127.0.0.1/localhost)
#
set -euo pipefail

# ── Resolve repo root (this script lives in <repo>/deploy) ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

SEED=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --yes|-y) ASSUME_YES=true ;;
    *) die "Unknown flag: $arg (use --seed and/or --yes)" ;;
  esac
done

# ── 0. Pre-flight ────────────────────────────────────────────────────────────
command -v docker >/dev/null      || die "docker not installed"
docker compose version >/dev/null || die "docker compose v2 not installed"
[[ -f .env ]] || die "No .env at repo root. Copy .env.production.example -> .env and fill it in."

# ── 0b. Compose version gate ─────────────────────────────────────────────────
# docker-compose.vps.yml unbinds host ports with `ports: !reset []`. That tag
# needs Compose 2.24+ — on older releases Compose APPENDS the base file's port
# list instead of clearing it, which silently re-publishes 8080/8081 on
# 0.0.0.0 and defeats the tunnel-only design. Check before touching the stack.
COMPOSE_MIN_VERSION="2.24.4"
COMPOSE_VERSION="$(docker compose version --short 2>/dev/null || true)"
COMPOSE_VERSION="${COMPOSE_VERSION#v}"
[[ -n "$COMPOSE_VERSION" ]] || die "Could not determine the Docker Compose version"
if ! printf '%s\n%s\n' "$COMPOSE_MIN_VERSION" "$COMPOSE_VERSION" | sort -V -C; then
  die "Docker Compose >= ${COMPOSE_MIN_VERSION} required, found ${COMPOSE_VERSION}.
       deploy/docker-compose.vps.yml uses !reset to unbind host ports.
       Upgrade: sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
fi
ok "Docker Compose ${COMPOSE_VERSION} (>= ${COMPOSE_MIN_VERSION})"

# ── 0c. Cloudflare tunnel must target Docker service names ───────────────────
# With host ports unbound there is nothing listening on 127.0.0.1:8080. If the
# live tunnel config still points at localhost/127.0.0.1, unbinding the ports
# takes the whole site offline — so refuse to deploy until it is fixed.
CF_CONFIG="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
if [[ -f "$CF_CONFIG" ]]; then
  if grep -Eq 'service:[[:space:]]*https?://(127\.0\.0\.1|localhost)(:[0-9]+)?' "$CF_CONFIG"; then
    die "${CF_CONFIG} routes to 127.0.0.1/localhost, but this stack no longer publishes host ports.
       Point each ingress rule at the Docker service name instead, e.g.:
           - hostname: app.flowop.work
             service: http://frontend:80
           - hostname: driver.flowop.work
             service: http://driver-portal:80
       Then run:  docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml restart cloudflared"
  fi
  ok "Cloudflare tunnel targets Docker service names (${CF_CONFIG})"
else
  printf '\033[1;33m! %s not found — skipping tunnel target check.\033[0m\n' "$CF_CONFIG"
fi

# ── 0e. Exactly one tunnel agent ─────────────────────────────────────────────
# The compose stack runs its own cloudflared on the compose network. Older
# setup guides (oracle-setup.sh, ORACLE-MIGRATION.md) also installed a
# host-level cloudflared.service. Two agents on one tunnel registration split
# Cloudflare's traffic across both — and the host one can never deliver: it
# cannot resolve the Docker service names, and nothing listens on
# localhost:8080 since the port-unbind rollout. Every request it is handed
# fails with a fast 502 while the rest succeed: a half-down site
# (incident 2026-09-28). Refuse to deploy while a competing agent exists.
if systemctl is-active --quiet cloudflared 2>/dev/null \
   || systemctl is-enabled --quiet cloudflared 2>/dev/null; then
  die "A host-level cloudflared service is active or enabled. The compose stack
       must be the ONLY tunnel agent — two agents on one tunnel cause
       intermittent 502s (some requests land on the host agent, which cannot
       reach the origin). Stop and disable it first:
           sudo systemctl stop cloudflared && sudo systemctl disable cloudflared"
fi
ok "Single tunnel agent (no host-level cloudflared)"

# ── 0d. Merged config must publish no host ports ─────────────────────────────
# Renders the merged compose model and fails if any service still publishes a
# port on a non-loopback interface. Cheap, and it runs BEFORE the stack moves.
log "Verifying merged compose config publishes no host ports"
./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml

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

# ── 4b. Plan-limit pre-flight (entitlement enforcement is live as of #140) ───
# Enforcement only blocks NEW creates beyond a plan limit, but a tenant already
# over a limit will get 403s on their next create. Report them up front. The
# guard runs INSIDE the api container (BACKEND_DIR=/app), reusing the built
# PLAN_ENTITLEMENTS + the container's DATABASE_URL.
log "Pre-flight: checking for tenants over their plan limits"
if $COMPOSE cp deploy/check-plan-overages.js api:/tmp/check-plan-overages.js 2>/dev/null; then
  set +e
  $COMPOSE exec -T -e BACKEND_DIR=/app api node /tmp/check-plan-overages.js
  GUARD_RC=$?
  set -e
  if [[ $GUARD_RC -eq 2 ]]; then
    if $ASSUME_YES; then
      printf '\033[1;33m! Overages found, but --yes set; continuing.\033[0m\n'
    else
      read -r -p $'\033[1;33mTenants are over limit (see above). Continue deploying anyway? [y/N] \033[0m' ans
      [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted after schema sync. The stack is up but you chose to stop before seeding/finishing."
    fi
  elif [[ $GUARD_RC -ne 0 ]]; then
    printf '\033[1;33m! Pre-flight guard could not complete (rc=%s) — continuing.\033[0m\n' "$GUARD_RC"
  fi
else
  printf '\033[1;33m! Could not copy guard into the api container — skipping pre-flight.\033[0m\n'
fi

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

# Runtime assertion: nothing in this project may be published on a public
# interface. Catches the case where a container kept a stale port binding.
LEAKED_PORTS="$(docker ps \
  --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-flowops}" \
  --format '{{.Names}}\t{{.Ports}}' \
  | awk -F'\t' '$2 ~ /0\.0\.0\.0:/ { print $1" -> "$2 }')"
if [[ -n "$LEAKED_PORTS" ]]; then
  printf '\033[1;31m✗ Containers are still publishing public ports:\033[0m\n%s\n' "$LEAKED_PORTS"
  printf '  Re-check: docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml config | grep -A2 ports:\n'
  exit 1
fi
ok "No container publishes a port on 0.0.0.0"
HEALTH=$($COMPOSE exec -T api sh -c 'wget -qO- http://localhost:3000/health 2>/dev/null || true')
echo "api /health -> ${HEALTH:-<no response>}"

cat <<'EOF'

──────────────────────────────────────────────────────────────────────
Deploy complete.

  • Frontend (SPA + proxy):  reachable ONLY as http://frontend:80 on the
                             compose network (cloudflared uses this — NOT
                             127.0.0.1:8080, no host port is bound)
  • Driver portal:           http://driver-portal:80 (compose network only)
  • API (internal only):     api:3000 inside the compose network
  • One Postgres, one volume (postgres-data) — no parallel DBs.

Next:
  • Confirm Cloudflare ingress maps app.flowop.work -> http://frontend:80
  • Debug the frontend from the host with:
      docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
        exec frontend curl -fsS localhost:80/healthz
  • Owner login: OWNER_SEED_EMAIL / OWNER_SEED_PASSWORD from .env
  • Tail logs:   docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml logs -f api

New in this batch (#140/#141):
  • Usage meters / plan enforcement  → Billing ▸ Plans (live immediately)
  • CLAW Autopilot (Enterprise)       → set a tenant to 'enterprise', AI ▸ CLAW Autopilot, toggle on, "Scan now"
  • SSO (Enterprise, OIDC)            → ADMIN ▸ Single Sign-On; needs API_PUBLIC_URL + APP_URL set in .env

To update later: just re-run  ./deploy/vps-deploy.sh
──────────────────────────────────────────────────────────────────────
EOF

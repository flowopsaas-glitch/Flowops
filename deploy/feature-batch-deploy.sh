#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  FlowOps — feature-batch deploy for the dev box (PR #140 + #141)
#
#  Target environment: the host-PM2 + host-Postgres dev box (NOT Docker
#  Compose). Backend runs under PM2 as `flowops-backend`; the frontend is a
#  single nginx container `flowops-frontend-1` built locally without BuildKit.
#
#  What it does, in order:
#    1. Pull latest main
#    2. Backend: npm install + prisma db push + generate, build  (adds the new
#       autopilot/SSO columns + sso_connections table)
#    3. PRE-FLIGHT GUARD: report any tenant already over its plan limit
#       BEFORE enforcement goes live (prompts before continuing)
#    4. Restart the backend (PM2)
#    5. Frontend: BuildKit-free image build + recreate the container
#    6. Health checks
#
#  Usage:
#    ./deploy/feature-batch-deploy.sh                 # full deploy (interactive)
#    ./deploy/feature-batch-deploy.sh --yes           # don't prompt on overages
#    ./deploy/feature-batch-deploy.sh --backend-only
#    ./deploy/feature-batch-deploy.sh --frontend-only
#    ./deploy/feature-batch-deploy.sh --skip-guard
#
#  Override defaults via env, e.g.:
#    REPO_DIR=~/FlowOps-Logistics BACKEND_HOST=172.17.0.1 ./deploy/feature-batch-deploy.sh
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config (override via environment) ──────────────────────────────────────
REPO_DIR="${REPO_DIR:-$HOME/FlowOps-Logistics}"
BRANCH="${BRANCH:-main}"
PM2_APP="${PM2_APP:-flowops-backend}"
FRONTEND_CONTAINER="${FRONTEND_CONTAINER:-flowops-frontend-1}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-flowops/frontend:latest}"
BACKEND_HOST="${BACKEND_HOST:-172.17.0.1}"   # docker bridge → host gateway
BACKEND_PORT="${BACKEND_PORT:-3000}"
NGINX_PORT="${NGINX_PORT:-80}"
PUBLIC_PORT="${PUBLIC_PORT:-8081}"            # exposed on all interfaces
TUNNEL_PORT="${TUNNEL_PORT:-8080}"            # bound to localhost (cloudflared)
VITE_API_URL="${VITE_API_URL:-/api/v1}"

# ── Flags ──────────────────────────────────────────────────────────────────
ASSUME_YES=0; DO_BACKEND=1; DO_FRONTEND=1; RUN_GUARD=1
for arg in "$@"; do
  case "$arg" in
    --yes|-y)        ASSUME_YES=1 ;;
    --backend-only)  DO_FRONTEND=0 ;;
    --frontend-only) DO_BACKEND=0 ;;
    --skip-guard)    RUN_GUARD=0 ;;
    -h|--help)       grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── Pretty output ────────────────────────────────────────────────────────--
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
step()  { echo -e "\n${BLUE}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────--
[[ -d "$REPO_DIR" ]] || die "REPO_DIR not found: $REPO_DIR"
cd "$REPO_DIR"
[[ -d backend && -d frontend ]] || die "Expected backend/ and frontend/ under $REPO_DIR"
command -v git >/dev/null    || die "git not found"
command -v node >/dev/null   || die "node not found"

# ── 1. Pull latest ───────────────────────────────────────────────────────--
step "Pulling latest $BRANCH"
git checkout "$BRANCH"
git pull --ff-only
info "Now at $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

# ── 2. Backend build (schema + code) ─────────────────────────────────────--
if [[ $DO_BACKEND -eq 1 ]]; then
  step "Backend: install deps + prisma db push + generate + build"
  pushd backend >/dev/null
  command -v npx >/dev/null || die "npx not found"
  # Install deps first so newly-added packages (e.g. @sentry/node) are present
  # before prisma generate / build. npm ci when the lockfile is in sync (clean,
  # reproducible), falling back to npm install otherwise.
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
  npx prisma db push          # additive schema changes
  npx prisma generate
  npm run build
  popd >/dev/null
  info "Backend built."

  # ── 3. Pre-flight guard ──────────────────────────────────────────────---
  if [[ $RUN_GUARD -eq 1 ]]; then
    step "Pre-flight: checking for tenants over their plan limits"
    set +e
    node deploy/check-plan-overages.js
    GUARD_RC=$?
    set -e
    if [[ $GUARD_RC -eq 2 ]]; then
      if [[ $ASSUME_YES -eq 1 ]]; then
        warn "Overages found, but --yes set; continuing."
      else
        read -r -p "$(echo -e "${YELLOW}Tenants are over limit (see above). Continue and restart the backend anyway? [y/N] ${NC}")" ans
        [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted before restarting the backend. No traffic-facing change has been made yet."
      fi
    elif [[ $GUARD_RC -ne 0 ]]; then
      warn "Guard could not complete (rc=$GUARD_RC). Review the message above."
      if [[ $ASSUME_YES -ne 1 ]]; then
        read -r -p "$(echo -e "${YELLOW}Continue anyway? [y/N] ${NC}")" ans
        [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted."
      fi
    fi
  fi

  # ── 4. Restart backend ───────────────────────────────────────────────---
  step "Restarting backend ($PM2_APP)"
  command -v pm2 >/dev/null || die "pm2 not found"
  pm2 restart "$PM2_APP" --update-env
  info "Backend restarted."
fi

# ── 5. Frontend image + container ────────────────────────────────────────--
if [[ $DO_FRONTEND -eq 1 ]]; then
  step "Frontend: BuildKit-free image build"
  command -v docker >/dev/null || die "docker not found"
  pushd frontend >/dev/null
  # Strip BuildKit cache mounts so a classic builder (DOCKER_BUILDKIT=0) works.
  sed -E 's@--mount=type=cache[^ ]* @@g' Dockerfile > Dockerfile.legacy
  DOCKER_BUILDKIT=0 docker build \
    -f Dockerfile.legacy \
    --target production \
    --build-arg VITE_API_URL="$VITE_API_URL" \
    -t "$FRONTEND_IMAGE" .
  rm -f Dockerfile.legacy
  popd >/dev/null
  info "Image built: $FRONTEND_IMAGE"

  step "Recreating container $FRONTEND_CONTAINER"
  docker rm -f "$FRONTEND_CONTAINER" >/dev/null 2>&1 || true
  docker run -d \
    --name "$FRONTEND_CONTAINER" \
    --restart unless-stopped \
    -e BACKEND_HOST="$BACKEND_HOST" \
    -e BACKEND_PORT="$BACKEND_PORT" \
    -e NGINX_PORT="$NGINX_PORT" \
    -p "${PUBLIC_PORT}:80" \
    -p "127.0.0.1:${TUNNEL_PORT}:80" \
    "$FRONTEND_IMAGE"
  info "Container running (public :$PUBLIC_PORT, tunnel 127.0.0.1:$TUNNEL_PORT)."
fi

# ── 6. Health checks ─────────────────────────────────────────────────────--
step "Health checks"
sleep 3
# Backend health lives at /health (excluded from the /api/v1 prefix in main.ts).
backend_code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${BACKEND_PORT}/health" 2>/dev/null || echo "000")
front_root=$(curl -s -o /dev/null -w '%{http_code}'  "http://localhost:${PUBLIC_PORT}/" 2>/dev/null || echo "000")
# Through the nginx proxy, hit a real /api/v1 route. 401 (auth required) proves
# the proxy reaches the backend; 502/000 would mean the upstream is broken.
front_api=$(curl -s -o /dev/null -w '%{http_code}'   "http://localhost:${PUBLIC_PORT}/api/v1/auth/me" 2>/dev/null || echo "000")

echo    "   backend  /health             → $backend_code  (expect 200)"
echo    "   frontend root :$PUBLIC_PORT  → $front_root  (expect 200)"
echo    "   frontend→api  :$PUBLIC_PORT  → $front_api  (expect 401 = proxy + backend OK)"

echo ""
if [[ "$backend_code" == "200" && "$front_root" == "200" && "$front_api" != "502" && "$front_api" != "000" ]]; then
  info "Deploy complete. Hard-reload app.flowop.work to pick up the new bundle."
else
  warn "Something looks off — check 'pm2 logs $PM2_APP' and 'docker logs $FRONTEND_CONTAINER'."
fi

cat <<EOF

Next, to actually exercise the new features:
  • Usage meters / enforcement → Billing ▸ Plans (live immediately)
  • CLAW Autopilot  → set a test tenant's plan to 'enterprise', open AI ▸ CLAW Autopilot, toggle on, hit "Scan now"
  • SSO             → ADMIN ▸ Single Sign-On (Enterprise tenant), configure an OIDC app, then "Sign in with SSO" on the login page
EOF

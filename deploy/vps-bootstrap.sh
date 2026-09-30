#!/usr/bin/env bash
#
# FlowOps — fresh-VPS bootstrap (run ONCE on a new Ubuntu box).
#
# Takes a clean server to "ready to deploy": installs Docker + Compose, creates
# .env from the template, auto-generates the machine secrets (the error-prone
# bit), and wires the domain. It deliberately does NOT deploy — you fill in the
# API keys it lists, then run ./deploy/vps-deploy.sh. It never installs
# cloudflared or creates a host-level systemd unit: the pinned Compose service
# is the sole tunnel owner (see deploy/VPS-RUNBOOK.md).
#
# Usage:
#   ./deploy/vps-bootstrap.sh                       # interactive (asks for domain)
#   ./deploy/vps-bootstrap.sh app.flowop.work       # domain as arg
#   FLOWOPS_DOMAIN=app.flowop.work ./deploy/vps-bootstrap.sh --no-docker  # skip docker install
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

INSTALL_DOCKER=true
DOMAIN="${FLOWOPS_DOMAIN:-}"
for arg in "$@"; do
  case "$arg" in
    --no-docker) INSTALL_DOCKER=false ;;
    -*) die "Unknown flag: $arg" ;;
    *) DOMAIN="$arg" ;;
  esac
done

# ── 1. Docker + Compose v2 ───────────────────────────────────────────────────
if $INSTALL_DOCKER; then
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    ok "Docker + Compose already installed"
  else
    log "Installing Docker + Compose v2"
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER" || true
    warn "Added you to the docker group — log out/in (or run 'newgrp docker') before deploying."
  fi
else
  command -v docker >/dev/null || warn "docker not found and --no-docker set; install it before deploying."
fi

# ── 2. Domain ────────────────────────────────────────────────────────────────
if [[ -z "$DOMAIN" ]]; then
  read -r -p "Public domain for this instance (e.g. app.flowop.work): " DOMAIN
fi
[[ -n "$DOMAIN" ]] || die "A domain is required."
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
ok "Using domain: $DOMAIN"

# ── 3. .env ──────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  warn ".env already exists — leaving it untouched (delete it first to regenerate)."
else
  [[ -f .env.production.example ]] || die "Missing .env.production.example"
  cp .env.production.example .env
  ok "Created .env from template"

  # Helper: set or append KEY=VALUE in .env (| delimiter avoids path clashes).
  set_kv() {
    local key="$1" val="$2"
    if grep -q "^${key}=" .env; then
      sed -i "s|^${key}=.*|${key}=${val}|" .env
    else
      printf '%s=%s\n' "$key" "$val" >> .env
    fi
  }
  gen() { openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }

  log "Generating machine secrets"
  set_kv POSTGRES_PASSWORD "$(gen)"
  set_kv JWT_SECRET "$(gen)"
  set_kv JWT_REFRESH_SECRET "$(gen)"
  ok "POSTGRES_PASSWORD / JWT_SECRET / JWT_REFRESH_SECRET generated"

  log "Wiring domain into .env"
  set_kv APP_URL "https://${DOMAIN}"
  set_kv CORS_ORIGINS "https://${DOMAIN}"
  set_kv API_PUBLIC_URL "https://${DOMAIN}/api/v1"
  set_kv VITE_API_URL "/api/v1"          # MUST stay /api/v1 — see runbook §6
  set_kv VITE_CANONICAL_HOSTS "${DOMAIN}"
  set_kv VITE_INTEGRITY_BEACON_URL "https://${DOMAIN}/api/v1"
  ok "Domain wired (APP_URL, CORS_ORIGINS, API_PUBLIC_URL, canonical hosts)"
fi

# ── 4. What the operator must still fill ─────────────────────────────────────
log "Almost ready. Edit .env and set these before deploying:"
cat <<EOF

  REQUIRED:
    OWNER_SEED_EMAIL        platform super-admin login
    OWNER_SEED_PASSWORD     strong password
    GROQ_API_KEY            unlocks ALL AI (copilot, CLAW, support agent,
                            courier orchestration, intel)  — https://console.groq.com/keys

  RECOMMENDED:
    SENDGRID_API_KEY        transactional email (verify, reset, alerts)
    PAYSTACK_SECRET_KEY     billing / checkout
    TAVILY_API_KEY          live competitive-intel web search

  OPTIONAL:
    GITHUB_REPO / GITHUB_TOKEN     CLAW Build Planner → GitHub issue handoff
    CLOUDFLARE_R2_*                file uploads (else local disk)
    XERO_/SAGE_                    accounting integrations

EOF

cat <<EOF
Next steps:
  1) nano .env            # fill the values above
  2) Configure the Docker-owned Cloudflare tunnel: ${DOMAIN} -> http://frontend:80
     Never install/start a host cloudflared systemd service; it would compete
     with the pinned Compose tunnel agent.
  3) ./deploy/vps-deploy.sh            # application services only; no schema change
     Do NOT add --apply-schema / --seed until the separate staging migration
     rehearsal and production database gate are approved.
  4) After the tunnel-only maintenance action is approved:
     sudo ./deploy/cloudflared-maintenance.sh --check
     sudo ./deploy/cloudflared-maintenance.sh --apply

Verify after deploy:
  • owner login (OWNER_SEED_*), a tenant login, and driver.flowop.work
  • AI features (Support Agent / Courier ▸ AI Orchestrate) respond — proves GROQ_API_KEY reached the container
EOF
ok "Bootstrap complete."

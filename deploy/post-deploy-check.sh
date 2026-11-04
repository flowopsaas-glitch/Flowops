#!/usr/bin/env bash
#
# FlowOps — post-deploy check: is the SPA actually serving the build we just made?
#
# `docker compose up` reports a container as healthy as soon as nginx answers
# /healthz, and nginx answers /healthz from a static file that never changes. A
# deploy can therefore "succeed" while the browser is still being served the
# previous bundle — which is exactly what a frontend-only merge looks like when
# the image was not rebuilt.
#
# This script fetches the entry bundle out of the running frontend container and
# proves that the routes defined in frontend/src/App.tsx are present in it. Route
# paths are string literals that survive minification, and the SPA's route table
# lives in the entry chunk, so their presence is evidence that the deployed
# bundle is the one built from this checkout.
#
# It reads App.tsx rather than keeping its own list, so a new route is checked
# automatically and cannot drift.
#
# Usage:
#   ./deploy/post-deploy-check.sh          # against the running stack
#   ./deploy/post-deploy-check.sh --quiet  # only report failures
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
QUIET=false
for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
    *) printf 'Unknown flag: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say()  { $QUIET || printf '%s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { $QUIET || printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

[[ -f frontend/src/App.tsx ]] || fail "frontend/src/App.tsx not found — run from the repository checkout"

# ── 1. nginx is up ───────────────────────────────────────────────────────────
$COMPOSE exec -T frontend sh -c 'curl -fsS http://localhost:80/healthz >/dev/null' \
  || fail "frontend /healthz did not answer (container down?)"
ok "frontend /healthz"

# ── 2. index.html names an entry bundle ──────────────────────────────────────
ASSET="$($COMPOSE exec -T frontend sh -c \
  'curl -fsS http://localhost:80/ | grep -oE "/assets/[^\"]+\.js" | head -1' | tr -d '\r')"
[[ -n "$ASSET" ]] || fail "index.html references no /assets/*.js — is nginx serving the repo root instead of the built SPA?"
ok "entry bundle: $ASSET"

# ── 3. fetch it ──────────────────────────────────────────────────────────────
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
$COMPOSE exec -T frontend sh -c "curl -fsS 'http://localhost:80${ASSET}'" > "$TMP" \
  || fail "could not fetch ${ASSET} from the frontend container"
BYTES=$(wc -c < "$TMP" | tr -d ' ')
[[ "$BYTES" -gt 10000 ]] || fail "entry bundle is only ${BYTES} bytes — truncated or a placeholder"
ok "entry bundle fetched (${BYTES} bytes)"

# ── 4. every route in App.tsx must be present in the bundle ──────────────────
mapfile -t ROUTES < <(grep -oE 'path="/[^"]*"' frontend/src/App.tsx | sed 's/path="//; s/"$//' | sort -u)
[[ "${#ROUTES[@]}" -gt 0 ]] || fail "no routes found in App.tsx — parser drift, fix this script"

MISSING=()
for route in "${ROUTES[@]}"; do
  if ! grep -qF -- "\"${route}\"" "$TMP" && ! grep -qF -- "${route}" "$TMP"; then
    MISSING+=("$route")
  fi
done

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  printf '\033[1;31m✗ %d of %d routes are missing from the deployed bundle:\033[0m\n' \
    "${#MISSING[@]}" "${#ROUTES[@]}" >&2
  printf '    %s\n' "${MISSING[@]:0:10}" >&2
  if [[ "${#MISSING[@]}" -gt 10 ]]; then
    printf '    … and %d more\n' "$(( ${#MISSING[@]} - 10 ))" >&2
  fi
  cat >&2 <<'MSG'

  The container is healthy but is not serving the build from this checkout.
  Most often the image was not rebuilt after a frontend change. Re-run:

    ./deploy/vps-deploy.sh

  If that still fails, confirm the bundle changed:
    docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
      exec frontend ls -l /usr/share/nginx/html/assets | head
MSG
  exit 1
fi

say "✓ all ${#ROUTES[@]} routes present in the deployed bundle"

# ── 5. the API is reachable through the same proxy the browser uses ─────────
# nginx proxies only /api/ and /socket.io/. The API's own `/health` is on the
# container root and is therefore invisible through the tunnel, and nginx's SPA
# fallback (`try_files $uri $uri/ /index.html`) answers any other path with
# index.html + 200 — so a wrong health URL looks healthy forever. Check the
# public probe through the proxy, and insist that it is JSON.
API_RAW="$($COMPOSE exec -T frontend sh -c \
  'curl -sS -m 15 -w "\n%{http_code} %{content_type}" http://localhost:80/api/v1/health' | tr -d '\r')"
API_META="$(printf '%s' "$API_RAW" | tail -1)"
API_CODE="${API_META%% *}"
API_TYPE="${API_META#* }"
API_BODY="$(printf '%s' "$API_RAW" | sed '$d' | head -c 300)"

if [ "$API_CODE" != "200" ]; then
  printf '\033[1;31m✗ /api/v1/health through the frontend proxy returned HTTP %s\033[0m\n' "$API_CODE" >&2
  printf '    body: %s\n\n' "$API_BODY" >&2
  printf '  The proxy path is broken, or the route is not registered. Check:\n' >&2
  printf '    %s exec api wget -qO- http://localhost:3000/api/v1/health\n' "$COMPOSE" >&2
  exit 1
fi

case "$API_TYPE" in
  *application/json*) : ;;
  *)
    printf '\033[1;31m✗ /api/v1/health answered HTTP 200 as %s, not JSON\033[0m\n' "'${API_TYPE}'" >&2
    printf '    That is nginx serving index.html (the SPA fallback) — the request never\n' >&2
    printf '    reached the API. A monitor reading only the status code calls this healthy.\n' >&2
    exit 1
    ;;
esac

# Match on the parsed intent, not on a byte-for-byte serialisation: JSON spacing
# is not part of anyone's contract.
if ! printf '%s' "$API_BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  printf '\033[1;31m✗ API reports a non-ok status through the proxy\033[0m\n' >&2
  printf '    body: %s\n' "$API_BODY" >&2
  exit 1
fi

ok "api /api/v1/health via the proxy: HTTP 200, ${API_TYPE}, status ok"

$QUIET || printf '\n\033[1;32mPost-deploy check passed\033[0m — the running frontend serves %s and reaches the API\n' "$ASSET"

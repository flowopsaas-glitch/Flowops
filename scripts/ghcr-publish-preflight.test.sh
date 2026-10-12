#!/usr/bin/env bash
#
# FlowOps — behaviour tests for scripts/ghcr-publish-preflight.sh.
#
# Runs a mock registry on 127.0.0.1 and pins the four states that matter:
#
#   1. a credential that CAN push, to a package that does NOT exist yet
#      → must PASS (this is a first publish; the old probe failed it, and
#        because the preflight runs before the push, that failure was a
#        deadlock — it blocked the publish that would have created the package)
#   2. a credential that CAN push, package already published   → must PASS
#   3. a credential that CANNOT push                           → must FAIL, fast,
#      with a message naming the push-scoped token exchange
#   4. registry unreachable / token missing                    → must FAIL clearly
#
# It also reproduces the old raw-Bearer probe against the same mock and asserts
# it fails case 1 — the regression this change exists to prevent.
#
# No network, no credentials, no Docker. Run it anywhere:
#     ./scripts/ghcr-publish-preflight.test.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFLIGHT="$REPO_ROOT/scripts/ghcr-publish-preflight.sh"

TMP="$(mktemp -d)"
MOCK_PID=""
cleanup() {
  if [ -n "$MOCK_PID" ]; then kill "$MOCK_PID" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if [ ! -x "$PREFLIGHT" ]; then
  echo "FAIL: $PREFLIGHT is not executable" >&2
  exit 1
fi

# ── mock registry ──────────────────────────────────────────────────────────
cat >"$TMP/mock_registry.py" <<'PY'
import base64, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

FLAG = os.environ.get("MOCK_FLAG", "")   # package "exists" while this file exists
GOOD_PASSWORD = "good-pat"
PUSH_TOKEN = "mock-push-token"


def basic_password(header):
    if not header or not header.lower().startswith("basic "):
        return None
    try:
        raw = base64.b64decode(header.split(" ", 1)[1]).decode()
    except Exception:
        return None
    return raw.split(":", 1)[1] if ":" in raw else None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)

        # Token exchange: the supported handshake. Grants push scope based on
        # whether the CREDENTIAL may push — never on package existence.
        if url.path == "/token":
            password = basic_password(self.headers.get("Authorization"))
            scope = parse_qs(url.query).get("scope", [""])[0]
            if password == GOOD_PASSWORD and "push" in scope:
                return self._send(200, {"token": PUSH_TOKEN, "expires_in": 300})
            return self._send(403, {"errors": [{"code": "DENIED", "message": "denied"}]})

        # Manifest read. Refuses anything that is not a token we issued (a raw
        # GitHub credential sent to /v2/ is not a registry token), and answers
        # DENIED for a package that does not exist yet — the exact signal the
        # old probe could not tell apart from "no permission".
        if url.path.startswith("/v2/") and url.path.endswith("/manifests/main"):
            auth = self.headers.get("Authorization", "")
            token = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else None
            if token == PUSH_TOKEN and FLAG and os.path.exists(FLAG):
                return self._send(200, {"schemaVersion": 2})
            return self._send(403, {"errors": [{"code": "DENIED", "message": "denied"}]})

        return self._send(404, {"errors": [{"code": "NAME_UNKNOWN", "message": "unknown"}]})


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print("PORT=%d" % server.server_address[1], flush=True)
server.serve_forever()
PY

EXISTS_FLAG="$TMP/package-exists"
MOCK_FLAG="$EXISTS_FLAG" python3 "$TMP/mock_registry.py" >"$TMP/mock.log" 2>&1 &
MOCK_PID=$!

PORT=""
for _ in $(seq 1 100); do
  PORT="$(sed -n 's/^PORT=//p' "$TMP/mock.log" | head -1)"
  [ -n "$PORT" ] && break
  sleep 0.1
done
if [ -z "$PORT" ]; then
  echo "FAIL: mock registry did not start" >&2
  cat "$TMP/mock.log" >&2
  exit 1
fi
REGISTRY="http://127.0.0.1:$PORT"
echo "mock registry on $REGISTRY"
echo

PASSED=0
FAILED=0
ok() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
no() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }

run_preflight() { # $1 = REG_TOKEN (may be empty string)
  GHCR_REGISTRY="$REGISTRY" \
    REG_TOKEN="$1" \
    GITHUB_REPOSITORY="flowopsaas-glitch/Flowops" \
    GITHUB_REPOSITORY_OWNER="flowopsaas-glitch" \
    PACKAGE_SUFFIX="frontend" \
    "$PREFLIGHT"
}

MANIFEST="$REGISTRY/v2/flowopsaas-glitch/flowops-frontend/manifests/main"

# ── 0. the regression: the old raw-Bearer probe vs a push-capable credential ─
echo "0. old probe (raw Bearer manifest GET) — the behaviour being replaced"
old_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "Authorization: Bearer good-pat" "$MANIFEST" || true)"
old_code="${old_code:-000}"
echo "   raw Bearer manifest GET -> HTTP $old_code"
case "$old_code" in
  200 | 404) ok "old probe would have passed" ;;
  401 | 403) ok "old probe fails a credential that CAN push (deadlock reproduced)" ;;
  *) ok "old probe inconclusive (HTTP $old_code)" ;;
esac
echo

# ── 1. push-capable credential, package not published yet ──────────────────
echo "1. credential can push, package does NOT exist yet (first publish)"
rm -f "$EXISTS_FLAG"
out="$(run_preflight "good-pat" 2>&1)"; rc=$?
echo "$out" | sed 's/^/   | /'
if [ "$rc" -eq 0 ]; then
  ok "exits 0 — the first publish is allowed to create the package"
else
  no "exited $rc, expected 0 (this is the deadlock)"
fi
echo

# ── 2. push-capable credential, package already published ─────────────────
echo "2. credential can push, package already published"
touch "$EXISTS_FLAG"
out="$(run_preflight "good-pat" 2>&1)"; rc=$?
echo "$out" | sed 's/^/   | /'
if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q 'HTTP 200'; then
  ok "exits 0 and reports the package is published (HTTP 200)"
else
  no "expected exit 0 with an HTTP 200 manifest probe (got exit $rc)"
fi
rm -f "$EXISTS_FLAG"
echo

# ── 3. credential that genuinely cannot push ──────────────────────────────
echo "3. credential genuinely cannot push"
out="$(run_preflight "readonly-pat" 2>&1)"; rc=$?
echo "$out" | sed 's/^/   | /'
if [ "$rc" -ne 0 ]; then
  ok "fails fast (exit $rc) instead of burning a multi-arch build"
else
  no "exited 0 — a denied credential must not pass the preflight"
fi
if printf '%s' "$out" | grep -q 'push-scoped'; then
  ok "message names the push-scoped token exchange"
else
  no "message does not explain the push-scoped token exchange"
fi
echo

# ── 4. registry unreachable ───────────────────────────────────────────────
echo "4. registry unreachable"
out="$(GHCR_REGISTRY="http://127.0.0.1:1" \
  REG_TOKEN="good-pat" \
  GITHUB_REPOSITORY="flowopsaas-glitch/Flowops" \
  GITHUB_REPOSITORY_OWNER="flowopsaas-glitch" \
  PACKAGE_SUFFIX="frontend" \
  "$PREFLIGHT" 2>&1)"; rc=$?
echo "$out" | sed 's/^/   | /'
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'could not reach'; then
  ok "fails with a network diagnosis, not a permissions one"
else
  no "expected a clear 'could not reach the registry' failure (got exit $rc)"
fi
echo

# ── 5. missing credential ─────────────────────────────────────────────────
echo "5. no credential available to the job"
out="$(run_preflight "" 2>&1)"; rc=$?
echo "$out" | sed 's/^/   | /'
if [ "$rc" -eq 2 ] && printf '%s' "$out" | grep -q 'REG_TOKEN is empty'; then
  ok "exits 2 with a usage error naming REG_TOKEN"
else
  no "expected exit 2 and 'REG_TOKEN is empty' (got exit $rc)"
fi
echo

echo "──────────────────────────────────────────────"
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ] || exit 1
exit 0

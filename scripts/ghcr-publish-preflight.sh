#!/usr/bin/env bash
#
# FlowOps — GHCR publish preflight: fail fast when the credential genuinely
# cannot publish, WITHOUT deadlocking the first publish of a package that does
# not exist yet. Both of those states used to look identical.
#
# ── Why this file exists (read before changing the probe) ──────────────────
#
# 2026-09-27: main went red at the END of a multi-arch image build with
# `denied: permission_denied: read_package`, so the real problem was expensive
# to even see. A preflight was added that did:
#
#     curl -H "Authorization: Bearer $GITHUB_TOKEN" \
#          https://ghcr.io/v2/<owner>/<pkg>/manifests/main
#
# and treated 401/403 as "this job's token cannot publish". That probe cannot
# answer the question it was asked, for two independent reasons:
#
#   1. It is not the registry handshake. GHCR's /v2/ endpoints authenticate a
#      *registry-scoped* token, which a client obtains by exchanging its
#      credentials at /token. A raw GitHub credential sent straight to /v2/ is
#      not that token, so the HTTP status it comes back with says nothing
#      reliable about whether the credential may push.
#
#   2. It conflates "denied" with "not created yet". GHCR answers 403 DENIED
#      for a package path the credential has no grants on — which includes a
#      package that does not exist yet. The old probe's comment assumed
#      absence arrives as 404 ("200/404 -> package readable, or absent"), so a
#      brand-new package was reported as a permissions failure.
#
# (2) is a deadlock, not just a bad message: the preflight runs BEFORE the
# push, so it refused the very first publish that would have created the
# package and cleared the probe. That is the shape of the 2026-09-27 →
# 2026-10-12 main failures on the user-owned ghcr.io/flowopsaas-glitch/
# flowops-{frontend,backend} packages, and why the documented "fix one of
# three settings" advice never resolved it.
#
# ── What this probe does instead ───────────────────────────────────────────
#
# It asks the registry the only question the job actually needs answered: can
# this credential obtain a *push-scoped* token for this package? Credentials go
# in via Basic auth at /token, and the answer is a scoped token (may publish)
# or a refusal (may not). The answer does not depend on whether the package
# exists, so a first publish is no longer blocked by its own absence, while a
# genuine authorisation failure still fails here — before the multi-arch build,
# which is the entire point of a preflight.
#
# The manifest probe is kept, but only as information: absence is expected and
# never fatal.
#
# ── Usage ──────────────────────────────────────────────────────────────────
#
# From .github/workflows/ci.yml (both image jobs):
#
#     - name: GHCR publish preflight
#       if: github.event_name == 'push'
#       env:
#         REG_TOKEN: ${{ secrets.CR_PAT || secrets.GITHUB_TOKEN }}
#         PACKAGE_SUFFIX: frontend        # or: backend
#       run: ./scripts/ghcr-publish-preflight.sh
#
# Env:
#   REG_TOKEN              required. CR_PAT or GITHUB_TOKEN.
#   PACKAGE_SUFFIX         required. "frontend" | "backend".
#   GITHUB_REPOSITORY      required. "<owner>/<repo>" (Actions provides it).
#   GITHUB_REPOSITORY_OWNER required. Actions provides it.
#   GHCR_REGISTRY          optional. Default "https://ghcr.io". Only the tests
#                          set this — scripts/ghcr-publish-preflight.test.sh
#                          points it at a mock registry.
#
# Exit codes:
#   0  the credential can publish to this package (package may not exist yet)
#   1  the credential cannot publish, or the registry could not be reached
#   2  bad usage
#
set -euo pipefail

REGISTRY="${GHCR_REGISTRY:-https://ghcr.io}"
REGISTRY="${REGISTRY%/}"

usage_error() {
  echo "ghcr-publish-preflight: $1" >&2
  exit 2
}

[ -n "${GITHUB_REPOSITORY:-}" ] || usage_error "GITHUB_REPOSITORY is not set"
[ -n "${GITHUB_REPOSITORY_OWNER:-}" ] || usage_error "GITHUB_REPOSITORY_OWNER is not set"
[ -n "${PACKAGE_SUFFIX:-}" ] || usage_error "PACKAGE_SUFFIX is not set (frontend|backend)"
# An empty secret interpolates to an empty string, not an unset variable, so
# this guard cannot use ${REG_TOKEN:?} — it has to test emptiness explicitly.
[ -n "${REG_TOKEN:-}" ] || usage_error "REG_TOKEN is empty — neither CR_PAT nor GITHUB_TOKEN was available to this job"

owner="${GITHUB_REPOSITORY_OWNER}"
repo="${GITHUB_REPOSITORY##*/}"
pkg="${owner}/${repo}-${PACKAGE_SUFFIX}"
# GHCR requires lowercase paths.
pkg="${pkg,,}"

scope="repository:${pkg}:pull,push"
exchange_url="${REGISTRY}/token?service=ghcr.io&scope=${scope}"
manifest_url="${REGISTRY}/v2/${pkg}/manifests/main"

echo "GHCR preflight: package ${pkg}"
echo "GHCR preflight: asking ${REGISTRY} for a push-scoped token (${scope})"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

code="$(curl -sS --max-time 30 -o "$body" -w '%{http_code}' \
  -u "${owner}:${REG_TOKEN}" "$exchange_url" || true)"
code="${code:-000}"

if [ "$code" = "000" ]; then
  cat >&2 <<EOF
::error title=GHCR publish preflight::could not reach ${REGISTRY} — the publish cannot be attempted.

A push-scoped token could not even be requested (HTTP 000). This is a network
or registry-availability problem, not a permissions problem.
EOF
  exit 1
fi

# GHCR answers {"token":"…"}; other registries spell it "access_token".
scoped="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body" | head -1)"
if [ -z "$scoped" ]; then
  scoped="$(sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body" | head -1)"
fi

if [ -z "$scoped" ]; then
  cat >&2 <<EOF
::error title=GHCR publish preflight::${pkg} — the credential could not obtain a push-scoped registry token (HTTP ${code}). Publishing WILL fail, so the multi-arch build was not started.

The registry answered:
$(head -c 500 "$body" 2>/dev/null)

This is a genuine authorisation refusal — the registry was asked for scope
"${scope}" and declined it. It is NOT the 'package does not exist yet' case
(that returns a token here). Fix ONE of:
  1. add repository secret CR_PAT — a fine-grained PAT with "Packages: write"
     (these jobs already prefer it over GITHUB_TOKEN);
  2. if the package already exists, open its Package settings > "Manage Actions
     access" and grant THIS repository Write;
  3. confirm the account is permitted to publish packages from Actions at all.

Note: this job already declares 'permissions: packages: write', so the
repository-default "Workflow permissions" setting is not what is blocking this.
Previously the preflight recommended changing it, which never fixed anything.
EOF
  exit 1
fi

echo "Preflight OK: push-scoped token issued (HTTP ${code})."

# Informational only. Absence is normal on a first publish and must not fail:
# the very next step (docker buildx --push) creates the package.
mcode="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${scoped}" \
  -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
  "$manifest_url" || true)"

case "${mcode:-000}" in
  200)
    echo "  manifest probe: HTTP 200 — package already published and readable." ;;
  404)
    echo "  manifest probe: HTTP 404 — package not published yet; this push creates it." ;;
  401 | 403)
    echo "  manifest probe: HTTP ${mcode} — package not published yet (or not readable with this token); this push creates it."
    echo "  (Informational: the push-scoped token above is what authorises the publish.)" ;;
  000)
    echo "  manifest probe: no answer from the registry — non-fatal; the push-scoped token is what authorises the publish." ;;
  *)
    echo "  manifest probe: HTTP ${mcode} — non-fatal; the push-scoped token is what authorises the publish." ;;
esac

exit 0

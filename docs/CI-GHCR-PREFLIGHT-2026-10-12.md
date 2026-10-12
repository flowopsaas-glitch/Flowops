# CI — GHCR publish preflight: why the image jobs failed for weeks, and the fix

**Date:** 2026-10-12
**Scope:** `.github/workflows/ci.yml` (`Frontend Image`, `Backend Image`),
`scripts/ghcr-publish-preflight.sh` (new),
`scripts/ghcr-publish-preflight.test.sh` (new), `ci-tooling` job (new)

## 1. Symptom

Every push to `main` since 2026-09-27 fails both image jobs at the same step:

```
GHCR publish preflight: GET ghcr.io/v2/flowopsaas-glitch/flowops-frontend/manifests/main -> HTTP 403
::error title=GHCR publish preflight::ghcr.io/flowopsaas-glitch/flowops-frontend denied (HTTP 403)
```

The job already declares `permissions: packages: write` and already logs in with
`secrets.CR_PAT || secrets.GITHUB_TOKEN`. Three sessions read the preflight's own
remediation text — change the repository *Workflow permissions* default, grant
the package write access, or add a `CR_PAT` — and none of it resolved the red,
because the preflight was answering a different question than the one it printed.

## 2. The probe could not answer the question it asked

The old step did a raw-Bearer manifest read:

```bash
curl -H "Authorization: Bearer $REG_TOKEN" \
     https://ghcr.io/v2/<owner>/<pkg>/manifests/main
# 200/404 -> OK          (comment: "readable, or absent (first push creates it)")
# 401/403 -> fail: "this job's token cannot publish"
```

Two independent defects:

1. **It is not the registry handshake.** GHCR's `/v2/` endpoints authenticate a
   *registry-scoped* token, which clients obtain by exchanging credentials at
   `/token`. A raw GitHub credential sent to `/v2/` is not that token, so the
   status it returns says nothing reliable about publishing capability. The
   `docker/login-action` step immediately below uses the supported handshake —
   the preflight did not, so the preflight and the actual push were measuring
   different things.
2. **It conflates "denied" with "not created yet."** GHCR answers `403 DENIED`
   for a package path the credential has no grants on — which includes a package
   that does not exist yet. The comment assumed absence arrives as `404`, so a
   package that had never been published was reported as a permissions failure.

Defect 2 made this a **deadlock, not just a bad message**: the preflight runs
*before* the push, so it refused the very first publish — the one that would have
created the package and made the probe return `200` from then on. The longer it
failed, the more it looked like a permanent authorisation problem.

## 3. What changed

`scripts/ghcr-publish-preflight.sh` asks the registry the only question the job
needs answered — *can this credential obtain a push-scoped token for this
package?* — via the same token exchange `docker login` performs (credentials in
via Basic auth, a scoped token or a refusal out). That answer does not depend on
whether the package exists, so:

* a first publish is no longer blocked by its own absence;
* a genuine authorisation refusal still fails **before** the multi-arch build,
  preserving the entire point of a preflight;
* a network/registry outage now says so instead of blaming permissions.

The manifest probe is kept as *information only*; absence is expected and never
fatal. Both image jobs now call the one script (`PACKAGE_SUFFIX: frontend|backend`)
instead of carrying duplicate inline copies.

## 4. Evidence

`scripts/ghcr-publish-preflight.test.sh` runs a mock registry on `127.0.0.1` — no
network, no credentials, no Docker — and pins the decision table:

| # | State | Expected | Result |
|---|---|---|---|
| 0 | old raw-Bearer probe vs a credential that **can** push (package absent) | reproduces the false failure | `HTTP 403` → FAIL, as reported |
| 1 | can push, package not published yet | **pass** | pass |
| 2 | can push, package already published | pass, reports `HTTP 200` | pass |
| 3 | cannot push | fail fast, message names the push-scoped exchange | pass |
| 4 | registry unreachable | fail with a network diagnosis | pass |
| 5 | no credential | exit 2, names `REG_TOKEN` | pass |

`7 passed, 0 failed`. The new `ci-tooling` job runs this suite on every PR and
push, so the deadlock cannot come back unnoticed. `release:safety:test` (40
tests, which asserts against `ci.yml`) still passes.

## 5. Confirming against the real registry

The sandbox that wrote this had no route to `ghcr.io`, so the mock encodes the
documented handshake rather than observed bytes. To check the real thing from a
machine with network (owner-run; the token stays on that machine):

```bash
REG_TOKEN=<token> \
GITHUB_REPOSITORY=flowopsaas-glitch/Flowops \
GITHUB_REPOSITORY_OWNER=flowopsaas-glitch \
PACKAGE_SUFFIX=frontend \
./scripts/ghcr-publish-preflight.sh
```

It exits `0` with a push-scoped token, or `1` with the registry's own refusal
body. If it now passes, the next `push` to `main` publishes both images and
creates the packages on first success.

## 6. If it still fails

The script fails only on a real refusal from `/token`, so the remedies are
narrower than the old message claimed:

1. add repository secret `CR_PAT` — a fine-grained PAT with **Packages: write**
   (both image jobs already prefer it over `GITHUB_TOKEN`);
2. if the package already exists, its **Package settings → Manage Actions
   access** → grant this repository **Write**;
3. confirm the account may publish packages from Actions at all.

The repository-default *Workflow permissions* setting is **not** the limiter:
the jobs already declare `permissions: packages: write` explicitly, which is why
changing that setting never fixed this. The old preflight recommended it first.

# Security & correctness hardening — 2026-09-27

Implements the Phase 1 punch-list items that can be changed safely without
production access. Authored on `arena/01a0e23b-flowops`. **Not committed** —
awaiting diff approval.

Diff size: **17 files, +217 / −73** (pre-existing files were patched in place;
no whole-file reformatting).

---

## 1. Tenant isolation (P0)

| # | Change | File |
|---|---|---|
| 1 | `resolve()` no longer writes to another tenant's AI event. It now throws `NotFound` when the tenant-scoped lookup misses, and the write itself is scoped `updateMany({ where: { id, companyId } })` with a `count === 0` check. | `src/ai/ai-events.service.ts` |
| 2 | AI `ask`, `verify-pod`, `repair-billing`, `logic/learn` take the tenant from the JWT (`@CurrentUser`) instead of the request body. `learn()` builds its payload from named fields, so a body `companyId` cannot be smuggled in. | `src/ai/ai-events.controller.ts` |
| 3 | New `withCompanyId(companyId, data)` strips `companyId`/`id`/`createdAt`/`updatedAt` from client input and pins the session tenant. Applied to WMS warehouse create + stock movement, commercial config create **and update**, tracking-event create, SSO connection create. Previously `{ companyId, ...dto }` let the body win. | `src/common/security/tenant.util.ts` + 5 services |
| 4 | Driver POD capture now **requires** `companyId` and `driverId` (types changed from optional) and rejects the request if either is missing. The old conditional spread (`...(body.companyId ? {...} : {})`) silently collapsed to "any waybill by id" if a caller ever omitted one. | `src/driver-portal/driver-portal.service.ts` |

## 2. Unauthenticated data exposure (P0)

| # | Change | File |
|---|---|---|
| 5 | Customer-portal tracking filter extracted into `buildWaybillTrackWhere()`, which returns `null` when the caller supplies no usable filter. `?phone=%20%20` used to normalise to `contains: ''` and match every waybill in the tenant (up to 50 rows with recipient name, address, COD). Phone searches now need ≥4 digits; email stays exact-match. | `src/common/security/portal-lookup.util.ts`, `src/customer-portal/customer-portal.controller.ts` |
| 6 | `GET /waybills/public/:id` no longer returns PII to the internet. Without a valid share token it returns tracking status + company branding only, plus `restricted: true`. Recipient/sender names, addresses and POD signature/image URLs require `?t=<share token>`. **Behaviour change:** any caller using this endpoint without a token now gets the restricted view. No consumer exists in `frontend/` or `driver-portal/`. | `src/waybills/waybills.service.ts`, `waybills.controller.ts` |

## 3. Output encoding (P0)

| # | Change | File |
|---|---|---|
| 7 | Public invoice HTML now escapes every tenant-controlled value via `escapeHtml`. Brand colour goes through `safeCssColor` (hex/keyword allowlist) and `safeHexForSuffix`, so `red;background:url(...)` cannot break out of the CSS rule. `fmt()` coerces with `Number()` first — `toLocaleString()` on a string returns that string verbatim. | `src/invoices/public-invoice.controller.ts`, `src/common/security/html.util.ts` |

## 4. Honest failures instead of fake success

| # | Change | File |
|---|---|---|
| 8 | `repairInvoicing()` used to log and return `{ status: 'repaired' }` while touching no data — a billing "repair" that never happened. It now returns `status: 'manual_review_required'`, `automated: false`, and a reason. | `src/ai/ai-events.service.ts` |
| 9 | `POST /ai-events/ask` returns a canned string with `status: 'success'`. Now returns `status: 'stub'`, `stub: true` and says the copilot is not connected. | `src/ai/ai-events.controller.ts` |

## 5. RBAC — opt-in strict mode + inventory (P1)

`RolesGuard` allows any authenticated role when a route carries no `@Roles`.
**576 of 668 routes** have none. Flipping that to deny would lock out paying
tenants, so enforcement is now **opt-in**:

- `RBAC_STRICT=true` makes routes without `@Roles` return 403. Default: off
  (today's behaviour, unchanged).
- New `npm run rbac:inventory` prints every route and whether it has roles
  (`--format json` for CI). Current output: 79 controllers, 668 routes,
  32 with roles, 60 public, **576 with none**.

The guard's no-metadata branch is deliberately **above** the user check:
`@Public()` routes pass through this guard with no authenticated user, and
moving the check would have 403'd all 60 public endpoints. Covered by a test.

## 6. CI & housekeeping

| # | Change | File |
|---|---|---|
| 10 | `deploy.yml` was a comment-only file that GitHub still parsed as a workflow, so **every push produced a failed run**. Now a valid workflow triggered only by `workflow_dispatch`, which states it is not configured and exits non-zero if someone tries to run it. | `.github/workflows/deploy.yml` |
| 11 | `ci.yml` ran only on `main`/`develop`/tags and PRs *to main*, so feature branches got no CI at all. `pull_request:` is now unbounded — PRs against any branch build. | `.github/workflows/ci.yml` |
| 12 | Deleted `scripts/1782737032167.jpeg` (20 KB stray upload). | `scripts/` |
| 13 | Paystack IP allowlist is intentionally permissive when `PAYSTACK_WEBHOOK_IPS` is unset (HMAC signature is the real gate); it now logs a boot warning instead of skipping silently. | `src/paystack/paystack.service.ts` |

---

## Tests

New, Prisma-free (run locally):

- `src/common/security/html.util.spec.ts` — escaping, CSS colour injection, URL schemes.
- `src/common/security/portal-lookup.util.spec.ts` — whitespace phone, short fragments, exact email, tenant scoping.
- `src/common/security/tenant.util.spec.ts` — client `companyId` override, server-owned fields, no mutation.
- `src/common/guards/roles.guard.spec.ts` — default-allow, public routes with no user, `RBAC_STRICT` on/off.

**Full local verification (after Prisma client generation was unblocked):**

```
npx tsc -p tsconfig.build.json --noEmit   # 0 errors
npm test                                   # 100 passed, 0 failed; 11/12 suites
```

The one non-passing suite is `users.service.spec.ts`, which cannot load
`bcrypt` because its native binding cannot be built in this sandbox. It is an
environment limitation, not a code failure; the suite passes in CI.

Two type errors found by the first local type-check were fixed in this
change: `withCompanyId` now returns `T & { companyId: string }` instead of
`Record<string, any>` (an index signature does not satisfy Prisma's named
model inputs), and `driver-portal.service.ts` imports `BadRequestException`.

## Punch-list close-out (second pass, 2026-09-27)

The first pass's "Deliberately NOT changed" items, each now either fixed with
evidence or deferred with an exact reason and next step. Nothing dropped.

| Item | State | Evidence / next step |
|---|---|---|
| `ApiShieldGuard` regex rules | **FIXED** `5a92eb1` | Attack-*shape* detection (quote adjacency, tautologies, separators, code sinks) instead of attack words; behaviour pinned BOTH ways by `api-shield.guard.spec.ts` (22 attack cases must 400, 12 legitimate-logistics cases — "select reefer from the yard", O'Brien, and/or, R&D, "javascript: the good parts" — must pass; 36/36). Also fixed: bot detection was counting toward the block threshold (10 curl health-checks in 15 min = self-429); X-Forwarded-For took the spoofable first entry; `/health` prefix matched `/healthz-private`. **Residual:** extend the corpora from real traffic before any further pattern change — the spec is the review surface. |
| Multi-arch image publish failure | **CONFIRMED + fail-fast** `1de11f8` | Diagnosis settled: **GHCR authorisation, not QEMU** — check-run annotations on run `36131148873` (jobs `108058994914`/`108059046808`) show `denied: permission_denied: read_package` at `Build & push (multi-arch)`; amd64 build, boot smoke and Trivy all pass. Both jobs already declare `packages: write`, so the token is held to account settings. **Owner action (settings — I must not flip these):** one of (1) Settings → Actions → General → Workflow permissions → "Read and write permissions"; (2) if the package already exists: Package settings → "Manage Actions access" → grant this repo Write; (3) add secret `CR_PAT` (fine-grained PAT, Packages: write) — login now falls back to it. Both image jobs now run a GHCR preflight probe that fails fast with these exact remediations annotated on the run. |
| Frontend API-client consolidation | **DONE** `19be494` | `api/api.ts` turned out to be dead (zero importers) and was deleted with its divergent cookie-refresh/redirect behaviour; the live bugs were split-brain base-URL resolution (client.ts vs lib/env — one app, two resolvers) and unbounded parallel 401 refreshes (rotating refresh tokens could kill the session). One client (`api/client.ts`), one base URL (lib/env), shared-refresh queue. 59/59 vitest, tsc clean. `base44Client` stub folded into the `api/index.ts` barrel. |
| 82 eslint warnings | **FIXED (backend)** `28506d1` | The 82 was the backend count (actual: 80, all `no-unused-vars`) — now **0/0**, with standard intentional-unused conventions (`_` prefix, rest siblings) documented in `.eslintrc.js`. tsc clean, 114/114 jest. **DEFERRED (frontend, new):** 1591 warnings remain — 939 `no-explicit-any`, 204 `no-unused-vars`, 127 `label-has-associated-control`, 114 `set-state-in-effect`, 59 `no-static-element-interactions`, plus small tails. That is a multi-PR typed-APIs + a11y campaign, not a mechanical sweep; it needs its own budget and review. |
| `driver-mobile` native scaffolding | **SCAFFOLD VERIFIED** `bca01c7` | Real defects fixed: `package-lock.json` was missing (`npm ci` could not run at all) and `typescript` was missing from devDependencies (Capacitor CLI needs it to load `capacitor.config.ts`); pinned `^5.5.4` because Capacitor 6's CLI crashes on typescript@7.x (`Cannot read properties of undefined (reading 'CommonJS')`). Verified end-to-end on a real driver-portal build: `prepare:web` (SW neutralised) → `cap add android` → `cap sync` (plugins wired) all green. **SDK-gated remainder (not doable here):** iOS project generation needs macOS/Xcode/CocoaPods; android/ios **builds** need Android Studio/Xcode + signing; `npm run assets` needs the `sharp` prebuilt binary (its download fails behind this sandbox's TLS chain — works on a normal dev machine); store listings/signing are owner steps. |
| 97 audit entries owner review | **PACK DELIVERED** `bca01c7` | `docs/TENANT-SCOPE-OWNER-REVIEW-2026-09-27.md`: all 97 unscoped entries (audit totals 296 findings = 97 unscoped + 199 probably-guarded, counts asserted against the tool) grouped by module with four dispositions (A platform-admin / S needs company scope / V verified in-tenant upstream / U unclear), owner-note and initial columns, and a two-role sign-off block. **The review itself is an owner action** — the scanner cannot see runtime control flow; nobody but the flow owners can decide these rows. Until signed off, none of these entries may be cited as tenant-isolation evidence. |

### Still deferred (unchanged from the first pass)

- **Hard default-deny RBAC** — `npm run rbac:inventory`: 576 routes without `@Roles`, 60 public, 75 controllers with none. Same review pattern as the tenant-scope pack; `RBAC_STRICT` stays false and the flip stays a one-line env change until the assignments are approved.
- **`tsconfig` strictness** — enabling `strict`/`noImplicitAny` would produce hundreds of errors and cannot be verified here (no Prisma client). Needs its own migration plan.
- **Deploy script sprawl** — cosmetic; untouched.
- **`infra/` and `legal/`** — not touched, per your rule. `infra/terraform` has active `production` and `staging` environments I have not reviewed.

## Open questions

1. **What commit is deployed?** Every finding here is source-level; exposure depends on the deployed revision.
2. **Is `GET /waybills/public/:id` used by anything outside this repo?** If yes, item 6 is a breaking change and we should agree a token rollout.
3. **PR #436** is open and unmerged; its warehouse/AI code is out of scope here and will stack on top of items 1–3.

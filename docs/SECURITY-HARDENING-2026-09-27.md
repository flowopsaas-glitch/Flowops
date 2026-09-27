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

New, Prisma-free (run locally, 26 passing):

- `src/common/security/html.util.spec.ts` — escaping, CSS colour injection, URL schemes.
- `src/common/security/portal-lookup.util.spec.ts` — whitespace phone, short fragments, exact email, tenant scoping.
- `src/common/security/tenant.util.spec.ts` — client `companyId` override, server-owned fields, no mutation.
- `src/common/guards/roles.guard.spec.ts` — default-allow, public routes with no user, `RBAC_STRICT` on/off.

```
npm test   # 45 passed, 0 failed
```

**Environment caveat:** 7 of 12 suites cannot *run* in this sandbox — 6 were
already failing (Prisma client not generated; blocked network to
`binaries.prisma.sh`) and `roles.guard.spec.ts` joins them for the same reason
(`@prisma/client` has no exported `UserRole` until generation). All 12 run in
CI, where the Backend job passes on `main`.

## Deliberately NOT changed

Each of these risks breaking production if done blind:

- **Hard default-deny RBAC** — needs the 576-route inventory reviewed and roles assigned per route first. Tooling is in place; the flip is a one-line env change once you approve the assignments.
- **`ApiShieldGuard` regex rules** — tightening SQLi/XSS patterns could 400 legitimate logistics text; loosening them removes protection. Needs real traffic sampling.
- **Multi-arch image publish failure** (both image jobs on `main`) — amd64 build, NestJS boot smoke test and Trivy all pass; only `Build & push (multi-arch)` fails. I have no access to the job logs to tell whether it is QEMU/arm64 or GHCR permissions.
- **`tsconfig` strictness** — enabling `strict`/`noImplicitAny` would produce hundreds of errors and cannot be verified here (no Prisma client).
- **Frontend API-client consolidation** (4 overlapping clients) — behavioural refactor, needs its own PR with e2e coverage.
- **82 eslint warnings / deploy script sprawl / `driver-mobile` native scaffolding** — cosmetic or require SDKs not available here.
- **`infra/` and `legal/`** — not touched, per your rule. `infra/terraform` has active `production` and `staging` environments I have not reviewed.

## Open questions

1. **What commit is deployed?** Every finding here is source-level; exposure depends on the deployed revision.
2. **Is `GET /waybills/public/:id` used by anything outside this repo?** If yes, item 6 is a breaking change and we should agree a token rollout.
3. **PR #436** is open and unmerged; its warehouse/AI code is out of scope here and will stack on top of items 1–3.

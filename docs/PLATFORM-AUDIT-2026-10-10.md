# Platform audit — errors & cracks sweep (2026-10-10, round 74)

**Scope:** the user reported "100 errors on platform" and a tenant-side dashboard error after
login, and asked for a full audit — "world class, no cracks anywhere". This document is the audit
record: what was checked, what was found, what was fixed.

## 1. Verdict

| Gate | Result |
| --- | --- |
| Frontend `tsc --noEmit` | **0 errors** |
| Frontend `vite build` | **0 errors** (PWA + workbox emitted) |
| Frontend vitest | **756/756 pass** (749 + 7 new smoke/regression tests) |
| Frontend ESLint | **0 errors** (1,613 `no-explicit-any` warnings — type-strictness backlog, not defects) |
| Backend `nest build` | **0 errors** |
| Backend jest | **2,050/2,050 pass** (63 suites) |
| Backend ESLint | **0 problems** (1 unused import removed this round) |
| Prisma migrations | **9/9 well-formed** (`migrations:verify`) |
| Envelope-convention sweep | 0 `.data.data` double-unwraps, 0 raw-array misuse of the TransformInterceptor envelope |
| Cross-boundary null-contract sweep | **5 crash sites found → fixed** (§2) |

## 2. Defects found and fixed (the crash class behind "dashboard showed an error")

The backend `dashboard.service.ts` legitimately sends `value: null` on KPI points when a tenant has
no data in the 30-day window (fresh tenant — exactly the state right after first login), and live
driver rows can arrive without `lat/lng`. Several frontend render paths called `.toFixed()` on
those nulls → uncaught TypeError → ErrorBoundary "Something went wrong". One crash per widget is
how a single broken login turns into a console full of red ("100 errors").

| # | Site | Crash | Fix |
| --- | --- | --- | --- |
| 1 | `Dashboard.tsx` `formatKpiValue` | `kpi.value.toFixed(1)` on null KPI values (fresh-tenant dashboard) | null-safe: renders `—` / "no data yet"; `Kpi.value` type corrected to `number \| null` |
| 2 | `Dashboard.tsx` live-map card | `driver.lat.toFixed(4)` when driver has no coords (else-branch of ETA) | guarded: "Coords: pending fix" |
| 3 | `CreditControl.tsx` collection-rate meter | `metrics.collectionRate.toFixed(1)` | `?? 0` guard |
| 4 | `Invoices.tsx` collection-rate card | `metrics.collectionRate.toFixed(1)` | `?? 0` guard |
| 5 | `TrackingMap.tsx` popup | `driver.lat.toFixed(5)` | guarded, renders `—` |
| 6 | `CarrierManagement.tsx` rate row | `r.buyRate.toFixed(2)` | `Number(r.buyRate ?? 0)` |
| 7 | `backend/src/rail/rail.controller.ts` | lint warning: unused `UserRole` import | removed |

Regression coverage: `src/pages/platformSmoke.test.tsx` renders the tenant Dashboard against the
**exact production envelope shapes** — including the all-null KPI payload — and asserts zero
console errors and no ErrorBoundary fallback. The same suite asserts every round-73 deliverable
is visible in the UI (shutdown panel, Anx 18/22 tabs, Clearinghouse section, Ad hoc slots tab).

Swept and confirmed SAFE (already guarded): `DriversManagement` avgRating, `DepotsPage` coords,
`ElectronicPod` geo coords, `PerformanceTrends` delta (`Math.abs(null)` = 0), `AIRouteOptimization`
(optional-chained).

## 3. Environment findings (sandbox-only, NOT platform defects)

These blocked full local verification until worked around; they do not affect a normal
machine/CI/deploy where npm postinstall scripts and engine downloads work:

1. **bcrypt native build** needs Node headers; in allowlisted networks use
   `npx node-pre-gyp install --build-from-source --nodedir=/usr/local`.
2. **`prisma generate`** downloads engines from `binaries.prisma.sh`; when unreachable, generate
   with `PRISMA_QUERY_ENGINE_LIBRARY=/path/to/placeholder npx prisma generate` (types generate
   fine; the engine binary is only needed at DB runtime).
3. **Playwright e2e** (`e2e/`: auth, error-boundary, route-guards, onboarding, legal) needs
   browser binaries from the Playwright CDN — not installable in the locked-down sandbox. The
   vitest smoke suite is the in-sandbox equivalent.

## 4. What "100 errors" most likely was

1. The KPI/coords crash loop above: each dashboard re-render threw, ErrorBoundary caught, React
   retried — a cascade of console errors from one bad payload.
2. An unreachable API (backend down / wrong `VITE_API_URL`) — every fetch logs a console error;
   the dashboard now degrades gracefully (covered by the "metric failures" smoke test).
3. If the errors were seen on a **deployed tenant platform running `main`**: note that rounds
   65–73 live on `arena/a620a55a-flowops` behind **PR #448** (open) — the live platform sees none
   of the rail work or these fixes until the PR merges and deploys.

If the "100 errors" appeared on a specific page or screenshot (e.g. a diagnostics/observability
counter), name that page and it gets its own pass.

## 5. Known hardening backlog (declared, not defects)

- 1,613 `@typescript-eslint/no-explicit-any` warnings in `frontend/src` (type-strictness debt;
  0 errors).
- Playwright e2e not runnable in the sandbox (browsers unavailable) — run in CI.
- Ancillary/yard/marshalling rate values still future NS (E-TARIFF-01); SPRINT actuals; Annexure
  33 appended data file; Anx 1 2026/27 provisional shut schedule.

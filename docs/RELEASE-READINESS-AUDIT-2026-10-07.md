# FlowOps — Release-Readiness Audit (2026-10-07)

**Status: READY for production, subject to the live-VPS verification steps in §8.**

This audit was requested as a deep, end-to-end review of the platform ahead of a
merge + VPS pull. It covers: repository/commit hygiene (duplicates), navigation
and command surfaces (dead links), duplicate/orphaned code, the deploy
topology, database migrations, environment configuration, and the full local
validation suite (typecheck, lint, unit tests, production builds).

> **Boundary of this audit.** The sandbox running this audit has no SSH
> credentials or network route to the production VPS (`164.160.89.97`, see
> `deploy/README.md`), and outbound access is restricted to GitHub/npm/PyPI.
> Everything up to the VPS boundary was verified locally; the live VPS, the
> Cloudflare tunnel, the database contents, and the deployed version could not
> be inspected from here. §8 lists the exact commands to finish the pull on
> the VPS. This document is not a substitute for that live check.

---

## 1. Repository & commit hygiene (duplicates)

- The branch `arena/c21ccfb5-flowops` was created from `main` at `be1792d`.
  The clone is shallow (single commit), so no duplicate commits exist between
  the branch and `main`; `git status` was clean at the start of this audit.
- A previous audit session's working-tree changes (stale-link removal across
  six navigation/command files) were **not present** in the checkout when this
  audit started — the tree had been reset to `be1792d`. This audit therefore
  re-applied and extended that work (see §3) and commits it.
- No duplicate commits, no stashes, no divergent local branches.
- Duplicate *route paths*: none. The only repeated path, `/`, appears once in
  the public route tree and once as the index of the authenticated layout —
  different parents, not a duplicate. Intentional aliases (same component on
  two paths, e.g. `/routes` + `/route-optimizer`, `/whatsapp` +
  `/communications/whatsapp`, `/billing-batches` + `/billing/batches`,
  `/high-risk-queue` + `/security/high-risk`, `/ask` + `/copilot`,
  `/ai-control-tower` + `/ai/control-tower`, `/driver-dispatch` + `/dispatch`,
  `/billing/plans` + `/settings/billing`, `/last-mile` + `/subcontractors` +
  `/transport-operators`) were kept deliberately so existing bookmarks and deep
  links keep working.
- Duplicate *dependencies*: none in `frontend/`, `backend/`, or `driver-portal`
  `package.json` files.
- Duplicate *env keys*: none in `.env.example`, `.env.production.example`,
  `.env.local.example`, `.env.selfhosted.example`.
- Duplicate *i18n keys*: none in `frontend/src/i18n/locales/{en,af,xh,zu}.json`.
- Duplicate *file names* in `frontend/src` (e.g. two `ProtectedRoute.tsx`,
  two `SignaturePad.tsx`, two `InboxCorrection.tsx`): all resolved — see §4.

## 2. Live navigation audit (the surfaces users actually see)

The live authenticated shell is `frontend/src/components/layout/AppLayout.tsx`
(routes are mounted under it in `frontend/src/App.tsx`). Every one of its 70
sidebar destinations was checked against the real route table:

- **All 70 `to:` targets resolve to an active route.** No stale links in the
  live sidebar.
- **One duplicate found and removed:** the OPS section contained the
  "Drivers" item twice (both `to: "/drivers"`). The second copy
  ("Fleet CRUD, PINs, performance") was removed; the first
  ("Add drivers, PINs & fleet") is kept.

The driver portal (`driver-portal/`) was audited too: 4 routes
(`/login`, `/dashboard`, `/delivery/:id`, `/chat`), all backed by existing
pages, no stale links, no hardcoded localhost/127.0.0.1 in app code.

## 3. Stale links in legacy navigation/command surfaces (fixed)

Six navigation/command surfaces still advertised destinations that have **no
active route and no page component**: Book Shipment (`/customer-portal`),
Track Shipment (`/track-shipment`), Driver App (`/driver-app`), WhatsApp Hub
(`whatsapp-hub`), Production (`/production-processes`), Capacity Planning
(`/capacity-planning`), MRP System (`/mrp-system`), Location Analysis
(`/location-analysis`), Stock (`/stock`), Driver Requests (`/driver-requests`),
Deliveries (`/deliveries`), plus DashboardSidebar-only legacy paths
(`/workflows`, `/cost-tracker`, `/outlook`, `/cloud-storage`, `/supervisor`,
`/admin/tenant-settings`) and a folder-style duplicate command
(`operations/Dispatch`, `operations/Collections`).

Fixes applied (entries removed; nothing re-pointed at a placeholder):

| File | Change |
|---|---|
| `frontend/src/components/layout/navigation.ts` | Removed 11 stale entries; kept 10 route-backed entries |
| `frontend/src/components/AppSidebar.tsx` | Removed 10 stale entries + orphaned `Package` import |
| `frontend/src/components/DashboardSidebar.tsx` | Removed 16 stale path entries + 7 orphaned icon imports |
| `frontend/src/components/SidebarNavigation.tsx` | Removed 11 stale entries (incl. `AIWorkflow`) + orphaned `Package` import |
| `frontend/src/components/Sidebar/CustomerSidebar.tsx` | Removed 10 stale entries + orphaned `Package`/`Settings` imports |
| `frontend/src/components/CommandCenter.tsx` | Removed 5 dead commands (DriverApp, CustomerPortal, CapacityPlanning, MRPSystem, LocationAnalysis) + 2 duplicate folder-style commands |

Removed links do **not** mean the features are permanently retired — they
simply have no active route/page today. If any of these modules ship later,
their nav entries must be re-added together with the route.

**Important context:** `AppSidebar`, `DashboardSidebar`, `SidebarNavigation`,
`CustomerSidebar`, `layout/navigation.ts`, `FlowOpsLayout`, and
`CommandCenter` currently have **no importers** — they are not mounted in the
running app (the live shell is `AppLayout`). The cleanup above is therefore
hygiene for dead surfaces; the live sidebar needed only the duplicate fix.
`src/lib/nav.ts` (a third nav source, used only by the also-unmounted
`components/command/CommandPalette.tsx`) was audited and is already clean — all
of its paths resolve to active routes.

## 4. Duplicate/orphaned code (fixed)

Static import-graph analysis over all 360 frontend source files found ~85
orphaned files (no importers). Only the clear **duplicates** were removed;
the remaining orphans are dead code, not duplicates, and are listed as backlog
in §7.

Deleted (all verified unimported repo-wide, then re-verified by typecheck,
tests and production build):

| Deleted file | Why |
|---|---|
| `frontend/src/components/ProtectedRoute.tsx` | Outdated duplicate of `components/auth/ProtectedRoute.tsx` (the one `App.tsx` actually uses) |
| `frontend/src/components/SignaturePad.tsx` | Duplicate of `components/Delivery/SignaturePad.tsx` (the one `pages/Deliveries/DeliveryAction.tsx` uses) |
| `frontend/src/components/Inbox/InboxCorrection.tsx` | Orphan copy 1 of 2 of the same-named component |
| `frontend/src/pages/Inbox/InboxCorrection.tsx` | Orphan copy 2 of 2 (divergent duplicate) |
| `frontend/src/pages/Dispatch.tsx` | Unrouted placeholder page ("Wire real dispatch list here next") shadowing the real dispatch UI, which is `DriverDispatch` served at `/dispatch` and `/driver-dispatch` |

## 5. Deploy topology (fixed)

**Finding (release blocker from the previous audit, confirmed):** the root
`deploy.sh` selected `docker-compose.yml -f docker-compose.prod.yml`, which
publishes `127.0.0.1:8080`/`127.0.0.1:8081` for a host reverse proxy — a
different topology from the documented single-VPS production stack
(`deploy/VPS-RUNBOOK.md`: `docker-compose.yml -f deploy/docker-compose.vps.yml`,
tunnel-only, no host ports, cloudflared sidecar, validated backups). Running
`./deploy.sh` on the VPS would have fought the tunnel-only design, skipped the
pre-flight guards, never synced the schema, and probed the API on a host port
that the VPS overlay deliberately does not publish.

**Fix applied to `deploy.sh`:**

1. Compose selection now prefers `deploy/docker-compose.vps.yml` when present
   (the VPS topology), falling back to `docker-compose.prod.yml` only on hosts
   without the overlay.
2. Added `prisma migrate deploy` after the stack comes up (mirrors
   `deploy/vps-deploy.sh`; a deploy that doesn't sync the schema is not a
   working deploy). Failure aborts the deploy.
3. The API health probe now runs **inside** the api container
   (`$COMPOSE exec -T api … http://localhost:3000/health`) instead of assuming
   a host port, and the printed health line shows the real response.
4. Status output uses the selected compose invocation throughout and points to
   `deploy/vps-deploy.sh` for the full guarded VPS flow.

`deploy/vps-deploy.sh` itself was reviewed and is consistent (compose version
gate, tunnel-target guard, host-cloudflared guard, port-leak assertion,
migration, plan-limit pre-flight). Both scripts pass `bash -n`.

**Database migrations:** `backend/prisma/migrations/` exists and is versioned
(6 migrations: init, process-book/product-master, rail waves 2–4,
`migration_lock.toml`). The previous audit's "no versioned migrations"
finding is outdated. CI additionally gates on `npm run migrations:verify`.

## 6. Environment & configuration audit

- `.env.production.example` is production-correct: `APP_URL=https://app.flowop.work`,
  `CORS_ORIGINS`, `API_PUBLIC_URL`, and `VITE_API_URL=/api/v1` (relative,
  same-origin through the nginx proxy — the SPA resolves it against the
  browser origin at runtime).
- `frontend/src/lib/env.ts` centralises env access; the localhost fallbacks
  apply only when nothing is configured (local dev) and are documented as
  such. No baked-in localhost in production paths.
- `deploy/cloudflared/config.yml` targets Docker service names
  (`http://frontend:80`, `http://driver-portal:80`), consistent with the
  tunnel-only VPS overlay.
- `docker-compose.otel.yml` and the prometheus/otel configs are present for
  observability; the VPS overlay includes the validated `postgres-backup`
  service (6h cycle, 28-file retention, dump validated before it is kept).
- CI (`.github/workflows/ci.yml`) runs on PRs to any branch: compose-config
  guard (port-leak regression test), frontend typecheck + lint + unit tests +
  build, backend generate + migrations verify + tooling tests + unit tests
  against real Postgres/Redis services. `deploy.yml` is manual-only and
  refuses to run without a configured target — no accidental auto-deploys.

## 7. Validation results (all local checks green)

| Check | Result |
|---|---|
| Frontend TypeScript (`npx tsc --noEmit`) | **PASS** |
| Frontend ESLint (changed files) | **PASS — 0 errors** (30 pre-existing warnings) |
| Frontend unit tests (`vitest run`) | **PASS — 502/502 across 24 files** |
| Frontend production build (`vite build` + PWA) | **PASS** (167 precache entries) |
| Backend build (`nest build`) | **PASS** |
| Backend unit tests (`jest`) | **PASS — 1834/1834 across 50 suites** |
| `deploy.sh` / `deploy/vps-deploy.sh` syntax | **PASS** (`bash -n`) |
| CRLF-aware whitespace check | **PASS** (edited CRLF files keep their CRLF convention; no mixed-ending regressions) |
| Post-change re-verification of deleted files | **PASS** (tsc + tests + build confirm nothing referenced them) |

Notes:

- Backend `jest` prints the well-known "did not exit one second after the test
  run" open-handle warning (also present before this audit). It is a warning,
  not a failure; all 1834 tests pass.
- The sandbox cannot download Prisma engine binaries (binaries.prisma.sh is
  outside the allowed network set), so `prisma generate` was run locally with
  placeholder engine paths to produce the typed client for build/test
  validation. This affects **only this sandbox's local validation** — the
  generated client is in `node_modules` (not committed), and CI/VPS run
  `prisma generate` with full network access.
- Docker is not available in the sandbox, so `docker compose config` /
  `scripts/check-compose-ports.sh` could not be run locally; CI's compose job
  covers this on the PR.

## 8. Remaining items & boundaries

1. **Live VPS verification (blocked here, not by the code).** No SSH
   credentials/route to `164.160.89.97` exist in this environment. After the
   merge lands on `main`, finish the pull on the VPS:

   ```bash
   ssh root@164.160.89.97
   cd ~/FlowOps
   git checkout main && git pull --ff-only
   ./deploy/vps-deploy.sh          # pre-flight → build → migrate → health
   # or the lighter path: ./deploy.sh
   ```

   Then verify live: `https://app.flowop.work` (SPA loads, login works),
   `https://driver.flowop.work` (driver PWA), and
   `docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps`
   (all healthy, `cloudflared` + `postgres-backup` running, no `0.0.0.0`
   port bindings).
2. **Domain confirmation.** All deploy configs, docs, and this audit assume
   the production domain `flowop.work` (app/www/driver/api subdomains). If
   DNS or the tunnel ingress differs on the live account, the cloudflared
   ingress rules in `deploy/cloudflared/config.yml` and `CORS_ORIGINS` must be
   reconciled before go-live.
3. **Dead-code backlog (not blockers).** ~80 orphaned frontend files remain
   (unused shadcn `ui/*` primitives, legacy components such as
   `components/Sidebar.tsx`, `TopNav.tsx`, `WaybillDashboard.tsx`,
   `WhatsAppChat.tsx`, `ai/AIWorkflowDashboard.tsx`, `guards/AuthGuard.tsx`,
   `contexts/DriverAuthContext.tsx`, plus orphaned hooks/libs). They are
   unmounted, so they carry no runtime risk, but they should be scheduled for
   a dedicated dead-code removal pass — do not bulk-delete without checking
   dynamic imports and e2e specs.
4. **Unmounted command surfaces.** `FlowOpsLayout`/`CommandCenter`/
   `CommandPalette` are not mounted anywhere. If a Ctrl+K palette is wanted in
   the live app, mount it inside `AppLayout` and rewire `CommandCenter`'s
   legacy `base44.page` navigation to real router paths (its current
   `setPage` writes a property nothing reads). The stale commands are already
   cleaned (§3), so mounting it is now safe.
5. **Jest open-handle warning** — cosmetic; worth a `--detectOpenHandles` pass
   in a future hardening sprint.

## 9. Change summary (this audit)

- `frontend/src/components/layout/AppLayout.tsx` — removed duplicate "Drivers" nav item (live surface).
- `frontend/src/components/layout/navigation.ts` — stale links removed (11 entries).
- `frontend/src/components/AppSidebar.tsx` — stale links removed (10 entries + unused import).
- `frontend/src/components/DashboardSidebar.tsx` — stale links removed (16 entries + 7 unused icons).
- `frontend/src/components/SidebarNavigation.tsx` — stale links removed (11 entries + unused import).
- `frontend/src/components/Sidebar/CustomerSidebar.tsx` — stale links removed (10 entries + 2 unused imports).
- `frontend/src/components/CommandCenter.tsx` — dead commands removed (5 + 2 duplicate folder-style entries).
- Deleted duplicates/orphans: `components/ProtectedRoute.tsx`, `components/SignaturePad.tsx`, `components/Inbox/InboxCorrection.tsx`, `pages/Inbox/InboxCorrection.tsx`, `pages/Dispatch.tsx` (placeholder).
- `deploy.sh` — VPS-topology compose selection, `prisma migrate deploy` step, in-container health probe, corrected output.
- `docs/RELEASE-READINESS-AUDIT-2026-10-07.md` — this report.

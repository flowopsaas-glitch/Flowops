# FlowOps release-readiness audit

**Audit date:** 2026-10-07
**Scope:** repository evidence and non-destructive local checks only
**Conclusion:** **NOT READY**

This report does not certify a deployment. No live VPS connection, production
database, Cloudflare account, or authenticated GitHub session was available for
verification. Repository presence, a passing unit test, or a documented
procedure is not evidence that a feature or control is deployed or
production-approved.

Status values used below are only **PASS**, **FAIL**, **BLOCKED**, and
**UNKNOWN**.

## 1. Repository and release baseline

| Check | Status | Evidence |
|---|---|---|
| Repository path | PASS | `C:\Flowops.worktrees\github-connection-query` |
| Current branch and HEAD | PASS | Branch `fix/security/tar-cve`, HEAD `d421eeccef059cfbb17914932130bd210927fc35`; local `origin/fix/security/tar-cve` points at the same commit. |
| Working-tree isolation | FAIL | The tree is not release-clean: tracked edits, staged additions, and untracked implementation/tests are present. The staged `rail-source-check/` additions alone are 29 files and about 20,303 inserted lines; tracked unstaged changes span application, deployment, and rail code. These were preserved and not staged or discarded by this audit. |
| Cached `origin/main` relation | FAIL | Cached `origin/main` is `be1792dc45d3a580fac5a5a25820025176ac3d09`; `origin/main...HEAD` reports 10 commits only on main and 5 only on this branch. No fetch was done, so remote refs may be stale. |
| Arena-assigned branch | UNKNOWN | No authoritative branch assignment was available. The current branch name refers to a security/tar-CVE workstream. |
| Pull request / PR head / CI checks | BLOCKED | `gh` exists but is not authenticated (`gh auth login` required). PRs, live main, required-check policy, and Actions run status could not be queried. |
| Existing navigation cleanup | PASS | The six legacy destinations were removed from six legacy navigation/command surfaces in this worktree; those edits are uncommitted. The active `AppLayout.tsx` menu did not expose these destinations. |
| Six legacy feature pages | FAIL | The destinations still have no active routes/pages; removal is not implementation and does not establish permanent retirement. `frontend/src/generate-pages.js` still lists old slugs and can generate placeholder pages if invoked, but no package script or caller was found. It was not run. |
| F-1 through F-10 gates | UNKNOWN | No authoritative F-1…F-10 gate definition or gate matrix was located in the repository search. |

The navigation surfaces inspected were `frontend/src/App.tsx`,
`frontend/src/components/layout/AppLayout.tsx`,
`frontend/src/components/layout/navigation.ts`,
`frontend/src/components/AppSidebar.tsx`,
`frontend/src/components/DashboardSidebar.tsx`,
`frontend/src/components/SidebarNavigation.tsx`,
`frontend/src/components/Sidebar/CustomerSidebar.tsx`, and
`frontend/src/components/CommandCenter.tsx`. `AppLayout.tsx` is the active
signed-in menu. `SidebarNavigation.tsx` and `CustomerSidebar.tsx` have no
imports in the frontend source search; `FlowOpsLayout.tsx`, which hosts the
command palette, also has no frontend caller in that search. The six
destinations are absent from the active route inventory. `Dispatch.tsx`
contains an explicit empty-list/“wire real dispatch list here next” placeholder;
the actual `/dispatch` and `/driver-dispatch` route surfaces use
`DriverDispatch.tsx`.

The driver portal is a separately served web app (`driver-portal/`). The
`driver-mobile/` project is a Capacitor wrapper scaffold that expects a built
driver portal; it is not a separately implemented native workflow.

## 2. Local validation evidence

| Check | Status | Result |
|---|---|---|
| Frontend TypeScript | PASS | `cd frontend; .\node_modules\.bin\tsc.cmd -p tsconfig.app.json --noEmit` exited 0. |
| Frontend unit tests | PASS | `cd frontend; npm test -- --run`: 8 test files, 59 tests passed. |
| Frontend production build | PASS | `cd frontend; npm run build`: Vite production build exited 0. |
| Edited navigation lint | PASS | ESLint exited 0 with warnings. Warnings include existing accessibility issues in `AppSidebar.tsx` and `CommandCenter.tsx`, empty catches and a state-in-effect warning in `CommandCenter.tsx`, and unused imports in the legacy `DashboardSidebar.tsx`. |
| Backend production build | PASS | `cd backend; npm run build`: Nest build exited 0. |
| Backend unit tests | PASS | `cd backend; npm test -- --runInBand`: 13 suites, 95 tests passed. Jest warned one worker did not exit gracefully and was force-exited; investigate teardown before relying on this as a clean CI run. |
| Database-backed integration / E2E | BLOCKED | Not run: no isolated staging clone/test database was established for this audit. |
| Required GitHub CI checks | BLOCKED | Not queryable without GitHub CLI authentication. |

These checks run against this dirty local checkout. They do not certify the
whole repository, a clean release commit, production integrations, tenant
isolation across all endpoints, or the live VPS.

## 3. Capability and modality matrix

| Area | Status | Repository evidence and remaining gap |
|---|---|---|
| Shared tenant/org foundation | FAIL | `Company` is a tenant root; many services filter by `companyId`. User/RBAC and webhook/invoice tests exist. This is not an exhaustive isolation audit; some child rows inherit ownership through a parent, and no complete cross-endpoint tenant-isolation suite was evidenced. |
| Shared parties, products, facilities and equipment | FAIL | Client/carrier, cargo/inventory, warehouse/bin/siding, vehicle/driver and wagon records exist, but a normalized shared party/product/facility master and full lifecycle were not evidenced. |
| Shared shipments, status events and documents | FAIL | Shipment, waybill, rail-consignment, milestone, document and evidence models/services exist. Globally enforced transition rules, complete immutable audit coverage and end-to-end evidence reconciliation were not evidenced. |
| Road | FAIL | Implemented evidence includes waybill/driver assignment, route optimization, failed-delivery reasons, hub scans and ePOD with selected tenant/custody checks. The active dispatch route has a richer page, but `Dispatch.tsx` is a placeholder. Vehicle/trailer weight/volume capacity, complete fleet assignment, general signed custody transfers, exception/damage evidence, full invoice-to-POD linkage and DB/E2E tenant tests were not established. |
| Rail | FAIL | The repository contains rail consignment operations, Daily Handshake, a 33a-shaped timetable import/publish path, and handoff readiness/evidence schema/service. The current timetable tests cover parsing, tenant/shared scope and audit calls. There is no evidenced full controlled-source registry, 33b allocation workflow, operator access application/review/decision, executed agreement/conditions-precedent workflow, authoritative path-order integration, complete cancellation/replanning/clearinghouse, or verified pilot/AI restrictions. Handoff readiness lacks focused tests and full source-state reconciliation. Rail remains non-production. See `docs/rail-transnet-source-traceability.md`. |
| Sea | FAIL | Ocean shipment files have vessel/voyage/ports/ETA fields, container/seal/VGM data, an AIS-dependent tracking path, demurrage estimates, customs/DG fields, charges and documents. Carrier booking confirmation, issued B/L lifecycle, port/terminal cutoffs and event records, condition/damage workflow, and sea-specific custody handoff/tests were not evidenced. The SARS EDI submission endpoint is a workflow stub, not a verified live gateway. |
| Air | FAIL | AIR mode and heuristic air-cargo intelligence exist. No operational booking/capacity confirmation, persisted authorized AWB/HAWB lifecycle, air-handler custody, ULD build-up/acceptance events, verified airline/authority feed, air condition monitoring, or air-specific integration tests were evidenced. Generic `BOOKED` status, a generated AWB-like value, and predictions do not prove operational acceptance or issuance. |
| Production approval for any modality | FAIL | No staging-tested, deployed, or production-approved evidence was found for this audit. |

Supporting source files include `backend/prisma/schema.prisma`,
`backend/src/rail/rail.service.ts`, `backend/src/rail/rail-handshake.service.ts`,
`backend/src/rail/rail-timetable.service.ts`,
`backend/src/rail/rail-handoff.service.ts`,
`backend/src/dispatch/auto-dispatch.service.ts`,
`backend/src/epod/epod.service.ts`,
`backend/src/forwarding/shipment-file.service.ts`,
`backend/src/forwarding/air-cargo-intelligence.service.ts`, and the associated
frontend routes/pages. Implementation presence is not deployment evidence.

## 4. VPS and deployment audit

### Live VPS evidence

| Check | Status | Result |
|---|---|---|
| Authorized VPS target / read-only access | BLOCKED | No approved host/identity was supplied or discovered. SSH client availability alone is not access. No connection was attempted. |
| Host identity, OS, CPU, memory, disk | BLOCKED | Not inspected. |
| Docker/Compose versions, containers, health, images/digests, volumes/networks, restart policies and exposed ports | BLOCKED | Not inspected. Local Docker CLI is unavailable; no VPS commands were run. |
| Public routes/TLS/Cloudflare connectors/tunnel ownership | BLOCKED | Not inspected. No routes or tunnel settings were changed. |
| Database connectivity, size, schema, migration state, logs and storage | BLOCKED | Not inspected; no database commands were run. |
| Current deployed commit/image and repository-vs-host differences | BLOCKED | Not inspected. |
| Cron/systemd, local/off-box backups, latest successful backup, restore proof | BLOCKED | Not inspected. Repository scripts and instructions do not prove VPS installation, schedule, successful backup, or restore. |

### Repository deployment design

| Check | Status | Result |
|---|---|---|
| Compose topology agreement | FAIL | `deploy/vps-deploy.sh` selects `docker-compose.yml` plus `docker-compose.prod.yml`; the VPS-specific `deploy/docker-compose.vps.yml` is not selected by that script. The VPS override instead removes host port mappings and adds a Cloudflare tunnel/backup service. The documented bootstrap points a tunnel at localhost:8080, whereas the VPS override describes an in-network cloudflared sidecar. Do not choose or deploy a topology until the actual target architecture is confirmed. |
| Domain configurability | FAIL | The configured production domain has not been confirmed for this release. Deployment files contain `flowop.work` hosts; no domain/config was changed. |
| Database deployment process | FAIL | `backend/prisma/migrations/` is absent. The VPS script runs `prisma db push`; CI tries `prisma migrate deploy || prisma migrate dev`. No versioned migration baseline, reviewed rollback plan, or staging-clone rehearsal is evidenced. No schema change was applied. |
| Local backup configuration | UNKNOWN | Compose files define local periodic pg_dump containers, but no runtime status or successful current dump can be verified. |
| Off-box backups / restore proof | BLOCKED | `deploy/backup-to-r2.sh`, `deploy/restore-verify.sh`, and setup instructions exist. Their installation, cron/systemd schedules, R2 bucket state and credentials, recent success, retention, and restore results cannot be inspected without VPS access. |
| Deployment workflow | FAIL | `.github/workflows/deploy.yml` contains only a disabled/manual-deploy comment. No authenticated Actions state, protected environment, publication, approval, or rollback proof was available. |
| Compose syntax/config render | BLOCKED | Not validated locally: Docker is not installed in this audit environment. |

No production-mutating command, package update, service restart, pull, migration,
backup operation, tunnel change, firewall change, or deployment was performed.

**Literal-domain search inventory:** A repository-wide `rg` search for
`([A-Za-z0-9-]+\.)*flowop\.work` found 127 occurrences in 43 text files. These
include actual URL defaults, email addresses, documentation and demo content;
not every match is a URL or should be replaced. Deployment-related references
are concentrated in `deploy/ORACLE-MIGRATION.md`, `deploy/README.md`,
`deploy/VPS-RUNBOOK.md`, `deploy/cloudflared/config.yml`,
`deploy/docker-compose.vps.yml`, `deploy/feature-batch-deploy.sh`,
`deploy/oracle-setup.sh`, `deploy/setup-vps.sh`,
`deploy/vps-bootstrap.sh`, `deploy/vps-deploy.sh`, the root `deploy.sh`,
`docker-compose.yml`, and `.env.production.example`. Other source and document
matches are in:

- `backend/.env.example`, `backend/prisma/seed-demo-chf.js`,
  `backend/prisma/seed-demo-mishoma.js`, `backend/prisma/seed-demo-rail.js`,
  `backend/src/accounting-integrations/accounting-integrations.service.ts`,
  `backend/src/accounting-integrations/providers/sage.provider.ts`,
  `backend/src/accounting-integrations/providers/xero.provider.ts`,
  `backend/src/alerting/alerting.service.ts`, `backend/src/auth/auth.controller.ts`,
  `backend/src/dispatch/live-tracking-link.service.ts`,
  `backend/src/invoices/invoices.service.ts`, `backend/src/paystack/paystack.controller.ts`,
  `backend/src/paystack/paystack.service.ts`, `backend/src/push/push.service.ts`,
  `backend/src/returns/returns-portal.controller.ts`, `backend/src/support/support.service.ts`,
  `backend/src/waybills/label.service.ts`.
- `docs/FlowOps-Company-Portfolio.md`, `docs/TENANT_USER_MANUAL.md`,
  `docs/meeting-script-neville-chf.md`, `docs/rasa-rail-demo-talk-track.md`,
  `scripts/TENANT_USER_MANUAL.md`.
- `frontend/src/App.tsx`, `frontend/src/components/layout/PublicFooter.tsx`,
  `frontend/src/lib/env.ts`, `frontend/src/lib/integrity.ts`,
  `driver-mobile/README.md`, `driver-mobile/capacitor.config.ts`, and `SECURITY.md`.

## 5. Security, tenant, AI and audit controls

| Check | Status | Evidence |
|---|---|---|
| Selected tenant/RBAC controls | PASS | User service tenant-scoping tests, role guards, forwarding feature/role guards, and tenant-scoped rail timetable tests exist. |
| Exhaustive tenant isolation / RBAC | UNKNOWN | No cross-platform endpoint and relationship audit or full DB-backed adversarial test suite was run. |
| Complete mutation auditability | UNKNOWN | Audit models and selected audit calls exist; evidence does not establish durable audit on every consequential workflow. Forwarding milestone logging is best-effort. |
| AI restrictions in high-consequence workflows | UNKNOWN | No evidence establishes a platform-wide enforcement guarantee that AI is read-only/draft-only for rail, safety, capacity, finance, or dispatch actions. Keep such AI disabled or advisory pending explicit control evidence. |
| Security review | UNKNOWN | This was a release-readiness audit, not a dedicated security review. No vulnerability findings are asserted. |

## 6. Commit, PR and deployment gates

| Gate | Status | Required evidence/action |
|---|---|---|
| Isolate intended files from unrelated work | BLOCKED | The index contains a large rail-source dataset/workstream and multiple other dirty changes. Confirm ownership and intended inclusion file-by-file; do not stage or commit the entire tree. |
| Confirm Arena branch | BLOCKED | Obtain the authoritative assigned branch name. Do not switch branches until confirmed. |
| Commit/push | BLOCKED | No commit or push made. Current branch is divergent from cached `origin/main`, worktree is dirty, branch assignment is unknown, and GitHub CLI is unauthenticated. |
| PR review and CI | BLOCKED | Authenticate GitHub access through the approved environment; inspect PR head/base, required checks, and review before requesting merge. |
| Staging-clone rehearsal | BLOCKED | Provision/identify an isolated database clone and test deployment environment; establish backup/restore baseline and an accepted schema rehearsal. |
| Production go/no-go | BLOCKED | Requires exact merged SHA, immutable images, approved domain/topology, verified backups/restore, staging results, VPS read-only preflight, rollback plan, and explicit user approval. |

## 7. Ordered next actions

1. Confirm the release scope and intended Arena branch. Keep the current
   security, rail-source, and unrelated changes separated; create a clean
   reviewable change set without discarding any existing work.
2. Confirm the VPS host/identity using an approved secure mechanism and grant
   least-privilege read-only audit access. Do not send credentials in chat.
3. Confirm the intended VPS compose topology and public domain before changing
   deployment configuration.
4. Establish a versioned Prisma migration baseline and rehearsal/rollback
   procedure against an isolated staging clone. Do not run `db push` or
   migrations against production.
5. Prove local and off-box backup schedules and perform a restore test in an
   isolated database. Capture evidence without exposing secrets.
6. Complete modality acceptance criteria and close the high-consequence gaps:
   Road capacity/handover and E2E; Rail source/access/allocation/order evidence
   and handoff tests; Sea booking/B-L/terminal/custody workflow; Air booking,
   AWB/ULD/handler lifecycle. Keep Rail non-production and AI advisory until
   separately approved.
7. Add database-backed tenant/RBAC and workflow E2E tests, resolve relevant
   lint/accessibility warnings, run CI on the assigned branch, and inspect
   required PR checks.
8. Prepare a deployment pack for one exact merged commit and immutable images;
   stop for explicit go/no-go approval before any live change.

## 8. Changes made during this audit

- Removed the six un-routed legacy destinations from:
  `frontend/src/components/layout/navigation.ts`,
  `frontend/src/components/AppSidebar.tsx`,
  `frontend/src/components/DashboardSidebar.tsx`,
  `frontend/src/components/SidebarNavigation.tsx`,
  `frontend/src/components/Sidebar/CustomerSidebar.tsx`, and
  `frontend/src/components/CommandCenter.tsx`.
- These are local uncommitted edits only. No feature pages were built and no
  destination was declared permanently retired.
- No commit, push, PR creation/update, merge, database change or deployment was
  performed.

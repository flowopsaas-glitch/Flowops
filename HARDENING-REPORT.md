# FlowOps hardening — final report

## 1. Summary of changes

**Tenant isolation (#1)**
- `ShipmentsService.create/update`: rejects a `waybillId`/`driverId` that is not in the caller's company (previously accepted), and applies the compliance gate when a driver is assigned.
- `WaybillsService.assignDriver`: driver + shipment writes scoped by `companyId`; assignment is one transaction with a status compare-and-set.
- `WarehouseManagementService.createWave`: bin lookup scoped via zone→warehouse→company; pick orders claimed with a company+status guarded update (two waves can no longer claim the same order).
- `CollectionsService.confirmCollected` / `DriverPortalService.confirmCollection`: single transaction (collection CAS + waybill + custody shipment + tracking event), exact offline idempotency via the new `Waybill.sourceCollectionId`.
- `LogisticsOpsService` address book update/delete scoped by id AND company.
- Public tracking timeline now returns the journey only — no recipient name, address or coordinates on an unauthenticated route.
- Removed 4 unreferenced draft files from an earlier fix attempt that no longer compiled (fleet-compliance.guard, kpi-consistency.guard, epod-guard.service, rail-timetable-scoped.service).

**Owner auth (#2)**
- `OwnerAuthGuard` fails closed: requires `@OwnerOnly()`, refuses `@Public()`+owner combinations, validates the principal shape (tenant ADMIN tokens rejected) and rejects disabled accounts; `JwtAuthGuard` stands down for owner-only routes. Owner/Admin/Okr controllers converted.

**Dispatch integrity (#3)**
- `suggest()`/`rankCandidates()` are strictly read-only; `dispatch()` claims the waybill with a compare-and-set inside one transaction (waybill + shipment + audit event); a second/concurrent dispatch cannot re-assign; compliance policy applied to candidates; `batchDispatch` reports `successRate: null` for an empty batch.

**COD settlement (#4)**
- New `CodSettlementService`: tenant + driver-mapping + billing-evidence checks, CAS claim on `codCollected`, wallet credit + `CodTransaction` ledger row in one transaction, guarded settlement decrement (no overdraw under concurrency), and a `verifyConsistency` reconciliation helper. `CodService` delegates; controller settle/collect endpoints role-restricted.

**ePOD (#5)**
- `EpodService.capture`: custody check (assigned driver, or ops role on their behalf), lifecycle validation, CAS claim on `podDeliveredAt`, POD evidence + waybill + shipment + tracking event in ONE transaction; duplicate and concurrent captures → 409. Driver portal POD and linehaul confirmation delegate to the atomic paths.

**Driver compliance (#6)**
- One pure policy (`driver-compliance.policy.ts`) + `DriverComplianceService`: licence/insurance/background-check expiry, service date (blocks) and km (warns at 90%), compliance hold, active status, availability, unresolved CRITICAL safety alerts, and explicit "missing document" reporting. Enforced in auto-dispatch, manual assignment, routing, hub auto-reassign and driver suggestions.

**KPI consistency (#7)**
- `kpi-math.ts` / `KpiConsistencyService`: rates with no denominator return `null` (never 0%/100%), numerators clamped, averages bounded (0–720 h delivery, 0–30 d transit, ≤120 h dwell) with 5% tail trimming at 20+ samples, explicit time windows; dashboard KPI payloads carry `hasData`/`sampleSize`/`noDataNote`; rail `overview` uses the same rules.

**Logistics-ops transitions (#8)**
- Strict hub state machine (only `AT_ORIGIN_HUB`/`AT_DESTINATION_HUB` reachable here), illegal transitions rejected AND audited, CAS writes, serialised failed-attempt counting, auto-reassign only to compliant drivers with an explicit "awaiting manual dispatch" outcome.

**Rail handoff gating (#9)**
- `rail-handoff.policy.ts`: leg state machine, fingerprint-bound readiness approval, evidence checks (leg started, handler named, location recorded, PRICED tariff calculation, no load hold). New endpoints `GET …/handoff-readiness` and `POST …/handoff-readiness/approve`; `advanceLeg` refuses `HANDED_OVER` without current evidence + covering approval, audit rows record who approved which steps; illegal leg transitions are audited.

**Regression tests (#10)** — 7 new suites: owner-auth guard, compliance policy, COD settlement (double-credit + concurrency), ePOD (duplicate/concurrent capture), dispatch (read-only suggest, CAS under concurrency), KPI maths, hub transitions + address-book scoping.

**Follow-up round — the three deferred recommendations, closed end-to-end**

- **Strict transitions are now the default.** `waybill-status.machine.ts` rewritten: `WAYBILL_TRANSITION_MODE=strict|warn|off` (default **strict**), the legacy boolean `WAYBILL_STRICT_TRANSITIONS` still honoured (`true`→strict, `false`→warn), and an unknown value falls back to **strict** — never to "allow". An illegal transition is refused before any write and recorded as an audit row (`waybill.transition_rejected`: from / attempted / source / enforcement), from `waybills.update`, `waybills.batchScan`, `epod.capture` and the linehaul arrival. Two real state bugs surfaced while auditing the callers:
  - `FAILED_DELIVERY → DELIVERED` was missing from the table, so a parcel that failed its first attempt could not be signed for on the retry visit (ePOD lists `FAILED_DELIVERY` as capturable). Fixed, with a test.
  - the linehaul arrival used a **hand-written** status whitelist that also accepted `COLLECTED` and `OUT_FOR_DELIVERY` → `AT_DESTINATION_HUB` — two jumps the machine refuses. The whitelist is now derived (`legalPredecessorStatuses()`), parcels that cannot legally arrive are left untouched, reported to the driver (`waybillsSkipped` / `skippedWaybills`) and audited per parcel.
- **A status-regression window in geofence auto-advance is closed.** `checkGeofence` read the in-transit list once and then wrote `OUT_FOR_DELIVERY` with a blind `update`: a POD landing in between was dragged back, and the customer got a second "arriving today" message. It is now a compare-and-set on `status: 'IN_TRANSIT'`, and a lost race changes nothing and notifies nobody.
- **Document enforcement has an operating story.** New `compliance/drivers` API (`GET /` fleet report, `GET /:id`, `PATCH /:id` audited evidence, `PATCH /:id/hold` supervisory hold) so a tenant can backfill the dates the policy judges. `summary.documentCoveragePercentage` and `summary.readyToRequireDocuments` say exactly when it is safe to flip `DRIVER_REQUIRE_DOCUMENTS`. An empty body on the hold endpoint is a 400 (it used to read as "lift the hold").
- **Migrations verified on a real PostgreSQL engine.** All 7 migrations apply in order and build the committed datamodel exactly (145 tables / 2243 columns / 95 enums / 402 indexes / 150 FKs, **0 differences**) — see §3 and §5.

## 2. Files modified

New (production): `src/common/compliance/{driver-compliance.policy.ts,driver-compliance.service.ts,driver-compliance.controller.ts,compliance.module.ts}`, `src/common/kpi/{kpi-math.ts,kpi-consistency.service.ts,kpi.module.ts}`, `src/common/decorators/owner-only.decorator.ts`*, `src/cod/cod-settlement.service.ts`, `src/rail/rail-handoff.policy.ts`.
New (tests): `src/common/guards/owner-auth.guard.spec.ts`, `src/common/compliance/driver-compliance.policy.spec.ts`, `src/common/compliance/driver-compliance.service.spec.ts`, `src/common/kpi/kpi-math.spec.ts`, `src/cod/cod-settlement.service.spec.ts`, `src/epod/epod.service.spec.ts`, `src/dispatch/auto-dispatch.service.spec.ts`, `src/logistics-ops/logistics-ops.service.spec.ts`, `src/waybills/waybill-status.machine.spec.ts`.
New (migrations): `prisma/migrations/20261007090000_driver_compliance_fields/`, `prisma/migrations/20261007120000_waybill_source_collection/`.
Modified: app.module, cod/{controller,module,service,service.spec}, collections/{module,service}, common/guards/{jwt-auth,owner-auth}, dashboard/{module,service}, dispatch/{auto-dispatch.service,module}, driver-portal/{module,service,service.spec}, epod/epod.service, logistics-ops/{module,service}, okr/okr.controller, owner/owner.controller, rail/{controller,rail-audit,rail.service,rail.service.spec,dto/intermodal-leg.dto}, routing/{module,service}, shipments/{module,service}, warehouse-management.service, waybills/{module,service,waybill-status.machine,waybill-status.machine.spec}, prisma/schema.prisma, `backend/.env.example`, `docs/BACKEND.md`.
Deleted: cod-settlement.guard.ts, owner-auth.guard.fixed.ts, fleet-compliance.guard.ts, kpi-consistency.guard.ts, epod-guard.service.ts, rail-timetable-scoped.service.ts (all unreferenced).

## 3. Validation commands run

| Command | Result |
|---|---|
| `npx jest` | **59/59 suites, 2004/2004 tests pass** |
| `npx tsc --noEmit -p tsconfig.build.json` | clean |
| `npm run build` (nest build) | clean |
| `npx eslint "src/**/*.ts"` | clean (0 errors, 0 warnings) |
| `npm run schema:validate:offline` | ✓ valid |
| `node scripts/verify-migrations.mjs` | ✓ 7 migrations well-formed |
| `node ../docs/tools/verify-migrations-pglite.mjs` (PGlite = PostgreSQL compiled to WASM) | ✓ all 7 migrations applied in order; catalog vs datamodel **0 differences** (145 tables / 2243 columns / 95 enums) |
| `npm run rbac:test` | 7/7 pass |
| `npm run release:safety:test` | 40/40 pass |
| `node scripts/tenant-scope-audit.mjs --format json` | 329 findings across 120 service files: 224 guarded, 105 flagged (all inspected by hand — owner/platform scope, or guarded by a preceding company-scoped read) |

The PGlite run is the integration evidence for the schema: it applies every
migration to an empty PostgreSQL engine in order, step by step, and then compares
the resulting catalog against `schema.prisma` — tables, columns, types,
nullability, defaults, enum labels, primary keys, unique constraints, `@@index`
lists and foreign keys. It is able to fail (a dropped index, a changed column
type and an extra column were each reported when tried).

In CI (`.github/workflows/ci.yml`, Backend job — a real `postgres:16` service
container) the merged commit ran the whole chain green, which is the live-database
evidence this sandbox could not produce:

| CI step | Result |
|---|---|
| `npx prisma migrate deploy` (both new migrations, in order) | ✓ |
| Drift guard: `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code` (real Prisma engine + shadow DB) | ✓ no drift |
| `npm run lint`, `npm run build`, unit tests | ✓ |
| `npm run test:integration` (PostgreSQL) | ✓ |
| E2E tests | ✓ |

The sandbox itself has no PostgreSQL server and Prisma's engine binaries are
unreachable there, so the transaction/compare-and-set behaviour is covered by the
2004 unit tests (each modelling the losing race) plus the real-engine schema run
above and this CI evidence.

## 4. Remaining risks / follow-ups

1. **`WAYBILL_TRANSITION_MODE` — resolved.** Strict is the default; `warn`/`off`
   exist for a deliberate incident decision and are never reached by accident
   (an unrecognised value falls back to strict). Remove the legacy
   `WAYBILL_STRICT_TRANSITIONS` from your environment once you have confirmed
   `strict` behaviour in production — while it is set, it wins.
2. **`DRIVER_REQUIRE_DOCUMENTS` — still off by default, now with a safe way on.**
   Missing documents block dispatch only when the flag is on (expired/invalid
   documents, a compliance hold and an overdue service always block). Backfill
   through `PATCH /api/v1/compliance/drivers/:id`, then flip the flag when
   `GET /api/v1/compliance/drivers` reports `summary.readyToRequireDocuments:
   true`. Flipping it before backfilling will stop dispatch for undocumented
   drivers — that is the point, but it is a visible operational event, so do it
   tenant by tenant.
3. **Migrations — verified offline and on a real engine; the deploy step
   remains.** Apply in order (`npx prisma migrate deploy` applies
   `20261007090000_driver_compliance_fields` then
   `20261007120000_waybill_source_collection`), then re-run `npx prisma
   generate` so the client knows about the seven new `drivers` columns and
   `waybills.sourceCollectionId`. Both are strictly additive (nullable columns
   except `complianceHold`, which is `NOT NULL DEFAULT false` and backfills
   atomically) — the rollback is `DROP COLUMN` for the columns added. The
   offline Prisma stub used in this sandbox is a workaround, not a substitute
   for the real client.
4. **Wallet out-of-band movements** (refunds, manual credits) are still only
   `UserRole`-restricted; a dedicated `wallet ADJUSTMENT` flow with dual control
   is worth adding.
5. **Tenant-scope audit residue** — the scanner cannot see inline guards in
   `auth`, `owner`, `webhooks`, `process-control`, `fleet-maintenance`,
   `ai/platform-protection` and `alerting`. Every flagged line was read: they
   are owner/platform scope, self-generated webhook writes, or guarded by a
   preceding company-scoped read.
6. **Live-database validation — resolved in CI.** The authoring sandbox has no
   PostgreSQL server and Prisma's engine binaries are unreachable there, so the
   suite could not be run locally. On the merged commit, CI's Backend job ran
   `prisma migrate deploy`, the `migrate diff` drift guard and
   `npm run test:integration` against a real `postgres:16` container — all green.
   The PGlite run in §3 was the offline cross-check.
7. **Main's CI `Backend` job was already red before this merge** — it failed at
   the `Build` step on the base commit (the four unreferenced draft files that
   did not compile). It is green now. The one remaining red job on `main`,
   `Frontend Image (build & push)`, fails in its **GHCR publish preflight** with
   `HTTP 403` — a repository/package permission issue, not code: grant
   *Read and write permissions* under Settings → Actions → General → Workflow
   permissions (or the package's *Manage Actions access*), or set a `CR_PAT`
   secret with `Packages: write`.

## 5. Releasing this

```bash
# 1. backend env — the two switches (see backend/.env.example for comments)
WAYBILL_TRANSITION_MODE=strict     # default; warn/off only for an incident
DRIVER_REQUIRE_DOCUMENTS=false     # flip per tenant once documented

# 2. migrate, in order, then regenerate the client
cd backend
npx prisma migrate deploy          # 20261007090000 → 20261007120000
npx prisma generate

# 3. confirm the two new surfaces are live
GET   /api/v1/compliance/drivers                     # fleet report + coverage
GET   /api/v1/rail/consignments/:id/legs/:legId/handoff-readiness

# 4. watch the audit rail for the first day of strict mode
#    audit_logs.action IN ('waybill.transition_rejected','driver.compliance_evidence_updated')
```

Strict mode is intentionally noisy in `audit_logs` and quiet in the UI: a
refused transition is a real-world event worth a look, and the row carries the
attempted pair, the calling source and the enforcement mode.

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

## 2. Files modified

New (production): `src/common/compliance/{driver-compliance.policy.ts,driver-compliance.service.ts,compliance.module.ts}`, `src/common/kpi/{kpi-math.ts,kpi-consistency.service.ts,kpi.module.ts}`, `src/common/decorators/owner-only.decorator.ts`*, `src/cod/cod-settlement.service.ts`, `src/rail/rail-handoff.policy.ts`.
New (tests): `src/common/guards/owner-auth.guard.spec.ts`, `src/common/compliance/driver-compliance.policy.spec.ts`, `src/common/kpi/kpi-math.spec.ts`, `src/cod/cod-settlement.service.spec.ts`, `src/epod/epod.service.spec.ts`, `src/dispatch/auto-dispatch.service.spec.ts`, `src/logistics-ops/logistics-ops.service.spec.ts`.
New (migrations): `prisma/migrations/20261007090000_driver_compliance_fields/`, `prisma/migrations/20261007120000_waybill_source_collection/`.
Modified: app.module, cod/{controller,module,service,service.spec}, collections/{module,service}, common/guards/{jwt-auth,owner-auth}, dashboard/{module,service}, dispatch/{auto-dispatch.service,module}, driver-portal/{module,service,service.spec}, epod/epod.service, logistics-ops/{module,service}, okr/okr.controller, owner/owner.controller, rail/{controller,rail-audit,rail.service,rail.service.spec,dto/intermodal-leg.dto}, routing/{module,service}, shipments/{module,service}, warehouse-management.service, waybills/{module,service}, prisma/schema.prisma.
Deleted: cod-settlement.guard.ts, owner-auth.guard.fixed.ts, fleet-compliance.guard.ts, kpi-consistency.guard.ts, epod-guard.service.ts, rail-timetable-scoped.service.ts (all unreferenced).

## 3. Validation commands run

| Command | Result |
|---|---|
| `npx jest` | 57/57 suites, 1958/1958 tests pass |
| `npx tsc --noEmit -p tsconfig.build.json` | clean (was failing on 4 pre-existing files) |
| `npm run build` (nest build) | clean |
| `npx eslint "src/**/*.ts"` | clean (0 errors, 0 warnings) |
| `npm run schema:validate:offline` | ✓ valid |
| `node scripts/verify-migrations.mjs` | ✓ 7 migrations well-formed |
| `npm run rbac:test` | 7/7 pass |
| `npm run release:safety:test` | 40/40 pass |
| `node scripts/tenant-scope-audit.mjs --format summary` | 329 findings, 228 guarded, 101 unscoped (all verified: owner/platform scope or guarded by a preceding scoped read) |

## 4. Remaining risks / follow-ups

1. **`WAYBILL_STRICT_TRANSITIONS`** — the waybill state machine still logs illegal transitions by default; consider enabling strict mode now that callers have been audited.
2. **`DRIVER_REQUIRE_DOCUMENTS`** — missing licence/insurance/background-check blocks dispatch only when this env flag is on; enable after backfilling driver document dates.
3. **Schema changes** — two additive migrations were added (`driver_compliance_fields`, `waybill_source_collection`); they must be applied in order on deploy, and `prisma generate` re-run (the offline stub used here is a sandbox-only workaround).
4. **Manual settlement of PayPal/Paystack-style refunds and other out-of-band wallet movements** are still unrestricted beyond `UserRole`; a dedicated "wallet ADJUSTMENT" flow with dual control may be worth adding.
5. **Tenant-scope audit residue** — the tool cannot see inline guards in `auth`, `owner`, `webhooks`, `process-control`, `fleet-maintenance`, `ai/platform-protection` and `alerting`; each flagged line was checked by hand and is either owner/platform scope or guarded by a preceding company-scoped read.
6. **No integration DB run** — the sandbox has no Postgres, so the transaction/CAS behaviour is proven by unit tests against mocks plus schema validation, not by a live database run.

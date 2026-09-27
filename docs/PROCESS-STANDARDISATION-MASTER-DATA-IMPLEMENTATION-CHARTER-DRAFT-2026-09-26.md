# FlowOps Process Standardisation & Master Data — Implementation Charter (DRAFT)

**Status:** DRAFT — implementation in progress, non-production only
**Date:** 2026-09-26
**Scope:** Process Book (versioned SOPs), process execution, evidence, exceptions, outcomes,
controlled improvement, Product / Variant / SKU master data, safe automation, auditability.
**First vertical slice:** Warehouse goods receipt.

> This charter describes what is **designed and being built**, not what is production-ready.
> Nothing in this document authorises a production rollout. See §9 for the gates.

---

## 1. Why this exists

Logistics operators do not fail because they lack dashboards. They fail because:

1. **The standard lives in people's heads and in PDFs.** Two shifts run the same task two
   different ways, and nobody can prove which way was in force last Tuesday.
2. **Exceptions are not owned.** A short delivery is noted in a WhatsApp group and forgotten,
   so the same supplier shorts the same SKU next month.
3. **Master data is unmanaged.** The same physical item exists three times under three codes,
   so stock accuracy is unknowable and every report is arguable.
4. **Improvement is anecdotal.** "It feels slower" is not evidence; nobody can show that a
   change to the process made anything better or worse.

FlowOps addresses these with four linked capabilities:

```
Process Book (versioned standards)
  → Process execution (instances, steps, evidence)
    → Exceptions owned by a named role, with solutions
      → Measured outcomes (cycle time, first-time-right, recurrence)
        → Controlled change proposals → new immutable version
```

Master data (Product → Variant → SKU) is the second pillar: a receipt cannot be validated
against anything if the thing received has no governed identity.

---

## 2. Principles

1. **An approved standard is immutable.** A change becomes a *new version* plus a change
   proposal that references the outcome or incident that justified it. History is never
   rewritten.
2. **Every execution is a record.** Steps, evidence, who did what, when, and what it produced.
3. **Every exception has an owner and a resolution.** Blocking exceptions stop the process;
   non-blocking ones are recorded and tracked but do not freeze the operation.
4. **Outcomes are measured, not asserted.** First-time-right means *no incidents recorded*,
   including ones that were later resolved.
5. **Master data is approved, versioned and audited.** No silent edits to approved records.
6. **Tenant isolation everywhere.** Every query is scoped by `companyId`; business keys are
   tenant-unique.
7. **Identifiers are never reused.** A SKU issued to a variant is never re-issued to another,
   not after a rename, a delisting, or a deletion.
8. **Automation assists; humans decide.** A rule may raise an incident or notify a role.
   High-consequence actions require human confirmation.
9. **No blank rows for future stock.** A variant exists when somebody onboards it, not when a
   spreadsheet predicts it.
10. **Fail closed.** Feature flags default to off, and the capability refuses to run in
    production even if the flag is mistakenly set.

---

## 3. Domain model

### 3.1 Process Book

| Entity | Purpose | Key invariants |
| --- | --- | --- |
| `ProcessDefinition` | A standard, e.g. `WMS.GOODS_RECEIPT` | `@@unique([companyId, code])` |
| `ProcessVersion` | A numbered, hashed revision of that standard | `@@unique([definitionId, versionNumber])`; `contentHash` (SHA-256 over steps + rules); immutable once `APPROVED` |
| `ProcessStepDefinition` | Ordered step with evidence contract and validation rules | `@@unique([versionId, stepNumber])`, `@@unique([versionId, code])`; successors must exist |
| `ProcessAutomationRule` | Declarative trigger → action with guardrails | `maxRunsPerInstance`, `requiresHumanApproval` defaults to true |
| `ProcessInstance` | One execution of one version | `@@unique([companyId, businessKey])` — replays return the same instance |
| `ProcessStepInstance` | One execution of one step | `@@unique([instanceId, stepDefinitionId, attempt])` — rework loops are first-class |
| `ProcessIncident` | An exception found during execution | `isBlocking` ⇒ instance becomes `BLOCKED` until resolved |
| `ProcessSolution` | A proposed fix for an incident | `PROPOSED → APPROVED → IMPLEMENTED` |
| `ProcessOutcome` | The measured result of an execution | one per instance; `firstTimeRight`, duration, incident counts |
| `ProcessChangeProposal` | The only sanctioned route to changing a standard | approved by a manager/admin; references outcome or incident |
| `AutomationRun` | Audit of every automation execution | trigger data + result + error |
| `ProcessAuditEvent` | Immutable trail of every material change | includes `ACCESS_DENIED` refusals |

### 3.2 Master data

| Entity | Purpose | Key invariants |
| --- | --- | --- |
| `Product` | The commercial item | `@@unique([companyId, code])`; revision chain (`previousRevisionId`); fingerprint for duplicate detection |
| `ProductVariant` | The physical thing that carries stock | `@@unique([companyId, code])`, `@@unique([companyId, attributeFingerprint])`, `@@unique([companyId, sku])`; optimistic `revision` |
| `ProductAlias` | Barcode / supplier code / customer code resolution | `@@unique([companyId, type, value, supplierRef, customerRef])` |
| `SkuSequence` | Tenant-scoped allocator | one row per tenant; counter only moves forward |
| `MasterDataAuditEvent` | Immutable trail of master-data changes | includes `DUPLICATE_FINGERPRINT_BLOCKED`, `CONCURRENT_EDIT_REJECTED`, `ACCESS_DENIED` |

### 3.3 Lifecycles

```
Version:   DRAFT → PILOT → APPROVED → RETIRED
                  ↖_______|                 (pilot may return to draft for revision)

Instance:  IN_PROGRESS → BLOCKED → IN_PROGRESS → COMPLETED
                       ↘ ABANDONED / FAILED (terminal)

Product:   DRAFT → PENDING_APPROVAL → APPROVED → RETIRED
                                  ↘ REJECTED → (re-submit)

Variant:   DRAFT → PENDING_APPROVAL → APPROVED → RETIRED
             (approval requires the parent product to be APPROVED first)
```

---

## 4. The first vertical slice: goods receipt

```
Goods receipt (ASN booked)
  → Step 1 VERIFY_SKU       validate product / variant / SKU against governed master data
  → Step 2 INSPECT_QUANTITY count vs expected, record damage, capture evidence
  → Step 3 PUT_AWAY         good stock has a bin
  → Step 4 RECORD_OUTCOME   duration, incidents, first-time-right
```

**Reconciliation rules (pure policy, unit-tested):**

| Finding | Severity | Blocking | Rationale |
| --- | --- | --- | --- |
| Unknown SKU | BLOCKING | yes | stock must not be booked to unmanaged master data |
| Good units with no put-away bin | BLOCKING | yes | received-but-not-put-away stock is invisible stock |
| All received units damaged | CRITICAL | yes | nothing usable arrived |
| Some damaged units | MAJOR | no | quarantine them and keep receiving |
| Quantity variance beyond tolerance (default 2%, ±0 units) | MAJOR | no | record and recover, do not stop the dock |
| Receipt with no expected quantity recorded | not an exception | no | blaming the warehouse for our missing data creates exception fatigue |

**Pilot behaviour:** while `PROCESS_CONTROL_WMS_RECEIPT_ENFORCE=false` (the default) the
standard *observes and records*; blocking findings are raised as incidents but do not stop the
clerk. Enforcement is switched on only after the pilot shows the rules are right.

---

## 5. Feature flags

```bash
PROCESS_CONTROL_ENABLED=false                  # master switch — off by default
PROCESS_CONTROL_WMS_RECEIPT_ENABLED=false      # goods-receipt bridge — off by default
PROCESS_CONTROL_WMS_RECEIPT_ENFORCE=false      # observe-only pilot by default
PROCESS_CONTROL_PRODUCTION_ALLOWED=false       # production stays locked even if the above are set
PRODUCT_MASTER_ENABLED=false                   # defaults to PROCESS_CONTROL_ENABLED when unset
PRODUCT_MASTER_PRODUCTION_ALLOWED=false
```

The WMS bridge requires **both** `PROCESS_CONTROL_ENABLED` and
`PROCESS_CONTROL_WMS_RECEIPT_ENABLED`. In `NODE_ENV=production` the capability refuses to run
unless the corresponding `*_PRODUCTION_ALLOWED` flag is explicitly set by a human.

---

## 6. API surface (non-production)

**Process Control** — `/api/v1/process-control`

```
GET    /book                                  Process Book: standards + execution evidence
GET    /enabled                               is the capability switched on
GET    /definitions            POST /definitions
GET    /definitions/:id        POST /definitions/:id/versions
PATCH  /versions/:id/steps     POST /versions/:id/transition
GET    /instances              POST /instances            (idempotent on businessKey)
GET    /instances/:id          POST /instances/:id/steps/complete
POST   /instances/:id/outcome  POST /instances/:id/incidents
GET    /incidents              POST /incidents/:id/resolve
POST   /incidents/:id/solutions            POST /solutions/:id/resolve
POST   /definitions/:id/change-proposals   POST /change-proposals/:id/review
GET    /audit
```

**Product master** — `/api/v1/product-master`

```
GET    /enabled
GET    /products               POST /products
GET    /products/:id           PATCH /products/:id
POST   /products/:id/submit    POST /products/:id/approval
GET    /variants               POST /products/:id/variants
PATCH  /variants/:id           POST /variants/:id/approval
POST   /variants/:id/sku       (tenant-scoped, never-reused allocation)
POST   /aliases                PUT /aliases/:id/deactivate      GET /aliases/resolve
GET    /audit
```

**UI:** `/process-book` and `/product-master` (gated on the `warehouseManagement`
entitlement; both render an explicit "switched off" state when the flags are off).

---

## 7. Security & tenancy

- Every service method takes `companyId` from the authenticated token — never from a request body.
- Cross-tenant reads/writes return `NotFound` rather than leaking existence.
- Approval actions (standards, master data, change proposals) require a manager/admin role; a
  refused attempt writes an `ACCESS_DENIED` audit event.
- Automation may not silently execute high-consequence actions.
- The capability is fail-closed in production.

---

## 8. Honest status — 2026-09-26

| Area | State |
| --- | --- |
| Charter / design | **Substantially progressed** (this document) |
| Prisma schema | **Validated** both offline (WASM validator) and by the real Prisma toolchain in CI, where client generation, backend build, unit tests and E2E tests all pass. 133 models / 72 enums; the reviewed initial migration reconstructs it exactly (CI drift guard). |
| Backend modules | **Implemented, non-production** — builds clean; 148 tests across 6 suites (pure policy + service-level against an in-memory Prisma double) |
| Goods-receipt bridge | **Implemented, non-production, flags off** — not yet exercised against a live warehouse |
| Frontend pages | **Implemented** — type-check, build and unit tests pass |
| Database-backed integration tests | **Run and passing** — 43 tests, 4 suites, against real PostgreSQL (`npm run test:integration`); wired into CI on the native engine, runnable locally on the wasm engine, and run against the migrated database rather than a `db push`ed one. Coverage gaps are listed in the handoff doc §6.3b. |
| Migration | **Created, reviewed, rehearsed — not applied to any live database.** `20260926130650_init` comes from the pinned Prisma 5.22 toolchain in CI; `npm run migrations:review` classifies all 584 statements (no destructive operations, 133 models ↔ 133 tables); applied to a clean disposable database and the suite re-run against it. `migrations:verify` fails CI while the directory is empty, and a drift guard fails if migrations and `schema.prisma` disagree. |
| Production readiness | **Not achieved** |

---

## 9. Production gates (all must be true before enablement)

1. `prisma generate` runs in CI (network-capable environment) and the backend builds with it.
2. A reviewed migration exists, generated against a **disposable** database, with destructive
   statements explicitly reviewed; explicit backfill scripts for `InventoryItem.productVariantId`.
3. Database-backed integration tests pass, including:
   tenant isolation, approval ordering, concurrent SKU allocation, alias uniqueness, version
   lifecycle, instance idempotency, evidence gating, blocking incident flows, outcome rules,
   goods-receipt clean and exception paths, cross-tenant access, production flag denial.
4. Frontend build and tests pass.
5. One controlled non-production warehouse pilot completed, with measured cycle time, unknown-SKU
   rate, variance, damage rate, put-away time, exception recurrence, resolution time,
   first-time-right rate and stock accuracy.
6. Rollback plan exists and has been rehearsed (flags off restores previous behaviour).
7. An owner and an independent reviewer approve go/no-go.
8. No secrets, private keys or confidential source material are committed.

---

## 10. Anti-goals

- Not a document-management system: the value is evidence from real executions.
- Not an approval-bureaucracy engine: exceptions are recorded, not weaponised.
- Not a replacement for the WMS, the rail control systems, or any safety-critical system.
- Not "AI decides": automation drafts, humans confirm.

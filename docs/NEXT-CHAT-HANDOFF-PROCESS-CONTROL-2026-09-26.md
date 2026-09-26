# Next-chat handoff — Process Control, Master Data and the release programme

**Prepared:** 2026-09-26
**Repository:** `/home/user/Flowops`
**Working branch:** `arena/01a0dd70-flowops` (branched from `main` `c9fc648`)
**Production status:** Not production-ready. No deployment was performed. No migration was
created or applied. All feature flags remain `false`.

Read in this order:

1. `docs/PROCESS-STANDARDISATION-MASTER-DATA-IMPLEMENTATION-CHARTER-DRAFT-2026-09-26.md` — what
   the capability is, the invariants, the API, the production gates.
2. `docs/PROCESS-CONTROL-PHASE-A-STATUS-2026-09-26.md` — exactly what was built and verified in
   the last session, what was not, and the commands for the blocked steps.

---

## 1. Immediate objective

Keep building FlowOps as a multimodal logistics control plane with a reusable:

```
Process Book / versioned SOPs
+ process execution + evidence + exceptions + solutions
+ measured outcomes + controlled improvement
+ Product / Variant / SKU master data
+ safe automation + auditability
```

**First vertical slice:** goods receipt → product/variant/SKU validation → inspection →
exception handling → put-away → process outcome → SOP improvement evidence.

Based on Andreas Chourdakis's Process Theorem, Process Book, Proactive Forecasting and Proactive
Operations ideas. Do not claim the capability is production-complete because pages or endpoints
exist.

---

## 2. Repository/session rules

- Do not run `git reset --hard`, `git clean`, revert, delete or overwrite unrelated work.
- Inspect `git status` and `git diff` before editing; preserve existing security, Rail,
  address-resolution, deployment and frontend work.
- Do not deploy to the VPS. Do not restart the live host.
- Do not commit secrets, private keys, confidential PDFs or stakeholder source files.
- AI stays read-only/draft-only for high-consequence Rail and operational decisions.
- Do not use `npm audit fix --force`.
- Do not use `prisma db push` as a migration strategy; do not apply a migration to the live
  database.
- Work only on `arena/01a0dd70-flowops`.

---

## 3. State of the implementation

### Backend (implemented, non-production)

```
backend/src/process-control/   policy · dto · service · controller · module · 2 spec files
backend/src/product-master/    sku.policy · service · controller · module · 2 spec files
backend/src/warehouse-management/
                               goods-receipt.policy.ts (+spec)
                               goods-receipt-process.bridge.ts (+spec)   ← WMS ⇄ Process Book
backend/src/testing/fake-prisma.ts                      in-memory Prisma double
backend/scripts/prisma-validate-offline.mjs             offline schema validation
```

Process Control covers: definition creation, draft → pilot → approved → retired with an enforced
transition table, immutable approved versions with content hashes, step definitions with evidence
contracts and validation rules, idempotent instances on a tenant-unique business key, step
execution with evidence and role checks, blocking vs non-blocking incidents, solutions, measured
outcomes (`firstTimeRight`, duration, incident counts), change proposals with approval, and an
audit trail that also records `ACCESS_DENIED` refusals.

Product Master covers: products with revisions and duplicate fingerprints, variants with
normalised-attribute fingerprints (dedupe), tenant-scoped SKU allocation via
`SELECT … FOR UPDATE` (monotonic, never reused, idempotent per variant), aliases (barcode /
supplier / customer / legacy) with resolution, optimistic concurrency, ordered approval
(variant after product), and a master-data audit trail.

### Frontend (implemented)

`/process-book` and `/product-master` (lazy routes + nav entries), backed by
`src/api/processControl.ts` and `src/api/productMaster.ts`. Both pages render an explicit
"switched off" state when the capability flags are off, and neither invents a SKU client-side.

### Flags (unchanged, all off)

```bash
PROCESS_CONTROL_ENABLED=false
PROCESS_CONTROL_WMS_RECEIPT_ENABLED=false
PROCESS_CONTROL_WMS_RECEIPT_ENFORCE=false
PROCESS_CONTROL_PRODUCTION_ALLOWED=false
PRODUCT_MASTER_ENABLED=false
PRODUCT_MASTER_PRODUCTION_ALLOWED=false
```

---

## 4. Schema state

`backend/prisma/schema.prisma` is authoritative and was extended **additively** in this
workstream — no existing model, field or index was removed or renamed.

```
sha256: 458305ca9bbc1d707ada7d8d37a94be3d2747c637ca0dba048f34e126ff26a60
models: 137 (116 before this workstream)
```

New models: ProcessDefinition, ProcessVersion, ProcessStepDefinition, ProcessAutomationRule,
ProcessInstance, ProcessStepInstance, ProcessIncident, ProcessSolution, ProcessOutcome,
ProcessChangeProposal, AutomationRun, ProcessAuditEvent, Product, ProductVariant, ProductAlias,
SkuSequence, MasterDataAuditEvent. New optional links: `GoodsReceipt.processInstance`,
`InventoryItem.productVariantId`.

Do **not** hand-copy schema fragments between machines. Move the file, or re-apply the change
from this branch, and validate with `npm run schema:validate:offline` before generating a client.

---

## 5. Verification performed (and its limits)

| Check | Result |
| --- | --- |
| Offline schema validation (WASM `prisma-fmt`, the same parser `prisma validate` uses) | ✅ valid |
| Backend `nest build` | ✅ clean |
| Backend `jest` | ✅ 13 of 14 suites, 214 tests |
| Frontend `tsc --noEmit` | ✅ clean |
| Frontend `vite build` | ✅ built |
| Frontend `vitest run` | ✅ 8 files, 59 tests |
| `prisma generate` with real engines **in CI** | ✅ — CI run `36239977356` passed Generate Prisma client, Build, Lint, Unit tests, E2E tests (backend) and TypeScript check, Lint, Unit tests, Build (frontend) |
| `prisma generate` in this sandbox | ❌ blocked (`binaries.prisma.sh` unreachable; the placeholder-engine workaround is **for type-checking only** — see the status doc §2.2) |
| Database-backed integration tests | ✅ 34 tests, 3 suites, real PostgreSQL (`npm run test:integration`); also wired into CI |
| Schema applied to a real PostgreSQL | ✅ 133 tables (CI `db push`, and locally from the CI-generated DDL) |
| Migration generated/applied | ❌ not attempted, by design |

The service tests run against an in-memory Prisma double. They prove logic (tenant scoping,
idempotency, approval ordering, blocking behaviour, evidence gating, fingerprint dedupe, sequence
monotonicity, audit emission) — **not** real row locks, unique-constraint races or cascades.

Pre-existing environment issue, unrelated: `src/users/users.service.spec.ts` cannot load the
`bcrypt` native binding in this sandbox.

---

## 6. Next exact sequence

1. ~~Run the real Prisma toolchain~~ — **done**: `FlowOps CI` on PR #436 ran
   `prisma generate` with real engines and the backend built and tested against the generated
   client. Keep the CI job green; do not re-introduce the placeholder-engine workaround outside
   local iteration.
2. **Migration review.** `backend/prisma/migrations` does not exist — there is no committed
   migration history. Generate against a **disposable** database, review every statement for
   destructive operations, and write explicit backfill scripts for
   `InventoryItem.productVariantId` (link only after a duplicate/unknown review — never
   automatically). Do not backfill `GoodsReceipt.processInstanceId`. The reviewed SQL must also be
   rehearsed: apply it to a clean disposable database (`scripts/ephemeral-db.mjs sql <file>`) and
   re-run the integration suite against the migrated database, not a `db push`ed one. Then add the
   CI guard that fails while `prisma/migrations` is empty.
   *The generated DDL and the integration suite are already in place; what remains is the migration
   file itself, its review, and the rehearsal.*
3. ~~Database-backed integration tests~~ — **done** (34 tests, 3 suites; CI + local). They run
   against real PostgreSQL and already found four defects, all fixed: the `startInstance` insert
   race, put-away not linking `InventoryItem.productVariantId`, parallel approvals burning SKU
   numbers, and unknown SKUs slipping through when none of a receipt's codes were governed. The
   in-memory double stays for fast logic tests; the database suite is the one that proves locking,
   constraint and cascade behaviour.
3b. **Not yet covered by the database suite** — keep these on the list: alias uniqueness and
   resolution, `proposeSolution`/`reviewChange` end-to-end improvement flow, the `retry`/`attempt`
   path on step instances, cross-tenant access for warehouse and process reads, the production
   flag-denial assertions against a real database, and cascade behaviour when a tenant is deleted.
4. **Pilot.** One controlled non-production warehouse pilot with the bridge enabled and
   enforcement **off**. Review the incidents it raises — if the rules produce noise, fix the rules
   before switching enforcement on. Measure receipt cycle time, unknown-SKU rate, variance,
   damage rate, put-away time, exception recurrence, resolution time, first-time-right, SOP
   adherence, stock accuracy.
5. **Production gates** (charter §9): generated client in CI, reviewed migration, integration
   tests, frontend build/tests, P0 security remediation deployed, dependency plan, SSH key
   rotation, CI green, pilot evidence, owner + independent reviewer sign-off, rollback plan.
6. Keep every flag `false` until then.

---

## 7. Existing security work still relevant

Local/main-branch status for: public invoice XSS escaping/CSP; resource-bound portal tokens;
removal of the default approval password; AI DevOps production fail-closed policy; AI event
tenant-scope hardening. Still required: generated-client integration tests, deployment
verification, public endpoint abuse/cross-tenant tests, dependency remediation plan, SSH key
rotation, CI pass.

---

## 8. Honest status statement

```
Design:                         substantially progressed (charter)
Non-production implementation:  active (backend + frontend, flags off)
First warehouse vertical slice: implemented, not yet piloted
Schema:                         valid; client generation and migration not yet run here
Integration tests:              logic-level only
Production readiness:           not achieved
```

Do not claim "100 times better" as a verified market fact. The defensible advantage is built
from versioned standards + real execution data + evidence + exception ownership + measured
outcomes + safe automation + auditable master data + tenant isolation + human accountability.

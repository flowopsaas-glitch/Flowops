# Process Control — Phase A/B status and what remains (2026-09-26)

Companion to the charter: `docs/PROCESS-STANDARDISATION-MASTER-DATA-IMPLEMENTATION-CHARTER-DRAFT-2026-09-26.md`.

This file records exactly what was done in this session, what was **verified**, what was
**not**, and the next commands to run in a network-capable environment. It exists so the next
session does not have to guess.

---

## 1. What the previous session's blocker was, and the state found here

The prior handoff described a corrupted local schema copy and a sandbox that could not reach
`https://binaries.prisma.sh`, blocking `prisma validate` and `prisma generate`.

In this session the working tree was clean on `main` (`c9fc648`): the earlier session's local
work (backend modules, frontend pages, docs) was **not** present in this checkout, so the
Process Control / Product Master code was rebuilt from the handoff specification. The schema was
extended additively — no existing model, field or index was removed or renamed.

**Current schema hash**

```bash
sha256sum backend/prisma/schema.prisma
# 458305ca9bbc1d707ada7d8d37a94be3d2747c637ca0dba048f34e126ff26a60   (120 h -> 137 models*)
```

\* 137 model declarations total (116 before this work; 21 added by this workstream).

---

## 2. The Prisma blocker: worked around for validation, still open for migration

`binaries.prisma.sh` remains unreachable from the sandbox (TLS connection is dropped), and
`objects.githubusercontent.com`, `cdn.jsdelivr.net`, `unpkg.com` and `raw.githubusercontent.com`
are also blocked. Reachable: `registry.npmjs.org`, `pypi.org`, `github.com`, `api.github.com`.

Because of this the Prisma CLI cannot fetch `schema-engine` / `libquery_engine`.

### 2.1 Schema validation — SOLVED offline

The schema parser Prisma uses for `validate` (`prisma-fmt`) is published to npm as
`@prisma/prisma-schema-wasm`, and the version that matches this project's engine commit
(`605197351a3c8bdd595af2d2a9bc3025bca48ea2`) is available:

```bash
npm i -D @prisma/prisma-schema-wasm@5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2
npm run schema:validate:offline        # → ✓ prisma/schema.prisma is valid
```

`backend/scripts/prisma-validate-offline.mjs` performs a full semantic validation (relations,
missing back-relations, ambiguous relations, attribute arguments, enum usage). This is **the same
engine** `prisma validate` uses, but it is **not** a substitute for `prisma validate` /
`prisma generate` in CI, and it validates nothing about migrations or the database.

### 2.2 Client generation — WORKAROUND, engines are placeholders

`prisma generate` can be made to run by pointing the engine path variables at a placeholder
file, because generation itself uses the WASM parser and only *copies* the engine binary:

```bash
printf 'placeholder' > /tmp/dummy_engine.node
PRISMA_QUERY_ENGINE_LIBRARY=/tmp/dummy_engine.node \
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/dummy_engine.node \
PRISMA_QUERY_ENGINE_BINARY=/tmp/dummy_engine.node \
npx prisma generate
```

**This produces correct TypeScript types for building and testing, and a non-functional runtime
engine.** It must never be used for a deployed build. Type-checking and unit tests were run
against this generated client; a real `prisma generate` in a network-capable environment is
still required (production gate 1).

### 2.2b CI runs the real toolchain — the authoritative check for the schema

This branch is pushed and CI (`FlowOps CI`, run `36239977356`) passed every step:

| Job | Step | Result |
| --- | --- | --- |
| Backend | `npm ci` | ✅ |
| Backend | **Generate Prisma client** (real engines) | ✅ |
| Backend | Run migrations (`migrate deploy`, no migrations present → no-op) | ✅ |
| Backend | Lint | ✅ |
| Backend | Build | ✅ |
| Backend | Unit tests | ✅ |
| Backend | E2E tests | ✅ |
| Frontend | TypeScript check · Lint · Unit tests · Build | ✅ |

So the schema **does** validate and generate with the real Prisma toolchain, and the backend
builds and tests against that generated client. The sandbox limitation described in §2.2 only
affects local iteration; the placeholder-engine trick must never be used for anything else.

Note: "Run migrations" succeeding means *no migrations were found* — the migration gate below is
still open, and no schema was created anywhere by this workstream.

### 2.3 Migration — NOT DONE, deliberately

`backend/prisma/migrations` does not exist in this repository: there is **no committed migration
history**, and the live database was not touched. Per the charter, a migration must be generated
against a **disposable** database and reviewed before it goes anywhere near an environment with
real data.

Commands for a network-capable environment (do **not** run against the live database):

```bash
# 1. baseline: capture what the current production database actually looks like
npx prisma migrate diff \
  --from-url "$DISPOSABLE_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/review.sql      # review every statement before applying

# 2. on a disposable database only
createdb flowops_migration_review
DATABASE_URL=postgresql://…/flowops_migration_review npx prisma migrate dev --name process_control_product_master

# 3. review the generated SQL for destructive operations, then
DATABASE_URL=postgresql://…/flowops_migration_review npx prisma migrate deploy
```

Backfill decisions (still open, deliberately not automated):

- `InventoryItem.productVariantId` is **nullable** and is **not** back-filled. Existing stock rows
  are linked only after a duplicate/unknown review, by normalised SKU, in a reviewed script.
- `GoodsReceipt.processInstanceId` is **not** back-filled. Historical receipts legitimately have no
  process instance.
- `SkuSequence` starts at 1 per tenant and must never be seeded from existing free-text SKUs
  without an explicit, reviewed mapping.

---

## 3. What was implemented in this session

### Backend

```
backend/src/process-control/process-control.policy.ts        pure rules (lifecycle, evidence, rules, hashing, flags)
backend/src/process-control/process-control.policy.spec.ts
backend/src/process-control/process-control.dto.ts
backend/src/process-control/process-control.service.ts       definitions, versions, execution, incidents, outcomes, change control
backend/src/process-control/process-control.controller.ts
backend/src/process-control/process-control.module.ts
backend/src/process-control/process-control.service.spec.ts

backend/src/product-master/sku.policy.ts                     identity, fingerprints, SKU format, approval ordering, flags
backend/src/product-master/sku.policy.spec.ts
backend/src/product-master/product-master.service.ts         products, variants, SKU allocation, aliases, audit
backend/src/product-master/product-master.controller.ts
backend/src/product-master/product-master.module.ts
backend/src/product-master/product-master.service.spec.ts

backend/src/warehouse-management/goods-receipt.policy.ts     reconciliation rules
backend/src/warehouse-management/goods-receipt.policy.spec.ts
backend/src/warehouse-management/goods-receipt-process.bridge.ts   WMS ⇄ Process Book bridge
backend/src/warehouse-management/goods-receipt-process.bridge.spec.ts
backend/src/testing/fake-prisma.ts                           in-memory Prisma double for service tests
backend/scripts/prisma-validate-offline.mjs                  offline schema validation
```

Modified: `warehouse-management.service.ts` (two bridge hooks), `warehouse-management.module.ts`,
`app.module.ts` (module registration).

### Frontend

```
frontend/src/api/processControl.ts
frontend/src/api/productMaster.ts
frontend/src/pages/ProcessBookPage.tsx
frontend/src/pages/ProductMasterPage.tsx
```

Modified: `App.tsx` (two lazy routes), `components/layout/AppLayout.tsx` (two nav entries).

### Key behaviours worth reviewing

- **Idempotent execution.** `ProcessInstance.businessKey` is unique per tenant; starting the same
  event twice returns the same instance instead of duplicating work and evidence.
- **Immutable approvals.** An `APPROVED` version refuses step edits, and a content hash proves what
  was in force.
- **Blocking exceptions.** `BLOCKING`/`CRITICAL` incidents move the instance to `BLOCKED` and step
  completion is refused until a human resolves them; `MAJOR`/`MINOR` are recorded without stopping
  the line.
- **SKU allocation.** A tenant-scoped sequence row is locked with `SELECT … FOR UPDATE` inside a
  transaction; the counter only moves forward and a SKU is never re-issued. SKUs are allocated at
  variant approval, not at creation.
- **Duplicate master data is refused.** Variant identity is a SHA-256 over normalised attributes
  (`"Red"` = `"  red "`), and a collision is rejected with an audited reason.
- **Production is locked.** `NODE_ENV=production` refuses Process Control and Product Master unless
  a human sets the explicit `*_PRODUCTION_ALLOWED` flag.

---

## 4. Verification actually performed in this session

| Check | Result |
| --- | --- |
| `npm run schema:validate:offline` | ✅ schema valid |
| `npx nest build` (backend, whole app) | ✅ clean |
| `npx jest` (backend) | ✅ 13 of 14 suites, **214 tests pass** |
| — new capability suites | ✅ 6 suites, 148 tests |
| `npx tsc --noEmit` (frontend) | ✅ clean |
| `npx vite build` (frontend) | ✅ built |
| `npx vitest run` (frontend) | ✅ 8 files, 59 tests |
| `prisma generate` with real engines | ✅ in CI (run `36239977356`); ❌ blocked in the sandbox (see §2.2/§2.2b) |
| Schema applied to a real PostgreSQL | ✅ 133 tables created from the CI-generated DDL (and ✅ `prisma db push` in CI) |
| Database-backed integration tests | ✅ 34 tests, 3 suites — real PostgreSQL, real Prisma client |
| Migration generated/applied | ❌ not attempted (by design) |

Known environment-only failure, unrelated to this work: `src/users/users.service.spec.ts` fails
because the `bcrypt` native binding cannot be built — `node-pre-gyp` and `node-gyp` both need to
download prebuilds/headers from hosts the sandbox blocks. Every other backend suite passes.

---

## 5. What these tests do and do not prove

The service-level suites run against an in-memory Prisma double
(`backend/src/testing/fake-prisma.ts`). They prove the *logic* — tenant scoping of queries,
business-key idempotency, approval ordering, blocked-instance behaviour, evidence gating,
fingerprint deduplication, sequence monotonicity, audit emission.

They do **not** prove: real row-lock behaviour under concurrent connections, real unique-constraint
races, cascade/delete semantics, migration correctness, or anything about a real warehouse. Those
require the database-backed suite in the charter's gate list.

---

## 6. Next steps, in order

1. Keep the database-backed suite green in CI (native engine) *and* locally (wasm engine), and treat
   any failure of either as a blocker.
2. Generate and review the migration on a **disposable** database; inspect every statement for
   destructive operations; write the explicit backfill scripts; do not touch production data.
3. Add the CI guard that fails when `prisma/migrations` is empty, so the migration cannot be
   forgotten between the tested schema and the merge.
4. Rehearse the migration: apply the reviewed `migration.sql` to a clean disposable database
   (`scripts/ephemeral-db.mjs sql <file>`), then run the integration suite against the migrated
   database rather than a `db push`ed one.
5. Run one controlled non-production warehouse pilot with the bridge enabled and enforcement **off**;
   review the incidents it raises before considering enforcement.
6. Keep every flag false in production until the gates are signed off.

---

## 7. Database-backed integration suite (added after the first CI run)

`backend/test/integration/*.integration.spec.ts`, run with `npm run test:integration`
(`test/jest-integration.json`, serial execution). It drives the **real services** through the
**real Prisma client** against a **real PostgreSQL** — 34 tests, 3 suites:

* **Process control** — approved versions keep an immutable content hash and ordered steps; invalid
  lifecycle transitions and post-approval edits are refused; six concurrent starts on one business
  key produce exactly one instance; steps advance only through configured successors; blocking
  incidents stop completion until resolved; outcomes require every step and are recorded once; every
  material transition is audited.
* **Product master** — concurrent approvals allocate distinct sequential SKUs; the same variant
  approved concurrently keeps one SKU; duplicate normalised attributes are refused; a variant cannot
  be approved before its product; cross-tenant reads and writes are refused; master-data audit
  records are written.
* **Goods receipt** — a clean receipt walks the standard to completion and is recorded right first
  time; short shipment and damage are recorded as exceptions (the policy's severities, not
  "blocking"); all-damaged stock blocks; a receipt with no put-away is never closed out; known SKUs
  link to their variant; unknown SKUs stay controlled exceptions; one instance per receipt.

### Four defects the suite found, and how they were fixed

1. **`startInstance` could surface a unique-constraint error.** Two callers both passed the
   idempotency check and one then lost the insert race. The loser now returns the winner's instance,
   which is what "idempotent on the business key" promises a duplicated webhook or a double-tap.
2. **Put-away could not link governed master data.** SKUs were resolved *after* stock moved, so
   `InventoryItem.productVariantId` — the column added for exactly this — was never written.
   Resolution now happens before anything moves, and existing stock is linked when the variant
   becomes known (never re-pointed).
3. **Approving one variant twice in parallel burned SKU numbers.** `allocateSku` now re-reads the
   variant *inside* the sequence lock, so the second caller returns the SKU the first allocated.
4. **Unknown SKUs could slip through.** The "does this tenant govern SKUs?" test only looked at the
   SKUs on that receipt, so a receipt of entirely unknown codes was treated as ungoverned. It now
   checks whether the tenant has any allocated SKU, so unknown codes raise a blocking exception.

### How to run it locally (including offline)

```bash
# 1. a disposable PostgreSQL; the suite refuses any database whose name does not
#    end in _test/_ci/_ephemeral/_shadow, and refuses non-local hosts
export EPHEMERAL_DB=1
export EPHEMERAL_DB_URL='postgresql://user:pass@localhost:5432/flowops_test'

# 2. a schema. With network: `npx prisma db push`.
#    Offline: apply the DDL that CI generates (job "Schema SQL (review artifact)",
#    also published to the ci/schema-sql scratch branch):
node scripts/ephemeral-db.mjs reset
node scripts/ephemeral-db.mjs sql path/to/schema.sql

# 3. the suite
INTEGRATION_DATABASE_URL="$EPHEMERAL_DB_URL" npm run test:integration
```

The suite picks its engine automatically: the generated native library engine when present (CI and
production), otherwise the WebAssembly query engine over `@prisma/adapter-pg` (offline workstations,
where `binaries.prisma.sh` is unreachable). Both talk to real PostgreSQL; the engine used is printed
at the start of each suite.

**Still not proven:** the migration itself (none exists), the pilot, and anything about a real
warehouse. Local runs use the wasm engine transport, so a defect that lives only in the native
engine's transport would not appear locally — which is why CI runs the suite on the native engine as
well.

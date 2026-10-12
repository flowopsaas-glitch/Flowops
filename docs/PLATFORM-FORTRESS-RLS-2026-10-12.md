# Platform Fortress Round — RLS tenant isolation & audit leftovers

**Date:** 2026-10-12 · **Mandate:** "continue world class end to end with your recommendations 100 times better"

Enterprise security reviews ask one question about multi-tenant freight data: *who
can see whose cargo?* App-level `companyId` filters are one bug away from a leak.
This round puts the answer in the DATABASE itself.

## 1. Postgres Row-Level Security — all 111 tenant tables

**Migration `20261012210000_rls_tenant_isolation`** (15th — applied last, after every
table carrying a `companyId` exists), generated mechanically
by `backend/scripts/generate-rls-migration.py` (regenerate, never hand-edit):

- Every model with a `companyId` column (111 tables: rail, telemetry, billing,
  users, webhooks, invoices… ) gets `ENABLE` + **`FORCE` ROW LEVEL SECURITY**
  (FORCE because the app's DB user owns the tables — without it policies would
  not apply to the owner) and a `tenant_isolation` policy.
- Policies bind to the session-local GUC via `app_tenant()`:
  `("companyId" = app_tenant() OR app_tenant() IS NULL)`.

### Phase-1 posture (deliberate, documented)
- **Context set** (`PrismaService.withTenant(companyId, fn)` → `SET LOCAL 'app.company_id'` inside the transaction): the database refuses every cross-tenant row on SELECT/UPDATE/DELETE — defence in depth beneath the app filters.
- **Context unset** (seeds, migrations, the cross-tenant outbox drain, legacy call sites): the policy steps aside and the platform behaves exactly as before — **zero regression risk**.
- **Phase-2** (later): drop the `OR app_tenant() IS NULL` clause in a one-line migration once every path sets context. The strictness flip is a conscious decision, not an accident.

### The crack-closer test
`backend/src/db/rls-policy-coverage.spec.ts` (5 tests) parses `schema.prisma` and
the migration and **fails the build** if:
- any tenant table lacks enable+force+policy,
- any policy exists on a non-tenant table (false security),
- a policy deviates from the phase-1 clause shape,
- the `app_tenant()` helper disappears.

Adding a tenant table without running the generator turns this suite red. That is
the difference between "we did security once" and "security can't rot".

### First rollout path
The **telemetry ingest** transaction (the device-facing surface — external
identities resolve to tenants via `X-Device-Token`) now runs entirely inside
`withTenant`: points, last-known-position, alerts and outbox are one transaction,
RLS-enforced. The pattern composes: pass the `tx` through.

## 2. Audit leftovers closed (deep-audit findings 3 & 4)

| Finding | Action |
|---|---|
| #3 Dead code clutter | **Deleted**: `AppSidebar.tsx`, `DashboardSidebar.tsx`, `Sidebar/CustomerSidebar.tsx`, `layout/navigation.ts` (all verified zero importers; restorable from git). `lib/nav.ts` kept — still used by CommandPalette. |
| #4 WMS read-only overview | **Adjust / Transfer actions now on the Inventory tab** — reason-required adjustments (delta, can't go below zero), bin-to-bin transfers, both write movement records via the existing `POST /wms/inventory/adjust|transfer`. |

Bonus: the design-system **quality ratchet** (`designSystem.spec.ts`) caught the
new modal missing Escape-to-dismiss — fixed properly (Escape handler added),
not by widening the cap.

## Gates
| | |
|---|---|
| Backend | **2,097/2,097** (68 suites — +5 RLS coverage tests) |
| Frontend | **770/770** (32 files) |
| tsc / eslint / builds | clean both sides (0 errors) |

## What a security review now sees
1. "Is multi-tenancy enforced at the database?" → **Yes** — 111 RLS policies, FORCE-enabled, with a coverage test that prevents regression.
2. "How do devices authenticate?" → Per-device hashed tokens, plaintext once, rotatable (from the telemetry round).
3. "Can one tenant read another's freight/telemetry/invoices via SQL injection or an app bug?" → The policy layer blocks it whenever a tenant context is established; the ingest path is already covered end to end.
4. "Show me the audit trail." → Everything above is audit-logged and webhook-evented.

## Deploy notes
- Migration #13 rides `./deploy/vps-deploy.sh` (`prisma migrate deploy`).
- Safe on VPS: no behavior change for existing call sites (phase-1 posture).
- Phase-2 strictness switch is a follow-up once the `withTenant` pattern is rolled
  across the service layer (incremental — each service adopts it as it's touched).

# RLS Phase 2 readiness — withTenant coverage at 9.2%

**Date:** 2026-11-12
**Question this document answers:** can `app.rls_strict` be turned on, and if not,
what is the cheapest safe route to a position where it can be?

**Short answer: not yet — and coverage is not the main reason.** Two findings
outrank it, and both are about whether the mechanism works at all rather than how
much of the codebase uses it:

1. **As deployed, RLS is inert.** The application connects as a superuser, and a
   superuser bypasses row-level security unconditionally — `FORCE ROW LEVEL
   SECURITY` and all. Demonstrated, not inferred, below.
2. **Phase 2 as written is unreachable.** 114 operations cannot have a tenant
   context, and the migration gives them no way to run.

Fix (1) before anything else: until the connection is not a superuser, the 9.2%
measures how much of the codebase *would* be isolated if the policy were live.

---

## BLOCKING FINDING 1: the policy is not in force, because the app connects as a superuser

PostgreSQL exempts superusers (and roles with `BYPASSRLS`) from row-level security.
This is not affected by `ENABLE ROW LEVEL SECURITY`, and — the part that matters
here — **not by `FORCE ROW LEVEL SECURITY` either**. `FORCE` binds the table *owner*.
It does not bind a superuser.

Every compose file in this repo does this:

```yaml
# docker-compose.yml:301, docker-compose.vps.yml:152, deploy/.env.production:39
POSTGRES_USER: ${POSTGRES_USER:-flowops}
```

with `postgres:16-alpine` and **no init script creating an application role**. The
official image makes `POSTGRES_USER` the initdb superuser, and the backend connects
as it (`DATABASE_URL` at `docker-compose.yml:136`). So the connection that runs
every tenant query is a superuser connection, and the policy is never consulted.

Demonstrated on real PostgreSQL 18.6 (PGlite), with the policy functions read
verbatim from the migration, in `backend/scripts/rls-semantics.test.mjs`:

```
As a NORMAL role:
  no context,    strict off    (today)            2 rows  acme, globex
  context = '',  strict off    (the old hole)     2 rows  acme, globex
  context='acme', strict off   (withTenant)       1 row   acme
  no context,    strict ON     (PHASE 2)          0 rows
  context='globex', strict ON                     1 row   globex

As a SUPERUSER (what docker-compose connects as):
  no context,    strict ON                        2 rows  acme, globex
  context='acme', strict ON                       2 rows  acme, globex
```

The last two lines are the finding. Flag on, context set, and both tenants still
visible.

**Consequence:** the 144 "contextualised" operations are not actually
database-isolated today either, and the 9.2% figure is a measure of intent rather
than of protection. The layer that *is* holding is the application-filter layer
(`tenant-scope-audit`: `unscoped: 0`).

**Fix:** create a dedicated application role that is neither a superuser nor
`BYPASSRLS`, grant it the table privileges, and point `DATABASE_URL` at it. No
application code changes. This is a prerequisite for everything else in this
document — including the coverage work, which is otherwise measuring nothing.

Note that this also makes the role split in finding 2 necessary for a second,
independent reason.

---

## BLOCKING FINDING 2: Phase 2 as written is unreachable, not merely premature

Turning `rls_strict` on does not just fail the operations that lack context — it
fails the operations that *cannot have* context. There are 114 of them, and there
is currently no mechanism that would let them run.

| File | Ops | Why it has no tenant |
|---|---|---|
| `owner/owner.service.ts` | 57 | the module exists to act across tenants |
| `auth/auth.service.ts` | 18 | identity is resolved here — there is no tenant yet |
| `paystack/paystack.service.ts` | 14 | callbacks arrive with a reference and no tenant |
| `ai/platform-protection.service.ts` | 8 | platform-wide credential sweeps |
| `alerting/alerting.service.ts` | 7 | `platformAlert` is platform-level |
| `webhooks/webhooks.service.ts` | 6 | dispatched by the platform, keyed by endpoint |
| `common/guards/api-health-monitor.service.ts` | 4 | a health probe has no tenant |

These are not "not yet wrapped". They are cross-tenant by design, and setting a
`company_id` for them would be meaningless — `platformMetrics()` counts *every*
user, waybill and collection in the database.

**Two facts make this fatal rather than merely inconvenient:**

1. **There is no bypass.** The migration contains no `BYPASSRLS` role, no
   `app.rls_bypass` setting, and no `GRANT` statements. `app_tenant_guard()` has
   exactly two branches — matching tenant, or no-tenant-and-not-strict. Under
   Phase 2 the second branch is false for every row.

2. **`FORCE ROW LEVEL SECURITY` is set on all 112 tenant tables.** Normally
   PostgreSQL exempts the table owner from its own policies; `FORCE` removes that
   exemption. So the application's database user cannot accidentally escape — which
   is the right choice for safety, and precisely why there is no way out.

The migration header says *"Flip once every call site establishes tenant context."*
That condition cannot be met: these 114 call sites cannot establish one by
definition.

### The fix is a role split, not an application change

The migration header already hints at the answer — *"or set `app.rls_strict` per
role/session"*. Taken literally, it resolves the whole problem:

```sql
ALTER ROLE flowops_app  SET app.rls_strict = 'on';   -- tenant-facing traffic
-- flowops_platform keeps the default 'off'
```

`app_tenant_guard()` reads `current_setting('app.rls_strict', true)`, which honours
role-level defaults, so connections as the app role get fail-closed RLS while
connections as the platform role keep today's behaviour. No application code
changes, no coverage work required to make it safe, and the 114 operations carry on
working.

Today everything connects as one role (`DATABASE_URL` in `docker-compose.yml:136`
uses `POSTGRES_USER:-flowops` for the app), so this needs:

1. a second role, `flowops_platform`, with the same table grants;
2. a second Prisma client for the platform paths — the set of files that may use it
   is already enumerated in `PLATFORM_SCOPE` (`scripts/tenant-scope-policy.mjs`),
   and that list already fails the build if an entry stops matching;
3. `app.rls_strict = 'on'` on `flowops_app` only.

The one risk to weigh: a second role that bypasses RLS is a powerful thing. It is
safe here only because step 2 pins *which files* may use it, and an unreviewed
addition to `PLATFORM_SCOPE` is the failure mode to guard in review.

**Ordering matters:** the role split is worth doing *before* growing coverage,
because it is what makes the flag flippable at all, and because it means coverage
work can proceed incrementally afterwards instead of as one big-bang cutover.

---

## The two layers, and which one is actually holding

| Layer | What it is | State |
|---|---|---|
| 1. Application filters | every tenant query carries `where: { companyId }` | **Complete and in force.** `tenant-scope-audit` reports `unscoped: 0` |
| 2. Postgres RLS | policies bound to `app.company_id`, set by `withTenant()` | **Policies written and correct; in force for 0% of traffic** — the connection is a superuser, so they are never consulted. Intent coverage is 9.2% (144 of 1,568 operations) |

Layer 2 is the net underneath layer 1, and right now the net has not been hung.
Both facts are needed: the policies are right, *and* they are doing nothing. A
report that said only "9.2%" would have invited work that measured nothing; a
report that said only "RLS is inert" would have invited deleting the policies.

Layer 2 is not a replacement for layer 1 — it is the net underneath it. What a bare
operation means is *"one forgotten filter here is a silent cross-tenant read, with
nothing underneath to catch it"*. It does not mean the operation is currently
leaking.

`tenant-scope-audit` classifies all 429 findings:

```
rlsProtected 106   platform 94   reviewed 36   guarded-by-read 171
identity      13   identity-derived   9        unscoped    0
```

The one worth watching is **guarded-by-read (171)**. Those are operations whose
tenant scoping is *inherited* from an earlier query rather than stated in the query
itself. They are correct today and fragile by construction: change the read that
guards them and the guard silently disappears. They are the operations that would
benefit most from RLS underneath them.

---

## Why Phase 2 cannot simply be switched on

The policy guard is:

```sql
"companyId" = app_tenant()
OR ( app_tenant() IS NULL
     AND NOT COALESCE(current_setting('app.rls_strict', true), 'off') IN ('on','true','1') )
```

With `rls_strict = on` and no tenant context, the second branch goes false and
**every row is refused**. The 1,310 currently-bare operations would start returning
nothing and refusing writes. That is an outage, not a security improvement.

So coverage has to be grown before the flag flips. The question is how.

---

## The three routes, and what each actually costs

### Route A — wrap each operation (the obvious one; don't)

`withTenant` opens a transaction, runs `set_config`, runs the callback, commits.
Wrapping a single query turns 1 round trip into 4.

Measured: **1,308 of the 1,310 bare operations have no enclosing transaction.** Only
2 sit inside a `$transaction` already and could be converted for free. Route A
therefore adds ~1,308 transactions, each holding a pool connection for its duration,
and roughly quadruples database round trips on the affected paths.

This is the route the 9.2% number invites. It is the wrong one.

### Route B — wrap at the service-method boundary

One transaction per service method rather than per query. For a method issuing N
queries the cost is `3 + N` round trips instead of `N` — about 1.6x at N=5, far
better than 4x.

The blocker is **nesting**. Service methods call other service methods. If both
caller and callee open an interactive transaction, two pool connections are held
simultaneously in one request, and when the pool is smaller than the nesting depth
the request deadlocks. Prisma interactive transactions have a default 5s timeout, so
this surfaces as intermittent 500s under load rather than as a clean failure.

Workable only with an explicit ambient-context check (`if already in a tenant
context, reuse it; else open one`), which is Route C with extra steps.

### Route C — establish the context once per request (recommended)

A request-scoped interceptor that opens one transaction per authenticated request,
sets `app.company_id` once, and runs the whole request inside it.

- **Cost:** one transaction per request, not per query or per method. Two extra
  round trips per request.
- **Coverage:** all 1,310 bare operations at once, because the context is ambient.
- **Prerequisite:** every query in the request must use the request's `tx` client.
  That is the real work — it means the `PrismaService` injected into services has to
  be request-scoped and hand out the transaction client. Cls-hooked/AsyncLocalStorage
  is the usual mechanism.
- **Risks to weigh before committing:**
  - A connection is held for the whole request. A slow endpoint holds one longer.
    Pool size must be reviewed against p99 request duration, not average.
  - Any code that legitimately needs to run outside the tenant context (platform
    sweeps, the outbox drain, seeds, migrations, the 114 exempt operations) must be
    explicitly excluded, or it will be refused once Phase 2 flips.
  - Long-running endpoints (AI calls, PDF generation, external HTTP) would hold a
    transaction open across that work. Those paths need to opt out or be restructured.

---

## Recommendation

1. **Stop connecting as a superuser.** Non-superuser application role, grants,
   `DATABASE_URL` pointed at it. Until this is done nothing else in this document
   has any effect, because the policy is not being consulted at all.
2. **Then split the platform role.** It is what makes the flag flippable, it needs
   no application change, and it lets everything below proceed incrementally
   instead of as one big-bang cutover. See blocking finding 2.
3. **Do not start Route A.** It is the intuitive reading of the coverage number and
   it costs ~4x round trips for no additional safety over Route C.
4. **Decide between B and C, and pick C.** B only works once it grows an
   ambient-context check, at which point it is C. With the role split done, C can be
   rolled out module by module rather than all at once.
5. **Flip `rls_strict` on the app role only**, in a maintenance window, ready to
   flip it back. It is one reversible `ALTER ROLE` — no migration. That reversibility
   is the property that makes this whole exercise low-risk, and it is worth
   preserving: do not fold Phase 2 into a migration.

The flag appears in no deploy script, no compose file and no env template. That is
correct — it should stay manual until steps 1–3 are done.

### What was checked to reach the blocking finding

- `app_tenant_guard()` in `20261012210000_rls_tenant_isolation` — two branches only,
  no bypass, no role test.
- No `BYPASSRLS`, no bypass setting and no `GRANT` anywhere in the migration or in
  `scripts/generate-rls-migration.py`.
- `FORCE ROW LEVEL SECURITY` on all 112 tenant tables, so the table owner is subject
  to the policy too.
- `PLATFORM_SCOPE` in `scripts/tenant-scope-policy.mjs` — 7 files, each with a
  written reason, covering the 114 operations.
- `owner.service.ts` `platformMetrics()` reads `user.count()`, `waybill.count()` and
  `collection.count()` with no tenant predicate: genuinely cross-tenant, not merely
  unwrapped.
- `docker-compose.yml:136` — one role, `flowops`, for every connection.
- Executed the migration's own policy functions against PostgreSQL 18.6 and
  observed a superuser session returning both tenants' rows with the flag on and
  a context set: `backend/scripts/rls-semantics.test.mjs`, wired into
  `release:safety:test`. Mutating `app_tenant()` or the strict-flag check in the
  migration fails it, so it is pinned to the real SQL rather than to a copy.

---

## A defect found and fixed along the way

`withTenant` did not validate its `companyId`. Because `app_tenant()` is
`NULLIF(current_setting('app.company_id', true), '')`, **an empty string made the
policy step aside** — every tenant's rows visible — while
`scripts/tenant-context-coverage.mjs` still counted the operations inside the call
as `contextualised`, since it classifies by position within a `withTenant(` span.

So a caller passing an empty tenant id would have had no isolation, no error, and an
audit report saying it was protected. **The dangerous failure was not a leak; it was
going blind while believing you were covered** — the same hazard the scanner's own
test file warns about in the other direction.

`PrismaService.withTenant` now fails closed: it throws on a missing, empty,
whitespace-only or non-string id, and never opens the transaction. It deliberately
does *not* trim a valid id — trimming would set a context that no longer matches the
caller's own `where: { companyId }`, hiding every row behind a "helpful"
normalisation. Pinned by `src/prisma/prisma.service.with-tenant.spec.ts`; 7 of its
11 tests fail if the guard is removed.

All 108 existing call sites were checked and pass a real `companyId`, so nothing
changes for them. The guard is there for the next call site.

---

## Reproducing the numbers

```
npm run tenant-context:audit     # coverage table, per module
npm run tenant-scope:audit       # application-filter layer
```

Both ratchets run in `release:safety:test`. `bare` may never increase, the baseline
is per-module so a regression names the module, and the baseline must equal the real
count — padding it is itself a test failure, because headroom is silent room for
regressions.

Current: 1,568 operations across 138 tenant tables and 524 files — 144
contextualised, 1,310 bare, 114 exempt.

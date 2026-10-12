# Fortress Round 2 — Phase-2 strictness switch & tenant-context rollout

**Date:** 2026-10-12 · **Continues:** `docs/PLATFORM-FORTRESS-RLS-2026-10-12.md`

Round 1 put 111 RLS policies in the database with a safe phase-1 posture.
This round (a) makes **phase-2 a setting flip instead of a future migration**,
and (b) rolls the tenant-context (`withTenant`) through the entire rail layer —
the legal documents, slot writes, handshake evidence and telemetry all now run
inside DB-enforced isolation.

## 1. The policy engine gained a real switch

`app_tenant_guard("companyId")` is now the single function every policy binds
to, with executable semantics (pinned by a TS truth-table in the coverage spec):

| `app.company_id` | `app.rls_strict` | Effect |
|---|---|---|
| set to tenant X | anything | **Strict**: only tenant X's rows — the DB enforces it |
| unset | off / empty (**PHASE-1**, default) | Policy steps aside; app filters remain the boundary (zero regression) |
| unset | `'on'` (**PHASE-2**) | Rows without a context are **refused outright** — every path must use `withTenant` |

**Phase-2 is now a settings flip, not a migration:**
```sql
ALTER DATABASE flowops SET app.rls_strict = 'on';   -- tighten
ALTER DATABASE flowops SET app.rls_strict = 'off';  -- roll back instantly
```
Migration header documents the whole truth table (`20261012150000_rls_tenant_isolation`,
regenerated in place — it had never been applied outside this local branch).

## 2. Tenant-context rollout — the whole rail layer

All **23 transaction sites** across the 7 rail services converted from bare
`this.prisma.$transaction(...)` to `this.prisma.withTenant(companyId, ...)`:

| Service | Sites | What is now RLS-scoped |
|---|---|---|
| `rail-slot.service` | 4 | application create, submit, transition (allocate/reject/conflict), operated |
| `rail-handshake.service` | 6 | report create/issue, sign-off, deviations log/review |
| `rail-manifest.service` | 4 | manifest create, update, amend (new revision), lifecycle transitions |
| `rail-telemetry.service` | 4 | device register/update, alert transitions, **full ingest** |
| `rail-possession.service` | 2 | possession create, status change |
| `rail-timetable.service` | 1 | schedule import |
| `rail.service` | 2 | consignment writes |

`withTenant` composes with the outbox: the same transaction writes the rows, the
events, and the `SET LOCAL` context — still one atomic unit.

## 3. Ratchets (so none of this can rot)

- `rls-policy-coverage.spec.ts` (**9 tests**): schema↔migration coverage both
  ways + the phase-1/phase-2 truth table as executable semantics.
- `rail-tenant-context.spec.ts` (**4 tests**): a rail service may **never** go
  back to a bare `$transaction` — the build goes red and names the file. The
  `SERVICE_DIRS` list grows as other modules adopt `withTenant` (the documented
  phase-2 rollout path for billing, dispatch, etc.).

## Gates
| | |
|---|---|
| Backend | **2,105/2,105** (69 suites — +8 vs round 1) |
| Frontend | **770/770** (32 files — untouched this round) |
| tsc / eslint | clean (0 errors) |

## What changed operationally
- **Nothing breaks today** (phase-1 default). The rail layer just became
  double-guarded: app filters + database policies, and the device-facing ingest
  has been double-guarded since round 1.
- Turning on phase-2 is now a one-line ops decision once the remaining modules
  adopt `withTenant` — and there is a ratchet that tells you exactly which
  files stand between here and there.

## Remaining toward always-on (phase-2 flip)
1. Roll `withTenant` through `billing`, `invoices`, `dispatch`, `drivers`,
   `whatsapp`/`email-hub`, `wms` (add folders to `SERVICE_DIRS` as they convert).
2. Decide the cross-tenant exceptions explicitly (outbox drain, owner console) —
   run them with an intentional, audited bypass rather than an implicit one.
3. `ALTER DATABASE … SET app.rls_strict = 'on'` and watch the world stay up.

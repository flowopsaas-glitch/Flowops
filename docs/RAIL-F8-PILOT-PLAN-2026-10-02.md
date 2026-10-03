# F-8 synthetic pilot plan — non-production tariff pilot (2026-10-02)

Closes gate **F-8** of `docs/RAIL-PRICING-RELEASE-GATES-2026-10-02.md`.
Branch: `arena/01a0fbb8-flowops`. PR #442 (supersedes #441).

## 0. Objective (and non-objectives)

**Prove, on staging, that the tariff engine prices end-to-end when a verified
schedule exists and refuses honestly when none does** — using clearly labelled
synthetic rates, on a non-production tenant, touching no real money.

NOT in scope: real Transnet rates, production data, client billing, performance
or load testing, weighbridge hardware. The hold gate and validation rules are
covered by unit tests (`rail-pricing-gates` 20/20, tariff suites 232/232);
this pilot covers the priced/refused/invoiced path through the running API + UI.

## 1. Prerequisites

- [ ] PR #442 merged to `main`; staging deployed at the merge SHA; CI green
      **including the "Verify migrations match the schema (drift guard)" job**.
- [ ] Staging DB shows all 5 migrations applied
      (`SELECT count(*) FROM _prisma_migrations;` → `5`, none unfinished).
- [ ] A **non-production pilot tenant** (company) with the rail entitlement;
      pilot user holding `RAIL_READ` + `RAIL_WRITE` roles.
- [ ] **F-9 signed** (owner approval to start is part of the sign-off pack).
- [ ] **No production tenant data on staging** (see §2 — schedules are
      platform-wide).

## 2. Guard rails (binding)

- **Staging ONLY.** The §3 INSERT must never run on production. The production
  seeder loads **0 tariff schedules** (D28) — production stays `BLOCKED` until
  real verified rates arrive through the matrix process.
- Synthetic rows are labelled beyond doubt: `sourceRef =
  'SYNTHETIC pilot tariff — not a Transnet rate'` (mirrored in `notes`).
- `rail_tariff_schedules` has **no company filter** — the synthetic schedule is
  visible to every tenant on staging. That is why §1 requires a
  production-free staging box.
- Cleanup (§6) is **mandatory**, not best-effort: the pilot FAILS if synthetic
  rows remain afterwards.

## 3. Fixture — synthetic schedule (staging only)

Confirm the corridor first: `GET /rail/tariffs/status` → `COR-ORE` present
(from the code catalogue even if the seeder never ran) with
`hasVerifiedLoadedRate: false`.

```sql
-- STAGING ONLY. Never on production (F-8 guard rails, §2).
INSERT INTO rail_tariff_schedules
  ("id", "corridorCode", "financialYear", "loadedCentsPerGtk", "emptyCentsPerGtk",
   "dataStatus", "sourceRef", "notes", "isActive", "createdAt", "updatedAt")
VALUES
  ('pilot-synth-001', 'COR-ORE', '2026/27', 5, 2,
   'VERIFIED', 'SYNTHETIC pilot tariff — not a Transnet rate',
   'SYNTHETIC pilot tariff — not a Transnet rate. Delete after pilot (F-8 §6).',
   true, now(), now());
```

Verify: `GET /rail/tariffs/status` → `COR-ORE.hasVerifiedLoadedRate: true`,
all other corridors `false`.

## 4. Test cases

Create one pilot consignment in the pilot tenant via the normal app flow (Rail
operations) and note its id as `<CONSIGNMENT>`. All calls authenticated as the
pilot user against staging.

| # | Case | Call | Expect |
| --- | --- | --- | --- |
| P-1 | Baseline status (BEFORE §3) | `GET /rail/tariffs/status` | Every corridor `hasVerifiedLoadedRate: false`; message says no VERIFIED c/GTK rate is loaded |
| P-2 | Status after fixture | `GET /rail/tariffs/status` | Only `COR-ORE` true; others false |
| P-3 | Preview prices (synthetic) | `POST /rail/tariffs/preview` `{consignmentId, distanceKm: 500, financialYear: '2026/27'}` on a COR-ORE consignment | HTTP 200; traction line amount present and positive; **no null amount** on the traction line; result echoes the synthetic source |
| P-4 | Preview refused (no schedule) | Same preview on a non-COR-ORE corridor | `BLOCKED` + reasons; **nothing saved** (`GET /rail/tariffs/calculations?consignmentId=…` empty for it) |
| P-5 | Save + retrieve | `POST /rail/tariffs/calculations` (P-3 body) → `GET /rail/tariffs/calculations/:id` | Saved; retrieved calculation matches the preview |
| P-6 | Invoice draft + idempotency | `POST /rail/tariffs/calculations/:id/invoice-draft` twice | First returns a draft; second returns the **same draft id** (one draft per calculation, D27) |
| P-7 | `INCOMPLETE` can never invoice | Preview with `ancillary: [{code: 'ANX40-04-02', quantity: 1}]` (unpublished line) → save → invoice-draft | Ancillary line `NOT_PRICED` (`amountZar: null`); saved calc `INCOMPLETE`; draft call **refused** (4xx + reason) |
| P-8 | UI cross-check | Tariffs tab: synthetic calc + an unpriced corridor | Amounts shown for synthetic; `Not priced` elsewhere; **nowhere `R0.00`** for an unpriced line |

Notes: `distanceKm` is required input (corridor lengths were not supplied, so
GTK needs it). `financialYear` defaults per D20 (1 Apr–31 Mar, SAST) when omitted.

## 5. Evidence to capture

For P-1…P-7: request + full response (redact bearer tokens). For P-8:
screenshots. For §6: the post-cleanup `status` response. File everything under
the pilot record (ticket/attachment referenced in the F-8 evidence row). The
agent records the F-8 verdict from this evidence — claims without artifacts
do not pass.

## 6. Cleanup (mandatory) + verify

```sql
-- STAGING ONLY. Removes the synthetic schedule.
DELETE FROM rail_tariff_schedules WHERE "id" = 'pilot-synth-001';
```

Then delete the pilot consignment/calculations via the normal app flow (or
surgical SQL by consignment id, recorded in the pilot record), and re-run
`GET /rail/tariffs/status` → **all corridors false again**, refusal message back.

## 7. Verdict rules

- **PASS:** P-1…P-8 all as expected, §5 artifacts filed, §6 verified clean.
- **FAIL:** any deviation → record actual-vs-expected, stop, fix on the branch,
  re-run the pilot from §3. A failed pilot has zero production effect by
  construction (§2).

## 8. Roles

- **Owner:** approves the start (via F-9), accepts the verdict.
- **Pilot operator:** runs §3–§6, files §5 artifacts.
- **Reviewer:** witnesses (or replays from artifacts) and countersigns the
  pilot record. One person may not fill all three roles.

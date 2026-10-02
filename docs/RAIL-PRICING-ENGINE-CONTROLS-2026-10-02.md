# Rail pricing-engine controls — verification (2026-10-02, Phase C)

**Status: VERIFIED AGAINST CODE AT `a8f6f37` + matrix `81169f3`. No production change.**
Each control below cites the implementation, gives a verdict, and records the gap action.
Gaps that need a schema change are **proposed, not applied** — no migration has been run.

Related: `docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md` (Phase A+B),
`docs/RAIL-RASA-AUDIT-2026-10-02.md` §5, `docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md` (still gated).

Verdicts: `PASS` (implemented + tested) · `PARTIAL` (implemented with a recorded gap) ·
`GAP-CODE` (fixable without migration) · `GAP-SCHEMA` (needs an additive migration, proposed only) ·
`BLOCKED-SOURCE` (needs a Transnet document first — never inferred).

## C-01 — Raw and normalized values stored separately

- **Verdict: `GAP-SCHEMA`.**
- **Evidence:** `RailTariffSchedule` (`backend/prisma/schema.prisma:5406-5428`) stores only normalized
  `Float?` rates; no raw-text column. `RailTariffCalculation.inputs/lines` (`:5496-5497`) store JSON
  snapshots but no raw/normalized pair.
- **Required:** per rate, `rawValue` (verbatim as published, e.g. `"12,34 c/GTK"`) + `normalizedValue`
  (numeric) + `normalizationRule` (e.g. `strip-spaces,comma-decimal→dot,÷100`). Same for distances,
  factors, prices.
- **Action (proposed, not applied):** additive migration adding nullable `raw*`/`*SourceText` columns
  + `normalizationVersion`; seeder/validator update; checklist counts + rollback SQL regenerated.
  Until then, `sourceRef` free text is the only provenance — rows stay `UNVERIFIED`.

## C-02 — Formula version and source reference stored

- **Verdict: `PARTIAL` → `GAP-CODE` (formula version) + `GAP-SCHEMA` (structured source).**
- **Evidence:** source: `RailTariffSchedule.sourceRef` (`schema.prisma:5419`), `rateSourceRef` on ancillary
  (`:5449`), schedule evidence strings in every priced line (`rail-tariff.rules.ts:350`). Formula: **no
  version** — the calculator is code (`calculateTariff`, `rail-tariff.rules.ts:298`) with no stored version.
- **Required:** `formulaVersion` (e.g. `rail-tariff/1.1.0`) on every `TariffResult` and persisted in
  `RailTariffCalculation.inputs`; structured source (document + section/page/table + effective period)
  per §2 of the matrix, not free text alone.
- **Action:** CODE — add `TARIFF_FORMULA_VERSION` constant, include in result + inputs JSON + audit
  metadata (no migration). SCHEMA (proposed) — structured source columns on schedules/ancillary.

## C-03 — Effective periods stored

- **Verdict: `PARTIAL` → `GAP-SCHEMA`.**
- **Evidence:** `financialYear` label only (`RailTariffSchedule.financialYear`, `RailTariffCalculation.financialYear`).
  No `effectiveFrom/To` dates. FY parsing/validation exists (`rail-tariff.rules.ts:36-67`).
- **Required:** per rate, `effectiveFrom` + `effectiveTo` (dates) + `timetablePeriod` label, per matrix §2.
  Expired/future rates must refuse or warn explicitly (Phase D).
- **Action (proposed, not applied):** additive nullable `effectiveFrom/To` + `timetablePeriod` columns;
  `pickSchedule` extended to enforce them; escalation only within/between effective periods.

## C-04 — Route-specific rates

- **Verdict: `PASS`.**
- **Evidence:** `@@unique([corridorCode, financialYear])` (`schema.prisma:5425`); `pickSchedule` filters by
  corridor (`rail-tariff.rules.ts:272`); `resolveCorridor` maps consignment text to catalogue corridors;
  unknown corridor is `BLOCKED` (`:313`).
- **Tests:** `rail-tariff.rules.spec.ts` (refusal cases), `rail-tariff.service.spec.ts` (per-corridor status).
- **Note:** corridor mapping stays indicative until Annexure 33/33a arrive (matrix §3 items 4–5).

## C-05 — Train-km and GTK components separately

- **Verdict: `BLOCKED-SOURCE` + `GAP-SCHEMA` (when unblocked).**
- **Evidence:** calculator models **GTK only** (`GTK_LOADED`, `GTK_EMPTY`; `rail-tariff.rules.ts:176-177`).
  No train-km line kind, no train-km rate column.
- **Required:** Network Statement Ch 5 §5.2 train-km vs GTK charging definitions (matrix P-03, §3 item 1).
  **Not supplied — do not assume GTK-only or train-km+GTK.**
- **Action:** none until P-03 is sourced. When sourced: additive `trainKmRate` columns + `TRAIN_KM` line kind
  + separate subtotals + tests. Until then the calculator prices the GTK component only, and only from
  VERIFIED GTK rates (today: none → `BLOCKED`).

## C-06 — Traction electricity as a separate pass-through cost

- **Verdict: `PARTIAL` → `GAP-CODE`.**
- **Evidence:** traction is a separate opt-in `TRACTION_ENERGY` line (diesel/electric;
  `rail-tariff.rules.ts:389-437`), priced from entered > schedule > (diesel-only) base. Electric with no
  price is unpriced. But lines carry **no pass-through flag** and no methodology field.
- **Required:** electric traction flagged `passThrough: true` with methodology + billing unit + source
  (matrix P-07); diesel likewise when contracted.
- **Action:** CODE — add `passThrough` + `methodology` to `TariffLine` (default: traction-electric = pass-through);
  persist in calculation JSON; display separately in UI. No migration. Methodology stays `UNKNOWN` until P-07 sourced.

## C-07 — Yard/ancillary charges separately

- **Verdict: `PASS`.**
- **Evidence:** each requested Annexure 40 line is a separate `ANCILLARY` line with its own unit/rate/amount
  (`rail-tariff.rules.ts:439-455`); priced only when `PUBLISHED` with a rate; `TBD`/unpublished → unpriced
  with the annexure's own reason. 113 lines catalogued (`ancillary-services.catalog.ts`).
- **Tests:** `rail-tariff.rules.spec.ts` (ancillary cases), `seed-rail-reference.spec.ts` (catalogue integrity).
- **Note:** yard list (11 yards) still missing (matrix P-12) — yard validation stays `UNVERIFIED`.

## C-08 — Overload/underload charges only when approved

- **Verdict: `PARTIAL` → `GAP-SCHEMA` (approval) + `BLOCKED-SOURCE` (underload rule).**
- **Evidence:** overload: one penalty line for wagons whose **latest** reading is still overloaded
  (`rail-tariff.rules.ts:457-464`); unpriced when no penalty rate; rate never escalated; corrected-before-departure
  gets a warning, no line (D23). Underload: **not modelled**. Neither has an approval flag.
- **Required:** penalty/underload rates usable only when their matrix row is `APPROVED_FOR_PILOT/PRODUCTION`
  (P-09/P-10); corrected-overload chargeability decided by owner (D23).
- **Action:** CODE — gate penalty lines on an approval flag in the schedule/catalogue entry (default off).
  SCHEMA (proposed) — `overloadApprovalStatus`, `underloadRule` columns. Underload rule needs Annexure 22 (matrix §3 item 7).

## C-09 — Refuse invoice drafting when a required price is UNVERIFIED

- **Verdict: `PASS`.**
- **Evidence:** `BLOCKED` calculations are never saved (`rail-tariff.service.ts:188`); `INCOMPLETE` or any
  `amountZar === null` line is refused invoice draft with the unpriced-line count (`:265`); only `VERIFIED`
  schedules with a positive loaded rate price (`rail-tariff.rules.ts:273`).
- **Tests:** `rail-tariff.service.spec.ts` (refusal cases); Phase D adds explicit `UNVERIFIED`-rate refusal.

## C-10 — Display NOT_PRICED instead of R0.00

- **Verdict: `PASS`.**
- **Evidence:** backend emits `amountZar: null` for unpriced (never 0; `rail-tariff.rules.ts:187-188`);
  frontend `lineAmountText` returns `"Not priced"` for non-numeric (`frontend/src/lib/railTariff.ts:21-23`);
  quantities show `—`, rates show `no rate loaded` (`:32-33`).
- **Tests:** `frontend/src/lib/railTariff.test.ts`, `TariffPanel.test.tsx` (43 tests).

## C-11 — Never treat missing data as zero

- **Verdict: `PASS`.**
- **Evidence:** `isPos`/`isNonNeg` guards; `subtotalZar = Money.sum(priced lines only)` with `?? 0` applied
  **after** the priced/unpriced split (`rail-tariff.rules.ts:466-467`); status `INCOMPLETE` when any line is null.
  `TBD` ≠ free (ancillary basis strings).
- **Tests:** `rail-tariff.rules.spec.ts` (580 lines) covers null-rate, null-quantity, null-mass paths.

## C-12 — Record who approved a rate

- **Verdict: `GAP-SCHEMA`.**
- **Evidence:** no `approvedBy/approvedAt/reviewer` columns on schedules or ancillary; `verifiedBy` exists only
  on corridor/yard reference envelopes, not on tariff rows.
- **Required:** per rate row, `owner` + `independentReviewer` + `approvedAt` + `verificationStatus`
  (matrix §1), matching the matrix columns.
- **Action (proposed, not applied):** additive nullable approval columns + status enum extension
  (`UNVERIFIED/DRAFT/APPROVED_FOR_PILOT/APPROVED_FOR_PRODUCTION/SUPERSEDED`); seeder refuses to promote
  without both sign-offs; audit entries on promotion.

## C-13 — Preserve superseded rates and historical invoices

- **Verdict: `PARTIAL` → `GAP-SCHEMA`.**
- **Evidence:** calculations persist full `inputs/lines/blockers/warnings` JSON + `scheduleId` + `scheduleFinancialYear`
  (`schema.prisma:5494-5499`), so history survives. But schedules have no `SUPERSEDED` state (only `isActive`),
  no version chain, no `replacedBy` link.
- **Required:** superseded rows preserved with `SUPERSEDED` status + `replacedById`; new calculations use only
  the current approved row; historical calculations keep their stored lines verbatim.
- **Action (proposed, not applied):** additive `verificationStatus` + `supersededById` + `supersededAt` columns;
  `pickSchedule` excludes `SUPERSEDED`; seeder never deletes, only supersedes.

## Summary

| Control | Verdict |
| --- | --- |
| C-01 raw/normalized | GAP-SCHEMA |
| C-02 formula version + source | GAP-CODE + GAP-SCHEMA |
| C-03 effective periods | GAP-SCHEMA |
| C-04 route-specific | PASS |
| C-05 train-km + GTK | BLOCKED-SOURCE |
| C-06 traction pass-through | GAP-CODE (partial) |
| C-07 yard/ancillary | PASS |
| C-08 overload/underload approval | GAP-SCHEMA + BLOCKED-SOURCE |
| C-09 invoice refusal | PASS |
| C-10 NOT_PRICED display | PASS |
| C-11 missing ≠ zero | PASS |
| C-12 approval record | GAP-SCHEMA |
| C-13 superseded + history | GAP-SCHEMA (partial) |

**Code-only fixes in this release (no migration):** `TARIFF_FORMULA_VERSION` + pass-through flags +
pricing-source catalogue + Phase D tests. **Schema proposals:** bundled as one additive migration draft
(see `docs/RAIL-PRICING-SCHEMA-PROPOSAL-2026-10-02.md` when created) — generated, reviewed, rehearsed,
and applied only through the gated checklist after all release gates pass.

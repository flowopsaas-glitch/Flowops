# Rail pricing source exceptions — controlled record (2026-10-02, Phase E)

**Status: OPEN — nothing closed.** Every item below blocks the pricing component it names.
No exception closes on assumption, inference, or a value from another document.
Closure needs: the cited Transnet source (binary/workbook section/page/table) + owner sign-off +
independent reviewer sign-off, recorded here with dates.

- **Branch:** `arena/01a0fbb8-flowops` (from PR #441 tip `a8f6f37`).
- **Matrix:** `docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md` (Phase A+B).
- **Controls:** `docs/RAIL-PRICING-ENGINE-CONTROLS-2026-10-02.md` (Phase C).
- **Prior exceptions:** source register §5 + §11.6, requirement register EXC-001…EXC-025,
  audit §1 (proposed EXC-026…EXC-033), source register §13.6 (proposed EXC-034…EXC-038).
- **Numbering:** new items continue as proposed **EXC-039…**. They are proposals for the owner /
  independent reviewer, not edits to the requirement register (which stays proposed-baseline, not approved).

## Rule

An exception is `OPEN` until all three exist: (1) the Transnet source location, (2) owner sign-off,
(3) independent reviewer sign-off. `OPEN` pricing exceptions keep their matrix rows `UNVERIFIED` and
their calculator outputs `NOT_PRICED` / `BLOCKED`. A draft invoice touching an `OPEN` exception is refused.

## Pricing exceptions (all OPEN)

| # | Question | Why it blocks pricing | Sources involved | What would close it | Matrix rows |
| --- | --- | --- | --- | --- | --- |
| EXC-039 | **0.65 capacity factor vs route-specific wording.** Workbook applies `B3 = 0.65` to every route (source register §11.6 item 3); V4 §4.2 describes the factor as a guideline that may vary by route (EXC-001). | Capacity gates slot allocation, which gates which trains run and get priced. A single constant prices the wrong constraint on routes where the factor differs. | V4 §4.2 vs `Annexure33CapacityStatement.xlsm` (`Capacity_DB`, `B3`) | Route-specific factor table or written confirmation that 0.65 is universal, with effective FY + workbook version/hash | P-18 (periods); slot gate |
| EXC-040 | **FY29/30 vs current timetable periods.** Workbook carries FY26/27, FY27/28, FY29/30 + others (§11.0); V4 governs 2026/27+2027/28 operating context (§2); §11.3 display rows are period-unpinned (§11.6 item 11). | A rate or capacity from one period priced into another is a different tariff. Workbook FYs must never substitute into V4 periods and vice versa. | V4 §1.7 vs workbook `$B$1` selector + §11.3/§11.5 | Pinned FY for every priced figure; Table 17 tariff period; Section 5 year-start (audit §6 row 15) | P-18, P-01…P-10 |
| EXC-041 | **Undefined section markers.** `(I)/(E)/(S)/(N)` in section names (`RAYTON (I) - WITBANK (E)`) with no definition (§11.6 item 4). | Section identity drives route distances (GTK) and bottleneck sections. Guessing a marker mis-attributes km and capacity. | Workbook `Capacity_DB` section names | Marker legend from the workbook or Annexure 33/33a, with version | P-04 |
| EXC-042 | **Floating-point loss values.** `CHAILEY–DALTON` TSR 0.1853419071158129 / MA −0.1853419071158129; `BOOTH–CLAIRWOOD` 7.8 / 0.2 (§11.6 item 2). A negative or fractional "train paths lost" is not a count. | Loss columns feed spare-capacity arithmetic. Pricing or allocating off uncountable losses misstates the bottleneck. | Workbook loss columns | Corrected integer-count columns or written methodology for fractional/negative values, with workbook version | Capacity gate; P-04 |
| EXC-043 | **Route/corridor mapping.** Workbook routes are service paths; V4 corridors are chapter boundaries — mapping is indicative only (§11.4, EXC-020). Six seeded corridors carry workbook-route hints that are unconfirmed. | Rates are per corridor per FY (C-04). Pricing a service path with the wrong corridor's rate is mis-pricing. | V4 Ch 2/4 vs workbook routes vs `CORRIDOR_CATALOG.workbookRoutes` | Canonical route/section identifier (Annexure 33) + confirmed corridor map, with effective timetable period | P-01, P-02, P-04 |
| EXC-044 | **Missing or ambiguous price units.** Annexure 40 units are verbatim and varied (per wagon movement varying by train category; per km/month; per call-out first 30 min / per vehicle per hour; 8× `TBD`) — no prices, and some units need a rule to apply (matrix P-11). | Quantity × rate needs an unambiguous unit. `TBD` units and tiered wagon-movement units cannot price without a methodology. | Annexure 40 (2026/27 text, §13.2) | Published ancillary tariff with rates + unit methodology (incl. GF<50 / Medium / Heavy bands, TBD lines) | P-11, P-12 |
| EXC-045 | **Price effective-period conflicts.** Annexure 40 cover says 2026/27 (effective tariff period unconfirmed); Table 17 period unknown; workbook FYs separate; calculator assumes 1 Apr–31 Mar with override (D20). | Without effective from/to, expired/future rates cannot be refused correctly (C-03) and escalation spans the wrong years. | Annexure 40 cover vs Table 17 vs V4 §1.7 vs workbook FYs | Effective from/to + timetable period per price row (matrix §2 columns) | P-01…P-14, P-18 |
| EXC-046 | **Unclear penalty conditions.** Overload penalty rate unpublished; whether a corrected-before-departure overload is chargeable undecided (D23); underload/skew rules in Annexure 22 unsupplied; cancellation deemed/non-utilisation remedies unmodelled (audit §4.2). | Penalty lines need a rate + chargeability rule + approval (C-08). Charging a corrected overload without authority is over-billing; not charging when due is under-billing. | Brief overload formula vs RAA/NS penalty rules vs Annexure 22 vs Annexure C | Published penalty rate + corrected-overload decision + Annexure 22 rules + Annexure C remedies, each with source + effective period | P-09, P-10, P-13 |
| EXC-047 | **Network Statement vs annexure/workbook mismatches (general).** Known: 65% wording (EXC-039); §11.6 items 1 (Line Closed in depot name), 5 (positional section identity), 6 (spare = min over spare), 7 (40-row formula vs 41 sections), 8 (weekly = daily×7 vs occupations/shutdown), 9 (Annexure33 vs 33b numbering), 10 (1,416-row completeness); 21 cover-v5/body-V4 (EXC-013/035); 20a branch labels (EXC-032); 25 Second Draft (EXC-034). | Any mismatch that touches distance, capacity, chargeability, or price flows into the invoice. Each sub-item stays open until reconciled against the binary/workbook. | V4 text vs annexures 13/18/20a/20b/21/23/24/25/33/33a/33b/36/40/41 vs workbooks | Per-sub-item reconciliation: binary/workbook location + corrected value or confirmed reading + effective version | All pricing rows |
| EXC-048 | **Line Closed capacity.** `Line Closed` is embedded in depot names (e.g. `NELSPRUIT (Line Closed)`) and recovered by text search (§11.6 item 1). Weekly capacity assumes 7 operating days with `Line Closed` the only exclusion (§11.6 item 8). | A closed section has no capacity to sell and no trains to price. Substring-matching a status mis-allocates and mis-prices when names vary. | Workbook depot column + weekly formula | Explicit closed/open attribute per section per period (or confirmed closed-section list with effective dates) | Capacity gate; Phase D Line-Closed test |

## Prior exceptions that still gate pricing (restated, still OPEN)

| # | Prior item | Pricing impact |
| --- | --- | --- |
| EXC-001 | 0.65 wording (see EXC-039) | Capacity → allocation → priced trains |
| EXC-007 | `xx` thresholds; departure threshold not derivable | Cancellation chargeability |
| EXC-012 | Annexure 29b 2025/26 vintage vs V4 periods | Period substitution risk (EXC-040) |
| EXC-020 | Transitional names; indicative corridor map (see EXC-043) | Wrong-corridor rate risk |
| EXC-025/037 | Annexure 40 no prices; 8× TBD (see EXC-044) | All ancillary lines `NOT_PRICED` |
| EXC-030 | 0 of 11 yards; no corridor technical data | Yard/distance/envelope `UNVERIFIED` |
| EXC-031 | No c/GTK rates (see matrix P-01) | Every real calculation `BLOCKED` |

## Closure log

| Exception | Source location | Owner sign-off | Reviewer sign-off | Resulting matrix status |
| --- | --- | --- | --- | --- |
| (none) | — | — | — | All rows remain `UNVERIFIED`. |

*No closures recorded. Do not close an exception based only on an assumption.*

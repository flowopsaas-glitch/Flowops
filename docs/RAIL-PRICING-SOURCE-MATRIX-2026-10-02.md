# Rail pricing-source matrix — controlled register (2026-10-02)

**Status: CONTROLLED — NO VERIFIED PRICES.** Nothing in this register authorises an invoice.
All price components below are `UNVERIFIED` unless a Transnet source document with section/page/table
is cited. Unknown values are recorded as `UNKNOWN` — never as `R0.00`, never estimated, never inferred.

- **Branch:** `arena/01a0fbb8-flowops` (continued from PR #441 tip `a8f6f37`, branch `arena/01a0fac8-flowops`).
- **PR #441:** open, mergeable, 10 passing checks. **Not merged. Nothing deployed. No migration applied. No production flags changed.**
- **Deployment checklist:** `docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md` remains **gated** — nothing in it has been run.
- **Audit:** `docs/RAIL-RASA-AUDIT-2026-10-02.md` §1, §5.8, §5.10, §6.
- **Source register:** `docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md`.
- **Calculator:** `backend/src/rail/rail-tariff.rules.ts` + `rail-tariff.service.ts` (Wave 4, PR #441).
- **Storage rule:** Transnet binaries (PDF/workbooks) are **never committed to Git**. This register plus
  validation reports is what the repository keeps (source register §1).

## Rules (binding)

1. **Never convert an unknown price into R0.00.** Missing = `NOT_PRICED` (calculator) / `UNKNOWN` (register).
2. **Never use estimated or inferred Transnet rates in an invoice.** Draft invoice stays **blocked**
   while any required pricing input is unverified.
3. If a source value is missing, calculator state stays `NOT_PRICED` or `UNVERIFIED`.
4. Constants `8.50%`, `4.42%`, `R24.64/L` remain explicitly `UNVERIFIED` (`[BRIEF]`).
5. Real corridor calculations show `NOT_PRICED`, not `R0.00`.
6. No document is inferred from another. Unavailable = `UNKNOWN`.
7. One controlled action at a time. VPS actions need explicit `approved: N` per step.
8. No merge of PR #441, no VPS deploy/pull, no migration apply, no production-flag change under this register.

## §1. Verification statuses (the only allowed values)

| Status | Meaning | Calculator effect |
| --- | --- | --- |
| `UNVERIFIED` | No corroborating Transnet source cited, or cited source not yet independently reviewed. | Input is refused or the line is `NOT_PRICED`. Invoice draft **blocked**. |
| `DRAFT` | Value captured from a named source but awaiting owner confirmation. | Same as `UNVERIFIED` — never invoiced. |
| `APPROVED_FOR_PILOT` | Owner + independent reviewer signed for **non-production synthetic-data pilot only**. | May price in pilot tenant(s) only; production invoice draft still blocked. |
| `APPROVED_FOR_PRODUCTION` | Owner + independent reviewer signed for production invoicing, with effective period. | May price and invoice within effective period. |
| `SUPERSEDED` | Replaced by a newer approved value. Preserved for historical invoices; never used for new calculations. | Historical calculations keep their stored lines; new calculations use the replacing value. |

No other status is valid. `SOURCE_PENDING` (reference-data enum) maps to `UNVERIFIED` here.

## §2. Pricing-source matrix (Phase A)

Each row is one price component. `Value = UNKNOWN` means no verified value has been supplied.

| # | Price component | Value | Unit | Currency | Effective from | Effective to | Timetable / financial period | Source document | Source section / page / table | Formula | Verification status | Owner | Independent reviewer | Notes / exceptions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | Infrastructure access — loaded rate (c/GTK), per corridor per FY | UNKNOWN | c/GTK | ZAR (cents) | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement Vol 4, Section 5 tariff tables — **NOT SUPPLIED** | Table 17 access tariffs; Ch 5 §5.2 — **NOT SUPPLIED** | `amount = rate(c/GTK)/100 × GTK`; `GTK = gross t × km`; rounded once to cent | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 9. `TARIFF_SCHEDULE_CATALOG` empty by design. Calculator refuses (BLOCKED) without a VERIFIED loaded rate. |
| P-02 | Infrastructure access — empty-return rate (c/GTK), per corridor per FY | UNKNOWN | c/GTK | ZAR (cents) | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement Vol 4, Section 5 tariff tables — **NOT SUPPLIED** | Ch 5 §5.2 — **NOT SUPPLIED** | Same as P-01 on tare weight | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 9. Empty return opt-in; unpriced line when no rate. |
| P-03 | Infrastructure access — train-kilometre component (if any) | UNKNOWN — existence unconfirmed | UNKNOWN | ZAR | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement Vol 4 Ch 5 §5.2 — **NOT SUPPLIED** | Train-km vs GTK charging definitions — **NOT SUPPLIED** | UNKNOWN — do not assume GTK-only or train-km+GTK | UNVERIFIED | UNASSIGNED | UNASSIGNED | Phase B item 1. Calculator currently models GTK only (gap C-05). Train-km support requires source definitions first. |
| P-04 | Corridor length / section distances for GTK | UNKNOWN | km | n/a (quantity) | UNKNOWN | UNKNOWN | UNKNOWN — timetable period unconfirmed | Network Statement Ch 2; Annexure 33a — **NOT SUPPLIED** | Approved route/section distances — **NOT SUPPLIED** | `GTK = gross t × distanceKm` (distance typed in; never guessed) | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 10. `distanceKm` is a required explicit input (0.1–10 000). No default per corridor. |
| P-05 | Traction consumption factor — diesel | UNKNOWN | L / 1000 GTK | n/a (factor) | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement Section 5 / traction schedule — **NOT SUPPLIED** | Consumption-factor table — **NOT SUPPLIED** | `litres = factor × GTK / 1000` when litres not entered | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 11. Line unpriced when neither litres nor factor known. |
| P-06 | Traction consumption factor — electric | UNKNOWN | kWh / 1000 GTK | n/a (factor) | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement Section 5 / traction schedule — **NOT SUPPLIED** | Consumption-factor table — **NOT SUPPLIED** | `kWh = factor × GTK / 1000` when kWh not entered | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 11. Electric traction unpriced without factor+price. |
| P-07 | Traction electricity price / pass-through rate | UNKNOWN | ZAR/kWh | ZAR | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Official traction-electricity pricing source — **NOT SUPPLIED** | Tariff / pass-through methodology / billing unit / effective period — **NOT SUPPLIED** | Pass-through: `amount = kWh × price`; methodology UNKNOWN | UNVERIFIED | UNASSIGNED | UNASSIGNED | Phase B item 10. Must be separate pass-through cost (gap C-06). Never defaulted. |
| P-08 | Diesel price (contracted/pump) | UNKNOWN | ZAR/L | ZAR | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Contracted fuel schedule — **NOT SUPPLIED** | Price table — **NOT SUPPLIED** | `amount = litres × price`; fallback base P-16 only with warning | UNVERIFIED | UNASSIGNED | UNASSIGNED | Calculator uses entered > loaded > base P-16. Base use carries a warning. |
| P-09 | Overload penalty rate | UNKNOWN | ZAR / tonne over limit | ZAR | UNKNOWN | UNKNOWN | UNKNOWN — see P-18 | Network Statement / RAA — **NOT SUPPLIED** | Penalty rule/rate — **NOT SUPPLIED** | `penalty = total excess t × rate` (one line, latest readings only); rate NOT escalated | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 12. Whether a corrected-before-departure overload is chargeable is UNDECIDED (D23). |
| P-10 | Underload / under-utilisation charge (if any) | UNKNOWN — existence unconfirmed | UNKNOWN | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Network Statement / RAA — **NOT SUPPLIED** | Underload rule — **NOT SUPPLIED** | UNKNOWN — do not invent | UNVERIFIED | UNASSIGNED | UNASSIGNED | Phase C requires overload/underload only when approved. Underload not modelled. |
| P-11 | Annexure 40 ancillary services (113 lines) | UNKNOWN — no line publishes a price | Per annexure unit of measure (verbatim) | ZAR | UNKNOWN | UNKNOWN | 2026/27 (annexure cover; effective tariff period UNCONFIRMED) | Annexure 40 — Ancillary Services Catalogue 2026/27 — **SUPPLIED AS TEXT** (no prices) | 40 services → 113 priced lines; 8× `TBD`, 105× no price | `amount = quantity × unitRate` only when `PUBLISHED` with rate | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 13. `TBD` ≠ free. `unitRateZar` null on all lines. Seeder never overwrites a PUBLISHED rate with a catalogue null. |
| P-12 | Yard services (shunting/marshalling, staging) | UNKNOWN | Per wagon movement / TBD | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Annexure 40 item 1 (List of Yards.xlsx — **NOT SUPPLIED**); item 40 Staging = `TBD` | Yard list + staging price — **NOT SUPPLIED** | UNKNOWN | UNVERIFIED | UNASSIGNED | UNASSIGNED | 0 of 11 transfer yards supplied (audit §1 row 7, EXC-030). Staging is `TBD`. |
| P-13 | Occurrence / cancellation charges | UNKNOWN | UNKNOWN | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Annexure 18; 20a/20b; 21; occurrence/cancellation charge schedule — see §3 items 9–10 | Charge schedule — **NOT SUPPLIED** | Consequence table (Wave 3) carries amounts = none; Wave 4 prices no cancellation consequence | UNVERIFIED | UNASSIGNED | UNASSIGNED | Wave 3 models consequence *type* (forfeit/credit/refund), never amounts. No charge schedule supplied. |
| P-14 | VAT / tax treatment of rail charges | UNKNOWN — rate undecided | % | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Authoritative tax/commercial source — **NOT SUPPLIED** | VAT applicability + rate — **NOT SUPPLIED** | Rail module sets **no tax rate**; platform default 15% applies on finalisation (D25) | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 14. Confirm standard / zero-rated / exempt with tax adviser / SARS. Phase B item 11. |
| P-15 | Infrastructure escalation | 8.50% **[BRIEF, UNVERIFIED]** | % p.a. | n/a | UNKNOWN | UNKNOWN | UNKNOWN | Brief only — **no corroborating document** | n/a | `rate × (1+8.50/100)^years`, opt-in, earlier-year only, recorded on line | UNVERIFIED | UNASSIGNED | UNASSIGNED | Must remain explicitly UNVERIFIED. Applied only when user ticks escalate. Never applied to overload penalty. |
| P-16 | Electricity escalation | 4.42% **[BRIEF, UNVERIFIED]** | % p.a. | n/a | UNKNOWN | UNKNOWN | UNKNOWN | Brief only — **no corroborating document** | n/a | `price × (1+4.42/100)^years`, opt-in, earlier-year only | UNVERIFIED | UNASSIGNED | UNASSIGNED | Must remain explicitly UNVERIFIED. |
| P-17 | Diesel base price | R24.64/L **[BRIEF, UNVERIFIED — a base, not a pump price]** | ZAR/L | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Brief only — **no corroborating document** | n/a | Fallback when no price loaded/entered; result carries warning | UNVERIFIED | UNASSIGNED | UNASSIGNED | Must remain explicitly UNVERIFIED. Warns on every use. |
| P-18 | Financial year / timetable period authority | UNKNOWN — period unconfirmed | n/a | n/a | UNKNOWN | UNKNOWN | FY26/27 vs FY27/28 vs FY29/30 vs 2026/27+2027/28 — **UNDECIDED** | Network Statement §1.7 (2026/27+2027/28 per source register §2); Annexure 33b workbook FYs; Section 5 year-start — **year-start NOT SUPPLIED** | Timetable period 1 Apr–31 Mar (source register §2, from attested text); NS Section 5 year-start — **NOT SUPPLIED** | Calculator assumes 1 Apr–31 Mar (SAST) with caller override (D20); workbook FYs never substituted into V4 periods (§11.0) | UNVERIFIED | UNASSIGNED | UNASSIGNED | Audit §6 row 15. Never silently substitute one period for another. Phase B item 12. |
| P-19 | Performance guarantee (10% of annual Access Fee — source register §4) | 10% (rule, not a price) | % of annual Access Fee | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Network Statement §3.3.4.1, §5.2.5.1 (via source register §4, attested text) | Guarantee rule | `guarantee = 10% × annual Access Fee` | UNVERIFIED | UNASSIGNED | UNASSIGNED | Rule captured from attested text; effective period + independent review outstanding. Not priced by calculator. |
| P-20 | Access fees / additional charges / guarantees / penalties / payment terms (RAA) | UNKNOWN | Various | ZAR | UNKNOWN | UNKNOWN | UNKNOWN | Rail Access Agreement Annexure 15 — **NOT SUPPLIED** | Access fees, charges, guarantees, penalties, payment terms, tax/VAT, effective dates — **NOT SUPPLIED** | UNKNOWN | UNVERIFIED | UNASSIGNED | UNASSIGNED | Phase B item 2. |

**Result for real corridors today:** every corridor row in `GET /rail/tariffs/status` reports
`hasVerifiedLoadedRate: false`; every real calculation is `BLOCKED` (no VERIFIED loaded rate) or
`INCOMPLETE` with `NOT_PRICED` lines — never `R0.00`.

## §3. Documents required from Transnet (Phase B)

`AVAILABLE` = text pasted into the brief and captured in code/docs. `ATTESTED_TEXT` = owner-attested
Volume 4 text held as narrative capture (no binary in repo). `NOT_SUPPLIED` = unavailable → record `UNKNOWN`.

| # | Document | Required content | Availability | Source metadata held | Effective period | What is still UNKNOWN |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Network Statement Vol 4 — September 2026, **Chapter 5 §5.2 + Table 17** | Access tariffs; effective tariff period; train-km and GTK charging definitions | **NOT_SUPPLIED** (Ch 5 tariff tables never supplied; audit §1 row 8) | None. Storage rule applies when binary arrives (hash + URL + retrieval date). | UNKNOWN | c/GTK rates, train-km definitions, tariff period. Blocks P-01, P-02, P-03. |
| 2 | Rail Access Agreement — **Annexure 15** | Access fees; additional charges; guarantees; penalties; payment terms; tax/VAT; effective dates | **NOT_SUPPLIED** (source register §3: RAIL-010 nothing) | None | UNKNOWN | All of P-20. |
| 3 | **Annexure 40** — Ancillary Services Catalogue | Yard/facility/emergency-HAZMAT/ICT/technical services; published prices or pricing methodology | **AVAILABLE AS TEXT, NO PRICES** — 40 services → 113 lines, 8× TBD, 105× no price (source register §13.2; `ancillary-services.catalog.ts`) | Version 2026/27; captured 2026-10-02 from brief text; POPIA-clean (no personal data) | Cover says 2026/27; effective tariff period UNCONFIRMED | Every unit rate (P-11). Methodology for TBD lines. |
| 4 | **Annexure 33** — Network Register | Canonical route/section identity; train-path allocation; route/section attributes | **NOT_SUPPLIED** (source register §3; §11 covers 33b workbook only) | None | UNKNOWN | Route/section identity; corridor mapping stays indicative (EXC-020). |
| 5 | **Annexure 33a** — Point-to-point running times | Approved route distances; section distances; direction; effective timetable period | **NOT_SUPPLIED** | None | UNKNOWN | All of P-04. |
| 6 | **Annexure 33b** — Capacity Statement | Route spare capacity; bottleneck sections; capacity period; formula/version; source workbook metadata | **PARTIAL — workbook attested, values flattened** (source register §11; file `Annexure33CapacityStatement.xlsm` attested 2026-09-27, binary NOT in repo) | Workbook name attested; FYs FY26/27, FY27/28, FY29/30 + others; 65% factor corroborated as *implemented*; arithmetic checked (§11.3); 11 exceptions (§11.6) | Workbook FYs per selector; FY behind §11.3 rows NOT pinned (exception 11); period-separation rule §11.0 | Binary, hash, effective period, independent review; route-specific vs 0.65 wording; section markers; float loss values (Phase E). |
| 7 | **Annexure 22** — Loading Profiles | Max carrying capacity; underloading; overloading; skew-loading rules | **NOT_SUPPLIED** | None | UNKNOWN | Overload rule beyond brief's formula; skew/underload rules (P-09, P-10). |
| 8 | **Annexure 6 + 9** — Line classification / bridge class | Line classification; bridge class; axle-load limits; route-specific restrictions | **NOT_SUPPLIED** (NDA annexures 2–12 per audit §6 row 3) | None | UNKNOWN | Envelope limits; profile order A<B<B+1 stays unverified. |
| 9 | Occurrence/cancellation charging sources — **Annexure 18, 20a/20b, 21** + charge schedule | Occurrence roles; cancel/re-plan process; Clearinghouse; approved charge schedule | **PARTIAL** — 20a (v4 30 Sep 2024), 20b (v1.3 19 May 2023), 21 (v5 narrative, numeric rules only) supplied as text; 18 NOT supplied; charge schedule NOT supplied | 20a: 24 steps; 20b: 82 rows; 21: 24h/48h rules (source register §13.1, §13.4) | 20b v1.3 (19 May 2023); 20a v4 (30 Sep 2024); 21 v5 (cover/body version mismatch EXC-013/035) | Annexure 18; any approved occurrence/cancellation charge schedule (P-13). |
| 10 | Official **traction-electricity** pricing source | Tariff; pass-through methodology; billing unit; effective period; source owner | **NOT_SUPPLIED** | None | UNKNOWN | All of P-07. |
| 11 | Official **tax/VAT** treatment | Whether VAT applies; applicable rate; authoritative source | **NOT_SUPPLIED** | None | UNKNOWN | All of P-14 (D25). |
| 12 | **Financial-year / timetable-period** authority | Which period the calculator operates on (FY26/27, FY27/28, FY29/30, other) | **PARTIAL** — §1.7 gives 2026/27+2027/28 operating context and 1 Apr–31 Mar timetable (source register §2, attested text); Section 5 year-start NOT supplied; workbook FYs separate (§11.0) | Operating context 2026/27+2027/28; timetable 1 Apr–31 Mar | Calculator default 1 Apr–31 Mar with override (D20); workbook FYs never substituted | Section 5 year-start; which FY labels price rows (P-18). |

## §4. How this register is enforced

- **Code:** `TARIFF_SCHEDULE_CATALOG` stays empty until a row cites a source in `sourceRef` and sets
  `dataStatus: 'VERIFIED'` (validator refuses otherwise). The calculator uses only `VERIFIED` schedules
  with a positive loaded rate (`pickSchedule`); anything else is `BLOCKED` with reasons, nothing saved.
- **Unpriced lines:** `amountZar: null`, subtotal = priced lines only, status `INCOMPLETE`, invoice draft refused.
- **Display:** frontend shows `Not priced` (never `R0.00`) for `amountZar === null`.
- **Seeder:** never downgrades `VERIFIED`, never overwrites a `PUBLISHED` rate with a catalogue null,
  never reactivates a deactivated row; lists every rate change before applying.
- **Exceptions:** open questions live in source register §5/§11.6 and audit §1/§6 (see
  `docs/RAIL-PRICING-EXCEPTIONS-2026-10-02.md` when created — Phase E). No exception closes on assumption.
- **Sign-off:** rows move to `APPROVED_FOR_PILOT` / `APPROVED_FOR_PRODUCTION` only with owner +
  independent reviewer signatures recorded here with dates. No signatures have been recorded.

## §5. Change log

| Date (UTC) | Change | By |
| --- | --- | --- |
| 2026-10-02 | Created from PR #441 tip `a8f6f37`: all rows `UNVERIFIED`, all unavailable documents `UNKNOWN`. No prices invented. No production change. | Agent (branch `arena/01a0fbb8-flowops`) |

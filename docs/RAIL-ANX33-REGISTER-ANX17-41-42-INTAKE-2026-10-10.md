# Rail Source Intake — Annexure 33 Network Register, Annexure 17 Investment Plan, Annexure 41 Occurrence Reporting, Annexure 42 Customer Collaboration Policy (round 69)

**Date:** 2026-10-10 · **Round:** 69 · **Status:** ingested + surveyed + consolidated into product
User upload commit `be90c16` (4 PDFs at repo root) → ff-merged → `git mv`-tracked into `sources/`.
Manifest IDs per `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md`: **V4-03** (Anx 17),
**V4-04** (Network Register), **V4-08** (Anx 41), **V4-09** (Anx 42). (Round-68 report called the
Register "V3-29" — corrected here: V3-29 is Annexure 35 Dispute Resolution; the Register is V4-04.)

## 1. Annexure 33 — Network Register (V4-04)

**File:** `sources/Annexure 33_Network Register June 2026 F (1).pdf`
**SHA-256:** `1e2842cbf88c9382a18c604240a79cee985e85f7966fd90a081cdb12b68c9fa0` (378,138 bytes · 8 pages)
**Doc title:** "Annexure 33 – Network Register (June 2026_v0.3)", dated 26 June 2026 · author Eric Peete (TFR JHB).

- **Applicable for the 2026/27 timetable**; validity tied to the **4th version of the Network
  Statement** (confirms it as the NS V4 annexure). Note: applicants use it as a guide to apply for
  capacity allocation "subject to tariff adjustments by the Department of Transport".
- Purpose: declares total rail capacity (asset-condition-informed) + allocation criteria; issued to
  meet the National Rail Policy (NRP) and ERT Act; allocation principles in Network Statement
  ch. 4.5.1; capacity allocation culminated in the **Minister of Transport announcing successful
  Applicants in August 2025**; Pre-existing Agreements protected under **section 5(2) of the ERT Act**.
- Contains: (1) section-by-section slot capacity — **in "the downloadable file appended to this
  Annexure 33" (separate data file — NOT in this PDF; OPEN WANT)**; (2) functional locations where
  TSRs/MAs reduce capacity; (3) line classification (N1, N2, …) per section (in the appended file);
  (4) train path capacity per section per corridor (theoretical/practical/lost/available daily+weekly/
  allocated/spare).
- **Network availability warning (verbatim substance):** two critical sections suffer persistent theft
  and vandalism → diesel propulsion, delays, reroutes: **Leeuhof–Warrenton via Klerksdorp** (reroutable
  via Kroonstad/Bloemfontein, longer times) and **Thabazimbi–Rustenburg** (no alternative route).
- **E-33REG-01 (preserved, not corrected):** the 10-route list prints Musina - Pyramid South/Hoedspruit
  twice (items 9 and 10) and omits General Freight: Vereeniging/Danskraal to East London (which exists
  in the 33b Capacity_DB, 195 rows).
- Scope: TRIM-owned/operated infrastructure only; PRASA and concessioned infrastructure excluded.
- The register also restates Annexure 33a's role (station-to-station running times with robustness;
  externality caveat for theft/vandalism and rolling-stock failures).

## 2. Annexure 17 — Investment Plan (V4-03)

**File:** `sources/Annexure 17 Investment Plan July 2026.pdf`
**SHA-256:** `ecda99ed79864617bb2f688736bd70547251bb8b9a2f08f24dddcf85a18b9383` (136,702 bytes · 5 pages)
Author Asief Barday (TRIM CPT), created 22 July 2026.

- **Approved capital investment 2026/27–2030/31 = R 46.343bn** (R'bn to 3 decimals): capitalised
  operating expenditure 32.724 · sustaining 11.914 · expansionary 1.705. Per-FY totals:
  9.759 / 9.024 / 8.104 / 9.784 / 9.673.
- Programme line items (Infrastructure Copex 31.938, Telecoms 1.927, Security 1.032, Substations 0.995,
  Coal 81 expansion 0.764, Waterberg 2–3 0.308, …) and **corridor COPEX** (NORTHCOR 10.084 · ORECOR
  6.469 · NORTHEASTCOR 4.540 · CENTRALCOR 4.342 · MN to PE 2.479 · CONTAINERCOR 2.107 · CAPECOR excl.
  MN to PE 1.821 · Reclass 0.094). **"PSP" = Private Sector Participation** (MN to PE + CONTAINERCOR
  outer years) — preserved as printed; "–" = nil/NA.
- Supplementary funding: R16.3bn BFI-linked in plan; **R10.0bn approved** (North + Ore); Cape R8.7bn +
  Central R6bn BFI applications submitted **5 July 2026**; NorthEast ±R5.4bn + Container ±R6bn targeted
  for the **15 October 2026** bid window; additional **R26.0bn** being pursued.
- Expansion initiatives: R2U3 Coal Line 81 MTPA & Eskom works (71→81 MTPA, Blackhill–Ermelo);
  R1F2 RCB Port–Nsezi (Bayvue loco prep); R5N1 Waterberg Stage 2–3 (Lephalale–Thabazimbi coal
  2.6→9.5 MTPA, Marakele + Diepdruit loops); R4X1 Sishen rail link + Sishen Erts yard (Haakbosleegte
  bottleneck); New Manganese 12 MTPA Phase 2 (Hotazel–Ngqura); Botswana + Eswatini rail links
  (feasibility from 2026/27).

## 3. Annexure 41 — Occurrence Reporting Procedure (V4-08)

**File:** `sources/Annexure 41 Occurrence Reporting Procedure.pdf`
**SHA-256:** `aa0d1acd9b5c195963ba858565b4aed8a3a79a36626013d3af3ce16204416aed` (630,777 bytes · 12 pages)
Template `RSR/OPERATIONS/TEMPLATES/NOV2021.V3`; author Tefo Kgatle (TRIM JHB).

- RSR reportable occurrences: operational categories **A–O** + security categories **1–9**; each item
  carries **TRIM / TOC** reporting flags (Y/N) exactly as printed.
- Timelines: **15-minute** telephonic (categories A–O with fatalities/injuries, significant damage,
  dangerous goods release, force-majeure disruption, serious risk); **12-hour** written confirmation to
  RSR; **Daily Occurrence Report by 11:00** next day/working day (Tables 1, 2, 3, 5; includes suicides/
  trespassers struck + all immediate-reportable); **Quarterly** by end of month after quarter
  (Apr–Jun / Jul–Sep / Oct–Dec / Jan–Mar).
- **E-ANX41-01 (preserved):** the source prints **"CATEGORY 0" (zero)** for the letter-O category
  (Onboard passenger related occurrences). Kept as delivered.

## 4. Annexure 42 — Transnet Customer Collaboration Policy (V4-09)

**File:** `sources/Annexure 42 Transnet Customer Collaboration Policy.pdf`
**SHA-256:** `68aa7e5f3124314ccf2ba18feb43b14a87c7262b64935c58ed6f66e0470ca9bd` (244,232 bytes · 14 pages)
Transnet SOC Ltd · November 2025 · **effective 01 December 2025** · version 1.0 · review cycle 3 years.

- Framework for customer collaboration to restore/upgrade/expand Transnet infrastructure; customer-
  initiated upgrade opportunities formalised via commercial contract or addendum; procurement-law
  governed.

## 5. Consolidation record

| Artifact | Path | Content |
|---|---|---|
| Data modules | `frontend/src/data/railRegisterData.ts`, `railInvestmentData.ts`, `railOccurrenceData.ts` | register facts + E-33REG-01; all Anx 17 tables verbatim; Anx 41 full category matrix (TRIM/TOC flags) + Anx 42 policy points |
| Product pages | `frontend/src/pages/RailRegister.tsx`, `RailInvestment.tsx`, `RailOccurrence.tsx` | `/rail/register`, `/rail/investment`, `/rail/occurrence` (two tabs: occurrence + policy) |
| Sources page | `frontend/src/data/railSourceData.ts` | wanted list updated — 5 delivered flags + new gap (Annexure 33 appended data file) |
| Manifest | `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4 | V4-03/04/08/09 rows added |

Verification (round 69): `tsc --noEmit` EXIT 0 · `vite build` EXIT 0 · vitest suite passes.

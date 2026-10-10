# Rail Source Survey — Annexure 33b Capacity Statement (V4-06)

**Date:** 2026-10-10 · **Round:** 68 · **Status:** surveyed + consolidated into product
**Source file:** `sources/Annexure 33 Capacity Statement (2).xlsm`
**SHA-256:** `2d3f591515a339b57fb17e695796dcbe2cc7522ce39c4c329dcb70f325a3515b` (166,356 bytes)
**Manifest ID:** V4-06 (see `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4)

## 1. What the file is

A macro-enabled Excel workbook (.xlsm) implementing TRIM's **Capacity Statement model**: a
section-level train-path capacity calculator per route and financial year. It is the source
behind the "Slots & Capacity" product page (built round 68 at `/rail/slots`).

## 2. Workbook structure (23 zip entries)

| Sheet | sheetId | State | Content |
|---|---|---|---|
| `Capacity Statement` | 1 | visible | The live view: FY/route selectors, Capacity Factor, per-section derived table (49 rows, 47 non-empty) |
| `Capacity_DB` | 2 | hidden | The raw database: **1,035 rows** = 10 routes × 5 FYs × 20–41 sections (header + 1,035 data rows) |
| `Lists` | 3 | hidden | Dropdown lists: 5 Financial Years, 10 Routes |

Other entries: `xl/calcChain.xml` (formula chain present), sheet1/sheet2 rels. **No
`vbaProject.bin`** in the archive despite the .xlsm extension.

## 3. Capacity_DB columns (verbatim header)

`Key | Year | Route | Section Order | Section | Depot | Theoretical Daily Capacity |
Train Paths Lost to TSR | Train Paths Lost to MA | Train Paths Infra Recovery |
Train Paths Unused &amp; Recovered from TOCs | TOC 1 Allocated Train Paths … TOC 15 Allocated Train Paths`

- `Key` = `FY|Route|SectionOrder` (bare `|`, no spaces).
- 10 routes (verbatim, including the source's HTML-escaped `&amp;` in route names):
  Eastern Mainline: Rayton to Komatipoort/Richards Bay · General Freight &amp; Export Coal: Lephalale to
  Richards Bay · General Freight: Johannesburg to Cape Town · General Freight: Mafikeng to
  Beaconsfield/Potchefstroom · General Freight: Musina - Pyramid South/Hoedspruit · General Freight:
  Vereeniging/Danskraal to East London · Magnetite · Manganese · General Freight: Johannesburg to
  Durban · Ore.
- 5 FYs: **FY26/27, FY27/28, FY28/29, FY29/30, FY30/31** (207 section rows each).

## 4. Findings & flags

- **E-33B-01 · sparse allocation cells (genuine source state, preserved).** The TSR / MA /
  infra-recovery / unused-from-TOC and TOC 1–15 allocation columns are populated for
  **FY26/27 only** (184 of 207 rows carry any allocation/loss value). FY27/28–FY30/31 rows
  carry `Theoretical Daily Capacity` alone. Never filled in; the UI shows the empties and
  flags them.
- **Period discipline.** FY26/27 and FY27/28 fall inside the Network Statement V4 governing
  period (in-force). FY28/29–FY30/31 are forward projections inside the workbook. Every figure
  in the UI is labelled with its FY; values are never substituted across periods.
- **Source quirk:** shared strings carry literal `&amp;` (HTML-escaped at source) — consistent
  with the Annexure 33a "(2)" xlsx quirk. Preserved verbatim in the data module.
- **Workload view (`Capacity Statement` sheet, as delivered).** Saved selection state: FY **FY29/30**,
  route **General Freight: Johannesburg to Durban**, Capacity Factor **0.65**, Route Spare Capacity
  **49**, Bottleneck Section(s) **empty**, "Constraint Indicator" column values empty. Note text:
  "Hidden TOC columns can be expanded to view detailed TOC allocations." Two section cells are
  blank in source rows (sequences 24, 26) and one depot reads "DURBAN (Line Closed)" — preserved.

## 5. Derived formulas (workbook's own pattern — verified)

Verified against all sampled `Capacity Statement` view rows (72→47, 42→27, 14→9, 15→10, 21→14,
22→14, 18→12, 11→7):

- `practicalDaily  = round(0.65 × theoreticalDaily)`
- `dailyAvailable  = practicalDaily − lostTSR − lostMA + infraRecovery + unusedFromTOCs`
- `weeklyPractical = practicalDaily × 7`
- `weeklyAllocated = Σ(TOC 1..15)`
- `weeklySpare     = weeklyPractical − weeklyAllocated`

The UI recomputes these from Capacity_DB raw columns and labels every such column "(derived)".
Bottleneck marking in the UI is derived (minimum theoretical daily capacity) because the
delivered snapshot's own constraint cells were empty.

## 6. Consolidation record

| Artifact | Path | Content |
|---|---|---|
| Data module | `frontend/src/data/railCapacityData.ts` | 1,035 Capacity_DB rows verbatim + FY/route lists + workbook snapshot + formulas |
| Product page | `frontend/src/pages/RailCapacity.tsx` | `/rail/slots` — FY×route selector, section table (raw + derived), totals, bottleneck, E-33B-01 flag, formula panel, as-delivered snapshot card |
| Manifest | `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4 | V4-06 row added |

Verification (round 68): `tsc --noEmit` EXIT 0 · `vite build` EXIT 0 · vitest suite passes.

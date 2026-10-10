# Rail Source Intake — Network Statement V4, Annexure 15 RAA, Annexure 36 ERP (round 68)

**Date:** 2026-10-10 · **Round:** 68 · **Status:** ingested + surveyed
Three of the five round-68 uploads recorded here; the other two have dedicated surveys
(Annexure 33b → `RAIL-ANNEXURE-33B-CAPACITY-SURVEY-2026-10-10.md`, Annexexure 40 →
`RAIL-ANNEXURE-40-ANCILLARY-SURVEY-2026-10-10.md`).

## 1. TRIM Network Statement 18 September 2026 (V4-01)

**File:** `sources/TRIM Network Statement 18 September 2026 (1).pdf`
**SHA-256:** `6e7ad24b993df0a38065720533e16bfdf79f4bbaf68ece81435491a190798faa` (4,647,584 bytes · **203 pages**)

- **The official Transnet PDF of Network Statement V4.** From round 6 the team had only the
  WebArchive capture (`docs/TRIM-NETWORK-STATEMENT-V4-GAZETTE-2026-10-06.md`); this upload is
  the primary document itself and closes the V4-01 retrieval want.
- Title carries the issue date **18 September 2026** — supersedes/aligns with the 15-Sep web
  capture; treat the PDF as source of record for V4 text going forward.
- Period: governs **FY26/27 + FY27/28** (per the round-6 gazette evidence).
- The full text (slot framework, section 5, corridors) is not yet transcribed into the product
  rule engine; the 203-page text layer is available in the repo for the next consolidation
  round (see `rail-source-check/NEXT-SESSION-PROMPT.md` §9B/§13).

## 2. Annexure 15 — Rail Access Agreement (V4-02)

**File:** `sources/Annexure 15_Rail Access Agreement (1).pdf`
**SHA-256:** `e525bb447ad891a7a007a98fb4da78dd5c97cfebb15d8cc8f272ba270208a953` (790,088 bytes · **95 pages**)

- The model RAA (contract) that sits behind the RAA Rule Book (V2-03) and the S&L / Access
  Policy chain. Closes the V4-02 retrieval want.
- 95 pages of contract clauses; not yet clause-indexed in the product. Next: clause index +
  cross-links from the Rule Book UI.

## 3. Annexure 36 — Emergency Response Plan (Tribunals Process) (V3-30)

**File:** `sources/Annexure 36_Emergency Response Plan (Tribunals Process).pdf`
**SHA-256:** `4dfcf2d2cfa3fcf4e330a9c1cb1e955523108761b0213e30e37189cb256d2c9c` (1,547,133 bytes · **73 pages**)

- PDF metadata title: "Emergency Response Plan for Multidisciplinary Incident Preparedness Plan".
  The file name adds "(Tribunals Process)" — both labels preserved as delivered.
- **Period caveat (E-ANX36-01):** this is a **V3** annexure. The V4-updated ERP is a separate
  V4 document; V3-30 in the manifest period-labels this delivery as V3 content. Never present
  its text as V4-governing without the period label.
- Closes the V3-30 retrieval want.

## 4. Retrieval-manifest updates

All three rows are recorded in `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4 with their
hashes and delivery dates. Storage note: the five round-68 binaries (this trio + Annexure 33b +
Annexexure 40) were user-committed at the repo root (commit `0a356d6`) and `git mv`-tracked into
`sources/` as a user-directed storage exception (same pattern as the 33a zip/xlsx).

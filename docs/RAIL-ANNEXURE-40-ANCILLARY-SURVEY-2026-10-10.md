# Rail Source Survey — Annexexure 40 Ancillary Services Catalogue 2026/27 (V4-07)

**Date:** 2026-10-10 · **Round:** 68 · **Status:** surveyed + consolidated into product
**Source file:** `sources/Annexure 40 - TRIM Ancillary Services Catalogue 2026_27 (1).pdf`
**SHA-256:** `f924fc8e6086af61a76525f298da02ef270d41fddc703174934596a2285a55cf` (246,587 bytes · 6 pages)
**Manifest ID:** V4-07

## 1. What the file is

The TRIM **Ancillary Services Catalogue** for 2026/27: a 4-tier catalogue of **40 numbered
service groups / ~100 line items**, each with a service name, description and **Unit of Measure**.
It is the catalogue behind the "Tariffs & Charges" product page (built round 68 at `/rail/tariffs`).

## 2. Tier structure (verbatim tier titles)

- **Tier 1 — Infrastructure Access Services:** "Safety critical and compulsory services essential
  for day-to-day train operations" (groups 1–4: yards shunting/marshalling, inland terminals
  container handling, radio network trunk/open channel, radio peripherals incl. RTB installation).
- **Tier 2 — Rail Critical Support Services:** "Safety Critical Services for rail operations but
  non-compulsory for day to day running of trains" (groups 5–8: track & trace data (VIS/CS90),
  rolling stock condition data, pantograph monitoring data, new rolling stock evaluation).
- **Tier 3 — Optional Rail Support Services:** "Engineering and Technical support services for the
  development and maintenance of rail infrastructure" (groups 9–25).
- **Tier 4 — Non Rail Service:** "Telecoms, Property and safety & emergency services outside rail
  operations" (groups 26–40: dark fibre NLD/Metro, transmission links E1/STM-1…STM-64, data
  packages, comms-room real estate, non-TRIM fibre installs, radio & wireless, wavelength/DWDM/
  Ethernet/MPLS/microwave/satellite/legacy, telecom facilities, ad hoc installs, future digital
  services (DMR/LTE/MCPTT), emergency response vehicles & labour, fire equipment maintenance &
  signage, fire training, wayleaves, staging).

## 3. Findings & flags

- **E-TARIFF-01 · NO RATES (open, now precisely scoped).** The delivered catalogue contains
  **no price or rate values at all** — only service definitions and units of measure. (Words
  like "Fee includes…" and "committed and excess information rates" are descriptive; "rates"
  there means data rates.) Approved ancillary tariff rates must come from a separate approved
  schedule once delivered. The product page states this on every line ("Rate: not in catalogue").
- **Source UOM "TBD" (preserved):** item 34 (Future Digital Telecommunication Services — DMR,
  LTE/MCPTT, hybrid interworking) and item 40 (Staging) carry UOM "TBD" in the source. Kept
  exactly as delivered and flagged in the UI ("TBD in source — preserved").
- **Unbalanced parenthesis (preserved):** item 3's UOM reads "Per Radio (monthly subscription))"
  — kept as delivered.
- **Named attachments not in the PDF:** items 1–2 reference "List of Yards.xlsx" and
  "List of Terminals.xlsx"; these lists are not included in the delivered 6-page PDF (recorded
  as a source gap).
- **Period label:** the title says "2026_27"; the catalogue carries no separate effective-date
  clause in its text.

## 4. Consolidation record

| Artifact | Path | Content |
|---|---|---|
| Data module | `frontend/src/data/railAncillaryData.ts` | 4 tiers / 40 groups / all line items verbatim (names, descriptions, UOMs) + rates-status |
| Product page | `frontend/src/pages/RailTariffs.tsx` | `/rail/tariffs` — tier filter + search, group cards, UOM badges, E-TARIFF-01 banner, anomaly policy footer |
| Manifest | `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4 | V4-07 row added |

Verification (round 68): `tsc --noEmit` EXIT 0 · `vite build` EXIT 0 · vitest 749/749 pass.

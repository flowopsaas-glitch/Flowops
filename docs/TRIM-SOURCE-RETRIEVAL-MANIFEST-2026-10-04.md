# TRIM source retrieval manifest — 2026-10-04

**Status: MANIFEST — retrieval outstanding.** Nothing in this file is a captured source. It records
where each primary source lives, which period it governs, and what may legitimately be done with it.

## Why this file exists

The development sandbox has **no network egress to `transnet.net`** (verified 2026-10-04:
`curl https://www.transnet.net/` → `OpenSSL SSL_connect: SSL_ERROR_SYSCALL`, `http=000`). Every
document below is published and publicly downloadable, but retrieval must be done by a person with
network access and the files supplied to the workspace.

Until a file is supplied, its row in §4 stays blank and nothing may be built on it.

## The period rule (binding)

- **Network Statement Version 4** governs **FY2026/27 and FY2027/28** — published 18 September
  2026, gazetted in **Gazette No. 55426** on 21 September 2026.
- **Network Statement Version 3** governs **FY2024/25**.
- Values **must never be substituted across periods** (source register §11.0; EXC-012/010).
- **V3 documents may supply structure only** — form layout, section ordering, procedure shape,
  field names. They may **not** supply thresholds, timers, rates, KPI targets or capacity figures
  for a V4 period. Every structural use of a V3 document is recorded as an exception with its
  period caveat before it is encoded.

## 1. Version 4 — governing set (FY2026/27 + FY2027/28)

Source: TRIM "Network Statement Version 4" publication notice, 18 September 2026.

| # | Document | Format | Retrieval URL |
| --- | --- | --- | --- |
| V4-01 | Network Statement (Version 4) | PDF | `https://www.transnet.net/getFile.ashx?id=28645` |
| V4-02 | Annexure 15: Rail Access Agreement | PDF | `https://www.transnet.net/getFile.ashx?id=28648` |
| V4-03 | Annexure 17: Investment Plan | PDF | `https://www.transnet.net/getFile.ashx?id=22928` |
| V4-04 | Annexure 33: Network Register | PDF | `https://www.transnet.net/getFile.ashx?id=21073` |
| V4-05 | Annexure 33a: Point to Point Running Times | XLSX | `https://www.transnet.net/getFile.ashx?id=22633` |
| V4-06 | Annexure 33b: Capacity Statement | XLSM | `https://www.transnet.net/getFile.ashx?id=21146` |
| V4-07 | Annexure 40: TRIM Ancillary Services Catalogue | PDF | `https://www.transnet.net/getFile.ashx?id=22385` |
| V4-08 | Annexure 41: Occurrence Reporting Procedure | PDF | `https://www.transnet.net/getFile.ashx?id=21716` |
| V4-09 | Annexure 42: Transnet Customer Collaboration Policy | PDF | `https://www.transnet.net/getFile.ashx?id=21717` |
| V4-10 | Annexure 43: KPIs | XLSX | `https://www.transnet.net/getFile.ashx?id=21147` |
| V4-11 | Full Publication Notice | PDF | `https://www.transnet.net/getFile.ashx?id=28658` |

Annexure 43 is served from the same id on both the announcement page (labelled XLSX) and the
downloads index (labelled PDF). The true format is whatever the binary turns out to be — record it
on receipt rather than assuming either label.

## 2. Version 3 — gap-filling set (FY2024/25, period caveat applies)

These are the annexures V4 does **not** publish. Use for structure only.

| # | Document | Format | id |
| --- | --- | --- | --- |
| V3-01 | Network Statement (Version 3) | PDF | `4010` |
| V3-02 | Addendum Section 4-10 (B-BBEE / economic transformation) | PDF | `5238` |
| V3-03 | Annexure 1: Provisional Shut Schedule 2024/25 | PDF | `4011` |
| V3-04 | Annexure 13: Pantograph Specification | PDF | `4012` |
| V3-05 | Annexure 14: Diesel Nozzle Specification | PDF | `4013` |
| V3-06 | Annexure 16: Faculty of Rail Team Contact Details | PDF | `4017` |
| V3-07 | Annexure 18: Occurrence Management | PDF | `4036` |
| V3-08 | Annexure 19a: POSMOR | PDF | `4038` |
| V3-09 | Annexure 19b: Train Working Rules Part 1–7 | PDF | `4039` |
| V3-10 | Annexure 19c: General Appendix No. 6 | PDF | `4040` |
| V3-11 | Annexure 20a: Cancel or Reschedule TOC Train Process | PDF | `4041` |
| V3-12 | Annexure 20b: Cancellation Reasons | PDF | `4042` |
| V3-13 | Annexure 21: Clearinghouse Process Narrative | PDF | `4043` |
| V3-14 | Annexure 22: Loading Profiles | PDF | `4037` |
| V3-15 | Annexure 23: Shunting Rolling Stock Specifications for Yards | PDF | `4015` |
| V3-16 | Annexure 24: Interface Agreement | PDF | `4018` |
| V3-17 | Annexure 25: Self Screening Checklist | PDF | `4019` |
| V3-18 | Annexure 26: Environmental Analysis | PDF | `4020` |
| V3-19 | Annexure 27: Risk Analysis Guidelines | PDF | `4022` |
| V3-20 | Annexure 27a: Risk Register Example | PDF | `4021` |
| V3-21 | Annexure 27b: Risk Analysis and Mitigation Plan Example | XLS | `4046` |
| V3-22 | Annexure 28: Daily Handshake Process | PDF | `4023` |
| V3-23 | Annexure 29a: Network Access Application Form | PDF | `4049` (application page cites `4050`) |
| V3-24 | Annexure 29b: Network Capacity Statement | PDF | `5237` |
| V3-25 | Annexure 30: Credit Application | PDF | `4026` |
| V3-26 | Annexure 31: TRIM Non-Disclosure Agreement | PDF | `4027` |
| V3-27 | Annexure 32: AD-HOC Slot Application Process | PDF | `4028` |
| V3-28 | Annexure 34: Volume Confirmation Letter | PDF | `4035` |
| V3-29 | Annexure 35: TRIM Dispute Resolution Process | PDF | `4044` |
| V3-30 | Annexure 36: Emergency Response Plan ("Tribunal Process") | PDF | `4045` |

URL pattern: `https://www.transnet.net/getFile.ashx?id=<id>`

Annexure 29a appears under two ids. Retrieve both; the later id is likely the current form and the
difference must be recorded, not assumed.

## 3. Confirmed absent — not published in either index

Neither the V3 (2024/25) nor the V4 index lists these. They are internal / TOL-class documents, not
withheld-from-us documents.

| Annexure | Subject | Consequence |
| --- | --- | --- |
| **37** | Create monthly order | **RAIL-011.1 evidence-blocked** — monthly order cycle cannot be normatively specified |
| **38** | Capture weekly train-path order | **RAIL-011.2 evidence-blocked** — weekly cycle cannot be normatively specified |
| **39** | Resolve handshake disputes | Dispute-resolution procedure detail cannot be normatively specified |

Also not published: **Annexures 2–12** (clearances, gauges, loops, gradients, classification,
radio/tunnel/bridge/CAS/depot maps) — withheld by policy, released on application with a signed
**Annexure 31 NDA** (NS §4.5.5.2.2).

**Options for 37/38/39:** (a) obtain via a signed TOC's pack or a TOL relationship; (b) design to
the NS §6.4 / §6.6 narrative and record the gap as a controlled exception surfaced in the UI;
(c) run the module in "assisted" mode where the operator supplies the procedure. Not a decision for
this document.

## 4. Retrieval record — to be completed on receipt

Region (per source register §9 item 1): hash, filename, source URL and retrieval date are required
for **every** supplied binary. No binary is committed to this repository.

| # | File | SHA-256 | Size | Format | Retrieved | Period |
| --- | --- | --- | --- | --- | --- | --- |
| V4-01 | `TRIM Network Statement 18 September 2026 (1).pdf` | `6e7ad24b993df0a38065720533e16bfdf79f4bbaf68ece81435491a190798faa` | 4,647,584 | PDF (203 p) | 2026-10-10 (user upload, commit `0a356d6`) | FY26/27–27/28 |
| V4-02 | `Annexure 15_Rail Access Agreement (1).pdf` | `e525bb447ad891a7a007a98fb4da78dd5c97cfebb15d8cc8f272ba270208a953` | 790,088 | PDF (95 p) | 2026-10-10 (user upload, commit `0a356d6`) | FY26/27–27/28 |
| V4-05 | `Annexure_33a_NS_ver_4 (3).zip` (extract TSV MD5 `1cd978f5a0e5c5528886aa0c66047cb6`) + native `Annexure 33a_NS ver.4 (2).xlsx` | zip commit `8d30089`; xlsx `93b4d44929c037a799969a5b2a5efa514af4abbd7e2711ac0e072ece77745dd5` | 3,220,461 + 15,258,573 | ZIP(TSV+XLSX) / XLSX | 2026-10-10 (user upload via GitHub) | FY26/27–27/28 |
| V4-06 | `Annexure 33 Capacity Statement (2).xlsm` | `2d3f591515a339b57fb17e695796dcbe2cc7522ce39c4c329dcb70f325a3515b` | 166,356 | XLSM (3 sheets) | 2026-10-10 (user upload, commit `0a356d6`) | FY26/27–30/31 (rows for all 5 FYs) |
| V4-07 | `Annexure 40 - TRIM Ancillary Services Catalogue 2026_27 (1).pdf` | `f924fc8e6086af61a76525f298da02ef270d41fddc703174934596a2285a55cf` | 246,587 | PDF (6 p) | 2026-10-10 (user upload, commit `0a356d6`) | 2026/27 |
| V3-30 | `Annexure 36_Emergency Response Plan (Tribunals Process).pdf` | `4dfcf2d2cfa3fcf4e330a9c1cb1e955523108761b0213e30e37189cb256d2c9c` | 1,547,133 | PDF (73 p) | 2026-10-10 (user upload, commit `0a356d6`) | V3 (E-ANX36-01 period caveat) |
| V4-03 | `Annexure 17 Investment Plan July 2026.pdf` | `ecda99ed79864617bb2f688736bd70547251bb8b9a2f08f24dddcf85a18b9383` | 136,702 | PDF (5 p) | 2026-10-10 (user upload, commit `be90c16`) | 2026/27–2030/31 corporate plan |
| V4-04 | `Annexure 33_Network Register June 2026 F (1).pdf` | `1e2842cbf88c9382a18c604240a79cee985e85f7966fd90a081cdb12b68c9fa0` | 378,138 | PDF (8 p) | 2026-10-10 (user upload, commit `be90c16`) | 2026/27 timetable (June 2026 v0.3) |
| V4-08 | `Annexure 41 Occurrence Reporting Procedure.pdf` | `aa0d1acd9b5c195963ba858565b4aed8a3a79a36626013d3af3ce16204416aed` | 630,777 | PDF (12 p) | 2026-10-10 (user upload, commit `be90c16`) | RSR template NOV2021.V3 |
| V4-09 | `Annexure 42 Transnet Customer Collaboration Policy.pdf` | `68aa7e5f3124314ccf2ba18feb43b14a87c7262b64935c58ed6f66e0470ca9bd` | 244,232 | PDF (14 p) | 2026-10-10 (user upload, commit `be90c16`) | effective 01 Dec 2025 v1.0 |
| V4-10 | `Annexure 43 KPIs (2).xlsx` | `18e137f75057f57b05ce3196c2d4b5b4b8c83e35bc57c590ea3c49d89b65fd15` | 51,984 | **XLSX** (format question resolved) | 2026-10-10 (user upload, commit `e24e70c`) | FY26/27–27/28 |
| *(remaining rows added on receipt)* | | | | | | |

**Storage note (user-directed exception):** these binaries live under `sources/` and are
tracked on `arena/a620a55a-flowops` — the owner directed the sources into Git deliberately
(33a zip/xlsx + 43 xlsx earlier; the five round-68 uploads were user-committed at repo root in
`0a356d6` and `git mv`-tracked into `sources/`). Surveyed in
`docs/RAIL-ANNEXURE-43-KPI-SURVEY-2026-10-10.md` (43),
`docs/RAIL-ANNEXURE-33B-CAPACITY-SURVEY-2026-10-10.md` (33b),
`docs/RAIL-ANNEXURE-40-ANCILLARY-SURVEY-2026-10-10.md` (40),
`docs/RAIL-NS-V4-ANX15-ANX36-INTAKE-2026-10-10.md` (NS V4 / 15 / 36) and
`rail-source-check/RECONCILIATION-33A.md` (33a).

## 5. The 15-step TOC application process — evidence for the guided builder

From TRIM's *Annual Train Path Allocation* page. This is the authoritative sequence the Network
Access Application builder must mirror.

| # | Step | Actor | Artefact |
| --- | --- | --- | --- |
| 1 | Publish Information for TOCs | IM Sales | — |
| 2 | Advertise | IM Sales | — |
| 3 | Download Relevant Information | TOC | Map · Anx 24 · Anx 26 · Anx 30 · Anx 25 · Anx 29a |
| 4 | Conduct Self-Screening | TOC | Anx 25 |
| 5 | Complete and Submit Application | TOC | Map · Anx 29a → `slotapplications2024_q4@transnet.net` |
| 6 | Assess TOC's Application Requirements | IM Capacity Planning & Design | — |
| 7 | Check Rolling Stock Compliance | RSR | — |
| 8 | Conduct Site Visits | TOC | via `InfrastructureManager@transnet.net` |
| 9 | Resolve Conflicts between competing TOCs and allocate slots | IM Capacity Planning & Design | — |
| 10 | Notify TOCs | IM Sales | — |
| 11 | Handle Disputes | IM Sales · **Route Logistics Forum** · **Regulator** | — |
| 12 | Finalise all TOC Pre-Contracting Obligations | TOC | Ch 2–7 + RAA · Anx 15 · 16 · 19a · 19b · 19c · 24 |
| 13 | Provide Quote (Pro-Forma Invoice) | IM Sales | — |
| 14 | Contract | IM Sales | — |
| 15 | On-Board Customer | IM Sales | — |

Note step 11: the **Route Logistics Forum** and the **Regulator** sit in the *application-dispute*
chain, which is a distinct path from the Daily Handshake escalation ladder. Conflating the two is
the exact error recorded as G-1.

## 6. Ad-hoc train path applications — published SLAs

From TRIM's announcement of 01 December 2025 (clause 4.3.4, Network Statement Volume 3):

- Requests must be presented **at least 21 days** prior to the date of service.
- The IM provides a positive or negative answer **within 1 to 14 days**.
- **New TOCs** must instead follow the full application process at paragraph 4.3.2.
- Guideline annexure: **Annexure 32**.

These are V3-period figures and carry the §period caveat; they must be re-confirmed against V4
Annexure 32 before being encoded as timers.

## 7. Handling rules

1. Store binaries **outside the repository tree**. Nothing here is committed.
2. Record the retrieval row (§4) before the document is used as authority for any rule.
3. Named individuals in sign-off blocks are **not** copied (POPIA; EXC-022).
4. Any structural use of a V3 document raises an exception with its period caveat.

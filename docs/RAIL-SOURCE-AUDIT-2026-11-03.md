# Transnet / TRIM source audit — 2026-11-03

**Scope:** every document supplied in `sources/` (25 files), traced to the data module and page
that carries it, with the residual gaps named rather than papered over.

**Method:** `sha256sum` over `sources/*`; grep of `frontend/src/data/*.ts` and
`frontend/src/pages/**` for each annexure identifier; manual read of every file whose identifier
resolved to zero data modules. Hashes below are the values computed on this working tree and they
match the hashes stamped in the corresponding data modules and in
`docs/RAIL-*-INTAKE-*.md`.

**Verdict:** before this round, 22 of 25 supplied files were ingested. **Annexure 36** was present
on disk but referenced by no data module or page, and **Annexure 15** was recorded as "delivered" in
the source register while its content had never been built. Both are now built (routes
`/rail/emergency` and `/rail/agreement`). One file, `annexure33a-full-raw.tsv`, was a 0-byte
placeholder and is removed. The **Annexure 33 appended data file** remains genuinely absent — it is
named by the register but was never supplied, and cannot be reconstructed (see §3.1).

---

## 1. Coverage matrix

| # | File in `sources/` | SHA-256 (prefix) | Data module | Route | Status |
|---|---|---|---|---|---|
| 1 | `Annexure 1 2024-25 Revised Transnet Shutdown schedule signoff 23 July 2024_signed.pdf` | `81aa0964…` | `railShutdownData.ts` | `/rail/timetable` | ingested |
| 2 | `Annexure 15_Rail Access Agreement (1).pdf` | `e525bb44…` | **`railAgreementData.ts` (new)** | **`/rail/agreement` (new)** | **built this round** |
| 3 | `Annexure 17 Investment Plan July 2026.pdf` | `ecda99ed…` | `railInvestmentData.ts` | `/rail/investment` | ingested |
| 4 | `Annexure 18 Occurrence Management (1).pdf` | `217daf76…` | `railOccurrenceData.ts` | `/rail/occurrence` | ingested |
| 5 | `Annexure 20a … Cancel_or_Re-Schedule_TOC_Train_Process_v4_.pdf` | `dafafcf2…` | `railCancellationData.ts` | `/rail/cancellations` | ingested |
| 6 | `Annexure 20b Cancellation reasons.pdf` | `d5774ad4…` | `railCancellationData.ts` | `/rail/cancellations` | ingested |
| 7 | `Annexure 21_…_Clearinghouse_Process_Narrative_v5 (1).pdf` | `9da1762f…` | `railCancellationData.ts` | `/rail/cancellations` | ingested |
| 8 | `Annexure 22 Loading Profiles.pdf` | `e12eb5c4…` | `railOccurrenceData.ts` | `/rail/occurrence` | ingested |
| 9 | `Annexure 28_Daily_Handshake_Process (1).pdf` | `2bd02631…` | `railAccessData.ts` | `/rail/access` | ingested |
| 10 | `Annexure 29a Network Access Application Form.pdf` | `9b53984b…` | `railAccessData.ts` | `/rail/access` | ingested |
| 11 | `Annexure 29b - Network Capacity Statement_Final (Ver2) (1).pdf` | `9fdfa56d…` | `railAccessData.ts` | `/rail/access` | ingested (period-caveated) |
| 12 | `Annexure 32_Ad_Hoc_TOC_Slot_Requests_Process_v1.5 (1).pdf` | `65cd5142…` | `railAccessData.ts` | `/rail/access` | ingested |
| 13 | `Annexure 33 Capacity Statement (2).xlsm` | `2d3f5915…` | `railCapacityData.ts` | `/rail/slots` | ingested (1,035 rows) |
| 14 | `Annexure 33_Network Register June 2026 F (1).pdf` | `1e2842cb…` | `railRegisterData.ts` | `/rail/register` | ingested |
| 15 | `Annexure 33a_NS ver.4 (2).xlsx` | `93b4d449…` | `railSourceData.ts` + corpus | `/rail/timetable` | ingested |
| 16 | `Annexure 35_TRIM Dispute Resolution Process.pdf` | `fdc47f46…` | `railAccessData.ts` | `/rail/access` | ingested |
| 17 | `Annexure 36_Emergency Response Plan (Tribunals Process).pdf` | `4dfcf2d2…` | **`railEmergencyData.ts` (new)** | **`/rail/emergency` (new)** | **built this round** |
| 18 | `Annexure 40 - TRIM Ancillary Services Catalogue 2026_27 (1).pdf` | `f924fc8e…` | `railAncillaryData.ts` | `/rail/tariffs` | ingested |
| 19 | `Annexure 41 Occurrence Reporting Procedure.pdf` | `aa0d1acd…` | `railOccurrenceData.ts` | `/rail/occurrence` | ingested |
| 20 | `Annexure 42 Transnet Customer Collaboration Policy.pdf` | `68aa7e5f…` | `railOccurrenceData.ts` | `/rail/occurrence` | ingested |
| 21 | `Annexure 43 KPIs (2).xlsx` | `18e137f7…` | `railKpiData.ts` | `/rail/kpis` | ingested |
| 22 | `Annexure_33a_NS_ver_4 (3).zip` | `d529fd46…` | corpus (672 files) | `/rail/timetable` | ingested |
| 23 | `Release of Final NS V4_18 September 2026_Final (1).pdf` | `de8c5065…` | `railAccessData.ts` | `/rail/access` | ingested |
| 24 | `TRIM Network Statement 18 September 2026 (1).pdf` | `6e7ad24b…` | `railStatementData.ts` | `/rail/statement` | ingested |
| 25 | `annexure33a-full-raw.tsv` | `e3b0c442…` (**0 bytes**) | — | — | **removed this round** |

---

## 2. What was built in this round

### 2.1 Annexure 36 — Emergency Response Plan (73 pp)

Previously present on disk with **zero** references in the application. Now:

- `frontend/src/data/railEmergencyData.ts` — version control table (v3.0 → v4), purpose,
  applicability, distribution, the three activation levels (Code Red 3 / Orange 2 / Green 1), the
  A–E scenario matrix with per-cell codes, RIC/RIO assignment by area classification, ECC siting and
  equipment, RIC duties, the Tribunal's definition and six-step life cycle, NCC duties, the
  on-site/off-site split, interface management (PRASA, Shosholoza Meyl, TNPA, overborder both
  directions), the fatality protocol, post-occurrence processes, drill cadence, 26 reference
  standards, 22 hazmat contacts, activation control sheets (national + depot), emergency teams for
  10 areas, wagon-maintenance depots, and the 4.12B preliminary investigation form schema.
- `frontend/src/pages/RailEmergency.tsx` — six-tab read-only reference view.
- Route `/rail/emergency`, RAIL sidebar entry.

Source quirks preserved rather than corrected: duplicated clause number `6.19.4.1`; duplicated
Ladysmith (Container corridor) and Krugersdorp/Isando (Central corridor) entries; the literal
`????` in the Welgedag bulldozer cell; `P&T` used without a printed definition; blank contact rows
for East London and Eastern Region; form sections 9–11 absent from the extracted text.

### 2.2 Annexure 15 — Rail Access Agreement (95 pp)

Previously only named in `railSourceData.ts` as "delivered"; its content was never built. Now:

- `frontend/src/data/railAgreementData.ts` — parties, the five decision-critical clauses, the seven
  suspensive conditions with refs, all 49 clauses grouped by function, annexure index A–J with each
  annexure's status in the supplied copy, approved-cargo categories, the indicative access-fee
  table, application fees, both directions of the penalty regime, the eight additional-charge
  triggers, the yard-usage rule and the mutual force-majeure carve-out.
- `frontend/src/pages/RailAgreement.tsx` — four-tab view.
- Route `/rail/agreement`, RAIL sidebar entry.

**Finding 1 — the instrument is unexecuted.** Access Seeker name and registration number are
placeholders (`[______________□]`, `[□]`), the Services Commencement Date is `[◾]`, Annexure A
(Allocated Slot/s) is blank, and signature blocks are uncompleted. Nothing in the file evidences an
operator's rights, so the page presents it as a readiness instrument, not an entitlement record.

**Finding 2 — the Annexure C heading is stale, and the register had this wrong.** Annexure C is
preceded by "SECTION TO BE FULLY UPDATED WITH FINALISED CHARGES". Taken at face value that would
make the fee table unusable. It is not: all ten rows reconcile exactly, row for row, against
**NS V4 Table 17** — the access tariff approved by the Minister and in force from 1 August 2026
(`railStatementData.accessFeeTable`). Both documents print 680/3.54, 680/5.53, 260/6.03, 30/4.41,
30.75/9.00, 30/6.96, 30/9.50, 50/0.0, 60/0.0, 12/0.0. The heading is therefore a leftover drafting
note inside the template, not evidence of superseded rates. The page states this and still directs
billing readers to `/rail/tariffs`, because Table 17 is the controlled instrument.

**Finding 3 — the annexure register understated annexure 36.** `railStatementData.annexureRegister`
described the delivered file as a "V3 copy … V4 version open". The file is v4: its own version
control records v4 dated 2024.09.30 with the title rename to "Multidisciplinary Incident Preparedness
and Operational Management", and the body carries the v4 hallmarks (Natal→Container, Cape 1/2→Cape/Ore,
Northern→North, ERG added). Register corrected.

### 2.3 Housekeeping

- `sources/annexure33a-full-raw.tsv` (0 bytes, SHA-256 of empty input `e3b0c442…`) removed. It was
  an empty placeholder; the real 33a extract lives inside `sources/Annexure_33a_NS_ver_4 (3).zip`
  and the 672-file mirror under `rail-source-check/`, which is byte-identical to it
  (251,678/251,678 rows, per `rail-source-check/STATE.md` round 67).

---

## 3. Residual gaps (cannot be closed from what is in the repository)

### 3.1 Annexure 33 appended data file — **not supplied**

The Network Register (§1 of Annexure 33) states that section-by-section slot capacity is contained
in a **downloadable file appended to the Annexure, separate from the PDF**. Register §3 adds that
this file also carries **line classification (N1, N2, etc.) per section**.

What exists today is a *partial* substitute, and the difference matters:

- `railCapacityData.ts` holds 1,035 rows of the Annexure 33b `Capacity_DB` sheet — 10 routes × 5
  fiscal years × sections, including TOC 1–15 allocation columns. That gives section-level capacity.
- It does **not** give line classification. `railRegisterData.ts` marks register content 3 as
  `in-appended-file`; `railStatementData.ts` records annexure id 6 ("SIMPLIFIED CLASSIFICATION
  FILE") as `have: false`.
- NS V4 §4.8.3.3 separately holds that an operator's *actual contracted* train paths are
  confidential and not publicly available, with only total and uncommitted capacity declared to the
  Regulator. So even the appended file would not reveal who holds which column.

**Consequence, stated plainly:** a section-level N1/N2 line-class field must not be inferred,
mapped from KPI sheet headers (`7.4 (N2)`, `6.3 (N1)` appear in Annexure 43 route sheets as
baseline values, not as a network classification register), or constructed from corridor names. The
register, statement and sources pages correctly report it as outstanding and that remains correct.

### 3.2 Executed agreements and allocation evidence

Annexure 15 leaves identity, commencement, allocated slots and signatures blank; Annexure 18 is an
excerpt; the operator roster in `docs/rail-transnet-source-traceability.md` (S7) is explicitly
non-authoritative. No source in this repository establishes any of the 11 private operators' legal
identities, executed rights, allocated paths or interface agreements. Tenant onboarding must not be
driven from TOC column numbers.

### 3.3 Annexure 36's own annexures

§8.1 points to ten further documents (Crisis Communication Strategy, S.O.A.R, RIC 48-hour report,
Spad report, PRASA Metro/SHosholoza plans, Gautrain plan, ICS). None is supplied; all ten are
listed on the page as outstanding rather than assumed.

### 3.4 Operational actuals

Still absent: SPRINT OTD feeds, realised transit times, TSR logs. Annexure 43 supplies baselines and
targets only, so every KPI variance view remains *planned* versus *target*, never *actual*.

---

## 4. Guardrails confirmed in the new pages

- Both pages render inside `ReferenceNotice`: source-derived, read-only, not live railway state.
- Annexure 36 is labelled a **TFR internal procedure**, not an access-regime document, conferring no
  authority on FlowOps at a Transnet scene and not making FlowOps a responder.
- Contact numbers are displayed with an explicit "uncontrolled copy when printed" warning and a
  statement that the NCC's live activation list is authoritative.
- Annexure 15 rates are labelled indicative, with pointers to `/rail/tariffs` (NS V4 Table 17) and
  `/rail/slots` (Annexure 33b) as the billing and capacity sources of record.
- No placeholder was filled in, no missing value was inferred, and no duplicate or typo in the
  sources was silently corrected.

---

## 5. Verification

```
cd frontend
./node_modules/.bin/tsc --project tsconfig.app.json --noEmit   # EXIT 0
npm run lint                                                    # EXIT 0 — 0 errors, 33 warnings (pre-existing class)
npx vitest run                                                  # 62 files, 996/996 pass
npm run build                                                   # built in 26.4 s, PWA precache 201 entries
```

New test file `src/pages/RailAnnexure15And36.test.tsx` (15 tests) asserts the guardrails rather than
just the render: the Access Seeker placeholder is shown as a placeholder, the unexecuted-form warning
is present on first paint, all seven conditions precedent render, billing readers are pointed at the
controlled tariff source, all three activation levels carry distinct codes, the scenario matrix
covers A–E, and — as a regression guard on Finding 2 — **every Annexure C rate is asserted equal to
the corresponding NS V4 Table 17 row**. If either document is re-issued with different numbers, that
test fails.

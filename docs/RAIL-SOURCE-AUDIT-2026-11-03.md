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
| 13 | `Annexure 33 Capacity Statement (4).xlsm` | `d0505e84…` | `railCapacityData.ts` | `/rail/slots` | ingested (1,035 rows) — **revised 2026-10-23, see §7** |
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
| 25 | `annexure33a-full-raw.tsv` | `e3b0c442…` (**0 bytes**) | — | — | **removed this round** (see §6 for the two later re-uploads) |

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
npx vitest run                                                  # 63 files, 1,007/1,007 pass (after §7: 64 files, 1,020)
npm run build                                                   # ok, PWA precache 201 entries
```

(Re-run after §6: 63 files, 1,007/1,007 pass — the extra 11 are `RailAnnexure33Verification.test.ts`.)

New test file `src/pages/RailAnnexure15And36.test.tsx` (15 tests) asserts the guardrails rather than
just the render: the Access Seeker placeholder is shown as a placeholder, the unexecuted-form warning
is present on first paint, all seven conditions precedent render, billing readers are pointed at the
controlled tariff source, all three activation levels carry distinct codes, the scenario matrix
covers A–E, and — as a regression guard on Finding 2 — **every Annexure C rate is asserted equal to
the corresponding NS V4 Table 17 row**. If either document is re-issued with different numbers, that
test fails.

---

## 6. Verification round — re-uploaded Annexure 33 pair (2026-11-03, later)

The user re-uploaded two files through the GitHub web interface at repo root:

- `Annexure 33 Capacity Statement (2).xlsm`
- `Annexure 33_Network Register June 2026 F (2).pdf` (note the `(2)` suffix; `sources/` holds `(1)`)

### 6.1 Both files are byte-identical duplicates

| Uploaded at root | SHA-256 | Matches |
|---|---|---|
| `Annexure 33 Capacity Statement (2).xlsm` | `2d3f591515a339b57fb17e695796dcbe2cc7522ce39c4c329dcb70f325a3515b` | `sources/Annexure 33 Capacity Statement (2).xlsm` — identical |
| `Annexure 33_Network Register June 2026 F (2).pdf` | `1e2842cbf88c9382a18c604240a79cee985e85f7966fd90a081cdb12b68c9fa0` | `sources/Annexure 33_Network Register June 2026 F (1).pdf` — identical |

Neither is a new revision. The `(2)` on the register is the browser's download-dedupe suffix, not a
document version — the PDF itself is still Network Register **v0.3, 26 June 2026**. Both root copies
were removed, following the round-72 precedent (a re-uploaded Annexure 15 was deduped against
`sources/` rather than copied); the controlled originals in `sources/` are untouched and their hashes
still match the values stamped in `railCapacityData.ts` and `railRegisterData.ts`.

### 6.2 Content re-verified against the built data

**Capacity Statement (33b)** — full field-by-field comparison of all **1,035** `Capacity_DB` rows
against `railCapacityData.ts`: 12 key/identity fields plus 20 numeric fields per row
(theoretical daily capacity, TSR loss, MA loss, infra recovery, unused/recovered, and all 15
TOC allocation columns).

- **0 numeric mismatches** across 20,700 numeric cells.
- Row count matches exactly: the workbook's `Capacity_DB` sheet has 1,416 `<row>` elements, of which
  1,036 carry values — 1 header + **1,035 data rows**, which is what the module declares.
- Sheet inventory matches: `Capacity Statement`, `Capacity_DB`, `Lists`; capacity factor 0.65;
  five fiscal years FY26/27–FY30/31; 10 routes.

**Network Register (33)** — 8 pages, `Annexure 33 – Network Register (June 2026_v0.3)`, dated
June 26 2026, "Applicable for the 2026/27 timetable" — all confirmed in the re-uploaded text.
The E-33REG-01 anomaly is present exactly as recorded: route 9 and route 10 both print
"General Freight: Musina - Pyramid South/Hoedspruit", and
"General Freight: Vereeniging/Danskraal to East London" appears **zero** times in the register
(though it exists in the 33b `Capacity_DB` with 195 rows).

### 6.3 Two defects found and fixed

**Defect 1 — the workbook's XML escaping leaked to the screen (132 strings).**
The `.xlsm` shared strings store the coal export route as
`General Freight &amp; Export Coal: Lephalale to Richards Bay`. That is an XML-escaping artifact of
the file, not authored text, and `railCapacityData.ts` had preserved it verbatim. Two consequences:

- The Slots & Capacity route dropdown rendered the literal characters `&amp;`, because React prints
  a JS string as-is — no entity decoding happens.
- Row `key` fields had been hand-normalised to `&` while `route` fields kept `&amp;`, so a row's key
  no longer equalled `fy|route|order`.

Both are now decoded to `&`. The decision follows E-AMP-01 (the 33a corpus keeps the extract's
decoded `&`) and is corroborated by the Network Register, which prints the same route with a plain
`&`. The module header records the reasoning so a future re-import does not silently reintroduce it.
The same artifact was fixed in one user-visible comment string in `railKpiData.ts`.

**Defect 2 — main's history had been replaced by an orphan commit.**
The web-interface upload (commit `5bdb81a`, "Add files via upload") arrived as a **root commit with
no parent**, and its tree is `aef4f92`'s tree plus the two duplicate files — i.e. all prior history
(`aef4f92` and everything before it) is no longer an ancestor of `main`. This branch was rebased onto
`5bdb81a` so the pull request keeps a shared ancestor and can merge normally. Nothing in the file
trees was lost: the only content difference between `aef4f92` and `5bdb81a` is the two duplicates
removed in §6.1.

### 6.4 Regression guard

`frontend/src/pages/RailAnnexure33Verification.test.ts` (11 tests at §6; 17 after §7) locks in the
properties this round actually checked: 1,035 rows, 10 routes × 5 FYs, unique keys, `key === fy|route|order` for
every row, every dropdown route resolving to real rows and vice-versa, 15 TOC columns per row, no
`&amp;` in any rendered string, the coal route spelled as the register spells it, the register's
declared identity, and the E-33REG-01 anomaly reproduced rather than corrected.

## 7. Revision record — Annexure 33 Capacity Statement `(4)` (2026-11-03, later again)

A second web-interface upload arrived on the same day (main `d18d8b7`, whose parent is `5bdb81a` —
so this upload is a **normal child commit** and the §6.3 Defect 2 orphan-history problem stays fixed).
It carried two root-level files.

### 7.1 Disposition of the two files

| Uploaded file | Size | SHA-256 | Disposition |
|---|---:|---|---|
| `Annexure 33a_NS ver.4 (4).xlsx` | 15,258,573 B | `93b4d449…` | **byte-identical duplicate** of `sources/Annexure 33a_NS ver.4 (2).xlsx` → discarded from the working tree, nothing ingested |
| `Annexure 33 Capacity Statement (4).xlsm` | 174,170 B | `d0505e84faa324f07cad03768c07c5a4fc35e9413556c863d3d15ac6b4364c80` | **genuine later revision** → now the live source, `sources/Annexure 33 Capacity Statement (4).xlsm` |

Both files were compared at the byte level before anything was read. The `.xlsx` is the third
identical copy of that corpus file to be re-uploaded, which is why the dedupe step runs first.

The workbook is the same artefact, revised in place: same three sheets (`Capacity Statement`,
`Capacity_DB`, `Lists`), same 23 package parts, **no rows added or removed** (1,035 `Capacity_DB`
data rows before and after), no route, section or depot renamed, `Lists` untouched.

| | Superseded | Live |
|---|---|---|
| SHA-256 | `2d3f5915…` | `d0505e84…` |
| Modified | 2026-07-03T07:54:48Z | **2026-10-23T07:50:17Z** |
| Last modified by | Thabo Manamela | **Asheena Mathura** |
| Both created | 2026-05-12T03:21:50Z | ← unchanged |

### 7.2 What the revision actually changes

**Allocation columns are now populated for all five fiscal years.** `Capacity_DB` gains 15,836
populated cells and loses none, entirely in the allocation block (columns H–Z: TSR, MA,
infrastructure recovery, unused-from-TOC, and TOC 1–15). The superseded revision carried data for
FY26/27 only; the live one carries all five:

| Fiscal year | Added cells |
|---|---:|
| FY26/27 | 104 (all literal `0`, rows 812–852 and 1017–1020 — no semantic change) |
| FY27/28 | 3,933 |
| FY28/29 | 3,933 |
| FY29/30 | 3,933 |
| FY30/31 | 3,933 |

The FY26/27 additions are worth stating plainly: they are zeros, so FY26/27's numbers are
unchanged by the revision. The other four FYs gain real allocations — 207 section rows each, of
which **184 carry an allocation/loss value, in every one of the five FYs**. That is the same 184 the
original survey counted for FY26/27: the revision brought the other four years up to exactly that
coverage, and no further. The remaining 23 rows per FY carry theoretical capacity with nothing
allocated against them, which is a genuine operational state rather than missing data.

**Twelve theoretical-capacity cells are revised, and they are the only numeric revisions.**
All twelve sit on *General Freight: Vereeniging/Danskraal to East London*, repeating identically
across FY27/28, FY28/29, FY29/30 and FY30/31:

| Order | Section | Superseded | Live |
|---|---|---|---:|
| 37 | BETHLEHEM (E) – ARLINGTON (E) | 24 | **19** |
| 38 | ARLINGTON (I) – GUNHILL (I) | 21 | **27** |
| 39 | GUNHILL SOUTH (I) – KROONSTAD (E) | 22 | **12** |

These are the *FY26/27 values*, restored. The revision therefore **reverses** the FY26/27→FY27/28
step-up that the superseded revision showed on this route. FY26/27 itself is numerically unchanged
in all 207 of its rows.

**The only other cells that differ are the workbook's saved dropdown state**, not data: sheet 1
records `FY29/30 → FY26/27` and Route Spare Capacity `49 → 35` because whoever last saved the file
had different selectors open. §6 already established these must not be reported as revisions; the
same rule applies here.

### 7.3 Consequence — one earlier finding was wrong, and is corrected

`docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md` §11.5 cited six sections whose
theoretical capacity changes between FY26/27 and FY27/28 "on the Johannesburg–Durban route". Two
separate errors:

1. **Wrong route.** BETHLEHEM–ARLINGTON, ARLINGTON–GUNHILL and GUNHILL SOUTH–KROONSTAD are on the
   *Vereeniging/Danskraal–East London* route, not Johannesburg–Durban. Only DONNYBROOK–FRANKLIN,
   FRANKLIN–MATATIELE and CHAILEY–KRANSKOP are Johannesburg–Durban.
2. **Wrong premise, as of this revision.** All three East London sections are now flat across all
   five FYs, so they no longer vary at all.

The section has been rewritten against the live workbook: exactly **three** sections vary across
fiscal years (3 of 207, down from 6), all on Johannesburg–Durban, all stepping once into FY27/28:

`DONNYBROOK (E)–FRANKLIN (I)` 15 → 16 · `FRANKLIN (E)–MATATIELE (I)` 12 → 13 ·
`CHAILEY (E)–KRANSKOP (I)` 14 → 15.

The workstream conclusion is unchanged and in fact reinforced — capacity *is* versioned by
financial year, so a rule without an effective period would be wrong — but no rule may now assume a
given section varies by FY. Variation has to be read from the data, and the set of varying sections
*shrank* between two revisions of the same workbook.

### 7.4 Code changes

| File | Change |
|---|---|
| `sources/Annexure 33 Capacity Statement (4).xlsm` | added (live source); `(2)` retained on disk as the superseded revision |
| `scripts/regenerate-rail-capacity.py` | **new** — regenerates `railCapacityData.ts` from a workbook instead of hand-editing 1,035 rows; emits exact cell values, decodes the `&amp;` artifact, and rebuilds the sheet-1 snapshot grid |
| `frontend/src/data/railCapacityData.ts` | regenerated from `(4)`: new hash + `revision`/`supersedes` provenance block, allocation data for all 5 FYs, the 12 revised values, sheet-1 snapshot rebuilt (`selectedFY` FY26/27, `routeSpareCapacity` 35, and the `Bottleneck Section(s)` cell now populated — `CATO RIDGE (E) - BOOTH (I)` — where the superseded file left it empty) |
| `frontend/src/pages/RailCapacity.tsx` | **E-33B-01 banner retired**; an FY now shows a confirmation that its allocation columns are complete, naming the retired caveat and the revision that retired it. Snapshot prose corrected: the workbook's own bottleneck cell is no longer empty, though its `Constraint Indicator` column still is |
| `frontend/src/pages/RailAnnexure33Verification.test.ts` | 11 → **17** tests: hash/provenance, all-five-FY allocation coverage (pinned to 184/207), the 12 revised values, exactly-three-varying-sections (with the East London route asserted flat), snapshot shape, no `&amp;` in the snapshot grid |
| `frontend/src/pages/RailCapacity.test.tsx` | **new, 7 render tests**: retired banner can no longer appear, every FY selectable and none allocation-starved, 184/207 coverage per FY, revised East London sections render, workbook bottleneck cell shown, no `&amp;` anywhere in the DOM |
| `docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md` | §11.5 rewritten, with the two errors recorded inline (§7.3) |
| `docs/RAIL-ANNEXURE-33B-CAPACITY-SURVEY-2026-10-10.md` | **E-33B-01 retired**, both hashes recorded, page description updated |
| `docs/RAIL-UI-PAGES-AND-PANELS-2026-10-10.md` | page row updated |

The E-33B-01 flag is retired rather than deleted: the earlier report was *correct for the file it
described*, so the record stays and the retirement is dated. Deleting it would leave a reviewer
unable to tell whether the flag was wrong or simply superseded.

### 7.5 Re-verification

Regeneration was verified **against the workbook, not against the previous module**: all 1,035 rows
and their 11 columns (11,385 field comparisons, 15,525 TOC values) were compared cell-for-cell with
`xl/worksheets/sheet2.xml` read through `xl/sharedStrings.xml`. **0 mismatches.**

The module diff vs the superseded projection is exactly the expected set:

| Measure | Count |
|---|---:|
| Rows added / removed | 0 / 0 |
| `theoreticalDaily` changes | 12 (the table in §7.2, nothing else) |
| TOC allocation arrays changed | 684 (4 FYs × 171 rows) |
| TSR/MA/recovery/unused cells changed | 516 |

Gates on the regenerated build:

```
tsc --project tsconfig.app.json --noEmit                    # 0 errors
vitest run                                                  # 64 files, 1,020/1,020 pass
npm run lint                                                # 0 errors / 33 warnings
npm run build                                               # ok, 201 precache entries
```

`RailAnnexure33Verification.test.ts` is 17 tests; a new `RailCapacity.test.tsx` adds 7 render-level
tests so the page's behaviour is pinned as well as the data's.

### 7.6 Regression guard

The 6 new tests pin the *delta*, not just the shape: the live hash, the retained superseded hash,
allocation coverage on every FY, the three revised values across four FYs, and the fact that only
three sections vary and that none of them is on the East London route. A future re-import of the
older revision — or a silent hand-edit of the module — trips these tests rather than quietly
changing what the product shows.

---

## 8. Coverage & gaps surface (`/rail/coverage`, 2026-11-03)

The register answers "do we have this annexure?". It does not answer "what can't we build without
it?", which is what actually drives the work. This round adds that second axis as a product surface
rather than another markdown file.

### 8.1 What the page derives

`frontend/src/data/railCoverageData.ts` attaches three pieces of metadata to every one of the 49
annexures:

| Axis | Values | Purpose |
|---|---|---|
| Capability | Network reference · Capacity & allocation · Access & contracting · Train operations · Safety & occurrences · Commercial | which part of the product the source feeds |
| Criticality | `blocker` · `important` · `reference` | `blocker` is reserved for sources without which an operating workflow cannot be modelled correctly |
| Effect | free text | delivered: what it unblocks · outstanding: what stays blocked |

Titles, chapters and delivered state are **not** duplicated — they are joined at runtime from
`annexureRegister`, so flipping `have: true` there updates this page with no second list to maintain.

### 8.2 Position at time of writing

Every figure below is produced by `coverageSummary` in `railCoverageData.ts` — the same values the
page renders — not transcribed by hand.

| | Count |
|---|---:|
| Annexures in register | 49 |
| Delivered | 20 |
| Outstanding | 29 |
| — of which blocking | 8 |
| — of which important | 12 |
| — of which reference | 9 |

The three criticality counts **reconcile with the outstanding total** (8 + 12 + 9 = 29), and the page
prints that identity next to the stat cards so the arithmetic is visible rather than implied. The
register-scoped totals are kept separate from the outside-register gaps for exactly this reason: a
card that mixed the two would stop adding up.

**Blocking annexures — 8:** 6, 24, 19A, 19B, 19C, 37, 38, 39. Named plainly:

| Id | What it blocks |
|---|---|
| 6 | The N1/N2 line-classification layer — the last structural dimension of the network model |
| 19A / 19B / 19C | The safe-working rulebook — nothing driver-facing can be authored without it |
| 24 | Interface Management Agreement — occurrence cost cannot be attributed with authority |
| 37 / 38 / 39 | The monthly order, weekly train-path order, and the handshake dispute-resolution route |

**Plus 5 derived gaps** that the register's own ticks hide: the Annexure 33 appended data file
(section slots + N1/N2 line class), Annexure 36's ten §8.1 sub-annexures, executed operator
agreements, operational actuals, and the ancillary/marshalling rates deferred to a future volume.
Two of those five are `blocker` class — the appended 33 file and the executed agreements — so the
true count of sources that block a workflow is **10, not 8**. The "Blocking gaps" card therefore
carries `+2 outside the register` and the page states the total in words beneath the row; the
derived-gap section header states how many of its entries block.

Neither number is allowed to drift: `RailCoverage.test.tsx` pins both the reconciliation identity
and the literal blocker id set, and renders the sentence that names the 10.

### 8.3 Guardrails encoded in tests

`frontend/src/pages/RailCoverage.test.tsx` (16 tests) asserts, among others:

- every register id has a coverage row **and** no coverage metadata is orphaned — a new annexure
  cannot be added without deciding what it blocks;
- every outstanding row's text begins `"Unavailable."`, so prose cannot drift into describing a
  document that has never been seen;
- no undelivered annexure claims a route, and every claimed route starts `/rail`;
- the five derived gaps are present, including the one that sits behind the delivered tick on
  Annexure 33;
- the blocker id set is pinned literally, and the page names the total blocking count
  (register + outside) — so the prose and the panel cannot disagree.

### 8.4 Verification

```
tsc --project tsconfig.app.json --noEmit   0
npm run lint                               0 errors, 33 warnings
npx vitest run                             65 files, 1,037/1,037 pass
npm run build                              ok, PWA precache 202 entries
```

## 9. Capacity ceilings — the sum was wrong as a capacity measure (2026-11-03, later again)

`/rail/slots` has always shown per-section rows with a stat row at the top that **adds them**. That
addition is arithmetically correct and operationally meaningless: a train path occupies one slot on
every section it traverses, so a route's ceiling is its **narrowest** section, not the total of all
of them. The Johannesburg–Durban route has 41 sections; the page's "Theoretical daily (sum)" of 2,077
reads as if the corridor could pass 2,077 trains a day when its ceiling is a fraction of a percent of
that.

The sum is still shown — it is a real property of the deliverable, and hiding it would be its own
distortion — but it now carries a note saying what it is not, and a new panel derives the figure that
matters.

### 9.1 Route ceiling

`frontend/src/data/railCapacityAnalysis.ts` reduces each route/FY to its bottleneck section:

```
ceiling          = min(theoreticalDaily) over open sections
practical/day    = round(0.65 x ceiling)
weekly ceiling   = practical/day x 7
allocated        = sum(tocAllocated TOC 1..15) on that bottleneck section only
spare            = weekly ceiling - allocated
utilisation      = allocated / weekly ceiling
```

Allocation is deliberately **not** summed across sections. Allocations recorded on different sections
describe different traffic over the same line; adding them would double-count every path that runs
more than one section, which is nearly all of them. The panel says so.

Sections whose depot reads `(Line Closed)` are excluded from the ceiling and counted in the row
caption — a theoretical figure on a closed line cannot be sold. One such section exists in the
workbook (`KAAPMUIDEN (E) - BARBERTON (I)`, Eastern Mainline).

### 9.2 What the five years actually contain

The 2026-10-23 revision populates TSR / maintenance / infrastructure-recovery / unused / fifteen TOC
columns for all five fiscal years. Computed comparison against FY26/27 (`fyConsistency`):

| Compared with FY26/27 | Sections differing |
|---|---:|
| TOC allocation (all 15 columns) | **0** |
| TSR / MA / infrastructure recovery / unused from TOCs | **0** |
| Theoretical daily capacity | **3** |

The three capacity cells are all on Johannesburg–Durban, all applying from FY27/28 onward:

- `CHAILEY (E) - KRANSKOP (I)` — 14 → 15
- `DONNYBROOK (E) - FRANKLIN (I)` — 15 → 16
- `FRANKLIN (E) - MATATIELE (I)` — 12 → 13

**Consequence:** FY27/28–FY30/31 allocation is a restatement of FY26/27, not a committed allocation
plan. The page states this in words generated from the same computation, so the claim cannot drift
from the data. It matters commercially: four of the five years look like a forecast and are not one.

### 9.3 Position the panel produces (FY26/27, tightest first)

The table below was printed by `routeHeadroom("FY26/27")`, not written out by hand.

| Route | Ceiling/day | Weekly ceiling | Allocated wk | Spare wk | Utilisation |
|---|---:|---:|---:|---:|---:|
| Manganese | 11 | 49 | 42 | 7 | 86% |
| Eastern Mainline: Rayton to Komatipoort/Richards Bay | 13 | 56 | 44 | 12 | 79% |
| Ore | 12 | 56 | 43 | 13 | 77% |
| Magnetite | 14 | 63 | 31 | 32 | 49% |
| GF & Export Coal: Lephalale–Richards Bay | 7 | 35 | 9 | 26 | 26% |
| GF: Vereeniging/Danskraal–East London | 8 | 35 | 8 | 27 | 23% |
| GF: Mafikeng–Beaconsfield/Potchefstroom | 6 | 28 | 3 | 25 | 11% |
| GF: Johannesburg–Cape Town | 21 | 98 | 9 | 89 | 9% |
| GF: Musina–Pyramid South/Hoedspruit | 13 | 56 | 3 | 53 | 5% |
| GF: Johannesburg–Durban | 11 | 49 | 0 | 49 | 0% |

Three things follow that the summed figures concealed:

1. **The tight routes are the bulk corridors, not the big ones.** Manganese (86%), the Eastern
   Mainline (79%) and Ore (77%) are the only routes above 70%. The General Freight corridors — the
   ones with the most sections and the largest sums — have the most headroom.
2. **Section count is not capacity.** Johannesburg–Durban's 41 sections reduce to 11 trains a day at
   its binding section; Mafikeng's 17 sections reduce to 6. Conversely Johannesburg–Cape Town's 30
   sections still clear 21 a day.
3. **Zero allocation at the binding section does not mean an idle corridor.** Johannesburg–Durban
   shows 0% because nothing is allocated on `FRANKLIN (E) - MATATIELE (I)` specifically, while other
   sections of the same route carry allocations. The honest reading is that the recorded allocation
   is section-specific, which is precisely why the panel refuses to total it.

### 9.4 Verification

```
tsc --project tsconfig.app.json --noEmit   0
npx vitest run                             see §10
```

`railCapacityAnalysis.test.ts` (10 tests) proves the ceiling is the minimum over open sections, that
it is never larger than the summed figure, that allocation never exceeds the ceiling, and pins the
three-cell year-on-year finding so a future revision cannot silently invalidate the page copy.

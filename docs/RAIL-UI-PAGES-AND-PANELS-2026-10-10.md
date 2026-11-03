# Rail UI — pages, sidebar & panels plan (2026-10-10)

**Why now:** Annexure 33a (working timetables, 251,678-row extract; verified corpus mirror in
`rail-source-check/`) and Annexure 43 (KPI baselines/targets, native XLSX) are both in the
workspace. The backend rail module (slot/tariff/timetable/handshake/possession/occurrence/
weighbridge/DG services) and a first UI slice (`/rail`, `/rail/handshake`, `/rail/timetable` +
panels under `frontend/src/pages/rail/`) already exist. This document says what to build next so
the two annexures become a working product, and **exactly which source files are still needed**.

---

## 1. What exists today

| Surface | Route | Status |
|---|---|---|
| Rail & Intermodal (ops console) | `/rail` | live — sections: change requests, possessions, occurrences, weighbridge, DG, tariff panel, slot compliance, envelope checker |
| Daily Handshake | `/rail/handshake` | live — TOC↔IM deviation reconciliation |
| Rail Timetable | `/rail/timetable` | live but **admin-only**, not in the sidebar |
| Panels | `src/pages/rail/*` | TariffPanel, SlotCompliancePanel, SlotApplicationDrawer, PossessionsSection, PossessionConflictBanner, OccurrencesSection, ChangeRequestsSection/Modal, WeighbridgeSection, DangerousGoods, EnvelopeChecker, NoteModal |
| Sidebar | `AppLayout.tsx` | rail sits as two items inside the **OPS** section |

Gap: there is nowhere that (a) browses the timetable corpus, (b) shows Annexure 43 KPIs, or
(c) joins the two into variance analytics.

---

## 2. Sidebar — promote rail to its own section

New `RAIL` section in `AppLayout.tsx` (between OPS and COMMUNICATIONS), permission/entitlement
`rail` as today. Suggested order — operator workflow left to right:

| # | Label | Route | Source of truth | Status |
|---|---|---|---|---|
| 1 | Rail Ops Console | `/rail` | operational data | exists |
| 2 | Timetable Explorer | `/rail/timetable` | Annexure 33a corpus + full extract | **promote** (drop `adminOnly`, keep `rail` perm) |
| 3 | Corridor KPIs | `/rail/kpis` | Annexure 43 | **new page** |
| 4 | Slots & Capacity | `/rail/slots` | Annexure 33b (needed) + slot services | **new page** (elevate SlotApplicationDrawer + SlotCompliancePanel) |
| 5 | Tariffs & Access Pricing | `/rail/tariffs` | tariff proposal + Annexure 40 (needed) | **new page** (elevate TariffPanel) |
| 6 | Daily Handshake | `/rail/handshake` | handshake service | exists |
| 7 | Occurrences & Possessions | `/rail/occurrences` | occurrence/possession services + Anx 41 (needed) | **new page** (elevate the three sections) |
| 8 | Compliance & Dangerous Goods | `/rail/compliance` | DG rules + envelope checker | **new page** (elevate EnvelopeChecker + DangerousGoods) |
| 9 | Network Sources | `/rail/sources` | provenance: corpus MD5s, 32 preserved flags, annexure register | **new page** (audit/traceability) |

Keep the two existing OPS entries as deep links for one release, then remove them to avoid
duplication.

---

## 3. Pages — what each one does

### 3.1 Timetable Explorer (`/rail/timetable`) — promote + power
- Search by **train number, origin depot, station/siding, corridor** over the verified corpus
  (43 depots / 799 workings today) with the full 688-origin extract behind an "extended" toggle.
- Working detail: the 19-field row grid verbatim (blanks preserved), day-roll calendar strip
  (`Depart_Day` 0/1/2), stated-vs-computed runtime with **flag badges for the 32 preserved source
  anomalies** — displayed, never edited (source-integrity rule).
- Depot coverage matrix: which of the 688 extract origins are curated into the corpus.
- Export: per-working TSV (byte-identical to source rows).

### 3.2 Corridor KPIs (`/rail/kpis`) — new (Annexure 43)
- One card per **train path** (Ore, Manganese, Magnetite, Musina–Pyramid/Hoedspruit,
  Vereeniging/Danskraal–East London, Mafikeng–Beaconsfield/Potchefstroom, Lephalale–Richards Bay,
  JHB–Durban, Rayton–Komatipoort/Richards Bay, JHB–Cape Town).
- Gauges per KPI: **baseline → target** with reduction % (TSR km/%, speed restrictions, manual
  train authorisations, TQI, traction substation availability). Transit-speed rows rendered as
  HH:MM:SS (Excel serials × 24 — see survey exception E-43-01).
- Current vs Future framework tabs (OTD reliability, delay attribution, slot modification,
  IM/TOC compliance, unit costs — future items show "not yet measured" states, never invented data).

### 3.3 Transit-time variance (the flagship panel — inside KPIs and Timetable)
- Annexure 33a = **planned** times; Annexure 43 = **target** times; actuals (SPRINT/ops) = third
  leg once supplied. Until actuals land, show Planned vs Target per corridor pair (computable
  today from the two annexures) and grey the Actual column with a "source required" chip.

### 3.4 Slots & Capacity (`/rail/slots`) — new, needs Annexure 33b
- Slot request builder mirroring the **15-step TOC application process** (retrieval manifest §5);
  ad-hoc path requests with the 21-day / 1–14-day SLA timers (V3 figures — period caveat shown).
- Capacity view per corridor from Annexure 33b; conflict detection against possessions
  (PossessionConflictBanner reused).

### 3.5 Tariffs & Access Pricing (`/rail/tariffs`) — new, needs rates
- Access + ancillary quoting joined to timetable legs (distance × rate, per corridor).
- Ancillary catalogue browser (Annexure 40, 40 items / 4 tiers — catalogue only until rates arrive);
  every unpriced line shows an explicit "rate not supplied" state.

### 3.6 Occurrences & Possessions (`/rail/occurrences`) — new
- Occurrence intake following Annexure 41 procedure; possession calendar with change-request
  overlays; handshake-dispute escalation ladder kept **distinct** from application disputes
  (G-1 lesson).

### 3.7 Compliance & DG (`/rail/compliance`) — new
- Rolling-stock envelope checker + DG classification workflows as first-class screens.

### 3.8 Network Sources (`/rail/sources`) — new
- The traceability story as a product surface: annexure register (hashes, versions, periods),
  corpus file manifest (rows/workings/MD5), preserved-anomaly list (32 flags with explanations),
  V3-structure-only exception register.

---

## 4. Sidebar panels / dashboard widgets

For the Rail Ops Console home (and a rail tab on Dashboard):

| Panel | Data | Notes |
|---|---|---|
| Corridor KPI strip | Anx 43 | 10 paths × headline transit-speed gauge |
| TSR exposure | Anx 43 | km + % under temporary speed restriction vs 1.6% target |
| Manual authorisations | Anx 43 | counts + reduction progress bars |
| TQI & traction availability | Anx 43 | per path, N/A states honoured (e.g. "Line not electrified") |
| Planned-vs-target transit | Anx 33a + 43 | variance chart (planned leg) |
| Working quick-find | Anx 33a corpus | train/depot jump |
| Anomaly watchlist | corpus flags | the 32 preserved source anomalies |
| Source provenance card | manifest | last ingestion, hashes, coverage 43/688 origins |
| Slot pipeline | slot service | requests by stage of the 15-step flow |
| Handshake health | handshake service | open deviations, disputes |

---

## 5. Source files still needed (priority order)

The sandbox cannot reach `transnet.net` (manifest rule) — please upload these to `sources/`:

| # | File | Why (blocks) |
|---|---|---|
| 1 | **Annexure 33b — Capacity Statement** (XLSM, V4-06) | Slots & Capacity page; corridor capacity baselines |
| 2 | **Approved tariff / rate schedule FY2026/27** (with **rates** — the 2025/26 proposal has none) | Tariffs & Pricing money path |
| 3 | **Annexure 40 — Ancillary Services Catalogue** (PDF, V4-07) | complete the 40-item catalogue beyond the chat sample |
| 4 | **Annexure 33 — Network Register** (PDF, V4-04) | station/siding master to join 33a's `ENRTE_Station/siding number`s |
| 5 | **Network Statement V4 body** (PDF, V4-01) | normative rules for slot/handshake/occurrence flows |
| 6 | **Annexure 41 — Occurrence Reporting Procedure** (PDF, V4-08) | Occurrence intake rules |
| 7 | **Annexure 15 — Rail Access Agreement** (PDF, V4-02) | contract lifecycle |
| 8 | **Annexure 42 + V4-11 Publication Notice** | collaboration policy; gazette evidence |
| 9 | **V3 Annexure 20a/20b** (cancel/reschedule + reasons), **28** (handshake process), **29a/32** (application + ad-hoc slot), **19b** (working rules) | structure only — period caveat applies |
| 10 | **Operational actuals** (SPRINT on-time data, realised transit times, TSR/downtime logs) | the "Actual" leg of variance; not in the annexure set |
| 11 | *(optional)* Annexures 2–12 (maps/profiles) | available under signed **Annexure 31 NDA** — needed for map-based corridor views |

Also useful: **KPI reporting packs** (quarterly/annual outputs that Annexure 43 targets are
measured against) and any **period update of Annexure 33a** (the workbook is ver.4 — future
versions will need the same reconciliation treatment).

---

## 6. Suggested build order

1. Timetable Explorer power-up + Network Sources (data already in-repo — pure UI).
2. Corridor KPIs page + KPI strip panels (Annexure 43 already in-repo).
3. Planned-vs-target variance (33a × 43 join).
4. Slots & Capacity when 33b lands; Tariffs when rates land.
5. Occurrences/Compliance elevation; actuals integration when operational data arrives.

---

## 7. Build status (2026-10-10, round 67/68)

**Built and committed (this round):**

| Item | Status |
|---|---|
| **RAIL sidebar section** in `AppLayout.tsx` (own section between OPS and COMMUNICATIONS) | ✅ Rail Ops Console · Timetable Explorer · Corridor KPIs · Slots & Capacity · Tariffs & Charges · Network Register · Investment Plan · Occurrence & Policy · Daily Handshake · Network Sources |
| `/rail/timetable` promotion (admin-only → `rail` permission) | ✅ |
| **Corridor KPIs page** (`/rail/kpis`, `RailKpis.tsx`) | ✅ 10 train-path cards (baseline→target, verbatim Annexure 43), Current/Future framework tabs, E-43-01 banner, planned-vs-target corpus-match panel |
| **Network Sources page** (`/rail/sources`, `RailSources.tsx`) | ✅ corpus stats, byte-mirror proof, source register (hashes), corridor mix, anomaly classes, wanted-sources list |
| **Slots & Capacity page** (`/rail/slots`, `RailCapacity.tsx`) | ✅ FY×route selectors over Capacity_DB (1,035 rows), raw + derived-labelled section table, totals, derived bottleneck, full-allocation confirmation (E-33B-01 retired 2026-11-03), formula panel, as-delivered workbook snapshot card |
| **Tariffs & Charges page** (`/rail/tariffs`, `RailTariffs.tsx`) | ✅ Annexexure 40 catalogue browser (4 tiers / 40 groups), tier filter + search, UOM badges ("TBD in source — preserved"), E-TARIFF-01 rates-gap banner on every line, anomaly policy footer |
| **Network Register page** (`/rail/register`, `RailRegister.tsx`) | ✅ Annexure 33 (June 2026 v0.3): capacity declaration purpose, contents map (appended data file flagged as open want), critical vandalised sections (Leeuhof–Warrenton, Thabazimbi–Rustenburg), route list with E-33REG-01 preserved, TRIM-only scope |
| **Investment Plan page** (`/rail/investment`, `RailInvestment.tsx`) | ✅ Annexure 17 tables verbatim (R'bn): categories, programmes, corridor COPEX with PSP markers, supplementary BFI funding, 6 expansion initiatives, definitions |
| **Occurrence & Policy page** (`/rail/occurrence`, `RailOccurrence.tsx`) | ✅ Annexure 41 RSR timelines (15 min / 12 h / daily 11:00 / quarterly) + full category matrix A–O + security 1–9 with TRIM/TOC Y/N flags (E-ANX41-01 "CATEGORY 0" preserved) · Annexure 42 collaboration policy tab |
| Data modules | ✅ `src/data/railKpiData.ts` (generated from Annexure 43 + corpus OD matches), `src/data/railSourceData.ts`, `src/data/railCapacityData.ts` (round 68), `src/data/railAncillaryData.ts` (round 68), `src/data/railRegisterData.ts`, `src/data/railInvestmentData.ts`, `src/data/railOccurrenceData.ts` (round 69) |
| CI | ✅ `tsc --noEmit` clean · `vite build` clean · **749/749 frontend tests pass** |

**Built round 68:** Slots & Capacity (Annexure 33b) and Tariffs & Charges (Annexexure 40
catalogue — rates still external, E-TARIFF-01).

**Built round 69:** Network Register (Annexure 33), Investment Plan (Annexure 17) and
Occurrence & Policy (Annexures 41 + 42).

**Built round 70:** **Network statement** (`/rail/statement` — NS V4 chapter browser + annexure
register with delivered/wanted status + capacity/charging framework) and the **Tariffs page
gained its money tab** (Table 17 access tariffs verbatim, application fees, invoicing, Tables
18–22). All planned rail pages now exist (11 sidebar items); Interfaces & Messaging remains the
only unbuilt page from the original plan.

**Built round 71:** **Cancellations** (`/rail/cancellations` — Annexure 20a process steps 1–24
with the 15-minute notice rule and decision gates, Annexure 20b's 82-row reason→responsibility
lookup with party filter, penalties cross-link). Sidebar RAIL now 12 items.

**Built round 72:** **Access & disputes** (`/rail/access` — four tabs: official V4 application
timelines from the Publication Notice (V4-11), Annexure 29a/29b application (29b period-caveated),
Annexure 28 handshake 19-step process, Annexure 35 dispute ladder to the Regulator). Sidebar
RAIL now 13 items.

**Built round 73:** five 2024/25-era annexures productised onto existing domain pages —
**Timetable** gained a collapsible "2024/25 Revised Shutdown Schedule" panel (Anx 1: windows,
corridors, depot groups, 22-signatory chain; E-ANX1-02 colour-coding never reconstructed);
**Occurrence & policy** gained "Roles & costs (Annexure 18)" (tables 1.1.1.1–1.1.1.3 with the
preserved slash-pair cells) and "Loading profiles (Annexure 22)" (RSE/TE/LPR/0010 Rev 6 ore
specification) tabs; **Cancellations** gained the "Annexure 21 — Clearinghouse" section (business
rules + SQM→Corridor→National process, 48-hour dispute cutoff aligned with 20a); **Access &
disputes** gained an "Ad hoc slots (32)" tab (21-day lead, 7-day assessment, step numbers
preserved with gaps 8–9 and duplicates). Register 21 of 44 delivered.

**Planned next (needs sources):** Tariffs rate values (approved ancillary schedule),
Annexure 33 appended section-level data file (slots + N1/N2 classification), Possession
elevation screens, Compliance & DG screens, variance Actual leg (SPRINT actuals),
Interfaces & Messaging page (the only rail page still unbuilt). Timetable Explorer row-level browsing uses the existing backend import API
(`rail-timetable.service.ts`; migration `20261007170000` validated, not yet applied) — loading
the full 251,678-row corpus through that path is the natural next power-up once the migration
lands.

# Rail source register — Transnet Network Statement, Volume 4 (September 2026)

**Status: CAPTURED — NOT IMPLEMENTED.** This file records a source and queues the work it implies. It
does **not** start the Rail workstream, and nothing here is evidence that Rail is complete.

> **Revision 2 — 2026-09-26.** Revision 1 was written from a summary of the source and flagged the
> page count, the annexure list and the escalation ladder as unverified. Revision 2 is checked
> against the primary text supplied in conversation on 2026-09-26. Corrections are recorded in
> §6.1 and §5 rather than silently folded in.
>
> **Revision 4 — 2026-09-27.** A second, fuller Annexure 43 extract arrived (executive summary plus all
ten corridors) and replaces §10's first, flattened capture; §10.4 lists what it settled, including
three errors in the first capture that are corrected there rather than quietly deleted.
>
> **Revision 3 — 2026-09-26.** The project owner attests that **all material supplied this session is
> valid Transnet source** — the Volume 4 text, its annexure list, and the Annexure 43 KPI extract.
> That attestation is recorded in §1, provenance now reads as established rather than presumed, and
> §2.1, §5 and §10.4 are reframed accordingly. Revision 2 called the KPI capture "unvalidated"; that
> was the wrong word for provenance and the right instinct about transcription, and the distinction is
> now stated explicitly instead of blurred.

Agreed order (unchanged): finish the migration chain first — staging-clone rehearsal → remaining
database-backed coverage → backfill dry-runs → pilot approval — and only then start the Rail
source/design workstream.

The Network Statement is not only an infrastructure description. It defines the operating and
governance chain:

> access application → administrative/technical/other assessment → conflict resolution →
> conditional award → Rail Access Agreement and conditions precedent → monthly order → weekly order →
> daily execution → cancellation / re-planning → Daily Handshake → Clearinghouse / disputes →
> occurrence management → KPI and performance review

That is the chain FlowOps exists to keep a controlled operating record of, so it materially raises
the Rail requirements baseline.

## 1. Source registration record

| Field | Value |
| --- | --- |
| Title | Transnet Rail Infrastructure Manager Network Statement |
| Volume | 4 |
| Publication | September 2026 |
| Pages | **203 — confirmed** (the supplied text runs "Page 2 of 203" … "Page 203 of 203") |
| Effective operating periods | 2026/27 and 2027/28 timetable periods (§1.7) |
| State | `RECEIVED / VALIDATION_REQUIRED` |
| Provenance attestation | **Attested.** The project owner supplied this content directly on 2026-09-26 and attests that it is valid Transnet source: the Volume 4 text and its annexure list, and the Annexure 43 KPI extract from the workbook `Annexure 43 KPIs (1).xlsx`. Retrieval provenance is therefore recorded as an owner attestation rather than an assumption. |
| Transcription fidelity | **Unverified, and unverifiable from here.** Every item arrived as text pasted into a chat session, which flattens spreadsheet columns and can elide values. This is a limit of the channel, **not** a doubt about the source: the reviewer reconciles values against the binary/workbook, and where a value still cannot be read unambiguously it is logged in §5 or §10.4 rather than guessed. |
| Classification | **`PUBLIC_OFFICIAL_SOURCE_COPY` (recommended)** — §1.7 records that the statement is published by the TRIM on its website, free of charge. Downgrade to `STAKEHOLDER_SOURCE_COPY` if this copy did not come from that route. Confirm before recording. |
| SHA-256 | **PENDING** — the binary is not in this workspace |
| Filename | **PENDING** |
| Publisher | Transnet SOC Ltd, acting through the Transnet Rail Infrastructure Manager (TRIM) |
| Publication date | September 2026 |
| Source URL | **PENDING** (contacts recorded in §1.8, including `infrastructuremanager@transnet.net`; access applications to `TrainPathapplications202526q1@transnet.net`) |
| Retrieval date | **PENDING** |
| Content received | **2026-09-26** — pp. 2–203 as text. Sufficient to verify statements; **not** a substitute for the binary |
| Validation report | **PENDING** — not started |
| Reviewer | **UNASSIGNED** |
| Approval history | none |

**Storage rule:** the PDF and its bulk text are **never committed to Git**. The binary lives in
controlled storage; this record plus the validation report is what the repository keeps. No `*.pdf`
is tracked in this repository today (verified 2026-09-26), and none should be added for this source.

## 2. What the source contains

Seven chapters (1 General Information, 2 Rail Infrastructure Network, 3 Access Requirements,
4 Capacity Allocation, 5 Commercial Services and Charges, 6 Rail Operations, 7 Ancillary Facilities
and Operations Services), a published annexure list, and a glossary/abbreviations section.

Two provenance points follow directly from the sections cited elsewhere in this document:

- The statement regulates applications for the 2026/27 and 2027/28 timetable periods; the timetable
  period runs 1 April – 31 March.
- It is published and updated under §1.7, so **the version in force can change** — which is why
  §4's rules must carry effective periods rather than being treated as permanent.

### 2.1 Content confidence

Provenance is settled: the owner attests this is valid Transnet source (§1). What differs between the
sections below is **how the content is held**, and that is worth keeping straight:

- §3 (coverage map) and §6 (reconciliation to code) are **code-verified** — checked against the
  working tree, with `EscalationStage` / `DeviationStatus` / `DeviationCategory` read directly from
  `backend/prisma/schema.prisma`. Authoritative about this repository; they assert nothing about
  Transnet beyond what §4–§5 record.
- §4 (rules) and §5 (source decisions) are read from the attested text. They are the working basis
  for the workstream. The residual caveat is narrow and specific: where a value arrived flattened by
  chat — columns run together, a token like `xx` where a number belongs — the reviewer re-reads it
  against the binary before it becomes a machine-readable rule. That is editing care, not
  authenticity.
- Nothing here is retained as a file, so **the register is what survives**: the source cannot be
  re-read from this repository, only from controlled storage. Bulk text and the workbook stay out of
  Git.
- Independent review is still outstanding. The register stays `RECEIVED / VALIDATION_REQUIRED`
  until the binary, its hash and URL, and a reviewer's sign-off are recorded — which is the owner's
  own gate, not a hedge on the content.

## 3. Coverage map — source areas against this repository

Repository statuses verified in the working tree on 2026-09-26 (`backend/src/rail/`,
`backend/prisma/schema.prisma`). "Nothing" = no model, no service, no endpoint, no test.

| Source area (chapter / annexure) | Mapped requirement (per the supplied mapping) | In this repository today |
| --- | --- | --- |
| Ch 3 access requirements; Annexure 15 (Rail Access Agreement) | RAIL-010 | **nothing** — no agreement model |
| Ch 3; Annexure 31 (Non-Disclosure Agreement) | RAIL-006 / controlled documents | **nothing** — no controlled-document register |
| Ch 3; Annexure 30 (Credit Application) | RAIL-006 / RAIL-011 | **nothing** on the Rail side |
| Ch 4; Annexure 33 (Network Register), 33a (Running Times), 33b (Capacity Statement) | RAIL-002 / 003 / 004 / 007 | **nothing** — no capacity or network-register model |
| Ch 4; Annexure 25 (Self-Screening Checklist) | RAIL-005 / RAIL-006 | **nothing** |
| Ch 4; Annexure 29a (Network Access Application Form) | RAIL-005 | **nothing** — no access-application model |
| Ch 4; Annexure 32 (Ad-hoc Train Path Application) | RAIL-012 | **nothing** — no train-path model |
| Ch 4; Annexure 34 (Volume Confirmation Letter) | RAIL-006 / RAIL-008 | **nothing** |
| Ch 4 §4.7; Annexure 24 (Interface Management Agreement) | RAIL-010 / RAIL-014 | **nothing** |
| Ch 6; Annexure 37 (Create Monthly Order) | RAIL-011 | **nothing** — no monthly order |
| Ch 6; Annexure 38 (Capture Weekly Train Path Order) | RAIL-011 | **nothing** — no weekly order |
| Ch 6 §6.6.1; Annexure 28 (Daily Handshake Process) | RAIL-011 | **partial** — `RailHandshakeReport` (DRAFT → PENDING_TOC → SIGNED_OFF → DISPUTED → CLOSED, sign-off, IM reference), deviations with category / reason / root cause / location / occurred-at / delay minutes / responsible party / slot impact / cost, escalation ladder, evidence trail |
| Ch 6; Annexure 20a (Cancel or Re-schedule Process), 20b (Cancellation Reasons) | RAIL-013 | **partial** — `CANCELLATION` / `RESCHEDULE` deviation categories exist; the 72-hour commercial consequence and the reason catalogue are **not** modelled |
| Ch 6; Annexure 21 (Clearinghouse) | RAIL-014 | **partial** — `DeviationStatus` carries `LOGGED` / `AGREED` / `OPEN` / `RESOLVED` / `DISPUTED` and `EscalationStage.REGULATOR_DISPUTE` exists; there is no clearinghouse process or ledger |
| Ch 6; Annexure 18 (Occurrence Management), Annexure 41 (Occurrence Reporting Procedure) | RAIL-015 | **partial** — deviations carry cause category, responsible party and status; no occurrence register, no external reporting trail |
| Ch 6 §6.6.1.14; Annexure 39 (Resolve Handshake Disputes) | RAIL-011 / RAIL-014 | **partial** — see §6.1 (ladder) |
| Ch 6; Annexure 43 (Key Performance Indicators) | RAIL-012 / performance management | **nothing** for rail — no KPI model on the handshake. Workbook content captured in §10 (attested source, all ten corridors) |
| Ch 6; Annexure 36 (Emergency Response Plan / Tribunal Process) | RAIL-012 / RAIL-014 | **nothing** |
| Ch 6; Annexure 35 (Dispute Resolution Process) | RAIL-014 | **nothing** |
| Ch 7; Annexure 40 (Ancillary Services Catalogue) | not in the supplied mapping | **nothing** |

Annexures named for the traceability workstream but not yet in this map: **26** (Environmental
analysis), **27** (Risk analysis guidelines) and **44** (Table of changes). The rest of that list lines
up with the rows above. Conceptually the first two are already touched by the access prerequisites in
§4 (environmental plan, risk analysis); they get their own rows when the traceability track opens.

Outside the annexures: `RailService` covers consignments, wagons and intermodal legs (create /
list / update / cancel / advance status, tenant-scoped numbering), gated behind the Enterprise
`rail` entitlement. The access → capacity → agreement → order → KPI half of the chain has no
implementation, and **there are no Rail unit or integration tests at all**.

## 4. Business rules to model as versioned rules with effective periods

**Transcription, not validation** — see §2.1. Each rule must be versioned with an effective period,
never a hard-coded permanent assumption.

| Rule | Value | Source |
| --- | --- | --- |
| Practical capacity | **65%** of theoretical capacity, held back for maintenance and recovery. The source treats it as a planning guideline that **varies by route**, not a universal formula | §4.2 |
| Capacity review cadence | weekly, to absorb temporary restrictions; the reviewed figure is the practical capacity used for allocation | §4.2 |
| Annual application timeline | application 3 months; assessment 3 months; notification 2 months; timetable 1 month before execution | §4.5.2–4.5.4 |
| Ad-hoc applications | submit at least **1 month** before intended service; outcome **3–21 days** where minimum requirements are met | §4.4.9.5 |
| Under-utilisation | capacity used below **75% over 3 months** may be reallocated | §4.12 |
| Response period before revocation | **15 calendar days** for the Access Seeker to respond | §4.12 |
| Performance guarantee | **10%** of the annual Access Fee | §3.3.4.1, §5.2.5.1 |
| Cancellation window | **72 hours** — cancelling inside 72 hours of departure carries a commercial consequence (forfeiture of fees paid in advance unless Force Majeure) | §5.2.10.9 |
| Monthly order cycle | orders placed on the **20th–25th**; invoice on the **26th**; payment due **5 days** after receipt | Annexure 37 |
| Weekly order cycle | captured **Tuesdays 11:00**; do-ability forum **Thursdays 11:00** | Annexure 38 |
| Daily Handshake | issued every morning, **report at 08:00**, reviewed and signed off (including flagged open items) | §6.6.1 |
| Handshake escalation | unresolved after **24h** → Liaison Manager; after **48h** → Head of Access Seeker Service; after **72h** → Head of Network Service Planning and Operations, to resolve within **96h**; unresolved after 96h → Route Logistics Forum → Regulator | §6.6.1.14.1, §6.6.1.15.3, §6.6.1.16 |
| Access prerequisites | Safety Permit (RSR), technical compliance, rolling-stock compatibility, crew competence and route knowledge, operational readiness, environmental plan, risk analysis, security plan, B-BBEE certificate | §3.4 |
| Transitional status | obligations that reference the ERT Act 2024 and the Transport Economic Regulator are **not yet in force** at publication | §1.5 |

## 5. Source exceptions for independent review (`RailSourceException`)

Do not silently normalise any of these. They are points where the source itself, or the act of
passing it through chat, leaves something a machine-readable rule cannot resolve without a decision.
They are **not** doubts about authenticity — that is attested in §1.

| # | Exception | Why it needs review |
| --- | --- | --- |
| 1 | The **65% practical-capacity factor** is a guideline that varies by route | A rule needs a per-route override and an effective date; a single constant would be wrong |
| 2 | Tariff and financial-year dates run separately from the timetable calendar (1 April – 31 March) | Keep the two calendars distinct in any billing or capacity rule |
| 3 | **Transitional / future-state provisions**: ERT Act commencement, the Transport Economic Regulator, and any penalty framework not yet implemented | Not currently enforceable; modelling them as hard controls would be wrong |
| 4 | Network condition, speed restrictions and manual authorisations change over time and are republished periodically | Operational state, not static reference data |
| 5 | System-of-record boundary: the statement refers to IM-side systems (e.g. IIMS) alongside cancellations recorded in more than one place | A FlowOps-vs-IM system boundary is a design decision, not an assumption |
| 6 | Glossary/defined-term quality: truncated definitions and place-name spelling variants | Terminology extraction needs human review |

**Items from the first reading that still need a second pass against the binary before they can be
logged as confirmed source exceptions:** an apparent crossing-loop wagon/train-length inconsistency
between two corridors; two different maximum planned-occupation durations (12 hours vs 13 hours) for
the same obligation; corridor shutdown text appearing under the wrong corridor heading; a mislabelled
table and a repeated section heading in the corridor chapters; duplicate section numbers and at least
one broken cross-reference; the published annexure list not covering every annexure referenced in the
body; and a set of annexures withheld from public download pending signature of the NDA.

## 6. Verified gaps between the source and the current implementation

### 6.1 The escalation ladder (corrects Revision 1)

The source says (§6.6.1.14.1, §6.6.1.15.3, §6.6.1.16): unresolved after **24h** → TRIM Access
Seeker Liaison Manager; unresolved after **48h** → TRIM Head of Access Seeker Service; unresolved
after **72h** → TRIM Head of Network Service Planning and Operations, who **resolves within 96
hours**; items unresolved after 96 hours go to the **Route Logistics Forum**, and only then can be
escalated to the **Regulator**.

The implementation says otherwise. Read from `backend/prisma/schema.prisma`:

```
NONE                    // within tolerance / agreed
LIAISON_MANAGER_24H     // 24h: IM Customer Liaison Manager
HEAD_LIAISON_48H        // +24h (48h): IM Head of Customer Liaison
ROUTE_LOGISTICS_FORUM   // +48h (72h): Route Logistics Forum
REGULATOR_DISPUTE       // unresolved after RLF: dispute with Regulator
```

Differences to reconcile before any change:

1. the 72-hour rung belongs to the **Head of Network Service Planning and Operations**, not the
   Route Logistics Forum;
2. the **96-hour resolve-by step has no counterpart in code**;
3. the Forum is a *later referral* stage, not the third rung;
4. the 48-hour role name differs ("Head of Customer Liaison" vs "Head of Access Seeker Service");
5. the in-code comment `+24h (48h)` / `+48h (72h)` encodes the ladder as *cumulative from the
   report*, which needs checking against how `escalatedAt` is actually advanced in
   `rail-handshake.service.ts` before this is called a defect.

Revision 1 recorded this as "confirm against the text". It is now confirmed against the text, and
items 1–3 are real gaps.

### 6.2 Mandated deviation capture fields

§6.6.1.3.3 lists ten fields per deviation: date/time · location · deviation type · description ·
size/impact · **other Train Paths impacted** · **SLA KPIs impacted** · party causing the deviation ·
primary reason/cause · delay minutes.

Checked against `RailHandshakeDeviation`: date/time (`occurredAt`), location, type (`category`),
description (`reason`), quantified impact (`slotImpact`, `delayMinutes`, `costZar`), responsible
party (`responsibleParty`), cause (`reason` / `rootCause`) — **present**. Two are **missing**:

- **other Train Paths impacted or delayed**;
- **SLA KPIs impacted**.

Both are evidence obligations on the day-of-operation reconciliation, so this is a completeness gap
rather than a cosmetic one. No change is made here — the Rail workstream is queued behind the
migration chain.

### 6.3 Still missing overall

The access/capacity/agreement/order/KPI half of the chain is unmodelled; there is no interface
contract for the IM-side systems; Rail has no tests.

## 7. Queued workstream (starts only after the migration chain completes)

1. Register Network Statement Volume 4 in the source registry — this record is the input; the
   registry itself is schema/service work and is **not** done here.
2. Create the source-to-requirement traceability matrix (statement → section/annexure → requirement →
   implementation → test), seeded from §3–§6 above.
3. Classify each statement: normative requirement · timeline · evidence requirement · commercial
   rule · operational process · future-state statement · source exception.
4. Update RAIL-005 through RAIL-015 against the actual sections and annexures.
   **Blocker:** this repository contains no `RAIL-0xx` identifiers at all (verified across every
   tracked file). Either that register lives outside the repo and must be supplied, or the baseline
   has to be authored here first.
5. Seed `RailSource`, `RailSourceException` and the versioned rule set from §4–§5, with effective
   periods.
6. Close the §6.1 and §6.2 gaps, and add the §8 fixtures with real tests.

Not in scope until then: schema models, services, endpoints, migrations, frontend.

## 8. Synthetic fixtures to add with that workstream

annual application · ad-hoc application · incomplete evidence · capacity conflict · Daily Handshake
deviation · disputed responsibility · cancellation inside and outside 72 hours · occurrence
escalation (24/48/72/96) · KPI reconciliation.

## 9. Open items — decisions or inputs needed

1. **Binary and provenance:** SHA-256, filename, source URL and retrieval date are still pending for
   both source files — the Volume 4 PDF and the Annexure 43 workbook. Put them somewhere that is
   *not* the repository tree (and is not committed), or supply the values directly.
2. **Classification:** confirm `PUBLIC_OFFICIAL_SOURCE_COPY` (recommended) or
   `STAKEHOLDER_SOURCE_COPY`.
3. **RAIL-005 … RAIL-015:** where does that register live?
4. **Reviewer:** assign one. Validation is independent review, not a self-check — §4 and §5 are
   transcription, and §2.1 says so. Approval evidence to record before any Rail requirement is
   called approved: process owner · independent reviewer · the source-period decision · the
   unresolved-exception list · approval date · effective period.

## 10. Source capture — Annexure 43, KPI workbook (Transnet)

Supplied by the project owner, attested as valid Transnet source (§1). Two extracts have arrived from
the workbook `Annexure 43 KPIs (1).xlsx`; the second (2026-09-27) covers the executive summary and all
ten corridors and **supersedes the first (2026-09-26)**, which arrived flattened by the paste. The
workbook is not in this workspace and must not be committed — this section is the capture, and §10.4
records what the second extract settled and what is still open.

Network totals from the first extract reconcile exactly against the second: see §10.4.

### 10.1 Network summary — manual authorisations, speed restrictions, substations

| Corridor / train path | Manual auths baseline | Target | Reduction (stated) | Reduction (computed) |
| --- | --- | --- | --- | --- |
| Ore (SAZ–SIS) | 15,291 | 11,691 | 23.0% | 23.54% |
| Manganese (HTZ–PE) | 534,928 | 323,728 | 39.4% | 39.48% |
| Magnetite (PHW–RBQ) | 61,324 | 29,743 | 51.5% | 51.50% |
| Musina–Pyramid / Hoedspruit | 1,282 | 1,154 | 10.0% | 9.98% |
| Vereeniging/Danskraal–East London | 99,078 | 97,441 | 1.7% | 1.65% |
| Mafikeng–Beaconsfield / Potch | 208,130 | 186,054 | 10.6% | 10.61% |
| Lephalale–Richards Bay | 392,474 | 221,649 | 43.5% | 43.53% |
| Johannesburg–Durban | 721,324 | 648,192 | 10.1% | 10.14% |
| Rayton–Komatipoort / Richards Bay | 267,358 | 178,493 | 33.2% | 33.24% |
| Johannesburg–Cape Town | 611,579 | 409,503 | 33.0% | 33.04% |
| **Network total** | **2,912,768** | **2,107,648** | **27.64%** | **27.64%** |

The stated and computed columns are shown together because they are the cheapest possible check on a
paste: every corridor reconciles within rounding, and two are truncated rather than rounded (Ore
23.54% → "23.0%", Manganese 39.48% → "39.4%").

| Corridor | TSR baseline | TSR target | Active TSRs | Manual auths | Stated reduction |
| --- | --- | --- | --- | --- | --- |
| Ore (SAZ–SIS) | 2.5% | 100% to 1.6% STK | 7 | 15,291 → 11,691 | 23.0% |
| Manganese (HTZ–PE) | 1.7% | 100% to 1.6% STK | 19 | 534,928 → 323,728 | 39.4% |
| Magnetite (PHW–RBQ) | 4.0% | 18% to 1.6% STK | 6 | 61,324 → 29,743 | 51.5% |
| Musina–Pyramid / Hoedspruit | 0.8% | not stated | 6 | 1,282 → 1,154 | 10.0% |
| Vereeniging/Danskraal–East London | 2.2% | 97% to 1.6% STK | 27 | 99,078 → 97,441 | 1.7% |
| Mafikeng–Beaconsfield / Potch | 2.8% | 88% to 1.6% STK | 1 | 208,130 → 186,054 | 10.6% |
| Lephalale–Richards Bay | 1.7% | 93% to 1.6% STK | 25 | 392,474 → 221,649 | 43.5% |
| Johannesburg–Durban | 1.4% | 56% to 1.6% STK | 21 | 721,324 → 648,192 | 10.1% |
| Rayton–Komatipoort / Richards Bay | 5.0% | 66% to 1.6% STK | 14 | 267,358 → 178,493 | 33.2% |
| Johannesburg–Cape Town | 1.5% | 100% to 1.6% STK | 4 | 611,579 → 409,503 | 33.0% |
| **Total** | — | keep within **1.6% of STK** network-wide | **130** | 2,912,768 → 2,107,648 | 27.64% |

Traction substation availability across electrified corridors is targeted at **90–100%**, and requires
units to be brought back on-load at: Bellville (18 of 23 off-load units), Koedoespoort (at least 6 of
7), Port Elizabeth (at least 3 of 5), Krugersdorp (at least 3 between Potchefstroom and Veertien
Stroom), Witbank (1) and Nelspruit (1). Magnetite and Musina–Pyramid/Hoedspruit are **not electrified**;
the Vereeniging–East London corridor has decommissioned, vandalised OHTE/substations between
Wolwehoek–Danskraal and Wolwehoek–East London, with no electric traction operating there and 4 units
on-load at East London depot.

### 10.2 KPI framework — current and future

**Current (measured).** Transit speeds — route scheduled train throughput times, annual, per train path,
attributed jointly to IM + TOC. Track service quality — track under TSR (km and % of total track),
count of speed restrictions, and count of manual train authorisations, quarterly per route, IM. Track
condition — TQI at the 50th percentile, overhead traction quality index, and traction substation
availability, quarterly per route, IM. Status flags: **NRP** = next reporting phase (under development);
**Pilot** = not currently measured, part of the pilot phase.

**Future (expanded).** Reliability — on-time departure and arrival within a 30-minute tolerance from
SPRINT data. Delay attribution — delay minutes per train split into IM and TOC causes. Slot modification
— count and acceptance rate of modification requests, and cancellations following an IM rejection.
TOC non-usage — cancellation at least **xx** days before departure, and no-show. IM non-compliance —
failure to honour an allocated slot from IM fault, and disclosure/notification breaches. Unit costs —
train control cost in R/track-km.

### 10.3 Corridor detail

Transit times — route scheduled train throughput times, baseline → target (source writes "27h 07m";
shown here as 27h07):


| Corridor | Leg | Baseline | Target |
| --- | --- | --- | --- |
| Ore (SAZ–SIS) | Forward SAZ–SIS | 27h07 | 24h43 |
| Ore (SAZ–SIS) | Return SIS–SAZ | 26h15 | 23h51 |
| Manganese (HTZ–PE) | Forward HTZ–PE | 33h45 | 32h00 |
| Manganese (HTZ–PE) | Return PE–HTZ | 45h00 | 41h16 |
| Magnetite (PHW–RBQ) | Forward PHW–RBQ | 39h50 | 33h32 |
| Magnetite (PHW–RBQ) | "Forward" RBQ–PHW | 35h00 | 33h55 |
| Musina–Pyramid / Hoedspruit | Forward Musina–Pyramid | 19h56 | 18h44 |
| Musina–Pyramid / Hoedspruit | Forward Musina–Hoedspruit | 17h29 | 15h05 |
| Musina–Pyramid / Hoedspruit | Return Pyramid–Musina | 18h29 | 17h17 |
| Musina–Pyramid / Hoedspruit | Return Hoedspruit–Musina | 20h07 | 17h43 |
| Vereeniging/Danskraal–East London | Forward Danskraal–East London | 44h35 | 39h47 |
| Vereeniging/Danskraal–East London | Forward Vereeniging–East London | 38h19 | 32h19 |
| Vereeniging/Danskraal–East London | Return East London–Danskraal | 40h34 | 35h46 |
| Vereeniging/Danskraal–East London | Return East London–Vereeniging | 35h24 | 29h24 |
| Mafikeng–Beaconsfield / Potch | Forward Mafikeng–Potchefstroom | 30h20 | 23h20 |
| Mafikeng–Beaconsfield / Potch | Forward Mafikeng–Beaconsfield | 18h13 | 14h37 |
| Mafikeng–Beaconsfield / Potch | Return Potchefstroom–Mafikeng | 32h18 | 31h20 |
| Mafikeng–Beaconsfield / Potch | Return Beaconsfield–Mafikeng | 17h51 | 14h15 |
| Lephalale–Richards Bay | Forward Lephalale–Richards Bay | 53h05 | 44h41 |
| Lephalale–Richards Bay | Forward Trichardt–Richards Bay | 21h55 | 18h19 |
| Lephalale–Richards Bay | Return Richards Bay–Lephalale | 60h58 | 52h34 |
| Lephalale–Richards Bay | Return Richards Bay–Trichardt | 21h08 | 17h32 |
| Johannesburg–Durban | Forward Johannesburg–Durban | 38h06 | 29h00 |
| Johannesburg–Durban | Return Durban–Johannesburg | 33h07 | 29h00 |
| Rayton–Komatipoort / Richards Bay | Forward Rayton–Komatipoort | 28h02 | 23h14 |
| Rayton–Komatipoort / Richards Bay | Forward Rayton–Richards Bay | 29h48 | 23h48 |
| Rayton–Komatipoort / Richards Bay | Forward Steelpoort–Komatipoort | 31h10 | 26h22 |
| Rayton–Komatipoort / Richards Bay | Return Komatipoort–Rayton | 27h01 | 22h13 |
| Rayton–Komatipoort / Richards Bay | Return Richards Bay–Rayton | 29h15 | 23h15 |
| Rayton–Komatipoort / Richards Bay | Return Komatipoort–Steelpoort | 31h43 | 26h55 |
| Johannesburg–Cape Town | Forward City Deep–Bellville | 78h08 | 59h18 |
| Johannesburg–Cape Town | Return Bellville–City Deep | 56h55 | 53h05 |

Track quality index by corridor:


| Corridor | TQI baseline | TQI target | Direction |
| --- | --- | --- | --- |
| Ore | 5 | 5 | unchanged, "within target range" |
| Manganese | 6.4 | 8 | up |
| Magnetite | 8.2 | 8 | down |
| Musina–Pyramid / Hoedspruit | 7.4 (N2) / 10.6 (N3) | 9 (N2) / 12 (N3) | up |
| Vereeniging/Danskraal–East London | 8.1 | 9 | up |
| Mafikeng–Beaconsfield / Potch | 8.2 | 9 | up |
| Lephalale–Richards Bay | 7.5 (N1) / 5.7 (S) | 8 (N1) / 6 (S) | up |
| Johannesburg–Durban | 10 | 8 | down |
| Rayton–Komatipoort / Richards Bay | 8.8 | 8 | down |
| Johannesburg–Cape Town | 6.3 (N1) / 6.3 (N2) | 8 (N1) / 9 (N2) | up |


Two operational notes carried in the source: Johannesburg–Durban has all four responsible depots
(Vereeniging, Heidelberg, Ladysmith, Durban) below 90% and requiring substation restoration; and the
Mafikeng manual-authorisation target covers the Mafikeng–Veertien Stroom section, with PCM to
Beaconsfield counted under Johannesburg–Cape Town.

### 10.4 What the second extract settled — and what is still open

**Settled.** Each of these was an artefact of the first, flattened paste, and they are recorded because
the first capture got them wrong:

| First capture | Actually |
| --- | --- |
| Ore transit `03:07:00 → 00:43:00`, unit "hours" | **27h07 → 24h43** — a leading digit was lost, making a target look worse than its own baseline |
| Manganese transit `09:45:00 → 08:00:00` | **33h45 → 32h00** |
| TSR baselines `0.025` and `0.017` | **2.5%** and **1.7%** — decimal point displaced, and they are percentages against the 1.6% STK objective |
| Ore TQI "55"; Manganese "6.48" | **5 → 5** and **6.4 → 8** — adjacent cells had merged |
| "Speed restriction counts of 7 and 19 look small" | Genuine counts; the ten corridors sum to exactly **130**, the stated network total |
| "12 sheets, 3 arrived" | 10 corridor tables + the current and future framework = 12; the second extract carries all ten |

**Still open — source-level, for independent review, never silently normalised:**

1. **The cancellation threshold is still a placeholder.** "Cancellation ≥ **xx** days before departure"
   appears in both extracts, so it is not an artefact of the paste. It cannot be filled in from V4
   §5.2.10.9's 72-hour rule by inference — the number comes from the workbook.
2. **TSR reduction targets do not reconcile with the 1.6% STK objective.** Applying each corridor's
   stated reduction to its own baseline gives: Ore 0%, Manganese 0%, Magnetite 3.28%, Vereeniging
   0.07%, Mafikeng 0.34%, Lephalale 0.12%, Johannesburg–Durban 0.62%, Rayton 1.70%, Johannesburg–Cape
   Town 0%. Only Rayton lands on 1.6%. Either the reduction is measured against a denominator the
   extract does not show (TSR kilometres rather than % of STK, or a prior-year figure), or the columns
   come from different versions of the framework. No single rule reproduces them as extracted.
3. **TQI improvement direction is not consistent.** Targets rise for seven corridors (Manganese
   6.4 → 8, Vereeniging 8.1 → 9, Johannesburg–Cape Town 6.3 → 8), fall for three (Magnetite 8.2 → 8,
   Johannesburg–Durban 10 → 8, Rayton 8.8 → 8), and Ore is unchanged at 5. "Within target range"
   implies a band, so whether a higher TQI is better or worse must be confirmed before any rule is
   written — seven corridors and three corridors cannot both be improvements under one convention.
4. **Musina–Pyramid/Hoedspruit carries no TSR target**, only a 0.8% baseline. A gap, not a zero.
5. **Cross-corridor attribution.** The Mafikeng target is qualified as covering Mafikeng–Veertien
   Stroom with PCM–Beaconsfield counted under Johannesburg–Cape Town; KPI attribution needs that scope
   rule explicit.
6. **Data sources.** SPRINT is named for reliability; V4 also refers to IIMS and TEMS. The
   FlowOps-versus-IM system-of-record boundary stays open.
7. **Enforceability.** Part of the framework is under development or pilot-only, consistent with V4's
   position that KPIs become enforceable service levels only once the TER is satisfied.
8. **Not-applicable sections.** Non-electrified and decommissioned corridors need an explicit "not
   applicable", distinct from missing data, in any schema that stores this.

### 10.5 Still outstanding

The workbook and the Volume 4 binary (for hashing into controlled storage), the annexure set, the
`RAIL-0xx` identifier register, and independent review. This capture may become requirements and
versioned rules once the §10.4 questions are settled against the workbook and a reviewer signs it; it
may **not** acquire a `RAIL-0xx` identifier and then be quoted as though those numbers had been read
out of a spreadsheet that is not in this repository.

## 11. Honest status

Captured, and the parts that touch this repository are now verified against the working tree. Rail
is **not** implemented and must not be described as complete: the access/capacity/agreement/order/KPI
half of the chain is unmodelled, the escalation ladder does not match the source, two mandated
deviation fields are missing, the system-of-record boundary is unresolved, there are no Rail tests,
and none of it has had independent review, interface testing or pilot evidence. The migration chain
remains the active workstream. Annexure 43's KPI framework is captured in §10 as attested Transnet
source — all ten corridors, network totals that reconcile exactly, and eight source-level questions
(§10.4) still to settle against the workbook — which is source material awaiting independent review,
not a requirement set.

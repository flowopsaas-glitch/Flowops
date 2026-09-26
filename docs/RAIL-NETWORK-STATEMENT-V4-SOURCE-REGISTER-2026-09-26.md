# Rail source register — Transnet Network Statement, Volume 4 (September 2026)

**Status: CAPTURED — NOT IMPLEMENTED.** This file records a source and queues the work it implies. It
does **not** start the Rail workstream, and nothing here is evidence that Rail is complete.

> **Revision 2 — 2026-09-26.** Revision 1 was written from a summary of the source and flagged the
> page count, the annexure list and the escalation ladder as unverified. Revision 2 is checked
> against the primary text supplied in conversation on 2026-09-26. Corrections are recorded in
> §6.1 and §5 rather than silently folded in.
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
| Ch 6; Annexure 43 (Key Performance Indicators) | RAIL-012 / performance management | **nothing** for rail — no KPI model on the handshake. The workbook's content is captured in §10, attested source |
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

1. **Binary and provenance:** SHA-256, filename, source URL and retrieval date are still pending.
   Make the PDF readable somewhere that is *not* the repository tree (and is not committed), or
   supply the values directly.
2. **Classification:** confirm `PUBLIC_OFFICIAL_SOURCE_COPY` (recommended) or
   `STAKEHOLDER_SOURCE_COPY`.
3. **RAIL-005 … RAIL-015:** where does that register live?
4. **Reviewer:** assign one. Validation is independent review, not a self-check — §4 and §5 are
   transcription, and §2.1 says so. Approval evidence to record before any Rail requirement is
   called approved: process owner · independent reviewer · the source-period decision · the
   unresolved-exception list · approval date · effective period.

## 10. Source capture — Annexure 43, KPI workbook (sheets 1–3 of 12)

Supplied directly by the project owner on 2026-09-26 as an extract from the Transnet workbook
`Annexure 43 KPIs (1).xlsx`, and attested as valid Transnet source (§1). The workbook is **not** in
this workspace and must not be committed; this section is the capture, so the content is not lost
between sessions.

Two caveats, both about handling rather than about the source. First, the extract as reported covers
12 sheets and three arrived here — sheets 4–12 are outstanding. Second, a spreadsheet pasted through
chat loses its column boundaries (the raw text shows this plainly: "Forward: SAZ-SIS03:07:0000:43:00"
is four cells run together), so a value read out of it may be a column shift rather than a value the
workbook holds. The items in §10.4 are that kind of question — how to read and encode what the
workbook says — not a challenge to whether Transnet published it.

### 10.1 Framework marked under development / pilot — not measured today

| Category | Measure | Unit | Attribution | Frequency / level |
| --- | --- | --- | --- | --- |
| Reliability | Services exiting the network on schedule within a 30-minute tolerance (OTD, SPRINT data) | % of total services | IM + TOC | Quarterly / route |
| Reliability | Services entering the network on schedule within tolerance (OTA, SPRINT data) | % of total services | IM + TOC | Quarterly / route |
| Delay attribution | Delay minutes per train — IM causes | minutes/train | IM | Quarterly / route |
| Delay attribution | Delay minutes per train — TOC causes | minutes/train | TOC | Quarterly / route |
| Slot modification | Requests to change an allocated slot | count + % accepted | TOC (request) / IM (decision) | Per request / period |
| Slot modification | Cancellation after IM rejects a modification request | count / % of slots | TOC | Per request / period |
| IM non-compliance | Failure to honour an allocated slot due to IM fault | % of cancelled slots | IM | Period / train path |
| IM non-compliance | Failure to meet disclosure / notification obligations | count of breaches | IM | Period / train path |
| TOC non-usage | Cancellation at least **xx** days before departure | % of cancelled slots | TOC | Per request / period |
| TOC non-usage | Failure to cancel (no-show) | % of cancelled slots | TOC | Per request / period |
| IM unit costs | Train control costs | R/track-km | IM | Quarterly / route |

The extract marks parts of this framework as under development (NRP, "next reporting
phase") or pilot-only and not currently measured.

### 10.2 Framework measured today

| Category | Measure | Unit | Attribution | Frequency / level |
| --- | --- | --- | --- | --- |
| Transit speeds | Route scheduled train throughput times — average transit times | hours (values given as HH:MM:SS) | IM + TOC | Annual / train path |
| Track service quality | Track under temporary speed restriction at period end | km and % of total track | IM | Quarterly / route |
| Track service quality | Number of speed restrictions at period end | count | IM | Quarterly / route |
| Track service quality | Number of manual train authorisations at period end | count | IM | Quarterly / route |
| Track condition | Track quality index | 50th percentile TQI | IM | Quarterly / route |
| Track condition | Overhead traction quality index | index value | IM | Quarterly / route |
| Track condition | Traction substation availability | % | IM | Quarterly / route |

### 10.3 Route targets and baselines as extracted — Ore and Manganese

| Route | Measure | Baseline | Target | Comment |
| --- | --- | --- | --- | --- |
| Ore (SAZ–SIS, forward) | Transit time | 03:07:00 | 00:43:00 | |
| Ore (SIS–SAZ, return) | Transit time | 02:15:00 | 23:51:00 | |
| Ore | Track under temporary speed restriction | 0.025 | 1.6% of network | 100% reduction by end of FY |
| Ore | Number of speed restrictions | 7 | — | Keep TSRs within 1.6% of STK |
| Ore | Manual train authorisations | 15,291 | 11,691 | 23% reduction — arithmetic checks out (23.5%) |
| Ore | Track quality index | 55 | TQI within range | |
| Ore | Overhead traction quality index | — | — | under development |
| Ore | Traction substation availability | 1.00 (100%) | 1.00 (100%) | all traction feeder stations on-load |
| Manganese (HTZ–PE, forward) | Transit time | 09:45:00 | 08:00:00 | |
| Manganese (PE–HTZ, return) | Transit time | 21:00:00 | 17:16:00 | |
| Manganese | Track under temporary speed restriction | 0.017 | 1.6% of network | 100% reduction by end of FY |
| Manganese | Number of speed restrictions | 19 | — | Keep TSRs within 1.6% of STK |
| Manganese | Manual train authorisations | 534,928 | 323,728 | 39% reduction — arithmetic checks out (39.5%) |
| Manganese | Track quality index | 6.48 | TQI within range | |
| Manganese | Overhead traction quality index | — | — | under development |
| Manganese | Traction substation availability | 0.94 (94%) | 0.97 (97%) | 5 units off under the PE depot; restore at least 3 this FY |

### 10.4 Reading and encoding questions raised by the extract

Raised for the reviewer to settle against the workbook. None is resolved here, and none may be turned
into a rule by guessing. Most are probably artefacts of flattened columns or elided cells; the point is
that a rule cannot be written either way until someone reads the workbook. Sources are attested valid
(§1) — this list is not a challenge to that.

1. **Unread threshold.** "Cancellation ≥ **xx** days before departure" arrived with `xx` where a
   number belongs — either the cell was elided in transit or the workbook shows it that way. V4
   §5.2.10.9 has a 72-hour cancellation rule and this may be the same measure, but the number comes
   from the workbook, not from inference.
2. **Speed-restriction units.** Ore 0.025 and Manganese 0.017 sit against a target of
   "1.6% of network" with "100% reduction". If the baselines are also percentages, the
   target is a large *increase*, not a reduction — so at least one value is in different
   units or in a different column.
3. **Speed-restriction counts.** 7 and 19 look small for a network, and the paired
   comment speaks of a share of STK. Count and proportion appear to be mixed.
4. **Transit-time representation.** The unit says hours, the values are HH:MM:SS, and one
   target (23:51:00 against a 02:15:00 baseline) is worse than its own baseline — these
   read as clock times rather than durations. Not modellable until re-checked.
5. **Percentages versus unit counts.** Manganese availability 94% → 97% is paired with
   "5 units off"; the conversion between the two is unstated.
6. **Data-source systems.** SPRINT is named for reliability; the V4 text also refers to
   IIMS and TEMS. The FlowOps-versus-IM system-of-record boundary stays open.
7. **Enforceability.** Part of the framework is explicitly under development or
   pilot-only, consistent with the V4 position that KPIs become enforceable service
   levels only once the TER is satisfied.

### 10.5 Still to arrive

Sheets 4–12 of the workbook, and the corridor baselines those sheets presumably carry.

This section is the retained basis of the KPI track, and it may become requirements and versioned
rules once the reading questions in §10.4 are settled against the workbook and a reviewer signs the
capture. What it may **not** do is acquire a `RAIL-0xx` identifier and then be quoted as though a
number had been read out of a spreadsheet that is not in this repository.

## 11. Honest status

Captured, and the parts that touch this repository are now verified against the working tree. Rail
is **not** implemented and must not be described as complete: the access/capacity/agreement/order/KPI
half of the chain is unmodelled, the escalation ladder does not match the source, two mandated
deviation fields are missing, the system-of-record boundary is unresolved, there are no Rail tests,
and none of it has had independent review, interface testing or pilot evidence. The migration chain
remains the active workstream. Annexure 43's KPI framework is captured in §10 as attested Transnet
source — sheets 1–3 of 12, with seven reading questions to settle against the workbook — which is
source material awaiting independent review, not a requirement set.

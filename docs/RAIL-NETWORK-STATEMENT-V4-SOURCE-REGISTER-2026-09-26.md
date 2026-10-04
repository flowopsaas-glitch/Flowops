# Rail source register — Transnet Network Statement, Volume 4 (September 2026)

**Status: CAPTURED — NOT IMPLEMENTED.** This file records a source and queues the work it implies. It
does **not** start the Rail workstream, and nothing here is evidence that Rail is complete.

> **Revision 2 — 2026-09-26.** Revision 1 was written from a summary of the source and flagged the
> page count, the annexure list and the escalation ladder as unverified. Revision 2 is checked
> against the primary text supplied in conversation on 2026-09-26. Corrections are recorded in
> §6.1 and §5 rather than silently folded in.
>
> **Revision 8 — 2026-09-27.** The owner reordered the post-rehearsal Rail queue: the formal
> RAIL-005–RAIL-015 requirement register and traceability matrix comes **first**, followed by
> independent review, with the metadata, exception-records, fixture, unit-test and route-mapping items
> queued behind it (§9 item 5). Recorded as a reordering rather than a replacement — the other five are
> still required, and nothing here is production implementation. The capacity model stays
> unimplemented and the migration decision still gates all of it.
>
> **Revision 9 — 2026-10-02.** Five annexures arrive as text — **20a** (cancel / re-plan process v4), **20b**
> (cancellation reasons v1.3), **21** (Clearinghouse narrative), **25** (self-screening form, *second draft*)
> and **40** (ancillary services catalogue 2026/27) — and are captured in **§13**, rendered from the typed
> catalogs under `backend/src/rail/catalog/` so the register and the code cannot disagree. Named individuals in
> the sign-off blocks are **not** copied (POPIA; EXC-022). This closes the "not supplied" status of 20a, 20b, 25
> and 40 in the requirement register's §3 and the "nothing" rows for them in this register's §3 — see §13.6.
> Annexures 13, 14, 23, 24, 41 and 37–39, and Network Statement Chapters 2 and 5, are **still not supplied**.
>
> **Revision 10 — 2026-10-04.** The final Network Statement Version 4 was published on 18 September
> 2026 and gazetted in **Gazette No. 55426** on 21 September 2026, governing **FY2026/27 and
> FY2027/28**. Every V4 annexure TRIM publishes now has a known retrieval URL, and the complete map
> — V4 governing set, V3 gap-filling set, and the confirmed-absent set — is recorded in
> `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md`. This register remains a *transcription* of
> text supplied in conversation, not of the binaries; no binary has been retrieved, hashed or
> checked against this record, and §9 item 1 stays open.
>
> Three annexure identities recorded in earlier revisions were **wrong**, and are corrected here
> rather than folded in: **33a is Point to Point Running Times** (not an ad-hoc slot form),
> **29b is the Network Capacity Statement** (not a slot form), and **24 is the Interface Agreement**
> (not the ITP). The ad-hoc slot process the earlier revisions attributed to 33a is **Annexure 32**.
>
> **Annexures 37, 38 and 39 are confirmed absent from both the V3 (2024/25) and V4 annexure
> indexes.** They are not withheld from us — they are not published at all, being internal /
> TOL-class. RAIL-011.1 and RAIL-011.2 stay evidence-blocked on that basis.
>
> Two further facts captured, both carrying the §11.0 period caveat because they come from the V3 /
> 2025 publication set: the **15-step TOC application process** (TRIM Annual Train Path Allocation
> page), in which the Route Logistics Forum and the Regulator sit in the *application-dispute* chain
> — a distinct path from the Daily Handshake escalation ladder; and the **ad-hoc train path SLAs**
> (announcement of 01 December 2025, NS V3 cl. 4.3.4): request ≥21 days before service, IM answers
> within 1–14 days, new TOCs follow §4.3.2.
>
> **Revision 7 — 2026-09-27.** The project owner attests that the **capacity source is valid**: the
> Annexure 33 capacity-statement workbook is now named in §1's provenance attestation, which previously
> listed only the Volume 4 text, its annexure list and the Annexure 43 KPI extract. This was a real gap —
> §11 cited §1 for an attestation §1 did not contain. Provenance is now explicit for all three sources.
> Nothing else moves: §11.6's eleven exceptions, the unpinned financial year and the period-separation
> rule in §11.0 are all questions of reading and encoding, unaffected by provenance, and the register
> stays `RECEIVED / VALIDATION_REQUIRED` because the binary, hash, effective period and independent
> review are still outstanding.
>
> **Revision 6 — 2026-09-27.** Period separation between the two sources is made explicit in §11.0,
> on the owner's instruction: the V4 Network Statement governs the **2026/27 and 2027/28** operating
> context, while the capacity workbook carries its own financial years (**FY26/27, FY27/28, FY29/30 and
> others**). Workbook values must never be substituted into a V4 source period, and vice versa. Two
> consequences are recorded rather than glossed: the FY behind §11.3's displayed rows is not pinned in
> the capture (now exception 11), and the Annexure 43 KPI extract is period-unestablished because neither
> extract carried a period label. The six-step post-rehearsal Rail sequence is added to §9.
>
> **Revision 5 — 2026-09-27.** The Annexure 33 capacity-statement workbook arrived and is captured in
> §11 — its model, its arithmetic (checked, §11.3), its route and depot identity (§11.4) and ten
> exceptions (§11.6). It corroborates the 65% factor as *implemented* and supplies direct evidence that
> capacity is versioned by financial year.
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
| Provenance attestation | **Attested.** The project owner supplied this content directly and attests that it is valid Transnet source: the Volume 4 text and its annexure list, and the Annexure 43 KPI extract from the workbook `Annexure 43 KPIs (1).xlsx` (2026-09-26); and the Annexure 33 capacity-statement workbook `Annexure33CapacityStatement.xlsm`, re-affirmed as valid source on 2026-09-27. Retrieval provenance is therefore recorded as an owner attestation rather than an assumption. |
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
| Ch 4; Annexure 33 (Network Register), 33a (Running Times), 33b (Capacity Statement) | RAIL-002 / 003 / 004 / 007 | **nothing** — no capacity or network-register model. The capacity model is captured in §11 (attested source, arithmetic checked) |
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

1. **Binary and retrieval record:** SHA-256, filename, source URL and retrieval date are still pending
   for all three source files — the Volume 4 PDF, the Annexure 43 KPI workbook and the Annexure 33
   capacity workbook. *Validity* of these sources is attested by the owner (§1); what is missing is the
   retrieval record — the hash of the actual binary, where it came from and when. Put the files somewhere
   that is *not* the repository tree (and is not committed), or supply the values directly.
2. **Classification:** confirm `PUBLIC_OFFICIAL_SOURCE_COPY` (recommended) or
   `STAKEHOLDER_SOURCE_COPY`.
3. **RAIL-005 … RAIL-015:** where does that register live?
4. **Reviewer:** assign one. Validation is independent review, not a self-check — §4 and §5 are
   transcription, and §2.1 says so. Approval evidence to record before any Rail requirement is
   called approved: process owner · independent reviewer · the source-period decision · the
   unresolved-exception list · approval date · effective period.
5. **Rail work after the staging-clone report is accepted — sequence agreed with the owner.** The
   rehearsal remains the blocker: nothing below starts, and no capacity rule is implemented, until
   that report is accepted (§12; runbook Exit criteria).

   **First, on the owner's later instruction (2026-09-27): the formal RAIL-005–RAIL-015 requirement
   register and traceability matrix, followed by independent review.** This promotes what was item 6
   below to the front of the Rail queue, ahead of items 1–5. Authoring is not approval: the register
   is written as a proposal and then reviewed independently, and identifiers that come from the
   authoritative Rail register are used as given rather than re-invented here (§9 item 3). Independent
   review stays a separate step from authoring, whichever sequence is used.

   The remaining five items stay queued **behind** the register and are not dropped:
   1. Store the workbook metadata — hash, owner, effective period (and filename/URL/retrieval date,
      §9 item 1).
   2. Convert the eleven §11.6 exceptions into controlled source-review records.
   3. Create **small synthetic capacity fixtures** rather than committing the full `Capacity_DB`
      (which stays out of Git, per the source-handling constraint).
   4. Add unit tests for: 65% rounding · Line Closed → zero · TSR and manual-authorisation deductions
      · TOC allocations · minimum-spare bottleneck selection · financial-year versioning · the float
      decomposition exceptions.
   5. Confirm the route-to-corridor mapping (§11.4) with an independent reviewer.
   Every figure these steps produce stays bound to its own source period (§11.0). Nothing below is
   production implementation, and none of it starts before the migration decision is complete.

## 10. Source capture — Annexure 43, KPI workbook (Transnet)

Supplied by the project owner, attested as valid Transnet source (§1). Two extracts have arrived from
the workbook `Annexure 43 KPIs (1).xlsx`; the second (2026-09-27) covers the executive summary and all
ten corridors and **supersedes the first (2026-09-26)**, which arrived flattened by the paste. The
workbook is not in this workspace and must not be committed — this section is the capture, and §10.4
records what the second extract settled and what is still open.

**Period:** neither extract carries an effective period for these KPIs, so every figure below is
period-unestablished. Do not attribute it to V4's 2026/27–2027/28 operating periods or to any
capacity-workbook financial year — see §11.0, which states the separation rule for all three sources.

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
paste — and re-deriving every corridor from the pair printed beside it is what caught the one figure
that does not hold. **Manganese is a truncation rather than a rounding** (39.48% → "39.4%", where
rounding gives 39.5%), and **Ore's stated 23.0% is not derivable from Ore's own pair at all** (23.54%
rounds *and* truncates to 23.5%). That is eight corridors reconciling by ordinary rounding, one by
truncation, and one needing a source-level explanation — question 9 in §10.4. The re-derivation is
reproducible: `python3 docs/tools/verify-rail-register-arithmetic.py` (it also checks the capacity
model's own formulas in §11.3; it checks this register, not the workbook, which remains the authority).

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
9. **Ore's stated reduction does not follow from Ore's own numbers.** The corridor's pair is
   15,291 → 11,691, which is 23.54%; rounded or truncated to one decimal that is **23.5%**, not the
   stated **23.0%**. A stated 23.0% is consistent with a pair of about 15,291 → 11,774, so either the
   percentage or one of the two counts is wrong, and the workbook decides which. Two candidate
   explanations were tested and rejected: it appears as 23.0% in *both* §10 tables, so it is not a
   single misplaced cell, and no other corridor's computed reduction is near 23.0%, so a row-shift in
   the paste is not supported either. An earlier reading of that table recorded two truncations (Ore
   and Manganese); only Manganese's is a truncation, and this note corrects that reading.

### 10.5 Still outstanding

The workbook and the Volume 4 binary (for hashing into controlled storage), the annexure set, the
`RAIL-0xx` identifier register, and independent review. This capture may become requirements and
versioned rules once the §10.4 questions are settled against the workbook and a reviewer signs it; it
may **not** acquire a `RAIL-0xx` identifier and then be quoted as though those numbers had been read
out of a spreadsheet that is not in this repository.

## 11. Source capture — Annexure 33 capacity statement (Transnet workbook)

Supplied by the project owner on 2026-09-27 and attested as valid Transnet source — the attestation is
recorded in §1, which now names this workbook explicitly rather than leaving §11 to cite §1 for
something §1 did not list. Workbook `Annexure33CapacityStatement.xlsm`, three sheets.

Provenance being attested does **not** answer the questions in §11.6 or pin the periods in §11.0: those
are about *reading and encoding* the source (which FY a value came from, what a negative "train paths
lost" means), not about whether it is genuine Transnet material. The attestation therefore leaves
exception 11, the non-countable values, the single-factor question and the rest exactly as they are. Unlike the KPI extract in §10, this one is
**arithmetic**, so most of it could be checked rather than merely transcribed — see §11.3.

### 11.0 Period separation — the two sources are not interchangeable

V4 and the capacity workbook do **not** share a source period, and the difference is not cosmetic:

| Source | Its periods | What that means here |
| --- | --- | --- |
| Network Statement V4 (September 2026) | **2026/27 and 2027/28** timetable periods (1 April – 31 March) | V4's rules, planning factor and operating context are scoped to these periods |
| Annexure 33 capacity workbook | **FY26/27, FY27/28, FY29/30 and other workbook financial years** (5 FYs × 10 routes in `Capacity_DB`, chosen by the selector in `$B$1`) | Every workbook figure belongs to the FY it was read from — no more, no less |

**Binding rule.** Do not silently substitute the FY29/30 workbook values into the V4 2026/27 or
2027/28 source period. A workbook figure may only be used together with the FY it was read from, and
a V4 rule may only be used within V4's periods. Overlap of a year label is **not** agreement: FY26/27
appears in both sources as a *separate source period each*, and where two sources speak to the same
financial year the values must be compared explicitly and the comparison recorded — never assumed
equal because the label matches.

This also means the cross-source joins in §11.4 are **identity** mappings (workbook route ↔ KPI
corridor ↔ V4 corridor; depot ↔ substation), not period mappings. Each identity has to be resolved
*per FY* — a route that exists in FY29/30 is not thereby established for FY26/27, and section
theoretical capacities already differ between FYs (§11.5).

**Three states the capture is in, all recorded rather than assumed:**

- **Unpinned display period.** The rows in §11.3 were read from the workbook's *display* sheet, whose
  selected FY (`$B$1`) was not captured. Those values are therefore **period-unpinned** and must not
  be attributed to FY26/27 (or any FY) until re-read with the FY recorded. This is exception 11 in
  §11.6. (The arithmetic checks in §11.3 are unaffected — they test the formulas' behaviour, which is
  FY-independent.)
- **One factor, all routes, all years.** The workbook's `0.65` is a single constant applied to every
  route in every FY it computes, whereas V4 §4.2 presents 65% as a planning guideline that may vary by
  route and belongs to V4's periods. Neither reading transfers to the other source (§11.6 item 3).
- **A third source with no period at all.** Neither Annexure 43 extract carries a period label (§10),
  so its corridor KPI baselines and targets are **period-unestablished**. The same rule applies in
  reverse: do not attribute those targets to V4's 2026/27–2027/28 periods, and do not attribute them
  to any capacity-workbook FY, until the workbook's own effective period is recorded.

### 11.1 Sheet inventory

| Sheet | Used range | What it is |
| --- | --- | --- |
| Capacity Statement | A1:AE51 | selector (FY, route, capacity factor) plus 41 result rows for the selected route |
| Capacity_DB | A1:Z1416 | the data layer: 5 financial years × 10 routes × sections, keyed `Year\|Route\|Section Order` |
| Lists | A1:B11 | the 5 financial years and the 10 canonical route names |

The display sheet is a query layer over `Capacity_DB`: every cell is an `XLOOKUP` on the composite key
(or a formula over other looked-up cells). That split is itself worth mirroring — reference data in a
keyed table, presentation derived from it.

### 11.2 The capacity model, as implemented

Verbatim from the extract (`$B$3` is the capacity factor cell, `$B$1` the selected FY, `$B$2` the
selected route):

```
B3  Capacity factor         0.65
E   Practical daily         =ROUND(D*$B$3, 0)                      D = theoretical daily capacity
H   Train paths lost to TSR =XLOOKUP(...Capacity_DB!$H:$H, 0)
I   Train paths lost to MA  =XLOOKUP(...Capacity_DB!$I:$I, 0)
J   Recovered via upgrades  =XLOOKUP(...Capacity_DB!$J:$J, 0)
K   Recovered unused TOC    =XLOOKUP(...Capacity_DB!$K:$K, 0)
J   Daily available         =MAX(0, E - F - G + H + I)             F = lost to TSR, G = lost to MA
K   Weekly practical        =IF(J="", "", IF(ISNUMBER(SEARCH("Line Closed", C)), 0, J*7))
AB  Weekly spare            =MAX(0, K - AA)                        AA = Σ TOC 1…15 allocations (L:Z)
B4  Route spare capacity    =AGGREGATE(15, 6, AB8:AB47 / ((B8:B47<>"")*(B8:B47<>"N/A")*(ISERROR(SEARCH("Line Closed", C8:C47)))), 1)
B5  Bottleneck section(s)   =TEXTJOIN(", ", TRUE, IF((AB8:AB47=B4)*(...same filters...), B8:B47, ""))
AC  Constraint indicator    =IF(AB=$B$4, "BOTTLENECK: "&TEXT(AB,"0"), "")
```

So capacity flows: **theoretical daily → × 0.65 (rounded) → less losses, plus recovery → × 7 weekly →
less TOC allocations → spare**; the route's spare capacity is the **minimum spare across sections**,
and the section(s) at that minimum are labelled the bottleneck.

The workbook uses a single capacity factor for every route. V4 §4.2 presents the 65% as a planning
guideline that can differ per route — see §11.6.

### 11.3 Checked against the extract

Predictions from the formulas above, against the values the extract shows (all matched):

| Section | Theoretical | Practical | `ROUND(th×0.65)` | Weekly | `practical×7` |
| --- | --- | --- | --- | --- | --- |
| CITY DEEP - JUPITER | 72 | 47 | 47 | 329 | 329 |
| ROOIKOP (I) - RIETVALLEI (E) | 42 | 27 | 27 | 189 | 189 |
| GLENCOE (E) - VRYHEID (I) | 14 | 9 | 9 | 63 | 63 |
| CATO RIDGE (E) - PINETOWN (I) — line closed | 15 | 10 | 10 | **0** | 0 by rule |
| CHAILEY (I) - DALTON (E) | 11 | 7 | 7 | 49 | 49 |

The line-closed rule is confirmed by the arithmetic, not assumed: CATO RIDGE–PINETOWN has a practical
daily capacity of 10 and a weekly practical of 0, which only the `SEARCH("Line Closed", depot)` branch
produces.

The rows above come from the workbook's display sheet; **the FY selected there was not captured**, so
these values are period-unpinned (§11.0). What the checks establish is that the formulas behave as
read — `ROUND(x×0.65)`, `×7`, and zero for a closed line — and that holds in any FY. To use a figure,
re-read it with its FY.

Worked example — the workbook's selected case, **FY29/30, General Freight: Johannesburg to Durban**:
route spare capacity **49**, bottleneck **CHAILEY (I) - DALTON (E)**. That reconciles: 11 × 0.65 = 7.15
→ 7 → 7 × 7 = 49, and 11 is the lowest theoretical capacity on the route (every other section is 13+),
with no TOC allocations on it.

One inconsistency is recorded rather than smoothed over. This worked case is labelled **FY29/30** in the
capture, while exception 11 says the display sheet's FY selector (`$B$1`) was not captured. Both cannot
be true of the same sheet, so **no figure in §11.3 carries an attributed financial year** until the
workbook is re-read with the FY recorded — the label above is *as captured*, not verified. This is the
same rule §11.0 states, applied to the one place where the capture appears to contradict itself.

### 11.4 Route identity across the sources

The three supplied sources name the same ten routes differently. Canonical name from the workbook's
`Lists` sheet, matched to §10's KPI corridors and V4's corridors:

| Workbook route (canonical) | §10 KPI corridor | V4 corridor |
| --- | --- | --- |
| General Freight: Johannesburg to Durban | Johannesburg–Durban (City Deep–Kingsrest) | Container / North corridor |
| General Freight: Johannesburg to Cape Town | Johannesburg–Cape Town (City Deep–Bellville) | Cape corridor |
| Manganese | Manganese (HTZ–PE) | North corridor |
| Magnetite | Magnetite (PHW–RBQ) | North-East corridor |
| General Freight & Export Coal: Lephalale to Richards Bay | Lephalale–Richards Bay | North corridor |
| General Freight: Musina - Pyramid South/Hoedspruit | Musina–Pyramid / Hoedspruit | North corridor |
| Eastern Mainline: Rayton to Komatipoort/Richards Bay | Rayton–Komatipoort / Richards Bay | North-East corridor |
| General Freight: Mafikeng to Beaconsfield/Potchefstroom | Mafikeng–Beaconsfield / Potch | Central corridor |
| General Freight: Vereeniging/Danskraal to East London | Vereeniging/Danskraal–East London | Cape corridor |
| Ore | Ore (SAZ–SIS) | Ore corridor |

Ten routes in both, one-to-one — but the V4 column above is **indicative only**: mapping a route to a
V4 chapter corridor is an interpretation that has to be confirmed, because the workbook's route names
are service paths, not the chapters' corridor boundaries. A canonical route identifier is needed before
any rule, KPI or capacity figure is joined across sources.

The **depot** field is the accountability dimension (20 depots appear: Witbank, Nelspruit, Ermelo,
Vryheid, Isando, Koedoespoort, Krugersdorp, Vereeniging, Heidelberg, Ladysmith, Durban, Bloemfontein,
Kimberley North, Kimberley South, East London, Bellville, Saldanha, Port Elizabeth, Polokwane,
Empangeni). Six of them are the same depots §10's substation targets name — Bellville, Koedoespoort,
Krugersdorp, Port Elizabeth, Witbank, Nelspruit — so depot is a joinable entity across both workbooks.

### 11.5 Capacity changes between financial years

Sections carry the same name but different theoretical capacity across FYs (for example on the
Johannesburg–Durban route, DONNYBROOK–FRANKLIN 15 → 16, FRANKLIN–MATATIELE 12 → 13,
BETHLEHEM–ARLINGTON 19 → 24, ARLINGTON–GUNHILL 27 → 21, GUNHILL SOUTH–KROONSTAD 12 → 22, and
CHAILEY–KRANSKOP 14 → 15 between FY26/27 and FY27/28). These are **workbook** financial years, not
V4's operating periods (§11.0). This is direct source evidence for the requirement the workstream
already carries: **capacity is versioned by financial year**, and a rule without an effective period
would be wrong. It is not evidence that V4's 2026/27–2027/28 rules changed — and a workbook FY change
must not be read as a V4 rule change.

### 11.6 Exceptions and open questions — for `RailSourceException` review

Eleven items, none resolved. Under the workstream's pipeline these become **controlled source-review
records** (step 2 of §9 item 5), not code: captured → reconciled → questions logged → independently
reviewed → only then system rules.

1. **Status embedded in a name.** "Line Closed" appears inside the **Depot** value (`NELSPRUIT (Line
   Closed)`, `DURBAN (Line Closed)`, `ERMELO (Line Closed)`, `VEREENIGING (Line Closed)`,
   `EAST LONDON (Line Closed)`, `HEIDELBERG (Line Closed)`, `KRUGERSDORP (Line Closed)`), and the
   weekly-capacity formula recovers it with a text search. A closed section should be an explicit
   attribute, not a substring of a depot name.
2. **Non-countable "train paths lost".** CHAILEY–DALTON carries TSR 0.1853419071158129 and MA
   **−0.1853419071158129**; BOOTH–CLAIRWOOD carries 7.8 and 0.2. Both pairs net to whole numbers
   (0 and 8 exactly), so they look like float decompositions of a percentage-derived figure — but a
   *negative* number of train paths lost is not a count, and neither is 7.8. Resolve before a rule
   consumes these columns. (Note: on the bottleneck section the two artefacts cancel, so the reported
   spare of 49 is unaffected — the defect is in the column's meaning, not that result.)
3. **One capacity factor for all routes.** `B3 = 0.65` is applied to every route, while V4 §4.2
   describes the factor as a guideline that may vary by route. Corroboration of the arithmetic is not
   confirmation that a single constant is correct.
4. **Undefined section notation.** Section names carry `(I)`, `(E)`, `(S)`, `(N)` markers
   (`RAYTON (I) - WITBANK (E)`, `DANSKRAAL-SUID (S) - HARRISMITH (E)`) with no definition in the
   extract. Do not guess their meaning.
5. **Section identity is positional.** Sections are identified by `Section Order` within route and FY,
   and the display layer looks up on it. If the number of sections changes between years, the key
   still resolves — but section identity itself is not stable, so a rule or a KPI cannot be keyed to
   "section 17" across years.
6. **"Spare" is a minimum over spare, not over utilisation.** A low-capacity section that is barely
   used reports as the bottleneck (that is exactly what happens here: CHAILEY–DALTON has theoretical 11
   and no allocations). The label is therefore about the tightest *section*, not the tightest
   *constraint*; confirm the intended reading before using "bottleneck" in any operational decision.
7. **Formula ranges versus row count.** The route-spare and bottleneck formulas span `B8:B47` / `AB8:AB47`
   (40 rows) while the Johannesburg–Durban route lists **41** sections. If those rows are laid out as
   shown, the 41st section (BAYHEAD) sits outside the min and bottleneck computation. Verify in the
   workbook — this affects a reported figure.
8. **Weekly = daily × 7.** The model assumes seven operating days; the only exclusion is "Line Closed".
   V4 provides for occupations and an annual shutdown, so the weekly figure's relationship to actual
   operating days needs confirmation.
9. **Annexure numbering.** The filename says `Annexure33…` while the annexure list supplied earlier
   calls this **33b** (33 = Network Register, 33a = point-to-point running times). Record which is
   authoritative.
10. **Extract completeness.** `Capacity_DB` has 1,416 rows; the extract shows the FY26/27 blocks in
    full for some routes and only a partial column set for others, and the FY27/28–FY30/31 blocks show
    the theoretical column only. Some of that may be genuine (the workbook may only maintain detail
    for the current year) and some may be elision in transit. **The full 1,416-row dataset is not
    reproduced here** and must be read from the workbook before use.
11. **Unpinned display period.** The FY selected on the display sheet (`$B$1`) was not captured, so the
    values transcribed in §11.3 cannot be attributed to a financial year. Re-read them with the FY
    recorded before any of them is used; until then they are period-unpinned (§11.0). This includes the
    worked case in §11.3, which the capture labels FY29/30 while the selector value itself is not part of
    the capture — reconcile that label against the workbook when re-reading; until then it is as-captured,
    not verified.

## 12. Honest status

Captured, and the parts that touch this repository are now verified against the working tree. Rail
is **not** implemented and must not be described as complete: the access/capacity/agreement/order/KPI
half of the chain is unmodelled, the escalation ladder does not match the source, two mandated
deviation fields are missing, the system-of-record boundary is unresolved, there are no Rail tests,
and none of it has had independent review, interface testing or pilot evidence. The migration chain
remains the active workstream. Annexure 43's KPI framework (§10) and the Annexure 33 capacity model
(§11) are captured as attested Transnet source: the KPI extract has ten corridors whose network totals
reconcile exactly but nine unsettled questions, and the capacity model's arithmetic reproduces
exactly from its own formulas while carrying eleven exceptions. Both are source material awaiting
independent review — neither is a requirement set, and none of it is implemented.

The two sources keep their own periods and must not be merged (§11.0): V4 governs the 2026/27 and
2027/28 operating context; the capacity workbook carries FY26/27, FY27/28, FY29/30 and other workbook
financial years. What the capacity capture gave the design is an **explainable, independently
checkable model** — the arithmetic was verified against the source's own formulas rather than taken on
trust, which is more than transcription. It is not an engine: no capacity computation exists in the
codebase, no fixture or test exists, the route-to-corridor mapping is unconfirmed, and no RAIL-005–RAIL-015
requirement **definition** or traceability matrix has been authored. The identifiers that appear in
§3's coverage map are cross-references from the owner's supplied mapping — §3 says so in its own column
heading — not an authored, reviewed and approved requirement register. Calling this a working capacity engine would be the same
category of overstatement as calling Rail complete.

## 13. Annexure captures supplied 2026-10-02 (20a, 20b, 21, 25, 40)

Supplied by the project owner as pasted text in the Wave-2 brief. **Transcription fidelity is unverified,
and unverifiable from here** (same limit as §1): the tables below were typed from chat text, not read from a
binary. They are rendered from `backend/src/rail/catalog/*.ts`, and `backend/src/rail/rail-docs-sync.spec.ts`
fails if this section ever differs from those catalogs — but that proves doc ↔ code agreement, not agreement
with the original annexure. The reviewer reconciles against the controlled copies.

Handling rules applied: no binary is committed; the sign-off blocks of 20a and the compiler / approver names of
21 are withheld (POPIA, EXC-022) — roles and designations only; the internal server path printed on 20a is
omitted; Annexure 21 is **CONFIDENTIAL-marked** (EXC-013), so only its numeric business rules are kept.

<!-- BEGIN GENERATED: annexure-captures — do not edit; run `docs/tools/render-annexure-captures.ts` -->

### 13.1 Annexure 20b — main train cancellation reasons allocated to responsible parties (v1.3 (updated 19 May 2023))

82 rows, in source order. The annexure has no codes; `CNX-nnn` is a FlowOps-assigned stable key (= source row number in this version; append, never renumber). Source: `backend/src/rail/catalog/cancellation-codes.catalog.ts`.

| Code | Row | Cancellation reason | Responsible party (as printed) | FlowOps allocation |
| --- | --- | --- | --- | --- |
| CNX-001 | 1 | Abnormal working / yard | Rail Operations | Rail Operations (TOC side) |
| CNX-002 | 2 | Animal hit by train | Force Majeure | Force Majeure |
| CNX-003 | 3 | Assets Fire Damage | Could be Force Majeure, Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Force Majeure / Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-004 | 4 | Auxiliary equipment related | Rail Operations | Rail Operations (TOC side) |
| CNX-005 | 5 | Averted collision | Rail Operations | Rail Operations (TOC side) |
| CNX-006 | 6 | Bridge collapsed | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-007 | 7 | Broken axle | Rail Operations | Rail Operations (TOC side) |
| CNX-008 | 8 | Broken rail | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-009 | 9 | Cable Theft | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-010 | 10 | Carriage & Wagons related | Rail Operations | Rail Operations (TOC side) |
| CNX-011 | 11 | Collision | Rail Operations | Rail Operations (TOC side) |
| CNX-012 | 12 | Community unrest | Force Majeure | Force Majeure |
| CNX-013 | 13 | Container / Container Terminal Related | Rail Operations | Rail Operations (TOC side) |
| CNX-014 | 14 | Covid-19 | Force Majeure | Force Majeure |
| CNX-015 | 15 | Crew issues | Rail Operations | Rail Operations (TOC side) |
| CNX-016 | 16 | CTC / Train Authorisation related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-017 | 17 | Customer-related | Rail Operations | Rail Operations (TOC side) |
| CNX-018 | 18 | Dangerous Goods / Environmental Spillage and Leakage related | Rail Operations | Rail Operations (TOC side) |
| CNX-019 | 19 | Derailment | Could be Force Majeure, Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Force Majeure / Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-020 | 20 | ECP failure | Rail Operations | Rail Operations (TOC side) |
| CNX-021 | 21 | Electrical Substation related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-022 | 22 | Emergency brake application | Rail Operations | Rail Operations (TOC side) |
| CNX-023 | 23 | EOT Device / Telemeter Failure | Rail Operations | Rail Operations (TOC side) |
| CNX-024 | 24 | Eskom related issues / Power Failure | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-025 | 25 | Hook-up | Could be Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-026 | 26 | ICTM / System / Network-related | Could be Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-027 | 27 | Industrial Action | Could be Force Majeure, Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Force Majeure / Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-028 | 28 | Injury / Death of Personnel | Could be Force Majeure, Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Force Majeure / Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-029 | 29 | ITP not adjusted / ITP related issues | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-030 | 30 | Kombi issues | Rail Operations | Rail Operations (TOC side) |
| CNX-031 | 31 | Level Crossing related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-032 | 32 | Line obstruction | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-033 | 33 | Loco await inspection or repair | Rail Operations | Rail Operations (TOC side) |
| CNX-034 | 34 | Loco battery theft | Rail Operations | Rail Operations (TOC side) |
| CNX-035 | 35 | Loco failure | Rail Operations | Rail Operations (TOC side) |
| CNX-036 | 36 | Loco undersupply | Rail Operations | Rail Operations (TOC side) |
| CNX-037 | 37 | Loco imbalance | Rail Operations | Rail Operations (TOC side) |
| CNX-038 | 38 | Loco planning | Rail Operations | Rail Operations (TOC side) |
| CNX-039 | 39 | Loco refuelling | Rail Operations | Rail Operations (TOC side) |
| CNX-040 | 40 | Municipality related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-041 | 41 | No / late Empty Wagon Supply | Rail Operations | Rail Operations (TOC side) |
| CNX-042 | 42 | No Product | Rail Operations | Rail Operations (TOC side) |
| CNX-043 | 43 | Non compliance to plans (ITP, YPP) | Rail Operations | Rail Operations (TOC side) |
| CNX-044 | 44 | Non-supply of Materials | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-045 | 45 | NWB issues | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-046 | 46 | OBC-related failures | Rail Operations | Rail Operations (TOC side) |
| CNX-047 | 47 | Occupations related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-048 | 48 | OHTE related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-049 | 49 | On-Track Machines Related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-050 | 50 | Over- / Skew Loading | Rail Operations | Rail Operations (TOC side) |
| CNX-051 | 51 | Overborder issues | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-052 | 52 | Pandroll springs theft | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-053 | 53 | Perway related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-054 | 54 | Point Theft | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-055 | 55 | Point failure | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-056 | 56 | Points ran through | Rail Operations | Rail Operations (TOC side) |
| CNX-057 | 57 | Port issues (TPT) | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-058 | 58 | Port windbound | Force Majeure | Force Majeure |
| CNX-059 | 59 | PRASA issues | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-060 | 60 | Product Contamination | Rail Operations | Rail Operations (TOC side) |
| CNX-061 | 61 | Radio / TDU failure | Rail Operations | Rail Operations (TOC side) |
| CNX-062 | 62 | Rail Network related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-063 | 63 | Railway Technology related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-064 | 64 | Removal of Not-to-Go's | Rail Operations | Rail Operations (TOC side) |
| CNX-065 | 65 | Rolling Stock Maintenance Related | Rail Operations | Rail Operations (TOC side) |
| CNX-066 | 66 | Runaway Rail Wagons | Rail Operations | Rail Operations (TOC side) |
| CNX-067 | 67 | Section Congested | Could be Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-068 | 68 | Yard / Siding congestion | Could be Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-069 | 69 | Security related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-070 | 70 | Shunting challenges | Rail Operations | Rail Operations (TOC side) |
| CNX-071 | 71 | SPAD | Rail Operations | Rail Operations (TOC side) |
| CNX-072 | 72 | Speed Restrictions related | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-073 | 73 | TE related issues | Rail Operations | Rail Operations (TOC side) |
| CNX-074 | 74 | Train Robbery | Could be Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-075 | 75 | Theft | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-076 | 76 | Vandalism | Could be Force Majeure, Infrastructure Manager or Rail Operations | Allocation required — Clearinghouse (Force Majeure / Infrastructure Manager (TRIM) / Rail Operations (TOC side)) |
| CNX-077 | 77 | Wagons related | Rail Operations | Rail Operations (TOC side) |
| CNX-078 | 78 | Wash away | Force Majeure | Force Majeure |
| CNX-079 | 79 | Wayside Readers faulty | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-080 | 80 | Weather | Force Majeure | Force Majeure |
| CNX-081 | 81 | Weigh Bridge not functioning / not calibrated | Infrastructure Manager | Infrastructure Manager (TRIM) |
| CNX-082 | 82 | Yard Derailment | Rail Operations | Rail Operations (TOC side) |

### 13.2 Annexure 40 — TRIM ancillary services catalogue (2026/27)

40 numbered services in 4 tiers, flattened to 113 priced lines. **The annexure publishes no prices** — only units of measure; `TBD` is not zero. Source: `backend/src/rail/catalog/ancillary-services.catalog.ts`.

**Tier 1 — INFRASTRUCTURE ACCESS SERVICES (safety critical and compulsory)** — 7 line(s)

| Code | # | Service | Line | Unit of measure | Price |
| --- | --- | --- | --- | --- | --- |
| ANX40-01 | 1 | Yards: Shunting and marshalling services (List of Yards.xlsx) | — | Per wagon movement (varies per train category: GF <50 wagons; Medium heavy >50 <100; heavy >100) | not published |
| ANX40-02 | 2 | Inland terminals: Handling of containerized cargo for modal transfers from road to rail (List of Terminals.xlsx) | — | Per container handled | not published |
| ANX40-03 | 3 | Radio network (Trunk & Open Channel): Radio support services for compulsory onboard train communications | — | Per Radio (monthly subscription) | not published |
| ANX40-04-01 | 4 | Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System) | (a) Radio & Telemeter Compliance Testing and Acceptance Support | Per Device | not published |
| ANX40-04-02 | 4 | Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System) | (b) Radio & Telemeter Programming and Configuration Support | Per Device | not published |
| ANX40-04-03 | 4 | Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System) | (c) TOC Radio Onboarding and Activation | Per radio | not published |
| ANX40-04-04 | 4 | Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System) | (d) Train Radio Box and locomotive handset installation and commissioning | Per locomotive | not published |

**Tier 2 — RAIL CRITICAL SUPPORT SERVICES** — 4 line(s)

| Code | # | Service | Line | Unit of measure | Price |
| --- | --- | --- | --- | --- | --- |
| ANX40-05 | 5 | Track and trace data | — | Per month | not published |
| ANX40-06 | 6 | Rolling stock condition data | — | Per month | not published |
| ANX40-07 | 7 | Locomotive pantograph monitoring data | — | Per loco per month | not published |
| ANX40-08 | 8 | Evaluation of new rolling stock | — | Per certificate (certificate for each wagon/loco) | not published |

**Tier 3 — OPTIONAL RAIL SUPPORT SERVICES** — 17 line(s)

| Code | # | Service | Line | Unit of measure | Price |
| --- | --- | --- | --- | --- | --- |
| ANX40-09 | 9 | Engineering and technical reviews of rail related project proposals | — | Per hour | not published |
| ANX40-10 | 10 | Weigh bridge calibration test train rental (wagons) | — | Per wagon per hour | not published |
| ANX40-11 | 11 | Business case reviews and support | — | Per hour | not published |
| ANX40-12 | 12 | Weigh bridge repair, calibration and validation | — | Per certificate (1 certificate per weighbridge) | not published |
| ANX40-13 | 13 | Rail construction consultancy | — | Per hour | not published |
| ANX40-14 | 14 | Rail infrastructure specifications | — | Subscription Per annum (Fee covers all revisions in that year) | not published |
| ANX40-15 | 15 | Private siding inspections | — | Per inspection | not published |
| ANX40-16 | 16 | Applications for new or upgraded level crossings | — | Per application | not published |
| ANX40-17 | 17 | Quality assurance, testing and commissioning | — | Per certificate | not published |
| ANX40-18 | 18 | Rental of cabooses | — | Per caboose/day | not published |
| ANX40-19 | 19 | Electrical network capacity analysis | — | Per request | not published |
| ANX40-20 | 20 | Electrical protection review and issuing settings | — | Per application | not published |
| ANX40-21 | 21 | OHTE mechanized condition assessments | — | Per run | not published |
| ANX40-22 | 22 | Technical investigations | — | Per request | not published |
| ANX40-23 | 23 | Pantograph and roof equipment inspection | — | Per locomotive | not published |
| ANX40-24 | 24 | Electrical energy performance analysis | — | Per request | not published |
| ANX40-25 | 25 | Electrical Systems and Technology Audits | — | Per request | not published |

**Tier 4 — NON RAIL SERVICE** — 85 line(s)

| Code | # | Service | Line | Unit of measure | Price |
| --- | --- | --- | --- | --- | --- |
| ANX40-26-01 | 26 | Unlit dark optic fiber National Long Distance (50 - 1000km) | Installation of dark optical fibre cables NLD (50-1000km) for Leasing | Per installation (once off) | not published |
| ANX40-26-02 | 26 | Unlit dark optic fiber National Long Distance (50 - 1000km) | Leasing of dark optical fibre cables NLD (50-1000km) | Per month (usage) | not published |
| ANX40-26-03 | 26 | Unlit dark optic fiber National Long Distance (50 - 1000km) | Maintenance of leased fibre links to ensure operational integrity (NLD) 50-1000km | Per km/month | not published |
| ANX40-27-01 | 27 | Dark optic fibre Metro (0 - 50km) | Installation of dark optical fibre cables (Metro) 0-50km for leasing | Per installation (once off) | not published |
| ANX40-27-02 | 27 | Dark optic fibre Metro (0 - 50km) | Leasing of dark optical fibre cables (Metro) 0-50km for leasing | Per month (usage) | not published |
| ANX40-27-03 | 27 | Dark optic fibre Metro (0 - 50km) | Maintenance of leased fibre links to ensure operational integrity (Metro) 0-50km | Per km/month | not published |
| ANX40-27-04 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Digital transmission link with a capacity of 2.048 Mbps (E1) | Per Month (usage) | not published |
| ANX40-27-05 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Synchronous Transport Module level 1 (STM-1) 155.52 Mbps | Per Month (usage) | not published |
| ANX40-27-06 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Synchronous Transport Module level 1 (STM-4) 622.080 Mbit/s or 622 Mbps | Per Month (usage) | not published |
| ANX40-27-07 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Synchronous Transport Module level 1 (STM-16) 2.5 gigabits per second (2,488.320 Mbit/s) | Per Month (usage) | not published |
| ANX40-27-08 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Synchronous Transport Module level 1 (STM-64) 10 Gigabits per second (10 Gbps) | Per Month (usage) | not published |
| ANX40-27-09 | 27 | Dark optic fibre Metro (0 - 50km) | [Installation of Transmission links] Installation of any single transmission link from the list above | Per link (Once off) | not published |
| ANX40-27-10 | 27 | Dark optic fibre Metro (0 - 50km) | [Data Transmission Speed packages] 1 Gbps | Per month | not published |
| ANX40-27-11 | 27 | Dark optic fibre Metro (0 - 50km) | [Data Transmission Speed packages] 2,5 Gbps | Per month | not published |
| ANX40-27-12 | 27 | Dark optic fibre Metro (0 - 50km) | [Data Transmission Speed packages] 5 Gbps | Per month | not published |
| ANX40-27-13 | 27 | Dark optic fibre Metro (0 - 50km) | [Data Transmission Speed packages] 10 Gbps | Per month | not published |
| ANX40-28-01 | 28 | Dark fibre support services - real estate: Rental of physical space for telecoms equipment | Space in Comms Room 3 X 3 | Per room/month | not published |
| ANX40-28-02 | 28 | Dark fibre support services - real estate: Rental of physical space for telecoms equipment | Utilities (electricity) MRC | Per room/month | not published |
| ANX40-28-03 | 28 | Dark fibre support services - real estate: Rental of physical space for telecoms equipment | Site Access | Per site visit | not published |
| ANX40-29-01 | 29 | Installation of non-TRIM optic fibre cables | Underground Fiber installation | Per meter | not published |
| ANX40-29-02 | 29 | Installation of non-TRIM optic fibre cables | Overhead Fiber installation | Per meter | not published |
| ANX40-30-01 | 30 | Radio & Wireless Communication Services | Enterprise and non-rail radio network access | Per radio/month | not published |
| ANX40-30-02 | 30 | Radio & Wireless Communication Services | UHF/VHF fixed base station and repeater deployment | Per site/project | not published |
| ANX40-30-03 | 30 | Radio & Wireless Communication Services | UHF/VHF handheld and mobile radio service | Per unit | not published |
| ANX40-30-04 | 30 | Radio & Wireless Communication Services | Intrinsically safe radio service | Per unit | not published |
| ANX40-30-05 | 30 | Radio & Wireless Communication Services | Marine VHF communication service | Per unit/site | not published |
| ANX40-30-06 | 30 | Radio & Wireless Communication Services | Radio high-site co-location service | Per site/month | not published |
| ANX40-30-07 | 30 | Radio & Wireless Communication Services | Port terminal wireless and Navis connectivity support | Per terminal/month | not published |
| ANX40-30-08 | 30 | Radio & Wireless Communication Services | Managed Wi-Fi, access point, controller, wireless gateway and associated backhaul services for port operational areas and modern mobile terminals | Per access point/site/month | not published |
| ANX40-30-09 | 30 | Radio & Wireless Communication Services | Narrowband wireless gateway and repeater support for TOC port operations | Per gateway or repeater/month | not published |
| ANX40-31-01 | 31 | Transmission & Data Connectivity Services | Dedicated wavelength service | Per wavelength/month | not published |
| ANX40-31-02 | 31 | Transmission & Data Connectivity Services | Managed wavelength service | Per wavelength/month | not published |
| ANX40-31-03 | 31 | Transmission & Data Connectivity Services | DWDM/OTN managed transport service | Per link/month | not published |
| ANX40-31-04 | 31 | Transmission & Data Connectivity Services | Carrier Ethernet service (E-Line/E-LAN) | Per link/month | not published |
| ANX40-31-05 | 31 | Transmission & Data Connectivity Services | MPLS/IP VPN service | Per site/month | not published |
| ANX40-31-06 | 31 | Transmission & Data Connectivity Services | Microwave radio link service | Per link once off/month | not published |
| ANX40-31-07 | 31 | Transmission & Data Connectivity Services | Satellite backhaul service | Per terminal once off plus subscription | not published |
| ANX40-31-08 | 31 | Transmission & Data Connectivity Services | Legacy access network service | Per port/link/month | not published |
| ANX40-32-01 | 32 | Telecommunication Facilities & Infrastructure Services | Telecommunications room, rack and outdoor colocation | Per rack/room/m²/month | not published |
| ANX40-32-02 | 32 | Telecommunication Facilities & Infrastructure Services | AC/DC power and battery-backup service | Per connection/month or metered usage | not published |
| ANX40-32-03 | 32 | Telecommunication Facilities & Infrastructure Services | Telecommunications site access service | Per site visit | not published |
| ANX40-33-01 | 33 | Ad Hoc Installations | Lan Point Installations | Per Site | not published |
| ANX40-33-02 | 33 | Ad Hoc Installations | CCTV Installations | Per Site | not published |
| ANX40-34-01 | 34 | Future Digital Telecommunication Services | DMR network access service | TBD | TBD (≠ free) |
| ANX40-34-02 | 34 | Future Digital Telecommunication Services | LTE broadband and MCPTT service | TBD | TBD (≠ free) |
| ANX40-34-03 | 34 | Future Digital Telecommunication Services | LTE and DMR hybrid interworking service | TBD | TBD (≠ free) |
| ANX40-34-04 | 34 | Future Digital Telecommunication Services | DMR and LTE high-site coverage service | TBD | TBD (≠ free) |
| ANX40-34-05 | 34 | Future Digital Telecommunication Services | Mission-critical smart device service | TBD | TBD (≠ free) |
| ANX40-34-06 | 34 | Future Digital Telecommunication Services | Intelligent NOC and customer service assurance | TBD | TBD (≠ free) |
| ANX40-34-07 | 34 | Future Digital Telecommunication Services | Smart port telecommunications and IoT connectivity | TBD | TBD (≠ free) |
| ANX40-35-01 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of specialist vehicle | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-02 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of Fire Engine 3500 litres | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-03 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of Water tanker | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-04 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of Grass unit | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-05 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of Incident Command vehicle / response vehicle | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-06 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | Use of First response vehicle | Per call-out (first 30mnts) / Per vehicle per hour | not published |
| ANX40-35-07 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Decanting spade pump | Per unit | not published |
| ANX40-35-08 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Decanting Hetz pump | Per unit | not published |
| ANX40-35-09 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Fire extinguishers (dcp) | Per extinguisher | not published |
| ANX40-35-10 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Alco foam concentrates | Per litre | not published |
| ANX40-35-11 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Oil cap | Per litre | not published |
| ANX40-35-12 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Spillsorb | Per 10 kg bag | not published |
| ANX40-35-13 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Splash suite | Per suit | not published |
| ANX40-35-14 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Use of specialized fire equipment] Scba - Self-Contained Breathing Apparatus | Per unit | not published |
| ANX40-35-15 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Specialized Labour] Labour - Chief Fire Officer | Per hour | not published |
| ANX40-35-16 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Specialized Labour] Labour - Senior Fire Officer | Per hour | not published |
| ANX40-35-17 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Specialized Labour] Labour - Fire Officer | Per hour | not published |
| ANX40-35-18 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Specialized Labour] Labour - Fire Fighter | Per hour | not published |
| ANX40-35-19 | 35 | Emergency response services to fire, chemicals spills, derailments and other emergencies. | [Specialized Labour] Water used | Per kl | not published |
| ANX40-36-01 | 36 | Fire equipment maintenance services | Maintenance of 4,5 kg DCP Fire Extinguisher | Per extinguisher | not published |
| ANX40-36-02 | 36 | Fire equipment maintenance services | Maintenance of 9 kg DCP Fire Extinguisher | Per extinguisher | not published |
| ANX40-36-03 | 36 | Fire equipment maintenance services | Maintenance of 5 kg Co2 Fire Extinguisher | Per extinguisher | not published |
| ANX40-36-04 | 36 | Fire equipment maintenance services | Maintenance of 9 kg Water Fire Extinguisher | Per extinguisher | not published |
| ANX40-36-05 | 36 | Fire equipment maintenance services | Maintenance of 9 kg Foam Water Fire Extinguishers | Per extinguisher | not published |
| ANX40-36-06 | 36 | Fire equipment maintenance services | Maintenance of Fire Hose Reels | Per reel | not published |
| ANX40-36-07 | 36 | Fire equipment maintenance services | Maintenance of Fire Hydrants | Per hydrant | not published |
| ANX40-37-01 | 37 | Fire equipment and escape signages supply services | Supply of Fire equipment Signages (Pair - item and Arrow) | Per pair | not published |
| ANX40-37-02 | 37 | Fire equipment and escape signages supply services | Supply and installation of escape signages (Pair - item and Arrow) | Per pair | not published |
| ANX40-38-01 | 38 | Technical support services: Provision of fire prevention support services and training equipment. | Provision of Fire Risk Assessment | Per assessment | not published |
| ANX40-38-02 | 38 | Technical support services: Provision of fire prevention support services and training equipment. | On site evacuation drills / Simulations and feedback | Per drill/simulation | not published |
| ANX40-38-03 | 38 | Technical support services: Provision of fire prevention support services and training equipment. | Rail Route Risk Assessment/Profiling | Per site | not published |
| ANX40-38-04 | 38 | Technical support services: Provision of fire prevention support services and training equipment. | Lecture rooms etc. per day or part thereof | Per room per day | not published |
| ANX40-38-05 | 38 | Technical support services: Provision of fire prevention support services and training equipment. | Fire training grounds, drill yard, equipment and props etc. for practical fire training/drills and demonstrations per day or part thereof (NEW) | Per day/per hour | not published |
| ANX40-39 | 39 | Access to wayleaves | — | Per application | not published |
| ANX40-40 | 40 | Staging | — | TBD | TBD (≠ free) |

### 13.3 Annexure 25 — TOC self-screening form (Second Draft, 12 March 2024)

The document is a **draft**. Source: `backend/src/rail/catalog/self-screening.catalog.ts`.

| No. | Key | Assessment (verbatim) | Evidence requested / refers to |
| --- | --- | --- | --- |
| (i) | solvency | Is the prospective Applicant's business solvent and liquid? If the answer is "Yes", you are requested to submit signed letter issued by the currently appointed external auditors of the prospective Applicant confirming that it is a going concern and that it is solvent and liquid. | Signed letter from the currently appointed external auditors confirming going concern, solvency and liquidity |
| (ii) | rolling_stock_compliant | Will the prospective Applicant have their own/leased rolling stock that is compliant with the prescribed specifications and that is compatible with the network configuration each as set out in the Information Pack, and will such rolling stock be available for physical inspection during the evaluation of any Application that it may submit in respect of the Competitive Contracting Process? | — |
| (iii) | rolling_stock_condition | Will the asset condition of the rolling stock envisaged in question (ii) be such that it is capable of safe, immediate and ongoing operation on the Transnet freight rail network? | — |
| (iv) | crewing | Does the prospective Applicant have adequate crewing manning methodology and details for Train communication equipment, available to operate trains in the slots and on the routes that are envisaged in the Information Pack and that it intends to apply for, within 3 months of the conclusion of the relevant contracts with Transnet? | — |
| (v) | training_rsr_permit | Is the prospective Applicant willing to make its train operating personnel (including but not limited to its train drivers) available, at its own cost, to undergo any required training (as determined by the Faculty of Rail) including training in respect of the Local Area Working Rules and associated procedures? Please note that the deployment of suitable qualified and certified train operating personnel is a prerequisite for the granting of an RSR Permit and in accordance to SANS 3000-4 requirements. | Refers to: RSR Permit; SANS 3000-4 |
| (vi) | operating_model_plans | The prospective applicants have an appropriate business operating model, security plan, environment management plan and the prospective applicant's willingness to participate in the IM community and socio development plans. | — |
| (vii) | volume_guarantee | The prospective applicants must ensure that there are rail volume forecasts and guarantees in the form of a letter confirming this from and signed by the cargo owner for timetable period or Framework agreement period. The letter should include the duration of the contract, tonnages (to be) contracted, confirmation that the TOC is the nominated haulage service provider. Refer to Annexure 34 (Volume Confirmation Letter). | Cargo-owner letter: contract duration, tonnages contracted, confirmation that the TOC is the nominated haulage provider · Refers to: Annexure 34 (Volume Confirmation Letter) |

### 13.4 Annexure 20a — cancel or re-plan / re-schedule TOC train process (v4 (30 Sep 2024)) and Annexure 21 rules

Roles only: the named individuals in the sign-off blocks are withheld (POPIA, register EXC-022). Source: `backend/src/rail/catalog/cancellation-process.catalog.ts`.

| Step | Path | Title | Detail |
| --- | --- | --- | --- |
| 1 | COMMON | Submit TOC Request for Train Cancellation with reasons (via TOL / TEMS-TOMS) | Request TOC train(s) to be cancelled due to TOC reasons. · Authorised TOC personnel must contact the IM Customer Liaison Officer directly. · Request must also be submitted via TOL; TOC selects the possible cancellation reason(s) on TOL. · Notice within 15 minutes of the event's occurrence, or as soon as it is discovered that there will be a TOC mainline slot compromise (incidents, operational issues, resource constraints …). |
| 2 | COMMON | Submit Yard Operating Company (YOC) request for train(s) cancellations due to Yard Operator reasons (via TOL) | Only authorised Yard Operator personnel can communicate TOC train cancellations — directly to authorised IM personnel. · Notice within 15 minutes of occurrence / discovery. |
| 3 | COMMON | Submit TRIM Request for Train Cancellation | Request TOC train(s) to be cancelled due to TRIM reasons. · Notice within 15 minutes of occurrence / discovery. · Cross-reference in the diagram: par 6.5.4.2 in the Network Statement. |
| 4 | COMMON | Submit Port / Port Terminal Operator Request for Train Cancellation | Only authorised Port / Port Terminal Operator personnel can communicate TOC train cancellations — directly to authorised IM personnel. · Notice within 15 minutes of occurrence / discovery. · Cross-reference in the diagram: par 6.5.4.2 in the Network Statement. |
| 5 | COMMON | Submit PRASA / Over-Border IM / Other IM Request for Train Cancellation | — |
| 6 | COMMON | Receive notification of TOC Train Cancellation Request and acknowledge receipt | Authorised TOC personnel must contact the IM Customer Liaison Officer directly. · Acknowledge receipt of the train cancellation request within 1 hour. |
| 7 | COMMON | Capture TOC trains to be cancelled, reasons and responsible party (Daily Handshake Process — Daily Handshake Report Template, via designated e-mail per corridor) | Capture and verify the reason for the cancellation linked to the Train Slot Number (including Force Majeure) and all supporting information required by the Daily Handshake Template. · Log all incidents that impact train slot utilisation and on-time train performance. · Use incident information from TOMS/TEMS ("TOC Execution and Monitoring" process) and the Daily Handshake Templates. |
| 8 | SHORT_NOTICE_LE_48H | Assess total ITP impact of the requested TOC Train Cancellation (Execution and Monitoring Process) | Capture the cancellation reason; state whether it is outside IM control (Force Majeure). · Assess which other TOC trains are impacted; check the cancellation clauses in the rail access agreement; impact assessment for the full corridor. |
| 9 | SHORT_NOTICE_LE_48H | Prioritise all impacted TOC slots | — |
| 10 | SHORT_NOTICE_LE_48H | Assess if the impacted TOC train(s) can be re-planned, re-scheduled or re-routed | Decision: can impacted TOC train(s) be re-planned, re-scheduled or re-routed? |
| 11 | SHORT_NOTICE_LE_48H | Assess possible alternative available slot(s) and propose re-planned / re-scheduled / re-routed slot(s) | — |
| 12 | SHORT_NOTICE_LE_48H | Discuss possible alternative slot(s) with TOCs (receive possible alternative slots) | — |
| 13 | SHORT_NOTICE_LE_48H | Provide TOC train rescheduling inputs | Decision: did the TOC accept the proposed re-planned / re-scheduled / re-routed slots? |
| 14 | SHORT_NOTICE_LE_48H | Update an emergency dynamic version of the ITP | (">48 hours" path, same step number: "Update relevant planning version of ITP (7 day, 72 hour, 48 hour)".) |
| 15 | SHORT_NOTICE_LE_48H | Communicate the updated emergency dynamic version of the ITP | (">48 hours" path: "Communicate the updated relevant planning version of ITP (7 day, 72 hour, 48 hour)".) |
| 16 | SHORT_NOTICE_LE_48H | Acknowledge receipt of updated ITP (containing re-planned / re-scheduled / re-routed slot(s)) | — |
| 17 | SHORT_NOTICE_LE_48H | Provide pilot services for TOC crew that lacks route knowledge on new re-scheduled routes | This service can be provided by TFROC to TOCs at a fee. |
| 18 | CONVERGED | Cancel requested / impacted TOC train(s) and update ITP | Reached when the impacted trains cannot be re-planned, re-scheduled or re-routed. |
| 19 | CONVERGED | Notify impacted TOC(s) of train cancellation(s) | — |
| 20 | CONVERGED | Compile TOC Train Cancellation Notice, with reasons and responsible parties | — |
| 21 | CONVERGED | Acknowledge receipt of train cancellation(s) | Decision: does a cancelled en-route TOC train require staging? |
| 22* | CONVERGED | Stage the impacted TOC train | Printed without a number in the source; 23 and 24 follow it. |
| 23 | CONVERGED | Arrange security measures to safeguard staged trains | — |
| 24 | CONVERGED | Re-plan movement of staged train | If no staging is required: go to the TOC Charges and Penalties Process (skip steps 18–24, go to end interfaces where applicable). |

\* step number not printed in the source; inferred from the sequence.

**Initiators (steps 1–5)**

| Step | Initiator | Channel |
| --- | --- | --- |
| 1 | Train Operating Company (TOC) | IM Customer Liaison Officer directly AND via TOL (TEMS-TOMS) |
| 2 | Yard Operating Company (YOC) — on behalf of the IM | TOL, directly to authorised IM personnel |
| 3 | TRIM (any department: Asset Maintenance and Management, Security, Network Service Planning, Network Operations, Safety, …) | — |
| 4 | Port / Port Terminal Operator (TPT) | directly to authorised IM personnel |
| 5 | PRASA / Over-Border IM / Other IM | — |

**Timings and windows quoted by the annexures**

| Quantity | Value | Source |
| --- | --- | --- |
| Cancellation notice | within 15 minutes of the event / discovery | [ANX-20a steps 1–4] |
| Acknowledge receipt | within 1 hour | [ANX-20a step 6] |
| Short-notice threshold | 48 hours before real time | [ANX-20a decision] |
| ITP planning versions | 7_DAY / 72_HOUR / 48_HOUR | [ANX-20a step 14, >48 h path] |
| Clearinghouse dispute window | 24 hours | [ANX-21 business rules] |
| Closed to dispute after | 48 hours | [ANX-21 business rules] |
| Unresolved-dispute investigation | within 48 hours (Network Operations Interface Manager) | [ANX-21 process] |
| National Clearinghouse | Tue–Fri 12:00; Mon 10:30 | [ANX-21 business rules] |

### 13.5 Reference data actually loaded (corridors and yards)

Source: `backend/src/rail/catalog/corridors.catalog.ts`, `yards.catalog.ts`.

| Code | V4 corridor | Pre-V4 aliases | Annexure 33b routes (indicative) | Data status | Gauge / electrification / axle load / profile / train length |
| --- | --- | --- | --- | --- | --- |
| COR-CONTAINER | Container | Natal | General Freight: Johannesburg to Durban | SOURCE_PENDING | not supplied |
| COR-CAPE | Cape | Cape 1 | General Freight: Johannesburg to Cape Town; General Freight: Vereeniging/Danskraal to East London | SOURCE_PENDING | not supplied |
| COR-ORE | Ore | Cape 2 | Ore | SOURCE_PENDING | not supplied |
| COR-NORTH | North | Northern | Manganese; General Freight & Export Coal: Lephalale to Richards Bay; General Freight: Musina - Pyramid South/Hoedspruit | SOURCE_PENDING | not supplied |
| COR-NORTH-EAST | North-East | — | Magnetite; Eastern Mainline: Rayton to Komatipoort/Richards Bay | SOURCE_PENDING | not supplied |
| COR-CENTRAL | Central | — | General Freight: Mafikeng to Beaconsfield/Potchefstroom | SOURCE_PENDING | not supplied |

Transfer yards in the catalog: **0 of 11** expected by the brief (none supplied). Corridors: **6 of 6**, all `SOURCE_PENDING`.

<!-- END GENERATED: annexure-captures -->

### 13.6 What this changes, and what it does not

| Area | Before | Now |
| --- | --- | --- |
| §3 row "Annexure 20a, 20b → RAIL-013" | `CANCELLATION` / `RESCHEDULE` categories exist; reason catalogue **not** modelled | The 82-row reason catalogue and the 24-step process are captured as typed catalogs (§13.1, §13.4). The commercial-consequence logic is Wave 3 |
| §3 row "Annexure 25 → RAIL-005 / RAIL-006" | **nothing** | Seven-question form captured and enforced as the submission cover page (draft status carried) |
| §3 row "Annexure 40 → not in the supplied mapping" | **nothing** | 113 priced lines catalogued with units; **prices still unpublished** |
| Annexure 21 | summarised in R-014.1 | Numeric rules re-checked against the supplied v5 text — consistent; see below |

**Reading exceptions found in the supplied text** (proposed; numbering continues the requirement register's EXC-025):

| # | Exception | Source |
| --- | --- | --- |
| EXC-032 | Annexure 20a labels the >48 h path "NO branch (>48 hours)" and the other path "NO branch →" under the one decision "received >48 Hours before real time?". The step content disambiguates it (short notice → *emergency dynamic ITP*; >48 h → *planning ITP versions 7 day / 72 hour / 48 hour*) and FlowOps follows the content. Confirm against the diagram | 20a decision + steps 14–15 |
| EXC-034 | Annexure 25 is a **"Second Draft"** (12 Mar 2024). The question set is provisional | 25 title |
| EXC-035 | Annexure 21's revision table runs backwards in time: v2 = 27 Oct 2023, v3 = 11 Mar 2023, v4 = 11 Mar 2023. (Also the cover says v5, the body header "V4" — EXC-013.) | 21 revision table |
| EXC-036 | Annexure 20b has no codes and no version beyond "v1.3 updated 19 May 2023"; ten rows are "Could be …" and are not allocated by the annexure | 20b |
| EXC-037 | Annexure 40: Staging and all seven Future Digital lines are `TBD`; no line carries a price (restates EXC-025 for the full line set) | 40 |
| EXC-038 | The brief calls Annexure 25 "flexing windows"; the supplied document is the self-screening form and contains no time windows | brief vs 25 |

**Still outstanding (not supplied):** Annexures 13, 14, 23, 24, 41, 37, 38, 39, 22, 26, 27a–c, 30, 31, 34;
Network Statement Chapter 2 (corridor and yard technical data — gauge, electrification, axle load, vehicle
profile, train length, siding capacity, contacts) and Chapter 5 (tariff tables). Nothing that depends on them has
been given invented values; see `docs/RAIL-RASA-AUDIT-2026-10-02.md` §6.

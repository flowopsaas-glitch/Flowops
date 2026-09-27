# RAIL-005 – RAIL-015 requirement register and traceability matrix

**Status: PROPOSED BASELINE — AUTHORED, NOT APPROVED.** This document is the formal requirement
register and traceability matrix that the release-readiness matrix gates on. Authoring is not
approval: it is written as a proposal for the rail source owner to approve and for an independent
reviewer to review afterwards (two separate gates, both currently open). **Rail remains gated
non-production.** Nothing in this document is production implementation, and this change commits
documentation only — no code, schema, migration or flag changes accompany it.

- **Date authored:** 2026-09-27
- **Author:** Arena session agent, on the owner's instruction to begin after the approved Transnet
  source pack was supplied in full ("ok im DONE lets begin")
- **Owner approval:** ☐ PENDING
- **Independent review:** ☐ UNASSIGNED — not started
- **Effective period:** none. Every requirement below is scoped to source periods; none is in force.
- **Sequencing note:** the release-readiness matrix places approval after the migration decision.
  Authoring now is owner-directed; the migration decision and clone-evidence chain still gate
  approval, implementation and everything downstream.

## 1. Purpose and identifier policy

The register defines requirement statements for identifiers **RAIL-005 through RAIL-015** and maps
every one of them to source, interface and test, as the gate requires.

**Identifier policy.** The authoritative RAIL register was never supplied (source register §7 item 4,
§9 item 3 — "where does that register live?"). The identifiers used here are therefore exactly those
that appear in the owner's supplied mapping (as recorded in the source register's §3 coverage map),
used as given and not re-invented. The requirement *text* is proposed baseline derived from the
approved source pack. Where the supplied mapping provides no anchor, the identifier is marked
**UNDEFINED** rather than given an invented meaning — that is the case for **RAIL-009**.

| ID range | Treatment here |
| --- | --- |
| RAIL-005 – RAIL-015 | Defined in this register (RAIL-009 UNDEFINED — reserved) |
| RAIL-002 / 003 / 004 | Cross-referenced only (capacity / network-register family per the supplied mapping). Captured in the source register §11; outside this gate's range |
| RAIL-001, RAIL-016+ | Not present in the supplied mapping. Owner to assign or confirm they do not exist |

## 2. Evidence base

All content below traces to the approved source pack supplied and attested by the project owner
across 2026-09-26/27. Per the source register's storage rule, **bulk source text and workbooks are
never committed to Git** — this register and the source register are what the repository keeps.

| # | Source | Vintage / version | Received |
| --- | --- | --- | --- |
| S1 | Network Statement Volume 4 (TRIM) | September 2026; governs 2026/27 + 2027/28 timetable periods | full body text (pp. 2–203) + annexure list |
| S2 | Rail Access Agreement (Annexure 15 template) + Annexure C commercial tables | template as published; blank party fields | full |
| S3 | Annexure 18 — Roles & responsibilities, occurrence management | undated; transitional ("still contains reference to Transnet") | full (3 matrices) |
| S4 | Annexure 21 — Clearinghouse Process Narrative | v5, 30 Sep 2024; body header says "V4" (EXC-013) | full; **CONFIDENTIAL-marked** |
| S5 | Annexure 28 — Daily TOC-IM Handshake | v2.5, 16 Aug 2024 | full (19 steps + decisions) |
| S6 | Annexure 29a — Network Access Application Form | as published | full |
| S7 | Annexure 29b — Network Capacity Statement | Ver 2, Dec 2024 — **2025/26 timetable vintage** (EXC-012) | full |
| S8 | Annexure 32 — Ad-hoc Slot Requests Process | v1.5 header; revision history ends at 1.0 (EXC-014) | full |
| S9 | Annexure 33 — Network Register | June 2026, v0.3; 2026/27 timetable | full |
| S10 | Annexure 33a — Point-to-point running times workbook | `Annexure33a_NSver.4(1).xlsx`, sheet `*00750*Report_Train_Route`, ~25 167 rows | extract |
| S11 | Annexure 33b — Capacity Statement workbook | `Annexure33CapacityStatement.xlsm` (Capacity Statement / Capacity_DB / Lists) | extract (5 FY × 10 routes) |
| S12 | Annexure 35 — Resolve Customer Disputes | v01, 03 Dec 2024 | full |
| S13 | Annexure 36 — Emergency Response Plan ("Tribunal Process") | `013-TFR-COR-HFES-15007` v4, 30 Sep 2024, 73 pp | full |
| S14 | Annexure 40 — Ancillary Services Catalogue | 2026/27 | full (40 services, 4 tiers) |
| S15 | Annexure 43 — KPI workbook | `Annexure 43 KPIs (1).xlsx` — current + future frameworks + 10 corridor sheets | full extract |
| S16 | TRIM downloads index (public site listing) | NS v3 / 2024-25 page + v4-era upload IDs | listing only |

Provenance attestations and the period-separation rule are held in the source register §1 and §11.0
(PR #436 tree, `docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md`, Revisions 1–8) and are
incorporated here by reference: **V4 rules bind to 2026/27–2027/28; workbook figures bind to their own
financial years; the KPI extract is period-unestablished. Values are never substituted across sources.**

## 3. Evidence gaps — referenced but NOT in the pack

These are recorded so nothing is lost; requirements that depend on them are marked evidence-blocked.

| Annexure | Referenced by | Availability |
| --- | --- | --- |
| 2–12 (clearances, gauges, loops, gradients, classification, radio/tunnel/bridge/CAS/depot maps) | NS Ch 2 | **Withheld from public download by policy** — released on application with signed Annexure 31 NDA (NS §4.5.5.2.2) |
| 13, 14, 23 (pantograph, diesel nozzle, shunting stock specs) | NS Ch 2 / RAA cl. 3.5.10 | public downloads exist (S16) — not supplied |
| 16, 17, 22, 24, 25, 26, 27a–c, 30, 31, 34 | NS Ch 3–5 | public downloads exist (S16) — not supplied |
| 19a–c (POSMOR, TWR, General Appendix) | NS §6.5.3 | public downloads exist — not supplied |
| 20a, 20b (cancel/re-schedule process; cancellation reason catalogue) | NS §6.5.7 | public downloads exist — not supplied; **blocks RAIL-013 reason catalogue** |
| 37, 38 (create monthly order; capture weekly train-path order) | NS Ch 6 | **not published** on the downloads index (S16) — internal/TOL class, same class as Annexure 21's CONFIDENTIAL marking; **blocks RAIL-011 order-cycle detail** |
| 39 (resolve handshake disputes) | NS §6.6.1.14 | **not published** — internal/TOL class |
| 41 (occurrence reporting procedure) | NS §6.5.6.8 | public download exists (`id=21716`) — not supplied; **blocks RAIL-015 reporting trail** |
| 42 (Transnet Customer Collaboration Policy) | **not in the NS v4 annexure index** but published (`id=21717`) — EXC-018 | not supplied |
| 44 (table of changes) | NS Ch 1 annexure list | likely embedded in the v4 document — not located in the pack |
| RAA Annexures A, B, D–J (slot schedules, approved cargo instances, bank details, guarantee form, safety permits, consents, s37(2) agreement, security plan) | RAA | templates/blanks only |

## 4. Requirements

Each requirement is stated as normative text with clause-level citations. Status values:
**Implemented** (code matches source) · **Partial** · **Gap** (source requires, code lacks) ·
**Unmodelled** (no implementation) · **Evidence-blocked** (pack incomplete). No requirement below is
approved or in force.

### RAIL-005 — Network access application and self-screening

*Mandate (proposed):* FlowOps shall be able to record and manage an Access Seeker's application for
Train Path capacity as a controlled, auditable record, without itself granting access.

- **R-005.1** Application record per route/Train Path with the Annexure 29a field set: applicant
  identity and contacts; origin/destination stations and siding numbers; forward/return frequency;
  slot request period; traction type (diesel, 25 kV AC, 3 kV DC, dual, 50 kV AC); locomotive, wagon
  and train-configuration particulars; commodity type and UIC codes; volume forecasts (daily →
  annual); en-route stoppage points with reasons; crewing methodology; ancillary-service
  requirements; payment method (Credit Guarantee | Cash). *(S6; NS §4.5.10)*
- **R-005.2** Self-Screening Checklist (Annexure 25) as the application cover page; applicant
  verifies key capabilities before proceeding. *(NS §4.5.8.1; S16 lists Annexure 25 — evidence-blocked
  for the checklist's own fields)*
- **R-005.3** Application fees are recorded as payable, not computed here: R125 000 per freight Train
  Path and R42 000 per passenger Train Path, non-refundable, subject to annual escalation. *(S2
  Annexure C; NS §5.2.10)*
- **R-005.4** Dangerous/abnormal cargo applications carry the required evidence: Safety Data Sheet,
  police explosive permit, hazmat-competent drivers, and proof of RSR application. *(S6 §2.2)*
- **R-005.5** Ad-hoc applications follow Annexure 32: submitted **21 days** before execution;
  rejection communicated within **7 days**; new TOCs validated/on-boarded before slot assessment;
  technical validation (axle mass, gauge, HAZMAT, train dynamics, speed profiles, tunnel limits);
  operational-risk assessment; pro-forma slot specifications confirmed before quoting via TOL.
  *(S8; timing tension with NS §4.4.9.5 "at least one month" — EXC-015)*
- **R-005.6** Personal data in applications is handled under POPIA; the form carries a POPIA notice.
  *(S6 header)*

- **Interfaces today:** none. `RailService`/`RailConsignment` (enterprise `rail` entitlement) covers
  consignments/wagons/intermodal legs only and is outside this mapping.
- **Tests today:** none. **Status: Unmodelled.**

### RAIL-006 — Controlled documents, credit and access prerequisites

*Mandate:* the prerequisite evidence chain for access shall be recorded with controlled-document
discipline: what was submitted, when, by whom, and under which confidentiality terms.

- **R-006.1** Controlled-document register for the access prerequisites: RSR Safety Permit, technical
  compliance evidence, rolling-stock compatibility/RSR "No Objection", crew competence and route
  knowledge (TAFoR/TETA), operational readiness, Environmental Management Plan (Annexure 26),
  Risk Analysis (Annexure 27a–c), Security Plan (PSIRA-registered providers), B-BBEE certificate or
  sworn affidavit, insurance certificates. *(NS §3.4.2–3.4.3; S2 cl. 4.1 conditions precedent)*
- **R-006.2** Credit and guarantee records: credit application (Annexure 30) with financial
  statements; Guarantee equal to **10% of the annual aggregate of GTKs × Access Fee** for each
  Contract Year, from a bank/financial institution on the Annexure E form; replacement guarantees ≥30
  days before each subsequent Contract Year; guarantee lapse/withdrawal is an Event of Default.
  *(S2 cl. 13.1–13.2, 1.3.35.6–7; NS §5.2.5)*
- **R-006.3** Confidentiality: Annexure 31 NDA execution is a prerequisite for withheld annexures
  (2–12) and network-condition detail; the RAA confidentiality clause governs disclosure and return
  or destruction of confidential information. *(NS §4.5.5.2.2, §2.7.5; S2 cl. 35)*
- **R-006.4** Volume Confirmation Letter (Annexure 34) per cargo owner: contract duration, tonnages
  contracted, nominated transport provider. *(NS §4.5.10.5–6)*
- **R-006.5** Insurance record: policies per S2 cl. 22 (all-risk incl. unrest, third-party liability,
  indemnities), certificates 3 months pre-commencement and ≥20 Business Days before each Contract
  Year; repudiation/cancellation notification and 15-Business-Day replacement rule. *(S2 cl. 22.5–22.8)*

- **Interfaces today:** none. **Tests today:** none. **Status: Unmodelled.**
  *(Annexure 30/31/34 content not in pack — evidence-blocked for their field sets.)*

### RAIL-007 — Capacity, network register and running times (cross-reference to RAIL-002/003/004)

*Mandate:* capacity facts — section-level theoretical/practical capacity, losses, allocations, spare
capacity, bottlenecks and running times — shall be held as **period-pinned, versioned reference
data** with their source identity preserved. (The supplied mapping anchors the capacity family to
RAIL-002/003/004; RAIL-007 covers the capacity statement per the same mapping line.)

- **R-007.1** Capacity model as attested: practical daily = ROUND(theoretical × factor) with factor
  **0.65 as implemented in the workbook** but presented in NS §4.2 as a per-route guideline (EXC-001);
  daily available = max(0, practical − TSR losses − MA losses + infra recovery + recovered-unused);
  weekly = daily × 7 **except "Line Closed" → 0**; route spare = MIN(section weekly spare); bottleneck
  section(s) = the minimum; weekly spare = weekly − Σ(TOC allocations). *(S11 sheets; NS §4.2.7)*
- **R-007.2** Every capacity value is keyed by financial year and route; the period-separation rule
  applies — workbook FY values never enter a V4 rule period and vice versa; section identity is
  name-based, not position-based (EXC-006). *(S11 Capacity_DB key `FY|Route|SectionOrder`; source
  register §11.0, §11.5)*
- **R-007.3** Network Register (Annexure 33) semantics: route = origin–destination–commodity triple;
  declared capacity reduced by TSRs, manual authorisations and degraded configurations; the
  longest-headway section sets route capacity; scope = TRIM-owned infrastructure only (PRASA and
  concessioned IMs excluded); allocated = contractually committed (s5(2) ERT Act protection);
  terminated agreements return capacity to uncommitted. *(S9 §3–4; S7 §5)*
- **R-007.4** Reliability caveats are first-class: Leeuhof–Warrenton (via Klerksdorp) and
  Thabazimbi–Rustenburg are degraded/critical sections with forced diesel propulsion and
  (Leeuhof–Warrenton only) a reroute via Kroonstad/Bloemfontein. *(S9 §4b)*
- **R-007.5** Running times (Annexure 33a) carry their robustness caveat: stated times hold only when
  the design conditions prevail; theft/vandalism and rolling-stock failures degrade them. Standing
  reasons in the workbook are informal operational shorthand (SHUNT / ORDER / CHANGE OF TCO / TURN OF
  LOCOS / RM / X? / …), not a governed enumeration (EXC-016). *(S10; S9 §3)*
- **R-007.6** Numeric artefacts are never consumed as counts: float decompositions and negatives in
  "paths lost" columns (EXC-002), `02:60:00` runtime, missing corridor tags, midnight-rollover
  conventions read with `Depart_Day`. *(S11 FY26/27 JHB–Durban rows; S10)*

- **Interfaces today:** none (no capacity model in code). **Tests today:** none.
  **Status: Unmodelled** — model attested and arithmetic-checked in the source register §11.2–11.3.

### RAIL-008 — Volume commitments and GTK accounting

*Mandate:* contracted volumes and GTKs — the basis of guarantees, underloading charges and
transformation reservations — shall be recorded per Access Seeker and Contract Year.

- **R-008.1** GTK definition as source: (locomotive weight + tare + load) × distance, including empty
  return legs; Train Km = trains × km. *(S2 cl. 1.3.45, 1.3.111)*
- **R-008.2** Volume Confirmation Letter terms (see R-006.4) feed the 75%-utilisation-over-3-months
  underperformance test and the 15-calendar-day response right before reallocation. *(NS §4.12)*
- **R-008.3** Loading discipline with commercial consequence: overloading above Maximum Carrying
  Capacity (wagons >3 t over do not proceed); underloading ≥10 t below capacity is carded off and
  pays the full slot fee; skew loading must be corrected before departure, delay costs to the Access
  Seeker. *(S2 Annexure C; NS §5.2.11)*

- **Interfaces today:** none. **Tests today:** none. **Status: Unmodelled.**

### RAIL-009 — UNDEFINED

The supplied mapping contains **no anchor for RAIL-009**. No requirement is invented here. Owner to
confirm whether the identifier exists, what it covers, or that the numbering skips. *(Source register
§9 item 3 remains open.)*

### RAIL-010 — Rail Access Agreement and interface agreements

*Mandate:* the contractual frame — RAA lifecycle, commercial terms, force majeure, breach,
dispute clauses and interface agreements — shall be represented as controlled records with the
Network Statement incorporated and prevailing on conflict.

- **R-010.1** RAA lifecycle: signature date → conditions precedent (insurance proof, Annexure 35-pack
  submissions incl. social development annexure, signed Interface Agreement, Security Plan, Risk
  Analysis, Environmental Plan, RSR permit, credit check + guarantee, rolling stock acquired and
  RSR-approved, cargo-handler capacity confirmation, cross-border arrangements) fulfilled ≥3 calendar
  months before Service Commencement Date → Effective Date; initial term 15 Contract Years (max 180
  months); extension by 6 months' written notice. *(S2 cl. 3–4)*
- **R-010.2** NS incorporation and precedence: the Network Statement (including revisions) is
  integral to the agreement; **the NS prevails on conflict**; amendments in writing signed by both
  parties (cl. 43), except NS revisions incorporated per cl. 5. *(S2 cl. 5, 42–45)*
- **R-010.3** Commercial terms: Access Fee monthly in advance per slot; additional charges
  (overloading, underloading, skew, occurrence management, traction electricity pass-through,
  penalties) monthly in arrears; invoice amounts payable by the **25th**; invoice queries within **30
  days** (deemed correct thereafter); Default Interest = RMB Prime + 2%, daily compounding; annual
  escalation by PPI from the second Contract Year; set-off prohibited except disputed items. *(S2
  cl. 10–12; Annexure C)*
- **R-010.4** Force majeure procedure: written notice ≤5 Business Days; particulars/impact/estimate/
  mitigation within a further 15 Business Days; cessation notice ≤10 Business Days; on request a
  report within 3 months; affected Train Paths may be reallocated meanwhile and revert after;
  >6 months of FM → FM-related amendment process (15 BD engagement, 30 BD agreement window,
  Independent Expert, termination right on 60 BD notice); IM endeavours an alternative slot or
  refunds the Train Path fee. *(S2 cl. 29)*
- **R-010.5** Breach and default: material breach — 30-day cure, then specific performance,
  termination or (Access Seeker breach) suspension of access; non-material — 14-day cure, then
  written warning ladder with 60-day recurrence windows before suspension/damages; Events of Default
  (creditor arrangements, cession/CoC breach, insolvency events, R10m+ execution escalating 5%/yr,
  guarantee failures, 30-day non-payment) permit immediate termination or suspension. *(S2 cl. 30,
  1.3.35)*
- **R-010.6** Dispute clauses (contractual track): internal referral to representatives (10 Business
  Days) then CEOs (5 Business Days) → arbitration (Association of Arbitrators rules, Sandton seat,
  urgent basis available; legal/accounting/other qualification rules; 7-day review-notice and 30-day
  review commencement; confidentiality); Expert Disputes (FM impact/duration, clause-10 amounts,
  agreed matters) → Independent Expert (≥15 years rail freight experience; determination ≤25
  Business Days; final barring manifest error; costs on the unsuccessful party; nominated via the
  Johannesburg Society of Advocates chair → Legal Practice Council chair → High Court). *(S2 cl. 32)*
- **R-010.7** Interface Management Agreement (Annexure 24) per interfacing party (PRASA and others);
  RSR Safety Permit application requires the RAA and Interface Agreement; PRASA interfaces retain
  PRASA's liability for its network. *(S2 cl. 4.1.3, 6.5; NS §1.5.3, §3.4.2.1)*
- **R-010.8** Assignment/change of control: no cession or Transfer (incl. pledge, cession in
  securitatem debiti beyond the lender-protection carve-out) without IM consent; Change of Control
  needs prior written approval (intra-group exception with audit-firm credit certificate); IM
  corporatisation transfers are consent-free; lender direct-agreement rights with IM approval of
  substitutes (30 business days). *(S2 cl. 36–38)*

- **Interfaces today:** none (no agreement model). **Tests today:** none. **Status: Unmodelled.**

### RAIL-011 — Order cycle and Daily Handshake

*Mandate:* the monthly order → weekly order → daily execution → Daily Handshake chain shall be kept
as the controlled operating record: every deviation tied to its Train/Slot and Order number, its
cause, its responsible party, its impact, its evidence trail and its escalation state.

- **R-011.1** Monthly order cycle: service codes loaded **20th–25th**; Access Seeker confirms Train
  Paths; feasibility check and offer/acceptance; invoice generated on the **26th**; payment per RAA
  cl. 11. *(NS §6.4.1; S5 references Annexure 37 — evidence-blocked)*
- **R-011.2** Weekly cycle: orders furnished **Tuesdays by 11:00**; integrated do-ability forum
  **Thursdays at 11:00** signs off the ITP; planned occupations ≤13 h (monthly routine) / ≤12 h with
  7 days' notice (NS body says both figures — EXC-011); annual shutdown 7–10 days with 14 days' notice
  for changes. *(NS §6.4.2–6.4.4; S5 references Annexure 38 — evidence-blocked)*
- **R-011.3** Deviation logging is **independent and tri-party**: IM, the TOC **and the Yard
  Operator** each log every out-of-tolerance deviation from the published ITP on TOMS (or an agreed
  external system for the TOC), each with a preliminary reason/cause, **linked to the Train/Slot and
  Order number**; IM also logs deviations caused by other IMs. *(S5 step 1)*
- **R-011.4** Deviation record fields (NS §6.6.1.3.3 + S5 steps 5–6): date/time, location, deviation
  type, description, size/impact, **other Train Paths impacted**, **SLA KPIs impacted**, party causing,
  primary reason/cause, delay minutes — plus root cause (updated as information emerges), responsible
  party ∈ {IM, specific TOC, another IM, external to Transnet, Force Majeure}, slot impact ∈ {not
  taken up, cancelled, re-scheduled, delayed + total delay minutes}. The two bold fields are **missing
  from the current model** (source register §6.2 — Gap G-4/G-5).
- **R-011.5** Report lifecycle: preliminary 24-hour log → detail verification (missing information
  chased) → impact assessment → validation against Yard Operator shift reports → **final 24-hour
  Handshake Report per TOC at 08:00 daily**, consolidating the previous 24 h of shifts, every item
  linked to supporting documentation, published via **TOL**; TOC reviews, raises and cites evidence
  for disputed items ("open handshake items"); **sign-off covers every item including flagged open
  items**; IM files signed reports with red-flagged items and supporting information. *(S5 steps 2–12;
  NS §6.6.1)*
- **R-011.6** Escalation of open items — **three source renderings must be reconciled before encoding
  (EXC-017)**: NS §6.6.1.14 (24 h → Access Seeker Liaison Manager → 48 h → Head of Access Seeker
  Service → 72 h → Head of NSP&O, resolve within 96 h → RLF → Regulator); S5 (24 h → Customer Liaison
  Officer → 48 h → Manager: Customer Service → 72–96 h → Head: Customer Service → IM Network
  Operations Manager → RLF → Regulator); and the code ladder (see §6). Final TOC feedback on
  unresolvable items within **96 h of the first handshake report**; unresolved items logged to the
  next Route Logistics Forum. *(S5 steps 13–19; NS §6.6.1.14–16)*
- **R-011.7** Terminal commercial step: upon resolution feedback and TOC satisfaction, the Head of IM
  invoices the TOC — **cash TOCs pay; guarantee TOCs are debited within 24 hours of resolution**.
  *(S5 final step)*
- **R-011.8** Report identity and evidence: per-tenant report numbering; counterparty (railOperator),
  corridor, operating-day window (reportDate/windowStart/windowEnd); IM's TOL reference retained;
  disputes against a deviation carry the TOC's reason and supporting documentation. *(S5 steps 4–10)*

- **Interfaces today (partial):** `RailHandshakeReport` (DRAFT → PENDING_TOC → SIGNED_OFF → DISPUTED
  → CLOSED; sign-off fields; `imReference`), `RailHandshakeDeviation` (trainSlotRef, orderNumber,
  category/reason/rootCause/location/occurredAt/delayMinutes, responsibleParty, slotImpact, costZar/
  costRecovered, status LOGGED→AGREED→OPEN→RESOLVED→DISPUTED, escalationStage, disputeReason,
  resolutionNote, resolvedAt, escalatedAt); `rail-handshake.controller.ts` routes
  `GET overview|reports|reports/:id`, `POST reports`, `PATCH reports/:id`,
  `POST reports/:id/issue|sign-off|run-escalation|deviations`,
  `PATCH/POST/DELETE reports/:id/deviations/...` (update, review, resolve, dispute, delete);
  `rail-handshake.service.ts` methods matching; scheduled escalation sweep.
- **Tests today:** **none** (verified 2026-09-27: zero spec/test files under `backend/src/rail`).
- **Status: Partial.** Gaps: other-Train-Paths-impacted + SLA-KPI fields (G-4/G-5); ladder rung and
  role variance (EXC-017); no yard-operator logging party; no monthly/weekly order models
  (evidence-blocked on Annexures 37/38); no automated 08:00 issuance.

### RAIL-012 — Train Path (slot) management, KPIs and emergency-response cross-reference

*Mandate:* Train Paths and their performance — allocation state, modification requests, utilisation
and KPI measurement — shall be tracked per period; the emergency-response classification shall be
referenceable from operational records.

- **R-012.1** Train Path semantics: capacity to run a Train origin→destination over a period ("Slot"
  in older versions); access limited to Train Paths offered, accepted and reflected in the ITP;
  access is "as is" as to network condition. *(S2 cl. 6.1, 6.8.2; S1 glossary)*
- **R-012.2** Allocation principles and prioritisation as source: existing agreements first (ERT Act
  s5(2)); then economic benefit, volume-commitment validation, optimal path use (longer trains, more
  volume), operational readiness, operating methodology, road-to-rail, capital injection; passenger/
  social-development preference; dangerous goods; block-train consolidation; full-route preference;
  equal treatment → proportional allocation; congested-network alternatives; waiting list without
  entitlement. Under-utilisation <75% over 3 months → reallocation after a 15-day response window.
  *(NS §4.8, §4.12)*
- **R-012.3** KPI framework reference data (Annexure 43): current framework (transit times — joint
  IM+TOC, TSR km/% and counts, MA counts, TQI p50, traction index, substation availability — IM,
  quarterly/route) and future framework (OTD/OTA ±30 min on SPRINT, delay minutes split IM/TOC, slot
  modification requests/acceptance and post-rejection cancellations, IM non-compliance, TOC
  non-usage: advance cancellation **threshold "xx" unresolved (EXC-007)** and no-show, train-control
  R/track-km). KPI results are period-unestablished (§2 period rule); enforceable service levels only
  once the TER so determines. *(S15; NS §6.7, Table 23)*
- **R-012.4** Emergency-response reference: occurrences classified **Level 3 / Code Red (disaster),
  Level 2 / Code Orange (major), Level 1 / Code Green (minor)** with the A–E scenario matrix
  (hazmat, collisions incl. level-crossing, derailments, service interruptions, fire/bomb/hijack) and
  Tribunal triggers; operational records shall be able to carry the classification. *(S13 §6.4,
  scenario tables)*
- **R-012.5** Ad-hoc Train Path handling per R-005.5; Declined Slots and cancellations per RAIL-013;
  "Modifications rejected then cancelled" counted as cancellations in KPI terms. *(S15; S2 cl.
  10.1.2.2)*

- **Interfaces today:** none (no train-path or KPI model). **Tests today:** none.
  **Status: Unmodelled.**

### RAIL-013 — Cancellation, rescheduling and their commercial consequences

*Mandate:* cancellations and re-schedules shall be recorded with reason, attribution and the correct
commercial consequence, and shall be distinguishable from no-shows and declines.

- **R-013.1** Definitions: Cancellation = actual or deemed failure to run a train or utilise a Train
  Path (by TRIM, yard operator or Access Seeker); cancellations recorded in the TEMS and/or IIMS with
  unique auditable reference numbers; Force Majeure cancellations recorded distinctly; only
  authorised personnel may cancel. *(S1 glossary; NS §6.5.7.3)*
- **R-013.2** Attribution: Access Seeker cancels (written notice after ITP publication) → allocated to
  the Access Seeker; TRIM cancels (shutdown/occupation/occurrence, not attributable to the Access
  Seeker) → allocated to the TRIM. *(NS §6.5.7.1–6.5.7.2)*
- **R-013.3** Commercial consequences (NS §5.2.10.9 = S2 Annexure C): cancellation before the weekly
  do-ability → credit if the path is reallocated; full cancellation >72 h before departure → credit if
  reallocated; full cancellation ≤72 h up to departure without Force Majeure → **forfeit access fees
  paid in advance**; TRIM-caused cancellation where the replacement path is not accepted → **full
  Train Path fee refund**, subject to the limitation of liability; non-utilisation on the ITP without
  FM → deemed cancellation, fees retained; TRIM failure to provide contracted paths (excl. FM and
  planned occupations) → full credit. Access Fee remains payable despite Declined Slots and
  cancellations. *(S2 cl. 10.1.2, 10.2.6.2, Annexure C; NS §5.2.14)*
- **R-013.4** Reason catalogue: cancellations carry a standard catalogue of reasons with likely
  causes/remedies (Annexure 20b — **evidence-blocked**; do not invent the catalogue); Cancel/Re-schedule
  process per Annexure 20a (**evidence-blocked**). *(NS §6.6.1.6.2, §6.5.7)*
- **R-013.5** Handshake integration: cancellation/no-show/reschedule appear as deviation categories
  with impact classes and delay minutes (RAIL-011.4); the future KPI "cancellation ≥xx days before
  departure" threshold is **not derivable** from the 72-hour commercial rule and stays open (EXC-007).
  *(S5 step 6; S15)*

- **Interfaces today (partial):** `DeviationCategory.CANCELLATION|RESCHEDULE|NO_SHOW`,
  `SlotImpact.CANCELLED|RESCHEDULED|NOT_USED`. **Tests today:** none.
- **Status: Partial** — commercial consequences and the reason catalogue are **not modelled**
  (source register §3, RAIL-013 row).

### RAIL-014 — Clearinghouse, handshake disputes and customer disputes

*Mandate:* attribution disputes shall follow the source's governed ladders — the operational
Clearinghouse track and the contractual/customer tracks — with their windows and finalities intact.

- **R-014.1** Clearinghouse (Annexure 21 v5): daily Service Quality Meetings allocate reasons with
  disputes resolved there first; unresolved → Corridor Clearinghouse (Execution Manager: Planning &
  Execution); unresolved → **National Clearinghouse, daily at 12h00 Tue–Fri and 10h30 Mondays**,
  chaired by the IM Head of Planning & Execution with IM Rep, each TOC Rep and TFR Operations;
  **24-hour window** to discuss/dispute cancellation reasons; **cancellations older than 48 hours are
  closed to dispute**; root cause captured on current information and refined SQM → Corridor →
  National; post-Board-of-Inquiry changes only retrospectively on written Transnet Security/Risk
  evidence; TOCs must send authorised representatives; penalties/fines per signed SLAs; still
  unresolved → investigation coordinated by the Network Operations Interface Manager **within 48
  hours**, reported to the National Clearinghouse chairperson, TEMS/TOMS updated by the IM Customer
  Liaison Officer; outputs feed the Daily Handshake Reports. *(S4)*
- **R-014.2** Handshake dispute windows per RAIL-011.6 (24/48/72–96 h → RLF → Regulator) — subject to
  EXC-017 reconciliation.
- **R-014.3** Customer disputes (Annexure 35): post-contracting complaints lodge via **SAP CRM**;
  Key Account Manager logs/categorises per SOP; department SME validity assessment; SME resolution;
  rejected → Department Head/GM → rejected → TRIM CEO → Transnet Group COO/GCE → **Transport Economic
  Regulator (Rail)**, whose decision is **final and binding**, save the ERT Act s22 carve-out where
  the IM can compellingly argue a more capacity-optimal solution. Pre-contracting complaints follow a
  separate "Resolve Applicants Dispute Process" (evidence-blocked). Terminology drift "Customer" vs
  "TOC" in the source is an exception (EXC-019), not a rule. *(S12; NS §4.7.1.6)*
- **R-014.4** Contractual disputes per RAIL-010.6. Capacity disputes per NS §4.7.1 (consultation
  window, alternative paths, TER referral). The four tracks — capacity (NS §4.7.1 / applicants
  process), operational/cancellation (Clearinghouse + Handshake), customer-service (Annexure 35),
  contractual (RAA cl. 32) — shall not be conflated in any model. *(S1; S2)*

- **Interfaces today (partial):** `DeviationStatus.DISPUTED`, `EscalationStage.REGULATOR_DISPUTE`,
  `lodgeDispute`. **Tests today:** none.
- **Status: Partial** — no Clearinghouse process/ledger; no customer-dispute model.

### RAIL-015 — Occurrence management, reporting and cost attribution

*Mandate:* railway occurrences shall be reportable with a governed role/cost-attribution record and
an external-reporting trail, distinct from ordinary deviations.

- **R-015.1** Reporting chain: any occurrence (train in motion or stationary) is reported
  **immediately** by the Access Seeker to the IM Train Control Officer → Duty Manager: Occupations and
  Incident Management → the Safety Regulator; each operator also reports independently to the RSR per
  prescribed timelines; causation disputes unresolved within **60 days** may go to an independent
  expert. *(NS §6.5.6.1–6.5.6.6)*
- **R-015.2** Roles (Annexure 18 §1.1.1.1): TOC reports to IM CTC; IM OCC reports to Head Office and
  the RSR; IM activates the contingency/emergency plan, manages the site, runs responders (fire/
  ambulance/SAPS), recovery machines, infrastructure repair and rehabilitation; joint investigation
  with IM Corporate Safety, TOC included; annexure is transitional ("references to Transnet will be
  amended once the IM is fully established" — EXC-020). *(S3)*
- **R-015.3** Cost attribution if the TOC is negligent (Annexure 18 §1.1.1.2): own derailment / Level X
  → **Affected TOC** bears all response, management, investigation, recovery, repair and rolling-stock
  replacement costs; TOC-vs-TOC collision → **Negligent TOC**; TFR-collision → **Negligent Party**.
  If theft/vandalism/Force Majeure (§1.1.1.3, investigation required): reporting stays with the TOC;
  the IM absorbs response, site management, recovery, infrastructure repair and rehabilitation costs;
  rolling-stock repair/replacement stays with the TOC (TOC/IM split in the TFR-collision case). *(S3)*
- **R-015.4** Occurrence Management Services charges are the costs of restoring the network,
  determined per occurrence and apportioned to the responsible party after investigation, invoiced in
  the monthly run. *(S2 cl. 10.2.4; NS §5.2.8; S2 Annexure C)*
- **R-015.5** Emergency response interface (Annexure 36): classification per RAIL-012.4; RIC/RIO/RIR
  command with the ECC ≥500 m (per ERG for hazmat); **SAPS leads where fatalities are involved**; no
  clearing after death/injury until medical, fire/rescue and SAPS investigations complete (OHSA GAR
  9(3) with Transnet's DoL exemption WMB B2/4); PRASA/TNPA/overborder interface rules (mutual approval
  before acting on another party's assets); 48-hour preliminary investigation report (form 4.12B);
  Tribunal convenes off-site (Johannesburg) as an ad hoc gathering. *(S13 §6.5–6.19)*
- **R-015.6** Occurrence Reporting Procedure (Annexure 41) is the reporting-trail authority —
  **evidence-blocked** (`id=21716`, not supplied). *(NS §6.5.6.8; S16)*

- **Interfaces today (partial):** deviation cause/party/status only. **Tests today:** none.
- **Status: Partial** — no occurrence register, no role/cost-attribution record, no external
  reporting trail.

## 5. Traceability matrix (summary)

| Req | Source anchors (S# = §2) | Interface today | Test today | Status | Exceptions |
| --- | --- | --- | --- | --- | --- |
| RAIL-005 | S6 (29a), NS §4.5.8–4.5.10, S8 (32), S2 Annexure C | none | none | Unmodelled | EXC-015, EXC-022 (POPIA), EXC-023 (bank details) |
| RAIL-006 | NS §3.4, §4.5.5.2.2, S2 cl. 4, 13, 22, 35 | none | none | Unmodelled | evidence: 25/30/31/34 |
| RAIL-007 | S9, S10, S11, NS §4.2, S7 §5 | none | none | Unmodelled | EXC-001–006, EXC-012 |
| RAIL-008 | S2 cl. 1.3.45/1.3.111, Annexure C, NS §4.12, §5.2.11 | none | none | Unmodelled | — |
| RAIL-009 | — | — | — | **UNDEFINED** | EXC-021 |
| RAIL-010 | S2 cl. 1–49, Annexure C/E | none | none | Unmodelled | EXC-020 (transitional names) |
| RAIL-011 | NS §6.4, §6.6.1, S5 (28) | `RailHandshakeReport`/`Deviation`, 14 routes, service methods | **none** | **Partial** | EXC-017 (ladder), G-4/G-5 (fields); evidence: 37/38/39 |
| RAIL-012 | NS §4.8, §4.12, Table 23, S15 (43), S13 §6.4 | none | none | Unmodelled | EXC-007–010 (KPI) |
| RAIL-013 | NS §5.2.10.9, §6.5.7, S2 cl. 10.1.2/10.2.6.2, Annexure C | categories/impact enums | **none** | **Partial** | EXC-007; evidence: 20a/20b |
| RAIL-014 | S4 (21), S12 (35), NS §4.7.1, S2 cl. 32 | `DISPUTED`, `REGULATOR_DISPUTE`, `lodgeDispute` | **none** | **Partial** | EXC-013, EXC-019; evidence: 39 |
| RAIL-015 | NS §6.5.6, S3 (18), S13 (36), S2 cl. 10.2.4 | deviation cause/party | **none** | **Partial** | EXC-020, EXC-024 (contacts), EXC-025 (ERP artefacts); evidence: 41 |

Cross-cutting rule for every row: rules are **versioned with effective periods** (source register §4);
transitional provisions (ERT Act commencement, TER, penalty framework) are modelled as future-state,
never as live controls (EXC-003).

## 6. Implementation gaps carried forward (from the source register, verified)

| # | Gap | Where |
| --- | --- | --- |
| G-1 | Escalation ladder structure: the 72-hour rung belongs to the Head of NSP&O (NS) / IM Network Operations Manager (S5), not the Route Logistics Forum; the Forum is a later referral | `EscalationStage` enum |
| G-2 | The 96-hour resolve-by step has no code counterpart | `EscalationStage` |
| G-3 | 48-hour role-name drift across NS, S5 and code (Head of Access Seeker Service / Manager: Customer Service / Head of Customer Liaison) | EXC-017 |
| G-4 | Deviation field **other Train Paths impacted** missing | `RailHandshakeDeviation` |
| G-5 | Deviation field **SLA KPIs impacted** missing | `RailHandshakeDeviation` |
| G-6 | No rail tests of any kind (verified 2026-09-27) | — |
| G-7 | No monthly/weekly order models; no capacity/train-path/agreement/KPI/occurrence models | — |

## 7. Exception register — never silently normalised

Consolidates the source register §5/§10.4/§11.6 items with the exceptions found in the annexure pack.
Each is a decision for the owner + independent reviewer; none may be encoded as a rule as-is.

| EXC | Exception | Source |
| --- | --- | --- |
| 001 | 65% capacity factor: guideline varying per route (NS §4.2) vs single workbook constant | S1 vs S11 |
| 002 | Non-countable "paths lost": float decompositions and a negative (−0.185…) pair that cancels on the bottleneck row | S11 |
| 003 | Transitional/future-state provisions (ERT Act, TER, penalty framework) not in force | S1 |
| 004 | Network condition/TSR/MA are moving operational state, republished periodically | S1, S9 |
| 005 | System-of-record boundary: IIMS/TEMS/TOMS/SPRINT/TOL vs FlowOps | S1, S4, S5, S15 |
| 006 | Section identity positional in workbook (`Section Order`) — not stable across years | S11 |
| 007 | Cancellation threshold "≥xx days" placeholder — cannot be inferred from the 72-hour rule | S15 |
| 008 | TSR reduction comments (%) do not reconcile with baseline→target pairs under any single denominator | S15 |
| 009 | TQI direction inconsistent — "within range" band semantics, not minimisation | S15 |
| 010 | KPI extract period-unestablished; NRP/Pilot status flags mean "not yet measured" | S15 |
| 011 | Planned-occupation duration stated as both 12 h and 13 h for the same obligation | S1 §6.4.4 |
| 012 | Annexure 29b is 2025/26 vintage (209.2 Mt / 631 slots wk/dir, R8.2 bn) while the pack's operating context is V4 2026/27 — vintage binding required | S7 |
| 013 | Annexure 21 titled "v5" but body header "V4"; CONFIDENTIAL-marked; named staff | S4 |
| 014 | Annexure 32 header "v1.5" vs revision history ending at 1.0 | S8 |
| 015 | Ad-hoc lead time: 21 days (S8) vs "at least one month" (NS §4.4.9.5) | S1 vs S8 |
| 016 | Annexure 33a artefacts: `02:60:00` runtime, missing corridor tags, midnight rollover needing `Depart_Day`, informal standing-reason codes incl. cross-train references ("X 8818") and "X ?" | S10 |
| 017 | **Three-way escalation-ladder variance** (NS §6.6.1.14 vs S5 vs code) — which document governs within the NS itself (body vs annexure) is a reviewer decision | S1 vs S5 vs code |
| 018 | Annexure 42 (Customer Collaboration Policy) published but absent from the NS v4 annexure index; Annexure 17 listed twice on the downloads page; NS route list duplicates items 9/10 (real tenth = Vereeniging/Danskraal–East London per S11 Lists) | S16, S1, S9 |
| 019 | "Customer" vs "TOC" terminology drift in Annexure 35 | S12 |
| 020 | Transitional TFR-era entity names across S3/S4/S13 (v4 corridor renames: Natal→Container, Cape 2→Ore, Cape 1→Cape, Northern→North) | S3, S4, S13 |
| 021 | RAIL-009 undefined in the supplied mapping | mapping |
| 022 | POPIA personal data in sources (named staff, mobile numbers in S13 hazmat lists; sign-off blocks) — handling constraint, never copied into artifacts | S4, S12, S13, S6 |
| 023 | Annexure 29a publishes TRIM's debtors bank account — cite as fact only, never replicate into artifacts | S6 |
| 024 | Annexure 36 unresolved table cells ("????", partial train/lorry flags) and equipment lists are operational shorthand | S13 |
| 025 | Annexure 40 prices TBD in source (staging; all Future Digital services) — "TBD" ≠ zero/free | S14 |

Pending second-pass items from the source register §5 (crossing-loop inconsistency, 12 h/13 h
occupation durations, mislabelled tables, duplicate section numbers, broken cross-references, annexure
list vs body references) remain open and are folded into EXC-011/EXC-018 where they touch the pack.

## 8. What this document is not

- Not approval. Owner approval and independent review are open gates (§ header).
- Not implementation. No code, schema, migration, route or flag change accompanies this document;
  the six production flags stay false and the rail vertical stays non-production.
- Not a claim of completeness: the evidence gaps in §3 are real, three of them (37/38/39) cannot be
  closed from public sources, and Rail has zero tests (G-6).
- Not a place where source values were normalised: every figure carries its source period, and the
  exception register is the record of what a human must decide before any rule is encoded.

## 9. Approval block

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Rail source owner / product owner | — | ☐ approved / ☐ rejected / ☐ changes requested | — |
| Independent reviewer | — | ☐ reviewed, no findings / ☐ findings attached | — |
| Source-period decision (per EXC-012/010) | — | ☐ recorded | — |
| Unresolved-exception disposition (§7) | — | ☐ recorded | — |
| Effective period | — | none (gated) | — |

Approval evidence to record per the source register §9 item 4: process owner, independent reviewer,
the source-period decision, the unresolved-exception list, approval date, effective period. Until
every line is recorded, no requirement in this register may be cited as approved, and no
implementation may reference it as authority.

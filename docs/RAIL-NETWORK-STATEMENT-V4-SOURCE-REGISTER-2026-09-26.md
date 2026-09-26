# Rail source register — Transnet Network Statement, Volume 4 (September 2026)

**Status: CAPTURED, NOT IMPLEMENTED.** This file records a source and queues the work it implies. It
does **not** start the Rail workstream, and nothing here is evidence that Rail is complete.

Agreed order (unchanged): finish the migration chain first — staging-clone rehearsal → remaining
database-backed coverage → backfill dry-runs → pilot approval — and only then start the Rail
source/design workstream.

Why this record exists: the Transnet Rail Infrastructure Manager **Network Statement, Volume 4,
September 2026** has been received. It is not only an infrastructure description — it defines the
whole operating and governance chain:

> access application → technical/commercial screening → capacity assessment → allocation →
> agreement and conditions precedent → monthly/weekly orders → daily execution →
> cancellation/re-planning → Daily Handshake → Clearinghouse/disputes → occurrence management →
> KPI/performance review

That is the chain FlowOps exists to keep a controlled operating record of (application, evidence,
capacity, decision, agreement, order, execution, deviation, root cause, responsibility, dispute,
outcome), so it materially raises the Rail requirements baseline.

## 1. Source registration record

| Field | Value |
| --- | --- |
| Title | Transnet Rail Infrastructure Manager Network Statement |
| Volume | 4 |
| Publication | September 2026 |
| Pages | 203 — **per the source summary; not re-verified here** |
| Effective operating periods | 2026/27 and 2027/28 references |
| State | `RECEIVED / VALIDATION_REQUIRED` |
| Classification | **UNDECIDED** — `STAKEHOLDER_SOURCE_COPY` or `PUBLIC_OFFICIAL_SOURCE_COPY` (see §7) |
| SHA-256 | **PENDING** — needs the binary |
| Filename | **PENDING** |
| Publisher | Transnet Rail Infrastructure Manager |
| Publication date | September 2026 |
| Source URL | **PENDING** |
| Retrieval date | **PENDING** |
| Validation report | **PENDING** — not started |
| Reviewer | **UNASSIGNED** |
| Approval history | none |

**Storage rule:** the PDF is **never committed to Git**. The binary lives in controlled storage; this
record plus the validation report is what the repository keeps. No `*.pdf` is tracked in this
repository today (verified), and none should be added for this source.

## 2. Coverage map — the source's areas against this repository

Statuses verified in the working tree on 2026-09-26 (`backend/src/rail/`,
`backend/prisma/schema.prisma`). "Nothing" = no model, no service, no endpoint.

| Network Statement area | Requirement (per source summary) | In this repository today |
| --- | --- | --- |
| Annexure 25 self-screening | RAIL-005 / RAIL-006 | **nothing** |
| Annexure 29a access application | RAIL-005 | **nothing** — no access-application model |
| Annexure 30 credit application | RAIL-006 / RAIL-011 | **nothing** on the Rail side |
| Annexure 31 NDA | RAIL-006 / controlled documents | **nothing** — no controlled-document register |
| Annexure 32 ad-hoc train path | RAIL-012 | **nothing** — no train-path model |
| Annexure 33 Network Register | RAIL-002 | **nothing** |
| Annexure 33a running times | RAIL-004 | **nothing** |
| Annexure 33b Capacity Statement | RAIL-003 / RAIL-007 | **nothing** — no capacity model |
| Annexure 34 volume confirmation | RAIL-006 / RAIL-008 | **nothing** |
| Annexure 15 Rail Access Agreement | RAIL-010 | **nothing** — no agreement model |
| Annexure 24 interface management | RAIL-010 / RAIL-014 | **nothing** |
| Annexure 28 Daily Handshake | RAIL-011 | **partial** — `RailHandshakeReport` (DRAFT → PENDING_TOC → SIGNED_OFF → DISPUTED → CLOSED, sign-off + IM reference), deviations with category / responsible party / slot impact / status, escalation ladder, evidence trail |
| Annexure 18 occurrence management | RAIL-015 | **partial** — deviations carry cause category, responsible party and status; no separate occurrence register |
| Annexure 20a cancellation / re-scheduling | RAIL-013 | **partial** — `CANCELLATION` / `RESCHEDULE` deviation categories exist; the 72-hour commercial consequence is **not** modelled |
| Annexure 21 Clearinghouse | RAIL-014 | **partial** — dispute states exist (`OPEN`, `DISPUTED`, `REGULATOR_DISPUTE`); no clearinghouse process or ledger |
| Annexures 37–39 order / handshake processes | RAIL-011 / RAIL-014 | **partial** — daily handshake only; monthly/weekly orders absent |
| Annexure 43 KPIs | RAIL-012 / performance management | **nothing** for rail — no KPI model on the handshake |

Outside the annexures: `RailService` covers consignments, wagons and intermodal legs
(create / list / update / cancel / advance status, tenant-scoped numbering), gated behind the
Enterprise `rail` entitlement. The access → capacity → agreement → order half of the chain has no
implementation. **There are no Rail unit or integration tests at all** (`backend/src/rail/*.spec.ts`
does not exist).

### One reconciliation item found while checking

The escalation ladder in `rail-handshake.service.ts` is documented and implemented as
**≤24h → 48h → 72h → Regulator dispute**, and `EscalationStage` has exactly those rungs
(`LIAISON_MANAGER_24H`, `HEAD_LIAISON_48H`, `ROUTE_LOGISTICS_FORUM`, `REGULATOR_DISPUTE`). The
source summary describes a **96-hour** stage. Either the summary and the code disagree, or the code
is missing a rung. Confirm against the actual Volume 4 text before changing anything — do not adjust
a regulatory ladder from a summary.

## 3. Business rules to model as versioned rules with effective periods

Per the source summary, these are candidate machine-readable controls. Each must become a versioned
rule with effective periods, never a hard-coded permanent assumption:

- practical capacity planned at ~65% of theoretical capacity, explicitly variable by route;
- capacity reviewed weekly as network conditions change;
- annual access-application and assessment timelines;
- ad-hoc applications generally need ≥1 month lead time;
- pre-qualified applicants may receive outcomes in ~3–21 days;
- capacity utilised below 75% over three months may be reallocated;
- an Access Seeker gets a defined response period before capacity is revoked;
- cancellations inside / outside 72 hours carry different commercial consequences;
- Daily Handshake reports must be reviewed and signed off;
- unresolved handshake items escalate at 24h / 48h / 72h / 96h;
- a 10% performance guarantee is described;
- safety permits, rolling-stock compatibility, crew competence, route knowledge, environmental
  plans, risk analysis and security plans are required.

## 4. Source exceptions to log for independent review (`RailSourceException`)

Do not silently normalise any of these:

- Container Corridor crossing-loop text: maximum of 1,050 wagons vs approximately 1,200 metres —
  apparently internally inconsistent;
- the 65% factor is a planning guideline, not a universal formula;
- tariff effective dates and timetable periods must stay separate;
- numbering and editorial inconsistencies in the document;
- some provisions are transitional or future-state, not current enforceable controls;
- IIMS is described as replacing or succeeding earlier TOMS-style processes;
- network condition, speed restrictions, manual authorisations and capacity change over time.

## 5. Queued workstream (starts only after the migration chain completes)

1. Register Network Statement Volume 4 in the source registry — this record is the input; the
   registry itself is schema/service work and is **not** done here.
2. Create a source-to-requirement traceability matrix (statement → section/annexure → requirement →
   implementation → test).
3. Classify each statement: normative requirement · timeline · evidence requirement · commercial
   rule · operational process · future-state statement · source exception.
4. Update RAIL-005 through RAIL-015 against the actual Volume 4 sections and annexures.
   **Blocker:** this repository contains no `RAIL-0xx` identifiers at all (verified across every
   tracked file). Either that register lives outside the repo and must be supplied, or the baseline
   has to be authored here first.
5. Add the synthetic fixtures in §6.

Not in scope until then: schema models, services, endpoints, migrations, frontend.

## 6. Synthetic fixtures to add with that workstream

annual application · ad-hoc application · incomplete evidence · capacity conflict · Daily Handshake
deviation · disputed responsibility · cancellation inside and outside 72 hours · occurrence
escalation · KPI reconciliation.

## 7. Open items — decisions or inputs needed

1. **The binary is not in this workspace.** To fill SHA-256 / filename / URL / retrieval date, either
   make the PDF readable somewhere that is *not* the repository tree (and not committed), or supply
   the values directly. Until then this record stays `VALIDATION_REQUIRED`.
2. **Classification:** `PUBLIC_OFFICIAL_SOURCE_COPY` if it is the officially published Network
   Statement; `STAKEHOLDER_SOURCE_COPY` if it arrived through a stakeholder channel. Decide, then
   record it.
3. **RAIL-005 … RAIL-015:** where does that register live?
4. **Escalation ladder:** confirm 24/48/72/96 against the text (see §2).

## 8. Honest status

Captured, not implemented. Rail is **not** complete and must not be described as complete: the
access/capacity/agreement/order half of the Network Statement's chain is unmodelled, the handshake
half is partially modelled, one escalation rung may be missing, there are no Rail tests, and none of
it has had independent review, interface testing or pilot evidence. The migration chain remains the
active workstream.

# FlowOps journey: end-to-end product design

**Status: DESIGN REFERENCE — updated 2026-10-31.** The user has subsequently approved
implementation. The design is not a deployment or field-validation authorisation. WP3 evidence
remains incomplete: crossing identity, precise location, operator-confirmed routes and trace plans
must be established before proposed geometry, and real GPS validation is required before activation.
The WP4 policy decisions are design choices, not evidence of implemented functionality. The ZW
prospect operator has shared general challenges, not routes, volumes, GPS availability, a pilot or
commitment.

## 1. Vision and honest boundaries

Give the driver, dispatcher and authorised customer a common understanding of a journey from
loading to offloading: what was planned, what actually happened, what needs attention, and what is
unknown. The journey can span countries, operators, modes and multiple crossings without assuming a
single route. Exceptional usability means a driver can safely report a problem in seconds, and a
dispatcher can make a decision without confusing a prediction or unverified report with a fact.

We will not promise to eliminate hijacking, corruption, delays or discrimination; infer a live
queue from static tables; label rules as AI; imply direct customs submission or PAPSS integration;
or present operator reports as authority-confirmed feeds. No performance or competitive superiority
claim without measured evidence.

## 2. Existing foundations: inspected 2026-10-31

| Existing capability | Repository evidence | Constraint / design action |
|---|---|---|
| Driver portal work, deliveries, collection, proof of delivery, chat, costs, GPS, gate-window actions | `backend/src/driver-portal/driver-portal.controller.ts`; `driver-portal/src/pages/` | Inventory full behavior and test contracts before adapting; do not assume every action is offline-capable. |
| Offline outbox and gate-window acknowledgement semantics | `driver-portal/src/services/offlineDB.ts`, `syncEngine.ts`, `windowAck.ts` | Reuse the tested pending/rejected/idempotency pattern; extend per action only after endpoint and security review. |
| Latest driver and live-session positions | `driver-portal.service.ts`, `backend/src/live-tracking/` and `docs/WP3-SADC-BORDER-DWELL-PLAN-2026-10-30.md` §1 | Existing portal GPS path overwrites a latest point and is dashboard-mounted; it is **not** a retained complete history and does not support reliably reproducible dwell. Other sources still need inventory. |
| Driver safety position check, safety zones and reported zones | `backend/src/driver-safety/`; `docs/SAFETY-INCIDENT-LAYER-DESIGN-2026-10-29.md` | Identity protection exists; the existing one-tap danger-zone workflow still makes a permanent active alert without verification or expiry. Do not claim the WP4 incident workflow exists or use reports as verified warnings. |
| Actual cost entry | Prisma `TripCostEntry`; `backend/src/trip-costs/` | Can associate a cost with a driver and optionally a waybill or manifest; unknown costs are not zero. Full trip-truth coverage and allocations require assessment, not assumed. |
| Static SADC reference | `backend/src/forwarding/sadc-corridor.service.ts` | Hand-compiled, unobserved reference; do not use as verified operating status, current waits or geofence boundaries. |

The historical WP3 plan's no-track proposal conflicts with the current request for reproducibility
from raw GPS; do not implement it as if it resolves that requirement. The applicable location
collection, consent and retention policy requires a specific decision before any collection.

## 3. Product blueprint

### Driver experience

- **Now:** next actionable stop, instructions, last-confirmed work state and contact path. Avoid
  visual clutter, protected information and exposing commercially sensitive route details to others.
- **Report:** minimal categories such as delay, vehicle issue, road obstruction and safety concern;
  optional free text only when safe. Provide an emergency instruction to contact appropriate local
  emergency services; FlowOps is not an emergency-response service. A report is a **claim**, not
  a verified warning or proof of corruption or wrongdoing.
- **Offline:** clearly show `PENDING SYNC`, `RECEIVED` only on server acknowledgement and an
  actionable conflict/refusal state; show device event time separately from server receipt time.
  Never require typing while driving. Avoid silently discarding a report after an expired session.

### Operations experience

- **Journey view:** planned milestones and route variants beside observed events, with source,
  timestamps, actor and freshness. Multiple stops, border crossings and modes are normal. Distinguish
  a journey from existing waybills/manifests; identity and lifecycle mapping need an explicit design
  and must not turn one shipment, truck or manifest into an assumed one-to-one relationship.
- **Exceptions:** dispatcher acknowledges, assigns, follows up and resolves, with a visible audit
  trail. Reported, verified, rejected and resolved have separate meanings; no implicit confirmation.
  Restrict sensitive details to authorised roles and tenant. No public feed is implied.
- **Handover:** identify who is responsible and the next action. Notification delivered, seen and
  acknowledged are distinct observations, not interchangeable.

### Customer / partner view

Share only explicitly authorised shipment/journey milestones and provenance, with tenant-bound access
and revocation. Do not expose raw driver locations, other customers' data or safety report details by
default. Design separately from the existing per-appointment share/revoke rules; do not silently
extend those permissions.

### Border, documentation and cost

- A corridor registry separates existence, sequence, location, operating model and geofence
  readiness as in Phase A2. Only approved, verified crossing identities and separately validated
  geometry can support active measurement. `NOT_CONFIGURED`, `SUPPORTED_NO_DATA` and
  `ACTIVE_MEASURED` must not be conflated. Island ports remain gateways, not road corridors.
- Border sessions retain raw source timestamps, entry/exit uncertainty and gap status. Aggregate
  median/P90/sample count only from qualifying completed sessions and show denominator, window,
  source and freshness. A position-based dwell is not proof of customs clearance.
- Document pack and expiry reminders are recorded/assisted, **not** a direct SARS/ASYCUDA submission.
  First-pass customs metrics require captured declaration outcomes and a defined denominator;
  NTB incidents per 100 crossings require valid crossing and incident definitions.
- Trip Truth groups linehaul, border, clearing, bond, detention and empty-return costs by evidence,
  currency, source and period. Duty `ESTIMATED` and `ACTUAL` remain separate. Foreign exchange
  rates require provenance and an explicit conversion date; preserve original amounts.

## 4. Canonical evidence and trust model — proposed

A journey is a tenant-scoped container of ordered *planned* stages and versioned route variants;
an observation is an immutable, attributable event linked to the correct entity and stage, not a
replacement for source records. Event fields: stable ID and idempotency key; tenant; journey and
stage references; event type; actor/role; source (driver, dispatcher, GPS, document, imported);
device-occurrence time when supplied; server-received time; status and correction/supersession
link; quality and provenance. Corrections append an audited event; they must not silently overwrite
history. Computed summaries are derived and rebuildable. This is a design, not a schema change.

Multiple devices and retries may produce duplicate or out-of-order events. Server-side idempotency
must be tenant- and action-scoped. Preserve device and server times separately, validate clock
skew, mark ambiguous ordering and never silently treat a late report as current. A timeline may
show conflicting reports with their sources; only authorised resolution can establish an accepted
state. Attachments, sensitive location and incident claims require separate access, retention and
redaction rules. Avoid storing raw GPS beyond an explicitly approved purpose and retention period.

## 5. Phased delivery, each independently gated

1. **Discovery and design:** inventory existing journey/waybill/manifest, driver actions and
   permissions; map real operator workflows without requesting confidential routes or claiming a
   pilot. Obtain evidence on online/offline conditions and decide jurisdiction, privacy and roles.
2. **Journey truth + communication:** after implementation approval, deliver one end-to-end slice:
   authorised office creates/links a journey and stages; assigned driver sends a delay update with
   offline sync; office receives, acknowledges and follows up; timeline accurately labels times,
   provenance, pending states and conflicts. Reuse existing machinery only where verified suitable.
   This is a candidate first slice, not an approved build order or a commitment to rewrite existing
   messaging. No new incident broadcast or location-history capture in this slice.
3. **Border measurement (WP3):** only after denominator, confidence model and provisional pool
   approval, verified crossing identity, proposed location and operator-specific GPS-validation plan;
   real field validation and privacy approval before activation. Enable in evidence-backed waves,
   not by guessed operator routes. Synthetic traces first, then permissioned validation.
4. **Safety incident layer (WP4):** separately approved scope and policy implementation; treat
   reports as claims and only broadcast verified, scoped, time-bounded assertions. Preserve the
   distinction from the currently existing permanent safety-zone report behavior.
5. **Documentation, cost and analytics:** add permit/document lifecycle and expense evidence;
   calculate only KPIs whose source, time range and denominator exist. Add integrations or external
   feeds only with separately verified access, contracts and user approval.

Each wave requires verified entries where applicable, backend/frontend/driver tests, synthetic GPS
reproducibility where applicable, tenant isolation, RBAC, RLS in each creating migration, full
security/audit and entitlement checks, `tsc`, ESLint 0/0, builds, diff check and a PR reporting exact
counts. Never merge without explicit instruction and green CI. No deploy, production, host, secrets,
GHCR or `rail-source-check/` changes are authorised here.

## 6. Decisions before implementation

- Finish and approve the full WP3 source-set denominator, dimension model and provisional pool;
  obtain actual prospect route evidence only if voluntarily provided. The ZW prospect operator
  disclosed no routes or commitment, and should not be presented as a customer or tenant.
- Select the first product slice and decide whether to adapt existing chat/actions or introduce
  a structured journey exception workflow. Inventory current contracts first.
- Decide jurisdiction, lawful basis/consent where applicable, role-specific access, GPS sampling,
  purpose limitation, offline retention, deletion, correction, read auditing and field validation
  ownership before collecting location history.
- Agree emergency/safety escalation, verification and expiry separately under the existing WP4
  design and policy decisions; a generic request to start design does not approve implementation.
- Confirm which existing operator data is available and what is confidential; no credentials or
  raw position traces are requested at this stage.

# WP3 — SADC border dwell: build plan (2026-10-30)

**Status: GATED. Nothing in this document is built.** WP3 starts only when WP1 and WP2 are green, including the pending CI and database-backed checks, and the operator gives
"GO WP3" plus an approved pilot corridor list (§10). Local tests alone do not satisfy that gate. This is the plan, the blocking finding, and
the decisions that have to be made before code — in that order, because the finding changes what
is measurable.

---

## 1. Blocking finding: the inspected GPS path does not retain a truck track

WP3's headline output is a **measured** dwell per border post — entry to exit, reported as median,
P90 and n. That requires a vehicle's position over time. The inspected portal GPS path does not retain one; a broader inventory is still needed:

| What exists | Where | What it actually holds |
|---|---|---|
| `Driver.lastLat` / `lastLng` / `lastSeen` | `driver-portal.service.ts` `updateGps()` | **One latest point per driver**, overwritten on every ping |
| `LiveTrackingSession.currentLat` / `currentLng` / `speed` | schema | **One latest point per session** |
| `RailTelemetryPoint` | schema | A real position history — but for `RailDevice` (rail hardware), not trucks |
| `SafetyZone` + `checkPosition()` | `driver-safety` | Geofences and a per-fix inside/outside test; safety alerts can record alert-time coordinates, but are not a complete truck track |
| `TrackingEvent.lat` / `lng` | schema | Optional coordinates on **parcel status** events (COLLECTED, DELIVERED), keyed to a waybill — not a track, and not at a border |

And the pipeline feeding those points is thinner than it looks:

- `driver-portal/src/hooks/useGeolocation.ts` watches the device GPS with a **30 s throttle**
  (`useGeolocation(true, 30000)`, `Dashboard.tsx:43`), `enableHighAccuracy`, `maximumAge: 10000`.
- It posts only while the **Dashboard is mounted** and only when a fix changes
  (`Dashboard.tsx:77-90`). Other pages do not mount this watcher. Backgrounded or locked devices may stop producing fixes; actual behaviour varies by browser and device. At a border queue — hours long, driver out of the cab, phone in a pocket — that is most of
  the dwell.
- Online pings are **fire-and-forget** (`api.post(...).catch(() => undefined)`): a lost sample is
  invisible, with no retry and no delivery state. Offline, the implementation intends to retain only the latest ping, by
  design ("we don't queue every ping when offline … that would flood the outbox").

**Consequence.** Dwell can be derived, but only as *crossing events with a completeness label*, and
with a precision floor of roughly the sample interval. It cannot be derived as an accurate
door-to-door duration, and any figure computed from OPEN or GAPPED sessions would be a guess
presented as a measurement. Everything below is designed around that, not around the assumption
that the data is better than it is.

## 2. What already exists and should be reused

- **The position check itself.** `DriverSafetyService.checkPosition(driverId, companyId, lat, lng,
  speed?)` already runs on every GPS ping, resolves the driver inside the tenant, and tests the fix
  against zones. WP3 extends that one call to also test border geofences — no new channel, no new
  ping path, no duplicate position handling.
- **Border geofences already drawn.** `driver-safety/safety-zones-data.ts` seeds Beitbridge (SA
  side, 3 km), Beitbridge (ZW side, 3 km), Chirundu (2 km) and the A6 Harare–Chirundu corridor
  (5 km) with coordinates. These safety-zone coordinates are candidate references, not validated dwell boundaries; geometry and overlap need operator review.
- **The reference corridor table.** `forwarding/sadc-corridor.service.ts` holds 9 border posts with
  coordinates, countries, typical wait hours and required documents, and 7 corridors with distances
  and transit days. As of the slice on this branch, every response from it is stamped
  `STATIC_REFERENCE / observed: false / measuredByFlowOps: false / compiledAsOf: null` and the
  Swagger summaries say "reference". **Those figures are the comparison baseline for WP3, never its
  output** — the whole point of measuring is to find out how wrong the reference table is.
- **Notification rails.** The outbox + gateway pattern used by WP2 (`rail.truck_window.changed`,
  socket events with a poll fallback) is the rail for permit-expiry alerts. No new channel.
- **Privacy principles.** WP4 §7 (`docs/SAFETY-INCIDENT-LAYER-DESIGN-2026-10-29.md`) — store the
  minimum, null coordinates on a retention sweep, RLS `ENABLE` + `FORCE` + `tenant_isolation`,
  audit every read of a raw position, nothing crosses the tenant boundary. WP3 inherits all of it,
  and §4 below states plainly where WP3 goes further than WP4 allowed.

## 3. Measurement design: crossing events, not a breadcrumb track

**Rejected: storing the track.** Writing every fix to a history table would give the most accurate
dwell and the largest privacy cost — a continuous record of where every driver was, forever, which
is exactly what WP4 §7 refuses ("not a track, not a history").

**Proposal for review, not an approved design: derive dwell at the moment of crossing.** The position check already sees every fix. Keep
one row per *open visit* to a border geofence and close it when a later fix lands outside:

```
BorderGeofence   id, code (BEIT_BRIDGE_ZA), postId, name, lat, lng, radiusM,
                 side (EXPORT|IMPORT|TRANSIT|BOTH), isActive, provenance
BorderPost       id, code, name, countries[2], lat, lng, is24Hour,
                 referenceAvgWaitHours (nullable, labelled REFERENCE),
                 referenceCongestion (nullable, labelled REFERENCE),
                 referenceCompiledAsOf (nullable — not invented)
BorderDwellSession
                 id, companyId, postId, geofenceId, tripId?, driverId?, vehicleReg?,
                 enteredAt, enteredFromFixAt, exitedAt?, exitedFromFixAt?,
                 state (CLOSED | OPEN | GAPPED), sampleCount,
                 precisionSeconds, gapLargestSeconds, direction?, source, createdAt
```

- **Open**: a fix inside a geofence with no open session suggests a visit. Record the first observed inside fix; entry remains unknown or bounded by an earlier outside fix, not an exact timestamp.
- **Close**: a later outside fix bounds exit between the last inside and first outside fixes; do not present either fix time as an exact crossing. A session without adequate entry and exit bounds is incomplete.
- **Gap detection**: if the interval between consecutive samples anywhere inside the session
  exceeds a threshold (recommend 15 min, configurable), set `state = GAPPED` and record
  `gapLargestSeconds`. A GAPPED session is *evidence a truck was at that post*, not a duration.
- **Never closed**: sessions still OPEN at the end of a trip are reported as OPEN, counted
  separately, and excluded from every headline number. Same discipline as WP2's
  unassigned-driver appointments: excluded from the denominator, counted, never folded in.
- **No raw positions stored.** A session holds two timestamps and counts — not coordinates. The
  geofence's own coordinates are reference data, already public in the seeded zone list.
- **RLS**: `ENABLE` + `FORCE` + `tenant_isolation` via `app_tenant_guard("companyId")` on each new tenant-owned
  table, in the migration that creates them (the WP2 pattern), verified by `migrations:review` and
  counted by `tenant-scope:audit`.

**What this design cannot produce, stated up front:** a dwell for a truck whose app was closed for
the whole queue; a dwell more precise than the sample interval; anything at all until trips actually
run the pilot corridor with the portal open. Those are `NOT ENOUGH SESSIONS` and `OPEN`, not zeros.

## 4. Where WP3 goes further than WP4 §7, and needs a decision

WP4 §7 commits to "no new position store and no breadcrumb table". WP3's `BorderDwellSession` **is**
a new position-derived store — two timestamps per crossing, tied to a driver and a vehicle. It is
not a track, but it is a record that a named driver was at a named border post at a named time, and
that is sensitive.

Proposed handling, mirroring WP4 §7:

- Retention: `driverId` and `vehicleReg` nulled after **90 days**; the session, its post, its state,
  its duration and the aggregates survive. Configurable per company **downwards only**.
- Reads of driver-linked sessions are audited (`border_dwell.session_read`), including dispatch.
- Aggregates (median/P90/n per post) are tenant-scoped and never cross to the platform owner.
- Driver-facing honesty: the portal shows the driver their own open session and what it is used for.
- **This needs explicit approval** — it is the one place WP3 deliberately exceeds a commitment made
  in another design document (§10, decision 3).

## 5. Publishing the numbers

Rules, non-negotiable, mirroring WP2's KPI labelling:

1. Report **median, P90 and n** together, always. A median without n is not a measurement.
2. **Suppress below n.** Fewer than 5 CLOSED sessions for a post/direction/period →
   `NOT ENOUGH SESSIONS (n=3)`. Never a number, never a "≈".
3. Report the completeness split next to every figure: `CLOSED 7 · OPEN 2 · GAPPED 4`, so an
   operator can see that 4 of 13 visits had a hole in the sample stream.
4. Label the precision floor: the observed entry and exit uncertainty bounds separately. A nominal 30-second throttle is not a precision guarantee.
5. Every figure carries **source + freshness**: `MEASURED (FlowOps crossings, 2026-11-01 →
   2026-11-30, n=7)` versus `REFERENCE (hand-compiled, review date not recorded)`. The two are
   rendered as different things, in different places, and are never summed, averaged or blended.
6. **No cron-driven fabrication.** Aggregates are computed on read over a bounded window (the WP2
   ladder's approach), so a stale cache cannot present last month's dwell as today's.

## 6. Queue vs processing split — out of scope until a real source exists

The brief allows this split "only if real gate events exist". They do not: there is no gate-in /
gate-out event anywhere in the schema, no border-authority feed, and nothing in the repo observes a
queue separately from processing. Dwell measures **inside the geofence**, which conflates queueing,
paperwork, inspection, and waiting for a clearing agent.

So WP3 ships `DWELL (entry → exit)` and nothing finer. If a real source appears — a terminal's
gate scan, a clearing agent's status timestamps keyed to a trip, or an authority API — the split
becomes a stage of its own, with its own provenance label. Inferring "queue = first 60% of dwell"
would be invention, and is explicitly refused here.

## 7. Cross-border document / permit pack with expiry alerts

- **Checklist source**: `SadcCorridorService.getRequiredDocuments(corridor)` already returns the
  per-country and per-border document lists. It is reference data and stays labelled as such
  (`provenance` on the response, per the slice on this branch). The pack shows it as
  "TYPICALLY REQUIRED — verify", never as "REQUIRED".
- **New**: `TripDocumentPack` (tripId, documentType, status `HELD|MISSING|EXPIRED|NOT_APPLICABLE`,
  issuedAt, expiresAt, capturedBy, evidenceRef) — captured by a dispatcher or by the driver in the
  portal, per document, with the actor recorded.
- **Expiry alerts** go out on the existing rails: an outbox event + gateway socket to the tenant,
  with the honest delivery states WP2 established (`PUBLISHED`/`SENT`/`DELIVERED`, never an
  unobserved state). Thresholds: 30 / 14 / 3 days, per-company configurable, no quiet-hours
  deferral (an expiring permit at 23:00 is still expiring).
- **No submission anywhere.** The pack records what the operator holds. It does not file anything.

## 8. Trip Truth corridor split, HS codes, and duty

**Corridor split.** `commercial-analytics/trip-truth.service.ts` has no leg or segment concept
today — no `segment`, `leg`, `phase` or `corridor` vocabulary in that file. So the split is a new
model, not a relabelling:

```
TripLeg  id, companyId, tripId, kind (LINEHAUL | BORDER | CLEARING | BOND | EMPTY_RETURN),
         startedAt?, endedAt?, durationMinutes?, postId?,
         provenance (MEASURED | DECLARED | REFERENCE),
         source (crossing-session id | actor | reference-table code),
         confidenceNote?
```

- `BORDER` legs are `MEASURED` from a CLOSED dwell session, `DECLARED` when a dispatcher keys in a
  duration, or absent. `GAPPED`/`OPEN` sessions produce a leg with `provenance = MEASURED`,
  `durationMinutes = null` and a `confidenceNote` — a leg that says "we know it was at Beitbridge,
  we do not know for how long", which is the truth.
- `REFERENCE` legs (from the static corridor table) are shown for planning only and are **never
  summed into a measured total**. A trip total is `MEASURED` only if every leg is.

**HS + origin status.** Additive columns, no new table: `hsCode` (validated against a format, not
against a tariff database we do not have), `originStatus` (`PREFERENTIAL | NON_PREFERENTIAL |
UNKNOWN`), `certificateOfOriginRef`. Default is `UNKNOWN` and the UI renders `UNKNOWN` — never a
guess, because origin status decides whether a preferential rate is even arguable.

**Duty: ESTIMATED vs ACTUAL, never blended.**
- `dutyEstimated` — computed from a named, versioned reference (AfCFTA e-Tariff Book), stored with
  `estimateSource`, `estimateVersion`, `estimatedAt`, and rendered `ESTIMATED`. The existing
  forwarding PDFs already carry the right disclaimer ("Draft for … capture. Official assessment is
  binding") and that wording is reused verbatim.
- `dutyActual` — keyed in from a declaration, stored with `declarationRef`, `capturedBy`,
  `capturedAt`, and rendered `ACTUAL`.
- Both are shown side by side with a variance. **No combined "duty" field, no average, no fallback
  from one to the other.** Where only an estimate exists, the actual reads `NOT CAPTURED`.

## 9. Forbidden, and how the design stays clear of it

| Forbidden | How this plan avoids it |
|---|---|
| Direct SARS / ASYCUDA submission | Nothing files anywhere. Documents and duty are **records**, keyed in by a person, with an actor and a reference |
| Direct PAPSS | No payment rail is touched. Duty figures are numbers on a trip |
| Any claimed live border-queue feed | The only border figures that leave the system are `MEASURED` (crossing sessions, with n and completeness) or `REFERENCE` (the static table, stamped). The queue/processing split does not ship at all (§6) |
| Reference data presented as measurement | Structurally separate fields, separate labels, separate endpoints; a spec asserts the reference table's responses carry `observed: false`, and WP3's metric endpoints refuse to answer without n |

## 10. Decisions needed before any code

Each with a recommendation, because "GO WP3" alone does not settle them.

1. **Pilot corridors.** Recommend **North-South: Beitbridge + Chirundu** — both already geofenced in
   `safety-zones-data.ts`, both in the reference table with coordinates, and it is the corridor
   SA↔ZW/ZM traffic actually runs. Add Lebombo/Ressano Garcia only if Maputo loads are real.
2. **Position sampling.** Recommend **keep 30 s foreground-only** for the pilot and accept OPEN /
   GAPPED sessions with small n. The alternative — background geolocation plus a queued track —
   buys precision at the cost of battery, a POPIA conversation, and a much larger privacy surface.
   Decide deliberately: with option A the first honest number may be weeks away.
3. **Approval to exceed WP4 §7** by storing position-derived crossing events (§4), with 90-day
   driver-link nulling, audited reads, tenant-only aggregates. Recommend approve-with-those-terms.
4. **Suppression threshold.** Recommend **n ≥ 5** per post/direction/period, configurable, with
   `NOT ENOUGH SESSIONS (n=x)` below it.
5. **Geofence table.** Recommend a **separate `BorderGeofence`**, not rows in `SafetyZone`: a
   measurement boundary is not a danger zone, and driver-reported zones must never enter dwell
   statistics.
6. **Session subject.** Recommend **per trip/vehicle** with a nullable driver link, so a dwell
   survives a driver change mid-trip and aggregates do not depend on identifying a person.
7. **Queue-vs-processing** stays out of scope until a real gate-event source exists (§6). Recommend
   confirm.
8. **Duty sources.** Recommend: ESTIMATED from a named AfCFTA e-Tariff Book version recorded per
   estimate; ACTUAL keyed in by a dispatcher from the declaration, with the declaration reference
   mandatory. Confirm who is allowed to key ACTUAL.
9. **Rollout gate.** Recommend: build stages 1–2 (geofences + sessions) and **publish no metric**
   until two weeks of CLOSED sessions exist on the pilot corridor; review the completeness split
   with the operator before any UI shows a number.

## 11. Build order, if approved

| Stage | Contents | Verification before the next stage |
|---|---|---|
| 0 | Migration: `BorderPost`, `BorderGeofence`, `BorderDwellSession` (+ RLS `ENABLE`/`FORCE`), seeded from the reference table with provenance columns | `migrations:review` shows no destructive ops; `migrations:verify` counts it; RLS asserted in the integration spec |
| 1 | `checkPosition` evaluates border geofences in the same pass; open/close/gap logic; audit action `border_dwell.session_opened` / `_closed` | Unit specs: open, close, gap, reopen, two posts in one trip, tenant isolation, idempotent re-fix |
| 2 | Aggregate query (median/P90/n + completeness split + suppression), computed on read | Specs: n<threshold suppressed; OPEN/GAPPED excluded but counted; MEASURED and REFERENCE never merged |
| 3 | Document pack + expiry alerts on existing rails | Specs: 30/14/3 alerts, no quiet-hours deferral, honest delivery states, actor recorded |
| 4 | `TripLeg` corridor split with provenance labels | Specs: partial legs never sum to a measured total; GAPPED produces a leg with null duration |
| 5 | HS + origin status, duty ESTIMATED vs ACTUAL | Specs: `UNKNOWN` origin renders as unknown; no blended duty field exists; estimate carries source + version |
| 6 | UI: corridor dwell board, per-post detail with n and completeness, trip legs, document pack | Frontend tests for each, including the suppressed and OPEN states |

Stages 0–2 are the measurement. 3–6 are the surrounding product. Nothing in 3–6 should be built
before 2 has produced real numbers, or the UI will be filled with reference data wearing a
measurement's clothes.

## 12. Test plan

- **Service units**: session open/close/gap/reopen; precision floor; two posts in one trip; a trip
  that crosses the same post twice; a driver change mid-trip; tenant isolation on every read.
- **Aggregation units**: median/P90 arithmetic on known inputs; n<threshold suppression; OPEN and
  GAPPED excluded from figures but present in counts; a period with zero CLOSED sessions returns
  `NOT ENOUGH SESSIONS (n=0)`, never 0 h.
- **Permission + cross-tenant denial**: a haulier, a driver and a viewer cannot read another
  tenant's sessions; `rbac:check` stays at 0 undecided for every new route.
- **Migration + RLS**: integration spec against `postgres:16` (CI-only, like WP2's 16 tests) proving
  `FORCE` blocks a cross-tenant read at the database level.
- **Provenance guard**: a spec asserting no response mixes `MEASURED` and `REFERENCE` in one field,
  and that the reference table's responses still carry `observed: false` (extends
  `sadc-corridor.reference.spec.ts`).
- **API e2e**: ping inside → session open; ping outside → closed with precision; aggregate shows
  n=1 and suppresses; document expiry fires an alert on the existing rail.
- **Frontend**: dwell board renders n, completeness split and suppression; a REFERENCE figure is
  visually distinguishable from a MEASURED one; the trip-leg view shows a null-duration leg honestly.

## 13. What this plan does not do

- No live border-queue feed, no queue/processing split, no claim about conditions today.
- No submission to SARS, ASYCUDA, PAPSS or any authority.
- No track storage, no background geolocation, no change to the driver portal's sampling without
  decision 2.
- No metric published before there are sessions to compute it from.
- No change to the existing reference table's numbers — they stay as hand-compiled reference data,
  labelled, and become the thing WP3's measurements are compared against.

**Design review required:** the proposed state machine needs entry and exit uncertainty, handling for initial fixes already inside, overlapping geofences, offline or out-of-order fixes, trip association and long gaps. Do not treat a first inside fix as an observed entry or a delayed outside fix as an exact exit. Verify all existing telemetry and gate-event sources before asserting none exist.

# WP4 — Incident layer: design only (2026-10-29)

**Status: DESIGN. Nothing in this document is built. No migration, no code, no endpoint.
Work starts only on written approval of §11, and only for the parts approved.**

The question this design answers: how does an incident reported by one driver in one cab become
something a terminal, a dispatcher and other drivers can act on — without becoming a rumour
engine, without keeping dead zones alive, and without turning driver positions into a
surveillance record.

---

## 1. What already exists, and what it means for this design

Surveyed before designing, so nothing here duplicates a working feature.

| Existing | Where | Reused for |
|---|---|---|
| `SafetyZone` — circular geofence (`lat`, `lng`, `radiusM`), `riskLevel` LOW→CRITICAL, `alertMessage`, per-zone notify flags, `source`, `isActive`, indexed on `[lat,lng]` | `prisma/schema.prisma:3599` | the geometry and the alert copy of a verified incident zone |
| `SafetyAlert` — who was alerted, which zone, GPS position + speed, `driverNotified`/`dispatchNotified`/`adminNotified`, `acknowledged`/`acknowledgedAt`/`exitedZoneAt` | `prisma/schema.prisma:3632` | the delivery-and-response record; the same honesty rules as WP2 (a flag is only set when observed) |
| `DriverSafetyService.checkPosition()`, `triggerAlert()`, `haversineMetres()`, `acknowledgeAlert()`, `notifyAdminEmail()` | `src/driver-safety/driver-safety.service.ts` | the position check that decides who is inside a zone. **WP3's border dwell sessions and WP4's broadcast targeting are the same computation** |
| `DriverSafetyService.reportDangerZone()` | `src/driver-safety/driver-safety.service.ts:333` | a driver one-tap report **already exists** and is the thing this design has to fix, not replace |
| `ProcessIncident` (severity + status), `RailOccurrenceReport` (type, level, status ladder), `RailTelemetryAlert` | schema | precedents for a status-laddered, verified record |
| `AlertingService._upsertAlert(dedupeKey, …)` | `src/alerting/alerting.service.ts:302` | the dedupe precedent: one alert per key, updated rather than duplicated |
| `@Cron` schedulers (27 in the codebase) | e.g. `alerting.service.ts:36` | the expiry sweep |
| `AuditService` + `AuditLog`, `recordRailAudit` | `src/audit`, `src/rail/rail-audit.ts` | the audit trail (§8) |
| WP2's rails: `emitToCompanyWithReceipt`, `NotificationsService` (bell/outbox/email/WhatsApp), `PushService.wakeDriver`, driver-portal Dexie outbox with `X-Idempotency-Key` | this branch | broadcast, and offline one-tap reporting |

### The defect this design starts from

`reportDangerZone()` takes a driver report and **immediately creates a permanent, ACTIVE,
500 m `COMMUNITY` zone at the driver's chosen risk level**, notifies admins with a bell row,
and from that moment `checkPosition()` fires alerts into every other driver's device who
enters that circle. There is:

- no verification and no second source — one tap is one fact;
- no expiry — `SafetyZone` has no `expiresAt`, so the zone is live until a human finds it and
  sets `isActive = false`. A hijacking report from eight months ago still alerts drivers today;
- no abuse handling — no rate limit, no dedupe, no consequence for a report that turns out to
  be wrong, and no record of who rejected one;
- no entry in the tenant `AuditLog`. The module calls the `SafetyAlert` row its "audit record"
  (`driver-safety.service.ts:107`), which records that an alert fired — not who created a zone,
  on whose authority, or who later rejected it. A report that becomes a permanent zone leaves no
  trail at all;
- identity taken from the request body: `POST /driver-safety/zones/report` and
  `POST /driver-safety/check` both accept `driverId` in the body, so a caller can report or be
  positioned as any driver in the tenant.

That last point is a security defect in the current code, independent of WP4. It is recorded
here because the incident layer cannot be built on an identity the client chooses. **Recommended
for immediate, separate fix: take the driver identity from the authenticated session/device
token, as `driver-portal` already does.**

The design principle that follows: **a report is a claim; a zone is an assertion.** Only a
verified assertion may alert drivers.

---

## 2. Model: separate the claim from the zone

Two records, not one. This is the whole design.

```
SafetyIncident   (the claim, and its lifecycle)
   │  verified →
   ▼
SafetyZone       (the assertion drivers are alerted by) + expiresAt
```

`SafetyIncident` (new table, design only):

| Field | Purpose |
|---|---|
| `id`, `companyId` | tenant scoping, RLS `ENABLE`+`FORCE`+`tenant_isolation` like every other table |
| `type` | enum: `ROAD_CLOSED`, `ACCIDENT`, `HIJACKING_ATTEMPT`, `ROBBERY`, `WEATHER`, `STRIKE_PROTEST`, `VEHICLE_HAZARD`, `OTHER` |
| `severity` | enum `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` — **set by the verifier, not the reporter.** The reporter picks a type; the type maps to a default severity |
| `status` | enum `REPORTED` → `CORROBORATED` → `VERIFIED` \| `REJECTED` \| `EXPIRED` \| `WITHDRAWN` |
| `reportedByDriverId` / `reportedByUserId` | exactly one is set: a driver report or a dispatch report. Never both, never neither |
| `reportedAt`, `reportLocation {lat,lng,accuracyM}`, `locationSource` | `DEVICE_GPS` \| `MAP_PIN` \| `LAST_KNOWN` — a pin dropped on a map is not a GPS fix, and the record must say which |
| `geohash6` | corroboration grouping without storing a second coordinate set |
| `narrative` (optional, ≤ 280 chars) | never required: one tap means one tap |
| `corroborations` (relation) | other reports matched to this one, each with its own driver, time and distance |
| `verifiedByUserId`, `verifiedAt`, `verificationMethod` | `DISPATCH_CONFIRM` \| `SECOND_SOURCE` \| `AUTHORITY_NOTIFIED` — the method is recorded because it is the difference between "we asked" and "somebody told us" |
| `rejectedByUserId`, `rejectedAt`, `rejectionReason` | a rejection without a named reason and a named person is not a decision |
| `expiresAt`, `expiredAt` | the TTL (§6) and when the sweep actually closed it |
| `zoneId` (nullable) | the `SafetyZone` created **only on verification** |
| `broadcastCount`, `lastBroadcastAt` | how many drivers were told, and when — a broadcast nobody received is not a broadcast |
| `idempotencyKey`, `@@unique([companyId, idempotencyKey])` | an offline flush or a double tap produces one incident (WP2's pattern) |

`SafetyZone` gains three columns (design only, no migration yet):

- `expiresAt DateTime?` — null means permanent, which stays correct for a seeded reference zone
  and becomes an explicit choice rather than the only behaviour;
- `incidentId String?` — provenance: which claim produced this assertion;
- `source` gains `VERIFIED_INCIDENT` alongside the existing `MANUAL`/`COMMUNITY`/`AI_DETECTED`/
  `SAPS_STATS`.

Why not just add `expiresAt` to `SafetyZone` and carry on? Because then an unverified report
still creates a zone, and every future reader of `safety_zones` has to know which rows are
claims and which are assertions. `reportDangerZone()` would keep working exactly as it does
today, which is the behaviour this design exists to change.

**Migration note for whoever builds it:** existing `COMMUNITY` zones created by
`reportDangerZone()` are unverified claims that are already alerting drivers. They need an
explicit decision at migration time — back-fill as `VERIFIED` with `verificationMethod =
DISPATCH_CONFIRM` and a null verifier (a lie in the record), or leave them ACTIVE with
`expiresAt = null` and a `source` that says they predate verification (honest, and what this
design recommends), or expire them and ask dispatch to re-confirm the ones that matter
(correct, and disruptive). That decision is §11's to make, not the migration's.

---

## 3. One-tap report

Driver side (portal) and dispatch side (frontend), same endpoint, different actor:

- **One tap, no form.** Type tiles sized for a thumb, location filled from the device, optional
  narrative collapsed behind "add a note". Nothing required but the type.
- **Offline-first, by reuse not invention.** The portal already queues mutations in Dexie and
  replays them with `X-Idempotency-Key` (WP2 §6). An incident report is another queued
  mutation: `POST /driver-portal/safety-incidents` with the key derived from
  `report:{driverId}:{type}:{geohash6}:{minuteBucket}`. A report queued in a notspot and
  flushed 40 minutes later carries its **device** timestamp and its **server** timestamp
  separately, labelled, exactly like a window acknowledgement — a corroboration match that
  uses the wrong one is wrong.
- **Identity from the session.** `req.driver.id` (portal) or `@CurrentUser()` (dispatch). The
  body may not name a driver.
- **Location honesty.** `accuracyM` is stored and displayed. A fix with 900 m accuracy cannot
  corroborate a 300 m zone, and the UI must not imply it did.
- **What the reporter is told, immediately:** "Reported to your dispatcher. Other drivers are
  not being alerted yet." A report that silently becomes an alert to other drivers is how a
  rumour starts; a report that says nothing back is how drivers stop reporting.

Dispatch report: same record, `reportedByUserId`, `locationSource = MAP_PIN`, and it enters at
`REPORTED` — a dispatcher reporting something they were told about on the phone is a claim too,
and may verify it in the same action (§4) with the method recorded as `DISPATCH_CONFIRM`.

---

## 4. Verification

Three ways an incident becomes `VERIFIED`, each recorded with its method:

1. **Dispatch confirm** — a named human in the tenant confirms it. One tap on the incident, with
   a reason field optional but the actor mandatory. This is the common path and the only one
   that works for a single report.
2. **Second source** — another driver reports the same `type` within `CORROBORATION_RADIUS_M`
   (default 1 500 m) and `CORROBORATION_WINDOW_MIN` (default 45 min) → status
   `CORROBORATED`, and the incident is pushed to dispatch as "two drivers, independently".
   Corroboration **does not** verify: two drivers can both be wrong, and both can be reading
   the same WhatsApp message. Corroboration raises priority; a human verifies.
3. **Authority notified** — dispatch records that SAPS/traffic/emergency services were
   contacted, with the reference number if one was given. `verificationMethod =
   AUTHORITY_NOTIFIED`. **This records that we told somebody, never that somebody confirmed
   anything to us.** No integration, no feed, no claim of a response (§10).

Verification is the gate for broadcasting: a `REPORTED` or `CORROBORATED` incident is visible to
dispatch only. Drivers are alerted only by the `SafetyZone` created at verification.

A verifier cannot be the reporter (`verifiedByUserId != reportedByUserId`), which is the whole
value of the second pair of eyes. An admin or company admin may override with a recorded reason.

---

## 5. Abuse and false reports

Handling, in escalating order, none of it automatic discipline:

- **Rate limit**: 6 reports per driver per rolling hour, then a 15-minute cooldown with a
  message that says what happened. A driver in genuine danger hits this at most once; a script
  hits it immediately.
- **Dedupe**: same driver, same `geohash6`, same type inside 10 minutes → the existing incident
  is updated (`reportCount += 1`), not duplicated. `AlertingService._upsertAlert`'s dedupe-key
  pattern.
- **Contradiction**: a `REJECTED` incident requires `rejectionReason` (enum: `NOT_THERE`,
  `ALREADY_CLEARED`, `DUPLICATE`, `MISCLASSIFIED`, `NOT_CREDIBLE`, `OTHER` + free text) and the
  rejecting user's id. Rejections are audited (§8).
- **Reliability, not punishment**: an internal per-driver counter of verified vs rejected reports
  over 90 days. It is visible to dispatch as context ("this driver's last 8 reports: 7
  verified"), it changes nothing about whether a report is accepted, and it triggers no
  automatic sanction. At ≥ 5 rejected and 0 verified in 90 days, dispatch gets a review prompt —
  a human decides whether the driver needs a conversation, and the decision is recorded.
- **Withdrawal**: a driver can withdraw their own report while it is unverified. Withdrawing is
  not a strike against anyone; a driver who misread a road closure should be able to undo it in
  one tap.
- **What is explicitly not built**: no scoring visible to drivers, no leaderboards, no automatic
  blocking of a driver's ability to report. A driver who believes reporting gets them flagged
  stops reporting, and the terminal loses the only sensor it has.

---

## 6. Broadcast radius and auto-expiry

**Radius by type, capped, and derived rather than chosen per report:**

| Type | Default radius | Cap | Default TTL |
|---|---|---|---|
| `ROAD_CLOSED` | 2 000 m | 10 000 m | 6 h |
| `ACCIDENT` | 1 000 m | 5 000 m | 3 h |
| `HIJACKING_ATTEMPT` / `ROBBERY` | 3 000 m | 10 000 m | 12 h |
| `WEATHER` | 10 000 m | 50 000 m | 12 h |
| `STRIKE_PROTEST` | 2 000 m | 20 000 m | 24 h |
| `VEHICLE_HAZARD` | 500 m | 2 000 m | 2 h |
| `OTHER` | 1 000 m | 5 000 m | 2 h |

Per-company overrides live in one policy row (the `TerminalGatePolicy` pattern from WP2), and
the values in force are **frozen onto the incident at verification time** so a later policy edit
cannot silently change what an incident in flight is doing — the same reason `ackDueMinutes` is
frozen on a window-change recipient.

**Targeting**: broadcast to drivers whose last known position is inside `radius + 1 km` margin,
plus every driver on an active waybill whose route passes inside the radius **if and only if**
route geometry already exists in the tenant. Otherwise: position-based only, and the record says
`targetMethod = LAST_KNOWN_POSITION`. A driver with no recent position is not silently skipped:
they are counted as `unreachable` in the incident's broadcast summary, which is WP2's rule
applied here — never report a broadcast as delivered to somebody you could not reach.

**Channels**: the existing ones only — socket to the company room, push tickle to the driver,
bell row, webhook outbox. Delivery state per channel with the same fidelity ladder; `SENT` is not
`DELIVERED`.

**Auto-expiry**: a `@Cron('*/5 * * * *')` sweep (the existing scheduler pattern) sets
`EXPIRED`, deactivates the linked `SafetyZone`, writes an audit entry with
`actorType: 'SYSTEM'`, and stops the alerts. Expiry is a **state change with a reason**, not a
delete: the record and its broadcast history stay.

Two extensions, both human:

- **Extend** — dispatch adds one TTL, once, with a reason, up to the cap. A second extension
  requires re-verification. An incident that has been extended three times is a permanent zone
  pretending to be an incident, and the UI says so.
- **Close now** — the road reopened; `EXPIRED` with `closedByUserId` and a reason.

Why expiry matters more than any other part: a stale alert teaches drivers to ignore alerts. The
failure mode of this feature is not a missing incident, it is a screen full of dead ones.

---

## 7. Location privacy

Driver positions are the sensitive data here, and the design treats them as such:

- **Store the minimum.** An incident stores one point plus accuracy — not a track, not a
  history. The existing position-check path already receives fixes; this design adds no new
  position store and creates no breadcrumb table.
- **Retention.** `SafetyIncident.reportLocation` is nulled after 90 days on closed incidents
  (the record, its type, its outcome and its audit trail survive; the coordinate does not).
  `SafetyAlert` rows — which carry a driver's position at alert time — are retained 180 days,
  then the position columns are nulled. Both sweeps are `@Cron` jobs with audit entries, and
  both are configurable per company **downwards only**.
- **Who sees a raw coordinate.** Dispatch and admin roles inside the tenant, and the driver
  themselves. Another driver never sees the reporter's position: corroboration is shown as
  "another driver reported this 400 m away, 12 minutes later" — a distance and a time, not a
  point. That is enough to judge corroboration and not enough to locate a colleague.
- **Owner/platform visibility.** Nothing crosses the tenant boundary. `PlatformAlert` is not
  involved: an incident is operational data, not a platform-health signal.
- **RLS + tenant scoping** on every new table, `ENABLE` + `FORCE` + `tenant_isolation` via
  `app_tenant_guard("companyId")`, and the tenant-scope audit (`npm run tenant-scope:audit`)
  must account for every new query — the two unscoped share-token lookups in WP2 show what
  "accounted for" means: named in the PR and justified.
- **Every read of a raw position is audited** (§8), including reads by dispatch. An audit log
  that records writes only tells you what changed, not who was watching.

---

## 8. Audit design

Actions (following the existing vocabulary — `truck_window.changed`, `rail_*` target types; the
safety domain gets its own prefix, and `rail-audit.spec`-style ratchets pin uniqueness):

| Action | Actor | Metadata |
|---|---|---|
| `safety_incident.reported` | driver or tenant user | type, geohash6, accuracyM, locationSource, idempotencyKey, deviceReportedAt vs serverReceivedAt |
| `safety_incident.corroborated` | SYSTEM | matched incident, distance, elapsed minutes, corroborating driver id (not their position) |
| `safety_incident.verified` | tenant user | verificationMethod, severity set, radius, TTL, zoneId |
| `safety_incident.rejected` | tenant user | rejectionReason, free text |
| `safety_incident.withdrawn` | reporting driver | — |
| `safety_incident.broadcast` | SYSTEM | channels, recipients targeted, `unreachable` count, receipts observed |
| `safety_incident.expired` | SYSTEM | scheduledExpiry vs actual, extensions used |
| `safety_incident.position_read` | tenant user | which incident/alert, why (the requesting screen) |

Target types: `safety_incident`, `safety_zone`, `safety_alert`. Every entry carries
`companyId`, actor type/id/email, and a timestamp — and an unauthenticated or body-supplied
identity is refused, not defaulted to SYSTEM (WP2's rule).

---

## 9. How we would know it works

Defined before building, with the same discipline as WP2's KPIs: n, denominator, source,
freshness, and `UNKNOWN` rather than `0`.

| Measure | Definition | Honest caveat |
|---|---|---|
| Time report → verified | median + P90 + n, server timestamps | only measures incidents somebody verified; a report nobody looked at is measured separately as `unactioned` |
| Unactioned reports | count of `REPORTED` incidents older than 2 h with no dispatch action | the number that says the feature is a dumping ground |
| Corroboration rate | verified incidents with ≥ 1 corroboration / verified incidents | low is expected: most incidents are single-report |
| Rejection rate | rejected / (verified + rejected), per driver and per type, with n | a rate with no n is noise |
| Alerts fired per verified incident | count, and how many drivers acknowledged | reuse `SafetyAlert.acknowledged` — already recorded |
| Zone freshness | live zones past their TTL (must be 0), and median age of live zones | the sweep's own health check |
| Broadcast reach | targeted vs unreachable, per incident | unreachable is its own count, never a failure |

---

## 10. What this design explicitly does not do or claim

- **No external incident feed.** No SAPS API, no TRAFFIC/RTMC feed, no weather service, no
  third-party aggregator, no scraping. Nothing in this design fetches anything from anybody.
- **Seeded zones are static reference data.** `seedDefaultZones()` ships `SAFETY_ZONES_ZA/ZW/KE/
  NG/MZ/GH/BW` with `source: 'SAPS_STATS'`. Those are bundled constants with an unknown
  collection date, not a live feed and not current statistics. If they stay, the UI must label
  them "bundled reference data, seeded <date>, not a live feed" — and §11 asks whether they
  should be re-labelled or removed rather than quietly trusted.
- **`AUTHORITY_NOTIFIED` records that we told somebody**, never that an authority confirmed
  anything, and never implies a response time or a case outcome.
- **No prediction.** Nothing here infers an incident from telemetry, speed, stopping patterns or
  `AiEvent`. A zone flagged `AI_DETECTED` is a different feature with a different evidence bar,
  and this design does not create one.
- **No cross-tenant sharing.** An incident in one company is never visible to another, however
  close the vehicles are. Sharing across tenants (a national incident picture) is a separate
  proposal with a separate privacy review.
- **No automatic routing changes.** An incident may be shown beside a route; it does not re-plan
  one. Re-routing on an unverified claim is how a fleet ends up on a worse road.

---

## 11. What needs approval before any code

Ordered, each with the reason it is a decision and not a detail:

1. **The claim/zone split (§2)**, including what happens to the existing `COMMUNITY` zones
   created by `reportDangerZone()` — leave ACTIVE with honest provenance (recommended), or
   expire them and make dispatch re-confirm.
2. **Whether `reportDangerZone()`'s current behaviour may continue during the build.** Today one
   tap alerts every driver in the tenant. If the answer is "fix that first", it is a small
   separate change (a report creates an incident for dispatch, not a zone) and it should land
   before the rest.
3. **The identity defect (§1)** — `driverId` from the request body on `/driver-safety/zones/report`
   and `/driver-safety/check`. Recommended as an immediate separate fix, independent of WP4.
4. **Verification policy (§4)**: is dispatch-confirm alone acceptable, or must a `CRITICAL`
   incident have a second source before drivers are alerted? The answer changes the UI and the
   time-to-alert.
5. **Radius/TTL table (§6)** and whether per-company overrides are in the first build or later.
6. **Retention periods (§7)**: 90 days for report locations, 180 for alert positions — and
   whether the operator wants them shorter.
7. **Abuse handling (§5)**: the rate limit values, and explicit agreement that reliability
   counters are dispatch context only and never an automatic sanction.
8. **Seeded `SAPS_STATS` zones (§10)**: re-label as bundled reference data, keep as-is, or
   remove.
9. **Build order**: (a) identity fix, (b) incident table + report + dispatch queue, (c)
   verification + zone creation + expiry sweep, (d) broadcast + targeting, (e) corroboration,
   (f) KPIs. Each is independently shippable; (a) and (b) are the ones that change driver
   behaviour soonest.

Until these are answered in writing, nothing is built.

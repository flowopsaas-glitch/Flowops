# Truck gate window changes: the closed loop (2026-10-28)

What the terminal-side change → notify → confirm → escalate loop does, which authority model
it implements, which existing rails it reuses, what every published figure means, and what it
does **not** do.

Companion documents:

- `docs/SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md` — the RBAC/tenant review this builds on.
- `docs/DEPLOY-HANDOVER-RBAC-STRICT-2026-10-28.md` — the `RBAC_STRICT` host steps.

Code map: `backend/src/rail/rail-truck-window-changes.{service,controller}.ts`,
`rail-truck-window-changes.rules.ts`, `rail-truck-gate.shared.ts`, `rail-roles.ts`,
`backend/prisma/migrations/20261028120000_truck_window_change_closed_loop/`,
`frontend/src/pages/rail/TruckWindowAckBoard.tsx`, `frontend/src/pages/rail/TruckAppointmentsPanel.tsx`,
`frontend/src/pages/GateAppointmentPage.tsx`, `frontend/src/lib/railWindowAuthority.ts`,
`driver-portal/src/components/GateWindows.tsx`, `driver-portal/src/services/windowAck.ts`.

---

## 1. Authority model — stated explicitly

**The model this code implements is a dedicated window-change permission inside one tenant.
It is not "tenant + write permission".**

Why that distinction is the whole question: a FlowOps deployment has ONE tenant (one
`companyId`), and inside it sit both the terminal-side supervisors and the haulier's dispatch
desk. External hauliers are not tenant users at all — they exist only as holders of a share
link. So a check of "is this the right tenant, and can they write rail data?" would let a
haulier-side dispatcher re-time the terminal's gate, which is precisely what the operating
rule forbids: *a window is changed by the terminal operator, and hauliers are informed
quickly.*

The permission:

```
RAIL_WINDOW_CHANGE_ROLES = [ADMIN, COMPANY_ADMIN, MANAGER]     backend/src/rail/rail-roles.ts
canChangeWindow(role) / assertWindowChangeAuthority(actor, what)
```

It is enforced **in the service**, not only on the routes — `publishWindowChange` (step 0,
before the appointment is even read), `replanDay` (up front, so a refused replan is a 403 and
not a 200 with every truck "skipped"), `upsertGatePolicy`, and the BOOKED branch of
`recordCancellation`. No controller, cron job or future caller can bypass it. The routes
carry the same roles so a refused caller gets a 403 from the guard rather than a 403 from the
service.

| Actor | Read the board / KPIs | Confirm (haulier side) | **Move a published window** | Edit ack thresholds |
|---|---|---|---|---|
| ADMIN, COMPANY_ADMIN, MANAGER | yes | yes | **yes** | yes |
| DISPATCH | yes | yes | **no — 403, audited** | no — 403 |
| VIEWER | yes (read-only roles include VIEWER) | no (not a write role) | no | no |
| WAREHOUSE, AGENT, USER | no rail access | no | no | no |
| DRIVER (portal session) | own windows only | own window only | no | no |
| Share-token holder (outside the tenant) | the one appointment | that appointment's current change | **no route exists** | no |
| User of another tenant | refused by tenant scoping, before authority is considered | — | — | — |
| No authenticated actor (`null`) | — | — | **refused 403, audited with `actorId: null`** | — |

`DISPATCH` is deliberately split: confirming receipt of a change is dispatch work, moving the
terminal's gate is not.

Refusals are audited, not just returned: action `truck_window.change_rejected` with
`code: 'AUTHORITY_DENIED'`, the `attemptedRole`, and `actorId: null` when the caller was not
authenticated. "Who tried to move my window" is answerable afterwards.

Routes (from `scripts/rbac-inventory.mjs`, which reports 850 routes / 0 undecided):

| Route | Decision |
|---|---|
| `GET /rail/truck-window-changes` · `/board` · `/kpis` · `/gate-policies` · `/appointment/:id` · `/:id` | `RAIL_READ_ROLES` (class-level) |
| `POST /rail/truck-window-changes/:id/ack` | `RAIL_WRITE_ROLES` |
| `PUT /rail/truck-window-changes/gate-policies` | `RAIL_WINDOW_CHANGE_ROLES` |
| `POST /rail/truck-appointments/:id/reschedule` | `RAIL_WINDOW_CHANGE_ROLES` (tightened from `RAIL_WRITE_ROLES`) |
| `POST /rail/truck-appointments/replan-day` | `RAIL_WINDOW_CHANGE_ROLES` (tightened from `RAIL_WRITE_ROLES`) |
| `POST /rail/truck-appointments/:id/assign-driver` | `RAIL_WRITE_ROLES` |
| `POST /rail/truck-appointments/public/:token/ack` | `@Public()` — the token is the credential; legacy tokens are refused |
| `GET /driver-portal/gate-windows`, `POST /driver-portal/gate-windows/:changeId/ack` | `@Public()` + `DriverAuthGuard` (the file's existing pattern for all 24 of its routes); identity always from the token |

Negative proofs — `backend/src/rail/rail-truck-window-authority.spec.ts` (13 tests), which
asserts the role set by walking **every** value of the `UserRole` enum, and asserts the route
surface by parsing the controllers:

- "is held by exactly ADMIN, COMPANY_ADMIN and MANAGER — the terminal-side authority"
- "walks EVERY value of the UserRole enum and refuses the rest"
- "is narrower than rail write: DISPATCH can write rail data but cannot move a window"
- "denies a role it has never seen, so a future enum value does not inherit the permission"
- "refuses a call with no authenticated tenant user — the credential a share holder would have"
- "the ONLY public routes on the appointments controller are the token read and the token confirm"
- "the window-changes controller has NO public route at all"
- "no public or driver-session route can publish, reschedule, cancel, replan or re-time a window"
- "every window-moving route requires a subset of the permitted roles"
- "acknowledging is the only mutation a token holder can perform, and it cannot target an arbitrary change"

and, in `rail-truck-window-changes.service.spec.ts` → *authority and tenant isolation* (14
tests): a DISPATCH user may not publish; a VIEWER may not; a DRIVER-role tenant user may not;
a call with no authenticated user may not; authority is checked before the appointment is
read; the same DISPATCH user MAY acknowledge; a DISPATCH replan is refused outright; a
DISPATCH user may not loosen the ack thresholds; a DISPATCH cancellation of a BOOKED window
is refused; nothing is written or announced for an appointment outside the tenant; an
acknowledgement from the wrong tenant cannot find the change; a driver who is not the assigned
driver is not a recipient; a driver-portal ack with no driver identity is refused; a driver
row from another tenant resolves to DRIVER NOT ASSIGNED rather than being notified.

The frontend mirrors the same split (`frontend/src/lib/railWindowAuthority.ts` + the disabled
controls and explanatory banner in `TruckAppointmentsPanel.tsx`). The mirror is convenience
only: the server is authoritative, and `TruckAppointmentsPanel.test.tsx` asserts the
behaviour (a DISPATCH user sees Reschedule and BOOKED-Cancel disabled with the reason as the
tooltip, no replan block, and clicking a disabled control sends nothing).

---

## 2. The change record: version, supersede, idempotency

Migration `20261028120000_truck_window_change_closed_loop` adds three tables and four columns:

- `terminal_truck_window_changes` — one row per published change: `version`, `changeKind`
  (`RESCHEDULED` | `REPLANNED` | `CANCELLED`), `status` (`ACTIVE` | `SUPERSEDED`), the previous
  and the new window, `reason`, `forced`, `insideCutoff`, `cutoffHours`, `truckStatusAtChange`,
  `windowAlreadyClosed`, the actor (id/email/role), `changedAt`, `supersededAt`/`supersededById`,
  and **`activeAppointmentId String? @unique`** — the database-level guarantee that an
  appointment has at most one ACTIVE window.
- `terminal_truck_window_recipients` — one row per recipient per change, keyed
  `recipientKey` = `HAULIER` | `DRIVER:<driverId>` | `DRIVER:UNASSIGNED` with
  `@@unique([changeId, recipientKey])`: delivery channels, the headline delivery state plus
  reason/detail, `dispatchedAt`/`deliveredAt` (written only when observed), ack state, the
  server-observed `ackedAt` **and** the device-reported `ackDeviceAt` as separate columns,
  `ackSource`, `ackedByLabel`, `ackIdempotencyKey`, `reminderSentAt`, `escalatedAt`, and the
  `ackDueMinutes` frozen at publish time.
- `terminal_gate_policies` — `@@unique([companyId, terminalName])`, the per-terminal ladder
  thresholds (defaults 30 / 15 / 45 minutes).
- `terminal_truck_appointments` gained `driverId`, `windowVersion`, `shareTokenIssuedAt`,
  `shareTokenExpiresAt`.

All three new tables get `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + a
`tenant_isolation` policy using `app_tenant_guard("companyId")`, matching the existing
`20261012210000_rls_tenant_isolation` / `20261021120000_truck_appointments` pattern.

Idempotency: `@@unique([companyId, idempotencyKey])`. A replayed key returns the ORIGINAL
change and publishes no second version; without a key a second submit is a genuine second
version (never silently deduped); the same key in another tenant is a different key. The day
replan derives one key per appointment (`${key}:${appointmentId}`), so a double-submitted
replan cannot shift a day twice.

`publishWindowChange` is the only place a window moves, and the order is fixed:

1. authority (step 0, before any read);
2. idempotency replay lookup;
3. governance (cut-off/reason, status, window validity) — a refusal is audited and throws;
4. recipients, share-link validity and the gate policy are resolved **before** the
   transaction, so the transaction contains no I/O;
5. one `withTenant` transaction: supersede the ACTIVE change (status → `SUPERSEDED`,
   `activeAppointmentId` → null), insert the new change, update the appointment
   (`windowVersion = version + 1`, note appended `[window vN …] old → new — reason`),
   `createMany` the recipients, enqueue the webhook outbox event;
6. propagate **after** commit, best-effort — a notification failure can never roll back a
   published window, and a published window can never wait on a notification.

The superseded row keeps its own window forever; nothing is overwritten in place.

---

## 3. Propagation: existing rails only

What Phase 0 found already in the repo, and what this change reuses:

| Existing rail | Used for |
|---|---|
| WebSocket room `company:{companyId}` (`EventsGateway.emitToCompany`) | realtime board + panel refresh, via the new `emitToCompanyWithReceipt` |
| `NotificationsService` (in-app bell rows, preferences, webhook outbox, email/WhatsApp best-effort) | the haulier's in-app + webhook channels |
| `PushService` (payload-less VAPID "tickle") | waking the driver PWA, via the new `wakeDriver(driverId)` |
| Driver portal polling (chat 5 s, sync 30 s) + Dexie outbox with `X-Idempotency-Key` | the driver's read path and offline confirmation |
| Share link (expiring, revocable, `@unique` token) | the counterparty's read + confirm path, and its 15 s poll |

Only two thin primitives were added, no new channels: `emitToCompanyWithReceipt(companyId,
event, data, timeoutMs = 4000) → { dispatched, connectedClients, receipts }` (never throws;
`connectedClients: -1` means unknown) and `PushService.wakeDriver(driverId) → { enabled,
subscriptions, accepted, failed, pruned, error? }`. `emitToDriver` was found to be dead code
and is not used.

Per-recipient channels:

- **HAULIER** — `SHARE_LINK` (PUBLISHED when a valid token exists), `REALTIME` (DELIVERED only
  with a socket receipt, otherwise SENT with reason `NO_SOCKET_RECEIPT`), `IN_APP`, `WEBHOOK`.
  There is no haulier contact record in this schema (`haulierName` is free text), so the share
  link and the tenant's own socket are the haulier channels; with no token at all the recipient
  is reported `UNAVAILABLE / NO_SHARE_TOKEN` rather than faking a delivery.
- **DRIVER** — `DRIVER_PORTAL` (PUBLISHED) + `PUSH`. With no driver assigned the recipient key
  is `DRIVER:UNASSIGNED` and the state is `UNAVAILABLE / DRIVER_NOT_ASSIGNED`: the board says
  **DRIVER NOT ASSIGNED** and never invents a recipient. Other reasons:
  `PUSH_NOT_CONFIGURED`, `NO_PUSH_SUBSCRIPTION`.

Delivery fidelity is ordered and never optimistic:
`UNAVAILABLE(0) < FAILED(1) < QUEUED(2) < PUBLISHED(3) < SENT(4) < DELIVERED(5)`, unknown
`-1`, and the headline state of a recipient is the best of its channels
(`bestDeliveryState([]) = 'QUEUED'`). `dispatchedAt` and `deliveredAt` are written only when
observed. **SENT is not DELIVERED is not ACKNOWLEDGED**, and no UI displays a state that was
not observed.

---

## 4. Quiet hours: an urgent change at night is not deferred

Finding first, because it determines what had to be built: **no quiet-hours deferral is
enforced anywhere in this repository.** Notification preferences exist as data, but
`NotificationsService.broadcast()` writes one tenant-wide bell row without consulting them,
`PushService.wakeDriver()` reads no preference, the socket emit is immediate, and the webhook
outbox enqueues inside the same transaction as the change. There is therefore no code path
that could hold a window change until morning.

Proven rather than assumed — `rail-truck-window-changes.service.spec.ts` →
*an urgent change at night is not deferred*, publishing the identical change at
`2026-10-29T00:30:00Z` (02:30 Africa/Johannesburg, inside the 22:00–07:00 window the
preferences describe) and at `2026-10-29T08:00:00Z` (10:00 SAST):

- "reaches every channel at 02:30 exactly as it does at 10:00" — the same channel set and the
  same delivery states, socket + bell + push + webhook all fired;
- "stamps dispatch and delivery at the change time, not at the end of quiet hours";
- "escalates on the same clock at night: the ladder is not paused until morning" — reminder and
  escalation thresholds are evaluated against the change time for both recipients.

There is consequently no `DEFERRED` delivery state in the enum today, and that is deliberate:
adding one would be a claim about behaviour nothing implements. **Design rule for whoever adds
a deferrable channel later:** the socket emit, the terminal board and the driver push must stay
immediate for a window change, and any channel that is deferred must carry `DEFERRED` plus the
reason in its delivery state, so the board shows the truth instead of implying a delivery that
has not happened.

---

## 5. Acknowledgement and escalation

Ack sources and who they attribute to:

| Source | Recipient | Attribution |
|---|---|---|
| `TENANT_USER` | `HAULIER` | the authenticated user (id, email, role) |
| `DRIVER_PORTAL` | `DRIVER:<driverId from the token>` | the driver; the identity never comes from the request body |
| `SHARE_TOKEN` | `HAULIER` | audited as `SYSTEM` with `actorId: null` — the credential is not a person we authenticated |

Claiming is a compare-and-set (`updateMany` on the unacknowledged row), so a duplicate
confirmation returns the original and does **not** move `ackedAt`; the `ackIdempotencyKey`
makes a retried or offline-flushed request safe as well. Acknowledging a SUPERSEDED version is
refused with `409 { code: 'SUPERSEDED', message, activeVersion }` so the caller can point the
human at the version that is in force. A recipient that does not exist for that change is
`409 { code: 'NOT_A_RECIPIENT' }`.

The ladder needs no cron: `TerminalGatePolicy` (defaults `ackDueMinutes: 30`,
`reminderAfterMinutes: 15`, `escalateAfterMinutes: 45`) is read at publish time and frozen onto
each recipient, and the stage (`NONE → REMINDER → ESCALATED`) is evaluated on read, the same
pattern `rail-handshake.service.ts` already uses. Reminder and escalation are written once
(`reminderSentAt`, `escalatedAt`) and audited as `truck_window.escalated`. Unreachable
recipients are never escalated — nobody can confirm a notification that was never deliverable —
and a superseded version's recipients are not open items.

The board (`GET /rail/truck-window-changes/board`) answers "does that truck know?" per truck:
one line per recipient with separate states, the new window, the superseded window struck
through, the reason, time since change, and counts. **Counts are recipients, not changes**, and
the payload carries a `method` string saying so. `counts.unreachable` is separate from
`counts.unacknowledged`.

---

## 6. Offline driver, and the confirmation that arrives too late

The driver PWA queues a confirmation in IndexedDB and flushes it later, so the version it
confirmed may already be superseded. The chain, end to end:

1. `driver-portal/src/services/api.ts` attaches the HTTP status and the response `code` to the
   error it throws;
2. `syncEngine` treats a permanent 4xx as rejected (`markRejected`) and **continues** the FIFO
   queue instead of blocking behind one dead mutation;
3. `offlineDB` keeps the row with `state: 'REJECTED'` and
   `rejection: { status, code, message, activeVersion, at }`, exposed through
   `getRejectedMutations()` / `onMutationsChange()`;
4. `windowAck.ts` maps `SUPERSEDED` to "NOT CONFIRMED — that window changed again", shows the
   server's own words and the `activeVersion`;
5. `GateWindows.tsx` renders that on the window and in a refused-summary banner, and reloads so
   the driver sees the version now in force.

A response with no status, a 401, or a 5xx stays `PENDING_SYNC` — an unknown outcome is never
reported as a refusal, and a refusal is never reported as success.

Device and server clocks are kept apart and labelled: `ackedAt` is what the server observed,
`ackDeviceAt` is what the device claimed. Both are shown ("server-observed" /
"device-reported"), and only the server time is ever used in a measurement.

Tested in `driver-portal/src/components/GateWindows.test.tsx` (14 tests, including "409
SUPERSEDED on flush") and `driver-portal/src/services/windowAck.test.ts` (12), and on the
server side by "DRIVER OFFLINE AT CHANGE TIME: a device-reported time is stored SEPARATELY and
never used as the measurement" and "ACK ON A SUPERSEDED VERSION is refused and points at the
current version".

---

## 7. What every published figure means

`GET /rail/truck-window-changes/kpis` returns figures that carry their own `source`, `method`,
`n` and freshness, and read `UNKNOWN` (never `0`) when there is no data.

| Figure | Definition | Denominator / exclusions |
|---|---|---|
| `ackLatency.medianMinutes`, `.p90Minutes` | change → confirmation, from **server-observed** `ackedAt − changedAt` only, nearest-rank percentile | confirmed recipients only; device-reported times excluded; split `byRecipientType` (`HAULIER`, `DRIVER`), each with its own `n` |
| `ackedBeforeArrival.percent` | changes confirmed before the truck arrived | **terminal-recorded arrival**: `terminalTruckAppointments.arrivedAt`, logged by the terminal operator at gate check-in — *not* GPS and *not* a geofence. Denominator = changes with a terminal-recorded arrival; `excludedNoArrival` and `excludedUnreachable` are reported, never silently dropped |
| `staleUnackedChanges` | reachable recipients past their frozen `ackDueMinutes` who have not confirmed | unreachable recipients excluded from the blame |
| `unreachableRecipients` | recipients with no deliverable channel | its own count |
| `driverNotAssignedChanges` | changes with no driver assigned | its own count — **not** a failure and **not** in any denominator |
| `ackRate.HAULIER`, `ackRate.DRIVER` | `acknowledged / denominator`, denominator = **reachable** recipients of that type only | each carries `acknowledged`, `notAcknowledged`, `unreachable`, `driverNotAssigned`, `percent` (`null` → `percentText: 'UNKNOWN'`), plus a `definition` string |

The two recipient types are never merged into one "ack rate": a dispatcher confirming is not a
driver confirming, and one blended number would tell a terminal something false about a truck
that is already on the road.

The same labels appear in the UI, not only in the payload: the board's card title is
"Confirmed before the truck arrived **(terminal-recorded arrival)**" with
`n of m changes with a terminal-recorded arrival` beneath it and its exclusions listed; the
per-recipient card reads `X confirmed of Y reachable · Z not confirmed · N excluded (no
channel) · N DRIVER NOT ASSIGNED`; and the method paragraph prints the server's `method`
strings for both the KPIs and the counts.

---

## 8. Legacy share links: residual risk and the operator's controls

Links issued before expiry enforcement have no `shareTokenExpiresAt`. **They stay readable
forever and cannot be expired — the only way to end one is revocation.** They can no longer be
used to *confirm* a change: `acknowledgeByShareToken` refuses a `LEGACY_NO_EXPIRY` token with
409 and the reason, because an immortal, unauthenticated link that can write is exactly what
this loop must not have. New links carry a 7-day TTL (`SHARE_TOKEN_TTL_DAYS`).

What the operator sees (`TruckAppointmentsPanel.tsx`):

- a per-row badge `LEGACY LINK — never expires, cannot confirm`, with the server's warning as
  the tooltip;
- a tenant-wide banner "N legacy share links — no expiry on record" naming each one by
  registration · haulier · terminal, and saying plainly that revoking alone ends the link while
  re-issuing alone would leave the old one alive;
- one-click **Revoke & re-issue**, which revokes first and then creates, and reports the new
  link's expiry. If the revocation fails, nothing new is issued.
- `EXPIRED` links say "Link expired — re-issue if they still need the window"; `VALID` links
  show their expiry date.

Unchanged and worth stating: `GET /rail/truck-appointments` still returns the raw `shareToken`
to every rail-read role. That is pre-existing behaviour; this change adds the expiry state next
to it rather than widening who can see it.

---

## 9. Edge cases, and where each one is tested

| Case | Where | Test |
|---|---|---|
| Change after departure | service spec, *window-change state machine* | "CHANGE AFTER DEPARTURE: a truck already ARRIVED cannot have its window changed", "…a window that has already closed cannot be republished into the past", "a LOADING truck is refused too", "a terminal-state appointment (COMPLETED) cannot be changed" |
| Two rapid successive changes | *supersede* | "versions increment and exactly ONE change stays ACTIVE", "the previous version is visibly SUPERSEDED and keeps its own window forever", "a third change keeps the chain: still one ACTIVE, two SUPERSEDED" |
| Driver offline at change time | *acknowledgement* + driver portal | "DRIVER OFFLINE AT CHANGE TIME: a device-reported time is stored SEPARATELY and never used as the measurement"; `GateWindows.test.tsx` |
| Dispatcher acks, driver has not | *acknowledgement* | "a DISPATCHER ack and a DRIVER ack are SEPARATE states" |
| Ack on a superseded version | *acknowledgement* | "ACK ON A SUPERSEDED VERSION is refused and points at the current version"; driver-portal 409 flush test |
| Ack by the wrong tenant / wrong user | *authority and tenant isolation* | "an acknowledgement from the wrong tenant cannot find the change", "a driver who is not the assigned driver is not a recipient", "a driver-portal ack with no driver identity is refused" |
| Duplicate ack | *idempotency* | "a duplicate acknowledgement returns the original and does NOT move ackedAt" |
| Duplicate publish / replan | *idempotency*, *day replan* | "a replayed idempotency key returns the ORIGINAL change…", "a double-submitted replan cannot publish two versions for the same truck" |
| Cancellation of a BOOKED window | *window-change state machine* | "cancelling a BOOKED window is a versioned change with NO new window", "…a closed window still needs the cut-off reason" |
| Migration + RLS | `scripts/verify-migrations.mjs`, `rail-rls` spec, `rail-truck-window-changes.service.spec.ts` → *tenant context on every write (RLS phase-2 ready)* | plus the CI integration spec against a real PostgreSQL |

---

## 10. Known limitations

- **Legacy links are immortal until revoked** (§8). There is no batch-expiry job; the operator
  has to see them and kill them.
- **No haulier contact record.** `haulierName` is free text, so the haulier channel is the
  share link plus the tenant's own socket. An external haulier with no link and no login is
  reported `UNAVAILABLE / NO_SHARE_TOKEN` — honest, but it means the loop's haulier half depends
  on the operator issuing a link.
- **`driverId` is new.** Existing appointments have no driver assigned, so until they are
  assigned their driver recipient is `DRIVER:UNASSIGNED` and they are counted separately, not
  as failures.
- **`emitToDriver` is dead code** and stays dead; the driver path is the portal poll plus a
  payload-less push tickle. A push wake is not a delivery guarantee, which is why the delivery
  state says `PUBLISHED`/`SENT` and not `DELIVERED`.
- **Ladder thresholds are chosen constants** (30/15/45), configurable per terminal but not
  derived from measured behaviour.
- **The board's realtime path depends on two socket events** (`truck-window-changed`,
  `truck-window-acknowledged`) with a 20 s poll as the guaranteed fallback; the haulier share
  page has only its 15 s poll.
- **Arrival is terminal-recorded.** A truck that arrives and is not checked in is excluded from
  the before-arrival denominator, and the exclusion is counted rather than treated as "on time".
- The integration spec (`backend/test/integration/truck-window-change.integration.spec.ts`, 16
  tests) needs a real PostgreSQL and runs in CI only.

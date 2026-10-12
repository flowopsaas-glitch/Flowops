# Rail Architecture — Phase 1 + Phase 2 Built (Outbox/Webhooks + Schedule Optimizer)

**Date:** 2026-10-10 · **Mandate:** "build what you can world class end to end then commit"
**Implements:** Phases 1–2 of `docs/RAIL-ARCHITECTURE-BLUEPRINT-GAP-ANALYSIS-2026-10-10.md`
(the two blueprint layers buildable without external partners/hardware). Phases 3–5
(telemetry, live TRIM/PCS, data lake) remain blocked on external dependencies.

---

## Phase 1 — Transactional outbox + signed webhooks for the rail domain

The platform already had webhook endpoints, HMAC-SHA256 signing, exponential
back-off retries and a delivery log (`WebhooksService`), but only two events fired
(waybill/return status) and they were fire-and-forget — a crash between commit and
dispatch lost them silently. Rail events did not exist at all.

**Built:**
- **`OutboxEvent` model + migration** (`backend/prisma/migrations/20261010183000_outbox_events/`)
  — domain events are now written **in the same DB transaction as the domain change**.
  A cron worker drains PENDING rows into webhook delivery with the same back-off
  discipline (1m → 5m → 30m → 2h → EXHAUSTED at 5 attempts).
- **`OutboxService`** (`backend/src/webhooks/outbox.service.ts`) + **event catalog**
  (`event-catalog.ts`) — 17 canonical event names (public contract; `waybill.*` /
  `return.*` names unchanged). Webhook `create` now validates subscriptions against
  the catalog.
- **15 rail event emission points**, all transactional:
  - Slot lifecycle: `rail.slot.created|submitted|allocated|rejected|expired|operated|capacity_conflict|conflict_resolved`
  - Daily Handshake: `rail.handshake.report_created|report_issued|signed_off|deviation_logged|deviation_reviewed`
  - Possessions: `rail.possession.created|status_changed`
- The two legacy fire-and-forget dispatches (waybill/return) now go through the outbox too.
- **Integrations page:** webhook creation now offers the full grouped event catalog
  (selectable chips) instead of a single hard-coded event.

**Tests:** `outbox.service.spec.ts` (enqueue/drain/backoff/exhausted/never-throws) —
plus every existing rail handshake/slot/possession spec now exercises the transactional path.

## Phase 2 — Schedule Optimizer (OptaPlanner-class decision support)

A deterministic, explainable constraint engine over the real slot domain — it
**proposes**; humans **apply** through the existing allocate/reject workflow (every
guard rail, audit entry and webhook event still fires). It never invents capacity.

**Built:**
- **Pure policy** (`backend/src/rail/rail-optimizer.policy.ts`) — constraints in order:
  time (expired windows reject) → envelope (INCOMPATIBLE rejects, UNVERIFIED warns) →
  compliance (defers — documents can be renewed) → data quality (unstated weekly demand
  defers — demand is never assumed) → declared capacity (per corridor, minus existing
  allocations, minus higher-priority proposals) → possessions (wholly-inside defers,
  partial overlap warns). Deterministic ordering: envelope → compliance → first-come →
  application number. Full utilization summary per corridor.
- **Service + API** (`rail-optimizer.service.ts`, `rail-optimizer.controller.ts`):
  `POST /rail/optimizer/run` (read roles; pure analysis) and `POST /rail/optimizer/apply`
  (write roles; batch-tolerant, walks SUBMITTED → UNDER_ASSESSMENT → ALLOCATED through
  the normal state machine).
- **UI: "Schedule Optimizer" tab** in Rail Ops Console (`SlotOptimizerPanel.tsx`) —
  enter declared weekly capacity (Annexure 33b figures), run, review proposals with
  reasons/warnings, select and apply; corridor utilisation table.

**Tests:** `rail-optimizer.policy.spec.ts` 12 cases (capacity fill order, never-invents-capacity,
hard/soft envelope, compliance defers, missing demand, existing allocations, possession
wholly/partially, priority vs first-come, determinism, over-declared corridors) +
`SlotOptimizerPanel.test.tsx` 4 cases (empty state, capacity gate, apply-with-reason, utilisation).

## Gates (all green)

| Gate | Result |
|---|---|
| Backend jest | **65/65 suites · 2,073/2,073 tests** (was 2,050 — 23 new) |
| Backend tsc / build / eslint | clean · `nest build` ok · 0 errors |
| Frontend vitest | **30/30 files · 760/760 tests** (was 756 — 4 new) |
| Frontend tsc / build / eslint | clean · vite+PWA build ok · 0 errors (24 pre-existing `any` warnings) |

## Deploy notes (for the next session / next VPS deploy)

1. **New migration `20261010183000_outbox_events`** — `./deploy/vps-deploy.sh` runs
   `prisma migrate deploy`; this applies automatically (was 9 migrations, now 10).
2. Webhook consumers can subscribe to the new `rail.*` events under
   Settings → Integrations → Webhooks (signed with the existing `whsec_` secrets).
3. The optimizer is on the Rail Ops Console under **Schedule Optimizer**.

## Not built (blocked — see gap analysis)

Telemetry gateway (MQTT/AMQP) + TimescaleDB, live TRIM API + PCS webhooks, solver
OR-Tools service (this phase's policy engine is the pragmatic decision-support
equivalent; a heavy solver can replace the policy module without touching the API),
data lake/ML.

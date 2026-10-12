# Rail Architecture — Blueprint Gap Analysis

**Date:** 2026-10-10 · **Question:** "Does my rail do this now?" (high-level architecture blueprint:
API gateway · OIDC · OptaPlanner slot engine · billing · digital train manifests · Kafka + IoT telemetry ·
Postgres + TimescaleDB + data lake · TRIM API · Port Community Systems · telemetry gateways)
**Method:** code audit of `backend/src/rail/` (40+ files), `gateway/`, `live-tracking/`, `billing/`, `sso/`,
`prisma/schema.prisma`, and the rail corpus (251,678-row Transnet mirror).

---

## Verdict

**Two of the blueprint's four layers substantially exist (Edge/Identity, Core Services ~70%, Operational DB).
The real-time streaming layer, the telemetry stack, the optimization solver, and the external TRIM/PCS
integrations do not exist yet.** Crucially, the **domain data foundation** those integrations would feed —
timetables, capacity envelopes, tariffs, KPIs, corridors/yards — is already loaded as the source-of-record
Transnet corpus. FlowOps Rail today is a **corpus-driven rail intelligence + slot/compliance operations
platform**; the blueprint is the **target architecture for live, telemetry-driven corridor control**.

## Layer-by-layer scorecard

| Blueprint component | Status | What exists today | What's missing |
|---|---|---|---|
| **API Gateway (Kong/Apigee)** | 🟡 alternative | NestJS API behind Cloudflare Tunnel (tunnel-only, no host ports); rate limiting, CORS allowlists, JWT-guarded REST + WebSocket | A dedicated gateway product (Kong/Apigee) is not used — not needed at current scale; swap-in point exists |
| **Identity & Access (OAuth2/OIDC)** | ✅ | JWT auth + **OIDC SSO (Enterprise)**, RBAC permission matrix, rail signatory roles (`rail-roles.ts`), tenant-scoped tokens | Auth0 specifically (self-managed IdP instead) |
| **Multi-tenant isolation for competing TOCs** | ✅ app-level | `companyId` scoping across 297 schema fields; cross-tenant integration tests (incl. production-flag denial); per-tenant WebSocket broadcast targeting | Postgres row-level security policies (app-layer enforcement today — DB-level RLS is a hardening option) |
| **Slot & Scheduling (OptaPlanner)** | 🟡 workflow yes / solver no | Full slot-application lifecycle: create → self-screening → compliance docs (RSR permits, expiry cron) → **capacity-envelope checks** (Anx 33b) → allocate/reject/revoke → conflicts → consignment linking → billing hooks → audit. Timetable parser over the 251k-row corpus. Corridor envelope compatibility (gauge/axle-load/electrification: COMPATIBLE / INCOMPATIBLE / **UNVERIFIED** — never guesses) | An **optimization solver** (OptaPlanner / OR-Tools) that auto-generates optimal timetables against line capacity, maintenance windows and speeds. Today the engine *validates and enforces*; it does not *optimize* |
| **Multi-Tenant Billing (Stripe/SAP)** | ✅ | Plans + entitlements, invoices, quotes, billing batches, credit control, COD, accounting (Pastel/Xero bridge), **Paystack** payments | Stripe/SAP specifically (SA stack chosen instead) |
| **Compliance & Safety (Digital Train Manifests)** | ✅ mostly | RSR occurrence reporting (Anx 41), cancellation attribution (20a/20b), access & disputes (28/29a/29b/35), possession rules, dangerous goods, weighbridge, **Daily Handshake** TOC↔IM deviation reconciliation with disputes, compliance-document engine, consignment lifecycle | A dedicated "digital train manifest" document form (consignment linking + manifest tooling exists; form would sit in Rail Ops Console) |
| **Event backbone (Kafka/Kinesis)** | 🟡 alternative | Socket.IO WebSocket gateway (`gateway/events.gateway.ts`): JWT-authenticated, origin-restricted, **tenant-targeted broadcasts** (map socketId → companyId) — live dashboards, handshake updates | Durable event streaming (Kafka/Redpanda): no event log, no consumer groups, no replay. An **outbox + webhook** pattern is the pragmatic next step before Kafka |
| **IoT Telemetry / Wagon GPS (MQTT/AMQP)** | ❌ | Road-fleet live tracking + forwarding vessel/air-cargo intelligence exist; rail "telemetry" today = corpus data + operator-entered events (handshake deviations, occurrences, weighbridge) | No wagon/locomotive telemetry ingestion, no MQTT/AMQP gateways, no sensor integrations |
| **Operational DB (PostgreSQL multi-tenant)** | ✅ | PostgreSQL (Prisma), ACID billing/bookings/profiles; 9 migrations applied on VPS | — |
| **Time-Series DB (TimescaleDB/InfluxDB)** | ❌ | Telemetry-ish history (movements, tracking) lives in ordinary Postgres tables | Hypertables / retention policies / continuous aggregates — only needed once real telemetry volume arrives |
| **Data Lake (Snowflake/Delta)** | ❌ | Analytics (commercial, logistics, fleet intelligence, KPI baselines) computed in Postgres services | Warehouse/lake for ML feeding (ETA prediction, congestion models) |
| **TRIM Systems API** | 🟡 static mirror | The **corpus is the Transnet/TRIM published source of record**: working timetables (Anx 33a), capacity (33b), tariffs (40/Table 17), KPI baselines (43), register (33), network statement V4 + 21 of 44 annexures — with provenance, SHA-level traceability and preserved anomalies; docs-sync checks | **Live** API pulls of paths, speed restrictions, delays/derailments — depends on Transnet exposing an API/integration channel |
| **Port Community Systems (Durban/Richards Bay, Saldanha)** | ❌ | Corridor + transfer-yard catalogs (incl. port-adjacent yards); forwarding module has vessel tracking | Live PCS webhooks aligning train ETAs with ship loading — external integration, no channel today |
| **Telemetry Gateways (hardware protocols)** | ❌ | — | MQTT/AMQP ingestion services + device registry |

## What already runs today (the honest core)

1. **Multi-tenant edge & access** — JWT + OIDC SSO + RBAC + tested tenant isolation. Ten competing TOCs on one
   backend is exactly the model (tenant = company; Grindrod could not see Menar's slots/pricing).
2. **Slot & scheduling as a governed workflow** — applications, self-screening, envelope compliance, allocation,
   conflicts, revocation, expiry, audit, billing hooks; rules engines everywhere (`rail-slot.rules`, `rail-envelope`,
   `rail-compliance`, `rail-possession.rules`, `rail-change.rules`, `rail-pricing-gates`).
3. **Billing** — the whole quote→invoice→reconcile chain plus plans/limits/entitlements.
4. **Compliance & safety** — RSR, cancellations, disputes, possessions, dangerous goods, weighbridge, handshake.
5. **Operational Postgres** — the transactional box in the blueprint.
6. **The data foundation for TRIM/PCS** — the annexure corpus *is* what those APIs would deliver, frozen at
   publication with provenance.

## What it would take to reach the blueprint (recommended phasing)

| Phase | Build | Notes |
|---|---|---|
| **1 — Real-time without Kafka** | Transactional **outbox + public webhooks** on slot/handshake/occurrence events; Socket.IO already broadcasts internally | Gets "event-driven" externally (TRIM/PCS partners consume webhooks) at 10% of Kafka's ops cost |
| **2 — Solver** | Standalone optimization service (OR-Tools/OptaPlanner) consuming Anx 33b capacity envelopes + maintenance possessions + demand; returns *proposed* timetables for human approval | Fits the charter's "automation assists; humans decide"; the rules engine already defines the constraints |
| **3 — Telemetry** | MQTT/AMQP ingestion gateway → TimescaleDB hypertables (wagon GPS, speed, fuel); feeds ETA calculator + congestion views | Only pays off once hardware partners are live; slot/handshake workflows don't depend on it |
| **4 — External integrations** | TRIM API adapter (when Transnet offers one), PCS webhooks (Durban/Richards Bay/Saldanha) | Relationship-gated; corpus remains the fallback source of record |
| **5 — Data platform** | Warehouse/lake (Snowflake/Delta) + ML pipelines (ETA, congestion) | After Phase 3 produces the volume that justifies it |
| **Hardening** | Postgres RLS policies mirroring `companyId` scoping | Defense-in-depth on the tenant boundary |

## Bottom line

The blueprint is a good *target*. The rail you run today already implements its **decision-making and governance
core** (identity, tenancy, slot workflow, compliance, billing, operational DB) on the one foundation that had to
be right first — **the Transnet source-of-record data**. The missing layers (event backbone, telemetry, solver,
live TRIM/PCS) are all additive; none of them require rework of what exists.

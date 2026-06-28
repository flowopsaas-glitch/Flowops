# FlowOps Industry Verticals — Design

## Overview

Introduce a third configuration dimension — **Industry Vertical** — that reshapes the
app per industry, composed on top of the two existing dimensions without forking the
product.

```
            ┌─────────────────────────────────────────────────────────┐
            │  What the user actually sees (nav, dashboard, labels)     │
            └─────────────────────────────────────────────────────────┘
                                   ▲  resolved as the INTERSECTION of:
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
  PLAN TIER                 INDUSTRY PACK                USER PERMISSIONS
  (commercial ceiling)      (industry shape)             (per-person access)
  plan-entitlements.ts      industry-packs.ts (NEW)      tenantUserPermissions.ts
  starter/pro/enterprise    COURIER/FREIGHT/RETAIL/...    role + overrides
```

**Resolution rule:** a module/nav item is shown only if **plan entitles it** AND **the
industry pack includes it** AND **the user's permission allows it**. The industry pack
can also ship **industry-specific modules** bundled with the pack.

## Data model

### `Company.industry`
```prisma
enum Industry {
  COURIER              // default — reproduces today's experience
  FREIGHT_FORWARDING   // import/export & customs
  RETAIL_DISTRIBUTION  // DC + store replenishment + last-mile
  PHARMA_COLDCHAIN     // regulated, temperature-controlled
  THIRD_PARTY_LOGISTICS// multi-client 3PL
  MANUFACTURING        // raw-in / finished-out
}

model Company {
  // ...existing fields...
  industry Industry @default(COURIER)
}
```
Backwards-compatible: existing tenants default to `COURIER` → no behaviour change.

## Industry Pack registry (new)

`backend/src/industry/industry-packs.ts` — the single source of truth, mirrored to the
frontend via `GET /industry/pack` (or embedded in the entitlements payload).

```ts
export interface IndustryPack {
  id: Industry;
  label: string;                       // "Import / Export"
  controlTower: string;                // dashboard component key
  // Modules emphasised/enabled for this vertical (subset of FEATURE_KEYS + pack-only)
  modules: string[];
  // Sidebar layout: ordered sections + which nav keys belong, with industry labels
  nav: { section: string; items: { key: string; label?: string }[] }[];
  // Terminology overrides applied app-wide
  terminology: Record<string, string>; // { shipmentFile: "Store Order", consignee: "Store" }
  // Default department personas for this industry
  personas: string[];
  // Regulated-capability declarations (honest-capability gate)
  compliance?: string[];
}
```

The frontend already has a persona-aware dashboard (`Dashboard.tsx`) and a permission
matrix; the pack adds the **industry layer** that selects the control tower, reorders
nav, and supplies terminology.

## Composition points (where it plugs into existing code)

| Concern | Existing code | Change |
|---|---|---|
| Entitlements | `plan-entitlements.ts` + `GET /billing/entitlements` | unchanged; pack reads it as the ceiling |
| Nav | `AppLayout.tsx` nav array | resolve order/labels/visibility through the active pack |
| Dashboard | `Dashboard.tsx` persona + `ForwardingControlTower` | select control tower from pack (V1 already built) |
| Permissions | `tenantUserPermissions.ts` | unchanged; still the per-user gate |
| Terminology | scattered literals | introduce a `useTerm(key)` helper backed by pack overrides |
| Onboarding | company setup | add an **industry selector** step |

## Per-industry department / module matrix

Legend: 🟢 exists · 🟠 partial · 🔴 to build

### V1 — Import/Export & Freight Forwarding  (reference, mostly built)
Departments: Sales, Customer Service/Docs, **Operations (Ocean/Air/Road)**, **Clearing & Customs**, **Procurement/Carriers**, Warehousing, Finance/Disbursements, Management.
- 🟢 Forwarding console, containers, consolidation, customs + SARS EDI, carriers (#186), Freight Control Tower (#188)
- 🟠 Warehousing (CFS/bonded), 🔴 Disbursements ledger
- Control tower: **Freight Control Tower** ✅

### V2 — Courier & Parcel  (reference, built = today's product)
Departments: Dispatch, Waybills/Inbox, POD/Deliveries, Collections, Returns, Fleet, Finance/COD, Clients, Management.
- 🟢 All core modules + courier dashboard
- Control tower: **Logistics Control Hub** (current)

### V3 — Retail Distribution & Replenishment
Departments: **DC/Warehouse**, **Store Replenishment**, Inbound (supplier/PO), Outbound/Last-mile, Returns/Reverse logistics, Demand/Capacity, Finance, Management.
- 🟢 Waybills, dispatch, POD, returns, routing reusable
- 🔴 **Store/DC replenishment** (store orders, PO receipt, putaway), 🟠 advanced WMS (bin/zone), 🔴 demand/replenishment signals
- Control tower: **Retail Distribution Tower** 🔴 (stores served today, fill rate, on-shelf availability, DC throughput, returns)

### V4 — Pharma & Cold Chain  (regulated)
Departments: Cold-chain Ops, **Batch/Lot & Expiry**, **Temperature Monitoring**, Regulatory/SAHPRA, Recalls, Controlled Substances, Distribution, Finance.
- 🟢 Distribution/POD reusable
- 🔴 **Temperature logging/excursions**, 🔴 **batch/lot + expiry tracking**, 🔴 **recall workflow**, 🔴 controlled-substance register, 🔴 SAHPRA compliance
- Control tower: **Cold Chain Tower** 🔴 (excursions, shipments in temp range, expiring lots, recalls open)
- ⚠️ Honest-capability gate: do **not** advertise regulated features until built.

### V5 — 3PL / Contract Logistics
Departments: **Multi-client management**, Warehousing (per client), Transport, **Client billing/segregation**, SLAs per client, Finance, Management.
- 🟢 Branches, clients, billing reusable
- 🔴 **Per-client data segregation within a tenant**, 🔴 per-client SLA + billing rules, 🟠 multi-client warehousing
- Control tower: **3PL Tower** 🔴 (per-client volumes, SLA adherence, billing accruals)

### V6 — Manufacturing & Distribution  (later)
Departments: Inbound raw materials, Production link, Finished-goods warehouse, Outbound distribution, Finance.
- Mostly reuse + light additions. Deferred.

## Cross-cutting: enterprise readiness (ties to prior discussion)
Industry editions target larger tenants, so the following are **prerequisites for any
tier-1 retail/pharma deployment** and tracked in tasks.md Phase 5:
- Horizontal API scaling + load balancer
- Managed Postgres + read replicas + partitioning (waybills/shipments by date/tenant)
- Redis: cache (dashboard metrics) + Bull queues/workers (AI sweeps, OCR, autopilot)
- Socket.io Redis adapter (multi-instance realtime)
- Object storage for docs/OCR
- Security/compliance posture: ISO 27001 path, pen-test, data residency, SLA
- Load testing before any tier-1 SLA

## Risks & mitigations
- **Scope explosion** → ship verticals one at a time; V1/V2 are free (already built).
- **Nav/terminology drift** → centralise in the pack registry + `useTerm`.
- **Regulated overreach** (pharma) → explicit compliance declarations + honest gating.
- **Per-tenant scale** → enterprise-readiness phase gates the big retail/pharma logos.

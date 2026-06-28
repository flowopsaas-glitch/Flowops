# FlowOps Industry Verticals — Implementation Plan

> Sequenced so value lands early and risk stays low. **Phase 1 ships the foundation
> + two reference verticals (V1/V2) using modules that already exist** — so the
> verticalization concept is provably live before any big new module is built.
> Each phase is independently shippable.

## Phase 0 — Foundation (the industry layer)
- [ ] 0.1 Add `Industry` enum + `Company.industry` (`@default(COURIER)`) to schema;
      `prisma db push`. No behaviour change yet.
- [ ] 0.2 `industry-packs.ts` registry + `GET /industry/pack` (returns the active
      tenant's pack; embed in or alongside `/billing/entitlements`).
- [ ] 0.3 Frontend `useIndustryPack()` + `useTerm(key)` helpers.
- [ ] 0.4 Owner console: view/change a tenant's industry. Company-setup onboarding:
      industry selector step.
- [ ] 0.5 Resolver: nav (AppLayout) + dashboard read `plan ∩ pack ∩ perms`. `COURIER`
      pack reproduces today exactly (regression guard + snapshot test).
- _Requirements: 1, 2, 6_

## Phase 1 — Reference verticals (V1 + V2, mostly free)
- [ ] 1.1 **V2 Courier pack** = the current experience formalised into a pack (default).
- [ ] 1.2 **V1 Freight Forwarding pack**: control tower = existing Freight Control
      Tower (#188); nav surfaces Forwarding/Customs/Carriers; terminology
      (Shipment File, Consignee, Container).
- [ ] 1.3 Tag the demo tenants: `demo-ent` → `FREIGHT_FORWARDING`, `demo` → `COURIER`.
      Proves side-by-side verticals end-to-end.
- _Requirements: 2, 3, 4_

## Phase 2 — Retail Distribution (V3)
- [ ] 2.1 **Retail pack** + nav layout (DC, Replenishment, Inbound/PO, Outbound,
      Reverse logistics).
- [ ] 2.2 **Store/DC replenishment module**: store orders, PO receipt, putaway,
      pick/pack against store orders (new backend module + pages).
- [ ] 2.3 Advanced WMS depth: bin/zone locations on the warehouse hub.
- [ ] 2.4 **Retail Distribution Tower**: stores served, fill rate, on-shelf
      availability proxy, DC throughput, returns rate.
- [ ] 2.5 Terminology overrides (Store Order / Store / Replenishment).
- _Requirements: 2, 3, 4_

## Phase 3 — Pharma & Cold Chain (V4, regulated)
- [ ] 3.1 **Pharma pack** with explicit `compliance[]` declarations + honest gating.
- [ ] 3.2 **Temperature monitoring**: per-shipment/container temp logs + excursion
      alerts (manual + device-feed-ready).
- [ ] 3.3 **Batch/lot + expiry** tracking on cargo/inventory.
- [ ] 3.4 **Recall workflow** (identify affected lots → notify → reverse).
- [ ] 3.5 Controlled-substance register; SAHPRA documentation hooks.
- [ ] 3.6 **Cold Chain Tower**: open excursions, in-range %, expiring lots, recalls.
- [ ] 3.7 Compliance review before anything regulated is marked "available".
- _Requirements: 3, 5_

## Phase 4 — 3PL / Contract Logistics (V5)
- [ ] 4.1 **3PL pack**.
- [ ] 4.2 **Per-client segregation within a tenant** (client as a first-class scope on
      shipments/warehousing/billing) + per-client SLA rules.
- [ ] 4.3 Per-client billing accruals + statements.
- [ ] 4.4 **3PL Tower**: per-client volumes, SLA adherence, billing accruals.
- _Requirements: 2, 3_

## Phase 5 — Enterprise readiness & scale (prereq for tier-1 retail/pharma logos)
> Runs in parallel from Phase 2; **gates** any Shoprite/Woolworths/Dischem-scale
> contract. Application code is largely ready — this is deployment topology + trust.
- [ ] 5.1 Horizontal API scaling behind a load balancer (stateless instances).
- [ ] 5.2 Managed Postgres + read replicas; partition high-volume tables
      (waybills/shipments) by date/tenant.
- [ ] 5.3 Redis: cache (dashboard metrics) + Bull queues/workers for AI sweeps, OCR,
      autopilot, intel; Socket.io Redis adapter for multi-instance realtime.
- [ ] 5.4 Object storage (R2/S3) for documents/OCR at volume.
- [ ] 5.5 Load testing to a target tenant volume; publish capacity numbers.
- [ ] 5.6 Security/compliance: ISO 27001 path, third-party pen test, data-residency
      statement, contractual uptime SLA, 24/7 support runbook.
- _Requirements: 6_

## Phase 6 — Manufacturing (V6) — deferred
- [ ] 6.1 Manufacturing pack (inbound raw → production link → finished-goods → outbound),
      mostly reuse.

## Sequencing summary
| Phase | Outcome | New build weight |
|---|---|---|
| 0 | Industry layer live, zero regression | Low |
| 1 | V1 + V2 shipped as packs | Very low (reuse) |
| 2 | Retail edition | High |
| 3 | Pharma/Cold-chain edition (regulated) | High |
| 4 | 3PL edition | Medium |
| 5 | Tier-1 scale + trust | Medium (infra) |
| 6 | Manufacturing | Low |

## Definition of done (per vertical)
1. Industry pack registered (modules, nav, terminology, control tower, compliance).
2. Dedicated control-tower dashboard with an instructional empty state.
3. Demo tenant on that industry, seeded so it renders live.
4. Nav/routes resolve via `plan ∩ pack ∩ perms` with no cross-vertical leakage.
5. `nest build` + `tsc` + `vite build` clean; tenant-isolation + regression tests pass.
6. Regulated capabilities honestly gated.

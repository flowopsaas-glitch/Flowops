# Freight Forwarding — Implementation Plan

Tasks are ordered for incremental, always-deployable delivery. Each references
the requirements it satisfies. Phase 1 is the buildable MVP; Phases 2–3 follow.

## Phase 1 — Shipment File MVP

- [ ] 1. Schema + entitlement foundation
  - Add `ShipmentFile`, `ShipmentContainer`, `CargoLine`, `ShipmentCharge`,
    `ShipmentDocument`, `ShipmentMilestone` models + enums (additive).
  - Add `freightForwarding` to `FEATURE_KEYS`; enable on `enterprise`.
  - _Requirements: 1.4, 1.5, cross-cutting (additive schema, entitlement)_

- [ ] 2. ShipmentFile service + controller (core CRUD)
  - File-number generation (`{IMP|EXP}-{YYYY}-{seq}` per tenant), create/list/
    get/update/soft-cancel, tenant isolation, `@Roles` + feature gate.
  - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, cross-cutting_

- [ ] 3. Containers & cargo lines
  - Add containers (FCL) with ISO type/seal/VGM + container-number check-digit
    validation (warn, not block); add cargo lines (LCL/AIR) with HS code +
    customs value capture.
  - _Requirements: 2.1, 2.2, 2.3, 7.1_

- [ ] 4. Routing & milestones
  - POL/POD/vessel/voyage/ETD/ETA on the file; `POST .../milestone` advances
    status, writes `ShipmentMilestone`, emits an event (AiEvent + gateway).
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 5. Charges, margin & invoicing
  - Charge lines (cost/sell/currency/invoiceTo); `GET .../totals` (cost, sell,
    margin, marginPct per currency); `POST .../invoice` via InvoicesModule.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6. Documents
  - Attach/list typed documents via StorageModule (R2/local).
  - _Requirements: 5.1, 5.2_

- [ ] 7. Frontend — Forwarding Console + File detail
  - `forwardingApi.ts` typed client; ForwardingConsole (KPIs, filters, list);
    ShipmentFile detail (parties/cargo/routing+timeline/charges+margin/docs);
    route + nav entry; entitlement upsell when not enabled.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. Last-mile bridge
  - On `CUSTOMS_CLEARED`, "Create delivery" spawns a domestic waybill/collection
    for the final leg (the cross-sell differentiator).
  - _Requirements: 3.3 (status hook); design §5_

- [ ] 9. AI assist v1 (the differentiator)
  - `forwarding-ai.service.ts`: (a) document → ShipmentFile draft extraction,
    (b) HS-code classification for a cargo line. Groq-backed, graceful when no key.
  - _Requirements: design §6 (1,2); 7.1_

- [ ] 10. Verify + ship
  - Backend `nest build` + frontend `tsc` clean; container check-digit unit test;
    PR with deploy notes (`prisma db push`).

## Phase 2 — Documents & Customs-lite (outline)
- [ ] 11. HBL/MBL + AWB PDF generation.
- [ ] 12. Commercial invoice + packing list PDFs.
- [ ] 13. HS-driven duty/VAT estimate (SA tariff).
- [ ] 14. SAD500 draft generation from file + cargo + HS.
- [ ] 15. AI doc-extraction wired into the Email Hub intake.

## Phase 3 — Compliance & scale (outline)
- [ ] 16. SARS EDI declaration submission + status; RLA awareness.
- [ ] 17. Demurrage/detention tracking (free days + per-diem + AI risk alerts
      into Autopilot/Observatory).
- [ ] 18. Consolidation / co-load (house files under a master).
- [ ] 19. Origin/destination agent network + partner portal.

## Definition of done (per task)
- Tenant-isolated (`companyId`) + RBAC + feature-gated.
- Additive schema only; builds clean (backend + frontend).
- Consistent with existing patterns (api client, glassCard, toasts, lucide).
- AI paths degrade gracefully without `GROQ_API_KEY`.

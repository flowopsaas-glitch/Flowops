# Freight Forwarding (Import/Export) — Requirements

## Overview

FlowOps today is a domestic last-mile courier/parcel platform. This feature adds
a **freight forwarding** capability so FlowOps can serve companies that move
**ocean and air containers for import/export**, handle customs, and manage the
documents and charges that go with international shipments.

This is a **new product line**, delivered in phases. This document specifies
**Phase 1 (the Shipment File MVP)** in detail, and outlines Phases 2–3 so scope
is visible up front.

**Positioning / wedge:** unlike CargoWise / Magaya / GoFreight (US/global-centric,
filings like AES/ISF/AMS), FlowOps targets the **South African** market first —
SARS Single Administrative Document (SAD), SARS EDI, RLA registration, HS codes
and SA duty/VAT — delivered AI-first and transparently priced.

## Non-goals (Phase 1)

- No live SARS EDI submission (Phase 3).
- No carrier/sailing-schedule API integrations (manual entry first).
- No automated rate procurement (reuse existing quotes/rate cards).
- Existing courier/parcel features are untouched.

---

## Phase 1 — Shipment File MVP

### Requirement 1: Shipment File as the central record
**User story:** As a forwarding operator, I want a single "file" per consignment
so that all parties, cargo, routing, documents and charges live in one place.

**Acceptance criteria**
1. WHEN an operator creates a Shipment File THEN the system SHALL capture: a
   unique file/job number, **mode** (OCEAN | AIR | ROAD), **direction**
   (IMPORT | EXPORT), and **load type** (FCL | LCL | BREAKBULK | AIR).
2. The system SHALL record the parties: shipper, consignee, notify party,
   carrier, and (optional) overseas agent.
3. The system SHALL record an Incoterm (EXW, FOB, CIF, DDP, etc.) and goods
   description, package count, gross weight and volume (CBM).
4. Each Shipment File SHALL belong to a tenant (companyId) and be isolated per
   tenant, consistent with the rest of the platform.
5. The feature SHALL be gated behind an entitlement flag (`freightForwarding`)
   so it is offered as an Enterprise/add-on capability.

### Requirement 2: Containers & cargo lines
**User story:** As an operator handling FCL, I want to attach containers so the
file reflects what's physically moving.

**Acceptance criteria**
1. WHEN load type is FCL THEN the operator SHALL be able to add one or more
   containers with: container number, ISO type (e.g. 20GP, 40HC, 40RF reefer),
   seal number and verified gross mass (VGM).
2. WHEN load type is LCL/AIR THEN the operator SHALL be able to add cargo lines
   (description, pieces, weight, dimensions) without a container.
3. The system SHALL validate container-number format (4 letters + 7 digits) and
   warn (not block) on a failed check-digit.

### Requirement 3: Routing & milestone tracking
**User story:** As an operator, I want port-to-port routing and status milestones
so I and my client can see where the shipment is.

**Acceptance criteria**
1. The system SHALL capture port of loading (POL), port of discharge (POD),
   vessel/voyage (ocean) or flight (air), and ETD/ETA.
2. The system SHALL track an ordered set of milestones (e.g. BOOKED, CARGO
   RECEIVED, LOADED, DEPARTED, ARRIVED, CUSTOMS CLEARED, DELIVERED) with a
   timestamp per milestone reached.
3. WHEN a milestone is reached THEN the file's current status SHALL update and
   an event SHALL be recorded (reusing the existing AiEvent/tracking patterns).

### Requirement 4: Charges, margin & multi-currency
**User story:** As a forwarder, I want cost vs sell per charge so I can see the
margin on every file.

**Acceptance criteria**
1. The operator SHALL add charge lines with: description, currency, cost amount,
   sell amount, and a party to invoice.
2. The system SHALL compute per-file totals (cost, sell, margin) and surface the
   margin percentage.
3. WHEN charges are in multiple currencies THEN totals SHALL be presented per
   currency (FX conversion is out of scope for Phase 1).
4. The operator SHALL be able to generate an invoice from a file's sell charges,
   reusing the existing invoicing module.

### Requirement 5: Documents
**User story:** As an operator, I want to attach and list the documents for a file.

**Acceptance criteria**
1. The operator SHALL attach documents to a file with a type label
   (BILL_OF_LADING, COMMERCIAL_INVOICE, PACKING_LIST, CERT_OF_ORIGIN,
   SAD500, OTHER), reusing existing storage (Cloudflare R2 / local).
2. The system SHALL list documents on the file with type, filename and date.

### Requirement 6: Forwarding console (UI)
**User story:** As an operator, I want a console to list, filter and open files.

**Acceptance criteria**
1. The UI SHALL list Shipment Files with file number, mode, direction, parties,
   status and ETD/ETA, filterable by mode/direction/status.
2. The UI SHALL provide a file detail view showing parties, containers/cargo,
   routing + milestones, charges (with margin), and documents.
3. WHEN the tenant lacks the `freightForwarding` entitlement THEN the UI SHALL
   show an upsell instead of the console.

### Requirement 7: HS code capture (lightweight, Phase-1 stub for Phase 2)
**User story:** As an operator, I want to record HS tariff codes per cargo line
so customs work can build on it later.

**Acceptance criteria**
1. The operator SHALL be able to enter an HS code and customs value per cargo
   line. (Duty/VAT calculation and SAD500 generation are Phase 2.)

---

## Phase 2 — Documents & Customs-lite (outline)
- Generate House/Master Bill of Lading and Air Waybill PDFs.
- Generate commercial invoice & packing list PDFs.
- HS-code-driven duty/VAT estimate (SA tariff schedule).
- Draft **SAD500** goods declaration generation.
- AI document extraction (commercial invoice → Shipment File), reusing the Email
  Hub AI extraction pipeline.

## Phase 3 — Compliance & scale (outline)
- SARS **EDI** declaration submission + status; RLA registration awareness.
- Demurrage & detention tracking (free days + per-diem accruals + alerts).
- Consolidation / co-load (multiple house files under one master).
- Origin/destination agent network.
- AI differentiators: HS-code classification, customs pre-check, demurrage-risk
  alerts wired into CLAW Autopilot + Observatory.

---

## Cross-cutting requirements
- **Tenant isolation & RBAC:** all endpoints scoped by companyId and guarded by
  roles (ADMIN / COMPANY_ADMIN / MANAGER / dedicated FORWARDING role later).
- **Entitlement gating:** `freightForwarding` feature flag in plan-entitlements.
- **Additive schema only:** new tables/columns via `prisma db push`; no changes
  to existing courier tables.
- **Consistency:** reuse existing patterns — `@CurrentUser()`, glassCard UI,
  toasts, lucide icons, the api client, and the invoicing/storage modules.

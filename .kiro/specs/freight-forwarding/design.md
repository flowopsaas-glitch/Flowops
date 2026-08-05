# Freight Forwarding (Import/Export) — Design

## 1. Vision: why this is 50× better, not a CargoWise clone

The incumbents (CargoWise, Magaya, GoFreight, Descartes) are powerful but
**expensive, complex, US/global-centric, and bolt AI on as an afterthought**.
CargoWise's Dec-2025 move to per-transaction pricing reportedly drove 20–50%
cost increases for some customers. FlowOps wins on four axes the incumbents
structurally don't own:

1. **AI-native, not AI-added.** Every operator chore — reading a commercial
   invoice, classifying an HS code, spotting a demurrage risk, drafting a SAD500
   — is an AI action by default, powered by the CLAW engine you already have.
2. **South-Africa-native.** First-class SARS SAD declaration, SARS EDI, RLA,
   SA HS tariff + duty/VAT — where global tools are clumsy. This is the wedge.
3. **One platform, last-mile to ocean.** A forwarder's container clears customs
   then needs *domestic delivery* — which FlowOps already does best. Competitors
   stop at the port; FlowOps owns the **first and last mile around the freight**.
4. **Transparent, self-hosted, POPIA-friendly.** Predictable pricing and your
   own data — vs per-transaction surprise bills and offshore data.

The "50× better" promise is concentrated in the **AI layer** (Section 6) and the
**unified Control Tower** (Section 5), on top of a clean, correct operational core.

## 2. Architecture

A self-contained NestJS module + React surface, reusing existing infrastructure.

```
backend/src/forwarding/
  forwarding.module.ts            @Module (gated by freightForwarding entitlement)
  shipment-file.service.ts        CRUD + milestone + totals
  containers.service.ts           containers + cargo lines (+ check-digit)
  charges.service.ts              cost/sell/margin, invoice handoff
  forwarding.controller.ts        tenant REST API (@Roles, @CurrentUser)
  forwarding-ai.service.ts        AI: doc extraction, HS classify, demurrage risk
  dto/*.ts                        validated DTOs

frontend/src/
  pages/forwarding/ForwardingConsole.tsx   list + filters + KPIs
  pages/forwarding/ShipmentFile.tsx        detail (parties/cargo/route/charges/docs)
  api/forwardingApi.ts                     typed client
```

Reused as-is: `PrismaService`, `BillingService` (entitlement), `StorageModule`
(R2 docs), `InvoicesModule` (invoice from charges), `EventsGateway` (live
milestones), `WhatsAppModule` (client updates), CLAW AI services + Observatory.

## 3. Data model (Prisma — additive only)

```prisma
enum FreightMode      { OCEAN AIR ROAD }
enum FreightDirection { IMPORT EXPORT }
enum LoadType         { FCL LCL BREAKBULK AIR }
enum ShipmentFileStatus {
  DRAFT BOOKED CARGO_RECEIVED LOADED DEPARTED ARRIVED
  CUSTOMS_CLEARED DELIVERED CANCELLED
}

model ShipmentFile {
  id           String              @id @default(cuid())
  fileNumber   String                                   // e.g. IMP-2026-00042
  mode         FreightMode
  direction    FreightDirection
  loadType     LoadType
  status       ShipmentFileStatus  @default(DRAFT)
  incoterm     String?                                  // EXW|FOB|CIF|DDP...

  // Parties (denormalised for speed; optional links to Client later)
  shipperName     String?
  consigneeName   String?
  notifyParty     String?
  carrierName     String?
  agentName       String?

  // Cargo summary
  goodsDescription String? @db.Text
  packages         Int?
  grossWeightKg    Float?
  volumeCbm        Float?

  // Routing
  pol           String?      // port of loading (UN/LOCODE or name)
  pod           String?      // port of discharge
  vesselVoyage  String?      // or flight no.
  etd           DateTime?
  eta           DateTime?

  // AI-derived (Section 6)
  aiRiskScore   Int?         // 0-100 demurrage/delay risk
  aiRiskNote    String?  @db.Text

  companyId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  containers ShipmentContainer[]
  cargo      CargoLine[]
  charges    ShipmentCharge[]
  documents  ShipmentDocument[]
  milestones ShipmentMilestone[]

  @@unique([fileNumber, companyId])
  @@index([companyId, status])
  @@map("shipment_files")
}

model ShipmentContainer {
  id            String  @id @default(cuid())
  fileId        String
  file          ShipmentFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  containerNo   String       // ABCU1234567
  isoType       String       // 20GP|40HC|40RF...
  sealNo        String?
  vgmKg         Float?
  @@map("shipment_containers")
}

model CargoLine {
  id           String  @id @default(cuid())
  fileId       String
  file         ShipmentFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  description  String
  pieces       Int?
  weightKg     Float?
  dimensions   String?
  hsCode       String?   // tariff heading
  customsValue Float?
  @@map("cargo_lines")
}

model ShipmentCharge {
  id          String  @id @default(cuid())
  fileId      String
  file        ShipmentFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  description String
  currency    String  @default("ZAR")
  cost        Float   @default(0)
  sell        Float   @default(0)
  invoiceTo   String? // party to bill
  @@map("shipment_charges")
}

model ShipmentDocument {
  id        String  @id @default(cuid())
  fileId    String
  file      ShipmentFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  type      String  // BILL_OF_LADING|COMMERCIAL_INVOICE|PACKING_LIST|CERT_OF_ORIGIN|SAD500|OTHER
  fileName  String
  fileKey   String  // storage key
  createdAt DateTime @default(now())
  @@map("shipment_documents")
}

model ShipmentMilestone {
  id        String  @id @default(cuid())
  fileId    String
  file      ShipmentFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  status    ShipmentFileStatus
  note      String?
  reachedAt DateTime @default(now())
  @@map("shipment_milestones")
}
```

`companyId` is a plain indexed column (no FK to Company) to keep the change
additive and avoid touching the Company model, matching how other late modules
were added.

## 4. API surface (tenant, `@Roles(ADMIN, COMPANY_ADMIN, MANAGER)`, feature-gated)

```
POST   /forwarding/files                 create file
GET    /forwarding/files                 list (filter: mode, direction, status, q)
GET    /forwarding/files/:id             detail (incl. children + totals)
PATCH  /forwarding/files/:id             update header/parties/routing
POST   /forwarding/files/:id/milestone   advance status (records ShipmentMilestone + event)
DELETE /forwarding/files/:id             soft cancel

POST   /forwarding/files/:id/containers  add container (+ check-digit validation)
POST   /forwarding/files/:id/cargo       add cargo line
POST   /forwarding/files/:id/charges     add charge
GET    /forwarding/files/:id/totals      { cost, sell, margin, marginPct } per currency
POST   /forwarding/files/:id/invoice     generate invoice from sell charges (InvoicesModule)
POST   /forwarding/files/:id/documents   attach document (StorageModule)

# AI (Section 6)
POST   /forwarding/ai/extract            doc upload → parsed ShipmentFile draft
POST   /forwarding/files/:id/ai/hs-classify   cargo line → suggested HS code(s)
POST   /forwarding/files/:id/ai/risk          recompute demurrage/delay risk
```

`GET /billing/entitlements` exposes `freightForwarding` for UI gating.

## 5. The unified Control Tower (frontend)

- **ForwardingConsole**: KPI strip (open files, arriving this week, at-risk count,
  margin MTD), filters (mode/direction/status), live list. Reuses `glassCard`,
  toasts, lucide icons.
- **ShipmentFile** detail: tabbed — Parties · Cargo/Containers · Routing &
  Milestones (visual timeline, live via `EventsGateway`) · Charges (cost/sell/
  margin) · Documents. One-click "Generate invoice" and "WhatsApp update to
  consignee".
- **Last-mile bridge**: when a file hits `CUSTOMS_CLEARED`, offer "Create
  delivery" that spawns a normal FlowOps waybill/collection for the domestic
  leg — the unique cross-sell no competitor offers.

## 6. The AI layer (where 50× lives) — `forwarding-ai.service.ts`

All reuse the existing Groq/CLAW plumbing (`llama-3.3-70b-versatile`), guarded by
`GROQ_API_KEY`, degrading gracefully when absent.

1. **Document → File extraction.** Upload a commercial invoice / packing list /
   BL; AI extracts shipper, consignee, goods, weights, container numbers, HS
   hints and pre-fills a Shipment File draft for one-click confirm. (Reuses the
   Email Hub extraction pattern.)
2. **HS-code classification.** Given a goods description, AI suggests the most
   likely SA HS tariff heading(s) with confidence + rationale — the single most
   error-prone, time-consuming customs task.
3. **Demurrage / delay risk.** AI scores each file 0–100 from ETA, milestones,
   free-days and history; high scores raise a CLAW Action Item and (optionally)
   a WhatsApp/owner alert — wired into **Autopilot** + **Observatory**.
4. **Customs pre-check (Phase 2/3).** Before SAD500 submission, AI flags missing
   docs, value/HS mismatches, and likely SARS stops.

These make the platform proactive and assistive in ways incumbents charge extra
for or don't offer at all.

## 7. South African customs mapping (Phase 2/3 detail)

- **SAD (Single Administrative Document)** — the SARS goods declaration for
  import/export/transit; Phase 2 generates a draft from the file + cargo + HS.
- **SARS EDI** — Phase 3 submits the declaration electronically and tracks
  status; RLA (Registration, Licensing, Accreditation) awareness for traders.
- **Duty/VAT** — Phase 2 estimates from HS code + customs value + SA tariff.

## 8. Entitlement & rollout

- Add `freightForwarding` to `FEATURE_KEYS`; enable on `enterprise` (and a new
  optional add-on). UI + API gate on it; non-entitled tenants see an upsell.
- Phase 1 ships behind the flag so it's demoable without disrupting courier
  tenants. Phases 2–3 layer on without breaking Phase 1.

## 9. Testing & safety

- Additive schema (`prisma db push`); zero changes to courier tables.
- Backend `nest build` + frontend `tsc` gates; container check-digit unit test.
- AI calls are best-effort and never block the operator path.
- Tenant isolation enforced on every query (`companyId`), RBAC on every route.

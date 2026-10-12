# ePOD · POD · Finance — End-to-End Lifecycle Audit & Fix
**Date:** 2026-10-12 · **Branch:** `arena/a620a55a-flowops` · **Scope:** road · rail · sea, all
departments, proof → money, end to end.

> **The principle this round established: PROOF GATES PAYMENT.**
> A delivery that is disputed is not revenue — it is an argument. Money only flows
> for deliveries whose proof is in good standing.

---

## 1. Audit — what the end-to-end trace found

Traced every lifecycle from delivery proof to money, per mode:

| Mode | Proof artifact | Money path | Verdict before this round |
|---|---|---|---|
| **Road** | `ElectronicPod` (capture → verify / dispute) | waybill `totalAmount` → unbilled list → batch invoice | ⚠️ **CRACK** (below) |
| **Rail** | manifest close = delivery attestation; weighbridge weights | `RailTariffCalculation` → `invoiceDraftId`, `holdTriggered` | ✅ hold already exists |
| **Sea** | `ShipmentFile.fileStatus` → DELIVERED (`pod` = port of discharge) | `forwarding/charges` sell charges → `fileNumber-INV` draft | ✅ priced-then-drafted, no false revenue |
| **All** | `InventoryItem`/`StockMovement` (warehouse) | — | ✅ audited in P2 (round 79) |

### The crack (road, and it was the only one)
`invoices.service.getUnbilledWaybills` billed **any DELIVERED waybill with `totalAmount` not
yet on an invoice** — a waybill with a **DISPUTED ePOD was included**. The dispute lived in a
document; the money never noticed. `getBillingCoverage` under-billing alerts had the same blind
spot: a disputed delivery counted as "missing revenue".

### The dead end
`EpodService.dispute()` set `status = DISPUTED` and stopped. `verify()` correctly refuses to
flip DISPUTED → VERIFIED (a dispute cannot be quietly erased) — but **no resolution path
existed at all**: a wrongly-disputed POD was stuck forever, its waybill unbillable with no
queue, no reason surfacing, no next action.

### Also found
- ePOD lifecycle emitted **no webhook events** (waybill/rail/telemetry/duty all did).
- `ElectronicPod.waybillId`/`driverId` were bare scalar FKs — no Prisma relations.
- Cross-lifecycle money visibility required three different pages; no single place answered
  "is the proof in good standing, and has the money followed?"

---

## 2. What was built

### A. The money gate (road)
- `backend/src/billing/proof-payment.rules.ts` — pure, one place: `epodState`, `isBillableProof`
  (holds exactly: unresolved DISPUTED + UPHELD; flows: none/PENDING/CAPTURED/VERIFIED/**CLEARED**),
  `holdReason` (collections-desk language), `classifyRow`. 5 rules tests.
- `getUnbilledWaybills` **excludes disputed-proof waybills** (`NOT electronicPods.some[DISPUTED
  & (resolution null | UPHELD)]`).
- `getBillingCoverage` splits **`heldForDispute {count, value}`** from unbilled — a dispute is an
  argument, not missing revenue.

### B. The dispute resolution path (was a dead end)
`POST /epod/:id/resolve-dispute {resolution, resolvedBy, note?}`:
- **CLEARED** → POD becomes VERIFIED (billing flows), timestamped with resolver.
- **UPHELD** → POD stays DISPUTED on purpose; the hold stands until settle/credit.
- CAS on `disputeResolvedAt: null` — two desks cannot both resolve one dispute.
- Schema + migration #15 (`20261012200000_epod_dispute_resolution`): `disputeResolution`,
  `disputeResolvedBy`, `disputeResolvedAt` + completes the waybill/driver FKs.

### C. The settle queue + cross-lifecycle board
- `GET /invoices/billing-holds` — holds-first: road disputed ePODs (ref, counterparty, amount,
  reason, **next action**, epodId) + rail weighbridge holds (the same principle, already built).
- `GET /invoices/proof-board` — ROAD (waybill → POD state → money), RAIL (tariff → hold/draft),
  SEA (file → charges → draft), one row each: proof state, money state (UNBILLED/HELD/INVOICED/PAID).
- UI: **Billing → Proof & Payments** (`/proof-payments`, `frontend/src/pages/ProofPayments.tsx`)
  — hold queue first with **Clear / Uphold** actions, board below; 3 FE tests.

### D. Lifecycle events (catalog 30 → 34)
`epod.captured` · `epod.verified` · `epod.disputed` · `epod.dispute_resolved` — emitted through
the same outbox pattern as waybill/rail/telemetry/duty.

---

## 3. Test proof
- **Backend:** 2,123/2,123 · 71 suites (new: proof-payment rules 5, ePOD resolution 4)
- **Frontend:** 777/777 · 34 files (new: ProofPayments 3)
- tsc/lint clean both sides; FE production build passes
- 15 migrations

## 4. Not in this round (honest backlog)
- Sea/rail **dispute** semantics (weighbridge release keeps its rail flow; sea has no dispute model).
- Crediting path after UPHELD (today: settle or manual credit outside).
- Dispatcher fleet duty board (offered, accepted — parked behind this audit).
- Automatic hold-release notification webhooks when a dispute resolves (the event exists;
  consumer-side reactions are integrator work).

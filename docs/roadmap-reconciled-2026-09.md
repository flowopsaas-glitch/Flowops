# FlowOps Roadmap — Reconciled Against Actual Code (Sept 2026)

> The `.kiro/specs/*` task lists show everything as `[ ]` unchecked — but that's
> stale. A lot shipped without the boxes being ticked. This doc is the HONEST
> status, verified against the real codebase, so you know what's genuinely built
> vs. genuinely pending. Verified by inspecting backend/src + frontend/src.

---

## 1. Freight Forwarding — ✅ PHASE 1 DONE, most of Phase 2/3 DONE

**Reality: this is LIVE and in daily-usable shape.** The `.kiro` spec shows 19
unchecked tasks; in fact the module is one of your most complete.

| Spec task | Status | Evidence |
|---|---|---|
| 1. Schema + `freightForwarding` entitlement | ✅ Done | ShipmentFile etc. in schema; feature gated (we verified) |
| 2. ShipmentFile CRUD service+controller | ✅ Done | `shipment-file.service.ts`, `forwarding.controller.ts` |
| 3. Containers & cargo + check-digit | ✅ Done | `containers.service.ts`, `container-check-digit.ts` |
| 4. Routing & milestones | ✅ Done | milestone endpoint live |
| 5. Charges, margin & invoicing | ✅ Done | `charges.service.ts`, `/totals`, `/invoice` |
| 6. Documents | ✅ Done | doc attach/list in API |
| 7. Frontend Console + File detail | ✅ Done | `ForwardingConsole.tsx`, `ShipmentFile.tsx`, `forwardingApi.ts` |
| 8. Last-mile bridge (create-delivery) | ✅ Done | `create-delivery` endpoint exists |
| 9. AI assist (extract + HS classify) | ✅ Done | `forwarding-ai.service.ts` |
| 11–12. HBL/AWB / invoice PDFs | ✅ Done | `forwarding-pdf.service.ts` |
| 13. Duty/VAT estimate | ✅ Done | `customs.service.ts` (SA ATV/VAT) |
| 14. SAD500 draft | ✅ Done | `customs-declaration.service.ts` |
| 17. Demurrage/detention | ✅ Done | `demurrage.service.ts` |
| 18. Consolidation (house/master) | ✅ Done | `consolidation.service.ts` |
| 15. AI doc-extraction into Email Hub intake | ⚠️ Partial | extraction exists; Email-Hub wiring unconfirmed |
| 19. Origin/destination agent network + partner portal | ❌ Not built | no partner-portal code |

**Verdict: effectively COMPLETE.** Remaining crumbs (agent partner portal) are
low-priority and only matter for a real forwarding customer who asks.

---

## 2. SARS EDI Customs Bridge — 🟡 SUBSTANTIALLY BUILT (transports exist)

**Reality: the hard architecture is built.** `backend/src/forwarding/customs-edi/`
exists with the transport factory + all four transport paths:
- `null.transport.ts` (fail-closed default)
- `clearing-agent-handoff.transport.ts` (the honest day-one path — hands off to a clearing agent)
- `service-provider.transport.ts` (BSP/VAN path)
- `direct-sars-edi.transport.ts` (direct EDI)
- `crypto.service.ts` (secret encryption) + `customs-edi-credential.service.ts` (per-tenant BYO credentials)
- Frontend: SARS EDI setup UI exists (`forwardingApi.ts` has credential get/put/verify)

**What's likely still pending** (of the 41 spec tasks): live end-to-end
transmission testing against a real SARS/BSP endpoint, message-log polish, and
the CUSDEC/CUSRES field-mapping completeness. But it **fails closed honestly** —
nothing is marked "lodged with SARS" without a real acknowledgement.

**Verdict: architecture DONE, live-transmission paths need a real counterparty
to finish/verify.** Correctly, it does nothing dishonest until then. **Don't
invest more here until a forwarding customer needs live SARS transmission.**

---

## 3. Industry Verticals (Enterprise Editions) — ❌ GENUINELY NOT BUILT

**Reality: this one is truly pending — 0% built.** Verified: no `Industry` enum,
no `Company.industry` field, no `industry-packs.ts`, no `useIndustryPack()`.
The concept (tailored "editions" per industry — Courier / Freight / Retail /
Pharma-ColdChain / 3PL / Manufacturing) exists only as the spec.

**Note:** Rail & Intermodal (which you DID build) is arguably a de-facto vertical
already — but it's a standalone module, not part of this "industry pack" framework.

**Verdict: the only spec that is real, unbuilt, future scope.** It's also the
biggest (31+ tasks across 6 phases) and the most speculative — it's an
*enterprise-scale* play (Shoprite/Woolworths/Dischem-tier logos), not an
SME-courier need. **Do NOT build speculatively.** Revisit only when a large
retail/pharma/3PL prospect with budget appears.

---

## Bottom line — the honest roadmap

| Spec | True status | Build next? |
|---|---|---|
| **Freight Forwarding** | ✅ ~Complete & live | No — done. Polish per customer request. |
| **SARS EDI Bridge** | 🟡 Architecture built, fails closed honestly | No — finish only when a forwarding customer needs live SARS transmission. |
| **Industry Verticals** | ❌ Not built (0%) | No — speculative enterprise scope. Wait for a tier-1 retail/pharma/3PL customer. |

**The real takeaway:** you are NOT behind on your roadmap. The two commercially
important specs (Forwarding, SARS EDI) are essentially built. The one that's
unbuilt (Verticals) is speculative enterprise scope you should NOT build until a
paying customer's needs justify it.

**Where focus belongs now:** getting Martin (first paying customer) active and
happy on the platform as it is — not building new product lines.

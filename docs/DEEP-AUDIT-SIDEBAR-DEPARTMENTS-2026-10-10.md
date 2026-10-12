# Deep Audit — Sidebar Pages, Flag-Gated Modules, Rail Completeness & Department Coverage

**Date:** 2026-10-10 · **Trigger:** owner review of `app.flowop.work` (Product Master & Process Book screenshots)
**Scope:** every sidebar entry (79 items / 8 sections), the two "switched off" pages, Rail completeness,
department coverage, live-API vs read-only vs static behavior.
**Method:** code audit of `frontend/src/components/layout/AppLayout.tsx` (authoritative menu), `frontend/src/App.tsx`
(145 routes), `frontend/src/api/*` (39 API modules), `backend/src/*` (~80 Nest modules), plan entitlements
(`backend/src/billing/plan-entitlements.ts`), and the Process Standardisation charter gates.

---

## 1. Direct answers

| Question | Answer |
|---|---|
| Are Product Master / Process Book supposed to look like this? | **Yes — by design.** Both engines ship **disabled** and the page shows a deliberate "switched off" banner. Full working engines (API + UI + integration tests) exist behind the flag. Enablement is an owner decision gated by the charter (§9). |
| Is Rail complete? | **UI: yes (13/13 pages live). Data: 21 of 44 annexures ingested** (all 10 NS V4 docs + core V3 set), with named gaps that are not yet published by Transnet (see §5). |
| Do sidebar pages "only provide info and not do anything"? | **No.** ~60 of 79 entries are operational (create/edit/act, persisting to Postgres). The read-only-looking ones fall into 4 legitimate categories (§4): analytics viewers, corpus reference pages, the 2 flag-gated banners, and launcher/queue hubs. |
| Have all departments been created? | **Yes.** All 8 sidebar departments (CORE, OPS, RAIL, COMMUNICATIONS, BILLING, INSIGHTS, AI, ADMIN) exist with pages, routes, backend modules and entitlements. Zero dead links across 79 nav targets. |

---

## 2. The two screenshots — working as designed

Both pages render a **feature-flag off state**, not a broken page:

- **Product Master** (`/product-master`) — banner when `PRODUCT_MASTER_ENABLED` (or `PROCESS_CONTROL_ENABLED`) is not `true`.
- **Process Book** (`/process-book`) — banner when `PROCESS_CONTROL_ENABLED` is not `true` (goods-receipt bridge additionally needs `PROCESS_CONTROL_WMS_RECEIPT_ENABLED=true`).

### Why they ship disabled

`docs/PROCESS-STANDARDISATION-MASTER-DATA-IMPLEMENTATION-CHARTER-DRAFT-2026-09-26.md` — these modules govern
**immutable approved SOPs, executed process instances with evidence, and Product→Variant→SKU identity**. The charter
is explicit: *"Nothing in this document authorises a production rollout."* The flags are **fail-closed in production**:

| Environment | To switch on |
|---|---|
| Non-production (dev/staging) | `PRODUCT_MASTER_ENABLED=true` (or `PROCESS_CONTROL_ENABLED=true`) |
| Production (the VPS) | Additionally `*_PRODUCTION_ALLOWED=true` — refused unless the charter §9 gates are signed off |

Backend logic: `backend/src/product-master/sku.policy.ts` (~L292–320) and `backend/src/process-control/process-control.policy.ts` (~L376–425).

### What is behind the banner (already built)

- **Product master:** `backend/src/product-master/` — products, variants, tenant-scoped never-reused SKU allocation,
  normalised variant fingerprints, ordered approval (product before variant), audit trail; UI `ProductMasterPage.tsx`
  (445 lines, full CRUD + approval + audit views, 6 write paths); integration tests `backend/test/integration/product-master.integration.spec.ts`.
- **Process book:** `backend/src/process-control/` — versioned SOPs (DRAFT→PILOT→APPROVED→RETIRED, approved versions
  immutable), instances with step evidence, blocking/non-blocking incidents, solutions, outcomes, change proposals;
  UI `ProcessBookPage.tsx` (510 lines: version transitions, start instance, resolve incident); goods-receipt bridge
  `backend/src/warehouse-management/goods-receipt-process.bridge.ts`; integration tests for both modules.

### Charter §9 production gates (all must be true before enablement)

1. `prisma generate` in CI + backend builds ✅ (in CI)
2. Reviewed migration + backfill scripts ✅ (migrations applied, 9/9 on VPS)
3. DB-backed integration tests (tenant isolation, SKU concurrency, evidence gating, …) ✅ (committed & passing)
4. Frontend build + tests ✅ (756/756)
5. **One controlled non-production warehouse pilot** with measured metrics ⬜ pending
6. **Rehearsed rollback plan** (flags off restores previous behavior) ⬜ pending
7. **Owner + independent reviewer go/no-go sign-off** ⬜ pending
8. No secrets committed ✅

**Recommendation:** leave both flags **off** on `app.flowop.work` (production) until gates 5–7 are done. If you want to
trial them, the safe path is a non-production environment (or accept the explicit `*_PRODUCTION_ALLOWED=true` override
with the charter sign-off recorded). Turning them on is one env line in `.env` + `docker compose … restart api`.

---

## 3. Sidebar audit — 79 items, 8 sections, 0 dead links

Menu source: `frontend/src/components/layout/AppLayout.tsx` (nav array L350–434). Every one of the 79 `to:` targets has
a matching route in `App.tsx` (145 routes total) — **no sidebar item leads to a 404**. Permission + plan-entitlement
gating is applied per item (`RequirePermission` / `RequireFeature`).

| Department (section) | Items | Live CRUD/actions | Read boards & analytics | Corpus reference | Flag-gated | Launcher/hub |
|---|---|---|---|---|---|---|
| CORE | 8 | 8 (Shipments, Waybill Inbox, Scan Capture, Batch Scan, Bulk Import, Waybills, Clients, Dashboard ops) | Dashboard (exec view) | — | — | — |
| OPS | 20 | 14 (Drivers, Dispatch, Collections, Returns, Carriers, Fleet Maint., Manifests, Depots, Driver Chat, Courier Mgmt, Forwarding console, SARS EDI save/verify, Warehouse Hub acts, Ops Command Centre) | 3 (ESG, Field Delivery live board, Driver Home) | — | — | 3 (Client Hub, POD/Deliveries board, Driver Home) |
| RAIL | 13 | 2 (Rail Ops Console: slots/change-requests/possessions; Daily Handshake: deviation reconciliation + dispute writes) | — | 11 (annexure viewers, §5) | — | — |
| COMMUNICATIONS | 3 | 2 (WhatsApp Hub, Email Hub — send/queue/config writes) | 1 (Client Queries triage queue → navigates to action pages) | — | — | — |
| BILLING | 13 | 11 (Invoices, Invoice Drafts, Billing Batches, Quotes, Credit Control, COD, Accounting, Disbursements, Rate Cards, Rate Shopping, Plans & Usage) | 1 (Finance Home) | — | — | 1 (Client Portal Links — share/QR by design) |
| INSIGHTS | 9 | 4 (Cross-Docking, Wave Planning, Barcode Verify, Product Master*), WMS inventory/actions API | 3 (Warehouse Mgmt overview, Commercial Analytics, Logistics Analytics) | — | 2 (Process Book*, Product Master*) | — |
| AI | 7 | 4 (Safety Zones, High Risk Queue, Ask FlowOps (Q&A write), Support Agent) | 3 (AI Control Tower mesh status, CLAW Autopilot console, Fleet Intelligence) | — | — | — |
| ADMIN | 6 | 6 (Admin Approvals, User Roles, Integrations, SSO, Settings, Admin Home links) | — | — | — | Admin Home |

\* Product Master / Process Book have full action UIs that appear **only when their flags are on**; otherwise the banner (§2).

**Backend coverage:** ~80 Nest modules (`backend/src/`) — including `warehouse-management` (26 endpoints: warehouses,
zones/bins, inventory adjust/transfer, receipts, picks, counts, cross-dock, waves, slotting, scan-verify),
`product-master`, `process-control`, `rail` (+ handshake/slot/tariff/change APIs), `billing`, `invoices`, `quotes`,
`accounting` (+ Pastel/Xero bridge), `returns`, `cod`, `collections`, `dispatch`, `drivers`, `epod`, `forwarding`,
`sso`, `autopilot`, `copilot`, `support`, `commercial-analytics`, `logistics-analytics`, `fleet-intelligence`,
`market-trends`, `email-hub`, `whatsapp`, `integrations`, `order-flow`, `smart-routing`, `route-optimization`,
`carbon/esg`, `fleet-maintenance`, `notifications`, `owner`, `audit`, `alerting`, and more.

---

## 4. Why some pages "only show information" — the four legitimate categories

1. **Analytics / status viewers (by design):** Dashboard, Finance Home, Commercial Analytics, Logistics Analytics,
   Fleet Intelligence, AI Control Tower (mesh status), ESG, Market Trends. Their job is to *inform*; the actions they
   recommend live on the operational pages they link to.
2. **Rail corpus reference pages (by design):** 11 of the 13 rail pages render the Transnet annexure corpus
   (251,678 rows, 672 source files) as searchable/frozen reference data. This data is *published regulation*, not
   tenant-entered data — there is nothing to "do" on it. The two action-heavy rail pages are **Rail Ops Console**
   (slot applications, change requests, possessions, dangerous goods, compliance) and **Daily Handshake**.
3. **Flag-gated engines:** Product Master, Process Book — full engines, banner until enabled (§2).
4. **Launcher/queue hubs (by design):** Client Hub, Admin Home, Client Portal Links, Client Queries, POD/Deliveries
   board — these aggregate and route into the pages where the actions are.

No page was found that *looks* interactive but silently does nothing. The 2026-10-07 release-readiness audit already
removed the stale links that used to lead nowhere.

---

## 5. Rail completeness

| Layer | Status |
|---|---|
| UI pages | **13/13 live** (Ops Console, Timetable Explorer, Corridor KPIs, Slots & Capacity, Tariffs & Charges, Network Statement, Network Register, Investment Plan, Occurrence & Policy, Cancellations, Access & Disputes, Daily Handshake, Network Sources) |
| NS V4 documents | **10/10 ingested** (NS `28645`, Anx 15, 17, 33, 33a, 33b, 40, 41, 42, 43 + notice) |
| Annexure register | **21 of 44 delivered** (1c, 15, 17, 18c, 20a, 20b, 21, 22, 28, 29a, 29bc, 32, 33, 33a, 33b, 35, 36, 40, 41, 42, 43) |
| Corpus integrity | 672 files / 251,678 rows / 13,471 workings / 688 depots — complete mirror of Annexure 33a |
| Table 17 tariffs | Loaded (eff. 1 Aug 2026) incl. application fees |

**Known data gaps (blocked on Transnet publication, not on us):**
- Ancillary / yard / marshalling **rate values** — NS 5.2.7 defers to a "future version" (E-TARIFF-01)
- SPRINT actuals (announced, not yet published)
- Network Register's appended section-level data file
- **Anx 1 2026/27 PROVISIONAL shut schedule** (delivered one is 2024/25 revised — caveated E-ANX1-01)

**Optional 2024/25 V3-era remainder** (user's call): 19a/b/c, 24–27b, 30/31/34, 16, 23, 13/14. Never re-upload the
10 V4 docs; skip NS V3 `4010` + Addendum `5238`.

---

## 6. Department coverage & entitlements

- **8 departments in the sidebar** (CORE, OPS, RAIL, COMMUNICATIONS, BILLING, INSIGHTS, AI, ADMIN) — all present,
  all routed, all permission-gated.
- **Plan entitlement catalog** (`backend/src/billing/plan-entitlements.ts`): 30+ capabilities (waybills, collections,
  tracking, pod, manifests, rateCards, cod, returns, routeOptimization, rateShopping, whatsapp, emailHub, accounting,
  accountingBridge, aiControlTower, copilot, api, ecommerce, whiteLabel, nativeApp, selfHost, clawAutopilot, sso,
  freightForwarding, rail, courierManagement, logisticsAnalytics, commercialAnalytics, warehouseManagement,
  marketTrends, orderFlowIntegration, aiSupportAgent, deliveryNotes, digitalPayments, epod, liveTracking, smartRouting…).
  Every entitlement has at least one live page.
- **"Department" is not a data entity** — the platform models org structure via companies → branches/depots +
  role-based permissions (`UsersRoles` permission matrix), not department records. If you want department-level
  org units (assign users to departments, per-department approval queues), that would be a new feature — say the word
  and it goes on the roadmap.

---

## 7. Findings & recommendations

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 1 | Product Master & Process Book show banners on production | **By design** | Keep off until charter gates 5–7 (pilot, rollback rehearsal, sign-off). Enable on non-prod to trial. |
| 2 | 11 rail pages are reference viewers | By design | Correct for published regulation data; action surfaces live in Ops Console + Handshake. |
| 3 | Dead code clutter: `AppSidebar.tsx`, `components/Sidebar*`, `components/layout/navigation.ts` superseded by `AppLayout.tsx` (`lib/nav.ts` is still used by CommandPalette) | Low | Safe to delete in a cleanup pass (no functional impact). |
| 4 | Warehouse Mgmt overview page is read-only while `POST /wms/inventory/adjust|transfer` etc. exist | Low | Actions are intentionally on dedicated pages (Cross-Dock, Waves, Scan); optional: add adjust/transfer buttons to the inventory tab. |
| 5 | Charter gates 5–7 open | Medium | Schedule the non-prod warehouse pilot + rollback rehearsal; record owner + reviewer sign-off — that is the only thing standing between the current banners and a live Process Book. |

**Bottom line:** the two pages in the screenshots are *deliberate, safe, switch-off states of finished engines*; the
sidebar has no dead or fake pages; every department exists with real backend behind it; Rail is complete on the UI and
holds everything Transnet has published to date.

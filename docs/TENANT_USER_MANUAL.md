# FlowOps Platform — Tenant User Manual

**Version 1.9.0 | Last updated: 10 November 2026**

*1.9.0 adds Claims, Warehouse Management, Delivery Notes, Carriers & Buy Rates,
Credit Control, Digital Payments, Disbursements and ESG & Carbon Reporting —
eight shipped surfaces that had no section at all — and renumbers the manual to
keep related topics together.*

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Waybill Management](#3-waybill-management)
4. [Claims](#4-claims)
5. [Collections & Pickups](#5-collections-pickups)
6. [Driver Dispatch & Tracking](#6-driver-dispatch-tracking)
7. [Manifests & Load Scanning](#7-manifests-load-scanning)
8. [Warehouse Management (WMS)](#8-warehouse-management-wms)
9. [Proof of Delivery (POD)](#9-proof-of-delivery-pod)
10. [Delivery Notes](#10-delivery-notes)
11. [Returns (RMA)](#11-returns-rma)
12. [Client Management](#12-client-management)
13. [Quotes & Rate Cards](#13-quotes-rate-cards)
14. [Carriers & Buy Rates](#14-carriers-buy-rates)
15. [Invoicing & Billing](#15-invoicing-billing)
16. [Credit Control & Receivables](#16-credit-control-receivables)
17. [Digital Payments](#17-digital-payments)
18. [COD Reconciliation](#18-cod-reconciliation)
19. [Disbursements](#19-disbursements)
20. [Accounting](#20-accounting)
21. [Communications](#21-communications)
22. [Route Optimization](#22-route-optimization)
23. [Fleet Maintenance](#23-fleet-maintenance)
24. [Freight Forwarding](#24-freight-forwarding)
25. [General Average](#25-general-average)
26. [Landed Cost & HS Codes](#26-landed-cost-hs-codes)
27. [ESG & Carbon Reporting](#27-esg-carbon-reporting)
28. [AI Features](#28-ai-features)
29. [Customer Portal & Tracking](#29-customer-portal-tracking)
30. [Settings & Configuration](#30-settings-configuration)
31. [User Roles & Permissions](#31-user-roles-permissions)
32. [Driver Portal (Mobile)](#32-driver-portal-mobile)
33. [Keyboard Shortcuts & Tips](#33-keyboard-shortcuts-tips)
34. [Troubleshooting & Support](#34-troubleshooting-support)

---


## 1. Getting Started

### 1.1 Logging In

1. Navigate to **https://app.flowop.work**
2. Enter your email address and password
3. Click **"Sign In"**

If you've forgotten your password, click **"Forgot Password"** and a reset link will be sent to your email.

### 1.2 First-Time Setup

When your company account is first approved, an admin will complete the **Onboarding Wizard**:

- Company name and trading name
- Address and contact details
- Logo upload and brand colours
- SLA thresholds (warning, breach, escalation times)

### 1.3 Navigation

The left sidebar contains all feature areas. What you see depends on your **role** (see Section 23). The sidebar is organised into sections:

- **Operations** — Dashboard, Shipments, Waybills, Collections, Dispatch
- **Finance** — Invoices, Quotes, Rate Cards, Billing, COD
- **Communications** — WhatsApp, Email, Client Queries
- **AI & Insights** — AI Control Tower, Ask FlowOps, Logistics Analytics
- **Admin** — Users & Roles, Settings, Integrations

---


## 2. Dashboard

Your central command view showing:

- **Live delivery count** — parcels in transit right now
- **Today's performance** — deliveries completed, collections made
- **SLA status** — at-risk deliveries flagged by the AI
- **Revenue snapshot** — invoiced amount this period
- **Activity feed** — real-time events (new waybills, status changes, driver updates)
- **Notifications** — alerts requiring your attention

### Quick Actions from Dashboard:

- Create a new waybill
- Schedule a collection
- View pending deliveries
- Check high-risk items

---


## 3. Waybill Management

### 3.1 Creating a Waybill

Navigate to **Waybills** → Click **"+ New Waybill"**

Required fields:
- **Sender** — name, phone, address
- **Recipient** — name, phone, address, email (optional)
- **Parcel details** — weight, dimensions, description
- **Amount** — total delivery charge
- **COD Amount** (if applicable) — cash to collect from recipient

A unique **tracking number** is generated automatically.

### 3.2 Waybill Inbox (AI-Powered Scanning)

Upload scanned waybill images or documents:

1. Go to **Waybill Inbox**
2. Click **"Upload"** or drag-and-drop files
3. The AI extracts sender, recipient, and parcel details automatically
4. Review the extracted data and **confidence scores**
5. Click **"Commit"** to create the waybill

Supported formats: PDF, JPG, PNG

### 3.3 Batch Scanning

For high-volume operations:
1. Navigate to **Waybills → Batch Scan**
2. Scan multiple barcodes in sequence
3. All waybills are updated in bulk

### 3.4 Bulk CSV Import

1. Go to **Waybills → Bulk Import**
2. Download the CSV template
3. Fill in your data
4. Upload and review the preview
5. Click **"Import All"**

### 3.5 Waybill Statuses

| Status | Meaning |
|--------|---------|
| PENDING | Created, awaiting collection |
| COLLECTED | Picked up from sender |
| IN_TRANSIT | On the way to recipient |
| OUT_FOR_DELIVERY | On the driver's manifest for today |
| DELIVERED | Successfully delivered (POD captured) |
| FAILED_DELIVERY | Delivery attempt unsuccessful |
| RETURNED | Returned to sender |
| CANCELLED | Waybill cancelled |

### 3.6 Risk Assessment

Each waybill has an AI-assigned risk level:
- **LOW** — Normal delivery, no concerns
- **MEDIUM** — Approaching SLA threshold
- **HIGH** — At risk of SLA breach
- **CRITICAL** — SLA breached, immediate action required

High-risk waybills appear in the **High Risk Queue**.

---


## 4. Claims

*Raised against a waybill — `/claims`.*

A claim is the formal record that something went wrong on a waybill and someone
owes for it. FlowOps keeps the whole life of a claim — what was claimed, who
carries the loss, what was approved, and what was settled — as an
**append-only history**. Nothing on a claim is edited away: a note, an
assessment or an approval adds an entry to the record rather than overwriting
the last one. When a client disputes an outcome, the history is the answer.

### 4.1 Claim types

`DAMAGE`, `LOSS`, `SHORTAGE`, `DELAY`, `THEFT`.

### 4.2 The workflow

| Step | What happens |
|---|---|
| **Raise** | A claim is opened against a waybill, with a claimed amount and an optional **liability cap** — the most this claim can ever pay out. |
| **Assess** | Record **who carries the loss** and on what basis. This is the decision, and it is kept separately from the amount. |
| **Approve** | Approve an amount. It can never exceed the claim, and never exceed the liability cap if one was set. |
| **Reject** | Reject with a reason — written to be shown to a client, not for internal shorthand. |
| **Withdraw** | Withdraw before settlement if the claim was raised in error. |
| **Settle** | Settling an approved claim raises a **draft** credit note. |

Notes can be appended at any point, and **evidence** — photos, the ePOD, the
manifest — can be attached as references so the file stands on its own.

### 4.3 The one thing to know about settling

**Settling raises a real credit note, and it does so exactly once.** Two people
settling the same claim at the same time — two browser tabs, or a retry racing a
slow request — will not produce two credit notes for one agreed payout. The
second attempt is refused by the database rather than by the interface, so it
holds even when the two requests overlap.

Approved credit notes are **drafts**. Nothing reaches the client's account until
a person issues it.

The **summary** at the top of the page shows open claims, the value at stake,
approved-but-unsettled amounts, and any SLA breaches.

---


## 5. Collections & Pickups

### 5.1 Scheduling a Collection

1. Navigate to **Collections** → **"+ New Collection"**
2. Enter client details (name, phone, address)
3. Set scheduled pickup date/time
4. Optionally assign a driver
5. Add notes for the driver

### 5.2 Collection Statuses

| Status | Meaning |
|--------|---------|
| PENDING | Scheduled, not yet assigned |
| ASSIGNED | Driver has been allocated |
| IN_PROGRESS | Driver is en route to pickup |
| COLLECTED | Successfully picked up |
| FAILED | Pickup attempt failed |
| CANCELLED | Collection cancelled |

### 5.3 Auto-Assignment

When a collection is created, FlowOps can automatically suggest the nearest available driver based on their last known GPS position.

---


## 6. Driver Dispatch & Tracking

### 6.1 Dispatch Console

The **Driver Dispatch** screen shows:
- All active drivers on a live map
- Their current status (Available, On Route, Offline)
- Unassigned shipments that need a driver
- One-click assignment via drag-and-drop

### 6.2 Assigning Deliveries

1. Select a shipment or waybill
2. Click **"Assign Driver"**
3. Choose from available drivers (sorted by proximity)
4. The driver receives the job on their Driver Portal app

### 6.3 Live Tracking

The **Live Tracking** map shows:
- Real-time GPS positions of all active drivers
- Colour-coded by status (green = available, blue = on route, grey = offline)
- Click a driver to see their current manifest and route
- ETA calculations for active deliveries

### 6.4 Driver Chat

Real-time messaging between dispatch and drivers:
- Send text messages and images
- View conversation history
- Notifications for unread messages

---


## 7. Manifests & Load Scanning

### 7.1 Creating a Manifest

A manifest groups waybills for a specific driver or route:

1. Go to **Manifests** → **"+ New Manifest"**
2. Select a branch (origin depot)
3. Add waybills to the manifest
4. Assign a driver
5. Click **"Dispatch"**

A manifest PDF is generated for the driver.

### 7.2 Load Scanning

Before dispatch, verify all parcels are loaded:

1. Open the manifest
2. Click **"Load Scan"**
3. Scan each parcel's barcode
4. The system flags any missing items
5. Confirm the load is complete

---


## 8. Warehouse Management (WMS)

*Requires the `waybillInbox` permission — `/warehouse`.*

The warehouse module tracks stock by location rather than by spreadsheet:
**warehouse → zone → bin**. Every movement is recorded against a bin, so "where
is this pallet" is a question the system answers rather than a walk around the
floor.

### 8.1 Setting up

1. **Create a warehouse** (`/wms/warehouses`).
2. **Add zones** to it — receiving, bulk, picking, dispatch, and so on.
3. **Add bins** to each zone. Bins can be added one at a time or in bulk, which
   is the faster route for a fit-out.

### 8.2 Day to day

- **Dashboard** — current state at a glance.
- **KPIs** — throughput and utilisation measures.
- **Inventory** — what is held, and **Inventory summary** for the totals.
- **AI insights** — the system flags patterns worth acting on (slow-moving
  stock, bins that are consistently over capacity). These are advisory: they
  raise a flag, they do not move stock.

---


## 9. Proof of Delivery (POD)

### 9.1 Capturing POD

When a driver delivers a parcel:

1. Driver opens the delivery on their portal
2. Captures **recipient signature** (on-screen)
3. Takes a **photo** of the delivered parcel
4. Records the **recipient name**
5. Submits POD — waybill status changes to DELIVERED

### 9.2 Viewing POD

- Navigate to any delivered waybill
- Click **"View POD"**
- See the signature image, photo, recipient name, and timestamp
- POD images are stored securely in the cloud

### 9.3 Customer Delivery Rating

After delivery, customers can rate their experience:
- An SMS/email/WhatsApp link is sent to the recipient
- They rate 1-5 stars with an optional comment
- Ratings appear on the waybill and the driver's leaderboard

---


## 10. Delivery Notes

*Requires the `driverDispatch` permission and the Delivery Notes feature —
`/delivery-notes`.*

A delivery note is the document that travels with the goods and is signed on
arrival. FlowOps stores it against the waybill, so the signed note, the ePOD and
the waybill are one record rather than three.

### 10.1 What you can do

Create a note, view it, amend it, delete it, and **resolve** it.

**Resolving** is the step that matters: it closes out a note that had a
discrepancy — a short delivery, a damaged item, a signature that was refused.
An unresolved note stays visible rather than being quietly forgotten, because an
unresolved discrepancy is usually a claim waiting to happen (see
§4).

Notes are also reachable by waybill (`/delivery-notes/waybill/:id`), so a
dispatcher looking at a specific delivery sees its paperwork without searching.

---


## 11. Returns (RMA)

### 11.1 Creating a Return

1. Navigate to **Returns** → **"+ New Return"**
2. Link to the original waybill (optional)
3. Enter customer details and pickup address
4. Select a reason (Damaged, Wrong Item, Not As Described, etc.)
5. Submit for approval

### 11.2 Return Workflow

```
REQUESTED → APPROVED → SCHEDULED → IN_TRANSIT → RECEIVED → INSPECTING → COMPLETED
```

### 11.3 Resolution Types

- **Refund** — money returned to customer
- **Replacement** — new item sent
- **Repair** — item fixed and returned
- **Restock** — item returned to inventory
- **Dispose** — item written off

---


## 12. Client Management

### 12.1 Client Directory

Manage your customer base:
- **Name, contact details, address**
- **Billing type** — COD, Prepaid, Contract, Cash
- **Credit limit** (for contract clients)
- **Payment terms** (net-30, net-60, etc.)
- **Account code** (for accounting integration)

### 12.2 Billing Types

| Type | Description |
|------|-------------|
| **COD** | Cash on Delivery — driver collects payment per waybill |
| **Prepaid** | Client pays before dispatch |
| **Contract** | Monthly invoiced account with credit terms |
| **Cash** | Walk-in / once-off payment |

---


## 13. Quotes & Rate Cards

### 13.1 Rate Cards

Set your pricing structure:
- **Zone-based pricing** — from zone to zone
- **Weight tiers** — min/max weight bands
- **Base price + per-kg rate**
- **Multiple currencies** (ZAR, USD, EUR, GBP)

### 13.2 Creating a Quote

1. Navigate to **Quotes** → **"+ New Quote"**
2. Enter from/to addresses
3. Enter parcel weight
4. The system auto-calculates the price from your rate cards
5. Set expiry date
6. Send to client

### 13.3 Accepting Quotes

When a client accepts a quote, it can be converted directly into a waybill.

---


## 14. Carriers & Buy Rates

*Requires the `rateCards` permission — `/carriers`.*

A **carrier** is a vendor you buy transport from. A **buy rate** is what that
carrier charges you on a given lane. Knowing your buy rate is what turns a
sell rate into a margin you can see.

### 14.1 Carriers

Create, view and update carriers.

### 14.2 Buy rates

Add a **buy-rate contract** to a carrier for a lane. Lanes are normalised, so
`CNSHA → ZADUR`, `cnsha->zadur` and `CNSHA-ZADUR` are recognised as the same
lane and group together — you do not have to police the typing.

### 14.3 Lane Rate Explorer

The explorer answers the question that is otherwise a spreadsheet exercise:
**for each lane, what is my best buy rate, and what is the spread** between it
and what I am selling at. It reports best buy-rate, spread and savings per lane,
which is where margin leakage becomes visible.

---


## 15. Invoicing & Billing

### 15.1 Creating an Invoice

1. Go to **Invoices** → **"+ New Invoice"**
2. Select client
3. Add line items (can auto-link waybills)
4. Set due date
5. Save as Draft or Send immediately

### 15.2 Invoice Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Being prepared |
| SENT | Sent to client |
| PAID | Payment received |
| OVERDUE | Past due date, unpaid |
| CANCELLED | Invoice voided |

### 15.3 AI-Assisted Invoicing

FlowOps can auto-generate invoice drafts based on:
- Delivered waybills in a date range
- Client-specific rate cards
- Billing batches (group by client/period)

### 15.4 Online Payment

Clients can pay invoices online via **Paystack** (card, EFT, or USSD). Payment status updates automatically.

### 15.5 Billing Batches

For high-volume operations, generate invoices in bulk:
1. Go to **Billing Batches**
2. Select date range and clients
3. FlowOps groups waybills by client
4. Review and approve batch invoices
5. Send all at once

---


## 16. Credit Control & Receivables

*Requires the `creditControl` permission — `/credit-control`.*

Credit control is about money that has been invoiced and not yet arrived. The
page is built around **ageing**: not "what is owed" but "what is owed, and how
late is it".

### 16.1 Reading the page

- **Outstanding** — invoiced, not yet paid.
- **Collected** — paid.
- **Collection rate** — the proportion of invoice value that has come in.
- **AR ageing** — what is overdue, bucketed by how far past due date it is.

Overdue invoices are marked as such, with **days past due** shown, so the follow
up list orders itself.

### 16.2 Acting on it

- **Record payment** — mark an invoice paid, which moves it out of the ageing
  buckets.
- **Send a reminder** — send the client a reminder on a specific invoice.

Both are per-invoice and deliberately manual: chasing an account is a judgement
call, and the system provides the list and the means rather than deciding who to
chase or when.

---


## 17. Digital Payments

*Requires the `invoices` permission and the Digital Payments feature —
`/digital-payments`.*

Records electronic payments taken against a waybill — card, EFT, mobile money,
QR code or cash — and reconciles them, so the money and the delivery are on the
same record.

### 17.1 Payment statuses

`PENDING` → `PROCESSING` → `SUCCESS`, or `FAILED` / `REFUNDED`.

A payment starts `PENDING` when created, moves to `PROCESSING` while the gateway
is working, and lands on `SUCCESS` once confirmed. It can be marked **failed**
or **refunded**.

### 17.2 What you can do

- **Create** a payment against a waybill, with an amount, currency and method.
- **Confirm** it once the gateway settles.
- **Mark failed** when a payment does not go through.
- **Refund** a payment that has been taken.
- **Look up** payments by waybill, or filter the list by status and method.
- **Stats** — totals and counts by status.

Each payment carries a **reference** of its own and an **external ID** for the
gateway's reference, which is what makes a reconciliation possible without
guessing which payment belongs to which collection.

---


## 18. COD Reconciliation

Track cash-on-delivery money across your fleet:

### 18.1 Driver Wallets

Each driver has a virtual wallet showing:
- **Total collected** — all COD cash collected
- **Total settled** — cash handed to the company
- **Current balance** — outstanding amount to remit

### 18.2 Settlement

When a driver remits collected cash:
1. Go to **COD** → Select driver
2. Record the settlement amount
3. Balance updates automatically
4. Full audit trail maintained

---


## 19. Disbursements

*Requires the Accounting feature and the `accounting` permission —
`/disbursements`.*

A **disbursement** is money you pay to an authority **on behalf of a client** and
recover from them later — SARS duties, port charges, shipping line fees. It is
not your cost and it is not your margin; it is a pass-through that has to be
tracked until it comes back.

Because it is a pass-through, the number that matters is not how much was paid
out but **how much is still outstanding**.

### 19.1 What the page shows

- **Outstanding / recovered totals** with **ageing** — how long a disbursement
  has been unpaid.
- **Recovery cockpit** — recovery rate, exposure per client, which disbursements
  still need an invoice, and a split by category.
- **List** — every disbursement.

A disbursement can be linked to an **invoice** (it must belong to the same
company), which is what turns an outstanding pass-through into something the
client is actually billed for.

---


## 20. Accounting

### 20.1 Credit Notes

Issue credit adjustments against invoices:
- Link to original invoice
- Add reason and line items
- Track applied vs outstanding credits

### 20.2 Debit Notes

Raise additional charges:
- Surcharges, detention fees, adjustments
- Link to original invoice

### 20.3 Accounting Integrations

Connect to external accounting software:
- **Xero** — two-way invoice sync
- **Sage** — two-way invoice sync
- **Pastel** — CSV/file export

Navigate to **Settings → Integrations** to connect.

---


## 21. Communications

### 21.1 WhatsApp Hub

Send and receive WhatsApp messages directly from FlowOps:
- View all customer conversations (threads)
- Send delivery notifications
- Receive queries and respond inline
- Auto-link messages to waybills

### 21.2 Email Hub

Manage operations emails:
- View inbound emails with AI categorisation
- Auto-detect collection requests, POD queries, quotes
- Respond directly from the platform
- Track read/resolved status

### 21.3 Client Queries

Centralised view of all customer service interactions:
- Filter by type (collection request, POD query, complaint)
- Assign to team members
- Track resolution time

---


## 22. Route Optimization

### 22.1 Optimising Routes

1. Navigate to **Route Optimizer**
2. Select the waybills/stops for optimisation
3. Click **"Optimise"**
4. FlowOps calculates the most efficient sequence
5. Review the suggested route on the map
6. Apply to the driver's manifest

The algorithm uses nearest-neighbour + 2-opt improvement to minimize total distance.

---


## 23. Fleet Maintenance

### 23.1 Vehicle Tracking

For each driver/vehicle:
- Current odometer reading
- Next service due (km or date)
- Vehicle registration and type
- Maintenance notes

### 23.2 Service Records

Log all vehicle services:
- Service type (Oil Change, Tyre Rotation, Annual Service)
- Cost and date
- Kilometres at service
- Notes

### 23.3 Driver Leaderboard

Track driver performance:
- Deliveries completed
- On-time percentage
- Customer ratings
- COD collection accuracy

---


## 24. Freight Forwarding

**Availability:** the Freight Forwarding add-on. **Access:** Admins only — every
forwarding page is admin-gated and requires the `freightForwarding` feature, so
dispatchers and drivers will not see these routes at all.

### 24.1 The Forwarding Console (`/forwarding`)

Your daily control tower. It opens on six KPIs:

| KPI | What it tells you |
|---|---|
| **Open files** | Shipment files not yet closed |
| **Arriving (7d)** | Files with an ETA inside the next seven days |
| **Customs pending** | Files with a declaration not yet released |
| **Demurrage est.** | Money accruing right now on containers past free time, with a count of how many are accruing |
| **Disbursed out** | Disbursements paid on your behalf and not yet recovered |
| **At risk** | Files carrying an open exception |

Below the KPIs sit three working lists: **Needs attention**, the **Arrivals
board**, and the **Customs queue**. The customs queue mirrors the declaration
lifecycle:

```
DRAFT  →  SUBMITTED  →  QUERY  →  REJECTED
                        ↓
                     RELEASED
```

A file in `QUERY` is waiting on *you* — SARS has asked for something. Files in
`REJECTED` need correcting and re-submitting.

Three buttons in the console header take you to the specialist pages: **SARS EDI
setup**, **SADC corridors**, and **General average**.

### 24.2 The Shipment File (`/forwarding/:id`)

One file per shipment. Depending on the mode and the lane, panels appear and
disappear — you only see what applies:

- **Vessel tracking** — ocean files only.
- **Cross-border fields** — origin and destination country, transit countries,
  vehicle registration, seal numbers, importer TIN (ZIMRA), and the shipper and
  consignee addresses.
- **Declaration** — the customs declaration, its status badge, a *Record SARS
  response* control, and a full transmission log so you can prove what was sent
  and when.
- **Demurrage** — per container, so you can see which box is costing you money.
- **Consolidation** — for consolidated (LCL) files.
- **Duty & VAT estimate** — an in-file ZAR estimate before the entry is
  assessed.
- **Documents** — generated from the file's own data, not re-typed.

### 24.3 Document templates

Documents are grouped by trading bloc. Generate the one the destination
country actually requires:

| Bloc | Templates |
|---|---|
| **Trade** | Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin |
| **Transport** | CMR Consignment Note, Dangerous Goods, Transit Bond |
| **SADC** | SA — SAD 500, Zimbabwe — Form 47, Mozambique — JUE, Botswana — BURS, SADC Declaration |
| **EAC** | Kenya — C17, Tanzania — TANCIS, Uganda — URA, Rwanda — RRA, DRC — DGDA, EAC Declaration |
| **ECOWAS** | Nigeria — SGD, Ghana — Bill of Entry, Ivory Coast — DGD, Senegal — GAINDE, ECOWAS Declaration |
| **Other** | Cameroon — SYDONIA, Ethiopia — ERCA |

### 24.4 Related pages

| Page | Path | Use it for |
|---|---|---|
| SARS EDI setup | `/forwarding/sars-edi` | Transmission credentials and configuration |
| SADC corridors | `/forwarding/sadc-corridors` | Border posts, corridors and port routing |
| General average | `/forwarding/general-average` | GA security, contributions and cargo release |


## 25. General Average

*Requires the Freight Forwarding add-on, Admins only — `/forwarding/general-average`.*

General average is the maritime rule that when part of the ship or cargo is
**deliberately** sacrificed to save the whole voyage — jettisoning cargo,
flooding a hold to fight a fire, paying for a tow — the loss is shared
proportionally by everyone whose property came through, under the
York-Antwerp Rules.

### 25.1 The part that surprises people

**Cargo that arrived undamaged still owes.** This is the single most common
misunderstanding, and it is the one that turns into a dispute when a client is
billed for a casualty that never touched their goods. The contribution is not
compensation for damage; it is a share of a sacrifice made for the common good.

**The shipowner holds a lien over all the cargo** until security is lodged.
Nothing is released — damaged or not — until each interest has provided security.
The page states this plainly whenever any cargo interest is still blocked.

### 25.2 Using the page

Two tabs:

- **Cargo interests** — who owes, what security has been lodged, and who is
  released versus blocked. The summary tells you how many interests are
  outstanding.
- **Award & settlement** — once the average adjuster publishes the award, the
  adjustment and the settlement of each interest.

Work the interests tab first: get security lodged so cargo can move, then settle
against the award when it lands.


## 26. Landed Cost & HS Codes

**These two tools are public.** They live at `/tools/landed-cost` and
`/tools/hs-codes`, need no login, and are safe to send to a client or to leave
open on a sales call.

### 26.1 Landed cost calculator (`/tools/landed-cost`)

Estimates South African import duty and VAT before you quote.

**Inputs:** customs value in ZAR, and a duty rate as a percentage. The duty rate
is pre-filled from the HS code you pick, but you can override it — do that the
moment you have confirmed the real line.

**How the maths works.** SARS does not charge VAT on the bare invoice value. It
charges VAT on the **Added Tax Value (ATV)**, which is the customs value plus a
10% upliftment plus the duty:

```
Customs value
  + 10% upliftment
  + duty
  = Added Tax Value (ATV)
VAT = 15% of ATV
Total payable = duty + VAT
```

Every step is shown on screen, so you can point a client at the line they are
questioning rather than defending a single number.

### 26.2 HS code lookup (`/tools/hs-codes`)

Search by code or by plain description — `8517`, `laptop`, `vehicles`, or
`trousers` all work. Useful for classifying goods before you price them, and for
settling the "what heading does this actually fall under" argument.

### 26.3 What these tools are not

Both results carry the same disclaimer, and it is worth reading:

> Indicative only. The binding rate depends on the full ten-digit code,
> preferential origin (SADC / EU / AfCFTA), rebate provisions and any
> anti-dumping or safeguard duty in force. Confirm with SARS or a licensed
> customs broker before quoting.

An estimate is a starting point for a quote, not a tariff ruling.


## 27. ESG & Carbon Reporting

*`/esg` — no additional permission or feature required.*

Estimates the carbon footprint of your fleet and reports it over time.

### 27.1 How the number is produced

Emissions are estimated per vehicle type using **kilograms of CO₂ per
kilometre**, sourced from the South African Department of Environmental Affairs
National GHG Inventory:

| Vehicle | kg CO₂ / km |
|---|---|
| Van (light delivery, diesel) | 0.21 |
| Truck (medium) | 0.29 |
| Motorbike | 0.08 |
| Car (sedan / hatchback) | 0.17 |
| Electric (BEV) | 0.00 — zero tailpipe |

### 27.2 What is on the page

- **Report** — the current period's footprint.
- **Trends** — how it moves over time, which is the part a client or a tender
  will ask for.
- **Refresh** — recompute on demand.

The report also **recomputes automatically every morning at 06:00**, so the
current month's figures are current without anyone remembering to run it.

### 27.3 Read these numbers as estimates

They are **estimates from published national averages**, not measurements from
your vehicles. They are the right figure for a directional view and for
reporting a trend. They are not the right figure for a verified disclosure, a
carbon tax submission, or anything with an audit attached — those need
measured fuel or telematics data.

## 28. AI Features

### 28.1 Ask FlowOps (AI Copilot)

Chat with the AI assistant:
- Ask operational questions ("How many deliveries were late this week?")
- Get recommendations ("Which driver should I assign to Sandton?")
- Generate reports and summaries

### 28.2 AI Control Tower

The AI monitors your operation 24/7:
- **SLA breach prediction** — flags at-risk deliveries before they fail
- **Anomaly detection** — unusual patterns in volumes, failures, or routes
- **Auto-escalation** — alerts the right people when thresholds are hit

### 28.3 CLAW Autopilot (Enterprise)

Autonomous operations engine that can:
- Auto-reassign stalled pickups
- Escalate pre-breach deliveries
- Flag COD mismatches
- Aggression levels: LOW, MEDIUM, HIGH

### 28.4 AI Support Agent

Self-service support chatbot:
- Answers common questions
- Guides users through workflows
- Escalates to human support when needed

---


## 29. Customer Portal & Tracking

### 29.1 Public Tracking Page

Share tracking links with customers:
- **https://app.flowop.work/track/TRACKING_NUMBER**
- Real-time status updates
- Map with driver location (when out for delivery)
- ETA estimation
- No login required

### 29.2 Booking Portal

Give clients a branded booking link:
1. Go to **Settings → Booking Portal Links**
2. Create a new link (with optional label and expiry)
3. Share with your client
4. They can submit collection/booking requests directly

### 29.3 Customer Delivery Rating

After delivery, send a rating request:
- Customer rates 1-5 stars
- Optional feedback note
- Ratings feed into driver leaderboards

---


## 30. Settings & Configuration

### 30.1 Company Settings

- Company name, address, VAT number
- Logo and brand colours
- Invoice header colour
- SLA thresholds (warning, breach, escalation minutes)

### 30.2 Branding

Customise the look of:
- Customer-facing tracking pages
- Booking portal
- Invoice headers
- WhatsApp number for click-to-chat

### 30.3 Notification Preferences

Per-user notification controls:
- Email / SMS / Push toggles
- Per-category settings (Operations, Billing, Security, System)
- Digest frequency (Instant, Daily, Weekly)
- Quiet hours

### 30.4 Integrations

Connect external services:
- **WhatsApp Business API** — automated messaging
- **Shopify / WooCommerce** — e-commerce order sync
- **Xero / Sage / Pastel** — accounting sync
- **Paystack** — online payments

---


## 31. User Roles & Permissions

### 31.1 Available Roles

| Role | Access Level |
|------|-------------|
| **Admin** | Full access to all features, settings, and user management |
| **Manager** | All operations + billing visibility, no user admin or settings |
| **Dispatch** | Shipments, waybills, collections, drivers, quotes, AI — no finance |
| **Warehouse** | Inbound/outbound goods, POD, waybill inbox, returns, risk queue |
| **Driver** | Dashboard, collections, POD deliveries, WhatsApp, notifications |
| **Viewer** | Read-only access to dashboard and basic shipment info |

### 31.2 Managing Users

Admin only:
1. Go to **Users & Roles**
2. Click **"+ Invite User"**
3. Enter email, name, and role
4. They receive an email invitation to set up their account

### 31.3 Custom Permissions

Admins can override the default role permissions per user:
- Navigate to the user's profile
- Toggle individual feature access on/off
- Save — changes take effect immediately

---


## 32. Driver Portal (Mobile)

### 32.1 Accessing the Driver Portal

Drivers use a separate app at **https://driver.flowop.work**

- Login via **phone number + 4-digit PIN**
- Installable as a PWA (works like a native app)
- Works offline with sync when back online
- Only one active session per driver (security)

### 32.2 Driver Features

- View assigned deliveries for today
- Navigate to delivery address
- Capture POD (signature + photo)
- Record COD collection
- Chat with dispatch in real-time
- View their delivery history and leaderboard ranking

---


## 33. Keyboard Shortcuts & Tips

| Shortcut | Action |
|----------|--------|
| Click company logo | Return to Dashboard |
| `/` in search | Focus search bar |
| `Ctrl + N` | New waybill (from waybills page) |

### Pro Tips:

- **Bookmark the tracking URL format** — `https://app.flowop.work/track/XXXXX` — to quickly share with customers
- **Use the WhatsApp Hub** to reply to customer queries without leaving FlowOps
- **Check the High Risk Queue** at the start of each day to proactively prevent SLA breaches
- **Use Billing Batches** instead of creating invoices one-by-one for contract clients

---


## 34. Troubleshooting & Support

### Common Issues

| Problem | Solution |
|---------|----------|
| Can't see a menu item | Check your role permissions with your admin |
| "Feature not available on your plan" | Contact your company admin to upgrade |
| Driver not showing on map | Ensure their app is open and GPS is enabled |
| Invoice not syncing to Xero | Check Settings → Integrations for connection status |
| Waybill scan not extracting data | Ensure the image is clear and well-lit |

### Getting Help

- **AI Support Agent** — Click "Support" in the sidebar for instant AI help
- **Email** — noreply@flowop.work
- **Platform Status** — https://app.flowop.work/status

---

## Subscription Plans

| Feature | Starter (Free) | Professional | Enterprise |
|---------|:-:|:-:|:-:|
| Waybills & Collections | Unlimited | Unlimited | Unlimited |
| Drivers | Up to 5 | Unlimited | Unlimited |
| Live Tracking | Basic | Advanced | Advanced |
| Route Optimization | - | Yes | Yes |
| WhatsApp Hub | - | - | Yes |
| Email Hub | - | - | Yes |
| AI Control Tower | - | - | Yes |
| Ask FlowOps (Copilot) | - | - | Yes |
| CLAW Autopilot | - | - | Yes |
| Freight Forwarding | - | - | Yes |
| Returns (RMA) | - | Yes | Yes |
| COD Reconciliation | - | Yes | Yes |
| Accounting Integration | - | - | Yes |
| SSO (Okta/Azure AD) | - | - | Yes |
| Logistics Analytics | - | - | Yes |
| Custom Branding | - | Yes | Yes |

---

**FlowOps** — Intelligent Logistics Management

*Built in South Africa for Africa's courier and delivery industry.*

**https://flowop.work**

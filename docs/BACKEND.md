# FlowOps Backend

NestJS 10 + Prisma 5 + PostgreSQL 16 + Redis 7 + Socket.IO

## Quick start (local dev)

```bash
cd backend

# 1. Install deps
npm install

# 2. Copy and fill in env vars (see sections below for WhatsApp + Paystack)
cp .env.example .env
# edit .env — at minimum set DATABASE_URL, JWT_SECRET, OWNER_SEED_PASSWORD

# 3. Start a local Postgres + Redis
docker compose up postgres redis -d     # from repo root

# 4. Run migrations + seed
npx prisma migrate dev
# Owner account is created automatically on first boot using OWNER_SEED_EMAIL/PASSWORD

# 5. Start the dev server
npm run start:dev
# API:    http://localhost:3000
# Swagger: http://localhost:3000/docs
```

## Environment variables

See `backend/.env.example` for the full list with comments.

### Two switches worth knowing before a release

**`WAYBILL_TRANSITION_MODE`** (`strict` | `warn` | `off`, default **strict**)
— the waybill lifecycle is enforced by one state machine
(`src/waybills/waybill-status.machine.ts`). In strict mode an illegal status
move is refused *before* any write and recorded as an audit row
(`waybill.transition_rejected`) with the attempted pair and the calling source;
`warn` logs and allows (for a live incident only), `off` is silent. The legacy
boolean `WAYBILL_STRICT_TRANSITIONS` still works (`true` → strict, `false` →
warn) — migrate it off.

**`DRIVER_REQUIRE_DOCUMENTS`** (`true` | `false`, default **false**) — when on,
a driver with a *missing* licence, insurance or background-check date cannot be
dispatched (expired/invalid documents, a compliance hold and an overdue service
always block, regardless of this flag). Roll it on per tenant once the fleet is
documented:

```bash
GET   /api/v1/compliance/drivers          # summary.documentCoveragePercentage,
                                          # summary.readyToRequireDocuments
PATCH /api/v1/compliance/drivers/:id      # { licenseExpiry, insuranceExpiry, … }
```

`readyToRequireDocuments === true` means every driver in the fleet has all three
documents on file — that is the moment to flip the flag. Every evidence change
is audited (`driver.compliance_evidence_updated`) with before/after values, and
a compliance hold requires a reason.

---

## Setting up WhatsApp (Meta Cloud API)

**Prerequisites:** A Meta Business account + a WhatsApp Business Account (WABA).

### Step 1 — Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com/apps/) → **Create App**
2. Choose **Business** as the app type
3. Add the **WhatsApp** product to your app

### Step 2 — Get your credentials

In your app → **WhatsApp → API Setup**:

| Env var | Where to find it |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | The numeric ID next to your phone number (e.g. `123456789012345`) |
| `WHATSAPP_ACCESS_TOKEN` | Generate a **permanent** token (see below) |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic → **App Secret** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Any random string you choose — used to verify your webhook |

**Generating a permanent system-user token:**
1. Business Manager → Business Settings → **System Users**
2. Create a system user with **Employee** role
3. Add assets: your WhatsApp Business Account → grant access
4. **Generate New Token** → select `whatsapp_business_messaging` + `whatsapp_business_management`
5. Copy the token — it won't be shown again

### Step 3 — Register your webhook

In Meta Developer Portal → WhatsApp → **Configuration → Webhook**:

- **Callback URL:** `https://your-domain.com/api/v1/whatsapp/webhook`
- **Verify token:** same as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your .env
- **Subscribe to:** `messages`, `message_deliveries`, `message_reads`

> For local testing, use [ngrok](https://ngrok.com/): `ngrok http 3000`  
> Then use the ngrok HTTPS URL as your webhook callback.

---

## Setting up Paystack

### Step 1 — Get your API keys

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com)
2. Settings → **API Keys & Webhooks**
3. Copy your keys:

| Env var | Key |
|---|---|
| `PAYSTACK_SECRET_KEY` | `sk_test_...` (test) or `sk_live_...` (production) |
| `PAYSTACK_PUBLIC_KEY` | `pk_test_...` or `pk_live_...` — also used in the frontend |

> **Test mode is active** on your account (Flowops Holdings, ID: 1839930).  
> Use `sk_test_` / `pk_test_` keys while developing. Switch to live keys for production.  
> Test card: `4084084084084081`, any future expiry, any CVV.

### Professional plan — already created

| Plan | Amount | Interval | Plan code | Notes |
|---|---|---|---|---|
| Starter | ZAR 0 | Free | — | No Paystack. Instant activation. |
| Professional | ZAR 19,999 | Monthly | `PLN_l3kobthzahnkpf3` | Paystack subscription |
| Enterprise | Custom | Monthly | `PLN_9at9kn2ra8jtae0` | Contact sales (asking R250,000/mo) |

All plan codes are wired into `getPlans()` in `owner.service.ts`. The `createSubscription()` method maps plan codes back to tier names automatically.

**To activate the free Starter plan (instant, no billing):**
```bash
curl -X POST http://localhost:3000/api/v1/paystack/subscribe \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"planId": "starter"}'
# Returns: { plan: 'starter', message: 'Switched to Starter plan (free)...' }
# If downgrading from a paid plan, pass the subscription code to cancel it:
# -d '{"planId": "starter", "activeSubscriptionCode": "SUB_xxxx"}'
```

**To subscribe to Professional (ZAR 19,999/month):**
```bash
curl -X POST http://localhost:3000/api/v1/paystack/subscribe \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"planCode": "PLN_l3kobthzahnkpf3"}'
```

**To subscribe to Enterprise (Custom pricing — contact sales, asking ZAR 250,000/month):**
```bash
curl -X POST http://localhost:3000/api/v1/paystack/subscribe \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"planCode": "PLN_9at9kn2ra8jtae0"}'
```

**To add more plans later** (e.g. Starter paid / Enterprise):
```bash
curl -X POST http://localhost:3000/api/v1/paystack/plans \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Enterprise","amount":499900,"interval":"monthly","description":"Custom enterprise pricing"}'
# Returns the new plan with its plan_code — add to getPlans() in owner.service.ts
```

### Step 2 — Configure your webhook

In Paystack Dashboard → Settings → **API Keys & Webhooks**:

- **Test Webhook URL:** `https://your-ngrok-or-domain.com/api/v1/paystack/webhook`
- **Test Callback URL:** `https://your-ngrok-or-domain.com/payment/callback` *(optional — redirect after card payment)*

> For local testing: `ngrok http 3000`, then use `https://<ngrok-id>.ngrok-free.app/api/v1/paystack/webhook`

Events to subscribe to: `charge.success`, `invoice.payment_failed`, `subscription.create`, `subscription.not_renew`

After saving the webhook URL, Paystack will POST all payment events to your backend — the `handleWebhookEvent()` method processes them automatically.
1. **HMAC-SHA512** of the raw body with your `PAYSTACK_SECRET_KEY`
2. **IP allowlist** (Paystack only sends from `52.31.139.75`, `52.49.173.169`, `52.214.14.220`)

### Step 3 — Test a payment

```bash
# Initialize a payment
curl -X POST http://localhost:3000/api/v1/paystack/initialize \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","amount":10000,"description":"Invoice INV-2024-0001"}'
# Returns { authorizationUrl, reference }

# Open authorizationUrl in a browser, complete with test card
# Then verify:
curl http://localhost:3000/api/v1/paystack/verify/<reference> \
  -H "Authorization: Bearer <your_jwt>"
```

---

## API overview

| Module | Base path | Key endpoints |
|---|---|---|
| Auth | `/api/v1/auth` | POST login, register, refresh, logout, owner-login |
| Companies | `/api/v1/companies` | CRUD + my-company, logo upload, SLA settings |
| Users | `/api/v1/users` | CRUD per company |
| Drivers | `/api/v1/drivers` | CRUD + location update |
| Waybills | `/api/v1/waybills` | CRUD + inbox AI extraction, POD recording, public view |
| Collections | `/api/v1/collections` | CRUD + auto-suggest driver |
| Shipments | `/api/v1/shipments` | Live tracking, risk assessment |
| Manifests | `/api/v1/manifests` | CRUD + linehaul, receive |
| Invoices | `/api/v1/invoices` | CRUD + drafts + AI assist, Paystack payment init |
| Rate Cards | `/api/v1/rate-cards` | CRUD + calculate |
| Quotes | `/api/v1/quotes` | Create (auto-priced) + accept |
| Notifications | `/api/v1/notifications` | List + mark read, preferences |
| Dashboard | `/api/v1/dashboard` | Metrics, activity feed |
| WhatsApp | `/api/v1/whatsapp` | Send, threads, messages, webhook |
| Paystack | `/api/v1/paystack` | initialize, verify, subscribe, cancel, plans, webhook |
| AI | `/api/v1/ai` | Copilot, events, supervisor, email hub |
| Owner | `/api/v1/owner` | Tenant management, platform metrics, **commercial standing** (see below) |
| Compliance | `/api/v1/compliance` | `GET /drivers` (fleet compliance report), `GET /drivers/:id`, `PATCH /drivers/:id` (record evidence: expiry dates, hold), `PATCH /drivers/:id/hold` |
| Rail | `/api/v1/rail` | Slot applications, corridor envelope, compliance documents, **corridor capacity** (see below) |
| Storage | (internal) | Cloudflare R2 upload/download |

### Owner: commercial standing

The owner console has always shown what a tenant is **doing** — MRR, waybills,
drivers, delivery rates. It never showed where the relationship **stands**:
whether the tenant is being courted, is happy, is at risk, or is leaving. That
judgement lived in someone's head and in Slack threads, so it evaporated
whenever that person was unavailable.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/owner/tenants-commercial` | Every tenant's standing, for the console list |
| GET | `/api/v1/owner/tenants/:id/commercial-summary` | One tenant: status, notes, counts, latest quote/invoice |
| POST | `/api/v1/owner/tenants/:id/commercial-notes` | Record what was said. Body: `{ note, tags[] }` |
| POST | `/api/v1/owner/tenants/:id/status` | Set the standing. Body: `{ status, reason }` |
| POST | `/api/v1/owner/tenants/:id/subscription-override` | Grant features or a negotiated price |
| POST | `/api/v1/owner/tenants/:id/quotes` | Raise a quote on the tenant's behalf |
| POST | `/api/v1/owner/tenants/:id/invoices` | Raise an invoice on the tenant's behalf |

Statuses: `PROSPECT`, `ONBOARDING`, `ACTIVE`, `AT_RISK`, `RENEWAL_DUE`,
`CHURNING`, `CHURNED`, `DORMANT`.

Three rules worth knowing before changing any of this:

- **A status without a reason is refused.** Six months later `AT_RISK` on its
  own tells the next person nothing — the reason is the entire value, so it is
  required rather than optional.
- **Commercial notes are owner-only.** There is deliberately no tenant-scoped
  read path. `createdByEmail` is stored as a string, not a relation, so
  deleting an owner account cannot erase what was said to a customer.
- **Quotes and invoices are always filed against the tenant in the URL**, never
  a `companyId` from the request body. Invoice numbering and totals are
  delegated to `InvoicesService.create()` so they stay server-authoritative in
  the one place that already owns them.

Nothing is backfilled: a tenant nobody has classified yet has **no** status,
which is a different fact from a status of "none".

### Rail: corridor capacity

Slot applications ask for `trainsPerWeek` on a corridor over a window, and the
lifecycle runs right through to `ALLOCATED`. What never existed was any notion
of how much the corridor could carry — the only signal that a corridor was
over-committed was `conflictNote`, free text written by a human who happened to
notice. Two applications could sit in `ALLOCATED` on the same corridor over the
same dates and nothing would object.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/rail/slots/capacity` | Capacity statements for one corridor, or all |
| GET | `/api/v1/rail/slots/capacity/preview` | Headroom over a window: `?corridorCode=&from=&until=&trainsPerWeek=` |
| PUT | `/api/v1/rail/slots/capacity` | Create or replace a statement for a corridor and period |
| DELETE | `/api/v1/rail/slots/capacity/:id` | Remove a statement |

Verdicts: `OK`, `TIGHT` (above 90% utilisation), `OVERSUBSCRIBED` (above 100%),
`UNKNOWN` (no statement covers the period).

Four rules worth knowing before changing any of this:

- **It never blocks a submission.** The infrastructure manager decides what is
  allocated, and applying for more than you expect to be granted is legitimate.
  FlowOps records and surfaces; it does not refuse. The verdict is snapshotted
  onto the application at submission as `capacityCheckStatus` / `capacityCheck`
  so the decision can be reviewed against the headroom that existed.
- **A route's ceiling is its bottleneck section, never the sum of its
  sections.** A train path occupies one slot on *every* section it traverses, so
  a 30-section route does not have thirty times the capacity of one section.
  `railCapacityAnalysis.ts` derives it that way over the published Annexure 33b
  data, and the backend follows the same rule.
- **Practical, not theoretical.** Capacity is stored as theoretical x a stored
  capacity factor (default 0.65), because a timetable at 100% of theoretical is
  one delay away from collapse. The factor is stored, not assumed, so a later
  recompute is auditable. The practical figure is always derived server-side —
  a caller cannot send one that contradicts the theoretical figure.
- **Possessions are reported, never deducted.** What a possession costs depends
  on whether it is a full closure or single-line working. Subtracting a guessed
  amount would be a guess dressed up as arithmetic.

Tenant-scoped by design: FlowOps can see no other operator's applications and
must not imply knowledge of what has been allocated to them, so the check
measures this operator's own commitments. A corridor with no statement returns
`UNKNOWN` rather than a number nobody can stand behind, and an unsourced figure
stays `SOURCE_PENDING` until it is cited.

Full interactive docs: `GET http://localhost:3000/docs` (Swagger UI, non-production only)

---

## Database migrations

**Validate the schema before you commit it:**

```bash
npm run prisma:validate
```

This runs Prisma's own WASM schema engine — no network, no query engine, so it
works offline and locally. It is the only local check that actually validates
the datamodel. `npm run prisma:stub` (which builds the offline client used for
`tsc` and jest) parses the schema with regex and deliberately validates
**nothing**, so a malformed schema passes every local check and only surfaces in
CI at `prisma generate`. CI runs `prisma:validate` too.

One trap this catches: **Prisma supports only `//` and `///` comments.** A
`/* */` block comment is valid TypeScript, invisible to `tsc`, eslint and the
stub, and fails `prisma generate` with `P1012: This line is invalid`.

```bash
# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Apply migrations in production (runs automatically in Docker CMD)
npx prisma migrate deploy

# Reset DB (dev only — destructive)
npx prisma migrate reset

# Open Prisma Studio (visual DB browser)
npx prisma studio
```

---

## Real-time events (Socket.IO)

The frontend connects using:
```ts
const socket = io(FLOWOPS_WS_ORIGIN, {
  auth: { token: accessToken },
});
socket.emit('joinCompanyDashboard', { companyId });
```

Events emitted to company rooms:
- `waybill-inbox-changed` — new file uploaded to inbox
- `inbox-item-status-changed` — extraction status update
- `shipment-status-changed` — shipment status/location update
- `dispatch-assigned` — driver assigned to collection
- `driver-location-updated` — driver GPS update
- `risk-score-updated` — waybill risk recalculated
- `auto-invoice-completed` — batch invoice generated
- `system-ui-heal` — watchdog event

---

## Architecture notes

### Multi-tenancy
Every domain entity has a `companyId` foreign key. JWT tokens embed `companyId`, and services filter all queries by it. Platform owner tokens use a separate JWT strategy (`jwt-owner`) and separate DB table (`owner_users`).

### WhatsApp + multi-tenant
The current implementation maps all inbound WhatsApp messages to the first active company. For true multi-tenant WhatsApp, each company needs its own WABA and phone number — wire `WHATSAPP_PHONE_NUMBER_ID` → `companyId` mapping when you scale to multiple tenants.

### Paystack currency
Amounts are stored in ZAR (Rand). Paystack expects amounts in **kobo/cents** (multiply by 100 before sending to Paystack). The service handles this automatically.

### File storage
All files (waybill scans, POD signatures/photos, company logos) are stored in Cloudflare R2. The backend uploads via the S3-compatible API and returns either a public URL (for public-access buckets) or a time-limited pre-signed URL.

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
| Professional | ZAR 14,999 | Monthly | `PLN_l3kobthzahnkpf3` | Paystack subscription |
| Enterprise | ZAR 29,999 | Monthly | `PLN_9at9kn2ra8jtae0` | Paystack subscription |

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

**To subscribe to Professional (ZAR 14,999/month):**
```bash
curl -X POST http://localhost:3000/api/v1/paystack/subscribe \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"planCode": "PLN_l3kobthzahnkpf3"}'
```

**To subscribe to Enterprise (ZAR 29,999/month):**
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
| Owner | `/api/v1/owner` | Tenant management, platform metrics |
| Storage | (internal) | Cloudflare R2 upload/download |

Full interactive docs: `GET http://localhost:3000/docs` (Swagger UI, non-production only)

---

## Database migrations

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

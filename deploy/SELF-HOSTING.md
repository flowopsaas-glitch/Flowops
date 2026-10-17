# Self-Hosting FlowOps (On-Premise)

FlowOps can run **entirely on your own hardware** — a VPS, an office server, or
an air-gapped on-prem box — with **no dependency on any external cloud service**.
The bundled `docker-compose.yml` ships its own PostgreSQL and Redis. A normal
install needs Docker and four independent core secrets; enterprise SSO uses one
additional stable encryption key.

This is the deployment story for customers who will not (or cannot) run in the
public cloud: data stays on their infrastructure, behind their firewall.

> Prefer a managed VPS with a public domain + Cloudflare tunnel instead? See
> [`VPS-RUNBOOK.md`](./VPS-RUNBOOK.md). This guide is for the pure self-hosted case.

---

## 1. Requirements

- A 64-bit Linux host (2 vCPU / 4 GB RAM is comfortable for a single branch)
- **Docker Engine 24+** and the **Docker Compose plugin** (`docker compose version`)
- Outbound internet **only** for the initial image build/pull. After that the
  core platform runs offline.

## 2. One-time setup

```bash
# 1. Get the code onto the server
git clone https://github.com/flowopsaas-glitch/Flowops.git
cd Flowops

# 2. Create your environment file from the self-hosted template
cp .env.selfhosted.example .env

# 3. Generate four independent core secrets and paste each into .env
openssl rand -base64 36   # -> POSTGRES_PASSWORD
openssl rand -base64 36   # -> JWT_SECRET
openssl rand -base64 36   # -> JWT_REFRESH_SECRET (must differ from JWT_SECRET)
openssl rand -base64 36   # -> OWNER_SEED_PASSWORD

# Optional: generate this only if you will enable enterprise OIDC SSO
openssl rand -base64 32   # -> SSO_SECRET_ENCRYPTION_KEY
```

Set all four core values in `.env`; use a different generated value for every
secret. `OTP_HMAC_SECRET` is optional; set it to a separate 32-byte random
value (`openssl rand -hex 32`) for independent OTP key material. If left blank,
the API derives an OTP-only key from `JWT_SECRET` using HMAC domain separation.

`SSO_SECRET_ENCRYPTION_KEY` is optional unless you enable enterprise OIDC SSO.
It must encode exactly 32 bytes (base64 or 64-character hex), must remain stable
across restarts/upgrades, and must be backed up separately from the database.
Losing or rotating it makes already-encrypted IdP client secrets undecryptable;
re-enter those secrets in **Settings → SSO** after a planned key change. Set
`API_PUBLIC_URL` to the public HTTPS backend URL, including `/api/v1`, before
configuring SSO. When the integrity migration is applied, legacy plaintext IdP
client secrets are cleared; tenant admins must re-enter them after setting this
key.

## 3. First launch on a new, empty database

The API container does **not** change the database schema during startup. For a
fresh install, build the API image, start PostgreSQL/Redis, apply the checked-in
Prisma migrations once, then start the application:

```bash
docker compose build api
docker compose up -d postgres redis
# Wait until postgres is healthy (`docker compose ps`), then:
docker compose run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy
docker compose up -d frontend api
```

This creates and starts four containers on a private Docker network:

| Service    | Role                                | Exposed |
|------------|-------------------------------------|---------|
| `frontend` | Web UI + nginx reverse proxy        | `:8080` (host) |
| `api`      | NestJS backend (`/api/v1`)          | internal only |
| `postgres` | Bundled database (persistent volume)| internal only |
| `redis`    | Bundled cache/queue (persistent)    | internal only |

Schema creation is an explicit deployment step, not an application-startup
side effect. Keep the migration history with the database and verify the API
starts healthy after applying it. Do not substitute `prisma db push` for these
migrations.

Browse to **`http://SERVER_IP:8080`** and sign in as the owner:

- Email: `owner@flowops.local` (or your `OWNER_SEED_EMAIL`)
- Password: your `OWNER_SEED_PASSWORD`

## 4. Verify health

```bash
docker compose ps                                  # all services "healthy"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/        # 200
```

## 5. Backups (data lives in named volumes)

```bash
# Database dump
docker compose exec postgres pg_dump -U flowops flowops > flowops-$(date +%F).sql

# Restore
cat flowops-2026-06-25.sql | docker compose exec -T postgres psql -U flowops flowops
```

The Postgres data and Redis append-only file persist in the `postgres-data` and
`redis-data` Docker volumes across restarts and rebuilds.

## 6. Upgrades

Back up PostgreSQL and Redis before every upgrade. For a database whose
`_prisma_migrations` history matches this repository, build the new API image,
apply pending migrations, then start the new application:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > flowops-before-upgrade.sql
git pull
docker compose build api
docker compose run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy
docker compose up -d --build
```

**Do not run `migrate deploy` blindly against a database previously initialized
with `prisma db push` or one with missing/unknown migration history.** Stop and
use the project's reviewed migration-adoption/rehearsal procedure for that
existing database; do not run `db push`, `migrate dev`, or manually mark a
baseline as a substitute. The integrity-hardening migration intentionally
stops if it finds duplicate billing/provenance links or cross-company
references; reconcile those records explicitly before retrying. It also clears
legacy plaintext OIDC client secrets, which tenant admins must re-enter after
`SSO_SECRET_ENCRYPTION_KEY` is configured.

## 7. Putting it behind HTTPS / a domain (optional)

The frontend container listens on `:8080`. To serve it on a domain with TLS,
point a reverse proxy (nginx/Caddy/Traefik) or a Cloudflare tunnel at
`http://127.0.0.1:8080`, then set `APP_URL` and `CORS_ORIGINS` in `.env` to your
HTTPS URL and re-run `docker compose up -d`.

## 8. Optional integrations

Email (SendGrid), WhatsApp (Meta Cloud API), file storage (Cloudflare R2/S3) and
payments (Paystack) are **off by default** and the platform runs fine without
them. Fill in the matching keys in `.env` and restart to enable any of them — see
the commented section in `.env.selfhosted.example`.

---

**That's it.** A complete, self-contained FlowOps instance — courier ops, AI
control tower, returns/RMA, billing — running on your own server, with schema
changes applied explicitly and secrets managed by the operator.

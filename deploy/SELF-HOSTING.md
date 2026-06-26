# Self-Hosting FlowOps (On-Premise)

FlowOps can run **entirely on your own hardware** — a VPS, an office server, or
an air-gapped on-prem box — with **no dependency on any external cloud service**.
The bundled `docker-compose.yml` ships its own PostgreSQL and Redis, so a working
install needs nothing more than Docker and three secrets.

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

# 3. Generate three strong secrets and paste them into .env
openssl rand -base64 36   # -> POSTGRES_PASSWORD
openssl rand -base64 36   # -> JWT_SECRET
openssl rand -base64 36   # -> OWNER_SEED_PASSWORD
```

Edit `.env` and set at minimum `POSTGRES_PASSWORD`, `JWT_SECRET`, and
`OWNER_SEED_PASSWORD`. Everything else has safe defaults.

## 3. Launch

```bash
docker compose up -d --build
```

This builds and starts four containers on a private Docker network:

| Service    | Role                                | Exposed |
|------------|-------------------------------------|---------|
| `frontend` | Web UI + nginx reverse proxy        | `:8080` (host) |
| `api`      | NestJS backend (`/api/v1`)          | internal only |
| `postgres` | Bundled database (persistent volume)| internal only |
| `redis`    | Bundled cache/queue (persistent)    | internal only |

The backend runs `prisma db push` on startup, so the schema (including the
Returns/RMA tables) is created automatically — no manual migration step.

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

```bash
git pull
docker compose up -d --build      # rebuilds; db push applies any new columns
```

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
control tower, returns/RMA, billing — running on your own server with one
command and three secrets.

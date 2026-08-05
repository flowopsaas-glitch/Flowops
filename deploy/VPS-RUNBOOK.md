# FlowOps — VPS Runbook (Webway / any Ubuntu VPS)

The single source of truth for deploying and operating FlowOps on one VPS.
Standardises on **one Docker Compose stack** — one backend, one database,
one frontend. No PM2-on-host + compose mixing (that caused parallel
backends/DBs in dev).

---

## 1. Architecture

```
                        ┌──────────────────────────────────────────┐
 Internet ──Cloudflare──┤  cloudflared tunnel on the VPS           │
                        └──────────────────────────────────────────┘
   app.flowop.work      ─────────────────►  http://localhost:8080
   platform.flowop.work ─────────────────►  http://localhost:8080
   api.flowop.work       (optional/direct) ► http://localhost:8080  (same nginx; /api/* proxied)
   driver.flowop.work   ─────────────────►  http://localhost:8083  (driver PWA container)

   ┌──────────── docker compose: project "flowops" ────────────┐
   │  frontend (nginx + SPA)   127.0.0.1:8080 -> :80            │
   │     location /         -> SPA                              │
   │     location /api/      -> http://api:3000   (same-origin) │
   │     location /socket.io/-> http://api:3000                 │
   │  api (NestJS)           internal :3000  (no host port)     │
   │  postgres               internal :5432  vol: postgres-data │
   │  redis                  internal :6379  vol: redis-data    │
   └────────────────────────────────────────────────────────────┘
```

**Key invariant:** the browser only ever talks to the **frontend** origin.
The SPA calls **`/api/v1/*`** (relative, same-origin); nginx proxies it to the
`api` service. No cross-origin, no CORS headaches, no second backend.

---

## 2. One-time VPS setup

### Fast path (recommended) — one bootstrap script

```bash
git clone https://github.com/flowopsaas-glitch/Flowops.git ~/FlowOps && cd ~/FlowOps
./deploy/vps-bootstrap.sh app.flowop.work   # installs Docker, creates .env,
                                            # generates secrets, wires the domain
nano .env                                   # fill OWNER_SEED_*, GROQ_API_KEY, etc.
# point the Cloudflare tunnel:  <domain> -> http://localhost:8080
./deploy/vps-deploy.sh --seed               # first deploy (with demo data)
```

`vps-bootstrap.sh` auto-generates `POSTGRES_PASSWORD` / `JWT_SECRET` /
`JWT_REFRESH_SECRET`, sets `APP_URL` / `CORS_ORIGINS` / `API_PUBLIC_URL` /
`VITE_CANONICAL_HOSTS` from the domain, and keeps `VITE_API_URL=/api/v1`. You
only fill in the API keys it lists. It never overwrites an existing `.env`.

> **GROQ_API_KEY matters:** it unlocks *all* AI — copilot, CLAW chat, the
> competitive-intel sweep, the **AI Support Agent** and **Courier
> orchestration**. The compose `api` service now forwards it (and Tavily,
> GitHub, accounting, geocoding keys) into the container, so these work under
> compose — not just on a PM2-on-host backend.

### Manual path (equivalent, step by step)

```bash
# 2.1 Docker + Compose v2
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"     # log out/in after this

# 2.2 Clone the repo
git clone https://github.com/flowopsaas-glitch/Flowops.git ~/FlowOps
cd ~/FlowOps

# 2.3 Create the real .env (root) from the template and fill in secrets
cp .env.production.example .env
#   Generate strong secrets:
#     openssl rand -hex 32   # for JWT_SECRET / JWT_REFRESH_SECRET / POSTGRES_PASSWORD
#   MUST set: POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET,
#             OWNER_SEED_EMAIL, OWNER_SEED_PASSWORD,
#             CORS_ORIGINS + APP_URL + API_PUBLIC_URL (your domain),
#             GROQ_API_KEY (unlocks all AI features)
#   For a NON-flowop.work domain also set VITE_CANONICAL_HOSTS=<your-domain>
#             and VITE_INTEGRITY_BEACON_URL=https://<your-domain>/api/v1
#   MUST keep: VITE_API_URL=/api/v1   (NOT /api — see §6)

# 2.4 Cloudflare tunnel (if not already running)
#   cloudflared tunnel route dns <tunnel> app.flowop.work
#   Ingress: app.flowop.work -> http://localhost:8080
nano ~/.cloudflared/config.yml

# 2.5 First deploy WITH demo seed
./deploy/vps-deploy.sh --seed
```

---

## 3. Deploying updates (every time)

```bash
cd ~/FlowOps
./deploy/vps-deploy.sh
```

That script: `git pull` → `docker compose build` → `up -d` → `prisma db push`
→ health check. Idempotent. **Always rebuilds the frontend image**, so SPA
changes actually ship (a baked-in stale `dist` was a recurring dev gotcha).

---

## 4. Common operations

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

$C ps                       # status of all 4 services
$C logs -f api              # tail backend logs
$C logs -f frontend         # tail nginx logs
$C restart api              # restart just the backend
$C exec api sh              # shell into the backend container
$C exec -T api npx prisma db push     # re-sync schema after a pull
$C exec -T api node prisma/seed-demo-company.js   # re-run a seed

# Backup / restore the database (named volume postgres-data)
$C exec -T postgres pg_dump -U flowops flowops > backup_$(date +%F).sql
cat backup_2026-06-25.sql | $C exec -T postgres psql -U flowops flowops
```

---

## 5. Driver PWA (separate container)

The standalone driver portal (`driver.flowop.work` → `:8083`) is **not** part
of this compose stack and has **no build tooling** in the repo — it ships as a
prebuilt `dist/`. It must call the API at **`https://api.flowop.work/api/v1`**
(absolute, cross-origin), so:

- `api.flowop.work` must reach the same backend (tunnel → `:8080`, nginx
  proxies `/api/`), **and**
- `CORS_ORIGINS` in `.env` **must include** `https://driver.flowop.work`.

If the driver app shows CORS errors, that missing origin is the cause.

---

## 6. Troubleshooting (lessons learned)

| Symptom | Root cause | Fix |
|---|---|---|
| **502 on `api.flowop.work`** | Backend not running | `docker compose ... ps`; `... up -d`; check `... logs api` |
| **SPA loads but every API call 404s** | `VITE_API_URL=/api` instead of `/api/v1` | Set `/api/v1` in `.env`, rebuild frontend |
| **New UI changes don't appear** | Browser/SW cache **or** frontend image not rebuilt | `./deploy/vps-deploy.sh` (rebuilds image); hard-reload; or unregister SW (§7) |
| **Owner login works but data is empty / tenant logins fail** | Two parallel DBs (host vs docker) | This runbook uses **one** compose Postgres — never start a second backend on the host |
| **Owner "Intel" tab empty / sweep does nothing** | Calling tenant-guarded `/ai/intel/*` with an owner token | Fixed in PR #119 — owner uses `/owner/intel/*`; ensure backend image is current |
| **Driver app CORS error** | `driver.flowop.work` not in `CORS_ORIGINS` | Add it, `restart api` |
| **AI features dead (Support Agent, Courier orchestrate, copilot, intel) — only fallback replies** | `GROQ_API_KEY` not reaching the container | Set it in `.env`; the compose `api` service forwards it — rebuild/`up -d`. Confirm with `docker compose ... exec api printenv GROQ_API_KEY` |
| **Fresh instance flags a "clone" in Observatory** | New domain not in `VITE_CANONICAL_HOSTS` (tripwire false-fire) | Set `VITE_CANONICAL_HOSTS=<your-domain>` + rebuild frontend |
| **`prisma` errors about missing table/column** | Schema not pushed after a pull | `docker compose ... exec -T api npx prisma db push` |

---

## 7. Clear a stuck PWA service worker (browser side)

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
location.reload(true);
```

---

## 8. Why pure compose (not PM2 + compose)

Mixing a host PM2 backend with a half-started compose stack created **two
backends and two databases**: the SPA hit the empty/stale one while the real
data lived in the other. Keeping everything in **one** compose project means
there is exactly one backend and one Postgres volume — the failure mode simply
cannot happen.

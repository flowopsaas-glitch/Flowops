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
   app.flowop.work      ─────────────────►  http://frontend:80
   platform.flowop.work ─────────────────►  http://frontend:80
   api.flowop.work       (optional/direct) ► http://frontend:80    (same nginx; /api/* proxied)
   driver.flowop.work   ─────────────────►  http://driver-portal:80

   ┌──────────── docker compose: project "flowops" ────────────┐
   │  frontend (nginx + SPA)   no host port (compose network)   │
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
`api` container. No cross-origin, no CORS headaches, no second backend.

**Second invariant — no host ports.** The VPS overlay (`deploy/docker-compose.vps.yml`)
unbinds every host port with `ports: !reset []`, so the ONLY way in is the
tunnel, which must target **Docker service names** (`http://frontend:80`,
`http://driver-portal:80`) — never `localhost:8080`. Compose merges port lists
by *appending*, so a plain `ports: []` in an overlay is a no-op; that bug is
what made the app reachable on `http://<VPS_IP>:8080`. Requires **Compose
v2.24.4+**. Details and rollout plan: [`VPS-PORT-RESET-ROLLOUT.md`](VPS-PORT-RESET-ROLLOUT.md).

---

## 2. One-time VPS setup

### Fast path (recommended) — one bootstrap script

```bash
git clone https://github.com/flowopsaas-glitch/Flowops.git ~/FlowOps && cd ~/FlowOps
./deploy/vps-bootstrap.sh app.flowop.work   # installs Docker, creates .env,
                                            # generates secrets, wires the domain
nano .env                                   # fill OWNER_SEED_*, GROQ_API_KEY, etc.
# point the Cloudflare tunnel:  <domain> -> http://frontend:80
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
#   Ingress: app.flowop.work -> http://frontend:80
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

The standalone driver portal (`driver.flowop.work` → `http://driver-portal:80`
on the compose network) is **not** part
of this compose stack and has **no build tooling** in the repo — it ships as a
prebuilt `dist/`. It must call the API at **`https://api.flowop.work/api/v1`**
(absolute, cross-origin), so:

- `api.flowop.work` must reach the same backend (tunnel → `http://frontend:80`, nginx
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
| **Site 502s (or vps-deploy.sh refuses to start) after the port-reset change** | Tunnel ingress still targets `http://127.0.0.1:8080` / `http://localhost:8080`, and nothing listens there any more | Point ingress at `http://frontend:80` / `http://driver-portal:80`, then `docker compose ... restart cloudflared` |
| **`curl http://<VPS_IP>:8080` still returns 200 after the fix** | Overlay ran on Compose < 2.24.4, so `!reset` was ignored and the base binding survived | `docker compose version` → upgrade the plugin; re-run `./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml` |
| **`prisma` errors about missing table/column** | Schema not pushed after a pull | `docker compose ... exec -T api npx prisma db push` |
| **R2 uploads return `NotImplemented 501` from apt rclone 1.60.1** | Ubuntu-packaged rclone 1.60 uploads objects but mis-handles post-upload checks against current R2 | Use `/usr/local/bin/rclone` v1.66+ (installed by `item2-r2-runner.sh`); the cron job hard-codes that binary |
| **Intermittent 502s / tunnel split-brain** | A host `cloudflared.service` is running alongside the Compose cloudflared sidecar against the same tunnel ID, creating two connectors | Stop/disable/mask the host service; only the Compose `cloudflared` service should own the tunnel (`deploy/vps-deploy.sh` now refuses to deploy if a host service is active) |

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

---

## Reliability & Disaster Recovery (added 2026-09)

Everything below is **operational hardening** for running on one VPS. The app
already dumps the DB every 6h into a Docker volume; these steps make backups
survivable off-box, provable, and add disk self-healing.

### A. Off-box R2 backups (current) — `deploy/item2-r2-runner.sh`

The production backup path is the fail-closed runner committed at
`deploy/item2-r2-runner.sh`. It stages files under `/root` (not `/tmp`, which
is a 1 GiB tmpfs on this VPS), requires modern rclone at
`/usr/local/bin/rclone` (v1.66+; apt rclone 1.60 returns `NotImplemented 501`
against current Cloudflare R2), and only installs itself / schedules cron
**after** all five proof steps pass:

1. Restores the newest local dump into a throwaway Postgres DB.
2. gzip + SHA-256 verifies the local copy before upload.
3. Uploads to `flowops-r2:flowops-backups/backups/YYYY/MM/flowops_*.sql.gz`.
4. Round-trip downloads from R2 and SHA-256 matches against local.
5. Restores the R2 copy into a second throwaway DB and counts core tables.

Bucket layout is checked; unexpected root objects or unexpected files under
`backups/` abort before writes. 30-day retention is pruned only under the
dedicated `backups/` prefix.

Verified live state after the 2026-09-30 rollout:

- Installed binary: `/usr/local/bin/flowops-backup-r2`
- Rclone binary: `/usr/local/bin/rclone` (v1.75.1)
- Rclone remote: `flowops-r2` (config `/root/.config/rclone/rclone.conf`, mode 600)
- R2 bucket: `flowops-backups`, prefix `backups/`; public access disabled
- Root cron:
  - `15 2 * * *` daily R2 backup → `/var/log/flowops-backup.log`
  - `0 3 * * 0` local restore proof → `/var/log/flowops-restore-verify.log`
- First successful proof counts (local and R2 round-trip identical):
  collections=19, companies=2, drivers=20, users=10, waybills=81.

**To rotate / reconfigure rclone credentials**, use `rclone config` as root
and edit only the `flowops-r2` remote; never paste keys into chat. If cron or
the installed binary appears altered, re-run a freshly pinned copy of
`deploy/item2-r2-runner.sh` after verifying its SHA-256 against the commit.

### B. Cloudflared hardening (current)

Cloudflared runs as a Compose sidecar (service `cloudflared`) pinned to a dated
release tag, **not** `:latest`, and exposes a healthcheck that queries
`cloudflared tunnel --metrics 127.0.0.1:2000 ready`. Metrics are bound to
loopback inside the container and no host port is published.

- Image pin: `cloudflare/cloudflared:2026.9.3`
- Command: `tunnel --no-autoupdate --protocol http2 --metrics 127.0.0.1:2000 --config /etc/cloudflared/config.yml run`
- Restart: `always`; depends on frontend/api `service_healthy`
- Healthcheck: interval 30s, timeout 5s, retries 3, start_period 15s
- Host unit guard: `deploy/vps-deploy.sh` refuses to start if
  `systemctl is-active cloudflared` reports active/activating, because a host
  + container connector against the same tunnel ID causes split-brain and 502s.
- Bootstrap hygiene: `deploy/setup-vps.sh` and `deploy/oracle-setup.sh` install
  only the cloudflared CLI for diagnostics, mask the host
  `cloudflared.service`, and no longer enable a host tunnel agent.

If the host service is ever active by accident:
```bash
systemctl stop cloudflared
systemctl disable cloudflared
systemctl mask cloudflared
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d cloudflared
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps cloudflared
```
Rollback to the previous image tag is one
`CLOUDFLARED_IMAGE=cloudflare/cloudflared@sha256:<prior-digest> docker compose ... up -d cloudflared`
away; prior image remains in Docker until pruned.

### C. Legacy scripts (reference only) — `deploy/backup-to-r2.sh`, `deploy/restore-verify.sh`

The older `backup-to-r2.sh`/`restore-verify.sh` pair is kept for reference and
uses `awscli` with `.env` credentials. Do not install it alongside the
`item2-r2-runner.sh` cron lines — the runner preflight aborts if unmarked
FlowOps backup jobs already exist in root's crontab.

### D. Disk self-healing — `deploy/disk-guard.sh`

A full disk stops Postgres writes = total outage. This prunes dangling Docker
images/build-cache at 75% and gets aggressive at 85%. It **never** prunes
volumes, so DB data and backups are safe.

```bash
sudo cp deploy/disk-guard.sh /usr/local/bin/flowops-disk-guard
sudo chmod +x /usr/local/bin/flowops-disk-guard
( crontab -l 2>/dev/null; echo '17 */4 * * * /usr/local/bin/flowops-disk-guard >> /var/log/flowops-disk.log 2>&1' ) | crontab -
# one-off manual reclaim any time:
flowops-disk-guard
```

### E. Disk + health visibility

`GET /health` now includes disk usage. The in-app Health Sentinel logs a
warning at 80% and an error at 90% (visible in `docker logs flowops-api-1` and
the CLAW Observatory). Quick check:
```bash
# No host port is published, so run it from inside the frontend container
# (nginx proxies /api/ to the backend):
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  exec -T frontend wget -qO- http://localhost/api/v1/health | jq
df -h /
```

### F. Reboot survival (already configured — just verify)

All services use `restart: always` in `deploy/docker-compose.vps.yml`, so the
stack comes back after a reboot. Confirm Docker itself starts on boot:
```bash
sudo systemctl enable docker
docker ps            # after a test reboot, all flowops-* containers should be Up
```

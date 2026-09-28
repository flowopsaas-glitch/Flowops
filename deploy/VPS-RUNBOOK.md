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
`api` service. No cross-origin, no CORS headaches, no second backend.

**Second invariant — no host ports.** The VPS overlay (`deploy/docker-compose.vps.yml`)
unbinds every host port with `ports: !reset []`, so the ONLY way in is the
tunnel, which must target **Docker service names** (`http://frontend:80`,
`http://driver-portal:80`) — never `localhost:8080`. Compose merges port lists
by *appending*, so a plain `ports: []` in an overlay is a no-op; that bug is
what made the app reachable on `http://<VPS_IP>:8080`. Requires **Compose
v2.24.4+**. Details and rollout plan: [`VPS-PORT-RESET-ROLLOUT.md`](VPS-PORT-RESET-ROLLOUT.md).

**Third invariant — exactly one tunnel agent.** The compose `cloudflared`
service is the **only** agent; never run a host-level `cloudflared.service`
beside it (older guides in this repo created one — that bug caused the
2026-09-28 incident: two agents on one tunnel registration split Cloudflare's
traffic, and the host one could only 502). Check any time you touch the
tunnel: `systemctl is-active cloudflared` must print `inactive`, and
`docker ps --format '{{.Names}}' | grep cloudflared` must show the compose
container. `vps-deploy.sh` refuses to deploy while a host-level unit is
active or enabled.

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
| **Intermittent 502s — some requests fine, some fail instantly (incident 2026-09-28)** | Two cloudflared agents on one tunnel: a host-level `cloudflared.service` running beside the compose agent. Cloudflare splits traffic between them; the host one cannot reach any origin and 502s its share | `sudo systemctl stop cloudflared && sudo systemctl disable cloudflared`, keep only the compose container. Verify: `for i in $(seq 1 20); do curl -sS -o /dev/null -w "%{http_code} " https://app.flowop.work/; done` → expect 200 × 20. Prevention: `vps-deploy.sh` check 0e refuses to deploy in this state |
| **`curl http://<VPS_IP>:8080` still returns 200 after the fix** | Overlay ran on Compose < 2.24.4, so `!reset` was ignored and the base binding survived | `docker compose version` → upgrade the plugin; re-run `./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml` |
| **`prisma` errors about missing table/column** | Schema not pushed after a pull | `docker compose ... exec -T api npx prisma db push` |

---

## Site-down triage order (read-only first)

Work top-down; stop at the first confirmed cause. Change nothing until the
cause is named, and then one change at a time with its rollback command ready.

1. **Everyone or just you?** Check from a phone on 4G/5G (wifi off) and note
   the Cloudflare error page: error number + Ray ID. `Cloudflare: Working /
   Host: Error` means the fault is between the edge and the origin.
2. **Host alive?** `uptime; df -h; free -m` — reboot? disk full? OOM?
3. **Containers:** `docker ps -a` — anything not `Up`? Note `STATUS`
   (healthy/Restarting), `restart`, `exit` codes (137 = OOM).
4. **Tunnel first** (the component that can take the site down while
   everything else is green):
   - `systemctl is-active cloudflared` must print `inactive` — a host-level
     agent beside the compose one is the 2026-09-28 incident;
   - `grep -n service: /etc/cloudflared/config.yml` must show Docker service
     names (`http://frontend:80`), never `localhost`/`127.0.0.1`;
   - `docker logs --tail 30 $(docker ps -aqf name=cloudflared | head -1)`.
5. **In-stack smoke:** `docker exec $(docker ps -qf name=api | head -1) node
   -e "fetch('http://frontend:80/').then(r=>console.log(r.status))"` — 200
   means the app is fine and the fault is tunnel/edge.
6. **Reality check through the public URL** (from the VPS; its egress is
   unfiltered): `for i in $(seq 1 20); do curl -sS -o /dev/null -w
   "%{http_code} " https://app.flowop.work/; done` — mixed 200/502 = a split
   path (two agents / flapping connection); all 502 = tunnel or origin down.
7. **Traffic truth:** `docker logs --since 30m flowops-frontend-1 | tail` —
   real requests with 200s? Then it's not fully down. Silence + external 502s
   = requests dying in front of nginx.
8. **Postgres:** `docker logs --tail 20 flowops-postgres-1` and a connection
   count via `psql`; look for restart loops and full disks.
9. **What changed?** `git log --oneline -3` in `~/FlowOps`; per-container
   `docker inspect -f '{{.State.StartedAt}}'`; `journalctl -b -1` if rebooted.
10. **Fix one thing, verify (the curl loop), keep the rollback command.**
    Never `docker system prune`. Never deploy a new release mid-incident —
    releases go through the gate sequence. Confirm a backup exists before any
    state-changing fix.

Deeper incident record: [`docs/INCIDENT-POSTMORTEM-2026-09-28.md`](../docs/INCIDENT-POSTMORTEM-2026-09-28.md).

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

### A. Off-box backups to Cloudflare R2 — `deploy/backup-to-r2.sh`

The `postgres-backup` container keeps 7 days of dumps **on the same disk** as
the database. If the VPS/disk is lost, those go with it. This script copies a
fresh, **verified** dump into Cloudflare R2 so a total-host-loss is survivable.

It uploads through whichever transport is available (`R2_TRANSPORT=auto`):

| Transport | When | Needs |
|---|---|---|
| `rclone` | an rclone remote is configured (root's config: `/root/.config/rclone/rclone.conf`) | nothing else — credentials stay inside the rclone config; never copy or print them |
| `aws` | `CLOUDFLARE_R2_*` + `CLOUDFLARE_ACCOUNT_ID` are in the environment | `apt-get install -y awscli` + the R2 keys (e.g. sourced from `.env`) |

Install (run once, as root):
```bash
sudo cp deploy/backup-to-r2.sh /usr/local/bin/flowops-backup-r2
sudo chmod +x /usr/local/bin/flowops-backup-r2
# make a dedicated bucket in the Cloudflare dashboard first, e.g. "flowops-backups"
# daily at 02:15:
( crontab -l 2>/dev/null; \
  echo '15 2 * * * R2_BACKUP_BUCKET=flowops-backups /usr/local/bin/flowops-backup-r2 >> /var/log/flowops-backup.log 2>&1' \
) | crontab -
```
Non-standard rclone layout: if the remote root already **is** the bucket, add
`R2_RCLONE_PATH=backups` to the cron line; with several remotes, also set
`R2_RCLONE_REMOTE=<name>`. `rclone listremotes` and `rclone lsd <remote>:` show
the layout (read-only — they print names, never credentials).

Run it once by hand to confirm it works (auto-picks aws or rclone):
```bash
R2_BACKUP_BUCKET=flowops-backups /usr/local/bin/flowops-backup-r2
```
It refuses to upload a dump that fails size/gzip/pg_dump-header checks — a bad
backup never silently replaces a good one.

**Rollback:** remove the cron line and the binary:
```bash
crontab -l | grep -v flowops-backup-r2 | crontab -
sudo rm -f /usr/local/bin/flowops-backup-r2
```
(to delete an uploaded object: `rclone delete <remote>:<path>/<file>` or
`aws s3 rm s3://<bucket>/<key> --endpoint-url https://<account>.r2.cloudflarestorage.com`)

### B. PROVE the backup restores — `deploy/restore-verify.sh`

An untested backup is not a backup. This restores the newest dump into a
**throwaway** temp database, counts key tables, then drops it. It never touches
live data.

```bash
sudo cp deploy/restore-verify.sh /usr/local/bin/flowops-restore-verify
sudo chmod +x /usr/local/bin/flowops-restore-verify
# verify the latest local dump right now:
flowops-restore-verify --latest-local
# optional: weekly automated proof (Sundays 03:00)
( crontab -l 2>/dev/null; echo '0 3 * * 0 /usr/local/bin/flowops-restore-verify --latest-local >> /var/log/flowops-restore-verify.log 2>&1' ) | crontab -
```
Also prove the **offsite** copy round-trips — after a total loss, the file you
fetch back is the R2 object, so verify THAT file too:
```bash
# what's actually in R2 (newest last; names sort chronologically):
rclone lsf -R --files-only <remote>:flowops-backups/backups/ | sort | tail -3
# pull the newest object and verify it end-to-end:
rclone copyto <remote>:flowops-backups/backups/<YYYY>/<MM>/<newest> /tmp/r2-verify.sql.gz
flowops-restore-verify /tmp/r2-verify.sql.gz
rm -f /tmp/r2-verify.sql.gz
```
**Rollback** for the weekly cron: `crontab -l | grep -v flowops-restore-verify | crontab -`
**Real disaster recovery** (overwrites live DB — only when actually recovering):
```bash
flowops-restore-verify --restore-live /path/to/dump.sql.gz --i-understand
docker restart flowops-api-1
```

### C. Disk self-healing — `deploy/disk-guard.sh`

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

### D. Disk + health visibility

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

### E. Reboot survival (already configured — just verify)

All services use `restart: always` in `deploy/docker-compose.vps.yml`, so the
stack comes back after a reboot. Confirm Docker itself starts on boot:
```bash
sudo systemctl enable docker
docker ps            # after a test reboot, all flowops-* containers should be Up
```

### F. Pinned cloudflared + healthchecks (F-5 / F-9 — incident 2026-09-28)

`deploy/docker-compose.vps.yml` pins `cloudflare/cloudflared:2026.9.3` (F-5 —
`:latest` had left the box silently running an outdated `2026.6.1`) and adds
healthchecks (F-9):

- `cloudflared` — `["CMD", "cloudflared", "tunnel", "--metrics", "127.0.0.1:2000", "ready"]`.
  Exec-form is **required**: the official image is distroless (no shell, no
  wget/curl). The probe reads the `/ready` endpoint of the metrics server from
  `command:` and exits 0 only with ≥1 live Cloudflare edge connection.
- `postgres-backup` — healthy = a **validated** dump exists fresher than 6h40m
  (dump cycle is 6h + slack). Catches a dead dump loop or empty volume.

While the release gate holds the branch
(`docs/POST-MERGE-CI-VERIFICATION-2026-09-27.md`), do **NOT** `git pull` /
`vps-deploy.sh` on the VPS — they deploy app code. Apply only this delta with a
temporary overlay; it touches exactly two containers:

```bash
cat > /root/flowops-f5-f9.yml <<'EOF'
# TEMPORARY overlay (F-5/F-9, 2026-09-28). Remove once gate step 12 deploys
# the canonical deploy/docker-compose.vps.yml from arena/01a0e43b-flowops.
services:
  cloudflared:
    image: cloudflare/cloudflared:2026.9.3
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "--metrics", "127.0.0.1:2000", "ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
  postgres-backup:
    healthcheck:
      test: ["CMD-SHELL", "find /backups -name 'flowops_*.sql.gz' -mmin -400 | grep -q ."]
      interval: 5m
      timeout: 10s
      retries: 3
      start_period: 5m
EOF
cd /root/FlowOps
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  -f /root/flowops-f5-f9.yml up -d --no-deps cloudflared postgres-backup
```

**Blast radius:** recreates ONLY `cloudflared` + `postgres-backup`. The single
tunnel agent reconnects — expect a brief (seconds) site blip, then 200s resume;
`postgres-backup` takes a fresh dump immediately on restart. No other container
is touched. Never "smooth over" the blip by starting the host systemd unit —
exactly one tunnel agent (invariant 3).

**Rollback** (back to `:latest`, no healthchecks):
```bash
cd /root/FlowOps
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  up -d --no-deps cloudflared postgres-backup
sudo rm -f /root/flowops-f5-f9.yml
```

**Verify** (both should read `healthy` within ~1 min; `cloudflared` only flips
healthy with a live edge connection):
```bash
docker inspect flowops-cloudflared-1 --format 'cloudflared image={{.Config.Image}} health={{.State.Health.Status}}'
docker inspect flowops-postgres-backup-1 --format 'postgres-backup health={{.State.Health.Status}}'
```
At gate step 12, deploy the branch normally and delete `/root/flowops-f5-f9.yml`
— the canonical compose file carries the same pin + healthchecks.

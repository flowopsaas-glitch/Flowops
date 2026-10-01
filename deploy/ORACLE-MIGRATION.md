# FlowOps — Oracle Cloud VPS Migration

Migrate FlowOps from your local desktop (kakes-desktop) to an Oracle Cloud
Infrastructure (OCI) VPS so the platform runs 24/7 without needing your
machine on and a terminal open.

---

## Overview

```
BEFORE (fragile):
  Browser → Cloudflare → tunnel on kakes-desktop → Docker containers
  ⚠ If desktop sleeps, tunnel dies, app goes offline.

AFTER (production):
  Browser → Cloudflare → tunnel on Oracle VPS → Docker containers (always-on)
  ✅ VPS is on 24/7, tunnel auto-recovers via systemd.
```

---

## Prerequisites

- Oracle Cloud VPS (Ubuntu 22.04+ or 24.04) with at least:
  - 2 vCPUs, 4 GB RAM (ARM Ampere A1 free tier works great)
  - 50 GB boot volume
  - Ports: **no inbound ports needed** (Cloudflare tunnel = outbound-only)
- SSH access to the VPS (your key: `ssh-key-2026-07-01.key`)
- Your local `.env` file (from `~/FlowOps-Logistics/.env`)
- Your Cloudflare tunnel credentials file (`~/.cloudflared/1f2d0684-*.json`)

---

## Step 1: SSH into Oracle VPS

```bash
ssh -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key ubuntu@<ORACLE_VPS_IP>
```

> Replace `<ORACLE_VPS_IP>` with your Oracle VPS public IP.

---

## Step 2: Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# Log out and back in for group change to take effect
exit
```

SSH back in, then verify:
```bash
docker --version
docker compose version
```

---

## Step 3: Install cloudflared

```bash
# Download the latest cloudflared binary
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# Verify
cloudflared --version
```

> **For ARM (Oracle A1 free tier):**
> ```bash
> curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
> sudo dpkg -i /tmp/cloudflared.deb
> ```

---

## Step 4: Clone the repo

```bash
git clone https://github.com/flowopsaas-glitch/Flowops.git ~/FlowOps
cd ~/FlowOps
```

---

## Step 5: Copy your .env from local desktop

From your **local machine** (not the VPS), run:

```bash
scp -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key \
  ~/FlowOps-Logistics/.env \
  ubuntu@<ORACLE_VPS_IP>:~/FlowOps/.env
```

Then SSH into the VPS and verify:
```bash
cat ~/FlowOps/.env | head -5
```

---

## Step 6: Transfer Cloudflare tunnel credentials

The tunnel credentials JSON must be on the VPS. From your **local machine**:

```bash
# Create the cloudflared directory on VPS
ssh -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key ubuntu@<ORACLE_VPS_IP> \
  "mkdir -p ~/.cloudflared"

# Copy the credentials file
scp -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key \
  ~/.cloudflared/1f2d0684-3cb1-4431-b907-58a7888044ba.json \
  ubuntu@<ORACLE_VPS_IP>:~/.cloudflared/

# Copy the config file (we'll edit it on the VPS)
scp -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key \
  ~/.cloudflared/config.yml \
  ubuntu@<ORACLE_VPS_IP>:~/.cloudflared/
```

---

## Step 7: Configure the tunnel on Oracle

SSH into the VPS and edit the tunnel config:

```bash
nano ~/.cloudflared/config.yml
```

It should look like:
```yaml
tunnel: 1f2d0684-3cb1-4431-b907-58a7888044ba
credentials-file: /home/ubuntu/.cloudflared/1f2d0684-3cb1-4431-b907-58a7888044ba.json

ingress:
  - hostname: app.flowop.work
    service: http://127.0.0.1:8080
  - hostname: driver.flowop.work
    service: http://127.0.0.1:8083
  - service: http_status:404
```

> **Important:** Update the `credentials-file` path to match the VPS user
> (`/home/ubuntu/` not `/home/kakes/`).

Test manually first:
```bash
cloudflared tunnel run flowops-production
```

You should see `Registered tunnel connection` lines with `location=jnb*`. 
Press `Ctrl+C` once confirmed.

---

## Step 8: Tunnel agent — the compose stack runs it (do NOT install a service)

> **Incident 2026-09-28:** this guide previously said to install cloudflared as
> a host-level systemd service. Combined with the compose stack's own tunnel
> agent that created **two agents on one tunnel registration** — Cloudflare
> split traffic across both, and the host one could only return 502s (it cannot
> resolve `frontend`/`driver-portal`, and nothing listens on `localhost:8080`
> since the port-unbind rollout). The site was intermittently down for days.
> The compose stack (`deploy/docker-compose.vps.yml`) is the **only** tunnel
> agent. See `deploy/VPS-RUNBOOK.md`.

Prepare the config and credentials the compose agent reads (bind-mounted at
`/etc/cloudflared/`):

```bash
# Copy credentials to system location
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml

# Fix the credentials-file path in the system config
sudo sed -i 's|/home/.*/.cloudflared/|/etc/cloudflared/|' /etc/cloudflared/config.yml
```

Ingress rules must target **Docker service names** (`http://frontend:80`,
`http://driver-portal:80`) — never `localhost`/`127.0.0.1`.

Then make sure **no** host-level agent exists — one line, same on every box:

```bash
sudo systemctl stop cloudflared 2>/dev/null; sudo systemctl disable cloudflared 2>/dev/null
docker ps --format '{{.Names}}' | grep cloudflared   # expect: flowops-cloudflared-1
```

(`vps-deploy.sh` refuses to deploy while a host-level `cloudflared` unit is
active or enabled.) Verify the tunnel from the running container:

```bash
docker logs --tail 20 flowops-cloudflared-1
```

---

## Step 9: Deploy FlowOps (first time)

```bash
cd ~/FlowOps
./deploy/vps-deploy.sh --seed
```

This will:
1. Pull latest code
2. Build all Docker images (api, frontend, driver-portal)
3. Start the full stack (postgres, redis, api, frontend, driver-portal, backup)
4. Run `prisma db push` to sync the schema
5. Seed demo data (first deploy only)

Wait for it to finish — on ARM this can take 15-20 minutes for the first build.

---

## Step 10: Stop the tunnel on your desktop

Once the Oracle VPS is serving traffic, **stop the local tunnel** on your
desktop so they don't conflict:

```bash
# On kakes-desktop:
# Kill the manual cloudflared process (Ctrl+C in that terminal)
# Or if you set up systemd locally:
sudo systemctl stop cloudflared
sudo systemctl disable cloudflared
```

---

## Step 11: Verify everything works

1. Open `https://app.flowop.work/login` in your browser
2. Log in with your owner credentials
3. Check the AI features work (they need `GROQ_API_KEY` in `.env`)
4. Check `https://driver.flowop.work` loads

---

## Ongoing: Deploying updates

After you merge a PR or push changes:

```bash
ssh -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key ubuntu@<ORACLE_VPS_IP>
cd ~/FlowOps
./deploy/vps-deploy.sh
```

That's it. The script handles: `git pull` → `docker build` → `up -d` →
`prisma db push` → health check.

---

## Database Migration (if you want to move existing data)

If your local Postgres has real tenant data you want to keep:

### Export from local:
```bash
# On kakes-desktop:
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U flowops flowops | gzip > flowops_backup.sql.gz
```

### Transfer to Oracle:
```bash
scp -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key \
  flowops_backup.sql.gz \
  ubuntu@<ORACLE_VPS_IP>:~/FlowOps/
```

### Restore on Oracle:
```bash
# On Oracle VPS:
cd ~/FlowOps
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Drop and recreate (WARNING: destroys existing Oracle DB data)
$C exec -T postgres psql -U flowops -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore
gunzip -c flowops_backup.sql.gz | $C exec -T postgres psql -U flowops flowops

# Re-sync Prisma (in case any schema drift)
$C exec -T api npx prisma db push
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tunnel shows 0 connections | `sudo systemctl restart cloudflared` then check `journalctl -u cloudflared -f` |
| Docker build OOM on 1GB RAM | Add swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| `prisma db push` timeout | The API container needs to be healthy first: `docker compose ... ps` |
| Permission denied on Docker | `sudo usermod -aG docker $USER` then log out/in |
| Error 1033 after migration | Old DNS CNAME still points to desktop tunnel — delete it in Cloudflare dashboard, re-route with `cloudflared tunnel route dns flowops-production app.flowop.work` |
| AI features return fallback | Verify key reached container: `docker compose ... exec api printenv GROQ_API_KEY` |

---

## Quick Reference

```bash
# SSH in
ssh -i ~/FlowOps-Logistics/ssh-key-2026-07-01.key ubuntu@<ORACLE_VPS_IP>

# Deploy update
cd ~/FlowOps && ./deploy/vps-deploy.sh

# Check status
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Tail logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

# Restart just the backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api

# Tunnel status
sudo systemctl status cloudflared
journalctl -u cloudflared -n 30 --no-pager

# Database backup (manual)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U flowops flowops | gzip > backup_$(date +%F).sql.gz
```

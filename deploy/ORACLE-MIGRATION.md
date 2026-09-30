# DEPRECATED — Oracle Cloud VPS Migration

> **Do not run the historical commands in this document.** They install a host
> `cloudflared` binary, create a `cloudflared.service`, and target localhost;
> that is incompatible with the current Docker-owned, tunnel-only VPS design
> and can create a second agent for the same tunnel. It is retained solely as
> an historical data-migration reference.
>
> Use [VPS-RUNBOOK.md](VPS-RUNBOOK.md) and
> [CLOUDFLARED-POSTMORTEM.md](CLOUDFLARED-POSTMORTEM.md) instead. The supported
> Cloudflared action is `deploy/cloudflared-maintenance.sh`, which changes only
> the pinned tunnel container in an explicitly approved maintenance window.

Migrate FlowOps from your local desktop to an Oracle Cloud Infrastructure (OCI)
VPS only under the current staged migration gate; no production migration is
approved by this historical document.

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

## Steps 3–8: Docker-owned tunnel setup (replaces historical host-agent procedure)

The historical procedure that occupied this section installed `cloudflared` on
the VPS, ran it manually, and created a `cloudflared.service`. It has been
removed because it can run concurrently with the Compose tunnel service.

Follow the [Docker-owned tunnel setup in VPS-RUNBOOK.md](VPS-RUNBOOK.md#docker-owned-tunnel-setup)
instead. The only supported architecture is:

- credentials and `config.yml` in `/etc/cloudflared`, mounted read-only;
- one pinned `cloudflare/cloudflared:2026.9.3` Compose container;
- Docker service-name ingress (`http://frontend:80` and
  `http://driver-portal:80`); and
- the approval-gated `cloudflared-maintenance.sh` action for its first start,
  update, or rollback.

Do not proceed with a production tunnel or migration from this document.

---

## Step 9: Historical application deployment reference

This document does not authorize a production deployment. The current
application-only command is:

```bash
cd ~/FlowOps
./deploy/vps-deploy.sh
```

It leaves the tunnel and schema unchanged. `--apply-schema` (and consequently
`--seed`) remain blocked until the independent staging clone, migration,
integration, backfill, and rollback gates are formally approved.

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

The current script handles application source/build/start/health only. It does
not change Cloudflared, and it applies schema only when the separate migration
gate has approved an explicit `--apply-schema` action.

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
| Tunnel shows 0 connections | Do not restart a host service. Follow the Cloudflared-only incident/rollback procedure in `VPS-RUNBOOK.md`. |
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

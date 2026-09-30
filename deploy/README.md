# FlowOps — VPS Deployment (Elite Host)

Production deployment for FlowOps on a single VPS using Docker Compose + Cloudflare Tunnels.

## Server Specs

| Resource | Value |
|----------|-------|
| Provider | Elite Host (South Africa) |
| OS | Ubuntu 26.04 LTS |
| CPU | 1 vCPU |
| RAM | 2 GB |
| Storage | 25 GB SSD |
| IP | 164.160.89.97 |
| Domain | flowop.work |

## Architecture

```
Internet → Cloudflare Edge (CDN + DDoS + SSL)
         → Cloudflare Tunnel (encrypted, outbound-only)
         → VPS (no open ports except SSH)
           ├── cloudflared (tunnel client) ──► frontend:80      (compose network)
           │                                ──► driver-portal:80
           ├── frontend (nginx SPA)      → app.flowop.work / www / platform
           ├── driver-portal (nginx SPA) → driver.flowop.work
           ├── api (NestJS) :3000 (internal only, proxied by frontend nginx)
           ├── postgres :5432 (internal only)
           └── redis :6379 (internal only)
```

> **No host ports are published.** The VPS overlay unbinds every host port with
> `ports: !reset []`, so cloudflared must reach containers by **Docker service
> name** (`http://frontend:80`, `http://driver-portal:80`) — `localhost:8080`
> does not exist. This requires **Docker Compose v2.24.4+** (older releases
> merge port lists instead of resetting them; `vps-deploy.sh` enforces it).
> See [VPS-PORT-RESET-ROLLOUT.md](VPS-PORT-RESET-ROLLOUT.md) for the reasoning.

## Quick Start

### 1. Run the setup script on your VPS

```bash
ssh root@164.160.89.97
curl -fsSL https://raw.githubusercontent.com/flowopsaas-glitch/Flowops/main/deploy/setup-vps.sh | bash
```

### 2. Set up the Docker-owned Cloudflare Tunnel

Do **not** install a host cloudflared package or `cloudflared.service`. A single
pinned Compose sidecar owns the tunnel. Use short-lived containers only to
create the credentials mounted by that sidecar:

```bash
sudo install -d -m 0755 /etc/cloudflared
sudo docker run --rm -it --user 0 -v /etc/cloudflared:/root/.cloudflared \
  cloudflare/cloudflared:2026.9.3 tunnel login
sudo docker run --rm -it --user 0 -v /etc/cloudflared:/root/.cloudflared \
  cloudflare/cloudflared:2026.9.3 tunnel create flowops-app

sudo cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml
sudoedit /etc/cloudflared/config.yml  # Replace CHANGE_ME_TUNNEL_ID
sudo chown root:65532 /etc/cloudflared/<TUNNEL_ID>.json
sudo chmod 640 /etc/cloudflared/<TUNNEL_ID>.json
```

Ingress must use `http://frontend:80` / `http://driver-portal:80`, never
localhost. See [VPS-RUNBOOK.md](VPS-RUNBOOK.md) for the approval-gated
Cloudflared-only start/change procedure.

### 3. Configure environment

```bash
cd /opt/flowops
nano .env  # Set OWNER_SEED_EMAIL + optional integrations
```

### 4. Launch application services

```bash
./deploy/vps-deploy.sh
```

This intentionally leaves Cloudflared unchanged. Only after the exact tunnel
maintenance action is approved, run:

```bash
sudo ./deploy/cloudflared-maintenance.sh --check
sudo ./deploy/cloudflared-maintenance.sh --apply
```

### 5. Verify

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps  # PORTS column must be empty
./deploy/check-cloudflared-owner.sh --require-running

docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml logs -f api

# From INSIDE the network — there is no host port to curl from outside:
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec frontend curl -fsS localhost/healthz
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec frontend curl -fsS localhost/api/v1/health

# From OUTSIDE the VPS — this must now be refused (that is the point):
curl -m 8 http://<VPS_IP>:8080/healthz              # → connection refused
curl -sS -o /dev/null -w '%{http_code}\n' https://app.flowop.work/   # → 200
```

To assert the merged config publishes nothing (same check `vps-deploy.sh` runs):

```bash
./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml
```

## Files

| File | Purpose |
|------|---------|
| `docker-compose.vps.yml` | Production override with memory limits, cloudflared, backups |
| `.env.production` | Template — copy to project root as `.env` |
| `cloudflared/config.yml` | Tunnel routing config — copy to `/etc/cloudflared/` |
| `setup-vps.sh` | One-shot VPS provisioning script |

## Memory Budget (2GB)

| Service | Limit | Reserved |
|---------|-------|----------|
| frontend | 128 MB | 64 MB |
| driver-portal | 128 MB | 64 MB |
| api (NestJS) | 768 MB | 384 MB |
| postgres | 384 MB | 192 MB |
| redis | 96 MB | 32 MB |
| cloudflared | 128 MB | 64 MB |
| postgres-backup | 128 MB | 32 MB |
| **OS + swap** | ~240 MB + 2GB swap | — |
| **Total** | ~1,760 MB | ~832 MB |

## Common Operations

```bash
# View logs
docker compose logs -f api
docker compose logs -f frontend

# Restart a service
docker compose restart api

# Deploy application code changes (leaves cloudflared untouched)
./deploy/vps-deploy.sh

# Tunnel client changes use the separate, approval-gated action:
# sudo ./deploy/cloudflared-maintenance.sh --apply

# Database backup (manual)
docker compose exec postgres pg_dump -U flowops flowops | gzip > backup.sql.gz

# List automated backups
docker compose exec postgres-backup ls -lh /backups

# Restore from backup
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U flowops flowops

# Check resource usage
docker stats --no-stream
```

## Updating

```bash
cd /opt/flowops
./deploy/vps-deploy.sh  # application services only; does not change cloudflared
```

A tunnel-client change is a separate approved maintenance action; do not use a
broad `docker compose up` command for it.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Services OOM killed | Check `docker stats`, reduce API memory if frontend unused |
| Tunnel not connecting | Run `./deploy/check-cloudflared-owner.sh --require-running`; inspect Compose logs and credential path. Do not run a host agent. |
| Site 502s right after adopting `!reset` | The tunnel ingress still points at `http://127.0.0.1:8080` / `http://localhost:8080`. Switch it to `http://frontend:80` / `http://driver-portal:80`, then use the approved Cloudflared-only action — never a broad application redeploy. |
| `docker compose up` fails with "address already in use" on 8080 | You are on the prod overlay with Compose < 2.24.4, so the base `8080:80` and the override's `127.0.0.1:8080:80` both got published. Upgrade Compose |
| Database connection refused | `docker compose logs postgres`, ensure healthy |
| Frontend 502 | API not healthy yet — wait 30s after start, check `docker compose logs api` |

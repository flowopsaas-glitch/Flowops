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
           ├── cloudflared (tunnel client)
           ├── frontend (nginx SPA) :8080 → app.flowop.work / www / platform
           ├── driver-portal (nginx SPA) :8081 → driver.flowop.work
           ├── api (NestJS) :3000 (internal only, proxied by frontend nginx)
           ├── postgres :5432 (internal only)
           └── redis :6379 (internal only)
```

## Quick Start

### 1. Run the setup script on your VPS

```bash
ssh root@164.160.89.97
curl -fsSL https://raw.githubusercontent.com/flowopsaas-glitch/Flowops/main/deploy/setup-vps.sh | bash
```

### 2. Set up Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create flowops-app
# Note the tunnel ID from the output

cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml
nano /etc/cloudflared/config.yml  # Replace CHANGE_ME_TUNNEL_ID with actual ID

# Move credentials file
cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
```

### 3. Configure environment

```bash
cd /opt/flowops
nano .env  # Set OWNER_SEED_EMAIL + optional integrations
```

### 4. Launch

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --build
```

### 5. Verify

```bash
docker compose ps
docker compose logs -f api
curl http://localhost:8080/healthz
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

# Rebuild after code changes
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --build

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
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --build
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Services OOM killed | Check `docker stats`, reduce API memory if frontend unused |
| Tunnel not connecting | `cloudflared tunnel info flowops-app`, check credentials path |
| Database connection refused | `docker compose logs postgres`, ensure healthy |
| Frontend 502 | API not healthy yet — wait 30s after start, check `docker compose logs api` |

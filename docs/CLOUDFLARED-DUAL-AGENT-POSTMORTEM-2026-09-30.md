# Cloudflared dual-agent postmortem — 2026-09-30

## Summary

During item 3 hardening we confirmed the FlowOps VPS had two sources of truth
for the Cloudflare tunnel connector:

1. The intended Compose sidecar `flowops-cloudflared-1` (image
   `cloudflare/cloudflared`, running inside `docker compose -p flowops`).
2. A leftover host `cloudflared.service` created by `deploy/oracle-setup.sh`
   / `deploy/setup-vps.sh` during migration.

At the time of investigation the host unit was already **disabled/inactive**
(stopped 2026-09-28 during the Oracle→Webway move), so the site was not
currently split-brained. But the bootstrap scripts still re-enable the host
service on fresh runs, which would create a second connector against the same
tunnel ID (`1f2d0684-3cb1-4431-b907-58a7888044ba` / `flowops-app`) and cause
intermittent 502s.

Additional defects discovered:

- The Compose sidecar was pinned to `cloudflare/cloudflared:latest`, which
  drifted to a 3-month-old image and has no stable rollback target.
- The metrics listener was bound to `0.0.0.0:2000`. Because VPS overlay
  `ports: !reset []` does not publish container ports to the host, this was
  not externally reachable, but it was still reachable from other containers
  on the compose network. Hardening binds it to `127.0.0.1:2000`.
- There was no Docker `HEALTHCHECK`, so a wedged connector could sit `Up`
  indefinitely without Compose noticing.
- The apt/rclone 1.60 vs R2 501 issue from item 2 shared a pattern: pinned
  dependencies beat "latest" when troubleshooting production.

## Remediation applied (2026-09-30)

- `deploy/docker-compose.vps.yml`:
  - Pinned image to `cloudflare/cloudflared:2026.9.3` (configurable via
    `CLOUDFLARED_IMAGE` env var for emergency rollback).
  - Metrics now listen on `127.0.0.1:2000` only.
  - Added healthcheck:
    `["CMD", "cloudflared", "tunnel", "--metrics", "127.0.0.1:2000", "ready"]`
    (interval 30s / timeout 5s / retries 3 / start_period 15s).
- `deploy/vps-deploy.sh`: added preflight that refuses to bring the stack up
  while `systemctl is-active cloudflared` is `active`/`activating`, with an
  operator-facing stop/disable/mask recipe.
- `deploy/setup-vps.sh`: installs the cloudflared CLI to
  `/usr/local/bin/cloudflared` as a static binary (for `cloudflared tunnel
  info` and diagnostics only) and masks the legacy host unit on new builds;
  it no longer installs a .deb that auto-creates a systemd service.
- `deploy/oracle-setup.sh`: copies tunnel credentials/config to
  `/etc/cloudflared` for the Compose sidecar, then disables/masks the host
  unit instead of enabling it.
- Live VPS change: pulled `2026.9.3`, recreated **only** the cloudflared
  container with `docker compose up -d --no-deps cloudflared`, leaving api /
  frontend / postgres / redis / driver-portal / backup untouched. Verified:
  - Status `Up (healthy)`, image `cloudflare/cloudflared:2026.9.3`.
  - Command includes `--metrics 127.0.0.1:2000`.
  - `cloudflared tunnel info flowops-app` shows exactly one connector
    (`2026.9.3`, origin IP `164.160.89.97`).
  - Host `curl http://127.0.0.1:2000/ready` refused (metrics not exposed).
  - Frontend `/healthz` returns `ok`.

## Rollback

To revert cloudflared only (other containers stay running):

```bash
docker pull cloudflare/cloudflared:latest
CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest \
  docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --no-deps cloudflared
```

The old :latest image remains cached until pruned, so rollback is a single
recreate.

## Follow-ups / non-blocking

- Consider rotating/marking the old connector IDs revoked in the Cloudflare
  dashboard after a 24h clean window (connector IDs change on recreate, old
  entries age out automatically).
- Add an external synthetic check (Uptime/health endpoint) for
  `https://app.flowop.work` so future connector splits page on-call instead
  of relying on manual reports.
- Apply the same "pin tag + healthcheck" pattern to `postgres-backup` and
  other sidecars when time allows.
- Do **not** run `./deploy/vps-deploy.sh` (full stack deploy) until the
  migration/security gates are explicitly approved; it will pull the
  fast-forwarded branch's application changes.

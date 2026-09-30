# Cloudflared duplicate-agent incident — corrective action

**Status:** remediation prepared in source control; **not applied to the live VPS**.

## What happened

The VPS had two possible owners for the same Cloudflare Tunnel credentials:

1. the `cloudflared` service in the FlowOps Docker Compose stack; and
2. a host-level `cloudflared.service` created by legacy bootstrap/Oracle
   instructions.

A named Cloudflare Tunnel can have several edge connections from **one** agent,
but it must not have independently managed host and container agents competing
for the same credentials. The duplicated ownership made the active connector
ambiguous and made restart/boot behaviour unsafe. Earlier instructions also
allowed mutable `cloudflare/cloudflared:latest`, so a routine Compose action
could alter the tunnel client without a reviewed maintenance action.

## Contributing conditions

- `deploy/docker-compose.vps.yml` used `cloudflare/cloudflared:latest`.
- The upstream image is distroless, so a shell/curl healthcheck was not
  available; the tunnel had no Docker health state.
- `setup-vps.sh`, `oracle-setup.sh`, and the historical Oracle migration
  document encouraged host cloudflared installation/systemd management.
- A normal `vps-deploy.sh` ran `compose up -d` for all services, so an
  application deployment could recreate the tunnel container.
- No pre-flight asserted that exactly one owner existed.

## Corrective controls

| Risk | Control | Location |
|---|---|---|
| Mutable tunnel image | Release pin `cloudflare/cloudflared:2026.9.3`; changes require review | `deploy/docker-compose.vps.yml` |
| No tunnel readiness signal | Native `cloudflared tunnel ready` Docker healthcheck against loopback `/ready` | `deploy/docker-compose.vps.yml` |
| Duplicate host/container agent | Static and runtime single-owner guard | `deploy/check-cloudflared-owner.sh` |
| Bootstrap recreates host agent | Bootstrap scripts no longer install cloudflared or create a systemd unit | `deploy/setup-vps.sh`, `deploy/oracle-setup.sh`, `deploy/vps-bootstrap.sh` |
| App release rolls tunnel | `vps-deploy.sh` starts only application services | `deploy/vps-deploy.sh` |
| Uncontrolled tunnel maintenance | Dedicated cloudflared-only action captures an immutable rollback image | `deploy/cloudflared-maintenance.sh` |
| Untested Compose rollback | Forward/rollback compose render rehearsal in CI | `deploy/test-cloudflared-rollback.sh` |

The native ready command is available in the pinned Cloudflared release and
returns non-zero until the local readiness endpoint has at least one active
edge connection. `TUNNEL_METRICS=127.0.0.1:2000` keeps that endpoint inside
the tunnel container; no diagnostic port is published to the host or the
Compose network.

## Required maintenance sequence

This is an **exact maintenance action**, not an authorization. It must be
scheduled and explicitly approved before any command after the pre-flight is
run. It changes **only** `cloudflared`; it does not pull application source,
build application images, alter the database, run Prisma, or restart API/
frontend/Postgres.

1. Complete the separate R2 credential rotation and verify its backup-only
   cycle. Do not enter R2 credentials into tickets, chat, or this repository.
2. On a non-production/staging clone, run the controlled Compose rehearsal:

   ```bash
   cd ~/FlowOps
   ./deploy/test-cloudflared-rollback.sh
   ```

   Then run the runtime sequence against that staging tunnel and confirm the
   ready healthcheck, public routes, and manual rollback all pass. Record only
   command outcome, image digest, timestamps, and health status — never
   credentials or tunnel JSON.
3. In the approved VPS window, run the read-only check:

   ```bash
   cd ~/FlowOps
   sudo ./deploy/cloudflared-maintenance.sh --check
   ```

   It must report no active/boot-enabled host `cloudflared.service`, a pinned
   healthchecked Compose model, and Docker-service-name ingress targets.
4. If — and only if — the approved action explicitly includes retiring the
   legacy host service, run:

   ```bash
   sudo ./deploy/cloudflared-maintenance.sh --apply --retire-host-agent
   ```

   Otherwise run `--apply` without that flag. The script captures the current
   immutable image reference to `/var/lib/flowops/cloudflared/rollback-compose.yml`,
   pulls the approved release, and recreates only the `cloudflared` container.
5. Confirm the result before closing the window:

   ```bash
   ./deploy/check-cloudflared-owner.sh --require-running
   docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps cloudflared
   docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml logs --since 10m cloudflared
   curl -fsS -o /dev/null -w 'app %{http_code}\n' https://app.flowop.work/
   curl -fsS -o /dev/null -w 'driver %{http_code}\n' https://driver.flowop.work/
   ```

## Rollback criteria and action

Rollback if the Cloudflared healthcheck does not become `healthy`, the native
`cloudflared tunnel ready` probe fails, the public application/driver routes
fail after the normal Cloudflare propagation allowance, or the single-owner
guard fails.

The `--apply` action automatically attempts a Cloudflared-only rollback when
the new container fails its health window. To perform a deliberate rollback
later, use the captured image — never `:latest` and never an application
redeploy:

```bash
sudo ./deploy/cloudflared-maintenance.sh --rollback
./deploy/check-cloudflared-owner.sh --require-running
```

If both forward and rollback tunnel readiness fail, leave application
containers untouched, keep the host systemd unit masked, collect redacted
container status/log timestamps, and escalate as a tunnel incident. Do not
fall back to publishing application ports or to a second host tunnel agent.

## Evidence still required before production approval

- Result of the controlled staging runtime forward/rollback rehearsal.
- Confirmation that one and only one connector owner remains after VPS reboot.
- Recorded image digest of the target and captured rollback image.
- R2 token rotation and a verified `flowops-backup-r2 --backup-only` cycle.
- Existing staging migration/security gates remain independent blockers; this
  document does not approve a production application, database, or rail
  release.

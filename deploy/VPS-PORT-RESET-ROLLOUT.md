# Deployment Plan — VPS Compose Port Reset (`!reset []`)

**Change:** `deploy/docker-compose.vps.yml` (and `docker-compose.prod.yml`) now
actually remove host port bindings.
**Risk:** medium — one mis-configured Cloudflare Tunnel ingress takes the site
offline. Everything else is a container recreate.
**Downtime:** ~30–90 s (frontend, driver-portal, api, postgres, redis are all
recreated because their merged config changes). No schema change, no data
migration, no `.env` change.

---

## 1. The defect

Compose merges **list** fields (`ports`, `volumes`, `expose`, `dns`, …) by
**appending** the override's entries to the base file's entries — it does *not*
replace them [1](https://docs.docker.com/reference/compose-file/merge/).

`deploy/docker-compose.vps.yml` used `ports: []` to say "publish nothing". That
is an empty append: a silent no-op. The merged config kept

| Service | Base binding (survived the override) | Published on |
|---|---|---|
| `frontend` | `${FRONTEND_HOST_PORT:-8080}:80` | `0.0.0.0:8080` |
| `driver-portal` | `${DRIVER_PORTAL_HOST_PORT:-8081}:80` | `0.0.0.0:8081` |

So on the live VPS (164.160.89.97) the app and the driver PWA are reachable
directly on the public IP, bypassing Cloudflare (no WAF, no Access policies,
no edge TLS) — while every runbook, comment and the tunnel container assumed
tunnel-only.

The fix is the `!reset` / `!override` YAML tags (Compose 2.24+ / 2.24.4+),
which clear or replace the inherited value instead of appending to it.

**Proof before/after** (run on the VPS):

```bash
# BEFORE (current main): shows published 8080 / 8081
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml config \
  | grep -B6 'published'
```

---

## 2. What this PR changes

| File | Change |
|---|---|
| `deploy/docker-compose.vps.yml` | `ports: []` → `ports: !reset []` on frontend, driver-portal, api, postgres, redis + header note explaining the merge rule |
| `docker-compose.prod.yml` | frontend `ports:` → `ports: !override ["127.0.0.1:8080:80"]` (the old value **appended** to the base `8080:80`, so prod published 8080 on `0.0.0.0` *and* `127.0.0.1` — a binding conflict); driver-portal → `ports: !override ["127.0.0.1:8081:80"]` (the base `8081:80` was left published on `0.0.0.0` — **found by the new CI `compose` job on its first run**); api/postgres/redis `[]` → `!reset []` |
| `scripts/check-compose-ports.sh` | **New.** Renders the merged config and exits non-zero if anything is published on a non-loopback interface; also enforces Compose ≥ 2.24.4 |
| `deploy/vps-deploy.sh` | Pre-flight: Compose version gate, Cloudflare Tunnel target gate, merged-config port check. Post-deploy: runtime assertion that no container publishes `0.0.0.0:*` |
| `.github/workflows/ci.yml` | **New `compose` job** — regression test: renders base, VPS (no ports), prod (loopback only) and otel overlays |
| `deploy/README.md`, `deploy/VPS-RUNBOOK.md` | Tunnel targets corrected to Docker service names; "no host ports" documented |

**Not affected:** the Oracle / `docker-compose.prod.yml` path deliberately keeps
loopback bindings (`127.0.0.1:8080` frontend, `127.0.0.1:8081` driver-portal),
so `deploy/oracle-setup.sh` and `ORACLE-MIGRATION.md` (which point cloudflared
at `http://127.0.0.1:8080`) stay valid. Note their driver ingress points at
`127.0.0.1:8083` while the compose default is `8081` — a pre-existing
inconsistency (set `DRIVER_PORTAL_HOST_PORT=8083` or fix the ingress); tracked
as a follow-up below.

---

## 3. The one thing that can take the site down

Once no host port is bound, **nothing listens on `127.0.0.1:8080`**. Any
Cloudflare Tunnel ingress rule that still targets `http://localhost:8080` or
`http://127.0.0.1:8080` will 502 immediately.

`deploy/vps-deploy.sh` now **refuses to deploy** when it finds one, so fix the
ingress *before* the maintenance window if you can (the change is safe to make
early — the service names resolve today because the containers are on
`flowops-net`, and cloudflared is already attached to that network).

---

## 4. Pre-deploy checklist (run on the VPS, 5 min)

```bash
cd ~/FlowOps
git fetch --all

# 4.1 Compose must understand !reset / !override  (need >= 2.24.4)
docker compose version
#  -> Docker Compose version v2.xx.x    (if older: apt-get update && apt-get install -y docker-compose-plugin)

# 4.2 Record the current exposure (evidence for the "before" state)
sudo ss -ltnp | grep -E ':(8080|8081)\b'
#  -> expected TODAY: 0.0.0.0:8080 and 0.0.0.0:8081 (docker-proxy)
curl -sS -o /dev/null -w '%{http_code}\n' http://164.160.89.97:8080/healthz
#  -> expected TODAY: 200   (this is the hole we are closing)

# 4.3 Cloudflare Tunnel ingress MUST use service names
sudo grep -n 'service:' /etc/cloudflared/config.yml
#  -> must show http://frontend:80 and http://driver-portal:80
#  -> if it shows http://127.0.0.1:8080 or http://localhost:8080, fix it now:
#        sudo nano /etc/cloudflared/config.yml
#        docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml restart cloudflared
#     then confirm the site still serves through the tunnel before continuing.

# 4.4 Nothing else on the host depends on 8080/8081 (monitoring, host nginx, uptime checks)
sudo ss -ltnp | grep -E ':(8080|8081)\b'   # note any non-docker listeners
```

**Exit criteria for the window:** 4.1 green, 4.3 shows service names, 4.4 shows
only docker-proxy listeners.

---

## 5. Rollout (maintenance window, ~10 min)

```bash
cd ~/FlowOps

# 5.1 Take the change
git checkout arena/01a0d833-flowops      # or: git pull --ff-only after merge to main
git log --oneline -1                     # confirm the port-reset commit is HEAD

# 5.2 Dry run — renders the merged config WITHOUT touching the stack.
#     This is the gate: it fails if any host port survives, or if Compose is too old.
./scripts/check-compose-ports.sh -f docker-compose.yml -f deploy/docker-compose.vps.yml
#  -> "PASS: no host ports published (tunnel-only posture intact)"

# 5.3 Deploy (pre-flight re-runs 5.2, then builds, recreates, migrates, verifies)
./deploy/vps-deploy.sh
```

What 5.3 does, in order: `git pull --ff-only` → Compose version gate → tunnel
target gate → merged-config port gate → `.env` sanity → build images →
`up -d` (recreates the 5 changed services) → wait for Postgres → `prisma db push`
→ plan-overage pre-flight → health check → **runtime port assertion**.

If any gate fails the script exits **before** `up -d`, leaving the running stack
untouched.

---

## 6. Verification (all must pass)

```bash
C="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"

# 6.1 No host ports published
$C ps                                   # PORTS column empty for every service
sudo ss -ltnp | grep -E ':(8080|8081)\b' || echo "OK: nothing listening on 8080/8081"

# 6.2 The hole is closed from OUTSIDE the VPS (run from a laptop / another host)
curl -sS -m 8 -o /dev/null -w '%{http_code}\n' http://164.160.89.97:8080/healthz
#  -> must be 000 / "Connection refused"   (was 200 before)

# 6.3 Services reachable from INSIDE the compose network
$C exec -T frontend      curl -fsS localhost/healthz
$C exec -T driver-portal curl -fsS localhost/healthz
$C exec -T frontend      curl -fsS localhost/api/v1/health

# 6.4 Real traffic through the tunnel (the thing users actually hit)
curl -sS -o /dev/null -w 'app    %{http_code}\n' https://app.flowop.work/
curl -sS -o /dev/null -w 'driver %{http_code}\n' https://driver.flowop.work/
curl -sS -o /dev/null -w 'api    %{http_code}\n' https://api.flowop.work/api/v1/health
#  -> 200 / 200 / 200

# 6.5 Tunnel and backend logs are clean
$C logs --since 10m cloudflared | tail -20
$C logs --since 10m api         | tail -20

# 6.6 Backup container still healthy (it shares the network, no port involved)
$C ps postgres-backup
```

**Smoke test in the browser:** owner login → dashboard loads → create a
waybill → driver portal login → CLAW/AI reply (confirms the api path through
nginx, not just `/healthz`).

---

## 7. Rollback

Symptom that would trigger it: the site is unreachable through the tunnel and
6.3 shows the containers are healthy (i.e. the tunnel, not the app, is broken).

```bash
cd ~/FlowOps

# Option A — restore the previous overlay files (fastest, ~1 min)
git checkout HEAD~1 -- deploy/docker-compose.vps.yml docker-compose.prod.yml
./deploy/vps-deploy.sh        # re-publishes 8080/8081, tunnel to localhost works again

# Option B — revert the merge commit on main and redeploy
git revert -m 1 <merge-sha> && git push origin main
# then on the VPS: git pull --ff-only && ./deploy/vps-deploy.sh
```

Rollback restores public exposure of 8080/8081 — treat it as a temporary state
and re-plan. If the tunnel config is the problem, the cheaper fix is to correct
`/etc/cloudflared/config.yml` and restart cloudflared (no redeploy).

---

## 8. Schedule, owners, comms

| Item | Detail |
|---|---|
| Window | Low-traffic period; ~10 min of work, ≤90 s of downtime |
| Owner | FlowOps platform (single-operator deploy, script-driven) |
| Approvals | None required — no schema/env change, fully scripted, scripted rollback |
| Notify | Tenants if the window exceeds 5 min of downtime (driver PWA is the time-sensitive surface) |
| Backups | `prisma db push` runs but is a no-op (no schema change); the 6-hourly `postgres-backup` volume is untouched. Optional: `flowops-restore-verify --latest-local` before starting |

---

## 9. Follow-ups (separate PRs, not blocking)

1. **`cloudflared` should `depends_on: driver-portal`** — it already depends on
   frontend + api, but its ingress also routes `driver.flowop.work`, so a cold
   start can 502 on that hostname for a few seconds.
2. **Host firewall** — `ufw` deny 8080/8081 (and 5432/6379) as defence in depth
   so a future compose mistake cannot re-expose the stack.
3. **`deploy/feature-batch-deploy.sh`** publishes `PUBLIC_PORT=8081` on all
   interfaces by design; confirm that is still wanted, or bind it to loopback.
4. **External uptime checks** should hit `https://app.flowop.work` (edge), not
   the VPS IP — anything still polling `:8080` will start alerting after this
   deploy.
5. **Oracle driver ingress port mismatch** — `oracle-setup.sh` /
   `ORACLE-MIGRATION.md` route `driver.flowop.work` to `127.0.0.1:8083`, but
   the compose default (`DRIVER_PORTAL_HOST_PORT`) is `8081`. Pick one and
   align the tunnel config with the env var.

---

## References

- [1] Compose merge rules, `!reset` / `!override`: https://docs.docker.com/reference/compose-file/merge/
- `deploy/docker-compose.vps.yml` (header comment), `deploy/VPS-RUNBOOK.md` §1, `scripts/check-compose-ports.sh`

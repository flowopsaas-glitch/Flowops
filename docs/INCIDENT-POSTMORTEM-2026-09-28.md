# Incident postmortem — intermittent 502s on app.flowop.work (2026-09-28)

**Status:** resolved · **Severity:** P0 (user-facing outage, then partial outage)
**Duration:** full outage inferred ~12.5 h (2026-09-25 12:00 UTC → 2026-09-26
00:24 UTC, see *Inference* note); intermittent outage **measured** ~2.5 days
(2026-09-26 00:24 UTC → 2026-09-28 10:59 UTC, 30–60% of requests failing)
**Impact surface:** `app.flowop.work`, `api.flowop.work`, `driver.flowop.work`,
`flowop.work` — all hostnames routed through the same Cloudflare tunnel.
Paying-tenant traffic was affected, including owner/billing-adjacent pages
(`/owner/dashboard`, `/api/v1/owner/*`) and driver logins. **No data loss or
corruption** — requests failed before reaching the application.

**Resolved at:** 2026-09-28 10:59 UTC (12:59 SAST) · verified 20/20 on three
consecutive samples · **Prepared by:** incident session on `arena/01a0e43b-flowops`

---

## 1. What happened (one paragraph)

Two `cloudflared` agents were registered to the **same Cloudflare tunnel** at
the same time: a host-level systemd service (`cloudflared.service`, installed
by the older `oracle-setup.sh` / `ORACLE-MIGRATION.md` guides) and the compose
stack's own container agent (`deploy/docker-compose.vps.yml`). Cloudflare
distributes requests across all connections a tunnel has registered — including
the host agent's three. Since the port-unbind rollout (#435), the host agent
could not reach any origin (it cannot resolve the Docker service names, and
nothing listens on `localhost:8080` any more), so every request it was handed
failed instantly with a 502 while requests landing on the container agent
succeeded. The result: a half-down site that looked "flaky" from outside and
perfectly healthy from inside the server.

## 2. Timeline (UTC; SAST = UTC+2)

| Time | Event | Evidence |
|---|---|---|
| Sep 25 11:45 | PR #435 (`ports: !reset []`) merges to `main` | GitHub merge record |
| Sep 25 11:53 | Host reboots **cleanly** (graceful `systemd-reboot.service`; trigger unverified — tracked as F7) | `journalctl -b -1`, `who -b` |
| Sep 25 11:53 | Host `cloudflared.service` starts at boot with the pre-#435 config (ingress → `127.0.0.1:8080`) | `systemctl status` "active since Fri 2026-09-25 13:53:25 SAST" |
| Sep 25 12:00 | Compose stack recreated with the port-unbind overlay → nothing publishes 8080 any more → the only tunnel agent can no longer reach an origin → **full outage via the tunnel** *(inferred — no measurements exist for this window)* | container `StartedAt` values, `no published ports` |
| Sep 26 00:21 | SSH session on the box (operator intervention) | `Last login` banner |
| Sep 26 00:24 | `config.yml` rewritten to Docker service names (`config.yml.bak-20260926-022429` kept); **compose tunnel agent created** → partial recovery (~50–70%) | file mtimes, container `StartedAt` 2026-09-26T00:24:31Z |
| … | The host agent was **left running** → intermittent 502s begin and persist ("unstable" user reports) | `ps aux`: PID 1002 still alive since Sep 25 |
| Sep 28 09:40 | Real owner session succeeds on `/owner/dashboard` (the coin-flip landing well) | nginx access log |
| Sep 28 10:28 | User hits CF 502 "Host Error" (Ray ID `a4220f503fa5017a`, colo JNB) | user report |
| Sep 28 10:38–10:44 | Diagnosis: curl loop via CF from the VPS = 3/10 then 12/20 then 6/20 **502s, all ~30 ms**; `ps aux` shows **two** cloudflared processes with the same `--config`; container logs silent; origins healthy (in-stack `frontend: 200`) | incident session output |
| Sep 28 10:59 | **Fix:** `systemctl stop cloudflared && systemctl disable cloudflared` — the host agent's journal closes the case: `ERR Connection terminated connIndex=0/1/2` → `ERR no more connections active and exiting` (three tunnel connections torn down) | journal excerpt |
| Sep 28 11:00+ | Verified: `200 × 20` on three consecutive samples | incident session output |

## 3. Root cause

**Duplicate tunnel agents on one Cloudflare tunnel registration, one of which
could never deliver after the port-unbind rollout.**

Supporting facts (each from a specific output, captured in the incident
session):

- `ps aux` showed `/usr/bin/cloudflared --config /etc/cloudflared/config.yml
  tunnel run` (host, PID 1002, since Sep 25) **and** the compose container's
  agent (since Sep 26) — the same tunnel, same config file.
- The 502s were **fast (~30 ms)** and happened to both origin paths
  (`app.flowop.work` → `frontend:80`, `api.flowop.work` → `api:3000`) — a
  shared-component failure, not an origin failure.
- The failing requests never appeared in nginx access logs (they died at the
  tunnel layer); the container's own logs were silent throughout.
- Host agent journal shows exactly three tunnel connections (`connIndex=0,1,2`)
  at shutdown — the channels that were silently absorbing a share of traffic.
- Removing the host agent changed the failure rate from 30–60% to **0/60**
  across three samples. Causal, not correlational.

**Contributing factors:**
1. Two repo guides (`oracle-setup.sh`, `ORACLE-MIGRATION.md`) created the host
   systemd agent; the compose stack runs its own — nothing said "never both".
2. The Sep 26 partial fix (config rewrite + compose agent) did not stop the
   old host agent.
3. No external uptime check existed, so a ~30–60% error rate ran for days
   before being reported (tracked: F10).
4. `cloudflared` pinned as `:latest` and running an outdated `2026.6.1`
   complicates forensics (tracked: F5).

## 4. Resolution

```bash
sudo systemctl stop cloudflared && sudo systemctl disable cloudflared
```

- Blast radius: the redundant host agent only. The healthy compose agent kept
  serving; no data, containers, config or deploy involved.
- Verification: `200 × 20` end-to-end via Cloudflare, three consecutive
  samples; browser load confirmed clean.
- Rollback: none — the stopped unit only 502'd traffic. (`systemctl enable
  --now cloudflared` would restore the fault and must never be run.)

## 5. Prevention (landed in this repo)

| Change | Where |
|---|---|
| Deploy preflight **0e** refuses to run while a host-level `cloudflared` unit is active/enabled (prints the remediation; never auto-kills) | `deploy/vps-deploy.sh` |
| Setup no longer creates a host systemd unit; warns with remediation if one exists; ingress template uses Docker service names | `deploy/oracle-setup.sh` |
| Step 8 rewritten around the single-agent rule, with incident callout | `deploy/ORACLE-MIGRATION.md` |
| **Third invariant — exactly one tunnel agent**, with detection commands | `deploy/VPS-RUNBOOK.md` |
| Troubleshooting row for the intermittent-502 signature + verify loop | `deploy/VPS-RUNBOOK.md` |

## 6. Action items

| ID | Item | Sev | State |
|---|---|---|---|
| F-1 | Repo cannot recreate the double-agent trap (above) | P1 | **done** (`7d47236`) |
| F-2 | Offsite backups (`backup-to-r2.sh` not installed; DB dumps live only on the VPS disk) | **P1 data-loss** | **in progress** — approved 2026-09-28; repo-side done (rclone/aws transport), host install pending |
| F-3 | Restore-test the existing dumps (`restore-verify.sh`) | P1 | **in progress** — approved 2026-09-28; host restore-test pending |
| F-4 | Deploy #437 security fixes via the gate sequence | P1 sec. | open — gated process |
| F-5 | Pin/upgrade cloudflared (`:latest` → `2026.9.3`) | P2 | **in progress** — approved 2026-09-28; pinned in compose (runbook §F), host apply pending |
| F-7 | Identify the Sep 25 reboot trigger; constrain surprise reboots | P2 | open |
| F-9 | Add healthchecks for `cloudflared` + `postgres-backup` | P2 | **in progress** — approved 2026-09-28; in compose (runbook §F), host apply pending |
| F-10 | External uptime check wired to a human | P2 | open |

## 7. Lessons

1. **"Healthy inside" is not "healthy outside."** Every container was green
   while half of all requests died. The decisive test was a loop through the
   public URL *from the server itself*, plus the user's own browser.
2. **Silence is evidence.** The container logged nothing precisely because the
   dying requests never reached it — the absence of logs narrowed the fault to
   the layer in front.
3. **A migration that replaces a component must retire the old one.** The
   port-unbind rollout and the Sep 26 fix both changed the front door while a
   legacy doorman kept a key.
4. **Reproducible randomness localises fast.** A steady ~30–50% split between
   two outcomes screams "two paths, one broken" long before the logs name it.

---

*Commands in this document are safe to re-run read-only except the fix line in
§4, which has already been applied on the live box. Keep credentials and
connection strings out of any follow-up evidence pasted into issues or chat.*

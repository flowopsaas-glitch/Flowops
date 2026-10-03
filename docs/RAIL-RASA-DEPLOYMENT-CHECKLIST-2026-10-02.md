# RASA Rail release — gated VPS deployment checklist (prepared 2026-10-02)

**Status: PREPARED — NOTHING IN THIS DOCUMENT HAS BEEN RUN.** No command here has been executed on the VPS, by the agent that
wrote it or by anyone else. Every step that changes anything waits for the operator's exact words `approved: N`.

This is the deployment half of the "TRIM Network Statement V4 (RASA 17-document suite) & AI Security Hardening" release. The
evidence behind every number below is in `RAIL-RASA-AUDIT-2026-10-02.md` (§4.1, §5.1, §5.8); the rollback SQL in §6.3 and the
expected object counts were computed and checked on a real PostgreSQL engine by `docs/tools/verify-migrations-pglite.mjs`.

## The rules (the same as `RELEASE-RUNBOOK-2026-10-01.md`)

1. **One action per message, every command ends with `; echo done`.** Paste the output back. Do not continue past a surprise.
2. **Read-only first.** The `R` and `V` steps change nothing and need no approval. Every other step needs the operator to say
   `approved: N` for **that** N; an approval covers that one step only and lapses if a *Stop if* condition fires.
3. **Never print secrets or `.env`.** No command here prints an environment value. The only `.env` access is `grep -c` (a count);
   database credentials reach Prisma through the compose service's own environment, never through a command line.
4. **Backup before any change, and a rollback for every change** (§6). The backup (Step 1) is proven restorable (Step 2) before anything is altered.
5. **Nothing destructive on the deployment path:** no `prisma migrate reset`, no `db push`, no `--accept-data-loss`, no hand-edited
   ledger rows. (The rollbacks of §6 are destructive by nature; each needs its own approval and is described as such.)

`<RELEASE_SHA>` is the commit on `main` that contains the merged release PR; `<PREVIOUS_SHA>` is what R4 prints.

## 0. What is being released — the blast radius, precisely

| | |
| --- | --- |
| **Schema** | **3 additive migrations**: `20261002050000_rail_wave2_reference_slots_compliance`, `20261002060000_rail_wave3_changes_possessions_occurrences_dg`, `20261002070000_rail_wave4_tariffs_ancillary_weighbridge`. Together: **12 `CREATE TABLE`, 23 `CREATE TYPE`, 39 indexes (27 explicit + 12 primary keys), 19 `ALTER TABLE … ADD COLUMN`** (`wagons` +9, `rail_consignments` +10). **No DROP, no `ALTER COLUMN`, no foreign key, no data statement** (`node scripts/review-migration.mjs` → *Destructive operations: none*). |
| **Object counts** (tables \| enums \| indexes \| FKs) | now `133\|72\|362\|150` → after `145\|95\|401\|150`. The "now" figures are the ones recorded after the 2026-10-01 adoption, and applying only those two migrations to a real engine reproduces them exactly. |
| **Locks** | Each `ADD COLUMN` takes a very short `ACCESS EXCLUSIVE` lock on `wagons` / `rail_consignments`. PostgreSQL 16 (`postgres:16-alpine`) adds a column with a constant default (or none) **without rewriting the table**, so the lock is held for milliseconds — but it queues behind any open transaction on that table, and everything queues behind *it*. That is why R8 (no long transaction, no running dump) is checked immediately before Step 5. |
| **Why the old app is unaffected** | New columns are nullable or have a constant default (`holdStatus` `'NONE'`, `isDangerousGoods` `false`); the old Prisma client selects only the columns it knows and ignores new tables. So the schema can be migrated **while the old app keeps serving**, and the app can be rolled back **without rolling the schema back**. |
| **Data written by the migrations** | None. The 12 new tables start empty. |
| **Data written by the optional seeder (Step 7)** | 201 reference rows in 3 platform-wide tables: 6 corridors, 82 cancellation codes, 113 Annexure 40 lines. Without it the API serves the same data from the code catalogues. |
| **What changes when the new app starts (Step 6)** | (a) **AI safety:** `AiDevOpsService.repairScript()` (reachable from the hourly watchdog when it detects a fault) and `PATCH /ai-diagnostics/simulate-chaos` are **OFF in production** unless `ALLOW_AI_SELF_REPAIR` / `ALLOW_AI_CHAOS_SIMULATION` is exactly `true` (R10 confirms neither is set); AI chat input is screened and refused above the policy threshold. (b) **Rail** (an Enterprise feature — other tenants are unaffected): new routes under `/rail/slots`, `/rail/changes`, `/rail/possessions`, `/rail/occurrences`, `/rail/tariffs`, `/rail/weighbridge`; a dangerous-goods gate and a weighbridge-hold gate on `DEPARTED` / `IN_TRANSIT` / `AT_INTERCHANGE`. (c) **Two new hourly jobs** (the possession status sweep, and the slot-application sweeps: 60-day mobilisation / forfeiture and compliance-document expiry) beside the existing handshake one. (d) Rail request validation is stricter (real JSON booleans and numbers only). |
| **Not changed** | `.env` (no new required variable), `docker-compose*.yml`, the Dockerfiles, `deploy/*` scripts, the `driver-portal` image, every non-rail module's behaviour. |

## 1. Before the VPS (no VPS access needed)

- **A1** — CI on the release PR is green, **including the "Verify migrations match the schema (drift guard)" job**, which uses Prisma's real schema engine (the authoring environment could not run it; this is the authoritative check).
- **A2** — The owner has reviewed and **merged** the PR to `main`. Record the merge commit as `<RELEASE_SHA>`. (`deploy/vps-deploy.sh` runs `git pull --ff-only`, so the VPS deploys whatever `origin/main` is — R11 checks nobody merged anything after the release.)
- **A3** — A quiet window is agreed: Step 4 builds an image on the live host and competes with the running containers for CPU, memory and disk.
- **A4** — The owner has seen the decisions in `RAIL-RASA-AUDIT-2026-10-02.md` §5.10 (D20 – D28), in particular **D25 (VAT)**, and the open data requests in §6 of that document: **this release prices nothing until tariff rates are supplied** — the Tariffs tab will say so.

## 2. Read-only preflight — no approval needed

Run these one at a time. Each says what to expect and when to **stop**.

**R1 — disk headroom.** Expect at least 3 GB free. *Stop if* less (an image build needs it).
<!-- CMD read-only R1 -->
```text
df -h / | tail -2; echo done
```

**R2 — the stack is up and healthy.** Expect `api`, `postgres`, `redis`, `frontend` running; `postgres` and `api` healthy. *Stop if* anything is restarting or unhealthy.
<!-- CMD read-only R2 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps; echo done
```

**R3 — the live checkout has no local changes.** Expect `0`. *Stop if* not.

> **Corrected 2026-10-03.** An earlier draft justified this check with "`vps-deploy.sh` refuses a dirty tree". **That is false and
> was disproved during this deployment.** `deploy/vps-deploy.sh` has no dirty-tree check of its own: its only guard is
> `git pull --ff-only` (line 124), which dies solely when a local modification **collides** with the incoming commit. Untracked
> files never block it, and neither does a modification to a file the release does not touch. On 2026-10-03 this check returned
> `4`, not `0`, and the release proceeded anyway because all four entries were untracked and non-colliding.
>
> **R3 is therefore a gate this document imposes, not one the tooling imposes** — and it matters for exactly one reason: Step 3's
> rollback is `git reset --hard <PREVIOUS_SHA>`, which silently destroys modifications to tracked files. Run it, and if it is not
> `0`, identify every entry before going further. `git diff --stat` is the discriminator — empty output means every *tracked* file
> matches the release exactly and only untracked artefacts remain, which `reset --hard` cannot destroy.
<!-- CMD read-only R3 -->
```text
git -C /root/FlowOps status --short | wc -l; echo done
```

**R4 — what is deployed now.** **Record this** — it is `<PREVIOUS_SHA>`, the rollback target for the code.
<!-- CMD read-only R4 -->
```text
git -C /root/FlowOps log -1 --format='%H %D %s'; echo done
```

**R5 — the images running now.** **Record both ids** — they are `<OLD_API_IMAGE_ID>` and `<OLD_FRONTEND_IMAGE_ID>`, which make the application rollback a re-tag instead of a rebuild.
<!-- CMD read-only R5 -->
```text
docker inspect --format '{{.Name}} {{.Image}}' flowops-api-1 flowops-frontend-1; echo done
```

**R6 — the migration ledger.** Expect exactly two rows, both finished and not rolled back:
`20260926130650_init|true|false` and `20260930143000_add_process_book_product_master|true|false`. *Stop if* a row is missing, unfinished or rolled back.
<!-- CMD read-only R6 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT migration_name || '|' || (finished_at IS NOT NULL) || '|' || (rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY started_at"; echo done
```

**R7 — the schema as it is.** Expect `133|72|362|150`. *Stop if* different: the live schema is not the one this checklist was written against.
<!-- CMD read-only R7 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' || (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public')"; echo done
```

**R8 — no long transaction and no dump in progress.** Expect `0`. *Stop if* not: an `ALTER TABLE` would queue behind it and block every query on that table. Wait, re-run, and **run it again immediately before Step 5**.
<!-- CMD read-only R8 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT count(*) FROM pg_stat_activity WHERE state <> 'idle' AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()"; echo done
```

**R9 — how big the two altered tables are** (informational: adding columns is metadata-only either way).
<!-- CMD read-only R9 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT (SELECT count(*) FROM rail_consignments) || '|' || (SELECT count(*) FROM wagons)"; echo done
```

**R10 — the AI safety switches are not set in `.env`.** Prints a **count only**, never a value. Expect `0`. *Stop if* not: someone enabled self-repair or chaos simulation on purpose — ask the owner before deploying.
<!-- CMD read-only R10 -->
```text
grep -c '^ALLOW_AI_' /root/FlowOps/.env; echo done
```

**R11 — nobody merged anything after the release.** Run it again immediately before Step 6. The two hashes printed (`origin/main`, then `HEAD`) must both equal `<RELEASE_SHA>` once Step 3 is done. *Stop if* `origin/main` is ahead of `<RELEASE_SHA>`: `vps-deploy.sh` would deploy commits nobody checked.
<!-- CMD read-only R11 -->
```text
git -C /root/FlowOps fetch origin && git -C /root/FlowOps rev-parse origin/main HEAD; echo done
```

## 3. The gated steps

### Step 1 — backup · `approved: 1`

Forces a **fresh** dump right now and pushes it to R2. **This backup is the disaster-recovery rollback.**

> **Why the command is chained (corrected 2026-10-03).** An earlier draft ran `/usr/local/bin/flowops-backup-r2 --backup-only` alone
> and described it as "dumps the live database". It does not. That binary (`deploy/item2-r2-runner.sh`, installed byte-identical —
> `sha256 d9b84bd071172314ef0d81f0a1eaa7b75493bcbf531fa031f1eae9b2e91b6927`) *finds the newest existing* `/backups/flowops_*.sql.gz`,
> and `die`s with `newest local dump is older than 12 hours; local backup freshness is not proven.` if it is stale — there is no
> `pg_dump` in that code path. The only thing that produces a dump is the `postgres-backup` service
> (`deploy/docker-compose.vps.yml`), whose loop dumps **immediately on container start** and then sleeps 6 h. So `docker restart`
> is what makes the dump happen, and the sleep gives the loop time to write and validate it (`>10 KB` + `gzip -t`, written as
> `.partial` and only then renamed). If the restart had not landed a dump, the runner's own 12-hour guard would have stopped the
> step instead of uploading something stale — the failure mode is a red step, never a false-confidence backup.

- **Blast radius:** `docker restart flowops-postgres-backup-1` — that service is a stateless `pg_dump` loop, so restarting it only
  makes it re-dump; its healthcheck has `start_period: 5m`, so it reads `starting` for a few minutes. **The live `api`, `postgres`
  and `redis` containers are not touched.** Then: one new `flowops_YYYYMMDD_HHMMSS.sql.gz` (~260 KB) in the `flowops_postgres-backups`
  volume (retention trims to the newest 28), ~2 minutes of `pg_dump` CPU/IO inside a container capped at 128 MB, one new R2 object,
  and a round-trip download of the same file to compare SHA-256. **Also note the runner's last act is a 30-day prune**
  (`rclone delete … --min-age 30d` under `flowops-backups/backups/`) — off-box objects older than 30 days are deleted. That is its
  design (`RETENTION_DAYS=30`) but it is a write to production backup storage, not a no-op. Nothing in the live database changes.
- **Rollback:** none needed.
<!-- CMD approved 1 -->
```text
docker restart flowops-postgres-backup-1 && sleep 120 && /usr/local/bin/flowops-backup-r2 --backup-only; echo done
```

Then confirm the newest `flowops_*.sql.gz` is from this run (**V0**, read-only), and cross-check it from inside the container
(**V0b**, read-only) so the check does not depend on the volume's host path. *Stop if* it is not fresh.
<!-- CMD read-only V0 -->
```text
ls -lt /var/lib/docker/volumes/flowops_postgres-backups/_data | head -3; echo done
```
<!-- CMD read-only V0b -->
```text
docker exec flowops-postgres-backup-1 sh -c 'ls -lt /backups/flowops_*.sql.gz | head -3'; echo done
```

### Step 2 — prove the backup restores · `approved: 2`

"An untested backup is not a backup." `deploy/restore-verify.sh` loads the newest local dump into a **throwaway** database inside the
same postgres container, counts rows, and drops the throwaway database. It **never touches the live database**.

- **Blast radius:** creates and drops a temporary database in the live postgres container (some CPU and disk for a minute).
- **Rollback:** none needed (the throwaway database is dropped by the script; if it was interrupted, drop it by name).
- *Stop if* the restore reports errors — do not go on to Step 3.
<!-- CMD approved 2 -->
```text
cd /root/FlowOps && bash deploy/restore-verify.sh --latest-local; echo done
```

### Step 3 — move the checkout to the release commit · `approved: 3`

Fast-forwards `/root/FlowOps` to `<RELEASE_SHA>` (R11 has already fetched). **The running containers are not touched** — they keep
running their current images.

- **Blast radius:** the source files in the live checkout change; nothing running changes.
- **Rollback:** `git -C /root/FlowOps reset --hard <PREVIOUS_SHA>` (§6.2; safe — R3 proved the tree was clean and this step only fast-forwards).
- *Stop if* git says anything but "Fast-forward" / "Already up to date".
<!-- CMD approved 3 -->
```text
git -C /root/FlowOps merge --ff-only <RELEASE_SHA>; echo done
```

### Step 4 — build the new API image (no restart) · `approved: 4`

Builds the `api` image from the release source so that Step 5 can run the migration **with the new migration files while the old app
keeps serving**. It does not restart anything.

- **Blast radius:** CPU, memory and disk on the host for the duration of the build; the `flowops/backend:latest` tag moves to the new image (the old image stays on disk, still used by the running container, and is what `<OLD_API_IMAGE_ID>` names).
- **Rollback:** none needed; `docker image prune` is optional housekeeping afterwards.
- *Stop if* the build fails — nothing has changed.

**Why the command below is not the plain `… build api`.** Measured on a 2 GB host: `Mem 1.9 Gi total / 891 Mi used / 1.0 Gi available`,
`Swap 2.0 Gi total / 546 Mi used / 1.5 Gi free`. The build step is `nest build` (tsc), and this release adds 48 files under
`backend/src/rail`, so it is the largest compile this project has done. Two consequences:

1. **The heap must be raised.** `backend/Dockerfile` has **no `ARG NODE_OPTIONS`** and there is no build-memory convention anywhere
   in `deploy/`, so `NODE_OPTIONS` cannot be injected any other way. This step therefore adds two lines to the **builder** stage,
   immediately before `RUN npx prisma generate` (so the `npm ci` layer stays cached — no lockfile change in this release), builds,
   and **unconditionally restores the file afterwards**. The production stage is a separate `FROM`, so `ENV` does not propagate:
   **the shipped image gets no `NODE_OPTIONS`.** The insertion is anchored on `/^RUN npx prisma generate$/` rather than a line
   number and was verified against a copy of the Dockerfile before being written here.
2. **The build is memory-capped with `--memory 1792m`.** Protection for the live stack does not rest on this flag alone (see below),
   but it is the belt to the braces: if the daemon honours it, the build is confined to its own cgroup.

**Why live survives even though the cap (1.75 Gi) is most of the box.** Every live service already carries a hard cgroup limit —
`api` 768M, `postgres` 384M, `redis` 96M, and 128M each for `frontend`, `driver-portal`, `cloudflared` and `postgres-backup`
(~1.72 GiB of limits, ~0.81 GiB of reservations, which is the `891 Mi used` observed). They cannot grow, so they cannot be the
processes that exhaust memory. An uncapped build would be by far the largest consumer and is what the OOM killer would take first.
The residual risk is *slowness*, not death: if the build spills, it swaps (1.5 GiB free), and the API stays up but sluggish.
Nothing is restarted by this step.

**If it OOMs, the ladder is** (each retry is its own approval): raise to `--memory 2304m --build-arg NODE_OPTIONS=--max-old-space-size=2048`,
still leaving live protected by its own caps. Do **not** delete `--memory` to make the build succeed.

<!-- CMD approved 4 -->
```text
cd /root/FlowOps && cp backend/Dockerfile /root/Dockerfile.pre-step4 && sed -i -e '/^RUN npx prisma generate$/i ARG NODE_OPTIONS=""' -e '/^RUN npx prisma generate$/i ENV NODE_OPTIONS=${NODE_OPTIONS}' backend/Dockerfile && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml build api --memory 1792m --build-arg NODE_OPTIONS=--max-old-space-size=1536; echo "BUILD_EXIT=$?"; cp /root/Dockerfile.pre-step4 backend/Dockerfile; git -C /root/FlowOps diff --stat; echo done
```

### Step 5 — apply the three migrations, while the old app is still serving · `approved: 5`

Runs `prisma migrate deploy` **once**, in a throw-away container started from the freshly built image (`docker compose run --rm --no-deps`).
It uses the compose service's own `DATABASE_URL`, so no credential is typed or printed. It applies only the three pending migrations.
**Run R8 again immediately before this.**

- **Expect:** the ledger already holds 2 migrations; Prisma lists the 3 new ones, applies them in order, and ends with *All migrations have been successfully applied* (wording approximate).
- **Blast radius:** the schema additions in §0; 3 new rows in `_prisma_migrations`. No existing column, row or table is modified. The old app is unaffected (§0).
- **If it fails part-way:** PostgreSQL runs a migration script as a single implicit transaction, so a migration that fails leaves nothing of itself behind, and Prisma marks it failed in the ledger — *expected, not verified here*; re-run R6 and R7 to see the state, then follow §6.1. **Do not** run `migrate resolve` or edit the ledger without a separate approval.
- **Rollback:** §6.3 (surgical) or §6.4 (restore). Neither is needed for an application rollback.
<!-- CMD approved 5 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy; echo done
```

Verify straight away (read-only):

**V1 — the ledger.** Expect `5|0` (five applied, none failed).
<!-- CMD read-only V1 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' || count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) FROM _prisma_migrations"; echo done
```

**V2 — the schema.** Expect `145|95|401|150`.
<!-- CMD read-only V2 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' || (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public')"; echo done
```

**V3 — the twelve new tables are empty.** Expect `0`.
<!-- CMD read-only V3 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT (SELECT count(*) FROM rail_corridor_nodes) + (SELECT count(*) FROM rail_yard_specs) + (SELECT count(*) FROM rail_operator_compliance_docs) + (SELECT count(*) FROM rail_slot_applications) + (SELECT count(*) FROM rail_cancellation_codes) + (SELECT count(*) FROM rail_slot_change_requests) + (SELECT count(*) FROM rail_possession_windows) + (SELECT count(*) FROM rail_occurrence_reports) + (SELECT count(*) FROM rail_tariff_schedules) + (SELECT count(*) FROM rail_ancillary_services) + (SELECT count(*) FROM rail_weighbridge_readings) + (SELECT count(*) FROM rail_tariff_calculations)"; echo done
```

**V4 — the old app is still healthy against the new schema.** Expect `ok` (or the health JSON the API normally returns).
<!-- CMD read-only V4 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api sh -c 'wget -qO- http://localhost:3000/health'; echo done
```

### Step 6 — swap the application · `approved: 6`

The standard deploy, `deploy/vps-deploy.sh`: it pulls (a no-op now), builds, recreates the containers whose image changed, runs
`prisma migrate deploy` (now *No pending migrations to apply*), runs the plan-limit pre-flight and checks health. **Run R11 first.**
If it asks whether to continue because tenants are over plan limits, answer **N** and report what it printed.

- **Blast radius:** the `api` and `frontend` containers are recreated: a few seconds of API unavailability and WebSocket reconnects. `postgres`, `redis` and `cloudflared` are **not** recreated — they are image-based services that `compose build` never touches. **`driver-portal` is usually not recreated either, but do not rely on it** — see the correction below. The behaviour changes in §0 take effect.

> **Corrected 2026-10-03.** An earlier draft said "`driver-portal`, `postgres` and `redis` are not recreated (their images are
> unchanged)". **That proved wrong.** On 2026-10-03 `driver-portal` *was* rebuilt (31.3 s) and recreated, even though this release
> changes not one file under `driver-portal/`. The cause is that both `frontend` and `driver-portal` build
> `FROM node:20.18-alpine` — a **tag**, not a digest — and that tag's digest had moved since the last build. A moved base image
> invalidates `FROM` and every layer after it, so a service whose source is untouched still rebuilds. (It is the same reason the
> frontend did not come from cache.) It is harmless here — a static nginx SPA, recreated in seconds and healthy — but the
> blast-radius claim was wrong, and an operator who believed it would be surprised by an extra service restarting. The accurate
> statement is: **a service is recreated whenever its image id changes, and an image id can change without any source change.**
- **Rollback:** the application can go back **without touching the schema** (§6.2).
- *Stop if* the script exits non-zero, or the final health line is empty.

**Why the command below pre-builds `frontend` first.** `vps-deploy.sh` line 128 runs `$COMPOSE build` with **no service filter**, and
this release changes 21 files under `frontend/src/pages/rail`, so the frontend build runs for real — on a 1.9 Gi box, with
`frontend/package.json` hardcoding `node --max-old-space-size=8192`. That is a *ceiling*, not an allocation: V8 only commits pages
it actually uses, but with an 8 GiB ceiling it will not GC aggressively before hitting whatever the host can give it, and an
uncapped build is what a host-wide OOM would land on. Pre-building the frontend with `--memory 1600m` bounds it to its own cgroup,
so the worst case is a **clean kill of the build**, not pressure on `postgres`. `&&` means that if the build fails, `vps-deploy.sh`
never runs and **nothing is recreated**.

This is belt-and-braces, not the primary protection: `vps-deploy.sh` runs under `set -euo pipefail` (line 51), so it aborts at
`$COMPOSE build` (line 128) **before** `$COMPOSE up -d` (line 132) — a build failure cannot leave the stack half-swapped. And every
live service carries its own cgroup cap (`api` 768M, `postgres` 384M, `redis` 96M, 128M each for `frontend`, `driver-portal`,
`cloudflared`, `postgres-backup`).

**What `vps-deploy.sh` will then do, in order:** pre-flight (Compose ≥ 2.24.4 ✓ at 5.5.1, Cloudflare tunnel must not target
`127.0.0.1`/`localhost`, host `cloudflared.service` must be inactive, `scripts/check-compose-ports.sh`, and `.env` must contain
`VITE_API_URL=/api/v1` plus `POSTGRES_PASSWORD`/`JWT_SECRET`/`OWNER_SEED_EMAIL`/`OWNER_SEED_PASSWORD`/`CORS_ORIGINS`) →
`git pull --ff-only` (a no-op) → `$COMPOSE build` (api and driver-portal cached; frontend already built above) → `$COMPOSE up -d`
→ wait for Postgres healthy → `prisma migrate deploy`, now *No pending migrations to apply* → plan-limit pre-flight → health.
**If it asks whether to continue because tenants are over plan limits, answer `N` and report what it printed.**

<!-- CMD approved 6 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml build frontend --memory 1600m && ./deploy/vps-deploy.sh; echo done
```

Verify (read-only):

**V5 — containers and migration status.** Expect everything running/healthy, and *Database schema is up to date!*
<!-- CMD read-only V5 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml ps; echo done
```

<!-- CMD read-only V5b -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api ./node_modules/.bin/prisma migrate status; echo done
```

**V6 — the API's health, and the count of error lines since the swap.** The first prints the health response; the second prints
**a number only** — expect `0`, or a small number you can explain. If it is not 0, ask for the *matching lines* (trimmed) rather
than the log.

> **Corrected 2026-10-03.** The original V6b pattern was `grep -ciE 'error|exception|prisma'`, which is **too blunt for this
> codebase and will never read `0`**. It matches `PrismaModule`/`PrismaService` startup lines by construction, and it matches
> route names whose *paths* contain the substrings — on this deployment all 7 hits were exactly that:
> `/api/v1/observability/client-error`, `/api/v1/operations/exception-sla`, `/api/v1/owner/observatory/errors` (+ two
> sub-routes), plus `[InstanceLoader] PrismaModule dependencies initialized` and `[PrismaService] Database connected`.
> Zero real errors. The corrected command below drops route-registration lines first (`grep -v 'Mapped {'`), then counts only
> real log severities, case-sensitively.
<!-- CMD read-only V6 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api sh -c 'wget -qO- http://localhost:3000/health'; echo done
```

<!-- CMD read-only V6b -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml logs --since 15m api 2>&1 | grep -v 'Mapped {' | grep -cE 'ERROR|Exception|Error:|UnhandledPromiseRejection|FATAL'; echo done
```

### Step 7 (optional) — load the reference data · `approved: 7`

Loads the platform-wide reference tables from the code catalogues. **Optional:** until it runs, the API serves the same data from the code
catalogues (the seeder only lets operators edit, verify or deactivate rows). It is idempotent, never downgrades a VERIFIED row,
never overwrites a PUBLISHED rate, never reactivates a deactivated row, and refuses to write anything if a catalogue entry fails validation.

First the **plan** (read-only — it writes nothing). **V7** — expect, on an empty database:

```text
PLAN (nothing written):
  rail_corridor_nodes: catalog 6 | create 6 | update 0 | unchanged 0 | skipped (already VERIFIED) 0
  rail_yard_specs: catalog 0 | create 0 | update 0 | unchanged 0 | skipped (already VERIFIED) 0
  rail_cancellation_codes: catalog 82 | create 82 | update 0 | unchanged 0 | skipped (already VERIFIED) 0
  rail_ancillary_services: catalog 113 | create 113 | update 0 | unchanged 0 | skipped (already VERIFIED) 0
  rail_tariff_schedules: catalog 0 | create 0 | update 0 | unchanged 0 | skipped (already VERIFIED) 0
```
<!-- CMD read-only V7 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api node prisma/seed-rail-reference.js --plan; echo done
```

*Stop if* the plan shows anything but those numbers, or any `!` note line.

Then the apply:

- **Blast radius:** 201 rows inserted into `rail_corridor_nodes`, `rail_cancellation_codes`, `rail_ancillary_services`. No other table.
- **Rollback:** §6.2 (these three tables were empty before — the plan shows it).
<!-- CMD approved 7 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api node prisma/seed-rail-reference.js --apply; echo done
```

**V8 — it is idempotent.** Run the plan again: every line must now read `create 0 | update 0` with `unchanged` equal to the catalogue count.
<!-- CMD read-only V8 -->
```text
cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api node prisma/seed-rail-reference.js --plan; echo done
```

## 4. Manual smoke test (the owner; creates nothing)

Log in as an **Enterprise** tenant administrator. No record needs to be created in production.

1. **Rail & Intermodal** shows four tabs: *Consignments*, *Slot Applications & Compliance*, *Changes & Possessions*, *Tariffs & Weighbridge*.
2. **Tariffs & Weighbridge** shows a red banner *No corridor has a VERIFIED c/GTK rate loaded — nothing can be priced yet*, `0 / 6` corridors, `113` Annexure 40 lines (0 published · 8 TBD · 105 with no price published), and the brief's constants labelled *(unverified)*. Pressing *Calculate* on a consignment is refused with reasons — **that is the correct behaviour**, not a fault.
3. **Changes & Possessions** loads (empty); the *New request* dialog lists the 82 Annexure 20b reasons.
4. Open a consignment: *Dangerous goods* and *Weighbridge & load* sections render.
5. A tenant **without** the Enterprise plan still gets the existing "Enterprise feature" message on Rail — unchanged.
6. **Invoice Drafts** opens (it now shows a draft's real client and value, before VAT).

## 5. Execution log

Fill in as each step is approved and run (UTC time, who approved, the one-line outcome). Do not paste secrets.

| Step | Approved by / when | Outcome |
| --- | --- | --- |
| R1 – R11 | 2026-10-03, Kader | **R5 now captured.** Confirmed: R1 (13 GB free), R2 (8 containers), R4 (`03b181a7faf7968c9f57786d811b994ea4260346 HEAD -> main ops(release): … (#440)`), R5 (`api` = `sha256:d85bd522c3ca5f774993ffee3034ac824460a268031f1c27eb91417ff7757292`, `frontend` = `sha256:09fb0305e200d62e6781bc4a0381e3347055c82affdd7cd8b4bf7ef39fea412e`), R6 (ledger 2 rows), residue check `none`. **R3 resolved as benign — see Step 3.** Host: `Mem 1.9 Gi / 891 Mi used / 1.0 Gi avail`, `Swap 2.0 Gi / 1.5 Gi free`, Docker 29.8.1, Compose 5.5.1. R7/R8/R10/R11 not yet pasted (R8 must be re-run immediately before Step 5). |
| 1 backup | 2026-10-03 11:28–11:30 UTC, Kader | **PASS.** Fresh dump `flowops_20261003_112847.sql.gz` (260,395 B) produced by the restart, uploaded to `flowops-r2:flowops-backups/backups/2026/10/`, R2 round-trip verified (gzip + SHA-256), 30-day prune completed. V0 + V0b agree: newest dump is from this run. Observation, not a blocker: the backup container had also dumped at 08:11 and 11:17 UTC today — the 6-hourly cadence in the compose comment is not what is actually happening. |
| 2 restore-verify | 2026-10-03 11:40 UTC, Kader | **PASS.** `deploy/restore-verify.sh --latest-local` picked the Step 1 dump `flowops_20261003_112847.sql.gz` (260,395 B), restored it into throwaway `flowops_verify_1791027638` in ~1 s, and printed `VERIFY PASSED` with core counts `companies: 2 · users: 10 · drivers: 20 · waybills: 81 · collections: 19`. No `psql reported issues during restore` warning. Temp DB drop was reported. **Residue check since closed:** `SELECT coalesce(string_agg(datname,','),'none') FROM pg_database WHERE datname NOT IN ('flowops','postgres','template0','template1')` → `none`, so the temp DB really is gone. Live database untouched. |
| 3 checkout | 2026-10-03 ~11:5x UTC, Kader | **EXECUTED — fast-forward succeeded, but on a dirty tree. Anomaly OPEN.** `git merge --ff-only be1792dc…` printed `Updating 03b181a..be1792d / Fast-forward / 153 files changed, 27566 insertions(+), 237 deletions(-)`, matching the locally-computed `git diff --shortstat 03b181a be1792d` exactly, and the three migration files plus `prisma/seed-rail-reference.js` are all present in the `create mode` list. **However R3 had returned `4`, not `0`:** four unidentified entries existed in `/root/FlowOps` before the merge and the *Stop if* was not honoured. Because git refuses a fast-forward that would overwrite modified tracked files, the four entries did not collide with the 153 — but that is inference, not evidence. **Anomaly resolved 2026-10-03:** the four entries are `?? flowops-rehearsal-apply-report.md`, `?? flowops-rehearsal-apply-report.stdout`, `?? flowops-rehearsal-report.md`, `?? flowops-rehearsal-report.stdout` — all **untracked** prior-session rehearsal artefacts in the checkout root, and `git -C /root/FlowOps diff --stat` is **empty**, i.e. every tracked file matches `be1792d` exactly. Consequences: `reset --hard` (`approved: 8`) cannot destroy them (it never touches untracked files), so it is valid again; they are outside both build contexts (`context: ./backend`, `context: ./frontend`) so they cannot be baked into an image; and an untracked file never blocks `git pull --ff-only` at Step 6. **Step 3 is PASS.** One residual: they are loose files in a git checkout, so a future `git add -A` in `/root/FlowOps` would commit them — post-release housekeeping, not a blocker. |
| 4 build | 2026-10-03, Kader | **`BUILD_EXIT=0` but every layer came from cache — VERIFICATION PENDING, Step 5 must not run yet.** The whole build finished in **0.3 s** with `CACHED` on `COPY src ./src`, `RUN npx prisma generate` and `RUN npm run build`, and it only transferred a **31.39 kB** context where the dockerignore-filtered `backend/` tree is **~4.7 MB** (452 files, `src` alone 4.3 MB). A cache hit is not automatically stale — BuildKit cache keys are content-addressed, so a hit means *this exact content was built before on this daemon* — but it is unproven, and an image built from pre-release content would make Step 5's `prisma migrate deploy` report *No pending migrations* and send Step 6 forward against an unmigrated schema. Two signals initially read as "the Dockerfile edit did not apply" were **wrong and are recorded as such**: (a) `builder 10/10` — BuildKit does not number `ARG`/`ENV`, which the same build proves (the production stage has `ARG NODE_ENV` + `ENV NODE_ENV` and reports `13/13`); (b) `transferring dockerfile: 2.99kB` — modified file is 2 948 B, original 2 895 B, so the figure is consistent with either. **Nothing is running the new tag: the live `api` container still uses `<OLD_API_IMAGE_ID>`, so the only thing that changed on disk is the `flowops/backend:latest` tag. Zero blast radius on live.**

**Subsequently verified — the image IS the release, so Step 4 is PASS.** `docker run --rm flowops/backend:latest sh -c '…'` reports **5 migration directories** (all three `20261002*` rail waves, plus `migration_lock.toml`), **`dist/rail` holds 47 `.js` files** (exactly the 47 non-spec `.ts` files in `be1792d`'s `src/rail`; the old release had 10), and **`rail-tariff.service.js` is present**. Image id `sha256:4b3dc5eb23ace4fa27f9f9fa300ee01077b14f87fcb1247e2669c29130751b9f` differs from the running `api` image (`…d85bd522…`) and matches the build's `exporting manifest list` line. The cache hit is explained: byte-identical source had been built on this daemon before (the prior session's rehearsal at PR-branch content — a squash merge yields the same tree), so BuildKit's content-addressed cache hit legitimately. **Resolved at Step 6 — the backend does not need a raised heap at all.** Because `vps-deploy.sh` builds with the plain Dockerfile
and no build-arg (a different cache key), the `api` image was rebuilt for real: `[api builder 9/10] RUN npx prisma generate` 11.1 s
and **`[api builder 10/10] RUN npm run build` 71.9 s on the default heap**, no `NODE_OPTIONS` and no `--memory`. So the
`--max-old-space-size=3072` recipe this host previously required for tsc is **not needed for the backend**; the Step 4 cap was
precautionary, and a future run can drop it for `api`. **The frontend is the opposite case and is the real risk:**
`frontend/package.json` hardcodes `node --max-old-space-size=8192`, and because a CLI flag beats `NODE_OPTIONS`, the only way to
bound it is a container-level `--memory` — which is why Step 6 pre-builds `frontend` with `--memory 1600m`. That build took
83.5 s and completed without an OOM.
| 5 migrate | 2026-10-03, Kader | **Executed — `All migrations have been successfully applied.` V1–V4 PENDING, Step 6 must not start without them.** `docker compose … run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy` reported `5 migrations found in prisma/migrations` and applied exactly the three expected rail waves in order (`…050000_rail_wave2…`, `…060000_rail_wave3…`, `…070000_rail_wave4…`), then `All migrations have been successfully applied.` **V1–V4 all passed — Step 5 is PASS.** V1 `5|0`; V2 `145|95|401|150` (from `133|72|362|150`); V3 `0`; V4
`{"data":{"status":"ok","db":"connected","uptime":125551,…},"statusCode":200,"message":"success"}` — and that `uptime` of ~34.9 h proves the
`api` container was never restarted. The `flowops-api-run-*` migrate container was reaped (`docker ps -a --filter name=flowops-api-run`
→ empty). **R10 = `0`**, so `ALLOW_AI_SELF_REPAIR` and `ALLOW_AI_CHAOS_SIMULATION` are unset and the AI safety switches stay
fail-closed in production. The central claim of §0 — *the old Prisma client runs fine on the new schema* — is now verified in
production, not just reasoned about. |
| 6 deploy | 2026-10-03 13:17 UTC, Kader | **Executed — the new app is live. V5b and V6b PENDING.** Frontend pre-build was a genuine 83.5 s build under the 1600m cap (no OOM). `vps-deploy.sh` then passed every pre-flight, reported `Already up to date.` on the pull, built, recreated `api`/`frontend`/**and `driver-portal`**, reported `No pending migrations to apply`, found `tenants scanned: 2 / ✅ No tenant is over its plan limit` (so no prompt), confirmed `No container publishes a port on 0.0.0.0`, and ended with `api /health -> {"status":"ok","db":"connected","uptime":16,…}` and `Deploy complete.` **Three deviations from the predicted blast radius, all benign:** (1) `api` was rebuilt for real, not cached — `RUN npm run build` took **71.9 s on the default heap**, so the backend tsc build does **not** need the `--max-old-space-size=3072` recipe the host previously required; (2) `driver-portal` was also rebuilt and recreated (the checklist predicted it would not be) because `node:20.18-alpine`'s tag digest moved, invalidating `FROM` for it and the frontend; (3) **R11 was not pasted, but the deploy's own `Already up to date.` is equivalent evidence that `origin/main` == `HEAD` == `<RELEASE_SHA>`.** `postgres` (8 days), `redis` (8 days) and `cloudflared` (3 days) were untouched. **V5b and V6 since passed:** V5b `Database schema is up to date!`; V6 `{"status":"ok","db":"connected","uptime":705,…}`. **V6b resolved — Step 6 is PASS.** The 7 matches are **all `LOG`-level lines**: `[InstanceLoader] PrismaModule dependencies initialized`, `[PrismaService] Database connected`, and five `Mapped {…}` route-registration entries whose *paths* contain the substrings — `/api/v1/observability/client-error`, `/api/v1/operations/exception-sla`, `/api/v1/owner/observatory/errors`, `…/errors/:id/resolve`, `…/errors/:id/retriage`. The narrower `error\|exception` count was `5`, every one of them a route path. **Zero actual errors or exceptions in the first 30 minutes of the new app.** Note for next time: the checklist's `error\|exception\|prisma` grep is too blunt for this codebase — route names and `PrismaModule`/`PrismaService` startup lines match it by construction. |
| 7 seed (optional) | 2026-10-03, Kader | **PASS.** `--apply` created exactly the 201 rows the plan predicted — `rail_corridor_nodes` 6, `rail_cancellation_codes` 82, `rail_ancillary_services` 113 — with `update 0`, `skipped 0` and no `!` notes. **V8 then proved idempotency:** re-running `--plan` reports `create 0 | update 0` with `unchanged 6 / 82 / 113`, i.e. equal to the catalogue counts. |
| Smoke test (§4) | | **NOT YET RUN** — the owner's manual pass as an Enterprise tenant admin. See §4 for the six checks and for what *correct* looks like (the Tariffs red banner and the refused Calculate are the designed behaviour, not faults). |

## 6. Rollback — for every change

### 6.1 What to do, by where it went wrong

| It goes wrong at | State | Do this |
| --- | --- | --- |
| R-steps | nothing changed | fix the cause; do not continue past a *Stop if* |
| Step 1 or 2 | nothing changed in the live database | stop; fix the backup; do not start Step 3 |
| Step 3 | only the source files of the checkout | `approved: 8` (§6.2) |
| Step 4 | an extra image on disk | nothing to roll back |
| Step 5 fails part-way | a failed migration leaves nothing of itself behind (see Step 5) | re-run R6 and R7, report the output; choose between re-running after a fix, §6.3 or §6.4 — each needs its own approval |
| Step 5 succeeded, the old app is fine | schema added; old app serving | nothing is urgent: the schema is backward-compatible. Stop here if you want |
| Step 6 — the new app misbehaves | schema new, app new | **application rollback**, §6.2 (`approved: 9`) — the schema stays |
| Step 7 — wrong or unwanted rows | reference rows only | §6.2 (`approved: 10`) |
| A data or integrity problem | | §6.4 (restore, `approved: 12`) or §6.3 (schema rollback, `approved: 11`) |

### 6.2 Application-only and reference-data rollbacks (the schema is untouched)

**`approved: 8` — put the checkout back** (only if Step 3 was done and the images are not being rolled back):
<!-- CMD approved 8 -->
```text
git -C /root/FlowOps reset --hard <PREVIOUS_SHA>; echo done
```

**`approved: 9` — put the previous images back and restart the two services.** Uses the ids recorded at R5; the schema stays as it is
(the old application runs fine on the new schema, §0). If the old images have been pruned, check out `<PREVIOUS_SHA>` (approved: 8) and rebuild instead.
<!-- CMD approved 9 -->
```text
docker tag <OLD_API_IMAGE_ID> flowops/backend:latest && docker tag <OLD_FRONTEND_IMAGE_ID> flowops/frontend:latest && cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --no-build api frontend; echo done
```

**`approved: 10` — remove the seeded reference rows.** Valid only if the tables were empty before Step 7 (the V7 plan showed `create` equal to the catalogue count) and nobody has since edited a row.
<!-- CMD approved 10 -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -1 -c "DELETE FROM rail_corridor_nodes; DELETE FROM rail_cancellation_codes; DELETE FROM rail_ancillary_services"'; echo done
```

### 6.3 Schema rollback (surgical) — `approved: 11`

Only if the schema itself must go back **and** a restore (§6.4) is not wanted — for example, hours of live data have been written since Step 5.
**This destroys everything stored in the 12 new tables and the 19 new columns since the migration.** Take a fresh backup first (a repeat of
Step 1 under a new approval), and stop the application first if it is running the new image (§6.2, `approved: 9`) — the new code
cannot run without these objects.

The SQL below was **generated from the three migrations and proven complete**: applying all five migrations to a real PostgreSQL engine,
running it, and comparing the full catalogue (tables, columns, types, enums, indexes) with a database that only ever had the first two
migrations gave an identical result, and the ledger returned to its two original rows. A test (`rail-deployment-checklist.spec.ts`)
fails if this block ever stops matching what the migrations create. The last statement of each section removes that migration's row from the ledger.

<!-- BEGIN ROLLBACK-SQL -->
```sql
-- 20261002070000_rail_wave4_tariffs_ancillary_weighbridge
ALTER TABLE "rail_consignments" DROP COLUMN "holdClearedAt", DROP COLUMN "holdSetAt", DROP COLUMN "holdReason", DROP COLUMN "holdStatus";
DROP TABLE "rail_tariff_calculations", "rail_weighbridge_readings", "rail_ancillary_services", "rail_tariff_schedules";
DROP TYPE "RailTariffCalcStatus", "RailWeighStatus", "RailLimitSource", "RailAncillaryGroup", "RailPriceStatus", "RailHoldStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261002070000_rail_wave4_tariffs_ancillary_weighbridge';

-- 20261002060000_rail_wave3_changes_possessions_occurrences_dg
ALTER TABLE "rail_consignments" DROP COLUMN "msdsDocumentUrl", DROP COLUMN "emergencyContact24h", DROP COLUMN "placardRef", DROP COLUMN "imdgClass", DROP COLUMN "unNumber", DROP COLUMN "isDangerousGoods";
ALTER TABLE "wagons" DROP COLUMN "msdsDocumentUrl", DROP COLUMN "emergencyContact24h", DROP COLUMN "placardRef", DROP COLUMN "imdgClass", DROP COLUMN "unNumber", DROP COLUMN "isDangerousGoods";
DROP TABLE "rail_occurrence_reports", "rail_possession_windows", "rail_slot_change_requests", "rail_cancellation_codes";
DROP TYPE "RailOccurrenceStatus", "RailOccurrenceLevel", "RailOccurrenceType", "RailPossessionStatus", "RailPossessionKind", "RailChangeStatus", "RailChangeInitiator", "RailChangeKind", "RailAttribution", "RailCancellationParty";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261002060000_rail_wave3_changes_possessions_occurrences_dg';

-- 20261002050000_rail_wave2_reference_slots_compliance
ALTER TABLE "wagons" DROP COLUMN "vehicleProfile", DROP COLUMN "gauge", DROP COLUMN "axles";
DROP TABLE "rail_slot_applications", "rail_operator_compliance_docs", "rail_yard_specs", "rail_corridor_nodes";
DROP TYPE "RailSlotApplicationStatus", "RailComplianceDocStatus", "RailComplianceDocType", "RailDataStatus", "RailVehicleProfile", "RailElectrification", "RailGauge";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261002050000_rail_wave2_reference_slots_compliance';
```
<!-- END ROLLBACK-SQL -->

To run it as one all-or-nothing transaction, save exactly that block to a file on the VPS — `/root/rail-rollback.sql` — then, as the single approved action:
<!-- CMD approved 11 -->
```text
docker exec -i flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -1' < /root/rail-rollback.sql; echo done
```

Then re-run **R6** (expect the two original ledger rows) and **R7** (expect `133|72|362|150`).

### 6.4 Disaster recovery — restore the Step 1 backup · `approved: 12`

The preferred recovery from a damaged database, and the only one that also undoes a data problem. It **overwrites the live database with
the dump**: everything written since Step 1 is lost, so decide quickly. This is the repository's own tool, with its own guard flag; it is the
same procedure `RELEASE-RUNBOOK-2026-10-01.md` names as its rollback. Stop the application first (`cd /root/FlowOps && docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml stop api`, under this approval), restore, then start the application that matches the restored schema.
<!-- CMD approved 12 -->
```text
cd /root/FlowOps && bash deploy/restore-verify.sh --restore-live /var/lib/docker/volumes/flowops_postgres-backups/_data/<DUMP_FILE> --i-understand; echo done
```

## 7. The facts this checklist relies on

| Claim | Evidence |
| --- | --- |
| The three migrations are additive, with no FK and no destructive statement | `RAIL-RASA-AUDIT-2026-10-02.md` §4.1, §5.1; `scripts/review-migration.mjs`; the migration headers |
| `133\|72\|362\|150` is the live schema now; `145\|95\|401\|150` is the expected result | `RELEASE-RUNBOOK-2026-10-01.md` (the live counts after adoption) reproduced by `docs/tools/verify-migrations-pglite.mjs` on a real engine |
| The rollback SQL restores the previous catalogue | the same tool's catalogue comparison (see §6.3) |
| The old app runs against the new schema | new columns are nullable or constant-default; see `RAIL-RASA-AUDIT-2026-10-02.md` §5.8 W4-4 |
| `vps-deploy.sh` would start the new image before migrating | `deploy/vps-deploy.sh` steps 3 → 4 (lines 129 – 146): the reason Step 5 comes first |
| The production image has the Prisma CLI, the migrations and the seeder | `backend/Dockerfile` (production stage copies `prisma/`, `node_modules/prisma`, `dist/`); `vps-deploy.sh` already runs `migrate deploy` in it |
| The AI switches are fail-closed | `backend/src/ai/ai-security.policy.ts` (production ⇒ only the exact string `true` enables them) |
| The deploy tooling is untouched by this release | `git diff 03b181a -- deploy docker-compose.yml backend/Dockerfile frontend/Dockerfile` is empty |

## 8. Corrections from the 2026-10-03 run

**Status: DEPLOYED.** All seven steps ran against `RELEASE_SHA` `be1792d`, each on its own `approved: N`, and the release is live.
This section exists because **four claims in this document were wrong when it was written**, and three of them were only caught
because a step was held and verified instead of trusted. Read it before running this checklist again.

| # | The document claimed | What actually happened | Fix applied |
|---|---|---|---|
| 1 | Step 1: `flowops-backup-r2 --backup-only` "dumps the live database" | It does not. That binary uploads the newest **existing** dump and `die`s if it is >12 h old; there is no `pg_dump` in that code path. Run as written it would have **STOPped** and produced no backup. | Step 1 now restarts `flowops-postgres-backup-1` first, whose loop dumps on container start. Verified: fresh 260,395 B dump uploaded and SHA-256 round-tripped. |
| 2 | R3: "*Stop if* not (`vps-deploy.sh` refuses a dirty tree)" | **False.** `vps-deploy.sh` has no dirty-tree check; its only guard is `git pull --ff-only` (line 124), which fails solely on a **colliding** modification. On 2026-10-03 R3 returned `4` and the release proceeded — all four entries were untracked and non-colliding. | R3 rewritten: it is a gate **this document** imposes, because Step 3's rollback is `reset --hard`. `git diff --stat` is the discriminator. |
| 3 | Step 6: "`driver-portal`, `postgres` and `redis` are not recreated" | `driver-portal` **was** rebuilt (31.3 s) and recreated. Both it and `frontend` build `FROM node:20.18-alpine` — a tag — and that tag's digest had moved, invalidating `FROM` and every later layer despite zero source changes. | Step 6 restated: a service is recreated whenever its **image id** changes, and an image id can change with no source change. |
| 4 | V6b: count lines matching `error\|exception\|prisma`, expect `0` | Never reads `0` on this codebase. All 7 hits were `LOG`-level noise: `PrismaModule`/`PrismaService` startup lines and five `Mapped {…}` routes whose **paths** contain `error`/`exception` (`/observability/client-error`, `/operations/exception-sla`, `/owner/observatory/errors`, …). | V6b now drops `Mapped {` lines and counts real severities case-sensitively (`ERROR\|Exception\|Error:\|UnhandledPromiseRejection\|FATAL`). |

### Also learned, and worth carrying forward

- **A green exit code is not a verified state.** Step 4 finished in 0.3 s with `BUILD_EXIT=0` and every layer `CACHED`. It was
  legitimate — BuildKit keys are content-addressed and byte-identical source had been built on that daemon before (the rehearsal
  at PR-branch content; a squash merge yields the same tree) — but that was only established by **inspecting the image**
  (5 migration dirs, 47 rail modules, `rail-tariff.service.js` present). Had Step 5 run against a stale image, `prisma migrate
  deploy` would have said *No pending migrations to apply* and Step 6 would have shipped an unmigrated schema.
- **The backend does not need a raised heap.** At Step 6 the `api` image rebuilt for real and `npm run build` completed in
  **71.9 s on the default heap**. The `--max-old-space-size=3072` recipe this host previously needed is unnecessary for `api`.
- **The frontend is the real memory risk**, because `frontend/package.json` hardcodes `--max-old-space-size=8192` and a CLI flag
  beats `NODE_OPTIONS` — so a container-level `--memory` is the only lever. It built in 83.5 s under a 1600m cap, no OOM.
- **Live was protected by cgroup caps, not by our flags.** `api` 768M, `postgres` 384M, `redis` 96M, 128M each for `frontend`,
  `driver-portal`, `cloudflared`, `postgres-backup` (~1.72 GiB of limits against 891 Mi actual). They cannot grow, so an uncapped
  build is what the OOM killer takes first. Combined with `set -euo pipefail` in `vps-deploy.sh` (line 51), which aborts at
  `build` (128) **before** `up -d` (132), a build failure cannot leave the stack half-swapped.
- **`docker compose build` accepts `-m, --memory`** (confirmed on Docker 29.8.1 / Compose 5.5.1) — but BuildKit solves builds in
  the daemon, so treat it as belt to the cgroup caps' braces, not as a guarantee.

### Open items after the run (not blockers)

| Item | Detail |
|---|---|
| Untracked artefacts in the checkout | Four `flowops-rehearsal-*.{md,stdout}` files sit in `/root/FlowOps`. Harmless — outside both build contexts, and `reset --hard` cannot touch them — but a future `git add -A` there would commit them. |
| `/root/Dockerfile.pre-step4` | Step 4's backup copy, left on the host (outside the repo). Harmless. |
| Backup service provenance | **Closed — no defect.** Dumps are 6 h 00 m 00 s apart exactly as documented, retention works, and `restarts=0` proves the service has never crashed or been OOM-killed. The current instance started at 11:28:47 (Step 1's restart). One earlier deliberate start at ~11:17 UTC is unexplained as to *who*, but it was not a fault and nothing else on the box moved. |
| Prisma version nudge | `migrate status` printed `Update available 5.22.0 -> 8.0.0-rc.19`. Cosmetic; **not** actioned mid-release. |
| Rollback image availability | `<OLD_API_IMAGE_ID>` `sha256:d85bd522…` and `<OLD_FRONTEND_IMAGE_ID>` `sha256:09fb0305…` should still be on disk. Worth confirming with `docker image inspect` before relying on `approved: 9`. |

### Backup cadence — how to finish the diagnosis

> **Corrected 2026-10-03.** The previous version of this section claimed the cadence "does not behave as documented (gaps of
> ~3 h, not 6)". **That reading was wrong.** It was inferred from two dumps that are not cadence evidence at all. The logs settle
> it, and they say the opposite of what was written here.

**The 6-hourly cadence is exact.** `docker logs --tail 30 flowops-postgres-backup-1` shows dumps at `20261002_081146`,
`20261002_141146`, `20261002_201146`, `20261003_021146`, `20261003_081147` — **6 h 00 m 00 s apart**, each followed by
`Sleeping 6h...`. The loop does precisely what `deploy/docker-compose.vps.yml` documents, and its last line is `Sleeping 6h...`,
so it is healthy right now. The log also shows the 28-file retention working as intended (`removed '/backups/flowops_20260926_…'`).

**The two dumps that made it look broken are restart artefacts, not cadence evidence.** Each is preceded by
`Backup service started. Dumping every 6h (validated), retaining 28 files.` — a banner the loop prints only on container start.
`20261003_111718` came from a restart at ~11:17 UTC; `20261003_112847` is ours, from Step 1. A restarting container dumps
immediately, so a restart shortens one interval without the loop misbehaving at all.

**The ~11:17 start — answered, and it was not a fault.**

<!-- CMD read-only B1 -->
```text
docker inspect --format 'restarts={{.RestartCount}} started={{.State.StartedAt}} status={{.State.Status}}' flowops-postgres-backup-1; echo done
```

<!-- CMD read-only B2 -->
```text
docker logs --tail 30 flowops-postgres-backup-1; echo done
```

Result on 2026-10-03: **`restarts=0 started=2026-10-03T11:28:47.343886387Z status=running`**.

`RestartCount` counts **only restarts performed by the restart policy** — a crash, an OOM kill, or a daemon-driven restart. An
explicit `docker restart` or a `docker compose up -d` recreate does **not** increment it. That single distinction settles it:

- **`restarts=0` eliminates every fault hypothesis.** The service has never crashed and has never been OOM-killed at its 128M
  limit — the OOM theory that was the leading suspect is dead.
- **`started=11:28:47.343…` is Step 1's restart, to the second** — the dump it produced is named
  `flowops_20261003_112847.sql.gz`. The container instance now running is ours.
- **The ~11:17 dump therefore came from an earlier container instance**, started by a deliberate action at ~11:17 UTC that was
  neither a crash nor part of this deployment.

What remains unknown is only the *provenance* of that 11:17 start, not the health of anything. Nothing on the box was disturbed by
it (`postgres` and `redis` were both `Up 8 days` at 13:17, which rules out a daemon restart or host reboot), and
`deploy/disk-guard.sh` cannot cause it — it runs only `docker image prune -f` / `docker builder prune -f`, never restarts
containers, and never touches volumes. If it is worth naming, `last`, `~/.bash_history` and `/var/log/auth.log` on the host will
identify the actor.

> **Also corrected:** the first version of B1 used `{{.StartedAt}}`, which is **not a top-level `docker inspect` field** and fails
> with `template parsing error: … map has no entry for key "StartedAt"`. The correct path is `{{.State.StartedAt}}`. `RestartCount`
> *is* top-level, so only that half worked. Worth remembering: a `docker inspect` template that has never been run is a guess.

**Conclusion — this item is closed, and there is no backup defect.** The loop is 6-hourly and exact, its 28-file retention is
working, it has never crashed, and it is running healthy. The healthcheck (`find /backups -name 'flowops_*.sql.gz' -mmin -400`)
passes, the loop self-heals by dumping on start, and Step 1 is safe because `flowops-backup-r2` enforces its own 12-hour
freshness gate before it uploads anything.

# Deploy handover — batch #529–#543 (2026-11-14)

**For:** the platform operator (the only person who touches the VPS).
**From:** the repository. Nothing below was executed against production; every
step is for you to run, in order, on the host.

**Status of this document:** the batch has been analysed from `main`, not run.
The analysis is in section 1 so you can see why the plan is shaped the way it
is, and so you can disagree with it before touching the box.

---

## 0. Quick reference

Read sections 1–2 before running anything. Once you have, the whole thing is:

```bash
cd /root/FlowOps || cd /opt/flowops

# Pre-flight — read-only, changes nothing
grep -n '^RBAC_STRICT=' .env
KEY=$(grep '^INTEGRATIONS_ENC_KEY=' .env | tail -1 | cut -d= -f2- | tr -d '\r')
printf '%s' "$KEY" | base64 -d 2>/dev/null | wc -c   # must print 32
git status --short                                    # must print nothing
git log --oneline -1                                  # RECORD THIS

# Row count for the #530 backfill (see 2.4)
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  exec -T postgres psql -U flowops -d flowops -c "SELECT count(*) FROM booking_requests;"

# Back up
./deploy/backup-to-r2.sh

# Deploy
./deploy/vps-deploy.sh

# Verify
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
$COMPOSE exec -T postgres psql -U flowops -d flowops -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE migration_name = '20261116090000_manifest_waybill_scan_record';"
./deploy/post-deploy-check.sh
$COMPOSE exec -T api wget -qO- http://localhost:3000/health
```

If it stops anywhere, go to section 8.

---

## 1. What is actually being deployed

15 merged PRs: **#529 → #543**. Merged 2026-11-12 → 2026-11-13.

| | |
|---|---|
| Prisma migrations | **2** |
| `deploy/` changes | **0** |
| `docker-compose*` changes | **0** |
| `.env*` template changes | **0** |
| Everything else | application code + tests |

### The two migrations

Two of the fifteen PRs touch the schema. **They are not the same class of
change**, and only one of them needs a number checked before you start.

#### `20261115090000_booking_requests_tenant_scope` (#530) — check this one

This one is **not** purely additive. In order, it:

1. adds a nullable `companyId` to `booking_requests`;
2. **backfills it** from the parent `booking_portal_links` row (`UPDATE … FROM`);
3. raises an exception if any row fails to backfill;
4. sets the column `NOT NULL`;
5. adds a foreign key to `companies` (`ON DELETE CASCADE`);
6. enables and forces RLS with a `tenant_isolation` policy;
7. creates three indexes.

Steps 2, 4 and 5 rewrite and revalidate every row, and step 7 builds three
indexes. `prisma migrate deploy` runs each migration inside a transaction, so
the locks are held until it commits.

**It is very likely empty.** The migration's own header notes the Prisma model
had zero references across `src/`, so nothing ever wrote to it, and a request
cannot outlive its link (`ON DELETE CASCADE`). On an empty table the backfill is
a no-op and the whole thing takes milliseconds.

"Very likely" is not "checked" — see section 2.4.

#### `20261116090000_manifest_waybill_scan_record` (#537) — additive

A single statement:

```sql
ALTER TABLE "manifest_waybills" ADD COLUMN "scannedAt" TIMESTAMP(3);
```

Additive, nullable, no default, no backfill, no table rewrite, no constraint
existing rows could violate. A nullable column with no default is a catalog-only
change on PG 11+ — it cannot fail on data and locks only briefly. The safest
class of migration there is.

#### A note on the RLS in #530

Step 6 enables row-level security on `booking_requests`, but **the app connects
as a superuser, and PostgreSQL exempts superusers from RLS entirely** — not even
`FORCE` binds them. So this step is inert in production today. It starts to
matter only after the role split in section 6. Nothing to do now; worth knowing
so a future "RLS is on" reading is not mistaken for protection.

**Consequence: this batch needs no new environment variables, no compose edits,
and no configuration work.** If the deploy fails, it will be for a reason that
predates this batch — most likely one of the four in section 2.

### What is *not* in this deploy: the RLS role split (#536)

**#536 staged the database role split; it did not provision it.** The SQL in
`backend/scripts/rls-roles.sql` is inert until a human runs it against the
cluster with `psql`. Nothing in `deploy/vps-deploy.sh` runs it, and nothing in
this batch changes `DATABASE_URL`.

**Do not bundle it with this deploy.** Two reasons:

1. It is the only change here that can take the site down. Pointing
   `DATABASE_URL` at `flowops_app` turns on fail-closed RLS for every query. If
   any of the ~114 cross-tenant platform paths has not yet been given the
   `flowops_platform` client — which is the *next* step in
   `docs/RLS-PHASE2-READINESS-2026-11-12.md`, not a completed one — those paths
   stop working. That is a different risk profile from a nullable column.
2. If the site goes down after this deploy, you want exactly one candidate
   cause. Two changes means two things to bisect while the site is dark.

Ship #529–#543 first, confirm green, then do the role split as its own change
window with its own rollback. See section 6.

---

## 2. Pre-flight — three things that will stop you at step 0

`deploy/vps-deploy.sh` refuses to run before the stack moves if any of these
hold. Two of the three are pre-existing host conditions, not properties of this
batch. **Check them now, before you start, so the deploy does not fail halfway.**

### 2.1 `RBAC_STRICT` must be in `.env`, not in the compose overlay

The script requires a literal `RBAC_STRICT=true` line in `.env`:

```bash
grep -n '^RBAC_STRICT=' .env
```

**If this prints nothing, the deploy will refuse.** Before 2026-10-28 the
value existed only as a hand-added line in the host's
`deploy/docker-compose.vps.yml`. That mechanism was replaced: the value now
reaches the container through the `api` service's `environment:` allowlist,
which reads from `.env`. The handover for that change
(`docs/DEPLOY-HANDOVER-RBAC-STRICT-2026-10-28.md`) asked for the host-side line
to be removed and the value moved into `.env`.

If the overlay still carries it:

```bash
git diff -- deploy/docker-compose.vps.yml
```

Expect one added line, `RBAC_STRICT: "true"`, in the `api` environment block.
If you see anything else, stop and reconcile by hand.

Fix, in this order (the container keeps its environment until recreated, so
there is no window where production runs non-strict):

```bash
grep -q '^RBAC_STRICT=' .env || echo "RBAC_STRICT=true" >> .env
git checkout -- deploy/docker-compose.vps.yml
grep -n '^RBAC_STRICT=' .env
```

### 2.2 `INTEGRATIONS_ENC_KEY` must decode to exactly 32 bytes

Presence is not the test. Two failure modes, both of which produce a perfectly
healthy-looking deploy:

- the committed template placeholder
  `CHANGE_ME_RUN_openssl_rand_base64_32` is present but useless;
- the `api` allowlists the key as `${INTEGRATIONS_ENC_KEY:-}`, so an **absent**
  key is interpolated as an **empty** one. The container boots, `/health`
  returns ok, and integration secret storage then fails closed — every
  WhatsApp/Shopify/WooCommerce/Xero/Sage save silently refuses.

Check it now:

```bash
KEY=$(grep '^INTEGRATIONS_ENC_KEY=' .env | tail -1 | cut -d= -f2- | tr -d '\r')
printf '%s' "$KEY" | base64 -d 2>/dev/null | wc -c   # must print 32
```

If it does not print 32:

```bash
KEY=$(openssl rand -base64 32)
grep -v '^INTEGRATIONS_ENC_KEY=' .env | grep -v '^#INTEGRATIONS_ENC_KEY=' > .env.tmp
printf 'INTEGRATIONS_ENC_KEY=%s\n' "$KEY" >> .env.tmp
mv .env.tmp .env
```

### 2.3 A dirty working tree

`vps-deploy.sh` runs `git pull --ff-only`, which aborts on local modifications
to tracked files. No commit in this batch touches `deploy/`, so a stale
`RBAC_STRICT` line will not block the pull — but check anyway:

```bash
cd /root/FlowOps || cd /opt/flowops
git status --short
git log --oneline -1
```

`git status` must be empty. **Record the commit it prints** — that is your
rollback target and your "what was live before" marker.

### 2.4 Row count for the #530 backfill

Not a blocker — a sizing question. The #530 migration backfills and rewrites
`booking_requests`, which is instant on an empty table and a lock window on a
populated one. Check before you deploy, not after:

```bash
grep -E '^POSTGRES_(USER|DB)=' .env   # empty means the defaults flowops/flowops apply
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T postgres \
  psql -U flowops -d flowops -c "SELECT count(*) FROM booking_requests;"
```

Substitute the user and database if that `grep` printed anything.

- **0** — proceed exactly as planned; the backfill is a no-op.
- **anything else** — stop and report the number. The migration still applies,
  but you want to know the lock window before taking it in business hours.

---

## 3. Back up first

One migration, additive and nullable, is about as safe as a schema change gets.
Back up anyway: the cost is two minutes and the asymmetry is enormous.

```bash
./deploy/backup-to-r2.sh
```

If R2 is not configured on this host, take a local dump before you start:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  exec -t postgres pg_dump -U flowops -Fc flowops \
  > /root/flowops-pre-batch-531-543-$(date +%F-%H%M).dump
```

**Verify the dump is non-trivial before proceeding** — a zero-byte or
truncated dump is worse than none, because it gives false confidence:

```bash
ls -lh /root/flowops-pre-batch-531-543-*.dump
```

---

## 4. Deploy

```bash
cd /root/FlowOps || cd /opt/flowops
./deploy/vps-deploy.sh
```

No `--seed` (this is an update, not a first install). No `--yes` — if the
plan-overage guard reports a tenant over its limit, you want to read it and
decide, not wave it through.

The script, in order: pre-flight → `git pull --ff-only` → build → `up -d` →
wait for Postgres → `prisma migrate deploy` → plan-overage guard → health
verification → live `RBAC_STRICT` assertion → live encryption-key assertion →
post-deploy bundle check.

Watch for these specific points:

- **`prisma migrate deploy`** applies the one migration. If it reports a
  drift or a failed migration, **stop** — do not re-run with `--force`. Drift
  means the database has a migration the repo does not know about, and that
  needs a decision, not a retry.
- **The two "live" assertions at the end.** The script reads the values back
  out of the *running container* with `printenv`, not from `.env`. This is
  deliberate: `.env` holding a correct value that never reaches the process is
  precisely how the empty-key incident happened. If either assertion fires, the
  stack is up but misconfigured.

---

## 5. Verify

```bash
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"

# 1. Both migrations applied and recorded. Expect 2 rows, both with a
#    finished_at and no rolled_back_at.
$COMPOSE exec -T postgres psql -U flowops -d flowops -c \
  "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
    WHERE migration_name IN ('20261115090000_booking_requests_tenant_scope',
                             '20261116090000_manifest_waybill_scan_record')
    ORDER BY migration_name;"

# 2. The #530 backfill left no NULL tenant.
$COMPOSE exec -T postgres psql -U flowops -d flowops -c \
  "SELECT count(*) AS null_tenant FROM booking_requests WHERE \"companyId\" IS NULL;"

# 3. The new column exists and is nullable.
$COMPOSE exec -T postgres psql -U flowops -d flowops -c \
  "SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_name='manifest_waybills' AND column_name='scannedAt';"

# 4. The frontend is serving this build, not the previous bundle.
./deploy/post-deploy-check.sh

# 5. No container publishes a port on 0.0.0.0 (tunnel-only design).
docker ps --format '{{.Names}}\t{{.Ports}}' | grep '0\.0\.0\.0:' && echo LEAK || echo "no leak"

# 6. API health.
$COMPOSE exec -T api wget -qO- http://localhost:3000/health
```

### A gap worth knowing about

**There is no build-sha or version endpoint.** The API exposes `/health`, but
nothing reports which commit is running. So "is the new code live?" cannot be
answered directly — it has to be inferred from the migration row, the git
revision on disk, and `post-deploy-check.sh` for the frontend bundle.

That is adequate for this batch (two migration rows plus a bundle check is
reasonably strong evidence), but it is worth closing: a `/health` payload
carrying the commit sha would let you confirm a deploy at a glance. Flagging it
rather than fixing it here — it is a code change, and code changes do not belong
in a deploy window.

---

## 6. Then, as a separate change: provision the RLS role split

From `docs/RLS-PHASE2-READINESS-2026-11-12.md`, in this order:

1. **Provision the roles** — `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f
   backend/scripts/rls-roles.sql`. The file is idempotent and ends with a
   report; both rows must show `rolsuper = f`, `rolbypassrls = f`, and an
   `rls_strict` of `{app.rls_strict=on}` / `{app.rls_strict=off}`.
2. **Set passwords** if the cluster is not on trust auth. A role with no
   password fails closed rather than open, but it also fails.
3. **Give the platform paths a second Prisma client** connecting as
   `flowops_platform`. The permitted files are enumerated in `PLATFORM_SCOPE`
   in `scripts/tenant-scope-policy.mjs`. **This step is not done** — until it
   is, step 4 would take the site down.
4. **Only then** point `DATABASE_URL` at `flowops_app`.

Do steps 1–2 in this window if you like; they are inert on their own. Do not do
step 4 until step 3 is code-complete.

---

## 7. Rollback

The application side is a git revert plus a rebuild; there is no down migration
for the new column, and none is needed.

```bash
cd /root/FlowOps || cd /opt/flowops
git log --oneline -1          # confirm you are on the new tip
git checkout <commit-from-section-2.3> -- .   # the pre-deploy commit
./deploy/vps-deploy.sh
```

The added column is harmless to a previous code version: it is nullable and
nothing before #537 reads it. So rolling the code back without dropping the
column is safe, and leaving it in place makes rolling *forward* again trivial.

To drop it (only if you want a genuinely clean slate):

```sql
ALTER TABLE "manifest_waybills" DROP COLUMN "scannedAt";
-- then delete the row from _prisma_migrations, or Prisma will consider the
-- migration applied and never re-apply it:
DELETE FROM _prisma_migrations
 WHERE migration_name = '20261116090000_manifest_waybill_scan_record';
```

If you have to restore from the dump taken in section 3, remember that it
predates the migration, so it also removes the column — which is consistent.

---

## 8. If it fails

### First: work out where it stopped

`vps-deploy.sh` prints a `▶` marker at each stage. **The last marker you saw
tells you whether production has changed.**

| Last marker printed | State of the site |
|---|---|
| *(none)* or `Pre-flight checks passed` | **Untouched.** Still on old code, still up. |
| `Pulling latest from git` | Untouched. Source updated on disk, stack not restarted. |
| `Building images` | Untouched. Images rebuilt, nothing running them yet. |
| `Starting stack` onwards | **New code is live.** Continue to the table below. |

The pre-flight is deliberately arranged to fail *before* the stack moves — so
most failures here cost you nothing but time. Anything from `Starting stack`
onwards means the new build is serving traffic.

### Failure → cause → fix

| Message | Fix |
|---|---|
| `RBAC_STRICT must be "true" in .env` | Section 2.1. The value must be in `.env`, not the compose overlay. |
| `INTEGRATIONS_ENC_KEY ... must be base64 decoding to exactly 32 bytes` | Section 2.2. |
| `Docker Compose >= 2.24.4 required` | `sudo apt-get update && sudo apt-get install -y docker-compose-plugin`, then confirm with `docker compose version --short`. The `!reset` tag that unbinds host ports needs 2.24+; on older Compose the ports get silently re-published. |
| `<path> routes to 127.0.0.1/localhost` | Point each ingress rule at the Docker service name: `service: http://frontend:80` (and `http://driver-portal:80`). Then `docker compose ... restart cloudflared`. **Do not** work around it by re-publishing host ports — that defeats the tunnel-only design. |
| `host cloudflared.service is active` | `systemctl stop cloudflared && systemctl disable cloudflared && systemctl mask cloudflared`. A second tunnel connector splits connections and causes intermittent 502s. |
| `check-compose-ports.sh` fails | Find what is publishing: `docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml config \| grep -A3 ports:` |
| `VITE_API_URL must be /api/v1` | It must be `/api/v1`, not `/api` — the SPA 404s otherwise. Fix in `.env`, then rebuild (the value is baked into the image at build time). |
| `Missing <KEY> in .env` | One of `POSTGRES_PASSWORD`, `JWT_SECRET`, `OWNER_SEED_EMAIL`, `OWNER_SEED_PASSWORD`, `CORS_ORIGINS`. |
| `git pull failed` | `git status --short`; commit or stash local changes first. |
| `Postgres did not become healthy in 60s` | `docker compose ... logs --tail=100 postgres`. Do not proceed to migrations. |
| `prisma migrate deploy failed` | **Stop. Do not re-run with `--force`.** Capture the output. A failed migration leaves `_prisma_migrations` recording the failure, and the next attempt will refuse until it is resolved — see below. |
| Plan-overage guard lists tenants | Read the list and decide. This is an interactive prompt on purpose; do not re-run with `--yes` to get past it. |
| `Containers are still publishing public ports` | `docker ps --format '{{.Names}}\t{{.Ports}}'` and find the offender. |
| `api container reports RBAC_STRICT=...` | The value is right in `.env` but did not reach the process. Check `docker-compose.yml` still carries `RBAC_STRICT` in the `api` environment allowlist, then `docker compose ... up -d --force-recreate api`. |
| `api container's INTEGRATIONS_ENC_KEY is not a 32-byte key` | Same cause and fix as the row above. |
| `the frontend is not serving this checkout's routes` | The stack is up but the browser is being served the previous bundle. Nothing was rolled back — rebuild and re-run. |
| `/health` returns nothing | `docker compose ... logs --tail=100 api`. |

### On a failed migration specifically

`prisma migrate deploy` records a failed migration in `_prisma_migrations` with
`finished_at` NULL, and **refuses to run again until it is resolved.** To see
the state:

```sql
SELECT migration_name, finished_at, rolled_back_at, logs
  FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
```

The usual cause is drift — the database has a migration the repo does not know
about, or one was applied out of band. That is a decision, not a retry: resolve
it deliberately (`prisma migrate resolve`) once you know what the divergence is.
If it is the new column specifically, it is safe to inspect directly:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='manifest_waybills' AND column_name='scannedAt';
```

If the column exists but the row says failed, the change landed and only the
bookkeeping did not. If neither exists, nothing was applied and the database is
as it was.

---

## 9. Summary

| | |
|---|---|
| PRs | #529 → #543 (15), merged 2026-11-12 → 2026-11-13 |
| Migrations | 2 — one additive column, one backfill + rewrite |
| Env / compose changes | none |
| Expected downtime | brief, on `up -d` (single container restart) |
| Biggest risk | a pre-existing `.env` gap (2.1, 2.2), not this batch |
| The one number to check | row count of `booking_requests` (2.4) |
| Deliberately excluded | the RLS role split from #536 |

The batch is low-risk, with one caveat: #530's migration backfills and rewrites
`booking_requests` rather than only adding a column. It is almost certainly an
empty table, and section 2.4 turns "almost certainly" into a number. Everything
else is application logic covered by tests (`release:safety` was 222/222 on the
tip before merge), so the things most likely to stop you are host conditions
that have been waiting for a deploy to surface them.

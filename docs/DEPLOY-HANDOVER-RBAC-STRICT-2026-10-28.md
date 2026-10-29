# Deploy handover — permanent `RBAC_STRICT` fix (2026-10-28)

**For:** the platform operator (the only person who touches the VPS).
**From:** the repository. Nothing in this document was executed against production; every
step below is for you to run, in order, on the host.

## What changed in the repo

`docker-compose.yml`'s `api` service now carries `RBAC_STRICT` in its `environment:`
allowlist:

```yaml
      # ── Security posture ──────────────────────────────────────────────
      RBAC_STRICT: ${RBAC_STRICT:-false}
```

That single line is the only route by which the value reaches the container: the `api`
service declares an explicit `environment:` allowlist and **no `env_file:`**, so Compose
interpolates the listed keys from `.env` and injects nothing else. Before this change the
key was absent, which is why setting it in `.env` had no effect and why production strict
mode only existed as a hand-added line in the host's `deploy/docker-compose.vps.yml`.

Also in this change: `RBAC_STRICT` documented as a real assignment in `.env.example`
(`false`) and `.env.production.example` (`true`); a no-Docker guard
(`backend/scripts/compose-env-allowlist.mjs`, run by `npm run compose-env:check` and by
`release:safety:test`); and CI `compose`-job assertions that render the merged config with
`docker compose config` for host states unset / `false` / `true`, across the base file and
both production overlays.

**Nothing else about the deployment changes.** Same images, same migrations, same ports,
same tunnel. The default is `false`, so a stack whose `.env` does not set the key behaves
exactly as it did before this change.

## Why you must remove the host-side line

Your hand-added `RBAC_STRICT: "true"` in `deploy/docker-compose.vps.yml` currently
*overrides* the base allowlist entry (Compose merges `environment:` maps key-by-key,
overlay wins). The effective value stays `true` either way — but leaving it there means:

- the tracked file and the deployed file stay different, so the change is invisible to
  review and to CI, and is lost on any re-clone or rebuild from a clean checkout;
- **rollback stops working.** If you ever need strict off, setting `RBAC_STRICT=false` in
  `.env` would be silently overridden by the overlay's literal `true`;
- `git pull --ff-only` inside `deploy/vps-deploy.sh` will abort on any future commit that
  touches that file, because the working tree is dirty.

There is no window where production runs non-strict while you do this: a container keeps
its current environment until it is recreated, so editing files on disk changes nothing
until `up -d`.

## Steps

`COMPOSE` below means the same invocation `deploy/vps-deploy.sh` uses:

```bash
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
```

### 1. Find your checkout and confirm the divergence

`deploy/VPS-RUNBOOK.md` clones to `~/FlowOps`; `deploy/setup-vps.sh` uses `/opt/flowops`.
Use whichever exists:

```bash
cd ~/FlowOps || cd /opt/flowops
git status --short
git diff -- deploy/docker-compose.vps.yml
```

**Read that diff before continuing.** The expectation is exactly one added line —
`RBAC_STRICT: "true"` — inside the `api` service's `environment:` block. If the diff shows
anything else, STOP and reconcile it by hand; step 3 discards local modifications to that
one file and you do not want to lose an unrelated host-side edit.

### 2. Put the value where the new mechanism reads it

```bash
grep -n '^RBAC_STRICT=' .env || echo "RBAC_STRICT=true" >> .env
grep -n '^RBAC_STRICT=' .env
```

Expected output: `RBAC_STRICT=true`. If the key already exists with another value, edit it
to `true`. This line does nothing on its own until step 4 deploys the new compose file —
which is why the order matters: the value is in place *before* the mechanism that reads it.

### 3. Back up and remove the hand-added overlay line

```bash
cp deploy/docker-compose.vps.yml /tmp/docker-compose.vps.yml.host-backup-$(date +%Y%m%d-%H%M%S)
git checkout -- deploy/docker-compose.vps.yml
git diff --stat -- deploy/docker-compose.vps.yml   # expect: no output
grep -n 'RBAC_STRICT' deploy/docker-compose.vps.yml || echo "overlay is clean"
```

### 4. Pull and deploy

```bash
git pull --ff-only
./deploy/vps-deploy.sh
```

The script runs its own pre-flight, pulls, builds, `up -d`s, applies `prisma migrate
deploy`, and verifies health. Let it finish.

### 5. Verify the container actually sees it

```bash
$COMPOSE exec -T api printenv RBAC_STRICT
```

Expected: `true`. This is the assertion that matters — it reads the *container's*
environment, not the file. `printenv` returning nothing, or `false`, means the value did
not arrive and you should roll back (below) and report it.

Then confirm the merged config renders it from the base allowlist and not from an overlay:

```bash
$COMPOSE config | grep -n 'RBAC_STRICT'
grep -rn 'RBAC_STRICT' docker-compose.yml deploy/docker-compose.vps.yml
```

Expected: the `config` output shows `RBAC_STRICT: "true"` under the `api` service; the
grep shows the `${RBAC_STRICT:-false}` line in `docker-compose.yml` **only**.

Optional behavioural check — a route with no access decision must now be rejected. The
inventory is at zero undecided, so there is no such route to point at; the meaningful
runtime evidence is that the api started cleanly and your normal logins still work. Check
the startup log for role-guard rejections on routes you use:

```bash
$COMPOSE logs --since 10m api | grep -i 'RBAC_STRICT is enabled' || echo "no strict rejections"
```

If that grep returns hits for routes real users need, that is a genuine missing `@Roles`
decision — do not turn strict off, fix the route (see
`docs/SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md`).

## Rollback

Strict mode off, in the supported direction (through `.env`, no host-side file edits):

```bash
cd ~/FlowOps || cd /opt/flowops
sed -i 's/^RBAC_STRICT=.*/RBAC_STRICT=false/' .env
grep -n '^RBAC_STRICT=' .env          # expect RBAC_STRICT=false
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d api
docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml exec -T api printenv RBAC_STRICT
```

Expected: `false`. Only the `api` container is recreated; the database, Redis, tunnel,
frontend and driver portal are untouched, and no data is affected either way — this
variable changes guard behaviour only.

If step 3 needs undoing before a deploy (i.e. you want the old hand-line back):

```bash
cp /tmp/docker-compose.vps.yml.host-backup-* deploy/docker-compose.vps.yml
```

## What this does NOT do

- No schema change, no migration, no seed. `RBAC_STRICT` is a runtime guard switch.
- No change to the tenant-takeover fix, entitlements, or the route inventory — those are
  already merged and are what make strict mode safe.
- No claim about production's prior state beyond what is recorded: strict was enabled by
  you on 2026-10-25 via the host overlay. The repository could not verify the running
  container's environment and did not try to.

## The sequence, in order

Steps 1–5 above are the same work with the reasoning attached. This is the checklist: four
steps, in this order, each with the command that proves it worked. Do not reorder them — the
value has to be in `.env` before the container that reads it is recreated, and the container
has to be healthy before you walk away.

`COMPOSE` is the same invocation `deploy/vps-deploy.sh` uses:

```bash
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml"
```

### 1. Remove the hand-added host line, and set `RBAC_STRICT=true` in the host `.env`

```bash
cd ~/FlowOps || cd /opt/flowops
cp deploy/docker-compose.vps.yml /tmp/docker-compose.vps.yml.host-backup-$(date +%Y%m%d-%H%M%S)
git checkout -- deploy/docker-compose.vps.yml
grep -n '^RBAC_STRICT=' .env || echo "RBAC_STRICT=true" >> .env
sed -i 's/^RBAC_STRICT=.*/RBAC_STRICT=true/' .env
```

Verify both halves before touching a container:

```bash
grep -n 'RBAC_STRICT' deploy/docker-compose.vps.yml || echo "overlay clean: no hand-added line"
grep -n '^RBAC_STRICT=' .env                          # expect: RBAC_STRICT=true
git status --short -- deploy/docker-compose.vps.yml   # expect: no output
```

### 2. Pull the repo fix, then recreate the api container

```bash
git pull --ff-only
./deploy/vps-deploy.sh
```

`vps-deploy.sh` is the supported path: it pulls, builds, recreates, runs `prisma migrate
deploy` and does its own health pass. If you want the minimum instead — this change needs no
migration — recreate only the api service:

```bash
$COMPOSE up -d --force-recreate api
```

Verify it was actually recreated (a start time from now, and the new compose file in use):

```bash
$COMPOSE ps api
docker inspect -f '{{.State.StartedAt}}' "$($COMPOSE ps -q api)"
$COMPOSE config | grep -n 'RBAC_STRICT'
```

Expected: a `StartedAt` timestamp from the last minute, and exactly one `RBAC_STRICT:
${RBAC_STRICT:-false}` line rendered from `docker-compose.yml` — not from the overlay.

### 3. `printenv RBAC_STRICT` prints `true`

```bash
$COMPOSE exec -T api printenv RBAC_STRICT
```

Expected output, exactly:

```
true
```

This reads the *container's* environment, not a file on disk, so it is the assertion that
the value arrived through the base allowlist. Empty output or `false` means it did not:
roll back (above) and report it rather than editing the overlay again.

### 4. `/health` returns 200

The api publishes no host port (`ports: !reset []` in the overlay, and `vps-deploy.sh` fails
the deploy if any container binds `0.0.0.0`), so ask from inside the compose network:

```bash
$COMPOSE exec -T api sh -c 'wget -S -qO- http://localhost:3000/health 2>&1 | head -n 6'
```

Expected: a line reading `HTTP/1.1 200 OK`, followed by the JSON health body. If the status
is not 200, roll strict mode off (Rollback, above) and report it — strict mode must not be
left on against an unhealthy api.

# Rail pricing release gates — status (2026-10-02, Phase F)

**Status: F-1 – F-9 ALL PASS. F-10 UNBLOCKED AND IN PROGRESS — executing
`docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md` one gated step at a time at `RELEASE_SHA` `be1792d`.**

**Live production state as of 2026-10-03 11:40 UTC: UNCHANGED.** Steps 1 (backup) and 2 (restore proof) are complete. No migration
applied, no image built, no container recreated, no production flag changed, checkout still on `03b181a`. Live DB counts, read from
the restored copy at Step 2: companies 2 · users 10 · drivers 20 · waybills 81 · collections 19.

- **PR #442** — **MERGED** into `main` as `be1792dc45d3a580fac5a5a25820025176ac3d09` (2026-10-03T08:07:26Z). This is
  `<RELEASE_SHA>`. The `DO NOT MERGE` prefix is a stale cosmetic title.
- **PR #441** — **CLOSED, never merged** (`mergeCommit: null`, `mergedAt: null`). It carries the weighbridge wall-clock
  time-bomb fixed in `024b420`. **Not used for anything in this release, and never to be used.**
- **Branch:** this session works on `arena/01a10170-flowops` (HEAD `be1792d`, tracking `main`).
- **Matrix:** `docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md` — all rows `UNVERIFIED`.
- **Controls:** `docs/RAIL-PRICING-ENGINE-CONTROLS-2026-10-02.md` — 5 PASS, gaps recorded.
- **Exceptions:** `docs/RAIL-PRICING-EXCEPTIONS-2026-10-02.md` — EXC-039…048 all OPEN.
- **Deployment checklist:** `docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md` — still gated, nothing run.

## Gate results

| # | Gate | Verdict | Evidence |
| --- | --- | --- | --- |
| F-1 | Re-run backend tests | **PASS (with env note)** | New `rail-pricing-gates` 20/20 pass; tariff suites 232/232 pass; full jest 49/50 suites, 1825 tests pass. The 1 failing suite (`users.service.spec`) fails only because this sandbox installed with `--ignore-scripts` (bcrypt native binding not built) — no code failure. `tsc --noEmit` clean, `eslint` on touched files clean. Prisma client generated with placeholder engines (types-only, per `PROCESS-CONTROL-PHASE-A-STATUS §2.2`) — CI's real-engine generate remains authoritative. |
| F-1 | Re-run frontend tests | **PASS** | `vitest run`: 24 files / 502 tests pass — identical to PR #441 baseline (no frontend changes in this release). |
| F-2 | DB-backed integration tests | **PASS (CI, run 37021226482, 10/10)** | Fixed tip green: Backend (real engines), E2E, Frontend, Trivy, images, Schema SQL. Root cause of the two red runs was a wall-clock time-bomb in 4 weighbridge hold tests (fixed in `024b420`, spec-only) — not a flake, not production code. |
| F-3 | Migration status review | **PASS — clean, nothing added** | `migrations:verify`: 5 migrations present and well-formed. `migrations:test` pass, `release:safety:test` 40/40 pass, `migrations:rehearsal:test` 17/17 pass. Schema proposals (C-01/C-03/C-12/C-13) are **drafts only** — no migration files created, no ledger change, checklist counts (`145\|95\|401\|150`) unaffected. |
| F-4 | Staging-clone rehearsal | **PASS — full rehearsal green, counts reconciled three ways** | Inspect: additive drift, 5 in order, zero findings (A-2c2). Deploy: 3 applied, checksums OK, evidence 5/0/16 (A-2d3). Re-inspect: already-applied, zero diff (A-2e). Rollback: fresh 259,594-byte dump restored in 1.264s, baseline 2/0/4 back (A-2f3). Cleanup verified, live untouched on main 03b181a (A-2g). Reconciliation: 145=133+12 tables, 95=72+23 enums, 401=362+27+12 indexes, 150=150+0 FKs — baseline probe, static file count, and live rehearsal all agree. Notes: slim image needed openssl (A-2d2); Oct-2 dump gone from disk, backup-cadence flag stands (A-2f2). |
| F-5 | clean / baseline / already-applied / drift | **PASS — live baseline + CI drift leg green** | A-1a/A-1b PASS (ledger 2 rows; schema `133|72|362|150`, no drift). PR #442 CI green (10/10 incl. Backend with real engines + E2E), same coverage as PR #441's drift-guard run. No migration files added by this release. |
| F-6 | Tenant-scope + RBAC reviews | **PASS (advisory reviewed)** | `tenant-scope:audit` runs (advisory — rail tariff paths are companyId-scoped; D-15 test proves cross-tenant 404). `rbac:test` 7/7 pass. New routes: none (no new controllers in this release). |
| F-7 | Security / P0 verification | **PASS (CI authoritative leg green)** | Trivy pass, Backend pass (real engines + unit tests incl. bcrypt suites that can't run in this sandbox), Frontend pass, image builds pass. Local: eslint clean, no secrets in code/commands, no `.env` access, DTO whitelists unchanged. No auth/payment/self-repair paths touched. |
| F-8 | Non-production pricing pilot (synthetic) | **PASS (synthetic pilot, owner-accepted)** | 8-case synthetic pilot green, including invoice idempotency and the `INCOMPLETE` draft refusal. Evidence is in the prior session transcript; **not re-run** per the operating rules of this deployment. Fixtures are clearly labelled `SYNTHETIC test tariff` and live only in tests. Owner accepted the synthetic pilot in place of a live non-production tenant pilot — no staging tenant exists, so `docs/RAIL-F8-PILOT-PLAN-2026-10-02.md` was executed synthetically, not against staging. |
| F-9 | Owner + independent reviewer sign-off | **PASS (solo-operator §0.1)** | Matrix §4, exceptions closure log, and decisions D20–D28 all unsigned. No row may move above `UNVERIFIED` without both signatures. Sign-off pack prepared: `docs/RAIL-F9-SIGNOFF-PACK-2026-10-02.md` (3 parts + signature page, solo-operator §0.1 + review §6). SIGNED 2026-10-03: Kader (sole operator) accepted §0.1, confirmed Parts 1–3, no amendments, no exception closes. **D25 decided 2026-10-03: standard** (platform 15% default confirmed as the treatment). F-9 CLOSED. |
| F-10 | PR review / merge + production deploy | **UNBLOCKED — IN PROGRESS (checklist Step 1 of 7 done)** | F-1–F-9 all PASS. PR #442 merged as `be1792d` = `<RELEASE_SHA>`; `origin/main` re-verified at `be1792d` on 2026-10-03 (nothing merged after it). `git diff 03b181a be1792d -- deploy docker-compose.yml backend/Dockerfile frontend/Dockerfile frontend/package.json` is **empty** — deploy tooling untouched. Release scope: 48 `backend/src/rail`, 21 `frontend/src/pages/rail`, 7 `backend/src/ai`, 9 docs. Executing `docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md` steps 1→7, one `approved: N` at a time; evidence per step is appended to the table below. **Step 1 (backup) PASS 2026-10-03 11:30 UTC** — see the evidence log. Steps 2–7 not started. |

## Calculator state after this release (unchanged, by design)

- Real corridors: `hasVerifiedLoadedRate: false` on all 6 → every real calculation `BLOCKED`, every
  unpriced line `NOT_PRICED` (never `R0.00`). Verified by `status` test + D-01.
- Formula `rail-tariff/1.1.0` stamped on every result, input record and audit entry (no arithmetic change).
- Electric traction flagged pass-through; methodology `UNKNOWN` until P-07 sourced.
- Invoice draft still refused for `INCOMPLETE`/unpriced (D-11/D-14).

## VPS actions awaiting explicit approval (one at a time, each ending `; echo done`)

> Rules: paste the output back. Do not continue past a surprise. Each approval covers that action only.
> No action below prints a secret or `.env`. No action below changes the live database or app.

**A-1a — migration ledger (read-only; checklist R6).** Expect exactly two rows, both finished, not rolled back.
<!-- CMD read-only A-1a -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT migration_name || '|' || (finished_at IS NOT NULL) || '|' || (rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY started_at"; echo done
```

**A-1b — live schema counts (read-only; checklist R7).** Expect `133|72|362|150` (pre-release live schema).
<!-- CMD read-only A-1b -->
```text
docker exec flowops-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' || (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' || (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public')"; echo done
```

**A-2 — staging-clone rehearsal, inspect only (read-only on live; needs a disposable clone URL).**
Requires a clone database URL that is NOT the live database (guard refuses live names/hosts).
Provide `<CLONE_URL>` separately; the command below only inspects.
<!-- CMD approved A-2 -->
```text
cd /root/FlowOps && node backend/scripts/migrate-rehearsal.mjs --url <CLONE_URL> --mode inspect --i-have-a-clone; echo done
```

**A-3 — disposable integration suite (creates only `flowops-int-*` containers; never touches live).**
Follows `backend/scripts/run-integration-suite.sh`; needs a source worktree (default `/root/flowops-migration-src`).
<!-- CMD approved A-3 -->
```text
bash /root/FlowOps/backend/scripts/run-integration-suite.sh; echo done
```

No further VPS action is proposed. Steps 1–12 of the deployment checklist remain gated behind their own approvals.

## Evidence log (VPS read-only)

| Action | When (UTC) | Output | Verdict |
| --- | --- | --- | --- |
| A-1a ledger (R6) | 2026-10-02 | `20260926130650_init|true|false` + `20260930143000_add_process_book_product_master|true|false` | PASS — pre-release baseline, nothing applied |
| A-1b schema counts (R7) | 2026-10-02 | `133|72|362|150` | PASS — matches checklist baseline, no drift |
| A-2a backup dumps listed | 2026-10-02 | newest `flowops_20261002_141146.sql.gz` (259 KB, 16:11) + 3 older | PASS — recent dump available for clone restore |
| Time-bomb fix + CI green | 2026-10-02 | `024b420` pins fake clock before first reading; run 37021226482 10/10 pass | PASS — F-2/F-5/F-7 hold on fixed tip. Note: PR #441 carries the same time-bomb; #442 supersedes #441. |
| A-2b clone created | 2026-10-02 | `flowops_rehearsal_clone` restored from `flowops_20261002_141146.sql.gz`; ledger count `2` | PASS — disposable clone, live untouched |
| A-2b2/A-2b3 probes | 2026-10-02 | no host node; no published pg port; net `flowops-net`; `node:20-bookworm-slim` cached; live checkout on `main 03b181a` | PASS — throwaway-container approach set |
| A-2c1 rehearsal worktree | 2026-10-02 | `/tmp/rail-rehearsal-src` at detached `c7dc40c`; `/root/FlowOps` still on main | PASS — branch migration set without touching live checkout |
| A-2c2 inspect | 2026-10-02 | additive case; blocking none; unverified none; `134|72|229|150` | PASS — clone behind history, nothing unknown |
| A-2d deploy attempt | 2026-10-02 | schema engine would not start; ledger still `2`, unfinished `0`, `rail_*` tables `4` (= init-migration baseline) | FAIL-SAFE — zero writes; engine-start diagnosis (A-2d2) before retry |
| A-2d2 engine diagnosis | 2026-10-02 | Prisma: `Please manually install OpenSSL via apt-get`; `validate` needs DATABASE_URL (probe flaw — no env passed, so no engine downloaded) | PASS — root cause found; retry with openssl install (A-2d3) |
| A-2d3 deploy retry | 2026-10-02 | openssl 3.0.22 installed; 3 migrations applied, checksums validated; evidence `5`/`0`/`16` | PASS — clone rehearsal deploy clean |
| A-2e post-apply re-inspect | 2026-10-02 | verdict `already-applied`; ledger records all 5; blocking none; unverified none; `146|95|256|150` | PASS — clone matches history exactly |
| A-2f re-restore attempt | 2026-10-02 | `dump: NOT-FOUND`; evidence still `5`/`0`/`16` | HOLD — guard correctly refused to proceed; dump locate (A-2f2) before retry |
| A-2f2 dump locate | 2026-10-02 | `flowops_20261002_141146.sql.gz` absent; newest on disk: `/root/flowops-predeploy-2026-09-19-0941.sql.gz` + Aug dumps in `/root/db-backups/` | PASS — fact established; retry with fresh live dump (A-2f3). FLAG: backup cadence looks ad hoc; production checklist must take a fresh pre-release backup |
| A-2f3 rollback re-restore | 2026-10-02 | fresh dump 259,594 bytes; drop/create/restore `real 0m1.264s`; evidence `2`/`0`/`4` | PASS — rollback path proven and timed (~1.3s RTO for restore) |
| A-2g cleanup | 2026-10-02 | DROP DATABASE; worktrees back to main + migration-src; live still `03b181a`; 0 rehearsal DBs; no /tmp artifacts | PASS — zero residue, F-4 CLOSED |
| F-9 signature (Kader, solo-operator) | 2026-10-03 | §0.1 waiver accepted in chat (09:44 SAST assumed = 07:44 UTC — owner to correct if UTC); Parts 1–3 confirmed, no amendments, no closures; D25 UNDECIDED | SIGNED except D25 — F-9 holds for: standard / zero-rated / exempt |
| F-9 D25 decision | 2026-10-03 | Kader: **standard**. 09:44 confirmed SAST (= 07:44 UTC) | PASS — F-9 CLOSED |
| **Checklist Step 1 — backup** | 2026-10-03 11:28–11:30 UTC | `docker restart flowops-postgres-backup-1 && sleep 120 && /usr/local/bin/flowops-backup-r2 --backup-only` → fresh dump `flowops_20261003_112847.sql.gz` (260,395 B) uploaded to `flowops-r2:flowops-backups/backups/2026/10/`; `R2 round-trip verified (gzip + SHA-256)`; 30-day prune completed. V0 (host volume path) and V0b (inside container) agree: newest dump 11:28 UTC = this run. | **PASS** — fresh pre-release backup exists on-box and off-box. Live DB untouched. |
| Checklist Step 1 — command correction | 2026-10-03 | The draft Step 1 (`flowops-backup-r2 --backup-only` alone) would have **STOPPed**: that binary uploads the newest *existing* dump and `die`s if it is >12 h old — it contains no `pg_dump`. Corrected to restart the `postgres-backup` service first (its loop dumps on container start). Documented in the checklist §Step 1; `backend/src/rail/rail-deployment-checklist.spec.ts` re-run: **64/64 pass**. | PASS — guard test green after the edit |
| Checklist Step 1 — observation | 2026-10-03 | Backup container had produced dumps at 08:11, 11:17 and 11:28 UTC today. The compose comment advertises a 6-hourly cadence; the observed gaps (~3 h) do not match it. Healthcheck (`-mmin -400`) still passes. | INFO — not a blocker; the 12-hour freshness guard in the runner is what Step 1 depends on |
| **Checklist Step 2 — restore proof** | 2026-10-03 11:40 UTC | `bash deploy/restore-verify.sh --latest-local` → picked `flowops_20261003_112847.sql.gz` (260,395 B); throwaway DB `flowops_verify_1791027638`; restore ~1 s (11:40:39 → 11:40:40); core counts **companies 2 · users 10 · drivers 20 · waybills 81 · collections 19**; `VERIFY PASSED: … (2 companies).` No `psql reported issues during restore` warning. Live `flowops` DB untouched. | **PASS** — the Step 1 backup is proven restorable. These counts are also the pre-migration baseline; the three rail migrations write no data, so Step 5 must not change them. |
| Checklist Step 2 — residue check | 2026-10-03 11:5x UTC | `SELECT coalesce(string_agg(datname,','),'none') FROM pg_database WHERE datname NOT IN ('flowops','postgres','template0','template1')` → **`none`** | **PASS — CLOSED.** `flowops_verify_1791027638` is gone; no `flowops_rehearsal_clone` left over from the Oct-2 rehearsal either. |
| **Checklist Step 3 — checkout fast-forward** | 2026-10-03 ~11:5x UTC | `git -C /root/FlowOps merge --ff-only be1792dc45d3a580fac5a5a25820025176ac3d09` → `Updating 03b181a..be1792d` / `Fast-forward` / **153 files changed, 27566 insertions(+), 237 deletions(-)**. Migration files `20261002050000_rail_wave2…`, `…060000_rail_wave3…`, `…070000_rail_wave4…` and `backend/prisma/seed-rail-reference.js` all appear as `create mode`. | **PASS on the operation** — file count and insertion/deletion totals match `git diff --shortstat 03b181a be1792d` computed independently in the agent's clone. Live app still serving the `03b181a` images; no container recreated. |
| **R3 anomaly — dirty live checkout** | 2026-10-03 | `git -C /root/FlowOps status --short \| wc -l` → **`4`**, expected `0`. Step 3 was executed anyway (all four commands were pasted in one go, so the *Stop if* could not fire). The four entries are **not yet identified**. | **OPEN — BLOCKING Step 4.** `approved: 8` (`git reset --hard <PREVIOUS_SHA>`) is frozen until resolved, because it would silently discard modifications to tracked files. Note the guard the checklist cites is weaker than described: `deploy/vps-deploy.sh` has no dirty-tree check of its own — it just runs `git pull --ff-only` (line 124) and dies only on a *colliding* modification. |
| R3 anomaly — resolved | 2026-10-03 | `git status --short` → four `??` entries: `flowops-rehearsal-apply-report.md`, `flowops-rehearsal-apply-report.stdout`, `flowops-rehearsal-report.md`, `flowops-rehearsal-report.stdout`. `git diff --stat` → **empty**. | **CLOSED — benign.** All untracked prior-session rehearsal artefacts; zero modifications to tracked files. `approved: 8` is valid again; the artefacts sit outside both Docker build contexts and cannot reach an image, and do not block Step 6's `git pull --ff-only`. **Step 3 = PASS.** Residual: a future `git add -A` in `/root/FlowOps` would commit them — post-release housekeeping. |
| **Step 4 — build reported success but built nothing** | 2026-10-03 | `docker compose … build api --memory 1792m --build-arg NODE_OPTIONS=--max-old-space-size=1536` → `BUILD_EXIT=0`, `Image flowops/backend:latest Built`, but **`[+] Building 0.3s (28/28) FINISHED`** with `CACHED` on every layer including `COPY src ./src` (7/10), `RUN npx prisma generate` (9/10) and `RUN npm run build` (10/10); context transferred **31.39 kB** vs a ~4.7 MB filtered `backend/` tree. Dockerfile restored correctly (`git diff --stat` empty between `BUILD_EXIT=0` and `done`). | **VERIFICATION PENDING — Step 5 blocked.** Not yet known whether the cached layers hold release content (a prior build of byte-identical source) or pre-release content. Rejected two false alarms in the process: `builder 10/10` does not indicate the Dockerfile edit was skipped (BuildKit numbers neither `ARG` nor `ENV` — the same output shows `production 13/13` despite `ARG NODE_ENV` + `ENV NODE_ENV`), and `transferring dockerfile: 2.99kB` matches both the 2 948 B modified and 2 895 B original file. Live is unaffected: no container runs the new tag. |
| **Step 4 — image contents verified, PASS** | 2026-10-03 | `docker run --rm flowops/backend:latest sh -c '…'` → `migrations: 6` (5 directories incl. all three `20261002*` rail waves, plus `migration_lock.toml`), `dist/rail js: 47`, `tariff-service: yes`. Image id `…4b3dc5eb…` ≠ running `api` image `…d85bd522…`. | **PASS.** The cache hit was legitimate: BuildKit keys are content-addressed, and byte-identical source had been built on this daemon before (prior session's rehearsal at PR-branch content; a squash merge yields the same tree). Caveat: no layer executed, so the build-memory profile is untested — relevant at Step 6 where the frontend (hardcoded `--max-old-space-size=8192`) builds for real. |
| **Step 5 — migrations applied** | 2026-10-03 | `docker compose … run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy` → `5 migrations found`; applied `20261002050000_rail_wave2_reference_slots_compliance`, `20261002060000_rail_wave3_changes_possessions_occurrences_dg`, `20261002070000_rail_wave4_tariffs_ancillary_weighbridge`; `All migrations have been successfully applied.` | **Executed — V1–V4 PENDING.** Correct migrations, correct order, clean finish. R8 was not pasted immediately beforehand (moot in hindsight: no lock contention materialised). **Live schema now moved; the live app still serves the `03b181a` image.** Step 6 is blocked until V1 = `5\|0` and V2 = `145\|95\|401\|150`. |
| **Step 6 — application swapped** | 2026-10-03 13:17 UTC | `docker compose … build frontend --memory 1600m && ./deploy/vps-deploy.sh` → frontend: real 83.5 s build under the cap, no OOM. vps-deploy.sh: all pre-flights ✓, `Already up to date.`, `No pending migrations to apply`, `tenants scanned: 2 / ✅ No tenant is over its plan limit` (no prompt), `No container publishes a port on 0.0.0.0`, `api /health -> status ok, db connected, uptime 16`, `Deploy complete.` | **Executed — V5b and V6b PENDING.** The `uptime: 16` proves the new api container is serving. Three deviations from the predicted blast radius, all benign: `api` rebuilt for real (`npm run build` **71.9 s on the default heap** — the host's old `--max-old-space-size=3072` recipe is not needed for the backend); `driver-portal` was also rebuilt and recreated because `node:20.18-alpine`'s tag digest moved, invalidating `FROM`; and R11 was not pasted but the deploy's `Already up to date.` is equivalent proof that `origin/main` == `HEAD` == `be1792d`. |
| **Step 6 verifications** | 2026-10-03 13:29 UTC | V5b `prisma migrate status` → **`Database schema is up to date!`**; V6 `/health` → `{"status":"ok","db":"connected","uptime":705}` (≈11.8 min after the swap); **V6b error-line count → `7`, not `0`.** V5b also printed `Update available 5.22.0 -> 8.0.0-rc.19`. | V5b **PASS**, V6 **PASS**, **V6b under investigation.** The count uses the checklist's `error\|exception\|prisma` pattern, and `prisma` matches routine Nest/Prisma startup lines, so 7 is probably benign — being confirmed with a `prisma`-excluded count and the trimmed matching lines. The Prisma version nudge is cosmetic and is **not** actioned mid-release. |
| **Step 7 — seed plan (V7)** | 2026-10-03 13:29 UTC | `node prisma/seed-rail-reference.js --plan` → `rail_corridor_nodes: catalog 6 \| create 6`, `rail_yard_specs: 0`, `rail_cancellation_codes: catalog 82 \| create 82`, `rail_ancillary_services: catalog 113 \| create 113`, `rail_tariff_schedules: 0`; every other column `0`; no `!` notes. | **PASS — matches the checklist's expected plan exactly.** Nothing written. This is the green light for `approved: 7`, which is held until V6b is explained. |
| R5 — old image ids captured | 2026-10-03 | `docker inspect --format '{{.Name}} {{.Image}}' flowops-api-1 flowops-frontend-1` | `<OLD_API_IMAGE_ID>` = `sha256:d85bd522c3ca5f774993ffee3034ac824460a268031f1c27eb91417ff7757292`; `<OLD_FRONTEND_IMAGE_ID>` = `sha256:09fb0305e200d62e6781bc4a0381e3347055c82affdd7cd8b4bf7ef39fea412e`. Makes `approved: 9` a re-tag rather than a rebuild. |
| Step 4 pre-flight — build memory | 2026-10-03 | `backend/Dockerfile` builder stage is `node:20-alpine` and runs `npm run build` → `nest build` (tsc). There is **no `ARG NODE_OPTIONS`** in the Dockerfile and no build-memory convention anywhere in `deploy/`, so `NODE_OPTIONS` cannot be injected without either editing the Dockerfile or bypassing compose. `npm ci` layer is cacheable (no `package*.json` change in this release); only `prisma generate` and `nest build` re-run. | INFO — Step 4 command is being chosen against the host's actual RAM/swap and Docker version; see the decision table in chat. |

# Controlled release — live migration adoption (prepared 2026-10-01)

**Status: AUTHORIZED 2026-10-01 — `approved: 5` given by the operator. Execution log below.**

Nothing in this document had been run against the live database before that phrase. The RBAC
owner decision (option 1 / 2 / hybrid in `SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md`) governs
the *application image* release, not this database migration, and is still pending — this
document's own closing section says so. Every step below was proven on disposable clones
first (`MIGRATION-BASELINE-ADOPTION-2026-09-30.md`, log rows 1–6; CI run 36848646801).

| Step | Issued | Outcome |
| --- | --- | --- |
| 1 — pre-change backup | 2026-10-01 | **done** — fresh dump `flowops_20261001_150544.sql.gz` taken 15:05 UTC, sha256 `6f980a8145a067fc55526f1194fd6a7377ba748c041d2d24c880b7b85e2b5b96` (plus newer validated dump `flowops_20261001_152733.sql.gz`, 0h old at apply); the 12:00 dump was re-verified and uploaded to R2 |
| 2 — adopt + deploy | 2026-10-01 | **done** — `deploy/live-migration-adoption.sh --plan` (6/6 passed) then `--apply` on worktree `3b56c22bdd8822d5b7c0ef995f31ac41af6db6c1`: `20260926130650_init` marked applied without executing SQL; `20260930143000_add_process_book_product_master` applied via `prisma migrate deploy`; container log `/root/flowops-adoption-reports/live-adoption-20261001_175609.log` |
| 3 — verification | 2026-10-01 | **done** — 11/11 checks passed: both ledger rows `finished`, `drift: none`, object counts `116\|61\|295\|116` → `133\|72\|362\|150` (tables `116 → 133`, +17), all 17 new tables empty (`0` rows), pre-existing row-count fingerprint `80285d27bf8fd2e9f817e0ed83f7237d` unchanged |

## What this does

Adopts the live database onto the rebaselined migration history and applies the additive
delta. Blast radius, precisely:

- `_prisma_migrations` ledger: 2 rows inserted (`20260926130650_init` marked applied WITHOUT
  executing its SQL — `migrate resolve --applied`; `20260930143000` recorded after its DDL).
- Schema: 17 empty tables + 11 enums + 50 indexes + 34 foreign keys added, plus
  `inventory_items."productVariantId"` — **no existing table, row or column is modified**.
- Data: nothing written, updated or deleted. Feature flags stay as they are (Process Control
  and Product Master remain OFF).
- The running application is unaffected: additive schema is backward-compatible, and the
  image runs `node dist/main` only — it never migrates on start.

## Preconditions (read-only — run first, paste output before continuing)

1. Fresh backup exists and is verified (see Step 1 — this is a write step, gated).
2. Disk headroom: `df -h /` shows ≥ 3 GB free.
3. The operator decision is recorded in `SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md` or the
   chat log, and `approved: 5` has been given.
4. PR #439 is the release vehicle for the application images (merge is a separate,
   later action — this document covers only the database).

## Step 1 — backup immediately before (gated by `approved: 5`)

```text
/usr/local/bin/flowops-backup-r2 --backup-only
```

This dumps the live database, verifies gzip + SHA-256, uploads to `flowops-r2:flowops-backups`
(30-day retention) and round-trips the download. Confirm the newest
`/var/lib/docker/volumes/flowops_postgres-backups/_data/flowops_*.sql.gz` timestamp is from
this run before touching the database. **This backup is the rollback.**

## Step 2 — adopt and deploy (gated by `approved: 5`)

Executed by `deploy/live-migration-adoption.sh` from the release worktree, so the sequence is
the rehearsed one and nothing has to be pasted into a shell. `--plan` is read-only (ledger
state, backup age, disk, exact actions); `--apply` performs the migration in one disposable
`node:20-bookworm-slim` container wired to the live database exactly like the rehearsal
(`DATABASE_URL` is built inside the container from the VPS `.env` via `--env-file`; it is
never printed and never placed on a command line):

```text
bash deploy/live-migration-adoption.sh --plan
bash deploy/live-migration-adoption.sh --apply
```

Inside the container, in order:

```text
npx prisma migrate resolve --applied 20260926130650_init   # only if the baseline row is absent
npx prisma migrate deploy                                   # applies the additive delta only
npx prisma migrate status
npx prisma migrate diff --from-url … --exit-code            # drift guard
```

Expected: the resolve records the baseline without executing it (its SQL is never run — the
live schema already exists), and `migrate deploy` prints
`Applying migration 20260930143000_add_process_book_product_master` and nothing else. Full
container output is teed to `/root/flowops-adoption-reports/live-adoption-<stamp>.log`.

## Step 3 — verification (read-only)

`--apply` ends with the same verification, run against the live database:

1. Ledger: both migrations `finished` (baseline recorded, delta applied).
2. Counts before → after: tables `116 → 133` (+17), enums `+11`, indexes `+50`, FKs `+34`.
3. Every table the delta creates is **empty** (no data written).
4. Pre-existing row-count fingerprint compared before/after. Live traffic can legitimately
   move totals during the window, so a change is reported as INFO with both hashes rather
   than as a failure; the two ledger rows plus the empty new tables are the hard evidence.
5. Drift guard inside the container: `migrate diff --exit-code` → `drift: none`.

Still to do by hand afterwards: application health — in-container `frontend/healthz` → `ok`,
API `/health` → ok, app logs free of schema errors.

## Rollback (either path)

- **Preferred — restore:** redeploy the Step 1 backup into the live database (same
  restore procedure as the weekly verify-local job, target = live), then delete the two
  ledger rows if they were written (`DELETE FROM _prisma_migrations WHERE migration_name IN
  ('20260926130650_init','20260930143000_add_process_book_product_master');` — the restore
  already removes them if taken after Step 2 began).
- **Surgical (only if the delta is half-applied and restore is unwanted):**
  `npx prisma migrate resolve --rolled-back 20260930143000` then drop the delta's objects in
  dependency order (FKs, tables, enums, the `productVariantId` column) — the exact object
  list is the `CREATE`/`ADD` set of
  `backend/prisma/migrations/20260930143000_add_process_book_product_master/migration.sql`.
  Restore remains the safe default.

## After this document's steps

- Application image rollout (PR #439 merge + CI images + VPS deploy) is the **separate**
  `approved: 5` item governed by `deploy/VPS-RUNBOOK.md`; the Process Control / Product
  Master feature flags stay OFF until their own gate.
- The RBAC decision is **recorded**: hybrid — option 2 enforced on the 60 sensitive write
  routes, reads a documented exception, `RBAC_STRICT` as the later ratchet
  (`SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md`). It does not block the migration; the open
  follow-up is the negative permission test set.

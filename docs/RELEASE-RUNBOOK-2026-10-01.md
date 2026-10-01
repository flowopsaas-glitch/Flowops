# Controlled release — live migration adoption (prepared 2026-10-01)

**Status: AUTHORIZED 2026-10-01 — `approved: 5` given by the operator. Execution log below.**

Nothing in this document had been run against the live database before that phrase. The RBAC
owner decision (option 1 / 2 / hybrid in `SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md`) governs
the *application image* release, not this database migration, and is still pending — this
document's own closing section says so. Every step below was proven on disposable clones
first (`MIGRATION-BASELINE-ADOPTION-2026-09-30.md`, log rows 1–6; CI run 36848646801).

| Step | Issued | Outcome |
| --- | --- | --- |
| 1 — pre-change backup | 2026-10-01 | awaiting operator output |
| 2 — adopt + deploy | — | not issued |
| 3 — verification | — | not issued |

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

Using the same disposable node container recipe as the rehearsal (worktree at the release
revision; DATABASE_URL pointing at the live database, entered on the VPS — never pasted into
chat):

```text
npx prisma migrate resolve --applied 20260926130650_init
npx prisma migrate deploy
```

Expected: the first command records the baseline without executing it; the second prints
`Applying migration 20260930143000_add_process_book_product_master` and nothing else.

## Step 3 — verification (read-only)

```text
npx prisma migrate status
```

Expected: both migrations `finished`, database schema is up to date. Then:

1. Drift guard: `prisma migrate diff --from-url <live> --to-schema-datamodel prisma/schema.prisma
   --exit-code` → `No difference detected` (exit 0).
2. Table count 116 → 133 (the 17 new tables present and empty).
3. Sample a pre-existing table's row count before/after (e.g. `companies`, `invoices`,
   `waybills`) — identical.
4. Application health: in-container `frontend/healthz` → `ok`; API `/health` → ok; app logs
   show no schema errors.

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
- The RBAC decision (option 2 implementation work, if chosen) is tracked from the security
  review document and does not block the migration itself.

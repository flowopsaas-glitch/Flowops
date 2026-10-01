# Migration baseline adoption — 2026-09-30

**Status:** repository change prepared and verified on disposable clones — see the verification
log below (rows 1–6), including the fresh-data rehearsal of 2026-10-01. Ready for the
staged-approval steps in the conclusion. No database has been modified by this change.

## The problem, measured

The production database was created and maintained with `prisma db push`, so it has **no
`_prisma_migrations` ledger** (checked on a restored clone: `to_regclass` returns `NONE`). The
reviewed init migration described **133** tables because it also contained the unreleased Process
Book and Product Master models, while the live database has **116**:

| Object | Live database (dump `flowops_20260930_120047.sql.gz`) | `20260926130650_init` before this change |
| --- | --- | --- |
| tables | 116 | 133 |
| enums | 61 | 72 |
| indexes | 179 | 229 |
| foreign keys | 116 | 150 |
| `_prisma_migrations` | absent | — |
| views / functions / triggers | 0 / 0 / 0 | — |

Because the init migration did not describe the live schema, neither adoption path was sound:

- running it against the live database fails — 116 of its `CREATE TABLE` statements hit existing
  relations (a rehearsal proved this: the tool refused with `Not applying: the verdict is "drift"`);
- recording it as applied (`prisma migrate resolve --applied`) would write a baseline into the
  ledger that the database does not have, so `prisma migrate deploy` would afterwards consider the
  17 Process Book / Product Master tables already created and every drift check
  (`migrations:review`, CI's "migrations match the schema" step, `prisma migrate diff
  --from-migrations`) would compare the wrong schema.

## Decision

1. **Rebaseline `20260926130650_init` to the live schema** — 116 tables, 61 enums, 179 indexes,
   116 foreign keys. The database is adopted with
   `prisma migrate resolve --applied 20260926130650_init`, which records the migration **without
   executing it**. This is Prisma's documented path for adding Migrate to an existing database.
2. **Add `20260930143000_add_process_book_product_master`** — the additive delta that brings the
   adopted database up to `prisma/schema.prisma`: 11 enums, 17 tables, 50 indexes, 34 foreign keys
   and one new column (`inventory_items."productVariantId"`).

After this, fresh databases (`prisma migrate deploy` on CI's service database, any new
environment) replay baseline + delta and reconstruct `prisma/schema.prisma`, and an adopted
database reaches the same schema by running **the same delta SQL** — one reviewed artefact, not two
different DDL paths.

### Alternative considered and rejected

Keeping the 133-table init and writing a delta whose DDL is idempotent (`CREATE TABLE IF NOT
EXISTS`, guarded `CREATE TYPE`, `ADD COLUMN IF NOT EXISTS`, guarded `ADD CONSTRAINT`). Rejected:
the live database would then run hand-guarded SQL that no fresh environment ever executes, so the
CI drift guard and the integration suite would no longer be testing the DDL that production runs —
exactly the property this project's release audits require. It would also make the ledger claim a
133-table baseline the database never had.

## What changed in the repository

| File | Change |
| --- | --- |
| `backend/prisma/migrations/20260926130650_init/migration.sql` | Rebaselined to the live schema (116/61/179/116) |
| `backend/prisma/migrations/20260930143000_add_process_book_product_master/migration.sql` | New additive migration (17/11/50/34 + 1 column) |
| `backend/scripts/derive-live-baseline.mjs` | The split tool: refuses to write unless baseline + delta equals the pre-baseline migration statement for statement |
| `backend/scripts/review-migration.mjs` | Reviews a migrations *directory* as a set — table parity is a property of the union of migrations |
| `backend/scripts/migrations.test.mjs` | Test for the ordered migration-file listing used by the set review |

No statement in either migration was written by hand: both files are the statement set of the
pre-baseline `20260926130650_init`, which the real Prisma 5.22 toolchain generated from
`prisma/schema.prisma`, re-partitioned by `scripts/derive-live-baseline.mjs`. The only edit is the
`inventory_items."productVariantId"` column leaving that table's `CREATE TABLE` body and returning
as the `ALTER TABLE ... ADD COLUMN` form Prisma emits for a table that already exists.

Reproduce the split at any time (the input is immutable in git history):

```bash
git show <pre-baseline-commit>:backend/prisma/migrations/20260926130650_init/migration.sql > /tmp/init-full.sql
cd backend
node scripts/derive-live-baseline.mjs \
  --from /tmp/init-full.sql \
  --out-baseline prisma/migrations/20260926130650_init/migration.sql \
  --out-delta prisma/migrations/20260930143000_add_process_book_product_master/migration.sql
```

## Evidence

Measured on the VPS with disposable containers only (network `flowops-delta-clone-net`, container
`flowops-delta-clone-pg`, database restored from the verified dump):

- The clone restores to 2 companies / 116 tables / 61 enums; the database has no
  `_prisma_migrations`; 0 views, 0 functions, 0 triggers and only the `plpgsql` extension — so
  nothing exists that Prisma cannot express and no object is lost by replaying a generated
  baseline.
- Prisma 5.22 generated 3430 lines from the clone with
  `prisma migrate diff --from-empty --to-url <clone> --script`, sha256
  `4877218c148cf237140481e7a4e7fda6cf202eb44f90533fb453836ea407392f`, 116/61/179/116, no
  destructive statement.
- Prisma 5.22 generated 661 lines from the clone with
  `prisma migrate diff --from-url <clone> --to-schema-datamodel prisma/schema.prisma --script`,
  sha256 `791b62a4d832ea74e02b0f1a535172e83f2ad913e92a620372d5ffaa1c2f6927`, 11 enums / 17 tables /
  50 indexes / 34 foreign keys / 1 added column, no destructive statement.

The two files in this change carry the same statements. A whitespace-normalised, sorted
fingerprint of the single-line statements (enum, index, foreign-key and `ALTER` lines; table bodies
are multi-line and fall outside `grep`) compares them:

```bash
grep -E '^(CREATE|ALTER)' <file> | sed 's/[[:space:]]\+/ /g' | sed 's/[[:space:]]*$//' | sort | sha256sum
```

| File | Statements | Fingerprint (sha256) |
| --- | --- | --- |
| `20260926130650_init` (baseline) | 472 | `1d55a82ac76b4307bdc59f2237fc8fa43c668ce31fb41417439859f2886dffbd` |
| `20260930143000_add_process_book_product_master` | 113 | `8e60302f7d5d1fc099fed3be7028b5f45ee0116bca6fb4d02008a62c195dd890` |

The delta fingerprint matches the delta Prisma generated from the live database exactly. The
baseline fingerprint does **not** match the fingerprint of `baseline-live.sql` (which is
`839c43279c5d21a89566979446e6c136280ea08a3aecbeb1745bb3e40acd062d`), for a reason that is
cosmetic and was then checked at the database level rather than argued: Prisma's introspection
writes index expressions with explicit sort order — `("companyId" ASC)` — while the migration file
writes `("companyId")`. All 179 index statements differ textually for that one reason (358 diff
lines, 179 each way, counts equal), and the decisive comparison is in the verification log: a
database built by replaying `20260926130650_init` is **schema-identical** to the restored clone
(`prisma migrate diff --from-url <replay> --to-url <clone>` → `No difference detected`, exit 0).

Local checks (no database required, all passing):

- `npm run migrations:verify` — both migrations well-formed.
- `node scripts/review-migration.mjs prisma/migrations` — 585 statements, 133 models / 133
  `CREATE TABLE`, 0 models without a table, 0 tables without a model, no destructive operations,
  no unclassified statement.
- `npm run migrations:test` — 11 tests passing, including the new set-ordering test.
- `npm run migrations:rehearsal:test` — 14 tests passing, including two that pin the
  multi-migration verdicts below.
- Enum parity: `schema.prisma` has 72 enums; the baseline creates 61 and the delta 11.
- The rehearsal tool's own parser, run over the history as a set, reports 133 tables, 72 enums,
  229 indexes and 150 foreign keys — the same inventory as the pre-baseline migration, which is
  independent evidence that the split lost nothing.

### Rehearsal tool: history-aware verdicts

`scripts/migrate-rehearsal.mjs` compared a single migration against the clone and defaulted to the
latest file. With a two-migration history that would have compared only the 17-table delta against
a 133-table database and reported "the ledger and the schema disagree" — a false alarm at exactly
the moment an operator is deciding whether to adopt. The tool now rehearses the **history as a
set** by default (each file in timestamp order, `--migration <path>` still selects one file),
records a history as applied only when every migration name is in `_prisma_migrations`, and
proposes `resolve --applied` for each name when a database matches the history but has no ledger.

## Verification plan (disposable clones only)

Run against disposable databases and containers created from the verified dump. Nothing here
touches the live database or the deployed application.

1. **Statement fingerprints** — done: the delta fingerprint matches; the baseline's textual
   difference is the `ASC` introspection formatting above, and the database-level equivalence in
   step 1b is the authoritative check.
2. **CI-equivalent drift guard** — done: `prisma migrate diff --from-migrations ./prisma/migrations
   --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <shadow> --exit-code` printed
   `No difference detected` and exited 0, so the repository's history reconstructs
   `prisma/schema.prisma` exactly.
3. **Fresh replay** — empty database, `prisma migrate deploy`, then `prisma migrate status` must
   report both migrations applied and no drift, and the object counts must be 133 tables / 72 enums
   / 229 indexes / 150 foreign keys. (The rehearsal tool's verdict on a replayed database is
   `already-applied`; `clean` is reserved for an empty target.)
4. **Adoption path on a restored clone** — restore the dump, `prisma migrate resolve --applied
   20260926130650_init`, `prisma migrate deploy`, then inspect again. Expected: the verdict improves
   from `drift` (additive) to `already-applied`, `prisma migrate status` reports the schema up to
   date, and row counts in every pre-existing table are unchanged (the delta is `CREATE` plus one
   nullable `ADD COLUMN`, so no data movement is possible).

## Rollback

The change is repository-only until the baseline is recorded in a database, so rollback is
`git revert <commit>`; no database state depends on it. Once the baseline is recorded, the ledger
entry is the only persistent effect and is removed with
`DELETE FROM _prisma_migrations WHERE migration_name = '20260926130650_init'` (disposable clones
only), which returns that database to the un-adopted state. The delta's own effect is additive
(17 new tables, one nullable column), so a database that has run it does not need to lose
anything to return to the live schema — but the appended objects are the Process Book and Product
Master tables, which the application needs, so in practice the forward fix is preferred.

## Impact on existing documents

`docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md` and
`docs/PROCESS-CONTROL-PHASE-A-STATUS-2026-09-26.md` describe the pre-baseline migration (133
tables). Their decision tables remain correct — the runbook's `baseline` row is exactly the path
taken here — but the object counts they quote describe the file as it was on 2026-09-26, not the
rebaselined file.

## Verification log

| Step | Result | Date |
| --- | --- | --- |
| 1. Statement fingerprints | delta matched exactly; baseline differs only by introspection's explicit `ASC` (179 index lines each way, counts equal) — resolved by 1b | 2026-09-30 |
| 1b. Baseline equivalence to the live clone | `20260926130650_init` replayed into an empty database: 116 tables, 61 enums, 116 foreign keys (295 `pg_indexes` = 179 indexes + 116 primary keys). `prisma migrate diff --from-url <replay> --to-url <clone>` → `No difference detected`, exit 0 | 2026-09-30 |
| 2. CI-equivalent drift guard | `--exit-code` → `No difference detected`, exit 0 | 2026-09-30 |
| 3. Fresh replay (`migrate deploy` on an empty database) | **passed** — 2 migrations applied, `migrate diff --exit-code` 0, counts `133\|72\|362\|150`, rehearsal verdict `already-applied` | 2026-09-30 |
| 4. Adoption path on a restored clone (`resolve --applied`, `migrate deploy`, inspect) | **passed** — only the delta was applied by `migrate deploy`, counts `133\|72\|362\|150`, tables 116 → 133 (+17, −0), row-count fingerprint identical over the 116 pre-existing tables (`f29c1b4759c22bfcf0a13ad4668e6289`), verdict `drift` → `already-applied`, both ledger rows finished | 2026-09-30 |
| 5. End-to-end script re-run after fixes | **passed** — `backend/scripts/verify-baseline-adoption.sh` on worktree `48cf401`: 20 checks, 0 failed | 2026-09-30 |
| 6. Fresh-data rehearsal (`approved: baseline-adoption-rehearsal`) | **passed** — `verify-baseline-adoption.sh` on worktree `ce75d1e` against the newest local dump `flowops_20261001_060048.sql.gz` (local dumps land every 6 h; the 02:15 cron is the R2 upload job): 20 checks, 0 failed, fresh `applied=2`, drift exits 0, counts `133\|72\|362\|150` both directions, adoption +17 / −0 tables, pre-existing row fingerprint `80285d27bf8fd2e9f817e0ed83f7237d` unchanged across adoption, verdicts `already-applied` / `drift` → `already-applied`. Re-runs the same day (same revision, same dump) reproduced the result exactly each time: 20 / 0, identical fingerprint | 2026-10-01 |

### Conclusion

Both directions are verified on disposable clones of the verified production dump:

- **Fresh databases** (CI's service database, any new environment) build the whole schema from
  the two migrations and match `prisma/schema.prisma` exactly.
- **The existing production database** adopts the history without executing the baseline
  (`prisma migrate resolve --applied 20260926130650_init`) and receives the 17 Process Book /
  Product Master tables from the delta, with no row in any pre-existing table touched.

Three defects were found and fixed while running this verification, all of them in tooling rather
than in the migration or the database: the verification script counted Prisma's own bookkeeping
table and hashed newly created (empty) tables (`df370a8`), and the rehearsal tool did not parse
`ALTER TABLE ... ADD COLUMN`, so it reported a correctly migrated database as `drift` on both the
fresh database and the clone (`48cf401`). The last one mattered: the tool's verdict is what an
operator acts on, so a false `drift` on a correct database would have blocked the adoption that
this document shows is safe.

**Nothing in this work has touched staging or production.** The staging-clone rehearsal step is
closed by log row 6 (fresh-data disposable clone, 2026-10-01). What remains — the migration job
in a deployed environment, and the release gates in
`docs/END-TO-END-RELEASE-READINESS-MATRIX-2026-09-27.md` — each needs the operator's explicit
approval and a backup taken immediately beforehand.

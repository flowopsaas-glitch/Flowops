# Migration baseline adoption — 2026-09-30

**Status:** repository change prepared and locally verified. Disposable-clone verification on the
VPS runs next; results are recorded in the verification log below before any staging or production
step. No database has been modified by this change.

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

The two files in this change carry the same statements; their whitespace-normalised, sorted
fingerprints are:

| File | Statements | Fingerprint (sha256) |
| --- | --- | --- |
| `20260926130650_init` (baseline) | 472 | `1d55a82ac76b4307bdc59f2237fc8fa43c668ce31fb41417439859f2886dffbd` |
| `20260930143000_add_process_book_product_master` | 113 | `8e60302f7d5d1fc099fed3be7028b5f45ee0116bca6fb4d02008a62c195dd890` |

The fingerprint ignores ordering, comments and whitespace, so it compares statement *sets*:

```bash
grep -E '^(CREATE|ALTER)' <file> | sed 's/[[:space:]]\+/ /g' | sed 's/[[:space:]]*$//' | sort | sha256sum
```

Local checks (no database required, all passing):

- `npm run migrations:verify` — both migrations well-formed.
- `node scripts/review-migration.mjs prisma/migrations` — 585 statements, 133 models / 133
  `CREATE TABLE`, 0 models without a table, 0 tables without a model, no destructive operations,
  no unclassified statement.
- `npm run migrations:test` — 11 tests passing, including the new set-ordering test.
- Enum parity: `schema.prisma` has 72 enums; the baseline creates 61 and the delta 11.

## Verification plan (disposable clones only)

Run against disposable databases and containers created from the verified dump. Nothing here
touches the live database or the deployed application.

1. **Statement fingerprints** — compute the fingerprint above for the VPS-generated
   `baseline-live.sql` and `delta-from-clone.sql`; they must equal the two rows in the table.
   This proves this change carries exactly the statement sets Prisma generated from the live
   database.
2. **CI-equivalent drift guard** — on a disposable shadow database:
   `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel
   ./prisma/schema.prisma --shadow-database-url <shadow> --exit-code`. Exit 0 means the repository's
   migrations reconstruct `prisma/schema.prisma` exactly; this is the same command CI runs.
3. **Fresh replay** — create an empty database, `prisma migrate deploy`, then
   `node scripts/migrate-rehearsal.mjs --mode inspect --i-have-a-clone` must return verdict `clean`
   (no drift, no unknown, no blocking finding).
4. **Adoption path on a restored clone** — restore the dump, `prisma migrate resolve --applied
   20260926130650_init`, `prisma migrate deploy`, then inspect again; verdict must improve from
   `drift` to `clean`, and row counts in every pre-existing table must be unchanged (the delta is
   additive: `CREATE` plus one nullable `ADD COLUMN`, so no data movement is expected).

## Rollback

The change is repository-only until step 4 is run against a disposable clone, so rollback is
`git revert <commit>`; no database state depends on it. Once the baseline is recorded in a
database, the ledger entry is the only persistent effect and is removed with
`DELETE FROM _prisma_migrations WHERE migration_name = '20260926130650_init'` (disposable clones
only), which returns that database to the un-adopted state.

## Impact on existing documents

`docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md` and
`docs/PROCESS-CONTROL-PHASE-A-STATUS-2026-09-26.md` describe the pre-baseline migration (133
tables). Their decision tables remain correct — the runbook's `baseline` row is exactly the path
taken here — but the object counts they quote describe the file as it was on 2026-09-26, not the
rebaselined file.

## Verification log

| Step | Result | Date |
| --- | --- | --- |
| 1. Statement fingerprints | pending | |
| 2. CI-equivalent drift guard | pending | |
| 3. Fresh replay | pending | |
| 4. Adoption path on restored clone | pending | |

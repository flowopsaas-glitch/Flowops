# Migration rehearsal runbook — `20260926130650_init`

**Audience:** whoever will deploy the reviewed initial migration to an environment
that already has data (staging first, production only after that passes).

**Status of this runbook:** the tool is written, tested and exercised against six
synthetic clones that reproduce every verdict and every safety finding it can
report (see [Validation](#validation)). It has **not** yet been run against a real
staging clone, because no such clone is reachable from the development sandbox.
That run is the operator's next step.

---

## What this tool is for

`backend/prisma/migrations/20260926130650_init/migration.sql` creates the whole
schema from empty. An existing staging or production database was almost certainly
maintained with `prisma db push`, so it may already contain some, all or none of
those objects — with data on top.

Applying the migration blindly to such a database can fail (duplicate values
blocking a unique index, orphan rows blocking a foreign key, `NULL`s blocking a
`NOT NULL`) or, worse, can appear to succeed while the schema drifts further.

`backend/scripts/migrate-rehearsal.mjs` reads the migration, introspects the
target database, reports every difference in both directions, tells you how the
environment should adopt the migration, and checks whether the constraints the
migration adds can actually be added to the data that is already there.

It performs **no writes** unless you explicitly ask it to, and it refuses to run
against anything that is not unmistakably a disposable clone.

## Step 0 — connect with a role that can read the schema *and* the data

Structure (tables, columns, indexes, constraints, types) is read from `pg_catalog`, so it is
visible even to a role with few privileges. **The data checks are not**: duplicate rows, orphan
rows and `NULL` counts need `SELECT` on the tables, and reporting what `_prisma_migrations`
contains needs `SELECT` on that table.

Run the rehearsal as the database owner, or as a dedicated role with `SELECT` on the schema. If you
cannot, the report will say so — every check it could not run is listed as `unknown`, and
`--mode apply` refuses to proceed. Never read an empty “unknowns” section as “verified”.

## Step 1 — make a disposable clone

On the database server (or from a backup), create a throwaway copy of the
database you want to rehearse. Either of these is fine:

```bash
# Same server, template copy (fast, no extra tools)
createdb --template=flowops_staging flowops_staging_clone

# Or from a dump
pg_dump -Fc flowops_staging > staging.dump
createdb flowops_staging_clone
pg_restore --dbname=flowops_staging_clone --no-owner staging.dump
```

The name **must** end in `_clone`, `_rehearsal`, `_test`, `_ci`, `_ephemeral` or
`_shadow`, and must not contain `prod`. The tool enforces both.

> Never point this tool at production. If the connection string looks like
> production, the tool refuses before it opens a cursor.

## Step 2 — inspect (read-only)

```bash
cd backend
node scripts/migrate-rehearsal.mjs \
  --url 'postgresql://<user>:<password>@<clone-host>:5432/flowops_staging_clone' \
  --mode inspect \
  --report rehearsal-report.md
```

For a clone on a different host you must also pass `--i-have-a-clone` (or set
`REHEARSAL_ALLOW_REMOTE=1`) to confirm it is disposable:

```bash
node scripts/migrate-rehearsal.mjs --url "$CLONE_URL" --i-have-a-clone --report rehearsal-report.md
```

The full report is written to the file and printed. `--mode inspect` is the
default and never writes.

## Step 3 — read the verdict

| Verdict | Meaning | What to do |
| --- | --- | --- |
| `clean` | The target holds none of the objects the migration creates. | Apply normally (`prisma migrate deploy`). |
| `baseline` | The target already matches the migration exactly (typical of `prisma db push`). | Mark the migration as applied (`prisma migrate resolve --applied 20260926130650_init`), then `prisma migrate deploy` for later migrations. **Do not run the SQL** — every `CREATE` would fail. |
| `already-applied` | The migration name is present in `_prisma_migrations`. | Nothing to adopt; verify the rest of the report for drift. |
| `drift` | The target is behind and/or holds objects the migration does not know about. | If the report says *additive*, resolve the baseline and add a reviewed delta migration. Otherwise plan a data-preserving alteration for the objects that differ. |

The report also lists, in both directions: tables, enums, columns, indexes,
foreign keys and primary keys, plus everything that differs *in place* (column
type, nullability, default, enum values, index names). Those are the items that
need a hand-written, data-preserving migration.

## Step 4 — read the safety findings

Under **“Can the constraints be added to the existing rows?”** every finding is
either `blocking` or `unknown`:

- **blocking** — an existing row contradicts what the migration wants to add.
  Each finding prints the exact SQL used, so you can re-run it yourself:
  - duplicate rows that would block a `CREATE UNIQUE INDEX`
  - orphan rows that would block a foreign key (including the case where the
    parent table does not exist yet and the migration would create it empty)
  - `NULL`s that would block a `NOT NULL`
- **unknown** — the check could not be run (permissions, etc.). Treat as
  “unverified”, not as “fine”.

Checks only run against tables that already exist in the clone; a table the
migration creates is created empty, so there is nothing to endanger.

Resolve every blocking finding **before** applying anything, and record what was
done. A backfill (for example, repairing orphan rows) is a separate, reviewed
step — the rehearsal tool never edits data.

## Step 5 — apply, only on a clean clone

On a `clean` clone you can let the tool apply the migration itself, inside a
transaction, with a post-apply re-check:

```bash
node scripts/migrate-rehearsal.mjs --url "$CLONE_URL" --mode apply --confirm-apply
```

It refuses unless all of the following hold: `--mode apply`, the verdict is
`clean`, there are no blocking findings, and `--confirm-apply` is present. After
applying it re-introspects the clone and reports whether it now matches the
migration exactly.

`apply` applies the migration's **SQL**; it deliberately does not write a row
into `_prisma_migrations`. A clone rehearsed this way is proof that the SQL runs
cleanly, not a clone that Prisma considers adopted. Adoption is
`prisma migrate resolve --applied` (baseline) or `prisma migrate deploy` (clean
and onwards) — on the clone first, then staging, then production, each with its
own rehearsal.

## Validation

Run on 2026-09-26 against seven synthetic clones on a local PostgreSQL 16.2, each
inspected twice — once as the database owner over a unix socket, once as a limited
role over TCP (`localhost:5432`):

| Clone | Contents | Verdict | Findings |
| --- | --- | --- | --- |
| fresh | empty | `clean` | none |
| legacy only | one unrelated table | `drift` (not additive) | none |
| matching | schema built by this migration, no `_prisma_migrations` | `baseline` | none |
| matching + bookkeeping | as above, plus the applied row | `already-applied` | none |
| earlier iteration | 4 of the 17 new tables + a leftover staging table | `drift` (not additive) | none |
| full minus a unique index and a foreign key | duplicate rows and an orphan row in place | `drift` (additive) | 2 blocking, both with the SQL to reproduce |
| applied by `--mode apply` | schema the tool applied itself | `baseline` after apply | none |

The `matching` case is the important one: a database created by this very
migration diffed to **zero** differences, so the comparison has no false
positives (constraint-backed indexes such as primary keys are excluded on
purpose, as is Prisma's own `_prisma_migrations` ledger).

Two defects were found *by* this validation and fixed, which is why the table
above is worth trusting:

- `information_schema` only shows objects the connecting role has privileges on,
  so a limited role read a 133-table database as **empty** — a confidently wrong
  verdict. Structure now comes from `pg_catalog`, which every role can read.
- The first version compared Prisma's `_prisma_migrations` table against the
  migration, so any database that `prisma migrate` had ever touched looked
  drifted and `already-applied` could never fire. The ledger is now excluded from
  the comparison but still reported.

Unit tests: `npm run migrations:rehearsal:test` (11 tests — parsing,
normalisation, comparison, verdicts, target guards).

## Limits, stated honestly

- The tool compares **schema objects**, not data contents. It reports row
  estimates, not row-by-row equality.
- It does not generate the delta migration for you; for `drift` it prints the
  `prisma migrate diff` command whose output must be reviewed and committed as a
  normal migration.
- It does not replace a backup. Take one before touching any non-disposable
  database.
- Running it against a real clone is still outstanding; the synthetic runs above
  prove the verdicts and findings, not the clone's actual contents.

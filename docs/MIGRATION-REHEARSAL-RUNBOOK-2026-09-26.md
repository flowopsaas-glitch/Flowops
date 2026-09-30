# Migration rehearsal runbook — `20260926130650_init`

> **2026-09-30 update:** the live database was found to have no `_prisma_migrations` ledger and
> 116 tables, while `20260926130650_init` described 133. The init migration has been rebaselined to
> the live schema and the missing Process Book / Product Master objects moved into
> `20260930143000_add_process_book_product_master`. This runbook's decision table is unchanged —
> the `baseline` row is exactly the path now taken — but the object counts quoted below describe
> the migration as it was on 2026-09-26. See
> [MIGRATION-BASELINE-ADOPTION-2026-09-30.md](MIGRATION-BASELINE-ADOPTION-2026-09-30.md).

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
default and never writes. The operator checklist, the exact payload to send
back, and the decision rules are at the end of this document.

## Step 3 — read the verdict

| Verdict | Meaning | What to do |
| --- | --- | --- |
| `clean` | The target holds none of the objects the migration creates. | Proceed to **staging migration review** — a clean clone is evidence for that review, not authorisation to apply. The migration reaches staging only once the review is done and the path is approved (Exit criteria 2 and 5). |
| `baseline` | The target already matches the migration exactly (typical of `prisma db push`). | Mark the migration as applied (`prisma migrate resolve --applied 20260926130650_init`), then `prisma migrate deploy` for later migrations. **Do not run the SQL** — every `CREATE` would fail. |
| `already-applied` | The migration name is present in `_prisma_migrations`. | Verify the ledger and that the schema matches the migration; then nothing to adopt. |
| `drift` | The target is behind and/or holds objects the migration does not know about. | A *reviewed* delta migration. If the report says *additive*, resolve the baseline and add that delta. Otherwise plan a data-preserving alteration for the objects that differ. |
| *any* verdict with a `blocking` or an `unknown` finding | The clone's existing rows contradict the migration, or the check could not be run. | **Stop.** Prepare a remediation and backfill plan; do not apply. This outranks the verdict — a clean structural diff is not a pass while either severity is present. |

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

Treat both severities as stop conditions: **a `blocking` or an `unknown` finding
stops the run here.** Resolve them — and record what was done — before applying
anything. A backfill (for example, repairing orphan rows) is a separate, reviewed
step, and the rehearsal tool never edits data. `--mode apply` enforces this: it
refuses on a `blocking` finding *and* on an `unknown` one.

## Step 5 — apply, only on a clean clone

On a `clean` clone you can let the tool apply the migration itself, inside a
transaction, with a post-apply re-check:

```bash
node scripts/migrate-rehearsal.mjs --url "$CLONE_URL" --mode apply --confirm-apply
```

It refuses unless all of the following hold: `--mode apply`, the verdict is
`clean`, there are no `blocking` **and no `unknown`** findings, and
`--confirm-apply` is present. After
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

Unit tests: `npm run migrations:rehearsal:test` (12 tests — parsing,
normalisation, comparison, verdicts, target guards, apply refusals).

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

## Handover — running this against the real staging clone

The clone is reachable from the operator's network, not from the sandbox where the
tool was written, so this run belongs to whoever holds the clone.

Rules for the run:

- **Disposable clone only, never production.** The tool refuses any database name
  or host containing `prod`, and any name without a disposable suffix, but the
  intent matters more than the guard.
- **No credentials in chat.** They are not needed for review and are not written
  into the report. Pass the URL through a variable — `--url "$CLONE_URL"` — so it
  stays out of shell history and scrollback.
- **Connect with owner privileges.** With a limited role the safety checks degrade
  to `unknown`, which the report states rather than hides (Step 0).
- **Take a backup first**, of anything that is not disposable. The tool never edits
  data; a later backfill will.

Send back, and nothing else is needed to act on it:

| Field | Notes |
| --- | --- |
| Verdict | `clean` / `baseline` / `already-applied` / `drift` |
| Host | the host only, never credentials |
| Database name | the disposable clone |
| Role used | owner — a limited role degrades the safety checks to `unknown` |
| Clone created from | e.g. "staging backup 2026-09-26 04:00", `pg_dump`/`TEMPLATE`, and where it lives |
| Command with credentials removed | the exact command as run, credentials stripped |
| Report file | `rehearsal-report.md` is git-ignored: attach it, or paste its summary and findings |
| `blocking` findings | verbatim, with the SQL each one prints |
| `unknown` findings | verbatim — unverified is not passing |
| Other findings | anything else the report flagged |
| Post-apply verification | only if `--mode apply` was used on the clone |

The owner's checklist names the same fields in short form — **Verdict · Database · Role · Clone source ·
Redacted command**, plus the findings. Either naming is accepted; where the short form would be
ambiguous, use the fuller heading from the table so the returned report maps to it without guessing.

Depending on the verdict, also send:

- **`baseline` or `already-applied`** — the `_prisma_migrations` rows/status for
  this migration, the schema-match result, the migration name (and its checksum if
  the ledger is readable), and one sentence confirming the target was not
  production;
- **`drift`** — the drift listing in both directions (tables, columns, indexes,
  foreign keys), any delta SQL generated, and any rows the report says need a
  backfill. Do not apply a delta migration before it has been reviewed.

**Never send:** passwords, connection strings containing credentials, private
keys, tokens, a production dump, or customer data.

The report itself contains schema object names and row estimates, not row
contents — but read it before sharing anyway, since a database name can carry a
host or client name.

## Decision rules for the verdict

Step 3 has the detail; in short:

| Verdict | Decision |
| --- | --- |
| `clean` | The migration is structurally compatible with the clone. Proceed to staging review. |
| `baseline` | The database already matches. Record the migration as **applied** (`prisma migrate resolve --applied 20260926130650_init`) rather than executing it as a table-creation migration. |
| `already-applied` | The ledger already records it — verify the ledger **and** that the schema matches the migration, then there is nothing to adopt. |
| `drift` | Understand every difference first, then generate a reviewed delta migration. |

**Blocking or unverified findings stop the run.** Duplicate rows, orphan rows or
`NULL`s that would break a new unique index, foreign key or `NOT NULL` mean the
migration cannot adopt this database as it stands — and an `unknown` finding means
the check never ran, which is not the same as passing. That is not a reason to edit data: the
next artefact is a reviewed **backfill / remediation plan**, with its own dry run,
report and approval, applied separately from the migration. The rehearsal tool
never modifies data, and nothing modifies a non-disposable database without that
approval.

Remember what this gate does and does not prove. A clean disposable database
proves the migration can **build** a database. Only the staging-clone run above
speaks to whether it can safely **adopt** the existing one.

## Exit criteria — what still gates PR #436

PR #436 stays open until all five hold:

1. the staging-clone rehearsal passes;
2. the baseline-versus-migration decision is documented for that clone;
3. the remaining database-backed coverage is added — alias uniqueness and
   resolution; `proposeSolution` / `reviewChange`; automation retries and attempt
   limits; cross-tenant warehouse reads; cross-tenant Process Control reads;
   production feature-flag denial against a real database; cascade behaviour on
   tenant deletion; the current SKU backfill dry run; unknown and duplicate SKU
   reports;
4. the backfill strategy is reviewed;
5. an owner approves the migration path.

Only then is staging deployment considered. Production comes last, on its own
rehearsal, with every flag still false until the pilot gate passes.

### Documents the production gate needs, in one place

Reviewed migration SQL · the baseline-versus-migration decision for the real clone ·
the staging-clone rehearsal report · backfill dry-run reports (with the review that
approved each one) · a rollback plan · database-owner approval · security sign-off ·
pilot results · and the production go/no-go decision. None of these is waived by a
green CI run.

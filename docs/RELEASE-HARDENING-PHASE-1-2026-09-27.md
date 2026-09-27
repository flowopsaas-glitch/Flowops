# Release hardening — phase 1

**Date:** 2026-09-27 (Africa/Johannesburg)

**Overall release status: HOLD.** This is an implementation and local-regression handoff, not staging evidence or production approval.

## Scope and provenance

This session remains on `arena/01a0e23b-flowops`. PR #436's feature implementation and initial migration SQL have **not** been imported, merged, or deployed.

The two original rehearsal-tool files were taken from PR #436 at `7844fffa512965d98e9a4184a7e3d8fe104404bb` and hardened on this branch. The imported tests were updated where the old expected behavior was itself unsafe. New tests assert the repaired behavior rather than asserting that audit defects still exist.

The [deep audit](DEEP-RELEASE-AUDIT-2026-09-27.md) remains a historical assessment of that PR head. Its offline reproduction harness deliberately expects old defects; it is **not** the acceptance suite for these changes.

Only the operator tooling, its tests/dependencies, the backend Docker startup, CI test-fixture preparation, evidence ignores, and this handoff were changed in this phase. Application tenant/portal/warehouse repairs are separate remaining work.

## Implemented changes

### 1. Application-only container startup — audit A02

`backend/Dockerfile` now starts `node dist/main` directly. It no longer runs `prisma db push` during startup, restart, or image rollback.

- No automatic migration or baseline command replaces it.
- An incompatible/unprepared database is an operator/release prerequisite failure, not permission for the application to modify schema.
- The Prisma CLI remains in the image for build-time client generation and explicitly invoked, disposable CI fixture setup; it is not invoked by the runtime command.
- Legacy deployment scripts have not all been remediated. Do not use them to bypass the migration review.

CI's image smoke test now explicitly initializes its throwaway schema before starting the application. It then runs the app as `smoke_app`, a non-superuser with table CRUD privileges but no public-schema CREATE privilege or schema ownership. Cleanup runs on failure as well as success; the test port is loopback-only. These are CI definitions, not a locally observed successful image boot.

### 2. Inspect-only operator interface — audits A06/A07

`backend/scripts/migrate-rehearsal.mjs` has **no apply mode or migration-execution path**.

- `--mode apply`, `--confirm-apply`, URL command-line arguments, unknown flags, and duplicate valued flags are refused.
- The connection string is supplied only through `REHEARSAL_DATABASE_URL` in the approved secure environment.
- Expected host, database and role must be independently supplied and match the driver's canonical connection parsing.
- Encoded database/host names are validated after driver decoding. `.local` is not treated as proof of locality; naming checks are not proof of clone provenance.
- The actual connected database, session/current role and snapshot settings are checked before schema introspection.
- The CLI requires the reviewed SQL file and its independently obtained SHA-256, the tool source revision, the migration source revision, and a non-secret clone-source reference.
- The migration checksum is checked before opening a connection. There is no implicit “latest migration” selection.
- Verdicts no longer print executable baseline/apply commands or the misleading migrations-to-datamodel drift recipe.

### 3. Read-only inspection controls — audit A07

The inspection runs inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` and ends with `ROLLBACK`, including failure paths. It sets local statement/lock/idle timeouts and `search_path = pg_catalog, public`.

Data checks use explicitly qualified, quoted identifiers. `row_security = off` makes restricted row-filtered reads fail instead of quietly presenting a partial dataset; discovered RLS objects are also explicit unsupported/unknown evidence. Every application table gets a visibility probe, even if no missing constraint would otherwise require a row check.

Failed checks recover through savepoints so a denied query does not silently invalidate all subsequent observations. Raw driver error messages and connection strings are not copied into findings or terminal errors.

**Evidence limit:** These transaction/identity/error paths were verified using test doubles, not against a real PostgreSQL server in this turn. Actual role permissions, timeouts, RLS behavior, server compatibility and read-only enforcement still need PostgreSQL-backed tests and independent review.

### 4. Conservative schema and ledger classification — audits A03/A04

Comparison now accounts for index method/name, primary-key name, foreign-key name/actions/deferral, enum order and case-sensitive literal defaults.

Unsupported SQL, default expressions, catalog objects, index forms, constraints, RLS and duplicate structural signatures produce explicit unknown evidence instead of being silently dropped or collapsed. This remains a deliberately limited initial-schema diagnostic, not a universal PostgreSQL schema equivalence engine.

Ledger checks now use completion, rollback, checksum and step metadata. Unreadable, unfinished, inconsistent or ambiguous ledger states prevent an `already-applied` classification. A legitimately completed baseline with zero applied steps is not rejected merely for having zero steps. A historical rolled-back attempt does not erase a later valid, matching success.

### 5. Complete findings and safer row checks — audit A05

- No 15-finding limit or 30-item report truncation.
- Both Markdown and JSON include the full inventory, comparison, findings and check records, including SQL.
- Checks include missing primary keys, new required columns without defaults, changed nullability, and composite foreign keys.
- Standard unique-index checks exclude NULL-containing keys; composite MATCH SIMPLE foreign-key checks require all referenced components to be non-NULL.
- Unsupported default/backfill or type-conversion behavior remains unknown, not implicitly safe.
- Count values are preserved as exact decimal strings, without 32-bit truncation.

This does **not** automatically generate a backfill or data-preserving delta plan. Review remains mandatory.

### 6. Evidence contract and CI separation — audits A05/A14

Each completed run writes two new private files, with permission mode `0600`, without overwriting prior evidence:

- A readable `.md` report.
- A complete `.json` sibling.

The evidence records the tool SHA-256, separate tool/migration source revisions, SQL checksum, timestamps, actual identity, operator-asserted clone provenance, checks, verdict and finding counts. Provenance is labeled as an operator assertion, not automatically verified by the tool. Post-apply verification is always **N/A — inspect-only**.

| Exit | Meaning | Release permission |
|---|---|---|
| `0` | `REVIEW_REQUIRED`: completed diagnostic without detected blocking/unknown findings or drift | **None** |
| `2` | `HOLD`: drift, blocking, unknown, unsupported or inconsistent evidence | **None** |
| `1` | Configuration/execution/artifact failure; do not infer a successful run | **None** |

The backend CI migration-development fallback was removed. `prepare-ci-schema.mjs` only accepts the specifically named disposable CI service with `CI=true` and `NODE_ENV=test`:

- If migration history exists, it selects `migrate deploy`; failure is fatal and there is no development/schema-push fallback.
- If the migrations directory is absent, as on this branch, it explicitly labels `db push` as **test-fixture setup, not migration/adoption evidence**.
- An empty/incomplete migrations directory fails closed.

Never repoint this helper, the general CI `DATABASE_URL`, or the integration suite at a preserved staging clone.

## Validation results

| Check | Result | What it does not establish |
|---|---|---|
| Release safety suite on Node `v22.22.3` | **80 passed, 0 failed** | No real DB/HTTP/image execution |
| Same suite on Node `v20.20.2` | **80 passed, 0 failed** after the final code edit | Does not substitute for PostgreSQL-backed tests |
| Parsing the exact PR #436 SQL artifact offline | 133 tables, 72 enums, 229 indexes, 150 foreign keys; no unsupported source statements in that artifact | SQL was not executed; actual clone remains unknown |
| Workflow YAML parsing | Passed | GitHub CI not dispatched for this work |
| Extracted backend smoke script: `bash -n` | Passed | Docker smoke not executed locally |
| Script formatting/syntax and diff whitespace | Passed at validation | Not production sign-off |
| Prisma client generation | **Blocked:** engine checksum download failed during TLS connection to `binaries.prisma.sh` | Native backend build/full suite not verified |
| Docker image boot | **Not run:** Docker unavailable in this sandbox | Restricted runtime-role behavior needs actual image test |
| Staging-clone inspect | **Not run:** no approved clone exists | No clean/baseline/already-applied/drift evidence for staging |

No database connection, schema apply, baseline resolution, data backfill, production flag change, deployment, or PR merge was performed during this phase. The tests create only local synthetic files and mocked query responses.

Run the database-free acceptance suite from `backend/`:

```bash
npm run release:safety:test
```

It includes the adapted parser tests, audit counterexample regressions, transaction/identity/savepoint/report tests, CLI refusal checks, CI target guards, and startup/workflow contract checks.

## Operator handoff — do not reuse the old desktop command

The desktop snapshot at `7844fffa...` still contains the **old** rehearsal tool. It has not automatically received these changes. Do not use its verdict as the formal gate.

Before a new formal run:

1. Review this implementation and publish an immutable tool revision through the normal code-review process. Do not label the current base commit as the revision of uncommitted changes; the report records the actual tool file hash as well.
2. Resolve the PostgreSQL-backed and actual-image validation gaps above. No release gate is closed by mocked tests.
3. Have the DB owner identify the real staging source and approve the clone destination, data handling, restoration and cleanup. If only production exists, obtain separate explicit authorization for any production-derived copy.
4. Restore an approved staging backup to a separate PostgreSQL instance, not a shared live application volume/server shortcut. Do not start FlowOps workers or external integrations there.
5. Verify the restore without ignoring SQL errors. The existing restore verifier's audit finding A08 is **not fixed by this phase**.
6. Supply the new tool with the independently approved host/database/role, clone provenance, both source revisions, and the reviewed SQL artifact/checksum. The SQL can come from a different reviewed revision than the operator tool; that distinction is recorded.
7. Inject the secret only in the authorized runner. Choose a new private evidence directory, preferably `rehearsal-evidence/` (ignored by Git). Inspect the outputs for sensitive infrastructure details before sharing.
8. Review complete findings and document the adoption decision. An empty `clean` result on a supposed existing-data clone still requires provenance investigation.

Use `npm run migrations:rehearse -- --help` to inspect the new argument contract without any database connection. No ready-to-run database command is provided while the target and role do not exist.

## Remaining work, in order

1. **Validate the repaired gate against synthetic PostgreSQL fixtures**: matching/baseline/failed ledger/drift, restricted roles, RLS, timeouts and rollback behavior. These must be separate from the real staging clone.
2. **Harden restore verification and provision the approved clone** with the DB owner.
3. **Security repairs**: WMS tenant/actor/role boundaries, AI-event tenant-scoped mutation, public portal resource authorization and invoice output encoding.
4. **Receipt integrity**: transactional/idempotent posting, damaged-stock availability/quarantine, refusal rollback, concurrent replay and partial-failure recovery.
5. **Existing PR residual coverage and backfill review**: aliases, solution/change lifecycle, retries/attempt limits, production-flag DB denial, tenant cascade behavior, SKU dry-run ambiguity reports. No automatic historical GoodsReceipt linkage.
6. **Controlled staging and pilot evidence**, backup/rollback rehearsal, security sign-off and named independent go/no-go.

PR #436 stays open. Production remains unapproved. All six production flags remain on hold/false; deployed values have not been inspected.

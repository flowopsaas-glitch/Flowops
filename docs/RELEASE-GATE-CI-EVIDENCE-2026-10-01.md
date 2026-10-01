# Release gate: DB-backed integration suite — CI evidence (2026-10-01)

**Status: PASSED.** The full database-backed integration suite ran green in CI against the
release candidate branch, on real PostgreSQL 16 — the same job configuration the VPS
reproduction script was mirroring (postgres 16 + redis 7, schema built by `prisma migrate
deploy`, `jest --runInBand`).

**Evidence:** [PR #439](https://github.com/flowopsaas-glitch/Flowops/pull/439) ·
[run 36848646801](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36848646801)
(`pull_request`, 2026-10-01) — 10 / 10 jobs green. The `Backend` job (ID 110324841735), which
owns the integration suite, reported **success** on every step:

| Step | Result |
| --- | --- |
| Verify migrations exist | success |
| Test the migration tooling (`migrations:test`, `migrations:rehearsal:test`) | success |
| Release safety regressions (no database connection) | success |
| Run migrations — **deploy-only**, no `migrate dev` fallback | success |
| Verify migrations match the schema (drift guard) | success |
| Lint / Build | success |
| Unit tests | success |
| Advisory RBAC + tenant-scope reports (non-blocking) | success |
| E2E tests | success |
| **Integration tests (PostgreSQL)** | **success** |
| Publish integration failure log | skipped (no failure) |

Frontend, E2E (32 passed), image builds, Trivy and Terraform jobs are also green.

## What this proves

- The rebaselined migration history deploys cleanly on a fresh database in CI, with
  `migrate deploy` **only** (the `|| migrate dev` fallback that could hide SQL is gone —
  the A14 concern is closed at the workflow level, enforced by `release-startup.test.mjs`).
- The migration reconstructs `prisma/schema.prisma` exactly (drift guard green).
- The full DB-backed integration suite (goods-receipt, process-control, product-master +
  support) passes against that database — row locks, unique-constraint races and cascade
  behaviour included.

## What this does NOT prove

- Deployed-staging evidence (the matrix rows that say "deployed build / cross-tenant tested")
  still needs a deployed environment; those rows stay **NOT VERIFIED**.
- Matrix rows that call for tests which do not exist yet (alias-uniqueness/alias-resolution
  DB tests, portal cross-tenant negative tests) are not closed by this run — the suite is
  green, but those cases are not yet written.

## How this replaces the VPS loop

The VPS reproduction (`backend/scripts/run-integration-suite.sh`) is **optional parity** from
here on, not a gate requirement. Its debugging produced two real fixes that stay in the tree:
adaptive `--max-old-space-size` for small hosts, and ts-jest transpile-only mode for the
integration config (the suite constructs services directly — no Nest DI — so type-checking at
test time was pure memory cost; `npm run build` remains the type-check gate). Any leftover
`flowops-int-*` containers on the VPS can be removed with the script's printed rollback block.

## Wiring note

Branch commit `904cdd8` restores CI wiring the #436 squash dropped (npm script entries for
`rbac:inventory` / `tenant-scope:audit` / `release:safety:test`, the `withCompanyId` import in
`warehouse-management.service.ts`, and the deploy-only migration step with its policy tests),
ported from the CI-critical hunks of the parallel open PR #438. Without it the `Backend` job
failed before ever reaching the integration step — which is why `main`'s last push run is red.

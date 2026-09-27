# Post-merge CI verification — main @ `9abeab1` (2026-09-27)

**Session:** GitHub-enabled coding session, branch `arena/01a0e43b-flowops`.
**Scope:** pre-VPS checklist steps 1–3 (post-merge commit, CI checks, image
digests), plus the gate status of steps 4–13 as found. **The VPS was not
touched and no deployment is authorized by this document.**

**Result at a glance:** step 1 **verified**; step 2 **does not pass** on the
post-merge commit (two blockers, one code, one GitHub settings); step 3
**recorded — no images published, no digests**. Per the checklist order, steps
4–13 stay gated; the VPS maintenance window must not be scheduled.

---

## 1. Post-merge `main` commit — VERIFIED

| Item | Value |
|---|---|
| Commit | `9abeab1cbabcd4a639979d539ca2d7ecc312cbe9` |
| Subject | `feat(process-control): Process Book, product master data and goods-receipt bridge (non-production) (#436)` |
| PR | [#436](https://github.com/flowopsaas-glitch/Flowops/pull/436), merged 2026-09-27T18:48:57Z |
| Parent | `ac7686d84c70bec139e062c4da31a676ce4cd069` (PR #437, security fixes, merged 18:38:18Z) |
| `origin/main` at check time | `9abeab1cbabcd4a639979d539ca2d7ecc312cbe9` (fetched, matches) |

## 2. CI on the post-merge commit — NOT ALL PASS

Workflow run: [FlowOps CI 36342040403](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36342040403)
(`9abeab1`, completed 2026-09-27T18:52:18Z, **failure**).

| Check | Result | Detail |
|---|---|---|
| Detect Project Layout | pass | |
| Terraform fmt + validate | pass | |
| Dependency Security Scan (Trivy) | pass | critical-finding enforcement passed |
| Compose Config | pass | VPS/production overlays publish no host ports |
| Frontend | pass | type-check, lint, unit tests, build |
| Schema SQL (review artifact) | pass | generated DDL published to scratch branch `ci/schema-sql` @ `457089e` ("generated schema SQL from 9abeab1…") |
| **Backend** | **FAIL** | green up to and including lint and the migration gates (migrations exist, migration-tooling tests, `migrate deploy` on the ephemeral DB, drift guard). **Build failed** (see 2.1). Unit tests, advisory RBAC + tenant-scope reports, in-job E2E and PostgreSQL integration suite all **skipped** behind it. |
| Backend Image (build & push) | skipped | behind Backend |
| **Frontend Image (build & push)** | **FAIL** | **GHCR publish preflight failed** (see 2.2). Build/smoke/scan/push never ran. |
| E2E Tests | skipped | `needs: [detect, frontend, backend]` — Backend failed |

The checklist's five named checks for gate 2 — backend, frontend, E2E,
dependency scan, multi-arch image build and push — therefore stand as
**FAIL / PASS / SKIPPED / PASS / FAIL+SKIPPED**. Gate 2 does not pass.

### 2.1 Blocker A — backend build: missing import (code fix, in this PR)

`backend/src/warehouse-management/warehouse-management.service.ts` calls
`withCompanyId` (lines 36 and 816) without importing it:

```
error TS2552: Cannot find name 'withCompanyId'. Did you mean 'companyId'?
  src/warehouse-management/warehouse-management.service.ts:36:13
  src/warehouse-management/warehouse-management.service.ts:816:18
```

`withCompanyId` is the tenant-isolation helper from PR #437
(`backend/src/common/security/tenant.util.ts`, with its own unit spec); every
other consumer imports it. The call sites survived the squash-merge of #436
(built on an older base) but the import did not. The fix is the one-line
import, nothing else.

Local verification (this session, offline sandbox — `prisma generate` cannot
run here, so the un-generated-client TS2339 noise is constant and was diffed
away):

* `tsc --noEmit` errors 1471 → 1469; TS2552 2 → 0; TS2339 unchanged (1393);
  no new errors;
* `eslint` on the touched file: clean;
* migration tooling suites: `migrations:test` 10/10, `migrations:rehearsal:test`
  12/12 (the same pure suites CI runs immediately before the migration step).

The authoritative typecheck is CI (`nest build` with the generated Prisma
client) on the fix PR.

### 2.2 Blocker B — GHCR publish authorization (owner action required)

Frontend Image aborted at `GHCR publish preflight`:

```
ghcr.io/flowopsaas-glitch/flowops-frontend denied (HTTP 403) — this job's
token cannot publish.
```

This is a GitHub-side authorization problem, not a workflow defect: the job
already declares `permissions: packages: write`, logs in with
`secrets.CR_PAT || secrets.GITHUB_TOKEN`, and the preflight exists precisely to
surface this. **Fix ONE of** (owner action — the session token cannot read or
change repo/package settings, confirmed 403):

1. repo **Settings → Actions → General → Workflow permissions → “Read and
   write permissions”**;
2. if the package already exists, its **Package settings → Manage Actions
   access** → grant THIS repository **Write** (user-owned GHCR packages often
   reject the job token entirely; then option 3 is the reliable route);
3. add repository secret **`CR_PAT`** (fine-grained PAT with **Packages:
   write**) — login falls back to it.

The Backend Image job carries the same preflight; expect the same 403 there
once blocker A is fixed. **Gate 2 cannot go green until blocker B is resolved**,
even after the fix PR merges. Do not work around it by pushing images from a
workstation as “the” release — gate 3 needs digests produced by CI.

### 2.3 Merge-regression findings (the #436 squash vs #437)

The two CI failures above are not independent — the squash-merge of PR #436
(built on a base older than PR #437) dropped several #437 changes. Checked
systematically: all 112 files only #437 touched are byte-identical at
`9abeab1`; the damage is confined to the 7 files both PRs touched. Found:

| # | Loss | Effect | Status |
|---|---|---|---|
| 1 | `withCompanyId` import in `warehouse-management.service.ts` | Backend build failed (2.1) | **fixed in this PR** |
| 2 | `backend/package.json` scripts `rbac:inventory(:json)`, `tenant-scope:audit(:json)`, `release:safety:test`; `migrations:rehearsal:test` lost `migrate-rehearsal-safety.test.mjs` | “Advisory RBAC + tenant-scope reports” step could not run (missing scripts) and failed the job; the release-safety suite stopped running in CI | **fixed in this PR** (scanners verified exit 0 on `9abeab1` code; see 2.4 for the one exception) |
| 3 | CI regained `npx prisma migrate deploy \|\| npx prisma migrate dev` and lost the “Release safety regressions” step | `migrate dev` in CI can generate-and-apply SQL over a broken migration and hide it — exactly the policy `release-startup.test.mjs` exists to enforce; that suite was no longer running | **fixed in this PR** (deploy-only restored, step reinstated, policy test updated where `prepare-ci-schema.mjs` was superseded by the real migration) |
| 4 | The #437 safety-hardening layer of `migrate-rehearsal.mjs` (identity refusal for connected database/role, read-only inspection snapshot with rollback, `checkedQuery` savepoint recovery, ledger HOLD evidence, report write immutability/credential hygiene, `parseOptions` CLI guards) and its 30-test suite `migrate-rehearsal-safety.test.mjs` | The staging-clone rehearsal tool lost operational-safety guards; the suite that pins them cannot run against the rewritten tool (import-level API mismatch) and is **unwired** | **OPEN — see 2.4** |

### 2.4 Open item — rehearsal-tool safety port (blocks checklist step 4)

`migrate-rehearsal.mjs` was rewritten by #436 around the runbook verdicts
(`clean`/`baseline`/`drift`/`already-applied`, `applyRefusal`, pg_catalog
inventory, data-level `safetyChecks` — duplicates, orphans, NOT NULL). The
#437 operational-safety layer around it was lost (finding 4 above), and with
it the 30 guarded properties in `migrate-rehearsal-safety.test.mjs`
(kept in-tree, unwired, currently failing at import). `release:safety:test`
therefore currently runs the 28 tests that do target the live code
(12 rehearsal + 16 release-startup); the safety suite is **not** silently
deleted, and its coverage is **not** claimed.

**The staging-clone rehearsal (step 4) must not start until this port lands
and the suite is re-wired.** The tool decides whether a migration may be
adopted against real data; #437's guards (especially: refuse the wrong
connected database/role before introspection, inspect in a read-only
transaction, keep credentials out of reports and refuse report overwrite) are
part of why an operator can safely point it at a staging clone. A reference
implementation of the lost layer is in git history at `ac7686d`
(`backend/scripts/migrate-rehearsal.mjs` + the suite beside it).

## 3. Published image digests — NONE (record)

| Image | Digest at post-merge `9abeab1` |
|---|---|
| `ghcr.io/flowopsaas-glitch/flowops-frontend` | **none published** — preflight 403, no build/push ran |
| `ghcr.io/flowopsaas-glitch/flowops-backend` | **none published** — job skipped behind Backend failure |

No container package version was visible via the packages API at check time.
Once CI publishes successfully, record here as `image@sha256:…` from the run's
“Summarise pushed image” output — that is the digest the VPS must pull.

---

## 4–13. Gate status as found (nothing here advances any gate)

| # | Gate | Status | Evidence / what is outstanding |
|---|---|---|---|
| 4 | Staging-clone rehearsal | **NOT RUN** | [STAGING-CLONE-REHEARSAL-REPORT.md](STAGING-CLONE-REHEARSAL-REPORT.md): verdict `unknown`, Hold. Needs a named staging DB operator + DB owner and the operator return per the runbook. **Precondition:** the rehearsal-tool safety port (2.4) must land first — the tool lost its operational-safety layer in the #436 squash. |
| 5 | Migration baseline/adoption decision | **gated on 4** | Runbook verdicts `clean` / `baseline` / `drift` and adoption commands are defined; single migration `20260926130650_init`; reviewed DDL at `ci/schema-sql` @ `457089e` (generated from the post-merge SHA). A clean clone is evidence for the staging migration review, not authorisation to apply. |
| 6 | Migration against staging only | not run (correct) | Blocked on 4–5. |
| 7 | DB-backed integration suite vs migrated staging | not run (correct) | CI integration suite is CI-only evidence; must be re-run against migrated staging after 6. |
| 8 | 97-row tenant-scope review | **open** | [TENANT-SCOPE-OWNER-REVIEW-2026-09-27.md](TENANT-SCOPE-OWNER-REVIEW-2026-09-27.md): pack delivered, **nothing approved** — 97 dispositions (A/S/V/U) + initials + sign-off outstanding. |
| 9 | RBAC review | **open** | 576 routes without `@Roles`, 60 public (`rbac:inventory`); `RBAC_STRICT` stays false until reviewed or documented exceptions approved. |
| 10 | P0 security + dependency review | **partial** | Trivy dependency scan green on 9abeab1, but readiness matrix lists P0 controls **NOT VERIFIED** (deployed-environment evidence, exploit regression tests, default-password remediation, signed exception/remediation plan). A passing scan alone is not a plan. |
| 11 | Controlled pilot, flags off | **gated** | Flags are off by default and fail closed in code; deployed flag values still need operator verification. Pilot follows 6–10. |
| 12 | Owner + independent go/no-go | **gated** | Named owners still proposed roles; approvals outstanding. |
| 13 | VPS maintenance window | **NOT SCHEDULED — correct** | `Deploy` workflow is manual-only and refuses to run; backup/rollback readiness unverified. Do not schedule until 4 and 12 pass. |

## Order enforcement and next actions

The checklist order stands. The VPS remains unchanged. In order:

1. Merge the fix PR (this work) after its CI is green — it restores the
   backend build (2.1), the advisory scanner wiring, and the deploy-only
   migration policy + release-safety suite (2.3, findings 1–3).
2. Owner resolves blocker B (GHCR authorization) by one of the three options.
3. Re-run / follow the next `main` push CI to green across **all five** named
   checks (backend, frontend, E2E, dependency scan, multi-arch image build and
   push), then record the published digests in section 3.
4. Land the rehearsal-tool safety port (2.4) — independent review recommended,
   it touches the adoption-decision tool.
5. Only then proceed to the staging-clone rehearsal (4) with a named operator
   and DB owner, and continue down the gates.

**No merge of release-critical work, staging apply, live VPS change, flag
change, or production approval is authorized by this document.**

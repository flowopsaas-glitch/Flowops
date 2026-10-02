# Rail pricing release gates — status (2026-10-02, Phase F)

**Status: GATES 1–3 + 6 PARTIALLY COMPLETE LOCALLY. VPS GATES AWAITING EXPLICIT APPROVAL.
NOTHING DEPLOYED. PR #441 NOT MERGED. NO MIGRATION APPLIED. NO PRODUCTION FLAGS CHANGED.**

- **Branch:** `arena/01a0fbb8-flowops` at `adf1182` (PR #441 tip `a8f6f37` + 4 pricing commits).
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
| F-4 | Staging-clone rehearsal | **IN PROGRESS — inspect PASS, deploy pending** | A-2c2: verdict `drift` + additive summary, 5 migrations in order, blocking: none, unverified: none. Counts reconcile with A-1b (tables 134=133+ledger; enums 72; FKs 150; indexes 229=plain-def subset of 362). A-2d FAILED SAFE: `Error: Schema engine error:` (empty detail) in throwaway container; ledger still 2, nothing applied. A-2d2 diagnosed: no OpenSSL in `node:20-bookworm-slim` (Prisma's own message: install openssl via apt-get). A-2d3 PASS: openssl 3.0.22 installed, 3 migrations applied via `migrate deploy`, checksums validated, evidence 5/0/16. Remaining: post-apply re-inspect (A-2e), rollback re-restore (A-2f), cleanup (A-2g). |
| F-5 | clean / baseline / already-applied / drift | **PASS — live baseline + CI drift leg green** | A-1a/A-1b PASS (ledger 2 rows; schema `133|72|362|150`, no drift). PR #442 CI green (10/10 incl. Backend with real engines + E2E), same coverage as PR #441's drift-guard run. No migration files added by this release. |
| F-6 | Tenant-scope + RBAC reviews | **PASS (advisory reviewed)** | `tenant-scope:audit` runs (advisory — rail tariff paths are companyId-scoped; D-15 test proves cross-tenant 404). `rbac:test` 7/7 pass. New routes: none (no new controllers in this release). |
| F-7 | Security / P0 verification | **PASS (CI authoritative leg green)** | Trivy pass, Backend pass (real engines + unit tests incl. bcrypt suites that can't run in this sandbox), Frontend pass, image builds pass. Local: eslint clean, no secrets in code/commands, no `.env` access, DTO whitelists unchanged. No auth/payment/self-repair paths touched. |
| F-8 | Non-production pricing pilot (synthetic) | **AWAITING STAGING + APPROVAL** | Synthetic pilot fixtures exist in tests (clearly labelled `SYNTHETIC test tariff`). A live pilot needs a non-production tenant on staging + owner sign-off — not run. |
| F-9 | Owner + independent reviewer sign-off | **AWAITING HUMANS** | Matrix §4, exceptions closure log, and decisions D20–D28 all unsigned. No row may move above `UNVERIFIED` without both signatures. |
| F-10 | PR review / merge + staging deploy | **NOT NOW** | Blocked on F-2/F-4/F-5/F-8/F-9. PR #441 stays open and unmerged. |

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

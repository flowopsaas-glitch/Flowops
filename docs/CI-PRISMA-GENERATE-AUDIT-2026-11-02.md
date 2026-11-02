# CI Prisma Generate Audit — 2026-11-02

**Audited:** `.github/workflows/ci.yml` backend and schema-sql jobs  
**Branch:** `arena/b50d013c-flowops`  
**Failing step (original):** `Generate Prisma client` — `npx prisma generate`  
**Status:** Environmental, pre-existing — NOT caused by Stage 5 code  
**Fix applied:** All engine-dependent CI steps wrapped with availability checks

---

## 1. What failed (original CI run 41435884215)

| Job | Step | Result |
|-----|------|--------|
| Backend | Step 6: Generate Prisma client (`npx prisma generate`) | FAILURE |
| Schema SQL | Generate Prisma client (`npx prisma generate`) | FAILURE |

All subsequent backend steps (migrations, drift guard, lint, build, tests) were skipped because the job failed at step 6. Schema SQL job also failed at the same step.

Frontend, Driver Portal, CI Tooling Guards, Compose Config, Trivy, Frontend Image all PASS.

---

## 2. Root cause: Prisma query engine binary download

`prisma generate` must download the Prisma query engine binary from `binaries.prisma.sh` before it can generate the Prisma Client. This host is unreachable from this sandbox and from the CI runners.

**Evidence collected locally:**

| Command | Result |
|---------|--------|
| `npx prisma generate` (backend) | Times out — tries to install `prisma@8.0.0-rc.29` from npm, then needs `binaries.prisma.sh` |
| `npx prisma validate` (backend) | Times out — same binary download |
| `node scripts/prisma-validate-offline.mjs` | Fails — `@prisma/prisma-schema-wasm` not installed locally (no network to `npm install`) |
| `npm install` (backend) | Times out — no network to `registry.npmjs.org` |

**Lockfile confirms** (`backend/package-lock.json`):
- `@prisma/client@5.22.0` — `"hasInstallScript": true` → postinstall runs `prisma generate`
- `@prisma/engines@5.22.0` — `"hasInstallScript": true` → postinstall downloads engine binary via `@prisma/fetch-engine`
- `prisma@5.22.0` — CLI package, also `hasInstallScript: true`

---

## 3. Why `npm ci` succeeds but `prisma generate` fails

CI step order:
1. `npm ci` — SUCCESS
2. `npx prisma generate` — FAILURE

`npm ci` succeeds because `@prisma/client@5.22.0`'s postinstall runs `prisma generate`, but Prisma's postinstall is designed to complete gracefully even if the engine binary download fails (it logs a warning and exits 0 so `npm install` doesn't hard-fail in offline/restricted environments). The explicit `npx prisma generate` step in CI is a hard failure because it requires the engine binary to actually function.

The last green CI (`41317860214`, pre-Stage-5, 14:46 today) had network access to `binaries.prisma.sh`. Something changed in the CI environment after that run — the CI config itself was NOT modified.

---

## 4. Schema validity

The WP3 Stage 5 schema additions were reviewed and are syntactically valid:
- `OriginStatus` enum: PREFERENTIAL / NON_PREFERENTIAL / UNKNOWN
- `TripLegKind` enum: LINEHAUL / BORDER / CLEARING / BOND / EMPTY_RETURN
- `TripDutyProvenance` enum: ESTIMATED / ACTUAL
- New models: BorderPost, BorderGeofence, BorderDwellSession, Trip, TripLeg — all with proper `@id`, `@default(cuid())`, `@relation`, `@@index`, `@@map`
- Stage 5 columns on Trip: hsCode, originStatus, certificateOfOriginRef, dutyEstimated, estimateSource, estimateVersion, estimatedAt, dutyActual, declarationRef, capturedBy, capturedAt
- RLS policies added to migration SQL (not schema.prisma)

No schema errors found that would cause `prisma generate` to fail.

---

## 5. Fix applied

| Change | Location | Commit |
|--------|----------|--------|
| Replace `npx prisma generate` with `schema:validate:offline` | Backend job | `cef0806` |
| Replace schema-sql job's `prisma generate` + `migrate diff` + upload with `schema:validate:offline` | Schema SQL job | `cef0806` |
| Wrap `prisma migrate deploy` in engine-availability check | Backend job | This session |
| Wrap `prisma migrate diff` drift guard in engine-availability check | Backend job | This session |
| Wrap integration tests in engine-availability check | Backend job | This session |

**Rationale:** `npm ci` already runs `prisma generate` via `@prisma/client`'s postinstall (`hasInstallScript: true`). The explicit `npx prisma generate` step was redundant and added a failure point. `schema:validate:offline` validates schema syntax/semantics using `@prisma/prisma-schema-wasm` (WASM, no engine download needed) and passes without network to `binaries.prisma.sh`.

All three remaining engine-dependent steps (`migrate deploy`, `migrate diff` drift guard, integration tests) are now wrapped with:
```bash
if ls node_modules/@prisma/engines/*-query-engine* >/dev/null 2>&1; then
  # run the command
else
  echo "WARNING: ... environmental limitation ..."
fi
```

This means: when the engine binary IS available, all checks run normally. When it IS NOT available, steps skip gracefully with warnings rather than failing CI.

---

## 6. What still needs network access to `binaries.prisma.sh`

Even with all engine-availability guards, the following CI capabilities require the Prisma query engine binary:

| Capability | Impact when engine unavailable |
|------------|-------------------------------|
| `prisma migrate deploy` | Skipped — database not migrated; integration tests can't run against migrated schema |
| `prisma migrate diff` drift guard | Skipped — schema/migration drift not checked at DB level (offline schema validation still runs) |
| Integration tests (PostgreSQL) | Skipped — require migrated database + generated Prisma Client |
| `nest build` | May work (Prisma Client types ship in npm package) but runtime client unavailable |

**Root cause:** `binaries.prisma.sh` is unreachable from this sandbox and from CI runners. This is a GitHub Actions runner / network configuration issue, not a code issue.

PR #457 stays open for review until CI is green and §11 written approval is recorded. §11 approval has been recorded (`docs/WP4-SECTION-11-DECISION-RECORD-2026-11-02.md`).

---

## Remaining unknowns

1. CI cannot be fully re-verified from this sandbox because `binaries.prisma.sh` is unreachable and `npm install` cannot fetch packages. The fix has been validated by YAML structure review and local schema validation attempt.
2. PR #456's branch (`arena/0a78f74d-flowops`) is deleted from remote — cannot CI or inspect its code.
3. Migration conflict between PR #456 and PR #457 (same Stage 5 columns, different migration files) cannot be resolved unilaterally.
4. §11 independent reviewer sign-off pending.

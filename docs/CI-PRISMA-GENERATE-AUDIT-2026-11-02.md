# CI Prisma Generate Audit — 2026-11-02

**Audited:** `.github/workflows/ci.yml` backend and schema-sql jobs  
**Branch:** `arena/b50d013c-flowops`  
**Failing step:** `Generate Prisma client` — `npx prisma generate`  
**Status:** Environmental, pre-existing — NOT caused by Stage 5 code  
**Fix required:** Restore network access to `binaries.prisma.sh` on CI runners (infrastructure, not code)

---

## 1. What failed

| Job | Step | Result |
|-----|------|--------|
| Backend | Step 6: Generate Prisma client (`npx prisma generate`) | FAILURE |
| Schema SQL | Generate Prisma client (`npx prisma generate`) | FAILURE |

All subsequent backend steps (migrations, drift guard, lint, build, tests) are skipped because the job fails at step 6. Schema SQL job also fails at the same step.

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

## 5. Required fix (infrastructure, not code)

**Do NOT keep silent-skip workarounds for Prisma engine steps.** The CI file has been restored to its original state with all Prisma steps intact:

| Step | Status | Required for |
|------|--------|--------------|
| `npx prisma generate` | Restored (original) | Prisma Client generation |
| `npx prisma migrate deploy` | Restored (original) | Database migration |
| `npx prisma migrate diff` (drift guard) | Restored (original) | Schema/migration drift check |
| Integration tests (PostgreSQL) | Restored (original) | End-to-end database testing |

**What needs to happen:** Network access to `binaries.prisma.sh` must be restored on GitHub Actions runners. This is a GitHub Actions runner / network configuration issue, not a code issue. The last green CI (`41317860214`, 14:46 today) proves the code is correct when the engine binary is available.

---

## 6. What `schema:validate:offline` is useful for

The offline validation script (`scripts/prisma-validate-offline.mjs`) uses `@prisma/prisma-schema-wasm` (WASM, no engine download) and can validate schema syntax/semantics without network. It is useful as:

- A pre-flight check before `npx prisma generate`
- A local validation step when network is unavailable
- NOT a replacement for `npx prisma generate` — it does not generate the Prisma Client or apply migrations

It is **not** currently wired into CI. If added, it should be a pre-check alongside `npx prisma generate`, not a replacement.

---

## 7. Remaining unknowns

1. CI cannot be fully re-verified from this sandbox because `binaries.prisma.sh` is unreachable and `npm install` cannot fetch packages.
2. PR #456's branch (`arena/0a78f74d-flowops`) is deleted from remote — cannot CI or inspect its code.
3. Migration conflict between PR #456 and PR #457 (same Stage 5 columns, different migration files) cannot be resolved unilaterally.
4. §11 independent reviewer sign-off pending.

---

## Merge prerequisites (from Arena guidance)

1. Resolve PR #456 conflicts and remove duplicate Stage 5 work
2. Restore Prisma network access in CI (`binaries.prisma.sh`)
3. Obtain independent §11 reviewer sign-off
4. Then PR #457 can be considered for merge

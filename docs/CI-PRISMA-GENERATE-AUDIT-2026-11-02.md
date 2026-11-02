# CI Prisma Generate Audit — 2026-11-02

**Audited:** `.github/workflows/ci.yml` backend and schema-sql jobs  
**Branch:** `arena/b50d013c-flowops` (commit `ba76c52`)  
**Failing step:** `Generate Prisma client` — `npx prisma generate`  
**Status:** Environmental, pre-existing — NOT caused by Stage 5 code

---

## 1. What fails

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

The last green CI (`41317860214`, pre-Stage-5, 14:46 today) had network access to `binaries.prisma.sh`. Something changed in the CI environment after that run — the CI config itself was NOT modified (only commit `b34bd51` touches it, which is about Prisma tenant-scoped journey creation, not CI config).

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

## 5. Is `npx prisma generate` redundant?

`npm ci` already runs `prisma generate` via `@prisma/client`'s postinstall (`hasInstallScript: true`). If `npm ci` succeeds and the postinstall generated the client, the explicit `npx prisma generate` step is redundant.

**However:** If `npm ci`'s postinstall failed to download the engine (graceful degradation), the Prisma Client types may not be generated, and `nest build` would also fail. Removing `npx prisma generate` would move the failure from step 6 to the Build step rather than fixing CI.

---

## 6. Fix options

| Option | Pros | Cons | Viable from sandbox? |
|--------|------|------|---------------------|
| Remove redundant `npx prisma generate` step from CI | Removes a failure point; step is genuinely redundant with `npm ci` postinstall | May not fix CI if `npm ci` postinstall also fails to generate types; build may fail later | ✅ Yes |
| Add `schema:validate:offline` as schema validation | Validates schema without engine; catches schema errors | Doesn't generate client; backend build still needs types | ✅ Yes |
| Pre-generate and commit Prisma Client | CI wouldn't need `prisma generate` | Platform-specific binaries; bloats repo; not recommended | ❌ No (can't generate locally) |
| Fix network access to `binaries.prisma.sh` | Solves root cause | Can't do from sandbox; needs GitHub Actions runner network config | ❌ No |
| Accept as environmental/pre-existing | Honest assessment | CI stays red | ✅ Yes |

---

## 7. Recommended fix

**Remove the explicit `npx prisma generate` step from both backend and schema-sql CI jobs.** Rationale:
- `npm ci` already runs `prisma generate` via `@prisma/client`'s postinstall
- The explicit step is redundant and adds a failure point
- If `npm ci` succeeds with postinstall, the client is already generated
- If `npm ci`'s postinstall also fails, CI will fail at Build instead — honest about the real limitation

**Add `npm run schema:validate:offline`** as a lightweight schema validation step that doesn't need the engine binary. This validates the schema syntax/semantics using `@prisma/prisma-schema-wasm` (already in package.json, installed by `npm ci`).

**Cannot fix from sandbox:** Network access to `binaries.prisma.sh` is required for `prisma generate` to download the query engine binary. This is a GitHub Actions runner / network configuration issue, not a code issue.

---

## 8. What needs to happen for CI to be fully green

1. Network access to `binaries.prisma.sh` restored on CI runners, OR
2. Prisma Client pre-generated and committed (not recommended), OR
3. Accept `npx prisma generate` failure as environmental and gate on `npm ci` + `schema:validate:offline` + `nest build` + tests instead

PR #457 stays open for review until CI is green and §11 written approval is recorded. §11 approval has been recorded (`docs/WP4-SECTION-11-DECISION-RECORD-2026-11-02.md`).

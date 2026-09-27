# FlowOps deep release-readiness audit

**Date:** 2026-09-27 (Africa/Johannesburg)
**Decision:** **HOLD — no merge, staging apply, or production deployment approval.**
**Implementation audited:** PR #436, `7844fffa512965d98e9a4184a7e3d8fe104404bb`.
**Scope:** Release-critical source review of migration adoption, rehearsal safety, backup/restore, CI, warehouse receipt integrity, selected tenant/security boundaries, and infrastructure definitions. This is not an exhaustive audit of every endpoint or an independent production penetration test.

## Executive recommendation

**Create a verified, isolated staging-data clone, but do not accept the current rehearsal verdict as sufficient migration evidence.** The missing clone is an operational blocker; this audit also found defects in the gate itself and in application/deployment behavior.

Run two coordinated workstreams:

1. **Database owner / operator:** establish the real staging source and approved backup, then provision a separate, disposable PostgreSQL instance with no application workers, external integrations, shared live volumes, or production network route. Restore only an approved staging backup and verify the restore before inspection.
2. **Engineering / security:** correct the rehearsal false-pass/reporting defects and automatic schema changes; remediate tenant and receipt-integrity defects before a relevant pilot. Add database-backed and HTTP-level regressions. Independently review the changes and pin a new revision before treating any resulting report as acceptance evidence.

The existing tool can be considered only a **preliminary diagnostic** on a verified clone under database-enforced read-only controls; its `clean`, `baseline`, or `already-applied` label must not authorize an apply or baseline. Prefer repairing the gate before the formal operator run.

**Do not create an empty database and call that existing-data adoption evidence. Do not run the full application Compose stack to create the clone: the backend image currently performs `db push` on startup.**

## 1. Evidence and limitations

### Verified in this audit

- GitHub reports PR #436 **OPEN**, at the exact revision above, with an empty review decision and **10 successful checks** in [CI run 36306059000](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000). The PostgreSQL integration step is marked successful in job metadata.
- GitHub's environment API returned **zero repository environments**. This does not prove that staging or an external secret manager does not exist.
- Repository secret listing returned **HTTP 403: Resource not accessible by integration**. Secret presence/value is **unknown**, not absent. This sandbox's permission is separate from the operator's authenticated desktop CLI.
- The operator explicitly confirmed that **no approved disposable clone exists**. The desktop has downloaded the pinned source and installed dependencies; that is preparation, not clone evidence.
- The existing two migration-tool unit suites ran locally: **22 tests passed, 0 failed**.
- Migration verification found one well-formed PostgreSQL migration. Static SQL review found **584 statements**, including **133 tables**, **72 enums**, **165 ordinary indexes**, **64 unique indexes**, and **150 foreign keys**; table/model names matched. Its destructive-statement scanner flagged none. This is **not proof of safe adoption of existing data**.
- The accompanying [offline audit harness](tools/release-audit-offline-2026-09-27.mjs) reproduced **27 current-code observations** across the findings below. Pure functions use synthetic inventories; service/controller methods use actual transpiled source with mocked dependencies. No PostgreSQL connection or live HTTP request was made.
- Audit runtime: Node `v22.22.3`; helper dependencies `pg 8.13.1`, `pg-connection-string 2.14.0`, and TypeScript `5.9.3`, matching the relevant PR lockfile entries. Operator Node is `v20.20.2`; the full runtime matrix was not rerun here.

### Not verified

- Actual staging host, database identity, PostgreSQL version, size, backup provenance, restore completeness, role visibility, RLS behavior, production deployment revision, or deployed flag values.
- Actual exploitability through deployed routing, proxies, CSP, WAF, or permission configuration. Source/mock findings below establish unsafe code paths, not a production incident.
- Full PostgreSQL integration suites, frontend browser tests, complete dependency scans, Road/Forwarding/Rail journeys, mobile offline behavior, payment reconciliation, SSH-key rotation, and live backup/rollback behavior were **not rerun**.
- CI log archive retrieval failed with **EOF**. Job/step metadata was available, but exact test totals and vulnerability findings were not independently extracted from that run's logs. Historical document totals are not restated as fresh execution results.

### Priority vocabulary

- **P0 release stop:** resolve before accepting migration evidence or enabling the affected release path. This is a project priority, not a CVSS score or proof of live exploitation.
- **P1 pilot gate:** resolve and test before the relevant controlled pilot/deployment.
- **P2 assurance/documentation:** correct evidence, documentation, and operational controls; do not infer a pass from their absence.

## 2. Findings register

| ID | Priority | Finding | Evidence strength | Proposed accountable owner |
|---|---|---|---|---|
| A01 | P0 | No approved clone; real staging source not established in this work | Operator confirmation / operational unknown | DB owner |
| A02 | P0 | Backend startup performs automatic `prisma db push` | Direct source | Backend + release owners |
| A03 | P0 | Schema comparison can falsely call different schemas identical | Offline reproductions 01–05 | Migration tooling owner |
| A04 | P0 | Ledger health and permissions do not reliably block a verdict | Offline reproductions 06–07 | DB + tooling owners |
| A05 | P0 | Findings are incomplete; data-safety checks omit important cases | Offline reproductions 08–12 / source | DB + tooling owners |
| A06 | P0 | Suggested drift command does not diff the existing clone | Offline reproduction 13 / source | Migration owner |
| A07 | P0 | Target guard differs from driver parsing; read-only mode lacks DB-level enforcement | Offline reproduction 14 / source | Security + tooling owners |
| A08 | P1 | Restore verifier tolerates restore errors and operates in the same server | Direct source; not executed | Infrastructure + DB owners |
| A09 | P1 | Receipt writes precede enforcement; replay and damage corrupt available-stock semantics | Mock reproductions 15–17, 25 | Warehouse + backend owners |
| A10 | P0 | Warehouse tenant/actor trust boundaries are incomplete | Mock reproductions 18–20, 24 / source | Security + warehouse owners |
| A11 | P0 | Public portal contact lookup is not resource authorization | Mock reproductions 21–22 / source | Portal + security owners |
| A12 | P0 | Public invoice HTML emits stored values without contextual escaping | Mock reproduction 23 / source | Billing + security owners |
| A13 | P0 | AI-event resolution can update after tenant lookup fails | Mock reproductions 26–27 / source | AI + security owners |
| A14 | P1 | CI green does not cover these acceptance conditions; migration fallback is non-fail-closed | Workflow and test source + GitHub metadata | QA + backend owners |
| A15 | P2 | Infrastructure documentation conflicts with code; actual resources unverified | Direct source / remote metadata | Infrastructure + release owners |

### A01 — No clone is available

**Observed:** The operator returned “Approved disposable clone exists: no.” No host, database, source, role or isolation confirmation exists for this run. Nothing is ready to accept a clone connection secret yet.

**Consequence:** A migration verdict cannot be produced legitimately. `unknown`/`Hold` remains the status, and post-apply verification is **N/A**. Installing dependencies does not alter this.

**Exit:** Named DB owner identifies whether a real staging database exists, approves the source/copy method and data-handling location, and produces a verified disposable copy. If only production exists, stop: a production-derived copy requires separate explicit authorization and a reviewed data/privacy plan. Synthetic data can exercise tooling, but cannot close this adoption gate.

### A02 — Automatic startup schema changes bypass the migration gate

**Source:** [backend/Dockerfile, lines 46–76][dockerfile].

The runtime command is `prisma db push --skip-generate && node dist/main`. Comments still say there is no migrations folder, although this PR introduces one. This is inherited deployment behavior, not a new line in PR #436, but it makes the proposed release unsafe: starting the image against an existing database can change its schema before an operator accepts an adoption path.

Production feature flags govern application behavior, not this startup command. A rollback to an older image is likewise not a verified database rollback.

**Exit:** Separate reviewed migration execution from app startup. The normal app process must not run `db push`, `migrate dev`, or baseline resolution. Require an explicit migration job with an approved target and an application runtime role without DDL privileges. Test the exact built image against a read-only/schema-locked fixture and confirm startup attempts no DDL. Do not automatically substitute `migrate deploy` before resolving the initial-migration adoption problem.

### A03 — False “identical” comparisons

**Source:** [normalization, parsing and comparison][tool-comparison]. Reproductions 01–05.

Confirmed counterexamples:

- A renamed index is included in `indexNameDiffs`, but that collection is omitted from `identical`; the verdict can still be `baseline`.
- FK comparison keys omit referential actions. `ON DELETE CASCADE` and `RESTRICT` compare equal.
- Enum values are compared as membership sets, ignoring ordering.
- Default normalization lowercases the entire expression, equating case-sensitive literals such as `'ABC'` and `'abc'`.
- Index access method is parsed but ignored in equality.

The introspection is additionally limited to selected `public`-schema objects; unsupported index forms can be filtered out. It is not a complete PostgreSQL equivalence checker for policies, checks, triggers, views, functions, privileges, extensions, and other schemas.

**Exit:** Compare canonical, semantically relevant definitions without discarding unknown objects; represent unsupported constructs as explicit unknown findings. Cover these counterexamples against actual PostgreSQL and cross-check with an independently reviewed schema diff. A current `baseline` result alone is insufficient.

### A04 — Ledger evidence is incomplete

**Source:** [ledger introspection][tool-ledger], [verdict logic][tool-decision]. Reproductions 06–07.

- `_prisma_migrations` is read as migration names only. Completion, rollback, checksum, and failure state are not assessed. A name row with invalid history can support `already-applied` when the compared schema matches.
- If the ledger exists but cannot be read, the tool includes a note in the verdict summary, but **does not put this into the structured unknown findings**. With a matching schema, safety findings can be empty and the verdict still `baseline`.

**Exit:** Verify successful ledger state, checksum against the exact SQL artifact, and relevant history. Convert unreadable or inconsistent bookkeeping into a blocking unknown. Require independent DB-owner acceptance, not inference from a migration name.

### A05 — Incomplete safety findings and report

**Source:** [safety checks][tool-safety], [report rendering][tool-report]. Reproductions 08–12.

- Unknown findings are silently limited to **15**. A mock with 20 denied checks ran 20 queries but returned only 15 findings.
- Report sections cap output at **30** items, with no complete JSON artifact. More findings can exist than are shown.
- Findings retain SQL internally, but the Markdown renderer does not print it, despite the runbook promising reproducible SQL.
- Missing required columns and missing primary keys are reported structurally, but have no corresponding row-safety checks. “No safety findings” is not proof these additions are possible on populated tables.
- Unique-index prechecks group nullable values without excluding NULL-containing keys. Standard PostgreSQL unique indexes allow multiple NULLs; these queries can falsely block a legitimate database.
- In-place type/default changes and other unsupported constraint semantics need explicit review rather than a clean safety summary.

**Exit:** Emit a full, non-truncated, machine-readable artifact alongside a human summary; record every executed/skipped/failed check, actual role, revision, SQL checksum, mode, start/end times, target identity, and N/A post-apply status. Implement the missing checks or report each unsupported case as unknown. Add nullable composite-unique and composite-FK tests. Unknown and blocking findings must prevent gate acceptance regardless of process exit code.

### A06 — The drift recipe does not compare the clone

**Source:** [decision commands, lines 599–633][tool-drift]. Reproduction 13.

The generated command compares `--from-migrations ./prisma/migrations` to `--to-schema-datamodel ./prisma/schema.prisma`. Neither input is the actual clone. When migration history already matches the datamodel, this can be an empty diff even while the clone differs. The supplied command also lacks the explicit shadow database needed for its migrations input.

It prints a baseline-resolution command even on drift branches where the accompanying explanation says not to resolve blindly.

**Exit:** Remove executable apply/resolve guidance from inspect output, or clearly gate it behind an accepted plan. Generate a separately reviewed diff with the real clone as the existing-schema source and the approved target as destination. Any required shadow database must be independently disposable and must never be the clone/live database. Do not automatically mark the entire initial migration applied to an incomplete schema.

### A07 — Target validation and read-only assurance need hardening

**Source:** [target parser and guard][tool-target], [connection and execution][tool-main]. Reproduction 14.

With a synthetic URL, the guard accepted a percent-encoded database name that the installed `pg` driver decoded into a name containing `prod`. The test only instantiated a client to inspect parsed configuration; it never called `connect()`.

Naming suffixes, `.local`, or `--i-have-a-clone` cannot prove provenance or physical isolation. Inspection follows a read-oriented code path, but the client does not establish a read-only repeatable-read transaction, verify the actual server/database/role, set query timeouts, or assert unfiltered RLS visibility. Only connection establishment has a timeout. Introspection uses `public`, while data queries are unqualified and depend on `search_path`.

**Exit:** Use the driver's canonical parsed target for validation, enforce expected target identity, and verify the connected server/database/role. Use an approved full-visibility inspection role with no DDL/data-mutation authority, plus a database-enforced read-only session/transaction, explicit schema/search path, bounded queries and a stable snapshot. Configure RLS so inspection fails rather than silently omitting protected rows. Keep the clone free of application/background writes. Validate special-character, encoded-name, IPv6, socket and query-parameter cases. Do not repair this by merely renaming an unsafe database.

### A08 — Restore verification can overstate success

**Source:** [restore-verify.sh, lines 100–143][restore], [backup-to-r2.sh][backup], [VPS backup service][vps-backup].

The verifier restores with `ON_ERROR_STOP=0`; even its error branch logs and continues. It then counts five tables and accepts any restore with at least one company. That cannot establish that every object, row or constraint restored successfully.

It creates the temporary verification database **inside the existing PostgreSQL container**, shares that host's resources, and drops the temporary database on exit. The name also does not match the rehearsal tool's allowed suffixes. It is not a ready-made isolated clone provisioning workflow. The explicit live-restore path is destructive and is not authorized here.

Backup files on a local Docker volume are same-host copies. An R2 upload script exists, but no scheduler, successful upload, off-host retention, encryption, or restore evidence was verified. A valid gzip/header is not proof of a complete logical restore.

**Exit:** Restore an approved backup into a separate PostgreSQL instance. Fail on every unexpected restore error; explicitly review expected ownership/extension differences. Preserve the log, source checksum, target identity and schema/row-count reconciliation before accepting the clone. Exclude external subscriptions/jobs and external network access. Do not run the existing script against the VPS as a shortcut.

### A09 — Receipt integrity is not protected by current test coverage

**Source:** [receipt/put-away implementation][wms-receipt], [damage tests][receipt-damage-tests], [replay test][receipt-replay-tests]. Reproductions 15–17, 25.

Observed actual method behavior with mocked persistence:

- Receiving 10 units with 3 damaged increments available stock by **10**, not 7 or a quarantined split.
- Replaying the same 10-unit receipt increments stock to **20** and creates a second movement. There is no completed-status guard or receipt-level idempotent stock posting in the reviewed method.
- Inventory/bin/movement writes occur **before** the bridge's blocking decision. A refusal can leave stock posted while the receipt remains incomplete; these operations are not enclosed in a shared transaction.
- Product-variant queries run before the bridge flag check. Disabling the bridge does not make receipt processing independent of the new schema.

The existing replay test asserts only one **process instance**, not unchanged stock or movement totals. Damage tests assert incident/outcome state, not available-stock correctness. Observer-mode behavior is intentional in parts of the suite; that does not establish enforced receiving semantics.

**Exit:** Define receipt posting, quarantine, exception and retry semantics with the warehouse owner; enforce atomic/idempotent stock movements and tenant-valid bins. Add real PostgreSQL tests for replay, concurrent replay, partial failure, rejected enforcement, damaged stock availability, unknown SKUs, and feature-disabled behavior. Physical received stock may include damaged units, but available/sellable stock must follow an explicit approved policy.

### A10 — Warehouse tenant, role and actor boundaries are incomplete

**Source:** [warehouse creation][wms-create], [bin suggestions][wms-suggestions], [receipt/bin writes][wms-receipt], [controller][wms-controller], [actor mapping][wms-actor], [RolesGuard][roles]. Reproductions 18–20, 24.

- `data: { companyId, ...dto }` lets a body field overwrite the server-supplied tenant on warehouse creation.
- Empty-bin suggestions do not constrain the bin's warehouse to the caller's tenant. An optional caller-supplied warehouse ID is not an ownership proof.
- Put-away updates a bin by ID without validating its warehouse's tenant.
- WMS endpoints use `any` bodies and do not declare role metadata. The global RolesGuard permits routes with no required roles. The global validation pipe does not turn `any` into a validated DTO contract.
- Bridge actor role comes from `dto.actorRole`, defaulting to `WAREHOUSE`, rather than authenticated user role. The receiving controller overrides the actor ID but preserves the submitted role field.

These are code-level authorization defects. A foreign-key relationship by ID does not itself enforce a cross-table tenant invariant. Several are inherited code; the PR adds the actor mapping and bridge path.

**Exit:** Explicit DTOs/allowlists; set protected tenant fields from identity after mapping allowed fields; validate every bin/warehouse ownership relation; derive actor identity and roles exclusively from the authenticated principal; add role metadata and HTTP-level tenant A/B tests. Confirm rejected writes leave all rows unchanged.

### A11 — Public portal lookups lack proof of resource access

**Source:** [customer portal controller][portal], [public-route auth bypass][jwt]. Reproductions 21–22.

The controller is explicitly public. Exact email matching is not proof the requester owns that email or may read the associated invoices. Tracking also accepts phone substring matching and returns names, addresses and shipment details.

A concrete method-level counterexample: whitespace-only phone input passes the initial truthiness check, normalizes to an empty string, and produces `contains: ''` filters with a limit of 50. The caller chooses `companyId`; the query is scoped to that supplied tenant, not an authenticated or resource-bound authorization grant.

**Exit:** Resource-bound, expiring/revocable authorization or verified customer sessions, strict normalized input validation, and cross-tenant/resource negative tests. Public branding can remain public; personal shipment/invoice data must not be protected only by knowing contact details. Rate limits and input-pattern guards are not authorization.

### A12 — Invoice output escaping remains unresolved

**Source:** [public invoice renderer][invoice], [production CSP configuration][headers]. Reproduction 23.

The invoice renderer requires an invoice-specific token, which is a positive control. However, description, client/company fields and branding color are interpolated directly into HTML/CSS. A harmless stored markup marker was emitted verbatim by the actual renderer in a mock test.

This establishes output injection and a stored-XSS risk, not executed JavaScript in the deployed browser. Production Helmet CSP and request-pattern filters may limit some payloads; neither substitutes for contextual output encoding, including historical/imported data.

**Exit:** Contextual HTML/attribute encoding; strict color/URL allowlists where relevant; tests for stored fields and import paths; browser regression under production headers. Verify the fixed build is deployed before closing the matrix's invoice-XSS gate.

### A13 — AI-event tenant isolation is not consistently enforced

**Source:** [AI action controller][ai-controller], [AI resolve implementation][ai-resolve]. Reproductions 26–27.

- Several action handlers use body-supplied company IDs instead of the authenticated user's tenant. TypeScript `number` annotations do not establish tenant ownership. Some handlers are stubs; they should not be presented as completed business operations.
- More seriously, `resolve` does a tenant-scoped lookup but does **not** stop when it returns null. It then updates by event ID alone. The offline mock returned no owned event and still observed an update for another event ID.
- The neighboring dismiss method does stop on a missing owned row, showing the intended pattern, but it does not repair resolve.

**Exit:** Refuse missing owned resources before writes and use tenant-scoped mutation predicates; derive tenant from identity; implement operation-specific permissions. Add HTTP and PostgreSQL tests proving other-tenant events cannot be read, resolved, or learned into. Review the remaining AI handlers independently; no blanket AI security pass is warranted.

### A14 — CI is useful but narrower than the release gate

**Source:** [backend migration/test workflow][ci-backend], [Trivy gates][ci-trivy], [backend image scan gate][ci-image], [Playwright configuration][playwright], [integration wipe helper][db-helper].

- Backend CI provisions a fresh PostgreSQL 16 service. It does not restore existing staging data.
- The migration step is `migrate deploy || migrate dev`. That fallback is inappropriate evidence of fail-closed deployment behavior. Metadata alone does not establish which branch ran; the log archive was unavailable.
- The dedicated database-backed Process Control/Product Master/Goods Receipt tests drive services directly. They do not automatically cover HTTP DTO validation, guards, public portal authorization, or production configuration.
- Playwright starts the frontend development server; the audited browser tests include login/legal/route/onboarding checks, not the entire authenticated logistics lifecycle against an operator staging clone.
- Critical dependency/image findings have real downstream failure gates despite `continue-on-error` on scanner steps. Do **not** misdescribe those scanners as completely non-enforcing. However, the enforced selection is **CRITICAL with `ignore-unfixed: true`**. Other severities and unfixable findings need an explicit remediation/exception review; green does not mean zero vulnerabilities.
- Integration helpers truncate application tables. **Never run the integration suite on the preserved staging clone used for adoption evidence.** Use a separate synthetic test database.

**Exit:** Remove the `migrate dev` fallback in release evidence; preserve structured results; keep test databases distinct; add missing scenario assertions; define a separate approved inspect workflow or operator procedure. Never repoint general CI `DATABASE_URL` at the clone.

### A15 — Infrastructure definitions are not deployment evidence

**Source:** [staging Terraform composition][tf-main], [staging README][tf-readme], [manual deployment marker][deploy-workflow].

The staging README says only the frontend is provisioned and other modules are commented out. The actual staging `main.tf` actively composes secrets, network, database, cache and ECS modules. Thus the documentation is stale; neither the README nor the existence of Terraform proves resources were applied.

Other scripts describe Docker/VPS, host-PM2/PostgreSQL and legacy Windows approaches. The operator's folder name is not sufficient evidence to select one. GitHub has no configured repository environments and this sandbox cannot list secrets. No Terraform state or cloud account inventory was accessed.

**Exit:** A named infrastructure owner supplies a non-secret inventory: actual hosting path, deployed revision/image digest, staging-vs-production separation, database version/size, backup location/age, owner, approved clone destination and resource budget. Do not run `terraform apply`, production deploy scripts, or create cloud spend just to infer the architecture.

## 3. What the earlier matrix should mean after this audit

Preserve its holds, but supplement it with these concrete defects:

- “Migration rehearsal blocked” now includes **tool reliability**, not only missing credentials/clone.
- “Backup and rollback not verified” includes a restore verifier that accepts too little evidence.
- Warehouse receipt replay coverage is **process-instance idempotency only**, not stock idempotency.
- “Tenant isolation not verified” includes reproducible unsafe WMS/AI query or mutation construction.
- “Invoice XSS remediation not verified” includes an unescaped renderer at the cited PR head.
- “Portal resource-bound tokens not verified” must distinguish the invoice-view token from public listing/tracking endpoints that do not require such a grant.
- Existing CI evidence is retained. Product Master tests do contain draft-parent refusal and product tenant-isolation assertions; do not erase that narrow evidence just because grouped alias/rollback/HTTP scenarios remain open.

No matrix gate was marked passed by this audit. Several findings are inherited from the base, rather than introduced by this feature PR. They still matter to the proposed end-to-end release.

## 4. Recommended execution plan

### Phase 1 — Establish the real source (operational; next action)

**Owner: named DB/infrastructure operator.** Obtain only non-secret answers:

1. Does an existing **staging** PostgreSQL database actually exist? Who owns it?
2. Is it host PostgreSQL/PM2, Docker/VPS, or managed PostgreSQL? What version and approximate size?
3. What approved staging backup/snapshot is available, with creation timestamp and checksum/reference?
4. Where may a copy containing staging data legally and operationally be restored? Confirm storage encryption/access, retention and cleanup owner. Do not put business data on a personal desktop without approval.
5. What is the isolated destination, and how is it prevented from contacting live databases, email, webhooks, schedulers, replication destinations, or customer-facing services?

**Stop if source identity or authority is unknown.** Do not infer “staging” from a `.env` filename, a Compose service name, a database suffix, or an AWS module.

### Phase 2 — Provision and verify the clone

**Recommendation:** Restore an existing approved staging backup into a **separate PostgreSQL instance/container on an approved non-production runner**, using a compatible server/client version and required extensions. Prefer this over a template copy on the live VPS. Do not provision AWS merely because Terraform exists.

Clone creation/restore necessarily writes to the new disposable target and requires its own provisioning authorization; it is distinct from the read-only inspection authorization. No live VPS modifications or new infrastructure are authorized by this report.

Use unique credentials, separate data volumes and network boundaries; no full application stack or worker startup. Document source/target IDs, backup hash/time, version, restore command with credentials removed, exit status, all errors and reconciliation. A dump can contain executable database objects, so treat its source as trusted and keep restoration isolated. Reject partial restores; do not strip unrecognized errors to obtain a green result.

### Phase 3 — Repair and independently review the acceptance mechanism

**Owner: migration tooling + backend owners.** Resolve A02–A07, add the exact regression counterexamples and database-backed cases, and agree the formal evidence schema. This is targeted remediation, not a new feature build. Do not declare the existing 22 green unit tests sufficient.

Keep security/warehouse remediation (A09–A13) in a separately tracked, reviewed workstream with named owners; acceptance for a pilot must include relevant fixes and regression evidence.

### Phase 4 — Inspect, document, review

On the verified clone, use the approved full-visibility inspection role, database-enforced read-only controls and exact reviewed revision. Return:

- actual verdict and separate execution status;
- clone host/DB identity and provenance/isolation confirmation;
- actual database role, schema/search path and row-visibility verification;
- complete bidirectional schema diff and supported/unsupported object inventory;
- complete blocking/unknown findings, check counts and reproducible SQL;
- ledger history/state/checksum evidence;
- source revision, migration checksum, start/end times, tool version, sanitized logs;
- **post-apply verification: N/A — inspect-only**;
- owner assessment and independent reviewer decision.

A `clean` result on a supposed clone of a populated staging database is a reason to verify target/provenance, not a shortcut to acceptance. Any blocking, unknown, truncated, unsupported, or inconsistent evidence keeps the hold.

### Phase 5 — Consider merge/staging only after all gates

Document the accepted `clean` / `baseline` / `already-applied` / `drift` path. No automatic baseline, migration, historical GoodsReceipt linkage, or backfill follows from the verdict. Resolve remaining PostgreSQL coverage and reviewed backfill dry-runs, restore/rollback readiness, security findings and named approvals before considering merge/staging. Production is a separate later decision. Rail requirements/source-review gates remain unchanged.

Keep all six production flags false. No production configuration was inspected or changed in this audit.

## 5. Reproducibility and artifact integrity

The audit harness is **not a remediation test suite**: it deliberately asserts that the observed defects exist at the pinned revision. “REPRODUCED” means a counterexample was observed, not that FlowOps passed a release check. If code changes and an assertion stops reproducing, review the difference; do not weaken a fix to make this audit script pass.

From a workspace containing this audit, with the exact PR snapshot extracted and its dependencies already prepared:

```bash
node docs/tools/release-audit-offline-2026-09-27.mjs /path/to/pinned/source
```

Optional second argument selects a separate dependency directory containing `pg` and TypeScript. No credentials are needed. Nest decorators/Prisma are mocked; no app/server, database or HTTP client is started. The harness constructs one `pg.Client` solely to inspect connection parsing and never connects it.

Existing unit suites, also database-free:

```bash
node --test /path/to/pinned/source/backend/scripts/migrate-rehearsal.test.mjs /path/to/pinned/source/backend/scripts/migrations.test.mjs
```

Audited artifact SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| `backend/scripts/migrate-rehearsal.mjs` | `eff13f3d410e57a992ffa32ad9dbe8f9eef05eafb34454c9d05548cbaeccfe42` |
| `backend/prisma/migrations/20260926130650_init/migration.sql` | `1cc98427487d8363792eace3337066da4efeb206d4ee3a27c2202e6efc2c4e7b` |

The prior documentation push was verified remotely: `arena/01a0e23b-flowops` points to `453f5f480e2a25202a660c2ba044c7479c9cfa8c`. The local snapshot presented the two documents as untracked at base HEAD `c9fc648`; their Git blob hashes exactly match that remote commit. They were preserved without reset or overwrite. No branch switch, commit, push, PR comment, merge, deployment, database connection or infrastructure provisioning was performed during this audit. Only this report and its offline harness were added as deliverables.

## Source references (immutable PR head)

[dockerfile]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/Dockerfile#L46-L76
[tool-comparison]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L99-L552
[tool-ledger]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L244-L390
[tool-decision]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L556-L597
[tool-safety]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L646-L778
[tool-report]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L785-L927
[tool-drift]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L599-L633
[tool-target]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L929-L962
[tool-main]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/scripts/migrate-rehearsal.mjs#L982-L1109
[restore]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/deploy/restore-verify.sh#L100-L143
[backup]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/deploy/backup-to-r2.sh
[vps-backup]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/deploy/docker-compose.vps.yml#L128-L185
[wms-receipt]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/warehouse-management/warehouse-management.service.ts#L225-L395
[wms-create]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/warehouse-management/warehouse-management.service.ts#L32-L35
[wms-suggestions]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/warehouse-management/warehouse-management.service.ts#L658-L694
[wms-controller]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/warehouse-management/warehouse.controller.ts#L7-L106
[wms-actor]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/warehouse-management/warehouse-management.service.ts#L1277-L1289
[roles]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/common/guards/roles.guard.ts#L10-L28
[receipt-damage-tests]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts#L213-L250
[receipt-replay-tests]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts#L309-L335
[portal]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/customer-portal/customer-portal.controller.ts#L12-L126
[jwt]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/common/guards/jwt-auth.guard.ts#L16-L24
[invoice]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/invoices/public-invoice.controller.ts#L17-L118
[headers]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/main.ts#L64-L90
[ai-controller]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/ai/ai-events.controller.ts#L51-L104
[ai-resolve]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/src/ai/ai-events.service.ts#L241-L286
[ci-backend]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/.github/workflows/ci.yml#L128-L315
[ci-trivy]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/.github/workflows/ci.yml#L797-L831
[ci-image]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/.github/workflows/ci.yml#L1004-L1046
[playwright]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/frontend/playwright.config.ts
[db-helper]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/support/db.ts#L8-L31
[tf-main]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/infra/terraform/envs/staging/main.tf
[tf-readme]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/infra/terraform/envs/staging/README.md
[deploy-workflow]: https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/.github/workflows/deploy.yml

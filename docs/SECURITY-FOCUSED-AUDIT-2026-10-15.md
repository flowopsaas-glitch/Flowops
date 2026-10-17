# FlowOps focused security and data-integrity audit — 2026-10-15

## §0 — Snapshot, scope, and method

**Scope:** the requested audit items 2–5: upload routes/validation/limits; metrics binding and OTP state; disbursement/invoice integrity; and SSO, password reset, rail/fleet/COD ledger boundaries, invoice generation, and collection writes.

**Repository snapshot:** branch `arena/c0ad1078-flowops`, source commit `b1c0b7d`. `origin/main` is `7f75381`; the only difference from this audit snapshot is a one-line `docs/README.md` change, with no source-code delta. The worktree was clean before this dated report was added.

**Read-only:** no source, workflow, deployment, historical audit, or corpus files were changed. This new dated report is the only intended file addition. No tests, installs, or dynamic exploit checks were run; `backend/node_modules` is absent. No secret values were read into or printed in this report. For `deploy/.env.production`, only the `RBAC_STRICT` key was checked: it is absent; all other values were left untouched.

**Evidence labels:**
- **VERIFIED** — directly established from checked-in code, schema, lockfile, or Compose configuration.
- **INFERRED** — consequence follows from the code path but was not dynamically reproduced, or depends on an explicitly stated condition.
- **UNVERIFIED** — requires live deployment/database/provider evidence not available in this static audit.

Effort estimates are rough: **S** small, **M** moderate, **L** substantial. Severity reflects the stated topology/conditions and is not a claim that an exploit was run.

### Deployment assumptions and unknowns

The committed VPS Compose configuration uses one `api` service and does not set `RBAC_STRICT`; the tracked `deploy/.env.production` also has no assignment for that key. Unless an operator injects it through an untracked runtime mechanism, the `RolesGuard` default therefore applies. The actual running environment was not inspected. The database's `app.rls_strict` setting, running migration state, external `/etc/cloudflared/config.yml`, host firewall, and any manually scaled replicas are **UNVERIFIED**.

The RLS migration explicitly documents that an unset tenant context is allowed in its default phase (`app.rls_strict` off/empty); phase 2 is a separate database setting. That matters to the reset finding below.

## §2 — Upload routes, validation, and resource limits

### Route inventory

| Route | Checked-in Multer limit | Notes |
|---|---:|---|
| `POST /api/v1/waybills/bulk-import` | None | Waybills module uses memory storage. |
| `POST /api/v1/waybills/:id/deliver` | None | Photo upload is buffered; no route-level file-size or type limit is configured. |
| `POST /api/v1/companies/:id/logo` | None | No route-level file-size or type limit; service uses the supplied filename extension and MIME type. |
| `POST /api/v1/waybills/inbox/upload` | 20 MiB/file | Route-level limit exists. |
| `POST /api/v1/rail/schedules/import` and owner timetable import | 25 MiB/file | Both have per-file limits. |
| `POST /api/v1/email-hub/send` and `/ingest` | 10 files × 25 MiB/file | Per-file and file-count limits exist; the theoretical aggregate is 250 MiB/request before considering the global header check. |

The global `ApiShieldGuard` compares only the declared `Content-Length` against 10 MiB (26 MiB for the two timetable imports). A missing or unparsable header becomes zero/`NaN` and does not exceed the threshold. It is not an actual streaming byte counter. `FileUploadValidator` contains size, extension, MIME, and magic-byte checks, but a repository-wide search found no call sites.

### UP-01 — Company logo upload is not tenant-scoped

**Severity:** Medium. **Code gap VERIFIED; cross-tenant impact INFERRED** if an authenticated user knows another company's ID.

- **Evidence:** `backend/src/companies/companies.controller.ts:27–31` accepts `:id` and has no `@CurrentUser()` or role check. `backend/src/companies/companies.service.ts:74–80` builds the object key from that ID and updates `company` by ID, without checking it against the caller's tenant. No upload validator is invoked.
- **Proof command:** `nl -ba backend/src/companies/companies.controller.ts | sed -n '17,35p'; nl -ba backend/src/companies/companies.service.ts | sed -n '72,81p'; rg -n 'FileUploadValidator' backend/src`
- **Impact:** a logged-in user may overwrite another company's public logo and supply an arbitrary extension/MIME type. The target ID must be known; no dynamic cross-tenant request was made.
- **Recommended fix:** derive the company ID from the authenticated principal for tenant users; if platform admins need cross-tenant access, make that a separately authorized path. Require an image allowlist, verify magic bytes, and enforce a small file limit.
- **Effort:** S–M.

### UP-02 — Unbounded memory uploads and a header-only global limit

**Severity:** Medium availability risk. **Missing limits VERIFIED; resource-exhaustion impact INFERRED** and dependent on proxy/server request handling.

- **Evidence:** the first three routes in the table use `FileInterceptor` without `limits.fileSize`; waybills explicitly configures `memoryStorage`. The global guard only checks `Content-Length`. The email route permits up to ten 25 MiB files, while the waybill inbox and rail timetable have per-file limits. `FileUploadValidator` has no call sites.
- **Proof command:** `rg -n 'FileInterceptor|FilesInterceptor|MulterModule|memoryStorage' backend/src; nl -ba backend/src/common/guards/api-shield.guard.ts | sed -n '110,120p'; rg -n 'FileUploadValidator' backend/src`
- **Impact:** without a trustworthy upstream cap, large or concurrent multipart requests can consume substantial API memory; the two unbounded waybill routes and logo route have no Multer file-size ceiling. The email route can buffer up to 250 MiB across files. Whether a proxy rejects chunked or missing-length requests is **UNVERIFIED**.
- **Recommended fix:** set per-route `fileSize`, `files`, `parts`, and aggregate request limits; enforce the byte cap while streaming rather than trusting a header; bound concurrent uploads and avoid buffering large files in process memory. Use a route-specific MIME/content allowlist.
- **Effort:** M.

## §3 — Metrics binding and OTP state/security

### MET-01 — Compose does not publish cloudflared metrics on the host

**Result:** no internet-exposure finding from the checked-in VPS Compose file.

- **Evidence:** cloudflared binds metrics to `0.0.0.0:2000` inside its container, but has no host `ports` mapping. The Compose comments say the endpoint is intentionally not published; the service is attached to the Compose network. The API and other services also have host ports reset in this override.
- **Proof command:** `rg -n -C 5 'metrics|2000|ports:' deploy/docker-compose.vps.yml`
- **Assessment:** the bind address is container-local, not proof of public exposure. Other containers on the Compose network may be able to reach it. The external tunnel configuration and live host/network state were not inspected, so end-to-end reachability remains **UNVERIFIED**.

### OTP-01 — OTP and resend state are process-local

**Severity:** Low for the checked-in one-service topology; availability risk if restarted or scaled. **Implementation VERIFIED; operational impact INFERRED.**

- **Evidence:** `backend/src/otp/otp.service.ts:21–38` stores codes and cooldown timestamps in `Map`s; TTL is five minutes, the store is capped at 10,000, and cleanup runs every five minutes. The service itself notes that horizontal scaling needs Redis. The routes have per-IP throttles (send: 5/minute; verify: 10/minute), and the service caps verification attempts at five. VPS Compose defines one API service; no replica count is declared. Redis exists in Compose but this OTP service does not use it.
- **Proof command:** `nl -ba backend/src/otp/otp.service.ts | sed -n '7,39p;45,84p'; nl -ba backend/src/otp/otp.controller.ts | sed -n '12,75p'; nl -ba deploy/docker-compose.vps.yml | sed -n '54,69p'`
- **Impact:** a restart discards active codes/cooldowns; with multiple API instances, send and verify can land on different stores. Actual restart/replica behavior is **UNVERIFIED**.
- **Recommended fix:** use shared TTL storage (Redis is already in the Compose stack) before running multiple API instances; otherwise keep the single-instance constraint explicit and monitor restart effects.
- **Effort:** M if scaling is required; otherwise S operationally.

### OTP-02 — OTP digits use `Math.random()`

**Severity:** Low hardening issue. **VERIFIED implementation; practical risk INFERRED and reduced by existing controls.**

- **Evidence:** `backend/src/otp/otp.service.ts:81–84` builds the six digits with `Math.random()`. The five-attempt limit, five-minute expiry, resend cooldown, and route throttles reduce guessing opportunities.
- **Proof command:** `nl -ba backend/src/otp/otp.service.ts | sed -n '28,38p;81,84p'; nl -ba backend/src/otp/otp.controller.ts | sed -n '16,41p'`
- **Recommended fix:** use `crypto.randomInt` for a zero-padded six-digit code and retain the attempt/rate limits.
- **Effort:** S.

## §4 — Disbursement and invoice integrity

### FIN-01 — `Disbursement.invoiceId` is not a relation and is not validated

**Severity:** Low–Medium data-integrity risk. **VERIFIED.**

- **Evidence:** `backend/prisma/schema.prisma:1103–1125` defines `invoiceId String?` as a scalar with no `Invoice` relation/FK. `backend/src/disbursements/disbursements.controller.ts:49–53` forwards the caller's `dto.invoiceId`; `backend/src/disbursements/disbursements.service.ts:62–68` marks the disbursement recovered and stores it without checking invoice existence or tenant ownership.
- **Proof command:** `nl -ba backend/src/disbursements/disbursements.controller.ts | sed -n '49,53p'; nl -ba backend/src/disbursements/disbursements.service.ts | sed -n '62,69p'; nl -ba backend/prisma/schema.prisma | sed -n '1103,1125p'; rg -n -i 'disbursements.*invoice|invoiceId.*disbursement' backend/prisma/migrations --glob '*.sql'`
- **Impact:** a recovered disbursement can carry a nonexistent or unrelated invoice ID, weakening referential integrity and reconciliation. No direct payment movement is shown by this method.
- **Recommended fix:** validate the invoice under the same `companyId`, add an optional Prisma relation/FK with a safe delete policy, and audit/migrate existing scalar IDs before adding the constraint.
- **Effort:** M.

### FIN-02 — Monthly invoicing has a concurrent double-billing window

**Severity:** Medium. **Read/constraint facts VERIFIED; duplicate-billing consequence INFERRED; not dynamically reproduced.**

- **Evidence:** `backend/src/invoices/invoices.service.ts:400–435` selects delivered, positive-value waybills whose `invoiceItems` relation is empty, but does not claim/lock them. `:730–771` reads that list, gets `invoice.count() + 1`, then creates a nested invoice/items write. The monthly cron (`:802–823`) and tenant manual trigger (`:831–846`) can overlap. The nested invoice/items creation is atomic, but the earlier read/count are outside that write. `InvoiceItem.waybillId` is nullable and has no uniqueness constraint (`backend/prisma/schema.prisma:1417–1430`); invoice number does have `@@unique([invoiceNumber, companyId])` (`:1412`).
- **Proof command:** `nl -ba backend/src/invoices/invoices.service.ts | sed -n '400,435p;730,771p;798,846p'; nl -ba backend/prisma/schema.prisma | sed -n '1406,1431p'; rg -n -i 'invoice_items|waybillId.*invoice' backend/prisma/migrations --glob '*.sql'`
- **Impact:** two overlapping runs can read the same unbilled waybills. A same-number collision is rejected by the unique invoice-number constraint (so that case is a failed run, not a duplicate number); if invoice counts diverge between reads, distinct invoice numbers can be created with duplicate waybill items because there is no unique `waybillId` invariant. The documented sequential idempotency does not protect this concurrent case.
- **Recommended fix:** add a transactional claim/idempotency invariant for billable waybills (for example, a unique non-null `InvoiceItem.waybillId` if business rules prohibit rebilling, or an explicit billing-claim model), and replace count-based numbering with a concurrency-safe per-company sequence. Ensure failed runs can retry cleanly.
- **Effort:** M–L; confirm credit/rebilling rules before adding uniqueness.

### FIN-03 — The generator caps its candidate list at 500

**Severity:** Low–Medium, conditional on a company having more than 500 eligible unbilled waybills. **Cap VERIFIED; billing delay INFERRED.**

- **Evidence:** `getUnbilledWaybills()` orders newest first and applies `take: 500` (`backend/src/invoices/invoices.service.ts:405–435`); `generateMonthlyInvoiceForCompany()` consumes that result once and does not page (`:735–771`).
- **Proof command:** `nl -ba backend/src/invoices/invoices.service.ts | sed -n '400,435p;730,771p'`
- **Impact:** the automatic statement includes at most 500 waybills per run; older eligible deliveries remain unbilled until a later run/manual trigger. The generator comment describes every eligible delivery, but no pagination is present.
- **Recommended fix:** paginate until exhausted for the monthly job, or make the 500-row cap an explicit batch with a visible remainder/continuation process. Keep any UI listing cap separate from the billing worker.
- **Effort:** S–M.

## §5 — Authentication, SSO, role boundaries, collections, and ledger writes

### AUTH-01 — Public password reset can omit the token predicate

**Severity:** High **under the migration's default RLS phase**. Controller/service/config path **VERIFIED**; account-takeover consequence **INFERRED**; actual database setting and exploit are **UNVERIFIED**.

- **Evidence:** `POST /api/v1/auth/reset-password` is `@Public()` and accepts an inline TypeScript object, not a validated DTO (`backend/src/auth/auth.controller.ts:175–185`). The service puts `token` directly in `resetToken: token` while retaining only the future-expiry predicate (`backend/src/auth/auth.service.ts:619–625`). Prisma is locked to 5.22.0 (`backend/package-lock.json:2815,9637`); the generator enables only `driverAdapters` (`backend/prisma/schema.prisma:1–4`), and `PrismaService` has no undefined-filter override (`backend/src/prisma/prisma.service.ts:11–19`). Under Prisma's default handling, an `undefined` filter is omitted. The public `forgot-password` path can create an active reset window for a target (`auth.service.ts:594–611`). The RLS migration documents phase 1 (`app.rls_strict` off/empty) as the default and phase 2 as a separate DB setting (`backend/prisma/migrations/20261012210000_rls_tenant_isolation/migration.sql:8–23`).
- **Proof command:** `nl -ba backend/src/auth/auth.controller.ts | sed -n '175,185p'; nl -ba backend/src/auth/auth.service.ts | sed -n '594,655p'; nl -ba backend/prisma/schema.prisma | sed -n '1,4p'; rg -n -A3 '"node_modules/@prisma/client"|"node_modules/prisma"' backend/package-lock.json; nl -ba backend/prisma/migrations/20261012210000_rls_tenant_isolation/migration.sql | sed -n '8,23p'`
- **Impact:** with the default undefined semantics and phase-1 RLS behavior, a missing `body.token` can cause Prisma to omit the reset-token equality filter, leaving only `resetTokenExpiry > now`; a matching user can then have their password changed. An attacker may be able to create a target's active reset window through the public forgot-password route. Which matching user is selected depends on database contents/order; this was not reproduced. If the live database has `app.rls_strict='on'`, the no-tenant query may instead be filtered/blocked, but that would also make this reset flow fail; live DB state was not checked.
- **Recommended fix:** immediately fail closed with a validated DTO (`token` nonempty string) **and** an explicit service-level nonempty-token guard before Prisma is called. Add tests for omitted/null/empty tokens and expired/used tokens. Make token consumption, password update, and refresh-token revocation atomic; use a conditional update/CAS so concurrent reuse cannot race. Consider hashing reset tokens at rest. Do not rely on enabling Prisma strict-undefined behavior as the sole fix.
- **Effort:** S for the fail-closed guard/tests; M for atomic consumption and session revocation.

### SSO-01 — ID-token validation fails open; state is not browser-bound/one-time

**Severity:** Medium, conditional on provider/configuration trust. **Code behavior VERIFIED; impersonation/login-CSRF impact INFERRED.**

- **Evidence:** `backend/src/sso/sso.service.ts:129–160` signs a 10-minute state JWT with a random `n`, but callback validation only checks purpose/company and expiry; no stored/consumed nonce or browser binding is present. `:239–280` verifies an ID-token signature only if `conn.jwksUri` exists; a missing key, failed JWKS fetch, or parse/network issue falls through to base64 payload decoding. It does not enforce issuer, audience, expiry, or nonce. `SsoConnection` has no `jwksUri` field, though it has `issuer` (`backend/prisma/schema.prisma:2453–2481`).
- **Proof command:** `nl -ba backend/src/sso/sso.service.ts | sed -n '123,160p;234,281p'; nl -ba backend/prisma/schema.prisma | sed -n '2453,2481p'`
- **Impact:** if the user-info call is unavailable or omitted and an ID token reaches this fallback, claims can be trusted without cryptographic/standard OIDC claim validation. An attacker able to influence/compromise the provider response or a misconfigured endpoint may impersonate a tenant identity. The random state nonce does not prevent callback login-CSRF/session swapping because it is not bound to the initiating browser or consumed once. No SSO spec or dynamic test was found/run.
- **Recommended fix:** use a maintained OIDC client with discovery/JWKS rotation, fail-closed signature and `iss`/`aud`/`exp`/`nonce` checks, browser-bound one-time state and PKCE. Persist the needed discovery/JWKS configuration and add negative tests for invalid signature/claims and state replay.
- **Effort:** M–L.

### SSO-02 — FlowOps access/refresh tokens are placed in the redirect URL

**Severity:** Medium confidentiality risk. **URL placement VERIFIED; leakage impact INFERRED** based on browser/proxy logging and referrer behavior.

- **Evidence:** `backend/src/sso/sso.service.ts:189–193` returns `/sso/finish?access_token=...&refresh_token=...`.
- **Proof command:** `nl -ba backend/src/sso/sso.service.ts | sed -n '181,194p'`
- **Impact:** tokens can appear in browser history, analytics, proxy/access logs, copied URLs, and potentially referrer data. No evidence was collected about deployed logging or browser cleanup behavior.
- **Recommended fix:** exchange a short-lived one-time code in the frontend over a back channel, or set appropriately scoped `HttpOnly`, `Secure`, `SameSite` cookies; never put bearer tokens in a URL.
- **Effort:** M.

### SSO-03 — SSO secrets/endpoints lack at-rest and URL hardening

**Severity:** Low–Medium, conditional on administrator configuration. **VERIFIED.**

- **Evidence:** `SsoConnection.clientSecret` is explicitly documented as stored as-is (`backend/prisma/schema.prisma:2461–2468`). `upsertConfig()` accepts `dto:any` and stores `authUrl`, `tokenUrl`, and `userInfoUrl` without scheme/host validation (`backend/src/sso/sso.service.ts:76–104`); callback fetches those stored URLs and sends `client_secret` to `tokenUrl` (`:197–225`).
- **Proof command:** `nl -ba backend/src/sso/sso.service.ts | sed -n '76,104p;197,230p'; nl -ba backend/prisma/schema.prisma | sed -n '2461,2468p'`
- **Impact:** a misconfigured or compromised tenant administrator could direct backend requests to unintended endpoints, including plain HTTP, and expose the provider secret or create an SSRF path. This is not evidence of an unauthenticated exploit.
- **Recommended fix:** validate HTTPS and endpoint destinations (including redirects/private address handling), add timeouts, and encrypt client secrets at rest or use a secret manager.
- **Effort:** M.

### RBAC-01 — Finance/collection write routes are available to viewer or unannotated roles by default

**Severity:** Medium. **Authorization facts VERIFIED; live runtime override UNVERIFIED.**

- **Evidence:** `DisbursementsController` applies `@Roles(ADMIN, COMPANY_ADMIN, MANAGER, VIEWER)` at class level, covering its `POST`, `PATCH`, and `DELETE` methods (`backend/src/disbursements/disbursements.controller.ts:11–15,37–64`). `InvoicesController` and `CollectionsController` have no `@Roles` metadata on their write routes (`invoices.controller.ts:6–36`; `collections.controller.ts:7–76`). The global `RolesGuard` explicitly allows routes without metadata unless `RBAC_STRICT === 'true'` (`backend/src/common/guards/roles.guard.ts:16–30`), and `JwtAuthGuard`/`RolesGuard` are global (`backend/src/app.module.ts:233–243`). The committed VPS Compose does not set `RBAC_STRICT`; the tracked production env file has no assignment for the key. Runtime injection was not checked.
- **Proof command:** `nl -ba backend/src/common/guards/roles.guard.ts | sed -n '10,42p'; nl -ba backend/src/app.module.ts | sed -n '233,243p'; nl -ba backend/src/disbursements/disbursements.controller.ts | sed -n '11,15p;37,64p'; nl -ba backend/src/invoices/invoices.controller.ts | sed -n '6,36p'; nl -ba backend/src/collections/collections.controller.ts | sed -n '7,76p'; rg -n 'RBAC_STRICT' backend/src deploy/docker-compose.vps.yml docker-compose.yml deploy/vps-deploy.sh`
- **Impact:** under the committed default, any authenticated role can reach unannotated invoice/collection writes, including manual invoice generation and collection cancel/confirm/assign. Separately, `VIEWER` is explicitly allowed to create/update/recover/delete disbursements even if strict mode were enabled. This is tenant-scoped code, not a demonstrated cross-tenant read.
- **Recommended fix:** annotate read and write methods separately. Remove `VIEWER` from disbursement mutations; restrict invoice generation/payment/status mutations and collection state changes to designated finance/dispatch roles. Keep read roles on GET routes. Enable strict mode only after the route inventory is deliberately complete.
- **Effort:** S–M.

### COLL-01 — Collection terminal states can be reopened; duplicate waybills are not prevented by a database constraint

**Severity:** Medium operational/data-integrity risk. **State-handling code VERIFIED; duplicate/revival consequence INFERRED.**

- **Evidence:** `CollectionStatus` includes `FAILED` and `CANCELLED` (`backend/prisma/schema.prisma:57–64`). `UpdateCollectionDto.status` accepts any string (`backend/src/collections/dto/collection.dto.ts:16–22`), and `CollectionsService.update()` writes it directly (`collections.service.ts:179–198`). `confirmCollected()` only treats `COLLECTED` as terminal, then claims with `status: { not: 'COLLECTED' }` and creates a waybill (`:303–350`). The driver-portal path has the same broad non-`COLLECTED` condition (`backend/src/driver-portal/driver-portal.service.ts:392–426`). `cancel()` only changes status and does not clear the driver (`collections.service.ts:197–199`). `Waybill.sourceCollectionId` is indexed, not unique (`backend/prisma/schema.prisma:1194–1198,1231–1234`).
- **Proof command:** `nl -ba backend/prisma/schema.prisma | sed -n '57,64p;1194,1198p;1231,1234p'; nl -ba backend/src/collections/dto/collection.dto.ts | sed -n '16,22p'; nl -ba backend/src/collections/collections.service.ts | sed -n '179,199p;303,350p'; nl -ba backend/src/driver-portal/driver-portal.service.ts | sed -n '392,426p'`
- **Impact:** a cancelled/failed collection can be confirmed later and turned into a waybill; a previously collected row can be patched back to a non-collected state and confirmed again, with no unique `sourceCollectionId` constraint to stop a second waybill. This can break cancellation expectations and chain-of-custody/billing records. No live replay was tested.
- **Recommended fix:** define an explicit allowed transition graph and make the claim a compare-and-set from only eligible source states (`PENDING`/`ASSIGNED`/`IN_PROGRESS`). Make `COLLECTED` terminal. Add a unique source-collection invariant after checking existing data; handle replays by returning the existing waybill. Restrict these writes by role as in RBAC-01.
- **Effort:** M.

The collection confirmation path does have a good atomic boundary: the office service transaction claims the collection and creates the waybill, optional shipment, and tracking event together (`collections.service.ts:327–395`); replays are recognized. The driver-portal implementation follows the same pattern. No `collections.service.spec.ts` was present in the inspected module, so these paths were not test-executed here.

### COD-01 — Driver settlement is atomic but has no request idempotency key

**Severity:** Low–Medium financial-ledger integrity risk. **Missing idempotency VERIFIED; duplicate-retry consequence INFERRED.**

- **Evidence:** `settleDriver()` validates positive amount, uses a guarded atomic balance decrement, and inserts a `SETTLEMENT` row in the same transaction (`backend/src/cod/cod-settlement.service.ts:220–268`). The endpoint accepts only amount/note (`backend/src/cod/cod.controller.ts:57–65`), and `CodTransaction` has no request/reference key (`backend/prisma/schema.prisma:1871–1888`). Existing tests prove that concurrent settlements cannot spend the same 300-unit balance twice, but do not cover replay with a surplus balance (`backend/src/cod/cod-settlement.service.spec.ts:227–248`).
- **Proof command:** `nl -ba backend/src/cod/cod-settlement.service.ts | sed -n '216,268p'; nl -ba backend/src/cod/cod.controller.ts | sed -n '53,66p'; nl -ba backend/prisma/schema.prisma | sed -n '1871,1888p'; nl -ba backend/src/cod/cod-settlement.service.spec.ts | sed -n '227,248p'`
- **Impact:** if a successful manual cash-settlement request times out and an operator/client retries while the wallet still has at least the same amount, the service can record a second legitimate-looking settlement and decrement the balance again. The balance guard prevents overdraw, not duplicate intent; no duplicated physical payment was demonstrated.
- **Recommended fix:** accept a durable settlement reference/idempotency key and enforce uniqueness per company/driver; return the original result on retry. Keep the existing transaction and guarded decrement.
- **Effort:** M.

The COD waybill collection path uses a `codCollected` compare-and-set and writes the wallet/ledger with the collection in a transaction; regression tests cover replay/concurrent collection. Rail tariff draft generation also derives a deterministic draft ID and reads back the winner after a unique conflict (`backend/src/rail/rail-tariff.service.ts:244–304`). Rail handshake deviation plus outbox are transactional (`backend/src/rail/rail-handshake.service.ts:384–418`), with a separate audit write afterward. Static review found cost/quote/draft records in rail and maintenance cost rows in fleet, but no rail/fleet cash payout ledger in the reviewed paths.

### FLEET-01 — Maintenance logging spans several independent writes

**Severity:** Low data-consistency/retry risk. **Write sequence VERIFIED; partial-record impact INFERRED.**

- **Evidence:** `logService()` updates driver odometer, creates a vehicle-service/cost row, then runs prediction and updates next-service fields as separate operations, without a surrounding transaction (`backend/src/fleet-maintenance/fleet-maintenance.service.ts:57–100`).
- **Proof command:** `nl -ba backend/src/fleet-maintenance/fleet-maintenance.service.ts | sed -n '57,101p'`
- **Impact:** a failure after one write can leave partial maintenance state; retrying the create may add a duplicate service/cost row. This is cost tracking, not a demonstrated payment posting.
- **Recommended fix:** make the authoritative DB writes atomic and add a service-record idempotency/reference key. If prediction can fail independently, enqueue it after commit rather than holding a DB transaction open around external work.
- **Effort:** M.

## §6 — Priority order and verification gaps

1. **Urgent:** add the password-reset nonempty-token guard and DTO validation, then test the omitted-token case. Do not treat the finding as dynamically reproduced; first verify the live database's `app.rls_strict` setting without exposing credentials.
2. Add method-level role policies for invoice, collection, and disbursement mutations; scope company-logo upload to the authenticated tenant.
3. Add actual byte/aggregate upload limits and route-specific file validation; avoid unbounded memory buffering.
4. Harden monthly invoice concurrency and the 500-row billing cap; add a collection state machine and unique source-collection invariant after data review.
5. Replace the SSO claim fallback with fail-closed OIDC validation and remove bearer tokens from redirect URLs.
6. Add durable idempotency to manual COD settlements; make fleet maintenance retries safe.
7. Use a CSPRNG for OTP digits and shared OTP state before any horizontal scaling. No Compose-based public metrics exposure was found; verify the external tunnel config/host state separately.

**Unverified items:** no exploit reproduction; no live DB/RLS setting or migration status; no production proxy behavior, tunnel config, host firewall, logs, or replica state; no test suite execution. No scratch dependencies were installed, so no cleanup command is required.

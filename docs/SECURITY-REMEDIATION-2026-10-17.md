# Security-focused audit remediation — 2026-10-17

This note records the code and documentation changes made for the findings in
[`SECURITY-FOCUSED-AUDIT-2026-10-15.md`](./SECURITY-FOCUSED-AUDIT-2026-10-15.md).
The historical audit remains unchanged. This is repository-level remediation,
not evidence that a production deployment has been updated.

## Finding disposition

| Finding | Remediation |
|---|---|
| UP-01 — company-logo tenant boundary | Logo uploads now require an authorized role, the URL company ID must equal the authenticated tenant, files are capped at 2 MiB and validated by content signature/MIME/extension, and object keys use a server-generated safe extension. Added service/controller coverage. |
| UP-02 — upload size/resource bounds | Added Multer per-file/field/count/part limits and a two-request per-process upload gate; added a raw aggregate byte counter for chunked multipart uploads with route-specific ceilings. The same route limit table is used by the declared-length API-shield check. Added real HTTP tests for chunked requests at/over the limit. |
| MET-01 — cloudflared metrics | No code change: checked-in VPS Compose does not publish the metrics port on the host. The external tunnel, live host/network, firewall, and other runtime topology remain unverified. |
| OTP-01 — process-local state | OTP state and resend cooldowns now use the shared Redis provider with TTLs and bounded attempts; Redis failures fail closed. |
| OTP-02 — weak random digits | OTP codes now use a cryptographic random-number generator; purpose-specific HMAC digests are stored instead of plaintext codes. |
| FIN-01 — disbursement invoice integrity | Invoice references are validated within the company; Prisma now models a composite `(invoiceId, companyId)` relation with restrictive delete/update behavior. The migration preflights orphan/cross-company references. |
| FIN-02 — concurrent billing | Monthly/manual invoice creation uses company-scoped transaction locking and stable numbering; a unique waybill-to-invoice-item constraint prevents duplicate billing. Tests cover locking, numbering, and retries. |
| FIN-03 — 500-row cap | Automatic invoice candidate generation now cursor-pages rather than silently stopping at 500. |
| Follow-up — invoice create/update payload integrity | Both invoice screens now use a narrow create-payload serializer, omit client totals, and batch lines carry their `waybillId`. The service recalculates totals, validates linked waybills are unbilled and tenant-owned, persists only an explicit create allowlist, and never accepts caller status/payment/token/timestamp fields. Generic update now permits only a conditional DRAFT → SENT transition with a server timestamp; payment remains on the audited payment flow. |
| AUTH-01 — omitted reset token | A validated reset DTO and explicit service guard reject missing/empty/oversized tokens before Prisma. New reset tokens are stored hashed; conditional one-time consumption, password/session update, and refresh-token revocation are transactional. The takeover consequence in the historical report was inferred, not reproduced. |
| SSO-01 — OIDC/state validation | Replaced the permissive claims fallback with `openid-client` discovery and authorization-code validation, PKCE, nonce/state checks, browser-bound Redis state, and one-time consumption. JIT roles exclude administrator roles. |
| SSO-02 — bearer tokens in URL | The IdP redirect now carries only a short-lived one-time exchange code; the browser redeems it over the API with the binding cookie. |
| SSO-03 — secret storage/SSRF | OIDC client secrets use AES-256-GCM with a stable 32-byte `SSO_SECRET_ENCRYPTION_KEY`. HTTPS/public-host validation, DNS-pinned outbound requests, redirect rejection, five-second timeout, and bounded IdP responses are enforced. Self-hosting instructions now cover key generation, stability, and legacy-secret re-entry. |
| RBAC-01 — finance/collection mutations | Method-level write policies were added for disbursement, invoice, and collection routes while retaining read roles. The invoice read-role/class policy and handler-over-controller metadata behavior were explicitly confirmed as intentional; it was not treated as a defect. `RBAC_STRICT` was not globally enabled. |
| COLL-01 — collection transitions/provenance | Collection transitions are explicit; collected, failed, and cancelled states are terminal; confirmation uses eligible-state compare-and-set and transactional waybill creation. A unique source-collection relation prevents duplicate source waybills. Migration preflights existing conflicts. |
| COD-01 — manual settlement retries | Settlement requests now require a UUID idempotency key and request fingerprint; retries return the original result and key reuse with different content conflicts. Ledger writes remain transactional. |
| FLEET-01 — maintenance writes/retries | Service records require an idempotency key and fingerprint; authoritative maintenance/odometer/prediction writes are transactional. Existing rows are backfilled with deterministic legacy keys. |

Follow-up review fixes included a tenant timetable-import read that incorrectly selected shared rows, a React StrictMode SSO effect that could lose a consumed one-time code, failed-collection reopening, and the invoice payload/waybill-link behavior described above. Rail timetable parsing now scans lines without materializing a `split()` array and enforces 64 KiB per field plus a physical-line ceiling. Each has regression coverage.

## Verification completed

- Backend: **87/87 Jest suites, 2,222/2,222 tests passed** with `--runInBand --detectOpenHandles --silent`; no remaining open handles were reported after fixing an OSRM timeout-timer cleanup path.
- Frontend: **37 Vitest files, 784/784 tests passed**; `npx tsc --noEmit --pretty false` and the production Vite build passed. The existing SSO callback test emits jsdom's `Not implemented: navigation to another Document` warning while still passing.
- Backend Nest build passed; offline Prisma schema validation passed.
- A scratch PGlite 0.5.10 run applied all 16 checked-in migrations to an empty in-memory PostgreSQL-compatible database and compared the catalog with Prisma: **156 models, 2,433 columns, 106 enums, 0 differences**. This verifies fresh-schema SQL/catalog parity only, not existing production data or a live PostgreSQL deployment.
- `docs/tools/test-integrity-hardening-pglite.mjs` passed against PGlite: five legacy-data preflight rejection cases, plaintext SSO-secret clearing/encrypted-format preservation, and three post-migration unique/composite-FK rejection cases. This is synthetic in-memory evidence, not production-data validation.
- Migration inventory, full-set static review, migration-script unit tests, and RBAC inventory tests passed. `migrations:verify` now accurately states that it validates file/provider shape only and does not attest migration review, data compatibility, or deployment safety. The static review tool still reports unclassified SQL and three destructive heuristics across the migration set (`DROP TYPE`, replacement of the waybill source index, and `SET NOT NULL` on the fleet-service idempotency key; allowed explicitly during static review). These checks are not independent DBA approval. The new migration deliberately aborts before adding constraints when its legacy-data preflight fails.

## Deployment and evidence limits

- No production database, `app.rls_strict` setting, applied migration state, live SSO provider, real proxy, tunnel configuration, host firewall, or replica topology was inspected. No exploit or live IdP flow was reproduced.
- Apply the integrity migration only through the approved backup/rehearsal/adoption procedure. Existing rows that violate the new unique or tenant constraints must be reconciled first. Legacy plaintext SSO secrets are cleared by the migration; tenant administrators must re-enter them after the stable encryption key is configured.
- `MET-01` remains a runtime topology verification item, not a code vulnerability finding. The separate Paystack idempotency audit was outside this report and was not performed.
- Backend and frontend dependencies were installed in ignored `node_modules` scratch directories with lifecycle scripts disabled. The scratch installs, including PGlite, were removed after verification with `rm -rf backend/node_modules frontend/node_modules`.

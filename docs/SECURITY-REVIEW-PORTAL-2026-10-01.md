# P0 security review — customer portal authorization & resource-bound tokens (2026-10-01)

**Scope:** the two release-readiness rows still marked **NOT VERIFIED** —
"Customer portal authorization and tenant isolation" (matrix line 102) and "Portal
resource-bound tokens deployed and cross-tenant tested" (matrix line 131) — which
correspond to P0 findings **A11** and **A12** in `DEEP-RELEASE-AUDIT-2026-09-27.md`.
Reviewed at commit `ce75d1e` (code unchanged on this branch since `9abeab1` / PR #436,
which is where the remediations landed — after the audit's mock reproductions 21–23).

**Method:** source review with cited lines plus existing unit tests. This is code-level
evidence only. The matrix rows require **deployed** cross-tenant evidence and stay
**NOT VERIFIED** until that exists; this document narrows what the deployed test must
prove and what code defects were closed.

## A11 — public portal lookup (`/portal/:companyId/...`)

| Control | Status | Evidence |
| --- | --- | --- |
| Tenant scoping on every query | **Verified (code)** | `portal-lookup.util.ts` — `where.companyId` is always set and unit-tested ("always scopes to the company"); invoices list filters `{ companyId, clientEmail: { equals ... } }` (`customer-portal.controller.ts`) |
| Whitespace/empty filter must not dump the tenant | **Verified (code)** | `buildWaybillTrackWhere` returns `null` for whitespace-only phones, non-emails and digit fragments < 4 (`MIN_PHONE_DIGITS`); the route treats `null` as "no results" (`customer-portal.controller.ts:62-72`); 8 unit tests in `portal-lookup.util.spec.ts`, including the original `?phone=%20%20` repro |
| Free-text invoice enumeration removed | **Verified (code)** | `GET .../invoices` accepts only an exact client email containing `@`; the old `clientName contains` filter is gone (`customer-portal.controller.ts:98-113`) |
| Contact detail ≠ authorization | **OPEN (design)** | `GET .../track` still answers on a ≥4-digit **phone substring** or exact email; `GET .../invoices` on exact email. Anyone holding the public portal link (URL `companyId`) and a client's contact detail reads shipment names/addresses and invoice summaries. The audit exit ("resource-bound authorization or verified customer sessions") is not met for these two endpoints |
| Cross-tenant negative tests against a database | **OPEN (tests)** | No portal integration spec exists (`backend/test/integration/` has only goods-receipt, process-control, product-master) |

## A12 / resource-bound tokens — public invoice view

| Control | Status | Evidence |
| --- | --- | --- |
| Invoice view requires a resource-bound token | **Verified (code)** | `public-invoice.controller.ts:22-29` — missing token → 404; lookup is `findFirst({ where: { id, publicToken: token } })`, so a token minted for invoice X cannot open invoice Y (closes the id-only IDOR) |
| Token unguessable | **Verified (code)** | `randomUUID()` generated lazily and stored per invoice (`invoices.service.ts:82-97`) |
| Contextual output encoding (stored XSS) | **Verified (code)** | `escapeHtml` covers every HTML metacharacter — ampersand, angle brackets, quotes, backtick and equals — on every interpolation (invoice fields, company fields, line descriptions); money values pass through `Number()`; tenant brand colours go through `safeCssColor` / `safeHexForSuffix` (hex-or-keyword whitelist, everything else falls back to the default) — `html.util.ts`, 13 unit tests |
| Token expiry | **OPEN** | `publicToken` has no expiry — a leaked share link works indefinitely |
| Revocation / rotation | **OPEN** | `getShareLink` reuses the existing token forever; no rotate/revoke endpoint exists. A tenant cannot invalidate a shared link without manual database intervention |
| Cross-tenant token tests | **OPEN (tests)** | No test proves "tenant B's invoice id + tenant A's token → 404" at the database level, nor on a deployed build (matrix row 131) |

## Verdict

Both findings are **substantially remediated in code** (input holes closed, IDOR closed,
stored-XSS path escaped), but the release rows cannot flip on code review alone:

1. **Knowledge-based access remains a product decision.** `/portal/:companyId/track` and
   `/invoices` are still authorization-by-contact-detail. Options: (a) email/WhatsApp OTP
   or per-lookup magic link for these reads, (b) keep as-is and record an explicit,
   owner-approved risk exception with rate limits and alerting — but the exception must be
   a written decision, not silence.
2. **Share links need lifecycle.** Add expiry (e.g. 30 days) and a rotate-on-revoke
   endpoint for `publicToken`. Small change; it completes the audit exit criteria.
3. **The DB-backed integration suite must include portal negative tests** (this ties the
   security gate to the integration gate): token/invoice mismatch → 404; cross-tenant
   mismatch → 404; expired/rotated token → 404; whitespace phone → empty result; missing
   filter → empty result. Run again as smoke on the deployed staging build to produce the
   evidence the matrix rows ask for.

## Related open items (from A.5)

- `flowops-pods` and `old-pond-afc0` buckets: confirm whether they hold live data; only
  the user token `flowops-pods-access` (scoped to `flowops-pods`) and dashboard access can
  reach them now that the account-wide tokens are deleted.
- `flowops-pods-access` consumer: identify what uses it; consider moving it to an account
  token scoped to `flowops-pods` if it is production traffic (user tokens die with the
  owning user account).

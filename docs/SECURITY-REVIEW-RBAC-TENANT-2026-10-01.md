# P0 security review — RBAC & tenant scope (2026-10-01)

**Scope:** the owner/RBAC/tenant-scope gate — the release-readiness rows for the role
permission matrix, cross-tenant refusals and privileged-change audit. Complements
`SECURITY-REVIEW-PORTAL-2026-10-01.md` (customer portal / resource-bound tokens).

**Provenance:** the advisory scanners `rbac:inventory` and `tenant-scope:audit` (CI step
"Advisory RBAC + tenant-scope reports" — success on run `36848646801`); the CI artifact store
was unreachable from this sandbox, so the reports were regenerated locally at the same
revision `d9c5e5a` — the scanners are deterministic source analyzers. Advisories, not
verdicts: every class below was checked by hand against the source.

## Verified controls (code-level evidence)

| Control | Status | Evidence |
| --- | --- | --- |
| Global guard stack on every route | **Verified** | `app.module.ts:225-232` — `ApiShieldGuard` → `JwtAuthGuard` → `RolesGuard` as `APP_GUARD`s; `@Public()` is the only bypass |
| Unauthenticated surfaces are intentional and re-guarded | **Verified** | The 60 `public` routes triage to: auth logins/refresh; `health`; OAuth/accounting callbacks; portal branding; customer portal (per the portal review); driver-portal routes — `@Public()` skips only the JWT tenant guard and each carries `DriverAuthGuard` (`driver-portal.controller.ts:60-74`); the public waybill API authenticates by `ApiKeyGuard` (`api/public-api.controller.ts:14-15`). Scanner artifacts (decorator names like `#ApiOperation` listed as methods) account for the rest |
| Tenant id can never come from client input | **Verified** | `common/security/tenant.util.ts` — `withCompanyId` strips `companyId`/`id`/timestamps from bodies and pins the session tenant; structural, not convention (6 call files) |
| Id-keyed writes are ownership-checked first | **Verified (sampled)** | e.g. `accounting.service.ts:60-80` — `getCreditNote(id, companyId)` (tenant-scoped lookup) must succeed before `update({ where: { id } })`; this is exactly the scanner's `guarded?` class |
| `unscoped` audit hits are non-tenant or credential-scoped flows | **Verified (triaged)** | auth/refresh/owner-token lookups are keyed by credential (email/token hash), not tenant — correct for authentication; `platformAlert`/sentinel `company` hits are platform-admin surfaces. Keep-list for the future: `ai/platform-protection.service.ts:286,350` (token `deleteMany` sweeps) and `alerting.service.ts:328` (`company.update`) |

## The measurement that matters

702 routes: **32 carry `@Roles`**, **610 are tenant-authenticated but role-unrestricted**,
60 are public (triaged above). Server-side role/department authorization exists only on those
32 routes; for the other 610, role enforcement lives in the frontend navigation layer
(`frontend/src/lib/tenantUserPermissions.ts`). Any authenticated user of a tenant can call
those endpoints directly, bypassing the UI's department gating.

## Owner decision required (this is the gate)

1. **Accept for this release as a documented risk** — authentication, tenant isolation and
   the API-shield all hold; roles are treated as a UX/department layer, and the exposure is
   intra-tenant (a driver can call a manager endpoint inside their own company, not another
   company's data). Write the exception down and track it.
2. **Expand `@Roles` on a sensitive shortlist before release** — accounting writes,
   warehouse mutations, process-control change proposals, user/role management. Measured
   cost: the scanner gives the exact route list.
3. **Turn on `RBAC_STRICT=true` incrementally** — the scanner's designed end-state: reject
   routes with no `@Roles` once the list is driven down. Not a release option today (610
   entries), but it is the enforcement mechanism for option 2's follow-through.

**Recommendation:** option 2 for the sensitive write surfaces, option 1 (written exception)
for read-only reporting routes, then option 3 as the steady-state ratchet. Either way the
decision must be an owner sign-off — it is a product risk decision, not a code defect.

## Matrix rows this review touches

- Role permission matrix across ADMIN / COMPANY_ADMIN / MANAGER / WAREHOUSE / DRIVER —
  **stays NOT VERIFIED** until the decision above is made and the negative tests exist.
- Cross-tenant read/mutation refusal rows — code-level controls verified here (session-pinned
  tenant + ownership-checked writes) and the DB-backed suite runs green in CI, but the rows
  call for deployed-environment evidence and stay **NOT VERIFIED**.
- Privileged-change audit events — not examined in this pass; remains with the platform owner.

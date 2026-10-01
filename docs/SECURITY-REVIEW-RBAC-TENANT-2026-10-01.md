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

702 routes — corrected measurement (see "Correction" below):

| Class | Routes | What it means |
| --- | --- | --- |
| Role-restricted server-side | **126** | 119 across 8 controllers carrying class-level `@Roles` (autopilot 5, carriers 9, courier-management 6, disbursements 8, fleet-maintenance 8, forwarding 58, rail 11, rail-handshake 14) plus 7 method-level routes elsewhere (accounting export, accounting-integration export, returns, sso, waybills) |
| Public by design | **121** | 73 across 6 class-level `@Public` controllers — owner console 52 + owner OKRs 8 (`OwnerAuthGuard`), returns-portal 5 + customer-portal 4 (portal flows), public API 3 (`ApiKeyGuard`), token-bound invoice view 1 — plus 48 method-level (`auth` logins/refresh, `otp`, `sso`, driver-portal 13 with `DriverAuthGuard`, `push` 3 with `DriverAuthGuard`, webhooks, health) |
| Tenant-authenticated, role-unrestricted | **455** | Authentication and tenant isolation hold; the *role* layer is not enforced server-side |

For those 455, role enforcement lives in the frontend navigation layer
(`frontend/src/lib/tenantUserPermissions.ts`). Any authenticated user of a tenant can call
those endpoints directly, bypassing the UI's department gating. The exposure is intra-tenant:
a driver can call a manager endpoint inside their own company — never another company's data
(tenant pinning is structural, verified above).

### Correction (2026-10-01, same day)

The first revision of this review reported "32 / 610 / 60", taken from `rbac:inventory`. That
scanner was wrong in three ways, all fixed in `343d2c3` and pinned by
`scripts/rbac-inventory.test.mjs` (runs in `release:safety:test`, so CI re-verifies it):

1. class-level `@Roles` (8 controllers, including the entire forwarding surface) was missed —
   these routes *are* enforced at runtime, `RolesGuard` reads class metadata
   (`getAllAndOverride([handler, class])`);
2. the per-route lookback leaked the previous member's `@Roles`/`@Public` into routes that
   carry neither — it both marked unroled GETs as role-restricted and marked 11 genuinely
   authenticated routes as public;
3. comments mentioning `@Public()`/`@Roles()` were read as metadata, and `@ApiOperation`
   blocks placed below the HTTP verb were reported as handler names.

The corrected numbers are the ones above: **126 restricted / 121 public / 455 role-unrestricted**.
The triage and conclusions below are unchanged — the gap is real, just smaller than first
reported.

CI re-verified on the corrected scanner and the option-2 reference implementation:
[run 36873456002](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36873456002),
Backend job `110406865810` on `716f183` — every step success, including *Release safety
regressions* (now covering `rbac-inventory.test.mjs`) and *Integration tests (PostgreSQL)*.

## Owner decision required (this is the gate)

1. **Accept for this release as a documented risk** — authentication, tenant isolation and
   the API-shield all hold; roles are treated as a UX/department layer, and the exposure is
   intra-tenant (a driver can call a manager endpoint inside their own company, not another
   company's data). Write the exception down and track it.
2. **Expand `@Roles` on a sensitive shortlist before release** — accounting writes,
   warehouse mutations, process-control change proposals, user/role management. Measured
   cost: the scanner gives the exact route list.
3. **Turn on `RBAC_STRICT=true` incrementally** — the scanner's designed end-state: reject
   routes with no `@Roles` once the list is driven down. Not a release option today (395
   entries after option 2), but it is the enforcement mechanism for option 2's follow-through.

**Recommendation:** option 2 for the sensitive write surfaces, option 1 (written exception)
for read-only reporting routes, then option 3 as the steady-state ratchet. Either way the
decision must be an owner sign-off — it is a product risk decision, not a code defect.

## Option-2 reference implementation (owner decision still required)

To make the decision concrete rather than hypothetical, option 2 is implemented on the branch
so the owner can review the actual diff (commit alongside this document; revert is a single
`git revert`):

| Surface | Routes role-restricted | Role set applied |
| --- | --- | --- |
| Accounting (credit/debit notes, salespeople, commissions) + accounting-connector config | 20 | `ADMIN`, `COMPANY_ADMIN`, `MANAGER` (connector config: `ADMIN`, `COMPANY_ADMIN`) |
| Warehouse (`wms`) | 17 | topology + count approval: `ADMIN`, `COMPANY_ADMIN`, `MANAGER`; execution (receipts, picks, counts, adjust/transfer, cross-dock, waves, scan): also `WAREHOUSE`, `DISPATCH` |
| Process Control | 13 | definitions/versions/change proposals: `ADMIN`, `COMPANY_ADMIN`, `MANAGER`; execution: also `WAREHOUSE`, `DISPATCH`, `AGENT`; incident/solution resolution: `ADMIN`, `COMPANY_ADMIN`, `MANAGER` |
| Product Master | 10 | `ADMIN`, `COMPANY_ADMIN`, `MANAGER` |
| **Total** | **60** | `USER`, `VIEWER`, `DRIVER` are excluded from every set above |

Effect: role-unrestricted routes drop **455 → 395**. Reads, reporting and the frontend nav
layer are untouched; `RBAC_STRICT` stays off. Every set is one line at the top of its
controller — changing who may approve a cycle count is a policy edit, not a code change.

Deliberate choices for the owner to confirm or adjust at merge time:

- **Warehouse clerks** (`WAREHOUSE`) may adjust/transfer stock, receive goods, pick, count
  and scan, but **may not approve a count** or reshape warehouse topology — approval is
  supervisory (`MANAGER`+). If a site actually approves counts at clerk level, that set is
  the one line to widen.
- **Process execution** includes `AGENT`; `DRIVER` is excluded. If field drivers complete
  process steps today, `DRIVER` must be added before release (this is the one assumption in
  the table that has no frontend evidence either way — Process Control has no nav key).
- **Product approval** (`approveProduct`, `approveVariant`) uses the same set as submission.
  Segregation of duties (submitter ≠ approver) is *not* enforced; say the word and the
  approve routes get a narrower set plus a "not the submitter" check.
- **User/role management** already carried `@Roles` (`users.controller.ts`) and is unchanged.

## Matrix rows this review touches

- Role permission matrix across ADMIN / COMPANY_ADMIN / MANAGER / WAREHOUSE / DRIVER —
  **stays NOT VERIFIED** until (a) the owner picks 1 / 2 / hybrid and (b) the negative tests
  exist. The reference implementation narrows the question to the four confirm-or-adjust
  choices above.
- Cross-tenant read/mutation refusal rows — code-level controls verified here (session-pinned
  tenant + ownership-checked writes) and the DB-backed suite runs green in CI, but the rows
  call for deployed-environment evidence and stay **NOT VERIFIED**.
- Privileged-change audit events — not examined in this pass; remains with the platform owner.

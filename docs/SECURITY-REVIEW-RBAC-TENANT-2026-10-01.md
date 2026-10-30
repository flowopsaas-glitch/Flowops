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

## Owner decision — RECORDED 2026-10-01: hybrid

The owner selected the hybrid: **option 2 for the sensitive write surfaces** (the 60 routes
below, enforced server-side) **+ a written exception for read-only reporting routes** (option 1
for reads)**, with option 3 (`RBAC_STRICT`) as the steady-state ratchet** once
`npm run rbac:inventory` shows the unroled list driven down.

What that means in practice:

- Enforced now: every write on accounting notes/salespeople/commissions, accounting-connector
  configuration, warehouse mutations, process-control definitions/versions/change proposals,
  product-master catalogue writes. Attempts outside the allowed role sets get
  `403 This action requires one of these roles…`.
- Accepted, tracked exception: the remaining **395** routes (reads/reporting plus
  operational actions outside the shortlist) remain tenant-authenticated but
  role-unrestricted for this release. Exposure is intra-tenant only; tenant pinning and
  ownership-checked writes are unaffected.
- Ratchet: `RBAC_STRICT=true` is the mechanism that closes the exception — flip it only when
  `rbac:inventory` reports no unroled routes, otherwise real users get locked out.
  *(Superseded: the inventory reached zero undecided on 2026-10-24, CI was forced strict on
  2026-10-26, and production was enabled by the operator on 2026-10-25. See the
  2026-10-28 follow-up at the end of this document — the ratchet is closed.)*
- Still open, unaffected by this decision: the negative permission tests (below) and the
  deployed-environment cross-tenant rows.

## Options considered (the gate)

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

## Option-2 implementation (chosen — hybrid)

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
  decision recorded (hybrid); the 60 enforced routes have positive coverage through the
  DB-backed suite and the service-level tests, but the row **stays NOT VERIFIED until the
  negative tests exist** (deny cases: e.g. a `WAREHOUSE` user calling a finance write must get
  403, a `VIEWER` calling `adjustStock` must get 403). Those tests are the next security work
  item, not a release blocker for the database migration.
- Cross-tenant read/mutation refusal rows — code-level controls verified here (session-pinned
  tenant + ownership-checked writes) and the DB-backed suite runs green in CI, but the rows
  call for deployed-environment evidence and stay **NOT VERIFIED**.
- Privileged-change audit events — not examined in this pass; remains with the platform owner.

---

## Follow-up 2026-10-24 — option-3 ratchet completed (PR #454)

The undecided-route list has been driven to **zero**, so `RBAC_STRICT=true`
is now safe to enable in a deployed environment (set it in the deployment
environment; it is documented in `backend/.env.example`). CI enforces the
precondition from here on: `node scripts/rbac-inventory.mjs --check`
(blocking Backend-job step "RBAC coverage") fails if any route ships
without a deliberate access decision.

Final inventory (826 routes, 92 controllers):

| Decision | Routes | Meaning |
|---|---|---|
| `@Roles(...)` | 664 | restricted to named tenant roles |
| `@Public()` | 73 | no tenant JWT (logins, health, token/code callbacks) |
| `@OwnerOnly()` | 60 | platform-owner identity (`OwnerAuthGuard`) |
| `@AnyAuthenticated()` | 29 | any signed-in tenant role — self-service only |
| **undecided** | **0** | — |

What changed:

- **Role pass over 54 controllers.** Policy derived from the frontend
  permission matrix (`frontend/src/lib/tenantUserPermissions.ts`) and the
  existing house precedents (invoices/collections/disbursements role sets,
  `rail-roles.ts`): class-level read sets per domain, narrower method-level
  write sets, finance writes `ADMIN/COMPANY_ADMIN/MANAGER`, user/company
  administration `ADMIN/COMPANY_ADMIN`, `VIEWER` never mutates, `AGENT`
  reads broadly and may capture waybills/shipments/clients (its frontend
  work queues) but is excluded from money, collections writes, and
  dispatch decisions. Driver-token routes (`driver-portal`), public token
  views, and owner routes were deliberately left on their own guards.
- **`@AnyAuthenticated()` marker** (`common/decorators/any-authenticated.decorator.ts`)
  for routes where the role layer has nothing to decide because tenant +
  identity scoping already constrain the caller (own profile, own
  notifications, own company record, onboarding, the COD geofence driver
  automation). Preferring an explicit marker over nine-role `@Roles` lists
  keeps the decision honest and immune to future enum additions.
- **`RolesGuard`** now passes `@OwnerOnly` (OwnerAuthGuard's job) and
  `@Public` routes before role checks. The public-route pass also fixes a
  latent lockout: a class-level `@Roles` on a mixed controller would
  otherwise 403 its public handlers (the accounting OAuth callback and the
  token-based truck-appointment shared view were both exposed to this).
- **Scanner hardened** (`rbac-inventory.mjs`): sees decorators below the
  HTTP verb, tolerates comment lines inside decorator blocks, resolves
  class blocks per route, classifies all four decisions, and gained the
  `--check` gate. Ten fixture/real-tree tests pin the behaviour
  (`npm run rbac:test`, also in `release:safety:test`).

Companion verification (same PR): all 115 "unscoped" tenant-scope findings
hand-verified (one real cross-tenant hole on `/companies/:id` routes,
fixed), plus a 36-finding stratified sample of the 250 "guarded?" findings
— 36/36 resolved to a scoped fetch, ownership helper, `withTenant` RLS
context, parent-chain scope, or provider-token scope. The sample raises
confidence; it is not a proof for the remaining unscanned-by-hand majority,
and the tenant-scope scanner stays advisory for that reason.

Still open (unchanged from the review above): deployed-environment
negative tests (a `VIEWER`/`WAREHOUSE` token against live finance/warehouse
writes) remain the platform owner's evidence item; role metadata is now in
place for those tests to assert against.

## Follow-up 2026-10-26 — strict mode enforced in CI (PR #454)

`RBAC_STRICT: "true"` is now set in the backend CI job, so every CI run
proves the 0-undecided inventory holds under strict enforcement (a route
without a deliberate decision is rejected in tests, not discovered in
production). Trip Truth work (Slices 1–5) was added under this regime:
838 routes, 0 undecided. The remaining step is the operator's: set
`RBAC_STRICT=true` in the production deployment environment — that flip
cannot be made from this repository and has deliberately not been
claimed here.

## Follow-up 2026-10-28 — strict mode is LIVE in production, and now permanent in the repo

The 2026-10-26 entry ended with "the remaining step is the operator's". That step is
**done**, and this section closes the record — including a defect in *how* it was done.

### What happened

- **2026-10-25 — production enabled by the operator.** `RBAC_STRICT=true` is live in the
  production api container. Production therefore rejects any route that ships without a
  deliberate access decision, matching CI.
- **It was enabled by hand-editing the host.** The value was added as a literal
  `RBAC_STRICT: "true"` line to `deploy/docker-compose.vps.yml` **on the VPS only**. That
  file is tracked in this repository, so the host copy diverged from the committed copy and
  the change was invisible to review, to CI, and to the next clean checkout or rebuild.

### Why the repo could not deliver the value on its own

The `api` service in `docker-compose.yml` declares an **explicit `environment:` allowlist
and no `env_file:`**. Compose passes only the keys listed there into the container — the
host `.env` is used to *interpolate* that list, not injected wholesale. `RBAC_STRICT` was
absent from the allowlist, so:

| Where it was set | Reached the api container? |
| --- | --- |
| `backend/.env.example` (commented documentation) | No — not a runtime file for compose |
| Host `.env` / `deploy/.env.production` | No — no allowlist entry to interpolate into |
| `.github/workflows/ci.yml` backend job `env:` | No — CI runs Jest on the runner, not in compose |
| Hand-added line in the host's VPS overlay | Yes — and only there, only until re-cloned |

The observable symptom was a platform that *looked* strict-everywhere (CI green under
`RBAC_STRICT=true`, inventory at zero undecided) while the deployed api was non-strict.
This is the general failure mode of the allowlist, not a quirk of this one variable: any
future security switch added to `.env` alone will silently not arrive.

### The permanent fix (this change)

1. **`docker-compose.yml`** — the api allowlist now carries
   `RBAC_STRICT: ${RBAC_STRICT:-false}` in a labelled "Security posture" block, with a
   comment recording that this line is the only route into the container. Default `false`
   so a fresh local `docker compose up` cannot 403 a route that exists only in someone's
   working tree; production sets `RBAC_STRICT=true` in its `.env`. The prod and VPS
   overlays use plain `environment:` maps, which Compose merges key-by-key, so the base
   entry survives all three invocation styles (`-f docker-compose.yml`, `+prod`, `+vps`).
2. **`.env.example` and `.env.production.example`** — a real, uncommented `RBAC_STRICT`
   assignment with the precondition and the allowlist dependency written down.
3. **`backend/scripts/compose-env-allowlist.mjs`** — a no-Docker guard, run by
   `npm run compose-env:check` and by `release:safety:test` (Backend job). It asserts the
   key is in the api allowlist, that `${RBAC_STRICT:-false}` renders to `false`/`false`/
   `false`/`true` for host states unset/empty/false/true, that **no overlay hardcodes the
   key** (a host-side literal is what caused this incident) and that no overlay uses
   `!reset`/`!override` on the api environment (which would discard the whole allowlist),
   that both env templates document it, and that `RolesGuard` still compares against the
   literal `'true'` so the compose side and the code side cannot drift apart.
   `REQUIRED_API_ENV` is a list — the next security switch gets added to it rather than
   relying on anyone remembering this incident.
4. **CI `compose` job** — the same three renderings are checked against the *real*
   interpolator with `docker compose config` for the base file and both production
   overlays (9 assertions), followed by the no-Docker guard. Docker is not available in
   every working environment, so both oracles exist and the static one states plainly that
   it is static.

### Operator action still required (host, not repo)

The hand-added line must come out of the host's `deploy/docker-compose.vps.yml` so the
tracked file and the deployed file are the same again; the value now arrives from `.env`
through the base allowlist. Exact steps are in the PR description and in
`docs/DEPLOY-HANDOVER-RBAC-STRICT-2026-10-28.md`. Until that is done the host overlay
still overrides the base — same effective value (`true`), but the divergence persists and
`git pull` will refuse to fast-forward a tracked file with local modifications.

### Status of the option-3 ratchet

**Closed.** Not "pending", not "recommended": production enforces strict mode, CI proves
the precondition on every run, and the repo now carries the value itself. Remaining
security work in this document is unaffected and still open — deployed-environment
negative permission tests (a `VIEWER`/`WAREHOUSE` token against live finance/warehouse
writes) and the deployed-environment cross-tenant refusal rows.

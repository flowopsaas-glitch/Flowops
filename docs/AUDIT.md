# Flowops repository audit

> **Scope:** Full audit of the `Flowops` repository, kept up to date as work lands.
>
> **Audience:** Maintainers and contributors. This document is a tracked checklist — items have specific file paths and counts so progress is verifiable.
>
> **Method:** All counts and claims were produced by running `grep`/`ripgrep` against the source tree, reading the relevant files, and running the build + tests. Numbers are reproducible — see the "How to reproduce" notes under each section.
>
> **Latest update:** Reflects the state after PRs #2 (build/CI/lockfile + this doc), #3 (Phase 2 cleanup), and #4 (TenantContext + custom branding).

---

## 0. Snapshot

| Area | Status | Notes |
|---|---|---|
| Frontend build (`npm ci && npm run build`) | ✅ green | Lockfile is committed (PR #2); `npm ci` works on Node 20 / npm 10.8.2 |
| Frontend unit tests (`npm test`) | ✅ 40/40 pass | 6 test files |
| Backend code in this repo | ❌ not present | Only `frontend/` is committed |
| CI pipeline (`.github/workflows/ci.yml`) | ✅ green | `backend` + `e2e` jobs skip cleanly when `backend/` is absent (PR #2) |
| AI extraction | ⚠️ mock only | 747-line stub SDK in `frontend/src/lib/workflow-validator.ts` |
| Email verification on signup | ❌ 0% built | No verify route, no token, no resend (backend-blocked) |
| Notification preferences | ❌ 0% built | "Coming Soon" placeholder only |
| Custom branding per tenant | ✅ ~70% done (PR #4) | TenantContext + `/settings/branding` editor + sidebar consumption. Logo file upload + broader UI theming remain |
| Hardcoded `localhost` URLs in source | ✅ 0 | All routed through `lib/env.ts` (PR #3). Final grep returns 4 hits, all inside `lib/env.ts` itself |
| Hardcoded test credentials in source | ✅ 0 | All 11 stripped (PR #3). Dev autofill via `VITE_DEV_*` env vars only in DEV builds |
| `console.*` calls in production paths | 🔴 149 occurrences across 67 files | Untouched |
| Distinct localStorage keys for auth/session | 🔴 23 keys | Untouched. Phase 3 follow-up |
| `axios.create()` instances | 🔴 4 separate clients | Untouched. Phase 3 follow-up |
| i18n adoption | ⚠️ 0% | Library + `en.json` wired, never imported by any component |
| `AuthContext` typing | ✅ properly typed (PR #4) | Was `createContext<any>`. Now has `User`, `LoginArgs`, `AuthContextValue`, `LoginMode`, `UserCompanySummary` |
| Tenant context | ✅ exists (PR #4) | `contexts/TenantContext.tsx`. CSS variables `--brand-primary/secondary/invoice-header` propagated to `:root` |

---

## 1. Build & test status

### Fixed in PR #2

| Issue | Cause | Fix |
|---|---|---|
| `Rollup failed to resolve "prop-types"` during `vite build` | `react-signature-canvas` pulls `prop-types` as a peer dep but it wasn't installed | Added `prop-types` to `dependencies` |
| `Cannot find module '@testing-library/dom'` in 2 test files | Peer dep of `@testing-library/react` | Added `@testing-library/dom` to `devDependencies` |
| `backend` job in CI failed instantly because `backend/` doesn't exist | Hard-coded `working-directory: backend` | Added a `detect` job that probes for `backend/package.json`; `backend` and `e2e` jobs are now gated on `needs.detect.outputs.has_backend == 'true'`. They auto-activate when the backend lands |
| `npm ci` failed for every contributor with "Missing X from lock file" | `package-lock.json` was in the root `.gitignore` (line 72), so each developer generated their own and it drifted | Removed lockfile entries from `.gitignore`; committed a freshly regenerated `frontend/package-lock.json` (~437 KB, lockfileVersion 3) |

### How to reproduce

```bash
cd frontend
npm ci                 # 736 packages, no errors
npm run build          # builds 1724 modules, generates PWA
npm test -- --run      # 6 files, 40 tests, all passing
```

---

## 2. Backend gap (most important context)

**There is no `backend/` directory in this repo.** The CHANGELOG, `setup.sh`, and the original CI workflow all reference one — it isn't committed here. The Windows deploy scripts in `deploy/` also assume a built `backend/` exists locally.

### What this means for the audit list

| Feature | Frontend-only feasibility | Note |
|---|---|---|
| Custom branding per tenant | ✅ Largely shippable on frontend | Done in PR #4. Calls `GET/PATCH /companies/my-company` — backend may need to add the PATCH handler if not present |
| Notification preferences | ⚠️ UI-only feasible | Need a backend endpoint to actually persist; can scaffold the UI + API client + types |
| Email verification on signup | ❌ Backend-required | Can't be meaningfully built without a token-issuing endpoint and an email sender |

### Action items

- [ ] Confirm whether the backend lives in a separate repo, or has been removed and needs to be rebuilt.
- [ ] If a separate repo exists, document the URL in `docs/DEVELOPMENT.md` and update `setup.sh`.
- [ ] Either restore the `backend/` directory or remove the references to it from `deploy/*.ps1` and `setup.sh`.

---

## 3. Audit-list features

### 3.1 Email verification on signup — 0% built

Searched for `verify-email|verifyEmail|emailVerified|verification.token|/verify`. Only matches:

- `verifySession()` in `frontend/src/contexts/DriverAuthContext.tsx` (token refresh helper)
- `'geo-verification-status'` socket event in `frontend/src/hooks/usePremiumWebSocket.ts` (geofencing)
- "signature verification" / "verifications have been processed" — UI copy strings in `HighRiskQueue` and `BillingBatches`

There is **no** verify-email page, route, token-handler, resend logic, or `emailVerified` field anywhere.

### 3.2 Notification preferences — 0% built

- `frontend/src/pages/Notifications.tsx` and `pages/NotificationsPage.tsx` — both display **notification items**, not preferences.
- ~~`frontend/src/components/Settings/SettingsCommandCenter.tsx`~~ — **deleted in PR #3** (capital-S duplicate; routed sibling at `pages/SettingsCommandCenter.tsx` remains).
- `frontend/src/components/notifications/NotificationsBell.tsx` polls `GET /notifications` only.
- Grep for `notificationPreferences|emailEnabled|smsEnabled|pushEnabled|notification[_-]?prefs` → **0 matches.**
- No preference shape on `CompanyRecord` in `frontend/src/api/companiesApi.ts`.
- No `/me/notification-preferences` API method anywhere.

**Recommended next step.** Frontend-feasible: build a `NotificationPreferences` page that calls `GET/PATCH /me/notification-preferences`, with toggles for email/sms/push channels per event type. Mirrors the pattern of the new `BrandingSettings.tsx`.

### 3.3 Custom branding per tenant — ✅ ~70% built (PR #4)

| Layer | Status | Evidence |
|---|---|---|
| Type fields | ✅ defined | `api/companiesApi.ts` exports `CompanyBranding` (brandName, logoUrl, primaryColor, secondaryColor, invoiceHeaderColor, portalSubdomain) |
| Read | ✅ centralised | `contexts/TenantContext.tsx` calls `getMyCompany()` once on auth and exposes `tenant`, `branding`, `isLoading`, `error`, `refresh` |
| Edit (tenant-side) | ✅ done | `pages/settings/BrandingSettings.tsx` routed at `/settings/branding`. Diff-only `PATCH /companies/my-company`. Live preview panel |
| Apply branding | ✅ partial | `AppLayout.tsx` sidebar uses `branding.brandName` + `branding.logoUrl`. CSS variables `--brand-primary/secondary/invoice-header` written to `:root` for any future component |
| Tenant context | ✅ exists | `contexts/TenantContext.tsx`, mounted in `main.tsx` inside `<AuthProvider>` |
| Logo file upload | ⚠️ URL only | Editor accepts a logo URL. File upload (multipart → backend storage) is the natural follow-up |
| Broader UI theming | ⚠️ TODO | Sidebar consumes branding. Buttons, headers, badges still use static `text-blue-400` etc. Replace with `var(--brand-primary)` over time |

See `docs/TENANT_CONTEXT.md` for hook usage.

---

## 4. Auth, session, and signup

### 4.1 Multiple competing login UIs — ✅ resolved (PR #3)

| File | Status | Hardcoded credential |
|---|---|---|
| `pages/LoginPage.tsx` | ✅ routed at `/login` | None — autofill via `VITE_DEV_*` env vars only in `import.meta.env.DEV` |
| ~~`pages/Login.tsx`~~ | ✅ deleted (PR #3) | (removed) |
| ~~`pages/TenantAdminLogin.tsx`~~ | ✅ deleted (PR #3) | (removed) |
| ~~`pages/owner/OwnerLogin.tsx`~~ | ✅ deleted (PR #3) | (removed) |
| ~~`pages/owner/OwnerLoginPage.tsx`~~ | ✅ deleted (PR #3) | (removed) |
| ~~`pages/owner/OwnerConsole.tsx`~~ | ✅ deleted (PR #3) | (removed) |
| ~~`components/LoginForm.tsx`~~ | ✅ deleted (PR #3) | (removed) |

Final grep for `password123|2026FlowOps|GoGet2026|Password123!` returns **0 matches** in `frontend/src`.

> **Reminder:** PR #3 removed the credentials from `HEAD`. They remain in git history until a `git filter-repo` / BFG rewrite. **If `2026FlowOps!` was ever a real password, rotate it.**

### 4.2 `pages/Signup.tsx` is fully stubbed

```ts
const handleSubmit = (e) => {
  e.preventDefault();
  if (!agreed) { showToast(...); return; }
  persistTermsAcceptanceLocally();
  showToast("Signup submitted. Await admin approval.", "success");
  navigate("/login");
};
```

No network call. No record created. The form silently throws away the data and pretends to submit.

The page is also **not registered** in `App.tsx` — but `LoginPage.tsx` has a "Request access" link to `/signup` which is therefore a 404.

### 4.3 LocalStorage sprawl — 23 distinct keys (untouched)

```
access_token, accessToken, auth, authToken, base44.page, companyConfigured,
companyInfo, driverInfo, driverToken, flowops_login_mode, flowops.owner.accessToken,
flowops_owner_access_token, flowops_owner_profile, flowops_owner_token,
flowops.owner.user, flowops_token, flowops_user, isLoggedIn, jwt, login_mode,
ownerAccessToken, session, token, user
```

`pages/LoginPage.tsx` writes 11 of these on success. Logout in one place will not clear the others. **Phase 3 follow-up.**

### 4.4 Inline `ProtectedRoute` bypasses `AuthContext` (untouched)

`App.tsx:56-62` checks only `localStorage.getItem("access_token")`. An expired or invalid token still passes the guard. The proper guards in `components/auth/ProtectedRoute.tsx` and `components/guards/AuthGuard.tsx` are never wired in. **Phase 3 follow-up.**

### 4.5 `AuthContext` typing — ✅ resolved (PR #4)

`frontend/src/contexts/AuthContext.tsx` now defines:

- `LoginMode = "tenant" | "owner"`
- `User` (id, email, role, companyId, name, isSuperAdmin, isUltimateOwner, embedded `company` summary)
- `UserCompanySummary` (currency, plan, status, trialEndsAt, baseTierPrice, perUserPrice, defaultVatRate, autoInvoiceEnabled — covers `BillingPage.tsx` and other consumers)
- `LoginArgs`, `AuthContextValue`

`useAuth()` is now non-nullable and throws if used outside `<AuthProvider>`. `login()` validates the response carries an access token before storing it.

### 4.6 Action items

- [x] Delete the 6 orphan login UIs and `components/LoginForm.tsx`. (PR #3)
- [ ] Move `LoginPage.tsx` to call `useAuth().login()` instead of an inline `axios.post`. Remove the `window.location.href` reload.
- [x] Strip every hardcoded credential from source. Move dev-only autofill to `VITE_DEV_*` env vars read only when `import.meta.env.DEV`. (PR #3)
- [ ] Centralise token storage in a single module (`lib/session.ts`). Reduce 23 keys to ~3 (`access_token`, `refresh_token`, `login_mode`).
- [x] Type `AuthContext` properly — define `User`, `LoginArgs`, `AuthState`. (PR #4)
- [ ] Replace the inline `App.tsx` `ProtectedRoute` with `components/auth/ProtectedRoute.tsx` so the user object is actually checked.
- [ ] Either wire `Signup.tsx` to a real endpoint or remove it and the dead "Request access" link.

---

## 5. Routing gaps — `App.tsx`

### Missing routes

- [ ] `/signup` — `LoginPage.tsx` links here, returns 404.
- [ ] `/verify-email` (and `/verify-email?token=...`) — needed for §3.1.
- [ ] `/forgot-password` and `/reset-password`.
- [ ] `/tenant-admin/*` — was orphan; `TenantAdminLogin.tsx` was deleted in PR #3 so this route is no longer needed.
- [x] `/settings/branding` — added in PR #4.

### Bugs

- `/credit-control` renders `<ClientPortalLinks />` instead of the credit-control page (line ~140 in `App.tsx`).
- The catch-all `*` redirects to `/dashboard` even for unauthenticated users — should be `/login`.

### Unrouted dead pages

After PR #3 deletions, the still-unrouted pages are: `Signup.tsx`, `TenantCompanySettings.tsx`, `Demo.tsx`, `Pricing.tsx`, `BookingPortal.tsx`, `CustomerPortal.tsx`, `DriverApp.tsx`, `DriverLogin.tsx`, `pages/admin/TenantSettings.tsx`, plus duplicates `Notifications.tsx`/`NotificationsPage.tsx`, `Manifests.tsx`/`ManifestsPage.tsx`, multiple `Waybill*` and `Workflow*` pages.

---

## 6. API layer — `frontend/src/api/`

### Inventory of axios/fetch clients (untouched in PR #3 — only the literal URLs were swapped)

| File | Type | Notes |
|---|---|---|
| `api/client.ts` | axios | Canonical. 401-refresh interceptor. Sound. |
| `api/api.ts` | axios | **Duplicate** — different storage keys (`login_mode` vs `flowops_login_mode`) |
| ~~Root `frontend/src/api.ts`~~ | — | **Deleted in PR #3** |
| `services/api.ts` | axios | **Fourth client** — now reads from `lib/env.ts` |
| `lib/api.ts` | helpers | Workflow + memory API helpers |
| `api/liveTrackingApi.ts` | raw `fetch` | Bypasses client.ts — now uses `FLOWOPS_API_URL` from `lib/env.ts` |
| `api/tenantAdminCoreOps.ts` | mostly raw `fetch` | Now uses `FLOWOPS_API_URL` |

### Duplicates within `api/`

| Pair | Difference | Status |
|---|---|---|
| `auth.ts` vs `authApi.ts` | Same endpoints, different token-storage logic | Still both present |
| `dashboard.ts` vs `dashboardApi.ts` | Different paths (`/dashboard/metrics` vs `/dashboard`) — likely one is wrong | Still both present |
| `collections.ts` vs `collectionsApi.ts` vs `collectionApi.ts` | Three files; confusing names | Still all three |

### Hazards

- `api/aiSupervisorApi.ts` **installs a global axios response interceptor at module load** that posts every 404/500 response to `/ai-ops/repair-route`. Side-effect at import time.
- `api/aiEventsApi.ts` and `api/emailHubApi.ts` ship `seed-demo` endpoints in the production bundle (`POST /ai-events/seed-demo`, `POST /email-hub/seed-demo`).
- `api/base44Client.ts` — `auth.logout()` is a stub. Used by `AppSidebar.tsx` and `CommandCenter.tsx` so it stays for now.
- ~~`api/Untitled Document`~~ — **deleted in PR #3.**

### Action items

- [ ] Consolidate to a single axios client (`api/client.ts`). Delete `api/api.ts`, `services/api.ts`. Migrate callers.
- [ ] Migrate `api/liveTrackingApi.ts` and `api/tenantAdminCoreOps.ts` off raw `fetch` and onto the canonical client.
- [ ] Remove the global axios interceptor in `api/aiSupervisorApi.ts` — make repair-route opt-in per call.
- [ ] Remove or backend-gate the `seed-demo` endpoint exposures.
- [ ] Resolve the `auth.ts` ↔ `authApi.ts` and `dashboard.ts` ↔ `dashboardApi.ts` duplicates. Pick one of each, delete the other.
- [ ] Replace `api/base44Client.ts` and its 2 consumers with the canonical client.

---

## 7. Code quality red flags (with counts)

### 7.1 Hardcoded `localhost` URLs — ✅ resolved (PR #3)

Final grep `grep -rEn "http://(localhost|127\.0\.0\.1)" frontend/src --include="*.ts" --include="*.tsx"` returns **4 hits, all inside `lib/env.ts`** — 2 fallback values + 2 docstring mentions, exactly where they belong.

`lib/env.ts` now exposes:
- `FLOWOPS_API_URL` (with `VITE_API_BASE_URL` accepted as legacy alias)
- `FLOWOPS_HTTP_ORIGIN` (origin without `/api`)
- `FLOWOPS_WS_ORIGIN` (Socket.IO base)
- `FLOWOPS_OLLAMA_URL` (empty by default; consumers must guard rather than fall back to `localhost:11434`)
- `FLOWOPS_OTEL_TRACES_URL` (defaults to canonical OTel collector port)

### 7.2 Hardcoded test credentials — ✅ resolved (PR #3)

11 places stripped. Final grep returns **0 matches** in `frontend/src`. Dev autofill via `VITE_DEV_TENANT_*` / `VITE_DEV_OWNER_*` env vars, hard-blanked in production builds.

> Credentials remain in git history. Rotate `2026FlowOps!` if it's a real password anywhere.

### 7.3 `console.*` calls in production paths — 🔴 untouched

149 occurrences across 67 files. `lib/workflow-validator.ts` alone has 30+ `[SDK]` debug prints; `tracing.ts`, `App.tsx`, `main.tsx`, plus 60+ pages/components.

**Action:** install an ESLint rule (`no-console`, allow `warn`/`error` only) and fix the existing offenders.

### 7.4 TODO/FIXME/XXX — 0 explicit markers (untouched)

There are no explicit `TODO`/`FIXME`/`XXX` comments anywhere in `frontend/src/`. The tech debt is implicit (stubbed handlers, broken duplicates).

### 7.5 Mock/stub data in production paths

- `frontend/src/lib/workflow-validator.ts` — entire 747-line module. Imported into the prod bundle.
- `frontend/src/pages/admin/WebSocketTestDashboard.tsx` — uses `mockData` to fake events.
- `frontend/src/pages/WorkflowList.tsx` — generates mock activity rows.
- `frontend/src/pages/HighRiskQueue.tsx` — hardcoded fake risk row.

### 7.6 `any` in critical paths

- ~~`contexts/AuthContext.tsx`~~ — ✅ properly typed in PR #4.
- `api/client.ts` — generic helpers all take `params?: any` / `data?: any`.
- `api/aiCopilotApi.ts`, `api/aiSupervisorApi.ts`, `api/shipmentsApi.ts`, `api/tenantAdminCoreOps.ts` — `any` on request/response types.

---

## 8. Dead code — corrections to the original audit

The following files were **deleted in PR #3** (verified zero importers):

| Path | Why |
|---|---|
| `frontend/src/api/Untitled Document` | 1-byte placeholder |
| `frontend/src/components/layout/AppLayout.tsx.broken.1774732038` | Broken backup |
| `frontend/src/components/layout/MobileNav.tsx` | Empty file |
| `frontend/src/api.ts` (root) | Orphan duplicate of `api/client.ts` |
| `frontend/src/screens/AIWorkflowDashboard.tsx` | Sole occupant of unused dir |
| `frontend/src/components/Settings/SettingsCommandCenter.tsx` | Capital-S duplicate of `pages/SettingsCommandCenter.tsx` |
| `frontend/src/context/DriverAuthContext.tsx` | Duplicate of `contexts/DriverAuthContext.tsx` (had `/api/api/` double-prefix bug) |

**My original audit was wrong about three of these** — they have real consumers and were kept:

| Path | Real consumers |
|---|---|
| `frontend/src/api/base44Client.ts` | Imported by `AppSidebar.tsx`, `CommandCenter.tsx`. Stub-only logout but referenced by live code. |
| `frontend/src/hooks/useAuth.ts` | Imported by `components/Collections.tsx`. Different from `contexts/AuthContext.useAuth`. |
| `frontend/src/context/NotificationContext.tsx` | Imported by `ToastHistoryPanel.tsx`, `pages/driver/DriverDashboard.tsx`. The buggy `DriverAuthContext.tsx` sibling was the only file in that dir that was actually a duplicate. |

These three remain candidates for cleanup as part of a future refactor (e.g. consolidating auth around the new `AuthContext` makes `hooks/useAuth.ts` redundant), but they're **not** dead today.

---

## 9. CI / deploy

### Done

- [x] `backend` job no longer fails — gated on a `detect` job that probes for `backend/package.json`. (PR #2)
- [x] `e2e` job same treatment. (PR #2)
- [x] `frontend/package-lock.json` is now committed and `.gitignore` no longer excludes it. (PR #2)

### Remaining

- [ ] CI hard-codes `JWT_SECRET: test-jwt-secret-for-ci` in workflow env. Move to a GitHub Actions secret even if it's a test value.
- [ ] `deploy/flowops-go-live.ps1` copies `backend/.env.production` raw into the release dir — secrets ride along into release artifacts.
- [ ] All deploy scripts assume Windows (`C:\flowops\...`). If Linux is a target, port them.
- [ ] Add a `node-version` matrix or pin via `.nvmrc` so CI and dev environments match.
- [ ] `@zxing/library` requires Node ≥ 24, but CI uses Node 20. Either upgrade CI or pin the library to a Node-20-compatible version.

---

## 10. i18n status (untouched)

- Library: `i18next` 26 + `react-i18next` 17 (in `dependencies`).
- Init: `frontend/src/i18n/index.ts` registers a single locale: `en`. Hardcoded `lng: 'en'`, `fallbackLng: 'en'`.
- Locale resources: `frontend/src/i18n/locales/en.json` only — 55 lines.
- **Adoption: 0 components use `useTranslation`** (grep confirmed). Every page renders hardcoded English strings.

**Action:** either delete the `i18n` deps and the `i18n/` folder, or commit to wiring `useTranslation` page-by-page and adding a second locale.

---

## 11. Tenant model — ✅ exists (PR #4)

`contexts/TenantContext.tsx` is now the canonical source for "who is the current tenant?" and "what does this tenant look like?".

```ts
const { tenant, branding, isLoading, error, refresh } = useTenant();
const branding = useBranding(); // shorthand
```

Branding is exposed both as object fields and as CSS variables on `:root`:
- `--brand-primary`, `--brand-secondary`, `--brand-invoice-header`

See `docs/TENANT_CONTEXT.md` for usage and migration guidance.

The remaining tenant-related work:

- [ ] Migrate the ~3 ad-hoc `GET /companies/my-company` fetches in pages like `SettingsCommandCenter.tsx` to use `useTenant()`.
- [ ] `login_mode` is still stored under both `login_mode` and `flowops_login_mode` keys (see §4.3) — folds into the localStorage cleanup.

---

## 12. Security risks (consolidated)

- [ ] **Rotate `2026FlowOps!`** if it's a real owner password anywhere. (Stripped from HEAD in PR #3, still in git history.)
- [x] Strip the 11 hardcoded credential literals from source. (PR #3)
- [ ] Move the `JWT_SECRET` out of `ci.yml` and into a repo secret.
- [ ] Remove `console.log` of tokens / auth state.
- [x] Remove the developer's local Ollama URL from `components/AiCopilotPanel.tsx`. (PR #3 — now opt-in via `VITE_OLLAMA_URL`, disabled by default.)
- [ ] Stop client-side token decoding for RBAC in `components/guards/AuthGuard.tsx` (raw `atob`, no signature verification). Use server-provided role from `/auth/me`.
- [ ] Backend-gate the `seed-demo` endpoints (`/ai-events/seed-demo`, `/email-hub/seed-demo`).
- [ ] Make `deploy/*.ps1` redact `.env.production` before copying it into release dirs.

---

## 13. Recommended sequencing

### Phase 1 — Stabilise — ✅ done (PR #2)

- [x] Get the build green (peer deps).
- [x] Get CI green (guard backend/e2e jobs).
- [x] Persist this audit doc.
- [x] Track `package-lock.json` in git.

### Phase 2 — Cleanup — ✅ done (PR #3)

- [x] Delete the dead files in §8.
- [x] Strip hardcoded credentials and `localhost` URLs.
- [ ] Consolidate to one axios client. *(deferred — bigger scope)*
- [ ] Centralise token storage to `lib/session.ts`. *(deferred — bigger scope)*

### Phase 3 — Foundation — partially done (PR #4)

- [x] Introduce `TenantContext` + load `/companies/my-company` once on auth.
- [ ] Replace inline `App.tsx` ProtectedRoute with the proper one.
- [x] Type `AuthContext` properly.

### Phase 4 — The audit-list features (in this order)

1. [x] **Custom branding per tenant** — done in PR #4 (~70%; logo upload + broader UI theming remain).
2. [ ] **Notification preferences** — settings UI + API client. Frontend-feasible. **Recommended next.**
3. [ ] **Email verification on signup** — only after the backend exists.

### Phase 5 — Polish (deferred)

- [ ] i18n: commit or delete.
- [ ] ESLint `no-console`, fix the 149 offenders.
- [ ] Replace `any` types in remaining critical paths (api/client.ts).
- [ ] Increase test coverage (currently 6 test files for ~150 components).

### Phase 6 — Deferred Phase 2 cleanups

- [ ] Consolidate the 4 axios clients down to one (`api/client.ts`).
- [ ] Centralise the 23 localStorage auth keys into `lib/session.ts`.

---

## How to keep this document accurate

When a checklist item is completed, tick it here in the same PR that lands the change. If you add new red flags, append them with the date so reviewers can see when each was found.

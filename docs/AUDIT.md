# Flowops repository audit

> **Scope:** Full audit of the `Flowops` repository at the state of the latest commit on `main` plus the small fixes shipped in this PR.
>
> **Audience:** Maintainers and contributors. This document is a tracked checklist — items have specific file paths and counts so you can verify progress.
>
> **Method:** All counts and claims were produced by running `grep`/`ripgrep` against the source tree, reading the relevant files, and running the build + tests. Numbers are reproducible — see the "How to reproduce" notes under each section.

---

## 0. Snapshot

| Area | Status | Notes |
|---|---|---|
| Frontend build (`npm ci && npm run build`) | ✅ green (after this PR) | Was failing on missing peer deps |
| Frontend unit tests (`npm test`) | ✅ 40/40 pass | Was 32/40 before missing `@testing-library/dom` was added |
| Backend code in this repo | ❌ not present | Only `frontend/` is committed |
| CI pipeline (`.github/workflows/ci.yml`) | ✅ green (after this PR) | `backend` + `e2e` jobs now skip cleanly when `backend/` is absent |
| AI extraction | ⚠️ mock only | 747-line stub SDK in `frontend/src/lib/workflow-validator.ts` |
| Email verification on signup | ❌ 0% built | No verify route, no token, no resend |
| Notification preferences | ❌ 0% built | "Coming Soon" placeholder only |
| Custom branding per tenant | ⚠️ ~10% | Type fields + 1 read site, no editor, no theme propagation |
| Hardcoded `localhost` URLs in source | 🔴 64 occurrences across 46 files | Includes a developer's local Ollama URL |
| Hardcoded test credentials in source | 🔴 11 places across 7 files | Some visible in the rendered UI |
| `console.*` calls in production paths | 🔴 149 occurrences across 67 files | |
| Distinct localStorage keys for auth/session | 🔴 23 keys | No single source of truth |
| `axios.create()` instances | 🔴 4 separate clients | Plus several `fetch()` bypasses |
| i18n adoption | ⚠️ 0% | Library + `en.json` wired, never imported by any component |

---

## 1. Build & test status

### Fixed in this PR

| Issue | Cause | Fix |
|---|---|---|
| `Rollup failed to resolve "prop-types"` during `vite build` | `react-signature-canvas` pulls `prop-types` as a peer dep but it wasn't installed | Added `prop-types` to `dependencies` |
| `Cannot find module '@testing-library/dom'` in 2 test files | Peer dep of `@testing-library/react` | Added `@testing-library/dom` to `devDependencies` |
| `backend` job in CI failed instantly because `backend/` doesn't exist | Hard-coded `working-directory: backend` | Added a `detect` job that probes for `backend/package.json`; `backend` and `e2e` jobs are now gated on `needs.detect.outputs.has_backend == 'true'`. They auto-activate when the backend lands |

### How to reproduce

```bash
cd frontend
npm ci
npm run build      # builds 1724 modules, generates PWA
npm test -- --run  # 6 files, 40 tests, all passing
```

---

## 2. Backend gap (most important context)

**There is no `backend/` directory in this repo.** The CHANGELOG, `setup.sh`, and the original CI workflow all reference one — it isn't committed here. The Windows deploy scripts in `deploy/` also assume a built `backend/` exists locally.

### What this means for the audit list

| Feature | Frontend-only feasibility | Note |
|---|---|---|
| Custom branding per tenant | ✅ Mostly feasible | Theme via CSS variables; logo/colour storage can stub against `/companies/my-company` until the backend lands |
| Notification preferences | ⚠️ UI-only feasible | Need a backend endpoint to actually persist; for now we can scaffold the UI + API client + types |
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
- "verify the hidden owner credentials" — UI copy in `pages/owner/OwnerLogin.tsx`

There is **no** verify-email page, route, token-handler, resend logic, or `emailVerified` field anywhere.

### 3.2 Notification preferences — 0% built

- `frontend/src/pages/Notifications.tsx` and `pages/NotificationsPage.tsx` — both display **notification items**, not preferences.
- `frontend/src/components/Settings/SettingsCommandCenter.tsx` (note: capital `S`, duplicate of the `pages/` version) has a `notifications` tab that renders a "Coming Soon" placeholder.
- `frontend/src/components/notifications/NotificationsBell.tsx` polls `GET /notifications` only.
- Grep for `notificationPreferences|emailEnabled|smsEnabled|pushEnabled|notification[_-]?prefs` → **0 matches.**
- No preference shape on `CompanyRecord` in `frontend/src/api/companiesApi.ts`.
- No `/me/notification-preferences` API method anywhere.

### 3.3 Custom branding per tenant — ~10% built

| Layer | Status | Evidence |
|---|---|---|
| Type fields | ✅ defined | `frontend/src/pages/SettingsCommandCenter.tsx` defines `portalBrandName`, `portalSubdomain`, `portalPrimaryColor`, `portalLogoUrl`, `logoUrl`, `brandPrimaryColor`, `brandSecondaryColor`, `invoiceHeaderColor` |
| Read | ✅ partial | Same page calls `GET /companies/my-company` and shows a "Configured / Needs Setup" pill |
| Edit (tenant-side) | ❌ missing | "Branding & Identity" card links to `/settings/company-profile#branding` — **a route that does not exist** in `App.tsx` |
| Edit (admin-side) | ⚠️ orphan | `pages/admin/TenantSettings.tsx` has a `BrandingSection` (logo upload to `POST /api/v2/companies/logo`) but the page is **not registered** in `App.tsx` |
| Apply branding | ❌ minimal | `pages/BookingPortal.tsx:156-157` is the only consumer — applies `portalPrimaryColor` to the public booking widget |
| Global theme | ❌ missing | `components/layout/AppLayout.tsx` imports a static `assets/logo.png`; no CSS variables driven by tenant |
| Tenant context | ❌ missing | Grep for `TenantContext|TenantProvider|useTenant(` → 0 matches |

---

## 4. Auth, session, and signup

### 4.1 Multiple competing login UIs

Six implementations exist; **only `pages/LoginPage.tsx` is wired into the router**:

| File | Status | Hardcoded credential |
|---|---|---|
| `pages/LoginPage.tsx` | ✅ routed at `/login` | `admin@alpha.com / password123`, `flowopsaas@gmail.com / 2026FlowOps!` |
| `pages/Login.tsx` | ❌ orphan | `kadi@flowops.work / GoGet2026!` (visible in UI) |
| `pages/TenantAdminLogin.tsx` | ❌ orphan | `admin@gogetcouriers.com / Password123!` |
| `pages/owner/OwnerLogin.tsx` | ❌ orphan | `2026FlowOps!` |
| `pages/owner/OwnerLoginPage.tsx` | ❌ orphan | `2026FlowOps!` |
| `pages/owner/OwnerConsole.tsx` | ❌ orphan | `const DEFAULT_OWNER_PASSWORD = "2026FlowOps!"` |
| `components/LoginForm.tsx` | ❌ orphan component | `password123` |

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

### 4.3 LocalStorage sprawl — 23 distinct keys

```
access_token, accessToken, auth, authToken, base44.page, companyConfigured,
companyInfo, driverInfo, driverToken, flowops_login_mode, flowops.owner.accessToken,
flowops_owner_access_token, flowops_owner_profile, flowops_owner_token,
flowops.owner.user, flowops_token, flowops_user, isLoggedIn, jwt, login_mode,
ownerAccessToken, session, token, user
```

`pages/LoginPage.tsx` writes 11 of these on success. Logout in one place will not clear the others.

### 4.4 Inline `ProtectedRoute` bypasses `AuthContext`

`App.tsx:56-62` checks only `localStorage.getItem("access_token")`. An expired or invalid token still passes the guard. The proper guards in `components/auth/ProtectedRoute.tsx` and `components/guards/AuthGuard.tsx` are never wired in.

### 4.5 `AuthContext` is typed as `any` end-to-end

`frontend/src/contexts/AuthContext.tsx`:

```ts
const AuthContext = createContext<any>(undefined);
const [user, setUser] = useState<any>(null);
const login = async (args: any) => { ... }
```

No `User` type, no `LoginArgs`. Worse, the routed `LoginPage.tsx` doesn't use this context — it does its own `axios.post()` and then `window.location.href = '/dashboard'`, so `AuthContext` cannot observe the login at all.

### 4.6 Action items

- [ ] Delete the 6 orphan login UIs and `components/LoginForm.tsx`. Keep only `pages/LoginPage.tsx`.
- [ ] Move `LoginPage.tsx` to call `useAuth().login()` instead of an inline `axios.post`. Remove the `window.location.href` reload.
- [ ] Strip every hardcoded credential from source. Move dev-only autofill to a `VITE_DEV_DEFAULT_*` env var read only when `import.meta.env.DEV`.
- [ ] Centralise token storage in a single module (`lib/session.ts`). Reduce 23 keys to ~3 (`access_token`, `refresh_token`, `login_mode`).
- [ ] Type `AuthContext` properly — define `User`, `LoginArgs`, `AuthState`.
- [ ] Replace the inline `App.tsx` `ProtectedRoute` with `components/auth/ProtectedRoute.tsx` so the user object is actually checked.
- [ ] Either wire `Signup.tsx` to a real endpoint or remove it and the dead "Request access" link.

---

## 5. Routing gaps — `App.tsx`

### Missing routes

- [ ] `/signup` — `LoginPage.tsx` links here, returns 404.
- [ ] `/verify-email` (and `/verify-email?token=...`) — needed for §3.1.
- [ ] `/forgot-password` and `/reset-password`.
- [ ] `/tenant-admin/*` — `TenantAdminLogin.tsx` and `TenantCompanySettings.tsx` exist but unrouted.

### Bugs

- `/credit-control` renders `<ClientPortalLinks />` instead of the credit-control page (line ~140 in `App.tsx`).
- The catch-all `*` redirects to `/dashboard` even for unauthenticated users — should be `/login`.

### Unrouted dead pages (delete or route)

`Signup.tsx`, `Login.tsx` (old), `TenantAdminLogin.tsx`, `TenantCompanySettings.tsx`, `Demo.tsx`, `Pricing.tsx`, `BookingPortal.tsx`, `CustomerPortal.tsx`, `DriverApp.tsx`, `DriverLogin.tsx`, `pages/owner/OwnerLogin.tsx`, `pages/owner/OwnerLoginPage.tsx`, `pages/owner/OwnerConsole.tsx`, plus duplicates `Notifications.tsx`/`NotificationsPage.tsx`, `Manifests.tsx`/`ManifestsPage.tsx`, multiple `Waybill*` and `Workflow*` pages.

---

## 6. API layer — `frontend/src/api/`

### Inventory of axios/fetch clients

| File | Type | Notes |
|---|---|---|
| `api/client.ts` | axios | Canonical. 401-refresh interceptor. Sound. |
| `api/api.ts` | axios | **Duplicate** — different storage keys (`login_mode` vs `flowops_login_mode`) |
| Root `frontend/src/api.ts` | axios | **Third client** — orphan, hard-codes `http://localhost:3000/api/v1` |
| `services/api.ts` | axios | **Fourth client** |
| `lib/api.ts` | helpers | Workflow + memory API helpers |
| `api/liveTrackingApi.ts` | raw `fetch` | Bypasses client.ts; reads token from 3 different keys |
| `api/tenantAdminCoreOps.ts` | mostly raw `fetch` | Hard-codes `http://localhost:3000/api/companies` for `POST /companies` |

### Duplicates within `api/`

| Pair | Difference |
|---|---|
| `auth.ts` vs `authApi.ts` | Same endpoints, different token-storage logic |
| `dashboard.ts` vs `dashboardApi.ts` | Different paths (`/dashboard/metrics` vs `/dashboard`) — likely one of them is wrong |
| `collections.ts` vs `collectionsApi.ts` vs `collectionApi.ts` | Three files; confusing names |

### Hazards

- `api/aiSupervisorApi.ts` **installs a global axios response interceptor at module load** that posts every 404/500 response to `/ai-ops/repair-route`. Side-effect at import time — fires on any HTTP error, including ones from unrelated pages.
- `api/aiEventsApi.ts` and `api/emailHubApi.ts` ship `seed-demo` endpoints in the production bundle (`POST /ai-events/seed-demo`, `POST /email-hub/seed-demo`). These should be backend-internal.
- `api/base44Client.ts` — `auth.logout()` is a stub (`// your real logout may call an API`). Dead code.
- `api/Untitled Document` — **1-byte garbage file** committed to the repo.

### Action items

- [ ] Consolidate to a single axios client (`api/client.ts`). Delete `api/api.ts`, root `src/api.ts`, `services/api.ts`. Migrate callers.
- [ ] Migrate `api/liveTrackingApi.ts` and `api/tenantAdminCoreOps.ts` off raw `fetch` and onto the canonical client.
- [ ] Remove the global axios interceptor in `api/aiSupervisorApi.ts` — make repair-route opt-in per call.
- [ ] Remove or backend-gate the `seed-demo` endpoint exposures.
- [ ] Resolve the `auth.ts` ↔ `authApi.ts` and `dashboard.ts` ↔ `dashboardApi.ts` duplicates. Pick one of each, delete the other.
- [ ] Delete `api/Untitled Document` and `api/base44Client.ts`.

---

## 7. Code quality red flags (with counts)

### 7.1 Hardcoded `localhost` URLs — 64 occurrences across 46 files

Grep: `grep -rEn "http://(localhost|127\.0\.0\.1):(3000|3005|11434)" frontend/src --include="*.ts" --include="*.tsx"`

Worst offenders:

- `components/AiCopilotPanel.tsx:16` — `http://localhost:11434/api/generate` (a developer's **local Ollama** instance shipped in the production bundle).
- `lib/ownerApi.ts:20` — `http://127.0.0.1:3000/api`.
- `pages/Clients.tsx` — 4 occurrences including a `DELETE` call.
- `pages/AdminApprovalDashboard.tsx`, `components/modals/TransferCargoModal.tsx`, `components/Inbox/InboxCorrection.tsx` — multiple each.
- `config/api.ts:1` and root `src/api.ts:5` both default to `http://localhost:3000/api/v1`.

**Action:** route every URL through `lib/env.ts` (or a single `getApiUrl()` helper). No `http://localhost` strings in source.

### 7.2 Hardcoded test credentials — 11 places across 7 files

See §4.1 for the full table. Notable: the owner password `2026FlowOps!` is committed in 4 files, including a `const DEFAULT_OWNER_PASSWORD = "2026FlowOps!"` literal in `pages/owner/OwnerConsole.tsx`.

**Action (urgent):** if `2026FlowOps!` is the production owner password in any environment, **rotate it immediately**.

### 7.3 `console.*` calls in production paths — 149 occurrences across 67 files

`lib/workflow-validator.ts` alone has 30+ `[SDK]` debug prints; `tracing.ts`, `App.tsx`, `main.tsx`, plus 60+ pages/components.

**Action:** install an ESLint rule (`no-console`, allow `warn`/`error` only) and fix the existing offenders.

### 7.4 TODO/FIXME/XXX — 0 explicit markers

There are no explicit `TODO`/`FIXME`/`XXX` comments anywhere in `frontend/src/`. The tech debt is implicit (stubbed handlers, broken duplicates). This means any future grep-based audit will undercount.

**Action:** when leaving stubs, mark them with `// TODO:` so they're discoverable.

### 7.5 Mock/stub data in production paths

- `frontend/src/lib/workflow-validator.ts` — entire 747-line module. Imported into the prod bundle (used by the workflow create/test pages). Returns hardcoded `'John Doe'`, `'mock-message-id-123'`, etc.
- `frontend/src/pages/admin/WebSocketTestDashboard.tsx` — uses `mockData` to fake events.
- `frontend/src/pages/WorkflowList.tsx` — generates mock activity rows.
- `frontend/src/pages/HighRiskQueue.tsx` — hardcoded fake risk row.

### 7.6 `any` in critical paths

- `contexts/AuthContext.tsx` — `createContext<any>`, `useState<any>`, `args: any` (see §4.5).
- `api/client.ts` — generic helpers all take `params?: any` / `data?: any`.
- `api/aiCopilotApi.ts`, `api/aiSupervisorApi.ts`, `api/shipmentsApi.ts`, `api/tenantAdminCoreOps.ts` — `any` on request/response types.

---

## 8. Dead code to delete

| Path | Size | Why |
|---|---|---|
| `frontend/src/api/Untitled Document` | 1 byte | Empty placeholder |
| `frontend/src/components/layout/AppLayout.tsx.broken.1774732038` | 13.8 KB | Broken backup committed by accident |
| `frontend/src/components/layout/MobileNav.tsx` | 0 bytes | Empty file |
| `frontend/src/api.ts` (root) | 673 bytes | Orphan — duplicates `api/client.ts` |
| `frontend/src/screens/AIWorkflowDashboard.tsx` | 6.8 KB | Sole occupant of unused `screens/` dir |
| `frontend/src/context/` (singular) | — | Dup of `contexts/` (plural). `DriverAuthContext.tsx` here is the buggy `/api/api/` double-prefix version |
| `frontend/src/components/Settings/` (capital S) | — | Dup of `pages/SettingsCommandCenter.tsx` content |
| `frontend/src/api/base44Client.ts` | — | Stub-only |
| `frontend/src/hooks/useAuth.ts` | — | Orphan — not the AuthContext hook, not imported by anything that runs |

---

## 9. CI / deploy

### Fixed in this PR

- [x] `backend` job no longer fails — gated on a `detect` job that probes for `backend/package.json`. Skips cleanly when absent, runs unchanged when present.
- [x] `e2e` job same treatment.

### Remaining

- [ ] CI hard-codes `JWT_SECRET: test-jwt-secret-for-ci` in workflow env. Move to a GitHub Actions secret even if it's a test value.
- [ ] `deploy/flowops-go-live.ps1` copies `backend/.env.production` raw into the release dir — secrets ride along into release artifacts. Use a separate, encrypted secret-injection step.
- [ ] All deploy scripts assume Windows (`C:\flowops\...`). If Linux is a target, port them.
- [ ] Add a `node-version` matrix or pin via `.nvmrc` (currently absent) so CI and dev environments match.
- [ ] `@zxing/library` requires Node ≥ 24, but CI uses Node 20. Either upgrade CI or pin the library to a Node-20-compatible version.

---

## 10. i18n status

- Library: `i18next` 26 + `react-i18next` 17 (in `dependencies`).
- Init: `frontend/src/i18n/index.ts` registers a single locale: `en`. Hardcoded `lng: 'en'`, `fallbackLng: 'en'`.
- Locale resources: `frontend/src/i18n/locales/en.json` only — 55 lines.
- **Adoption: 0 components use `useTranslation`** (grep confirmed). Every page renders hardcoded English strings.

**Action:** either delete the `i18n` deps and the `i18n/` folder, or commit to wiring `useTranslation` page-by-page and adding a second locale. Right now it's dead weight.

---

## 11. Tenant model

There is **no `TenantContext`, `TenantProvider`, or `useTenant`** in the frontend (grep confirmed). Tenant identity is carried only by the JWT bearer token on each request. Each consumer (e.g. `SettingsCommandCenter`) fetches `GET /companies/my-company` independently — there's no shared state.

The closest thing to a tenant identifier on the client is the `login_mode` string (`tenant` | `owner` | `driver`) stored under both `login_mode` and `flowops_login_mode`. That's a coarse RBAC gate, not a tenant id.

**Action:** introduce a `TenantContext` that loads `/companies/my-company` once on auth and provides tenant data + branding to the whole tree. Required for the custom-branding feature anyway.

---

## 12. Security risks (consolidated)

- [ ] **Rotate `2026FlowOps!`** if it's a real owner password anywhere.
- [ ] Strip the 11 hardcoded credential literals from source.
- [ ] Move the `JWT_SECRET` out of `ci.yml` and into a repo secret.
- [ ] Remove `console.log` of tokens / auth state (audit `LogoutButton.tsx`, `LoginPage.tsx`, `pages/owner/OwnerLogin.tsx` console statements).
- [ ] Remove the developer's local Ollama URL from `components/AiCopilotPanel.tsx`.
- [ ] Stop client-side token decoding for RBAC in `components/guards/AuthGuard.tsx` (raw `atob`, no signature verification). Use server-provided role from `/auth/me`.
- [ ] Backend-gate the `seed-demo` endpoints (`/ai-events/seed-demo`, `/email-hub/seed-demo`) — currently callable by any authenticated client.
- [ ] Make `deploy/*.ps1` redact `.env.production` before copying it into release dirs.

---

## 13. Recommended sequencing

The repo has many issues, but a small subset blocks everything else.

### Phase 1 — Stabilise (this PR)

- [x] Get the build green (peer deps).
- [x] Get CI green (guard backend/e2e jobs).
- [x] Persist this audit doc.

### Phase 2 — Cleanup (cheap, high-signal)

- [ ] Delete the dead files in §8.
- [ ] Strip hardcoded credentials and `localhost` URLs (rotate the owner password first).
- [ ] Consolidate to one axios client.
- [ ] Centralise token storage to `lib/session.ts`.

### Phase 3 — Foundation for new features

- [ ] Introduce `TenantContext` + load `/companies/my-company` once on auth.
- [ ] Replace inline `App.tsx` ProtectedRoute with the proper one.
- [ ] Type `AuthContext` properly.

### Phase 4 — The audit-list features (in this order)

1. [ ] **Custom branding per tenant** — natural extension of `TenantContext`. Adds a settings editor + theme via CSS variables. Frontend-feasible.
2. [ ] **Notification preferences** — settings UI + API client. Can ship UI now; backend persistence later.
3. [ ] **Email verification on signup** — only after the backend exists.

### Phase 5 — Polish

- [ ] i18n: commit or delete.
- [ ] ESLint `no-console`, fix the 149 offenders.
- [ ] Replace `any` types in critical paths (AuthContext, api/client.ts).
- [ ] Increase test coverage (currently 6 test files for ~150 components).

---

## How to keep this document accurate

When a checklist item is completed, tick it here in the same PR that lands the change. If you add new red flags, append them with the date so reviewers can see when each was found.

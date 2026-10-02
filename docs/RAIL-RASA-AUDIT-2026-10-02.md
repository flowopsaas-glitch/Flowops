# RASA Rail — implementation audit (2026-10-02)

**Status: IN PROGRESS — written wave by wave; each section is committed with the code it describes.**
This document is the evidence ledger for the "TRIM Network Statement V4 (RASA 17-document suite) &
AI Security Hardening" release. It does not approve anything: the requirement register
(`RAIL-REQUIREMENT-REGISTER-TRACEABILITY-2026-09-27.md`) is still **PROPOSED BASELINE — not
approved**, and nothing here changes that.

- **Base commit:** `03b181a` (`main`). Branch `arena/01a0fac8-flowops`.
- **Sources of truth, in order:** (1) the repository at the base commit, (2) the annexure text the
  project owner pasted into the brief on 2026-10-02 (20a, 20b, 21, 25, 40), (3) the source register
  and requirement register already in `docs/`. Anything not in those three is marked **unverified**.

## 0. How evidence is cited

| Tag | Meaning |
| --- | --- |
| `path:line` | A line in this repository. `@base` = at commit `03b181a` (the "before"); no suffix = the branch head. |
| `[ANX-20a step n]` / `[ANX-20b row]` / `[ANX-21]` / `[ANX-25 Qn]` / `[ANX-40 #n]` | The annexure text supplied in the brief, by step / row / item. |
| `[REG R-0nn.n]` / `[REG EXC-0nn]` | The requirement register (`docs/RAIL-REQUIREMENT-REGISTER-TRACEABILITY-2026-09-27.md`). |
| `[SRC §n]` | The source register (`docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md`). |
| `[BRIEF]` | Stated in the brief only. Not corroborated by any supplied document → treated as a **configurable rule, flagged unverified**. |
| **unverified** | No evidence available. Never encoded as a fact. |

## 1. Where the brief and the evidence disagree

Recorded rather than silently reconciled. Proposed exception numbers continue the register's list
(which ends at EXC-025) and are **proposals for the owner / independent reviewer**, not edits to the register.

| # | Brief says | Evidence says | What was done | Proposed |
| --- | --- | --- | --- | --- |
| 1 | `OPS_CLERK` role gets Rail access (Wave 1 §3) | `UserRole` has 9 values and no `OPS_CLERK` (`backend/prisma/schema.prisma:13-23`); the string appears nowhere else in the repo | Mapped to the DISPATCH profile in the **frontend** matrix only (`frontend/src/lib/tenantUserPermissions.ts:243`). Not added to the API: it needs `ALTER TYPE … ADD VALUE`, which Wave 1 ("zero DB migration") excludes. Inert until the role exists | EXC-026 |
| 2 | Endpoints `claw/chat`, `whatsapp-mock`, `diagnostics` | Real routes: `POST /ai/claw-chat/query`, `GET /ai/whatsapp-threads-mock`, `POST /ai/whatsapp-send-mock`, `/ai-diagnostics/{logs,system-check,simulate-chaos}` (`backend/src/ai/ai.controller.ts:50,73,97,105,114`, `ai-diagnostics.controller.ts:49,62,86`) | Guarded the real routes | — |
| 3 | `@UseGuards` + `@Roles` "in `ai.controller.ts` & `ai-devops.service.ts`" | `ai-devops.service.ts` is a service — guards do not apply to services | Guards/roles on the controllers; the fail-closed gate on the service method (`ai-devops.service.ts:98`) | — |
| 4 | Dispatch gate "blocking `DISPATCHED`" (Wave 3) | `RailConsignmentStatus` has no `DISPATCHED`: `PLANNED … DEPARTED, IN_TRANSIT …` (`schema.prisma:3823-3834`) | Wave 3 gates the *departure* transition (`DEPARTED`/`IN_TRANSIT`/`AT_INTERCHANGE`), the dispatch event in this model | EXC-027 |
| 5 | "Annexure 25 **flexing windows**" (Wave 3) | Annexure 25 as supplied is the **Prospective Applicant Self-Screening Form** (7 questions, no time windows) `[ANX-25]`; the register agrees (`R-005.2`) | Annexure 25 drives the self-screening gate (Wave 2). Flexing windows are modelled from 20a/21 and NS §5.2.10.9 instead | EXC-028 |
| 6 | Possession windows "per Annexure 23/24/41"; incidents per "Annexure 13" (Wave 3) | Register §3: 13 = pantograph spec, 23 = shunting-stock spec, 24 = Interface Management Agreement, 41 = Occurrence Reporting Procedure, 18 = occurrence roles. None of 13/23/24/41 was supplied | Modelled generically from the brief's three kinds; every annexure-specific parameter marked **unverified** | EXC-029 |
| 7 | "Seed 11 transfer yards + 6 corridors" with gauge/electrification/axle/profile/length/siding/contacts (Wave 2) | **No yard or corridor technical data is in the repository or in the supplied annexures** (Network Statement Chapter 2 and `List of Yards.xlsx` were never supplied) | Schema, validators and compatibility engine are complete; **only source-evidenced identity rows are seeded**; technical fields are `null` / `SOURCE_PENDING`. See §6 | EXC-030 |
| 8 | Seed `c/GTK` rates for the 6 corridors, 2025/26 (Wave 4) | Section 5 tariff tables were never supplied. The brief gives only the escalators (8.50 %, 4.42 %) and the diesel base (R24.64/L) | Those three constants are encoded and marked `[BRIEF]`; **rates are not invented** — the calculator refuses to price a corridor with no loaded rate. See §6 | EXC-031 |
| 9 | Annexure 40 "40 ancillary services" | Annexure 40 lists 40 numbered services containing many priced-unit sub-items, and **no prices at all** (`TBD` for staging and every Future Digital item) `[ANX-40]`; consistent with `EXC-025` | Every numbered service and sub-item is catalogued with its unit of measure; prices stay `null` (`TBD` ≠ free) | — |
| 10 | Annexure 20a decision wording | The pasted text labels the **>48 h** branch "NO branch (>48 hours)" and the other branch "NO branch →" under the same decision "received >48 Hours before real time?". The step content disambiguates it: short notice → *emergency dynamic ITP*; >48 h → *relevant planning version of the ITP (7 day / 72 hour / 48 hour)* | Modelled on the step content; the labelling is flagged for confirmation against the diagram | EXC-032 |

## 2. Wave 1 — AI security hardening, rail audit trail, verified signatory, dossier export

Zero database migration. No schema change.

### 2.1 AI security (`backend/src/ai/`)

| # | Finding at `03b181a` | Evidence @base | Fix | Evidence (head) | Test |
| --- | --- | --- | --- | --- | --- |
| A1 | Model JSON was broadcast on the WebSocket **unvalidated**, in both entry points; the regex was greedy and the whole parsed object (any keys, any `companyId`) was emitted | `ai.service.ts:92-96`, `:152-156` | Every model reply goes through `validateClawAction()` before emit; the emitted payload is rebuilt from whitelisted keys only, `companyId` forced to the caller's, free text truncated to 280 chars | `ai.service.ts:190-233` (`guardModelAction`), `:171-182` (`buildSafeActionPayload`) | `ai.security.spec.ts` › *emits a validated dispatch…*, *refuses a non-whitelisted action*, *refuses a cross-tenant action* |
| A2 | No input sanitisation on the terminal or inbound-message path; only a Llama Guard substring check | `ai.service.ts:42`, `:141` | `sanitizeAiInput` (cap 1500 / 500). Score ≥ 75 is blocked **before** the model; score 25–74 is *flagged*: it may chat, but its output can never trigger an action | `ai.service.ts:249`, `:403`; threshold `ai-security.policy.ts` (`AI_INJECTION_BLOCK_SCORE = 75`, same value as `claw.service.ts:56`, `whatsapp-inbox-ai.service.ts:62`, `support.service.ts:124`) | *blocks a high-risk prompt BEFORE the model*, *lets a FLAGGED prompt chat but never act* |
| A3 | Browser-replayed chat history (incl. `role: 'system'`) was spread straight into the LLM payload | `ai.service.ts:51`, `:74` | `sanitizeHistory`: only plain user/assistant text, injections dropped, JSON stripped from assistant turns, last 10 turns | `ai.service.ts:126-148` | *treats browser-replayed history as untrusted*, *caps replayed history* |
| A4 | Client-supplied `liveMetrics.risks` was interpolated into the system prompt | `ai.service.ts:55` | Coerced to a bounded integer (`safeCount`) | `ai.service.ts:149-153` (`safeCount`) | *coerces client-supplied metrics to numbers…* |
| A5 | `AI_SECURITY_PREAMBLE` not applied on these two paths | `ai.service.ts` (absent) | Prepended in both | `ai.service.ts:312`, `:452` | *prepends AI_SECURITY_PREAMBLE…* |
| A6 | No record of blocked attempts | — | `AiEvent` rows `PROMPT_INJECTION_BLOCKED` / `UNSAFE_ACTION_BLOCKED` (free-text `type` column, so no migration), with disposition, score, patterns, a 160-char excerpt and the actor. Best-effort: a failed write never opens the gate | `ai.service.ts:79-100`; `ai-security.policy.ts` | *a failing AiEvent write never lets a blocked request through* |
| A7 | `repair-route` and `force-upgrade` had **no role check** — any authenticated user (a driver included) could call them. `repair-route` feeds caller text to an LLM (cost + injection surface), and the browser calls it automatically on every 404/500 | `ai.controller.ts:14`, `:56`, `:94`; `frontend/src/api/aiSupervisorApi.ts:62` | `@UseGuards(JwtAuthGuard, RolesGuard)`; `repair-route` and `force-upgrade` → ADMIN/COMPANY_ADMIN; Claw terminal + WhatsApp mocks → ADMIN/COMPANY_ADMIN/MANAGER/DISPATCH; `repair-route` throttled 5/min | `ai.controller.ts:35,51,74-75,98,106,115` | *AiController access control* (real `RolesGuard` run against real metadata for all 9 roles) |
| A8 | **Cross-tenant exposure:** `ai-diagnostics/logs` returned the *platform-wide* audit log (last 50, all tenants); `system-check` aggregated *all* tenants' waybills; `simulate-chaos` set a waybill to `FAILED_DELIVERY` / `totalAmount 0` for a **client-supplied `companyId`** | `ai-diagnostics.controller.ts:25`, `:37`, `:50-59` | Reads scoped to the caller's tenant (`metadata.companyId` — `AuditLog` has no tenant column); chaos is admin-only, own-tenant only (mismatching body → 403), disabled in production unless `ALLOW_AI_CHAOS_SIMULATION=true`, and audited | `ai-diagnostics.controller.ts:33,49,62,86-137` | *AiDiagnosticsController tenant scoping* |
| A9 | **Self-repair runs `git checkout -b`, overwrites a file with caller-supplied text, runs the build, `git push origin`, and on any failure `git reset --hard`** on the live working tree. It is reachable from an hourly cron on error — which writes the *error stack* into `src/ai/ClawService.ts` — and from the Trivy sweep, which writes a sentence into `src/ai/package.json` | `ai-devops.service.ts:98,106,108,141,153`; `ai.watchdog.ts:60-61`; `ai-autonomy.service.ts:86` | **Fail-closed:** when `NODE_ENV=production` and `ALLOW_AI_SELF_REPAIR !== 'true'` it returns `{ repaired: false, blocked: true }` before any git/file/process call. The target must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$` (the first version used `path.basename`, which does **not** treat `\` as a separator on POSIX — caught by a test) | `ai-devops.service.ts:98-125,284` | *AiDevOpsService.repairScript (fail-closed self-repair)* — asserts `spawn` is never called |
| A10 | No DTOs; and the production `ValidationPipe` uses `enableImplicitConversion: true` (`backend/src/main.ts:86-91`), which silently turned `command: {…}` into the string `"[object Object]"` before `@IsString()` ran | `ai.controller.ts:30,58,87` (inline types) | `ClawChatQueryDto`, `RepairRouteDto`, `SendWhatsAppMockDto`; `@RawString()` keeps the raw value so `@IsString()` can reject non-strings. `companyId` is deliberately not declared (the UI still sends `companyId: 1`; `whitelist: true` strips it). `RepairRouteDto` accepts **both** the documented body and the `{failedPath,error,timestamp}` body the browser interceptor really sends | `backend/src/ai/dto/*.ts`; `backend/src/common/decorators/raw-string.decorator.ts` | *AI controller DTOs (validated with the production ValidationPipe settings)* |
| A11 | `POST /ai/claw-chat/query` is declared twice (`AiController`, `AiChatController`) — same path; the first registered wins | `ai-chat.controller.ts:6,12` and `ai.controller.ts:28` @base | The second is made exactly as strict (guards, roles, DTO) so it cannot become a weaker second door | `ai-chat.controller.ts` | *the duplicate route is exactly as strict as the live one* |

### 2.2 Rail & handshake audit trail, verified signatory (`backend/src/rail/`)

| # | Finding at `03b181a` | Evidence @base | Fix | Evidence (head) | Test |
| --- | --- | --- | --- | --- | --- |
| B1 | The Rail module wrote **no audit trail**: neither service injected `AuditService` | `rail-handshake.service.ts:32-35`; `rail.service.ts` (no audit import) | `AuditService` injected into both; every mutating method records an event, attributed to the authenticated user, tagged `metadata.companyId` | `rail-audit.ts:17-42` (names), `:53` (entry builder) | *walks the whole lifecycle and leaves one audit event per transition, in order* |
| B2 | Sign-off stored whatever the signer typed, so identity was self-asserted | `rail-handshake.service.ts:230` | `signedOffBy = "<typed> [verified: <name> <<email>> (<ROLE>)]"` built from the JWT user. Typed text is stripped of `[ ] < >`, control characters and line breaks, so a forged `[verified: …]` tag cannot be typed; an empty result is a 400 | `rail-handshake.service.ts:70-92` (`cleanSignatoryText`, `buildVerifiedSignatory`), `:304` | *signOff — verified signatory binding* (forged tag, CRLF, hostile profile name, empty, >160 chars) |
| B3 | Anyone who could edit could sign | `rail.controller.ts:19` (class-level `@Roles(ADMIN, COMPANY_ADMIN, MANAGER)`) | Sign-off, resolve and Regulator dispute need an **authorised representative** (ADMIN/COMPANY_ADMIN/MANAGER), enforced **in the service as well as on the route** | `rail-handshake.service.ts:57-63`; `rail-roles.ts:41`; `rail-handshake.controller.ts` (`@Roles(...RAIL_SIGNATORY_ROLES)`) | *only authorised representatives may sign* (all 9 roles) |
| B4 | The UI would show Rail to DISPATCH/VIEWER but the API allowed only 3 roles | `rail.controller.ts:19` vs brief | Class-level READ set (+DISPATCH, +VIEWER); mutating routes use the WRITE set (VIEWER is read-only at the API) | `rail-roles.ts:19-34`; `rail.controller.ts`; `rail-handshake.controller.ts` | frontend *getRailAccessLevel* tests; backend role sets |
| B5 | Escalation moves had no trail | — | Each ladder move is audited as a **system** action with from/to and elapsed hours | `rail-handshake.service.ts:463-495` | *records each ladder move in the audit trail as a SYSTEM action* |

**Escalation maths — pinned, not changed.** `stageForElapsedHours` (`rail-handshake.service.ts:123`)
gives ≤24 h → `LIAISON_MANAGER_24H`, ≤48 h → `HEAD_LIAISON_48H`, ≤72 h → `ROUTE_LOGISTICS_FORUM`, >72 h →
`REGULATOR_DISPUTE`. Two properties are worth the owner's attention and are now pinned by
characterisation tests so any change is deliberate:

1. **Variance from the source** (`[REG EXC-017]`, `[SRC §6.1]`): Network Statement §6.6.1.14–16 puts the
   Head of Network Service Planning & Operations at 72 h with a 96 h resolve-by step, and treats the Route
   Logistics Forum as a *later* referral. The code puts the Forum at 72 h and has no 96 h step.
2. **Clock origin — new finding (proposed EXC-033).** The stage is computed from the report's
   **window end** (`rail-handshake.service.ts:469`), not from when the item was flagged. An item flagged
   late on an old report therefore jumps straight to the Regulator rung. Whether the source intends the clock to
   start at the report, the flag or the first issue is not stated in the supplied material → **unverified**.

### 2.3 Frontend

| # | Change | Evidence |
| --- | --- | --- |
| C1 | `rail` and `railHandshake` keys: ADMIN/COMPANY_ADMIN (+ tenant-admin synonyms), MANAGER, DISPATCH, OPS_CLERK enabled; VIEWER enabled but **read-only**; DRIVER, WAREHOUSE (and AGENT/USER/unknown) hidden | `frontend/src/lib/tenantUserPermissions.ts:56-57,117-118,162-163,196-197,229-230,243,268-269,299-300,335-336` |
| C2 | "Visible vs read-only" cannot be expressed by a boolean map, so `getRailAccessLevel()` / `canSignRailHandshake()` sit beside the matrix and mirror the API role sets | `tenantUserPermissions.ts:391`, `:398` |
| C3 | Routes and sidebar were `adminOnly` (would have ignored the matrix) → now `perm="rail"` / `perm="railHandshake"` | `frontend/src/App.tsx:316-317`; `components/layout/AppLayout.tsx:378-379`; `@base App.tsx:316-317` |
| C4 | `ReportDrawer`: **Export CSV** and **Print / PDF dossier**; every mutating control hidden for read-only / non-signatory roles | `frontend/src/pages/RailHandshake.tsx:365-366,421-428` |
| C5 | Export is pure and tested. CSV: UTF-8 BOM, CRLF, one row per deviation, **spreadsheet-formula neutralisation** (`= + - @ TAB CR`). Dossier: full HTML-escaping, printed from a script-less sandboxed iframe — no PDF library, no binary | `frontend/src/lib/railHandshakeExport.ts` |

### 2.4 Verification (Wave 1)

| Check | Baseline `03b181a` | After Wave 1 |
| --- | --- | --- |
| Backend `npx jest` | 20 suites / 307 tests | **23 suites / 479 tests**, all pass (+3 suites: `ai.security.spec.ts` 82, `rail-handshake.service.spec.ts` 67, `rail.service.spec.ts` 23) |
| Backend `npm run build` | pass | pass |
| Backend `eslint "src/**/*.ts"` (no `--fix`) | not run | 0 problems |
| Frontend `vitest run` | 8 files / 59 tests | **10 files / 131 tests**, all pass |
| Frontend `tsc --project tsconfig.app.json --noEmit` | exit 0 | exit 0 |
| Frontend `npm run lint` | 0 errors | 0 errors (pre-existing warnings only; the touched pages are back to their baseline 33) |
| Frontend `vite build` | — | pass |
| `migrations:verify`, `migrations:test`, `migrations:rehearsal:test`, `release:safety:test` | — | pass (2 migrations; 11 + 17 + 40 tests) |

Mutation check on the read-only gate: weakening `canWrite` makes *VIEWER is strictly read-only* fail; restored → 9/9.

### 2.5 Decisions the owner should confirm (Wave 1)

| # | Decision | Default taken | Where to change |
| --- | --- | --- | --- |
| D1 | Hard-block score for AI input, and "flagged input can chat but never act" | 75, as in the three existing AI services | `ai-security.policy.ts` |
| D2 | AI "operational" roles | ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH — the roles the UI matrix already grants `aiControlTower` | `ai-security.policy.ts` |
| D3 | Rail read / write / signatory roles | READ +DISPATCH +VIEWER; WRITE adds DISPATCH; signatories ADMIN/COMPANY_ADMIN/MANAGER | `rail-roles.ts` |
| D4 | Add `OPS_CLERK` to the API? | No (needs `ALTER TYPE … ADD VALUE`, outside Wave 1 and outside the additive-statement list) | schema + a migration the owner approves |
| D5 | Escalation ladder shape and clock origin | Unchanged; characterised | `rail-handshake.service.ts:123,469`; EXC-017, proposed EXC-033 |
| D6 | `ALLOW_AI_SELF_REPAIR` / `ALLOW_AI_CHAOS_SIMULATION` | Unset ⇒ off in production | `.env.production.example` |

Waves 2–4 append below as they are completed.

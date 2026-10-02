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

## 3. Wave 2 — reference master data, slot applications and the compliance gate (RAIL-005, RAIL-006, RAIL-008, RAIL-012)

### 3.1 Extraction of the supplied annexures

| Annexure | Supplied as | Captured as | Counts |
| --- | --- | --- | --- |
| 20b — cancellation reasons v1.3 | table | `catalog/cancellation-codes.catalog.ts` | **82** rows → 37 Rail Operations, 29 Infrastructure Manager, 6 Force Majeure, **10 "could be …"** (never defaulted to a party — they need Clearinghouse allocation). Codes `CNX-001…082` are FlowOps-assigned (the annexure has none) |
| 40 — ancillary services 2026/27 | list | `catalog/ancillary-services.catalog.ts` | **40** numbered services → **113** priced lines (7 / 4 / 17 / 85 across tiers 1–4); **8 `TBD`**; **no prices anywhere** |
| 25 — self-screening (Second Draft) | form | `catalog/self-screening.catalog.ts` | **7** questions (i)–(vii); drives a real gate (§3.4) |
| 20a — cancel / re-plan process v4 | process text | `catalog/cancellation-process.catalog.ts` | **24** steps (step 22's number is inferred), 5 initiators, 3 timings (15 min / 1 h / 48 h) |
| 21 — Clearinghouse v5 | narrative | same file, numeric rules only | 24 h window, closed after 48 h, 48 h investigation, 12:00 Tue–Fri / 10:30 Mon |

Full tables: source register §13 (generated); compact code index: Appendix A (generated). Named individuals in the
20a / 21 sign-off blocks are withheld (POPIA, EXC-022). `rail-docs-sync.spec.ts` asserts that both documents match
the catalogs.

### 3.2 Schema and migration — strictly additive

`20261002050000_rail_wave2_reference_slots_compliance`: **7 enums, 4 tables, 9 indexes, 3 `ALTER TABLE … ADD COLUMN`**
(`wagons.axles`, `wagons.gauge`, `wagons.vehicleProfile`). No DROP, no `ALTER COLUMN`, no `SET NOT NULL`, no data
statement. **No foreign keys** — links are scalar references verified by the service layer, as in the older rail
tables — so the only statements are `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ADD COLUMN`.

How it was verified (the Prisma engines are unreachable from the authoring sandbox — `binaries.prisma.sh` returns no
connection — so `prisma migrate diff` could not be run here):

| Check | Result |
| --- | --- |
| Renderer calibrated against Prisma's own committed SQL (`20260930143000`) | **77 / 77** statements byte-identical (whitespace-normalised) — 11 enums, 17 tables, 49 indexes, including the 63-byte identifier truncation rule and the `String[] @default([])` → `TEXT[] DEFAULT ARRAY[]::TEXT[]` rule |
| Baseline + process-book + this migration applied, in order, to a real PostgreSQL build | all 3 apply cleanly |
| Resulting catalog vs the datamodel (columns, types, nullability, defaults, indexes, enum labels) | **137 tables, 0 differences** |
| `node scripts/review-migration.mjs prisma/migrations` | **Destructive operations: none**; 137 models ↔ 137 tables |
| `npm run migrations:verify` | pass (3 migrations) |
| CI "drift guard" (`prisma migrate diff --from-migrations … --exit-code`, real engine) | **authoritative — runs on the PR** |

### 3.3 Reference data: what is seeded and what is not

| Item | Brief asked for | Evidence supplied | Seeded |
| --- | --- | --- | --- |
| Corridors | 6, with gauge / electrification / axle load / profile / train length / contacts | The six **names** and their indicative Annexure 33b routes (source register §11.4, EXC-020). **No technical data** | **6**, identity only, all `SOURCE_PENDING`, every limit `NULL` |
| Transfer yards | 11, with the same fields + siding capacity | **None** (Network Statement Ch. 2 and `List of Yards.xlsx` were not supplied) | **0 of 11** — the API, UI and `reference-status` say "0 of 11" |
| Contact directory | per corridor / yard | Two function mailboxes (source register §1) — no personal data | 2 network-level contacts |
| Value sets | gauge 1067/610/1435 mm; 3 kV DC / 25 kV AC / 50 kV AC / Diesel; 20/26/30 t; profile A/B/B+1 | the brief | encoded as enums + validators; `VERIFIED` requires every field and a `sourceRef` |

Consequence, stated plainly: **until Chapter 2 data is loaded, the envelope check returns `UNVERIFIED` for every real
corridor and never rejects** — a test asserts exactly that (`rail-envelope.spec.ts` › *every REAL catalog corridor is
currently UNVERIFIED*). The engine itself is fully exercised with clearly-labelled synthetic fixtures. Loading data is
a code-review change to `catalog/corridors.catalog.ts` / `yards.catalog.ts` plus the gated seeder
(`prisma/seed-rail-reference.js --plan`, then `--apply`).

### 3.4 Slot applications and the gates

States and transitions are FlowOps's reading of the brief's list (the sources do not define them): `DRAFT → SUBMITTED →
UNDER_ASSESSMENT ⇄ CAPACITY_CONFLICT → ALLOCATED → EXPIRED`, with `REJECTED` reachable from `SUBMITTED`,
`UNDER_ASSESSMENT` and `CAPACITY_CONFLICT`; `REJECTED` and `EXPIRED` are terminal. All 49 state pairs are tested.

| Gate / rule | Behaviour | Evidence |
| --- | --- | --- |
| Submission is a formal commitment | Authorised representatives only (service **and** route). An application fee is payable on submission (R-005.3) | `rail-slot.service.ts` `submit`; register R-005.3 |
| Gate 1 — Annexure 25 | Every question answered; every "No" has remarks. A "No" is **flagged for the IM, not blocked** — the annexure says the form helps the IM "identify any areas requiring special attention" `[ANX-25 intro 3]` | `catalog/self-screening.catalog.ts` |
| Gate 2 — compliance documents | **Hard block** if a required document is missing, unverified, revoked, not yet valid or **expired**. Dates are whole UTC days, inclusive; expiry beats a stale stored `VALID` | `rail-compliance.ts` |
| Gate 3 — corridor envelope | Gauge or axle load violating a **VERIFIED** corridor ⇒ rejected. `UNVERIFIED` is recorded, not blocked | `rail-envelope.ts` |
| Validity window | ≤ **5 years** `[BRIEF, unverified]`, checked at request and at allocation (leap-day safe) | `rail-slot.rules.ts` |
| **60-day mobilisation clock** | `mobilizeBy = allocatedAt + 60 × 24 h` `[BRIEF, unverified]`; hourly sweep sets `forfeitureFlaggedAt` on an unoperated slot (system-attributed audit + `AiEvent`); `DUE_SOON` ≤ 14 days `[unverified threshold]`. Operating is gated by the stricter OPERATE document set, so an expired permit cannot "save" a slot | `rail-slot.service.ts` `runMobilisationSweep` |
| Link consignment | Only to an ALLOCATED slot; **rejected** if a wagon violates the corridor's gauge / axle load | `linkConsignment` |

Required document sets are a proposal (the brief names the eight types, not when each is needed): **SUBMIT** = RSR
permit, insurance, rolling-stock and crew certification (+ DG authorisation for dangerous goods); **OPERATE** = SUBMIT +
interface agreement, access contract, security deposit. Derived from R-006.1, R-010.1 and R-005.4. Owner to confirm.

### 3.5 Corridor-envelope outcomes

`COMPATIBLE` (every limit known on both sides and satisfied) · `INCOMPATIBLE` (gauge or axle load known on both sides
and violated — **reject**) · `UNVERIFIED` (anything unknown, or a corridor whose data is not `VERIFIED` — **never a
pass**; would-be violations against unverified data are downgraded to warnings). Profile, train length and traction
mismatches are advisory warnings only: the profile ordering `A < B < B+1` is unverified. Axle load = (tare + loaded) /
axles, only when all three are known.

### 3.6 Findings while implementing Wave 2

| # | Finding | Where | Resolution |
| --- | --- | --- | --- |
| W2-1 | `allocate(…, now)` rendered the returned countdown with the wall clock, so it disagreed with the clock the caller supplied (61 vs 60 days) | `rail-slot.service.ts` `transition` | `now` threaded through; test added |
| W2-2 | The role-matrix test found a deliberate exception: `POST /rail/slots/envelope-check` is a POST but a pure calculation | `rail.controllers.spec.ts` | open to the READ set; encoded as an explicit one-item allow-list so any other read-only POST needs a deliberate edit |
| W2-3 | The global exception filter surfaces only a string `message` (extra exception fields are dropped) | `common/filters/http-exception.filter.ts:29-35` | gates return one sentence naming every blocker, and a side-effect-free `GET …/readiness` gives the UI the structured detail |
| W2-4 | `prisma generate` / `migrate diff` need engines that the sandbox cannot download | sandbox | generation worked with placeholder engine files (types only); migration SQL verified as §3.2 |

### 3.7 Verification (Wave 2)

| Check | Baseline `03b181a` | After Wave 1 | After Wave 2 |
| --- | --- | --- | --- |
| Backend `npx jest` | 20 suites / 307 tests | 23 / 479 | **32 suites / 797 tests**, all pass |
| Backend `npm run build`; `eslint "src/**/*.ts"` | pass; — | pass; 0 | pass; **0 problems** |
| Frontend `vitest run` | 8 files / 59 tests | 10 / 131 | **13 files / 183 tests**, all pass |
| Frontend `tsc`; `npm run lint`; `vite build` | pass; 0 errors; — | pass; 0 errors; pass | pass; **0 errors**; pass |
| `migrations:verify` / `migrations:test` / `release:safety:test` / `review-migration` / offline schema validation | — | — | pass (3 migrations; 11 + 40 tests; *Destructive operations: none*; schema valid) |

New suites in Wave 2: `rail-reference` (catalogs, validators), `rail-envelope`, `rail-compliance`, `rail-slot.rules`,
`rail-slot.service` (76), `rail.controllers` (role matrix for every rail route, 59), `catalog/seed-rail-reference`,
`dto/rail-slot.dto`, `rail-docs-sync`; frontend `railSlot` (23), `SlotCompliancePanel` (24), `RailOperations`.

### 3.8 Decisions the owner should confirm (Wave 2)

| # | Decision | Default taken |
| --- | --- | --- |
| D7 | Required document sets for SUBMIT / OPERATE | as §3.4 |
| D8 | A "No" on Annexure 25 flags but does not block | flag only |
| D9 | Mobilisation `DUE_SOON` threshold, RSR expiry warning / critical days | 14 / 30 / 7 days — none is in any source |
| D10 | Whether tenants may enter their own corridor limits | No — reference data is platform-wide and code-reviewed |
| D11 | Add real foreign keys later? | No FKs now, to stay inside the additive statement list |

## 6. Open data requests (nothing below has been invented)

| # | Needed | From | Lands in | Unblocks |
| --- | --- | --- | --- | --- |
| 1 | Corridor technical data: gauge, electrification, max axle load (20/26/30 t), vehicle profile, max train length, per V4 corridor | Network Statement V4 Chapter 2 | `catalog/corridors.catalog.ts` (+ `sourceRef`, `verifiedBy`, `dataStatus: 'VERIFIED'`) | real `COMPATIBLE` / `INCOMPATIBLE` envelope results |
| 2 | The 11 transfer yards with the same fields + siding capacity + contacts | Chapter 2; `List of Yards.xlsx` (Annexure 40 item 1) | `catalog/yards.catalog.ts` | yard validation on applications |
| 3 | Definition of vehicle profiles A / B / B+1 and their order | Chapter 2 / Annexures 2–12 (NDA) | `rail-reference.ts` `RAIL_VEHICLE_PROFILE_ORDER` | profile check as a hard criterion |
| 4 | Which documents are required at which stage; validity of the 60-day mobilisation and 5-year window | Chapter 3 / 4 / RAA | `rail-compliance.ts`, `rail-reference.ts` | confirm D7, remove `[BRIEF]` tags |
| 5 | Annexure C of the Rail Access Agreement / Network Statement Chapter 5: the weekly do-ability cut-off, deemed cancellation on non-utilisation, the contracted-path failure credit | S2 Annexure C; NS §5.2.10.9 | `rail-change.rules.ts` `evaluateConsequence` | remove the *unverified* evidence line; model the three unmodelled remedies |
| 6 | Annexure 20a flow diagram (the label of the > 48 h branch) | the annexure PDF | `catalog/cancellation-process.catalog.ts` | close EXC-032 |
| 7 | Annexures 23, 24 and 41 as the brief describes them (possession kinds, the 60-day lock), and Annexures 36 / 41 (the occurrence reporting trail, the 48-hour form) | the Network Statement annexure set | `rail-possession.rules.ts`, `rail-occurrence.service.ts` | confirm D15 / D16, remove `[BRIEF]` tags |
| 8 | The authoritative dangerous-goods data list and its formats; which statuses the gate must cover | Chapter 3 / the DG procedure | `rail-dangerous-goods.ts` | confirm D17 |

## 4. Wave 3 — cancellations & reschedules, possession windows, occurrence reports, dangerous goods (RAIL-007, RAIL-009, RAIL-010, RAIL-011)

Task numbers are the brief's; requirement numbers (`R-0nn.n`) are the register's. In the register, cancellations are
RAIL-013, the Clearinghouse RAIL-014 and occurrence reporting RAIL-015.

### 4.1 Schema and migration — strictly additive

`20261002060000_rail_wave3_changes_possessions_occurrences_dg`: **10 enums, 4 tables, 10 indexes, 12 `ALTER TABLE … ADD
COLUMN`** (the five dangerous-goods fields + the `isDangerousGoods` flag, on both `rail_consignments` and `wagons`).
No DROP, no `ALTER COLUMN`, no `SET NOT NULL`, no data statement, **no foreign keys** (D11 stands). New tables:
`rail_cancellation_codes` (platform-wide), `rail_slot_change_requests`, `rail_possession_windows`,
`rail_occurrence_reports` (all tenant-scoped).

| Check | Result |
| --- | --- |
| Baseline + process-book + Wave 2 + this migration applied, in order, to a real PostgreSQL build | all 4 apply cleanly |
| Resulting catalog vs the datamodel (columns, types, nullability, defaults, indexes, enum labels) | **141 tables, 0 differences** |
| `node scripts/review-migration.mjs prisma/migrations --schema prisma/schema.prisma` | **Destructive operations: none**; 141 models ↔ 141 tables |
| `npm run migrations:verify` / `migrations:test` / `release:safety:test` | pass (4 migrations) / 11 of 11 / 40 of 40 |
| Offline schema validation (`scripts/prisma-validate-offline.mjs`) | schema valid |
| CI "drift guard" (`prisma migrate diff`, real engine) | **authoritative — runs on the PR** (the engines are unreachable from the authoring sandbox, as in §3.2) |

### 4.2 Cancel / reschedule / re-plan (Annexure 20a + 20b) — RAIL-007

| Rule | Behaviour | Evidence |
| --- | --- | --- |
| Reason catalogue | **82** reasons (`CNX-001…082`, FlowOps-assigned) are loaded by the gated seeder; the API serves the code catalog until it has run. The 10 "could be …" reasons keep the party the annexure names and are **never defaulted** | `[ANX-20b]`, `[REG R-013.4]` |
| Who bears it | Derived on the server from the reason: *Rail Operations* → **TOC**, *Infrastructure Manager* → **TRIM**, *Force Majeure* → recorded distinctly, *could be …* → **UNDETERMINED** until the Clearinghouse allocates it | `[REG R-013.1, R-013.2]`; D12 |
| The client cannot choose its own penalty | The DTO does not declare `attribution`, `penalty*`, `noticeBand`, `commercialWindow`, `status` or `companyId`; the whitelist strips them even if sent | `dto/rail-change.dto.spec.ts` |
| Notice windows | Notice within **15 min** of the event (warned, not blocked); the IM acknowledges within **1 h** (an overdue clock is computed, not stored); received **more than** 48 h before departure ⇒ planning-version ITP, otherwise the emergency dynamic ITP. Boundaries follow the wording: exactly 48 h is short notice; exactly 72 h is inside the commercial window | `[ANX-20a steps 1–6, decision]`, EXC-032 |
| Commercial consequence | TOC-caused, ≤ 72 h before departure ⇒ **forfeit** access fees paid in advance · TOC-caused, > 72 h ⇒ **credit if the path is reallocated** · TRIM-caused and the replacement path **not** accepted ⇒ **full Train Path fee refund** (TRIM bears it; "subject to the limitation of liability") · TRIM-caused and accepted ⇒ none · planned occupation ⇒ none · Force Majeure ⇒ none · **UNDETERMINED ⇒ "pending allocation" — no consequence is assumed** · no departure time ⇒ "pending departure time" | `[REG R-013.3]` (NS §5.2.10.9 = RAA Annexure C — **not supplied; unverified**) |
| Allocating a "could be …" party | **Authorised representatives only** (service and route); only a party the annexure names for that reason; refused when the annexure already allocates it; refused once the request is closed | `rail-change.service.ts` `allocateParty` |
| State machine | `SUBMITTED → ACKNOWLEDGED → [ALTERNATIVE_PROPOSED →] ACCEPTED \| CANCELLED_CONFIRMED → CLOSED`; the consequence is re-derived when the replacement outcome is known | `rail-change.rules.ts` `CHANGE_TRANSITIONS` |
| Handshake integration | With `handshakeReportId` the request is also logged as a `CANCELLATION` / `RESCHEDULE` deviation (responsible party and slot impact derived, order number = the request number) and both ids are stored. Only a DRAFT or PENDING_TOC report accepts it | `[REG R-013.5]`, `[ANX-20a step 7]` |
| A request names only this tenant's records | `consignmentId`, `slotApplicationId` and `handshakeReportId` are each checked against the caller's tenant before anything is saved | `rail-change.service.spec.ts` |

**Not modelled, because the evidence was not supplied:** the "weekly do-ability" cut-off in R-013.3, non-utilisation as a
*deemed cancellation* with fees retained, and the credit for TRIM failing to provide contracted paths. Every
consequence the service returns carries an `evidence` line saying the source annexure is unsupplied. **No amounts are
computed in this wave** — what the consequence is *worth* is Wave 4's calculator.

### 4.3 Possession windows — RAIL-009

| Rule | Behaviour | Evidence |
| --- | --- | --- |
| Kinds | `ANNUAL_PLAN`, `LOCKED_60_DAY`, `AD_HOC_EMERGENCY` | `[BRIEF]`; Annexures 23 / 24 / 41 were **not supplied** and the register maps them to other subjects (EXC-029) |
| Lock | 60 days: an annual-plan window is treated as locked from `startsAt − 60 d`; the other two kinds always are | `[BRIEF, unverified]`; D15 |
| Conflict | A PLANNED/ACTIVE window and a still-active consignment on the **same catalog corridor** with overlapping time (touching ends do not overlap). Severity **HARD** (locked / emergency) or **PLANNED** (annual plan not yet locked) | `rail-possession.rules.ts` |
| Honesty | A consignment with **no usable schedule**, or whose corridor text matches **no** catalog corridor, is listed as *unscheduled* / *unresolved*. It is never assumed clear | `rail-possession.rules.spec.ts` |
| Advisory only | A conflict raises a banner, an audit entry and an `AiEvent`; it never blocks a booking | D15 |
| Status | Hourly sweep: PLANNED → ACTIVE at its start, COMPLETED after its end; each change is a system-attributed audit entry | `rail-possession.service.ts` `runStatusSweep` |

### 4.4 Occurrence reports — RAIL-010

| Rule | Behaviour | Evidence |
| --- | --- | --- |
| Classification | Levels 1 / 2 / 3 = Code Green / Orange / Red; types derailment, collision, OHTE / cable theft, SPAD, hazmat spill, other | `[REG R-012.4]`; the types are `[BRIEF]` |
| Reporting chain | The TCO is notified **immediately**, then the Regulator; each party's time is recorded **once** (the first record stands) with the minutes after the event | `[REG R-015.1]` |
| 48-hour preliminary report | Due `occurredAt + 48 h`; **overdue** is computed from the clock; a late filing is flagged in the audit entry | `[REG R-015.5]` (form 4.12B, Annexure 36 — **not supplied; unverified**); D16 |
| Close | Authorised representatives only, and only after the preliminary report is filed | formal act; as the handshake sign-off |
| Linked evidence | Optionally logged as a handshake deviation (`deviationId`), and linked to its `audit_logs` row (`auditLogId`) — `AuditService.record` now returns the row id, or `null` if the write failed | brief; `audit.service.spec.ts` |
| Best-effort audit | A failure to write the audit entry **never** loses the safety record: the report is saved with `auditLogId = null` | `rail-occurrence.service.spec.ts` |
| Hazmat | A hazmat-spill report is a hazmat occurrence: the caller cannot un-flag it | |

**Known limitation (deliberately not changed):** `create` for both change requests and occurrences saves the row
*before* it calls `RailHandshakeService.logDeviation`. The handshake report's status is checked first, so only a race
(the report is signed off between the check and the call) can make the second step throw; the row would then exist
**unlinked**, and a client retry would create a second one. Making the link transactional needs a change to the
handshake service's write path (or a compensating delete), which is outside this wave. The audit entry is unaffected.

### 4.5 Dangerous goods — RAIL-011

| Rule | Behaviour | Evidence |
| --- | --- | --- |
| Mandatory fields | UN number · IMDG class · placard reference · 24-hour emergency contact · safety-data-sheet link — on the consignment and, individually, on a wagon (a wagon's empty field **inherits** the consignment's) | `[BRIEF]`; `[REG R-005.4]` (safety data sheet) |
| Formats | `UN` + 4 digits; IMDG class `1–9` with optional division and letter (3, 2.1, 6.1, 1.4S); a phone number; an `https://` link | **UN / IMDG conventions, not taken from a supplied annexure** — the validator's header says so; D17 |
| Dispatch gate | A consignment that carries dangerous goods with missing or malformed details cannot **move into** `DEPARTED`, `IN_TRANSIT` or `AT_INTERCHANGE` — jumping ahead does not skip it. Other moves (including a cancel) are never gated. The refusal is a 400 and a `consignment.dispatch_blocked` audit entry | brief names `DISPATCHED`; no such status exists (§1 row 4) |
| Visibility | The list carries `dg: { required, ready, problems }`; `GET /rail/consignments/:id/dangerous-goods` returns exactly what the gate sees | |
| Unknown status | `advanceStatus` now rejects an unknown status with a 400 that lists the valid ones (it used to reach Prisma and surface as a 500) | |

### 4.6 Frontend

| Surface | Behaviour |
| --- | --- |
| **Possession-conflict banners** | At the top of the Consignments tab (all clashes) and in a consignment's drawer (that consignment's). Red when any is locked, amber when only annual-plan. Consignments that could not be checked are reported, never shown as clear. If the scan cannot be loaded no banner is shown and the page still works |
| **DG badges** | A "Dangerous goods" column (green *DG ready* / red *DG · n gaps* / a dash), a drawer section showing what the gate sees with an edit form, and a UN-number · class pill per flagged wagon. The form sends a blank as `null`, never `""` (the API rejects an empty string); malformed values are explained inline because the API client reduces a 400 to "Validation failed" |
| **Cancel / Reschedule modal (Annexure 20a/20b)** | Opened from a consignment (drawer) **and** from a Daily Handshake report (then also logged there as a deviation). The reason list is the 82 Annexure 20b reasons grouped by who it is allocated to. As the form is filled in, **the server** is asked what follows (`POST /rail/changes/preview`) and its answer is shown verbatim; the modal does not work out attribution, notice band or consequence itself, and **will not submit until the server has answered for the current inputs** |
| **"Changes & Possessions" tab** | Change requests (with IM-acknowledgement clock, row actions, signatory-only *Allocate party*), possession windows (record / complete / cancel, with conflicts reported on save), occurrence reports (notify TCO / Regulator, investigate, file the 48 h report, signatory-only *Close*, overdue flagged) |
| Roles | Buttons follow the API's three tiers: VIEWER sees every register and no control; DISPATCH can log and progress; only MANAGER / COMPANY_ADMIN / ADMIN see *Allocate party* and *Close*. Hiding is courtesy — the routes enforce the same split (`rail.controllers.spec.ts`) |

### 4.7 Findings while implementing Wave 3

| # | Finding | Where | Resolution |
| --- | --- | --- | --- |
| W3-1 | `RailChangeService.proposeAlternative` validated the date **before** the entitlement check and threw synchronously (it was not `async`), so a non-entitled tenant got validation detail and the call did not reject | `rail-change.service.ts` | `async`, entitlement first; convention recorded (public rail service methods are `async` and call `assertEntitled` first); a spec asserts it |
| W3-2 | The global `ValidationPipe` uses `enableImplicitConversion`, which turns the **string `"false"` into `true`** (and `"no"`, `0`-like strings, `{}`) for every `@IsBoolean()` field — including `ReviewDeviationDto.agree`, the TOC's formal *agree / dispute* decision on a deviation, `isPlannedOccupation` (would waive a TRIM refund) and `isDangerousGoods` | all rail DTOs | `@RawBoolean()` (same technique as `@RawString()`): only a real JSON `true` / `false` passes. Tests prove `"false"`, `"true"`, `0`, `1`, `""`, `{}`, `[]` are all rejected on six DTOs |
| W3-3 | `railAuditEntry` spread caller metadata **last**, so a key named `companyId` / `module` / `actorRole` overwrote the built-in. The diagnostics endpoint scopes audit rows by `metadata.companyId`, so a future `{ ...dto }` could have forged the tenant | `rail-audit.ts` | built-ins spread last; test proves a caller cannot override them. No current caller did |
| W3-4 | `PATCH /rail/consignments/:id` with an explicit `isDangerousGoods: null` would have written NULL to a NOT NULL column (a 500) | `rail.service.ts` `update` | a null flag means "not sent"; test added |
| W3-5 | `advanceStatus` with an unknown status reached Prisma and surfaced as a 500 | `rail.service.ts` | 400 listing the valid statuses |
| W3-6 | The API client keeps only `message` from an error body, so every validation failure reads "Validation failed" | `frontend/src/api/client.ts` | not changed (shared); the new forms validate formats client-side with the backend's patterns and say why |
| W3-7 | The fake used by earlier specs returned `undefined` for a nullable column that was never written; Postgres returns `NULL`. It hid a difference between the fake and the database | `test/support/in-memory-db.ts` users | the Wave 3 fakes pass column defaults (`defaults: () => ({ … null … })`) |
| W3-8 | Pre-existing test harness: `useToast: () => ({ showToast: vi.fn() })` returns a **new** function every render, and `RailOperations.load` depends on it, so under test the page reloaded forever (and logged ~19 `act()` warnings). Production's `showToast` is a stable `useCallback`, so the app was not affected | `RailOperations.test.tsx` | the mock is stable now; the warnings are gone |
| W3-9 | The 24-hour emergency-contact pattern rejected a number written `(011) 555 0100` (a leading bracket) | `rail-dangerous-goods.ts`, both DTOs, the UI mirror | an optional opening bracket is accepted; tests added on all four |

### 4.8 Verification (Wave 3)

| Check | Baseline `03b181a` | After Wave 1 | After Wave 2 | After Wave 3 |
| --- | --- | --- | --- | --- |
| Backend `npx jest` | 20 suites / 307 tests | 23 / 479 | 32 / 797 | **43 suites / 1410 tests**, all pass |
| Backend `tsc --noEmit`; `npm run build`; `eslint "src/**/*.ts"` | pass; pass; — | pass; pass; 0 | pass; pass; 0 | pass; pass; **0 problems** |
| Frontend `vitest run` | 8 files / 59 tests | 10 / 131 | 13 / 183 | **19 files / 359 tests**, all pass |
| Frontend `tsc`; `npm run lint`; `vite build` | pass; 0 errors; — | pass; 0 errors; pass | pass; 0 errors; pass | pass; **0 errors**; pass |
| Migration tooling (§4.1) | — | — | 3 migrations | 4 migrations; **0 differences / 141 tables**; destructive none |
| Operator seeder, run end-to-end against a stand-in database (`--plan` writes nothing; `--apply`; a second `--plan` is a no-op) | — | — | — | 6 corridors + 82 cancellation codes; a deactivated code stays deactivated; a changed party is reported |

New backend suites in Wave 3: `rail-change.rules` (52), `rail-possession.rules` (17), `rail-dangerous-goods` (50),
`rail-change.service` (73), `rail-possession.service` (44), `rail-occurrence.service` (48), `audit/audit.service` (11),
`dto/rail-change` (47), `dto/rail-possession` (20), `dto/rail-occurrence` (37), `dto/rail-dangerous-goods` (126).
Extended: `rail.service` (24 → 64, the gate and the readiness summary), `rail.controllers` (59 → 87: every new route, the
signatory exceptions, the read-only `preview`, **no route shadowed by an earlier `:id` route**, no duplicate verb+path,
every controller registered in the module), `catalog/seed-rail-reference` (+20).
Frontend: `lib/railChange` (29), `lib/railDangerousGoods` (43), `ChangeRequestModal` (18), `DangerousGoods` (19),
`PossessionConflictBanner` (11), `ChangesPossessionsPanel` (33); extended: `RailOperations` (5 → 19), `RailHandshake` (9 → 18).

### 4.9 Decisions the owner should confirm (Wave 3)

| # | Decision | Default taken |
| --- | --- | --- |
| D12 | "Rail Operations" in Annexure 20b means the **TOC** side; "Infrastructure Manager" means **TRIM** | as stated; the annexure does not say it in so many words |
| D13 | A request raised by TRIM whose reason is allocated to the TOC (or the reverse) | **flagged** with a warning, not blocked |
| D14 | The consequence table of §4.2 is the register's R-013.3 (Annexure C unsupplied) | encoded and labelled unverified; not legal advice; no amounts |
| D15 | Possession lock of 60 days; HARD vs PLANNED severity; conflicts are advisory | as §4.3 — a conflict never blocks a booking |
| D16 | The 48-hour preliminary-report deadline, and who may close an occurrence | `occurredAt + 48 h` (R-015.5); signatories only |
| D17 | Dangerous-goods field formats and the gated statuses | UN / IMDG conventions; `DEPARTED`, `IN_TRANSIT`, `AT_INTERCHANGE` |
| D18 | Signatory-only acts added in this wave | *Allocate party* (decides who pays) and *Close occurrence* |
| D19 | Seeding the 82 reasons | `isActive` is **operator-owned** (never written on update; a deactivated code is never revived — it is reported); any change to a code's responsible party is reported before it is applied |

<!-- Wave 4 (§5) is appended below as it is completed. -->

## Appendix A — generated code index

<!-- BEGIN GENERATED: annexure-code-index — do not edit; run `docs/tools/render-annexure-captures.ts` -->

**A.1 Annexure 20b cancellation codes** (82)

| Code | Cancellation reason | Responsible party (as printed) |
| --- | --- | --- |
| CNX-001 | Abnormal working / yard | Rail Operations |
| CNX-002 | Animal hit by train | Force Majeure |
| CNX-003 | Assets Fire Damage | Could be Force Majeure, Infrastructure Manager or Rail Operations |
| CNX-004 | Auxiliary equipment related | Rail Operations |
| CNX-005 | Averted collision | Rail Operations |
| CNX-006 | Bridge collapsed | Infrastructure Manager |
| CNX-007 | Broken axle | Rail Operations |
| CNX-008 | Broken rail | Infrastructure Manager |
| CNX-009 | Cable Theft | Infrastructure Manager |
| CNX-010 | Carriage & Wagons related | Rail Operations |
| CNX-011 | Collision | Rail Operations |
| CNX-012 | Community unrest | Force Majeure |
| CNX-013 | Container / Container Terminal Related | Rail Operations |
| CNX-014 | Covid-19 | Force Majeure |
| CNX-015 | Crew issues | Rail Operations |
| CNX-016 | CTC / Train Authorisation related | Infrastructure Manager |
| CNX-017 | Customer-related | Rail Operations |
| CNX-018 | Dangerous Goods / Environmental Spillage and Leakage related | Rail Operations |
| CNX-019 | Derailment | Could be Force Majeure, Infrastructure Manager or Rail Operations |
| CNX-020 | ECP failure | Rail Operations |
| CNX-021 | Electrical Substation related | Infrastructure Manager |
| CNX-022 | Emergency brake application | Rail Operations |
| CNX-023 | EOT Device / Telemeter Failure | Rail Operations |
| CNX-024 | Eskom related issues / Power Failure | Infrastructure Manager |
| CNX-025 | Hook-up | Could be Infrastructure Manager or Rail Operations |
| CNX-026 | ICTM / System / Network-related | Could be Infrastructure Manager or Rail Operations |
| CNX-027 | Industrial Action | Could be Force Majeure, Infrastructure Manager or Rail Operations |
| CNX-028 | Injury / Death of Personnel | Could be Force Majeure, Infrastructure Manager or Rail Operations |
| CNX-029 | ITP not adjusted / ITP related issues | Infrastructure Manager |
| CNX-030 | Kombi issues | Rail Operations |
| CNX-031 | Level Crossing related | Infrastructure Manager |
| CNX-032 | Line obstruction | Infrastructure Manager |
| CNX-033 | Loco await inspection or repair | Rail Operations |
| CNX-034 | Loco battery theft | Rail Operations |
| CNX-035 | Loco failure | Rail Operations |
| CNX-036 | Loco undersupply | Rail Operations |
| CNX-037 | Loco imbalance | Rail Operations |
| CNX-038 | Loco planning | Rail Operations |
| CNX-039 | Loco refuelling | Rail Operations |
| CNX-040 | Municipality related | Infrastructure Manager |
| CNX-041 | No / late Empty Wagon Supply | Rail Operations |
| CNX-042 | No Product | Rail Operations |
| CNX-043 | Non compliance to plans (ITP, YPP) | Rail Operations |
| CNX-044 | Non-supply of Materials | Infrastructure Manager |
| CNX-045 | NWB issues | Infrastructure Manager |
| CNX-046 | OBC-related failures | Rail Operations |
| CNX-047 | Occupations related | Infrastructure Manager |
| CNX-048 | OHTE related | Infrastructure Manager |
| CNX-049 | On-Track Machines Related | Infrastructure Manager |
| CNX-050 | Over- / Skew Loading | Rail Operations |
| CNX-051 | Overborder issues | Infrastructure Manager |
| CNX-052 | Pandroll springs theft | Infrastructure Manager |
| CNX-053 | Perway related | Infrastructure Manager |
| CNX-054 | Point Theft | Infrastructure Manager |
| CNX-055 | Point failure | Infrastructure Manager |
| CNX-056 | Points ran through | Rail Operations |
| CNX-057 | Port issues (TPT) | Infrastructure Manager |
| CNX-058 | Port windbound | Force Majeure |
| CNX-059 | PRASA issues | Infrastructure Manager |
| CNX-060 | Product Contamination | Rail Operations |
| CNX-061 | Radio / TDU failure | Rail Operations |
| CNX-062 | Rail Network related | Infrastructure Manager |
| CNX-063 | Railway Technology related | Infrastructure Manager |
| CNX-064 | Removal of Not-to-Go's | Rail Operations |
| CNX-065 | Rolling Stock Maintenance Related | Rail Operations |
| CNX-066 | Runaway Rail Wagons | Rail Operations |
| CNX-067 | Section Congested | Could be Infrastructure Manager or Rail Operations |
| CNX-068 | Yard / Siding congestion | Could be Infrastructure Manager or Rail Operations |
| CNX-069 | Security related | Infrastructure Manager |
| CNX-070 | Shunting challenges | Rail Operations |
| CNX-071 | SPAD | Rail Operations |
| CNX-072 | Speed Restrictions related | Infrastructure Manager |
| CNX-073 | TE related issues | Rail Operations |
| CNX-074 | Train Robbery | Could be Infrastructure Manager or Rail Operations |
| CNX-075 | Theft | Infrastructure Manager |
| CNX-076 | Vandalism | Could be Force Majeure, Infrastructure Manager or Rail Operations |
| CNX-077 | Wagons related | Rail Operations |
| CNX-078 | Wash away | Force Majeure |
| CNX-079 | Wayside Readers faulty | Infrastructure Manager |
| CNX-080 | Weather | Force Majeure |
| CNX-081 | Weigh Bridge not functioning / not calibrated | Infrastructure Manager |
| CNX-082 | Yard Derailment | Rail Operations |

**A.2 Annexure 40 ancillary service codes** (113 lines)

**Tier 1 — INFRASTRUCTURE ACCESS SERVICES (safety critical and compulsory)** — 7 line(s)

| Code | Service / line | Unit of measure |
| --- | --- | --- |
| ANX40-01 | Yards: Shunting and marshalling services (List of Yards.xlsx) | Per wagon movement (varies per train category: GF <50 wagons; Medium heavy >50 <100; heavy >100) |
| ANX40-02 | Inland terminals: Handling of containerized cargo for modal transfers from road to rail (List of Terminals.xlsx) | Per container handled |
| ANX40-03 | Radio network (Trunk & Open Channel): Radio support services for compulsory onboard train communications | Per Radio (monthly subscription) |
| ANX40-04-01 | 4. Radio & Telemeter Compliance Testing and Acceptance Support | Per Device |
| ANX40-04-02 | 4. Radio & Telemeter Programming and Configuration Support | Per Device |
| ANX40-04-03 | 4. TOC Radio Onboarding and Activation | Per radio |
| ANX40-04-04 | 4. Train Radio Box and locomotive handset installation and commissioning | Per locomotive |

**Tier 2 — RAIL CRITICAL SUPPORT SERVICES** — 4 line(s)

| Code | Service / line | Unit of measure |
| --- | --- | --- |
| ANX40-05 | Track and trace data | Per month |
| ANX40-06 | Rolling stock condition data | Per month |
| ANX40-07 | Locomotive pantograph monitoring data | Per loco per month |
| ANX40-08 | Evaluation of new rolling stock | Per certificate (certificate for each wagon/loco) |

**Tier 3 — OPTIONAL RAIL SUPPORT SERVICES** — 17 line(s)

| Code | Service / line | Unit of measure |
| --- | --- | --- |
| ANX40-09 | Engineering and technical reviews of rail related project proposals | Per hour |
| ANX40-10 | Weigh bridge calibration test train rental (wagons) | Per wagon per hour |
| ANX40-11 | Business case reviews and support | Per hour |
| ANX40-12 | Weigh bridge repair, calibration and validation | Per certificate (1 certificate per weighbridge) |
| ANX40-13 | Rail construction consultancy | Per hour |
| ANX40-14 | Rail infrastructure specifications | Subscription Per annum (Fee covers all revisions in that year) |
| ANX40-15 | Private siding inspections | Per inspection |
| ANX40-16 | Applications for new or upgraded level crossings | Per application |
| ANX40-17 | Quality assurance, testing and commissioning | Per certificate |
| ANX40-18 | Rental of cabooses | Per caboose/day |
| ANX40-19 | Electrical network capacity analysis | Per request |
| ANX40-20 | Electrical protection review and issuing settings | Per application |
| ANX40-21 | OHTE mechanized condition assessments | Per run |
| ANX40-22 | Technical investigations | Per request |
| ANX40-23 | Pantograph and roof equipment inspection | Per locomotive |
| ANX40-24 | Electrical energy performance analysis | Per request |
| ANX40-25 | Electrical Systems and Technology Audits | Per request |

**Tier 4 — NON RAIL SERVICE** — 85 line(s)

| Code | Service / line | Unit of measure |
| --- | --- | --- |
| ANX40-26-01 | 26. Installation of dark optical fibre cables NLD (50-1000km) for Leasing | Per installation (once off) |
| ANX40-26-02 | 26. Leasing of dark optical fibre cables NLD (50-1000km) | Per month (usage) |
| ANX40-26-03 | 26. Maintenance of leased fibre links to ensure operational integrity (NLD) 50-1000km | Per km/month |
| ANX40-27-01 | 27. Installation of dark optical fibre cables (Metro) 0-50km for leasing | Per installation (once off) |
| ANX40-27-02 | 27. Leasing of dark optical fibre cables (Metro) 0-50km for leasing | Per month (usage) |
| ANX40-27-03 | 27. Maintenance of leased fibre links to ensure operational integrity (Metro) 0-50km | Per km/month |
| ANX40-27-04 | 27. Digital transmission link with a capacity of 2.048 Mbps (E1) | Per Month (usage) |
| ANX40-27-05 | 27. Synchronous Transport Module level 1 (STM-1) 155.52 Mbps | Per Month (usage) |
| ANX40-27-06 | 27. Synchronous Transport Module level 1 (STM-4) 622.080 Mbit/s or 622 Mbps | Per Month (usage) |
| ANX40-27-07 | 27. Synchronous Transport Module level 1 (STM-16) 2.5 gigabits per second (2,488.320 Mbit/s) | Per Month (usage) |
| ANX40-27-08 | 27. Synchronous Transport Module level 1 (STM-64) 10 Gigabits per second (10 Gbps) | Per Month (usage) |
| ANX40-27-09 | 27. Installation of any single transmission link from the list above | Per link (Once off) |
| ANX40-27-10 | 27. 1 Gbps | Per month |
| ANX40-27-11 | 27. 2,5 Gbps | Per month |
| ANX40-27-12 | 27. 5 Gbps | Per month |
| ANX40-27-13 | 27. 10 Gbps | Per month |
| ANX40-28-01 | 28. Space in Comms Room 3 X 3 | Per room/month |
| ANX40-28-02 | 28. Utilities (electricity) MRC | Per room/month |
| ANX40-28-03 | 28. Site Access | Per site visit |
| ANX40-29-01 | 29. Underground Fiber installation | Per meter |
| ANX40-29-02 | 29. Overhead Fiber installation | Per meter |
| ANX40-30-01 | 30. Enterprise and non-rail radio network access | Per radio/month |
| ANX40-30-02 | 30. UHF/VHF fixed base station and repeater deployment | Per site/project |
| ANX40-30-03 | 30. UHF/VHF handheld and mobile radio service | Per unit |
| ANX40-30-04 | 30. Intrinsically safe radio service | Per unit |
| ANX40-30-05 | 30. Marine VHF communication service | Per unit/site |
| ANX40-30-06 | 30. Radio high-site co-location service | Per site/month |
| ANX40-30-07 | 30. Port terminal wireless and Navis connectivity support | Per terminal/month |
| ANX40-30-08 | 30. Managed Wi-Fi, access point, controller, wireless gateway and associated backhaul services for port operational areas and modern mobile terminals | Per access point/site/month |
| ANX40-30-09 | 30. Narrowband wireless gateway and repeater support for TOC port operations | Per gateway or repeater/month |
| ANX40-31-01 | 31. Dedicated wavelength service | Per wavelength/month |
| ANX40-31-02 | 31. Managed wavelength service | Per wavelength/month |
| ANX40-31-03 | 31. DWDM/OTN managed transport service | Per link/month |
| ANX40-31-04 | 31. Carrier Ethernet service (E-Line/E-LAN) | Per link/month |
| ANX40-31-05 | 31. MPLS/IP VPN service | Per site/month |
| ANX40-31-06 | 31. Microwave radio link service | Per link once off/month |
| ANX40-31-07 | 31. Satellite backhaul service | Per terminal once off plus subscription |
| ANX40-31-08 | 31. Legacy access network service | Per port/link/month |
| ANX40-32-01 | 32. Telecommunications room, rack and outdoor colocation | Per rack/room/m²/month |
| ANX40-32-02 | 32. AC/DC power and battery-backup service | Per connection/month or metered usage |
| ANX40-32-03 | 32. Telecommunications site access service | Per site visit |
| ANX40-33-01 | 33. Lan Point Installations | Per Site |
| ANX40-33-02 | 33. CCTV Installations | Per Site |
| ANX40-34-01 | 34. DMR network access service | TBD |
| ANX40-34-02 | 34. LTE broadband and MCPTT service | TBD |
| ANX40-34-03 | 34. LTE and DMR hybrid interworking service | TBD |
| ANX40-34-04 | 34. DMR and LTE high-site coverage service | TBD |
| ANX40-34-05 | 34. Mission-critical smart device service | TBD |
| ANX40-34-06 | 34. Intelligent NOC and customer service assurance | TBD |
| ANX40-34-07 | 34. Smart port telecommunications and IoT connectivity | TBD |
| ANX40-35-01 | 35. Use of specialist vehicle | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-02 | 35. Use of Fire Engine 3500 litres | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-03 | 35. Use of Water tanker | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-04 | 35. Use of Grass unit | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-05 | 35. Use of Incident Command vehicle / response vehicle | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-06 | 35. Use of First response vehicle | Per call-out (first 30mnts) / Per vehicle per hour |
| ANX40-35-07 | 35. Decanting spade pump | Per unit |
| ANX40-35-08 | 35. Decanting Hetz pump | Per unit |
| ANX40-35-09 | 35. Fire extinguishers (dcp) | Per extinguisher |
| ANX40-35-10 | 35. Alco foam concentrates | Per litre |
| ANX40-35-11 | 35. Oil cap | Per litre |
| ANX40-35-12 | 35. Spillsorb | Per 10 kg bag |
| ANX40-35-13 | 35. Splash suite | Per suit |
| ANX40-35-14 | 35. Scba - Self-Contained Breathing Apparatus | Per unit |
| ANX40-35-15 | 35. Labour - Chief Fire Officer | Per hour |
| ANX40-35-16 | 35. Labour - Senior Fire Officer | Per hour |
| ANX40-35-17 | 35. Labour - Fire Officer | Per hour |
| ANX40-35-18 | 35. Labour - Fire Fighter | Per hour |
| ANX40-35-19 | 35. Water used | Per kl |
| ANX40-36-01 | 36. Maintenance of 4,5 kg DCP Fire Extinguisher | Per extinguisher |
| ANX40-36-02 | 36. Maintenance of 9 kg DCP Fire Extinguisher | Per extinguisher |
| ANX40-36-03 | 36. Maintenance of 5 kg Co2 Fire Extinguisher | Per extinguisher |
| ANX40-36-04 | 36. Maintenance of 9 kg Water Fire Extinguisher | Per extinguisher |
| ANX40-36-05 | 36. Maintenance of 9 kg Foam Water Fire Extinguishers | Per extinguisher |
| ANX40-36-06 | 36. Maintenance of Fire Hose Reels | Per reel |
| ANX40-36-07 | 36. Maintenance of Fire Hydrants | Per hydrant |
| ANX40-37-01 | 37. Supply of Fire equipment Signages (Pair - item and Arrow) | Per pair |
| ANX40-37-02 | 37. Supply and installation of escape signages (Pair - item and Arrow) | Per pair |
| ANX40-38-01 | 38. Provision of Fire Risk Assessment | Per assessment |
| ANX40-38-02 | 38. On site evacuation drills / Simulations and feedback | Per drill/simulation |
| ANX40-38-03 | 38. Rail Route Risk Assessment/Profiling | Per site |
| ANX40-38-04 | 38. Lecture rooms etc. per day or part thereof | Per room per day |
| ANX40-38-05 | 38. Fire training grounds, drill yard, equipment and props etc. for practical fire training/drills and demonstrations per day or part thereof (NEW) | Per day/per hour |
| ANX40-39 | Access to wayleaves | Per application |
| ANX40-40 | Staging | TBD |

<!-- END GENERATED: annexure-code-index -->

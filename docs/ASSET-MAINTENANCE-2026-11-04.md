# Asset maintenance & warranty — the unit, the card, and the promise

Status: **shipped** (2026-11-04). Migration `20261104160000_maintenance_asset_register`.
Backend `src/maintenance/`, frontend `src/pages/Maintenance.tsx`, `src/lib/maintenance.ts`.

---

## 1. Why this exists

Maintenance records hung off a **person**:

```
Driver ──< VehicleService (providerName, invoiceRef, partsReplaced, cost, kmAtService, warrantyExpiry)
```

Every one of those fields is a job card. But the parent is a driver, and that is
wrong twice over:

- **For a haulier**, a mechanic works on a *vehicle*, not on the person who
  happened to be driving it. Replacing a driver silently detaches the history.
- **For terminal equipment** — reach stackers, RTGs, gensets, trailers — there
  is no driver at all. None of it could be recorded, which is why the platform
  had nothing to say about the equipment a contractor maintains for a terminal
  operator.

The deeper problem is commercial. An independent contractor maintains units for
a contract holder, warranty in hand, and gets paid per job. What they cannot do
— with a folder of paper job cards and a WhatsApp thread — is show the contract
holder a *pattern*: this unit, this fault, four times, 31 hours of lost
availability. **One job card proves one job. A pattern funds a decision.**

So this is not a CMMS. It is a record designed to survive being used as
evidence in a commercial conversation.

## 2. The model

```
MaintenanceAsset ──< MaintenanceMeterReading     (append-only meter spine)
       │
       └──< MaintenanceJob ──< MaintenanceJobCost   (parts, labour as rows)
                        │
                        ├──< MaintenanceJobEvent     (append-only history)
                        └──> MaintenanceJob          (priorJobId — the comeback link)

MaintenanceFaultCode ──< MaintenanceJob          (controlled vocabulary, per tenant)
```

Six tables. `companyId` is a plain column on every one (no FK to `Company`),
matching the rest of the schema; isolation is RLS (`app_tenant_guard`) plus the
service's `companyId` filter.

## 3. The decisions, and what each one refuses

### 3.1 Warranty is a number of days, or nothing

`warrantyTermDays INTEGER NULL`. There is no `lifetime` value, and the API
refuses one **by name**:

> A lifetime warranty cannot be recorded, because nothing downstream can price,
> reserve or prove it. Record the term you can stand behind in days — and keep
> the longer promise where it belongs, in the agreement.

Ceiling: 3650 days. Beyond that a term stops behaving like a warranty and starts
behaving like the word "lifetime".

Why this is a refusal and not a feature gap: a database that turns a verbal
promise into a written permanent obligation has manufactured a liability its
operator never priced. The business can still *make* that promise; the record
just will not pretend it is a term.

### 3.2 Warranty position is four-valued

```ts
type WarrantyPosition =
  | 'IN_WARRANTY'
  | 'SERVICE_OVERDUE'
  | 'OUT_OF_WARRANTY'
  | 'UNKNOWN';
```

`UNKNOWN` is returned when no term was recorded, when the card never completed,
or when it was cancelled. Collapsing `UNKNOWN` into `OUT_OF_WARRANTY` would let
the system tell an operator that their own rework is chargeable — a commercial
position no database should take on its own.

`SERVICE_OVERDUE` was added after the first real warranty was described: 30
months, kept alive by **one labour-only service a year**. The term is the
promise; the service is what keeps the promise standing. A record that counted
days only reported `IN_WARRANTY` on a machine nobody had touched in two years —
true to the arithmetic, false to the contract. §3.9 has the rule.

It is deliberately not called "void". Whether a claim is honoured is the
supplier's decision and this record does not get to make it. What it can say is
that the evidence is missing, which is the part the operator can still fix.

The UI never renders `UNKNOWN` as "expired". It says **"Warranty not recorded"**,
and never renders `SERVICE_OVERDUE` as "void" either.

### 3.3 The clock starts at completion, not at sign-off

Sign-off is the custodian's acceptance — a real and separate act, recorded with
a name and a timestamp — but it is not what starts the warranty. A warranty that
never begins because nobody signed a form is worse than one that begins a day or
two early.

### 3.4 Downtime is derived, never typed

`downtimeMinutes` is computed from the card's own timestamps:

- breakdown / recall: `reportedAt → (completedAt ?? now)`
- planned work / inspection: **null** — scheduled unavailability is not lost
  availability, and adding the two together is how an availability figure gets
  flattered
- cancelled: null

The person who benefits from a flattering figure is often the person who would
be typing it.

### 3.5 Availability always carries its basis

`availability(downtime, basis)` returns `{ percent, basisMinutes, downtimeMinutes }`,
and `percent` is `null` when the basis is zero. Never 100% from no data. The page
renders `99.9+%` rather than `100.0%` when a figure rounds up.

### 3.6 A comeback is a link, not a memory

When a new card carries the same fault code on the same unit as an earlier
completed card, it is linked (`priorJobId`) automatically and an event records
whether the earlier job's warranty was still open.

- **Fault codes are required for a match.** Free text does not group, and a
  fuzzy match would invent comebacks that never happened.
- **The link is recorded even out of warranty.** The recurrence is a fact about
  the component or the diagnosis; only the *cost consequence* depends on the
  window.
- The person best placed to notice a comeback is the person whose work it was.
  Asking them to volunteer it is asking a lot, so it is mechanical.

### 3.7 The meter cannot run backwards

`checkMeterReading` refuses a reading lower than the last accepted one and tells
the operator what to do if the instrument was replaced. The alternative —
accepting it — makes every cost-per-hour figure on that unit meaningless.

A **card** may keep a lower reading than the unit's meter (a card written up days
later is normal); the unit's meter simply does not move backwards.

### 3.8 There is no delete

Cancellation is a status with a mandatory reason. The card, its costs and its
events stay. A unit with job cards cannot be renumbered (`assetCode` is locked
once history exists) and cannot be deleted out from under its history
(`ON DELETE RESTRICT`).

### 3.9 The supplier's term is a promise with a condition

Two warranties exist here and they are not the same object:

| | Where it lives | Whose promise | Decided by |
|---|---|---|---|
| **The job warranty** | `MaintenanceJob.warrantyTermDays` | this workshop, on the work it did | completion date + term |
| **The supplier's term** | `MaintenanceAsset.warranty*` | Kalmar, Terex, whoever holds the contract | the term **and** its condition |

Conflating them is how a claim gets made against the wrong party. The job
warranty was in §3.1. The supplier's term is four columns on the unit:

```
warrantySupplier            TEXT NULL     -- named, because a claim needs an addressee
warrantyStartAt             TIMESTAMP    -- delivery or commissioning, not the day it was typed
warrantyTermDays            INTEGER      -- 30 months = 913
warrantyServiceIntervalDays INTEGER      -- 365; the condition, or null for a plain term
```

**What counts as the service.** Completed, non-cancelled `PLANNED` or
`INSPECTION` work on that unit — the same set the verdict excludes from
downtime. Symmetry is not the reason; the reason is that a breakdown is the
machine failing, not the operator attending to it, and a recall is the
supplier's action rather than the operator's compliance. `keepsWarrantyAlive()`
is named separately from `isPlannedWork()` because the two ideas can part
company later — a breakdown visit that also carried out the service would keep
the warranty alive without becoming planned availability.

**The clock.** The service is due at `interval` days after the later of delivery
and the last recorded service. A service performed during commissioning, three
weeks before the term starts, does not buy an extra year.

**The grace.** 30 days (`WARRANTY_SERVICE_GRACE_DAYS`). Annual services have a
tolerance band, and an alarm that fires on the 366th day would be an alarm
nobody keeps. Past the grace, the unit reads `SERVICE_OVERDUE` with the number
of days it is late.

**Order of decision.** Expiry beats condition: past the term there is nothing
left to keep alive, so a three-year-old machine that was never serviced is
`OUT_OF_WARRANTY`, not `SERVICE_OVERDUE`.

**Where it surfaces.** The unit drawer, the fleet table (one query for the
whole page, not one per row), and the verdict, where it is a finding with money
attached: *"2 units are inside a supplier term whose service condition has been
missed — RTG-07 and others. RTG-07 is 47 days past the last date a service would
have kept the cover. A claim today is at the supplier's discretion."*

### 3.10 The fleet figure is not the one anybody acts on

`GET /maintenance/summary` returns `byClass`: every class on the register, with
its own units, availability, open cards, longest current outage, and **the limit
its own class is judged against** (§6).

At 122 machines, "the fleet is at 94%" is a figure that gets reported. "Straddle
carriers 88%, RTGs 99%" is the one that gets a supplier on the phone. The rollup
uses the same downtime arithmetic as the headline — planned work excluded,
clipped to the window — because a class card that disagreed with the headline
would be worse than no class card at all.

Retired units are excluded here for the same reason they are excluded from
availability: nobody expects them to work, and counting them makes every class
they appear in look worse.

## 4. What was deliberately not built

| Not built | Why |
|---|---|
| PM schedules / recurring work orders | A scheduling engine is where maintenance products go to die. It also isn't needed to prove a pattern. |
| Spares inventory | Different problem (stock accuracy), different owner (stores), no bearing on the contract argument. |
| Purchase requisitions | The PO belongs to the contract holder's system, not ours. |
| Offline technician app | Real need, wrong sequence — capture on the existing PWA first, measure whether it is actually painful, then decide. |
| "Lifetime" warranty | See §3.1. |
| Automatic invoice matching | Invoices arrive as refs; matching them is finance's workflow, and a wrong match silently moves money. |

## 5. API

All routes are under `/maintenance` and carry an explicit `@Roles` decision
(`rbac:check` enforces that).

| Method | Path | Access |
|---|---|---|
| GET | `/summary?windowDays=` | all tenant roles (read) |
| GET | `/assets`, `/assets/:id`, `/assets/:id/history` | all tenant roles |
| POST | `/assets` | ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH |
| PATCH | `/assets/:id` | ADMIN, COMPANY_ADMIN, MANAGER |
| POST | `/assets/:id/meter` | + DISPATCH, WAREHOUSE |
| GET/POST | `/fault-codes` | read: all · write: ADMIN, COMPANY_ADMIN, MANAGER |
| GET | `/jobs`, `/jobs/:id` | all tenant roles |
| POST | `/jobs` | ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH, WAREHOUSE |
| POST | `/jobs/:id/start` | ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH, WAREHOUSE |
| POST | `/jobs/:id/complete` | **ADMIN, COMPANY_ADMIN, MANAGER** |
| POST | `/jobs/:id/sign-off` | **ADMIN, COMPANY_ADMIN, MANAGER** |
| POST | `/jobs/:id/cancel` | **ADMIN, COMPANY_ADMIN, MANAGER** |
| POST | `/jobs/:id/costs`, `/jobs/:id/notes` | + DISPATCH, WAREHOUSE |

Completion and sign-off are manager-level because completion sets the warranty
clock and sign-off accepts work on the custodian's behalf. Raising a card is
operational because a card that cannot be raised at the machine gets raised next
week or not at all.

**Payloads that changed with the supplier term.** `POST /assets` and
`PATCH /assets/:id` accept `warrantySupplier`, `warrantyStartAt`,
`warrantyTermDays` (1–3650) and `warrantyServiceIntervalDays` (1–1825). On
`PATCH`, `null` withdraws a term recorded against the wrong unit — a withdrawal,
not a zero.

`GET /assets`, `GET /assets/:id`, `GET /assets/:id/history` and `GET /summary`
now compute a `warranty` standing per unit (`state`, `expiresAt`, `serviceDueAt`,
`serviceGraceEndsAt`, `daysOverdue`, `daysSinceService`, `neverServiced`), and
`GET /summary` additionally returns `byClass` (§6.1) and the metrics
`unitsInTerm` / `unitsServiceOverdue`.

The standing is always computed on read, never stored. A stored boolean would be
wrong the morning after the service that would have kept it right, and nothing
would be there to notice.

## 6. The verdict

`GET /maintenance/summary` returns a sentence, a status and the thresholds that
produced it (`MAINTENANCE_THRESHOLDS`):

| Threshold | Value | Meaning |
|---|---|---|
| `availabilityWarnPercent` | 95 | below this, the fleet's availability is a conversation |
| `comebackWarnPercent` | 15 | share of completed work that repeats earlier work |
| `stalledJobHours` | 48 | a card nobody has started is not "in progress" |
| `longDownMultiple` | 1.5 | a unit is a contract exposure past 1.5× its class's expected repair time |

**Expected repair time is per class, not a flat limit.** A terminal operator
gave us their own timings — five days for an RTG, three for a straddle carrier
— and against the flat 72-hour limit this module originally shipped with, every
RTG repair was flagged for its last two days and every straddle repair was
flagged the moment it was finished. An alarm that fires on correct work trains
the operator to ignore the panel, so the limit became a multiple of the
expectation:

| Class | Expected repair | Flags at |
|---|---|---|
| RTG | 120 h (5 days) | 180 h (7.5 days) |
| Straddle carrier | 72 h (3 days) | 108 h (4.5 days) |
| everything else | 48 h (default) | 72 h — unchanged from before |

Only the two classes with real data are encoded. A guessed expectation would
be a guessed alarm, and `dto/vocabulary-drift.spec.ts` keeps the DTO lists equal
to the schema so a class cannot exist in the database but be unregisterable
through the API.

Findings are sentences with a number and a unit — "RS-014 has been out of
service for 168 hours" — never a bare count. Retired units are excluded from
availability: including them would flatter the number with assets nobody expects
to work.

### 6.1 By class

The same data, grouped by `assetClass`, worst availability first:

| Field | Meaning |
|---|---|
| `units`, `byStatus`, `unitsDown` | what the class consists of, right now |
| `openJobs`, `jobsCompleted` | the work in the window |
| `availabilityPercent`, `downtimeHours` | same arithmetic as the headline, per class |
| `longestDownHours` | the worst current outage in the class |
| `expectedRepairHours`, `longDownLimitHours` | what the class is judged against |

Ordering is availability ascending, then units descending, then label. Two
classes at the same figure are read biggest first, because that is the one with
more money in it.

In the UI this is a band of cards above the register. Each card states its own
limit — "72 h expected repair · flags past 108 h" — so nobody has to learn from
an alarm what the alarm means.

## 7. Test coverage

| Suite | Count | What it pins |
|---|---|---|
| `backend/src/maintenance/maintenance.rules.spec.ts` | 69 | four-valued warranty, the supplier term and its condition, downtime nulls, availability basis, comeback rules, meter integrity, class-aware long-down, the per-class rollup |
| `backend/src/maintenance/maintenance.service.spec.ts` | 41 | tenancy 404s, idempotency, number allocation, auto-linking, `lifetime` refusal, cancel-clears-downtime, planned ≠ lost, unit page maths, a breakdown must not reset the service clock |
| `backend/src/maintenance/dto/maintenance.dto.spec.ts` | 15 | query-string coercion (`"false"` must not become `true`), required fields, `lifetime` rejected at the edge, term/interval bounds, null is how a wrong term is corrected |
| `backend/src/maintenance/dto/vocabulary-drift.spec.ts` | 7 | the DTO vocabularies equal the Prisma enums, in order — a class the schema accepts must be registerable |
| `frontend/src/lib/maintenance.test.ts` | 25 | what the screen may claim: no clean 100%, no invented cost/hour, "not recorded" ≠ "expired" ≠ "overdue"; every class has a label |
| `frontend/src/pages/Maintenance.test.tsx` | 14 | headline, findings, planned ≠ zero downtime, no delete, event trail, capture flow, the class band and its stated limits |

Totals: **132 backend** in the module, **39 frontend**; full suites 2864+ and 1175.

Three notes on the tests themselves, because each one is a defect that a
green suite would otherwise have hidden:

- The service specs use a fake Prisma that resolves `include` **and** `select`
  relations. A fake that only understood `include` let a query silently return
  nothing while the test passed — the assertion was on a value that came from
  the fixture, not from the query.
- The `comebacksOnly` DTO test exists because `@Type(() => Boolean)` coerces
  the string `"false"` to `true`: an unchecked filter returns *fewer* rows and
  looks like an empty queue rather than a bug.
- The page tests wait for settled text rather than the first paint. The headline
  element exists while loading, so asserting on it immediately raced the fetch —
  and chasing that flake is how the green-all-clear-before-data bug surfaced.

## 8. Next, if it earns it

1. **Fault vocabulary from real cards.** The shortlist must come from a
   technician's actual job cards, not be invented here. A guessed vocabulary
   groups nothing.
2. **Photo capture** on the card (the PWA already uploads for ePOD).
3. **The one-page unit report** as a PDF a contractor can send a contract
   holder — the data is already in `/assets/:id/history`.
4. **Migration of `VehicleService`** onto `assetId`, once a tenant has both
   kinds of record and the mapping is unambiguous.

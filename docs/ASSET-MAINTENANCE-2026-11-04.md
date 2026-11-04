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

### 3.2 Warranty position is three-valued

```ts
type WarrantyPosition = 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'UNKNOWN';
```

`UNKNOWN` is returned when no term was recorded, when the card never completed,
or when it was cancelled. Collapsing `UNKNOWN` into `OUT_OF_WARRANTY` would let
the system tell an operator that their own rework is chargeable — a commercial
position no database should take on its own.

The UI never renders `UNKNOWN` as "expired". It says **"Warranty not recorded"**.

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

## 6. The verdict

`GET /maintenance/summary` returns a sentence, a status and the thresholds that
produced it (`MAINTENANCE_THRESHOLDS`):

| Threshold | Value | Meaning |
|---|---|---|
| `availabilityWarnPercent` | 95 | below this, the fleet's availability is a conversation |
| `comebackWarnPercent` | 15 | share of completed work that repeats earlier work |
| `stalledJobHours` | 48 | a card nobody has started is not "in progress" |
| `longDownHours` | 72 | a unit down this long is contractual, not mechanical |

Findings are sentences with a number and a unit — "RS-014 has been out of
service for 168 hours" — never a bare count. Retired units are excluded from
availability: including them would flatter the number with assets nobody expects
to work.

## 7. Test coverage

| Suite | Count | What it pins |
|---|---|---|
| `backend/src/maintenance/maintenance.rules.spec.ts` | 48 | three-valued warranty, downtime nulls, availability basis, comeback rules, meter integrity, verdict thresholds |
| `backend/src/maintenance/maintenance.service.spec.ts` | 33 | tenancy 404s, idempotency, number allocation, auto-linking, `lifetime` refusal, cancel-clears-downtime, unit page maths |
| `frontend/src/lib/maintenance.test.ts` | 17 | what the screen may claim: no clean 100%, no invented cost/hour, "not recorded" ≠ "expired" |
| `frontend/src/pages/Maintenance.test.tsx` | 12 | headline, findings, planned ≠ zero downtime, no delete, capture flow |

The service specs use a fake Prisma that resolves `include` **and** `select`
relations — a fake that only understood `include` let a query silently return
nothing while the test passed.

## 8. Next, if it earns it

1. **Fault vocabulary from real cards.** The shortlist must come from a
   technician's actual job cards, not be invented here. A guessed vocabulary
   groups nothing.
2. **Photo capture** on the card (the PWA already uploads for ePOD).
3. **The one-page unit report** as a PDF a contractor can send a contract
   holder — the data is already in `/assets/:id/history`.
4. **Migration of `VehicleService`** onto `assetId`, once a tenant has both
   kinds of record and the mapping is unambiguous.

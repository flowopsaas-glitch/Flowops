# Driver Portal — modes, duties & the five crafts (2026-10-12)

**Mandate:** "check what driver portal needs — pages, functions, features, security —
switch between truck / bakkie / bicycle / linehaul / train driver. End to end, 100×
better." One portal, five professions: a driver who runs a bakkie this morning and
the linehaul tonight gets exactly the right job — with a hard boundary between them.

## What the portal HAD (audit)

Solid bones: phone + hashed PIN login, **single active session** (token `sid` bound —
a newer login kicks the older device), login audit (IP/UA), spoof-proof identity
(always `req.driver`, never a client-supplied id), a unified work queue (parcels +
collections + inter-branch linehaul manifests), POD capture, GPS pings, driver chat.

**What it lacked:** any notion of *what kind of driver you are this shift*.
`vehicleType` was free-text ("motorbike"). Every driver saw the same flat queue.
A train driver had nothing at all.

## What shipped

### 1. Driver modes — the five crafts (server-driven policy)

| Mode | Work it sees | Reg required | POD | Checklist (examples) |
|---|---|---|---|---|
| 🚲 BICYCLE | parcels, collections | no | signature + photo | phone charge, cold-chain bag |
| 🛻 BAKKIE | parcels, collections | no | signature + photo + scan | straps, spare wheel, COD float |
| 🚛 TRUCK | parcels, collections, **linehaul** | **yes** | signature + photo + scan | weighbridge ticket, DG placards, seals |
| 🔀 LINEHAUL | linehaul only | **yes** | signature + scan | seal numbers, trunk manifest, hub handover |
| 🚆 TRAIN | **rail board only** | **yes** | sign-on only | consist confirmed, possessions checked, guard sign-on |

- `DriverMode` enum + `DriveModeConfig` in **`driver-mode.rules.ts` (pure, 10 tests)**:
  labels, job kinds, POD rules, checklists — one source of truth, served to the UI
  via the API (the UI never invents policy).
- `drivers.allowedModes` (admin permission; empty = all) + `defaultMode`.

### 2. Duties — one shift, one mode, one vehicle

`DriverDuty` (`driver_duties`, migration #14): start a duty = "I am driving X now."
- **Switching craft is the normal flow**: `POST /driver-portal/duty/start` auto-ends
  the previous duty and emits `driver.duty.completed|started` (webhooks, 30 catalog names).
- Heavy modes **demand a vehicle registration** — enforced in rules, service AND UI.
- Duty lifecycle writes shift evidence (started/ended, duration minutes).

### 3. Mode-scoped work — enforced SERVER-side

`GET /driver-portal/work` scopes the job queue by the active duty's mode. The UI
cannot ask for another craft's work. No active duty = full queue (backward
compatible) + `mode: null` so the UI prompts for a shift start.

### 4. The TRAIN driver board — new page

`GET /driver-portal/train-board` (tenant-scoped through `withTenant` — the fortress
pattern): today's **train manifests** (consist: number, route, wagons, departure)
+ **possession windows** in the next 24h (what the track is doing). The driver's
first-class link into the rail chain built in the earlier rounds.

### 5. Frontend — the mode-aware home

- **`DriverShiftBar`** — the craft switcher: five one-tap modes (icons), on-duty
  banner with vehicle + time, "Switch mode", "End shift"; heavy modes open a
  reg prompt first; disallowed modes greyed out. Escape-to-dismiss (design-system ratchet).
- **`DriverDutyHome`** (route `/driver/duty`) — the mode-aware home: shift bar →
  mode checklist + POD rules → scoped today's work → **train board** (TRAIN duty).
- `DriverTrainBoard` — consist + possessions, read-only awareness.
- Config (labels/checklists) is **server-driven** from `GET /driver-portal/modes`.

### 6. Security (the ask, explicit)

| Layer | Status |
|---|---|
| Session | phone + hashed PIN, JWT `type: 'driver'`, **single active session** (`sid` rotation) — existing, kept |
| Identity | always from the verified token (`req.driver`) — never client-supplied — existing, kept |
| **Mode enforcement** | job scoping is **server-side**; heavy modes require vehicle reg in rules + service |
| Tenant isolation | train board runs inside `withTenant` (RLS-enforced); duties carry `companyId` and are covered by the regenerated RLS migration (**112 tables**) |
| Events | duty start/end webhocked for integrators (immutable trail) |

## The ratchets proved themselves mid-build
The **RLS coverage test** went red the moment `driver_duties` (a `companyId` table)
existed without a policy — regenerated to 112 tables. The **design-system
Escape-to-dismiss** guard flagged the new mode picker — fixed properly. Two real
gaps, caught by guards rather than by customers.

## Gates
| | |
|---|---|
| Backend | **2,115/2,115** (70 suites — +10 mode-rule tests) |
| Frontend | **774/774** (33 files — +4 shift-bar tests) |
| tsc / eslint / builds | clean (0 errors) |

## Deploy notes
- Migration `20261012180000_driver_modes_duties` (**14th**) + regenerated RLS
  migration (#13, now 112 tables) ride `./deploy/vps-deploy.sh`.
- New endpoints under `/driver-portal/{modes, duty/start, duty/end, duty/active, work, train-board}`
  — the standalone PWA at driver.flowop.work can adopt them as-is (same auth).

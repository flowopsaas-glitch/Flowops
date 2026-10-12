# Fleet Duty Board — Dispatcher Control Room
**Date:** 2026-10-12 · **Branch:** `arena/a620a55a-flowops` · **Bar:** world class, end to end.

> The fleet at a glance — **who is on duty, in which craft, on which vehicle, for how
> long, carrying what** — and the one control-room override for stuck duties.

---

## 1. What it is

A dispatcher's wall for the whole fleet, built on the driver-duty foundations
(`DriverDuty`, the five crafts, duty start/end from the driver portal):

| Column | Answers |
|---|---|
| Driver | name + tap-to-call |
| Craft | Bicycle · Bakkie · Truck · Linehaul · Train driver |
| Vehicle | duty vehicle reg (falls back to the driver's own) |
| Shift | hours on duty + **fatigue: OK / WARN (8h) / CRITICAL (10h)** with a clock bar |
| Load | open runs in hand · runs landed today |
| State | ON DUTY / OFF |
| Override | **Force end** — two-step confirm, no modal |

Summary strip: on/off duty, open runs, landed today, fatigue warn + critical counts.

## 2. The fatigue rule (platform policy)
`fleet-duty.rules.fatigueLevel`: warn at **8h** continuous duty, critical at **10h** —
an operational mirror of the NDoT hours-of-service envelope. It is a warning light for
the dispatcher, not legal advice. Pure module, pinned by 6 tests.

## 3. The override: force-end
A driver's phone dies mid-shift and the duty stays ACTIVE forever. The dispatcher can
close it: `POST /dispatch/fleet-duty/:dutyId/force-end` —
- CAS `ACTIVE → COMPLETED` (two dispatchers cannot both win),
- note auto-attributed: `"Force-ended by <name>: <reason>"`,
- `driver.duty.force_ended` outbox event (catalog 30 → **35** today),
- audit row (`driver.duty.force_ended`).
The driver's own end-duty remains the normal path.

## 4. API
- `GET /dispatch/fleet-duty` — `asOf`, `summary` (counts by mode + fatigue + loads),
  `roster[]` (sorted duty-first, heaviest shift first). One query-set: drivers × active
  duties × shipments (open vs delivered-today via `waybill.podDeliveredAt`).
- `POST /dispatch/fleet-duty/:dutyId/force-end {note?}`.

## 5. UI
- `frontend/src/pages/FleetDutyBoard.tsx` — route **`/fleet-duty`** (CORE, next to Driver
  Dispatch; permission `driverDispatch`), tap-to-call links, Escape-clears inline confirm
  (no new modals — the design-system ratchet is untouched).
- 3 FE tests: roster rendering, two-step force-end POST, empty state.

## 6. Test proof
- **Backend:** 2,134/2,134 · 73 suites (new: `fleet-duty.rules` 6 + `fleet-duty.service` 5)
- **Frontend:** 780/780 · 35 files (new: FleetDutyBoard 3)
- tsc/lint clean both sides · both builds pass · no schema change (reuses `driver_duties`)

## 7. Where it sits in today's arc
Driver portal modes (driver side) → **Fleet Duty Board (dispatcher side)** →
Proof & Payments (billing side): the same duty/proof truth, three seats.

# WP3 Precondition — GPS-Validation Plan (Template)

**Status: DRAFT TEMPLATE — not approved, not operator-specific**
**Prepared:** 2026-11-01
**Source:** `docs/WP3-PHASE-A2-EVIDENCE-2026-10-30.md` §1 (BUILD_READY definition), `docs/WP3-PHASE-A2-ZW-PROSPECT-2026-10-30.md` §1

## Purpose

Define the template for an operator-specific GPS-validation plan. Each selected crossing needs its own completed plan before it can be BUILD_READY. The plan need not have been executed to be BUILD_READY, but `GPS_VALIDATED` requires actual independently reviewed consented traces.

## Plan template (one per crossing)

### 1. Crossing identification

| Field | Value |
|---|---|
| Crossing ID | e.g. B01 Beitbridge |
| Both national sides | SA → Zimbabwe |
| Registry status | REGISTRY_VERIFIED (E=V, S=V) |
| Location precision | NOT SUFFICIENT for geofence (L=C or U) — needs surveyed gate layout |
| Geofence readiness | NOT_STARTED |

### 2. Operator confirmation

| Field | Value |
|---|---|
| Operator (role-based, no personal name) | |
| Route confirmed by operator? | YES / NO / UNKNOWN |
| Directions operated | Northbound / Southbound / Both |
| Completed trips per month (by direction) | |
| Distinct trucks | |
| Representative period | |

### 3. Trace availability

| Field | Value |
|---|---|
| GPS/trace availability | yes / no / unknown |
| Device type | |
| Sampling interval | |
| Consent status | not obtained / obtained / pending |
| Access constraints | |
| Retention period | |

### 4. Validation scope

| Case | Included? | Notes |
|---|---|---|
| Entry traces | | |
| Exit traces | | |
| Queue traces | | |
| Bypass traces | | |
| GPS gap cases | | |
| Offline clock behavior | | |
| Negative cases (not at border) | | |

### 5. Consent, privacy and retention

| Field | Value |
|---|---|
| Consent obtained from | |
| Consent channel | |
| Retention period (days) | |
| Data minimization applied | YES / NO |
| Driver-link nulling after retention | YES (90 days default, configurable downwards) |
| Audited reads enabled | YES |
| Cross-tenant sharing permitted | NO (until G4 privacy approval) |

### 6. Validation ownership

| Field | Value |
|---|---|
| Validation owner (role) | |
| Sign-off authority | |
| Target sign-off date | |

### 7. Build-readiness checklist

All must be YES for BUILD_READY:

- [ ] Official existence confirmed (E=V)
- [ ] Crossing sequence confirmed (S=V)
- [ ] Location precise enough for proposed two-sided gate/approach geometry
- [ ] Operator-confirmed route and direction
- [ ] Operator-specific GPS-validation plan completed (this document)
- [ ] Consent and privacy controls documented
- [ ] Validation owner and sign-off named

**GPS_VALIDATED** (separate, higher bar): actual consented traces independently reviewed and documented site review complete. Not required for BUILD_READY.

## Crossings selected for plan (pending your approval)

None selected yet. Recommended candidates based on existing seeded geofence data in `backend/src/driver-safety/safety-zones-data.ts`:
- Beitbridge (SA side) — 3 km geofence already seeded
- Beitbridge (ZW side) — 3 km geofence already seeded  
- Chirundu — 2 km geofence already seeded

**These have geofence concepts but NOT validated gate locations.** The seeded coordinates are candidate references, not validated dwell boundaries.

**This template requires your approval before being sent to any operator.**

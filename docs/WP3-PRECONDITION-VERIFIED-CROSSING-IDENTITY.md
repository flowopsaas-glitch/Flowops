# WP3 Precondition — Verified Crossing Identity

**Status: DRAFT — not approved**
**Prepared:** 2026-11-01
**Source:** `docs/WP3-PHASE-A2-EVIDENCE-2026-10-30.md`, `docs/WP3-PHASE-A2-ZW-PROSPECT-2026-10-30.md`, `docs/WP3-SADC-REGISTRY-AUDIT-2026-10-30.md`

## Purpose

Define which border crossings / maritime gateways have verified official identity (existence E=V and crossing sequence S=V) for the defined scope, independent of location precision, operating model, and geofence readiness. This is **registry identity**, not build readiness. A crossing can be REGISTRY_VERIFIED and still not be BUILD_READY.

## Dimension model (from Phase A2)

| Dimension | Meaning | Values |
|---|---|---|
| E (Existence) | Official existence of the crossing/corridor/gateway | V / C / X / U |
| S (Sequence) | Authoritative ordered crossing sequence (two national sides, reversible) | V / C / X / U |
| L (Location) | Sufficiently precise truck-gate/approach location | V / C / U |
| O (Operating model) | Current one-stop/two-stop/port-gate model | V / U |
| G (Geofence readiness) | NOT_STARTED / PROPOSED_UNVALIDATED / GPS_VALIDATED |

**REGISTRY_VERIFIED = E(V) AND S(V)** for the defined record/variant only, independent of L, O and G.
**BUILD_READY** additionally requires: (3) location precise enough to propose gate/approach geometry, and (4) an operator-specific GPS-validation plan.

## REGISTRY_VERIFIED records (15 total)

### From Phase A2 original review (9 records)

| ID | Crossing / gateway | Scope | E | S | REGISTRY_VERIFIED | BUILD_READY |
|---|---|---|---|---|---|---|
| C01 | NSC variant: Durban → Beitbridge → Chirundu → Kasumbalesa | Crossing variant | V | V | YES | NO (L=U, no GPS plan) |
| C02 | Maputo variant: Gauteng → Lebombo/Ressano Garcia → Maputo | Crossing variant | V | V | YES | NO (L=U, no GPS plan) |
| B01 | Beitbridge: SA → Zimbabwe | Crossing | V | V | YES | NO (L=C, conflicted O, no GPS plan) |
| B02 | Lebombo → Ressano Garcia: SA → Mozambique | Crossing | V | V | YES | NO (L=C, O=U, no GPS plan) |
| B03 | Skilpadshek → Pioneer Gate: SA → Botswana | Crossing | V | V | YES | NO (L=U, O=U, no GPS plan) |
| B04 | Groblersbrug → Martin's Drift: SA → Botswana | Crossing | V | V | YES | NO (L=U, O=U, no GPS plan) |
| B05 | Oshoek → Ngwenya: SA → Eswatini | Crossing | V | V | YES | NO (L=U, O=U, no GPS plan) |
| G02 | Mauritius → Port Louis maritime gateway | Gateway endpoint | V | V | YES | NO (road gate unknown) |
| G03 | Seychelles → Port Victoria / Mahé Quay | Gateway endpoint | V | V | YES | NO (road gate unknown) |

### From Phase A2 ZW prospect update (6 additional)

| ID | Crossing / gateway | Scope | E | S | REGISTRY_VERIFIED | BUILD_READY |
|---|---|---|---|---|---|---|
| M01 | Chirundu: Zimbabwe ↔ Zambia | Crossing | V | V | YES | NO (L=C, O=U, no GPS plan) |
| M02 | Nakonde/Tunduma: Zambia ↔ Tanzania | Crossing | V | V | YES | NO (L=CONFLICTED, O=U, no GPS plan) |
| M03 | Mwami/Mchinji: Zambia ↔ Malawi | Crossing | V | V | YES | NO (L=CONFLICTED, O=U, no GPS plan) |
| M04 | Kasumbalesa: Zambia ↔ DRC | Crossing | V | V | YES | NO (L=C, O=U, no GPS plan) |
| N02 | Nyamapanda/Cuchamano: Zimbabwe ↔ Mozambique | Crossing | V | V | YES | NO (O=U, no GPS plan) |
| N04 | Kazungula Bridge OSBP: Botswana ↔ Zambia | Crossing (BW↔ZM only) | V | V | YES | NO (O=U, no GPS plan) |

## NOT REGISTRY_VERIFIED (excluded from cross-tenant scope until resolved)

| ID | Reason |
|---|---|
| C03 | E=V, S=C — sequence incomplete, relationship to C19 unresolved |
| C04–C20 | E=C or S=C/U — insufficient authoritative sequence |
| B06–B08 | S=C — counterpart and sequence unconfirmed |
| G01, G04–G06 | E=C — port authority confirmation needed |
| N01 | E=CANDIDATE, S=CANDIDATE — pending current authority review |
| N03 | E=CANDIDATE, S=CANDIDATE — feasibility only, not operating |

## Naming conflicts (preserved, not resolved)

| Conflict | Description | Disposition |
|---|---|---|
| C03 / C19 | Dar es Salaam vs Central Corridor — institutional evolution, not demonstrated route identity | Hold both, relationship CONFLICTED/UNRESOLVED |
| C17 | Mulanje vs Malanje/Malange — different printed versions | Preserve all variants, request SADC clarification |
| B01 operating model | SADC [C] calls OSBP; SADC [K] says OSBP should be implemented | Display UNKNOWN, not a dwell blocker |

## What "verified" means for cross-tenant visibility

A REGISTRY_VERIFIED crossing means:
- Official existence is confirmed by an authoritative source
- The two-country crossing sequence is confirmed (reversible)
- It is **not** verified for: precise truck-gate location, current operating model, geofence boundaries, or operator usage

## Next decision needed

Select which REGISTRY_VERIFIED crossings enter the pilot pool for GPS-validation planning (G3). Candidates based on existing geofence data in `backend/src/driver-safety/safety-zones-data.ts`: Beitbridge (SA side, ZW side), Chirundu. Other crossings require new location evidence before they can be considered.

**This document requires your approval before any crossing is selected for the pilot pool.**

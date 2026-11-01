# WP3 Precondition — Privacy Approval Framework (Draft)

**Status: DRAFT — not approved**
**Prepared:** 2026-11-01
**Source:** `docs/WP3-SADC-BORDER-DWELL-PLAN-2026-10-30.md` §4, `docs/SAFETY-INCIDENT-LAYER-DESIGN-2026-10-29.md` §7 (WP4 privacy principles)

## Purpose

Define what cross-tenant journey data can be shared, under what consent model, with what retention and audit boundaries. This is the gate that must clear before any cross-tenant visibility code (WP3 Stage 0+) is written.

## WP4 §7 privacy principles (inherited by WP3)

| Principle | Application to WP3 |
|---|---|
| Store the minimum | BorderDwellSession stores two timestamps + state + counts — NOT coordinates, NOT a track |
| Null coordinates on retention sweep | driverId and vehicleReg nulled after 90 days (configurable downwards only) |
| RLS ENABLE + FORCE + tenant_isolation | Every new tenant-owned table gets `app_tenant_guard("companyId")` policy |
| Audit every read of raw position | `border_dwell.session_read` audited, including dispatch reads |
| Nothing crosses tenant boundary | Aggregates are tenant-scoped; cross-tenant sharing requires explicit consent |

## Where WP3 deliberately exceeds WP4 §7

| WP4 §7 commitment | WP3 proposal | Exception needed |
|---|---|---|
| "No new position store" | `BorderDwellSession` — two timestamps per crossing, tied to driver/vehicle/post | **YES** — explicit approval required |
| "No breadcrumb table" | Session state (CLOSED/OPEN/GAPPED) is position-derived but not a track | **YES** — explicit approval required |

## Cross-tenant data classification

| Data class | Can cross tenant boundary? | Consent required? | Audit? |
|---|---|---|---|
| Journey reference + status (own tenant) | No (stays in-tenant) | N/A | Yes (existing audit) |
| Dwell session aggregate (own tenant, n≥5) | No (stays in-tenant) | N/A | Yes |
| Dwell session (other tenant's driver at shared post) | **Only with explicit operator consent** | YES — per crossing, per operator | YES — every read |
| Raw GPS positions | NEVER | N/A | N/A |
| Driver identity linked to session | Nulls after 90 days retention | YES | YES |
| Vehicle registration linked to session | Nulls after 90 days retention | YES | YES |

## Consent model

1. **Per-crossing consent** — Operator A must consent to share dwell data about their trucks at Crossing X with Operator B
2. **Per-direction consent** — Northbound and southbound can be consented separately
3. **Revokable** — Consent can be withdrawn; data sharing stops immediately, historical aggregates retained but not refreshed
4. **Role-based contacts only** — No personal names or driver identities recorded in consent records

## Retention model

| Data | Retention | After retention |
|---|---|---|
| BorderDwellSession (with driver/vehicle link) | 90 days (configurable downwards) | driverId, vehicleReg nulled; session + post + state + duration + aggregates survive |
| Consent records | Indefinite (until revoked) | N/A |
| Audit logs | 90 days | N/A |
| Aggregates (median/P90/n per post) | Indefinite | Tenant-scoped only |

## Cross-tenant sharing rules

1. No data crosses tenant boundaries without explicit, revocable operator consent
2. Consent is recorded as a tenant-scoped record with: granting operator, receiving operator, crossing, direction, consented_at, revoked_at (nullable)
3. All cross-tenant reads are audited with actor, timestamp, crossing, direction
4. Aggregates shared cross-tenant must meet n≥5 suppression threshold
5. Raw positions never cross tenant boundaries

## Approval needed

| Item | Approver | Status |
|---|---|---|
| Privacy framework (this document) | Legal + Product | ⬜ Pending |
| Cross-tenant sharing consent model | Legal | ⬜ Pending |
| Retention policy (90-day default) | Legal + Product | ⬜ Pending |
| Audit requirements for cross-tenant reads | Security | ⬜ Pending |

**This document requires approval before any cross-tenant visibility code is written.**

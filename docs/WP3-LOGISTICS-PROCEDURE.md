# WP3 Logistics Procedure — Cross-Tenant Journey Visibility

**Status: IN PROGRESS**
**Prepared:** 2026-11-01
**Branch:** `arena/0a78f74d-flowops`
**WP2 status:** CI green, PR #456 open & unmerged (merge on your go-ahead only)

## Purpose

Define the end-to-end procedure for building cross-organization journey visibility (terminal → rail operator → haulier → forwarder) as World-Class WP3, with all preconditions cleared before any cross-tenant code is written.

## Gate structure

| Gate | What must be true | Owner | Status |
|---|---|---|---|
| G1 | WP2 CI green, all tests pass, PR #456 ready for review | Engineering | ✅ Green |
| G2 | Verified crossing identity model documented | Product + Engineering | ✅ Drafted (awaiting approval) |
| G3 | GPS-validation plan documented per selected crossing | Product + Operator | ✅ Template drafted (awaiting crossing selection) |
| G4 | Privacy approval for cross-tenant data sharing | Legal + Product | ✅ Drafted (awaiting approval) |
| G5 | Operator "GO WP3" + approved pilot corridor list | You (product decision) | ⬜ Pending |
| G6 | Cross-tenant visibility code built & CI green | Engineering | ❌ Blocked on G2–G5 |
| G7 | PR #456 merged | You | ⬜ Your decision |

**Rule:** No cross-tenant code (Stage 0+ in WP3 Build Plan) is written until G2–G5 are complete. G2–G4 are documentation/decision artifacts — drafted and awaiting your approval.

## Parallel tracks

| Track | What | Status |
|---|---|---|
| Track A | WP2 finalization (PR #456 ready, waiting for merge) | ✅ Done — CI green |
| Track B | WP3 preconditions G2–G4 (docs drafted) | ✅ Drafted — awaiting your approval |
| Track C | Cross-tenant visibility code (WP3 Build Plan stages 0–6) | ❌ Blocked — needs G2–G5 approval first |

## Documents drafted (awaiting your approval)

1. `docs/WP3-PRECONDITION-VERIFIED-CROSSING-IDENTITY.md` — 15 REGISTRY_VERIFIED crossings identified, naming conflicts preserved, BUILD_READY criteria defined
2. `docs/WP3-PRECONDITION-GPS-VALIDATION-PLAN.md` — Operator-specific GPS-validation plan template (trace availability, consent, retention, validation owner)
3. `docs/WP3-PRECONDITION-PRIVACY-APPROVAL.md` — Cross-tenant data classification, consent model, retention model, sharing rules

## References

- `docs/WP3-PHASE-A2-EVIDENCE-2026-10-30.md` — dimensional evidence model (E/S/L/O/G)
- `docs/WP3-PHASE-A2-ZW-PROSPECT-2026-10-30.md` — ZW prospect operator (prospective only, not a tenant)
- `docs/WP3-SADC-REGISTRY-AUDIT-2026-10-30.md` — Phase A registry (superseded confidence model)
- `docs/WP3-SADC-BORDER-DWELL-PLAN-2026-10-30.md` — WP3 build plan (GATED, 10 decisions needed)
- `docs/FLOWOPS-END-TO-END-JOURNEY-DESIGN-2026-10-31.md` — WP2 journey design
- `backend/src/db/rls-policy-coverage.spec.ts` — RLS policy coverage test

## Constraints (standing)

- ZW prospect operator is prospective only — not a tenant, not a customer
- No `rail-source-check/` touches
- No deploy, host, secrets, GHCR
- PR #456 stays open and unmerged until you say so
- WP3 preconditions (verified crossing identity, GPS-validation plan, privacy approval) must clear before cross-tenant code
- WP4 has a separate approval requirement

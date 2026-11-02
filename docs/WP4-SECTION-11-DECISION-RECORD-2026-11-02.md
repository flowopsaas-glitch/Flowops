# WP4 §11 Decision Record — Written Approval

**Date:** 2026-11-02  
**Branch:** `arena/b50d013c-flowops` (commit `26af8c2`)  
**Design doc:** `docs/SAFETY-INCIDENT-LAYER-DESIGN-2026-10-29.md` §11  
**Status:** APPROVED — operator written approval recorded 2026-11-02  
**Related PR:** #457 (WP3 Stage 5 — open, mergeable, CI blocked on environmental Prisma issue)

Per the design doc: *"Until these are answered in writing, nothing is built."*  
WP3 Stage 5 code is complete end-to-end and committed; WP4 itself remains unbuilt pending these approvals.

---

## Decision items

### 1. Claim/zone split (§2) — what happens to existing `COMMUNITY` zones

**Question:** Leave existing `COMMUNITY` zones created by `reportDangerZone()` ACTIVE with honest provenance, or expire them and make dispatch re-confirm?

**Recommendation:** **Leave ACTIVE with honest provenance.**  
Rationale: Existing zones are already in production use; expiring them silently would remove active safety coverage without a replacement. Honest provenance (source: `reportDangerZone`, created-at, actor) makes them auditable. Dispatch can re-confirm or expire individual zones over time.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Expire and re-confirm ☐ Other

---

### 2. `reportDangerZone()` behaviour during the build

**Question:** May one-tap `reportDangerZone()` continue creating a permanent, notifying zone during the WP4 build, or should it be changed to incident-only first?

**Recommendation:** **May continue during the build.**  
Rationale: The identity defect (§1) is already resolved on this branch (driver identity from session, tenant-scoped lookups, caller-typed driver name refused, zone report audited against acting user). One-tap-to-zone remains a UX convenience; the claim/zone split in WP4 will layer verification on top without removing the existing path.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Fix first (incident-only, no zone) ☐ Other

---

### 3. Identity defect (§1)

**Status:** **Resolved 2026-10-30** on this branch — no decision needed.  
Identity now comes from the session; both driver lookups are tenant-scoped; caller-typed driver name refused; zone report audited against acting user.

**Decision:** None required.

---

### 4. Verification policy (§4)

**Question:** Is dispatch-confirm alone acceptable, or must a `CRITICAL` incident have a second source before drivers are alerted?

**Recommendation:** **Dispatch-confirm acceptable for all severities; `CRITICAL` requires a second source before broadcast.**  
Rationale: Dispatch-confirm keeps time-to-alert low for the common case. Requiring a second source for `CRITICAL` prevents a single erroneous report from triggering tenant-wide alerts on the most severe incidents. The answer changes the UI (verificationMethod field) and time-to-alert.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Dispatch-confirm for all ☐ Second source for all severities ☐ Other

---

### 5. Radius/TTL table (§6)

**Question:** Default radius/TTL values in the first build, or per-company overrides in the first build?

**Recommendation:** **Defaults in the first build; per-company overrides later.**  
Rationale: Keeps the first build shippable; per-company overrides add schema + UI complexity that can follow once usage patterns are observed.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Per-company overrides in first build ☐ Other

---

### 6. Retention periods (§7)

**Question:** 90 days for report locations, 180 days for alert positions — or shorter?

**Recommendation:** **90 days report locations / 180 days alert positions, configurable per company downwards only.**  
Rationale: Matches WP3's BorderDwellSession retention (90 days driver-link nulling) for consistency; downward configurability lets stricter tenants reduce without schema changes.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Shorter ☐ Other

---

### 7. Abuse handling (§5)

**Question:** Rate limit values, and agreement that reliability counters are dispatch context only, never automatic sanction.

**Recommendation:** **Rate limit: 5 reports per driver per hour; reliability counters are dispatch context only, never automatic sanction.**  
Rationale: A per-driver per-hour limit bounds spam without blocking legitimate reports during an active incident. Explicitly decoupling reliability from sanction prevents automated driver discipline from telemetry alone.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Different rate limit ☐ Other

---

### 8. Seeded `SAPS_STATS` zones (§10)

**Question:** Re-label as bundled reference data, keep as-is, or remove?

**Recommendation:** **Re-label as bundled reference data, seeded `<date>`, not a live feed.**  
Rationale: The zones ship with `source: 'SAPS_STATS'` and unknown collection date. Labeling them honestly prevents operators from treating them as current statistics. Removing them would remove out-of-the-box safety coverage for tenants with no zones of their own.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Keep as-is ☐ Remove ☐ Other

---

### 9. Build order

**Question:** Confirm build order: (a) identity fix, (b) incident table + report + dispatch queue, (c) verification + zone creation + expiry sweep, (d) broadcast + targeting, (e) corroboration, (f) KPIs.

**Recommendation:** **Approve as proposed.**  
Rationale: (a) is already complete. (b) changes driver behaviour soonest and is independently shippable. Each stage is gated independently per the design doc's "Each WP phase independently gated" principle.

**Decision:** ☑ Approve as recommended (operator approval 2026-11-02) ☐ Different order ☐ Other

---

## Approval

By signing below, the operator gives written approval for the §11 decision items checked above, authorising WP4 code to build for the approved parts only. WP3 Stage 5 (PR #457) remains gated on CI green + §11 written approval before merge consideration, per standing instruction ("No merge until everything is world-class 100%").

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Operator | Approved | Written approval via Arena chat, 2026-11-02 | 2026-11-02 |
| Independent reviewer | Pending | — | — |

---

**Remaining blockers after §11 approval:**

1. **CI Backend / Schema SQL jobs** — fail at `npx prisma generate` (Prisma engine binaries unreachable from `binaries.prisma.sh`). Environmental, pre-existing, not caused by Stage 5 code. Cannot be mitigated from this sandbox; needs CI network access or acceptance as pre-existing.
2. **PR #456** — remains open for review only (DIRTY head `5c74944`, CI not auto-triggered). Not part of this approval.

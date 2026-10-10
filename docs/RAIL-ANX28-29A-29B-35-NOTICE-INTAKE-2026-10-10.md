# Rail Source Intake — Annexure 28 Handshake, 29a Application Form, 29b Capacity Statement, 35 Dispute Resolution + NS V4 Publication Notice (round 72)

**Date:** 2026-10-10 · **Round:** 72 · **Status:** ingested + surveyed + consolidated into product
User upload commit `3117859` (6 files at repo root) — 5 new + 1 byte-identical re-upload
(Annexure 15 = `e525bb44…`, deduped against `sources/`, not copied). Ref-reset recovery repeated
per STATE.md Round 71 procedure (stash + ff-only).

## The five (all new)

| Doc | SHA-256 | Pages | What it is |
|---|---|---|---|
| **Annexure 28 Daily Handshake Process** | `2bd0263126c935ba2450dc352eef381ea2e1bebbb002f16d6468b91d1d41fa76` | 1 (flowchart) | v2.5 (16 Aug 2024) — 19-step IM↔TOC daily deviation reconciliation: TOMS logging, responsible-party allocation, 08:00 final report, 24→48→72h escalation, RLF → Regulator exit, invoice/guarantee mechanics. E-ANX28-01: source typos preserved ("betwwen", "gurrantee", "externa to Transnet"). |
| **Annexure 29a Network Access Application Form** | `9b53984bbc1d28f331685e549ca0c234b47ed22e3d1ba52af35c04874d2ff014` | 5 | POPIA-noticed form: Applicant information & services required · Train configuration & operating specifications · En-route stoppage points (10 types verbatim). |
| **Annexure 29b Network Capacity Statement (Ver2)** | `9fdfa56de7693e5fbad57e3051408b153af1b74379bc501703207ce2dbf80d83` | 8 | **V3-era** (Network Capacity Statement December 2024; "applicable for the 2024/25 timetable… 2025/26 timetable period") — the predecessor of the Annexure 33 Network Register (June 2026). **E-ANX29B-01 period caveat** applied; 33 supersedes it for V4. Same author (Eric Peete). Not listed in the V4 annexure register. |
| **Annexure 35 TRIM Dispute Resolution Process** | `fdc47f46327bdb19f6336570b8a70675f1bb8ed0abd9ea176749e51fa23b4efb` | 1 (flowchart) | Version 01 (3 Dec 2024) — 22-step customer-dispute escalation: SAP CRM logging → KAM → department SMEs → Head/GM → TRIM CEO → Group COO/GCE → **Rail Regulator (decision final and binding)**. Slot-application disputes excluded (follow "Resolve Applicants Dispute Process" — a separate process, not supplied). E-ANX35-01: "Catergory" typo + step-21 caveat verbatim preserved. |
| **Release of Final NS V4 — Publication Notice (V4-11)** | `de8c506576b156cab7390e68fff0f10711cf7b1c5245071888cdc03affa080e1` | 1 | The 18 Sep 2026 announcement. **Carries the official annual Train Path application timelines** (Table 16 milestone dates, which did not extract from the NS body): Applications 18 Sep–31 Dec 2026 · Assessment 1 Jan–31 Mar 2027 · Notification/Consultation 1 Apr–30 Jun 2027 · Timetable publication & commencement one month before execution. E-NSV4-T16 RESOLVED. |

## Consolidation record

| Artifact | Path |
|---|---|
| Data module | `frontend/src/data/railAccessData.ts` (28 steps 1–19 + purpose + escalation, 29a sections + 10 stoppage types, 29b caveat, 35 steps 1–22, notice timelines) |
| Product page | `frontend/src/pages/RailAccess.tsx` → `/rail/access` (tabs: Timelines & notice · Application · Daily handshake · Dispute resolution) |
| Register | annexure register: 28/29a/35 → delivered; 29b recorded with period caveat |
| Manifest | §4 rows: V4-11 + 28/29a/29b/35 + Anx 15 re-upload dedupe row |

Verification (round 72): `npm ci` · `tsc --noEmit` EXIT 0 · `vite build` EXIT 0 · vitest 749/749 pass.

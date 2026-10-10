# Rail Source Intake — Annexure 20a Cancel/Re-Schedule Process + Annexure 20b Cancellation Reasons (round 71)

**Date:** 2026-10-10 · **Round:** 71 · **Status:** ingested + surveyed + consolidated into product
User upload commit `b8d3fbe` (5 files at repo root). This round also recovered a mid-session git
ref reset (see STATE.md Round 71): local refs had reset to `6426c7f` with the working tree intact;
recovered by stash + `merge --ff-only` to `b8d3fbe` (no `reset --hard`, per standing rule).

## 1. New sources (2)

**Annexure 20a — Cancel or Re-Plan / Re-Schedule TOC Train Process v4**
**File:** `sources/Annexure 20a 2024.09.30_Cancel_or_Re-Schedule_TOC_Train_Process_v4_.pdf`
**SHA-256:** `dafafcf2a2af4abcfc8de4075acc3ab884615b6ed97d7f47cb23c21e3d1810bf` (899,171 bytes · 1 page)
Filename-dated **2024.09.30**; PDF created 5 Dec 2024; author Janis Myburgh (TFR JHB).

- A one-page **swimlane flowchart** with 9 lanes (TOC · IM Planning & Execution Planning/Execution
  Managers · Manager: Customer Service · Yard Operator on behalf of IM · PRASA Over-Border IM /
  Other IM · TRIM any department · TPT/Port Terminal Operator · IM Security). Systems: TEMS/TOMS,
  TOL, Daily Handshake Report Template, designated e-mail per corridor.
- **24 numbered steps** (22 not printed — numbering jumps 21→23, preserved): five request lanes
  (TOC/Yard/TRIM/Port/PRASA), 15-minute cancellation notice rule (step 1), ITP-impact assessment
  and tactical re-planning, >48-hour gate, alternative-slot negotiation, ITP version updates
  (emergency dynamic + 7-day/72-hour/48-hour), pilot services for crews lacking route knowledge,
  cancellation execution + TOC Train Cancellation Notice with reasons and responsible parties,
  staging + security for staged trains. Exit: **TOC Charges and Penalties Process** (links to NS
  V4 Tables 21–22 / §5.2.11).
- Version history as printed: v2 11 Mar 2024 · v3 27 Sep 2024 · v4 30 Sep 2024. Sign-off marker
  "PROCESS SIGN-OFF – TFR Confidential" preserved as delivered.

**Annexure 20b — Main Train Cancellation Reasons allocated to Responsible Parties v1.3**
**File:** `sources/Annexure 20b Cancellation reasons.pdf`
**SHA-256:** `d5774ad4dc21859a39429fe37324a757f544ca5669873ab861cdca34030ff9ba` (513,828 bytes · 1 page)
PDF metadata title: `2023.05.19_Train_Cancellation_Reason_Allocation_to_Responsible_Parties_v1.3.xlsx`
(created 17 Oct 2023) — the PDF is a rendering of that sheet.

- **82 reason → responsible-party rows, verbatim:** Rail Operations 37 · Infrastructure Manager 29 ·
  Force Majeure 6 · "Could be Force Majeure, Infrastructure Manager or Rail Operations" 5 ·
  "Could be Infrastructure Manager or Rail Operations" 5. Mixed attributions preserved exactly —
  never normalised to a single party.

## 2. Re-uploads verified identical (dedupe record)

Three files in commit `b8d3fbe` are **byte-identical re-uploads** of already-tracked sources;
they were removed from the repo root (content preserved in git history at `b8d3fbe`) and were NOT
duplicated into `sources/` (dedupe rule):

| Re-upload (root, `b8d3fbe`) | SHA-256 | Identical to |
|---|---|---|
| `Annexure 33 Capacity Statement (3).xlsm` | `2d3f5915…5a3515b` | `sources/Annexure 33 Capacity Statement (2).xlsm` |
| `Annexure 33_Network Register June 2026 F (2).pdf` | `1e2842cb…68c9fa0` | `sources/Annexure 33_Network Register June 2026 F (1).pdf` |
| `Annexure 33a_NS ver.4 (3).xlsx` | `93b4d449…77745dd5` | `sources/Annexure 33a_NS ver.4 (2).xlsx` |

## 3. Consolidation record

| Artifact | Path | Content |
|---|---|---|
| Data module | `frontend/src/data/railCancellationData.ts` | 24 process steps + 4 decision gates + lanes/systems + 82 reason rows verbatim + version history |
| Product page | `frontend/src/pages/RailCancellation.tsx` | `/rail/cancellations` — process steps grid, decision gates, searchable reason→party table with party filter, penalties cross-link |
| Register update | `frontend/src/data/railStatementData.ts` | annexure register 20a/20b → delivered |
| Manifest | `docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md` §4 | V4-12/V4-13 rows + re-upload dedupe record |

Verification (round 71): `tsc --noEmit` EXIT 0 · `vite build` EXIT 0 · vitest 749/749 pass.

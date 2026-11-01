# WP3 Phase A2 — dimensional evidence and provisional candidate pool

> **Superseded denominator and pool:** See [ZW prospect operator evidence update](WP3-PHASE-A2-ZW-PROSPECT-2026-10-30.md)
> for the reviewed missing crossings, current denominator, identity conflicts, weighting and build gates.
> The former Gauteng-only pool and four-missing-review ledger below are historical.

**Status: review only; no approval sought yet.** This document supersedes the *single-label
confidence and decision conclusions* in `WP3-SADC-REGISTRY-AUDIT-2026-10-30.md`; the earlier
source register and route details remain useful historical research. No code, geofence, migration,
UI, trace collection or build is authorised by this document.

## 1. Confidence model: independent dimensions

Every record has the following independent dimensions, with evidence scoped to the assertion
actually checked. `V` = VERIFIED for that stated scope; `C` = CANDIDATE / partial or historical
support; `X` = CONFLICTED evidence; `U` = UNKNOWN. A current operating model can be `UNKNOWN`
without undermining other dimensions. Source dates are not timestamps of real-world verification.

- **EXISTENCE (E):** official existence of the named corridor, crossing or maritime gateway.
  Historical official recognition is `C` if present existence has not been substantiated; naming
  uncertainty can be `X`. Gateway authority statements are primary evidence for their own ports.
- **SEQUENCE (S):** an explicitly scoped ordered route variant, including country and crossing
  names, supported by an authoritative source. `V` for a named variant does **not** mean every
  branch of a corridor has been enumerated. For a crossing record the scoped sequence is the two
  national sides in one direction, reversible; it does not claim the entire corridor is complete.
  For an island gateway it is the country → named maritime port endpoint, not an invented road
  corridor. Unidentified variants or inapplicable intermediate nodes remain unknown.
- **LOCATION (L):** `U` means no suitably classified location; `C` means a sourced reference point
  with gate identity or accuracy unconfirmed; `V` would mean a traceable, recent and sufficiently
  precise truck-gate/approach layout for a proposal, with datum, accuracy and site owner confirmed.
  Decimal digits do not establish accuracy. Even `V` does not mean GPS validation.
- **OPERATING_MODEL (O):** only a substantiated, current one-stop/two-stop/port-gate model is `V`;
  `U` includes stale, ambiguous or missing current evidence. A conflict is separately explained,
  not resolved by guessing. Do not infer hours, current commercial service or route status from
  identity. `UNKNOWN` does **not** block dwell measurement.
- **GEOFENCE_READINESS (G):** `NOT_STARTED`, `PROPOSED_UNVALIDATED`, or `GPS_VALIDATED`.
  A *concept* for a later geofence is not a configured polygon. `GPS_VALIDATED` requires actual
  consented traces and documented site review, not a point on a map.

**REGISTRY_VERIFIED = E(V) AND S(V)** for the defined record/variant only, independent of L, O
and G. All other records are `REGISTRY_NOT_YET_VERIFIED`. This is a research classification, not
approval of the denominator, build, operational readiness, or real-time status. The old zero count
resulted from requiring existence, sequence, precise location, current operating model and
geofence-related evidence together. **Yes: that was overly restrictive for registry identity.**
This review identifies **9 REGISTRY_VERIFIED records/variants**: C01, C02, B01–B05, G02
and G03. Their exact scope appears below. This
correction is not an assertion that their full corridor networks are complete.

**BUILD_READY** applies only to a selected land crossing and narrowly requires: (1) official
existence, (2) authoritative crossing sequence, (3) location precise enough to propose a gate and
approach-road geometry, including documented coordinate/precision and both-side layout, and (4) an
operator-specific GPS-validation plan: participating fleet/contact, eligible traces and directions,
consent/privacy and retention controls, sample/negative cases, validation owner and sign-off. It
does **not** require that the plan has run or that the operating model is known. It is distinct
from `GPS_VALIDATED` and is not permission to deploy. The common validation protocol in §4 is a
starting template, not yet an agreed operator-specific plan. **No current pool entry is BUILD_READY**
because gate-layout precision and/or an agreed operator plan are absent. No model conflict alone
blocks dwell measurement; Beitbridge's model is displayed `UNKNOWN` and its evidence conflict is
preserved in §4.1.

## 2. Candidate denominator: v0.2, not fixed or approved

This is a named, versioned **source-set union for review**, not an exhaustive SADC/Tripartite
census. Its inclusion rules and exclusions are in the prior audit §1. It retains historical names as
leads until current status is established. Sources and snapshot scope:

| Set | Named primary authority / source and precise extraction | Candidate IDs contributed |
|---|---|---|
| SADC cluster baseline | [SADC Secretariat's 14–15 March 2012 corridor presentation](https://www.mofa.go.jp/mofaj/press/release/24/3/pdfs/0314_06_14.pdf), the 18 numbered eastern/southern/western/north-south cluster names, direct read | C01–C18; WBNL/Trans-Caprivi counted once as C05 |
| Corridor authorities | [Central Corridor TTFA, 21 Jan 2026](https://centralcorridor-ttfa.org/the-central-corridor-and-the-northern-corridor-signs-a-memorandum-of-cooperation-to-promote-efficient-safe-and-sustainable-transport-and-trade-facilitation-within-their-respective-member-states/), explicitly names Central and Northern | C19–C20, with C19/C03 dedup unresolved |
| Tripartite/COMESA | [SADC-hosted Tripartite NSC Palapye–Martin’s Drift procurement, 2014](https://www.sadc.int/procurement-opportunities/rehabilitation-111-km-palapye-martins-drift-road-section-botswana), directly read, establishes Tripartite NSC; [COMESA 2023 border profiling survey, published 2024](https://www.comesa.int/wp-content/uploads/2024/02/Border-Profiling-Survey-Report_-Nov-2023.pdf), directly read contents, explicitly profiles four Zambia crossings | C01, B04; missing records M01–M04 below. This selected source set is **not** an exhaustive Tripartite list. |
| National / SADC selected crossings | [BMA Ports of Entry](https://www.bma.gov.za/ports-of-entry-2/), undated, and source citations in §4; eight selected SA-side leads from Phase A, not all BMA posts | B01–B08; major-commercial inclusion not established for every lead |
| Island gateway leads | Port authority/intergovernmental sources [M–P] in previous audit and §3, six reviewed named gateway leads | G01–G06; Port Mathurin and other ports require a distinct inclusion review |

**v0.2 count ledger:**

| Item | Count | Scope |
|---|---:|---|
| Candidate denominator records | **38** | 20 corridor leads + 12 crossing leads + 6 gateway leads. This is a versioned review union, not a final universe. |
| Reviewed | **34** | C01–C20, B01–B08, G01–G06, each dimension classified in §3. Review does not imply verification. |
| Missing record reviews | **4** | M01 Chirundu (Zambia/Zimbabwe), M02 Nakonde/Tunduma (Zambia/Tanzania), M03 Mwami/Mchinji (Zambia/Malawi), M04 Kasumbalesa (Zambia/DRC): listed in COMESA survey contents, not yet dimensionally reviewed in this pack. |
| Confirmed duplicate aliases consolidated | **1 alias grouping** | WBNL / Trans Caprivi counted as C05 under 2012 SADC; do not infer all historic uses have identical routes. Zero known duplicate rows remain after this consolidation. |
| Potential duplicate record pairs | **1** | C03 Dar es Salaam / C19 Central; do not merge without current institutional and route evidence. |
| Unresolved naming/identity cases | **2 cases** | C03/C19 identity; C17 **Mulanje** in the 2012 cluster list vs **Malanje** on its map. Whether the latter refers to the same entity remains unknown. |

The denominator is **not fixed**: review the full SADC/Tripartite source lists, major-commercial
crossing census and additional island gateways, and reconcile source dates and aliases. The known
four missing records are a lower bound, not a declaration that no other entries are missing. No
percentage coverage is calculated or implied. C01, C19/C20 and the crossing sources are overlapping
source-set evidence, not new duplicate rows.

## 3. Dimensional register of all 34 reviewed records

Read alongside the linked row/source descriptions in the earlier audit §2–4. For compactness the
five dimension labels use the legend above; G is spelled out. `RV` indicates the derived registry
identity status, not build readiness. Each row is traceable to the earlier audit's source keys or
new sources defined in §4.

| ID | Scoped identity / route or endpoint | E | S | L | O | G | RV | Primary evidence / limitation |
|---|---|---|---|---|---|---|---|---|
| C01 | NSC, Durban → Beitbridge → Chirundu → Kasumbalesa variant | V | V | U | U | NOT_STARTED | YES | SADC [C,K] in earlier audit; other branches not fully sequenced. |
| C02 | Maputo, Gauteng → Lebombo/Ressano Garcia → Maputo variant | V | V | U | U | NOT_STARTED | YES | SADC [D] and [R1,R2] below; other variants not certified. |
| C03 | Dar es Salaam Corridor | V | C | U | U | NOT_STARTED | NO | SADC [D]; route and C19 relationship incomplete. |
| C04 | Trans Kalahari | V | C | U | U | NOT_STARTED | NO | [E] indexed 2019–20 route extract; full authoritative route needs review. |
| C05 | WBNL / historical Trans Caprivi | V | C | U | U | NOT_STARTED | NO | WBCG [F]; connection countries supported, crossing order incomplete. |
| C06 | Beira | V | C | U | U | NOT_STARTED | NO | SADC [G]; Mwanza/Zobue link only, full variant not established. |
| C07 | Nacala | V | U | U | U | NOT_STARTED | NO | SADC [A,D]; variant unknown. |
| C08 | Limpopo | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name; current identity and sequence unknown. |
| C09 | Mtwara | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name; route unknown. |
| C10 | Durban–Manzini | C | C | U | U | NOT_STARTED | NO | SADC [A]; country inference, no verified ordered route. |
| C11 | Durban–Maseru | C | C | U | U | NOT_STARTED | NO | SADC [A]; country inference, no verified ordered route. |
| C12 | Durban–Phalaborwa | C | U | U | U | NOT_STARTED | NO | SADC [A] historic cluster label, route unknown. |
| C13 | Trans Orange | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name. |
| C14 | Trans Cunene | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name. |
| C15 | Namibe | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name. |
| C16 | Lobito/Benguela | C | C | U | U | NOT_STARTED | NO | SADC [A,H] historical project/countries, route variants unknown. |
| C17 | Mulanje / possibly Malanje | X | U | U | U | NOT_STARTED | NO | SADC [A] inconsistent cluster/map labels; identity unresolved. |
| C18 | Bas Congo | C | U | U | U | NOT_STARTED | NO | SADC [A] historic name. |
| C19 | Central Corridor | V | C | U | U | NOT_STARTED | NO | CCTTFA [I], countries/ports supported, sequence and relationship to C03 unresolved. |
| C20 | Northern Corridor | V | C | U | U | NOT_STARTED | NO | CCTTFA [I], members/Mombasa supported, sequence to DRC and Tripartite classification unknown. |
| B01 | Beitbridge: SA → Zimbabwe | V | V | C | U | PROPOSED_UNVALIDATED | YES | SADC [K], BMA [J], location [R3]; model conflict in §4.1. |
| B02 | Lebombo → Ressano Garcia: SA → Mozambique | V | V | C | U | PROPOSED_UNVALIDATED | YES | South African DHA [R1], BMA [J]; point [R4]. |
| B03 | Skilpadshek → Pioneer Gate: SA → Botswana | V | V | U | U | PROPOSED_UNVALIDATED | YES | SARS [R5], national border/corridor description [E] (indexed); point unverified. |
| B04 | Groblersbrug → Martin's Drift: SA → Botswana | V | V | U | U | PROPOSED_UNVALIDATED | YES | SAnews [R6], SADC [L]; location unknown. |
| B05 | Oshoek → Ngwenya: SA → Eswatini | V | V | U | U | PROPOSED_UNVALIDATED | YES | SARS [R7], BMA [J]; location unknown. |
| B06 | Maseru Bridge: SA → Lesotho | V | C | U | U | NOT_STARTED | NO | BMA [J] SA post/country; counterpart and crossing sequence need confirmation. |
| B07 | Nakop: SA → Namibia | V | C | U | U | NOT_STARTED | NO | BMA [J] SA post/country; counterpart needs confirmation. |
| B08 | Vioolsdrift: SA → Namibia | V | C | U | U | NOT_STARTED | NO | BMA [J] SA post/country; counterpart needs confirmation. |
| G01 | Madagascar → Toamasina maritime port | C | C | C | U | NOT_STARTED | NO | Logistics Cluster [M], port reference point not gate; government/authority confirmation needed. |
| G02 | Mauritius → Port Louis maritime gateway | V | V | U | U | NOT_STARTED | YES | Mauritius Ports Authority [N], port endpoint; road gate unknown. |
| G03 | Seychelles → Port Victoria / Mahé Quay | V | V | U | U | NOT_STARTED | YES | Seychelles Ports Authority [O], port endpoint; road gate unknown. |
| G04 | Comoros → Moroni maritime gateway | C | C | U | U | NOT_STARTED | NO | Ports association [P] historical; national authority confirmation required. |
| G05 | Comoros → Mutsamudu maritime gateway | C | C | U | U | NOT_STARTED | NO | Ports association [P] historical; national authority confirmation required. |
| G06 | Comoros → Boigoma maritime gateway | C | C | U | U | NOT_STARTED | NO | Ports association [P] historical; national authority confirmation required. |

All island entries are maritime gateways, **not** road corridors. No road-dwell measurement is
proposed at any island port until a distinct port-gate use case is approved. The 16-state candidate
reconciliation in the previous audit remains valid as a reconciliation of leads, not proof that
all countries have verified route coverage.

## 4. Provisional Wave 1 commercial pool — not a ranking

The following **five** SA crossings are a provisional commercial research pool relevant to
Gauteng-origin/destination operators. This is an operator-use hypothesis based on transport
connections, **not** a measured continental ranking, a claim of this fleet's routes, or an approved
list. B01–B04 correspond to North-South, Maputo or Trans-Kalahari links; B05 adds the Eswatini
commercial gateway. Other crossings are not excluded from the later evidence-based selection.
The operator route table at the end is required to test relevance and volume.

**Common proposed method, all five:** obtain both authorities' current gate/road layouts and
identify both directed freight paths, parking, junctions and bypasses. Propose—not deploy—separate
entry/exit geometry with approach-road queue coverage, avoiding adjacent unrelated traffic. The
operator-specific validation plan must include consented sampled trips in both directions, stops,
bypasses, queue and GPS-gap cases, source/device and server timestamps, privacy and retention
controls, operator/site owner and sign-off. Compare traces with the proposed boundary and measured
arrival/exit events; document false positives/negatives, revisions and gaps. Secure authorisation
before gathering traces. Unknown models are displayed, not used to decide whether a raw GPS
crossing session can be measured; no OSBP inference follows from such a session.

### 4.1 B01 — Beit Bridge / Beitbridge, South Africa–Zimbabwe

- **Why in pool:** Gauteng/N1 to Zimbabwe and NSC candidate; commercial relevance to this operator
  is unconfirmed. Official identity and SA→Zimbabwe crossing supported by SADC [K].
- **Dimensions:** E=V, S=V, L=C, O=UNKNOWN **with conflict**, G=PROPOSED_UNVALIDATED,
  REGISTRY_VERIFIED (crossing scope), BUILD_READY=NO.
- **Location source:** [R3] Logistics Cluster print preview, assessment listed as August 2026
  in its country profile [R8], gives `-22.2310000, 29.987000` as a border-crossing reference.
  Precision/classification of the actual truck gates is unspecified. A different indexed historical
  Logistics Cluster entry [R9] gives `-22.233024, 29.983751`; it may be a different facility/point
  or version, not proof of an error. Do not choose either as gate or draw a polygon from it.
- **Operating-model conflict:** SADC [C] (8 Feb 2025) calls Beitbridge an OSBP; SADC [K]
  (28 Jul 2025) says OSBP should be implemented. [R3] describes a future OSBP strategy. Sources
  may use different definitions or periods; the current legal/operational model is **UNKNOWN**.
  This conflict is visible but does **not** block GPS-based dwell measurement.
- **Proposed site method:** common protocol; identify N1 approach, bridge and separate freight
  routes on **both** sides; distinguish passenger lanes, parking and diversions; validate northbound
  and southbound traces. No field-ready polygon exists.
- **Missing:** authoritative dated truck-gate and lane layouts with survey precision and both-side
  ownership; authorised model clarification (not a build blocker); operator route volumes,
  trace availability/consent, device/time quality, named validation owner and sign-off plan.
- **Sources:** [K], [C], [J] in earlier audit; [R3], [R8], [R9] below.

### 4.2 B02 — Lebombo / Ressano Garcia, South Africa–Mozambique

- **Why in pool:** SADC describes Gauteng–Maputo corridor [R2], and South Africa's DHA names the
  crossing pair [R1]. Fleet usage is unknown.
- **Dimensions:** E=V, S=V, L=C, O=UNKNOWN, G=PROPOSED_UNVALIDATED,
  REGISTRY_VERIFIED (crossing scope), BUILD_READY=NO.
- **Location source:** Logistics Cluster [R4] provides `-25.443035, 31.986763` as a
  border-crossing reference, nearest town Ressano Garcia 0 km. It does **not** establish surveyed
  truck-gate identity, datum, accuracy or approach extent; not a gate polygon.
- **Conflict:** [R4] describes an OSBP and 24-hour operation; the SADC executive-secretary report
  [R10] historically lists the OSBP as planning, and BMA [J] lists SA port-control 06:00–00:00.
  Sources differ in date, service and scope; the present freight operating model/hours are
  **UNKNOWN**, not necessarily the same factual assertion. The operational-model uncertainty does
  not block dwell measurement.
- **Proposed site method:** common protocol; identify freight bypass, any remote clearance
  facilities, N4 approach and queues on both sides. Do not equate pre-clearance with border exit.
- **Missing:** current survey-quality gate/road and freight-subpost layouts, authority clarification,
  operator-specific routes/trace plan, consent and named validation owner.
- **Sources:** [R1], [R2], [R4], [R10], [J].

### 4.3 B03 — Skilpadshek / Pioneer Gate, South Africa–Botswana

- **Why in pool:** Trans-Kalahari Gauteng–Botswana–Namibia corridor; cross-border pair named by
  SARS [R5]. Which operators use it is unknown.
- **Dimensions:** E=V, S=V, L=U, O=UNKNOWN, G=PROPOSED_UNVALIDATED,
  REGISTRY_VERIFIED (crossing scope), BUILD_READY=NO.
- **Coordinate:** UNKNOWN; no independently classified truck-gate coordinate or surveyed precision
  accepted. A Logistics Cluster search-index snippet [R11] lists `-25.2756, 25.7138` as a border
  post, but the relevant underlying record, accuracy and gate identity have not been reviewed; it
  is a lead, not a gate point.
- **Conflicts:** no resolved present-day model; historical C-BRTA [E] described a conventional
  facility, which does not establish today's operation. Do not infer current hours from it.
- **Proposed site method:** common protocol, with both country facilities, N4 approach/queue,
  truck parks and bypass separation; validate both directions.
- **Missing:** primary gate coordinates and drawings, both-side truck flow, permission and
  operator-specific trace availability/validation plan.
- **Sources:** SARS [R5], BMA [J], C-BRTA [E] indexed; coordinate lead [R11].

### 4.4 B04 — Groblersbrug / Martin’s Drift, South Africa–Botswana

- **Why in pool:** Botswana NSC connection. SADC [L] identifies Martin's Drift and a 2025 daily
  volume estimate; SA government [R6] names the pair. Fleet relevance remains unknown.
- **Dimensions:** E=V, S=V, L=U, O=UNKNOWN, G=PROPOSED_UNVALIDATED,
  REGISTRY_VERIFIED (crossing scope), BUILD_READY=NO.
- **Coordinate:** UNKNOWN; no sourced and classified truck-gate coordinate, survey precision or
  both-bank layout accepted.
- **Conflicts:** no asserted model conflict; OSBP plans in [R6] are not proof of current operation.
  SADC [L] states 400–450 trucks/day in October 2025, with direction and observation window
  unspecified; not comparable fleet-volume evidence or a ranking.
- **Proposed site method:** common protocol; verify bridge and riverbank approaches, freight
  queue access, parking, turns and flood diversions on both sides before proposing boundaries.
- **Missing:** accurate facility and queue maps, accepted coordinate source, operator-specific
  routes/volumes and consented trace validation plan; current operating model remains UNKNOWN.
- **Sources:** SADC [L], [R12] and SAnews [R6].

### 4.5 B05 — Oshoek / Ngwenya, South Africa–Eswatini

- **Why in pool:** SA–Eswatini commercial link via N17; SARS [R7] describes Oshoek–Ngwenya
  freight processes and N17. Actual Gauteng fleet use is unknown.
- **Dimensions:** E=V, S=V, L=U, O=UNKNOWN, G=PROPOSED_UNVALIDATED,
  REGISTRY_VERIFIED (crossing scope), BUILD_READY=NO.
- **Coordinate:** UNKNOWN; no classified authoritative gate coordinate or accuracy accepted.
- **Conflicts:** 2024 SARS study describes a historic two-sided process; [R10] lists OSBP planning
  historically. Neither verifies today's one/two-stop operation. Current model UNKNOWN.
- **Proposed site method:** common protocol, including both N17 approaches, freight processing
  and off-site parking identified by the 2023 SARS study; test driver/vehicle separation and
  local movements to avoid false crossing sessions.
- **Missing:** current gate and freight parking layouts/precision, operator direction and frequency,
  trace availability/consent and validation owner; reconcile current model separately.
- **Sources:** SARS [R7] (study in 2023, report 2024), BMA [J], SADC [R10].

### Additional A2 source register

Earlier audit source keys [A]–[Q] refer to the source register in that document. The following
additional references were inspected 2026-10-30; indexed-only items are marked. None supplies
current geofence boundaries.

- [R1] South African DHA, [Draft One Stop Border Post Policy](https://www.dha.gov.za/images/PDFs/OSBP_Policy_Final_Draft_of_22_December_2020_-_GAZETTE-compressed.pdf), 22 Dec 2020, directly read corridor section; indexed extract names the Lebombo/Ressano Garcia pair. Historical policy, not today's OSBP status.
- [R2] SADC, [Transport Corridors and Spatial Development Initiatives](https://www.sadc.int/pillars/transport-corridors-spatial-development-initiatives), undated, directly read; Gauteng/Mpumalanga–Maputo corridor.
- [R3] Logistics Cluster, [Beitbridge border assessment](https://lca.logcluster.org/print-preview/4642), directly read; reference point, model not independently confirmed.
- [R4] Logistics Cluster, [Ressano Garcia border assessment](https://lca.logcluster.org/234-mozambique-land-border-crossing-ressano-garcia), undated, directly read; reference point, description and claimed model.
- [R5] SARS, [Skilpadshek and Pioneer border posts](https://www.sars.gov.za/latest-news/temporary-closure-of-skilpadshek-and-pioneer-border-posts-on-23-september-2025/), 23 Sep 2025, directly read; historical exercise, not current status.
- [R6] SAnews.gov.za, [SA–Botswana Binational Commission](https://www.sanews.gov.za/south-africa/president-ramaphosa-concludes-sa-botswana-bnc), 21 May 2026, directly read; Martin's Drift/Groblersbrug.
- [R7] SARS, [Time Release Study, Oshoek Border Post](https://www.sars.gov.za/wp-content/uploads/Time-Release-Study-Oshoek-Border-Post-2024.pdf), 2024 report, 2023 study, indexed extract.
- [R8] Logistics Cluster, [South Africa assessment index](https://lca.logcluster.org/south-africa), indexed; Beitbridge assessment date August 2026.
- [R9] Logistics Cluster, [earlier Beitbridge assessment](https://www.lca.logcluster.org/231-south-africa-land-border-crossing-beitbridge-zimbabwe), indexed only; direct page currently returned not found. Do not promote its point.
- [R10] SADC, [Executive Secretary RISDP assessment](https://sadc.int/sites/default/files/2025-07/ES%20Report%20book%20with%20covers%20F.pdf), report dated August 2024; table was indexed, beyond direct reader's first-30-page limit. Historical statuses only.
- [R11] Logistics Cluster, [South Africa infrastructure extract](https://lca.logcluster.org/print-preview-current-sub-section/346), indexed only; point not verified as truck gate.
- [R12] SADC / Tripartite, [Palapye–Martin's Drift road procurement](https://www.sadc.int/procurement-opportunities/rehabilitation-111-km-palapye-martins-drift-road-section-botswana), 2014, directly read.

## 5. Operator route data requested — fill in one row per direction

Use the same recent representative month or state the actual period, and include loaded and empty
trips consistently. Counts should be **completed crossings per month**, not planned trips; note
any seasonality, missing data or double-counting. Number of trucks means distinct trucks that made
those crossings in that period. Contact details should be shared only with permission. No raw GPS,
names of drivers or personal location history are needed for this initial table.

**Period represented:** ____________________  **Fleet/data coverage and known gaps:** ____________________

| Origin → destination | Border post (both sides if known) | Direction | Completed trips/month | Number of distinct trucks | Operator contact (name / role / permitted contact) | GPS / trace availability (yes/no/unknown; sampling frequency, period, consent and access constraints if known) |
|---|---|---|---:|---:|---|---|
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

No code begins until the denominator, confidence model and provisional pool have been approved.

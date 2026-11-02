# WP3 Phase A — registry decision pack

> **Superseded confidence model:** See [Phase A2 dimensional evidence](WP3-PHASE-A2-EVIDENCE-2026-10-30.md).
> The single-label verification counts and decision conclusions below are historical, not the
> current Phase A2 classification. No registry or Wave 1 approval is requested on these labels.

**Prepared:** 2026-10-30. **Decision status: NOT READY for build approval.** This pack defines an
initial review denominator and records evidence and gaps; it does **not** establish that every
in-scope entity has been discovered or that any site is ready to build. No code, migrations, UI,
geofence configuration or data collection is authorised by this document. The proposed geometries
below are descriptions for later validation, not coordinates, polygons or operating instructions.

## 1. Denominator and inclusion rules

### Intended full universe

An entity is in scope if it meets at least one rule, subject to a source and date:

1. A **SADC-recognised regional transport corridor**, including multimodal corridors, recognised
   historical names needing current reconciliation, and identifiable corridor branches. Count a
   corridor once across aliases; record distinct branches as route variants rather than assuming a
   single chain. Include proposed/historical corridors as candidates, not operational claims.
2. A **COMESA–EAC–SADC Tripartite corridor** touching SADC, including its route variants and
   connected non-SADC countries. A Tripartite agreement or authority must substantiate the
   designation; don't equate every three-country corridor with the Tripartite programme.
3. A **major commercial land crossing** at a route node, supported by a SADC, national or corridor
   authority source identifying it as important for commercial freight, or qualifying under an
   agreed quantitative threshold. Include both national sides as one crossing, not two posts.
   The numerical threshold and exhaustive authority list are not yet agreed. Border candidates
   without major-volume evidence are kept for review, not counted as proven major crossings.
4. A **maritime cargo gateway in each island member state**, supported by an authority or
   intergovernmental port source. Other material island cargo gateways are included when sourced.
   These are gateways, never invented cross-sea road corridors. Mainland maritime ports that anchor
   a corridor are route nodes, not separate gateway entries in this first review set.

**Excluded:** airports and passenger-only posts (not freight road-dwell scope); minor domestic
roads and unnamed connections (not independently recognised regional corridors); every local port
or national border crossing solely because it exists (not necessarily major commercial); proposed
infrastructure represented as operating; duplicated aliases; private yards as public border posts;
and cross-ocean road links. This is a registry inclusion policy, not a statement that excluded
infrastructure is unimportant. Later additions require evidence, a denominator change and a new
version; exclusions must not hide an in-scope corridor or major crossing.

### What can actually be counted today

The **bounded review set** is 34 distinct review records: 20 corridor candidates, eight crossing
records, and six island gateway records. It may contain overlapping identities pending reconciliation.
The corridor baseline contains the **18 separately listed clusters** in SADC's 2012 presentation
[A], plus Central Corridor as a separate *reconciliation candidate*, not a claim it is distinct
from the 2012 Dar corridor, and Northern Corridor as an additional lead. It also includes the eight
selected SA-side crossing leads from the earlier audit and the six identified island gateways.
This is an explicit, reproducible audit denominator, **not** the full intended universe: the 2012
list predates changes, Tripartite source coverage is incomplete, and no complete major-post or
island-port census was obtained. Approval of this denominator as final would be premature.

A row receives **VERIFIED** only when its identity, included country/route variant, each applicable
crossing or gate, sufficiently precise location, current operating model and field-level provenance
are supported and conflicts resolved. A corridor does not become verified merely because its name
appears in a source. **CANDIDATE** = partially supported or historical; **CONFLICTED** = material
source disagreement not resolved; **UNKNOWN** = no support for the asserted field. Unknown fields
are explicitly shown. Percentages apply to these 34 records only. Only VERIFIED crossings can
enter a Wave 1 build, after all separate user-specified gates; none currently qualifies.

**Evidence hierarchy:** current SADC/Tripartite primary sources, corridor authorities and national
governments/port authorities first; intergovernmental/UN sources next; commercial sources only
as secondary cross-checks. A dated statement establishes what its author said then, not real-time
operation. `checked` = 2026-10-30 unless stated; undated pages are marked undated. Source keys and
publication dates below apply to the fields they actually support, not all fields in the row.

## 2. Corridor review register (20 records)

Routes below are **partial sequences, not complete route definitions**. `?` means unknown or
not verified; `→` does not establish that intervening route segments or border models were verified.
All coordinates and gate polygons for these corridor records are **UNKNOWN**; posts are linked
only where cited. Current corridor-wide operation/management model is **UNKNOWN** unless explicitly
stated: road, rail or a cited OSBP cannot be inferred for an entire network. Each row is CANDIDATE.

| ID | Official name / alias in cited source | Countries and ordered route nodes / crossing or port gate | Source (publication date) | Missing before VERIFIED |
|---|---|---|---|---|
| C01 | North-South Corridor / NSC | South Africa → Zimbabwe → Zambia → DRC; Durban → Beitbridge → Chirundu → Kasumbalesa (partial); Botswana, Mozambique and Malawi branches also cited by SADC, sequences not established here | [B] (2022); [C] (8 Feb 2025) | Branch enumeration, current model at each post and gate locations; [C] has a conflict for Beitbridge, see B01. |
| C02 | Maputo Corridor | Mozambique; route and gates ? | [D] (undated) | Full cross-border sequence, countries, crossings, model and locations. |
| C03 | Dar es Salaam Corridor | Tanzania; route and gates ? | [A] (2012), [D] (undated) | Reconcile institutional/name relationship with C19, countries, sequences, posts and locations. |
| C04 | Trans Kalahari Corridor / TKC | Namibia, Botswana, South Africa; historical description: Walvis Bay → Windhoek → Gobabis → Buitepos/Mamuno → Kanye → Lobatse → Pioneer Gate/Skilpadshek → Gauteng; omitted intervening nodes not verified | [E] (2019–20, indexed extract) | Verify current official alignment, current crossing models, gate geometry and source full text. |
| C05 | Walvis Bay–Ndola–Lubumbashi / Trans Caprivi (2012 alias) | Namibia → Zambia → southern DRC; Walvis Bay → ? → Ndola → Lubumbashi; WBCG also identifies Zimbabwe, Malawi and Tanzania connections, without a specific sequence | [A] (2012); [F] (undated) | Verify crossings, all branches, current model and coordinates; reconcile pre-existing static labels, do not double-count alias. |
| C06 | Beira Corridor | Malawi/Mozambique: Mwanza ↔ Zobue; SADC identifies this crossing along the corridor. Full chain and other countries ? | [G] (11 Nov 2025) | Full routes, port and other crossing associations, models and coordinates. |
| C07 | Nacala Corridor | Countries, route sequence and posts ? | [A] (2012) | Current authority, country/route variants, posts, model and locations. |
| C08 | Limpopo Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C09 | Mtwara Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C10 | Durban–Manzini Corridor | South Africa and Eswatini are implied by the named cities; route sequence/posts ? | [A] (2012) | Confirm countries and complete route with current authority; all remaining fields. |
| C11 | Durban–Maseru Corridor | South Africa and Lesotho are implied by the named cities; route sequence/posts ? | [A] (2012) | Confirm countries and complete route with current authority; all remaining fields. |
| C12 | Durban–Phalaborwa Corridor | Countries, route sequence and posts ? | [A] (2012) | Current official name/route, counterpart countries, model and locations. Do not silently rename based on other lists. |
| C13 | Trans Orange Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C14 | Trans Cunene Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C15 | Namibe Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C16 | Lobito / Benguela Corridor | Angola, DRC, Zambia according to SADC's project assessment; Lobito → ?; other route nodes/posts ? | [A] (2012); [H] (2019) | Distinguish road and rail variants and planned vs operating links; locations and models. |
| C17 | Mulanje Corridor (as printed in cluster list) | Countries, route sequence and posts ? | [A] (2012) | Reconcile **Mulanje** with map label **Malanje** in the same presentation; do not assume equivalence; current identity and all fields. |
| C18 | Bas Congo Corridor | Countries, route sequence and posts ? | [A] (2012) | Current identity and all operational fields. |
| C19 | Central Corridor | Tanzania, DRC, Malawi, Zambia, Burundi, Rwanda, Uganda; maritime gateways Dar es Salaam, Tanga, Mtwara; route ordering and crossings ? | [I] (21 Jan 2026) | Variants, crossing/gate details, model and relationship to C03. |
| C20 | Northern Corridor | Burundi, DRC, Kenya, Rwanda, South Sudan, Uganda; Mombasa → ?; full route sequences and posts ? | [A] (2012 map); [I] (21 Jan 2026) | Establish Tripartite designation, links to SADC nodes, complete variants, model and gate coordinates. |

The [Tripartite CTMS COMESA article](https://www.comesa.int/tripartite-transport-corridor-trip-monitoring-system-set-for-piloting/)
was available only as a search excerpt; direct access returned 403. It is a lead, not evidence that
the current Tripartite corridor inventory is complete. The 2012 source lists a map label “Northern”
in addition to the 18 cluster entries. It needs separate Tripartite/authority reconciliation; it
is included as C20 but requires Tripartite and route reconciliation. Likewise map labels and other
newer corridors outside the 2012 cluster baseline must be checked.

## 3. Crossing register and proposed validation (8 records)

Each is a single international crossing, not a pair of counts. SA-side designation/country is
supported by [J] (BMA, undated), **not** proof of commercial throughput, current model on both
sides, or exact gate position. “Coordinate: UNKNOWN” means no numeric gate position, source or
precision has been established; it must not be backfilled from a town centroid, a schematic, or
the existing static service. All proposed geometry is **PROPOSED_UNVALIDATED**. The general
hypothesis is two gate/processing areas plus approach-road queue corridors on both sides, with
site-specific direction and junctions determined from evidence; the geometry is not a deployed
polygon and no arbitrary radius is approved.

**Site validation protocol V:** after a separate approved privacy, consent, purpose, retention and
access design, obtain each authority's gate and truck-access layout and identify inbound/outbound
approaches and queue extents; conduct site/authority review; compare representative consented,
timestamped GPS traces in both directions, including queues, bypasses, GPS gaps and turns; test
false entry/exit and overlapping adjacent areas; revise and obtain explicit site sign-off. Validate
both sides, including access roads, not just a town point. No traces are requested or collected now.
If no real traces or permission exist, it stays proposed. Site-specific focus follows; not a promise
that the named roads/queue layouts have already been surveyed.

| ID / confidence | Official name / alias; countries and corridor association | Current model / coordinates & precision | Source, date | Proposed geometry / site-specific V focus |
|---|---|---|---|---|
| B01 **CONFLICTED** | Beit Bridge / Beitbridge; SA–Zimbabwe; C01 | Model conflicted: [C] calls Beitbridge an OSBP; [K] says OSBP should be implemented in future after July 2025 visit. Neither resolves current status. Coordinates UNKNOWN; precision UNKNOWN. | [J] undated; [C] 8 Feb 2025; [K] 28 Jul 2025 | V: both national facilities, bridge approaches and freight/passenger separation; compare queue/bypass traces. Resolve OSBP conflict with both authorities. |
| B02 CANDIDATE | Lebombo; SA–Mozambique; C02 association and counterpart need primary evidence | Two-stop/one-stop UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated | V: both sides, border approach road, freight-only access and diversion routes. |
| B03 CANDIDATE | Skilpadshek / Pioneer Gate; SA–Botswana; C04 historical association [E] | Current model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated; [E] 2019–20 indexed | V: both facilities and approach-road queues; identify shared road versus side-specific access. |
| B04 CANDIDATE | Groblersbrug / Martin’s Drift; SA–Botswana; North-South association is supported on Botswana side by [L]; pairing needs primary confirmation | Current one/two-stop model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated; [L] 23 Oct 2025 | V: both sides of bridge and approach-road queues; verify river crossing, truck route and flood/diversion impacts. |
| B05 CANDIDATE | Oshoek; SA–Eswatini; corridor/counterpart UNKNOWN | Current model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated | V: both facilities, access junctions and approach queues; identify relevant truck lanes. |
| B06 CANDIDATE | Maseru Bridge; SA–Lesotho; corridor/counterpart UNKNOWN | Current model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated | V: both bridge approaches, freight paths and separation from local/commuter circulation. |
| B07 CANDIDATE | Nakop; SA–Namibia; corridor/counterpart UNKNOWN | Current model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated | V: both gate complexes and approach-road queue extents, including truck parking versus bypass. |
| B08 CANDIDATE | Vioolsdrift; SA–Namibia; corridor/counterpart UNKNOWN | Current model UNKNOWN; coordinates UNKNOWN; precision UNKNOWN. | [J] undated | V: both bridge/river approaches and freight queues, distinguish parking and unrelated traffic. |

B01 also illustrates a different, not necessarily contradictory distinction: [J] lists SA port
control as 24 hours; [K] says 24/7 passenger, 12 hours commercial goods during its 2025 assessment.
They describe different services; neither is asserted as today's truck clearance hours. [L] says
400–450 trucks/day for Martin's Drift, but does not itself establish the counterpart name.

## 4. Island maritime gateways (6 records)

All are **CANDIDATE** until gate access, coordinates, precision, current operation and port-gate
use case are confirmed. Route sequence is **not applicable** for an island gateway; the listed
port/terminal is the node, not an asserted international shipping route. Gate location and
coordinates are UNKNOWN unless noted; do not use port points for truck gate polygons. **No
road-dwell measurement** for any island entry until an explicit port-gate use case is approved.

| ID | Gateway, aliases / country | Operating model and gate | Coordinates / precision | Evidence |
|---|---|---|---|---|
| G01 | Toamasina / Tamatave, Madagascar | Maritime cargo port; Logistics Cluster identifies SPAT; actual gate and current model require authority confirmation | −18.156797, 49.426842, Logistics Cluster port reference **point**, not gate; precision unspecified | [M] undated, checked 2026-10-30 |
| G02 | Port Louis Harbour / PLH, Mauritius | Main maritime gateway; Mauritius Ports Authority identifies container terminal; road gate and access model UNKNOWN | UNKNOWN | [N] 3 Jun 2026 |
| G03 | Port Victoria / Mahé Quay, Seychelles | Commercial maritime port; SPA identifies Mahé Quay and container handling; road gate UNKNOWN | UNKNOWN | [O] undated |
| G04 | Moroni, Comoros | Maritime port; current commercial gate/model UNKNOWN | UNKNOWN | [P] historical/undated |
| G05 | Mutsamudu, Comoros | Maritime port; current commercial gate/model UNKNOWN | UNKNOWN | [P] historical/undated |
| G06 | Boigoma / Mohéli, Comoros | Maritime port; current commercial gate/model UNKNOWN | UNKNOWN | [P] historical/undated |

Port Mathurin in Rodrigues is identified by [N] and is a potential additional gateway; its cargo
scope and inclusion under the above rule need checking. The six records are not an exhaustive port
census.

## 5. Sixteen-state reconciliation

This table records **candidate mapping only**, not coverage or verified live service. The four
island states have no land-border road corridor to another SADC state; their domestic roads are
not denied. `?` on the named endpoint is an inference to be independently validated as noted above.
The member-state universe comes from [Q].

| Member | Candidate register mapping |
|---|---|
| Angola | C16 |
| Botswana | C01, C04, B03/B04 |
| Comoros | G04–G06; island gateway, no inter-state land corridor |
| Democratic Republic of the Congo | C01, C05, C16, C19 |
| Eswatini | C10?, B05 |
| Lesotho | C11?, B06 |
| Madagascar | G01; island gateway, no inter-state land corridor |
| Malawi | C01, C06, C19 |
| Mauritius | G02; island gateway, no inter-state land corridor |
| Mozambique | C01, C02, C06, B02 |
| Namibia | C04, C05, B07/B08 |
| Seychelles | G03; island gateway, no inter-state land corridor |
| South Africa | C01, C04, B01–B08 |
| Tanzania | C03, C19 |
| Zambia | C01, C05, C16, C19 |
| Zimbabwe | C01, C05 connection, B01 |

## 6. Wave 1 evidence and data request

**Ranking = UNKNOWN; proposed build list = EMPTY.** Two 2025 SADC snapshots are useful *volume
proxies*, not a defensible common-period ranking and not evidence of this operator's usage:

| Site | Metric and source | Qualification |
|---|---|---|
| B01 Beitbridge | **Over 300 trucks/day**, SADC July 2025 [K] | Average; observation period, directional coverage and count method are unspecified. Not annualised. Model conflicted. |
| B04 Martin's Drift / Groblersbrug | **400–450 trucks/day**, SADC October 2025 [L] | “Clears” per day; period, direction and count method unspecified. Pairing and site readiness need confirmation. |

The numbers use a similar unit but different observations and undefined scopes. A numeric ordering
would be a **PROXY**, not a comparable actual ranking; we decline even a proxy ordering until scope
is reconciled. Other SA candidate crossings have no comparable cited number here. In particular,
capacity figures are not actual traffic and passenger counts are not trucks. Higher public totals
would not demonstrate the highest volumes for this fleet. B01 and B04 are reasonable **investigation
priorities**, not a proposed approved build; B02/B03 and others must remain eligible for a fair
fleet comparison.

To finish a fleet-based ranking, request from the operator for the same most recent 12 months (or
longest available common period): crossing identifier with **both national side names**, crossing
date/time and timezone, direction, completed vehicle/trip ID (pseudonymised), tenant/fleet, vehicle
class, whether loaded/empty, and observed vs planned/cancelled status. Provide one record per
completed crossing, including repeats, plus scope/coverage (fleets and date gaps), deduplication
key and provenance. Aggregate counts by crossing and direction are sufficient for the first
ranking if record-level export is not appropriate; supply the same filters, time window, distinct
trip/crossing definition and excluded events. No personal names or raw GPS are needed for ranking.
Tie-break only with a stated, comparable rule and disclose missing data. Separately, authorised
and consented real GPS traces would be needed for later geometry validation, not for the ranking.

## 7. Decision page

| Decision metric | Result |
|---|---|
| Bounded review set | **34** records: 20 corridors, 8 crossings, 6 island gateways. This is not a demonstrated complete universe or deduplicated final count. |
| VERIFIED | **0 / 34** under the superseded all-dimensions-at-once rule |
| CANDIDATE | **33 / 34** under the superseded rule |
| CONFLICTED | **1 / 34** under the superseded rule (B01) |
| UNKNOWN entries | **0 / 34**; numerous individual fields are UNKNOWN. Entry statuses and field statuses are different. |
| Countries reconciled | **16 / 16** to at least a candidate or gateway; **0 / 16 verified full coverage**. |
| Wave 1 | **No build-ready selection.** Investigation priorities B01/B04 only; evidence and comparability limits in §6. |

**Blocking gaps:** complete current SADC and Tripartite corridor inventory and resolve C03/C19,
C17 spelling and omitted current corridors; complete major-crossing census and agree quantitative
threshold; source both sides, actual gate locations, precision, current operational model and
conflicts for each site; confirm island gateway census and port-gate access; obtain comparable
fleet volume evidence; conduct site validation only after separate privacy approval and user
approval to proceed. Historic names and inferred country mappings cannot satisfy these gates.

**Specific decisions requested:**

1. Approve or amend the *inclusion policy*, major-crossing threshold and exclusion rules; do not
   approve the 34-record review set as the complete universe while evidence gaps remain.
2. Confirm the ranking period and supply the comparable operator aggregates described in §6, or
   authorise an alternative public-data proxy with explicit limitations. This is a data request,
   not permission to collect raw GPS.
3. Decide whether a future island **port-gate** measurement use case is in scope. Until approved,
   all four states remain maritime gateway records with no road-dwell measurement.
4. Decide privacy, consent and retention requirements for any future site-validation trace study.
5. After the missing evidence and site reviews are completed, approve the revised registry and
   **specific VERIFIED Wave 1 crossings** in a separate decision. **No build starts on this pack.**

## Source register

Sources accessed or indexed 2026-10-30. Primary sources take precedence; old publications establish
historical statements only. Linked source dates are publication dates, not field verification dates.

- [A] SADC Secretariat presentation, [SADC Transport Corridors – Investment Opportunities](https://www.mofa.go.jp/mofaj/press/release/24/3/pdfs/0314_06_14.pdf), 14–15 Mar 2012; directly read cluster list and map.
- [B] SADC, [Regional Customs Transit Guarantee / North-South](https://www.sadc.int/latest-news/sadc-piloting-and-rolling-out-regional-customs-transit-guarantee-along-north-south), 2022; route network description.
- [C] SADC, [North South Trade Corridor Time Release Study launch](https://www.sadc.int/latest-news/sadc-launches-time-release-study-report-north-south-trade-corridor-bolster-trade-and), 8 Feb 2025; indexed text; calls Beitbridge OSBP.
- [D] SADC, [Transport](https://www.sadc.int/pillars/transport), undated.
- [E] South African Cross-Border Road Transport Agency, [Annual State of Cross-Border Operations Report 2019–20](https://www.cbrta.co.za/uploads/files/Annual-State-of-Cross-Border-Operations-Report-2019-20.pdf), 2019–20; indexed extract only, full report still requires review.
- [F] Walvis Bay Corridor Group, [WBNLDC description](https://www.wbcg.com.na/borders/), undated; directly read.
- [G] SADC, [Mwanza/Zobue study](https://www.sadc.int/latest-news/mwanza-border-post-time-release-study-report-launched-enhance-trade-efficiency-and), 11 Nov 2025; directly read.
- [H] SADC, [Regional Infrastructure Short Term Action Plan assessment](https://www.sadc.int/sites/default/files/2021-07/SADC_Regional_Infrastruture_Development.pdf), 2019; indexed extract.
- [I] Central Corridor TTFA, [Central/Northern corridor cooperation](https://centralcorridor-ttfa.org/the-central-corridor-and-the-northern-corridor-signs-a-memorandum-of-cooperation-to-promote-efficient-safe-and-sustainable-transport-and-trade-facilitation-within-their-respective-member-states/), 21 Jan 2026; directly read.
- [J] South African Border Management Authority, [Ports of Entry](https://www.bma.gov.za/ports-of-entry-2/), undated; directly read; SA port-control hours, not both-sided commercial processing hours.
- [K] SADC, [Beitbridge assessment](https://www.sadc.int/latest-news/beitbridge-border-post-enhances-regional-trade-efficiency), 28 Jul 2025; directly read.
- [L] SADC, [Martin’s Drift assessment](https://www.sadc.int/latest-news/martins-drift-border-post-enhances-regional-trade-efficiency), 23 Oct 2025; directly read.
- [M] Logistics Cluster, [Port of Toamasina](https://lca.logcluster.org/madagascar-211-port-toamasina-tamatave), undated; directly read; point only.
- [N] Mauritius Ports Authority, [Container transshipment](https://www.mauport.com/container-transshipment/), 3 Jun 2026; directly read.
- [O] Seychelles Ports Authority, [Facilities](http://seyport.sc/facilities/), undated; directly read.
- [P] Indian Ocean Ports Association, [Ports of Comoros](https://apioi.net/ports-of-comores/), historical/undated; directly read; current operators require verification.
- [Q] SADC, [Member States](https://www.sadc.int/member-states), undated; membership frame.

# WP3 Phase A2 — ZW prospect operator evidence update

**Status: research only, 2026-10-30.** This update supersedes the denominator, missing-review
ledger, candidate-pool weighting and build-readiness conclusions in
[the original Phase A2 pack](WP3-PHASE-A2-EVIDENCE-2026-10-30.md). Its dimension definitions,
34-record matrix and original five dossiers remain applicable except where amended below. The
[earlier Phase A audit](WP3-SADC-REGISTRY-AUDIT-2026-10-30.md) is historical.

**ZW prospect operator** is prospective route evidence only: not a tenant, customer, endorsement,
pilot commitment or agreement to provide GPS. No routes, volumes, directions, device capabilities
or availability of traces have been confirmed. No personal name is recorded in this document. The
fact that the operator is based in Zimbabwe is not evidence that any particular crossing is used.
There is no deployment, collection of traces, build or implementation authority in this pack.

## 1. Prioritisation and build gate

The previous Gauteng-only pool is no longer an exclusive Wave 1 pool. Research leads from it remain
eligible, as do Zimbabwe-related leads and any other SADC route the ZW prospect operator identifies.
This is a **provisional commercial investigation pool**, not a ranked list and not a claim about
operator routes. Candidate examples are Beitbridge, Chirundu, Forbes/Machipanda, Nyamapanda/
Cuchamano, Plumtree/Ramokgwebana and Kazungula, among others; **all remain unconfirmed**.
Kazungula below means the Botswana–Zambia bridge crossing; other same-name crossings must not be
silently conflated with it.

Selection order after data arrives:

1. **Highest weight:** actual prospect-confirmed completed crossings, trips per month **by direction**,
   over the same stated period; confirm origin, destination and both post names. Unknown counts
   remain unknown, not zero. A returned journey can contain multiple crossings; do not count it as
   one crossing or double-count the same crossing. Do not infer a rank now.
2. Among confirmed and suitably evidenced routes, assess availability of permitted GPS traces,
   LOCATION precision, unresolved location conflicts, and existence/sequence registry status. A
   site with unresolved gate location is a validation priority, not a fabricated ready site. Report
   these dimensions separately, not as a blended score. No invented numerical weights or public
   border totals substitute for the prospect's trip counts.
3. Display OPERATING_MODEL as its independently supported current value, or **UNKNOWN** where
   current status is not established; conflicts remain visible. Model uncertainty does **not**
   prevent measuring GPS-derived dwell.

For each crossing, `BUILD_READY` requires **all** of: official existence and documented sequence
for that crossing, an operator-confirmed route and direction, location precise enough to propose
both-sided gate/approach geometry, and an operator-specific GPS-trace validation plan. The plan
names a consenting participating fleet/contact by role, availability and sampling, coverage of both
directions where relevant, entry/exit and queue/bypass/negative cases, clock quality, consent,
access, retention, owner and sign-off. The plan need not have been executed to be BUILD_READY;
`GPS_VALIDATED` requires actual independently reviewed traces. Dwell deployment remains separately
blocked pending user approval and the prior Phase A2 engineering/security gates. Every geometry
remains `PROPOSED_UNVALIDATED` if a conceptual method has been written; the phrase does not mean a
polygon exists. An item with no method remains `NOT_STARTED`.

## 2. Candidate denominator v0.3 — **unfixed**

The source-set union is the previous v0.2 (SADC's 2012 18-cluster presentation; CCTTFA Central
and Northern; COMESA/Tripartite; national selected posts; island gateway leads), plus four sourced
candidate crossings prompted by possible Zimbabwe-related routes. This is a versioned *review set*,
not an exhaustive list of SADC crossings or a confirmed prospect manifest. Sources do not establish
an agreed threshold for all major commercial crossings; island gateway and Tripartite source sets
remain incomplete. Historical identity, route branches and operational status still require their
own verification. No percentage-coverage calculation is appropriate.

| Ledger | Count / explanation |
|---|---|
| Candidate denominator entries | **42**: 20 corridor records C01–C20, 16 crossings B01–B08, M01–M04, N01–N04, and 6 island gateways G01–G06. A record is an audit item, not necessarily a deduplicated entity. |
| Records dimensionally reviewed | **42**: the earlier 34, plus the four previously missing reviews in §3 and the four new leads in §5. Review may result in UNKNOWN or CONFLICTED. |
| Registry-verified scoped records | **15**: the earlier nine, M01–M04, N02 and N04. This verifies only each recorded crossing, gateway endpoint or route variant—not the entire corridor network. |
| Missing among the four known v0.2 reviews | **0**; M01–M04 reviewed below. Additional missing entries in the intended full universe remain **UNKNOWN**, not zero. |
| Known source alias consolidation | **1** grouping, WBNL / Trans Caprivi in the 2012 source, retained once as C05; historical route scope still requires checking. |
| Potential duplicate pairs | **1**: C03 Dar es Salaam and C19 Central; **CONFLICTED identity relationship**, retained separately pending official reconciliation. |
| Other unresolved naming case | **1**: C17 Mulanje / Malanje (and Malange); **CONFLICTED**; no automatic merger. |
| Confirmed duplicate review rows remaining | **0 known**; the potential pair above is not claimed resolved. |

The review set does not convert a completeness estimate into a known total. To fix the denominator,
obtain the complete current official SADC and Tripartite inventories, review named corridor authority
lists, set and apply a major-crossing inclusion criterion, complete the island-gateway census, and
resolve the two naming/identity cases below. New relevant crossings may enlarge the set.

### Naming and duplicate adjudication — retain both versions

- **C03 / C19 — CONFLICTED identity relationship, not disputed individual existence.** The SADC
  [2012 cluster presentation](https://www.mofa.go.jp/mofaj/press/release/24/3/pdfs/0314_06_14.pdf)
  names the Dar es Salaam Corridor. CCTTFA's [21 January 2026 statement](https://centralcorridor-ttfa.org/the-central-corridor-and-the-northern-corridor-signs-a-memorandum-of-cooperation-to-promote-efficient-safe-and-sustainable-transport-and-trade-facilitation-within-their-respective-member-states/)
  names the Central Corridor with seven states and three gateway ports. SADC's [August 2024
  Executive Secretary report](https://sadc.int/sites/default/files/2025-07/ES%20Report%20book%20with%20covers%20F.pdf),
  as indexed, says the expanded Central agreement filled the vacuum of the moribund Dar charter;
  this describes institutional evolution, not a demonstrated identity of every physical route.
  The historical [UN corridor report](https://www.un.org/ohrlls/sites/www.un.org.ohrlls/files/lldcs_publications/corridor-report-_-final-_un-ohrlls_28may2020.pdf)
  separately lists the two institutional agreements. Hold both records, show the relationship as
  CONFLICTED/UNRESOLVED, and obtain the current agreement and route-variant mapping before merging.
- **C17 — CONFLICTED spelling/identity.** The SADC 2012 cluster list prints **Mulanje** and its map
  labels **Malanje**. The indexed [SADC 2013 status report](https://tis.sadc.int/files/3413/7992/2928/SADC_Regional_Transport_Corridors_Status_and_Progress_Report_2013.doc)
  calls a corridor **Luanda (Malange)**. These are different printed versions, and a similarity in
  spelling does not prove an alias or rule out Malawi's Mulanje. The 2013 original remains an
  index-only lead. Preserve all variants and request SADC's authoritative clarification; no
  geographic reassignment or separate-row creation has been assumed.

## 3. Completed reviews: M01–M04

Dimension codes follow the prior Phase A2 pack: E/S/L = VERIFIED, CANDIDATE, CONFLICTED or UNKNOWN;
O is the current model assessment, not the historic source claim. `REGISTRY_VERIFIED` below means
only official crossing existence and the **two-country crossing sequence**, reversible, not full
corridor coverage. Coordinates are source reference points with unknown datum/accuracy, **never
verified truck gates**. On all four G=`NOT_STARTED`; no prospect route is confirmed and no site
geometry has been proposed yet. A separate conceptual validation method is listed for each.

### M01 — Chirundu, Zimbabwe ↔ Zambia

- **E VERIFIED; S VERIFIED:** COMESA's [border profiling survey](https://www.comesa.int/wp-content/uploads/2024/02/Border-Profiling-Survey-Report_-Nov-2023.pdf)
  identifies the Zambia/Zimbabwe crossing; SADC's [2025 NSC assessment](https://www.sadc.int/latest-news/sadc-ministers-infrastructure-reaffirm-strategic-transportation-infrastructure)
  places Chirundu on the NSC. This is crossing identity, not evidence of prospect use.
- **L CANDIDATE:** [Logistics Cluster](https://lca.logcluster.org/2317-zambia-border-crossing-chirundu)
  gives 16°03′S, 28°50′E, presented to **one minute** and listed near Chirundu; position type and
  surveyed accuracy are not established. It is too coarse for a gate or queue polygon.
- **O UNKNOWN:** SADC describes Chirundu as an OSBP in its 2025 assessment and Logistics Cluster
  describes an OSBP, but current implementation by direction and freight service needs confirmation.
  This does not block GPS dwell. **REGISTRY_VERIFIED; BUILD_READY NO.**
- **Site method when authorised:** obtain both sides' gate/bridge/queue layouts; distinguish the
  bridge, truck parks and unrelated river traffic; plan traces in each confirmed direction, including
  approach congestion, bypasses and GPS gaps. Missing: route and trip counts; surveyed gate/layout,
  permissions, trace availability and approved operator-specific validation plan.

### M02 — Nakonde / Tunduma, Zambia ↔ Tanzania

- **E VERIFIED; S VERIFIED:** COMESA survey and [SADC 17 July 2026 workshop](https://www.sadc.int/latest-news/sadc-holds-series-border-workshops-roll-out-simplified-trade-regime-boosting-small)
  identify the two countries and the crossing.
- **L CONFLICTED / CANDIDATE points:** the Zambia-side Logistics Cluster
  [assessment](https://lca.logcluster.org/print-preview/2604) gives **09°19′53.2″S, 32°45′17.2″E**;
  the Tanzania-side [assessment](https://lca.logcluster.org/tanzania-united-republic-2311-border-crossing-tunduma-zambia)
  gives **−9.315646, 32.763514**. Both are labelled border locations but refer to different
  assessments/sides; they may represent different facilities, not an error. Exact feature, date,
  datum and accuracy are unknown. Neither establishes the relevant truck gates. Reconcile against
  both authorities' layouts before a proposed geometry is considered precise enough.
- **O:** SADC identifies an **OSBP** at a July 2026 event; present-day detailed freight operating
  arrangements/hours are UNKNOWN. **REGISTRY_VERIFIED; BUILD_READY NO.**
- **Site method when authorised:** obtain Tunduma/Nakonde gate and truck approach layouts and test
  both direction traces, queue/bypass and TZ/clock ordering. Missing prospect route, official
  gate-level coordinates and approved trace plan.

### M03 — Mwami / Mchinji, Zambia ↔ Malawi

- **E VERIFIED; S VERIFIED:** [SADC 30 October 2024 assessment](https://www.sadc.int/latest-news/mwamimchinji-one-stop-border-post-between-malawi-and-zambia-enhances-regional-trade)
  identifies the Zambia/Malawi crossing and its inauguration; COMESA survey also identifies it.
- **L CONFLICTED / CANDIDATE points:** Logistics Cluster's [Zambia Mwami assessment](https://lca.logcluster.org/2315-zambia-border-crossing-mwami)
  gives **13°48′30″S, 32°45′19″E**; its [Malawi Mchinji assessment](https://lca.logcluster.org/malawi-232-mchinji-land-border-crossing)
  gives **−13.795446453611513, 32.8893325839602**. They are substantially separated, with
  unspecified feature and accuracy; they could refer to different facilities or contain an error.
  Do not select either as a surveyed gate. The displayed decimal digits do not certify precision.
- **O:** SADC described a **juxtaposed OSBP** in October 2024; today's detailed freight
  implementation is UNKNOWN until confirmed. **REGISTRY_VERIFIED; BUILD_READY NO.**
- **Site method when authorised:** obtain current official surveyed gate locations on both sides,
  resolve the two point references and map T4/M12 approaches, truck parks and bypasses; plan
  direction-specific trace checks. Missing prospect route, reconciled location and approved plan.

### M04 — Kasumbalesa / Kasumbulesa, Zambia ↔ DRC

- **E VERIFIED; S VERIFIED:** COMESA survey names the Zambia–DRC crossing and SADC's
  [2024 press release](https://www.sadc.int/sites/default/files/2024-05/PRESS%20RELEASE%20Kasumbalesa%20Border%20post%20inter%20ministerial%20meeting%202024_0.pdf)
  identifies the two-sided border challenge. `Kasumbulesa` is a spelling used in the Logistics
  Cluster page title; no separate site is inferred from spelling alone.
- **L CANDIDATE:** Logistics Cluster's [border assessment](https://lca.logcluster.org/232-zambia-border-crossing-kasumbulesa)
  lists **12°16′05.0″S, 27°47′40.0″E** as a crossing location, without surveyed accuracy,
  datum or verified truck-gate identity. Do not configure a geofence from it.
- **O UNKNOWN, conflicting descriptions:** that border assessment describes separate procedures
  and a push for a true OSBP; the Logistics Cluster [customs overview](https://lca.logcluster.org/13-zambia-customs-information)
  refers to OSBP implementation at Kasumbalesa. Their currency, exact legal and freight-operational
  scope are unclear; seek authority confirmation, but do not make it a dwell blocker.
  **REGISTRY_VERIFIED; BUILD_READY NO.**
- **Site method when authorised:** map distinct national terminals, truck yards, queue and bypass
  roads; plan confirmed-direction traces and gaps/false-entry tests. Missing operator route,
  gate-precise maps, conflict clarification and an operator-specific trace plan.

## 4. Previous crossing dossiers — revised build-ready gate

B01–B05 retain their source citations and dimension classifications from the original A2 dossiers.
Prospect usage and an operator-specific trace plan are UNKNOWN for every site. The following is the
**current per-crossing gate**, not a ranking. `Location sufficient` means sourced, classified and
precise enough for a proposed two-sided freight-gate/approach geometry, not GPS field validation.

| ID / crossing | Official existence + crossing sequence | Prospect-confirmed route / direction | Location sufficient? | Prospect GPS-validation plan | BUILD_READY | Operating model |
|---|---|---|---|---|---|---|
| B01 Beitbridge | YES | UNKNOWN | NO; two differently located reference points | NO | NO | UNKNOWN; SADC sources conflict on OSBP; not a dwell blocker |
| B02 Lebombo/Ressano Garcia | YES | UNKNOWN | NO; reference point is not a gate | NO | NO | UNKNOWN; prior A2 source conflict retained |
| B03 Skilpadshek/Pioneer Gate | YES | UNKNOWN | NO; unverified point | NO | NO | UNKNOWN |
| B04 Groblersbrug/Martin’s Drift | YES | UNKNOWN | NO; no accepted gate point | NO | NO | UNKNOWN |
| B05 Oshoek/Ngwenya | YES | UNKNOWN | NO; no accepted gate point | NO | NO | UNKNOWN |
| M01 Chirundu | YES | UNKNOWN | NO; coarse point | NO | NO | UNKNOWN; OSBP historically reported |
| M02 Nakonde/Tunduma | YES | UNKNOWN | NO; points require reconciliation | NO | NO | OSBP reported July 2026; current detailed freight arrangements UNKNOWN |
| M03 Mwami/Mchinji | YES | UNKNOWN | NO; conflicting point references | NO | NO | juxtaposed OSBP reported 2024; current details UNKNOWN |
| M04 Kasumbalesa | YES | UNKNOWN | NO; point is not a gate | NO | NO | UNKNOWN; descriptions differ |

Beitbridge's operating-model conflict is deliberately **not** a build-readiness blocker. Its actual
blockers are unconfirmed prospect route, insufficient gate/approach location and absent
operator-specific validation plan. `NO` above is an evidence decision, not a claim that no GPS
equipment exists. There are no BUILD_READY crossings in this review.

## 5. Four additional Zimbabwe-related investigation leads

These four are newly admitted to the **candidate review set** because the cited official sources
identify relevant commercial/project crossings, not because the ZW prospect operator uses them.
For each, G=`NOT_STARTED`; route and GPS plan UNKNOWN, so BUILD_READY=NO. All coordinates and
truck-gate precision are UNKNOWN in this review. A site-specific plan must identify both sides,
approach queues and truck access and test real authorised traces in the actual operator direction.

| ID | Crossing and source | E / S | Operating model | Specific validation / missing evidence |
|---|---|---|---|---|
| N01 Forbes/Machipanda, Zimbabwe ↔ Mozambique | SADC's [historical FTA leaflet](https://extranet.sadc.int/french/regional-integration/tifi/sadc-free-trade-area/fta-leaflet/) names the pair; [SADC infrastructure portal](https://sipmis.sadc.int/) lists an OSBP upgrade at concept stage. | E=CANDIDATE; S=CANDIDATE pending current authority and site review | UNKNOWN; a project concept is not an operational OSBP | Verify both freight gates, Beira approach/queue and bypasses; confirm route, accurate layout and prospect trace plan. |
| N02 Nyamapanda/Cuchamano, Zimbabwe ↔ Mozambique | [SADC assessment, 24 September 2026](https://www.sadc.int/latest-news/cuchamanonyamapanda-border-post-between-mozambique-and-zimbabwe-enhances-regional-trade) identifies the two sides and commercial use. | E=VERIFIED; S=VERIFIED for the crossing only | UNKNOWN; assessment discusses CBM and OSBP progress, not a confirmed current model | Survey both gates and approaches, queues and local/bypass movements; confirm prospect route and plan. |
| N03 Plumtree/Ramokgwebana, Zimbabwe ↔ Botswana | SADC's [2019 infrastructure assessment](https://www.sadc.int/sites/default/files/2021-07/SADC_Regional_Infrastruture_Development.pdf) names the pair as a feasibility project; indexed extract only. | E=CANDIDATE; S=CANDIDATE pending current primary confirmation | UNKNOWN; feasibility does not establish an operating OSBP | Obtain current pair/road identity and both gate and queue layouts; confirm prospect route and plan. |
| N04 Kazungula Bridge OSBP, Botswana ↔ Zambia | [SADC commissioning, 11 May 2021](https://www.sadc.int/latest-news/us259m-kazungula-bridge-and-one-stop-border-post-commissioned-paving-way-enhanced-sadc) names the Botswana–Zambia crossing and commissioning. | E=VERIFIED; S=VERIFIED for Botswana ↔ Zambia only | OSBP commissioned 2021; current freight implementation UNKNOWN | Distinguish Botswana–Zambia bridge from other Kazungula crossings; map both bridge gates and queues, confirm actual route and plan. |

## 6. Data needed from ZW prospect operator

No assumption that any examples are used. Please provide one row per **actual crossing and
direction** over a common representative period; include other crossings and cross multiple borders
as separate rows. Trips/month = completed truck crossings, not planned trips. State period, fleet
scope, seasonal peaks and whether empty returns are included. Distinct-truck count is separate from
trip count. A role-based operator contact is sufficient; no personal name or driver identity is
needed in this engineering artefact. No raw tracks need to be sent for the route-ranking step.

**Common period:** __________  **Fleet coverage / data gaps / empty returns:** ____________________

| Origin → destination | Border post, both sides if known | Direction | Completed crossings / month | Distinct trucks | Operator contact role / permitted channel | GPS / trace availability: yes / no / unknown; device, sampling interval, period and consent/access constraints if known |
|---|---|---|---:|---:|---|---|
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

Separately, if trace validation is later considered: which directional trips and queue/bypass cases
can be shared with informed consent; who controls and can approve them; collection interval and
accuracy; GPS gaps/offline clock behavior; retention, access and redaction restrictions; and who
can review site layouts and sign off. Providing these answers is not consent to collect traces or a
pilot commitment.

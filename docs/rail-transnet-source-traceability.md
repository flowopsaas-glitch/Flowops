# Transnet rail source traceability

## Purpose and limits

This is an evidence register for the Transnet rail material supplied in this
session. It is not a legal interpretation, operational instruction, capacity
allocation, or approval to act on behalf of Transnet or a Train Operating
Company (TOC). No business rule below should be treated as production
configuration until its authoritative source, effective date, and applicability
are confirmed by Transnet and the relevant operator.

The user identified an intended scope of 11 private rail companies. The supplied
material does not establish the identities of those companies or that there are
exactly 11 current access holders. Do not create or assign operator records from
TOC column numbers.

## Source register

| ID | Supplied source | Evidence visible in the supplied text | Assessment |
|---|---|---|---|
| S1 | Transnet Network Statement, Volume 4, September 2026; complete 203-page text extract later supplied as S11 | Cover/preface identifies the volume and date. The full text includes chapter 4 capacity declarations, section-level network-register references and capacity-allocation process, as well as chapters 5-7. Preface says the regulatory environment is developing, the statement may be amended, and notice is to be published. | TRIM-attributed v4 source provided in full text form. It is expressly subject to revision; retain version/effective-date context. It does not replace operator-specific executed agreements or orders. |
| S2 | Rail Access Agreement | Form identifies TRIM and an Access Seeker, with the Access Seeker name and registration number left as placeholders. Contents list access conditions, services, approved cargo, trains, fees, invoicing, security, safety, representatives, compliance, Section 37(2), insurance, audit, indemnity, breach, force majeure, dispute and notices clauses. | Template/form only in the supplied copy. It is not evidence of an executed agreement for any operator. |
| S3 | Capacity Statement workbook text | Selected view: FY29/30, General Freight: Johannesburg to Durban; section-level capacity fields; explicit warning that TOC allocation columns are hidden. The `Capacity_DB` extract contains year/route/section and TOC 1-15 allocation columns. | Useful as a reference-data extract, but the displayed selection is not a verified entitlement for a named operator. TOC 1-15 labels cannot be mapped to legal entities from the supplied text. |
| S4 | KPI workbook text, including the later 188-line extract; user confirms this is the approved KPI workbook | Sheets include `Current KPI Framework`, `Future KPI Framework`, and route/path-specific sheets. The future framework labels `NRP` as under development and `Pilot` as not currently measured. Route sheets include baseline/target/comment values for Ore, Manganese, Magnetite, Musina-Pyramid/Hoedspruit, Vereeniging/Danskraal-East London, Mafikeng-Beaconsfield/Potch, Lephalale-Richardsbay, Johannesburg-Durban, Rayton-Komatipoort/Richards Bay, and Johannesburg-Cape Town. | Approval status is confirmed by the user's statement, not independently verified from the text extract. The extract itself does not show issuer/approval record, controlled version, effective period, baseline period, calculation details, or operator scope. Values such as `1.129861111` have no explicit unit in the route sheets, despite the general KPI framework naming average transit time in hours. NRP/Pilot measures remain explicitly under development/not currently measured. Treat the supplied current framework and route targets as approved source material, but do not infer operator-specific commitments or computed KPI results where scope, period, units, or definitions are not explicit. |
| S5 | Annexure 18 occurrence-management roles and costs excerpt pasted in the request | Three tables cover occurrence responsibilities, negligence-based costs, and theft/vandalism/force-majeure cost accountability. The text says it still refers to Transnet and will be amended once the IM is fully established; it also marks matters for inclusion in interface agreements. | Provisional excerpt. Not sufficient to configure live incident command, liability, or cost allocation. The original issued annexure and operator-specific interface agreements are required. |
| S6 | `Annexure33a_NSver.4(1).xlsx`, sheet `_00750_Report_Train_Route`; supplied workbook text reports used range A1:S251679 | 19 columns: Origin, Train, NODE_Seq, ENROUTE_Corridor, station/siding, arrival/departure times, point-to-point runtime, standing time/reason, destination, origin departure/destination arrival, schedule, frequency, train type, train throughput runtime, departure-day offset, distance. The used range corresponds to 251,678 data rows plus header; prior parser validation found all rows had 19 tab-separated fields. | This is Annexure 33a point-to-point reference timetable data, not Annexure 33b capacity allocation. Its filename refers to NS v4 but the pasted workbook text does not establish issue date, validity dates, update process, live-running status, or any operator's approved train path. It has not been loaded into the application database. |
| S7 | Unofficial / placeholder operator roster pasted by the user; cites public news reporting from May-June 2026 | Lists ARC South Africa, Barberry, Grindrod, Interlinks, IRACEMA, Menar (Menar Ports & Rail/MPR), Minrail, Motheo Logistics, Sharp Logistics, The Railway Corporation, and TLD Marine (incl. MSC). Reports 11 private TOCs, ~24Mt/year initial aggregate capacity, and Menar's 8.6Mt figure. | Explicitly not sourced from a TRIM-issued document and explicitly not authoritative. It lacks verified legal names, TRIM/TOC IDs, capacity-column mappings, executed agreements, train-path dates, route assignments and signed interface agreements. Names, relationships, timing and tonnage remain reported claims, not tenant or entitlement data. Retain only as a research lead; replace/verify from TRIM-issued sources before operational use. |
| S8 | Annexure 33 — Network Register, June 2026 v0.3, dated June 26, 2026; supplied text says issued by Transnet Rail Infrastructure Manager and applicable to 2026/27 timetable | Supplied sections 1-4 describe purpose and validity; theoretical/practical, lost, operational, allocated and spare capacity; daily/weekly resolution; relation to Annexures 33a/33b; and infrastructure availability caveats. It says validity follows Network Statement v4, identifies Annexure 33b as the capacity workbook, lists ten routes (with items 9 and 10 duplicated in the supplied text), and excludes PRASA and other Infrastructure Manager infrastructure. | TRIM-issued source as represented in the supplied text, with stated 2026/27 applicability and v4 linkage. The original controlled document and Annexure 33b workbook are not attached here, so authenticity, full workbook values/formulas and any later correction remain to be verified. It describes capacity methodology and scope; it does not identify each of the 11 legal entities or establish their actual section-level allocations/train paths. The duplicate route entry should be verified against the original. |
| S9 | Annexure 29b — Network Capacity Statement December 2024 (Final, Ver 2), dated February 4, 2025; supplied text attributes it to Transnet Rail Infrastructure Manager | States applicability to the 2024/25 timetable and that slot applications for 2025/26 opened with the relevant Network Statement. Defines existing/committed capacity, including Rail Access Agreements concluded under the current access regime; describes capacity factors and bottleneck sections; reports 209.2 million tons and 631 weekly slots/direction in its table 3.1; describes spare capacity, recovery/redundancy and infrastructure scope; anticipates a future route/section declaration through Annexure 33. | Historical capacity statement, not the current 2026/27 section-by-section register. Its date/timetable scope must be retained when citing its figures. It is useful for understanding prior capacity-allocation concepts and as-of-period declarations, but its aggregate figures do not establish current capacity, current operator allocations, or present availability. Current Annexure 33 (S8) points to the 2026/27 Annexure 33b for section-level capacity. |
| S10 | Annexure 33b Capacity Statement workbook text, 1,067-line extract pasted by the user | Shows sheets `Capacity Statement`, `Capacity_DB`, and `Lists`. The selected view is FY29/30, General Freight: Johannesburg to Durban, capacity factor 0.65, route spare capacity 49 and bottleneck Chailey (I)-Dalton (E). Section rows include theoretical/practical daily capacity, paths lost to TSR/MA, recoveries, daily availability, weekly practical paths, TOC 1-15 allocation fields, weekly allocations/spare and constraint indicator. `Lists` names FY26/27 through FY30/31 and multiple routes. | This remains an extract truncated at 1,000 rows, despite the newer full Network Statement text. In visible selected-route rows the TOC 1-15 values are zero; no field-level definitions or effective allocation source were supplied. The full Network Statement v4 (S11 §§4.2.5, 4.8.3.3-4) says section capacity/allocation is published while actual contracted Train Paths are confidential and declared to the TER; therefore do not infer the meaning of these anonymous columns or assume a public operator-to-column crosswalk exists. Do not infer route capacity is unallocated from the visible zeroes, or treat the 49 route spare value as an operator entitlement. |
| S11 | Transnet Network Statement, Volume 4 — September 2026, 203-page text extract supplied by the user as the approved original | Includes the table of contents and chapter 4.2/4.3/4.8 capacity clauses. Section 4.2.5 describes Annexure 33 as section-by-section capacity, operator allocations, reductions and spare capacity; 4.2.6 points to Annexure 33b. Section 4.3.8.2-5 identifies Annexures 33/33a/33b as annual timetable calculation and track-occupancy bases, with quarterly review/addenda. Section 4.8.3.3 says actual contracted Train Paths are confidential and will not be publicly available, with total and uncommitted capacity declared to the TER; 4.8.3.4 says application-available capacity is in the Annexure 33b for v4. | The attachment's title and body identify it as the full Network Statement v4, not the standalone Annexure 33b Capacity Statement workbook. It is strong source evidence for policy and confidentiality boundaries, but does not contain the complete section-level 33b data or resolve S10's zero values. User confirmation calls it the approved original; keep that as user-confirmed provenance and do not mislabel its document identity. |
| S12 | Rail Access Agreement text extract, 4,568 lines; supplied as a Transnet Rail Infrastructure Manager agreement form | Front page identifies TRIM and leaves Access Seeker name and registration number blank. Clauses 3.1-3.3 describe signature, conditions precedent, a blank Services Commencement Date and 15-contract-year initial term. Clauses 5-6 incorporate the Network Statement and describe access as the allocated Slot(s), subject to agreement, interface agreements and approved cargo. The contents include fees, invoicing, financial arrangements, security, safety, audit, insurance, breach, dispute and confidentiality. Clause 45 gives the Network Statement precedence in a conflict. Annexure A (Allocated Slots) is blank in the supplied text; Annexure B lists cargo categories; other annexures include charges, bank details, Section 37(2), security plan and insurance material. | Agreement form, not an executed operator agreement: Access Seeker name/registration and service start date are blank; Annexure A contains no slot data; signature blocks and company fields are uncompleted. No signature date, conditions-precedent completion, operator identity, route/cargo selections, allocated paths or filled commercial schedules are evidenced. Useful as the contract structure/source map, but it does not prove any of the 11 operators' rights or allocations. Treat contractual clauses as draft/template evidence until TRIM confirms this is the operative template and provides each signed, completed agreement and amendments through an authorized channel. |

## Requirement-to-evidence matrix

| Capability area | What the supplied evidence supports | Source status / limitation | Evidence required before production rules or company setup |
|---|---|---|---|
| Network reference and corridor data | S1 chapters 1-2 cover general information, routes, line classification, maintenance/shutdowns, network security and corridor descriptions. S8 identifies Annexure 33 as a 2026/27 timetable reference and states it covers TRIM-owned/operated infrastructure, excluding PRASA and other Infrastructure Managers. | S1 is subject to change. S8 is supplied as June 2026 v0.3 and says it is valid in line with Network Statement v4; the original controlled copy and any later corrigenda are not attached. Its stated infrastructure scope means the register must not be represented as a complete map of all South African rail infrastructure. | Confirm the controlled S1/S8 revisions and any corrigenda. Obtain the official network register download and route/section identifiers, current line restrictions, shutdown notices, relevant other-Infrastructure-Manager interfaces, and superseding notices. Scope data and maps explicitly to the responsible Infrastructure Manager. |
| Operator identity and access rights | S1 chapter 3 covers access requirements; chapter 4 covers capacity application, assessment, contract finalisation, allocation priorities, dispute resolution, deviation, reduction and utilisation. S2 and S12 provide Rail Access Agreement form structures. S7 supplies 11 publicly reported trading names as an unofficial research lead. | S2/S12 leave Access Seeker identity fields blank; S12 also leaves commencement date and Annexure A allocated slots blank. S7 expressly disclaims TRIM provenance and authority. None establishes verified legal entities, TRIM identifiers, executed agreements or access rights. | For every intended company: TRIM-issued roster with legal name, registration number and identifier; executed Rail Access Agreement and amendments; evidence of signature, conditions precedent and effective dates; approved cargo, routes, rolling stock and services; completed allocated-slot schedules and current access status; authorized representatives. Treat S7 names only as a verification checklist. |
| Capacity and train-path entitlement | S1/S11 §§4.2.5-6, 4.3.8.2-5 and 4.8.3.2-4 plus S8 describe capacity at section/route level, allocations, reductions, spare/uncommitted capacity and the 33b application source. S8 explains theoretical/practical, lost and operational capacity at daily/weekly resolutions. S8 states that commitments include existing agreements and current-process Rail Access Agreements; lawfully terminated agreements may release capacity. S9 documents an earlier aggregate declaration and capacity framework for 2024/25 and 2025/26 application periods. S10 exposes section-level fields, anonymous TOC 1-15 columns and FY/route lists. | S9's 209.2Mt and 631 weekly slots/direction figures are historical. S10 is truncated; its visible FY29/30 Johannesburg-Durban rows show zeroes in the anonymous TOC columns, but that does not establish actual awards or prove capacity is unused. S11 §4.8.3.3 expressly treats actual contracted Train Paths as confidential and says total/uncommitted capacity is declared to the TER; do not assume a public operator-to-column crosswalk is available or disclose actual paths. The summary's 49 route spare figure is not an operator entitlement. | Obtain the complete, controlled v4 Annexure 33b application-available capacity data, including all section/route/year records, formulas and metadata; TRIM confirmation of the extract's meaning and effective period; each operator's own executed agreement and authorized award/path information through an appropriate confidential channel; and authoritative changes/termination notices. Do not require publication of other operators' actual paths. |
| Timetable and train workings | S1 chapter 6 contents identify pre-production scheduling, day-of-operation, post-production reconciliation and performance management. S8 states that Annexure 33a includes station-to-station running times, distances and scheduled frequency/day, to inform capacity applications and MTS train paths. S6 is the v4-named Annexure 33a workbook text and contains those reference fields. | S8 characterizes Annexure 33a as application/reference information, not a live train-running feed or proof of an operator's assigned path. It cautions that running times assume the conditions under which they were determined; externalities including theft/vandalism and rolling-stock failures may prevent them being achieved. S6's filename alone does not establish its official issue/validity period. | Confirm the official Annexure 33a issue/validity period and obtain official updates, plus operator-specific approved MTS path and day-of-operation train orders, amendments, cancellation/re-schedule rules, actual movement feed and operational interface specification. Do not present reference running time as actual or guaranteed running time. |
| Network availability and route disruptions | S8 flags low reliability/unavailability in affected areas associated with theft/vandalism, delays/stoppages, possible alternative routing and longer running times, and possible diesel propulsion when electric traction is unavailable. It specifically identifies Leeuhof-Warrenton via Klerksdorp and Thabazimbi-Rustenburg as critical sections, and says the former can be rerouted via Kroonstad/Bloemfontein while the latter has no alternative route. | These are source-stated network caveats, not live state, service guarantees, a route authorization, or current incident bulletin. The supplied text does not state the current status or validity of any restriction/rerouting. | Obtain authoritative current TSR, infrastructure availability, closure, reroute authorization, traction/power status and incident feeds, with timestamps, affected sections, authority, expiry/revision process and operator notification evidence. Any reroute or propulsion decision must follow approved operational control procedures. |
| Day-of-operation and schedule changes | S1 chapter 6 lists day-of-operation and post-production reconciliation. Its annexure list names Annexures 20a/20b for cancel/re-schedule and reasons, 21 clearinghouse, 37 monthly order, and 38 weekly train-path order. | Only the list of annexures was supplied, not the full procedures or the operator-specific orders. No event trigger, acknowledgement SLA or allowed transition is established here. | Provide the current full Annexures 20a/20b, 21, 37 and 38, plus current train orders, escalation/communications protocol, and any production API/EDI specifications. |
| Occurrence management and cost accountability | S1 lists Annexure 18 and Annexure 41. S5 provides a provisional responsibility and cost matrix; S1 lists Annexure 36 Emergency Response Plan and Annexure 24 Interface Management Agreement. | S5 expressly says it will be amended and points to interface agreements. Its cost columns depend on causes/parties (including negligence) and cannot be converted into automatic liability decisions from the excerpt. | Obtain the issued/current Annexure 18, complete Annexure 41 Occurrence Reporting Procedure, Annexure 36 Emergency Response Plan, Annexure 24 Interface Management Agreement, and each operator's signed interface agreement with contacts, authority, escalation, evidence, investigation, cost-review and dispute procedures. Require authorised human determination for cause/liability unless a signed rule explicitly permits automation. |
| Handshake and disputes | S1 lists Annexures 28 Daily Handshake Process, 35 TRIM Dispute Resolution Process and 39 Resolve Handshake Disputes. | The full procedures are not present in the supplied excerpts. The existing application handshake feature must not be assumed to match the current Transnet process without a clause-by-clause review. | Provide current full annexures and applicable executed interface/Access Agreement clauses, including required records, deadlines, sign-offs, resolution authorities and appeal routes. |
| Safety, rolling stock and competency | S1 chapter 3 contents include rolling-stock requirements; chapter 6 includes regulatory aspects. The annexure list names Annexures 19a/19b/19c safe movement/train working rules, Annexure 25 self-screening, Annexure 26 environmental analysis and Annexure 27 risk analysis guidelines. S2 contents include security, safety communications and Section 37(2). | Contents alone do not define operator-specific approvals, data fields, validity periods or evidence acceptance. | Obtain current full safety/operating annexures, operator safety permits and approvals, approved rolling-stock register/configurations, competency/medical evidence requirements, executed Section 37(2) agreements, and document owners/renewal rules. |
| Fees, ancillary services and billing | S1 chapter 5 covers services, fees and charges; chapter 7 covers ancillary facilities and operations services. S2 and S12 include access fees, additional charges, invoicing/payment and financial arrangements. S12 incorporates charge and bank-detail annexures. S1 lists Annexure 40 TRIM Ancillary Services Catalogue. | S12's charge schedules are not completed with operator-specific amounts in the supplied text; it is unsigned. No company tariff, signed charge schedule or actual invoice/usage evidence was supplied. | Obtain the current tariff/access-fee schedule, executed operator-specific pricing/financial schedules, full Annexure 40, chargeable service definitions, measurement/approval rules, taxes, billing cycles, payment terms and dispute/credit rules. |
| KPIs and performance | S1 chapter 6.7 lists performance management. User confirms S4 is the approved KPI workbook. It gives current measures (scheduled throughput, TSR extent/count, manual authorisations, track quality and traction measures), route/path-specific baseline and target values, and future measures (entry/exit punctuality, delay attribution, slot changes/cancellations, IM obligations and train-control costs). | Approval is user-confirmed; the pasted text does not show its approval record, controlled version, or effective date. S4 itself labels some measures NRP or Pilot; future rows include an unresolved `xx days` threshold for cancellation. Route sheets do not state baseline/target period or units for numeric transit-time values; for example, values such as `1.129861111` must not be silently interpreted as days or hours. Attribution and reporting frequencies are shown but calculation contracts/data feeds are not supplied. Route and path names alone do not establish which of the 11 operators a target applies to. | Retain this workbook as the approved KPI source. For KPI calculation/configuration, obtain its controlled version/approval record and effective date, plus definitions, formulae, explicit units and time conversions, baseline/target periods, event-time and tolerance rules, denominators/exclusions, attribution adjudication, route/operator scope and mapping, source systems, data quality rules, reporting cutoffs, owner/sign-off, and confirmation of which measures/targets are active versus NRP/Pilot. |
| Operator-specific tenant partitioning | The user's intended deployment is for 11 private companies. S7 lists 11 publicly reported names, but labels itself unofficial and placeholder-only. S3 exposes anonymous TOC-numbered columns. | No authoritative source identifies the legal companies or links TOC numbers/capacity columns to tenants. The reported Menar aggregate tonnage and reported corporate relationships are not route/path entitlements. No access-control mapping is justified yet. | Obtain a TRIM-issued roster and approved crosswalk from each legal entity to TRIM/TOC identifier(s), agreements, users, routes, capacity/path orders and data-access boundaries. Confirm legal-name variants and the reported TLD Marine/MSC relationship. Keep shared infrastructure references separate from each operator's confidential commercial allocation and evidence. |

## Additional source documents still needed

### Priority 1 — required to identify and configure the operators

1. A TRIM-issued authoritative roster of the intended private TOCs (legal names,
   registration numbers, approved identifiers) and a Transnet-confirmed mapping
   of each operator to the workbook's TOC allocation column(s). The user supplied
   an unofficial public-reporting-based candidate list (S7); it is useful for
   checking names but is not a substitute for this source.
2. Each operator's executed Rail Access Agreement, amendments and completed
   access/cargo schedules. S2/S12 are forms; S12's Access Seeker fields,
   commencement date, signature blocks and allocated-slot Annexure A are
   unfilled.
3. Current approved train-path allocations, route/section entitlements, weekly
   or monthly train orders, amendments, and effective dates per operator.
4. Executed operator-specific interface agreements, including the final
   occurrence-management and emergency-response responsibilities.

### Priority 2 — referenced operational procedures and source data

5. The controlled original/corrigenda for Annexure 33 Network Register June
   2026 v0.3 and the complete Annexure 33b Capacity Statement workbook with
   formulas, metadata, all relevant fiscal years/routes, section keys, TOC
   allocation data and TRIM-confirmed TOC mapping. S10 is only a 1,067-line
   extract truncated at 1,000 rows. Confirm whether its visible zero TOC
   allocations are placeholders, future planning values or actual allocation
   data and the workbook's effective period. Verify the duplicated route 9/10
   entry in S8 against the controlled original.
6. Full current Annexure 41 Occurrence Reporting Procedure, Annexure 36
   Emergency Response Plan, Annexure 24 Interface Management Agreement, and
   current Annexure 18 occurrence-management document. The S5 excerpt is not a
   substitute for these controlled documents.
7. Full current Annexures 20a/20b, 21, 28, 35, 37, 38 and 39 for
   cancellation/re-scheduling, clearinghouse, handshake, dispute and train-order
   workflows.
8. Full current Annexure 40 Ancillary Services Catalogue and the effective
   tariff/charge schedules incorporated into each executed agreement.
9. Current safe-working, rolling-stock, safety approval, competency and
   Section 37(2) documents applicable to each operator and route.
10. An authoritative Annexure 33a issue and validity record and the official
    source of train/path orders or operational events. The pasted schedule alone
    does not establish live status.
11. Full Annexure 17 investment plan and Annexure 42 Customer Collaboration
    Policy if these are in scope for the intended workflows. The supplied
    Network Statement annexure list places Annexure 17 under network
    infrastructure and does not list Annexure 42 in the shown 2026/27 list;
    obtain the applicable controlled version rather than assuming inclusion.

### Priority 3 — only for KPI automation and integrations

12. The controlled version/approval record and effective period for the
    approved KPI workbook; KPI calculation specifications for current vs future
    measures, including the still-unspecified cancellation threshold;
    route-specific baseline/target periods; explicit units for throughput
    values; and the operator/route scope to which each target applies.
13. Interface/data-feed specifications and authorised access for the systems
    that provide allocations, train orders, actual running, TSR/track data,
    occurrence records, invoices and KPI source measurements.
14. Named data owners, correction/attestation processes, retention rules,
    permitted disclosures and audit requirements for each source.

## Implementation guardrails (no behaviour change authorized by this document)

- Store each source with issuer, exact title/identifier, version, issue and
  effective dates, received date, scope, confidentiality, hash, supersedes/
  superseded-by links and a controlled original file.
- Preserve an exact reference from every configured rule or KPI to its source
  clause, page, table, sheet, and row; keep extracted text separate from
  approved operational configuration.
- Model shared infrastructure/reference data separately from operator-owned
  agreements, allocations, train orders, occurrences, billing and evidence.
- Treat a draft, placeholder, hidden workbook field, pilot, NRP, or
  “to-be-included in interface agreement” item as unapproved until the relevant
  authority supplies confirmation.
- Do not infer legal identity from `TOC 1`-`TOC 15`, infer access rights from
  spare capacity, calculate fault/liability from the excerpt alone, or describe
  schedule rows as real-time train tracking.
- Require version-aware import validation, review/approval before publication,
  immutable import provenance, tenant/access tests, and reconciliation against
  the authoritative source before relying on records operationally.

## Source references

- **S1 — Network Statement, Volume 4, September 2026:** cover and preface;
  printed pages 2-6 for status caveats and annexure list; contents on printed
  pages 2-4 identify chapters 2-7. Full text supplied separately as S11.
- **S2 — Rail Access Agreement:** supplied form cover and contents, printed
  pages 1-3. Placeholder Access Seeker name/registration fields are present.
- **S3 — Capacity Statement:** supplied `Capacity Statement` and
  `Capacity_DB` sheet text. The selected view and hidden-column notice are
  visible in the supplied extract; spreadsheet page numbers are not available.
- **S4 — KPI workbook:** supplied `Current KPI Framework`, `Future KPI
  Framework`, and route/path sheets, including the 188-line extract with
  route-specific baseline/target/comment rows. The user confirms this is the
  approved KPI workbook. Its approval record, controlled version, effective
  period, and page numbers are not available in the text extract.
- **S5 — Annexure 18:** user-pasted sections 1.1.1.1-1.1.1.3. The original
  controlled PDF, issue date, and page numbers were not supplied with this
  excerpt.
- **S6 — Annexure 33a:** supplied workbook text identifies
  `Annexure33a_NSver.4(1).xlsx`, sheet `_00750_Report_Train_Route`, used range
  A1:S251679. The original workbook issue/effective dates and update metadata
  were not established by the text extract.
- **S7 — unofficial / placeholder operator roster:** user-pasted summary of
  public news reporting from May-June 2026. It explicitly states it is not
  TRIM-sourced or authoritative and identifies its own legal-entity, identifier,
  allocation, corridor, agreement, path-date and interface-agreement gaps.
- **S8 — Annexure 33 Network Register:** user-pasted text titled June 2026 v0.3,
  dated June 26, 2026, attributed to TRIM, applicable to the 2026/27 timetable
  and stated to be valid in line with Network Statement v4. The original
  controlled file, appended 33b workbook and any corrigenda were not supplied.
- **S9 — Annexure 29b Network Capacity Statement:** user-pasted text titled
  December 2024 (Final, Ver 2), dated February 4, 2025, attributed to TRIM and
  applicable to the 2024/25 timetable, with 2025/26 slot-application context.
  Its aggregate capacity figures are historical and must not be applied as
  current allocations.
- **S10 — Annexure 33b Capacity Statement:** user-pasted 1,067-line workbook
  text extract with `Capacity Statement`, `Capacity_DB`, and `Lists` sheets.
  The `Capacity_DB` output explicitly says it is truncated at 1,000 rows. The
  complete workbook, version/approval metadata and operator-column crosswalk
  were not supplied.
- **S11 — Network Statement:** user-described as the approved original;
  203-page text identifies itself as *Transnet Network Statement, Volume 4 —
  September 2026*. This is the full statement text, not the standalone Annexure
  33b workbook. Key capacity confidentiality/availability clauses cited above
  are printed §§4.2.5-6, 4.3.8.2-5 and 4.8.3.2-4.
- **S12 — Rail Access Agreement form:** user-pasted 4,568-line text with
  unfilled Access Seeker identity and service commencement fields, blank
  allocated-slot Annexure A, and uncompleted signature blocks. No operator-
  executed agreement or completed commercial schedule is evidenced by this
  extract.

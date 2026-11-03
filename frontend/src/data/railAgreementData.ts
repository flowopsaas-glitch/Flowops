/**
 * Annexure 15 — Rail Access Agreement form (TRIM ↔ Access Seeker).
 *
 * Transcribed from `sources/Annexure 15_Rail Access Agreement (1).pdf` (95 pages, 49 clauses,
 * Annexures A–J). Verbatim clause text is preserved; page/clause cites are given per row.
 *
 * THE CENTRAL CAVEAT, and why this module exists at all:
 * the supplied instrument is an UNEXECUTED FORM. The Access Seeker's name and registration
 * number are literal placeholders, the Services Commencement Date is "[◾]", Annexure A
 * (Allocated Slot/s) is blank, and the signature blocks are uncompleted. Nothing in this file
 * evidences an executed agreement, an allocated train path, or any operator's rights. It is the
 * contract *structure* a TOC will be asked to sign — useful for readiness, not for entitlement.
 *
 * Annexure C carries the stale drafting heading "SECTION TO BE FULLY UPDATED WITH FINALISED
 * CHARGES". Audit finding (2026-11-03): despite that heading, all ten rate rows reconcile exactly
 * against NS V4 Table 17 — the tariff in force from 1 August 2026. The heading is therefore a
 * leftover staging note in the form, not evidence that the rates are superseded. Even so, the
 * controlled billing source is Table 17 (/rail/tariffs); this view cites it rather than the form.
 */

export const agreementSource = {
  file: "sources/Annexure 15_Rail Access Agreement (1).pdf",
  sha256: "e525bb447ad891a7a007a98fb4da78dd5c97cfebb15d8cc8f272ba270208a953",
  pages: 95,
  title: "Rail Access Agreement",
  parties: {
    im: "TRANSNET RAIL INFRASTRUCTURE MANAGER, an operating division of TRANSNET SOC LTD (Registration No: 1990/000900/06) (the “IM”)",
    seeker: "[______________□] (Registration No: [□]) (the “ACCESS SEEKER”)",
  },
  clauses: 49,
  annexures: "A–J",
  executed: false,
  executedEvidence:
    "Access Seeker name and registration number are unfilled placeholders; Services Commencement Date is “[◾]”; Annexure A (Allocated Slot/s) carries no data; signature blocks are uncompleted. No operator-executed version or amendment is supplied.",
};

/** Highest-risk clauses a TOC should read first, in the order they bite. */
export const keyClauses = [
  {
    ref: "3.2",
    title: "Services Commencement Date is blank",
    text: "Transport Services shall commence on and with effect from the Services Commencement Date, this date being [◾].",
    why: "The date that starts every service obligation is a placeholder in the supplied form. Nothing can be scheduled against it until an executed copy fixes it.",
  },
  {
    ref: "3.3",
    title: "15 Contract Years, then terminate",
    text: "The Agreement shall endure for an initial period of 15 (fifteen) Contract Years following which it shall terminate, unless renewed in terms of clauses 3.4 and 3.5 below.",
    why: "A long initial term with renewal by notice, not automatic rollover. Renewal requires written notice at least 6 months before the Expiry Date (clause 3.4).",
  },
  {
    ref: "4.1",
    title: "Seven suspensive conditions, 3 months before commencement",
    text: "Save for this clause 4 (Conditions Precedent) and clauses 1, 29, 33, 34, 35, 36, 38, 39, 43, 44, 45, 46, 49 and 50 which shall be of immediate force and effect, this Agreement is subject to the fulfilment of the following suspensive conditions by no later than 3 calendar months prior to the stated Services Commencement Date, this date being [◾].",
    why: "Most of the agreement is suspended until seven conditions are met — insurance proof, NS v4 annexures (social development, signed Interface Agreement, Security Plan, Risk Analysis, Environmental Plan), RSR permit, credit checks and Guarantee, locomotives/wagons approved by the RSR, third-party cargo-handling confirmation, and concluded access with any other infrastructure manager (including cross-border).",
  },
  {
    ref: "45",
    title: "Network Statement wins conflicts",
    text: "The Network Statement takes precedence over this Agreement in the event of a conflict.",
    why: "Where the negotiated agreement and the Network Statement disagree, the Statement governs — so NS V4 changes can move obligations without renegotiation.",
  },
  {
    ref: "Annexure C",
    title: "A staging note that no longer applies",
    text: "SECTION TO BE FULLY UPDATED WITH FINALISED CHARGES",
    why: "This heading precedes the access-fee table in the form, but all ten rows reconcile exactly against NS V4 Table 17 (in force 1 Aug 2026). Treat the heading as a leftover drafting note; cite Table 17, not the form, as the controlled billing source.",
  },
];

export const conditionsPrecedent = [
  { ref: "4.1.1", condition: "The Access Seeker must provide the IM with proof of liability insurance." },
  { ref: "4.1.2", condition: "Submit all relevant annexures as required by the Network Statement version 4, including but not limited to the social development annexure, signed Interface Agreement, Security Plan, Risk Analysis and Environmental Plan." },
  { ref: "4.1.3", condition: "Obtain the Rail Safety Regulator permit to operate trains on the allocated route/s." },
  { ref: "4.1.4", condition: "Undergo the necessary credit checks with the IM finance and provide the Guarantee as set out in clause 13, dependent on credit profile." },
  { ref: "4.1.5", condition: "Obtain locomotives and wagons necessary to commence operations on the allocated route/s, approved by the Rail Safety Regulator." },
  { ref: "4.1.6", condition: "Confirm in writing that the third parties responsible for handling the cargo transported on the allocated Train Path/s have the required capacity to handle the cargo at the points of origin and destination under separate contractual arrangements." },
  { ref: "4.1.7", condition: "Provide concluded rail access arrangements with any other rail infrastructure manager, including access in terms of cross border train operations." },
];

/** Clause map — all 49, grouped by what they govern. */
export const clauseGroups = [
  {
    group: "Formation of the contract",
    clauses: [
      { n: "1", title: "Definitions and interpretation" },
      { n: "2", title: "Recitals" },
      { n: "3", title: "Commencement and duration" },
      { n: "4", title: "Conditions precedent" },
      { n: "5", title: "Incorporation of Network Statement" },
    ],
  },
  {
    group: "What is being bought",
    clauses: [
      { n: "6", title: "The transport services" },
      { n: "7", title: "Approved cargo and changes to approved cargo" },
      { n: "8", title: "Trains" },
      { n: "9", title: "Performance of the services" },
    ],
  },
  {
    group: "Money",
    clauses: [
      { n: "10", title: "Access fee, additional charges and escalation" },
      { n: "11", title: "Invoicing and payment" },
      { n: "12", title: "Value added tax, other taxes and set-off" },
      { n: "13", title: "Financial arrangements" },
      { n: "36 (lender protections)", title: "Lender protections" },
    ],
  },
  {
    group: "Safety, security and compliance",
    clauses: [
      { n: "14", title: "Security plan" },
      { n: "15", title: "Safety Regulator and Access Seeker communications" },
      { n: "18", title: "Compliance with applicable laws" },
      { n: "21", title: "Section 37(2) agreement" },
      { n: "22", title: "Insurance" },
      { n: "23", title: "Right of audit" },
    ],
  },
  {
    group: "Relationships and people",
    clauses: [
      { n: "16", title: "IM representatives" },
      { n: "17", title: "Access Seeker representative" },
      { n: "25", title: "Transformation and community development" },
      { n: "34", title: "Notices and legal service" },
      { n: "35", title: "Confidentiality" },
    ],
  },
  {
    group: "Risk allocation",
    clauses: [
      { n: "19", title: "General rights and obligations of the Access Seeker" },
      { n: "20", title: "General rights and obligations of the IM" },
      { n: "24", title: "Access Seeker warranties and covenants" },
      { n: "26", title: "Infrastructure Manager warranties" },
      { n: "27", title: "Indemnities" },
      { n: "28", title: "Double recovery and mitigation" },
      { n: "29", title: "Force majeure" },
      { n: "30", title: "Breach" },
      { n: "31", title: "Limitation of liability" },
    ],
  },
  {
    group: "Disputes and boilerplate",
    clauses: [
      { n: "32", title: "Dispute resolution" },
      { n: "33", title: "Governing law and jurisdiction" },
      { n: "37", title: "Cession, delegation and assignment" },
      { n: "38", title: "Change of control and disposals" },
      { n: "39", title: "Severability" },
      { n: "40", title: "Nature of agreement" },
      { n: "41", title: "Stipulatio alteri" },
      { n: "42", title: "Whole agreement" },
      { n: "43", title: "Amendments" },
      { n: "44", title: "Waiver" },
      { n: "45", title: "Conflicts" },
      { n: "46", title: "Language of the agreement" },
      { n: "47", title: "Further assurance" },
      { n: "48", title: "Counterparts" },
      { n: "49", title: "Costs and expenses" },
    ],
  },
];

export const annexureIndex = [
  { ref: "A", title: "Allocated Slot/s", status: "blank in source" },
  { ref: "B", title: "Approved Cargo", status: "listed" },
  { ref: "C", title: "Rail Access Fee, Additional Charges and Occurrence Management Services", status: "rates reconcile to NS V4 Table 17 (heading is stale)" },
  { ref: "D", title: "Parties' Bank Details", status: "referenced" },
  { ref: "E", title: "Agreed Form of the Guarantee", status: "referenced" },
  { ref: "F", title: "Access Seeker Safety Permits", status: "referenced" },
  { ref: "G", title: "Access Seeker Consents", status: "referenced" },
  { ref: "H", title: "Standard Form Section 37(2) Agreement", status: "referenced" },
  { ref: "I", title: "Security Plan", status: "referenced" },
  { ref: "J", title: "Security plan annexed hereto", status: "referenced" },
];

export const approvedCargo = [
  "OreCore (Iron Ore)",
  "OreCor (Manganese Ore)",
  "Coal Exports NorthCor",
  "Intermodal & Motor Vehicles*",
  "Mineral Exports",
  "Grain & Tankers",
  "Other General Traffic",
  "Metro Trains & Passenger < 12 Wagons",
  "Passenger Trains > 12 Wagons",
  "Loose Locomotives",
];

/** Annexure C part A — access fee by cargo category. INDICATIVE ONLY (see annexureIndex caveat). */
export const accessFeeTable = [
  { category: "OreCor (Iron Ore)", perTrainKm: "680", perGtkCents: "3.54" },
  { category: "OreCor (Manganese Ore)", perTrainKm: "680", perGtkCents: "5.53" },
  { category: "Coal Exports NorthCor", perTrainKm: "260", perGtkCents: "6.03" },
  { category: "Intermodal & Motor Vehicles*", perTrainKm: "30", perGtkCents: "4.41" },
  { category: "Mineral Exports", perTrainKm: "30.75", perGtkCents: "9.00" },
  { category: "Grain & Tankers", perTrainKm: "30", perGtkCents: "6.96" },
  { category: "Other General Traffic", perTrainKm: "30", perGtkCents: "9.50" },
  { category: "Metro Trains & Passenger < 12 Wagons", perTrainKm: "50", perGtkCents: "0.0" },
  { category: "Passenger Trains > 12 Wagons", perTrainKm: "60", perGtkCents: "0.0" },
  { category: "Loose Locomotives", perTrainKm: "12", perGtkCents: "0.0" },
];

export const accessFeeNote =
  "The rail access fee excludes traction electricity, which is a pass-through cost to users of traction electricity. “This includes Empty wagon movements to and from workshops” (source footnote to the rate table).";

export const applicationFees = [
  { trigger: "Upon application — freight", basis: "R125 000 per Train Path, subject to annual escalation. Not refundable.", covers: "Administrative and operational activities associated with processing an individual Train Path application: site visits and inspections, technological integration, specialised due diligence, regulatory compliance and office overheads — up to the capacity allocation stage." },
  { trigger: "Upon application — passenger", basis: "R42 000 per Train Path (long distance, metropolitan and tourism), subject to annual escalation. Not refundable.", covers: "Same evaluation process as above." },
  { trigger: "Upon approval of capacity allocation", basis: "Costs as incurred, recovered on a prudent itemised cost statement.", covers: "Additional expenses beyond the application stage." },
];

/** Annexure C part E — penalties, both directions. */
export const penalties = {
  im: [
    { item: "Deviation on contractual Train Path allocation agreement", procedure: "Contract / SLA / Agreement", principle: "IM will offer the Access Seeker a replacement Train Path; if the Access Seeker does not accept it, the IM will process a credit note in favour of the Access Seeker.", charge: "Full Train Path fee refunded where the replacement is not accepted, subject to the limitation of liability clause." },
    { item: "Train Path cancellations caused by the IM", procedure: "Handshake and Clearing house Forum", principle: "IM offers a replacement Train Path; if not accepted, the IM processes a credit note in favour of the Access Seeker.", charge: "Full Train Path fee refunded where the replacement is not accepted, subject to the limitation of liability clause." },
  ],
  accessSeeker: [
    { item: "Cancellations — before the weekly Do-ability", charge: "The IM passes credit for Train Paths paid in advance if the IM is able to reallocate the Train Path to another Access Seeker." },
    { item: "Full cancellations — 72 hours before departure", charge: "The IM passes credit for Train Paths paid in advance if the Train Path is reallocated." },
    { item: "Full cancellation — within 72 hours up to scheduled departure, not due to a Force Majeure Event", charge: "The Access Seeker forfeits the access fees paid in advance (full Train Path access fee)." },
  ],
};

/** Annexure C part F — additional charges and the yard-usage rule. */
export const additionalCharges = [
  "Yard usage time exceeded",
  "Rail wagons standing (loaded or empty) in a Rail Yard exceeding yard usage time",
  "Locomotives staged between Trains in a Rail Yard",
  "Delayed arrival or departure of a Train at or from a Rail Yard, passing loop, or loading/off-loading site",
  "Cancellation of slot",
  "Overloading of rail wagons",
  "Underloading of bulk and break-bulk rail wagons",
  "Skew loading of Trains",
];

export const yardUsageRule =
  "Where an Access Seeker exceeds the standard Yard Usage Time allocation as per service design for any unplanned reason other than force majeure — such as NTG wagons, port delays, breakdowns — the Access Seeker incurs penalties for every minute exceeded in the yard. Applicable penalty charges per yard are calculated at the time of contracting and form part of the final Service Level Agreement annexed to the Rail Access Agreement.";

export const liabilityCarveOut =
  "Additional charges do not fall on the Access Seeker where the event was caused by Force Majeure and/or the acts or omissions of the IM; symmetrically, the IM is not liable where the event was caused by Force Majeure and/or the acts or omissions of the Access Seeker.";

/** How this document maps onto FlowOps, and what is still needed. */
export const readinessChecklist = [
  { item: "Liability insurance proof", flows: "Documents vault (per-tenant)", status: "customer responsibility" },
  { item: "NS v4 annexures: social development, Interface Agreement, Security Plan, Risk Analysis, Environmental Plan", flows: "Compliance document pack", status: "partially modelled — Interface Agreement content not in this repo" },
  { item: "Rail Safety Regulator operating permit", flows: "Compliance / safety module", status: "customer responsibility" },
  { item: "Credit check and Guarantee (Annexure E)", flows: "Finance", status: "out of scope for this build" },
  { item: "Locomotives and wagons approved by the RSR", flows: "Fleet register", status: "customer responsibility" },
  { item: "Third-party cargo-handling capacity confirmation at origin/destination", flows: "Partner/site register", status: "not modelled" },
  { item: "Access arrangements with other infrastructure managers, incl. cross-border", flows: "Cross-border module", status: "customer responsibility — border posts module exists" },
  { item: "Allocated Slot/s (Annexure A)", flows: "Slot allocation (/rail/slots)", status: "blocked — blank in source; requires executed agreement" },
  { item: "Finalised charges (Annexure C)", flows: "Tariffs (/rail/tariffs)", status: "reconciled — matches NS V4 Table 17" },
  { item: "Signed Interface Agreement terms (occurrence/cost responsibility)", flows: "Occurrence (/rail/occurrence)", status: "blocked — Annexure 18 excerpt only" },
];

export const agreementCaveats = [
  "The supplied instrument is an unexecuted form. It evidences the contract structure, not any operator's rights, allocations or commitments.",
  "Annexure C is headed “SECTION TO BE FULLY UPDATED WITH FINALISED CHARGES”, but its ten rate rows reconcile exactly to NS V4 Table 17 (in force 1 August 2026). The heading is a stale drafting note; NS V4 Table 17 is the controlled billing source and this view cites it rather than the form.",
  "Annexure A (Allocated Slot/s) is blank. Section-level capacity comes from Annexure 33b (/rail/slots); an individual operator's contracted train paths are, per NS V4 §4.8.3.3, confidential and not publicly available.",
  "Where this agreement conflicts with the Network Statement, the Network Statement prevails (clause 45).",
  "Clause 4.1's list of clauses of “immediate force and effect” uses numbering that does not match the printed table of contents (e.g. “33 (Dispute Resolution)”, “35 (Notices and Legal Service)”); the printed TOC places them at 32, 34 and 35. Preserved as delivered — verify against the executed original.",
];

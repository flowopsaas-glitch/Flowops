/** AUTO-GENERATED structure from sources/TRIM Network Statement 18 September 2026 (1).pdf (round 70).
 * SHA-256 6e7ad24b993df0a38065720533e16bfdf79f4bbaf68ece81435491a190798faa (203 pages).
 * "Transnet Network Statement Volume 4 – September 2026" (PDF created 2026-09-18, author Cobus Albertse TFR CPT).
 * Table 17 access fees and all charges/penalty content are verbatim from the source. */

export const statementSource = {
  file: "sources/TRIM Network Statement 18 September 2026 (1).pdf",
  sha256: "6e7ad24b993df0a38065720533e16bfdf79f4bbaf68ece81435491a190798faa",
  pages: 203,
  title: "Transnet Network Statement — Volume 4 – September 2026",
  author: "Cobus Albertse, Transnet Freight Rail CPT (PDF metadata)",
  prefaceNote:
    "Developed within a regulatory environment undergoing change; TRIM reserves the right to revise, amend, modify, update, waive, alter, re-issue and/or restate the whole or any portion of this NS, with notice to stakeholders via its website before giving effect to same.",
};

export interface StatementChapter {
  n: string;
  title: string;
  pages: string;
  sections: string[];
}

export const statementChapters: StatementChapter[] = [
  { n: "1", title: "General Information", pages: "8–35", sections: [
    "1.1 Glossary of terms and abbreviations (p8–30)",
    "1.2 Interpretation", "1.3 Introduction", "1.4 Purpose of the Network Statement",
    "1.5 SA legal aspects", "1.6 Structure of the Network Statement",
    "1.7 Validity, publication and updating", "1.8 Contacting the TRIM",
  ]},
  { n: "2", title: "Rail Infrastructure Network", pages: "36–104", sections: [
    "2.1 Introduction", "2.2 Schematics of the rail routes", "2.3 Line classification",
    "2.4 Maintenance and expansion planning", "2.5 Overall state of network security",
    "2.6 Annual maintenance shutdown", "2.7 Independent technical assessments",
    "2.8 North Corridor (p43)", "2.9 Ore Corridor (p53)", "2.10 North-East Corridor (p61)",
    "2.11 Cape Corridor (p72)", "2.12 Central Corridor (p83)", "2.13 Container Corridor (p93)",
  ]},
  { n: "3", title: "Access Requirements", pages: "105–124", sections: [
    "3.1 Introduction", "3.2 General access requirements", "3.3 General business/commercial conditions",
    "3.4 Requirements for access to the infrastructure", "3.5 Rolling stock requirements",
    "3.6 Corrupt acts and anti-corruption measures",
  ]},
  { n: "4", title: "Capacity Allocation", pages: "125–153", sections: [
    "4.1 Introduction", "4.2 Capacity definition and calculation", "4.3 Annual train path capacity planning",
    "4.4 Capacity application process (incl. 4.4.8 Train Path application process, Table 16; 4.4.9 Ad-hoc applications)",
    "4.5 Annual capacity application process", "4.6 Assessment of train path applications",
    "4.7 Access Seekers contract finalisation",
    "4.8 Capacity allocation principles, prioritisation rules and dispute resolution (p142)",
    "4.9 Long term capacity planning", "4.10 Deviation management principles",
    "4.11 Approach to reallocating reduced capacity", "4.12 Train path utilisation and reallocation",
    "4.13 Capacity allocation and transformation",
  ]},
  { n: "5", title: "Commercial Services and Charges", pages: "154–167", sections: [
    "5.1 Services (rail access, mandatory operations services, ancillary facilities, services not provided by the IM, occurrence management)",
    "5.2 Fees and charges (5.2.1 charging principles & tariff determination; 5.2.3 access tariffs Table 17; 5.2.4 invoicing & payment; 5.2.5 financial arrangements; 5.2.6 marshalling Table 18; 5.2.7 ancillary facilities; 5.2.8 occurrence management Table 19; 5.2.9 additional charges Table 20; 5.2.10 penalties Tables 21–22; 5.2.11 additional charges applicable to Access Seekers)",
  ]},
  { n: "6", title: "Rail Operations", pages: "168–195", sections: [
    "6.1 Introduction", "6.2 Regulatory aspects", "6.3 Principles of network operations",
    "6.4 Pre-production scheduling (monthly train planning)", "6.5 Day of operation",
    "6.6 Post-production reconciliation (Daily Handshake)", "6.7 Performance management (Annexure 43 KPIs, Table 23 further KPIs)",
  ]},
  { n: "7", title: "Ancillary Facilities and Operations Services", pages: "196–203", sections: [
    "7.1 Introduction", "7.2 Regulatory aspects", "7.3 Ancillary facilities services",
    "7.4 Regulated yard operations services", "7.5 Independent operations services",
    "7.6 Principles of supplying ancillary services",
    "7.7 Application process for service facilities for the timetable period 2026/27",
  ]},
];

/** 2026/2027 List of Network Statement Annexures (verbatim, chapter-grouped). */
export interface AnnexureEntry { id: string; title: string; chapter: string; have: boolean; note?: string; }
export const annexureRegister: AnnexureEntry[] = [
  { id: "44", title: "NETWORK_STATEMENT_V4 TABLE_OF_CHANGES", chapter: "1", have: false },
  { id: "1", title: "PROVISIONAL SHUT SCHEDULE FOR 2026/27", chapter: "2", have: false },
  { id: "2", title: "TRACK STRUCTURE CLEARANCES", chapter: "2", have: false },
  { id: "3", title: "TRACK STRUCTURE VEHICLE GAUGES", chapter: "2", have: false },
  { id: "4", title: "CROSSING LOOP LINES", chapter: "2", have: false },
  { id: "5", title: "LINE GRADIENTS PER SECTION", chapter: "2", have: false },
  { id: "6", title: "SIMPLIFIED CLASSIFICATION FILE", chapter: "2", have: false, note: "N1/N2 classification — pair with the Annexure 33 appended data file" },
  { id: "7", title: "RADIO COMMUNICATION SYSTEMS MAP", chapter: "2", have: false },
  { id: "8", title: "TFR TUNNEL RESTRICTIONS", chapter: "2", have: false },
  { id: "9", title: "BRIDGE CLASS AND MAXIMUM ALLOWABLE AXLE MASS", chapter: "2", have: false },
  { id: "10", title: "TFR CAS SYSTEMS", chapter: "2", have: false },
  { id: "11", title: "TFR CAS SYSTEMS ABBREVIATIONS AND DESCRIPTIONS", chapter: "2", have: false },
  { id: "12", title: "TRANSNET AND PRASA DEPOT BOUNDARIES DETAILED DIAGRAMS", chapter: "2", have: false },
  { id: "13", title: "PANTOGRAPH SPECIFICATION", chapter: "2", have: false },
  { id: "14", title: "DIESEL NOZZLE SPECIFICATION", chapter: "2", have: false },
  { id: "23", title: "SHUNTING ROLLING STOCK SPECIFICATIONS FOR YARDS", chapter: "2", have: false },
  { id: "17", title: "TRIM – 5 YEAR MAINTENANCE INVESTMENT PLAN", chapter: "2", have: true, note: "Investment Plan delivered (July 2026) → /rail/investment" },
  { id: "15", title: "RAIL ACCESS AGREEMENT", chapter: "3", have: true, note: "95-page model RAA delivered → sources/" },
  { id: "16", title: "FACULTY OF RAIL TEAM CONTACT DETAILS", chapter: "3", have: false },
  { id: "24", title: "INTERFACE MANAGEMENT AGREEMENT", chapter: "4", have: false },
  { id: "25", title: "SELF SCREENING CHECKLIST", chapter: "4", have: false },
  { id: "26", title: "ENVIRONMENTAL ANALYSIS", chapter: "4", have: false },
  { id: "27", title: "RISK ANALYSIS GUIDELINES", chapter: "4", have: false },
  { id: "28", title: "DAILY HANDSHAKE PROCESS", chapter: "4", have: false, note: "product /rail/handshake built from the DRR design; annexure itself not yet in" },
  { id: "29a", title: "NETWORK ACCESS APPLICATION FORM", chapter: "4", have: false },
  { id: "30", title: "CREDIT APPLICATION", chapter: "4", have: false },
  { id: "31", title: "TRIM NON-DISCLOSURE AGREEMENT", chapter: "4", have: false },
  { id: "32", title: "AD-HOC TRAIN PATH APPLICATION PROCESS", chapter: "4", have: false },
  { id: "33", title: "NETWORK REGISTER", chapter: "4", have: true, note: "June 2026 v0.3 delivered → /rail/register (appended data file still open)" },
  { id: "33a", title: "POINT TO POINT RUNNING TIMES", chapter: "4", have: true, note: "corpus source-of-record (251,678 rows)" },
  { id: "33b", title: "CAPACITY STATEMENT", chapter: "4", have: true, note: "delivered → /rail/slots" },
  { id: "34", title: "VOLUME CONFIRMATION LETTER", chapter: "4", have: false },
  { id: "18", title: "OCCURRENCE MANAGEMENT", chapter: "5", have: false, note: "V3 copy known (V3-07); V4 version open" },
  { id: "22", title: "LOADING PROFILES", chapter: "5", have: false },
  { id: "19A", title: "PRINCIPLES OF SAFE MOVEMENT ON RAIL (POSMOR)", chapter: "6", have: false },
  { id: "19B", title: "TRAIN WORKING RULES PART 1 -7 (TWR)", chapter: "6", have: false },
  { id: "19C", title: "GENERAL APPENDIX NO.6", chapter: "6", have: false },
  { id: "20a", title: "CANCEL OR RE-SCHEDULE ACCESS SEEKER TRAIN PROCESS", chapter: "6", have: false },
  { id: "20b", title: "CANCELLATION REASONS", chapter: "6", have: false },
  { id: "21", title: "CLEARINGHOUSE PROCESS NARRATIVE", chapter: "6", have: false },
  { id: "35", title: "TRIM DISPUTE RESOLUTION PROCESS", chapter: "6", have: false },
  { id: "36", title: "EMERGENCY RESPONSE PLAN (“TRIBUNAL PROCESS”)", chapter: "6", have: true, note: "V3 copy delivered (period caveat E-ANX36-01); V4 version open" },
  { id: "37", title: "CREATE MONTHLY ORDER", chapter: "6", have: false },
  { id: "38", title: "CAPTURE WEEKLY TRAIN PATH ORDER", chapter: "6", have: false },
  { id: "39", title: "RESOLVE HANDSHAKE DISPUTES", chapter: "6", have: false },
  { id: "41", title: "OCCURRENCE REPORTING PROCEDURE", chapter: "6", have: true, note: "delivered → /rail/occurrence" },
  { id: "43", title: "KEY PERFORMANCE INDICATORS", chapter: "6", have: true, note: "delivered (xlsx) → /rail/kpis" },
  { id: "40", title: "TRIM ANCILLARY SERVICES CATALOGUE", chapter: "7", have: true, note: "delivered → /rail/tariffs" },
];

/** Table 17: Rail Access Fees applicable for 2026/27 — verbatim. Two-part tariff.
 * Applies from 1 August 2026; amended to coincide with TRIM's financial cycle (1 April – 31 March)
 * or as determined by the IRERC or TER. */
export const accessFeeTable = {
  appliesFrom: "1 August 2026",
  tableLabel: "Table 17: Rail Access Fees applicable for 2026/27",
  notes: [
    "***Note: This includes empty wagon movements to and from workshops.",
    "***Tariff’s Excludes Traction Electricity - Traction Electricity will be a pass-through cost to users of Traction Electricity",
  ],
  rows: [
    { category: "OreCor (Iron Ore)", trainKmRand: "680", gtkCents: "3.54" },
    { category: "OreCor (Manganese Ore)", trainKmRand: "680", gtkCents: "5.53" },
    { category: "Coal Exports NorthCor", trainKmRand: "260", gtkCents: "6.03" },
    { category: "Intermodal & Motor Vehicles*", trainKmRand: "30", gtkCents: "4.41" },
    { category: "Mineral Exports", trainKmRand: "30.75", gtkCents: "9.00" },
    { category: "Grain & Tankers", trainKmRand: "30", gtkCents: "6.96" },
    { category: "Other General Traffic", trainKmRand: "30", gtkCents: "9.50" },
    { category: "Metro Trains & Passenger < 12 Wagons", trainKmRand: "50", gtkCents: "0.0" },
    { category: "Passenger Trains > 12 Wagons", trainKmRand: "60", gtkCents: "0.0" },
    { category: "Loose Locomotives", trainKmRand: "12", gtkCents: "0.0" },
  ],
};

export const chargingPrinciples = [
  "The Minister of Transport has approved an alternative tariff determination methodology to the allowable revenue methodology proposed in the March 2024 draft version of the Network Statement, adopted by TRIM for this publication.",
  "Criteria: current base cost of providing the service, the ability of Access Seekers to pay, and the support of intermodal and global competitiveness.",
  "Tariff floor estimated on TRIM direct costs; tariff ceiling on a segmented network Regulated Asset Base (RAB) with an adjusted Depreciated Optimised Replacement Cost (DORC) valuation; differentiated tariffs by demand-side ability-to-pay analysis (bottom-up).",
  "Recommended by IRERC based on TRIM submissions and public feedback. Two-part approach: one tariff based on train kms and the other on gross ton kms (GTK).",
  "Future regulatory methodology will be developed and published by the sector regulator once established.",
  "Access fees are approved by the Minister of the Department of Transport in 2026. Ancillary Facilities Services Fees and Yard Operations services are charged separately (Chapter 7).",
];

export const invoicingRules = [
  "Access Fees and Additional Charges invoiced monthly in advance; Penalties, Occurrence Management Services and pass-through electricity costs invoiced in respect of the preceding month; Ancillary Services charged in advance once offered.",
  "On or before the 26th of each calendar month TRIM generates the invoice (future access services ~30 days ahead + prior-month penalties/occurrence/electricity).",
  "VAT levied where applicable. Payment due within 5 days of receipt. EFT in South African Rands to TRIM's nominated bank account.",
  "Unpaid amounts bear interest at the Default Interest Rate, calculated daily from the day after due, compounded monthly in arrears.",
  "Financial arrangements: Access Seekers provide a Guarantee to TRIM; on failure to pay, TRIM may liquidate the Guarantee; Guarantee cannot be withdrawn/replaced without TRIM's prior written consent.",
];

export const marshallingCharges = {
  label: "Table 18: Marshalling Charges (indicative)",
  note: "***Note Charges in this table are indicative, a new, more cost reflective charging model will be published in the next volume of the Network Statement",
  categories: [
    "General Freight Business (GFB) <= 50 wagons",
    "Mini-heavy haul - > 50 wagons to <=106 wagons",
    "Heavy haul - >106 wagon",
  ],
  principle: "The length of the train and the yard configuration determines the number of personnel, duration, energy/fuel, locomotive types required to efficiently perform the marshalling. Services DO NOT include Shunting, Train preparation and inspection.",
};

export const additionalCharges = {
  applicationFee: [
    "Freight transport: R125 000 per Train Path upon application, subject to annual escalation. The application fee is not refundable.",
    "Passenger transport (long distance, metropolitan and tourism): R42 000 per Train Path upon application, subject to annual escalation. The application fee is not refundable.",
    "Upon approval of capacity allocation: additional expenses incurred at the request of the access seeker are for the access seeker's account (incl. trolley trips, in-situ inspections, pre-feasibility studies, testing of trains) — costs as incurred.",
  ],
  tractionElectricity: "Pass-through cost to users of electrical traction only, excluded from shared costs; aggregated at corridor level and allocated on service-design specification per flow using electric locomotive GTK's as driver; based on estimated electric GTK's and traction electricity costs per category.",
  occurrenceManagement: "Occurrence Management Services Charges determined after each Occurrence (at conclusion of investigation) per costs incurred by TRIM to restore network operation, apportioned to the responsible party; TRIM procures these services and recovers costs from the relevant Access Seeker; TRIM reserves the right to add to the list of chargeable costs.",
};

export const penaltyRegime = {
  frameworkStatus:
    "TRIM, with the Department of Transport, is developing a Penalty Framework (Government policy, Economic Regulation of Transport Act 2024, international good practice). Phased implementation; during the transitional period performance is monitored and reported, benchmarks established, and no financial penalties (other than those expressly in the Rail Access Agreement) until the Framework is approved and implemented. Not less than 3 months' written notice of any new penalty provisions. ERT Act 2024 s7(1)(e) applies; penalties subject to TER oversight once established.",
  trimPenalties: {
    label: "Table 21: TRIM Penalties",
    items: [
      "Deviation on contractual Train Path allocation agreement — TRIM offers a replacement Train Path; if the Access Seeker doesn't accept it, TRIM processes a credit note in favour of the Access Seeker (full Train Path fee refunded), subject to the limitation of liability clause in the Rail Access Agreement.",
      "Train Path cancellations caused by the TRIM — same replacement/credit-note mechanism, evaluated via the Handshake and Clearing House Forum.",
      "TRIM's liability assessed within 20 (twenty) Business Days of completion of each Contract Year; if established, the Access Seeker may invoice TRIM for such Penalties (plus VAT if applicable).",
    ],
  },
  accessSeekerPenalties: {
    label: "Table 22: Access Seeker Penalties (2026/27: cancellation penalties)",
    items: [
      "Cancellations before the weekly Do-ability: TRIM passes credit for Train Paths paid in advance if TRIM is able to reallocate the Train Path to another Access Seeker.",
      "Full Cancellations 72 hours before departure: TRIM passes credit for Train Paths in advance if the Train Path is reallocated.",
      "Full Cancellation within 72 hours up to scheduled departure time (not due to a Force Majeure Event): the Access Seeker forfeits the access fees paid in advance.",
    ],
  },
  additionalChargeEvents: [
    "Yard usage time exceeded", "Rail wagons standing (loaded or empty) in a Rail Yard exceeding yard usage time",
    "Locomotives staged between Trains in a Rail Yard", "Delayed arrival or departure of a Train at or from a Rail Yard, passing loop, Loading, or Off-loading Site",
    "Cancellation of Train Path", "Overloading of rail wagons", "Underloading of bulk and break-bulk rail wagons", "Skew loading of Trains",
  ],
  yardUsageFormula: "Yard Usage time Exceeded charge = (Total Dwell time – Designed Dwell time in yard). Greater than 30 minutes: charges as above plus the opportunity costs of the next Train Path based on the next Train scheduled on the ITP; the train may be deemed Cancelled by the Access Seeker at the IM's reasonable discretion and departs on the next available Train Path. This principle also covers departure delays (loaded and empty wagons).",
  forceMajeure: "Where actions/events are caused by a Force Majeure Event and/or the actions or omissions of the TRIM, the Access Seeker shall not be liable for the associated penalties/charges (and vice versa). Penalties determined to be penalties in terms of the Conventional Penalties Act 1962 entitle the relevant Party to claim damages in lieu.",
};

/** Table 23: Further KPIs being worked on by TRIM (verbatim rows; source note preserved). */
export const furtherKpis = {
  label: "Table 23: Further KPIs being worked on by TRIM",
  sourceQuirk: "E-NSV4-01 (preserved): the source caption reads \"(ACCESS SEEKER to be amended to Access Seeker)\" — kept as delivered.",
  currentKpisNote: "The current version of Annexure 43 comprises of three KPIs for the across all ten routes. The TRIM is working on a further set of KPIs which will be updated on Annexure 43 on a continuous basis. KPIs will transition from aggregated area/depot/route level to train-ID level per route and section-level KPIs. Reconciled data from the Daily Handshake Process will be used for Performance Management, presented at the Route Logistics Forum.",
  rows: [
    { category: "RELIABILTY", kpi: "% of services exiting network on schedule within tolerance of 30min (OTD) (SPRINT data)", uom: "% of total services", attribution: "IM + TOC", frequency: "Quarterly / Route" },
    { category: "RELIABILTY", kpi: "% of services entering network on schedule within tolerance (OTA) (SPRINT data)", uom: "% of total services", attribution: "IM + TOC", frequency: "Quarterly / Route" },
    { category: "DELAY ATTRIBUTION", kpi: "Delay minutes per train – IM causes", uom: "Minutes/train", attribution: "IM", frequency: "Quarterly / Route" },
    { category: "DELAY ATTRIBUTION", kpi: "Delay minutes per train – TOC causes", uom: "Minutes/train", attribution: "TOC", frequency: "Quarterly / Route" },
    { category: "SLOT MODIFICATIO", kpi: "Requests to change allocated slot", uom: "Count of requests and % accepted", attribution: "TOC (request) / IM (decision)", frequency: "Per request / Period" },
    { category: "SLOT MODIFICATIO", kpi: "Cancellation after IM rejects modification request", uom: "Treated as cancellation (count / % of slots)", attribution: "TOC", frequency: "Per request / Period" },
    { category: "IM Non-COMPLIANCE WITH RESPONSIBILITIES", kpi: "Failure to honour allocated slot due to IM fault", uom: "% of cancelled slots", attribution: "IM", frequency: "Period / Train Path" },
    { category: "IM Non-COMPLIANCE WITH RESPONSIBILITIES", kpi: "Failure to meet disclosure / notification obligations", uom: "Count of breaches", attribution: "IM", frequency: "Period / Train Path" },
    { category: "TOC Non-USAGE OF ALLOCATED SLOTS", kpi: "Cancellation ≥xx days before departure", uom: "% of cancelled slots", attribution: "TOC", frequency: "Per request / Period" },
    { category: "TOC Non-USAGE OF ALLOCATED SLOTS", kpi: "Failure to cancel (no-show)", uom: "% of cancelled slots", attribution: "TOC", frequency: "Per request / Period" },
    { category: "IM UUNIT COSTS", kpi: "Train control costs", uom: "R/track-km", attribution: "IM", frequency: "Quarterly / Route" },
  ],
  safetySets: {
    trim: ["Number of Safety Incidents (per category)", "Number of Train Incidents per Train-Kilometer", "Number of Injuries per Train-Kilometer", "Minute delays due to Safety incidents"],
    accessSeeker: ["Load adherence: Nr of overload/skew incidents", "Number of Train Incidents per Train-Kilometer", "Number of Safety Incidents (per category)", "Minute delays due to Safety incidents"],
  },
};

export const capacityFrameworkNotes = [
  "4.3.8.4: The published Network Register, Annexures 33a, and Annexure 33b are the basis for all timetable calculations and track occupancy for the annual timetable.",
  "4.3.8.5: The Network Register (Annexure 33) must be read in conjunction with Annexure 33b (Capacity Statement), stating total theoretical capacity per section, allocated capacity and unused capacity that can be applied for by other Access Seekers at the time of publishing. Quarterly reviews and updates will be published as addenda to the prevailing timetable period's Network Statement.",
  "Capacity determination follows a scientific approach but holds true only insofar as the assumptions applied by the practitioner, affected by an element of vulnerability the network is subjected to.",
  "Train Path capacity to coastal/inland terminals and ports is capped by facility capacity: where Train Path capacity to a facility exceeds the capacity of that facility, the IM may only allocate Train Path capacity that does not exceed the facility's capacity limitations.",
  "Timetable Period is in principle designed to coincide with TRIM's financial reporting and planning cycle (1 April – 31 March). Applications must be submitted before or in the year preceding the timetable period (Table 16 — typical timelines; *TRIM will publish the timetable of dates on its website once the Network Statement is gazetted).",
  "The Ad-hoc Train Path Allocation Process (Annexure 32) provides new and existing Access Seekers the opportunity to apply for Train Paths outside of the Annual process, for short-term and long-term capacity that becomes available.",
];

export const legalFramework = [
  "Act means the Railway Safety Act, 2024 (Act No. 30 of 2024). ERT Act 2024 governs access agreements (s7(1)(e): agreed access fees, conditions of service and penalties for non-performance), with TER oversight once established.",
  "National Rail Policy (NRP) and ERT Act requirements drive the Network Register and capacity declaration (per Annexure 33).",
  "The March 2024 draft NS proposed an allowable revenue methodology; the Minister of Transport approved an alternative tariff determination methodology adopted in this publication.",
];

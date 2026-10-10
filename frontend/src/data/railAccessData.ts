/** AUTO-GENERATED from round-72 sources (Annexures 28, 29a, 29b, 35 + NS V4 Publication Notice).
 * 28 SHA-256 2bd0263126c935ba2450dc352eef381ea2e1bebbb002f16d6468b91d1d41fa76 (1 p, flowchart v2.5).
 * 29a SHA-256 9b53984bbc1d28f331685e549ca0c234b47ed22e3d1ba52af35c04874d2ff014 (5 p, form).
 * 29b SHA-256 9fdfa56de7693e5fbad57e3051408b153af1b74379bc501703207ce2dbf80d83 (8 p, V3-era capacity statement).
 * 35 SHA-256 fdc47f46327bdb19f6336570b8a70675f1bb8ed0abd9ea176749e51fa23b4efb (1 p, flowchart v01).
 * Notice SHA-256 de8c506576b156cab7390e68fff0f10711cf7b1c5245071888cdc03affa080e1 (1 p).
 * Verbatim where quoted; source typos preserved and flagged. */

export const accessSources = {
  file28: "sources/Annexure 28_Daily_Handshake_Process (1).pdf", sha256_28: "2bd0263126c935ba2450dc352eef381ea2e1bebbb002f16d6468b91d1d41fa76",
  file29a: "sources/Annexure 29a Network Access Application Form.pdf", sha256_29a: "9b53984bbc1d28f331685e549ca0c234b47ed22e3d1ba52af35c04874d2ff014",
  file29b: "sources/Annexure 29b - Network Capacity Statement_Final (Ver2) (1).pdf", sha256_29b: "9fdfa56de7693e5fbad57e3051408b153af1b74379bc501703207ce2dbf80d83",
  file35: "sources/Annexure 35_TRIM Dispute Resolution Process.pdf", sha256_35: "fdc47f46327bdb19f6336570b8a70675f1bb8ed0abd9ea176749e51fa23b4efb",
  fileNotice: "sources/Release of Final NS V4_18 September 2026_Final (1).pdf", sha256_notice: "de8c506576b156cab7390e68fff0f10711cf7b1c5245071888cdc03affa080e1",
};

/** Annexure 28 — Daily Handshake Process (v2.5 Updated: 16 August 2024). */
export const handshakeProcess = {
  versionHistory: ["Version 2.3 Updated: 11 March 2024", "Version 2.4 Updated: 16 August 2024", "Version 2.5 Updated: 16 August 2024"],
  purpose: "Daily reconciliations must be performed between the IM and each TOC regarding all deviations that occurred during the past 24 hours. Whenever either the IM or any TOC deviates from planned schedules or when deviations impact available slots, the reasons and responsible parties for such deviations and their impact should be determined as close as possible to real time — to gather and file supporting documentation for proper audit trails of what exactly happened to each TOC order, and to limit any later disputes as to who should be held accountable for the total impact of each incident.",
  systems: "TOL · TOMS / TEMS · Daily Handshake Report Template · Daily National Clearinghouse Report · External Incident System linked to TOMS",
  lanes: ["TOC", "Yard Operator (on behalf of IM)", "Customer Liaison Officer", "Manager: Customer Service", "IM National Clearinghouse Chairperson", "IM Network Operations Manager", "Head: Customer Service", "Route Logistics Forum Chairperson", "Head of IM", "Regulator"],
  responsibleParties: ["IM", "Specific TOC", "another IM", "Parties externa to Transnet [sic]", "Force Majeure events"],
  steps: [
    { n: "1", text: "Log all detected deviations from ITP — IM must log all deviations from published ITP (outside of tolerance) that it becomes aware of (regardless of cause) on TOMS, providing a preliminary reason / cause where possible, including deviations caused by other IMs. TOC must log all its deviations on TOMS or an agreed external incident capturing system. Yard Operator must log all its deviations on TOMS. Every deviation must be linked to the relevant Train/Slot and Order number." },
    { n: "2", text: "Collate Deviation Information — The IM will daily assess and follow up (investigate) all TOMS-logged TOC Train-related deviations; track and collate all supporting deviation documentation per train-specific deviation; log and file all supporting documentation per deviation electronically." },
    { n: "3", text: "Determine Responsible Party — The IM will assess Daily National Clearinghouse reports of all logged incidents that impacted TOC slots, to determine which party is responsible for each deviation and Cause. Key responsible party allocated to each TOC deviation will be one or more of: IM, Specific TOC, another IM, Parties externa to Transnet [sic], Force Majeure events." },
    { n: "4", text: "Create Preliminary Daily Handshake Report — preliminary log of all TOC slot-related incidents and deviations in the last 24 hours with allocated reasons and responsible parties." },
    { n: "5", text: "Verify all Deviation Details — For every incident that impacted or delayed contracted and allocated TOC slots, verify deviation time, location, Train/slot and order number(s) impacted, deviation category, deviation reason, root cause and allocated responsible party. Missing information followed up with all relevant stakeholders." },
    { n: "6", text: "Assess Deviation Impact — Which TOC slot(s) were not taken up or used? Which had to be cancelled? Which had to be re-scheduled? Which were delayed and what were the total delay minutes per slot? (Links to the Cancel/Re-Schedule process.)" },
    { n: "7", text: "Validate Operations Execution and Deviation Reports — Provide Shift-based Operations Execution and Deviation Reports (Yard Level)." },
    { n: "8", text: "Create Final 24 Hour Handshake Report — Daily at 08:00 the IM will create and update a final 24-hour Handshake Report for every TOC (shift reports for the previous 24 hours consolidated). Lists all daily deviation details per TOC Train number linked to all supporting documentation, including all incidents that caused slot cancellations and delays, with reasons, allocated root causes and responsible parties, as well as each deviation's impact assessment." },
    { n: "9", text: "Flag Open Handshake Report Items — When each TOC reviews each daily handshake report and it is discussed with the IM, each TOC should raise any item or detail it does not agree with, citing reasons and providing supporting documentation. All items on which a TOC does not agree are flagged as open handshake report items." },
    { n: "10", text: "Discuss daily handshake report with TOC — The IM will publish each TOC-specific daily handshake report on TOL and discuss it with every TOC, with the goal to reach agreement on every item (incident description, deviation, reason, cause, responsible party, deviation impact)." },
    { n: "11", text: "Sign off Daily Handshake Report — Each TOC must sign off every daily handshake report (including the flagged open items)." },
    { n: "12", text: "Sign off and File Daily Handshake Report — Every signed-off handshake report will be filed by the IM, together with all red-flagged items and supporting information per TOC deviation." },
    { n: "13", text: "Attempt to Resolve open handshake items within 24 hours." },
    { n: "14", text: "Receive Feedback on resolved handshake report items — The IM will provide daily feedback to all impacted TOCs on resolution of all open items, including items that could not be resolved, with reasons." },
    { n: "15", text: "Attempt to Resolve open handshake items within next 24 hours (escalation: IM Customer Liaison Manager)." },
    { n: "16", text: "Attempt to Resolve open handshake items within next 48 hours (escalation: IM Head of Customer Liaison)." },
    { n: "17", text: "Attempt to Resolve open handshake items within next 72 hours." },
    { n: "18", text: "Log unresolved handshake report items to be discussed at next Route Logistics Forum — Final TOC feedback on open items not resolved by the IM within 96 hours after the first handshake report was issued; further feedback on items that could be resolved at the Route Logistics Forum." },
    { n: "19", text: "Lodge dispute with Regulator · Invoice TOC — Resolution should be between 72 and 96 hours. If it is a cash TOC, the monies must be paid. If it is a guarantee the monies will be debited within 24 hours of the resolution." },
  ],
  quirks: "E-ANX28-01 (preserved): source typos kept — 'betwwen 72 and 96 hours', 'gurrantee', 'Parties externa to Transnet'. POPIA sign-off block and 'PROCESS SIGN-OFF – TFR Confidential' marker preserved as delivered.",
};

/** Annexure 29a — Network Access Application Form (5 pages, POPIA notice). */
export const applicationForm = {
  popia: "IMPORTANT NOTICE: This document contains Personal Information as defined in the Protection of Personal Information Act, 2013 (POPIA). All personal information contained herein will be processed, protected and stored in accordance with all the conditions and requirements of the POPIA Act.",
  sections: ["1. APPLICANT INFORMATION AND SERVICES REQUIRED (Note: All the required Annexures and Forms specified in the Network Statement must accompany this application)", "2. TRAIN CONFIGURATION AND OPERATING SPECIFICATIONS", "3. EN ROUTE STOPPAGE POINT DETAILS"],
  stoppageTypes: [
    "Stop to change traction (including attaching / detaching locomotives)",
    "Stop to re-man crew",
    "Stop to re-fuel locomotive",
    "Stop for technical inspection/examination",
    "Stop to change train configuration (split wagon blocks or combine wagon blocks)",
    "Stop to attach and/or detach wagons",
    "Stop to attach/detach banking locomotives",
    "Stop to change locomotives from one end of the train to the other",
    "Stop to let train in reverse direction pass (on single line)",
    "Stop for any other operational reasons",
  ],
};

/** Annexure 29b — Network Capacity Statement (December 2024 / Ver2). V3-ERA PERIOD LABEL. */
export const capacityStatement29b = {
  title: "Annexure 29b – Network Capacity Statement 2025 (Network Capacity Statement December 2024)",
  periodLabel: "E-ANX29B-01 period caveat: applicable for the 2024/25 timetable — applicants use as a guide to apply for capacity allocation in the 2025/26 timetable period. V3-era predecessor of Annexure 33 Network Register (June 2026 v0.3); for V4 purposes the Annexure 33 Register supersedes it. Never present its figures as V4-governing.",
  contents: ["1. Purpose", "2. Validity", "3. Introduction", "4. Existing Capacity in the Network (a. Routes; b. Scope of Infrastructure covered; c. Congested Network)"],
  author: "Eric Peete, Transnet Freight Rail JHB (PDF metadata — same author as the Annexure 33 Register)",
};

/** Annexure 35 — TRIM Dispute Resolution Process (Version 01: 03 December 2024). */
export const disputeProcess = {
  versionHistory: ["Version 01: Developed 03 December 2024"],
  scope: "Customers may lodge any complaints arising after contracting with the IM on various issues beyond slot application dispute or excluding slot application-related complaints. For such complaints, please follow the Resolve Applicants Dispute Process [named in source; not part of this annexure].",
  lanes: ["Customer", "Key Account Manager", "TRIM Department SME (Strategy and OCE, Contracting, NSP&O, Rail Network, Commercial Finance, Safety, Security etc)", "Transport Economic Regulator (Rail)", "Transnet Group COO", "TRIM CEO", "Department Head/ GM"],
  steps: [
    { n: "1", text: "Lodge Complaint (via TRIM email)." },
    { n: "2", text: "Log complaint on relevant system (SAP CRM)." },
    { n: "3", text: "Acknowledge Receipt of complaint to customer." },
    { n: "4", text: "Receive Complaint acknowledgement and Reference number (Complaint Reference Number and Open Complaints Report)." },
    { n: "5", text: "Evaluate Complaint." },
    { n: "6", text: "Escalate the Complaint to the relevant department SMEs based on Catergory [sic]." },
    { n: "7", text: "Evaluate Complaint. BS: Categorize dispute according to the customer complaints categories on the Standard Operating Procedure." },
    { n: "8", text: "Review and recommend the validity of the complaint (include the criteria for assessing the validity of complaint). Complaint deemed valid?" },
    { n: "9", text: "Resolve Complaint — The IM may suggest alternative solutions to resolve complaints; these suggestions aim to find a mutually agreeable solution for both parties involved." },
    { n: "10", text: "Escalate Complaint to the Head and GM of Department." },
    { n: "11", text: "Evaluate and investigate the complaint." },
    { n: "12", text: "Provide dispute resolution decision feedback to TOC." },
    { n: "13", text: "Provide Feedback to customer on Complaints resolution." },
    { n: "14", text: "Lodge a dispute with the TRIM CEO (if feedback not accepted)." },
    { n: "15", text: "Evaluate and investigate the complaint." },
    { n: "16", text: "Provide dispute resolution decision feedback to TOC." },
    { n: "17", text: "Provide Feedback to TOC on IM's Complaint Resolution; receive feedback on IM's complaint resolution. Decision: Is TOC satisfied with IM's complaint resolution?" },
    { n: "18", text: "Lodge a dispute with the Group Chief Operations Officer/GCE (Escalate Non-resolved Dispute)." },
    { n: "19", text: "Provide dispute resolution decision feedback to TOC. Decision: Is TOC satisfied with Group's complaint resolution?" },
    { n: "20", text: "Lodge dispute to Rail Regulator." },
    { n: "21", text: "Provide dispute resolution decision feedback to IM and Customer — The Regulator's decision is final and binding on all parties, unless the IM can compellingly argue that its proposed solution(s) are overall more optimal for maximizing capacity utilization [verbatim quirk preserved]." },
    { n: "22", text: "Regulator Dispute resolution feedback provided to Customer — The Regulator's decision is final and binding on all parties." },
  ],
  quirks: "E-ANX35-01 (preserved): source typos kept — 'Catergory'; the step-21 caveat wording kept verbatim. POPIA sign-off block and 'PROCESS SIGN-OFF – TFR Confidential' marker preserved.",
};

/** Full Publication Notice (V4-11) — 18 September 2026. */
export const publicationNotice = {
  headline: "Transnet Rail Infrastructure Manager Publishes Final Network Statement Version 4 — Johannesburg, South Africa | 18 September 2026",
  author: "Asheena Mathura (PDF metadata)",
  timelines: [
    { milestone: "Annual Train Path Applications", timeline: "18 September 2026 – 31 December 2026" },
    { milestone: "Assessment of Applications", timeline: "1 January 2027 – 31 March 2027" },
    { milestone: "Notification and Consultation with Successful Applicants", timeline: "1 April 2027 – 30 June 2027" },
    { milestone: "Publication of Timetable and Commencement of Operations", timeline: "One month before execution of allocated capacity" },
  ],
  timelineNote: "E-NSV4-T16 RESOLVED: these are the official Table 16 milestone timelines — the NS body's Table 16 cells did not extract from its PDF text layer; the Publication Notice carries the dates.",
  enhancements: "Enhancements include clearer recognition of Access Seekers, expanded provisions for ad hoc applications, improved visibility of available capacity, strengthened governance principles and greater clarity regarding supporting and ancillary services required for rail operations. Developed through extensive engagement with train operating companies, freight owners, customers, regulators, industry associations and government stakeholders.",
};

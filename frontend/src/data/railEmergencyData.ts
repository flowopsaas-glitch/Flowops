/**
 * Annexure 36 — Emergency Response Plan for Multidisciplinary Incident Preparedness and
 * Operational Management (TFR doc 013-TFR-COR-HFES-15007, version 4, revised 2024.09.30).
 *
 * Transcribed from `sources/Annexure 36_Emergency Response Plan (Tribunals Process).pdf`
 * (73 pages) — verbatim quotes preserved, page cites given per row. Source quirks
 * (duplicated clause numbers 6.19.4.1, blank rows in the contact tables, the "????" cell in
 * the emergency-teams matrix) are preserved and flagged rather than corrected.
 *
 * Guardrails that this module deliberately encodes:
 *  - This is a *Transnet Freight Rail* internal procedure. It is not an IM access-regime
 *    document, it does not grant FlowOps any authority at a Transnet scene, and it does not
 *    make FlowOps a responder. It is reference material for a TOC that interfaces with TFR.
 *  - Contact numbers are transcribed from an "UNCONTROLLED COPY WHEN PRINTED" document. The
 *    NCC's live activation list is authoritative; this page must never be treated as the
 *    current duty roster.
 *  - Nothing here is a live incident feed. Activation levels, scenarios and role assignments
 *    are the *plan's* definitions, not the state of any real occurrence.
 */

export const emergencySource = {
  file: "sources/Annexure 36_Emergency Response Plan (Tribunals Process).pdf",
  sha256: "4dfcf2d2cfa3fcf4e330a9c1cb1e955523108761b0213e30e37189cb256d2c9c",
  pages: 73,
  docId: "013-TFR-COR-HFES-15007",
  title: "Emergency Response Plan for Multidisciplinary Incident Preparedness and Operational Management",
  shortTitle: "Emergency Response Plan (ERP)",
  version: "4",
  revised: "2024.09.30",
  issuer: "Transnet Freight Rail",
  classificationNote: "©Transnet SOC Ltd — “Uncontrolled copy when printed.”",
  coverSubtitle: "Principles and guidelines at the scene of a rail occurrence",
  priorVersion: "3.0 (2021.04.09) — transferred to new template, added Corridor Operating Model",
};

/** Version-control rows from the plan's own SUMMARY VERSION CONTROL table (p.3). */
export const versionControl: Array<{ version: string; change: string; where: string; date: string }> = [
  { version: "3.0", change: "Transferred to new template and added Corridor Operating Model", where: "Entire document", date: "2021.04.09" },
  { version: "4", change: "Renamed the title to: Multidisciplinary Incident Preparedness and Operational Management", where: "Page 2, all footers", date: "2024.09.30" },
  { version: "4", change: "Redefined scope of Accountability, Responsibility and Authority", where: "pp. 12–16", date: "2024.09.30" },
  { version: "4", change: "Contingency plan replaced with emergency response plan", where: "pp. 17, 19, 22–24, 29, 30", date: "2024.09.30" },
  { version: "4", change: "Replaced Senior Manager (APM) with Head of Operations", where: "p. 14", date: "2024.09.30" },
  { version: "4", change: "Replaced Area Safety Managers with Safety Managers/Safety Specialist", where: "p. 14", date: "2024.09.30" },
  { version: "4", change: "Changed Natal to Container", where: "p. 20", date: "2024.09.30" },
  { version: "4", change: "Changed Cape 2 to Ore", where: "p. 20", date: "2024.09.30" },
  { version: "4", change: "Changed Cape 1 to Cape", where: "p. 20", date: "2024.09.30" },
  { version: "4", change: "Changed Northern to North", where: "p. 20", date: "2024.09.30" },
  { version: "4", change: "Added the term “ERG” — Emergency Response Guidebook", where: "pp. 11, 30, 42", date: "2024.09.30" },
  { version: "4", change: "Added Corporate safety office, TPT and Provincial Authorities", where: "p. 5", date: "2024.09.30" },
];

export const purpose =
  "To ensure that Transnet Freight Rail Fire Safety requirements are integrated and defined to protect against the possibility of hazmat, rescue and fire occurrence in an effort to mitigate, prepare, respond and recover from emergency related situations with a unified objective and to minimize the damage should such an incident occur.";

export const applicability = "This procedure is applicable to Transnet Freight Rail.";

export const distribution = [
  "Managers Operations",
  "Infrastructure / Perway / Signals / Overhead",
  "TNPA and TPT Manager",
  "PRASA (Metrorail)",
  "Local and Provincial Authorities (Disaster Management)",
  "Transnet Engineering (Wagons and Traction)",
  "PRASA / Luxrail",
  "Rail Safety Regulator",
  "Security",
  "NCC",
  "Corporate Safety Office & Risk Management",
];

/** Activation levels — the plan's own classification table (p.19). */
export const activationLevels = [
  {
    code: "Level 3",
    colour: "Code Red",
    name: "Disaster",
    definition: "Disaster for Transnet Freight Rail, Public and Environment",
    page: "22–23",
    tone: "red" as const,
  },
  {
    code: "Level 2",
    colour: "Code Orange",
    name: "Major Accident",
    definition: "Disaster for Transnet Freight Rail. No disaster for Public / Environment",
    page: "22–23",
    tone: "amber" as const,
  },
  {
    code: "Level 1",
    colour: "Code Green",
    name: "Minor Accident",
    definition: "No disaster for Transnet Freight Rail / Public / Environment",
    page: "22–23",
    tone: "green" as const,
  },
];

export const objectives = {
  main: [
    "Preserving and saving lives.",
    "Prompt opening of the Railway line (Service recovery)",
    "Minimising environmental damage.",
    "Limiting damage to property and equipment.",
    "Determine the cause of occurrence (Prevent for future occurrence(s)).",
  ],
  secondary: [
    "To provide for alternative arrangements for the transport of goods.",
    "Customer notification.",
    "Protection and/or safeguarding of private property.",
    "Rehabilitation of environment.",
    "Salvage of products.",
  ],
  scopePrimary: [
    "To provide for swift Communication procedures when Rail Occurrences occur.",
    "Prompt Emergency response to a Rail Occurrence.",
    "Efficient Emergency Control Co-ordination for all responders.",
    "Effective Business Recovery Planning.",
    "Support Business Continuity.",
  ],
  scopeSecondary: [
    "Safe working procedures on site.",
    "Effective off site co-ordination and support.",
    "Environmental clean-up and rehabilitation.",
    "Occurrence investigation procedure (onsite).",
    "Legal and social compliance.",
  ],
};

/** Operational corridors (p.20) — the v4 names replace Natal→Container, Cape 1→Cape, Cape 2→Ore, Northern→North. */
export const corridors = [
  {
    name: "Container Corridor",
    note: "Renamed from “Natal” in v4. Listed with “(Durban, allocation to APM)” and a duplicated Ladysmith entry — preserved as printed.",
    places: ["Durban (Containers, Movement & Yards)", "Pietermaritzburg", "Ladysmith", "Sentrarand (Production, Yards and Movement)", "Natalspruit", "Isando Heidelberg", "Ladysmith", "Durban"],
  },
  { name: "North Corridor", note: "Renamed from “Northern” in v4.", places: ["Ogies", "Rustenburg", "Nelspruit", "Witbank", "Ermelo (Coal line)", "Richards Bay", "Vryheid"] },
  { name: "North East Corridor", note: "", places: ["Polokwane", "Newcastle", "Nelspruit", "Ermelo", "Vryheid", "Empangeni"] },
  { name: "Central Corridor", note: "Krugersdorp and Isando are each listed twice in the source — preserved as printed.", places: ["Krugersdorp", "Isando", "Krugersdorp", "Vereeniging", "Klerksdorp", "Kroonstad", "Koedoespoort"] },
  { name: "Cape Corridor", note: "Renamed from “Cape 1” in v4.", places: ["Kimberley", "Bloemfontein", "Port Elizabeth", "Bellville"] },
  { name: "Ore Corridor", note: "Renamed from “Cape 2” in v4.", places: ["Sishen", "Halfweg", "Saldanha"] },
];

/**
 * Section 5 — accountability, responsibility and authority (pp.12–16).
 * The v4 amendment expressly redefined the scope of these three concepts.
 */
export const accountabilityMatrix = [
  {
    role: "Top Management",
    holds: "Accountable",
    duties: [
      "Set the tone with regards to effective management of Rail Occurrences.",
      "Appointed as Safety Administrator (Transnet Freight Rail) by the Group Chief Executive (Transnet) in accordance with Transnet instructions: WMB C.1 (Occupational Health and Safety Act 1993, Act 85/1993, Section 16).",
      "Oversees implementation of the Occurrence and Non-Conformance Management and Business Continuity Management Procedure read with this Emergency Response Plan.",
      "Formally declares a Transnet Freight Rail disaster.",
      "Ensures processes are in place to monitor implementation of this plan throughout the organisation.",
      "Provides resources to develop and support implementation of the plan.",
    ],
  },
  {
    role: "Executive Safety and Security",
    holds: "Accountable — Safety Administrator (Safety & Security)",
    duties: [
      "Duly appointed as Safety Administrator (Safety & Security) by the Chief Executive (Transnet Freight Rail) per WMB C.1 (OHS Act 85/1993, Section 8, 2(i)).",
      "Responsible for integrated Emergency Response Planning for rail operations (accountability lies with the ME's).",
    ],
  },
  {
    role: "Managing Executives",
    holds: "Accountable — Safety Administrator (Safety & Compliance)",
    duties: [
      "Duly appointed as Safety Administrator (Safety & Compliance) by the Chief Executive per WMB C.1 (OHS Act 85/1993, Section 8, 2(i)).",
      "Responsible for integrated Emergency Response Planning for rail operations (responsibility lies with the Managing Executive Operations).",
      "Responsible to execute the Transnet Freight Rail Emergency Response Plan for rail operations.",
    ],
  },
  {
    role: "Senior Management",
    holds: "Responsible",
    duties: [
      "Take ownership and control of operational cluster Emergency Response Plan.",
      "Maintain and implement the plan.",
      "Responsible to inform and train departments on the content of the plan.",
      "Oversees Interface Management performance; ensures implementation, maintenance and review of Interface Management processes.",
      "Shall ensure that a site/depot specific fire management procedure and written fire plans are developed and approved.",
      "Shall ensure that Line Managers take responsibility for implementation of the Fire Plan.",
      "Shall ensure availability of resources to implement Fire safety programmes and maintain fire teams.",
    ],
  },
  {
    role: "Senior Manager Maintenance",
    holds: "Responsible — regional plan",
    duties: [
      "Take ownership and control of the Emergency Response Plan for the region.",
      "Maintain and implement the plan.",
      "Responsible to inform the depots about the contents of the plan.",
    ],
  },
  {
    role: "Operational Managers / Area Managers (Decentralised)",
    holds: "Responsible — area plan",
    duties: [
      "Take ownership and control of Area Emergency Response Plan.",
      "Maintain and respond to Local Rail accidents.",
      "Liaise with external service providers.",
      "Integrate with neighbouring areas' Emergency Response Plan.",
      "Standby lists to be relayed on time and correctly on predetermined periods to the NCC.",
    ],
  },
  {
    role: "Safety Managers / Safety Specialist",
    holds: "Custodian of the contact lists",
    duties: [
      "Designated contact person of this Emergency Response Plan.",
      "Responsible for updating national activating telephone list on a monthly basis.",
      "Responsible for updating the National Emergency Response Plan on a regular basis (bi-annually).",
      "Responsible for all internal Rail and Terminal departments having an updated plan.",
      "Audit area plans annually.",
    ],
  },
  {
    role: "Head of Operations",
    holds: "Responsible — operational cluster",
    duties: [
      "Take ownership and control of operational cluster Emergency Response Plan.",
      "Maintain and implement the plan.",
      "Responsible to inform and train departments on the content of the plan.",
    ],
  },
  {
    role: "Depot Engineers",
    holds: "Responsible — depot plan",
    duties: [
      "Takes ownership and control of the Emergency Response Plan for his depot.",
      "Maintain and implement the plan.",
      "Responsible to inform all staff about the contents of the plan.",
      "To have an up-to-date copy of the plan available at the depot.",
      "To update the plan and especially the call-out lists as and when required.",
    ],
  },
];

/**
 * RIC / RIO assignment by area classification (p.30). Verbatim from the plan's matrix;
 * "Any competent person from Operation in that specific area" is the source's own fallback.
 */
export const ricRioMatrix = [
  {
    area: "Main Lines",
    red3: { ric: "Ops. Man (Dec) (RIC)", rio: "Train Crew Manager (Movement) (RIO)" },
    orange2: { ric: "Ops. Man (RIC)", rio: "Manager (Train crew) (RIO)" },
    green1: { ric: "Any competent person from Operation in that specific area.", rio: "—" },
  },
  {
    area: "Branch Lines / Yards",
    red3: { ric: "Ops. Man (Dec) (RIC)", rio: "Asst. Man (Train crew) (RIO)" },
    orange2: { ric: "Ops. Man (RIC)", rio: "Asst. Man (Train crew) / Asst. Man (Yards) (RIO)" },
    green1: { ric: "Any competent person from Operation in that specific area.", rio: "—" },
  },
];

export const ricRiRulings = [
  "A Senior Manager will form part of the tribunal at the NCC.",
  "Any of the above-mentioned managers who are on stand-by and who arrive at the scene first will take charge as Rail Incident Commander / Officer (RIC/RIO) until the designated RIC arrives at the scene.",
  "Operational Managers will assume the responsibility of RIC in respect of Code Red (3) and Orange (2) incidents.",
  "At a pre-determined period, every department involved that has a function on the scene must appoint specific representatives according to stand-by lists and relay it to the NCC / Local Planning Office to assume the duties of Rail Incident Representatives at the Emergency Control Centre at the scene.",
];

/** Emergency Control Centre (ECC) — on-site rules (pp.30–32). */
export const ecc = {
  rule: "The first appointed RIC arriving at the scene will set up an Emergency Control Centre (ECC), which he/she will hand over to the most senior Rail Incident Commander when he/she arrives.",
  siting:
    "Established in a safe place (building, vehicle, tent, etc.) as close as possible to the scene where it is clearly visible, but not nearer than 500 m — or as guided by the ERG when HAZMAT products are involved.",
  marking: "Marked with a red flag during the day and a green flashing/rotating light at night; directing boards indicate the shortest route to the scene.",
  identification:
    "The Rail Incident Commander wears a neon green jacket with the words “Transnet Freight Rail — Rail Incident Commander (RIC)” for identification.",
  general: [
    "Safe access to and from the site must be provided and identified to all personnel.",
    "The area should be secured to prevent unauthorised access to what may still be a hazardous area, and to protect property and equipment.",
    "Secure as necessary any dangerous substances remaining on site; check the soundness of containers and that substances have not been adversely affected by heat, water or mixing during the emergency.",
    "Examine buildings and equipment for structural damage and inaugurate preliminary repairs pending a more detailed examination.",
    "Check the electrical process supply lines and other services in the area. If supplies have been isolated, check switch and valve positions before reconnection. Ensure machinery that may have been running before the emergency is isolated before reconnection of power supply.",
  ],
  equipment: [
    "Sufficient telephones — Transport Telecoms, Neotel as well as Telkom",
    "Telephone directories (latest editions)",
    "Radio equipment",
    "An emergency planning manual / instructions",
    "A wall clock",
    "Camera and video camera, if available, and extra films/video cassettes",
    "Loudhailer and spare batteries",
    "Aerial photographs of the area",
    "Stationery",
    "List of key personnel and emergency services with addresses and telephone numbers (revised at least every six months)",
    "List of emergency and rescue equipment, recovery equipment and supplies",
    "Torches and emergency lighting",
    "Duplicates of master keys providing access to premises",
    "White board",
    "Red Alert Tape (to cordon off site)",
    "Bulletin board",
  ],
  operatingRules: [
    "Rail Incident Officers report at the Transnet Freight Rail Emergency Control Centre (ECC).",
    "Every discipline has a radio/telephone link to the ECC.",
    "All disciplines that have a duty at the scene, including specialist groups, report to the ECC first.",
    "Every Rail Incident Representative (RIR) takes care of the needs of his own discipline.",
    "Problems and needs that develop are discussed and solved jointly within the ECC by the various Rail Incident Officers (RIO).",
    "Policy matters are channelled to and from the NCC.",
    "The RIC and Tribunal arrange additional manpower, specialists and equipment as and when required.",
    "The RIC, Tribunal and the NCC office must determine priorities.",
    "The RIC grants personnel access to the scene.",
  ],
};

export const ricDuties = [
  "The RIC is responsible for total site management at the scene of the occurrence.",
  "The RIC is the convenor of the Transnet Freight Rail Emergency Control Centre and is responsible for co-ordinating all arrangements in conjunction with all Rail Incident Officers.",
  "The RIC is responsible for determining priorities in conjunction with Rail Incident Officers and ensuring that co-operation between disciplines takes place smoothly.",
  "Arrange for switching off the overhead equipment and to declare the scene safe for emergency operations to start.",
  "Ensure safe working procedures at the rail occurrence scene and adherence to the Occupational Health & Safety Act 85 of 1993 and the Railway Safety Regulator Act 16 of 2002.",
  "Set up an Emergency Control Centre and arrange to have it marked with a red flag during the day and a green flashing/rotating light at night; arrange directing boards indicating the shortest route to the scene.",
];

/**
 * The Tribunal (pp.39–40) — the plan's distinguishing concept and the reason the source
 * file is named "(Tribunals Process)".
 */
export const tribunal = {
  definition:
    "The tribunal will not be a structure, but will be a gathering of expertise to decide on how to manage these differing and varying factors influencing Transnet Freight Rail's legal position, image and other aspects.",
  functions: [
    "Depending on the situation, either be telephonically contacted or called together (for example: legal advisors, environmental specialists, communication and media, representatives from operating and technical departments).",
    "Receive information from the scene and the questions/queries from all involved parties, decide on the line of action and the information to be made available to the media, and inform Top Management on developments.",
    "Always convene at the off-site Emergency Control Centre, Johannesburg.",
  ],
  decidesOn: [
    "Freight losses",
    "Third party assets",
    "Serious damage to Transnet Freight Rail / TNPA / Metro Rail's own assets — insured and uninsured (dependent on the different policies and the clauses of exclusion/inclusion)",
    "Situations where the SAPS deems action necessary — e.g. criminal charges, arrest of an employee",
  ],
  lifeCycle: [
    "NCC receives information and decides on the seriousness of the occurrence, the nature and the projected impact.",
    "NCC decides to deal with the matter within its own resources (“Duty Manager” makes decisions), or to telephonically confer with the people on the list of “stand-by's”, or to call a physical get-together.",
    "NCC (“Duty Manager”) makes decisions first on who will be contacted / called.",
    "If the Tribunal convenes it will integrate with the NCC, gather information and make appropriate decisions.",
    "The Tribunal disbands only after the situation has returned to “normal”.",
    "The Tribunal must log its experience to facilitate the “lessons learnt” process and must enable this information to be fed to Transnet Freight Rail / Metro Rail / PRASA and Luxrail.",
  ],
  guardrail:
    "“The minds that must think together” about the best way of dealing with each situation differ depending on the nature of the occurrence — the Tribunal is convened expertise, not a fixed committee.",
};

export const nccDuties = [
  "Secondary alert and activation of Emergency Response Plan.",
  "Check listing of alert and activation processes.",
  "Support Rail Incident Commander on-site.",
  "Recommend the activation of the Tribunal.",
  "Form part of the Tribunal.",
  "Co-ordinate, provide and activate the revised master train plan.",
];

export const offsiteManagement = [
  "Be activated by the NCC (if deemed necessary by immediate prevailing circumstances).",
  "Integrate with the Tribunal if required.",
  "Assemble in the NCC (War Room).",
  "Have an information session and compile action plans.",
  "Provide guidance/assistance to parties at the scene (on-site ECC).",
];

/** On-site vs off-site split (pp.40–41). */
export const onSiteOffSite = {
  onSite: [
    "Emergency Response Procedure",
    "Confirmation of Intensity",
    "Exercising Control",
    "Establish Emergency Control Centre",
    "Secure Site",
    "Search and Rescue Operations",
    "Internal / External Liaison",
    "Media Management",
    "Evidence / Fact Finding Processes",
    "Recovery Processes",
    "Restoration / Clearing up Operations",
    "Asset / Freight Protection / Disposal",
    "Restoring of Track",
    "Line Clear Certification",
    "Consolidation: Accountabilities, Reporting, Post Mortem",
  ],
  offSite: [
    "Incident Reporting",
    "Activation Process (Communication)",
    "Confirmation of Intensity",
    "HQ Consolidation: NCC / (Tribunal War room)",
    "Guidance / Support",
    "Insurance",
    "Media Management",
    "Customer Notification",
    "Business Resumption Processes: Planning Alternative Service, Implementing Plan B",
    "Incident Consolidation: Accountabilities, Reporting, Post Mortem",
  ],
};

/**
 * Scenario matrix A–E (pp.24–26). The source prints these as a wide spreadsheet-style grid;
 * each cell below preserves the scenario's trigger text and the code it carries. Where the
 * source prints two codes for one cell ("Orange/Red") both are kept.
 */
export const scenarios = [
  {
    id: "A",
    group: "HAZMAT",
    cells: [
      { id: "A1", trigger: "Localised incident with specific handling procedures — broken seals, leaking valves, controlled releases, no exposure to employees/public", code: "Green", action: "Consider evacuation of people" },
      { id: "A2", trigger: "Derailment/collision/sabotage — uncontrolled valve leakage, visible damage to tanker, potential exposure to employees/public, no casualties", code: "Red", action: "" },
      { id: "A3", trigger: "Casualties — collision/derailment/sabotage, uncontrolled release", code: "Red", action: "Tribunal" },
      { id: "A4", trigger: "Environmental pollution — collision/derailment/sabotage, uncontrolled release", code: "Red", action: "Tribunal" },
      { id: "A5", trigger: "Shunting incident — structural damage, loss of cargo/containment", code: "Green", action: "" },
    ],
  },
  {
    id: "B",
    group: "SHUNTING / STRUCTURE",
    cells: [
      { id: "B1", trigger: "Structural damage, negative public image (press) — marshalling yard", code: "Orange", action: "" },
      { id: "B2", trigger: "Structural damage, loss of cargo/containment — level crossing", code: "Green; Orange/Red", action: "" },
      { id: "B3", trigger: "Casualties / evacuations, transport/reroute of passengers", code: "Red", action: "Tribunal" },
    ],
  },
  {
    id: "C",
    group: "DERAILMENTS",
    cells: [
      { id: "C1", trigger: "Hazardous materials — see Scenario A1–4 (pollution, evacuation, casualties, localised incidents)", code: "See A", action: "" },
      { id: "C2", trigger: "Consider evacuation of people — marshalling yard (B1) / level crossing (see B2)", code: "See B", action: "" },
      { id: "C3", trigger: "Service is still possible but with long delays — structural damage, one or two zones affected", code: "Orange", action: "" },
      { id: "C4", trigger: "Total disruption of service — all zones affected", code: "Red", action: "" },
      { id: "C5", trigger: "Localised incidents", code: "Green", action: "" },
    ],
  },
  {
    id: "D",
    group: "SERVICE INTERRUPTIONS",
    cells: [
      { id: "D1", trigger: "Power failure (internal)", code: "Green", action: "" },
      { id: "D2", trigger: "Power failure (external) — Eskom failure, civil unrest, sabotage, vandalism, theft", code: "Orange", action: "Possible rerouting of traffic" },
      { id: "D3", trigger: "Washaways — minor, per location, limited structural damage", code: "Green", action: "" },
      { id: "D4", trigger: "Washaways — serious, widespread (Demoina), loss of infrastructure", code: "Red", action: "No rerouting of traffic possible" },
      { id: "D5", trigger: "Washaways", code: "Green", action: "" },
    ],
  },
  {
    id: "E",
    group: "FIRE / BOMB SCARE / HIJACKING",
    cells: [
      { id: "E1", trigger: "Fire allowing no or limited rail traffic — tunnel, station, adjacent to track, train", code: "Orange", action: "" },
      { id: "E2", trigger: "Bomb scare — stationary (stations/yards/trains): on train in station, at stations, at yards/offices, private sidings", code: "Red", action: "" },
      { id: "E3", trigger: "Bomb scare — in transit (trains): goods train, passenger train", code: "Red", action: "Tribunal" },
      { id: "E4", trigger: "Hijacking — trains, locomotives", code: "Red", action: "" },
      { id: "E5", trigger: "Abductions — management", code: "Red", action: "" },
    ],
  },
];

/** Scene safety rules (p.41). The "consider it still under current" rule is the one that matters most. */
export const sceneSafety = {
  general: [
    "All responders move safely to the scene in their own time and with their own transport or with transport provided; officials are cautioned not to violate traffic laws whilst on route to or from the scene.",
    "Service Execution must, where possible, arrange road indicator boards depicting the shortest route to the scene, especially where the route traverses private property, and arrange for gates and fences to be opened/removed for emergency vehicles.",
    "The saving and preservation of lives always remain the first priority.",
    "Do not endanger lives of others.",
    "Limiting damage to assets, environment and equipment must be the primary objective.",
    "When a train disaster occurs, the on-site ECC is in control.",
    "Because action at a scene is a joint action, it is the task of all persons concerned to co-operate fully with the RIC and other disciplines.",
  ],
  guidelines: [
    "Overhead track equipment — electricity DC + AC: consider it still under current.",
    "Dangerous materials — chemicals/explosives: don't touch or handle.",
    "Train movements — be alert of trains passing by.",
    "Stay clear of derailed wagons and traction until mopping-up operations are executed.",
    "Potential falling structures — electrical masts.",
  ],
  hazmat: [
    "Fire Department to handle incidents where hazardous materials are involved.",
    "All containers or contents of vehicles that cannot be identified must be handled as HAZMAT.",
    "The area must be cordoned off.",
  ],
};

/**
 * Fatality / injury protocol (p.22) — the single most operationally consequential rule in the
 * plan for a road-side carrier, because it overrides any service-recovery urgency.
 */
export const fatalityProtocol = {
  headline: "Where a person has died or been injured, the scene must not be interfered with.",
  rules: [
    "In cases where a person has died or has been injured as a result of an accident or incident arising out of Transnet Freight Rail's activities, the accident/incident scene including all evidence thereon should not be interfered with in any way whatsoever.",
    "The South African Police Services will be called to the scene for investigation to collect relevant information and undertake the steps required by legislation and the common law, including collecting evidence for the post mortem and cause of death.",
    "The South African Police Services should not be interfered with in their investigations at the scene under any circumstances.",
    "Should there be any misunderstanding or doubt regarding the conduct of the police at the scene, the person in doubt should contact TFR Legal Services.",
    "When accidents/incidents happen where there are injuries/fatalities, Transnet is not allowed to start clearing-up operations until the medical teams and fire and rescue activities have completed their functions and the SAPS have completed their investigation at the scene.",
  ],
  exemption:
    "Transnet has negotiated and obtained an exemption from the Department of Labour regarding compliance to the General Administrative Regulations — see Transnet WMB Instruction B2/4: Permission to disturb and clear up the scene at a rail-operating incident.",
};

/** Interface management (pp.50–52) — who commands the scene when another party owns it. */
export const interfaces = [
  {
    party: "PRASA (Metro Rail)",
    rules: [
      "Derailment on SA Rail Commuter Corporation assets: Metro Rail activates its own ERP and informs TFR through the NCC; TFR assists with investigation/clearing-up when required; the TFR representative on site must not take action unless agreed upon and approved by the Metro Rail Incident Commander.",
      "Derailment on TFR assets: NCC notifies the Metrorail Operational Office; TFR activates its own ERP; Metrorail is responsible for passenger safety, injuries and personal belongings, co-ordinates removal of fatalities, arranges buses; Metrorail gives permission to TFR for clearing-up of motor coaches and trailers; no Metrorail action without TFR RIC approval.",
    ],
  },
  {
    party: "PRASA — Old Shosholoza Meyl",
    rules: [
      "Main operational contact number is 011 544 9031, situated at the NCC.",
      "Designated RIO reports at the Emergency Control Centre and activates its own ERP in conjunction with all other role players.",
      "Responsible to set up a reception table to process passengers and enquiries; buses park at the Vehicle Park; responsible to tally passengers against the passenger list.",
      "Responsible to ensure a deceased person is clearly identified according to train plan and physical coach (notification to SAPS on all fatalities), and to arrange alternative transport.",
      "Gives permission to TFR for re-railing/clearing of passenger coaches.",
    ],
  },
  {
    party: "TNPA — port environment",
    rules: [
      "TFR activates its own ERP; the TFR local activating office activates the relevant TNPA Central planning office for a representative (TNPA then activates its own internal disciplines).",
      "TNPA does initial notification to the TFR Local Activation office if derailments are caused by TNPA equipment/staff.",
      "The TFR Incident Commander co-ordinates activities on the accident site for rail accidents; the TNPA representative (RIC) reports to the TFR ECC.",
      "TNPA notifies agents; the TNPA Risk Manager is activated during environmental impact incidents (spillages).",
      "Only TFR re-rails wagons when TNPA equipment derailed them; TNPA may not disturb the site or act without TFR agreement.",
      "Where the occurrence is Hazmat, fire and/or medical emergency, TNPA Fire and Emergency Services and other providers respond and handle it to resolution, with TFR HFES providing backup as required.",
    ],
  },
  {
    party: "Overborder — incident outside the RSA border",
    rules: [
      "NCC notifies the relevant overborder country of the commodity and wagon involved, and notifies the client in the RSA.",
      "TFR activates its own ERP.",
      "NCC, with the Centralised Operations Manager, informs and diverts traffic flow to the relevant overborder country; that country activates its own traffic-flow strategy to and from the border.",
    ],
  },
  {
    party: "Overborder — incident inside the overborder country",
    rules: [
      "The overborder country activates its own ERP; if assistance is required the TFR Senior Manager (responsible for Overborder) is contacted, who then activates the Centralised Operations Centre.",
      "The overborder country representative gives regular feedback to the TFR NCC and Operations in the RSA so they can plan and execute the traffic-flow strategy.",
      "The overborder country notifies the client in that country.",
    ],
  },
];

export const postOccurrence = [
  "Incident debriefing",
  "Lessons learned",
  "Incident investigation",
  "Incident Inquiry",
  "Social after care involving personnel and public, health and safety of persons in the affected area at the time of the incident (injury and death)",
  "Media",
  "Regulatory requirements",
  "Salvage and recovery",
  "Environmental rehabilitation",
];

/** Drills, exercises and plan maintenance (p.29). */
export const drillCadence = [
  { activity: "Desktop exercises", frequency: "Six-monthly per Corridor", page: "p.29" },
  { activity: "Simulation exercises", frequency: "At least annually per Corridor", page: "p.29" },
  { activity: "Plan review", frequency: "Annually, or when major changes deem it necessary", page: "p.29" },
  { activity: "Major Hazardous Installation (MHI)", frequency: "Follow the AIA recommendation read with the MHI regulations", page: "p.29" },
  { activity: "Contact lists (ECC)", frequency: "Revised at least every six months", page: "p.31" },
  { activity: "National activating telephone list", frequency: "Updated monthly by Safety Managers/Specialists", page: "p.14" },
  { activity: "Area plans", frequency: "Audited annually", page: "p.14" },
];

/** §8.1 reference annexures the plan points to (p.73). None of these is supplied in this repo. */
export const referencedAnnexures = [
  "HAZMAT: Sensitising document",
  "A Hazardous Material Occurrence Document (S.O.A.R)",
  "Communication and Media (Crisis Communication Strategy)",
  "Environmental Response and Site Rehabilitation",
  "RIC / 48 Hour Report",
  "Spad Report + 72 Past",
  "PRASA Emergency Response Plan (Shosholoza Meyl)",
  "PRASA Emergency Response Plan (Metro Rail)",
  "Mbombela Consortium (Gautrain)",
  "Incident Command System (ICS)",
];

/** Reference standards cited by the plan (pp.5–7). */
export const referenceStandards = [
  { name: "Asset management", ref: "ISO 55000:2015", clause: "Clause 8.3" },
  { name: "Business Continuity Management Procedure", ref: "TRN-IMS-GRP-PROC-016", clause: "All clauses" },
  { name: "Competency, Awareness and Training", ref: "TRN-IMS-GRP-PROC-008", clause: "All clauses" },
  { name: "Compliance Obligation Procedure", ref: "TRN-IMS-GRP-PROC-005", clause: "All clauses" },
  { name: "Continual Improvement Procedure", ref: "TRN-IMS-GRP-PROC-018", clause: "All clauses" },
  { name: "Disaster Management Act", ref: "Act 57 of 2002", clause: "All clauses" },
  { name: "Emergency Management — Requirements for Incident Response", ref: "ISO 22320:2011", clause: "All clauses" },
  { name: "Fire Brigades Services Act", ref: "Act 99 of 1987", clause: "All clauses" },
  { name: "Hazardous Substances Act", ref: "Act 15 of 1973", clause: "All clauses" },
  { name: "Human Factors Management Standard", ref: "SANS 3000-4:2011", clause: "All clauses" },
  { name: "Human Factors Management Procedure", ref: "TRN-IMS-GRP-PROC-017", clause: "All clauses" },
  { name: "Integrated Assurance Procedure", ref: "TRN-IMS-GRP-PROC-015", clause: "All clauses" },
  { name: "Identification and classification of dangerous goods for transport by road and rail modes", ref: "SANS 10228:2012", clause: "All clauses" },
  { name: "Occupational Health and Safety Management System", ref: "BS OHSAS 18001:2007", clause: "4.1.4, 4.3.1, 4.3.3, 4.4.1, 4.4.3, 4.4.5, 4.4.6, 4.4.7, 4.5.1 & 4.5.3" },
  { name: "Occurrence and Non-Conformance Management Procedure", ref: "TRN-IMS-GRP-PROC-013", clause: "All clauses" },
  { name: "Major Hazard Installation Regulations", ref: "30 July 2018, R. No 692", clause: "All clauses" },
  { name: "National Environmental Management Act", ref: "Act 107 of 1998", clause: "All clauses" },
  { name: "National Fire Protection Association", ref: "NFPA 600", clause: "All clauses" },
  { name: "Protection of communities against Fires", ref: "SANS 10090:2003", clause: "All clauses" },
  { name: "Railway Safety Management Standard", ref: "SANS 3000-1:2016", clause: "4.5.3.1, 4.5.5.3(b), 4.5.6, 4.8.1" },
  { name: "RSR Determination of Safety Management System and Safety Management Report", ref: "National Railway Safety Regulator Act 16 of 2002, Section 28", clause: "8.2.2, 10.2.2, 10.2.5, 10.3.5" },
  { name: "Operational Risk Management Procedure", ref: "TRN-IMS-GRP-PROC-004", clause: "All clauses" },
  { name: "Stakeholder Management Procedure", ref: "TRN-IMS-GRP-PROC-007", clause: "All clauses" },
  { name: "Quality Management Systems Standard", ref: "ISO 9001:2015", clause: "4.4, 7.1.4, 7.5.1, 8.3.2, 8.4.3, 8.7, 9.1.3, 10.2" },
  { name: "Product Life-cycle Management Procedure", ref: "TRN-IMS-GRP-PROC-011", clause: "All clauses" },
  { name: "Interface Management Procedure", ref: "TRN-IMS-GRP-PROC-012", clause: "All clauses" },
];

/**
 * HAZMAT contact directory (pp.59–61). Transcribed verbatim from an uncontrolled copy.
 * The plan itself says to report incidents to CTC, which co-ordinates the response, and that
 * this list is available on a 24-hour basis.
 */
export const hazmatContacts = [
  { org: "Corporate Office", position: "Risk Functional Head HFES", person: "Roggers Mamaila", primary: "073 315 4191", alt: "060 830 4406" },
  { org: "Corporate Office", position: "Risk Specialist HFES", person: "Vusi Mahlwane", primary: "083 700 9160", alt: "078 345 3855" },
  { org: "National Command Centre", position: "Duty Manager NCC", person: "", primary: "011 544 9094", alt: "" },
  { org: "Western Region", position: "Manager Environment & Hazmat Fire", person: "Sam Fiff", primary: "083 284 3619", alt: "" },
  { org: "Western Region", position: "MANAGER HAZMAT, FIRE", person: "Johan Jansen", primary: "083 284 3616", alt: "" },
  { org: "Port Elizabeth", position: "Chief Fire Officer", person: "Gary Nel", primary: "083 407 7913", alt: "083 428 6213" },
  { org: "Kimberley", position: "Fire Officer", person: "Kagisho Moheta", primary: "0810330464", alt: "" },
  { org: "Bloemfontein", position: "Senior Fire Officer", person: "Ndoyisile Mkhiwane", primary: "0832831988", alt: "" },
  { org: "Cape Town", position: "Chief Fire Officer", person: "Moegamat (Sakie) Arendse", primary: "083 277 2862", alt: "" },
  { org: "Cape Town", position: "Senior Fire Officer", person: "Makute Mathe", primary: "081 033 0473", alt: "" },
  { org: "East London", position: "Act. Senior Fire Officer", person: "", primary: "", alt: "" },
  { org: "East London", position: "Chief Fire Officer", person: "Jimmy Spogter", primary: "083 258 3289", alt: "" },
  { org: "Eastern Region", position: "Act. Manager Environment & Hazmat Fire", person: "", primary: "", alt: "" },
  { org: "Eastern Region", position: "Manager Hazmat & Fire", person: "Simo Khanyi", primary: "083 459 8600", alt: "" },
  { org: "Eastern Region / Pretoria", position: "Senior Fire Officer", person: "Hansie Dippenaar", primary: "083 379 0284", alt: "" },
  { org: "Empangeni", position: "Chief Fire Officer", person: "Philile Mahlase", primary: "0835645313", alt: "" },
  { org: "Empangeni", position: "Fire Officer", person: "Rajendran Naidoo", primary: "083 331 7778", alt: "" },
  { org: "Ermelo", position: "Fire Fighter", person: "Thabisile Nkambule", primary: "083 700 4024", alt: "" },
  { org: "Central Region", position: "Manager Environment & Hazmat Fire", person: "Pumelela Mabeka", primary: "063 4074246", alt: "" },
  { org: "Central Region", position: "Manager HFES", person: "Benjamin Visagie", primary: "083 452 0302", alt: "" },
  { org: "Johannesburg Sentra Rand", position: "Acting Chief Fire Officer", person: "Theunis Pottas", primary: "083 308 4725", alt: "" },
  { org: "Durban", position: "Acting Chief Fire Officer", person: "Alain Green", primary: "083 278 0079", alt: "" },
];

/** Activation control sheet — national disciplines the NCC logs on activation (pp.62–63). */
export const activationDisciplinesNational = [
  "Metro Emergency Services",
  "SAPS Radio Control",
  "Disaster Management",
  "IRE Department",
  "Transnet Freight Rail Fire Department",
  "Risk Management",
  "Area Operational Office",
  "Chief Operational Officer",
  "General Manager: Business Unit",
  "Executive Manager: Operations",
  "APM",
  "Operations Manager",
  "Duty Manager (NCC)",
  "Insurance Claims",
  "Infra: Depot Engineer",
  "Infra: Fault Control",
  "Infra: NCC Manager",
  "Environmental: Manager",
  "Hazmat: Manager",
  "Hazmat: Assistant Manager",
  "Security",
  "Transnet Engineering",
  "Rail Network Telecoms",
  "Corporate & Public Affairs",
  "Logistics Integrator (Black Box / Video Data)",
  "PRASA / Luxrail",
];

/** Activation control sheet — depot-level disciplines (pp.64, 68). */
export const activationDisciplinesDepot = [
  "Yard planner or selector",
  "NCC Duty Manager",
  "Asst. Manager (Movement)",
  "Asst. Manager Yards",
  "Operations Manager",
  "Section Manager",
  "CTC Office",
  "Yard Master",
  "Client Coordinator",
  "Security",
  "SAPS",
  "Rail Network (Perway, Electrical and Signals)",
  "Risk Professional",
  "Insurance Claims / RIMAS",
  "Metro Rail Ops. Control",
  "PRASA",
  "Mainline Passenger Service",
  "Metro Emergency Services",
  "Transnet Freight Rail Environment, Hazmat, Fire and Emergency Services",
  "Disaster Management",
  "Environmental Management",
  "Rail Network Telecoms",
  "Transnet Engineering: Traction and Wagons",
];

/**
 * Emergency teams by area (pp.65–66, repeated at 69–70). Capability flags transcribed as printed,
 * including the source's "P&T" (partial), "X*" (partial train), "X$" (partial lorry) and the
 * literal "????" against Welgedag — preserved, not interpreted.
 */
export const emergencyTeams = [
  { area: "AREA 1", places: [
    { place: "Bellville", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Worcester", crane: "", lorry: "X", bulldozer: "", train: "" },
  ] },
  { area: "AREA 2", places: [
    { place: "Beaconsfield", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "De Aar", crane: "", lorry: "", bulldozer: "", train: "" },
    { place: "Klerksdorp", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Mafikeng", crane: "", lorry: "X P&T", bulldozer: "", train: "" },
    { place: "Upington", crane: "", lorry: "", bulldozer: "", train: "" },
  ] },
  { area: "AREA 3", places: [
    { place: "Swartkops", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Voorbaai", crane: "X", lorry: "", bulldozer: "", train: "" },
  ] },
  { area: "AREA 4", places: [
    { place: "Cambridge", crane: "X", lorry: "X", bulldozer: "", train: "" },
    { place: "Queenstown", crane: "X", lorry: "", bulldozer: "", train: "" },
  ] },
  { area: "AREA 5", places: [
    { place: "Kroonstad", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Bloemfontein", crane: "X", lorry: "X", bulldozer: "", train: "" },
  ] },
  { area: "AREA 6", places: [
    { place: "Danskraal", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Mason's mill", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Wentworth", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
  ] },
  { area: "AREA 7", places: [
    { place: "Germiston TRE", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Leeuhof", crane: "X", lorry: "P&T", bulldozer: "", train: "" },
    { place: "Millsite (KGR)", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Sentrarand", crane: "X", lorry: "P&T", bulldozer: "P&T", train: "" },
    { place: "Springs", crane: "", lorry: "", bulldozer: "", train: "" },
    { place: "Vooruitsig", crane: "", lorry: "", bulldozer: "", train: "X*" },
    { place: "Welgedag", crane: "X$", lorry: "P&T", bulldozer: "????", train: "" },
  ] },
  { area: "AREA 8", places: [
    { place: "Koedoespoort", crane: "X", lorry: "X", bulldozer: "", train: "" },
    { place: "Lydenburg", crane: "", lorry: "", bulldozer: "", train: "" },
    { place: "Nelspruit", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Pietersburg", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Witbank", crane: "X", lorry: "P&T", bulldozer: "", train: "" },
  ] },
  { area: "AREA 9", places: [
    { place: "Ermelo", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Richardsbaai", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
    { place: "Vryheid", crane: "X", lorry: "X", bulldozer: "X", train: "X" },
  ] },
  { area: "AREA 10", places: [
    { place: "Saldanha", crane: "X", lorry: "X", bulldozer: "X", train: "" },
    { place: "Klawer", crane: "X", lorry: "", bulldozer: "", train: "" },
    { place: "Postmasburg", crane: "X", lorry: "P&T", bulldozer: "", train: "" },
  ] },
];

export const emergencyTeamsLegend = [
  { mark: "X", meaning: "Capability available at that place" },
  { mark: "P&T", meaning: "Source's own abbreviation — printed without definition in the matrix; read as a partial/specialised capability and verify against the controlled plan before relying on it." },
  { mark: "X*", meaning: "PARTIAL TRAIN (legend printed at the foot of the table)" },
  { mark: "X$", meaning: "PARTIAL LORRY (legend printed at the foot of the table)" },
  { mark: "????", meaning: "Literal four question marks printed in the source against Welgedag (bulldozer). Preserved; the controlled document must be queried." },
];

/** Wagon maintenance depots (pp.67, 72). */
export const wagonDepots = [
  { controller: "PRETORIA", places: ["Capital park", "Pietersburg", "Tzaneen", "Phalaborwa", "Messina", "Rustenburg", "Thabazimbi", "Witbank", "Komatipoort", "Nelspruit", "Belfast"] },
  { controller: "SENTRARAND", places: ["Sentrarand", "Vandykdrift", "Saaiwater", "Trichardt", "Minnaar", "Germiston", "Waterval", "Kaserne", "Welgedag", "Springs", "Leeuhof", "Sasolburg", "Potchefstroom", "Welverdiend"] },
  { controller: "DURBAN", places: ["Bayhead", "Maydon wharf", "Point", "Mason's mill", "Danskraal", "Glencoe", "Mafikeng", "Klerksdorp", "Slurry", "Lichtenburg"] },
  { controller: "COLIGNY", places: ["Coligny", "Beaconsfield", "Postmasburg", "De aar", "Lime acres", "Upington"] },
  { controller: "P ELIZABETH", places: ["East london", "Midlandia", "Burgersdorp", "Queenstown"] },
  { controller: "NSESE", places: ["Nsese", "Mandini", "Golela"] },
  { controller: "BELLVILLE", places: ["Bellville", "Beaufort-wes", "Klawer", "Caledon"] },
  { controller: "ERMELO", places: ["Airbrake yard", "Vacuum yard"] },
];

/**
 * Preliminary Investigation Report (4.12B) schema — the form the RIC completes (pp.50–58).
 * Kept as a field list because FlowOps' own occurrence module (Annexure 41) already carries the
 * report lifecycle; this is the *TFR scene* form a member would be asked to contribute to.
 */
export const preliminaryReportForm = {
  name: "PRELIMINARY INVESTIGATION REPORT (4.12B)",
  sections: [
    { title: "1. On-site investigators", fields: ["Name of RIC/RIO's", "Activation plan (personnel involved)"] },
    { title: "2. Description of incident", fields: ["Short history"] },
    { title: "3. Personnel information", fields: ["Personnel involved", "Previous shift", "Shift length"] },
    { title: "4. Risk profile", fields: [] },
    { title: "5. Injuries", fields: ["Transnet Freight Rail employee/s", "Injuries to public"] },
    { title: "6. Description of damage", fields: ["Traction", "Wagons", "Rail network", "Sleepers", "Overhead", "Signals", "Other"] },
    { title: "7. Infrastructure information", fields: ["Gradient", "Radius", "Cant", "Speed restriction prior to incident", "Topography", "Other", "Deviation on infrastructure"] },
    { title: "8. Commodity information", fields: ["Type of wagon", "Wagon no. derailed", "Load capacity", "Mass transported", "Unit loaded", "Single loaded", "Type of commodity (steel coils, etc.)"] },
    { title: "12. Annexures", fields: ["Personnel reports", "Infra report", "Wagon report", "Train documents (vehicle list/journal/train register)", "Qualifications", "Legal doc. — injuries", "Task observation/s", "Safety talks", "Copies of tapes"] },
    { title: "13. Signatures", fields: ["Rail Network (IO)", "Wagons (RIO)", "Traction (RIO)", "Rail Incident Commander (RIC) confirming re-railing completed and area safe for continuing train operations"] },
  ],
  note: "Section numbering 9–11 does not appear in the extracted text — preserved as delivered.",
};

/** What this document is NOT, for the page's guardrail panel. */
export const emergencyCaveats = [
  "This is a Transnet Freight Rail internal procedure, not an access-regime document. It confers no authority on FlowOps at a Transnet scene and does not make FlowOps a responder.",
  "It is not the IM's Network Statement process. Occurrence reporting to the Rail Safety Regulator follows Annexure 41 (see /rail/occurrence); this plan is the scene-management layer.",
  "Contact numbers are transcribed from a document marked “Uncontrolled copy when printed”. The NCC's live activation list is authoritative — verify before any reliance.",
  "Activation levels, scenario codes and role assignments describe the plan's definitions, not the state of any real occurrence. Nothing here is a live incident feed.",
  "The plan's own §8.1 annexures (Crisis Communication Strategy, S.O.A.R, RIC 48-hour report, ICS, PRASA/Gautrain plans) are not supplied in this repository.",
];

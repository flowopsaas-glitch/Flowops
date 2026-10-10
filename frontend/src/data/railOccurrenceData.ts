/** AUTO-GENERATED structure from sources/Annexure 41 Occurrence Reporting Procedure.pdf (round 69)
 * and sources/Annexure 42 Transnet Customer Collaboration Policy.pdf (round 69).
 * Anx 41 SHA-256 aa0d1acd9b5c195963ba858565b4aed8a3a79a36626013d3af3ce16204416aed (12 p).
 * Anx 42 SHA-256 68aa7e5f3124314ccf2ba18feb43b14a87c7262b64935c58ed6f66e0470ca9bd (14 p).
 * Category letters/items and Y/N flags are verbatim; "CATEGORY 0" (source prints zero for letter O) preserved. */

export const occurrenceSource = {
  file: "sources/Annexure 41 Occurrence Reporting Procedure.pdf",
  sha256: "aa0d1acd9b5c195963ba858565b4aed8a3a79a36626013d3af3ce16204416aed",
  pages: 12,
  template: "RSR/OPERATIONS/TEMPLATES/NOV2021.V3",
  title: "RSR Reportable Occurrences — IM Occurrence Reporting Procedure",
  author: "Tefo Kgatle, TRIM JHB (PDF metadata)",
};

export const reportingTimelines = [
  { rule: "Overall obligation", detail: "TRIM, as the network operator, must report all occurrences on its network. Each railway operator involved in an occurrence must also report independently to the Railway Safety Regulator (RSR) in line with prescribed timelines based on severity and impact." },
  { rule: "Immediate telephonic notification — within 15 minutes", detail: "Required for all railway occurrences in categories A–O that result in: fatalities or injuries; significant damage to property, rolling stock, or infrastructure; environmental damage or dangerous goods spills/releases; major train disruptions due to force majeure; any occurrence posing a serious risk to railway operations or passenger safety." },
  { rule: "Immediate written confirmation — within 12 hours", detail: "All immediately reportable occurrences must be confirmed in writing within 12 hours via email to the RSR, providing formal and traceable notification with initial details." },
  { rule: "Daily Occurrence Report — by 11:00 next day", detail: "Covers all reportable occurrences in Annexure 41, Tables 1, 2, 3, and 5 between 00:00 and 23:59. Due by 11:00 on the following day (or by 11:00 on the next working day if the deadline falls on a weekend or public holiday). Must include fatalities and injuries from attempted suicides or trespassers struck by trains, as well as all immediate reportable occurrences." },
  { rule: "Quarterly Occurrence Report — end of month after quarter", detail: "Reporting periods are April–June, July–September, October–December, January–March." },
];

/** Categories verbatim. trim/toc: "Y"/"N" as printed in the TO BE REPORTED BY columns. */
export interface OccItem { ref: string; item: string; trim: string; toc: string; }
export interface OccCategory { id: string; title: string; group: string; items: OccItem[]; }

export const occurrenceCategories: OccCategory[] = [
  { id: "A", group: "Railway operational occurrences", title: "Collisions during movement of rolling stock", items: [
    { ref: "a", item: "Collision between rolling stock on a running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Collision of rolling stock with an obstruction on a running line (including road vehicles colliding with rolling stock)", trim: "Y", toc: "Y" },
    { ref: "c", item: "Collision with a stop block on a running line", trim: "Y", toc: "Y" },
    { ref: "d", item: "Collision of rolling stock other than on a running line", trim: "Y", toc: "Y" },
    { ref: "e", item: "Collision of rolling stock with an obstruction other than on a running line", trim: "Y", toc: "Y" },
    { ref: "f", item: "Collision with a stop block other than on a running line", trim: "Y", toc: "Y" },
  ]},
  { id: "B", group: "Railway operational occurrences", title: "Derailments during movement of rolling stock", items: [
    { ref: "a", item: "Derailment of rolling stock on a running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Derailment of rolling stock on a line other than a running line", trim: "Y", toc: "Y" },
    { ref: "c", item: "Derailment during tippler activities", trim: "Y", toc: "Y" },
  ]},
  { id: "C", group: "Railway operational occurrences", title: "Unauthorized movements (rolling stock movement exceeding the limit of authority)", items: [
    { ref: "a", item: "Signal passed at danger (SPAD) on a running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Signal passed at danger (SPAD) on any other line", trim: "Y", toc: "Y" },
    { ref: "c", item: "Physical token passed on a running line", trim: "Y", toc: "Y" },
    { ref: "d", item: "Physical token passed on any other line", trim: "Y", toc: "Y" },
    { ref: "e", item: "Verbal authority exceeded on a running line", trim: "Y", toc: "Y" },
    { ref: "f", item: "Verbal authority exceeded on any other line", trim: "Y", toc: "Y" },
    { ref: "g", item: "Written authority exceeded on a running line", trim: "Y", toc: "Y" },
    { ref: "h", item: "Written authority exceeded on any other line", trim: "Y", toc: "Y" },
  ]},
  { id: "D", group: "Railway operational occurrences", title: "Level crossing occurrences", items: [
    { ref: "a", item: "Collision between rolling stock and a road vehicle(s) (including motor vehicles, bicycle or animal-drawn vehicles) at a recognized level crossing on a running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Collision between rolling stock and a road vehicle(s) (including motor-powered, bicycle or animal-drawn vehicles) on any line other than a running line (including yards, sidings and private sidings) at a recognized level crossing", trim: "Y", toc: "Y" },
    { ref: "c", item: "A person(s) struck by rolling stock at a recognized pedestrian level crossing", trim: "Y", toc: "Y" },
    { ref: "d", item: "A person(s) struck by rolling stock at a recognized road level crossing", trim: "Y", toc: "Y" },
  ]},
  { id: "E", group: "Railway operational occurrences", title: "Persons struck during movement of rolling stock (other than at level crossings)", items: [
    { ref: "a", item: "Occurrence where a member of the public is struck by rolling stock on a running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Occurrence where an employee is struck by rolling stock on a running line", trim: "Y", toc: "Y" },
    { ref: "c", item: "Occurrence where a contractor or contractor's employee is struck by rolling stock on a running line", trim: "Y", toc: "Y" },
    { ref: "d", item: "Occurrence where a member of the public struck by rolling stock on a line other than a running line", trim: "Y", toc: "Y" },
    { ref: "e", item: "Occurrence where an employee is struck by rolling stock on a line other than a running line", trim: "Y", toc: "Y" },
    { ref: "f", item: "Occurrence where a contractor or contractor's employee is struck by rolling stock on a line other than a running line", trim: "Y", toc: "Y" },
  ]},
  { id: "F", group: "Railway operational occurrences", title: "People related occurrences: trains outside station platform areas (in section)", items: [
    { ref: "a", item: "Occurrence where a person fell or was pushed from inside a moving or stationary train", trim: "Y", toc: "Y" },
    { ref: "b", item: "Occurrence where an employee fell or was pushed from inside a moving or stationary train", trim: "Y", toc: "Y" },
    { ref: "c", item: "Occurrence where a contractor or contractor's employee fell or was pushed from inside a moving or stationary train", trim: "Y", toc: "Y" },
  ]},
  { id: "G", group: "Railway operational occurrences", title: "Passenger related occurrences: travelling outside designated passenger area", items: [
    { ref: "a", item: "Category G occurrences covers the number of occurrences as a result of passengers travelling outside the designated passenger area of the train", trim: "Y", toc: "Y" },
  ]},
  { id: "H", group: "Railway operational occurrences", title: "People related occurrences: platform-train interchange", items: [
    { ref: "a", item: "Occurrence where a passenger fell between the train and the platform whilst entraining/detraining a stationary or moving train", trim: "Y", toc: "Y" },
    { ref: "b", item: "Occurrence where a passenger fell on the platform whilst entraining/detraining a stationary or moving train", trim: "Y", toc: "Y" },
    { ref: "c", item: "Occurrence where an employee fell between the train and the platform whilst entraining/detraining a stationary or moving train", trim: "Y", toc: "Y" },
    { ref: "d", item: "Occurrence where an employee fell on the platform whilst entraining/detraining a stationary or moving train", trim: "Y", toc: "Y" },
    { ref: "e", item: "Occurrence where a contractor or contractor's employee fell between the train and the platform whilst detraining a stationary or moving train", trim: "Y", toc: "Y" },
    { ref: "f", item: "Occurrence where a contractor or contractor's employee fell on the platform whilst entraining/detraining a stationary or moving train", trim: "Y", toc: "Y" },
  ]},
  { id: "I", group: "Railway operational occurrences", title: "People related occurrences: station infrastructure", items: [
    { ref: "a", item: "Occurrence resulting in injuries and fatalities to public due to infrastructure defects in a public area of the station", trim: "Y", toc: "N" },
    { ref: "b", item: "Occurrence resulting in injuries and fatalities to passengers due to infrastructure defects in a passenger area of the station", trim: "Y", toc: "N" },
    { ref: "c", item: "Occurrence resulting in injuries and fatalities to an employee due to infrastructure defects in a public area of the station", trim: "Y", toc: "N" },
    { ref: "d", item: "Occurrence resulting in injuries and fatalities to an employee due to infrastructure defects in a passenger area of the station", trim: "Y", toc: "N" },
    { ref: "e", item: "Occurrence resulting in injuries and fatalities to a contractor or contractor's employee due to infrastructure defects in a public area of the station", trim: "Y", toc: "N" },
    { ref: "f", item: "Occurrence resulting in injuries and fatalities to a contractor or contractor's employee due to infrastructure defects in a passenger area of the station", trim: "Y", toc: "N" },
  ]},
  { id: "J", group: "Railway operational occurrences", title: "Electric shock of people occurrences", items: [
    { ref: "a", item: "Electrical shock to a member of the public on the network infrastructure", trim: "Y", toc: "N" },
    { ref: "b", item: "Electrical shock to an employee on the network infrastructure", trim: "Y", toc: "N" },
    { ref: "c", item: "Electrical shock to a contractor or contractor's employee on the network infrastructure", trim: "Y", toc: "N" },
    { ref: "d", item: "Electrical shock to the member of the public including passengers whilst on or in rolling stock", trim: "Y", toc: "N" },
    { ref: "e", item: "Electrical shock to an employee whilst positioned on or part of rolling stock", trim: "Y", toc: "N" },
    { ref: "f", item: "Electrical shock to a contractor or contractor's employee whilst positioned on or part of rolling stock", trim: "Y", toc: "N" },
    { ref: "g", item: "Electrical shock to the member of the public in the public area of a station", trim: "Y", toc: "N" },
    { ref: "h", item: "Electrical shock to an employee in the public area of a station", trim: "Y", toc: "N" },
    { ref: "i", item: "Electrical shock of a contractor or contractor's employee in the public area of a station", trim: "Y", toc: "N" },
    { ref: "j", item: "Electrical shock to the member of the public in the passenger area of a station", trim: "Y", toc: "N" },
    { ref: "k", item: "Electrical shock to an employee in the passenger area of a station", trim: "Y", toc: "N" },
    { ref: "l", item: "Electrical shock to a contractor or contractor's employee in the passenger area of a station", trim: "Y", toc: "N" },
  ]},
  { id: "K", group: "Railway operational occurrences", title: "Spillage/leakage, explosion or loss of dangerous goods", items: [
    { ref: "a", item: "Spillage or leakage of dangerous goods en route", trim: "Y", toc: "Y" },
    { ref: "b", item: "Spillage or leakage of dangerous goods during shunting operations", trim: "Y", toc: "Y" },
    { ref: "c", item: "Spillage or leakage of dangerous goods whilst staged", trim: "Y", toc: "Y" },
    { ref: "d", item: "Missing consignment of dangerous goods", trim: "Y", toc: "Y" },
    { ref: "e", item: "Theft of dangerous goods", trim: "Y", toc: "Y" },
    { ref: "f", item: "Explosion of dangerous goods", trim: "Y", toc: "Y" },
  ]},
  { id: "L", group: "Railway operational occurrences", title: "Fire occurrences", items: [
    { ref: "a", item: "Fires on a fixed operational asset impacting on operational safety", trim: "Y", toc: "N" },
    { ref: "b", item: "General freight fires", trim: "Y", toc: "Y" },
    { ref: "c", item: "Technical fault rolling stock fires", trim: "Y", toc: "Y" },
    { ref: "d", item: "Veld fires that threaten operational safety", trim: "Y", toc: "N" },
    { ref: "e", item: "Dangerous goods fires", trim: "Y", toc: "Y" },
    { ref: "f", item: "Explosions of dangerous goods", trim: "Y", toc: "Y" },
  ]},
  { id: "M", group: "Railway operational occurrences", title: "Averted collisions and derailments", items: [
    { ref: "a", item: "Averted collisions on running line", trim: "Y", toc: "Y" },
    { ref: "b", item: "Averted derailments on running line", trim: "Y", toc: "Y" },
    { ref: "c", item: "Averted collisions on any line other than a running line", trim: "Y", toc: "Y" },
    { ref: "d", item: "Averted derailments on any line other than a running line", trim: "Y", toc: "Y" },
    { ref: "e", item: "Hard Coupling", trim: "Y", toc: "Y" },
    { ref: "f", item: "Points run through", trim: "Y", toc: "Y" },
    { ref: "g", item: "Wrong train authorisation issued", trim: "Y", toc: "Y" },
  ]},
  { id: "N", group: "Railway operational occurrences", title: "Pantograph hook-ups", items: [
    { ref: "a", item: "Pantograph Hook-up", trim: "Y", toc: "Y" },
  ]},
  { id: "0", group: "Railway operational occurrences", title: "Onboard passenger related occurrences", items: [
    { ref: "a", item: "Slips, trips or fall on-board a train", trim: "Y", toc: "Y" },
    { ref: "b", item: "Passengers injured on-board due to falling foreign objects while on-board", trim: "Y", toc: "Y" },
    { ref: "c", item: "Fatality due to natural causes on-board train", trim: "Y", toc: "Y" },
  ]},
  { id: "1", group: "Railway security-related incidents", title: "Theft of assets", items: [
    { ref: "a", item: "Theft of rolling stock components in section", trim: "Y", toc: "Y" },
    { ref: "b", item: "Theft of rolling stock components in yards and sidings", trim: "Y", toc: "Y" },
    { ref: "c", item: "Theft of civil infrastructure components in section", trim: "Y", toc: "N" },
    { ref: "d", item: "Theft of civil infrastructure components in yards and sidings", trim: "Y", toc: "N" },
    { ref: "e", item: "Theft of overhead traction equipment in section", trim: "Y", toc: "N" },
    { ref: "f", item: "Theft of overhead traction equipment in yards and sidings", trim: "Y", toc: "N" },
    { ref: "g", item: "Theft of train authorisation, control and telecommunication systems and equipment in section", trim: "Y", toc: "N" },
    { ref: "h", item: "Theft of train authorisation, control, and telecommunication systems and equipment in yards and sidings", trim: "Y", toc: "N" },
    { ref: "i", item: "Theft of ancillary equipment, including public address (PA) systems, information boards and closed-circuit television (CCTV)", trim: "Y", toc: "N" },
    { ref: "j", item: "Theft of freight, including dangerous goods in section", trim: "Y", toc: "Y" },
    { ref: "k", item: "Theft of freight, including dangerous goods in yards and sidings", trim: "Y", toc: "Y" },
  ]},
  { id: "2", group: "Railway security-related incidents", title: "Malicious damage (vandalism) to property impacting on operational safety", items: [
    { ref: "a", item: "Malicious damage (vandalism) of rolling stock components in section", trim: "Y", toc: "Y" },
    { ref: "b", item: "Malicious damage (vandalism) of rolling stock components in yards and sidings (staged)", trim: "Y", toc: "Y" },
    { ref: "c", item: "Malicious damage (vandalism) of civil infrastructure components in section", trim: "Y", toc: "N" },
    { ref: "d", item: "Malicious damage (vandalism) of civil infrastructure components in yards and sidings", trim: "Y", toc: "N" },
    { ref: "e", item: "Malicious damage (vandalism) of overhead traction equipment in section", trim: "Y", toc: "N" },
    { ref: "f", item: "Malicious damage (vandalism) of overhead traction equipment in yards and sidings", trim: "Y", toc: "N" },
    { ref: "g", item: "Malicious damage (vandalism) of train control equipment (signalling) in section", trim: "Y", toc: "N" },
    { ref: "h", item: "Malicious damage (vandalism) of train control equipment (signalling) in yards and sidings", trim: "Y", toc: "N" },
    { ref: "i", item: "Malicious damage (vandalism) of ancillary equipment including public address systems, information boards, CCTV", trim: "Y", toc: "N" },
  ]},
  { id: "3", group: "Railway security-related incidents", title: "Threats of operational safety", items: [
    { ref: "a", item: "A bomb threat to network", trim: "Y", toc: "N" },
    { ref: "b", item: "A bomb threat to station", trim: "Y", toc: "N" },
    { ref: "c", item: "A bomb threat to rolling stock", trim: "Y", toc: "N" },
    { ref: "d", item: "Threats due to electrical power outages", trim: "Y", toc: "N" },
    { ref: "e", item: "Threats other than bomb and power outage threats", trim: "Y", toc: "N" },
  ]},
  { id: "4", group: "Railway security-related incidents", title: "Unauthorised control of trains", items: [
    { ref: "a", item: "Unauthorised person taking control of passenger trains", trim: "Y", toc: "Y" },
    { ref: "b", item: "Unauthorised person taking control of freight trains", trim: "Y", toc: "Y" },
    { ref: "c", item: "Unauthorised person taking control of other rolling stock", trim: "Y", toc: "Y" },
  ]},
  { id: "5", group: "Railway security-related incidents", title: "Crowd-related occurrences", items: [
    { ref: "a", item: "Crowd related incident and includes stampede action", trim: "Y", toc: "Y" },
  ]},
  { id: "6", group: "Railway security-related incidents", title: "Industrial action", items: [
    { ref: "a", item: "Industrial action that causes a threat to safe railway operations", trim: "Y", toc: "Y" },
  ]},
  { id: "7", group: "Railway security-related incidents", title: "Personal safety on trains", items: [
    { ref: "a", item: "Murder", trim: "Y", toc: "Y" },
    { ref: "b", item: "Attempted murder", trim: "Y", toc: "Y" },
    { ref: "c", item: "Rape", trim: "Y", toc: "Y" },
    { ref: "d", item: "Aggravated rape", trim: "Y", toc: "Y" },
    { ref: "e", item: "Assault", trim: "Y", toc: "Y" },
    { ref: "f", item: "Indecent assault", trim: "Y", toc: "Y" },
    { ref: "g", item: "Sexual assault", trim: "Y", toc: "Y" },
    { ref: "h", item: "Aggravated sexual assault", trim: "Y", toc: "Y" },
    { ref: "i", item: "Aggravated robbery", trim: "Y", toc: "Y" },
    { ref: "j", item: "Robbery", trim: "Y", toc: "Y" },
    { ref: "k", item: "Theft", trim: "Y", toc: "Y" },
    { ref: "l", item: "Bomb explosions", trim: "Y", toc: "Y" },
  ]},
  { id: "8", group: "Railway security-related incidents", title: "Personal safety on stations", items: [
    { ref: "a", item: "Murder", trim: "Y", toc: "N" },
    { ref: "b", item: "Attempted murder", trim: "Y", toc: "N" },
    { ref: "c", item: "Rape", trim: "Y", toc: "N" },
    { ref: "d", item: "Aggravated rape", trim: "Y", toc: "N" },
    { ref: "e", item: "Assault", trim: "Y", toc: "N" },
    { ref: "f", item: "Indecent assault", trim: "Y", toc: "N" },
    { ref: "g", item: "Sexual assault", trim: "Y", toc: "N" },
    { ref: "h", item: "Aggravated sexual assault", trim: "Y", toc: "N" },
    { ref: "i", item: "Aggravated robbery", trim: "Y", toc: "N" },
    { ref: "j", item: "Robbery", trim: "Y", toc: "N" },
    { ref: "k", item: "Theft", trim: "Y", toc: "N" },
    { ref: "l", item: "Bomb explosions", trim: "Y", toc: "N" },
  ]},
  { id: "9", group: "Railway security-related incidents", title: "Personal safety outside station platform area (in section between stations, including yards, sidings and depots)", items: [
    { ref: "a", item: "Murder", trim: "Y", toc: "N" },
    { ref: "b", item: "Attempted murder", trim: "Y", toc: "N" },
    { ref: "c", item: "Rape", trim: "Y", toc: "N" },
    { ref: "d", item: "Aggravated rape", trim: "Y", toc: "N" },
    { ref: "e", item: "Assault", trim: "Y", toc: "N" },
    { ref: "f", item: "Indecent assault", trim: "Y", toc: "N" },
    { ref: "g", item: "Sexual assault", trim: "Y", toc: "N" },
    { ref: "h", item: "Aggravated sexual assault", trim: "Y", toc: "N" },
    { ref: "i", item: "Aggravated robbery", trim: "Y", toc: "N" },
    { ref: "j", item: "Robbery", trim: "Y", toc: "N" },
    { ref: "k", item: "Theft", trim: "Y", toc: "N" },
    { ref: "l", item: "Bomb explosions", trim: "Y", toc: "N" },
  ]},
];

export const occurrenceSourceQuirk =
  "E-ANX41-01 (preserved): the source prints \"CATEGORY 0\" (zero) for the letter-O category (Onboard passenger related occurrences). Kept exactly as delivered.";

export const collabPolicySource = {
  file: "sources/Annexure 42 Transnet Customer Collaboration Policy.pdf",
  sha256: "68aa7e5f3124314ccf2ba18feb43b14a87c7262b64935c58ed6f66e0470ca9bd",
  pages: 14,
  owner: "Transnet SOC Ltd",
  docDate: "November 2025",
  effectiveDate: "01 December 2025",
  version: "1.0",
  reviewCycle: "3 Years",
  author: "Nhlanhla Daweti, Transnet Corporate JHB (PDF metadata)",
};

export const collabPolicyPoints = [
  "Establishes a clear, transparent and practical framework for collaboration between Transnet and its customers, designed to address immediate constraints on customers' ability to move goods to market at cost-competitive rates.",
  "Transnet concludes commercial contracts with its customers for income-generating purposes; obligations to customers are regulated by public procurement legislation and Transnet's own policies.",
  "Customers may from time to time identify opportunities to upgrade Transnet infrastructure; such initiatives benefit both Transnet and the customer commercially and emanate purely from the commercial relationship — formalised through the commercial contract (new customers) or a formal addendum (existing customers).",
  "The Policy sets out collaboration initiatives with customers for the purpose of restoring, upgrading, or expanding Transnet infrastructure.",
  "Collaboration will deliver value not only to Transnet and its customers, but also to the broader Africa's broader economic development objectives.",
];

/** Annexure 18 — Roles and Responsibilities during Occurrence Management — round 73.
 * File: sources/Annexure 18 Occurrence Management (1).pdf
 * SHA-256 217daf767a908ecf150e46d5cabdb711054d2446c740c9cb72af38f97a768fe6 (3 p).
 * V3-ERA (E-ANX18-00 period caveat): pre-IM-separation draft — source note preserved:
 * "This document still contains reference to Transnet and will be amended once the IM is fully
 * established". Footnote "*TOC to be included in the processes" preserved.
 * E-ANX18-01/E-ANX18-02: slash-pair cells in rows 1 and 17 recovered from the text layer,
 * preserved as printed, never normalised. */
export const occurrenceRolesSource = {
  file: "sources/Annexure 18 Occurrence Management (1).pdf",
  sha256: "217daf767a908ecf150e46d5cabdb711054d2446c740c9cb72af38f97a768fe6",
  pages: 3,
  title: "Roles and Responsibilities during Occurrence Management",
  caveat: "Note: This document still contains reference to Transnet and will be amended once the IM is fully established (verbatim source note, page 1).",
  footnote: "*TOC to be included in the processes",
  scenarioCols: ["TOC's derailment", "TOC's Level X", "Collision of TOC's Train with another TOC's Train", "Collision of TOC's Train with TFR Operations' Train"],
  interfaceCol: "To be included in the Interface agreement",
};

export interface RoleRow { n: string; activity: string; c1: string; c2: string; c3: string; c4: string; iface: string; }
/** Table 1.1.1.1 — Responsibilities for key activities in Occurrence Management (16 rows). */
export const occurrenceRoleActivities: RoleRow[] = [
  { n: "1", activity: "Reporting of occurrence to Infrastructure Manager (IM: CTC)", c1: "TOCs", c2: "TOCs", c3: "TOCs / TOCs [E-ANX18-01]", c4: "TOCs / Corridor Operations [E-ANX18-01]", iface: "Occurrence reporting process" },
  { n: "2", activity: "Reporting of occurrence to IM: Head Office", c1: "IM: OCC-CTC", c2: "IM: OCC-CTC", c3: "IM: OCC-CTC", c4: "IM: OCC-CTC", iface: "Occurrence reporting process" },
  { n: "3", activity: "Reporting of occurrence to RSR", c1: "IM: OCC", c2: "IM: OCC", c3: "IM: OCC", c4: "IM: OCC", iface: "Occurrence reporting process" },
  { n: "4", activity: "Activation of contingency plan*", c1: "IM: OCC-CTC", c2: "IM: OCC-CTC", c3: "IM: OCC-CTC", c4: "IM: OCC-CTC", iface: "Emergency response and preparedness plan" },
  { n: "5", activity: "Travel, work, food of Corridor", c1: "TOC", c2: "TOC", c3: "TOC", c4: "TOC", iface: "Emergency response and preparedness plan" },
  { n: "6", activity: "Travel, work, food of IM", c1: "IM: OCC", c2: "IM: OCC", c3: "IM: OCC", c4: "IM: OCC", iface: "Emergency response and preparedness plan" },
  { n: "7", activity: "Travel, work, food of Corporate", c1: "IM: Corporate Office", c2: "IM: Corporate Office", c3: "IM: Corporate Office", c4: "IM: Corporate Office", iface: "Emergency response and preparedness plan" },
  { n: "8", activity: "Response from Fire brigade", c1: "IM: OCC-CTC", c2: "IM: OCC-CTC", c3: "IM: OCC-CTC", c4: "IM: OCC-CTC", iface: "Emergency response and preparedness plan" },
  { n: "9", activity: "Response from Ambulance", c1: "IM: OCC-CTC", c2: "IM: OCC-CTC", c3: "IM: OCC-CTC", c4: "IM: OCC-CTC", iface: "Emergency response and preparedness plan" },
  { n: "10", activity: "Response from SAPS", c1: "IM: OCC-CTC", c2: "IM: OCC-CTC", c3: "IM: OCC-CTC", c4: "IM: OCC-CTC", iface: "Emergency response and preparedness plan" },
  { n: "11", activity: "Management of occurrence onsite", c1: "IM: Corridor", c2: "IM: Corridor", c3: "IM: Corridor", c4: "IM: Corridor", iface: "Occurrence Management process" },
  { n: "12", activity: "Onsite investigation*", c1: "IM: Corridor", c2: "IM: Corridor", c3: "IM: Corridor", c4: "IM: Corridor", iface: "Occurrence Management process" },
  { n: "13", activity: "Activation of recovery machines and vehicles", c1: "IM: OCC", c2: "IM: OCC", c3: "IM: OCC", c4: "IM: OCC", iface: "Emergency response and preparedness plan" },
  { n: "14", activity: "Repair of rail infrastructure", c1: "IM: Rail Network", c2: "IM: Rail Network", c3: "IM: Rail Network", c4: "IM: Rail Network", iface: "Emergency response and preparedness plan" },
  { n: "15", activity: "Rehabilitation of occurrence site", c1: "IM: Rail Network", c2: "IM: Rail Network", c3: "IM: Rail Network", c4: "IM: Rail Network", iface: "Emergency response and preparedness plan" },
  { n: "16", activity: "Joint occurrence investigation*", c1: "IM: Corporate Safety Office", c2: "IM: Corporate Safety Office", c3: "IM: Corporate Safety Office", c4: "IM: Corporate Safety Office", iface: "Occurrence Management process" },
];

/** Table 1.1.1.2 — Costs if the TOC is found negligent (13 rows). */
export const occurrenceCostRows: RoleRow[] = [
  { n: "1", activity: "Corridor (Operations) costs for Travel, work, and food", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "2", activity: "IM costs Travel, work, and food", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "3", activity: "Corporate Office costs for Travel, work, and food", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "4", activity: "Fire Brigade Response costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "5", activity: "Ambulance Response costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "6", activity: "SAPS response costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "7", activity: "Management of occurrence site costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "8", activity: "Onsite investigation costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "9", activity: "Activation of recovery machines and vehicles costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "10", activity: "Repair of rail infrastructure costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "11", activity: "Rehabilitation of occurrence site costs", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "12", activity: "Corporate Safety costs for joint occurrence investigation", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
  { n: "13", activity: "repair/replacement of rolling stock", c1: "Affected TOC", c2: "Affected TOC", c3: "Negligent TOC", c4: "Negligent Party", iface: "Costs are for the Negligent Party" },
];

/** Table 1.1.1.3 — Costs if occurrence caused by theft, vandalism, force majeure (17 rows). */
export const occurrenceTheftCostRows: RoleRow[] = [
  { n: "1", activity: "Reporting of occurrence", c1: "TOC", c2: "TOC", c3: "TOC", c4: "TOC", iface: "Include in the interface agreement" },
  { n: "2", activity: "Reporting of occurrence to RSR", c1: "IM: OCC (CTC)", c2: "IM: OCC (CTC)", c3: "IM: OCC (CTC)", c4: "IM: OCC (CTC)", iface: "Include in the interface agreement" },
  { n: "3", activity: "Activation of contingency plan", c1: "IM: OCC", c2: "IM: OCC", c3: "IM: OCC", c4: "IM: OCC", iface: "Include in the interface agreement" },
  { n: "4", activity: "Responders to the Occurrence Travel, work, food of Corridor costs", c1: "IM: Corridor", c2: "IM: Corridor", c3: "IM: Corridor", c4: "IM: Corridor", iface: "Include in the interface agreement" },
  { n: "5", activity: "Responders to the Occurrence Travel, work, food of Infra costs", c1: "IM: Rail Network", c2: "IM: Rail Network", c3: "IM: Rail Network", c4: "IM: Rail Network", iface: "Include in the interface agreement" },
  { n: "6", activity: "Responders to the Occurrence Travel, work, food of OCC costs", c1: "IM: OCC", c2: "IM: OCC", c3: "IM: OCC", c4: "IM: OCC", iface: "Include in the interface agreement" },
  { n: "7", activity: "Responders to the Occurrence Travel, work, food of Corporate costs", c1: "IM: Corporate offices", c2: "IM: Corporate offices", c3: "IM: Corporate offices", c4: "IM: Corporate offices", iface: "Include in the interface agreement" },
  { n: "8", activity: "Response from Fire brigade costs", c1: "IM: OCC (CTC)", c2: "IM: OCC (CTC)", c3: "IM: OCC (CTC)", c4: "IM: OCC (CTC)", iface: "Include in the interface agreement" },
  { n: "9", activity: "Response from Ambulance costs", c1: "IM: OCC (CTC)", c2: "IM: OCC (CTC)", c3: "IM: OCC (CTC)", c4: "IM: OCC (CTC)", iface: "Include in the interface agreement" },
  { n: "10", activity: "Response from SAPS costs", c1: "IM: OCC (CTC)", c2: "IM: OCC (CTC)", c3: "IM: OCC (CTC)", c4: "IM: OCC (CTC)", iface: "Include in the interface agreement" },
  { n: "11", activity: "Management of occurrence site costs", c1: "IM: Corridor", c2: "IM: Corridor", c3: "IM: Corridor", c4: "IM: Corridor", iface: "Include in the interface agreement" },
  { n: "12", activity: "Onsite investigation costs", c1: "IM: Corridor", c2: "IM: Corridor", c3: "IM: Corridor", c4: "IM: Corridor", iface: "Include in the interface agreement" },
  { n: "13", activity: "Activation of recovery machines and vehicles costs", c1: "IM: OCC (CTC)", c2: "IM: OCC (CTC)", c3: "IM: OCC (CTC)", c4: "IM: OCC (CTC)", iface: "Include in the interface agreement" },
  { n: "14", activity: "Repair of rail infrastructure costs", c1: "IM: Rail Network", c2: "IM: Rail Network", c3: "IM: Rail Network", c4: "IM: Rail Network", iface: "Include in the interface agreement" },
  { n: "15", activity: "Rehabilitation of occurrence site costs", c1: "IM: Risk", c2: "IM: Risk", c3: "IM: Risk", c4: "IM: Risk", iface: "Include in the interface agreement" },
  { n: "16", activity: "Joint occurrence investigation costs", c1: "IM: Corporate Safety", c2: "IM: Corporate Safety", c3: "IM: Corporate Safety", c4: "IM: Corporate Safety", iface: "Include in the interface agreement" },
  { n: "17", activity: "Repair/replacement of rolling stock", c1: "TOC", c2: "TOC", c3: "TOC / TOC [E-ANX18-02]", c4: "TOC / IM [E-ANX18-02]", iface: "Include in the interface agreement" },
];

/** Annexure 22 — Loading Profiles (doc title: loading specification RSE/TE/LPR/0010 Rev 6) — round 73.
 * File: sources/Annexure 22 Loading Profiles.pdf
 * SHA-256 e12eb5c492981058b0f197318a456d09c1482d21dd53cb07176906e7200ea5b4 (5 p).
 * E-ANX22-01 (preserved): filename "Loading Profiles" vs printed doc no/title "RSE/TE/LPR/0010
 * Revision: 6" loading specification for ore on open wagons; amendment table numbers 1–5 under
 * "Revision: 6". Period label E-ANX22-00: 2018-era TFR specification carried into the 2024/25
 * annexure set (same "still contains reference to Transnet" note as Anx 18). */
export const loadingProfileSource = {
  file: "sources/Annexure 22 Loading Profiles.pdf",
  sha256: "e12eb5c492981058b0f197318a456d09c1482d21dd53cb07176906e7200ea5b4",
  pages: 5,
  docNo: "RSE/TE/LPR/0010",
  revision: "6",
  issueDate: "23 March 2018",
  header: "TRANSNET FREIGHT RAIL · Document no: RSE/TE/LPR/0010 · Revision: 6 · Issue date: 23 March 2018",
  caveat: "Note: This document still contains reference to Transnet and will be amended once the IM is fully established (verbatim source note, page 1).",
  intro: "This loading specification is for the loading of all types of ore on various types of open wagons. Please note that this loading specification replace specification RSE/TE/LPR/0023 of 3 December 2009. This loading specification supersedes all previous loading instructions, letters, granted concessions and granted deviations. It is the responsibility of the recipient to destroy all old documents.",
  amendments: [
    "1 · sections 3, 4 & 5 · Wagon type added. Change and add information. · 29 January 2010",
    "2 · sections 1, 4 & 6 · Clause 1 & 4 amended and clause 6 added · 17 June 2010",
    "3 · sections 4 & 8 · Remove recommended column and delete clause 8. · 23 February 2011",
    "4 · section 3 · Clause 3 amended · 24 July 2017",
    "5 · section 7 · Amendment of Clause 7 to allow consultation with the customer. · 23 March 2018",
  ],
  products: [
    { product: "Chrome", density: "2.7 ton/m3 to 2.95 ton/m3" },
    { product: "Ferrochrome", density: "2.8 ton/m3 to 3.9 ton/m3" },
    { product: "Carbon Ferromanganese", density: "3.8 ton/m3 to 4.7 ton/m3" },
    { product: "Silicon Manganese", density: "3.3 ton/m3 to 3.5 ton/m3" },
    { product: "Manganese ore", density: "3.7 ton/m3 to 4.6 ton/m3" },
    { product: "Lead ore", density: "7.3 ton/m3 to 7.6 ton/m3" },
    { product: "Iron ore", density: "3.6 ton/m3 to 5.4 ton/m3" },
    { product: "Copper ore", density: "4.1 ton/m3 to 4.3 ton/m3" },
    { product: "Zinc ore", density: "3.9 ton/m3 to 4.2 ton/m3" },
  ],
  wagonTypes: "Wagons used for transporting ore are A, AZD/J, BAL/J, CAR, CMR, CR, DGLJ, DJ and DZ type wagons.",
  limits: [
    "Before any ring-fenced wagon is loaded, the wagon must be clean and all foreign objects must be removed.",
    "The carrying capacity stencilled on the wagon shall not be exceeded.",
    "The wagon must be considered as consisting of two equal halves, left and right, when viewed from the side. The load placed on either half of the wagon must be as equal as possible.",
    "End to end and side to side loading must be as even as possible to minimise derailment potential.",
    "Skew loading limits: End to end: 5 ton · Side to side: 5 ton",
    "If the load protrudes above the sides of the wagon, the load against the sides must stop at least 100 mm below the top of the sides.",
    "If the load is too close to the top edge of the wagon side or end the excess mass must be moved away. This operation must never be performed whilst the wagon is standing underneath overhead wires.",
    "Ore loaded into a wagon with a front-end loader, must be levelled in order to ensure a better distributed load.",
    "Wagons not loaded according to this specification, will not be accepted for conveyance.",
    "See transport agreement for actions if wagons are not loaded correctly.",
  ],
  shunting: "Wagons may under no circumstances be shunted by pulling them on their ends with a back actor or the scoop of a front end-loader. This is an illegal and uncontrolled shunting operation. See Transnet's Instruction CIR/OD/0280 entitled \"Guidelines for the interface between non-rail bound vehicles used for shunting purposes and rail wagons during shunting operations\".",
  customer: [
    "The customer must adhere to the loading specification. Any deviations to the loading method must be requested in writing to the Account Manager.",
    "Transnet must be informed if the loading/off-loading methods and/or product have changed.",
    "The customer may not perform any modification of any nature to Transnet wagons. If there is a need for modifications, the Technical Fleet Owner must approve the request and arrange for the necessary modifications.",
    "This loading specification is subject to change if it either impacts on safety or if modifications/improvements are necessary. The customer shall be consulted prior to implementing any changes.",
  ],
  figureNotes: ["Figure 1 - Load uniformly distributed over the length of the wagon.", "Figure 2 - Load centrally loaded across the width of the wagon.", "Figure 3 – Load below wagon sides", "Heaps equally spaced in wagon and below wagon sides (figure caption as printed)."],
};

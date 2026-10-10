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

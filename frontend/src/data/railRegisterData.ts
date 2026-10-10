/** AUTO-GENERATED structure from sources/Annexure 33_Network Register June 2026 F (1).pdf (round 69).
 * SHA-256 1e2842cbf88c9382a18c604240a79cee985e85f7966fd90a081cdb12b68c9fa0 (8 pages).
 * Verbatim quotes preserved; E-33REG-01 route-list anomaly preserved exactly. */

export const registerSource = {
  file: "sources/Annexure 33_Network Register June 2026 F (1).pdf",
  sha256: "1e2842cbf88c9382a18c604240a79cee985e85f7966fd90a081cdb12b68c9fa0",
  pages: 8,
  docTitle: "Annexure 33 – Network Register (June 2026_v0.3)",
  docDate: "26 June 2026",
  version: "v0.3",
  applicability: "Applicable for the 2026/27 timetable",
  validity: "Annexed (Annexure 33) to the 4th version of the Network Statement; valid in line with the applicable validity period of the fourth version of the Network Statement.",
  note: "Applicants use as a guide to apply for capacity allocation in the relevant Network Statement and timetable period, subject to tariff adjustments by the Department of Transport.",
  author: "Eric Peete, Transnet Freight Rail JHB (PDF metadata)",
};

export const registerPurpose = [
  "Determines the total rail capacity of the Network as declared by TRIM, taking into account asset condition assessments and other relevant factors.",
  "Sets out the criteria for the allocation of capacity in the Network to successful Applicants.",
  "Issued to meet the requirements of the National Rail Policy (NRP) and the ERT Act.",
  "Applicants may approach TRIM for details of the relevant network assessment reports following a process for their release. Network Statement Chapter 4.5.1 details the principles and criteria for allocating capacity.",
];

export const registerContents = [
  { n: "1", item: "Section-by-section slot capacity per route — contained in the downloadable file appended to this Annexure 33 (separate data file — NOT included in this PDF; still to be retrieved).", status: "partial" },
  { n: "2", item: "Functional locations on the network where TSRs and MAs have led to a reduction in slot capacity (infrastructure condition affecting practical capacity).", status: "described" },
  { n: "3", item: "Line classification details (whether N1, N2, etc.) per section.", status: "in-appended-file" },
  { n: "4", item: "Train path capacity per section per corridor: total theoretical capacity, practical capacity, capacity lost and reasons, available operational capacity (daily and weekly), capacity allocated to other operators (contractually committed per the Capacity Application & Allocation process — successful Applicants announced by the Minister of Transport in August 2025; Pre-existing Agreements protected under section 5(2) of the ERT Act), and spare capacity per section.", status: "described" },
];

/** E-33REG-01: the route enumeration in the register duplicates Musina and omits Vereeniging/Danskraal
 * to East London (which exists in the Annexure 33b Capacity_DB). Preserved exactly as printed. */
export const registerRoutes = [
  "Magnetite",
  "Manganese",
  "Ore",
  "Eastern Mainline: Rayton to Komatipoort/Richards Bay",
  "General Freight & Export Coal: Lephalale to Richards Bay",
  "General Freight: Johannesburg to Cape Town",
  "General Freight: Johannesburg to Durban",
  "General Freight: Mafikeng to Beaconsfield/Potchefstroom",
  "General Freight: Musina - Pyramid South/Hoedspruit",
  "General Freight: Musina - Pyramid South/Hoedspruit",
];

export const registerRoutesAnomaly =
  "E-33REG-01 (preserved, not corrected): the register's 10-route list prints route 9 and route 10 identically (General Freight: Musina - Pyramid South/Hoedspruit twice) and omits General Freight: Vereeniging/Danskraal to East London, which exists in the Annexure 33b Capacity_DB (195 rows). The Annexure 33b Capacity Statement covers the full 10-route network per the register's own text.";

export const criticalSections = [
  {
    name: "Leeuhof – Warrenton (via Klerksdorp)",
    issue: "Persistent theft and vandalism of infrastructure components → high transit times, delays and stoppages; overhead power loss forces diesel propulsion.",
    mitigation: "Train services can and do get rerouted via Kroonstad and Bloemfontein, adding distances and longer running times. TRIM is undertaking restoration of vandalised/stolen equipment; acts continue unabated.",
  },
  {
    name: "Thabazimbi – Rustenburg",
    issue: "Persistent theft and vandalism of infrastructure components → high transit times; overhead power loss forces diesel propulsion.",
    mitigation: "No alternative route — diesel propulsion is inevitably required to ensure execution of train services. TRIM restoration efforts ongoing; acts continue unabated.",
  },
];

export const registerScope =
  "TRIM does not own or operate PRASA rail infrastructure. Infrastructure belonging to PRASA and other Infrastructure Managers (including concessioned parts of the network, where the relevant concessionaires are regarded as Infrastructure Managers) is excluded. The register is based solely on infrastructure owned and operated by TRIM.";

export const registerAnnexure33aNote =
  "Annexure 33a contains station-to-station (point to point) running times, distances between stations, and the frequency (or day) each train is scheduled to run. Running times incorporate robustness (recovery and buffer times); where externalities such as theft and vandalism prevail or rolling stock failures occur, the stated running times may not be achieved.";

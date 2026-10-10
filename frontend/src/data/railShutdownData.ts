/** AUTO-GENERATED from round-73 source (Annexure 1 — Revised Transnet Shutdown Schedule Signoff).
 * File: sources/Annexure 1 2024-25 Revised Transnet Shutdown schedule signoff 23 July 2024_signed.pdf
 * SHA-256 81aa096459b3f47a91866de609f679c6996858b9f94b8cb079883dd020b47247 (6 p).
 * V3-ERA PERIOD LABEL (E-ANX1-01): 2024/25 revised schedule, signed 23 July 2024 — NOT the
 * 2026/27 "PROVISIONAL SHUT SCHEDULE FOR 2026/27" the V4 annexure register asks for.
 * Verbatim where quoted; source typos preserved and flagged (E-ANX1-02). */

export const shutdownSource = {
  file: "sources/Annexure 1 2024-25 Revised Transnet Shutdown schedule signoff 23 July 2024_signed.pdf",
  sha256: "81aa096459b3f47a91866de609f679c6996858b9f94b8cb079883dd020b47247",
  pages: 6,
  title: "Revised Transnet Shutdown Schedule Signoff.",
  periodLabel:
    "E-ANX1-01 period caveat: 2024/25 revised shutdown schedule (calendars April 2024 – March 2025), signed 23 July 2024. The V4 annexure register (item 1) calls for the PROVISIONAL SHUT SCHEDULE FOR 2026/27 — that V4 version is still open. Never present these windows as FY26/27.",
  months: [
    "APRIL 2024 : Q1", "MAY 2024:Q1", "JUNE 2024 : Q1",
    "JULY 2024 : Q2", "AUGUST 2024 : Q2", "SEPTEMBER 2024: Q2",
    "OCTOBER 2024: Q3", "NOVEMBER 2024: Q3", "DECEMBER 2024 : Q3",
    "JANUARY 2025: Q4", "FEBRUARY 2025: Q4", "March 2025: Q4",
  ],
  legend: [
    "Shut prep: Occupation between trains",
    "Contractor crew off days",
    "Maintenance days",
    "Move days",
    "TFR Days",
  ],
  corridors: [
    "ORE COR", "NORTH-EAST COR", "NORTHCOR", "CAPE COR", "CAPE COR (MN)",
    "CENTRAL COR", "CONTCOR", "BFX",
  ],
};

/** Total-shut windows as printed on page 2 ("Total shut :" legend region).
 * E-ANX1-02 (preserved): the calendar graphic colour-codes windows to corridors and day
 * types — the PDF text layer lists dates, day-counts and corridor names in graphic order and
 * does NOT encode the pairing. Pairings are therefore NOT reconstructed here. */
export interface ShutWindow { window: string; days?: string; corridorAsPrinted?: string; }
export const shutdownWindows: ShutWindow[] = [
  { window: "23 July -1 Aug 2024", days: "10" },
  { window: "30 May-13 June 2024" },
  { window: "27 Aug-5 Sep 2024", days: "10", corridorAsPrinted: "CONTCOR" },
  { window: "2-5 Sep 2024" },
  { window: "8-17 Oct 2024", days: "10" },
  { window: "12-21 Nov 2024", days: "10", corridorAsPrinted: "CAPE COR (MN)" },
  { window: "4-10 Feb 2025", days: "7" },
  { window: "4-13 Mar 2025", days: "10" },
];

/** Depot / section groups as printed (codes + section names), source order and typos preserved. */
export const shutdownDepots: string[] = [
  "NST Goedgeluk – Eswatini boarder",
  "WIR Belfast – Steelpoort;    Rayton – Goedgeluk",
  "PLK Hoedspruit - Beitbridge",
  "EMG Golela - Richards Bay",
  "ESWATINI Eswatini",
  "MAPUTO Maputo",
  "KDS Ellisras - LUD",
  "EMG Empangeni - Stanger",
  "RBJ Richards Bay - Vryheid; Richards Bay - Skoonkaai electrical yard",
  "ISE LUD - Ogies",
  "ERM Trichardt - Ermelo; Ogies - Overvaal; Wonderfontein - Gelukplaas",
  "VHX Vryheid – Maviristad; Sikame station – Hlobane mine; Vryheid station – Ladysmith",
  "ISE Cowelsdam-Withok",
  "LDS Glencoe-Rushbrook,Kroonstad -Harrismisth - Danskraal;Vryheid station – Ladysmith",
  "DNR Pietermaritzburg-Bayhead Yard",
  "HGR Rooikop-Glencoe",
  "VER City deep /Kaserne-Rooikop",
  "SLD Salkor-Loop 10",
  "UPG Loop 10 - Sishen",
  "KBN Hotazel – Beaconsfield; Warrenton - Beaufort west; Beaconsfield - Bloemfontein",
  "KBS Beaconsfield - DE AAR; Beaconsfield - Beaufort west",
  "KGR Potchefstroom - Warrenton",
  "PE De aar - Port Elizabeth",
  "BLE Beaufort west - Worcester",
  "VER Houthuewel-Catchet",
  "ELS Springfontein - East London; Springfontein - Nourpoort",
  "BFX",
  "KGR Lichtenburg - Welverdiend - Krugersdorp - Mafikeng",
];

/** Sign-off pages 3–5 (Functionality / Position | Name | Date Signed), source order. */
export interface SignOffRow { position: string; name: string; date: string; }
export const shutdownSignOff: SignOffRow[] = [
  { position: "Supported Acting Executive Manager: RNP", name: "Siboniso Vilakazi", date: "2024/07/23" },
  { position: "Supported Acting General Manager: Rail Network and Capital Projects", name: "Sandile Magenuka", date: "23/07/2024" },
  { position: "Supported Head of Occupations & Incident Management: Planning and OCC", name: "Siphesihle Dhlamini", date: "24 July 2024" },
  { position: "Supported Executive Manager :Tactical Volume Planning", name: "Kagisho Mosikare", date: "2024/07/25" },
  { position: "Supported Chief Engineer: Container Corridor", name: "Matimba Shihambi", date: "25/07/2024" },
  { position: "Supported Chief Engineer: Cape & Ore Corridor", name: "Thian de Jager", date: "25/07/2024" },
  { position: "Supported Chief Engineer: Central Corridor", name: "Ntsako Nukeri", date: "25/07/2024" },
  { position: "Supported Chief Engineer: North Corridor", name: "Bongumusa Thusi", date: "26/07/2024" },
  { position: "Supported Acting Chief Engineer: Northeast Corridor", name: "Mxolisi Madela", date: "" },
  { position: "Supported Chief Engineer : RNC", name: "Livhu Netshilavulu", date: "" },
  { position: "Supported Technical Director,TNPA", name: "Mvuyelwa Brian Mtwa", date: "" },
  { position: "Supported General Manager: ECPOT", name: "Jaco Van Der Westhuizen", date: "" },
  { position: "Supported Specialist: Tech Safety&Quality Roll Stock", name: "Nelson Tapala", date: "" },
  { position: "Supported Head of Supply Chain: IM", name: "Nonkosinathi Gilili", date: "" },
  { position: "Supported Head: Supply Chain Management Sourcing • Supply Chain", name: "Mandisi Ngozi", date: "" },
  { position: "Supported Principal Engineer :Rail Renewal", name: "Siphamandla Sibiya", date: "" },
  { position: "Supported Head: Ops, Compliance & Vetting Security", name: "Risimati Shivuri", date: "" },
  { position: "Supported General Manager: Corp Affairs & Stakeholder • Comm & Media", name: "Litha Mcwabeni", date: "" },
  { position: "Supported Snr Spec :Physical SEC OPS & STKH Engagements", name: "Shawn Johnson", date: "" },
  { position: "Supported Snr Consultant • Risk", name: "Elekanyani Phundulu", date: "" },
  { position: "Recommended Acting General Manager: OCC", name: "Mashudu Makatu", date: "" },
  { position: "Approval Chief Executive: Transnet Freight Rail", name: "Russell Baatjies", date: "" },
];

export const shutdownContact = "Thank you — Dimakatso Mathole 083 268 3255 (page 6, as printed).";

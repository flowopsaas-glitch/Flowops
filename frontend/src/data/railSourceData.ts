// GENERATED corpus/source register for the Network Sources page (round 67).
export const corpusStats = {
  files: 672,
  rows: 251678,
  workings: 13471,
  depots: 688,
  okWorkings: 12842,
  flaggedWorkings: 629,
  extractRows: 251678,
  byteIdentical: 251678,
  corridorMix: {
  "NORTH": 80991,
  "CAPE": 65324,
  "CONTAINER": 35663,
  "CENTRAL": 35446,
  "NORTHEAST": 20937,
  "ORELINE": 8959,
  "(blank)": 4358
},
};

export const sourceRegister = [
  {
    name: "Annexure 33a — Point to Point Running Times (TSV extract)",
    file: "sources/Annexure_33a_NS_ver_4 (3).zip → Annexure_33a_NS_ver_4 (3).txt",
    hash: "MD5 1cd978f5a0e5c5528886aa0c66047cb6",
    period: "FY2026/27–FY2027/28",
    role: "SOURCE OF RECORD (user mandate: \"the ann 33a is from transnet so we have to follow it\")",
  },
  {
    name: "Annexure 33a — native workbook",
    file: "sources/Annexure 33a_NS ver.4 (2).xlsx",
    hash: "SHA-256 93b4d44929c037a799969a5b2a5efa514af4abbd7e2711ac0e072ece77745dd5",
    period: "FY2026/27–FY2027/28",
    role: "Corroboration — cell-identical to the extract except float repr + 179 literal &-amp cells (E-AMP-01: extract rendering kept)",
  },
  {
    name: "Annexure 43 — KPIs",
    file: "sources/Annexure 43 KPIs (2).xlsx",
    hash: "SHA-256 18e137f75057f57b05ce3196c2d4b5b4b8c83e35bc57c590ea3c49d89b65fd15",
    period: "FY2026/27–FY2027/28",
    role: "KPI frameworks + 10 train-path baseline/target sheets",
  },
];

export const flagClasses = [
  "30/35/56-second stated-vs-computed duration mismatches (e.g. BELLVILLE 1417 — confirmed in the annexure itself)",
  "Midnight Depart_Day non-rolls (BELLVILLE 2221, WARRENTON 2207, BEITBRIDGE 6770, BFX-PASSASRS 53547)",
  "Travel-vs-clock mismatches (BEITBRIDGE 1118/1120/5736 at COLLEENBAWN: stated 00:24:00 vs computed 00:38:00)",
  "Unparseable stated durations (BEITBRIDGE 8 literally 00:60:00)",
];

export const wantedSources = [
  "✅ DELIVERED — Annexure 33b Capacity Statement (XLSM) → /rail/slots (round 68)",
  "✅ DELIVERED — Annexexure 40 Ancillary Services Catalogue (PDF) → /rail/tariffs (round 68)",
  "✅ DELIVERED — Network Statement V4 body (rule chain + tariffs) + Annexure 15 RAA + Annexure 41 + Annexure 42 (rounds 68–70)",
  "✅ DELIVERED — Annexure 33 Network Register (June 2026 v0.3) → /rail/register (round 69)",
  "✅ DELIVERED — Annexure 17 Investment Plan → /rail/investment (round 69)",
  "Annexure 33 appended data file (section-by-section slots + N1/N2 line classification) — named by the register, not yet supplied",
  "✅ DELIVERED — Access tariffs FY2026/27 (NS V4 Table 17, effective 01 Aug 2026) → /rail/tariffs (round 70)",
  "Ancillary service rates (E-TARIFF-01 ancillary half — NS says future volume) + marshalling rates beyond the indicative Table 18",
  "Full Publication Notice (V4-11)",
  "✅ DELIVERED — Annexure 20a (Cancel/Re-Schedule Process v4) + 20b (Cancellation reasons v1.3) → /rail/cancellations (round 71)",
  "✅ DELIVERED — Annexure 28 Handshake v2.5 + 29a application form + 29b capacity statement + 35 dispute resolution + V4 Publication Notice → /rail/access (round 72)",
  "V3 structural set remainder: 32 (ad-hoc slot application), 19a/19b/19c (POSMOR/TWR)",
  "Operational actuals (SPRINT OTD, realised transit, TSR logs) → variance Actual leg",
];

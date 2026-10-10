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
  "Annexure 33b — Capacity Statement (XLSM) → Slots & Capacity",
  "Approved tariff / rate schedule FY2026/27 (with rates) → Tariffs money path",
  "Annexure 40 — Ancillary Services Catalogue (PDF, full)",
  "Annexure 33 — Network Register (station/siding master)",
  "Network Statement V4 body + Annexure 41 (occurrences) + Annexure 15 (RAA)",
  "V3 structural set: 20a/20b, 28 (handshake), 29a/32 (slot application), 19b",
  "Operational actuals (SPRINT OTD, realised transit, TSR logs) → variance Actual leg",
];

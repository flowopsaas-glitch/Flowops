// GENERATED from sources/Annexure 43 KPIs (2).xlsx (SHA-256 18e137f75057f57b05ce3196c2d4b5b4b8c83e35bc57c590ea3c49d89b65fd15)
// + the rail-source-check corpus (251,678 rows). E-43-01: UOM says "hours"; values are Excel
// day fractions (serial x 24 = hours). Both representations kept; nothing normalised.

export interface KpiTransit {
  kind: "transit";
  id: string;
  baseline: { serial: string; hhmmss: string; hours: number } | null;
  target: { serial: string; hhmmss: string; hours: number } | null;
  comment: string;
}
export interface KpiMeasure {
  kind: "measure";
  label: string;
  baseline: string;
  target: string;
  comment: string;
}
export type KpiRow = KpiTransit | KpiMeasure;

export interface CorpusMatch {
  note: string;
  count: number;
  min?: string | null;
  median?: string | null;
  max?: string | null;
  sample: Array<{ origin: string; train: string; dest: string; runtime: string; rows: number }>;
}

export interface CorridorKpis {
  sheet: string;
  path: string;
  kpis: KpiRow[];
  corpusMatch: CorpusMatch;
}

export const corridors: CorridorKpis[] = [
  {
    "sheet": "Ore",
    "path": "ORE",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "56",
        "baseline": {
          "serial": "1.1298611111111112",
          "hhmmss": "27:07:00",
          "hours": 27.1167
        },
        "target": {
          "serial": "1.0298611111111111",
          "hhmmss": "24:43:00",
          "hours": 24.7167
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "57",
        "baseline": {
          "serial": "1.09375",
          "hhmmss": "26:15:00",
          "hours": 26.25
        },
        "target": {
          "serial": "0.99375000000000002",
          "hhmmss": "23:51:00",
          "hours": 23.85
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "2.5000000000000001E-2",
        "target": "1.6% of the network",
        "comment": "100% reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "7",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "15291",
        "target": "11691",
        "comment": "23% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "5",
        "target": "5",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "1",
        "target": "1",
        "comment": "All Traction Feeder Stations are On-Load"
      }
    ],
    "corpusMatch": {
      "note": "commodity label — no OD endpoints in the sheet",
      "count": 0,
      "sample": []
    }
  },
  {
    "sheet": "Manganese",
    "path": "Manganese",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "58",
        "baseline": {
          "serial": "1.40625",
          "hhmmss": "33:45:00",
          "hours": 33.75
        },
        "target": {
          "serial": "1.3333333333333333",
          "hhmmss": "32:00:00",
          "hours": 32.0
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "59",
        "baseline": {
          "serial": "1.875",
          "hhmmss": "45:00:00",
          "hours": 45.0
        },
        "target": {
          "serial": "1.7194444444444446",
          "hhmmss": "41:16:00",
          "hours": 41.2667
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "1.7000000000000001E-2",
        "target": "1.6% of the network",
        "comment": "100% reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "19",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "534928",
        "target": "323728",
        "comment": "39% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "6.4",
        "target": "8",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.94",
        "target": "0.97",
        "comment": "5 units are off under PE depot. The target is to restore at least 3 traction units within the current financial year"
      }
    ],
    "corpusMatch": {
      "note": "commodity label — no OD endpoints in the sheet",
      "count": 0,
      "sample": []
    }
  },
  {
    "sheet": "Magnetite",
    "path": "Phalaborwa to Richardsbay",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "67",
        "baseline": {
          "serial": "1.6597222222222223",
          "hhmmss": "39:50:00",
          "hours": 39.8333
        },
        "target": {
          "serial": "1.3972222222222221",
          "hhmmss": "33:32:00",
          "hours": 33.5333
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "68",
        "baseline": {
          "serial": "1.4583333333333333",
          "hhmmss": "35:00:00",
          "hours": 35.0
        },
        "target": {
          "serial": "1.4131944444444444",
          "hhmmss": "33:54:60",
          "hours": 33.9167
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "0.04",
        "target": "1.6% of the network",
        "comment": "18% reduction by end of FY "
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "6",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "61324",
        "target": "29743",
        "comment": "51% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "8.1999999999999993",
        "target": "8",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Line not electrified"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Line not electrified"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 0,
      "min": null,
      "median": null,
      "max": null,
      "sample": []
    }
  },
  {
    "sheet": "Musina-Pyramid_Hoedspruit",
    "path": "Musina to Pyramid/Hoedspruit",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "69",
        "baseline": {
          "serial": "0.8305555555555556",
          "hhmmss": "19:56:00",
          "hours": 19.9333
        },
        "target": {
          "serial": "0.78055555555555556",
          "hhmmss": "18:44:00",
          "hours": 18.7333
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "71",
        "baseline": {
          "serial": "0.72847222222222219",
          "hhmmss": "17:29:00",
          "hours": 17.4833
        },
        "target": {
          "serial": "0.62847222222222221",
          "hhmmss": "15:04:60",
          "hours": 15.0833
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "70",
        "baseline": {
          "serial": "0.77013888888888893",
          "hhmmss": "18:29:00",
          "hours": 18.4833
        },
        "target": {
          "serial": "0.72013888888888888",
          "hhmmss": "17:16:60",
          "hours": 17.2833
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "72",
        "baseline": {
          "serial": "0.83819444444444446",
          "hhmmss": "20:07:00",
          "hours": 20.1167
        },
        "target": {
          "serial": "0.73819444444444449",
          "hhmmss": "17:43:00",
          "hours": 17.7167
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "8.0000000000000002E-3",
        "target": "1.6% of the network",
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "6",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "1282",
        "target": "1154",
        "comment": "10% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "7.4 (N2)\r\n10.6 (N3)",
        "target": "9 (N2)\r\n12 (N3)",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Line not electrified"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Line not electrified"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 3,
      "min": "15:13:00",
      "median": "17:32:00",
      "max": "21:13:00",
      "sample": [
        {
          "origin": "HOEDSPRUIT",
          "train": "8495",
          "dest": "MUSINA",
          "runtime": "15:13:00",
          "rows": 46
        },
        {
          "origin": "MUSINA",
          "train": "28902",
          "dest": "PYRAMIDSUID",
          "runtime": "17:32:00",
          "rows": 79
        },
        {
          "origin": "MUSINA",
          "train": "6770",
          "dest": "HOEDSPRUIT",
          "runtime": "21:13:00",
          "rows": 46
        }
      ]
    }
  },
  {
    "sheet": "Vereeniging-Danskraal-East Lond",
    "path": "(1) Vereeniging/Danskraal to East London",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "73",
        "baseline": {
          "serial": "1.8576388888888888",
          "hhmmss": "44:34:60",
          "hours": 44.5833
        },
        "target": {
          "serial": "1.6576388888888889",
          "hhmmss": "39:47:00",
          "hours": 39.7833
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "64",
        "baseline": {
          "serial": "1.5965277777777778",
          "hhmmss": "38:19:00",
          "hours": 38.3167
        },
        "target": {
          "serial": "1.3465277777777778",
          "hhmmss": "32:18:60",
          "hours": 32.3167
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "74",
        "baseline": {
          "serial": "1.6902777777777778",
          "hhmmss": "40:34:00",
          "hours": 40.5667
        },
        "target": {
          "serial": "1.4902777777777778",
          "hhmmss": "35:46:00",
          "hours": 35.7667
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "65",
        "baseline": {
          "serial": "1.4750000000000001",
          "hhmmss": "35:24:00",
          "hours": 35.4
        },
        "target": {
          "serial": "1.2250000000000001",
          "hhmmss": "29:24:00",
          "hours": 29.4
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "2.1999999999999999E-2",
        "target": "1.6% of the network",
        "comment": "97% reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "27",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "99078",
        "target": "97441",
        "comment": "2% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "8.1",
        "target": "9",
        "comment": "Within range of target"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "There are 4 traction units between Vereeniging and Wolwehoek, of which 2 of them are currently off-load. The section between Wolwehoek and Danskraal is currently not electrified: OHTE and Substations were vandalised and Electrical infrastructure was subsequently de-commission. Also the section from Wolwehoek to East London: Electrical infrastructure was vandalised, no Transnet Electrical trains are running in this section; we however still have 4 traction units under East London depot that are still operational and on-load."
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 0,
      "min": null,
      "median": null,
      "max": null,
      "sample": []
    }
  },
  {
    "sheet": "Mafikeng-Beacosnfield_Potch",
    "path": "Mafikeng to Beaconsfield/Potchefstroom",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "61",
        "baseline": {
          "serial": "1.2638888888888888",
          "hhmmss": "30:20:00",
          "hours": 30.3333
        },
        "target": {
          "serial": "0.97222222222222221",
          "hhmmss": "23:20:00",
          "hours": 23.3333
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "60",
        "baseline": {
          "serial": "0.75902777777777775",
          "hhmmss": "18:13:00",
          "hours": 18.2167
        },
        "target": {
          "serial": "0.60902777777777772",
          "hhmmss": "14:36:60",
          "hours": 14.6167
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "62",
        "baseline": {
          "serial": "1.3458333333333334",
          "hhmmss": "32:18:00",
          "hours": 32.3
        },
        "target": {
          "serial": "1.3055555555555556",
          "hhmmss": "31:20:00",
          "hours": 31.3333
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "63",
        "baseline": {
          "serial": "0.74375000000000002",
          "hhmmss": "17:51:00",
          "hours": 17.85
        },
        "target": {
          "serial": "0.59375",
          "hhmmss": "14:15:00",
          "hours": 14.25
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "2.8000000000000001E-2",
        "target": "1.6% of the network",
        "comment": "88% reduction by end of FY "
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "1",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "208130",
        "target": "186054",
        "comment": "10% reduction for Mafikeng - Veertien Stroom (TWS),  PCM to BEC covered in JHB to CPT"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "8.1999999999999993",
        "target": "9",
        "comment": "Within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.83",
        "target": "0.9",
        "comment": "Krugersdorp depot needs to bring back on load a minimum of 3 substation units (between Potchefstroom and Veerstien Strome)  within the current financial year"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 3,
      "min": "8:23:00",
      "median": "11:01:00",
      "max": "27:52:00",
      "sample": [
        {
          "origin": "MAFIKENG",
          "train": "4410",
          "dest": "BEACONSFIELD",
          "runtime": "08:23:00",
          "rows": 40
        },
        {
          "origin": "MAFIKENG",
          "train": "1402",
          "dest": "BEACONSFIELD",
          "runtime": "11:01:00",
          "rows": 107
        },
        {
          "origin": "BEACONSFIELD",
          "train": "2401",
          "dest": "MAFIKENG",
          "runtime": "27:52:00",
          "rows": 40
        }
      ]
    }
  },
  {
    "sheet": "Lephalale-Richardsbay",
    "path": "Lephalale - Richardsbay",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "75",
        "baseline": {
          "serial": "2.2118055555555554",
          "hhmmss": "53:04:60",
          "hours": 53.0833
        },
        "target": {
          "serial": "1.8618055555555555",
          "hhmmss": "44:41:00",
          "hours": 44.6833
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "77",
        "baseline": {
          "serial": "0.91319444444444442",
          "hhmmss": "21:54:60",
          "hours": 21.9167
        },
        "target": {
          "serial": "0.7631944444444444",
          "hhmmss": "18:19:00",
          "hours": 18.3167
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "76",
        "baseline": {
          "serial": "2.5402777777777779",
          "hhmmss": "60:58:00",
          "hours": 60.9667
        },
        "target": {
          "serial": "2.1902777777777778",
          "hhmmss": "52:34:00",
          "hours": 52.5667
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "78",
        "baseline": {
          "serial": "0.88055555555555554",
          "hhmmss": "21:08:00",
          "hours": 21.1333
        },
        "target": {
          "serial": "0.73055555555555551",
          "hhmmss": "17:31:60",
          "hours": 17.5333
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "1.7000000000000001E-2",
        "target": "1.6% of the network",
        "comment": "93% reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "25",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "392474",
        "target": "221649",
        "comment": "43% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "7.5 (N1)\r\n5.7 (S)",
        "target": "8 (N1)\r\n6 (S)",
        "comment": "TQI within acceptable range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.87",
        "target": "0.9",
        "comment": "Koedoespoort depot needs to restore at least 6 units out of 7 units that are off"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 0,
      "min": null,
      "median": null,
      "max": null,
      "sample": []
    }
  },
  {
    "sheet": "Johannesburg - Durban",
    "path": "Container  Johannesburg (City Deep) to Durban (Kingsrest)",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "79",
        "baseline": {
          "serial": "1.5874999999999999",
          "hhmmss": "38:05:60",
          "hours": 38.1
        },
        "target": {
          "serial": "1.2083333333333333",
          "hhmmss": "29:00:00",
          "hours": 29.0
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "80",
        "baseline": {
          "serial": "1.3798611111111112",
          "hhmmss": "33:07:00",
          "hours": 33.1167
        },
        "target": {
          "serial": "1.2083333333333333",
          "hhmmss": "29:00:00",
          "hours": 29.0
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "1.4E-2",
        "target": "1.6% of the network",
        "comment": "56% further reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "21",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "721324",
        "target": "648192",
        "comment": "10% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "10",
        "target": "8",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.73",
        "target": "0.9",
        "comment": "All 4 responsible depots (Vereeniging, Hiedelberg, Ladysmith &amp; Durban) need to restore their substation. They are all performing below 90%"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 15,
      "min": "13:35:00",
      "median": "28:21:00",
      "max": "28:58:00",
      "sample": [
        {
          "origin": "DURBANPAS",
          "train": "67208",
          "dest": "JOHANNESBURG",
          "runtime": "13:35:00",
          "rows": 125
        },
        {
          "origin": "DURBANPAS",
          "train": "67010",
          "dest": "JOHANNESBURG",
          "runtime": "14:20:00",
          "rows": 123
        },
        {
          "origin": "JOHANNESBURG",
          "train": "76009",
          "dest": "DURBANPAS",
          "runtime": "14:30:00",
          "rows": 122
        },
        {
          "origin": "KINGSREST",
          "train": "8904",
          "dest": "KASERNE",
          "runtime": "28:21:00",
          "rows": 117
        },
        {
          "origin": "KINGSREST",
          "train": "8906",
          "dest": "KAZ-CITYDEEP",
          "runtime": "28:21:00",
          "rows": 116
        },
        {
          "origin": "KINGSREST",
          "train": "8912",
          "dest": "KAZ-CITYDEEP",
          "runtime": "28:21:00",
          "rows": 116
        },
        {
          "origin": "KINGSREST",
          "train": "8922",
          "dest": "KAZ-CITYDEEP",
          "runtime": "28:21:00",
          "rows": 116
        },
        {
          "origin": "KINGSREST",
          "train": "8982",
          "dest": "KAZ-CITYDEEP",
          "runtime": "28:21:00",
          "rows": 116
        }
      ]
    }
  },
  {
    "sheet": "Rayton-Komatipoort_Richards Bay",
    "path": "Rayton to Komatipoort/Richards Bay, ",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "52",
        "baseline": {
          "serial": "1.1680555555555556",
          "hhmmss": "28:02:00",
          "hours": 28.0333
        },
        "target": {
          "serial": "0.96805555555555556",
          "hhmmss": "23:14:00",
          "hours": 23.2333
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "53",
        "baseline": {
          "serial": "1.2416666666666667",
          "hhmmss": "29:48:00",
          "hours": 29.8
        },
        "target": {
          "serial": "0.9916666666666667",
          "hhmmss": "23:48:00",
          "hours": 23.8
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "81",
        "baseline": {
          "serial": "1.2986111111111112",
          "hhmmss": "31:10:00",
          "hours": 31.1667
        },
        "target": {
          "serial": "1.0986111111111112",
          "hhmmss": "26:22:00",
          "hours": 26.3667
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "55",
        "baseline": {
          "serial": "1.1256944444444446",
          "hhmmss": "27:01:00",
          "hours": 27.0167
        },
        "target": {
          "serial": "0.92569444444444449",
          "hhmmss": "22:13:00",
          "hours": 22.2167
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "54",
        "baseline": {
          "serial": "1.21875",
          "hhmmss": "29:15:00",
          "hours": 29.25
        },
        "target": {
          "serial": "0.96875",
          "hhmmss": "23:15:00",
          "hours": 23.25
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "82",
        "baseline": {
          "serial": "1.3215277777777779",
          "hhmmss": "31:43:00",
          "hours": 31.7167
        },
        "target": {
          "serial": "1.1215277777777777",
          "hhmmss": "26:54:60",
          "hours": 26.9167
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "0.05",
        "target": "1.6% of the network",
        "comment": "66% reduction by end of FY "
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "14",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "267358",
        "target": "178493",
        "comment": "33% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "8.8000000000000007",
        "target": "8",
        "comment": "Within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.94",
        "target": "1",
        "comment": "Restore 1 unit under Witbank depot, and 1 unit under Nelspruit depot"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 0,
      "min": null,
      "median": null,
      "max": null,
      "sample": []
    }
  },
  {
    "sheet": "Johannesburg - Cape Town",
    "path": "Johannesburg (City Deep) - Cape Town (Bellville)",
    "kpis": [
      {
        "kind": "measure",
        "label": "TRANSIT SPEEDS",
        "baseline": "",
        "target": "",
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "50",
        "baseline": {
          "serial": "3.2555555555555555",
          "hhmmss": "78:08:00",
          "hours": 78.1333
        },
        "target": {
          "serial": "2.4708333333333332",
          "hhmmss": "59:18:00",
          "hours": 59.3
        },
        "comment": ""
      },
      {
        "kind": "transit",
        "id": "51",
        "baseline": {
          "serial": "2.3715277777777777",
          "hhmmss": "56:55:00",
          "hours": 56.9167
        },
        "target": {
          "serial": "2.2118055555555554",
          "hhmmss": "53:04:60",
          "hours": 53.0833
        },
        "comment": ""
      },
      {
        "kind": "measure",
        "label": "TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period",
        "baseline": "1.4999999999999999E-2",
        "target": "1.6% of the network",
        "comment": "100% reduction by end of FY"
      },
      {
        "kind": "measure",
        "label": "Number of speed restrictions at end of reporting period",
        "baseline": "4",
        "target": "N/A",
        "comment": "Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK"
      },
      {
        "kind": "measure",
        "label": "Number of manual train authorisations at end of reporting period",
        "baseline": "611579",
        "target": "409503",
        "comment": "33% reduction"
      },
      {
        "kind": "measure",
        "label": "TRACK CONDITION — Track Quality Index",
        "baseline": "6.3 (N1)\r\n6.3 (N2)",
        "target": "8 (N1)\r\n9 (N2)",
        "comment": "TQI within range"
      },
      {
        "kind": "measure",
        "label": "Overhead traction quality index",
        "baseline": "N/A",
        "target": "N/A",
        "comment": "Under development, next reporting phase"
      },
      {
        "kind": "measure",
        "label": "Traction Substation Availability",
        "baseline": "0.75",
        "target": "0.9",
        "comment": "Bellville depot is required to bring back on-load 18 units out of 23 that is off"
      }
    ],
    "corpusMatch": {
      "note": "OD-name match: Origin contains an A-endpoint token and header Destination a B-endpoint token (or vice versa); runtime = header Train Throughput Runtime",
      "count": 6,
      "min": "38:07:00",
      "median": "43:32:00",
      "max": "48:55:00",
      "sample": [
        {
          "origin": "BELLVILLE",
          "train": "38915",
          "dest": "KASERNE",
          "runtime": "38:07:00",
          "rows": 212
        },
        {
          "origin": "BELLVILLE",
          "train": "48915",
          "dest": "KAZ-CITYDEEP",
          "runtime": "38:40:00",
          "rows": 213
        },
        {
          "origin": "BELLVILLE",
          "train": "7311",
          "dest": "KASERNE",
          "runtime": "43:32:00",
          "rows": 213
        },
        {
          "origin": "BELLVILLE",
          "train": "18571",
          "dest": "KASERNE",
          "runtime": "43:32:00",
          "rows": 213
        },
        {
          "origin": "KASERNE",
          "train": "1210",
          "dest": "BELLVILLE",
          "runtime": "48:55:00",
          "rows": 215
        },
        {
          "origin": "KASERNE",
          "train": "1460",
          "dest": "BELLVILLE",
          "runtime": "48:55:00",
          "rows": 214
        }
      ]
    }
  }
];

export const frameworks: Record<string, string[][]> = {
  "Future KPI Framework": [
    [
      "KPI CATEGORY",
      "KPI / MEASURE",
      "UNIT OF MEASURE",
      "ATTRIBUTION",
      "REPORTING FREQUENCY/LEVEL"
    ],
    [
      "RELIABILITY",
      "% of services exiting network on schedule within tolerance of 30min (OTD) ( SPRINT data)",
      "% of total services",
      "IM + TOC",
      "Quarterly / Route"
    ],
    [
      "47",
      "",
      "% of total services",
      "IM + TOC",
      "Quarterly / Route"
    ],
    [
      "DELAY ATTRIBUTION",
      "Delay minutes per train – IM causes",
      "Minutes/train",
      "IM",
      "Quarterly / Route"
    ],
    [
      "9",
      "",
      "Minutes/train",
      "TOC",
      "Quarterly / Route"
    ],
    [
      "SLOT MODIFICATION",
      "Requests to change allocated slot",
      "Count of requests and % accepted",
      "TOC (request) / IM (decision)",
      "Per request / Period"
    ],
    [
      "15",
      "",
      "Treated as cancellation (count / % of slots)",
      "TOC",
      "Per request / Period"
    ],
    [
      "IM Non-COMPLIANCE WITH RESPONSIBILITIES",
      "Failure to honour allocated slot due to IM fault",
      "% of cancelled slots",
      "IM",
      "Period / Train Path"
    ],
    [
      "19",
      "",
      "Count of breaches",
      "IM",
      "Period / Train Path"
    ],
    [
      "TOC Non-USAGE OF ALLOCATED SLOTS",
      "Cancellation ≥xx days before departure",
      "% of cancelled slots",
      "TOC",
      "Per request / Period"
    ],
    [
      "22",
      "",
      "% of cancelled slots",
      "TOC",
      "Per request / Period"
    ],
    [
      "IM UNIT COSTS",
      "Train control costs",
      "R/track-km",
      "IM",
      "Quarterly / Route"
    ],
    [
      "Definitions"
    ],
    [
      "NRP",
      "Under development, next reporting phase"
    ],
    [
      "Pilot",
      "Not currently measured - part of pilot phase"
    ],
    [
      "References",
      "https://www.researchgate.net/publication/347219345_Analyzing_Major_Track_Quality_Indices_and_Introducing_a_Universally_Applicable_TQI"
    ],
    [
      "36"
    ]
  ],
  "Current KPI Framework": [
    [
      "KPI CATEGORY",
      "KPI / MEASURE",
      "UNIT OF MEASURE",
      "ATTRIBUTION",
      "REPORTING FREQUENCY/LEVEL"
    ],
    [
      "TRANSIT SPEEDS",
      "Route Scheduled Train Throughput Times ",
      "Average transit times (hours)",
      "IM+TOC",
      "Annual / Train Path"
    ],
    [
      "TRACK SERVICE QUALITY",
      "Track under Temporary Speed Restriction at end of reporting period",
      "Km and % of total track",
      "IM",
      "Quarterly / Route"
    ],
    [
      "42",
      "",
      "Count",
      "IM",
      "Quarterly / Route"
    ],
    [
      "46",
      "",
      "Count",
      "IM",
      "Quarterly / Route"
    ],
    [
      "TRACK CONDITION",
      "Track Quality Index",
      "50th Percentile TQI ",
      "IM",
      "Quarterly / Route"
    ],
    [
      "27",
      "",
      "Index value",
      "IM",
      "Quarterly / Route"
    ],
    [
      "29",
      "",
      "%",
      "IM",
      "Quarterly / Route"
    ],
    [
      "Definitions"
    ],
    [
      "NRP",
      "Under development, next reporting phase"
    ],
    [
      "Pilot",
      "Not currently measured - part of pilot phase"
    ],
    [
      "References",
      "https://www.researchgate.net/publication/347219345_Analyzing_Major_Track_Quality_Indices_and_Introducing_a_Universally_Applicable_TQI"
    ],
    [
      "",
      "Laubscher, S., Jooste, J.L. (2023). Analysis and Modelling of the Track Quality Index of Railways. In: von Leipzig, K., Sacks, N., Mc Clelland, M. (eds) Smart, Sustainable Manufacturing in an Ever-Changing World. Lecture Notes in Production Engineering. Springer, Cham. https://doi.org/10.1007/978-3-031-15602-1_37"
    ]
  ]
};

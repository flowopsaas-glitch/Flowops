# TRIM Annexure 43 — KPI framework & corridor baselines — full-file survey (2026-10-10)
**Source:** `sources/Annexure 43 KPIs (2).xlsx` (user upload, commit `e24e70c`, 2026-10-10).
**SHA-256** `18e137f75057f57b05ce3196c2d4b5b4b8c83e35bc57c590ea3c49d89b65fd15` · 51,984 bytes · 12 sheets.
**Period:** FY2026/27–FY2027/28 (Network Statement V4, Gazette 55426).
**Relationship to earlier records:** `docs/TRIM-ANNEXURE-43-40-SUPPLIED-SOURCE-2026-10-04.md`
recorded a chat-pasted text sample of Annexure 43 (10 corridors + 2 frameworks). This workbook
is the **native binary** of that annexure and supersedes the chat sample as the source of record.
The retrieval manifest's "record the true format on receipt" question is answered: **XLSX**.

## 1. Sheet inventory

| # | sheet | content |
|---|---|---|
| 1 | Future KPI Framework | 13 future KPIs (reliability, delay attribution, slot modification, IM/TOC non-compliance, unit costs) |
| 2 | Current KPI Framework | 6 current KPIs (transit speeds, TSR, speed restrictions, manual authorisations, TQI, traction) |
| 3–12 | one sheet per train path | Baseline / Target / Comment per KPI for that path |

Train-path sheets: Ore · Manganese · Magnetite · Musina-Pyramid_Hoedspruit ·
Vereeniging-Danskraal-East Lond · Mafikeng-Beacosnfield_Potch · Lephalale-Richardsbay ·
Johannesburg - Durban · Rayton-Komatipoort_Richards Bay · Johannesburg - Cape Town.
(Sheet-name spellings `Beacosnfield`, `East Lond` are the workbook's own — preserved.)

## 2. Framework sheets (verbatim cells)

### Future KPI Framework

| KPI CATEGORY | KPI / MEASURE | UNIT OF MEASURE | ATTRIBUTION | REPORTING FREQUENCY/LEVEL |
| RELIABILITY | % of services exiting network on schedule within tolerance of 30min (OTD) ( SPRINT data) | % of total services | IM + TOC | Quarterly / Route |
| 47 |  | % of total services | IM + TOC | Quarterly / Route |
| DELAY ATTRIBUTION | Delay minutes per train – IM causes | Minutes/train | IM | Quarterly / Route |
| 9 |  | Minutes/train | TOC | Quarterly / Route |
| SLOT MODIFICATION | Requests to change allocated slot | Count of requests and % accepted | TOC (request) / IM (decision) | Per request / Period |
| 15 |  | Treated as cancellation (count / % of slots) | TOC | Per request / Period |
| IM Non-COMPLIANCE WITH RESPONSIBILITIES | Failure to honour allocated slot due to IM fault | % of cancelled slots | IM | Period / Train Path |
| 19 |  | Count of breaches | IM | Period / Train Path |
| TOC Non-USAGE OF ALLOCATED SLOTS | Cancellation ≥xx days before departure | % of cancelled slots | TOC | Per request / Period |
| 22 |  | % of cancelled slots | TOC | Per request / Period |
| IM UNIT COSTS | Train control costs | R/track-km | IM | Quarterly / Route |
| Definitions |
| NRP | Under development, next reporting phase |
| Pilot | Not currently measured - part of pilot phase |
| References | https://www.researchgate.net/publication/347219345_Analyzing_Major_Track_Quality_Indices_and_Introducing_a_Universally_Applicable_TQI |
| 36 |

### Current KPI Framework

| KPI CATEGORY | KPI / MEASURE | UNIT OF MEASURE | ATTRIBUTION | REPORTING FREQUENCY/LEVEL |
| TRANSIT SPEEDS | Route Scheduled Train Throughput Times  | Average transit times (hours) | IM+TOC | Annual / Train Path |
| TRACK SERVICE QUALITY | Track under Temporary Speed Restriction at end of reporting period | Km and % of total track | IM | Quarterly / Route |
| 42 |  | Count | IM | Quarterly / Route |
| 46 |  | Count | IM | Quarterly / Route |
| TRACK CONDITION | Track Quality Index | 50th Percentile TQI  | IM | Quarterly / Route |
| 27 |  | Index value | IM | Quarterly / Route |
| 29 |  | % | IM | Quarterly / Route |
| Definitions |
| NRP | Under development, next reporting phase |
| Pilot | Not currently measured - part of pilot phase |
| References | https://www.researchgate.net/publication/347219345_Analyzing_Major_Track_Quality_Indices_and_Introducing_a_Universally_Applicable_TQI |
|  | Laubscher, S., Jooste, J.L. (2023). Analysis and Modelling of the Track Quality Index of Railways. In: von Leipzig, K., Sacks, N., Mc Clelland, M. (eds) Smart, Sustainable Manufacturing in an Ever-Changing World. Lecture Notes in Production Engineering. Springer, Cham. https://doi.org/10.1007/978-3-031-15602-1_37 |

## 3. Corridor KPI tables (baseline → target)

Transit-speed values are stored as **Excel day fractions**. The UOM row says
"Average transit times (hours)" — read as `serial × 24 = hours`. **Exception E-43-01:** the
unit label and the storage format disagree; both readings are shown and neither is assumed.

| sheet | path | KPI rows | measure rows (TSR / restrictions / manual auth / TQI / traction) |
|---|---|---|---|
| Ore | ORE | see below | see below |
| Manganese | Manganese | see below | see below |
| Magnetite | Phalaborwa to Richardsbay | see below | see below |
| Musina-Pyramid_Hoedspruit | Musina to Pyramid/Hoedspruit | see below | see below |
| Vereeniging-Danskraal-East Lond | (1) Vereeniging/Danskraal to East London | see below | see below |
| Mafikeng-Beacosnfield_Potch | Mafikeng to Beaconsfield/Potchefstroom | see below | see below |
| Lephalale-Richardsbay | Lephalale - Richardsbay | see below | see below |
| Johannesburg - Durban | Container  Johannesburg (City Deep) to Durban (Kingsrest) | see below | see below |
| Rayton-Komatipoort_Richards Bay | Rayton to Komatipoort/Richards Bay,  | see below | see below |
| Johannesburg - Cape Town | Johannesburg (City Deep) - Cape Town (Bellville) | see below | see below |

### Ore — ORE

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 56 — scheduled transit time | 1.1298611111111112 (= 27:07:00 h) | 1.0298611111111111 (= 24:43:00 h) |  |
| 57 — scheduled transit time | 1.09375 (= 26:15:00 h) | 0.99375000000000002 (= 23:51:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 2.5000000000000001E-2 | 1.6% of the network | 100% reduction by end of FY |
| Number of speed restrictions at end of reporting period | 7 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 15291 | 11691 | 23% reduction |
| TRACK CONDITION — Track Quality Index | 5 | 5 | TQI within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 1 | 1 | All Traction Feeder Stations are On-Load |

### Manganese — Manganese

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 58 — scheduled transit time | 1.40625 (= 33:45:00 h) | 1.3333333333333333 (= 32:00:00 h) |  |
| 59 — scheduled transit time | 1.875 (= 45:00:00 h) | 1.7194444444444446 (= 41:16:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 1.7000000000000001E-2 | 1.6% of the network | 100% reduction by end of FY |
| Number of speed restrictions at end of reporting period | 19 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 534928 | 323728 | 39% reduction |
| TRACK CONDITION — Track Quality Index | 6.4 | 8 | TQI within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.94 | 0.97 | 5 units are off under PE depot. The target is to restore at least 3 traction units within the current financial year |

### Magnetite — Phalaborwa to Richardsbay

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 67 — scheduled transit time | 1.6597222222222223 (= 39:50:00 h) | 1.3972222222222221 (= 33:32:00 h) |  |
| 68 — scheduled transit time | 1.4583333333333333 (= 35:00:00 h) | 1.4131944444444444 (= 33:54:60 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 0.04 | 1.6% of the network | 18% reduction by end of FY  |
| Number of speed restrictions at end of reporting period | 6 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 61324 | 29743 | 51% reduction |
| TRACK CONDITION — Track Quality Index | 8.1999999999999993 | 8 | TQI within range |
| Overhead traction quality index | N/A | N/A | Line not electrified |
| Traction Substation Availability | N/A | N/A | Line not electrified |

### Musina-Pyramid_Hoedspruit — Musina to Pyramid/Hoedspruit

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 69 — scheduled transit time | 0.8305555555555556 (= 19:56:00 h) | 0.78055555555555556 (= 18:44:00 h) |  |
| 71 — scheduled transit time | 0.72847222222222219 (= 17:29:00 h) | 0.62847222222222221 (= 15:04:60 h) |  |
| 70 — scheduled transit time | 0.77013888888888893 (= 18:29:00 h) | 0.72013888888888888 (= 17:16:60 h) |  |
| 72 — scheduled transit time | 0.83819444444444446 (= 20:07:00 h) | 0.73819444444444449 (= 17:43:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 8.0000000000000002E-3 | 1.6% of the network |  |
| Number of speed restrictions at end of reporting period | 6 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 1282 | 1154 | 10% reduction |
| TRACK CONDITION — Track Quality Index | 7.4 (N2) ⏎ 10.6 (N3) | 9 (N2) ⏎ 12 (N3) | TQI within range |
| Overhead traction quality index | N/A | N/A | Line not electrified |
| Traction Substation Availability | N/A | N/A | Line not electrified |

### Vereeniging-Danskraal-East Lond — (1) Vereeniging/Danskraal to East London

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 73 — scheduled transit time | 1.8576388888888888 (= 44:34:60 h) | 1.6576388888888889 (= 39:47:00 h) |  |
| 64 — scheduled transit time | 1.5965277777777778 (= 38:19:00 h) | 1.3465277777777778 (= 32:18:60 h) |  |
| 74 — scheduled transit time | 1.6902777777777778 (= 40:34:00 h) | 1.4902777777777778 (= 35:46:00 h) |  |
| 65 — scheduled transit time | 1.4750000000000001 (= 35:24:00 h) | 1.2250000000000001 (= 29:24:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 2.1999999999999999E-2 | 1.6% of the network | 97% reduction by end of FY |
| Number of speed restrictions at end of reporting period | 27 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 99078 | 97441 | 2% reduction |
| TRACK CONDITION — Track Quality Index | 8.1 | 9 | Within range of target |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | N/A | N/A | There are 4 traction units between Vereeniging and Wolwehoek, of which 2 of them are currently off-load. The section between Wolwehoek and Danskraal is currently not electrified: OHTE and Substations were vandalised and Electrical infrastructure was subsequently de-commission. Also the section from Wolwehoek to East London: Electrical infrastructure was vandalised, no Transnet Electrical trains are running in this section; we however still have 4 traction units under East London depot that are still operational and on-load. |

### Mafikeng-Beacosnfield_Potch — Mafikeng to Beaconsfield/Potchefstroom

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 61 — scheduled transit time | 1.2638888888888888 (= 30:20:00 h) | 0.97222222222222221 (= 23:20:00 h) |  |
| 60 — scheduled transit time | 0.75902777777777775 (= 18:13:00 h) | 0.60902777777777772 (= 14:36:60 h) |  |
| 62 — scheduled transit time | 1.3458333333333334 (= 32:18:00 h) | 1.3055555555555556 (= 31:20:00 h) |  |
| 63 — scheduled transit time | 0.74375000000000002 (= 17:51:00 h) | 0.59375 (= 14:15:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 2.8000000000000001E-2 | 1.6% of the network | 88% reduction by end of FY  |
| Number of speed restrictions at end of reporting period | 1 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 208130 | 186054 | 10% reduction for Mafikeng - Veertien Stroom (TWS),  PCM to BEC covered in JHB to CPT |
| TRACK CONDITION — Track Quality Index | 8.1999999999999993 | 9 | Within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.83 | 0.9 | Krugersdorp depot needs to bring back on load a minimum of 3 substation units (between Potchefstroom and Veerstien Strome)  within the current financial year |

### Lephalale-Richardsbay — Lephalale - Richardsbay

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 75 — scheduled transit time | 2.2118055555555554 (= 53:04:60 h) | 1.8618055555555555 (= 44:41:00 h) |  |
| 77 — scheduled transit time | 0.91319444444444442 (= 21:54:60 h) | 0.7631944444444444 (= 18:19:00 h) |  |
| 76 — scheduled transit time | 2.5402777777777779 (= 60:58:00 h) | 2.1902777777777778 (= 52:34:00 h) |  |
| 78 — scheduled transit time | 0.88055555555555554 (= 21:08:00 h) | 0.73055555555555551 (= 17:31:60 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 1.7000000000000001E-2 | 1.6% of the network | 93% reduction by end of FY |
| Number of speed restrictions at end of reporting period | 25 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 392474 | 221649 | 43% reduction |
| TRACK CONDITION — Track Quality Index | 7.5 (N1) ⏎ 5.7 (S) | 8 (N1) ⏎ 6 (S) | TQI within acceptable range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.87 | 0.9 | Koedoespoort depot needs to restore at least 6 units out of 7 units that are off |

### Johannesburg - Durban — Container  Johannesburg (City Deep) to Durban (Kingsrest)

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 79 — scheduled transit time | 1.5874999999999999 (= 38:05:60 h) | 1.2083333333333333 (= 29:00:00 h) |  |
| 80 — scheduled transit time | 1.3798611111111112 (= 33:07:00 h) | 1.2083333333333333 (= 29:00:00 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 1.4E-2 | 1.6% of the network | 56% further reduction by end of FY |
| Number of speed restrictions at end of reporting period | 21 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 721324 | 648192 | 10% reduction |
| TRACK CONDITION — Track Quality Index | 10 | 8 | TQI within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.73 | 0.9 | All 4 responsible depots (Vereeniging, Hiedelberg, Ladysmith &amp; Durban) need to restore their substation. They are all performing below 90% |

### Rayton-Komatipoort_Richards Bay — Rayton to Komatipoort/Richards Bay, 

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 52 — scheduled transit time | 1.1680555555555556 (= 28:02:00 h) | 0.96805555555555556 (= 23:14:00 h) |  |
| 53 — scheduled transit time | 1.2416666666666667 (= 29:48:00 h) | 0.9916666666666667 (= 23:48:00 h) |  |
| 81 — scheduled transit time | 1.2986111111111112 (= 31:10:00 h) | 1.0986111111111112 (= 26:22:00 h) |  |
| 55 — scheduled transit time | 1.1256944444444446 (= 27:01:00 h) | 0.92569444444444449 (= 22:13:00 h) |  |
| 54 — scheduled transit time | 1.21875 (= 29:15:00 h) | 0.96875 (= 23:15:00 h) |  |
| 82 — scheduled transit time | 1.3215277777777779 (= 31:43:00 h) | 1.1215277777777777 (= 26:54:60 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 0.05 | 1.6% of the network | 66% reduction by end of FY  |
| Number of speed restrictions at end of reporting period | 14 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 267358 | 178493 | 33% reduction |
| TRACK CONDITION — Track Quality Index | 8.8000000000000007 | 8 | Within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.94 | 1 | Restore 1 unit under Witbank depot, and 1 unit under Nelspruit depot |

### Johannesburg - Cape Town — Johannesburg (City Deep) - Cape Town (Bellville)

| KPI / measure | Baseline | Target | Comment |
|---|---|---|---|
| TRANSIT SPEEDS |  |  |  |
| 50 — scheduled transit time | 3.2555555555555555 (= 78:08:00 h) | 2.4708333333333332 (= 59:18:00 h) |  |
| 51 — scheduled transit time | 2.3715277777777777 (= 56:55:00 h) | 2.2118055555555554 (= 53:04:60 h) |  |
| TRACK SERVICE QUALITY — Track under Temporary Speed Restriction at end of reporting period | 1.4999999999999999E-2 | 1.6% of the network | 100% reduction by end of FY |
| Number of speed restrictions at end of reporting period | 4 | N/A | Aim is to reduce the overall track kilometers under speed, and therefore keep TSRs within 1.6% of STK |
| Number of manual train authorisations at end of reporting period | 611579 | 409503 | 33% reduction |
| TRACK CONDITION — Track Quality Index | 6.3 (N1) ⏎ 6.3 (N2) | 8 (N1) ⏎ 9 (N2) | TQI within range |
| Overhead traction quality index | N/A | N/A | Under development, next reporting phase |
| Traction Substation Availability | 0.75 | 0.9 | Bellville depot is required to bring back on-load 18 units out of 23 that is off |

## 4. What this unlocks (product view)

- **Corridor KPI dashboard** — every train path has quantified baseline→target pairs for the
  current framework (transit speed, TSR km/%, restriction counts, manual authorisations, TQI,
  traction availability) and a future framework (OTD reliability, delay attribution, slot
  modification, IM/TOC compliance, unit costs).
- **Transit-time variance engine** — Annexure 33a supplies the *planned* running times (the corpus
  mirrors 27,993 rows of it; the full extract has 251,678). Annexure 43 supplies the *target*
  transit times per path. Actuals (SPRINT / operations) are the third leg — **still needed** (§5).
- **Delay attribution & slot workflow** — future-framework KPIs define the measures the Daily
  Handshake and slot-modification flows must be able to count.

## 5. Open items recorded (never invented)

1. **E-43-01** UOM says `hours`, values are Excel day fractions (×24 = hours). Both readings shown.
2. **E-43-02** KPI ID rows (50–82 in path sheets; 9/15/19/22/27/29/42/46/47 in frameworks) carry the
   ID in the category column and leave the measure cell blank — the measure is implied by the
   preceding category header row. Mapping is recorded, not re-authored.
3. **Actuals data** (SPRINT OTD, realised transit times, actual TSR/downtime logs) is not in the
   annexure set — required to compute variance; requested in `RAIL-UI-PAGES-AND-PANELS-2026-10-10.md`.
4. `Magnetite` sheet's path name is `Phalaborwa to Richardsbay` while the sheet is named `Magnetite`;
   `Musina-Pyramid_Hoedspruit` covers two destinations. Names preserved as-is.

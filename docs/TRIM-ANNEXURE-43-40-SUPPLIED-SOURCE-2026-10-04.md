# TRIM Annexure 43 and Annexure 40 — supplied source record

**Date recorded:** 2026-10-04
**Supplied by:** Owner, pasted into session chat
**Status:** VERIFIED as to content. NOT VERIFIED as to completeness — see §3.
**Governing period:** Annexure 40 is titled "TRIM ANCILLARY SERVICES CATALOGUE **2026/27**", which falls inside Network Statement V4 (Gazette 55426, 21 Sept 2026, governing FY2026/27 and FY2027/28). This is the correct edition for the build.

---

## 1. Provenance and standing rule

These two annexures are the ones flagged as blocking the KPI dashboard and the ancillary-services money path. They arrived as **text in chat**, not as files, so no binary enters the repository tree and no hash is recorded — the standing "sources out of Git" constraint exists to keep binaries out, and there is no binary here.

The text is reproduced in §5 and §6 essentially as supplied, tidied into tables for use. Nothing has been corrected. Where the source contradicts itself, the contradiction is **recorded in §4, not resolved** — the standing rule is that an absent or ambiguous value becomes a recorded exception, never an invented one.

---

## 2. What this unblocks

| Module | Before | After |
|---|---|---|
| KPI dashboard (Annexure 43) | No baselines or targets existed | 10 corridors with real baseline/target pairs, plus two framework sheets |
| Ancillary services catalogue (Annexure 40) | 40 items known to exist, shapes unknown | 40 items across 4 tiers, with units of measure |
| **Ancillary services pricing** | Blocked | **STILL BLOCKED** — see §3 |

---

## 3. The blocking gap: Annexure 40 contains no rates

Annexure 40 as supplied is a **catalogue, not a tariff**. Every one of the 40 line items carries a *unit of measure* and none carries a *price*.

Consequently:

- The ancillary-services money path **cannot be unblocked by this document**.
- No Rand value may be derived, interpolated, or estimated from it.
- The calculator remains `BLOCKED / NOT_PRICED` for ancillary services, exactly as it is for train-path corridors.

Additionally, **7 line items carry no basis for pricing at all** and are marked `TBD` in the source itself:

| Item | Service | Status |
|---|---|---|
| 34a | DMR network access service | TBD |
| 34b | LTE broadband and MCPTT service | TBD |
| 34c | LTE and DMR hybrid interworking service | TBD |
| 34d | DMR and LTE high-site coverage service | TBD |
| 34e | Mission-critical smart device service | TBD |
| 34f | Intelligent NOC and customer service assurance | TBD |
| 34g | Smart port telecommunications and IoT connectivity | TBD |
| 40 | Staging (leasing of underutilised rail lines) | TBD |

**What is still required:** the tariff/pricing sheet carrying Rand values per unit for the remaining 32 items, and any future determination on the 8 marked TBD.

---

## 4. Data-quality observations (recorded, NOT corrected)

These are defects and ambiguities in the source as supplied. They are recorded here so that the build does not silently encode them as truth.

### 4.1 Sheet 12 (Johannesburg – Cape Town) is truncated

The supplied text ends mid-sheet:

```
Number of manual train authorisations at end of reporting period   611579   409503   33% reduction
```

Sheets 3–11 all continue into a `TRACK CONDITION` block (Track Quality Index, Overhead traction quality index, Traction Substation Availability). Sheet 12 has **no TRACK CONDITION rows**. Either the paste was cut short or the source sheet is incomplete. **Three KPI values for the JHB–Cape Town corridor are therefore ABSENT, not zero.**

### 4.2 Reduction comments contradict their own numbers

Several "reduction by end of FY" comments do not match the baseline/target pair beside them:

| Sheet | Corridor | Baseline | Target | Comment | Problem |
|---|---|---|---|---|---|
| 3 | Ore | 2.50% | 1.6% | "100% reduction" | 2.50% → 1.6% is a 36% reduction, not 100% |
| 4 | Manganese | 1.70% | 1.6% | "100% reduction" | 1.70% → 1.6% is a 6% reduction, not 100% |
| 12 | JHB–Cape Town | 1.50% | 1.6% | "100% reduction" | Target is *higher* than baseline — this is an increase, not a reduction |

The `1.6% of the network` target is constant across all ten corridors, and the same block of comment text recurs verbatim in all of them. The percentage comments appear to be carried over from another period or copy-pasted without update. **Treat the numeric baseline/target columns as authoritative and the comment text as unreliable.**

### 4.3 Mixed units within a single KPI

`Traction Substation Availability` is expressed inconsistently:

| Sheet | Corridor | Baseline | Target |
|---|---|---|---|
| 3 | Ore | 100% | 100% |
| 4 | Manganese | 94% | **0.97** |
| 8 | Mafikeng | **0.83** | 90% |
| 9 | Lephalale | **0.87** | 90% |
| 10 | JHB–Durban | 73% | 90% |
| 11 | Rayton | 94% | 100% |

The same field mixes percentages and decimals. Any comparison across corridors must normalise these first. **The direction of goodness is not stated and must not be assumed.**

### 4.4 Track Quality Index direction is ambiguous

TQI values both rise and fall as targets:

| Sheet | Corridor | Baseline | Target | Movement |
|---|---|---|---|---|
| 3 | Ore | 5 | 5 | flat |
| 4 | Manganese | 6.4 | 8 | **up** |
| 5 | Magnetite | 8.2 | 8 | down |
| 6 | Musina | 7.4 (N2) / 10.6 (N3) | 9 (N2) / 12 (N3) | **up** |
| 7 | Vereeniging | 8.1 | 9 | **up** |
| 8 | Mafikeng | 8.2 | 9 | **up** |
| 10 | JHB–Durban | 10 | 8 | down |

Six of seven move **upward**, and the comment in every case reads "TQI within range". Whether a higher TQI is better or worse is **not stated anywhere in the source** and is not safely inferable — in some published track-quality conventions a lower index is better, which would make six of these targets regressions. **No green/red judgement may be rendered on TQI until TRIM states the polarity.**

### 4.5 Future Framework items are not measurable yet

Sheet 1 (Future KPI Framework) contains two placeholders with no figures:

- `NRP` — "Under development, next reporting phase"
- `Pilot` — "Not currently measured - part of pilot phase"

Sheet 1 also defines a threshold it does not quantify: `Cancellation ≥xx days before departure`. The **`xx` is literal in the source** — the number of days is undefined. This is the cancellation-notice period that would drive TOC non-usage charges, so **it is a pricing-relevant gap, not merely cosmetic.**

### 4.6 Overhead traction quality index is unimplemented

`Overhead traction quality index` is `N/A` with comment "Under development, next reporting phase" on every electrified corridor, and "Line not electrified" on Magnetite, Musina, and the N3 sections. It is **not a measurable KPI in this period.**

---

## 5. Annexure 43 — KPI framework

### 5.1 Sheet 1: Future KPI Framework

| Category | KPI / Measure | Unit | Attribution | Frequency / Level |
|---|---|---|---|---|
| RELIABILITY | % of services exiting network on schedule within tolerance of 30min (OTD) (SPRINT data) | % of total services | IM + TOC | Quarterly / Route |
| RELIABILITY | % of services entering network on schedule within tolerance (OTA) (SPRINT data) | % of total services | IM + TOC | Quarterly / Route |
| DELAY ATTRIBUTION | Delay minutes per train – IM causes | Minutes/train | IM | Quarterly / Route |
| DELAY ATTRIBUTION | Delay minutes per train – TOC causes | Minutes/train | TOC | Quarterly / Route |
| SLOT MODIFICATION | Requests to change allocated slot | Count of requests and % accepted | TOC (request) / IM (decision) | Per request / Period |
| SLOT MODIFICATION | Cancellation after IM rejects modification request | Treated as cancellation (count / % of slots) | TOC | Per request / Period |
| IM NON-COMPLIANCE | Failure to honour allocated slot due to IM fault | % of cancelled slots | IM | Period / Train Path |
| IM NON-COMPLIANCE | Failure to meet disclosure / notification obligations | Count of breaches | IM | Period / Train Path |
| TOC NON-USAGE | Cancellation ≥xx days before departure | % of cancelled slots | TOC | Per request / Period |
| TOC NON-USAGE | Failure to cancel (no-show) | % of cancelled slots | TOC | Per request / Period |
| IM UNIT COSTS | Train control costs | R/track-km | IM | Quarterly / Route |

### 5.2 Sheet 2: Current KPI Framework

| Category | KPI / Measure | Unit | Attribution | Frequency / Level |
|---|---|---|---|---|
| TRANSIT SPEEDS | Route Scheduled Train Throughput Times | Average transit times (hours) | IM+TOC | Annual / Train Path |
| TRACK SERVICE QUALITY | Track under Temporary Speed Restriction at end of reporting period | Km and % of total track | IM | Quarterly / Route |
| TRACK SERVICE QUALITY | Number of speed restrictions at end of reporting period | Count | IM | Quarterly / Route |
| TRACK SERVICE QUALITY | Number of manual train authorisations at end of reporting period | Count | IM | Quarterly / Route |
| TRACK CONDITION | Track Quality Index | 50th Percentile TQI | IM | Quarterly / Route |
| TRACK CONDITION | Overhead traction quality index | Index value | IM | Quarterly / Route |
| TRACK CONDITION | Traction Substation Availability | % | IM | Quarterly / Route |

### 5.3 Sheets 3–12: per-corridor baselines and targets

Transit times are `hh:mm`. See §4 for the caveats that apply to these figures.

**Sheet 3 — Ore**
| KPI | Baseline | Target |
|---|---|---|
| Forward: SAZ-SIS | 27:07 | 24:43 |
| Return: SIS-SAZ | 26:15 | 23:51 |
| Track under TSR | 2.50% | 1.6% of the network |
| Number of speed restrictions | 7 | N/A |
| Manual train authorisations | 15291 | 11691 |
| Track Quality Index | 5 | 5 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 100% | 100% |

**Sheet 4 — Manganese**
| KPI | Baseline | Target |
|---|---|---|
| Forward: HTZ-PE | 33:45 | 32:00 |
| Return: PE-HTZ | 45:00 | 41:16 |
| Track under TSR | 1.70% | 1.6% of the network |
| Number of speed restrictions | 19 | N/A |
| Manual train authorisations | 534928 | 323728 |
| Track Quality Index | 6.4 | 8 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 94% | 0.97 |

**Sheet 5 — Magnetite (Phalaborwa to Richardsbay)**
| KPI | Baseline | Target |
|---|---|---|
| Forward: PHW-RBQ | 39:50 | 33:32 |
| Forward: RBQ-PHW | 35:00 | 33:55 |
| Track under TSR | 4% | 1.6% of the network |
| Number of speed restrictions | 6 | N/A |
| Manual train authorisations | 61324 | 29743 |
| Track Quality Index | 8.2 | 8 |
| Overhead traction quality index | N/A | N/A (line not electrified) |
| Traction Substation Availability | N/A | N/A (line not electrified) |

**Sheet 6 — Musina to Pyramid / Hoedspruit**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Musina - Pyramid | 19:56 | 18:44 |
| Forward: Musina - Hoedspruit | 17:29 | 15:05 |
| Return: Pyramid-Musina | 18:29 | 17:17 |
| Return: Hoedspruit-Musina | 20:07 | 17:43 |
| Track under TSR | 0.80% | 1.6% of the network |
| Number of speed restrictions | 6 | N/A |
| Manual train authorisations | 1282 | 1154 |
| Track Quality Index | 7.4 (N2) / 10.6 (N3) | 9 (N2) / 12 (N3) |
| Overhead traction quality index | N/A | N/A (line not electrified) |
| Traction Substation Availability | N/A | N/A (line not electrified) |

**Sheet 7 — Vereeniging / Danskraal to East London**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Danskraal-East London | 44:35 | 39:47 |
| Forward: Vereeniging-East London | 38:19 | 32:19 |
| Return: East London-Danskaal | 40:34 | 35:46 |
| Return: East London-Vereeniging | 35:24 | 29:24 |
| Track under TSR | 2.20% | 1.6% of the network |
| Number of speed restrictions | 27 | N/A |
| Manual train authorisations | 99078 | 97441 |
| Track Quality Index | 8.1 | 9 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | N/A | N/A |

**Sheet 8 — Mafikeng to Beaconsfield / Potchefstroom**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Mafikeng - Potchefstroom | 30:20 | 23:20 |
| Forward: Mafikeng - Beaconsfield | 18:13 | 14:37 |
| Return: Potchefstroom-Mafikeng | 32:18 | 31:20 |
| Return: Beaconsfield-Mafikeng | 17:51 | 14:15 |
| Track under TSR | 2.80% | 1.6% of the network |
| Number of speed restrictions | 1 | N/A |
| Manual train authorisations | 208130 | 186054 |
| Track Quality Index | 8.2 | 9 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 0.83 | 90% |

**Sheet 9 — Lephalale – Richardsbay**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Lephalale-Richardsbay | 53:05 | 44:41 |
| Forward: Trichardt-Richardsbay | 21:55 | 18:19 |
| Return: Richardsbay-Lephalale | 60:58 | 52:34 |
| Return: Richardsbay-Trichardt | 21:08 | 17:32 |
| Track under TSR | 1.70% | 1.6% of the network |
| Number of speed restrictions | 25 | N/A |
| Manual train authorisations | 392474 | 221649 |
| Track Quality Index | 7.5 (N1) / 5.7 (S) | 8 (N1) / 6 (S) |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 0.87 | 90% |

**Sheet 10 — Container: Johannesburg (City Deep) to Durban (Kingsrest)**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Johannesburg-Durban | 38:06 | 29:00 |
| Return: Durban-Johannesburg | 33:07 | 29:00 |
| Track under TSR | 1.40% | 1.6% of the network |
| Number of speed restrictions | 21 | N/A |
| Manual train authorisations | 721324 | 648192 |
| Track Quality Index | 10 | 8 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 73% | 90% |

**Sheet 11 — Rayton to Komatipoort / Richards Bay**
| KPI | Baseline | Target |
|---|---|---|
| Forward: Rayton-Komatipoort | 28:02 | 23:14 |
| Forward: Rayton-Richardsbay | 29:48 | 23:48 |
| Forward: Steelpoort-Komatipoort | 31:10 | 26:22 |
| Return: Komatipoort-Rayton | 27:01 | 22:13 |
| Return: Richardsbay-Rayton | 29:15 | 23:15 |
| Return: Komatipoort-Steelpoort | 31:43 | 26:55 |
| Track under TSR | 5% | 1.6% of the network |
| Number of speed restrictions | 14 | N/A |
| Manual train authorisations | 267358 | 178493 |
| Track Quality Index | 8.8 | 8 |
| Overhead traction quality index | N/A | N/A |
| Traction Substation Availability | 94% | 100% |

**Sheet 12 — Johannesburg (City Deep) – Cape Town (Bellville)** — *TRUNCATED, see §4.1*
| KPI | Baseline | Target |
|---|---|---|
| Forward: JHB-CT | 78:08 | 59:18 |
| Return: CT-JHB | 56:55 | 53:05 |
| Track under TSR | 1.50% | 1.6% of the network |
| Number of speed restrictions | 4 | N/A |
| Manual train authorisations | 611579 | 409503 |
| Track Quality Index | **ABSENT** | **ABSENT** |
| Overhead traction quality index | **ABSENT** | **ABSENT** |
| Traction Substation Availability | **ABSENT** | **ABSENT** |

---

## 6. Annexure 40 — Ancillary Services Catalogue 2026/27

40 line items in 4 tiers. **No prices supplied — see §3.**

### Tier 1: Infrastructure Access Services
*Safety critical and compulsory for day-to-day train operations*

| # | Service | Unit of measure |
|---|---|---|
| 1 | Yards: shunting and marshalling (incl. crew waiting rooms / ablutions where available) | Per wagon movement (GF <50 wagons; Medium heavy >50 <100; heavy >100) |
| 2 | Inland terminals: handling of containerised cargo for road-to-rail modal transfer | Per container handled |
| 3 | Radio network (Trunk & Open Channel) | Per radio (monthly subscription) |
| 4a | Radio & Telemeter Compliance Testing and Acceptance Support | Per device |
| 4b | Radio & Telemeter Programming and Configuration Support | Per device |
| 4c | TOC Radio Onboarding and Activation | Per radio |
| 4d | Train Radio Box and locomotive handset installation and commissioning | Per locomotive |

### Tier 2: Rail Critical Support Services
*Safety critical but non-compulsory for day-to-day running*

| # | Service | Unit of measure |
|---|---|---|
| 5 | Track and trace data (VIS and CS90) | Per month |
| 6 | Rolling stock condition data (wayside: WPM, ABE, WIM) | Per month |
| 7 | Locomotive pantograph monitoring data | Per loco per month |
| 8 | Evaluation of new rolling stock | Per certificate (per wagon/loco) |

### Tier 3: Optional Rail Support Services

| # | Service | Unit of measure |
|---|---|---|
| 9 | Engineering and technical reviews of rail project proposals | Per hour |
| 10 | Weigh bridge calibration test train rental (wagons) | Per wagon per hour |
| 11 | Business case reviews and support | Per hour |
| 12 | Weigh bridge repair, calibration and validation | Per certificate (1 per weighbridge) |
| 13 | Rail construction consultancy | Per hour |
| 14 | Rail infrastructure specifications | Subscription per annum (all revisions that year) |
| 15 | Private siding inspections | Per inspection |
| 16 | Applications for new or upgraded level crossings | Per application |
| 17 | Quality assurance, testing and commissioning | Per certificate |
| 18 | Rental of cabooses | Per caboose/day |
| 19 | Electrical network capacity analysis | Per request |
| 20 | Electrical protection review and issuing settings | Per application |
| 21 | OHTE mechanised condition assessments | Per run |
| 22 | Technical investigations (failure investigation) | Per request |
| 23 | Pantograph and roof equipment inspection | Per locomotive |
| 24 | Electrical energy performance analysis | Per request |
| 25 | Electrical systems and technology audits | Per request |

### Tier 4: Non-Rail Services
*Telecoms, property, and safety & emergency services outside rail operations*

**Telecoms — dark fibre and transmission (26–29)**
| # | Service | Unit of measure |
|---|---|---|
| 26 | Unlit dark optic fibre NLD (50–1000km): installation / leasing / maintenance | Per installation (once off) / Per month / Per km per month |
| 27 | Dark optic fibre Metro (0–50km); transmission links (E1, STM-1/4/16/64); data packages (1/2.5/5/10 Gbps) | Per installation, per link, per month |
| 28 | Dark fibre support services — real estate (comms room 3×3, utilities MRC, site access) | Per room/month; per site visit |
| 29 | Installation of non-TRIM optic fibre (underground / overhead) | Per meter |

**Telecoms — services (30–34)**
| # | Service | Unit of measure |
|---|---|---|
| 30 | Radio & wireless communication services (9 sub-services incl. intrinsically safe, marine VHF, high-site co-location, port terminal wireless/Navis, managed Wi-Fi, narrowband gateways) | Per radio/month; per site/project; per unit; per site/month; per terminal/month; per access point/site/month; per gateway or repeater/month |
| 31 | Transmission & data connectivity (dedicated/managed wavelength, DWDM/OTN, Carrier Ethernet, MPLS/IP VPN, microwave, satellite backhaul, legacy access) | Per wavelength/month; per link/month; per site/month; per link once off/month; per terminal once off + subscription; per port/link/month |
| 32 | Telecommunications facilities & infrastructure (rack/room/outdoor colocation, AC/DC power and battery backup, site access) | Per rack/room/m²/month; per connection/month or metered; per site visit |
| 33 | Ad hoc installations (LAN points, CCTV) | Per site |
| 34 | Future digital telecommunication services (7 sub-services: DMR, LTE/MCPTT, hybrid, high-site, smart device, NOC assurance, smart port IoT) | **TBD — all seven** |

**Safety and emergency services (35–38)**
| # | Service | Unit of measure |
|---|---|---|
| 35 | Emergency response (fire, chemical spills, derailments): specialist vehicle, fire engine 3500L, water tanker, grass unit, incident command vehicle, first response vehicle; specialized equipment (decanting pumps, extinguishers, foam concentrates, spill sorb, splash suits, SCBA); labour (Chief/Senior/Fire Officer, Fire Fighter); water used | Per call-out (first 30 min) / per vehicle per hour; per unit; per extinguisher; per litre; per 10kg bag; per suit; per hour; per kl |
| 36 | Fire equipment maintenance (4.5kg/9kg DCP, 5kg CO2, 9kg water, 9kg foam water, hose reels, hydrants) | Per extinguisher / per reel / per hydrant |
| 37 | Fire equipment and escape signage supply (pair: item and arrow) | Per pair |
| 38 | Technical support: fire risk assessment, evacuation drills/simulations, rail route risk profiling, lecture rooms, fire training grounds and props | Per assessment; per drill/simulation; per site; per room per day; per day/per hour |

**Property (39–40)**
| # | Service | Unit of measure |
|---|---|---|
| 39 | Access to wayleaves (processing and review of applications on or through TRIM infrastructure) | Per application |
| 40 | Staging — leasing of underutilised rail lines within stations and yards for temporary staging, parking or idling | **TBD** |

---

## 7. Exceptions raised by this document

Recorded per the standing rule that an absent or ambiguous value becomes an exception, never an invention.

| ID | Exception | Effect |
|---|---|---|
| EXC-043-01 | Annexure 40 supplied with no Rand values | Ancillary services calculator remains `BLOCKED / NOT_PRICED` |
| EXC-043-02 | 8 line items marked TBD (34a–34g, 40) | No catalogue basis for pricing; excluded from any cost model |
| EXC-043-03 | Sheet 12 truncated — 3 KPI values absent for JHB–Cape Town | Corridor renders as incomplete, never as zero |
| EXC-043-04 | Reduction comments contradict their baseline/target pairs (sheets 3, 4, 12) | Numeric columns authoritative; comment text not rendered as fact |
| EXC-043-05 | Traction Substation Availability mixes % and decimal | Normalise before cross-corridor comparison |
| EXC-043-06 | TQI polarity unstated; 6 of 7 targets move upward | No green/red judgement on TQI until TRIM states polarity |
| EXC-043-07 | `Cancellation ≥xx days` — threshold literal, undefined | TOC non-usage charges cannot be computed |
| EXC-043-08 | Overhead traction quality index N/A on all corridors | Not a measurable KPI this period |

---

## 8. Still required

1. **Annexure 40 tariff sheet** with Rand values per unit — unblocks the money path.
2. **Sheet 12 complete**, or confirmation that TRACK CONDITION is genuinely absent for JHB–Cape Town.
3. **TQI polarity** — whether higher or lower is better.
4. **The `xx` cancellation threshold** in Sheet 1.
5. Remaining V4 annexures from the retrieval manifest, notably 15 (RAA), 18 (occurrence management), 21 (clearinghouse), 28 (daily handshake), 29a (network access application), 32/33/33a/33b (capacity), 35 (dispute resolution).

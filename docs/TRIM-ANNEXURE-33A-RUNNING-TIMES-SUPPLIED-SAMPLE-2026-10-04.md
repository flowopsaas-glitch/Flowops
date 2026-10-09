# TRIM Annexure 33a — Point to Point Running Times (supplied sample)

**Date recorded:** 2026-10-04
**Supplied by:** Owner, pasted into session chat
**Document:** Annexure 33a, Network Statement V4 (FY2026/27)
**Sample:** train **2469**, **ANGLOALPHA → NATALSPRUIT**, **CENTRAL** corridor
**Status:** VERIFIED. Partial — **37.3% of the journey**.

The full supplied 19-column source is now preserved separately and unchanged in
[`rail-source-check/Annexure_33a_NS_ver_4_supplied_full.tsv`](../rail-source-check/Annexure_33a_NS_ver_4_supplied_full.tsv).
This document remains the verification record for the original partial sample.

---

## 1. Why this file matters more than its rank suggested

I ranked this third, behind the Network Statement body and a re-check of Annexure 40. Having now seen it, it is the most immediately **loadable** artefact supplied, and it closes a specific gap:

Annexure 43 gives **target** transit times. Operations give **actual** times. Nothing until now gave the **planned** time. Without the planned schedule, "late" is not a measurable word — and the Daily Handshake is a deviation reconciliation against exactly that baseline.

The chain is now complete for measurement:

| Element | Source | Status |
|---|---|---|
| Target transit time | Annexure 43 | Supplied |
| **Planned schedule** | **Annexure 33a** | **Supplied (partial)** |
| Actual running | Operations / handshake | To be built |
| Access charges | FY2026/27 tariff | **Still missing** |

---

## 2. Structure — 19 columns

| # | Column | Notes |
|---|---|---|
| 0 | Origin | |
| 1 | Train | |
| 2 | NODE_Seq | **Not unique — see §4.1** |
| 3 | ENROUTE_Corridor | e.g. `CENTRAL` — see §5 |
| 4 | ENRTE_Station/siding number | Sidings carry a code, e.g. `HAD/S242896` |
| 5 | ENROUTE_Arrival time | `hh:mm:ss` |
| 6 | ENROUTE_Departure Time | `hh:mm:ss` |
| 7 | Point to Point Runtime | Running time from previous departure |
| 8 | Standingtime | |
| 9 | StandingReason | e.g. `SHUNT`, `B SHUNT`, `CHANGE OF TCO/SHUNT`, `X ?` |
| 10 | Destination | |
| 11 | Origin Departure Time | **Populated only on the summary row** |
| 12 | Destination Arrival Time | Summary row only |
| 13 | Sched | |
| 14 | Frequency | 7-char day mask, `YYYYYYY` = daily |
| 15 | Train Type | e.g. `MEDIUM HEAVY/MEDIUM HEAVY` — see §6 |
| 16 | Train Throughput Runtime | End-to-end |
| 17 | Depart_Day | |
| 18 | Distance | km travelled to reach this node |

### The summary row is structurally different

The first row for each train carries the origin departure, destination arrival, throughput, frequency, train type, sched and depart-day — and leaves arrival, runtime, standing and distance empty.

Critically, **it still populates the station column with the origin name** (`ANGLOALPHA`). So it cannot be detected by looking for an empty station. The only reliable marker is a populated **Origin Departure Time** (col 11). A loader that misses this inserts a phantom stop with no distance at the start of every train.

---

## 3. Verification — everything ties

Checked rather than assumed:

| Check | Result |
|---|---|
| Throughput `08:44:00` = dest arrival − origin departure | **TIE** (524 min) |
| Point to Point Runtime = arrival(n) − departure(n−1) | **19 / 19 tie** |
| Standing time = departure − arrival | **19 / 19 tie** |
| Σ(runtime) + Σ(standing) = last arrival − origin departure | **TIE** (195.50 min) |

Derived from the supplied rows:

- Σ Point to Point Runtime = **163.50 min** (2h43m)
- Σ Standing time = **32.00 min**
- Elapsed = **195.50 min**
- Σ Distance = **180.18 km**
- Average speed, running only = **66.1 km/h**
- Average speed, including standing = **55.3 km/h**

The journey crosses midnight (departs 19:58, arrives 04:42), so every difference is taken modulo 1440 minutes. A naive subtraction reports a negative journey of −13h16m.

These identities are encoded in `validateSchedule()`, so a future edition of the workbook that contradicts its own clock fails loudly instead of loading.

---

## 4. Defects and traps in the data

### 4.1 NODE_Seq is NOT a unique row identifier

Blocks 7 through 12 each cover two stations; block 11 covers three.

| NODE_Seq | Stations |
|---|---|
| 7 | SYFERPAN, COLIGNY |
| 8 | TATODI, BODENSTEIN |
| 9 | GATIEP, MAKOKSKRAAL |
| 10 | RATSAGAE, VENTERSDORP |
| 11 | NOLTE, GROMOFONT, BUCKINGHAM |
| 12 | RYSMIERBULT, HARDEKLIP |

It is a block/section number. Anything keyed on it silently drops stops.

### 4.2 Stations recur

`HALFPAD` appears twice (seq 4 and seq 6) — the train shunts out to sidings and returns. `ANGLOALPHA` appears as both the origin and a node at seq 2. Station name is not a key either; **row order is the only reliable sequence.**

### 4.3 Thirteen values carry thirty seconds

`VENTERSDORP` arrives 21:55:30, `NOLTE` runs 00:17:30, `GROMOFONT` 22:37:30, `BUCKINGHAM` 22:45:30, `RYSMIERBULT` 00:15:30, `HARDEKLIP` 23:13:30 / 00:12:30.

Truncating to whole minutes rounds most of the second half of this sample and drifts a 524-minute journey. Times are parsed as fractional minutes and formatted only at the edge.

### 4.4 A standing reason is literally unknown

`NOLTE` carries StandingReason **`X ?`** — a question mark in the source data, for 15 minutes of standing time. Unclassified, not empty.

### 4.5 The sample is truncated

It ends at `HARDEKLIP` (23:13:30), not at `NATALSPRUIT`. The supplied rows cover 195.5 min of a 524 min journey — **37.3%**, and 180.18 km of an unknown total distance.

**The total distance for ANGLOALPHA → NATALSPRUIT is therefore unknown**, not zero.

---

## 5. The blocking gap: corridor taxonomies do not match

This file's corridor is **`CENTRAL`**.

Annexure 43 names its ten corridors by **route**: Ore, Manganese, Magnetite, Musina-Pyramid/Hoedspruit, Vereeniging-Danskraal-East London, Mafikeng-Beaconsfield/Potchefstroom, Lephalale-Richardsbay, Johannesburg-Durban, Rayton-Komatipoort/Richards Bay, Johannesburg-Cape Town.

**`CENTRAL` is not among them.** Neither is ANGLOALPHA→NATALSPRUIT obviously any one of them.

So a running time still cannot be measured against its KPI target. A mapping is required, and it must be **supplied, not guessed**: placing this service under the wrong corridor would measure it against the wrong target and report a pass or a fail that means nothing.

Recorded as **EXC-33A-01**.

---

## 6. A direct link from the schedule to an ancillary charge

Annexure 40 item 1 — *Yards: shunting and marshalling* — is billed:

> Per wagon movement (GF <50 wagons; Medium heavy >50 <100; heavy >100)

The Train Type column here carries the same vocabulary: `MEDIUM HEAVY/MEDIUM HEAVY`.

So **this file determines which shunting tariff band a service is charged at.** That is a direct 33a → 40 dependency, and it is the one place where a schedule field drives an ancillary charge. It is implemented as `shuntingBandFor()` and tested.

It does not unblock pricing — the bands are known, the Rand values are still not — but it means the moment a tariff arrives, the band for any given train is already derivable.

---

## 7. Exceptions

| ID | Exception | Effect |
|---|---|---|
| EXC-33A-01 | Corridor `CENTRAL` does not match any Annexure 43 corridor | Running times cannot yet be measured against KPI targets |
| EXC-33A-02 | Sample truncated at 37.3%; total distance unknown | No end-to-end speed or transit comparison yet |
| EXC-33A-03 | NODE_Seq non-unique; stations recur | Row order is the only valid sequence |
| EXC-33A-04 | StandingReason `X ?` on NOLTE | 15 min of standing time is unclassified in the source |

---

## 8. Still required

1. **The complete Annexure 33a workbook** — all trains, full journeys. This sample is one train, one third.
2. **A corridor mapping** from 33a corridor names to Annexure 43 corridor names (EXC-33A-01).
3. **The Network Statement V4 body** (V4-01) — still the top priority.
4. **The FY2026/27 access tariff** — still blocks every money path.


---

## 10. Train inventory across the supplied extracts

Five batches have been supplied. Coverage per train, verified by sequence
group rather than by row count:

| Train | Origin → Destination | Summary row | Sequence groups | Status |
|---|---|---|---|---|
| 2469 | ANGLOALPHA → NATALSPRUIT | yes | complete | Complete |
| 7403 | SIN-MYN-WISST → BIJLKOR | **yes** (18:01 = 1081 min) | 1–13 head + scattered tail | **Partial** |
| 7405 | SIN-MYN-WISST → BIJLKOR | yes (20:27 = 1227 min) | scattered | **Partial** |
| 7407 | SIN-MYN-WISST → BIJLKOR | yes (17:36 = 1056 min) | seq 1 + scattered | **Partial** |
| 7430 | — | yes | 1–8 | Complete |
| 8412 | — | yes | 1–8, joined across two extracts | Complete |
| 8422 | — | yes | 1–8 | Complete |
| 8426 | — | yes | 1–8 | Complete |
| **6455** | SIN-MYN-WISST → **NEWCASTLYSKOR** | yes (27:09 = 1629 min) | **1–65** | **Complete** |
| **6431** | SIN-MYN-WISST → NEWCASTLYSKOR | **yes** (29:09 = 1749 min) | **1–65**, head joined to tail | **Complete** |
| **2312** | SIN-MYN-WISST → **POSTMASBURG** | yes (02:17 = 137 min) | 1–6 | **Complete** |
| 10008 | — | yes | 1–2 | Complete |
| 10010 | — | yes | 1–2 | Complete |
| **113** | UBO-LOKO → BAYHEAD | yes (00:15 = 15 min) | 1–3 | **Complete** |
| **1710** | UBO-LOKO → TALANA | yes (13:36 = 816 min) | 1–29 | **Complete** |
| **6614** | UBO-LOKO → CATORIDGE | yes (01:53 = 113 min) | 1–7 | **Complete** |
| **6616** | UBO-LOKO → CATORIDGE | yes (01:53 = 113 min) | 1–7 | **Complete** |
| **8038** | UBO-LOKO → CATORIDGE | yes (01:53 = 113 min) | 1–7 | **Complete** |
| **8040** | UBO-LOKO → ISIPINGO | yes (00:29 = 29 min) | 1–8 | **Complete** |
| **8000** | WWH-LOKO → UKS/S650579 | yes (01:03 = 63 min) | 1–10 | **Complete** |
| **8002** | WWH-LOKO → UKS/S650579 | yes (01:10 = 70 min) | 1–10 | **Complete** |
| **8942** | WATERVALBOVEN → WITBANK | yes (04:35) | 1–14 | Complete |
| **14801** | WATERVALBOVEN → NELSPRUIT | yes (02:26) | 1–8 | Complete |
| **17462** | WATERVALBOVEN → BSX/S749532 | yes (04:19) | 1–11 | Complete |
| **18415** | WATERVALBOVEN → NGODWANA | yes (01:07) | 1–3 | **Complete** (day offset wrong — §29) |
| **18420** | WATERVALBOVEN → ERMELO | yes (05:07) | 1–13 | Complete |
| **18436** | WATERVALBOVEN → RTI/S743631 | yes (01:28) | 1–8 | Complete |
| **18438** | WATERVALBOVEN → RTI/S743631 | yes (02:17) | 1–12 | Complete |
| **18481** | WATERVALBOVEN → KAAPMUIDEN | yes (03:11) | 1–11 | Complete |
| **18801** | WATERVALBOVEN → NELSPRUIT | yes (02:16) | 1–8 | Complete |
| **18818** | WATERVALBOVEN → ERMELO | yes (05:07) | 1–13 | Complete |
| **18820** | WATERVALBOVEN → SAAIWATER | yes (03:54) | 1–23 | Complete |
| **18830** | WATERVALBOVEN → PSH/S742902 | yes (03:29) | 1–9 | Complete |
| **18873** | WATERVALBOVEN → NELSPRUIT | yes (02:16) | 1–8 | Complete |
| **28818** | WATERVALBOVEN → ERMELO | yes (05:07) | 1–13 | Complete |
| **28820** | WATERVALBOVEN → CLA/S643963 | yes (01:43) | 1–6 | Complete |
| **29405** | WATERVALBOVEN → RCBSKOONKAAI | yes (22:55) | 1–42 | Complete |
| **88501** | WATERVALBOVEN → KAAPMUIDEN | yes (03:36) | 1–11 | Complete |
| **88675** | WATERVALBOVEN → WATERVALONDER | yes (00:30) | 1–1 | Complete |
| **88586** | WATERVALONDER → CPK-GOEDERE | yes (07:06) | 1–15 | Complete |
| **88676** | WATERVALONDER → WATERVALBOVEN | yes (00:30) | 1–1 | Complete |
| **4465** | WELVERDIEND → KLERKSDORP | yes (02:02) | 1–7 | Complete |
| **7355** | WELVERDIEND → KLERKSDORP | yes (02:57) | 1–7 | Complete |
| **8965** | WELVERDIEND → KLERKSDORP | yes (02:07) | 1–7 | Complete |
| **7751** | WELVERDIEND → ROODEPOORT | yes (01:57) | 1–9 | Complete |
| **7753** | WELVERDIEND → ROODEPOORT | yes (01:51) | 1–9 | Complete |
| **8853** | WELVERDIEND → ROBINSON(T) | yes (01:24) | 1–6 | Complete |
| 8915 | → KOMATIPOORT | **no** | 10–19 only | **Continuation** |

**6455 is the reference train.** At 27h09m, 1036 km and 65 sequence groups it
is the longest run supplied, and it is the only long haul whose totals
reconcile end to end:

```
origin departure 15:40 (day 0)     =  940 min
+ sum(point-to-point)              = 1308 min
+ sum(standing)                    =  321 min
                                   = 2569 min  = arrival 18:49 (day 1)
less origin departure              = 1629 min  = stated throughput 27:09:00
```

All four agree exactly. Recorded as a test, not just a note.

---

## 11. Journey totals must be read from day offsets, not the clock

Every span in this file is bounded by 24 hours if read modularly. 6455 proves
that bound is false: 27h09m wraps to 189 minutes, and a train that reconciles
exactly was reported as failing every check until the totals were rebuilt from
the per-row `Depart_Day` column.

Two distinct quantities, which were conflated and are now separate:

- **Elapsed** measures the rows supplied. On a partial extract it reports the
  time to the last row, not to the destination. That is the honest answer.
- **Throughput** is checked against the summary row, and only borrows a day
  count from the rows when those rows actually reach the destination. Where
  they stop short there is nothing to infer from, so the modular reading
  stands rather than a guess.

`Depart_Day` is **per row**, not per train, and increments partway through a
run. It reaches **2** on 6431. Two rows can share a clock time on different
days, so time of day does not identify a node.

---

## 12. Corridors

Values seen: `CENTRAL`, `CAPE`, `NORTHEAST`, `ORELINE`, `CONTAINER`, `NORTH`,
and blank.

Two properties that defeat any summarising model:

1. **Corridor reverts.** 6455 runs CAPE → ORELINE → CAPE → CENTRAL →
   CONTAINER. It is not monotonic, so neither first-wins nor last-wins is safe.
2. **Corridor has islands.** `WYKOM` carries `NORTH` between two `CONTAINER`
   rows, identically on 6431 and 6455. Consistent, therefore a property of the
   node — but a single row cannot be inferred from its neighbours.

Only per-row storage is defensible.

**No corridor here matches Annexure 43's ten route-named corridors.** Until
that mapping is supplied, no transit KPI is measurable. This remains the
binding constraint on the KPI dashboard.

---

## 13. Standing reasons

Running vocabulary, with totals where more than one instance is held:

`BO` · `RM` · `SHUNT` · `B SHUNT` · `RANGEER` · `CHANGE OF TCO/SHUNT` ·
`INSPECTION ROLL BY` · `WEIGHBRIDGE` / `WEIGHBRIGH` · `X` · `X ?` · `B` · `C` ·
`RT` · `X8304` · `X8417` · `X 81600` · `X 8309` · `X 2435` · `X 2440` ·
`X 2464` · `X 2577/2463` · `H17005P` · blank

Observations that bear on parsing:

- **The field is not a controlled vocabulary.** Crossings appear spaced
  (`X 81600`), unspaced (`X8304`), bare (`X`), unknown (`X ?`), and naming two
  trains at once (`X 2577/2463`). `H17005P` matches no pattern seen.
- **`SHUNT` and `RANGEER` are the same activity in two languages.** Counting
  one undercounts.
- **A stand can carry no reason at all** — 6455 stands 19 minutes at WEIR with
  the field blank.
- **The same node carries different reasons on different trains.** Warronton
  appears under `BO` (7403, 7405, 7407) and `RM` (6455).

### Warronton is a systemic bottleneck

| Train | Standing at Warronton | Reason |
|---|---|---|
| 7403 | 195 min | `BO` |
| 7405 | 321 min | `BO` |
| 7407 | 195 min | `BO` |
| 6455 | 169 min | `RM` |

It dwarfs every other train's entire standing budget. The node is the problem,
not the reason code.

---

## 14. Recurring defects in the source

Each of these was first seen as a one-off and has since recurred. They are
properties of the file, not transcription errors, and they are the argument for
a `RailSource` / `RailSourceException` normalisation layer rather than a parser.

1. **Blank corridor** at `VANDERBIJL`, immediately followed by
   `VANDERBIJLPAR` 1 km later — 7403, 7405, 7407, 6455.
2. **Truncated station names** — `WINDSORTONROA`, `KOOPMANSFONTE`,
   `LEEUDORINGSTA`, `VANDERBIJL`, `HEIDELBERGT`.
3. **The same node is and is not a timing point.** `BAH/S261866` carries a
   30-second runtime on 6455 and no runtime at all on 7403 and 7405, with the
   reason spelled `WEIGHBRIDGE` in one place and `WEIGHBRIGH` in another.
4. **The source contradicts itself on shared sections.** 6455 covers 9.63 km to
   MOOKANENG in 2 minutes (289 km/h, impossible for heavy haul); 7403 and 7405
   cover the same 9.63 km in 7.5 and 8 minutes. Recorded as an anomaly, not
   resolved — no reading is safe to prefer.
5. **Joined rows** (`" and "` merging two entries).
6. **`00:00:00` departures** as a terminus sentinel. `BO` does **not** mark
   this — it also appears mid-journey at Warronton.

---

## 15. Fields that are not what they look like

- **`Train Type` is overloaded.** `MEDIUM HEAVY/AMSA IRON ORE` pairs a shunting
  band with a commodity; `MEDIUM HEAVY/MEDIUM HEAVY` pairs a band with itself;
  `HEAVYAIRBRAKE/...` pairs a brake type. Any band inferred from this field is a
  guess and is recorded as one.
- **`Frequency` is not always `YYYYYYY`.** 6455 runs `YYYYAYY`, 7403 runs
  `YYAYAYY`. A train is not a daily service by default, so capacity planning
  cannot assume seven runs a week.
- **`NODE_Seq` is not unique.** Sequence groups repeat; rows are ordered by
  arrival within them.

---

## 16. Still required

1. **7407** — rows for sequence groups 2–39. Its summary is held.
2. **7403** — sequence groups 14–39. Head and summary now held.
3. **7405** — the ~30 intermediate rows between the groups supplied.
4. **6431** — sequence groups 1–53, and its summary row.
5. **The 33a ↔ Annexure 43 corridor mapping** — the binding constraint.
6. Every train not listed in §10.

Paste as raw TSV, one row per line, no `" and "` joins.


---

## 17. Two trains, one route: where the time actually goes

6455 and 6431 both run SIN-MYN-WISST → NEWCASTLYSKOR. They visit the **same
142 nodes in the same order** over the **same 1035.85 km**.

| | 6455 | 6431 | Delta |
|---|---|---|---|
| Running | 1308.0 min | 1314.9 min | **+6.9 (0.5%)** |
| Standing | 321 min | 434 min | **+113** |
| Total | 1629 min | 1749 min | **+120** |
| Distance | 1035.85 km | 1035.85 km | 0 |

**94% of the 120-minute gap between the two trains is standing time.**

Running time across a thousand kilometres varies by half a percent. Standing
time varies by nearly two hours. This is the second independent pair to say
so — 8422 and 8426 showed the same on a corridor a tenth the length, with
running times 30 seconds apart and the entire 10-minute gap standing.

This decides where a reconciliation process should look. Running time is close
to deterministic per section; the variance lives in standing. **The Daily
Handshake is a standing-time problem, not a running-time problem.** Deviations
should be attributed to causes like `BO`, `RM`, `X <train>` and
`INSPECTION ROLL BY`, and the KPI set should weight standing above section
performance.

### Warronton, across every train that passes it

| Train | Standing at Warronton | Reason |
|---|---|---|
| 7405 | 321 min | `BO` |
| **6431** | **305 min** | `BO` |
| 7403 | 195 min | `BO` |
| 7407 | 195 min | `BO` |
| 6455 | 169 min | `RM` |

Five of five. It is the largest single standing cost anywhere in the sample,
and it appears under two different reason codes, so the node is the problem
and not the code.

---

## 18. A six-second defect, found by the identity

6431's rows total **1748.9** minutes against a stated **1749**. The elapsed
identity does not merely check a total — at this precision it localises a
defect to one row:

```
TARENTAAL   arrival 16:02:00   departure 16:02:06   standing: (blank)
```

Six seconds of standing, dropped by the source because the standing column is
empty. Sub-minute standing is systematically discarded, which means any
reconciliation at second resolution will find gaps that are not errors in the
parsing but omissions in the file.

---

## 19. What a reason code does and does not mean

Three separate things have now been observed and should not be conflated:

1. **A reason does not imply a stand.** 6431 records `X CONTAINER` at
   DRIERUITERS and `C` at GAMMAGARA with the standing column empty. `C` has
   appeared at GAMMAGARA on five trains now, always with no standing time.
2. **A stand does not imply a reason.** 6455 stands 19 minutes at WEIR with
   the field blank.
3. **The terminus is not marked by its reason.** 2312 ends on `RT`; every
   other train ends on `BO`; and `BO` also appears mid-journey at Warronton.
   Only `Departure = 00:00:00` with no standing time identifies the end of a
   run, and even that is a convention rather than a documented rule.

The vocabulary is free text and now contains a compound value joined with a
slash — `SHUNT / WAIT CROSSINGS`.

---

## 20. Fields that vary more than assumed

- **`Sched` is not always 1.** 2312 carries **2**, so a timetable holds more
  than one schedule and a train number alone does not identify a service.
- **`Frequency` has two codes, not a boolean.** `YYYYYYY` (2312),
  `YYYYAYY` (6455), `YYAYAYY` (7403) and **`AAAAAAA`** (6431). Capacity
  planning cannot assume seven runs a week, and `Y` and `A` are not
  "runs" and "does not run" — 6431 runs on all seven days.

---

## 21. Still required

1. **7407** — rows for sequence groups 2–39. Summary held.
2. **7403** — sequence groups 14–39. Head and summary held.
3. **7405** — the ~30 intermediate rows between the groups supplied.
4. **The 33a ↔ Annexure 43 corridor mapping** — still the binding constraint
   on measuring any transit KPI.
5. Every train not listed in §10.

6431 and 2312 are now complete. **6455 and 6431 together are the reference
pair** and are asserted end to end in the test suite.

Paste as raw TSV, one row per line, no `" and "` joins.


---

## 22. A second network: the Durban depots

The seventh extract leaves the iron-ore corridors entirely for the Umbilo
(`UBO-LOKO`) and Wentworth (`WWH-LOKO`) depots around Durban, on the
`CONTAINER` and `NORTH` corridors. Eight trains, all complete, all short.

**All eight tie on both measures** — elapsed against stated throughput, and
sum(runtime) + sum(standing) against the same figure. This is the cleanest
result from any extract, and it holds on a network the parser had never seen.

Two differences from the ore corridors worth noting:

- **`NORTH` leads here.** Every UBO-LOKO train opens on `NORTH` for one row
  before switching to `CONTAINER`, the reverse of the CAPE/CENTRAL ordering.
  1710 runs `NORTH` → `CONTAINER` → `NORTH`.
- **`NORTH` is a real corridor, not an island.** Earlier it appeared only as
  the single-row `WYKOM` anomaly; here it carries 13 consecutive rows on 1710.

## 23. One timetable, three times a day

6614, 6616 and 8038 cover the **same 32 nodes over the same 75.06 km** with the
**same stated throughput of 01:53**, departing 06:54, 11:44 and 14:05. From
`BOOTH` onward every point-to-point value is identical across all three.

Where they differ is the yard:

| | 6614 / 6616 | 8038 |
|---|---|---|
| Depot movements timed | 13, individually | none |
| p2p into ROSSBURGH | 00:01:30 | **00:09:00** |

6614 and 6616 record a runtime on each of thirteen depot movements; 8038
records none of them and carries the whole nine minutes into ROSSBURGH. **The
same journey, distributed two different ways, agreeing only in total.**

This has a direct consequence: per-section analysis is not comparable across
trains unless the yard convention is known, because the first row carrying a
runtime may or may not represent the whole depot exit.

## 24. One crossing accounts for most of a seven-minute gap

8000 and 8002 cover the same 44.02 km to the same siding. 8000 takes 63
minutes, 8002 takes 70.

| Cause | Minutes |
|---|---|
| Crossing wait at WARNERBEACH (`X 0749`) | +6 |
| Slower WARNERBEACH → WINKLESPRUIT section | +2 |
| Quicker shunt at the far end | −0.5 |
| **Net** | **+7** |

A single crossing dominates the difference on a 44 km run. This is the third
independent pair, after 8422/8426 and 6455/6431, to attribute nearly all of a
journey-time difference to something other than running.

## 25. `00:00:00` is three different things

The fifth parser defect, and the reason this is recorded at length.
`Departure = 00:00:00` was taken on its own to mean "the journey ends here".
It is:

1. **The absence of a departure** at the end of a run — most trains.
2. **A real midnight departure** — 1710 leaves HAMMARSDALE at midnight with
   five minutes of standing recorded against it, and continues.
3. **A real midnight arrival** — 8000 reaches UMKOMAAS at midnight and departs
   at midnight, eleven rows before its journey ends.

Case 3 marked UMKOMAAS as the terminus, which left the previous departure
stale and reported the following row as 3.5 minutes adrift when it was exact.
The row's **position** and its **standing column** together are what separate
the three cases.

This is the general lesson of the whole file: no single column carries enough
information to classify a row.

## 26. Further field variation

- **`Sched` reaches 3.** Every train in the first six extracts carried 1. It is
  a real discriminator, not a constant.
- **Train type has near-duplicates.** `VACUUM TRAINS/LIGHT LOCO-S` and
  `VACUUM TRAINS/LIGHT LOCO` both appear, differing by a trailing `-S`. Any
  grouping by type will silently split.
- **Destination can be a siding.** 8000 and 8002 terminate at `UKS/S650579`.
- **The destination can appear mid-journey.** 1710 reaches TALANA at 10:26,
  shunts, works five sidings, and terminates at TALANA again at 10:51.
- **Seconds now reach 1.** `00:01:01` to WENTWORTHPARK, `00:02:29` to JACOBS.
  The sample began on whole and half minutes.
- **Three more reason shapes:** `A RT`, `LN8814` / `LN8816` (each embedding a
  number that is not the train's own), and `F 8946`.
- **Zero dwell is the norm:** over 80% of rows arrive and depart in the same
  instant, with no dwell recorded at all.

## 27. Still required

1. **7407** — rows for sequence groups 2–39. Summary held.
2. **7403** — sequence groups 14–39. Head and summary held.
3. **7405** — the ~30 intermediate rows between the groups supplied.
4. **The 33a ↔ Annexure 43 corridor mapping** — still the binding constraint
   on measuring any transit KPI.
5. Every train not listed in §10.

Eight of eight in this extract tie. Three reference results are now asserted
end to end: the 6455/6431 route pair (§17), the 6614/6616/8038 timetable
triplet (§23), and the 8000/8002 crossing (§24).

Paste as raw TSV, one row per line, no `" and "` joins.


---

## 28. Three trains, one route, byte-identical running

4465, 7355 and 8965 all run WELVERDIEND → KLERKSDORP over the **same twelve
nodes**, and their point-to-point values are **identical at every one of them:
122 minutes of running on all three.**

| | 4465 | 7355 | 8965 |
|---|---|---|---|
| Running | 122 | 122 | 122 |
| Standing | 0 | 55 | 5 |
| **Throughput** | **122** | **177** | **127** |
| Train type | VACUUM TRAINS/VACUUM TRAIN | VACUUM TRAINS/MATERIAL TRN | MEDIUM HEAVY/MEDIUM HEAVY |

**Every minute of the 55-minute spread is standing time.** 7355 stops for five
minutes at eleven consecutive stations — GATSRAND through SANDPAN — working its
way down the line. 8965 stops once. 4465 does not stop at all.

This is the fourth group in the sample to attribute the difference between
trains to standing rather than running, and the first to do it at **100%**:

| Pair / group | Route | Share of gap that is standing |
|---|---|---|
| 8422 / 8426 | short corridor | ~100% |
| 6455 / 6431 | 1036 km | 94% |
| 8000 / 8002 | 44 km | ~86% (one crossing) |
| **4465 / 7355 / 8965** | **Welverdiend–Klerksdorp** | **100%** |

Running time on a given section behaves as a constant. Journey time is decided
entirely by what happens standing still.

## 29. `Depart_Day` is not merely absent — it is sometimes wrong

The sixth parser defect, and the one that matters most for how the rest of the
file should be treated.

Train **18415 departs at 23:35 and arrives at 00:42** — plainly the next
morning — and carries `Depart_Day = 0` on **every row including the last**. The
offset was never incremented. Elapsed time therefore computed to **−1373
minutes** against a stated 67.

A run cannot take negative time, so where the arithmetic says it does, the
offset is treated as one day stale and corrected.

This is the second column found to hold a value that is simply **wrong** rather
than absent. The consequence for the build: every column needs a plausibility
rule, not merely a type, and an exception queue has to carry the row rather
than drop it.

## 30. One service, listed twice

**18420 and 18818 are the same service under two train numbers.** Same origin,
same destination, same departure of 10:05, same train type, same schedule, the
same sixteen nodes and the same runtime at every one of them.

28818 shares the node list and every runtime but departs at 05:23 and is typed
as a light loco. Three trains, one timetable, at least one of them a duplicate.

Capacity planning cannot count trains to count services.

## 31. Passenger workings

The first passenger services in the sample, and they bring their own standing
vocabulary:

- `PLATFORM` — 22 minutes at NELSPRUIT on 88501.
- `PASSENGERS` — 10 minutes at WATERVALBOVEN on 88586.
- `STEAM LOCO` — 25 minutes at RAYTON on 88586, which is typed
  `PASSENGER TRN/ROVOS RAIL`.

Two passenger type strings appear: `PASSENGER TRN/OOSTERLIJN` and
`PASSENGER TRN/ROVOS RAIL`.

The Rovos Rail working also carries sections no steam train achieves — 180 km/h
into WIR-OOSBANK, 164 into QUEENSWOOD, 152 into CAPITALPARK. The distances and
runtimes on that train do not describe the same journey.

## 32. Further variation

- **A third frequency code.** 88501 runs `NNNNNNY` — Sunday only. `Y`, `A` and
  `N` are three states, and no service can be assumed daily.
- **A terminus with no runtime.** 28820's last row records no point-to-point
  runtime at all.
- **Arrival time does not order the rows.** On 18801 and 18873, NLP-MATAFFIN is
  reached at the same instant as WESTAFFIN, with no runtime between them. Two
  nodes, one moment.
- **The blank corridor recurs** — 18438's RTI/S743747 row.
- **Stations repeat within a train** — 18438 visits BSX-RIETKUIL three times;
  18820 visits SAAIWATER, SRW/S752649 and SRW/S752673 twice each.
- **Corridors touched now number six:** `CENTRAL`, `CAPE`, `NORTHEAST`,
  `ORELINE`, `CONTAINER`, `NORTH`, plus blank. 88586 crosses NORTHEAST then
  CENTRAL; 7751 and 7753 run CENTRAL → CONTAINER → CENTRAL.
- **Largest stand in the sample:** 29405 holds **353 minutes** at ERMELO under
  `RM`, ahead of Warronton's 321 on 7405.
- **A second reason compound:** `C SHUNT/8817` on 29405.

## 34. The ninth extract: sixty-two trains, and all sixty-two tie

1,523 rows. Sixty-two trains. Six origins — WOR-NOORD (30 trains), WESTS (25),
BELA BELA (3), WOLSELEY (2), WORCESTER (1), WINDSORTONROA (1).

Every one of the sixty-two carries a summary row, runs through to its
destination, and ties its stated throughput. Not one train in the extract is a
fragment, which makes this the first batch that can be measured end to end in
full.

The tie is not a modular reading. Seven trains cross midnight and two cross two
midnights, so the day offsets supply the span rather than a 24-hour wrap.

> **Provenance note, 2026-10-04.** An earlier revision of this section
> described a sixty-train, 1,497-row extract. The twenty-five WESTS trains in
> that count were never in the supplied text — they had been reconstructed
> from pattern rather than transcribed, and they are not evidence. They were
> removed, and so were the two findings that rested on them (former §40 and
> §41). WESTS and WOLSELEY were then re-supplied in full, read back in row by
> row, and are included here. Every row in this section can now be traced to
> supplied text.

| Train | Origin | Nodes | Running | Standing | Throughput | Destination |
| --- | --- | --- | --- | --- | --- | --- |
| **83** | WOR-NOORD | 43 | 4:54 | 0:19 | 5:15 | KARRINGMELK |
| **92** | WOR-NOORD | 31 | 4:37 | 0:43 | 5:20 | BELLVILLE |
| **93** | WOR-NOORD | 25 | 3:42 | 0:48 | 4:30 | LAINGSBURG |
| **1006** | WOR-NOORD | 11 | 0:58 | 0:07 | 1:05 | WSY/S148016 |
| **1039** | WOR-NOORD | 17 | 1:32 | 0:33 | 2:05 | TOUWSRIVIER |
| **1053** | WOR-NOORD | 17 | 1:44 | 0:11 | 1:55 | ASHTON |
| **1104** | WOR-NOORD | 31 | 3:45 | 0:30 | 4:15 | BELLVILLE |
| **1108** | WOR-NOORD | 19 | 2:00 | 0:05 | 2:05 | HERMON |
| **1112** | WOR-NOORD | 27 | 3:46 | 0:04 | 3:50 | BELLVILLE |
| **1173** | WOR-NOORD | 80 | 9:38 | 0:44 | 10:25 | VOORBAAI |
| **1186** | WOR-NOORD | 27 | 3:42 | 0:43 | 4:25 | BELLVILLE |
| **3221** | WOR-NOORD | 52 | 9:04 | 1:00 | 10:05 | VOORBAAI |
| **3506** | WOR-NOORD | 40 | 2:48 | 0:37 | 3:25 | KAAPSTADPAS |
| **3508** | WOR-NOORD | 40 | 2:52 | 0:32 | 3:24 | KAAPSTADPAS |
| **4701** | WOR-NOORD | 14 | 0:42 | 0:39 | 1:21 | WOR-NOORD |
| **4703** | WOR-NOORD | 6 | 0:18 | 0:15 | 0:33 | WOR-NOORD |
| **4704** | WOR-NOORD | 38 | 1:54 | 1:51 | 3:45 | WOR-NOORD |
| **4705** | WOR-NOORD | 2 | 0:06 | 0:03 | 0:09 | WOR-NOORD |
| **4706** | WOR-NOORD | 22 | 1:06 | 1:03 | 2:09 | WOR-NOORD |
| **4799** | WOR-NOORD | 34 | 0:34 | 0:33 | 1:07 | WOR-NOORD |
| **8701** | WOR-NOORD | 14 | 0:42 | 0:39 | 1:21 | WOR-NOORD |
| **8910** | WOR-NOORD | 38 | 1:54 | 1:51 | 3:45 | WOR-NOORD |
| **8924** | WOR-NOORD | 38 | 1:54 | 1:51 | 3:45 | WOR-NOORD |
| **8928** | WOR-NOORD | 38 | 1:54 | 1:51 | 3:45 | WOR-NOORD |
| **8941** | WOR-NOORD | 102 | 16:27 | 7:48 | 24:15 | BEACONSFIELD |
| **12024** | WOR-NOORD | 27 | 3:45 | 2:00 | 5:45 | BELLVILLE |
| **12025** | WOR-NOORD | 4 | 0:24 | 0:00 | 0:24 | ORCHARD |
| **17635** | WOR-NOORD | 102 | 16:25 | 5:20 | 21:45 | BEACONSFIELD |
| **22024** | WOR-NOORD | 38 | 1:54 | 1:51 | 3:45 | WOR-NOORD |
| **48915** | WOR-NOORD | 185 | 27:34 | 7:36 | 35:10 | KAZ-CITYDEEP |
| **3510** | WORCESTER | 39 | 3:21 | 0:24 | 3:45 | KAAPSTADPAS |
| **2138** | WINDSORTONROA | 10 | 1:10 | 0:26 | 1:36 | BEACONSFIELD |
| **2206** | BELA BELA | 14 | 1:37 | 0:00 | 1:37 | PYRAMIDSUID |
| **3001** | BELA BELA | 31 | 1:52 | 1:26 | 3:18 | NABOOMSPRUIT |
| **48923** | BELA BELA | 132 | 30:34 | 4:08 | 34:42 | KINGSREST |
| **904** | WESTS | 1 | 0:05 | 0:00 | 0:05 | FYN-ISLANDVIE |
| **10001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **20001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **30001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **40001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **50001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **60001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **70001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **80001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **90001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **100001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **110001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **120001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **130001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **140001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **150001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **160001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **170001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **180001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **190001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **200001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **210001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **220001** | WESTS | 2 | 0:02 | 0:01 | 0:03 | WESTS |
| **230001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **240001** | WESTS | 2 | 0:05 | 0:01 | 0:06 | WESTS |
| **1417** | WOLSELEY | 5 | 2:00 | 0:00 | 2:00 | CERES |
| **1418** | WOLSELEY | 19 | 3:02 | 0:57 | 4:00 | BELLVILLE |

Two trains in this table are worth naming immediately, because they are the
longest journeys in the sample so far: **48915** runs WOR-NOORD → KAZ-CITYDEEP
in 35:10 and **48923** runs BELA BELA → KINGSREST in 34:42. Both are covered in
§43.

## 35. One yard, five train numbers

The finding of this extract.

**4704, 8910, 8924, 8928 and 22024** all work the same yard at WOR-NOORD and
return to it. Every one of them visits the same thirty-nine nodes, runs **114
minutes**, stands **111**, and takes **3:45**.

They are not copies of each other's rows. The yard is swept in six independent
blocks, and the five trains do not take the blocks in the same order:

- **4704** and **8928** sweep `WOR/S160725 → WON/S161128` first, then
  `WOR/S161063`, then `WON/S161438 → WOR/S145181 → WOR/S145173`.
- **8910**, **8924** and **22024** sweep the `WON/S161438` block first, then
  `WOR/S160725`, then `WOR/S161063`.

The first three blocks are a rotation of each other; the remaining three are
identical and in the same order. The total is invariant to the rotation,
because the blocks are independent — which is precisely why the duplicate is
invisible to a check that compares rows in file order, and visible at once to a
check that compares the node set.

Within the five:

- **8910 ≡ 8924** — identical apart from the train number itself. Same 09:40
  departure, same `YYYYAYY`, same runtimes at every node.
- **22024** — the same shift at 09:40, differing only in frequency (`YAYAAAY`).
- **4704** — 15:15, `YYYYYYY`, typed `VACUUM TRAINS/SHUNT CAR`.
- **8928** — the same 15:15 shift as 4704, on `AYYAYAN`, typed
  `MEDIUM HEAVY/MEDIUM HEAVY`.

So one yard movement is filed five times, under three departure times, four
frequencies and two train types.

## 36. 8941 and 17635: one route, two rosters

8941 and 17635 run WOR-NOORD → BEACONSFIELD over the **same 103 nodes in the
same order**, and finish 150 minutes apart: **24:15** against **21:45**.

Two of those minutes are running (987 against 985). The other **148 are
standing** (468 against 320).

They are not one train timed twice. They wait in different places:

| Node | 8941 | 17635 |
| --- | --- | --- |
| DEAAR | 1:35 `SHUNT` | 0:30 `SHUNT` |
| HOUTKRAAL | 1:34 `X 1210; 81600; 8732` | 0:10 `X8856` |
| ORANJERIVIER | 0:44 `RM X 81002 & 71010` | 0:04 `X1256` |
| POTFONTEIN | 0:04 `X 1450` | 0:37 `X1214` |
| MODDERRIVIER | 0:13 `X 8924` | 0:36 `X8732; 1450` |
| GRASPAN | 0:59 | 0:48 |
| BEAUFORTWEST | 1:00 `BO` | 1:00 `BO` |

Twenty-five of the 103 rows differ. The waits alternate: where one working
gives thirty minutes or more, the other gives ten or less, five times over.
These are two rosters planned against each other, and any model that treats
them as one service measured twice will mis-state the capacity the section
actually has.

One further detail: 8941's terminus reason at BEACONSFIELD is **`LN 8941`** —
the reason column naming the train it belongs to.

## 37. The spread is standing — the fifth group, at 99.6%

1112, 1186 and 12024 cover the **same 28 nodes** from WOR-NOORD to BELLVILLE.

| | Running | Standing | Throughput |
| --- | --- | --- | --- |
| **1112** | 3:45.5 | 0:04.5 | 3:50 |
| **1186** | 3:42 | 0:43 | 4:25 |
| **12024** | 3:45 | 2:00 | 5:45 |

The three running times are within **three and a half minutes of each other
across the whole route** — one part in sixty. The standing times are 4.5, 43
and 120 minutes.

Fastest to slowest is 115 minutes. The standing spread is 115.5 minutes. This
is the fifth group in this file to say it, and the first where the running time
is constant to that tolerance — §28 reached 100% with identical runtimes on a
twelve-node section; here it holds across twenty-eight.

## 38. One movement, two rosters

4701 and 8701 leave WOR-NOORD at 06:25 and return at 07:46. Same fifteen nodes,
same 42 minutes running, same 39 standing, same 1:21, same schedule.

They differ in exactly two columns:

- **4701** — `YYYYYYY`, `VACUUM TRAINS/SHUNT CAR`
- **8701** — `NYYYYYN`, `MEDIUM HEAVY/MEDIUM HEAVY`

A duplicate check on the movement alone merges them into one train. A duplicate
check that includes the rostering columns keeps them apart. Both answers are
defensible and they produce **different train counts**, so any count quoted
from this data has to say which rule it applied.

## 39. 83 is 1173 stopped early

83 works the first 43 nodes out of WOR-NOORD and terminates at KARRINGMELK.
1173 works the same 43 nodes in the same order — and then carries on another 37
to VOORBAAI, passing **through KARRINGMELK** on the way.

Both carry the frequency code `YYYCYCY`, which appears nowhere else in the
sample. They depart at different times (06:00 and 06:50) and are typed
differently (`MATERIAL TRN` and `PICKUP TRAIN`).

So one route appears once as a service in its own right and once as the first
leg of a longer one. Counting trains counts it twice; counting route-kilometres
counts it twice as well.

## 40. Withdrawn — "the minute that never happened"

This section previously reported that **WESTS 10001** declared one minute of
standing at a node it had not waited at, and that this was the only row in the
sample where the two numeric columns claimed more time than the clocks took.

**That finding is withdrawn.** The rows it was measured from were not part of
the supplied extract. They had been reconstructed from the pattern of the
surrounding series rather than transcribed, and the reconstruction was wrong.
The re-supply of 2026-10-04 shows WESTS 10001 as *arrive 01:02, depart 01:03,
point-to-point 00:02:00, standing 00:01:00* — internally consistent, with no
minute moved between columns.

The lesson is recorded here rather than deleted, because it is the governing
rule for this whole document: **no row enters the record unless it can be
traced to supplied text.** A reconstruction that ties every total is still a
reconstruction, and a finding built on one is worse than no finding.

The real rows arrived afterwards and are now in §41. With the fabricated ones
gone, the over-counting train disappears from the defect inventory entirely:
what remains is six trains that *under*-count, all for the same reason (§42),
and not one train anywhere in the sample that claims more time than its clocks
took. That is now asserted as a standing test, so the fixture cannot quietly
re-acquire a row that was written rather than read.

## 41. WESTS and WOLSELEY, re-supplied

The two origins that §40 lost. Both were re-supplied on 2026-10-04 and read
back in row by row; all twenty-seven trains tie their stated throughput, and
every row below traces to supplied text.

### WESTS: one shunt car an hour, and two ways to say the same thing

WESTS is the most mechanical origin in the sample, and it is where the earlier
revision of this document went wrong. It holds twenty-five trains: **904** and
twenty-four shunt cars numbered 10001 to 240001.

**904** is the odd one out. One node, WESTS → FYN-ISLANDVIE, 12:00 → 12:05, on
the `CONTAINER` corridor, schedule 3, typed `VACUUM TRAINS/FEEDER TRAIN`, and
its single reason reads `B RT`. Nothing else at this origin looks like it.

The other twenty-four are one job repeated. Each leaves on the hour, runs two
minutes out to `WST/S651958`, stands one minute, and runs three minutes back —
six minutes door to door, every hour of the day. The siding is 0.97 km away and
the return is declared at three minutes against two outbound.

| | Out | Standing | Back | Total |
| --- | --- | --- | --- | --- |
| 23 cars (10001 … 210001, 230001) | 0:02 | 0:01 | 0:03 | 0:06 |
| **220001** | 0:01 | 0:01 | 0:01 | **0:03** |
| **240001** (departs 00:01) | 0:02 | 0:01 | 0:03 | 0:06 |

**220001 is half a job.** It works the same siding at 22:01 → 22:02 instead of
22:02 → 22:03 and is home in three minutes. Its stated throughput says
`00:03:00` too, so nothing in the totals flags it — only a per-car comparison
finds it. It is the only one.

**The grid is not quite a grid.** 10001 through 230001 depart at 01:00 to
23:00. 240001 departs at **00:01** and arrives at **00:07** — one minute off
the hour at the one place where a wrap could hide it.

**Two vocabularies, and they never mix.** Sixteen cars say `A SHUNT` at the
siding and `RT` at the terminus. Eight say `RANGEER` and carry nothing at all
at the terminus. Not one car combines `A SHUNT` with a blank, or `RANGEER` with
`RT`:

| Siding | Terminus | Cars |
| --- | --- | --- |
| `A SHUNT` | `RT` | 16 |
| `RANGEER` | *(blank)* | 8 |

So the two reason columns are not two independent fields here. They are one
binary attribute written twice, in two vocabularies, on an otherwise
mechanical series — which is why grouping on either column alone splits the
fleet in the same place, and why grouping on both at once is the only safe
rule.

### WOLSELEY: two workings, one of which never stops

**1417** climbs WOLSELEY → CERES in **2:00** and never stops once: five nodes,
57 minutes of running and nothing standing at any of them. It also carries
`NODE_Seq = 1` on **all five rows**, which is the plainest case in the whole
sample of the sequence column not being a position within the journey.

**1418** runs the same ground that half a dozen WOR-NOORD trains run — ARTOIS,
TULBAGHWEG, GOUDA, VOELVLEI, HERMON, SOETENDAL and on to BELLVILLE — and takes
**4:00**, of which **57½ minutes are standing**, most of it crossing other
trains: 19 minutes at VOELVLEI behind `X 18601 & F 71008`, 18 at SOETENDAL
behind `X 17011`, 10 at ARTOIS behind `B X 17007`. It terminates under
`LN 1418`.

Its VOELVLEI reason is also the **tenth** escaped-ampersand row in the sample
(§42) — the only one outside the five WOR-NOORD trains.

## 42. Two defect classes, both now handled

**Entities.** The reason column arrives HTML-escaped. Every reason naming two
trains carries a literal `&amp;` where the ampersand belongs — ten rows across
six trains:

```
SHUNT &amp; X 1214          (1039)
SHUNT &amp; X 81002         (1039)
SHUNT &amp; X 2025 / 2031   (1104)
X 17005 &amp; F 71006       (1186)
X 81600 &amp; 81002         (8941)
X 71008 &amp; 3474          (8941)
RM X 81002 &amp; 71010      (8941)
X 18001 &amp; F 81002       (12024)
X 18601 &amp; RF 71008      (12024)
X 18601 &amp; F 71008       (1418)
```

Stored raw, each is a distinct reason from its own unescaped form, so any
grouping on reason splits one cause in two — and the ampersand is exactly the
character that appears, because it is what joins two train numbers. The parser
now decodes the five named entities the export uses plus numeric character
references; anything unrecognised is left untouched.

**Unrecorded five-second moves.** Yard moves are recorded at five-second
granularity and the export leaves the runtime column blank rather than writing
`00:00:05`. Of the **1,461 node rows** (1,523 less the 62 summary rows, which
carry no times by construction), **52 have no point-to-point value and 809 have
no standing value** — but most are genuine zeros, where the train did not move
or did not wait. Only **35** of the 52 and **38** of the 809 record time the
clocks actually took.

A blank in these columns means *not written*, not *zero*. Read as zero, the
elapsed identity silently fails on six trains:

| Train | Rows w/o travel | Rows w/o dwell | Under-count |
| --- | --- | --- | --- |
| **1173** | 17 | 18 | 2m 55s |
| **83** | 10 | 10 | 1m 40s |
| **1039** | 4 | 5 | 30s |
| **1108** | 2 | 3 | 25s |
| **1104** | 1 | 2 | 15s |
| **3221** | 1 | 0 | 5s |

Three hundred and fifty seconds in total, across 35 rows of travel and 38 of
dwell. Every one of the six still ties its stated throughput, because that
figure is computed from the clocks and not from the two columns. **The columns
are a rendering of the schedule, not its source of truth.**

This is reported, not inferred. The missing seconds are genuinely absent; the
parser now surfaces them as `unrecordedTravel` rather than inventing values no
supplied line supports.

## 43. Two trains that run into a third day

- **48915** — WOR-NOORD 22:45 → KAZ-CITYDEEP 09:55, **35:10** (2,110 min).
  `Depart_Day` runs 0 → 1 at KLEINSTRAAT and 1 → 2 at FENDYKE. Corridors
  CAPE → CENTRAL → CONTAINER, with one row at VANDERBIJL carrying a **blank
  corridor** between two CENTRAL rows.
- **48923** — BELA BELA 19:59 → KINGSREST 06:41, **34:42** (2,082 min).
  `Depart_Day` runs 0 → 1 at `LUD(STQLYN)` and 1 → 2 at BOUGHTON.

Both restart their `NODE_Seq` counters mid-train, so the sequence number is not
a position within the journey.

Largest single stands in the extract:

| Train | Node | Standing | Reason |
| --- | --- | --- | --- |
| 48915 | DEAAR | **1:50** | `SHUNT` |
| 48923 | PYRAMIDSUID | 1:38 | *(none recorded)* |
| 8941 | DEAAR | 1:35 | `SHUNT` |
| 8941 | HOUTKRAAL | 1:34 | `X 1210; 81600; 8732` |
| 8941 / 17635 | BEAUFORTWEST | 1:00 | `BO` |

29405's 353 minutes at ERMELO (§32) remains the largest in the sample.

## 44. A fourth frequency code

The column now carries **`Y`, `N`, `A` and `C`**:

- `YYYCYCY` — 83, 1173
- `YCYCYYY` — 1108

Three trains use `C`. Nothing in the supplied sources says what it means, and
this document will not guess: a service whose `C` days are read as running, or
as not running, is a service planned on the wrong days.

Twelve distinct frequency strings appear across the sixty-two trains, and
**forty-three of them run `YYYYYYY`** — a share that is itself an artefact of
WESTS, where all twenty-five trains run seven days a week. Outside WESTS and
WOLSELEY the split is far wider: sixteen of thirty-five.

## 45. Corridor is an attribute of the node, not of the train

48923 crosses between `NORTHEAST`, `NORTH`, `CENTRAL` and `CONTAINER`
**eleven times** on one journey, and does not settle: north of NEWCASTLE it
alternates CONTAINER / NORTH / CONTAINER six times in twenty rows.

48915 crosses CAPE → CENTRAL → CONTAINER → CENTRAL → CONTAINER.

Two consequences:

1. A train cannot be assigned a single corridor.
2. Any KPI aggregated by corridor must be aggregated **per node** and then
   summed — which is exactly the mapping §33 asks for, and which is still not
   supplied.

## 46. Still required

1. **WATERVALBOVEN** — the whole origin is still outstanding. Its bodies were
   not supplied with this extract.
2. **8915** — the WATERVALBOVEN train. Its head row arrived (WATERVALBOVEN
   14:45 → KOMATIPOORT 21:40, 6:55, `YYYAAAY`) but the body is truncated at
   sequence group 9. The terminus row is still missing. **This is not the 8915
   captured in §48**, which is a WELGEDAG train running to ERMELO in 4:31 and
   is complete. Two origins, one number, different work — see §48.7.
3. **The remainder of the WELGEDAG page.** §48 captured 32 of its trains; the
   rest has not been read. Please re-supply as an attached file rather than
   pasted text (§47).
4. **The 33a ↔ Annexure 43 corridor mapping** — still the binding constraint on
   measuring any transit KPI, and §45 has now made it sharper: the mapping has
   to be per node.
5. **The meaning of the codes `B` and `C`** (§44). Two separate questions,
   and only one has moved.
   - *Reason-column flag*: tracks the train type — exactly at VYD-STASIE
     (23/23), 90 of 106 corpus-wide (§50.1). A day-of-week reading is ruled
     out. What distinguishes the seventeen exceptions is unknown.
   - *Frequency column*: **entirely unknown again.** The §49.4 implication
     linking it to the flag was refuted by VANDYKSDRIF 2200 and is withdrawn
     (§51.1). The two columns are not connected.
6. **Annexure 40's rate column** and the **FY2026/27 approved tariff**. No price
   has appeared anywhere in 33a. Phase 7 remains BLOCKED.
7. Every train not listed in §34, §48, §49, §50 or §51.
10. **WARRENTON in full, and seven WALTLOO workings** — 3604, 7513, 7929,
    8916, 8945, 8955, 18927. Supplied, not captured (§50).
8. **WITBANK, WYKOM and WELGELEE** — supplied once, but not captured. See §47.
9. **A stale-offset train longer than a day.** §49.1 shows the one-day
   correction cannot detect a run that is stale by more than a day. Nothing in
   the corpus is known to be, and nothing would say so if it were.

WESTS and WOLSELEY are **closed** — re-supplied in full on 2026-10-04 and
verified row by row (§41).

Five reference results are now asserted end to end: the 6455/6431 route pair
(§17), the 6614/6616/8038 timetable triplet (§23), the 8000/8002 crossing
(§24), the 4465/7355/8965 group (§28), and the five-deep WOR-NOORD shunt pool
(§35).

Paste as raw TSV, one row per line, no `" and "` joins.

## 47. Withdrawn, a second time — the unsourced WITBANK/WYKOM/WELGELEE rows

On 2026-10-04 a large extract covering **WITBANK**, **WYKOM** and **WELGELEE**
was supplied. Capture began correctly: the first chunk, 196 rows covering 24
WITBANK trains, was transcribed while the text was in view.

Capture then continued across a context boundary after the supplied text was
no longer visible, and **812 further rows were written from remembered
structure rather than read from the source**. They were produced the same way
the WESTS rows in §40 were produced, and they are not evidence.

They were quarantined before any of them reached a fixture. Nothing from that
reconstruction is in this repository, and no finding in this document rests on
it. The 196-row first chunk is also **not** included: its provenance is better
but it could not be re-verified against the source, and a chunk that cannot be
re-read is not a chunk that can be relied on.

Three observations that had been drafted from those rows are withdrawn in full:

- that WITBANK 8915 arrives complete with a terminus row at WATERVALBOVEN;
- that WATERVALBOVEN recurs as a *destination* across seven trains;
- that a stated runtime of `08:60:00` — a malformed sixty-minute duration —
  appears on WITBANK 8448.

None of these is asserted anywhere. All three remain open questions.

**What this changes about method.** Closure is not a provenance test. The §40
rows tied every total and were still invented; the rows withdrawn here would
very likely have tied too, because they were built to be internally consistent.
The only reliable control is that the source text be present in the same turn
as the transcription, and the only reliable fix is to stop transcribing
altogether: a supplied **file** lands in the workspace, survives context loss,
and can be read by tooling rather than copied by hand. That is now the
requested format for any extract of this size.

## 48. A tenth extract: WELGEDAG (part), WELLINGTON, WINBURG

Captured verbatim from supplied text, **422 rows across 36 trains and three
origins**, and held in the test file as the fixture `B10`. `B9` is untouched:
its sixty-two-train tie and its over-count guard still stand unaltered.

This is a **partial** capture of the WELGEDAG page. Only the trains listed
below were transcribed; the remainder of that origin has not been read and is
not represented. Nothing here should be read as a statement about WELGEDAG as
a whole.

| Origin | Trains captured |
| --- | --- |
| WELLINGTON | 7776, 9906 |
| WINBURG | 5002, 8906 |
| WELGEDAG | 1264, 1266, 1268, 1336, 1395, 1768, 3328, 7401, 7410, 7452, 7469, 7470, 7701, 7703, 8205, 8215, 8219, 8407, 8485, 8816, 8838, 8870, 8881, 8883, 8915, 9471, 9982, 18852, 18868, 18872, 18892, 48894 |

**Thirty-four of the thirty-six reconcile exactly** — stated throughput equals
clock-elapsed equals the sum of the runtime and standing columns. The two that
do not are each explained by a visible row.

### 48.1 The first over-count that is not a fabrication

**WELGEDAG 8883** declares 1,692 minutes against 252 minutes of clock. The
excess is **exactly 1,440 minutes — one day** — and one row accounts for all
of it:

```
WELGEDAG 8883 ... BALFOURNORTH  arrival 18:29:00  departure 18:24:00  standing 23:55:00  SHUNT
```

The train is recorded as departing five minutes **before** it arrived. The
source computed the dwell as `(departure − arrival) mod 24h`, so −5 minutes
became 23:55:00 = 1,435 minutes, and the schedule is credited with a day it
never spent.

This is the first time the over-count guard has fired on supplied text, and it
is worth being precise about why that is not a contradiction of §40. An
invented row over-counts by an **arbitrary** amount. This over-counts by
**exactly one day**, and the row responsible is visible in the source and
independently identifiable by `departure < arrival`. The guard has therefore
been made *sharper*, not weaker: an over-count is admitted only when it is
exactly 1,440 minutes **and** the train contains a backwards row. Any other
surplus still fails.

**The per-row standing check cannot see this.** `validateSchedule` measures
standing as `(departure − arrival + 1440) % 1440`, which returns 1,435 —
precisely the figure recorded. Two modular readings agreeing is not the same
as a correct one. A train whose every per-row check passes has not thereby
been shown to reconcile; only the elapsed identity catches it.

### 48.2 A stated runtime truncated to the whole minute

**WELGEDAG 1268** departs 07:05:00 and arrives **08:07:30**. Elapsed is 62
minutes 30 seconds, and the node rows add to exactly that. The summary column
states `01:02:00` — 62 minutes. The stated figure is not rounded; it is
**truncated**, and it is short by precisely the half-minute the arrival
carries. The defect is confined to the summary row.

### 48.3 Four train numbers, one path

**8205, 8215, 8219 and 8407** are row-for-row identical: same thirteen nodes,
same arrivals, same departures, same standing times, same reasons, same
distances, WELGEDAG → WITBANK in 109 minutes. The only thing separating them
is the train type — three are `VACUUM TRAINS/VACUUM TRAIN`, 8407 is
`MEDIUM HEAVY/MEDIUM HEAVY`. Four bookings against one slot.

**WINBURG 5002 and 8906** are the same pattern at a second origin: identical
clocks, differing in frequency (`NYNYNYN` vs `NYYYYYY`), train type and sched
band.

### 48.4 The weighbridge reason is spelled two ways, on two different nodes

Fifteen rows carry a weighbridge reason. Thirteen read `WEIGHBRIDGE` and sit on
`ELF/S766011`, the weighbridge siding. Two — **8816** and **8838** — read
`WEIGH BRIDGE`, with a space, and hang it on **ELOFF**, the station *after* the
siding, leaving their own `ELF/S766011` row with no reason at all.

Matching on the string finds thirteen of fifteen. Matching on the station finds
thirteen of fifteen. They are different thirteens. Any rule keyed on either
alone silently drops two rows.

### 48.5 A train that runs out and comes back down its own path

**WELGEDAG 48894** reaches OGIES and then retraces KENDAL, ARBOR, ARGENT,
DRYDEN, DELMAS in reverse before carrying on to SILICA and HAWERKLIP. Five
stations are visited twice; the second DELMAS is 110 minutes after the first.

A station list is not a set, and a node is not identified by its name. Any
join on station name within a train will double-count this working.

### 48.6 Smaller findings, each asserted

- **`NODE_Seq` restarts mid-run.** **9471** reaches OGIES at node 8, stands
  twenty minutes, and the next row is node **1** again. It carries two node 1s
  and two node 2s, roughly 100 minutes apart. The existing warning that the
  sequence is a block number and not a row index now has its clearest case.
- **A row with no elapsed time and no recorded value.** **8870** arrives at
  ELOFF at 00:20:45 and departs at 00:20:45 — the same instant it left the
  weighbridge — with both the runtime and standing columns **blank**, not zero.
  The train still ties, because there is genuinely nothing to count.
- **A terminus with no distance.** The final row of **8838**, `RTI/S843083`,
  leaves the distance column empty. It is the only such row in the extract.
  Read as zero it is invisible, so a distance total for this train understates
  the journey by an unknown amount rather than by nothing.
- **Shunting before departure.** **WINBURG 5002** opens with four `RANGEER`
  moves around `WGR/S545392` and `WGR/S545414` — each one minute of standing
  and no travel at all — before the train leaves the yard.
- **Frequency alphabet.** Only `Y`, `N` and `A` appear in the frequency column
  here: `YYYYYYY`, `AAAAAAA`, `YYYYAYY`, `NYYYYYY`, `NYNYNYN`. **No `C`.** `C`
  does occur in this extract, but in the `StandingReason` column, which is a
  different field with a different meaning. The two must not be conflated, and
  the meaning of frequency `C` (§44) remains unexplained.

### 48.7 A structural hazard, recorded before it bites

`parseRunningTimes` keys schedules on the **train number alone**, not on
`(origin, train)`. That is safe for this extract only because no number is
shared between its three origins, and a test now asserts that precondition.

It is not safe in general. A page covering two origins that each work a train
8219 would be merged into a single schedule with two destinations and no error
raised. This extract already shows the same number doing different work at
different origins is routine, and the fixtures will eventually contain a
collision. The guard is in place so that the day it happens, a test fails
rather than the merge passing quietly.

## 49. An eleventh extract: KGR-WATERVAL and WAPADSKLOOF

Captured verbatim from supplied text, **848 rows across 31 trains** — 29 at
KGR-WATERVAL and 2 at WAPADSKLOOF, a new origin — and held as the fixture
`B11`. Unlike §48 this is the **whole** of what was supplied, not a subset.
`B9` and `B10` are untouched.

**Twenty-nine of the thirty-one reconcile exactly.** The two that do not are
each explained by a visible row, and neither is a new kind of error: one is a
second instance of a defect the library already defends against, and the other
is a known rule meeting a case it was not written for.

### 49.1 A forty-row train whose days were never counted

**8974** departs KGR-WATERVAL at 23:00 and arrives MEYERTON at 11:31 the next
morning. The summary says 12:31:00. Every one of its 39 node rows carries
`Depart_Day = 0`, including the ones at 01:12, 08:00 and 11:31.

Read literally the offsets say the train arrived 689 minutes **before** it
left. The library already corrects exactly this — the rule was written for
train 18415, which departs 23:35 and arrives 00:42 with the offset never
incremented — so `elapsedMinutes` adds the missing day back, returns 751, and
the train ties perfectly.

Three sibling trains settle that it is the offsets and not the timetable that
are wrong. **7224, 7228 and 7428** all leave at 23:00, all stand two hours at
KRUGERSDORP for a loco change (arrive 23:12, away 01:12), and all three carry
`0` then `1`. Only 8974 does not.

Two things follow, and the second is the one that matters.

1. `spansDays()` reads the offsets directly, without the correction, and so
   reports **false** for a train that plainly crosses midnight. The corrected
   elapsed time and the uncorrected day count now disagree with each other.
2. **The correction is only safe below 24 hours.** It adds exactly one day
   when the arithmetic goes negative. A train with the same stale offset and a
   run longer than a day would be corrected by one day and still be wrong — by
   a whole further day — and nothing in the file would flag it, because the
   corrected figure would be positive and would tie against a stated runtime
   that is equally derived from the same bad column. 18415 was a 67-minute
   train; 8974 is a 12½-hour one. The defect class is getting larger, and the
   guard does not scale with it.

### 49.2 Five minutes of standing recorded at the end of the journey

**7428**'s last row is SASOLBURG: arrival 11:30:00, departure 00:00:00, eight
minutes of running — and a standing time of `00:05:00`. It is the only
terminus row in the extract that carries one.

The library deliberately refuses to treat a last row as a terminus when it has
a recorded standing time, because train **1710** departs HAMMARSDALE at a real
midnight with five minutes against it, and treating that as an ending left the
previous departure stale and misreported the following row. That rule is right
for 1710 and wrong for this row, and **the two are not distinguishable from
the columns alone**: both are a row at 00:00:00 with five minutes of standing.

This is recorded rather than patched. Relaxing the terminus test to ignore
standing would re-break 1710 and the five POSTMASBURG-class false positives it
was written for — 435, 410, 350, 733 and 373 minutes of phantom standing. That
trade is worse than one named exception. So 7428 stands as a known cost: one
flagged standing mismatch, and five minutes of over-count, from one row.

### 49.3 A leading B or C is a flag, not part of the reason

Sixty-nine rows across all three fixtures open their reason with a bare `B` or
`C` — `B SHUNT`, `C LOCO CHANGE`, `B TURN LOCO'S`, `B RT`, `B RANGEER`, or the
letter alone.

Within this extract all 28 of them sit on the train's **first node row**, with
no exception. Checked against the whole corpus that rule is **false**: WELGEDAG
1395 carries its `B` on ZESFONTEIN, the *second* node row, because its first
row (COWLESDAM) has no reason at all.

The rule that survives the wider check is narrower and better: **the flag is
always on the first row that carries any reason at all.** Asserted across B9,
B10 and B11 together — 69 flags, zero exceptions.

This matters for any rule keyed on the reason string. Eleven trains here stand
for a shunt at their first node and not one of them reads `SHUNT`; they read
`B SHUNT`. A whole-string match silently drops the first node of most trains
in the corpus.

### 49.4 The first structural handle on frequency code `C`

`C` has appeared in the Frequency column since §44 and has never been
explained. Four trains here carry one:

| Train | Frequency | Train type | First reason |
| --- | --- | --- | --- |
| 7224 | `YYYYYCY` | VACUUM TRAINS/VACUUM TRAIN | `C LOCO CHANGE` |
| 8918 | `CCYCYCY` | LIGHTAIRBRAKE/LIGHTAIRBRAKE | `C SHUNT` |
| 8957 | `YYCYYYC` | MEDIUM HEAVY/MEDIUM HEAVY | `C` |
| 8974 | `CYCYYYY` | LIGHTAIRBRAKE/LIGHTAIRBRAKE | `C LOCO CHANGE` |

**Every train whose frequency contains a `C` also carries a `C` flag on its
first reason-bearing row.** The converse is false — 8633 and 8977 carry a `C`
flag and run `YYYYYYY` — so this is an implication, not an equivalence.

On four trains it is a weak implication, and it is **not** a reading of what
`C` means. It is asserted because it is the first thing about `C` that is
checkable at all, and because if a later extract breaks it, that is itself
worth knowing. The meaning of `C` remains outstanding.

### 49.5 Smaller findings, each asserted

- **A train scheduled never to run.** 8456 carries frequency `NNNNNNN` — no
  day of the week. It is otherwise a complete, tying 43-minute working to
  LANGLAAGTE.
- **A new train type and a new reason.** `LIGHTAIRBRAKE/LIGHTAIRBRAKE` (8918,
  8974) and `CRANKING` (7224, 7228, 7428, 8974), the latter appearing dozens
  of times as a uniform five minutes at consecutive nodes.
- **Four workings to MAFIKENG**, all stated at twelve hours. 7226 and 7426
  share every node and differ at exactly **two rows, by thirty seconds** —
  BNS/S754935 departs 11:37:30 against 11:37:00, BOONS arrives 11:38:30
  against 11:38:00. Everything else is identical. A tolerance of a minute
  would call them the same train; they are not.
- **5964 and 7235** are one path to SASOLBURG booked twice, clock for clock,
  same frequency — the same pattern as WINBURG 5002/8906 in §48.
- **WAPADSKLOOF** is a new origin with two trains, both sixteen-minute yard
  moves out to WDF/S845043 and back to their own starting point, 70 minutes
  apart.

## 50. A twelfth extract: VYD-STASIE, WAKEFIELD, WARDEN, and part of WALTLOO

Captured verbatim, **591 rows across 73 trains and four origins**, held as the
fixture `B12`. VYD-STASIE, WAKEFIELD and WARDEN are **complete**; WALTLOO is
**partial** — its seven long-distance workings (3604, 7513, 7929, 8916, 8945,
8955, 18927) were not transcribed, and neither was any of **WARRENTON**.
Seventy-two of the seventy-three reconcile exactly.

### 50.1 The B/C flag is not a day code — it tracks the train type

This is the first substantive thing known about the flag, and VYD-STASIE is as
close to a controlled experiment as the corpus offers: twenty-three trains, one
origin, two destinations, ten of them running node-for-node identical paths.

**Across all twenty-three, the flag is predicted exactly by the first component
of the train type.** Every `VACUUM TRAINS` working carries `B`; every
`MEDIUM HEAVY` working carries `C`. Fifteen and eight, no exceptions.

The cleanest pair is **1844 and 2844**:

| | 1844 | 2844 |
| --- | --- | --- |
| Depart VYD-STASIE | 16:10 | 16:10 |
| Arrive VRYHEIDOOS | 16:20 | 16:20 |
| Distance | 7.09 km | 7.09 km |
| Train type | VACUUM TRAINS/VACUUM TRAIN | MEDIUM HEAVY/MEDIUM HEAVY |
| Reason | **`B RT`** | **`C RT`** |

Same hop, same ten minutes, same kilometre. The flag is the only thing that
moves, and it moves with the type.

**Corpus-wide the association is strong and imperfect.** Measured over B9, B10,
B11 and B12 together: **106 flagged trains, 90 agree, 16 do not — 84.9%.** All
sixteen exceptions are named in the test rather than waved away; thirteen are
`MEDIUM HEAVY` carrying `B`, three are `VACUUM TRAINS` carrying `C`, and one
(WOLSELEY 1418) is `LIGHTAIRBRAKE` carrying `B`.

So the flag is **associated with** the brake class and is not **determined by**
it. That is not a reading of what `B` and `C` mean, but it does rule one out:
a day-of-week code would not track the brake class at all, let alone at 85%.
The remaining question is narrower and better posed than it was — what makes
the sixteen different.

This also has to be read alongside §49.4, which found that every train whose
**Frequency** string contains a `C` also carries a `C` flag. The two columns
are different fields and the letters may well mean different things in each;
nothing here licenses merging them.

### 50.2 Ten trains to GLENCOE over one path

**1845, 1847, 2408, 2414, 2841, 2845, 2849, 6406, 6408, 6491** share every
node, every point-to-point runtime, every standing time — including the
ten-minute shunt at TALANA — and all state 02:53:00. They leave at **five**
distinct times and carry **four** distinct frequency strings; 6406 is the only
`MEDIUM HEAVY/IMPORT COKE`.

This is the largest identity group in the corpus. The previous best was the
four-way WELGEDAG 8205/8215/8219/8407 (§48.3). Ten numbers, one slot.

### 50.3 The half-minute truncation is a rule, not a one-off

**WALTLOO 8961** arrives KAALFONTEIN at 20:21:30 against a stated 01:16:00 —
76 minutes 30 seconds of clock, 76 minutes stated. Identical in form to
**WELGEDAG 1268** (§48.2), which arrived 08:07:30 against a stated 01:02:00.

Two instances, two extracts, two origins. Where the destination arrival carries
a half minute, the stated throughput drops it. It is the export's behaviour,
not an isolated slip, and the node rows are complete in both cases — only the
summary column is short.

### 50.4 Smaller findings, each asserted

- **WARDEN 5598 and 8598** are one path booked twice through fourteen shunting
  moves to HARRISMITH. 5598's first reason is a bare `SHUNT`; 8598's is
  `B SHUNT` — a `B` on a medium-heavy working, one of the sixteen exceptions.
- **WAKEFIELD** is a new origin with two trains. 5005 departs 23:50 and arrives
  00:05 with `Depart_Day = 1` on its single node row — the day offset behaving
  correctly, in contrast to §49.1.
- **The WALTLOO yard pool**: nineteen workings that start and finish at
  WALTLOO and move only among eight `WAO/` sidings. Three are booked twice —
  3801/8801, 3813/8813, 3825/8825 — identical move, differing train type, no
  flag on either member of any pair.
- **WALTLOO 4707 and 8709** likewise run an identical path to ROSSLYN, one
  vacuum and one medium heavy, and **both** carry `B`. 8709 is another of the
  sixteen.

## 51. A thirteenth extract: VANDYKSDRIF, complete — and a claim withdrawn

Captured verbatim, **468 rows across 80 trains at one origin**, held as the
fixture `B13`. This is the **whole** of what was supplied. Seventy-eight of
the eighty reconcile exactly.

### 51.1 WITHDRAWN: the frequency-`C` implication from §49.4

§49.4 established, on four KGR-WATERVAL trains, that *every train whose
**Frequency** string contains a `C` also carries a `C` flag on its first
reason-bearing row*. It was recorded as a weak implication on a small sample,
and asserted in the test suite **precisely so that a later extract breaking it
would say so**.

It broke.

**VANDYKSDRIF 2200** runs frequency `YCYYCCY` — three `C`s — and carries **no
flag at all**. Its first reason-bearing row reads `RANGEER`, and not one of its
six node rows holds a `B` or a `C`. It is otherwise an unremarkable member of
the hourly shunt pool, clock-for-clock identical to the other twenty-one.

**The Frequency `C` and the reason-column `C` are not linked.** They were
always different fields; the apparent connection was four trains' worth of
coincidence, and it is now withdrawn. The meaning of a `C` in the Frequency
column is once again entirely unknown.

What survives untouched is **§50.1** — the *reason-column* flag tracks the
train type. This extract neither supports nor disturbs it: eighty trains carry
exactly one flag between them.

### 51.2 The stated runtime is TRUNCATED, not rounded

**2255 and 2257** both arrive at 59 seconds past the minute — 19:31:59 and
01:32:59 — against a stated `01:31:00`. Elapsed is 91 minutes 59 seconds;
stated is 91.

This settles a question the earlier cases could not. WELGEDAG 1268 (§48.2) and
WALTLOO 8961 (§50.3) each carried a *half* minute, which rounding-to-nearest
would have explained just as well as truncation. **59 seconds would round up.
It does not.** Four instances across three extracts and two behaviours
distinguished: the export truncates the stated throughput toward zero.

### 51.3 Twenty-two identical hourly yard sweeps

Trains **100, 300–2000 on the hour, 2100, 2200, 2300** are each a 55-minute
sweep out to `VYF/S754331` and back through `VYF/S754307` and `VYF/S754293` —
five `RANGEER` moves of five minutes apiece, identical to the second. They
differ only in departure hour, and 2200 in its frequency. **There is no 200.**

At twenty-two this is the largest identity group in the corpus, against ten at
VYD-STASIE (§50.2) and four at WELGEDAG (§48.3).

### 51.4 Smaller findings

- **One flag in eighty trains.** Only 8748 carries one — a `B` on a
  `MEDIUM HEAVY` working, which under the §50.1 rule would predict `C`. It
  joins the sixteen named exceptions.
- **Six numbers, one path.** 2097, 2099, 2101, 2103, 8977 and 8979 all work
  the same five nodes to `PSH/S741051` in 59 minutes with the same one-minute
  `RANGEER` at BSX-PULLENSHO. Four are `VACUUM TRAINS/FEEDER TRAIN`, two are
  `MEDIUM HEAVY`, and none carries a flag.
- **A terminus reason parses as `null`, not `''`.** Noted because the opposite
  was assumed when writing these tests and the assertion failed. Blank node
  reasons read as the empty string; the terminus reads null.

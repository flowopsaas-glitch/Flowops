# TRIM Annexure 33a — Point to Point Running Times (supplied sample)

**Date recorded:** 2026-10-04
**Supplied by:** Owner, pasted into session chat
**Document:** Annexure 33a, Network Statement V4 (FY2026/27)
**Sample:** train **2469**, **ANGLOALPHA → NATALSPRUIT**, **CENTRAL** corridor
**Status:** VERIFIED. Partial — **37.3% of the journey**.

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

## 33. Still required

1. **7407** — rows for sequence groups 2–39. Summary held.
2. **7403** — sequence groups 14–39. Head and summary held.
3. **7405** — the ~30 intermediate rows between the groups supplied.
4. **8915** — sequence groups 1–9 and its summary row.
5. **The 33a ↔ Annexure 43 corridor mapping** — still the binding constraint
   on measuring any transit KPI.
6. Every train not listed in §10.

Four reference results are now asserted end to end: the 6455/6431 route pair
(§17), the 6614/6616/8038 timetable triplet (§23), the 8000/8002 crossing
(§24), and the 4465/7355/8965 group (§28).

Paste as raw TSV, one row per line, no `" and "` joins.

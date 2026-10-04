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
| 6431 | → NEWCASTLYSKOR | **no** | 54–65 only | **Continuation** |
| 10008 | — | yes | 1–2 | Complete |
| 10010 | — | yes | 1–2 | Complete |

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

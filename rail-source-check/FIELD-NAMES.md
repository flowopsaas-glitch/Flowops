# Annexure 33a — authoritative field names

**Source:** the header row of `Annexure_33a_NS_ver_4.txt`, supplied 2026-10-07 (round 53).
**Status:** verbatim from the source workbook. This supersedes the guessed field names used in
`NEXT-CHAT-PROMPT.md`, `STATE.md` and `verify_workings.py`.

## 1. The header, verbatim

```
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
```

## 2. Full mapping

| # | 0-based | Header name (authoritative) | Name used so far | Verdict |
|---|---|---|---|---|
| 1 | 0 | `Origin` | depot | ✅ same thing |
| 2 | 1 | `Train` | working | ✅ |
| 3 | 2 | `NODE_Seq` | step | ⚠️ node sequence — **restarts mid-working**, see §3 |
| 4 | 3 | `ENROUTE_Corridor` | **direction** | ❌ **WRONG** — a corridor, and it changes mid-working, see §3 |
| 5 | 4 | `ENRTE_Station/siding number` | station | ✅ can be a station **or a siding** |
| 6 | 5 | `ENROUTE_Arrival time` | arr | ✅ |
| 7 | 6 | `ENROUTE_Departure Time` | dep | ✅ `00:00:00` = trip ends |
| 8 | 7 | `Point to Point Runtime` | travel | ✅ |
| 9 | 8 | `Standingtime` | dwell | ✅ |
| 10 | 9 | `StandingReason` | activity | ✅ free text, not an enum |
| 11 | 10 | `Destination` | designation | ✅ |
| 12 | 11 | `Origin Departure Time` | work_start | ✅ header-only |
| 13 | 12 | `Destination Arrival Time` | work_end | ✅ header-only |
| 14 | 13 | `Sched` | n | ✅ header-only |
| 15 | 14 | `Frequency` | pattern | ✅ header-only |
| 16 | 15 | `Train Type` | description | ✅ header-only |
| 17 | 16 | `Train Throughput Runtime (from Origin to Destination)` | work_dur | ✅ populated on **every** row, not header-only |
| 18 | 17 | `Depart_Day` | day_flag | ✅ day offset; authoritative midnight marker |
| 19 | 18 | `Distance` | distance | ✅ decimal, 2 dp |

Field 17 is worth calling out: it repeats on **all** rows (all 14,410), unlike fields 12–16
which are header-only. Treating it as header-only would lose it on 14,004 rows.

## 3. The two findings that affect existing analysis

Both are measured across **every** rail data file on disk (14,410 rows, 411 workings).

### 3.1 Column 4 is a corridor, and it changes *within* a working

Not a direction-of-travel constant. Observed vocabulary, corpus-wide:
`CAPE` 10359 · `CENTRAL` 1830 · `CONTAINER` 1243 · `NORTHEAST` 399 · `NORTH` 140 · blank 33.
(`ORELINE` also occurs in the round-53 BRONKHORSTSPR/BOTHAVILLE/BIJLKOR pastes — see §4.)

**60 of 411 workings (14.6%) carry more than one corridor value.** Worst offender:

```
ANGLOALPHA 8405 — column 4 value boundaries
  48 CENTRAL | 1 blank | 12 CENTRAL | 1 CONTAINER | 7 CENTRAL | 12 NORTH | 55 NORTHEAST
```

One working, four corridors. Other examples: `ANGLOALPHA 2469/7415/7419/8205`,
`BEACONSFIELD 8987/8989/17081/17311/27063`, `BLOEMFONTEIN 1130/2271`.

`verify_workings.py` treats this field as `direction` and never checks it, so no existing
verdict changes — but any consumer that reads it as a per-working direction is wrong for
those 60 workings.

**33 rows across 19 workings have a blank corridor**, including the `VANDERBIJL` rows already
noted in round 3 ("8916 VANDERBIJL empty direction field"). Preserved verbatim; never filled.

### 3.2 Column 3 (`NODE_Seq`) restarts mid-working

**20 of 411 workings** have a non-monotonic node sequence. Round 5 already recorded this for
`ANGLOALPHA 8405` ("three sections with step-counter resets"); it is not unique to that
working. Full list at time of writing: `ANGLOALPHA 7415, 8405` · `BEACONSFIELD 8965, 8988,
18936, 1222, 1224, 1240` · `BLOEMFONTEIN 3266, 4410, 18927, 8914` · plus 8 more.

**Consequence:** `(depot, working, NODE_Seq)` is **not** a unique row key. A stable key needs a
section/block ordinal as well.

## 4. Domains of the header-only fields (corpus-wide, 406 header rows)

| Field | Distinct | Most common |
|---|---|---|
| `Sched` | 3 | `3`×243, `1`×98, `2`×65 |
| `Frequency` | **48** | `YYYYYYY`×267, `NYYYYYY`×29, `NYYYYYN`×19, `NNNNNNA`×11, `NNNANNN`×6, `NNNNANN`×6, `NNNNNAN`×6, `AAAAAAA`×6, `NANNNNN`×5, `YYYYYYN`×5 |
| `Train Type` | **23** | `MEDIUM HEAVY/MEDIUM HEAVY`×101, `VACUUM TRAINS/VACUUM TRAIN`×78, `VACUUM TRAINS/SHUNT CAR`×54, `MEDIUM HEAVY/PE MANGANESE`×41, `VACUUM TRAINS/FEEDER TRAIN`×40, `LIGHTAIRBRAKE/LIGHTAIRBRAKE`×27, `VACUUM TRAINS/PICKUP TRAIN`×18, `VACUUM TRAINS/LIGHT LOCO`×11, `VACUUM TRAINS/MATERIAL TRN`×9, `MEDIUM HEAVY/CONTAINER MH`×5 |

`Depart_Day` across all 14,410 rows: `0`×8917, `1`×4161, `2`×1332. Day 2 is real and must be
honoured — 1,332 rows depend on it.

**`Frequency` remains unresolved.** 48 distinct 7-character patterns over an alphabet of
`{Y, N, A}`. `A` is not rare (`AAAAAAA`×6, `NNNNNNA`×11) so it is a real third state, not a
typo — but its meaning is not established. Do not assume it means "Saturday" or "no service".

## 5. Ingest hazards (from the round-53 extracts)

| ID | Hazard | Exhibit |
|---|---|---|
| H1 | `Point to Point Runtime` **and** `Standingtime` blank while arrival == previous departure — runtime missing, not zero | `BIJLKOR 1428 LAPLAISANTE 07:50:00→07:50:00`, 2.02 km |
| H2 | Same at other nodes | `1428 EIKENFONTEIN` 1.66 km, `1428 STIKLAND` 3.85 km, `2436 VANDERBIJLPAR` |
| H3 | `StandingReason` free text with compound/multi-value entries | `X 2025 / 2031 / 8991`, `X CONT X 7591`, `X 7535 X 6261`, `P 2463 H`, `B SHUNT`, `RT LOCOS` |
| H4 | Spelling variant for the same concept in one file | `1428` carries both `X MANGANESE` and `X MAGGANESE` |
| H5 | Short-hop distances are **not** a constant | `YSK/S750166` = 0.25 in `1428` but 0.54 in `5303/5309/5311`; `VANDERBIJL` = `1`; `BADHOPE` = 0.1 |
| H6 | Sub-minute runtime | `2436 CACHET 00:00:30` |
| H7 | Same origin→destination, very different totals — driven by standing | `BIJLKOR→SIN-MYN-WISST`: `2434` 15:11, `2436` 27:46, `2440` 18:14 (`2436` stands 6:49 at `WARRENTON`) |
| H8 | `Destination` may itself be a siding | `5303/5309/5311` → `YSK/S750166` |

## 6. What this does *not* change

No existing row was edited. No verdict changed. Nothing was derived. The corpus remains
byte-faithful; §3 is a documentation correction plus two flags for anyone consuming the
fields programmatically.

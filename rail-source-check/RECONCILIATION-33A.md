# Reconciliation — curated corpus vs Annexure 33a (Transnet) — 2026-10-10 (round 65)

**Mandate (user, 2026-10-10):** "the ann 33a is from transnet so we have to follow it" —
Annexure 33a (`Annexure33a_NSver.4(1).xlsx`, sheet `_00750_Report_Train_Route`) is the **source
of record**; where the curated corpus diverges from it, the corpus follows the annexure.

**Source of the extract used:** `sources/Annexure_33a_NS_ver_4 (3).zip` (user upload, commit
`8d30089`) → `Annexure_33a_NS_ver_4 (3).txt`, 25,491,037 bytes, MD5
`1cd978f5a0e5c5528886aa0c66047cb6`; 251,679 lines = header + 251,678 data rows, 19 fields each.

## Divergence map (measured before the reconciliation, at 17,811 curated rows)

| class | rows | nature | treatment |
|---|---|---|---|
| byte-identical | 17,249 | row exists verbatim in the annexure | none |
| A — `Reason`-only diffs | 31 | 30 × chat HTML-escaping (`&amp;` vs source `&`), 1 × blank-vs-`RT` (`BELFAST 8660 LYDENBURG`) | annexure values adopted |
| B — `Frequency`-only diffs | 20 | `ALGOABAAI` header rows of `2475`–`2494`: one-position pattern shift (`NNNANNN` vs `NNANNNN` etc.) | annexure values adopted |
| C — working-variant diffs | 52 rows in 12 blocks | same keys but different service definition (e.g. `5569` curated `→MARSEILLES 05:30:00` vs annexure `→MODDERPOORT 04:19:00`) | whole blocks swapped to the annexure rows |
| D — curated-only rows | 459 | rows not in the annexure (station/seq version drift; `1438`'s derived rows) | removed with their block swaps |

103 + 459 = **562** = the parallel session's "562 curated rows do not appear exactly" ✓.

## Reconciliation applied (52 blocks, 8 files) — every block now equals the annexure block

| file | working | rows before → after | class |
|---|---|---|---|
| algoabai-hotazel | 2475–2494 (20 workings) | 129 → 129 each | B (Freq) |
| beaconsfield-8965-28947 | 8965 | 22 → 47 | partial completed from annexure |
| beaconsfield-8965-28947 | 8988 | 130 → 130 | A (3 × `&`) |
| beaufortwest-bultfontein-bloemfontein | 1416 / 1440 / 1450 / 1452 / 8924 | 77 → 77 each | A + station-rename rows |
| beaufortwest-bultfontein-bloemfontein | 97 | 16 → 19 | partial completed |
| beaufortwest-bultfontein-bloemfontein | 18927 | 59 → 83 | partial completed |
| beaufortwest-bultfontein-bloemfontein | 4215 | 33 → 93 | partial completed |
| beaufortwest-bultfontein-bloemfontein | 5569 | 44 → 46 | C (service variant) |
| beaufortwest-bultfontein-bloemfontein | 5575 | 25 → 23 | C |
| beaufortwest-bultfontein-bloemfontein | 5587 | 25 → 45 | C |
| beaufortwest-bultfontein-bloemfontein | 5598 | 19 → 23 | C (seq renumbering) |
| beaufortwest-bultfontein-bloemfontein | 6008 | 28 → 2 | C |
| beaufortwest-bultfontein-bloemfontein | 6100 / 6200 / 6300 | 119 → 97 each | C |
| belfast | 8660 | 18 → 18 | A (blank → `RT`) |
| bellville | 75 / 1211 / 1411 | 29 / 37 / 37 unchanged | A (`&amp;` → `&`) |
| bledasdorp-bindura-beaconsfield | 1222 / 1224 / 1240 / 1250 / 1402 / 1414 / 1438 | 130 → 130 each | A + station-rename rows; **1438's 2 derived rows replaced by annexure rows** |
| bloemhof | 2385 / 5453 | 42 → 42 each | A (`X2448&71008`) |
| welgedag-wellington-winburg-balance | 58866 | 1 → 15 | partial completed |

**Net: 18,159 → 18,217 rows** (partial completions +58; version swaps net −0 per file except the
paired adds/removes above). **Verification after the swap: every one of the 18,217 corpus rows is
byte-identical to a row of the annexure (0 exceptions), and each swapped block equals the
annexure block exactly.** `BLINKPAN 89309` (8 rows) matched the annexure and was untouched.

## Flag list effect (checker)

7 flags **lifted** — the partial/derived ones, now carrying annexure rows: `BEACONSFIELD 8965`,
`BEAUFORTWEST 97`, `BLOEMFONTEIN 4215`, `BLOEMFONTEIN 5598`, `BLOEMFONTEIN 6008`, `BLOEMFONTEIN
18927`, `WELGEDAG 58866`. **16 remain** — genuine source anomalies preserved verbatim (incl.
`BELLVILLE 1417`'s 30-second stated-vs-computed mismatch, now confirmed **inside the annexure
itself** (extract's 1417: stated 02:40:00 vs 03:15:00→05:55:30), and `BLINKPAN 80109`'s
`Depart_Day` quirk): ANGLOALPHA 7460/7468/8205 · BEACONSFIELD 28941 · BEAUFORTWEST 8924 ·
BLOEMFONTEIN 2273/2412 · BEESHOEK 7403/7407 · BELLVILLE 1417 · BLINKPAN 80109 · BLOEMHOF
1438/2226 · ARIAMSVLEI 2169 · BUFFALOHARBOU 1052 · WALTLOO 8961.

## File checksums after the reconciliation (2026-10-10)

| file | rows | MD5 |
|---|---|---|
| algoabai-hotazel-batch.txt | 4,658 | `728281ca7a6b239050921a931392e98f` |
| beaconsfield-8965-28947-batch.txt | 1,293 | `84b4055bd98c350e4f94bcf021c24111` |
| beaufortwest-bultfontein-bloemfontein-batch.txt | 3,066 | `87e9247941743a4520ac0fac6f3e8ddf` |
| belfast-batch.txt | 333 | `dec723442c50a484d4787ef1b10c4594` |
| bellville-batch.txt | 784 | `e3b81cc413fc9ab9663c3ae3f34ca4a8` |
| bledasdorp-bindura-beaconsfield-batch.txt | 1,180 | `1b58230a9583c16f1120e5db55626e15` |
| bloemhof-batch.txt | 303 | `6443ba4ded362c889a3d8f35a9f51783` |
| welgedag-wellington-winburg-balance.txt | 139 | `246b37702b712b209b4b28f135b4b697` |

Pre-reconciliation values are preserved in git (commit before this one) and in the round-65
STATE.md note. **Going forward: the corpus mirrors the annexure; appends continue to be gated
byte-verbatim rows, and any future divergence is resolved in the annexure's favour per the
mandate.**

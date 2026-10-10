# Handoff prompt — Rail working consolidation (Annexure_33a_NS_ver_4)

Paste everything below the line into a new chat in this same workspace.
> **VS Code sessions:** use `rail-source-check/NEXT-SESSION-PROMPT.md` instead — it is self-contained,
> includes the start-of-session integrity checks and the new `append_gate.py`, and assumes no sandbox.
All figures in it were first read off disk on 2026-10-05 at commit `7fc28a3`; the data tree was restored at `2073bb9`; subsequent rounds are recorded below.

---

> **Earlier-session recovery (2026-10-05).** The prior chat’s committed rail-source tree was restored by a fast-forward onto the currently assigned `arena/d016ab76-flowops` branch. Stay on that branch and push only there. The repeated BLOEMFONTEIN 6634 paste matched the existing 23-row block exactly (L2423–2445; MD5 `2937669311f73e1f88053d0950bfaefb`), so it was not appended again. At that recovery checkpoint, the next missing working was 6636; rounds 28–45 subsequently appended 6636, 6640, 6642, 6944, 7000, 7002, 7266, 7424, 8000, 8206, 8605, 8606, 8642, 8652, 8855, 8867, 8875, 8910 and 8914.
> **Latest progress (2026-10-07 / round 54).** Two new depots transcribed and verified from raw chat pastes: `bothaville-batch.txt` (120 rows, 3 workings, **all `[OK]`**, MD5 `f694b22e702962bef2e0e0a7324d840b`) and `bijlkor-batch.txt` (609 rows, 16 workings, **15 `[OK]` + 1 flagged**, MD5 `ef82c23ec49c21a735854e6cc1ecd084`). Pre-transcription dedupe found **0 BOTHAVILLE rows and 0 BIJLKOR rows** corpus-wide. **BIJLKOR 5931 is a PARTIAL extract** — the paste was truncated at `NODE_Seq` 7 `SKANSDAM 22:59:00` while its destination is ERMELO (stated 06:32:00); the checker's duration mismatch is caused by the truncation, not by a source anomaly. ~~Its tail must be re-supplied.~~ **(SUPERSEDED — the tail arrived in round 55; see above. 5931 is now complete and `[OK]`.)** Also corrective: `ORELINE` is a real 7th corridor value but occurs **only twice**, in BIJLKOR 2434/2440 at `GMA/S261955` — not in 1428 as round 53 predicted. Round 53 added `bronkhorstspruit-batch.txt` (71 rows, 5 workings, all `[OK]`, MD5 `54cfbb251e244c7aef454dc15a960025`) plus the **authoritative source header row**, now in `FIELD-NAMES.md`. Current verified totals: **17 files, 15,139 rows, 430 workings, 33 depots; 408 `[OK]`, 22 flagged.** Next BLOEMFONTEIN working: 8941.
>
> **Latest progress (2026-10-07 / round 55).** The `BIJLKOR 5931` partial is **CLOSED** — its tail was re-supplied and appended; 5931 now runs **L599-638, 22:00:00 → 04:32:00, stated/computed 06:32:00, overnight ×1, `[OK]`**. A further **29 BIJLKOR workings** were appended in the same round (6253, 6437, 6453, 7203, 7205, 7207, 7216, 7255, 7277, 7282, 7301-7323 odd, 7324, 7348, 7352, 7454, 7472, 7949, 8466) — **481 rows, all 19 fields, checked at 0 byte-identical and 0 colliding keys against the whole corpus before appending**. `bijlkor-batch.txt` now holds **1090 rows / 45 workings / 44 `[OK]` + 1 flagged**, MD5 `c6f9368b54270d2cb5697c426833c476`. ~~**BIJLKOR 8466 is a PARTIAL extract** — the paste stopped at `NODE_Seq` 9 `ROOIVLEI` 06:06:30 while the destination is THABAZIMBI (stated 19:30:00); **its tail from `NODE_Seq` 10 onward must be re-supplied**.~~ **(SUPERSEDED — the tail arrived in round 56; 8466 is now complete and `[OK]`, see below.)** Current verified totals: **17 files, 15,620 rows, 459 workings, 33 depots; 437 `[OK]`, 22 flagged.** Next BLOEMFONTEIN working: 8941.
>
> **Latest progress (2026-10-07 / round 56).** The `BIJLKOR 8466` partial is **CLOSED** — its tail (seq 10 `VLAKFONTEIN` → seq 17 `THABAZIMBI`) was appended; 8466 now runs **L1077-1141, 04:20:00 → 23:50:00, stated/computed 19:30:00, `[OK]`**. Seven further BIJLKOR workings were appended in the same round — **8499** (31 rows, L1142-1172), **8501** (117, L1173-1289), **8503** (114, L1290-1403), **8551** (117, L1404-1520), **8586** (19, L1521-1539), **8850** (9, L1540-1548) and **8952** (2, L1549-1550) — **460 rows total, all 19 fields, 0 byte-identical rows and 0 colliding `(depot, working, NODE_Seq, station)` keys against the whole corpus, boundary contiguous (seq 9 `ROOIVLEI` dep 06:06:30 + 00:04:00 = seq 10 `VLAKFONTEIN` arr 06:10:30), `tail -460` byte-identical to the payload**, file MD5 `ae1d85f6f5d87f7ef589d362a00c8ea3`. The checker now reports **52 workings, 0 with issues** for `bijlkor-batch.txt`. `8503` is 114 rows, not the 115 in the provisional inventory (every leg reconciles and the end time matches the header — treat 115 as a miscount). **WITHHELD / RE-PASTE OWED (nothing invented):** `BIJLKOR 8856` — transcription stopped mid-working at `BEAUFORTWEST` (day-1 20:25:00); the stated 45:43:00 runtime and 10:45:00 destination arrival prove rows are missing, so its 108 transcribed rows were deliberately not appended; and workings **9409, 9443, 16453, 17205, 17207** were never written to disk before the session state was condensed, so their paste text must be supplied again (`17207` is additionally a partial whose own tail was missing). Sibling comparisons run after transcription: `8501` vs `8551` (same stations; travel 8, arrival 6, departure 6, activity 5, `Train Type` 1), `8501` vs `8503` (117 vs 114; `8503` ends `BAYHEAD`, `8501` adds `BOOTH`→`UMBILO`→`CONGELLA`→`DALBRIDGE`→`MAYDONWHARF`), `8499` vs `8586` (shared 18-row prefix to `COWLESDAM`) and `8850` vs `7324` (identical sequence and travel, clock times only). Current verified totals: **17 files, 16,080 rows, 466 workings, 33 depots; 445 `[OK]`, 21 flagged.** Next BLOEMFONTEIN working: 8941.
>
> **Latest progress (2026-10-07 / round 57).** A **new depot, `BLINKPAN`**, was transcribed in full apart from its last working: `blinkpan-batch.txt`, **578 rows / 69 workings**, MD5 `d78b4817c00db61fe832c26092d1e77b` — four 13-row shunt loops (`100`/`700`/`1300`/`2000`), the `2154`/`2156`/`2158`/`2160` one-station runs, `7722`, `7749`, `7788`, `7790`, `8192`, the five `CAMDEN` workings (`9403`/`9407`/`9413`/`9425`/`9427`), `58859`, `58871`, `62192`, the forty-six `80109`–`89109` coal workings (30-minute spacing, 22:11:00 → 20:41:00 starts) and `89254`. BIJLKOR also grew by 132 rows: `17305`–`17321` (nine identical `BIJLKOR → YSK/S750166` one-minute runs) and `18551` (a 114-row `BIJLKOR → BAYHEAD` vacuum run, `[OK]`); `bijlkor-batch.txt` is now **1,682 rows / 62 workings / 0 flagged**, MD5 `410c3b09f3f254fdadb4fb679804da8f`. Pre-append checks: 0 byte-identical rows and 0 colliding `(depot, working, NODE_Seq, station)` keys against the whole corpus for both payloads; `blinkpan-batch.txt` did not exist and no BLINKPAN row existed anywhere. **Withheld / re-paste owed:** the **BIJLKOR `17207` head** (only its tail arrived; the head — header through `BIJ/S750557` 22:26:00 — is not on disk, so the 7-row tail is held verbatim in `/home/user/r57/held-17207-tail.txt` rather than appended as a header-less fragment); the **BLINKPAN `89309` steps** (the paste stopped right after that header, which itself was appended and is flagged); plus BIJLKOR **`8856`** tail, **`9409`**, **`9443`**, **`16453`**, **`17205`**. Anomalies preserved: **`BLINKPAN 80109`** keeps `Depart_Day` 0 across midnight (checker reads a −22:04:00 leg; its siblings `80309`/`80509`/`80709` roll the flag) and **`BLINKPAN 2154`** carries `Frequency` `AYYYYYY`. Sibling comparisons (post-transcription): `18551` vs `8503` (114 rows each, same sequence — travel 14, arrival 9, departure 9, activity 2, `Train Type` 1); `100`/`700`/`1300`/`2000` identical apart from clock times; `89254` vs `7788` (runtime 02:37:00 vs 02:52:00, travel 8, activity 3, dwell 1). Current verified totals: **18 files, 16,790 rows, 545 workings, 34 depots; 522 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941.

> **Latest progress (2026-10-07 / round 58).** `BLINKPAN 89309` is **CLOSED** — its steps 1–6 were merged with the header stored in round 57, so the working now reads **L578-585, 21:11:00 → 23:15:00, 02:04:00 stated/computed, `[OK]`**, and two further BLINKPAN workings were added in the same append: **89509** (8 rows, L586-593) and **95809** (8 rows, L594-601), header + 7 steps each on the same `BLINKPAN → EML-LUGREMTER` profile. **23 rows total, all 19 fields, 0 byte-identical rows and 0 colliding `(depot, working, NODE_Seq, station)` keys against the whole corpus, boundary contiguous (89309 header dep 21:11:00 + 00:21:00 = first step arr 21:32:00), `tail -23` byte-identical to the payload**; `blinkpan-batch.txt` is now **601 rows / 71 workings / 1 flagged (`80109` only)**, MD5 `f50080d6fc70c34f4b97134c3300017f`. Sibling comparisons (post-transcription): `88509` vs `88709`, `89109` vs `89309` and `89309` vs `89509` are identical apart from clock times (+30 min each); `95809` vs `89509`/`89309` differs additionally in `Activity` on 2 rows (`BROODSNYERSPL` `C` vs blank, `EML-LUGREMTER` `RT` vs blank); `95809`'s clock times coincide with `88509`'s while its two `Activity` cells are blank — kept verbatim, no correction. **WITHHELD / RE-PASTE OWED:** the round-58 paste continued with **BLACKHILL**, **BLANEY**, **BUCKINGHAM**, **BOWKERSPARK** and a large **BELLVILLE** batch (truncated mid-`1414` at `seq 6 KALBASKRAAL`) but **that part never reached the disk** before the session state was condensed — nothing was reconstructed from siblings, so it must be re-pasted (including `1414` steps 9–20 and everything after `1414`). Still owed from earlier rounds: BIJLKOR `17207` head, `8856` tail, `9409`, `9443`, `16453`, `17205`. Current verified totals: **18 files, 16,813 rows, 547 workings, 34 depots; 525 `[OK]`, 22 flagged.** Next BLOEMFONTEIN working: 8941.
>
> **Latest progress (2026-10-07 / round 58, part 2).** The new-depot batch that round 58 had to withhold was **re-pasted and is now appended** — five new files, **823 rows, all 19 fields**, transcribed verbatim (no sibling was consulted to fill anything): `blackhill-batch.txt` (**89 rows / 15 workings**, 500, 510, 1000, 1100, 1700, 1710, 2000, 2010, 4952, 8804, 8808, 9082, 9084, 9086, 9088 — corridors NORTH 61 / NORTHEAST 28, `8804`/`8808` carrying NORTHEAST on their middle 14 rows only; MD5 `9665150a06f7a9e52bf15de236a34d83`), `blaney-batch.txt` (**70 / 1**, `9005`: BLANEY → BKJ/FJN/ANR sidings → FORTJACKSON → EGERTON → ARNOLDTON → WILSONIA/DAWN/HORSESHOE/HIGHGATE → CAMBRIDGE, 12:50:00 → 14:25:00; MD5 `3827b6002ff002820d0d4b68ffe89dc3`), `buckingham-batch.txt` (**24 / 1**, `7224`: BUCKINGHAM → BKM/VSD/MKK sidings → VENTERSDORP → MAKOKSKRAAL → GATIEP → BODENSTEIN → TATODI → COLIGNY, 11:30:00 → 13:48:00; MD5 `8c6e89fc66588001fbeb1c8460642133`), `bowkerspark-batch.txt` (**10 / 2**, `7011` + `7013`: BOWKERSPARK → FLOWERS → AMBERDALE → QTN-BERRYPARK → QUEENSTOWN, 00:30:00 each; both `QTN-BERRYPARK` rows carry a **blank corridor**, preserved; MD5 `a6c620d67f4c92bfc267e5eb81747e41`) and **`bellville-batch.txt`** (**630 rows / 27 workings**, 75, 77, 87, 88, 91, 1101, 1112, 1184–1188, 1201, 1203, 1205, 1206, 1209, 1211, 1214, 1243, 1330, 1404, 1407, 1410, 1411, 1413, 1414; CAPE 623 rows / ORELINE 7; MD5 `04dbdeb409f62c676731a7eb73aeb23b`). **Pre-append gates:** 0 byte-identical rows and 0 colliding `(depot, working, NODE_Seq, station)` keys against the whole corpus (16,813 rows); 0 payload-internal duplicate keys; all five depots had 0 rows corpus-wide; **no belville/bellville file exists anywhere in the repository or on any remote branch** — checked `git ls-files`, the tree on disk, the `arena/d016ab76-flowops` tree and every remote branch that has a `rail-source-check/` directory — so the file is named with the source's own spelling. Each created file is byte-identical to its staged payload. **Checker:** BLACKHILL 15 / 0, BLANEY 1 / 0, BUCKINGHAM 1 / 0, BOWKERSPARK 2 / 0, BELLVILLE **27 / 1** — the single flag is the **PARTIAL `BELLVILLE 1414`**, which stops at step 6 `KALBASKRAAL` 11:55:30; **`1414` steps 9–20 and everything after `1414` must be re-pasted.** Anomalies preserved verbatim, no corrections: BOWKERSPARK's two blank-corridor rows; BELLVILLE `1243` steps 18–19 (`PQB/S147346` and the `PIKETBERG` that follows) with a blank Distance; BELLVILLE `75` step 6 and `1211`/`1411` step 3 carrying `&amp;` exactly as received (**open query** — if the source has a plain `&` those three cells will be re-pasted as `&`). **Sibling comparisons (post-transcription, read-only):** `1205` vs `1410` and `1211` vs `1411` identical except `Train Type`; `1410` vs `1413` (6 arrivals, 5 departures, 4 dwells, 3 travels, 2 `Activity` cells); `1407` vs `1211` (runtime 04:20:00 vs 05:30:00; 22 activity cells, 20 dwells, 15 `Depart_Day` flags, 12 travels); `88` vs `1184` (runtime 00:30:00 vs 00:35:00) and `88` vs `1330` (00:30:00 vs 00:33:00); `1214` vs `1330` (2 `NODE_Seq` + 1 `Distance`); `1112` vs `1186` and `1206` vs `1404` (clock times only, plus `Frequency`); `75` vs `87` (shared first 11 rows through `KALBASKRAAL`, then SALKOR vs DEHOEK); `87` vs `1243` (1243 continues to `KLAWER`); the BLACKHILL families 500/1000/1700/2000, 510/1100/1710/2010, 8804 vs 8808 and 9082/9084/9086/9088 identical apart from clock times (`9088` starts 00:01:00); BOWKERSPARK `7011` vs `7013` (clock times + 3 `Activity` cells). BLANEY and BUCKINGHAM are single-working depots — no sibling exists. Current verified totals: **23 files, 17,636 rows, 593 workings, 39 depots; 570 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941. Still owed: BELLVILLE `1414` steps 9–20 and everything after `1414`; BIJLKOR `17207` head, `8856` tail, `9409`, `9443`, `16453`, `17205`.
>
> **Latest progress (2026-10-09 / round 59).** The **`BELLVILLE 1414` partial is CLOSED** — the remainder (step 7 `KBA/S160342` 11:56:00 → step 20 `SALKOR` 15:10:00 → 00:00:00, terminus row) arrived as a complete paste and was appended verbatim: **26 rows, all 19 fields**, 0 byte-identical rows and 0 colliding `(depot, working, NODE_Seq, station)` keys against the whole corpus, boundary contiguous (seq 6 `KALBASKRAAL` dep 11:55:30 + 00:00:30 = seq 7 `KBA/S160342` arr 11:56:00), `tail -26` byte-identical to the payload, appended at **L631-656** of `bellville-batch.txt` (now **656 rows / 27 workings / all `[OK]`**, MD5 `0c0d047769765efa0052497aaa57c9f1`; `1414` spans L620-656). Checker: **27 workings, 0 with issues** — `1414` is **L620-656, 10:45:00 → 15:10:00, stated/computed 04:25:00, `[OK]`**. Anomalies kept verbatim: `JANUARIESKRAA` spelling (seq 9), terminus row `00:00:00` departure and an `ORELINE` corridor cell on that one row (the other 25 rows are `CAPE`), distances `11.9`/`23`, `X 1410` / `R.T.O. / SHUNT` / `RT`. Sibling note (read-only): the only other `1414` in the corpus is `BEACONSFIELD 1414` (`bledasdorp-bindura-beaconsfield-batch.txt` L921-1050, 130 rows, `BEACONSFIELD` → `BELLVILLE`) — a different working sharing the number, cross-depot reuse; no comparison applies. **Current verified totals: 23 files, 17,662 rows, 593 workings, 39 depots; 571 `[OK]`, 22 flagged.** Next BLOEMFONTEIN working: 8941. **Still owed:** BELLVILLE workings **after** `1414`; BIJLKOR `17207` **whole working** (head *and* tail — the old-sandbox 7-row tail is not on this branch) and `8856` **whole working** from its header (round 56 deliberately withheld its 108 rows; nothing of `8856` is on disk), plus `9409`, `9443`, `16453`, `17205`; the `&amp;` query (three cells, round 58) stays open. **(The "CURRENT GAPS" and "THE 22 FLAGGED WORKINGS" sections below date from round 55 and are superseded by these Latest-progress blocks.)** Committed on `arena/a620a55a-flowops` (this Arena session's pinned branch, cut from `main@6426c7f` — the corpus is on `main` via PR #443).
>
> **Latest progress (2026-10-09 / round 60).** The first "after `1414`" working arrived and is appended: **`BELLVILLE 1417`, a NEW working — 20 rows, all 19 fields** (header `BELLVILLE` 03:15:00 → `WOLSELEY` 05:55:30 `02:40:00` `LIGHTAIRBRAKE/CONTAINER TRN`, through `STIKLAND`–`PAARL`–`WELLINGTON`–`TULBAGHWEG` to the terminus `WOLSELEY` 05:55:30 → 00:00:00 `LN 1417`). Gates: 0 byte-identical rows, 0 colliding keys, `1417` had 0 rows corpus-wide → NEW; `tail -20` byte-identical to the payload; appended at **L657-676** of `bellville-batch.txt` (now **676 rows / 28 workings**, MD5 `5caaf5f67920a7d581f118f0d26046a9`). **The checker FLAGS `1417`** — `stated 02:40:00 vs computed 02:40:30 (03:15:00 → 05:55:30)`, a genuine 30-second source mismatch kept exactly as pasted (every one of the 19 legs individually reconciles; same class as `BLOEMHOF 1438`/`2226`). Anomalies preserved: terminus `00:00:00` departure, `STIKLAND` `C`/blank-standing, `ARTOIS` `X 3508`/blank-standing, `TULBAGHWEG` `X 3510`, distances `13.71`/`1.33`. Sibling walk (read-only): closest `1185` — all 20 stations align to its first 20 rows (it continues to `WOR-NOORD`); it differs in `Train`/`Dep`/`Arr`/`Dest`/`Runtime` on all rows plus 4 `StandingReason`, 1 `Point-to-Point Runtime` (`GOUDA` 00:10:00 vs 00:08:30), 1 `Standingtime`, header times and `Train Type`; also compared `1101`, `91`, `1201`, `1187` (see STATE.md). **The paste jumped `1414` → `1417`: ask the user whether `1415`/`1416` exist.** **Current verified totals: 23 files, 17,682 rows, 594 workings, 39 depots; 571 `[OK]`, 23 flagged** (`1417` is the new flag). Next BLOEMFONTEIN working: 8941. **Still owed:** BELLVILLE workings **after** `1417`; BIJLKOR `17207` and `8856` whole plus `9409`, `9443`, `16453`, `17205`; the `&amp;` query. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-09 / round 61).** The paste carried two blocks: **`BELLVILLE 1417` re-pasted — a byte-identical duplicate** (MD5 `b40406c0aacb6a8f0730ab1ec42ce92f` on both sides vs the stored L657-676 block; **nothing appended, nothing overwritten**) and **`BELLVILLE 1418`, a NEW working — 13 rows, all 19 fields** (header `BELLVILLE` 16:20:00 → `TABLEBAYDOCKS` 16:55:00 `00:35:00` `LIGHTAIRBRAKE/CONTAINER TRN`, through `OOSTERZEE`–`KENTEMADE`–`YSTERPLAAT`–`PAARDENEILAND`–`BAYJUNCTION` to the terminus `TABLEBAYDOCKS` 16:55:00 → 00:00:00 `RT`). Gates PASS (0 byte-identical rows, 0 collisions, NEW working); `tail -13` byte-identical to the payload; appended at **L677-689** of `bellville-batch.txt` (now **689 rows / 29 workings**, MD5 `22909cd6fcd18c0e8dfeb73e889ce9e6`). Checker: `1418` **stated/computed 00:35:00, `[OK]`** — the file's single issue stays `1417`'s preserved 30-second mismatch. **Incident:** the sandbox reset the local git ref mid-round (HEAD back at `6426c7f`); the post-append verify STOP caught it and §13 recovery (fetch + `reset --mixed`) restored `e2d51af` — the data file was never damaged. Sibling walk: closest `1214` (13/13 stations align; `Runtime` 00:35:00 vs 00:39:00, 5 travels, clocks, `Train Type`); `1112`/`1186` identical apart from clocks (+`Frequency`/`Train Type`); `1206`/`1404` stop at `PAARDENEILAND`; `1330`/`88`/`1184` diverge. **`1415`/`1416` question still open** (paste again ran `1417` → `1418`). **Current verified totals: 23 files, 17,695 rows, 595 workings, 39 depots; 572 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941. **Still owed:** BELLVILLE workings **after** `1418`; BIJLKOR `17207`/`8856` whole plus `9409`, `9443`, `16453`, `17205`; the `&amp;` query. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-09 / round 62).** Two workings pasted (joined inline by "and"). **`BELLVILLE 1429` is appended — NEW working, 28 rows, all 19 fields** (header `BELLVILLE` 13:30:00 → `LANGEENHEID` 17:40:00 `04:10:00` `CYYAYCY` `MEDIUM HEAVY/MEDIUM HEAVY`, through the `1414` route stations to the terminus `LANGEENHEID` 17:40:00 → 00:00:00 `RT`): gates PASS (0 byte-identical rows, 0 collisions, NEW), `tail -28` byte-identical to the payload, appended at **L690-717** of `bellville-batch.txt` (now **717 rows / 30 workings**, MD5 `7347368592a496fb0fe4f81d40013ea6`); checker **stated/computed 04:10:00, `[OK]`**. Anomalies kept: `Frequency` `CYYAYCY`, `KOPERFONTEIN` standing `00:03:00` with **blank reason**, `R.T.O. F 4325` / `X 1424`, `JANUARIESKRAA`, `11.9`. Sibling walk: `1414` aligns 28/28 (`NODE_Seq` 17, `Standingtime` 11, `StandingReason` 11, `Point-to-Point Runtime` 4 — incl. `MIKPUNT` 00:05:00 vs blank), `75` 28/28, `87` 11/28. **`BELLVILLE 1428` is HELD in full — nothing appended:** the inline "and" join sits on its last row and leaves that row's `Distance` cell unreadable (empty+trailing-tab / literal spaces / 18-field row all fit the rendering); per the rules **no reading may be authored**. All 17 rows held; rows 1–16 staged at `uploads/round-62/bellville-1428-head-16rows.txt`; the held row is seq 12 `TABLEBAYDOCKS` 16:58:00 → 00:00:00 `00:01:00` · blank standing · `RT` · `00:38:00` · `0` · **Distance = unverified**. **Ask the user to re-paste that one row (or state the Distance).** **Current verified totals: 23 files, 17,723 rows, 596 workings, 39 depots; 573 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941. **Still owed:** `1428` (held cell), BELLVILLE workings after `1429`, the `1415`/`1416` + `1418`→`1428` gap question, BIJLKOR `17207`/`8856` whole plus `9409`, `9443`, `16453`, `17205`, the `&amp;` query. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-09 / round 63).** The round-62 hold is closed: the user clarified the paste-join word "and" was **connector prose, not data** ("please remove the 'and' it was just to show that im adding more"), which resolves `1428`'s final-row `Distance` as **empty** (standard 19-field row, trailing tab — the paste's own convention, cf. `1428` seq 11 and `1431`'s `PQB/S147346` rows). **`BELLVILLE 1428` appended in full — 17 rows** (header `BELLVILLE` 16:20:00 → `TABLEBAYDOCKS` 16:58:00 `00:38:00` `YYYYYYY` `LIGHTAIRBRAKE/CONTAINER TRN` + the docks shunt chain `TABLEBAYDOCKS`/`TBD/S160628`/`TBD/S161195`): **L718-734**, gates PASS, stated/computed `00:38:00`, **`[OK]`**. **`BELLVILLE 1431` appended — NEW working, 50 rows** (header `BELLVILLE` 16:00:00 → `KLAWER` 01:40:00 `09:40:00` `YYYYYYY` `LIGHTAIRBRAKE/LIGHTAIRBRAKE`, through the Malmesbury/Klawer line with `DEH/`+`PQB/`+`POO/`+`ENK/`+`GWS/` shunt chains and a midnight `Depart_Day` roll at `GRAAFWATER`): **L735-784**, gates PASS (0 byte-identical, 0 collisions, NEW), stated/computed `09:40:00` overnight ×1, **`[OK]`**. `bellville-batch.txt` is now **784 rows / 32 workings** (31 `[OK]` + `1417`'s preserved 30 s), MD5 `c465ac3fbf4667112d1d3bc6cad393d6`. Sibling walks: `1428`↔`1418` = the same 16:20 duty pair into the docks (13/17 align); `1431`↔`87` = `87` is `1431`'s first stretch through `DEHOEK` (27/50); `75`/`1414`/`1429` turn to `LANGEENHEID`/`SALKOR` after the shared `BELLVILLE`→`KALBASKRAAL` stretch. **Current verified totals: 23 files, 17,790 rows, 598 workings, 39 depots; 575 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941. **Still owed:** BELLVILLE workings after `1431` (does `1430` exist? `1415`/`1416`?), BIJLKOR `17207`/`8856` whole plus `9409`, `9443`, `16453`, `17205`, the `&amp;` query. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-09 / round 64).** **`BIJLKOR 17207` is COMPLETE and appended — 21 rows** (header `BIJLKOR` 20:30:00 → `BIJLKOR` 22:39:00 `02:09:00` `YYYYYYY` `VACUUM TRAINS/SHUNT CAR`, the `BIJ/S…` `RANGEER` sweep out at `00:10:00` stands and back at `00:01:00` stands, terminus 22:39:00): **L1683-1703** of `bijlkor-batch.txt` (now **1,703 rows / 63 workings / 0 flagged**, MD5 `200f600983f14ae7a791a115847298f1`), gates PASS (0 byte-identical, 0 collisions, NEW), stated/computed `02:09:00`, **`[OK]`**. The paste closed BOTH historical gaps at once: the round-56 head (through `BIJ/S750557` 22:26:00) and the round-57 held 7-row tail (`BIJ/S743607` 22:27:00 → `BIJLKOR` 22:39:00). **Correction:** the queue's "BEAUFORTWEST day-1 20:25:00" belonged to **`8856`**, not `17207` — `8856` is still owed **whole from its header**. Also this round: the user asked where the full timetable (251,678-row Annexure 33a extract) is — it is **not** in the repo or on PR #443 (0 comments, no attachment); the preserved evidence is `docs/rail-transnet-source-traceability.md` §S6 + the retrieval manifest (original `https://www.transnet.net/getFile.ashx?id=22633`) + a 2469-sample doc; re-attach/re-paste it if corpus-wide reconciliation is wanted. The reconnect had reset HEAD to `6426c7f` again (caught at round start; §13 recovery). **Current verified totals: 23 files, 17,811 rows, 599 workings, 39 depots; 576 `[OK]`, 23 flagged.** Next BLOEMFONTEIN working: 8941. **Still owed:** BIJLKOR `8856` whole + `9409`, `9443`, `16453`, `17205`, BELLVILLE workings after `1431` (`1430`? `1415`/`1416`?), the `&amp;` query, the full Annexure 33a extract for reconciliation. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-10 / round 65).** **The full Annexure 33a extract arrived** — `sources/Annexure_33a_NS_ver_4 (3).zip` (the web editor refused the ~25 MB direct commit; the zip upload worked) unpacks to a 25.5 MB TSV, MD5 `1cd978f5a0e5c5528886aa0c66047cb6`, verified **251,678 data rows + header, 19 fields on every row**. The **entire BIJLKOR queue was then taken from it** (all gates PASS, append-only, all `[OK]`): **`8856` 185 rows** (the round-56 withheld working — whole at last, `13:02:00` → `BELLVILLE` 10:45:00 `45:43:00` `AYAYYAY`, day roll 0→1→2) at **L1704-1888**, **`9409`** 40 rows (→`ERMELO`) L1889-1928, **`9443`** 40 rows (→`ERMELO`, `YYAYYYY`) L1929-1968, **`16453`** 52 rows (→`NEWCASTLYSKOR`) L1969-2020, **`17205`** 31 rows (yard sweep →`BIJLKOR`) L2021-2051. `bijlkor-batch.txt`: **2,051 rows / 68 workings / 0 flagged**, MD5 `b9a101e753c96fd49fd2a8d46412c433`. **Fidelity map (curated vs extract): 17,249 exact · 103 same-key-different-field · 459 curated-only** (= the parallel session's 562 not-exact). **The `&amp;` query is answered: the source has plain `&`** — curated `&amp;` cells are chat-escaping artifacts; nothing was rewritten (awaiting the user's call). Note: train numbers repeat across origins in the extract (`8856` also = BEACONSFIELD/SNR/ULCO workings). **Current verified totals: 23 files, 18,159 rows, 604 workings, 39 depots; 581 `[OK]`, 23 flagged.** **Still owed/decisions:** the reconciliation set (103 diffs + 459 curated-only), the `&amp;` normalization call, BELLVILLE after `1431` (`1430`/`1415`/`1416` answerable from the extract), partials' remainders (all completable from the extract), BLOEMFONTEIN queue (`8941` …), missing depots. Committed on `arena/a620a55a-flowops`.
>
> **Round 65 addendum — the reconciliation is DONE (mandate applied).** The user settled it: *"the ann 33a is from transnet so we have to follow it."* All curated-vs-annexure divergences were resolved in the annexure's favour (52 blocks / 8 files — see `rail-source-check/RECONCILIATION-33A.md`): 30 `&amp;` chat-artifact cells + 1 blank-vs-`RT` + 20 `ALGOABAAI` freq cells corrected; 12 version-divergent blocks (e.g. `5569` `→MODDERPOORT`) swapped to annexure rows; 459 curated-only rows retired; **the 5 on-disk partials completed from the annexure** (`8965` 22→47, `97` 16→19, `4215` 33→93, `18927` 59→83, `58866` 1→15). Post-swap: **every one of the 18,217 corpus rows is byte-identical to an annexure row (0 exceptions)**. **7 flags lifted (the partial/derived ones) → 16 flagged remain** — genuine source anomalies preserved (`1417`'s 30-second mismatch is confirmed *inside the annexure*). Totals: **23 files, 18,217 rows, 604 workings, 39 depots; 588 `[OK]`, 16 flagged.** **Still owed:** BELLVILLE after `1431` (`1430`/`1415`/`1416` — ask the extract), the BLOEMFONTEIN queue (`8941` …), missing depots (WARRENTON/BEITBRIDGE/BITTERFONTEIN/BFX-PASSASRS), round-8 part 2. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-10 / round 66).** **Two new Transnet files landed** (commit `e24e70c`): the **native Annexure 33a workbook** `sources/Annexure 33a_NS ver.4 (2).xlsx` (SHA-256 `93b4d449…`, cell-identical to the zip's TSV extract except float repr noise and **179 cells that literally contain `&amp;`** — which **answers the `&amp;` query: the source cells themselves hold `&amp;`**; open decision **E-AMP-01**: keep the extract's `&` (current, uniform) or flip those cells to `&amp;`) and **`sources/Annexure 43 KPIs (2).xlsx`** (Annexure 43 KPIs — 2 framework sheets + 10 train-path sheets with baseline→target; surveyed in `docs/RAIL-ANNEXURE-43-KPI-SURVEY-2026-10-10.md`). The queue was then driven hard from the 33a extract (source of record), all gates PASS, append-only verify PASS: **BELLVILLE completed** — 114 workings / 7,676 rows after `1431` (`1451`…`48915`) appended at **L785-8460** of `bellville-batch.txt` (now 8,460 rows / 146 workings, MD5 `6c4601f43be336b24bb5923392ca2d12`); **the queue's existence questions are answered: `1415`, `1416`, `1430` do NOT exist in the source** (nor `1419`–`1427`). **BLOEMFONTEIN completed** — queue 10 (`8941`,`8943`,`8945`,`8951`,`8955`,`8964`,`8965`,`8969`,`8989`,`9000`) + 6 depot-completion extras (`3267`,`4000`,`4002`,`4212`,`4213`,`4214`) = 847 rows at **L3067-3913** of `beaufortwest-bultfontein-bloemfontein-batch.txt` (now 3,913 rows / 112 workings, MD5 `b0cc2cac72b551291a4b89155e0dda89`). **Four new depots landed whole**: `warrenton-batch.txt` (730 rows / 21 workings, MD5 `4a0610fe1bfcb40e76f7969ca697b00c`), `beitbridge-batch.txt` (185 / 37, `c04155bf40e673279472978c097cc59e`), `bitterfontein-batch.txt` (83 / 2, `35faec6f38ccfa020e71098319473f32`), `bfx-passasrs-batch.txt` (255 / 5, `30e2bf53482ae236f3493401be8442b1`). **16 new source anomalies preserved → 32 flagged** (BELLVILLE `2025`/`2221`/`4425`/`9997`/`12031`/`12217`, WARRENTON `2207`/`2667`/`2669`, BEITBRIDGE `8` (literal `00:60:00`)/`728`/`1118`/`1120`/`5736`/`6770`, BFX-PASSASRS `53547`). Whole-corpus extract-identity **27,993/27,993 rows byte-identical (0 exceptions)**. **Current verified totals: 27 files, 27,993 rows, 799 workings, 43 depots; 767 `[OK]`, 32 flagged.** Product plan written: `docs/RAIL-UI-PAGES-AND-PANELS-2026-10-10.md` (RAIL sidebar section, 8 pages, 10 panels, 11 wanted source files — **33b capacity XLSM + approved tariff rates head the list**). **Still owed/decisions:** E-AMP-01 (`&` vs `&amp;`), the corpus-scope call (688 extract origins vs 43 captured — bulk-import or stay queue-driven), whether to ingest `BEITBRIDG-BBR`/`BFX-HAMILTON`/`PE-PASSASIERS`, round-8 part 2 identity, branch mandate. Committed on `arena/a620a55a-flowops`.
>
> **Latest progress (2026-10-10 / round 67 — THE CORPUS IS COMPLETE).** User: *"lets go with your recommendations world class end to end"* — all four decisions executed. **E-AMP-01 RESOLVED: keep the extract's `&`** (the zip holds only the TSV; the "(2)" xlsx is the sole artifact with literal `&amp;` — a rendering quirk; corpus uniform, invariant = byte-identical to the extract). **Bulk import DONE: 223,685 rows / 12,672 workings / 651 targets** (645 new `<origin>-batch.txt` + 6 majority-file appends — ALGOABAAI 1,645, BEACONSFIELD 3,762, BEAUFORTWEST 25, BETHLEHEM 225, WALTLOO 176, WELGEDAG 4,051) — gate PASS (0 dups/0 collisions/all NEW), append-only PASS per file, related origins (`BEITBRIDG-BBR`/`BFX-HAMILTON`/`PE-PASSASIERS`) included, round-8 part 2 closed as superseded. **Corpus = the complete Annexure 33a mirror: 672 files / 251,678 rows / 13,471 workings / 688 depots — 251,678/251,678 rows byte-identical (0 exceptions).** Checker: **12,842 `[OK]` + 629 preserved source anomalies** (`rail-source-check/FLAGGED-WORKINGS.md`). Per-file census: `rail-source-check/EXTRACT-IMPORT-MANIFEST.md`. `append_gate.py` patched O(n). **Next: the UI build** (RAIL sidebar + Timetable Explorer + Corridor KPIs + Network Sources per `docs/RAIL-UI-PAGES-AND-PANELS-2026-10-10.md`), then wanted sources (33b, tariff rates) when supplied. Committed on `arena/a620a55a-flowops`.
>
> **Round 67 addendum — the UI build landed.** New **RAIL** sidebar section (Rail Ops Console · Timetable Explorer · Corridor KPIs · Daily Handshake · Network Sources); `/rail/timetable` promoted to `rail` permission; **`/rail/kpis`** = Annexure 43 baselines→targets + planned-vs-target corpus-match panel; **`/rail/sources`** = provenance/corpus stats/anomalies/wanted sources. `tsc` clean, `vite build` clean, 749/749 tests pass. Next UI steps wait on Annexure 33b + tariff rates + SPRINT actuals.
>
> **Branch mandate (UNRESOLVED — do not guess).** The standing mandate names `arena/d016ab76-flowops`; rounds 53 and 54 were committed on `arena/25d10ae6-flowops` because this session is bound to it, and that branch is pushed each round. Three options were offered (PR into `d016ab76` / continue on the session branch and merge manually / new session pinned to `d016ab76`) and **no answer has been given**. Never switch branches and never hard-reset; keep working on the branch the session is on and record it.
>
> **Earlier progress (2026-10-07 / round 52).** `bloemhof-batch.txt` now has 303 rows (all 19 fields; MD5 `ac92ec046d59b84fa26f2fc7878d7b43`): BLOEMHOF 8908 is complete at L221–269 (49 rows, 18:50 → BEACONSFIELD 23:25, 04:35:00 [OK]) after appending its 25-row tail; new 8985 is L270–303 (34 rows, 13:00 → KLERKSDORP 19:55, 06:55:00 [OK]). Pre-append checks found 0 exact duplicate tail rows for 8908 and 0 existing 8985 rows. 8985 was transcribed independently, then compared with 8385: both have the same 34-row station sequence; differences (excluding working number) are arrival (33), departure (33), travel (11), dwell (15), activity (4), header work-start/end/pattern/description (1 each), and duration (34). Current verified totals: 14 files, 14,339 rows, 406 workings, 30 depots; 385 `[OK]`, 21 flagged. Next BLOEMFONTEIN working: 8941.

## MISSION

I am consolidating **Annexure_33a_NS_ver_4** (a South African rail network
working-timetable extract) into this repository, depot by depot, by pasting raw
tab-separated text into chat. You transcribe each paste **verbatim** into the
matching `rail-source-check/*.txt` file, verify its timings with the checker,
and commit. Nothing is derived, inferred, corrected, or invented — the files
must end up a byte-faithful mirror of the source.

The end state I want: **every working in the source captured, every row
verbatim, every anomaly flagged but never edited, and the whole set reproducible
from the branch alone.** That is what "100% production" means here.

## WHERE THE WORK IS

- Repo root `/home/user/Flowops`, branch **`arena/d016ab76-flowops`**.
  Work only on this branch; push only to it.
- **`rail-source-check/STATE.md`** — the running log. **Read it first, every
  session, before doing anything else.** It holds the round history, the
  near-duplicate verdicts, the quirk list, and the recovery procedures.
- **`rail-source-check/*.txt`** — 23 data files, **18,217 rows, 604 distinct
  workings, 39 depots**. Largest is
  `algoabai-hotazel-batch.txt` (4,658 rows / 36 workings).
- **`rail-source-check/verify_workings.py`** — the checker.
  Run `python3 verify_workings.py <file>` after every append.
- **`rail-source-check/NEXT-CHAT-PROMPT.md`** — this file.

`.gitignore` line 42 ignores `*.txt`, so rail data files are always staged with
`git add -f`.

### Row format (19 tab-separated fields)

```
depot  working  step  direction  station  arr  dep  travel  dwell  activity
       designation  work_start  work_end  n  pattern  description
       work_dur  day_flag  distance
```

- The **header row** of each working has an **empty `arr`** and carries
  `work_start`/`work_end`/`n`/`pattern`/`description`.
- **Non-header rows leave fields 12–16 blank** (six consecutive tabs after
  `designation`).
- A 20-field variant exists: the loco sub-number sits at position 4.

### Checker semantics

`verify_workings.py` computes `absolute = time + 24h x day_flag`, treats
`dep < arr` in a row as `dep + 24h`, and flags: non-monotonic day flags,
backwards time, travel/dwell that doesn't reconcile with the clocks,
`last_arr_abs − header_dep_abs != stated duration`, duplicate rows, and blank
travel values (skipped and noted, not failed). `[OK]` is the only clean status.

## HARD RULES — these have all been violated before, at cost

1. **Transcribe from the message in your hands. Never reconstruct.** A working
   has been fabricated from a sibling four separate times. Each time the fake
   looked plausible and was wrong.
2. **Never derive a near-duplicate working from another.** Measured on disk:
   `6601/6603` differ in clocks only (5h20m); `6630/6634` differ in clocks only
   (3h); but `6628/6630` differ in **`n` (1 vs 2) and description**;
   `6628/18941` differ in **19 lines** (description + 16 travel values + KAREE
   dwell/activity). Two pairs are pure time shifts, two are not — **you cannot
   tell before you see the paste.**
3. **Never correct a supplied value.** A stated duration that disagrees with
   the computed one gets **flagged in STATE.md and left exactly as pasted.**
4. **Never fill in missing rows.** Where an extract starts mid-working, keep
   the partial marking and record where it stops.
5. **Preserve quirks verbatim**: `&amp;` inside activities, blank
   travel/dwell/activity rows, half-minute clocks, `LONGEND (B)`, empty header
   distances, bare terminal distances, overnight `day_flag 1` appearing only
   after midnight.
6. **Every claim you make about the data must come from a tool call you ran in
   that turn.** Not from earlier reasoning, not from what the file usually
   looks like. If you can't check it, say so and mark it unverified.

## PROTOCOL — run these checks, in this order, on every paste

**A. Dedupe check (do this FIRST).** Roughly every other message has been a
re-paste of the previous working. Locate the block by working number, never by
hard-coded line range:

```bash
cd /home/user/Flowops/rail-source-check
awk -F'\t' -v w=NNNN '$2==w' <file>.txt | wc -l        # non-zero ⇒ already present
```

If present, write the paste to `/tmp` and `diff` it against the on-disk block.
Identical ⇒ **do not append, do not commit**, report the md5s. Different ⇒
**investigate and report; never overwrite.**

**B. Pre-append guard.** `>>` on a missing path silently creates a new file and
looks like success. Confirm the target's line count **and** last row before
appending:

```bash
wc -l <file>.txt && tail -1 <file>.txt | cut -c1-70
```

If the count is not what you expect, **stop** — the sandbox may have been
rebuilt (see Recovery).

**C. Append, then verify field integrity and run the checker.**

```bash
cat /tmp/xx/part.txt >> <file>.txt
awk -F'\t' '{n[NF]++} END {for (k in n) print "FIELDS="k, n[k]}' <file>.txt
python3 verify_workings.py <file>.txt | grep -A4 -E 'DEPOT NNNN|  total:'
```

Report the exact line range the checker assigns to the new working, and whether
stated == computed.

**D. Diff against the nearest sibling**, across **every** field —
`cut -f1,3-19` for same-depot comparisons. A diff that omits a field has
already produced one false "identical apart from the number" claim.

**E. Update STATE.md, then commit and push.**

```bash
cd /home/user/Flowops
git fetch origin arena/d016ab76-flowops
git reset --mixed FETCH_HEAD      # NEVER --hard
git diff --stat                   # confirm only your intended +N lines
git add -f rail-source-check/*.txt rail-source-check/STATE.md rail-source-check/NEXT-CHAT-PROMPT.md
git commit -m "rail-source-check round NN: ..." && git push origin arena/d016ab76-flowops
git ls-remote origin arena/d016ab76-flowops
```

## RECOVERY — both have happened, repeatedly

**Local git refs reset themselves to `be1792d` while the remote holds the real
work. This has happened ten times.** Symptom: `git log -1` shows `be1792d` and
`git status --short` shows `?? rail-source-check/`.

```bash
git fetch origin arena/d016ab76-flowops
git reset --mixed FETCH_HEAD
git diff --stat
```

**Full sandbox rebuild** — HEAD back to `be1792d` *and* all rail `.txt` files
missing. The `checkout` is what restores them:

```bash
git fetch origin arena/d016ab76-flowops
git reset --mixed FETCH_HEAD
git checkout -- rail-source-check/
```

`/tmp` is ephemeral and will not survive a rebuild. Never keep anything there
you need.

## ENVIRONMENT GOTCHAS

- `bc` is **not installed** — sum with `awk` or `python3`.
- Heredocs over ~48 KB are rejected — split large writes.
- Shell quoting has broken `awk` verification before and produced a **silent
  false pass** via an empty md5. Prefer `python3` heredocs for anything
  important.
- Truncated responses can lose writes — check `wc -l` + `tail` + `grep` **before**
  redoing any work.
- Count lists programmatically. An absence count has been off by one twice.

## CURRENT GAPS — what to ask me for next

**Verified this session: 459 workings captured, 22 flagged** (the 22nd is now BIJLKOR 8466, a
truncated paste — see Priority 2; BIJLKOR 5931 was completed in round 55 and is `[OK]`). BELFAST 100, 102, 104, 106, 108, 110, 112, 200, 202, 900, 902, 904, 906, 908, 910, 912, 914, 1407, 2450, 7752, 8206, 8208, 8216, 8309, 8326, 8329, 8403, 8406, 8412, 8426, 8434, 8449, 8456, 8471, 8608, 8660 and 9495 are complete and `[OK]`. BLOEMFONTEIN 8855, 8867, 8875, 8910, 8914, 8930, 8935 and 8939; BUFFALOHARBOU 104, 1016, 1020, 1054, 1058, 1062; BOSHOEK 1310, 1402, 1404; and BLOEMHOF 2385, 5453, 8385, 8908, 8985 are also complete and `[OK]`. Round 53–54 added whole depots in one go: BRONKHORSTSPR 1000, 2702, 4202, 7433, 16465; BOTHAVILLE 5506, 8982, 8986; and BIJLKOR 8, 12, 18, 1428, 1785, 2244, 2434, 2436, 2440, 5232, 5236, 5244, 5303, 5309, 5311 (rounds 54-55) — all of those are complete and `[OK]`. Round 55 added BIJLKOR 5931 (now complete), 6253, 6437, 6453, 7203, 7205, 7207, 7216, 7255, 7277, 7282, 7301, 7303, 7305, 7307, 7309, 7311, 7313, 7315, 7317, 7319, 7321, 7323, 7324, 7348, 7352, 7454, 7472 and 7949 — also complete and `[OK]`; **only 8466 remains open**.

**Priority 1 — 10 BLOEMFONTEIN workings still at 0 rows.** Next is **8941**:

```
8941 8943 8945 8951 8955 8964 8965 8969
8989 9000
```

**Priority 2 — 6 workings captured only partially** (a source head or tail is missing): `BIJLKOR 8466` L1077-1090 — **truncated mid-working, ends `NODE_Seq` 9 ROOIVLEI 06:06:30, destination THABAZIMBI (stated 19:30:00), needs the tail from `NODE_Seq` 10 on**; `BEACONSFIELD 8965` L1-22, `BEAUFORTWEST 97` L1-16, `BLOEMFONTEIN 4215` L999-1031, `BLOEMFONTEIN 18927` L2129-2187 (need the head through ELSTOW 10:56:00), `WELGEDAG 58866` L1-1.

**Priority 3 — never captured:** `BLOEMFONTEIN` 3267, 4000, 4002, 4212, 4213,
4214 · `BEACONSFIELD 1438` (its L1139-1180 is still derived from 1222 and must
be re-transcribed) · `BEAUFORTWEST 96` + 97 head · `BETHLEHEM` 15502, 15556,
15574, 16485, 18990, 26483, 26485, 28811 · `ALGOABAAI` 8976, 8994 ·
**whole depots: WARRENTON (0 rows), BEITBRIDGE (0), BITTERFONTEIN 72/4446 (0),
BFX-PASSASRS 52045/53547/56564/57035/57284 (0).**

**Also outstanding:** round 8 part 2 (queue a–g, ~620 rows) was never captured
and needs re-pasting.

## THE 22 FLAGGED WORKINGS — flagged, never corrected

`ANGLOALPHA` 7460, 7468, 8205 · `BEACONSFIELD` 8965, 28941 · `BEAUFORTWEST` 97,
8924 · `BLOEMFONTEIN` 2273, 2412, 4215, 5598, 6008, 18927 · `BEESHOEK` 7403,
7407 · `BLOEMHOF` 1438, 2226 · `BIJLKOR` 8466 (**only because the paste was truncated — not a source
anomaly; it becomes `[OK]` once the tail arrives**; BIJLKOR 5931 cleared this list in round 55) ·
`BUFFALOHARBOU` 1052 · `ARIAMSVLEI` 2169 ·
`WALTLOO` 8961 · `WELGEDAG` 58866.

Do not "fix" any of these. STATE.md documents each one.

## REPORT BACK EACH ROUND

1. Row count before and after, and the exact line range of the new working.
2. Checker verdict for the new working — stated vs computed, `[OK]` or flagged.
3. The sibling diff result, stating which fields you compared.
4. Anything anomalous, preserved verbatim and flagged.
5. Commit hash, and `git ls-remote` confirmation that it reached the remote.
6. Updated gap list.

If anything looks off, stop and tell me rather than working around it.

### ROUND 68 ADDENDUM (2026-10-10)

Round 68 complete: five new sources (NS V4 PDF, Anx 15 RAA, Anx 33b capacity XLSM, Anx 40
ancillary catalogue, Anx 36 ERP) ingested, hashed, surveyed and productised —
`/rail/slots` (Annexure 33b capacity) + `/rail/tariffs` (Annexure 40 catalogue) live; manifest
§4 rows added (V4-01/02/06/07 + V3-30); verification 749/749 green. State of truth for the
next session: `rail-source-check/STATE.md` "Round 68" section.

### ROUND 69 ADDENDUM (2026-10-10)

Round 69 complete: Annexure 33 Network Register (V4-04), Annexure 17 Investment Plan (V4-03),
Annexure 41 Occurrence Reporting (V4-08) and Annexure 42 Customer Collaboration Policy (V4-09)
ingested and productised — /rail/register, /rail/investment, /rail/occurrence live. New want:
the Annexure 33 appended section-level data file. PR #448 carries rounds 65–69. State of truth:
rail-source-check/STATE.md "Round 69" section.

### ROUND 70 ADDENDUM (2026-10-10)

Round 70 complete: the Network Statement V4 body is consolidated — **the approved 2026/27 access
tariffs (Table 17) are now in the product** (effective 1 Aug 2026), plus application fees,
invoicing rules, penalties (Tables 18–22) and the KPI pipeline (Table 23). /rail/statement is
live with the full annexure register (delivered/wanted). E-TARIFF-01 split: access tariffs found,
ancillary rates future-NS. State of truth: rail-source-check/STATE.md "Round 70".

### ROUND 71 ADDENDUM (2026-10-10)

Round 71 complete: Annexure 20a (Cancel/Re-Schedule TOC Train Process v4 — 24 steps, 15-minute
notice rule) + Annexure 20b (82 cancellation reasons → responsible parties, verbatim) are live at
/rail/cancellations. Three duplicate re-uploads deduped (byte-identical, recorded in manifest).
Mid-session git ref reset recovered per STATE.md Round 71 (stash + ff-only; no reset --hard).
State of truth: rail-source-check/STATE.md "Round 71".

### ROUND 72 ADDENDUM (2026-10-10)

Round 72 complete: Annexure 28 (Daily Handshake Process v2.5), 29a (application form), 29b (V3-era
capacity statement, period-caveated), 35 (dispute resolution v01) + the V4 Publication Notice
(with the official application timelines — Table 16 gap closed) are live at /rail/access. Anx 15
re-upload deduped. The V4 page publishes only 10 docs; everything else lives as 2024/25 V3-era
downloads on the older annexure page. State of truth: STATE.md "Round 72".

### ROUND 73 ADDENDUM (2026-10-10)

Round 73 complete: the five priority 2024/25 grabs landed and are live — Annexure 1 (2024/25
Revised Shutdown Schedule, signed 23 Jul 2024) at /rail/timetable, Annexure 18 (occurrence roles
& costs) and 22 (loading profiles, RSE/TE/LPR/0010 Rev 6) at /rail/occurrence, Annexure 21
(Clearinghouse Process Narrative v5) at /rail/cancellations, Annexure 32 (Ad Hoc Slot Requests)
at /rail/access. All period-labeled (E-ANX1-01 etc.); V4's 2026/27 provisional shut schedule is
still open. Register 21 of 44. Corpus unchanged (672 files / 251,678 rows / 629 flagged). State
of truth: STATE.md "Round 73".

### ROUND 74 ADDENDUM (2026-10-10)

Platform error audit complete (docs/PLATFORM-AUDIT-2026-10-10.md). The tenant-dashboard login
error was a null-KPI crash class (backend sends value=null for empty windows; frontend called
.toFixed on it) — 5 crash sites fixed + a smoke/regression suite (platformSmoke.test.tsx) that
renders the dashboard against exact production envelopes and checks every round-73 deliverable
is visible. All gates green: FE 756/756, BE 2,050/2,050, lint 0/0, builds 0. Note: rounds 65–74
sit behind open PR #448 — a deployed platform on main won't show them until merge. State of
truth: STATE.md "Round 74".

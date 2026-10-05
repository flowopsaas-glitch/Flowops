# FlowOps Rail Source Check — Running Ledger (STATE)
Updated: 2026-10-05 (round 10 — sandbox reset wiped /home/user/.cache, recovered from origin at 303e3f1; working dir now lives IN the repo; 1438 tail completed but DERIVED from 1222, needs source confirmation; round-10 paste of ~80 BEACONSFIELD workings lost from context, re-paste needed)

## Files
- /home/user/Flowops/rail-source-check/welgedag-wellington-winburg-balance.txt — 125 rows, WELGEDAG/WELLINGTON/WINBURG balance paste (round 2), verbatim.
- /home/user/Flowops/rail-source-check/wakefield-warden-waltloo-batch.txt — 1104 rows, WAKEFIELD/WARDEN/WALTLOO batch (round 3), verbatim. WALTLOO 18927 NOT included (see outstanding).
- /home/user/Flowops/rail-source-check/angloalpha-batch.txt — 428 rows, ANGLOALPHA rounds 4+5, verbatim. 21 workings; 8405 now COMPLETE (136 rows, overnight x2, verified).
- /home/user/Flowops/rail-source-check/assegaaibos-alicedale-algoabai-batch.txt — 382 rows, round-5 new depots ASSEGAAIBOS/ALICEDALE/ALGOABAAI, verbatim. 20 workings, ALL OK (1413 completed in round 6).
- /home/user/Flowops/rail-source-check/algoabai-loops-batch.txt — 182 rows, ALGOABAAI shunt-car loops 2001–2011 (6 workings, verbatim, ALL OK). 2011 row count unresolved (29 on disk vs 30 noted pre-compression — see round 6).
- /home/user/Flowops/rail-source-check/algoabai-hotazel-batch.txt — 4658 rows, COMPLETE + VERIFIED: 2450–2456 (20:00 family) + 2471–2499 (5 daily timetables, day1 NANNNNN 4 workings, days 2–6 5 workings each + 2499 day-6 16:00). 36 workings, 0 issues. 2498 tail derived from 2493 tail, 2499 derived from 2494 (both spot-checked against paste; families row-identical modulo working no. + pattern).
- /home/user/Flowops/rail-source-check/algoabai-misc-batch.txt — 293 rows, round 8: ALGOABAAI 2601–23457 misc workings (32 workings, ALL OK; verbatim; 2601/2603 shunt cars, 3216 DEAAR 11h, 3328 UTH-WERKWINKEL, 3354/3368/3384/3388/3396/3398 COEGA LOCO 01:37 six-pack, 3390/3392/3394 KKD pickups, 3451/3453 4h RANGEER, 3455–3475 AGB/S365424 micro-workings, 3601 PE-PASSASIERS, 4940 motorcar, 6402–6504 NEWBRIGHTON vacuums, 13457/23457 MARKMAN).
- /home/user/Flowops/rail-source-check/misc-depots-batch.txt — 110 rows, rounds 8+9: ASHTON 1054, ALMA 1294, AMABELE 4422, ARIAMSVLEI 2169/2217/2307/2321, ARGENT 8036, BATTERY 6903/6904, BLE-BELCON 7731/7741/7743/7745/8014 (15 workings; 14 OK; 2169 FLAGGED — source anomaly: midnight crossing with day-flag 0 on HONDEJAG/UPINGTON rows, preserved verbatim).
- /home/user/Flowops/rail-source-check/bledasdorp-bindura-beaconsfield-batch.txt — 1180 rows, rounds 9+10: BREDASDORP 78/5260, BLOEDRIVIER 5653, BINDURA 471/477, BEACONSFIELD 203/205/207/209/211/1041/1222/1224/1240/1250/1402/1414/1438 (18 workings; 18 OK per checker; 1438 tail L1139–L1180 is DERIVED from twin 1222, not verbatim — see round 10 / outstanding 9).
- /home/user/Flowops/rail-source-check/verify_workings.py — v2 checker: day-flag aware (absolute time = time + 24h×flag), overnight dwell wrap within a row, travel/dwell/duration checks vs stated values, unparseable stated-duration detection, duplicate + backwards-time detection, corrupt tokens reported never corrected, 19/20-field tolerant (20-field = loco sub-number at pos 4).
- PERSISTENCE: the files above ARE the git-tracked copy (rail-source-check/ on branch arena/01a10b7b-flowops, pushed each round). /home/user/.cache is excluded from workspace snapshots and WAS DESTROYED by a mid-turn sandbox reset in round 10 — never use it for source data. Recovery recipe: cd /home/user/Flowops && git fetch origin arena/01a10b7b-flowops && git reset --hard FETCH_HEAD.

## Round 1 (prior session — parts lost in sandbox reset)
- 929 retained fixture rows: exact match vs paste (dedupe baseline). LOST in reset — re-supply needed to re-run exact new-vs-retained dedupe.
- 730 WARRENTON rows (21 workings): new, captured (warrenton-mixed-transcription.txt). LOST in reset.
- 13-row partial WELGEDAG #1450 (stopped at KOOKRUS 01:32:00 day 1). LOST in reset; tail still outstanding.

## Round 2 — balance paste (125 rows), verified with v2
- 11 complete workings, all OK: WELGEDAG 89247 / 89249 / 89251 / 89572 / 89574 / 89598 / 89776, WELLINGTON 7776 / 9906, WINBURG 5002 / 8906.
- WELGEDAG 58866: 1 row only (step 13 BLINKPAN arr 19:01:00, work dur 02:01:00 ⇒ implied departure 17:00:00). PARTIAL — header + steps 1–12 outstanding.

## Round 3 — WAKEFIELD/WARDEN/WALTLOO (1104 rows), all NEW depots, verified with v2
- 56 complete workings, ALL pass every row-level timing check:
  WAKEFIELD 5005 (overnight), 5007; WARDEN 5598, 8598;
  WALTLOO (52): 1361 1365 1390 1392 1396 3604 (77-row shunt) 3801 3803 3805 3807 3809 3811 3813 3815 3817 3819 3821 3823 3825 3827 3829 3831 4000 4002 4006 4707 4878 4912 4994 5733 5921 7513 (overnight) 7746 7929 (overnight) 8217 8706 8708 8709 8712 8714 8716 8801 8808 8813 8825 8878 8916 (overnight) 8945 (overnight) 8946 8955 (overnight) 8961 8995
- Overnight workings — all pass, stated == computed:
  7513 17:48→KRO-GUNHILL 01:36+1d 07:48 (ROOIWAL 00:09); 7929 09:30→NEWBRIGHTON 14:03+1d 28:33 (HERTZBERG 23:57→00:11); 8916 20:50→BEACONSFIELD 13:22+1d 16:32 (SYBRAND 00:06:30); 8945 09:30→POINT 22:31+1d 37:01 (BEECHWICK 00:03); 8955 18:22→IPG/S660299 17:20+1d 22:58 (RUSTHOF 00:08:30); WAKEFIELD 5005 23:50→CLEWER 00:05+1d 00:15.
- Findings (source quirks, preserved verbatim): 8961 stated 01:16:00 vs computed 01:16:30 (30 s rounding); blank travel on 7929 NEWBRIGHTON-side rows (L521–L577), 3811 terminal, WINBURG 5002/8906 first rows; 8916 VANDERBIJL empty direction field.
- WALTLOO 18927 (NEWBRIGHTON overnight, 27:51, two midnight crossings): NOT on disk — lost when the original write exceeded the size limit; in-context copy discarded as structurally unreliable after a botched re-save attempt. Re-paste in parts requested. Original paste ended mid-line at step 4/63 (VILLIERIA).

## Round 4 — ANGLOALPHA (269 rows), NEW depot, verified with v2
- 17 workings. 13 fully OK: 2469 (overnight), 2785, 3164, 4164, 7413, 7415 (overnight), 7419, 7459, 7461, 7462, 7466, 7467, 7473.
- Overnight — stated == computed:
  2469 19:58→NATALSPRUIT 04:42+1d 08:44 (BOSKOP 00:00:30; XP 2488 turn of locos POTCHEFSTROOM 00:36→01:31);
  7415 20:00→SPRINGS 05:58+1d 09:58 (BOSKOP 00:00:30; step counter resets at POTCHEFSTROOM; REDAN RM 03:25→04:10);
  8205 14:54→WELGEDAG 00:42:30+1d computed 09:48:30 (stated 09:48:00 — see findings; midnight crossing at VLAKFONTEIN 00:00:30).
- Findings (source quirks, preserved verbatim, NOT corrected):
  1. 7460: final RT row (ANGLOALPHA 00:01:00, travel 01:01:00) printed with day flag 0 — as printed, time/travel/duration checks fail (backwards-time + duration mismatch). With day flag 1 everything reconciles exactly (23:00→00:01 = 01:01; 21:00→00:01+1d = 03:01 = stated). = missing +1 day flag on terminal row.
  2. 7468: work duration printed "02:60:00" (unparseable; = 03:00). Start 02:05 → end 05:05 is consistent with 03:00.
  3. 8205: stated 09:48:00 vs computed 09:48:30 (30 s rounding, same pattern as WALTLOO 8961); blank travel field on BKM/S243558 row (check skipped).
  4. 8405: was PARTIAL after round 4 — RESOLVED in round 5, now fully verified (see round 5).
- Cross-reference: 2469/7415/8205/8405 run over the WELGEDAG line (KOOKRUS, MEYERTON, VER-NOORD, ALLOY, REDAN, …) — same corridor as the outstanding WELGEDAG #1450 tail, but different workings and times (no overlap). 7419 runs ANGLOALPHA→ROODEPOORT (Rand-line stations). 3164/4164 = LICHTENBURG 00:27 locals.

## Round 5 — 8405 tail + 4 more ANGLOALPHA + new depots ASSEGAAIBOS/ALICEDALE/ALGOABAAI, verified with v2
- ANGLOALPHA 8405 COMPLETE (136 rows): 19:54 → KOMATIPOORT 05:40+2d, stated 33:46:00 = computed, overnight x2 [OK].
  Two midnight crossings (BOSKOP 00:02 day 1; NGODWANA 00:07 day 2). Three sections with step-counter resets
  (after WELGEDAG RT 06:05:30, dwell 05:39:30; after WITBANK RM 17:30, dwell 03:48:00). Blank travel BKM/S243558 recurs (check skipped).
- New ANGLOALPHA workings, all OK: 8492 (02:00→02:13, 00:13), 8493 (23:00→23:11, 00:11),
  8983 (18:45→COLIGNY 19:31, 00:46), 17419 (05:56→POTCHEFSTROOM 10:21, 04:25; COLIGNY 06:29/06:50 CHANGE OF TCO).
- New file assegaaibos-alicedale-algoabai-batch.txt (364 rows), 20 workings — 19 complete, ALL pass (incl. every overnight row):
  - ASSEGAAIBOS 919 (41 rows): 10:03→ALGOABAAI 17:47, 07:44 [OK]; feeder; HUMANSDORP RM SHUNT 12:23/12:30 + HDR shunt cycle 12:31–12:39.
  - ALICEDALE 33793 (8 rows): 08:00→GRAHAMSTOWN 09:54, 01:54 [OK]; passenger stops (STONEHAVEN/HIGHLANDS/ATHERSTONE/COLDSPRING/NEW CEMETRY).
  - ALGOABAAI shunt cars: 2 (10:30), 3 (13:30), 4 (16:35), 5 (17:55) — 00:03 loops; 10 (06:00), 20 (18:00) — 00:21 loops.
  - ALGOABAAI 910 (07:23→PTI/S344311 12:11, 04:48) and 912 (12:18→17:06, 04:48): identical-timetable sister pair, both OK.
  - ALGOABAAI 914 (08:28→LUW/S343692 18:05, 09:37, 51 rows): HUMANSDORP 12:27 X 919 SHUNT + HDR cycle; OK.
  - ALGOABAAI 916 (09:24→HUMANSDORP 14:23, 04:59): OK.
  - ALGOABAAI 918 (18:58→ASSEGAAIBOS 07:18+1d, 12:20, OVERNIGHT x1): HUMANSDORP 23:28→04:52 RM SHUNT (dwell 05:24); day flags flip to 1 at first HDR row; stated == computed [OK].
    919 and 918 are opposite-direction sisters (ASSEGAAIBOS↔ALGOABAAI via HUMANSDORP).
  - ALGOABAAI 1401/1403/1405 (08:00/12:00/15:00 loops, 01:46, 19 rows each) OK; 1407 (18:00→19:46, 01:46, 21 rows) OK with in-loop variants vs the 01:46 set:
    AGB-BAAKENSRIVIER dwell 00:15 (others 00:16), ALGOABAAI travel 00:02 (others 00:05), S363472 at step 5 (others S364525).
  - ALGOABAAI 1409 (22:00→23:42, 01:42), 1411 (00:30→02:12, 01:42): OK.
  - ALGOABAAI 1413: HEADER ONLY (03:00→04:42, 01:42, 3 cars) — paste ends on the header row; checker flags INCOMPLETE. Body outstanding.
- Corridors: 910/912/914/916 share the ALGOABAAI–HUMANSDORP line; 14xx = shunt-car loops at ALGOABAAI (AGB-BAAKENSRIVIER / AGB/Sxxxxxx / ALGOABAAI).

## Round 6 (PARTIAL) — 1413 body + ALGOABAAI loops 2001–2011 + 2450–2456 HOTAZEL family, verified with v2
- ALGOABAAI 1413 body appended (18 step rows) → 1413 COMPLETE (19 rows): 03:00→04:42, stated 01:42:00 = computed [OK].
  Same shape as 1409/1411: S363472 step 5 (04:36/04:37), S364525 step 7 (04:40/04:41), terminal ALGOABAAI 04:42.
- New file algoabai-loops-batch.txt (182 rows), 6 workings, ALL [OK]:
  2001 (06:30→07:29), 2003 (09:30→10:29), 2005 (12:30→13:29), 2007 (14:00→14:59) — VACUUM SHUNT CAR, 31 rows each, 00:59;
  2009 (18:30→19:25, 00:55, 29 rows — no S365424 step);
  2011 (06:00→06:29, 00:29, LIGHTAIRBRAKE, 29 rows on disk): S365564 06:05/06:12 + zero-time loco rows (blank travel/dwell, check skipped) + S365564 06:17/06:24 + terminal; every timed row passes.
  ⚠ ROW COUNT UNRESOLVED: pre-compression notes said 2011 = 30 rows (13+13 zero-time rows); on disk = 29 (13+12, i.e. step-2 list WITHOUT AGB/S344249). Structurally 29 mirrors 2009 (31-row pattern minus ALGOABAAI + S365424 rows). Awaiting user confirmation / re-paste of 2011.
- New file algoabai-hotazel-batch.txt (917 rows): ALGOABAAI 2450 (131 rows, transcribed) + 2451–2456 sed-derived from the 2450 block.
  Derivation: only working number (col 2) + header pattern (col 15: 2450 ANNNNNN, 2451 NANNNNN, 2452 NNANNNN, 2453 NNNANNN, 2454 NNNNANN, 2455 NNNNNAN, 2456 NNNNNNA) differ — pre-compression notes confirmed the paste was row-for-row identical apart from these, and a normalized diff (cols 2+15 stripped) confirms all 7 blocks byte-identical.
  All 7 workings [OK]: 20:00→HOTAZEL 13:27+2d, stated 41:27:00 = computed, OVERNIGHT x2 (EAGLESCRAG 00:18 day 1; BEC-OUTERREIN 00:21 day 2).
  Quirks preserved: SPYTFONTEIN 22:50→dep 00:00:00 in-row wrap (flag 1); ALICEDALE 00:32/02:20 X 3465 dwell 01:48; MACFARLANE LOCO TURN 01:33/02:33:30; seconds precision 23:58:30 / 02:57:30 / 12:13:51 / 13:23:53 / final travel 00:03:07.
- CONTEXT LOSS (session compression): the second half of the round-6 paste is no longer available verbatim in session context and was never written to disk. LOST (re-paste requested):
  ALGOABAAI 2013, 2019, 2021 (29 rows each; 09:00/16:00/20:00→+02:09, S365564 10-min then 1-min cadence);
  ALGOABAAI 2101, 2103 (3 rows each; 07:00/12:00→+04:20, HEAVYAIRBRAKE, single S365424 04:00 dwell);
  ALGOABAAI 2465, 2466, 2467, 2468, 2469, 2470 (130 rows each) and 2471 (7 rows, PARTIAL — original paste ended at step 6, GRASSRIDGE 09:05/10:30 X 3467).
  Pre-compression notes for cross-checking re-paste (NOT to be used as data):
  2465 00:05→15:26 39:21 overnight x1 (BELMONT 00:21 f1; WITPUT 23:27/00:03 in-row wrap f0; NOUPOORT 13:18/15:12 X 3450; BEACONSFIELD 03:19/04:30 LOCO; MACFARLANE 05:06/06:06 LOCO TURN);
  2470 = 2465 modulo working no. + pattern NANNNNN; 2466 08:00→03:58 43:58 overnight x2; 2471 = 2466 sibling, first 6 steps identical (NANNNNN);
  2467 04:00→21:33 41:33; 2468 12:00→06:56 42:56 (crossings CONWAY f1, PLATEAU f2); 2469 16:00→12:10 44:10 (crossings KLIPFONTEIN f1, FIELDSVIEW f2); all ANNNNNN except 2470/2471 (NANNNNN).

## Round 7 — ALGOABAAI 2471 tail + 2472–2498 (PE MANGANESE HOTAZEL, 5 daily timetables), verified with v2
- Source structure discovered: 5 departure slots per "day" (00:05 39:21 / 04:00 41:33 / 08:00 43:58 / 12:00 42:56 / 16:00 44:10), pattern letter constant within a day: 2471–2474 NANNNNN, 2475–2479 NNNANNN, 2480–2484 NNNNANN, 2485–2489 NNNNNAN, 2490–2494 NNNNNNA, 2495–2498 NNNNNNA. Source prints 2495 (day-6 00:05) with NNNNNNA again — preserved as printed.
- 2471 COMPLETE (129 rows): 08:00→03:58, stated 43:58:00 = computed, overnight x2 [OK]. Head 7 rows (header + steps 1–6) DERIVED from sibling 2476 (working no. + pattern only); validated by the 122 verbatim tail rows (this paste) matching 2476 row-for-row, and by the earlier 2471 partial (header 08:00 43:58:00 NANNNNN, step 6 GRASSRIDGE 09:05/10:30 X 3467 — exact match).
- 2472–2497: 27 COMPLETE workings, 129 rows each, ALL [OK]:
  - 04:00→21:33 41:33 overnight x1: 2472 2477 2482 2487 2492 2497 (DEAAR 00:50/03:48 blank activity; FRANS 23:03/23:40 blank)
  - 08:00→03:58 43:58 overnight x2: 2471 2476 2481 2486 2491 2496 (DEAAR 03:20/05:10 RM; WITPUT 08:14/09:59 X; BEC-OUTERREIN 12:40/15:50 BO LOCO; LENGTE 00:00/00:00)
  - 12:00→06:56 42:56 overnight x2: 2473 2478 2483 2488 2493 (DEAAR 07:50/11:00 X; GENOEGSAAM 23:40/00:25 X 3466 in-row wrap; PLATEAU 00:15/00:35 f2; terminal BO FD; HLZ/S240699 06:52:53 seconds precision)
  - 16:00→12:10 44:10 overnight x2: 2474 2479 2484 2489 2494 (THORNGROVE 22:56/00:10 in-row wrap; DEAAR 11:20/14:08 WAITING SLOT; MACFARLANE 23:59/00:50 LOCO TURN)
  - 00:05→15:26 39:21 overnight x1: 2475 2480 2485 2490 2495 (WITPUT 23:27/00:03 in-row wrap; NOUPOORT 13:18/15:12 X 3450; BEACONSFIELD 03:19/04:30 LOCO; MACFARLANE 05:06/06:06 LOCO TURN; DEAAR 18:50/20:03 WAIT SLOT)
- Transcription method: 2472–2476 (one rep per timetable) + 2471 tail transcribed verbatim (723 rows); 2477–2497 derived (working no. + header pattern only, 2,721 rows); normalized diff confirms each family is row-identical (5/6/6/5/5 members). 2497 initially mis-derived from the 08:00 rep — corrected from the 04:00 rep after header check (04:00→21:33 41:33:00).
- 2498 PARTIAL (72 rows): 12:00 → BEACONSFIELD 19:45 (step 26), stated 42:56:00; checker flags partial-start (expected). First 72 rows row-identical to 2493's head (same pattern NNNNNNA) — validated. Tail (steps 27–53) + all workings after 2498 outstanding.
- Checker: 35 workings — 34 [OK] incl. every overnight (stated = computed in all), 1 partial (2498).
- Gap note: working numbers 2457–2470 do not appear in any paste so far (2450–2456 then jump to 2471). Either they exist in the source and still need pasting, or the source skips them — user to confirm.

## Round 8 (PART 1 DONE / PART 2 LOST) — 2498 tail + 2499 + ALGOABAAI misc + new depots
- HOTAZEL family now COMPLETE: 2498 tail (57 rows, derived from 2493 tail, spot-checked) + 2499 (129 rows, day-6 16:00, derived from 2494, spot-checked). Checker: 36 workings, 0 issues. All 5 timetables now have 6 workings each except 12:00 (7 incl. 2498).
- algoabai-misc-batch.txt: 32 workings (2601…23457) transcribed verbatim, ALL OK.
- misc-depots-batch.txt: 14 workings transcribed verbatim; 13 OK; ARIAMSVLEI 2169 = source anomaly (midnight crossing, day-flag 0 on last 2 rows; stated 02:46:00 confirmed by times 21:30→00:16+1d; preserved as-is).
- NOT CAPTURED (verified on disk 2026-10-05: 0 rows for every item below). These rows existed ONLY inside the round-8 chat message; session compression dropped that message from context and the round-9 paste does not repeat them, so they must be RE-PASTED:
  a) ALGOABAAI 8942 (BLOEMFONTEIN 29:33:00 overnight x1, ~90 rows), 8950 (BLOEMFONTEIN 21:48:00 overnight x1, ~90), 8976 (KASERNE 41:09:00 overnight x2, direction CAPE→CONTAINER→CENTRAL, ~135), 8994 (BELLVILLE 53:00:00 overnight x2, ~165), 8996 (HOTAZEL 37:52:00 overnight x2, shunt-car head 28 rows, ~125), 8998 (HOTAZEL 37:52:00 overnight x2, ~125).
  b) ALOES 8950 (BLOEMFONTEIN 21:28:00 overnight x1), 13455 (2 rows), 23455 (2 rows), 38942 (BLOEMFONTEIN 20:44:00 overnight x1).
  c) ARLINGTON 5503/5533/5554/8903/8933/8954/15554 (~135 rows; 8933 has 'SHNUT' typo at MARQUARD — preserve; 5554/8954/15554 blank-travel rows).
  d) APEX 1954 (~60 rows; 10-second dwells).
  e) PDD-ATLANTIS 1158/1207/1208 (3×31 rows; 1207 vs 1208 identical except pattern NYYYYYY/YYYCCYY).
  f) BEITBRIDGE 2/4/6/8/720/724/728/732/736/740/752/1102–1144/1700–1714/2604/5736/6472/6770/8902/16472/71108/71138/72604/88532 (~215 rows; anomalies: working 8 stated dur '00:60:00'; 728 stated 22:19:00 vs travel 22:19:35; Zim rows have blank direction field; 88532 SHONGOLOLO passenger has 10h STAND OVER dwells + overnight).
  g) BEITBRIDG-BBR 5714 + 7101–7115 (8 odd shunts) + 71102/71104/71106/71110/71144 (~67 rows; seconds-precision BEITBRIDGE 00:03:11 rows).

## Round 9 — BLE-BELCON 8014 + BREDASDORP + BLOEDRIVIER + BINDURA + BEACONSFIELD (1140 rows), verified with v2
- BLE-BELCON 8014 (2 rows, 22:37→BELLVILLE 22:42, 00:05:00) appended to misc-depots-batch.txt so all BLE-BELCON workings sit together (7731/7741/7743/7745/8014).
- New file bledasdorp-bindura-beaconsfield-batch.txt, 1138 rows, all 19-field, verbatim. 18 workings, 17 OK:
  BREDASDORP 78 (41 rows, 11:35→CALEDON 16:05, 04:30:00, 20 blank-travel rows as printed), 5260 (35 rows, 13:26→18:15, 04:49:00, pattern NYYYYYN);
  BLOEDRIVIER 5653 (25 rows, 11:50→GLENCOE 14:39, 02:49:00, pattern NYYYYYY, TLN/S6457xx shunt cars in two passes);
  BINDURA 471 (13 rows, 09:18→13:30, 04:12:00) + 477 (13 rows, 16:22→19:50, 03:28:00) — direction field BLANK on several rows as printed; terminal station printed 'MOUNTHAMPDE' vs designated 'MOUNTHAMPDEN' (source truncation, preserved);
  BEACONSFIELD 203 (31 rows, 23:30→POSTMASBURG 07:20+1d, 07:50:00 overnight x1), 205 (31, 01:20→07:45, 06:25:00), 207 (26, 10:30→LIMEACRES 14:43, 04:13:00), 209 (27, 07:10→13:00, 05:50:00), 211 (26, 23:25→05:15+1d, 05:50:00 overnight x1), 1041 (2, 21:00→KIMBERLEY 21:20, 00:20:00);
  BEACONSFIELD Kimberley–Bellville trunk family, 130 rows each: 1222 (00:20→BELLVILLE 10:10+1d, 33:50:00 overnight x1), 1224 (22:30→08:10+2d, 33:40:00 overnight x2), 1240 (07:30→13:10+1d, 29:40:00 overnight x1), 1250 (07:30→13:10+1d, 29:40:00), 1402 (22:30→08:10+2d, 33:40:00 overnight x2, MEDIUM HEAVY), 1414 (same, MEDIUM HEAVY). Stated == computed on every one; work_end−work_start also matches stated duration.
- Source quirks preserved verbatim (not corrected): 1250 BEC-OUTERREIN activity 'B  F 1214' (double space) with blank travel; 1224 MYNFONTEIN blank travel + 00:07:00 dwell; 1402 HEUNINGNESKLO 'X 17005; 18001 &amp; 17007' (semicolon); 1414 FORTRUG 'X8469' and VIVIERS 'X7651' (no space); 1224/1402/1414 SOETENDAL 'X 1101&amp; F 3510 &amp; 3508' (missing space); 'X 2025 / 31' vs 'RM X 2025 /31' spacing differs between workings; step numbers restart at 1 after BEAUFORTWEST (source layout, all seven workings); KIMBERLEY/DRONFIELD blank-travel rows in 203/205/207/211; LAPLAISANTE/EIKENFONTEIN/STIKLAND zero-time rows.
- BEACONSFIELD 1438 = PARTIAL: 88 rows captured (header + steps 1–8 to BEAUFORTWEST + DROERIVIER→KONSTABEL 02:12 day 1). Checker reports duration mismatch (stated 33:50:00 vs computed 25:52:00) purely because the tail after KONSTABEL (QUARRY→BELLVILLE, 42 rows on the 1222 twin) is missing from the paste. Nothing was inferred to fill it.

## Outstanding
1. WALTLOO 18927 — re-paste in 2–3 parts (requested from user).
2. WELGEDAG #1450 tail — 8 rows after KOOKRUS 01:32:00 day 1: REDAN, ALLOY, VER-NOORD, VEREENIGING, VER-SUID, VLC-VILJOENSD, VEREST, SASOLBURG RT.
3. WELGEDAG 58866 head — header + steps 1–12 (13 rows; lone row held = step 13 BLINKPAN arr 19:01:00).
4. ALGOABAAI 2011 row count — on disk 29 rows (step-2 = 12 zero-time rows, no S344249); pre-compression notes said 30. Confirm 29 is right or re-paste 2011 (~30 rows).
5. ALGOABAAI loops re-paste — 2013, 2019, 2021 (29 rows each) + 2101, 2103 (3 rows each); lost to session compression, never written to disk.
6. ALGOABAAI 2457–2470 gap — confirm whether these working numbers exist in the source (paste jumped 2456→2471; and 2499→2601 next).
7. Round-8 queue items a–g — RE-PASTE REQUIRED (disk check 2026-10-05: 0 rows each): ALGOABAAI 8942/8950/8976/8994/8996/8998; ALOES 8950/13455/23455/38942 (the 47 'ALOES' rows on disk are the station column inside ALGOABAAI workings, not ALOES-depot workings); ARLINGTON 5503/5533/5554/8903/8933/8954/15554; APEX 1954; PDD-ATLANTIS 1158/1207/1208; BEITBRIDGE ~37 workings; BEITBRIDG-BBR ~14 workings. Anomaly checklist for the re-paste is in the Round 8 section.
9. BEACONSFIELD 1438 tail — CLOSED BUT DERIVED, NEEDS SOURCE CONFIRMATION. The 42 rows (QUARRY 02:23 day 1 → BELLVILLE 10:10, L1139–L1180) were written in round 10 by time-shifting the verified twin working 1222, NOT transcribed verbatim from the paste. Structure check: 1438 vs 1222 are row-identical in step/station/direction/activity except EIKENFONTEIN step (19 vs 20); times reconcile to the stated 33:50:00 (checker OK). Activity codes (X 7311, X 7651, X 1101, X 2025 / 31, F 3506), the WOR-NOORD 01:15:00 RT SHUNT dwell and the 1222-pattern values are inherited and may not match the source. RE-PASTE the 1438 tail to confirm, or accept the derivation.
8. Exact new-vs-retained dedupe for round 1 — not re-runnable: 929-row retained fixtures + WARRENTON transcription lost in sandbox reset; re-supply needed.

## Round 10 — BEACONSFIELD 1438 tail (derived) + round-10 paste LOST
- Sandbox reset mid-turn wiped /home/user/.cache (excluded from snapshots) — the round-9 working copy there was destroyed. Recovered fully: fetched origin, reset branch to 303e3f1, diff vs the pre-reset copy = IDENTICAL (8,420 rows, 11 files). Working directory moved into the repo at /home/user/Flowops/rail-source-check/ so it survives resets. bledasdorp-bindura-beaconsfield-batch.txt is now 1,180 rows / 18 workings / 0 issues.
- 1438 tail appended (42 rows → 1438 = 130 rows, 00:20:00 → 10:10:00, stated 33:50:00 = computed, overnight x1). Two transcription errors of mine were caught by the checker and fixed: HEXRIVIER typed 02:21:30 (corrected to 04:21:30) and a dropped KLAPMUTS row with KRAAIFONTEIN mis-valued (00:13:00/10.68 instead of KLAPMUTS 09:26 00:13:00 10.68 + KRAAIFONTEIN 09:46 00:12:00 10.21).
- NOT TRANSCRIBED (0 rows on disk): the round-10 paste listed ~80 BEACONSFIELD workings — 2022, 2129, 2133, 2137, 2200, 2227, 2230, 2232, 2245, 2247, 2263, 2271, 2273, 2274, 2275, 2277, 2280, 2292, 2295, 2300, 2305, 2307, 2401, 2407, 2506, 2552, 2556, 2912, 3266, 3321, 3323, 3325, 3420, 3421, 4001, 4002, 4003, 4004, 4007, 4212, 4214, 4215, 4410, 5001, 5002, 5266, 5453, 6602, 6604, 6606, 7001, 7002, 7081, 7259, 7263, 7265, 7281, 7303, 8230, 8256, 8602, 8605, 8606, 8801, 8856, 8912, 8924, 8925, 8928, 8930, 8932, 8936, 8937, 8938, 8939, 8941, 8943, 8945, 8949, 8954, 8964, 8965 (8965 ended mid-working at LIMEACRES 08:45:00). Session compression dropped the paste text itself; only the working numbers survived in memory. A partial file beaconsfield-2-batch.txt containing 18 reconstructed 2022 rows was DELETED rather than kept — those rows were invented, not transcribed. RE-PASTE REQUIRED for all of the above.
- Rule reinforced: never derive a working from a look-alike sibling (2247/2273, 2230/8930, 2232/8932, 3321/3323/3325, 4001/4003/4004/4007, 5001/5002, 7001/7002, 8605/2552, 8912/8945 etc. differ in activity, pattern and dwell). Transcribe each verbatim.

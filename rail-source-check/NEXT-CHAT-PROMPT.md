# Handoff prompt — Rail working consolidation (Annexure_33a_NS_ver_4)

Paste everything below the line into a new chat in this same workspace.
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
- **`rail-source-check/*.txt`** — 18 data files, **16,790 rows, 545 distinct
  workings, 34 depots**. Largest is
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

# Handoff prompt — Rail working consolidation (Annexure_33a_NS_ver_4)

Paste everything below the line into a new chat in this same workspace.
All figures in it were first read off disk on 2026-10-05 at commit `7fc28a3`; the data tree was restored at `2073bb9`; subsequent rounds are recorded below.

---

> **Current-session recovery (2026-10-05).** The prior chat’s committed rail-source tree was restored by a fast-forward onto the currently assigned `arena/d016ab76-flowops` branch. Stay on that branch and push only there. The repeated BLOEMFONTEIN 6634 paste matched the existing 23-row block exactly (L2423–2445; MD5 `2937669311f73e1f88053d0950bfaefb`), so it was not appended again. At that recovery checkpoint, the next missing working was 6636; rounds 28–30 subsequently appended 6636, 6640 and 6642.

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
- **`rail-source-check/*.txt`** — 12 data files, **13,095 rows, 334 distinct
  workings, 26 depots**. Largest is
  `beaufortwest-bultfontein-bloemfontein-batch.txt` (2,537 rows / 78 workings).
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

**Verified this session: 334 workings captured, 18 flagged, 4 depots at zero rows.**

**Priority 1 — 28 BLOEMFONTEIN workings still at 0 rows.** Next is **7000**:

```
7000 7002 7266 7424 8000 8206 8605 8606 8642 8652 8855
8867 8875 8910 8914 8930 8935 8939 8941 8943 8945 8951 8955 8964 8965
8969 8989 9000
```

**Priority 2 — 5 workings captured only partially** (head missing, checker
shows `? -> ?`): `BEACONSFIELD 8965` L1-22, `BEAUFORTWEST 97` L1-16,
`BLOEMFONTEIN 4215` L999-1031, `BLOEMFONTEIN 18927` L2129-2187 (need the head
through ELSTOW 10:56:00), `WELGEDAG 58866` L1-1.

**Priority 3 — never captured:** `BLOEMFONTEIN` 3267, 4000, 4002, 4212, 4213,
4214 · `BEACONSFIELD 1438` (its L1139-1180 is still derived from 1222 and must
be re-transcribed) · `BEAUFORTWEST 96` + 97 head · `BETHLEHEM` 15502, 15556,
15574, 16485, 18990, 26483, 26485, 28811 · `ALGOABAAI` 8976, 8994 ·
**whole depots: WARRENTON (0 rows), BEITBRIDGE (0), BITTERFONTEIN 72/4446 (0),
BFX-PASSASRS 52045/53547/56564/57035/57284 (0).**

**Also outstanding:** round 8 part 2 (queue a–g, ~620 rows) was never captured
and needs re-pasting.

## THE 18 FLAGGED WORKINGS — flagged, never corrected

`ANGLOALPHA` 7460, 7468, 8205 · `BEACONSFIELD` 8965, 28941 · `BEAUFORTWEST` 97,
8924 · `BLOEMFONTEIN` 2273, 2412, 4215, 5598, 6008, 18927 · `BEESHOEK` 7403,
7407 · `ARIAMSVLEI` 2169 · `WALTLOO` 8961 · `WELGEDAG` 58866.

Do not "fix" any of these. STATE.md documents each one.

## REPORT BACK EACH ROUND

1. Row count before and after, and the exact line range of the new working.
2. Checker verdict for the new working — stated vs computed, `[OK]` or flagged.
3. The sibling diff result, stating which fields you compared.
4. Anything anomalous, preserved verbatim and flagged.
5. Commit hash, and `git ls-remote` confirmation that it reached the remote.
6. Updated gap list.

If anything looks off, stop and tell me rather than working around it.

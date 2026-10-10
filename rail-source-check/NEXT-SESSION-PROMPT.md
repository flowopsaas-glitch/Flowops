# NEXT SESSION PROMPT — Rail working consolidation (Annexure_33a_NS_ver_4)

## 0. BOOTSTRAP — if this file or the whole `rail-source-check/` folder is missing

The rail corpus lives on branch **`arena/25d10ae6-flowops`** of `github.com/flowopsaas-glitch/Flowops`.
`main` does **not** contain `rail-source-check/`, so on any other branch this file and the data are
simply absent. Two ways to get them:

**A — add the folder to the workspace you already have open** (no branch switch; your own uncommitted
work is untouched). In the VS Code terminal, from the repo root:

```bash
git fetch origin arena/25d10ae6-flowops
git checkout FETCH_HEAD -- rail-source-check/
```

The 23 data `.txt` files are git-ignored (`.gitignore` line 42) so they can never be staged by
accident; the four `.md`/`.py` files will appear as staged additions on your branch — if your next
commit is not about rail work, unstage them with `git reset -- rail-source-check`.

**B — isolate the rail work in its own clone** (recommended when your main workspace is busy):

```bash
git clone https://github.com/flowopsaas-glitch/Flowops Flowops-rail
cd Flowops-rail
git checkout arena/25d10ae6-flowops
code .            # then open this folder in VS Code
```

Sanity check that the bootstrap worked — from `rail-source-check/`:

```bash
python3 append_gate.py --corpus     # expect 23 files / 17,811 rows / 599 workings / 39 depots / 23 flagged
```

---

**How to use this file.** Open the repo in VS Code and start your assistant chat with:

> Read `rail-source-check/NEXT-SESSION-PROMPT.md` in full and follow it exactly.
> Confirm you have understood the rules, run the START-OF-SESSION CHECKS, and report back.
> I will then paste the next source extract.

Everything the assistant needs is below. Do not summarise it away, do not "improve" the data,
and do not start transcribing until the checks pass and the user has pasted a source extract.

---

## 1. MISSION

Consolidate **Annexure_33a_NS_ver_4** (a South African rail working-timetable extract) into
`rail-source-check/*.txt`, depot by depot, from raw tab-separated pastes supplied by the user in
chat. The repository must become a **byte-faithful mirror of the source**: every working captured,
every row verbatim, every anomaly preserved and flagged, the whole set reproducible from the branch
alone. The end state is "100 % production".

## 2. NON-NEGOTIABLE RULES

1. **Transcribe, never author.** No value may be derived, inferred, interpolated, normalised,
   rounded, spell-corrected or "fixed" — not even when the source is obviously wrong or when a
   sibling working shows what it "should" be.
2. **Blanks are data.** Preserve empty fields and trailing tabs exactly. Never trim, pad or reflow.
   Never open the TSV in Excel/LibreOffice; it silently rewrites blanks.
3. **Source order is sacred.** Rows stay in paste order. Repeated `NODE_Seq` numbers
   (e.g. `1,1,1,2,2,3…`) and repeated station names on consecutive rows are normal, not errors.
4. **Deduplicate before every append** across the *whole* corpus — byte-identical rows and
   `(Origin, Train, NODE_Seq, station)` keys. Identical rows → no append.
5. **Continuations:** verify the boundary against what is already on disk, append only the new
   rows, never touch a stored row (append-only, always).
6. **Never reconstruct a truncated paste.** If a paste stops mid-working, transcribe what arrived,
   record exactly where it stops, and ask for the remainder. This has happened repeatedly — it is
   normal, and asking is always correct.
7. **Stop and ask** if anything is inaccessible, ambiguous, malformed or inconsistent — including a
   different source version, an unclear overlap, or a value whose structure you cannot verify.
8. **Anomalies are preserved, not repaired.** Anything the checker flags stays exactly as pasted
   and is recorded in STATE.md.
9. **Sibling/other-working comparisons are read-only and post-hoc.** Only after a working is
   transcribed independently; state precisely which fields differ; never use a comparison to
   produce or complete a working.
10. **Never commit the raw source paste** itself, and never commit junk/scratch. Rail `.txt` files
    are git-ignored (`.gitignore` line 42) — data files must be staged with `git add -f`.

## 3. WHERE EVERYTHING IS

- Repo: `https://github.com/flowopsaas-glitch/Flowops` (folder `Flowops/` in VS Code).
- Corpus: `rail-source-check/` — 23 data files, `verify_workings.py` (checker),
  `append_gate.py` (pre-append gates / post-append verify / corpus audit),
  `STATE.md` (the running ledger — **read it first every session**),
  `NEXT-CHAT-PROMPT.md` (rolling handoff), `FIELD-NAMES.md` (authoritative field list + source header).
- **Branch situation (must be settled by the user, do not guess):** the standing mandate names
  `arena/d016ab76-flowops` (holds rounds up to 52, head `921eaa4`); the newest data (rounds 53–58)
  is on `arena/25d10ae6-flowops` (head `97cbefc`). Check out the branch with the newest corpus, or
  merge it into the mandated branch, and record the decision in STATE.md. Never `git reset --hard`;
  never silently switch branches mid-session.
- Staging: keep pastes in `uploads/` (git-ignored, `.gitignore` line 54), e.g.
  `uploads/round-59/blinkpan.txt`. Nothing enters `rail-source-check/` until the gates pass.

## 4. START-OF-SESSION CHECKS (run these before anything else)

```bash
git fetch origin
git log -1 --format='%H %s'          # expect 97cbefcd99595a0cfbe36d7e391c87abd6adddc5 (branch arena/25d10ae6-flowops)
git status --porcelain                # expect no output
cd rail-source-check
python3 append_gate.py --corpus       # corpus audit: totals + checker + flagged list
```

Expected audit output (if **any** number differs, stop and report — do not transcribe):

| measure | expected |
|---|---|
| files | 23 |
| rows | 17,811 |
| workings | 599 |
| depots | 39 |
| flagged workings | 23 |
| `[OK]` workings | 576 |

If your Python is invoked as `python` on Windows, use that; the scripts are pure standard library.

## 5. THE DATA MODEL (19 tab-separated fields)

```
 1 Origin                    11 Destination
 2 Train (working number)    12 Origin Departure Time     (header row only)
 3 NODE_Seq (step)           13 Destination Arrival Time  (header row only)
 4 ENROUTE_Corridor          14 Sched                     (header row only)
 5 ENRTE_Station/siding no.  15 Frequency                 (header row only)
 6 ENROUTE_Arrival           16 Train Type                (header row only)
 7 ENROUTE_Departure         17 Train Throughput Runtime
 8 Point-to-Point Runtime    18 Depart_Day  (0/1/2 …)
 9 Standingtime              19 Distance
10 StandingReason
```

- **20-field loco variant:** a loco sub-number in position 4 shifts every later field by one. Both
  are legal; report the mix per file, and never silently re-align one into the other.
- **Header row:** the first row of a working carries the depot in the *station* column, a blank
  arrival, the departure time in field 7, and the header-only fields (12–16).
- `NODE_Seq` **restarts** inside long workings — never treat a restart as a new working.
- Depot name is field 1 (`Origin`); several depot names (BLACKHILL, BLANEY, BOWKERSPARK, BERRYPARK…)
  also occur as *station* names inside other depots' files — gate on field 1, never on a name grep.
- Corridors in use: CAPE, CENTRAL, CONTAINER, NORTH, NORTHEAST, ORELINE, plus
  **blank** (currently 42 rows — preserved as received, not an error).

## 6. THE WORK CYCLE (per paste)

- **S1 — Receive & stage.** Save the paste verbatim to `uploads/round-NN/<name>.txt`
  (one file per depot/section if the paste covers several). Count lines and fields — e.g.
  `python3 append_gate.py uploads/round-NN/x.txt` prints the payload census.
  If any row is not 19 (or 20) fields → stop and ask; do not "repair" it.
- **S2 — Transcribe.** Write the payload file byte-for-byte as pasted (same order, same blanks,
  same odd values). If the paste covers a new depot, split into `<depot>-batch.txt`-style payloads
  only if that matches what arrived; otherwise keep one payload.
- **S3 — Gates (pre-append).** `python3 append_gate.py <payload>` — checks field counts,
  byte-identical rows, key collisions, per-working existing rows, and prints the corpus/payload
  boundary rows with the clock delta. **Exit 0 = pass.** Anything else → stop and report.
- **S4 — Append.** New workings in an existing file: append at end of file, nothing else touched.
  A wholly new depot: create `<depot>-batch.txt` from the payload.
- **S5 — Verify (post-append).**
  `python3 append_gate.py <payload> --verify rail-source-check/<target>.txt`
  → the tail must be byte-identical to the payload, and "target minus payload == HEAD copy"
  must hold for an append into an existing tracked file. Record MD5s of payload and target.
- **S6 — Checker.** `python3 verify_workings.py <target>.txt`. New flagged workings are expected
  only for genuine partials/anomalies; record each one. Never edit data because of a flag.
- **S7 — Sibling comparisons** (read-only, station-keyed alignment, header row kept). State the
  exact differing fields and row counts. Never feed a comparison back into a transcript.
- **S8 — Docs.** Update `STATE.md` (new round section: source, row counts, line ranges, MD5s,
  gates, checker result, anomalies, siblings, queue) and `NEXT-CHAT-PROMPT.md` (new
  "Latest progress" block + refreshed totals). Keep Markdown whitespace checks separate from TSV.
- **S9 — Commit & push.** `git add -f rail-source-check/<changed>.txt`, `git add` the two docs,
  review `git status --short` and `git diff --cached --stat`, commit with a descriptive message
  (round, depots, row counts, totals), then `git push`. Confirm with
  `git ls-remote origin refs/heads/<branch>` == local `git rev-parse HEAD` and a clean
  `git status --porcelain`. If the paste yielded only duplicates → no data commit, report only.

## 7. WHAT THE CHECKER DOES (and its known quirks)

`verify_workings.py` is day-flag aware: absolute time = clock + 24 h × `Depart_Day`; a same-row
`dep < arr` wraps +24 h (midnight dwell); it flags non-monotonic day flags, backwards time,
travel/dwell vs clocks, stated vs computed duration, and duplicate rows. Blank travel is skipped
(that is normal for siding hops where `arr` == `dep`). Totals line format:
`total: N workings, M with issues`; issue lines carry `[ISSUES]`.

Quirks: `tail -1` on a `.txt` returns a blank line — always count with `awk 'NF' | wc -l`;
the per-file totals loop must grep `total:` (do not read the last line of output).

## 8. CURRENT STATE — 23 files / 17,811 rows / 599 workings / 39 depots / 576 `[OK]` + 23 flagged

Newest files (round 58, head `97cbefc`):

| file | rows | workings | MD5 |
|---|---|---|---|
| `blackhill-batch.txt` (NEW depot, round 58 p2) | 89 | 15 | `9665150a06f7a9e52bf15de236a34d83` |
| `blaney-batch.txt` (NEW depot, round 58 p2) | 70 | 1 | `3827b6002ff002820d0d4b68ffe89dc3` |
| `buckingham-batch.txt` (NEW depot, round 58 p2) | 24 | 1 | `8c6e89fc66588001fbeb1c8460642133` |
| `bowkerspark-batch.txt` (NEW depot, round 58 p2) | 10 | 2 | `a6c620d67f4c92bfc267e5eb81747e41` |
| `bellville-batch.txt` (rounds 58 p2 – 63) | 784 | 32 | `c465ac3fbf4667112d1d3bc6cad393d6` |
| `blinkpan-batch.txt` (NEW depot, round 58) | 601 | 71 | `f50080d6fc70c34f4b97134c3300017f` |
| `bijlkor-batch.txt` (rounds 54–57 + 64) | 1703 | 63 | `200f600983f14ae7a791a115847298f1` |

Every other file's rows/workings/MD5 and round history is in `STATE.md` ("## Files" section).

**The 23 flagged workings — preserved anomalies, never "fixed":**
ANGLOALPHA 7460/7468/8205 · BEACONSFIELD 8965/28941 · BEAUFORTWEST 97/8924 ·
BLOEMFONTEIN 2273/2412/4215/5598/6008/18927 · BEESHOEK 7403/7407 · BLOEMHOF 1438/2226 ·
ARIAMSVLEI 2169 · BUFFALOHARBOU 1052 · WALTLOO 8961 · WELGEDAG 58866 · BLINKPAN 80109 ·
BELLVILLE 1417 (30-second stated-vs-computed duration mismatch — stated 02:40:00 vs computed
02:40:30; every leg reconciles; preserved exactly as pasted).
(`BELLVILLE 1414` carried the flag while it was a partial; it completed in round 59 and is
`[OK]`.) Notes: `BLINKPAN 80109` keeps `Depart_Day` 0 across midnight (siblings
roll the flag); `BLINKPAN 2154` carries `Frequency` `AYYYYYY`; several are **partials** awaiting a
re-paste (see §9).

## 9. THE QUEUE — what the user will paste next (priority order)

1. **BELLVILLE — everything after `1431`.** `1414` completed round 59 (L620-656, `[OK]`);
   `1417` captured round 60 (L657-676 — flagged: stated `02:40:00` vs computed `02:40:30`,
   preserved); `1418` captured round 61 (L677-689, `[OK]`); `1429` captured round 62 (L690-717,
   `[OK]`); **`1428` captured round 63 (L718-734, `[OK]`)** — the round-62 hold closed via the
   user's clarification that the paste-join word "and" was connector prose, resolving its final
   row's `Distance` as empty (standard 19-field row); **`1431` captured round 63 (L735-784,
   `[OK]`, overnight to KLAWER)**. The pastes jumped `1414` → `1417` → `1418` → `1428`/`1429` →
   `1431`: **ask the user whether `1415`/`1416` and `1430` exist in the source.** Continue with
   the workings that follow `1431`.
2. **BIJLKOR**: `8856` — the **whole working** from its header (round-56's transcription stopped
   at its `BEAUFORTWEST` day-1 20:25:00 row and its 108+ rows were deliberately withheld; they
   never landed — **CAUTION: an earlier queue note misattributed that `BEAUFORTWEST` boundary to
   `17207`; `17207` has no BEAUFORTWEST rows** — `17207` completed round 64 in one paste: the
   round-56 head through `BIJ/S750557` 22:26:00 plus the round-57 held 7-row tail
   `BIJ/S743607` 22:27:00 → `BIJLKOR` 22:39:00, L1683-1703, `[OK]`) — and `9409`, `9443`,
   `16453`, `17205` (never on disk). *Measured 2026-10-09:* none of these five trains has a
   single row on this branch (0 mentions corpus-wide) — ask for `8856` complete, header included.
   Never append a header-less fragment. **When a queue note conflicts with a round record in
   `STATE.md`, the round record wins** (round 64's condensation lesson).
3. **BLOEMFONTEIN** queue: 8941, 8943, 8945, 8951, 8955, 8964, 8965, 8969, 8989, 9000.
4. **Partials already on disk awaiting their remainder** — treat with care, append only new rows:
   BEACONSFIELD 8965 (L1-22), BEAUFORTWEST 97 (L1-16), BLOEMFONTEIN 4215 (L999-1031,
   partial-start), BLOEMFONTEIN 18927 (L2129-2187), WELGEDAG 58866 (L1-1). (`BIJLKOR 8856` is
   NOT on disk at all — see item 2.)
5. **Re-transcribe (derived, therefore not trustworthy):** BEACONSFIELD `1438` L1139-1180 was
   built from twin `1222`, not from source — replace only when the source rows arrive, byte-verified,
   with the user's approval.
6. **Whole depots still missing:** WARRENTON, BEITBRIDGE, BITTERFONTEIN, BFX-PASSASRS.
7. **Round-8 part 2** (~620 rows) was never captured.

## 10. OPEN QUERIES (need the user's explicit answer)

1. **`&amp;` cells.** Three cells arrived HTML-escaped and are stored exactly as received:
   BELLVILLE `75` step 6 `KALBASKRAAL` `ORDER &amp; SHUNT`; BELLVILLE `1211` and `1411` step 3
   `KRAAIFONTEIN` `R.T.O. &amp; X 1428`. If the source has a plain `&`, re-paste those three cells.
2. **BELLVILLE file naming.** No `belville*`/`bellville*` file exists in the repository or on any
   remote branch; the new file therefore uses the source's own spelling `bellville-batch.txt`.
   If the user has earlier `belville-batch.txt`-style files elsewhere, agree the reconciliation.
3. **Branch mandate** (§3) — still unresolved; keep recording whatever branch is actually used.

## 11. TRAPS — already-paid-for lessons; do not repeat

- Run the §4 git checks at the **start of every round**, not only at session start: in round 61
  the sandbox reset the local ref to the branch point **mid-round** (HEAD silently back at
  `6426c7f`); the post-append verify's "target minus payload == HEAD copy" check caught it. If
  that check fires, stop and inspect `git log -1` before touching anything (§13 recovery:
  `git fetch` + `git reset --mixed FETCH_HEAD`, never `--hard`, and no `git checkout --` when
  uncommitted appends are in the worktree).
- Sibling alignment: **do not** use `difflib.SequenceMatcher` (it matched 1 of 94 rows when
  `NODE_Seq` restarts); **do not** drop the header row. Use a station-keyed sequential walk,
  header kept, and report counts per differing field. Unequal lengths → the walk, not `zip`.
- Never write sibling-diff prose from memory: re-derive every count from disk first.
- A paste that repeats an already-stored block is not an error: verify byte-identity, report,
  append nothing (this happened with BLOEMFONTEIN 6634 and was handled correctly).
- Do not "correct" durations, day flags, or clocks the checker flags; do not roll day flags the
  source did not roll (`BLINKPAN 80109`).
- Do not assume a working is complete because the checker says `[OK]`; partials can reconcile if
  the header runtime matches the visible rows but the destination station is short of the
  designated destination (the checker's "ends at … (designated destination …)" note).
- Keep an eye on repeated `NODE_Seq` and repeated stations — normal.
- Windows/PowerShell: `python3` may be `python`; paths are the same; the scripts are portable.
- Backups: after every append the file must exist in at least one commit; never leave a round's
  data only in the working tree.

## 12. REPORT FORMAT (end of every round — 12 sections)

1. **Source status** — what was pasted, readable, truncated where.
2. **Rows** — new / duplicate / partial / unclear counts.
3. **Before → after** — files, rows, workings, depots, flagged.
4. **Line ranges** — exact ranges appended (and created files).
5. **Checksums** — MD5 of payload(s) and of the target(s) after append.
6. **Fields** — field-count verification (19/20) per file.
7. **Checker** — per-file workings/issues, flag list, notes.
8. **Sibling comparisons** — only the fields that differ, with counts.
9. **Aggregate totals** — the corpus-wide numbers (from `append_gate.py --corpus`).
10. **Remaining queue** — what is still owed, in priority order.
11. **Commit** — hash + files changed.
12. **Remote / worktree** — remote ref == HEAD, worktree clean.

## 13. RECOVERY

- Missing or damaged rail files: `git fetch origin <branch>` then
  `git checkout FETCH_HEAD -- rail-source-check/` (the corpus is fully committed after each round).
- If HEAD moved backwards (sandbox reset): `git fetch origin <branch>`; verify local HEAD is an
  ancestor of the fetched branch; then `git reset --mixed FETCH_HEAD` and
  `git checkout -- rail-source-check/`. Never `git reset --hard`.
- If a payload file is lost before it was committed: it is gone — say so plainly and ask for a
  re-paste. Nothing may be reconstructed from siblings. (This is why §S9 commits every round.)

## 14. FIRST REPLY THE USER EXPECTS

> Checks run: corpus = 23 files / 17,811 rows / 599 workings / 39 depots / 23 flagged;
> HEAD = 97cbefc (branch …); worktree clean. Rules understood: verbatim only, blank-safe,
> dedupe-first, append-only, ask on any truncation or ambiguity. Ready — paste the next extract.

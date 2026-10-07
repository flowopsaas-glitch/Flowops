#!/usr/bin/env python3
"""append_gate.py - pre-append gates, corpus audit and post-append verification
for the rail-source-check consolidation.

Usage
-----
  python3 append_gate.py PAYLOAD.txt                 # PRE-APPEND gates vs the whole corpus
  python3 append_gate.py PAYLOAD.txt --verify TARGET.txt  # POST-APPEND: byte-compare the tail
  python3 append_gate.py --corpus                    # corpus audit: totals + checker summary

What the pre-append gates check (all read-only, nothing is ever written):
  1. field counts            every payload row must be 19 fields (20-field loco variant tolerated,
                             reported separately) - blanks are data, never trimmed or padded;
  2. payload census          rows / workings / per-working row counts;
  3. byte-identical rows     any payload line equal to ANY corpus line  -> duplicate, no append;
  4. key collisions          (Origin, Train, NODE_Seq, station) already present corpus-wide;
  5. per-working existence   how many rows of each payload working already exist, and where;
  6. boundary contiguity     for a working that already exists, the last corpus row is printed
                             next to the first payload row with the clock delta, so a mid-working
                             continuation can be checked by eye before appending.

Exit status: 0 = gates pass (no duplicates, no collisions, field counts clean);
             1 = STOP (something was found that needs a human decision).

The tool never edits, sorts or normalises anything: it only reads and reports.
"""
import argparse
import collections
import glob
import hashlib
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TIME_RE = re.compile(r'^(\d{1,2}):(\d{2})(?::(\d{2}))?$')

FIELDS = ["Origin", "Train", "NODE_Seq", "ENROUTE_Corridor", "ENRTE_Station/siding no.",
          "ENROUTE_Arrival", "ENROUTE_Departure", "Point-to-Point Runtime", "Standingtime",
          "StandingReason", "Destination", "Origin Departure Time", "Destination Arrival Time",
          "Sched", "Frequency", "Train Type", "Train Throughput Runtime", "Depart_Day", "Distance"]


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_rows(path):
    """Return [(lineno, raw_line_without_eol)] for every non-blank line. Bytes are kept intact."""
    rows = []
    with open(path, encoding='utf-8', newline='') as fh:
        for i, line in enumerate(fh, 1):
            line = line.rstrip('\n').rstrip('\r')
            if line.strip() == '':
                continue
            rows.append((i, line))
    return rows


def corpus_files(exclude=()):
    ex = {os.path.abspath(p) for p in exclude}
    out = []
    for p in sorted(glob.glob(os.path.join(HERE, '*.txt'))):
        if os.path.abspath(p) not in ex:
            out.append(p)
    return out


def load_corpus(exclude=()):
    rows = []          # (basename, lineno, raw)
    for p in corpus_files(exclude):
        base = os.path.basename(p)
        for ln, raw in read_rows(p):
            rows.append((base, ln, raw))
    return rows


def key_of(raw):
    f = raw.split('\t')
    if len(f) < 5:
        return None
    return (f[0], f[1], f[2], f[4])


def parse_t(s):
    if not s:
        return None
    m = TIME_RE.match(s.strip())
    if not m:
        return None
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3) or 0)


def hms(sec):
    if sec is None:
        return '?'
    return '%02d:%02d:%02d' % (sec // 3600, (sec % 3600) // 60, sec % 60)


def compact(raw, width=150):
    return raw.replace('\t', ' | ')[:width]


# ----------------------------------------------------------------------------- gates
def preappend(payload):
    pay = read_rows(payload)
    if not pay:
        print('PAYLOAD IS EMPTY -> stop')
        return 1
    bad_fields = collections.Counter()
    for _, raw in pay:
        bad_fields[len(raw.split('\t'))] += 1
    print('PAYLOAD  %s' % payload)
    print('  rows=%d  fields=%s' % (len(pay), dict(sorted(bad_fields.items()))))
    if set(bad_fields) - {19, 20}:
        print('  !! unexpected field counts: STOP and re-paste')

    workings = collections.Counter()
    for _, raw in pay:
        f = raw.split('\t')
        workings[(f[0], f[1])] += 1
    print('  workings=%d' % len(workings))
    for (dep, w) in sorted(workings, key=lambda k: (k[0], int(k[1]) if k[1].isdigit() else 0)):
        print('    %-14s %-7s %d rows' % (dep, w, workings[(dep, w)]))

    print('\nCORPUS   %d files' % len(corpus_files(exclude=[payload])))
    corpus = load_corpus(exclude=[payload])
    print('  rows=%d' % len(corpus))

    # 3. byte-identical rows
    cset = collections.Counter(r for _, _, r in corpus)
    dups = [(ln, raw) for ln, raw in pay if cset[raw]]
    print('\n[1] byte-identical rows: %d' % len(dups))
    for ln, raw in dups[:10]:
        print('    L%-5d %s' % (ln, compact(raw)))

    # 4. key collisions
    ckeys = collections.defaultdict(list)
    for base, ln, raw in corpus:
        k = key_of(raw)
        if k:
            ckeys[k].append((base, ln))
    coll = []
    for ln, raw in pay:
        k = key_of(raw)
        if k and k in ckeys:
            coll.append((ln, k, ckeys[k][:3]))
    print('[2] (depot, working, NODE_Seq, station) collisions: %d' % len(coll))
    for ln, k, where in coll[:10]:
        print('    L%-5d %s  already at %s' % (ln, k, where))

    # 5. per-working existence / 6. boundary
    print('[3] per-working rows already in the corpus, and the boundary:')
    for (dep, w) in sorted(workings, key=lambda k: (k[0], int(k[1]) if k[1].isdigit() else 0)):
        existing = [(base, ln, raw) for base, ln, raw in corpus
                    if raw.split('\t')[0] == dep and raw.split('\t')[1] == w]
        first_pay = next(raw for _, raw in pay if raw.split('\t')[0] == dep and raw.split('\t')[1] == w)
        if not existing:
            print('    %s %s: 0 rows corpus-wide  -> NEW working' % (dep, w))
            continue
        base, ln, raw = existing[-1]
        print('    %s %s: %d existing row(s); last = %s L%d' % (dep, w, len(existing), base, ln))
        print('        last corpus row : %s' % compact(raw))
        print('        first payload row: %s' % compact(first_pay))
        a = parse_t(raw.split('\t')[6]) or parse_t(raw.split('\t')[5])
        b = parse_t(first_pay.split('\t')[5]) or parse_t(first_pay.split('\t')[6])
        if a is not None and b is not None:
            print('        clock delta (payload arr - corpus dep): %+d s' % (b - a))

    ok = not dups and not coll and not (set(bad_fields) - {19, 20})
    print('\nRESULT: %s' % ('PASS -> safe to append the new rows only'
                            if ok else 'STOP -> duplicates/collisions/field problems found'))
    return 0 if ok else 1


# ----------------------------------------------------------------------------- verify
def verify(payload, target):
    if not os.path.exists(target):
        print('target not found: %s' % target)
        return 1
    pay = open(payload, 'rb').read()
    tgt = open(target, 'rb').read()
    n_pay = sum(1 for l in pay.split(b'\n') if l.strip())
    n_tgt = sum(1 for l in tgt.split(b'\n') if l.strip())
    tail = tgt[-len(pay):] if len(tgt) >= len(pay) else b''
    print('PAYLOAD %s  rows=%d  md5=%s' % (payload, n_pay, hashlib.md5(pay).hexdigest()))
    print('TARGET  %s  rows=%d  md5=%s' % (target, n_tgt, hashlib.md5(tgt).hexdigest()))
    print('tail-%d bytes of target == payload bytes: %s' % (n_pay, tail == pay))
    if tail != pay:
        print('  !! the tail is not byte-identical to the payload -> STOP and inspect')
        return 1
    # append-only proof against the committed copy, when git is available
    try:
        rel = os.path.relpath(target, HERE)
        head = subprocess.run(['git', '-C', HERE, 'show', 'HEAD:rail-source-check/' + rel],
                              capture_output=True, check=True).stdout
        if head == tgt:
            print('target == HEAD copy (the append is already committed)')
        elif tgt[:-len(pay)] == head:
            print('target minus payload == HEAD copy -> append-only: PASS')
        else:
            print('!! target minus payload != HEAD copy -> STOP and inspect '
                  '(an existing line may have been changed)')
            return 1
    except subprocess.CalledProcessError:
        print('  (target not in HEAD yet - new file, or not committed: nothing to compare)')
    return 0


# ----------------------------------------------------------------------------- corpus
def corpus_audit():
    files = corpus_files()
    rows = workings = flagged = 0
    depots = set()
    per_file = []
    flagged_list = []
    for p in files:
        base = os.path.basename(p)
        frows = read_rows(p)
        rows += len(frows)
        wset = collections.Counter()
        for _, raw in frows:
            f = raw.split('\t')
            depots.add(f[0])
            wset[(f[0], f[1])] += 1
        workings += len(wset)
        out = subprocess.run([sys.executable, os.path.join(HERE, 'verify_workings.py'), p],
                             capture_output=True, text=True).stdout
        tot = [l for l in out.splitlines() if l.strip().startswith('total:')]
        n_w = int(tot[0].split()[1]) if tot else 0
        n_i = int(tot[0].split()[3]) if tot else 0
        flagged += n_i
        for l in out.splitlines():
            if '[ISSUES]' in l:
                flagged_list.append('%s: %s' % (base, l.strip().split()[0:2]))
        per_file.append((base, len(frows), n_w, n_i))
    print('%-40s %6s %9s %7s' % ('file', 'rows', 'workings', 'flagged'))
    for base, r, w, i in per_file:
        print('%-40s %6d %9d %7d' % (base, r, w, i))
    print('-' * 66)
    print('%-40s %6d %9d %7d' % ('TOTAL (%d files, %d depots)' % (len(files), len(depots)),
                                 rows, workings, flagged))
    if flagged_list:
        print('\nflagged workings (preserved anomalies - never "fix" them):')
        for x in flagged_list:
            print('  ' + x)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('payload', nargs='?', help='staged TSV payload to gate')
    ap.add_argument('--verify', metavar='TARGET', help='post-append: compare TARGET tail to payload')
    ap.add_argument('--corpus', action='store_true', help='audit the whole corpus')
    a = ap.parse_args()
    if a.corpus:
        return corpus_audit()
    if not a.payload:
        ap.print_help()
        return 2
    if a.verify:
        return verify(a.payload, a.verify)
    return preappend(a.payload)


if __name__ == '__main__':
    sys.exit(main())

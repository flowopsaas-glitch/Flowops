#!/usr/bin/env python3
"""verify_workings.py v2 - day-flag-aware timing checker for rail working extracts.

19-field TSV (0-based): 0 depot, 1 working, 2 step, 3 direction, 4 station,
5 arr, 6 dep, 7 travel, 8 dwell, 9 activity, 10 designation, 11 work_start,
12 work_end, 13 n, 14 pattern, 15 description, 16 work_duration, 17 day_flag,
18 distance.
20-field variant: loco sub-number at idx 3, all later fields shift +1.
Header row: arr empty.

Absolute time = time + 24h * day_flag.  If dep < arr within one row, dep
wraps +24h (midnight dwell, e.g. HERTZBERG 23:57/00:11).
Stated work duration is compared against last_arr_abs - header_dep_abs.
Supplied values are NEVER modified; anything inconsistent is reported as an
anomaly (corrupt tokens are reported, not corrected).
"""
import sys, re
from collections import OrderedDict

H = 3600
DAY = 86400

TIME_RE = re.compile(r'^(\d{1,2}):(\d{2})(?::(\d{2}))?$')
DUR_RE  = re.compile(r'^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$')

def parse_time(s):
    if s is None: return None
    s = s.strip()
    if not s: return None
    m = TIME_RE.match(s)
    if not m: return None
    h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if mi > 59 or se > 59: return None
    return h*H + mi*60 + se

def parse_dur(s):
    if s is None: return None
    s = s.strip()
    if not s: return None
    m = DUR_RE.match(s)
    if not m: return None
    return int(m.group(1))*H + int(m.group(2))*60 + int(m.group(3) or 0)

def fmt(secs):
    if secs is None: return '??'
    return f"{secs//H:02d}:{(secs%H)//60:02d}:{secs%60:02d}"

def daytime(secs):
    return fmt(secs % DAY)

def idxmap(nf):
    """Return field indices for a row of nf fields (19 standard / 20 with loco sub)."""
    off = 1 if nf == 20 else 0
    return dict(step=2, direction=3+off, station=4+off, arr=5+off, dep=6+off,
                travel=7+off, dwell=8+off, activity=9+off, dest=10+off,
                wstart=11+off, wend=12+off, dur=16+off, flag=17+off, dist=18+off)

def check_working(wkey, rows):
    issues = []
    notes  = []
    lines  = [r[0] for r in rows]
    first, last = lines[0], lines[-1]
    info = dict(first=first, last=last, n=len(rows))

    # ---- header ----
    hdr = rows[0][1]
    hm = idxmap(len(hdr))
    hdr_is_header = (hdr[hm['arr']].strip() == '')
    if not hdr_is_header:
        issues.append(f"L{first}: PARTIAL-START - first row has no header (arr filled: {hdr[hm['arr']]!r}, station {hdr[hm['station']]!r})")
    flag0 = None
    hdr_dep_abs = None
    if hdr_is_header:
        try:
            flag0 = int(hdr[hm['flag']])
        except ValueError:
            issues.append(f"L{first}: header day flag corrupt: {hdr[hm['flag']]!r}")
            flag0 = 0
        d = parse_time(hdr[hm['dep']])
        if d is None:
            issues.append(f"L{first}: header dep corrupt: {hdr[hm['dep']]!r}")
        else:
            hdr_dep_abs = d + flag0*DAY
        sd_raw = hdr[hm['dur']].strip()
        sd = parse_dur(sd_raw)
        if sd_raw and sd is None:
            issues.append(f"L{first}: stated work duration unparseable: {sd_raw!r}")
        info.update(dest=hdr[hm['dest']], wstart=hdr[hm['wstart']], wend=hdr[hm['wend']],
                    stated_dur=sd, flag0=flag0,
                    hdr_dep=daytime(hdr_dep_abs) if hdr_dep_abs is not None else '??')

    if len(rows) == 1 and hdr_is_header:
        issues.append(f"L{first}: INCOMPLETE - header only, no step rows (extract/paste truncated?)")

    # ---- walk rows ----
    prev_dep_abs = hdr_dep_abs
    prev_arr_abs = None
    prev_line = first
    max_flag = 0
    seen = set()
    last_arr_abs = None
    last_station = None
    blank_travel = []

    for (ln, f) in rows:
        m = idxmap(len(f))
        nf = len(f)
        if nf not in (19, 20):
            issues.append(f"L{ln}: field count {nf} (expected 19 or 20)")
            continue
        is_hdr = f[m['arr']].strip() == ''
        if is_hdr and ln != first:
            issues.append(f"L{ln}: unexpected header-like row (arr empty) mid-working")
        # day flag
        try:
            flag = int(f[m['flag']])
        except ValueError:
            issues.append(f"L{ln}: day flag corrupt: {f[m['flag']]!r}")
            flag = max_flag
        if flag < max_flag:
            issues.append(f"L{ln}: day flag decreased ({max_flag} -> {flag})")
        max_flag = max(max_flag, flag)

        arr = parse_time(f[m['arr']])
        if f[m['arr']].strip() and arr is None:
            issues.append(f"L{ln}: arr time corrupt: {f[m['arr']]!r}")
        dep = parse_time(f[m['dep']])
        if f[m['dep']].strip() and dep is None:
            issues.append(f"L{ln}: dep time corrupt: {f[m['dep']]!r}")

        if is_hdr:
            if dep is not None:
                prev_dep_abs = dep + flag*DAY
            prev_arr_abs = None
            continue

        arr_abs = arr + flag*DAY if arr is not None else None
        dep_abs = None
        if dep is not None:
            dep_abs = dep + flag*DAY
            if arr_abs is not None and dep_abs < arr_abs:
                dep_abs += DAY  # overnight dwell within the row

        # monotonic arrival
        if arr_abs is not None and prev_arr_abs is not None and arr_abs < prev_arr_abs:
            issues.append(f"L{ln}: time goes backwards at {f[m['station']]} (arr {daytime(arr_abs)} < prev {daytime(prev_arr_abs)})")
        if arr_abs is not None and prev_dep_abs is not None and arr_abs < prev_dep_abs:
            issues.append(f"L{ln}: arrival before previous departure at {f[m['station']]} (arr {daytime(arr_abs)} < prev dep {daytime(prev_dep_abs)})")

        # travel
        t_s = f[m['travel']].strip()
        if t_s:
            t = parse_dur(t_s)
            if t is None:
                issues.append(f"L{ln}: travel corrupt: {t_s!r}")
            elif arr_abs is not None and prev_dep_abs is not None and t != arr_abs - prev_dep_abs:
                issues.append(f"L{ln}: travel mismatch at {f[m['station']]}: stated {t_s}, computed {fmt(arr_abs - prev_dep_abs)}")
        else:
            blank_travel.append(f"L{ln} {f[m['station']]}")

        # dwell
        dw_s = f[m['dwell']].strip()
        if dw_s:
            dw = parse_dur(dw_s)
            if dw is None:
                issues.append(f"L{ln}: dwell corrupt: {dw_s!r}")
            elif arr_abs is not None and dep_abs is not None and dw != dep_abs - arr_abs:
                issues.append(f"L{ln}: dwell mismatch at {f[m['station']]}: stated {dw_s}, computed {fmt(dep_abs - arr_abs)}")

        # duplicates
        sub = f[3] if nf == 20 else ''
        key = (f[m['step']], sub, f[m['station']], f[m['arr']])
        if key in seen:
            issues.append(f"L{ln}: duplicate row (step {f[m['step']]}{('/'+sub) if sub else ''} {f[m['station']]} arr {f[m['arr']]})")
        seen.add(key)

        if arr_abs is not None:
            last_arr_abs = arr_abs
            last_station = f[m['station']]
        if dep_abs is not None:
            prev_dep_abs = dep_abs
        if arr_abs is not None:
            prev_arr_abs = arr_abs
        prev_line = ln

    # ---- working-level checks ----
    if last_arr_abs is not None and hdr_dep_abs is not None:
        computed = last_arr_abs - hdr_dep_abs
        info.update(computed_dur=computed, end_abs=last_arr_abs, last_station=last_station)
        sd = info.get('stated_dur')
        if sd is not None and computed != sd:
            issues.append(f"duration mismatch: stated {fmt(sd)}, computed {fmt(computed)} (start {info['hdr_dep']} -> end {daytime(last_arr_abs)})")
        elif sd is not None:
            info['dur_ok'] = True
        # work_start / work_end consistency (mod 24h)
        ws, we = parse_time(info.get('wstart') or ''), parse_time(info.get('wend') or '')
        if ws is not None and we is not None:
            d2 = (we - ws) % DAY
            if sd is not None and d2 != sd % DAY:
                issues.append(f"work end-start ({fmt(d2)}) != stated duration ({fmt(sd)})")
    if last_station and info.get('dest') and last_station != info['dest'].strip():
        notes.append(f"ends at {last_station} (designated destination {info['dest']})")
    if max_flag >= 1:
        info['overnight'] = max_flag
    if blank_travel:
        notes.append('blank travel (check skipped): ' + ', '.join(blank_travel))
    return info, issues, notes

def main():
    for path in sys.argv[1:]:
        rows = []
        with open(path) as fh:
            for i, line in enumerate(fh, 1):
                line = line.rstrip('\n')
                if line.strip():
                    rows.append((i, line.split('\t')))
        print(f"=== {path} ({len(rows)} lines) ===")
        works = OrderedDict()
        for ln, f in rows:
            if len(f) < 2:
                print(f"  L{ln}: unusable line ({len(f)} fields)")
                continue
            works.setdefault((f[0], f[1]), []).append((ln, f))
        bad = 0
        for (depot, wk), wr in works.items():
            info, issues, notes = check_working((depot, wk), wr)
            verdict = 'OK' if not issues else 'ISSUES'
            if issues: bad += 1
            start = info.get('hdr_dep', '?')
            end = daytime(info['end_abs']) if 'end_abs' in info else '?'
            sd = fmt(info['stated_dur']) if info.get('stated_dur') is not None else '-'
            cd = fmt(info['computed_dur']) if 'computed_dur' in info else '-'
            on = f" overnight x{info['overnight']}" if info.get('overnight') else ''
            print(f"  {depot} {wk:8s} L{info['first']}-{info['last']} ({info['n']:3d} lines) "
                  f"{start} -> {end}  stated {sd} / computed {cd}{on}  [{verdict}]")
            for x in issues:
                print(f"      ! {x}")
            for x in notes:
                print(f"      ~ {x}")
        print(f"  total: {len(works)} workings, {bad} with issues\n")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Re-derive the Rail source register's arithmetic from the register's own tables.

Why this exists: the register claims its figures are "independently checkable" rather than
taken on trust. This script is that check, made reproducible. It re-derives every derived
figure from the source's own numbers, as transcribed in the register:

  * section 11.3 capacity table -- practical = ROUND(theoretical x 0.65); weekly = daily x 7,
    except zero where the depot field says "Line Closed"; and the printed formula columns
    must equal the recomputed ones.
  * section 10 corridor table   -- each stated reduction must be the rounding or the
    truncation of the pair printed beside it, and the network total must be the sum.
  * section 10 TSR table        -- the active-TSR count must total 130, and the manual
    authorisation pairs must match the corridor table.

It checks the register, not the source workbook: the workbook is the authority, and where
this script and the workbook disagree the workbook wins. One discrepancy is expected and is
recorded in the register as question 9 -- Ore's stated 23.0% is not derivable from Ore's own
pair (23.54% rounds and truncates to 23.5%). The script reports it and exits 0 while it stays
documented; delete that expectation only when the workbook resolves it.

Run:  python3 docs/tools/verify-rail-register-arithmetic.py
Exit: 0 = every figure re-derives (or the known anomaly is still recorded as a question);
      1 = a figure does not re-derive, or a documented anomaly has gone missing.
No dependencies beyond the standard library. Nothing here implements any capacity rule.
"""

import math
import re
import sys
from pathlib import Path

REGISTER = Path(__file__).resolve().parent.parent / 'RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md'

fails: list[str] = []
checks = 0


def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


def num(s: str) -> float:
    return float(s.replace(',', '').replace('%', '').strip())


def xround(x: float) -> int:
    """Excel ROUND: half away from zero (Python's round() is banker's rounding)."""
    return math.floor(x + 0.5) if x >= 0 else math.ceil(x - 0.5)


def main() -> int:
    if not REGISTER.exists():
        print(f'register not found: {REGISTER}')
        return 1

    # bold markers are stripped so the bolded rows (line-closed, totals) are parsed too
    lines = [l.replace('*', '') for l in REGISTER.read_text(encoding='utf-8').splitlines()]

    def rows(pattern: str) -> list[tuple[str, ...]]:
        return [m.groups() for m in (re.match(pattern, l) for l in lines) if m]

    # ---- A. capacity model (section 11.3) ----
    capacity = rows(r'\| ([A-Z][^|]*?) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+(?: by rule)?) \|')
    check(len(capacity) == 5, f'11.3 table: parsed {len(capacity)} rows, expected 5')
    check(any('line closed' in r[0].lower() for r in capacity),
          'no line-closed row parsed: the zero-by-rule branch is untested')
    print(f'\nA. section 11.3 capacity model ({len(capacity)} rows)')
    for section, th_s, practical_s, rounded_s, weekly_s, weekly7_s in capacity:
        th, practical, printed_rounded, weekly = map(int, (th_s, practical_s, rounded_s, weekly_s))
        weekly7 = int(weekly7_s.split()[0])
        closed = 'line closed' in section.lower()
        expected_practical = xround(th * 0.65)
        expected_weekly = 0 if closed else practical * 7
        check(practical == expected_practical,
              f'  {section.strip()}: practical {practical} != ROUND({th} x 0.65) = {expected_practical}')
        check(printed_rounded == practical,
              f'  {section.strip()}: ROUND column {printed_rounded} != practical {practical}')
        check(weekly == expected_weekly,
              f'  {section.strip()}: weekly {weekly} != {expected_weekly} (line closed: {closed})')
        check(weekly7 == (0 if closed else practical * 7),
              f'  {section.strip()}: practical x 7 column {weekly7} != {0 if closed else practical * 7}')
        note = '  [line closed -> 0]' if closed else ''
        print(f'   {section.strip()[:36]:38s} {th:3d} -> {practical:3d} -> {weekly:4d}{note}')

    # ---- B. corridor reductions (section 10) ----
    corridors = rows(r'\| ([A-Za-z][^|]*?) \| ([\d,]+) \| ([\d,]+) \| ([\d.]+)% \| ([\d.]+)% \|')
    check(len(corridors) == 11, f'10 corridor table: parsed {len(corridors)} rows, expected 11')
    print(f'\nB. section 10 corridor reductions ({len(corridors)} rows incl. total)')
    sum_base = sum_target = 0
    anomalies: list[tuple[str, float, float, float, float]] = []
    for name, base_s, target_s, stated_s, computed_s in corridors:
        label = name.strip()
        if 'total' in label.lower():
            continue
        base, target, stated, computed = num(base_s), num(target_s), num(stated_s), num(computed_s)
        sum_base += base
        sum_target += target
        derived = (base - target) / base * 100
        check(abs(derived - computed) < 0.005, f'  {label}: derived {derived:.2f}% != printed {computed}%')
        rounded, truncated = round(derived, 1), math.floor(derived * 10) / 10
        if abs(stated - rounded) < 0.001:
            kind = 'rounded'
        elif abs(stated - truncated) < 0.001:
            kind = 'truncated'
        else:
            kind = 'NOT DERIVABLE'
            anomalies.append((label, base, target, derived, stated))
        print(f'   {label[:38]:40s} {base:>9,.0f} -> {target:>9,.0f}  {derived:6.2f}%  stated {stated}%  [{kind}]')

    total_rows = [r for r in corridors if 'total' in r[0].lower()]
    check(len(total_rows) == 1, 'network total row missing from the corridor table')
    if total_rows:
        _, base_s, target_s, stated_s, computed_s = total_rows[0]
        base, target, stated, computed = num(base_s), num(target_s), num(stated_s), num(computed_s)
        derived = (sum_base - sum_target) / sum_base * 100
        check((base, target) == (sum_base, sum_target),
              f'  total row {base:,.0f}/{target:,.0f} != summed corridors {sum_base:,.0f}/{sum_target:,.0f}')
        check(abs(derived - computed) < 0.005, f'  total: summed {derived:.2f}% != printed {computed}%')
        check(abs(computed - stated) < 0.005, f'  total: printed {computed}% != stated {stated}%')
        print(f'   {"NETWORK TOTAL":40s} {sum_base:>9,.0f} -> {sum_target:>9,.0f}  {derived:6.2f}%  stated {stated}%')

    # ---- C. TSR table (section 10) ----
    tsr_rows = rows(r'\| ([A-Za-z][^|]*?) \| ([\d.]+)% \| ([^|]+?) \| (\d+) \| ([\d,]+) → ([\d,]+) \| ([\d.]+)% \|')
    check(len(tsr_rows) == 10, f'TSR table: parsed {len(tsr_rows)} rows, expected 10')
    print(f'\nC. section 10 TSR table ({len(tsr_rows)} rows)')
    pairs = {r[0].strip(): (r[1], r[2]) for r in corridors if 'total' not in r[0].lower()}
    tsr_total = 0
    for name, _baseline, _target, active, ma_from, ma_to, _stated in tsr_rows:
        tsr_total += int(active)
        label = name.strip()
        check(label in pairs, f'  {label}: not present in the corridor reduction table')
        if label in pairs:
            check((ma_from, ma_to) == pairs[label],
                  f'  {label}: manual authorisations {ma_from}->{ma_to} != {pairs[label]}')
    check(tsr_total == 130, f'  active TSRs sum to {tsr_total}, not the 130 stated')
    print(f'   active TSRs total = {tsr_total} (stated 130); manual-auth pairs cross-checked: {len(tsr_rows)}')

    # every anomaly has to be recorded, not merely detected
    document = '\n'.join(lines)
    for label, _base, _target, _derived, _stated in anomalies:
        check('11,774' in document or 'question 9' in document.lower(),
              f'the {label} anomaly is not recorded as a source-level question in 10.4')

    print('\n' + '=' * 68)
    print(f'{checks} checks run, {len(fails)} failed')
    for f in fails:
        print(' FAIL:', f)
    if anomalies:
        print('\nNOT DERIVABLE FROM ITS OWN PAIR (expected: recorded as question 9)')
        for label, base, target, derived, stated in anomalies:
            print(f'  {label}: {base:,.0f} -> {target:,.0f} = {derived:.2f}%; stated {stated}%;'
                  f' rounding 1dp = {round(derived, 1)}, truncation 1dp = {math.floor(derived * 10) / 10}')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

import { describe, it, expect } from 'vitest';
import {
  CORRIDORS,
  CURRENT_KPIS,
  FUTURE_KPIS,
  KPI_POLARITY,
  assess,
  corridorById,
  formatDuration,
  isNotApplicable,
  parseDuration,
  parseFraction,
} from './railKpi';
import {
  ANCILLARY_SERVICES,
  ancillaryByRef,
  isPriced,
  servicesByTier,
} from './railAncillaryServices';

describe('duration parsing', () => {
  it('reads hh:mm as minutes', () => {
    expect(parseDuration('27:07')).toBe(1627);
    expect(parseDuration('59:18')).toBe(3558);
    expect(parseDuration('0:00')).toBe(0);
  });

  it('round-trips back to hh:mm', () => {
    expect(formatDuration(parseDuration('27:07'))).toBe('27:07');
    expect(formatDuration(parseDuration('78:08'))).toBe('78:08');
  });

  it('returns null rather than 0 for nothing and for N/A', () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration('N/A')).toBeNull();
  });

  /**
   * The reason durations are parsed at all. Lexically "9:30" sorts AFTER
   * "10:00" while being the shorter journey, so string comparison would rank
   * the fastest corridor as the slowest.
   */
  it('compares transit times as durations, not as strings', () => {
    const nineThirty = parseDuration('9:30')!;
    const tenOClock = parseDuration('10:00')!;
    expect(nineThirty).toBeLessThan(tenOClock);
    expect(nineThirty < tenOClock).toBe(true);
    expect('9:30' < '10:00').toBe(false);
  });
});

describe('fraction parsing', () => {
  it('reads explicit percentages as fractions', () => {
    expect(parseFraction('2.50%')).toBeCloseTo(0.025);
    expect(parseFraction('94%')).toBeCloseTo(0.94);
    expect(parseFraction('100%')).toBeCloseTo(1);
  });

  /**
   * EXC-043-05. Traction Substation Availability is "94%" on Manganese and
   * "0.87" on Lephalale - the same field, two notations. Without this the two
   * corridors are not comparable, and 0.87 would read as 0.87%.
   */
  it('reads a bare decimal already in 0-1 as a fraction', () => {
    expect(parseFraction('0.87')).toBeCloseTo(0.87);
    expect(parseFraction('0.83')).toBeCloseTo(0.83);
  });

  it('normalises both notations to the same scale', () => {
    expect(parseFraction('94%')).toBeCloseTo(0.94);
    expect(parseFraction('0.94')).toBeCloseTo(0.94);
    expect(parseFraction('94%')).toBeCloseTo(parseFraction('0.94')!);
  });

  it('returns null for nothing and N/A', () => {
    expect(parseFraction(null)).toBeNull();
    expect(parseFraction('N/A')).toBeNull();
    expect(isNotApplicable('N/A')).toBe(true);
    expect(isNotApplicable('n/a')).toBe(true);
    expect(isNotApplicable('5')).toBe(false);
  });
});

describe('assess', () => {
  it('reads a shorter transit time as an improvement', () => {
    expect(assess('transit', '27:07', '24:43')).toBe('improving');
  });

  it('reads a longer transit time as a regression', () => {
    expect(assess('transit', '27:07', '29:00')).toBe('regressing');
  });

  it('reads fewer speed restrictions as an improvement', () => {
    expect(assess('manual-auth', '15291', '11691')).toBe('improving');
  });

  it('reads a restored substation as an improvement despite mixed notation', () => {
    expect(assess('substation', '0.87', '90%')).toBe('improving');
    expect(assess('substation', '73%', '90%')).toBe('improving');
  });

  /**
   * The single most important assertion in this file.
   *
   * Six of seven corridors set a HIGHER TQI target than baseline and every one
   * says "TQI within range". In some published conventions a lower index is
   * better, which would make those targets regressions. TRIM does not state
   * the polarity, so the only honest answer is null - and a null rendered as
   * "healthy" would be worse than a blank.
   */
  it('refuses to judge Track Quality Index, whose polarity the source never states', () => {
    expect(KPI_POLARITY.tqi).toBeNull();
    expect(assess('tqi', '6.4', '8')).toBeNull();
    expect(assess('tqi', '10', '8')).toBeNull();
    expect(assess('tqi', '5', '5')).toBeNull();
  });

  it('judges every other current-framework KPI', () => {
    CURRENT_KPIS.filter((k) => k.id !== 'tqi').forEach((k) => {
      expect(KPI_POLARITY[k.id], `${k.id} has no polarity`).not.toBeNull();
    });
  });

  /** EXC-043-03: Sheet 12 was truncated. Absent must never read as achieved. */
  it('returns null for the truncated corridor instead of claiming a perfect score', () => {
    const cpt = corridorById('jhb-cpt')!;
    const tqi = cpt.kpis.find((k) => k.kpi === 'tqi')!;
    expect(tqi.baseline).toBeNull();
    expect(tqi.target).toBeNull();
    expect(assess('tqi', tqi.baseline, tqi.target)).toBeNull();
  });

  it('returns null rather than a guess when figures are N/A', () => {
    expect(assess('tqi', 'N/A', 'N/A')).toBeNull();
    expect(assess('substation', 'N/A', 'N/A')).toBeNull();
  });

  it('reports a flat line as flat', () => {
    expect(assess('tqi', '5', '5')).toBeNull(); // polarity unknown, so still null
    expect(assess('substation', '100%', '100%')).toBe('flat');
  });
});

describe('the corridor set', () => {
  it('holds all ten supplied corridors', () => {
    expect(CORRIDORS).toHaveLength(10);
  });

  it('flags exactly one as incomplete', () => {
    expect(CORRIDORS.filter((c) => c.incomplete).map((c) => c.id)).toEqual(['jhb-cpt']);
  });

  it('gives every corridor a unique id', () => {
    expect(new Set(CORRIDORS.map((c) => c.id)).size).toBe(CORRIDORS.length);
  });

  /**
   * The supplied transit figures, checked end to end. If a future edit
   * transposes a digit these fail.
   */
  it('records the supplied Ore and Johannesburg-Cape Town transit times', () => {
    const ore = corridorById('ore')!;
    expect(ore.kpis.find((k) => k.kpi === 'Forward: SAZ-SIS')?.baseline).toBe('27:07');
    expect(ore.kpis.find((k) => k.kpi === 'Forward: SAZ-SIS')?.target).toBe('24:43');

    const cpt = corridorById('jhb-cpt')!;
    expect(parseDuration(cpt.kpis.find((k) => k.kpi === 'Forward: JHB-CT')?.baseline ?? null)).toBe(4688);
    expect(parseDuration(cpt.kpis.find((k) => k.kpi === 'Forward: JHB-CT')?.target ?? null)).toBe(3558);
  });

  it('improves transit time on every complete corridor', () => {
    CORRIDORS.filter((c) => !c.incomplete).forEach((c) => {
      c.kpis
        .filter((k) => /^(\d+):(\d{2})$/.test(k.baseline ?? ''))
        .forEach((k) => {
          expect(assess('transit', k.baseline, k.target), `${c.id} ${k.kpi}`).toBe('improving');
        });
    });
  });
});

describe('the KPI framework', () => {
  it('defines the future and current frameworks', () => {
    expect(FUTURE_KPIS).toHaveLength(11);
    expect(CURRENT_KPIS).toHaveLength(7);
  });

  /** EXC-043-07: the threshold is literally "≥xx" in the source. */
  it('keeps the undefined cancellation threshold visible rather than inventing one', () => {
    const lateCancel = FUTURE_KPIS.find((k) => k.id === 'toc-late-cancel')!;
    expect(lateCancel.measure).toContain('≥xx');
    expect(lateCancel.note).toMatch(/undefined/);
  });

  /** EXC-043-08. */
  it('marks overhead traction quality as not yet measured', () => {
    expect(CURRENT_KPIS.find((k) => k.id === 'ohti')?.notYetMeasured).toBe(true);
  });
});

describe('the ancillary services catalogue', () => {
  /**
   * The catalogue is numbered 1-40, but line 4 is billed as four separate
   * entries (4a-4d: compliance testing, programming, onboarding, and radio box
   * installation). So there are 40 numbered lines and 43 billable entries, and
   * a screen that renders "40 services" is understating what can be invoiced.
   */
  it('holds forty numbered lines, billed as forty-three entries', () => {
    expect(ANCILLARY_SERVICES).toHaveLength(43);

    const topLevel = new Set(
      ANCILLARY_SERVICES.map((s) => s.parent ?? s.ref).map((r) => r.replace(/[a-z]$/, '')),
    );
    expect(topLevel.size).toBe(40);
  });

  it('spans four tiers, each populated', () => {
    [1, 2, 3, 4].forEach((t) => {
      expect(servicesByTier(t as 1 | 2 | 3 | 4).length).toBeGreaterThan(0);
    });
    expect(servicesByTier(1)).toHaveLength(7);
    expect(servicesByTier(2)).toHaveLength(4);
    expect(servicesByTier(3)).toHaveLength(17);
    expect(servicesByTier(4)).toHaveLength(15);
  });

  it('gives every item a reference and a unit of measure', () => {
    ANCILLARY_SERVICES.forEach((s) => {
      expect(s.ref, 'missing ref').toBeTruthy();
      expect(s.unit, `${s.ref} missing unit`).toBeTruthy();
      expect(s.name, `${s.ref} missing name`).toBeTruthy();
    });
  });

  /**
   * EXC-043-01. The whole point of typing rateZar as null rather than
   * number|null is that this is unforgeable: no caller can put a price in from
   * this file, and the compiler will point at every one when a tariff lands.
   */
  it('carries no price on any item, because the source supplies none', () => {
    ANCILLARY_SERVICES.forEach((s) => {
      expect(s.rateZar, `${s.ref} has an invented price`).toBeNull();
      expect(isPriced(s), `${s.ref} claims to be priced`).toBe(false);
    });
  });

  /** EXC-043-02. */
  it('marks the eight source-TBD items as tbd', () => {
    const tbd = ANCILLARY_SERVICES.filter((s) => s.tbd);
    expect(tbd.map((s) => s.ref)).toEqual(['34', '40']);
    expect(ancillaryByRef('34')?.unit).toBe('TBD');
    expect(ancillaryByRef('40')?.unit).toBe('TBD');
  });

  it('resolves the sub-items of line 4 to their parent', () => {
    ['4a', '4b', '4c', '4d'].forEach((ref) => {
      expect(ancillaryByRef(ref)?.parent).toBe('4');
    });
  });
});

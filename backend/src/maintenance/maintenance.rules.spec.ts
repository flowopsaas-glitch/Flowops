import {
  MAX_WARRANTY_TERM_DAYS,
  availability,
  canTransition,
  checkMeterReading,
  checkWarrantyTerm,
  costAmount,
  costPerOperatingUnit,
  downtimeMinutes,
  faultPattern,
  findComeback,
  isWarrantyComeback,
  maintenanceVerdict,
  nextJobNumber,
  overlapMinutes,
  summariseCosts,
  transitionRefusal,
  warrantyExpiry,
  warrantyPosition,
} from './maintenance.rules';

/**
 * The rules of a job card.
 *
 * These tests are about the refusals and the three-valued answers, not the
 * arithmetic. Anyone can compute `completedAt - reportedAt`; the things that
 * cost a business money are the answers it gives when a fact is *missing*:
 *
 *  - a warranty with no recorded term is UNKNOWN, never "expired";
 *  - planned downtime is null, never zero (zero would average in);
 *  - availability from no basis is null, never 100%;
 *  - a meter cannot run backwards.
 */

const at = (iso: string) => new Date(iso);

describe('job lifecycle', () => {
  it('allows a card to be completed straight from REPORTED — the yard captures after the fact', () => {
    expect(canTransition('REPORTED', 'COMPLETED')).toBe(true);
  });

  it('refuses to reopen a signed-off card', () => {
    expect(canTransition('SIGNED_OFF', 'IN_PROGRESS')).toBe(false);
    expect(transitionRefusal('SIGNED_OFF', 'IN_PROGRESS')).toMatch(/raise a new job/i);
  });

  it('allows cancelling a completed card but never a signed-off one', () => {
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(true);
    expect(canTransition('SIGNED_OFF', 'CANCELLED')).toBe(false);
  });

  it('says why a transition was refused instead of failing silently', () => {
    const reason = transitionRefusal('REPORTED', 'SIGNED_OFF');
    expect(reason).toContain('reported');
    expect(reason).toContain('signed off');
  });

  it('derives the next job number from the last, not from a count', () => {
    expect(nextJobNumber('MJ-2026-0007', 2026)).toBe('MJ-2026-0008');
    // A deleted-looking gap does not cause a reuse: 0009 is next after 0008,
    // even if 0007 is the one on file.
    expect(nextJobNumber(null, 2026)).toBe('MJ-2026-0001');
    expect(nextJobNumber('MJ-2025-0042', 2026)).toBe('MJ-2026-0001');
  });
});

describe('warranty term', () => {
  it('accepts a number of days and reports it', () => {
    expect(checkWarrantyTerm(30)).toEqual({ ok: true, days: 30 });
    expect(checkWarrantyTerm('90')).toEqual({ ok: true, days: 90 });
  });

  it('treats an omitted term as "not recorded", which is allowed', () => {
    expect(checkWarrantyTerm(undefined)).toEqual({ ok: true, days: null });
    expect(checkWarrantyTerm(null)).toEqual({ ok: true, days: null });
    expect(checkWarrantyTerm('')).toEqual({ ok: true, days: null });
  });

  it('refuses "lifetime" and says what it will do instead', () => {
    const result = checkWarrantyTerm('lifetime');
    expect(result.ok).toBe(false);
    expect(result.days).toBeNull();
    expect(result.reason).toMatch(/cannot be recorded/i);
    expect(result.reason).toMatch(/agreement/i);
  });

  it('refuses zero days — that is no warranty, not a short one', () => {
    expect(checkWarrantyTerm(0)).toMatchObject({ ok: false });
  });

  it('refuses a term beyond the ten-year ceiling', () => {
    expect(checkWarrantyTerm(MAX_WARRANTY_TERM_DAYS).ok).toBe(true);
    const over = checkWarrantyTerm(MAX_WARRANTY_TERM_DAYS + 1);
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/cannot price/i);
  });

  it('refuses fractional and negative terms', () => {
    expect(checkWarrantyTerm(1.5).ok).toBe(false);
    expect(checkWarrantyTerm(-30).ok).toBe(false);
    expect(checkWarrantyTerm('thirty').ok).toBe(false);
  });

  it('starts the clock at completion, not at sign-off', () => {
    const expiry = warrantyExpiry(at('2026-11-01T08:00:00Z'), 30);
    expect(expiry?.toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });

  it('returns null — not a date — when there is no term', () => {
    expect(warrantyExpiry(at('2026-11-01T08:00:00Z'), null)).toBeNull();
    expect(warrantyExpiry(null, 30)).toBeNull();
  });
});

describe('warranty position', () => {
  const completed = {
    status: 'COMPLETED' as const,
    completedAt: at('2026-10-01T08:00:00Z'),
    warrantyTermDays: 30,
  };

  it('is IN_WARRANTY inside the window', () => {
    expect(warrantyPosition(completed, at('2026-10-15T00:00:00Z'))).toBe('IN_WARRANTY');
  });

  it('is OUT_OF_WARRANTY after it', () => {
    expect(warrantyPosition(completed, at('2026-11-15T00:00:00Z'))).toBe('OUT_OF_WARRANTY');
  });

  /**
   * The single most important assertion in this file. Treating a missing term as
   * "expired" would let the platform tell an operator their own rework is
   * chargeable, which is a commercial decision no database should make.
   */
  it('is UNKNOWN — not OUT — when no term was ever recorded', () => {
    const noTerm = { status: 'COMPLETED' as const, completedAt: at('2026-10-01T08:00:00Z') };
    expect(warrantyPosition(noTerm, at('2027-01-01T00:00:00Z'))).toBe('UNKNOWN');
  });

  it('is UNKNOWN for a card that never completed, and for a cancelled one', () => {
    expect(warrantyPosition({ status: 'REPORTED', reportedAt: at('2026-10-01T00:00:00Z') } as any)).toBe('UNKNOWN');
    expect(
      warrantyPosition({ ...completed, status: 'CANCELLED' as const }, at('2026-10-02T00:00:00Z')),
    ).toBe('UNKNOWN');
  });

  it('accepts a stored expiry over re-deriving one', () => {
    const stored = { ...completed, warrantyExpiresAt: at('2026-10-02T08:00:00Z') };
    expect(warrantyPosition(stored, at('2026-10-03T00:00:00Z'))).toBe('OUT_OF_WARRANTY');
  });
});

describe('downtime', () => {
  it('counts a closed breakdown from report to completion', () => {
    const minutes = downtimeMinutes({
      type: 'BREAKDOWN',
      status: 'COMPLETED',
      reportedAt: at('2026-11-01T06:00:00Z'),
      completedAt: at('2026-11-01T09:30:00Z'),
    });
    expect(minutes).toBe(210);
  });

  it('counts an open breakdown up to now — a unit down for six days is six days down', () => {
    const minutes = downtimeMinutes(
      { type: 'BREAKDOWN', status: 'IN_PROGRESS', reportedAt: at('2026-11-01T00:00:00Z') },
      at('2026-11-02T00:00:00Z'),
    );
    expect(minutes).toBe(1440);
  });

  it('returns null for planned work and inspections — scheduled is not lost', () => {
    const base = {
      status: 'COMPLETED' as const,
      reportedAt: at('2026-11-01T06:00:00Z'),
      completedAt: at('2026-11-01T10:00:00Z'),
    };
    expect(downtimeMinutes({ ...base, type: 'PLANNED' })).toBeNull();
    expect(downtimeMinutes({ ...base, type: 'INSPECTION' })).toBeNull();
  });

  it('returns null for a cancelled card', () => {
    expect(
      downtimeMinutes({
        type: 'BREAKDOWN',
        status: 'CANCELLED',
        reportedAt: at('2026-11-01T06:00:00Z'),
        completedAt: at('2026-11-01T09:00:00Z'),
      }),
    ).toBeNull();
  });

  it('never returns a negative duration from a back-dated correction', () => {
    expect(
      downtimeMinutes({
        type: 'BREAKDOWN',
        status: 'COMPLETED',
        reportedAt: at('2026-11-01T09:00:00Z'),
        completedAt: at('2026-11-01T08:00:00Z'),
      }),
    ).toBe(0);
  });
});

describe('availability', () => {
  it('carries its basis and rounds to one decimal', () => {
    const result = availability(180, 1440);
    expect(result.percent).toBe(87.5);
    expect(result.basisMinutes).toBe(1440);
    expect(result.downtimeMinutes).toBe(180);
  });

  it('returns null rather than 100% when there is no basis', () => {
    expect(availability(0, 0)).toEqual({ percent: null, basisMinutes: 0, downtimeMinutes: 0 });
  });

  it('clamps downtime to the basis so a long job cannot produce a negative', () => {
    expect(availability(2000, 1440).percent).toBe(0);
  });

  it('counts only the part of a job that falls inside the window', () => {
    const minutes = overlapMinutes(
      at('2026-10-01T00:00:00Z'),
      at('2026-10-11T00:00:00Z'),
      at('2026-10-06T00:00:00Z'),
      at('2026-10-16T00:00:00Z'),
    );
    expect(minutes).toBe(5 * 1440);
  });
});

describe('comebacks', () => {
  const assetId = 'asset-1';
  const faultCodeId = 'fault-hyd';

  const earlier = {
    id: 'job-1',
    assetId,
    faultCodeId,
    status: 'COMPLETED' as const,
    reportedAt: at('2026-10-01T08:00:00Z'),
    completedAt: at('2026-10-01T12:00:00Z'),
    warrantyTermDays: 30,
  };

  it('links a repeat of the same fault on the same unit', () => {
    const found = findComeback(
      { id: 'new', assetId, faultCodeId, status: 'REPORTED', reportedAt: at('2026-10-20T08:00:00Z') },
      [earlier],
    );
    expect(found?.id).toBe('job-1');
  });

  it('does not link a different fault, or a different unit', () => {
    const current = { id: 'new', assetId, faultCodeId, status: 'REPORTED' as const, reportedAt: at('2026-10-20T08:00:00Z') };
    expect(findComeback(current, [{ ...earlier, faultCodeId: 'fault-elec' }])).toBeNull();
    expect(findComeback(current, [{ ...earlier, assetId: 'asset-2' }])).toBeNull();
  });

  it('does not link against a card that was never completed', () => {
    const found = findComeback(
      { id: 'new', assetId, faultCodeId, status: 'REPORTED', reportedAt: at('2026-10-20T08:00:00Z') },
      [{ ...earlier, status: 'CANCELLED', completedAt: null } as any],
    );
    expect(found).toBeNull();
  });

  it('will not group on free text — no fault code means no comeback', () => {
    const found = findComeback(
      { id: 'new', assetId, faultCodeId: null, status: 'REPORTED', reportedAt: at('2026-10-20T08:00:00Z') },
      [earlier],
    );
    expect(found).toBeNull();
  });

  it('is a warranty comeback only while the earlier job is still covered', () => {
    expect(isWarrantyComeback(earlier, at('2026-10-20T08:00:00Z'))).toBe(true);
    expect(isWarrantyComeback(earlier, at('2026-12-20T08:00:00Z'))).toBe(false);
    // No term recorded is not "expired" — it simply is not a warranty comeback.
    expect(isWarrantyComeback({ ...earlier, warrantyTermDays: null }, at('2026-10-20T08:00:00Z'))).toBe(false);
  });

  it('takes the most recent matching job as the predecessor', () => {
    const older = { ...earlier, id: 'job-0', completedAt: at('2026-09-01T12:00:00Z') };
    const found = findComeback(
      { id: 'new', assetId, faultCodeId, status: 'REPORTED', reportedAt: at('2026-10-20T08:00:00Z') },
      [older, earlier],
    );
    expect(found?.id).toBe('job-1');
  });
});

describe('costs', () => {
  it('multiplies to cents', () => {
    expect(costAmount(3, 412.345)).toBe(1237.04);
  });

  it('summarises by kind and counts the rows behind the total', () => {
    const summary = summariseCosts([
      { kind: 'PART', amount: 1200 },
      { kind: 'PART', amount: 300.5 },
      { kind: 'LABOUR', amount: 900 },
    ]);
    expect(summary.total).toBe(2400.5);
    expect(summary.byKind.PART).toBe(1500.5);
    expect(summary.byKind.LABOUR).toBe(900);
    expect(summary.rows).toBe(3);
  });

  it('reports cost per hour, and null when the meter has not moved', () => {
    expect(costPerOperatingUnit(1200, 1000, 1100)).toBe(12);
    expect(costPerOperatingUnit(1200, 1000, 1000)).toBeNull();
    expect(costPerOperatingUnit(1200, 1100, 1000)).toBeNull();
    expect(costPerOperatingUnit(1200, null, 1100)).toBeNull();
  });
});

describe('meter integrity', () => {
  it('accepts a forward reading', () => {
    expect(checkMeterReading(1090, 1000)).toEqual({ ok: true });
  });

  it('refuses a reading lower than the last accepted one, and explains what to do', () => {
    const result = checkMeterReading(900, 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/replaced/i);
    expect(result.reason).toMatch(/cost-per-hour/i);
  });

  it('accepts the first reading on a unit with no history', () => {
    expect(checkMeterReading(0, null)).toEqual({ ok: true });
  });

  it('refuses nonsense', () => {
    expect(checkMeterReading(-5, 0).ok).toBe(false);
    expect(checkMeterReading('1000' as unknown as number, 0).ok).toBe(false);
    expect(checkMeterReading(Number.NaN, 0).ok).toBe(false);
  });
});

describe('fault pattern', () => {
  it('groups by fault code, counting downtime and comebacks', () => {
    const rows = faultPattern([
      {
        id: 'j1',
        assetId: 'a1',
        faultCodeId: 'hyd',
        status: 'COMPLETED',
        reportedAt: at('2026-10-01T00:00:00Z'),
        downtimeMinutes: 120,
        priorJobId: null,
      },
      {
        id: 'j2',
        assetId: 'a1',
        faultCodeId: 'hyd',
        status: 'COMPLETED',
        reportedAt: at('2026-10-10T00:00:00Z'),
        downtimeMinutes: 240,
        priorJobId: 'j1',
      },
      {
        id: 'j3',
        assetId: 'a1',
        faultCodeId: 'elec',
        status: 'COMPLETED',
        reportedAt: at('2026-10-12T00:00:00Z'),
        downtimeMinutes: 30,
        priorJobId: null,
      },
    ]);

    expect(rows[0]).toMatchObject({ faultCodeId: 'hyd', occurrences: 2, totalDowntimeMinutes: 360, comebacks: 1 });
    expect(rows[1]).toMatchObject({ faultCodeId: 'elec', occurrences: 1 });
  });

  it('ignores cancelled cards — the fault did not happen', () => {
    const rows = faultPattern([
      {
        id: 'j1',
        assetId: 'a1',
        faultCodeId: 'hyd',
        status: 'CANCELLED',
        reportedAt: at('2026-10-01T00:00:00Z'),
        downtimeMinutes: null,
        priorJobId: null,
      },
    ]);
    expect(rows).toEqual([]);
  });
});

describe('the fleet verdict', () => {
  const now = at('2026-11-04T12:00:00Z');

  const assets = [
    { id: 'a1', assetCode: 'RS-014', name: 'Stacker 14', status: 'IN_SERVICE' as const },
    { id: 'a2', assetCode: 'RS-015', name: null, status: 'DOWN' as const },
  ];

  it('says nothing when nothing is wrong', () => {
    const verdict = maintenanceVerdict({ assets: [assets[0]], jobs: [], windowDays: 30, now });
    expect(verdict.status).toBe('ok');
    expect(verdict.findings).toEqual([]);
    expect(verdict.metrics.availabilityPercent).toBe(100);
  });

  it('states availability with the window and the hours lost', () => {
    const verdict = maintenanceVerdict({
      assets: [assets[0]],
      jobs: [
        {
          id: 'j1',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'COMPLETED',
          reportedAt: at('2026-11-03T12:00:00Z'),
          completedAt: at('2026-11-04T12:00:00Z'),
        },
      ],
      windowDays: 30,
      now,
    });
    // 24 hours down on one unit over 30 days is 96.7%: a real number, and above
    // the 95% line, so it must be shown without raising an alarm. The threshold
    // is a policy, not a feeling.
    expect(verdict.metrics.availabilityPercent).toBe(96.7);
    expect(verdict.metrics.downtimeHours).toBe(24);
    expect(verdict.status).toBe('ok');
  });

  it('names a unit that has been down too long, with its age', () => {
    const verdict = maintenanceVerdict({
      assets,
      jobs: [
        {
          id: 'j1',
          assetId: 'a2',
          type: 'BREAKDOWN',
          status: 'IN_PROGRESS',
          reportedAt: at('2026-10-28T12:00:00Z'),
        },
      ],
      windowDays: 30,
      now,
    });
    expect(verdict.status).toBe('attention');
    const finding = verdict.findings.find((f) => f.code === 'long_down:a2');
    expect(finding?.message).toContain('168 hours');
    expect(finding?.message).toMatch(/contractual problem/i);
  });

  it('names cards nobody has started', () => {
    const verdict = maintenanceVerdict({
      assets: [assets[0]],
      jobs: [
        { id: 'j1', assetId: 'a1', type: 'BREAKDOWN', status: 'REPORTED', reportedAt: at('2026-11-01T12:00:00Z') },
      ],
      windowDays: 30,
      now,
    });
    const finding = verdict.findings.find((f) => f.code === 'stalled');
    expect(finding).toBeTruthy();
    expect(finding?.message).toContain('72 hours');
  });

  it('counts rework inside a warranty window as exposure, and only where a term exists', () => {
    const priorJob = {
      status: 'COMPLETED' as const,
      completedAt: at('2026-10-20T12:00:00Z'),
      warrantyTermDays: 30,
    };
    const verdict = maintenanceVerdict({
      assets: [assets[0]],
      jobs: [
        {
          id: 'j2',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'COMPLETED',
          reportedAt: at('2026-10-30T12:00:00Z'),
          completedAt: at('2026-10-31T12:00:00Z'),
          priorJobId: 'j1',
          priorJob,
          costs: [{ amount: 2400 }],
        },
      ],
      windowDays: 30,
      now,
      currency: 'ZAR',
    });
    expect(verdict.metrics.warrantyExposure).toBe(2400);
    const finding = verdict.findings.find((f) => f.code === 'warranty');
    expect(finding?.message).toContain('ZAR 2 400.00');

    const noTerm = maintenanceVerdict({
      assets: [assets[0]],
      jobs: [
        {
          id: 'j2',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'COMPLETED',
          reportedAt: at('2026-10-30T12:00:00Z'),
          completedAt: at('2026-10-31T12:00:00Z'),
          priorJobId: 'j1',
          priorJob: { ...priorJob, warrantyTermDays: null },
          costs: [{ amount: 2400 }],
        },
      ],
      windowDays: 30,
      now,
    });
    expect(noTerm.metrics.warrantyExposure).toBe(0);
  });

  it('excludes retired units from availability instead of counting them as available', () => {
    const verdict = maintenanceVerdict({
      assets: [{ id: 'a9', assetCode: 'OLD-1', name: null, status: 'RETIRED' }],
      jobs: [],
      windowDays: 30,
      now,
    });
    expect(verdict.metrics.assets).toBe(0);
    expect(verdict.headline).toMatch(/no assets/i);
  });
});

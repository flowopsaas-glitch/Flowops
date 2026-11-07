import {
  COMMERCIAL_THRESHOLDS,
  DEFAULT_EXPECTED_REPAIR_HOURS,
  MAX_WARRANTY_TERM_DAYS,
  WARRANTY_SERVICE_GRACE_DAYS,
  assetWarrantyStanding,
  authorityWaitIsFinding,
  availability,
  canTransition,
  checkCommercialUpdate,
  checkMeterReading,
  checkWarrantyTerm,
  commercialChain,
  costAmount,
  costPerOperatingUnit,
  downtimeMinutes,
  expectedRepairHours,
  faultPattern,
  findComeback,
  isWarrantyComeback,
  keepsWarrantyAlive,
  longDownLimitHours,
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

/**
 * The term is the promise; the service is what keeps the promise standing.
 *
 * Every case below comes from one sentence: 30 months on the fuel tanks,
 * extending to engine, injection sets and pumps, kept alive by one labour-only
 * service a year. A record that counted days only would call a machine nobody
 * has touched in two years "in warranty", and be wrong on the day it mattered.
 */
describe('the warranty on the machine', () => {
  const delivered = at('2026-01-01T00:00:00Z');
  const terms = {
    warrantyStartAt: delivered,
    warrantyTermDays: 913, // 30 months
    warrantyServiceIntervalDays: 365,
  };

  it('is IN_WARRANTY while the term is live and the annual service is done', () => {
    const standing = assetWarrantyStanding(
      { ...terms, lastServiceAt: at('2026-10-01T00:00:00Z') },
      at('2026-11-04T00:00:00Z'),
    );
    expect(standing.state).toBe('IN_WARRANTY');
    expect(standing.daysOverdue).toBe(0);
    expect(standing.expiresAt?.toISOString()).toBe('2028-07-02T00:00:00.000Z');
  });

  it('is SERVICE_OVERDUE — not IN — when the service that keeps it alive is missing', () => {
    // Serviced once, nine months in, then forgotten. The term runs to mid-2028.
    const standing = assetWarrantyStanding(
      { ...terms, lastServiceAt: at('2026-09-30T00:00:00Z') },
      at('2028-01-15T00:00:00Z'),
    );
    expect(standing.state).toBe('SERVICE_OVERDUE');
    expect(standing.daysOverdue).toBeGreaterThan(0);
  });

  it('gives the annual service a grace month before calling it late', () => {
    // Service due 2027-01-01, grace to 2027-01-31.
    const inGrace = assetWarrantyStanding({ ...terms }, at('2027-01-31T00:00:00Z'));
    const justPast = assetWarrantyStanding({ ...terms }, at('2027-02-01T00:00:00Z'));
    expect(inGrace.state).toBe('IN_WARRANTY');
    expect(justPast.state).toBe('SERVICE_OVERDUE');
    expect(WARRANTY_SERVICE_GRACE_DAYS).toBe(30);
  });

  it('dates the first service from delivery when nothing has ever been serviced', () => {
    const standing = assetWarrantyStanding({ ...terms }, at('2027-06-01T00:00:00Z'));
    expect(standing.neverServiced).toBe(true);
    expect(standing.serviceDueAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(standing.serviceGraceEndsAt?.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(standing.state).toBe('SERVICE_OVERDUE');
  });

  it('lets an expiry beat an overdue service — past the term there is nothing to keep alive', () => {
    // 30 months from 2026-01-01 is 2028-07-02; nothing serviced since.
    const standing = assetWarrantyStanding({ ...terms }, at('2028-09-01T00:00:00Z'));
    expect(standing.state).toBe('OUT_OF_WARRANTY');
  });

  it('does not let a pre-delivery service buy an extra year', () => {
    // Serviced during commissioning, three weeks before the term began.
    const standing = assetWarrantyStanding(
      { ...terms, lastServiceAt: at('2025-12-10T00:00:00Z') },
      at('2027-02-01T00:00:00Z'),
    );
    expect(standing.state).toBe('SERVICE_OVERDUE');
    expect(standing.daysOverdue).toBe(1);
  });

  it('is UNKNOWN — never OUT — when no term was ever written down', () => {
    const standing = assetWarrantyStanding({}, at('2027-01-01T00:00:00Z'));
    expect(standing.state).toBe('UNKNOWN');
    expect(standing.expiresAt).toBeNull();
    expect(standing.serviceDueAt).toBeNull();
  });

  it('treats a term with no service condition as a plain clock', () => {
    const standing = assetWarrantyStanding(
      { warrantyStartAt: delivered, warrantyTermDays: 365 },
      at('2026-12-15T00:00:00Z'),
    );
    expect(standing.state).toBe('IN_WARRANTY');
    expect(standing.serviceDueAt).toBeNull();
  });

  it('counts what keeps a warranty alive: the service and the inspection, not the breakdown', () => {
    expect(keepsWarrantyAlive('PLANNED')).toBe(true);
    expect(keepsWarrantyAlive('INSPECTION')).toBe(true);
    // The machine failing is not the operator maintaining it; a recall is the
    // supplier's action, not the operator's compliance.
    expect(keepsWarrantyAlive('BREAKDOWN')).toBe(false);
    expect(keepsWarrantyAlive('RECALL')).toBe(false);
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

  it('names a unit that has been down too long, with its age and the expectation behind it', () => {
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
    // The finding states the expectation it judged against, so an operator can
    // disagree with the number rather than with the alarm.
    expect(finding?.message).toMatch(/expected to take about 48 hours/i);
    expect(finding?.message).toMatch(/past 72/i);
  });

  /**
   * The thresholds a terminal operator gave us, turned into a test.
   *
   * A five-day RTG repair is correct work. A flat 72-hour limit used to flag
   * every one of them for its last two days — and every three-day straddle
   * repair the moment it was finished. An alarm that fires on correct work is
   * how operators learn to ignore the panel.
   */
  describe('long-down is judged against the class, not a flat limit', () => {
    const fleet = [
      { id: 'rtg-1', assetCode: 'RTG-07', name: null, status: 'DOWN' as const, assetClass: 'RTG' as const },
      { id: 'sc-1', assetCode: 'SC-33', name: null, status: 'DOWN' as const, assetClass: 'STRADDLE_CARRIER' as const },
    ];

    const downFor = (assetId: string, hours: number) => ({
      id: `job-${assetId}`,
      assetId,
      type: 'BREAKDOWN' as const,
      status: 'IN_PROGRESS' as const,
      reportedAt: new Date(now.getTime() - hours * 3600000),
    });

    it('does not flag an RTG on day 5 — that is the repair done properly', () => {
      const verdict = maintenanceVerdict({ assets: fleet, jobs: [downFor('rtg-1', 120)], windowDays: 30, now });
      expect(verdict.findings.some((f) => f.code === 'long_down:rtg-1')).toBe(false);
    });

    it('does not flag a straddle carrier on day 3', () => {
      const verdict = maintenanceVerdict({ assets: fleet, jobs: [downFor('sc-1', 72)], windowDays: 30, now });
      expect(verdict.findings.some((f) => f.code === 'long_down:sc-1')).toBe(false);
    });

    it('flags an RTG at 8 days, past 1.5× the five-day expectation', () => {
      const verdict = maintenanceVerdict({ assets: fleet, jobs: [downFor('rtg-1', 192)], windowDays: 30, now });
      const finding = verdict.findings.find((f) => f.code === 'long_down:rtg-1');
      expect(finding).toBeTruthy();
      expect(finding?.message).toMatch(/expected to take about 120 hours/i);
      expect(finding?.message).toMatch(/past 180/i);
    });

    it('flags a straddle carrier at 5 days, which is already past its limit', () => {
      const verdict = maintenanceVerdict({ assets: fleet, jobs: [downFor('sc-1', 120)], windowDays: 30, now });
      expect(verdict.findings.some((f) => f.code === 'long_down:sc-1')).toBe(true);
    });

    it('keeps the old 72-hour behaviour for a class nobody has measured', () => {
      const unknownClass = [{ id: 'a1', assetCode: 'GEN-1', name: null, status: 'DOWN' as const }];
      // Only the long-down finding is under test here: 71 hours down on a
      // single unit is 90% availability, so the verdict legitimately has other
      // things to say about it.
      expect(
        maintenanceVerdict({ assets: unknownClass, jobs: [downFor('a1', 71)], windowDays: 30, now }).findings.some(
          (f) => f.code === 'long_down:a1',
        ),
      ).toBe(false);
      expect(
        maintenanceVerdict({ assets: unknownClass, jobs: [downFor('a1', 73)], windowDays: 30, now }).findings.some(
          (f) => f.code === 'long_down:a1',
        ),
      ).toBe(true);
    });
  });

  it('reports the expected repair time it used, per class', () => {
    expect(expectedRepairHours('RTG')).toBe(120);
    expect(expectedRepairHours('STRADDLE_CARRIER')).toBe(72);
    expect(expectedRepairHours('HAULER')).toBe(DEFAULT_EXPECTED_REPAIR_HOURS);
    expect(expectedRepairHours(null)).toBe(DEFAULT_EXPECTED_REPAIR_HOURS);
    expect(longDownLimitHours('RTG')).toBe(180);
    expect(longDownLimitHours('STRADDLE_CARRIER')).toBe(108);
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

/**
 * The number that gets reported is the fleet; the number that gets acted on is
 * the class.
 *
 * 22 RTGs, 60 straddle carriers and 40 haulers at 94% is not one problem — it
 * is a straddle problem hiding inside an average. These tests pin that the
 * grouping is honest: the same downtime arithmetic as the headline, the class's
 * own expected repair time, and the worst class first.
 */
describe('the class rollup', () => {
  const now = at('2026-11-04T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  const fleet = [
    { id: 'r1', assetCode: 'RTG-01', name: null, status: 'IN_SERVICE' as const, assetClass: 'RTG' as const },
    { id: 'r2', assetCode: 'RTG-02', name: null, status: 'IN_SERVICE' as const, assetClass: 'RTG' as const },
    { id: 's1', assetCode: 'SC-01', name: null, status: 'DOWN' as const, assetClass: 'STRADDLE_CARRIER' as const },
    { id: 'h1', assetCode: 'HL-01', name: null, status: 'IN_SERVICE' as const, assetClass: 'HAULER' as const },
  ];

  it('answers per class, worst availability first', () => {
    const verdict = maintenanceVerdict({
      assets: fleet,
      jobs: [
        {
          id: 'j1',
          assetId: 's1',
          type: 'BREAKDOWN',
          status: 'IN_PROGRESS',
          reportedAt: new Date(now.getTime() - 10 * day),
        },
      ],
      windowDays: 30,
      now,
    });

    expect(verdict.byClass.map((row) => row.assetClass)).toEqual(['STRADDLE_CARRIER', 'RTG', 'HAULER']);

    const straddles = verdict.byClass[0];
    expect(straddles.units).toBe(1);
    expect(straddles.unitsDown).toBe(1);
    expect(straddles.availabilityPercent).toBe(66.7);
    expect(straddles.longestDownHours).toBe(240);
    expect(straddles.label).toBe('Straddle carrier');

    // The classes that are fine are still shown — a rollup that only lists
    // problems cannot answer "is anything else going wrong?".
    expect(verdict.byClass.find((row) => row.assetClass === 'RTG')?.availabilityPercent).toBe(100);
  });

  it('carries each class\'s own expected repair time, so the card can say when it will be flagged', () => {
    const verdict = maintenanceVerdict({ assets: fleet, jobs: [], windowDays: 30, now });
    const rtg = verdict.byClass.find((row) => row.assetClass === 'RTG');
    expect(rtg?.expectedRepairHours).toBe(120);
    expect(rtg?.longDownLimitHours).toBe(180);
    expect(verdict.byClass.find((row) => row.assetClass === 'HAULER')?.expectedRepairHours).toBe(
      DEFAULT_EXPECTED_REPAIR_HOURS,
    );
  });

  it('does not count planned work against a class — the same rule as the headline', () => {
    const verdict = maintenanceVerdict({
      assets: fleet,
      jobs: [
        {
          id: 'j1',
          assetId: 'r1',
          type: 'PLANNED',
          status: 'COMPLETED',
          reportedAt: new Date(now.getTime() - 2 * day),
          completedAt: new Date(now.getTime() - 1 * day),
        },
      ],
      windowDays: 30,
      now,
    });
    expect(verdict.byClass.find((row) => row.assetClass === 'RTG')?.availabilityPercent).toBe(100);
    expect(verdict.byClass.find((row) => row.assetClass === 'RTG')?.downtimeHours).toBe(0);
  });

  it('gives an empty register an empty rollup rather than a zero row', () => {
    const verdict = maintenanceVerdict({ assets: [], jobs: [], windowDays: 30, now });
    expect(verdict.byClass).toEqual([]);
  });
});

describe('a warranty that lapses without expiring', () => {
  const now = at('2028-01-15T00:00:00Z');

  it('names the units whose cover is unproven, in one sentence that survives being forwarded', () => {
    const verdict = maintenanceVerdict({
      assets: [
        {
          id: 'r1',
          assetCode: 'RTG-01',
          name: null,
          status: 'IN_SERVICE',
          assetClass: 'RTG',
          warrantyStartAt: at('2026-01-01T00:00:00Z'),
          warrantyTermDays: 913,
          warrantyServiceIntervalDays: 365,
          lastServiceAt: at('2026-09-30T00:00:00Z'),
        },
        {
          id: 'r2',
          assetCode: 'RTG-02',
          name: null,
          status: 'IN_SERVICE',
          assetClass: 'RTG',
          warrantyStartAt: at('2026-01-01T00:00:00Z'),
          warrantyTermDays: 913,
          warrantyServiceIntervalDays: 365,
          lastServiceAt: at('2027-11-01T00:00:00Z'),
        },
      ],
      jobs: [],
      windowDays: 30,
      now,
    });

    expect(verdict.metrics.unitsInTerm).toBe(2);
    expect(verdict.metrics.unitsServiceOverdue).toBe(1);
    const finding = verdict.findings.find((f) => f.code === 'warranty_condition');
    expect(finding?.message).toContain('RTG-01');
    expect(finding?.message).not.toContain('RTG-02');
    expect(finding?.message).toMatch(/supplier's discretion/i);
  });

  it('says nothing when every live term is being serviced', () => {
    const verdict = maintenanceVerdict({
      assets: [
        {
          id: 'r1',
          assetCode: 'RTG-01',
          name: null,
          status: 'IN_SERVICE',
          assetClass: 'RTG',
          warrantyStartAt: at('2026-01-01T00:00:00Z'),
          warrantyTermDays: 913,
          warrantyServiceIntervalDays: 365,
          lastServiceAt: at('2027-11-01T00:00:00Z'),
        },
      ],
      jobs: [],
      windowDays: 30,
      now,
    });
    expect(verdict.findings.find((f) => f.code === 'warranty_condition')).toBeUndefined();
    expect(verdict.metrics.unitsServiceOverdue).toBe(0);
  });
});

/**
 * A repair is five days. Getting permission to start it is however long
 * procurement takes.
 *
 * This is the whole reason the chain exists. A card that records "nine days
 * down" without recording that five were the job and four were a purchase order
 * is not measuring the workshop at all — it is measuring somebody else and
 * sending the bill to the wrong department.
 */
describe('the commercial chain', () => {
  const now = at('2026-11-20T00:00:00Z');

  const full = {
    status: 'SIGNED_OFF' as const,
    reportedAt: at('2026-11-01T08:00:00Z'),
    quotationAt: at('2026-11-01T10:00:00Z'),
    purchaseOrderNumber: 'PO-2026-118423',
    purchaseOrderAt: at('2026-11-06T10:00:00Z'),
    startedAt: at('2026-11-06T12:00:00Z'),
    completedAt: at('2026-11-11T12:00:00Z'),
    invoicedAt: at('2026-11-12T09:00:00Z'),
    paidAt: at('2026-12-12T09:00:00Z'),
  };

  it('separates the wait for authority from the repair itself', () => {
    const chain = commercialChain(full, 38100, now);
    // Five days quoted-and-waiting, five days working.
    expect(chain.quoteToOrderHours).toBe(120);
    expect(chain.workHours).toBe(120);
    // Reported 01 Nov 08:00, completed 11 Nov 12:00 — ten days and four hours.
    expect(chain.outageHours).toBe(244);
    expect(chain.authoritySharePercent).toBe(49.2);
    expect(chain.collectionDays).toBe(30);
    expect(chain.nextStep).toBeNull();
  });

  it('is the finding Robert described: the permission took longer than the job', () => {
    // Quoted Monday, order Friday, three days to repair.
    const slowProcurement = {
      status: 'SIGNED_OFF' as const,
      reportedAt: at('2026-11-02T08:00:00Z'),
      quotationAt: at('2026-11-02T09:00:00Z'),
      purchaseOrderAt: at('2026-11-06T09:00:00Z'),
      startedAt: at('2026-11-06T10:00:00Z'),
      completedAt: at('2026-11-09T10:00:00Z'),
    };
    const chain = commercialChain(slowProcurement, null, now);
    expect(chain.authorityWaitHours).toBe(96);
    expect(chain.workHours).toBe(72);
    expect(authorityWaitIsFinding(chain.authorityWaitHours, chain.workHours)).toBe(true);
  });

  it('does not cry wolf over a quick quote on a quick fix', () => {
    // Two hours waiting, one hour working: a ratio of 2 and still nothing.
    expect(authorityWaitIsFinding(2, 1)).toBe(false);
    expect(authorityWaitIsFinding(23, 1)).toBe(false);
    expect(authorityWaitIsFinding(24, 1)).toBe(true);
    expect(COMMERCIAL_THRESHOLDS.authorityWaitFloorHours).toBe(24);
  });

  it('does not call a wait a finding when the workshop was the slower party', () => {
    // Both men were in the way, and the toolbox was in it longer. The wait is
    // still worth recording; it is not the thing to escalate.
    expect(authorityWaitIsFinding(24, 24)).toBe(true); // dead heat: the wait still carries half
    expect(authorityWaitIsFinding(26, 40)).toBe(false);
    expect(authorityWaitIsFinding(30, 72)).toBe(false);
  });

  it('says nothing about a wait it cannot date — null is not zero', () => {
    const noQuote = { ...full, quotationAt: null };
    const chain = commercialChain(noQuote, null, now);
    expect(chain.quoteToOrderHours).toBeNull();
    expect(chain.authoritySharePercent).toBeNull();
    expect(authorityWaitIsFinding(chain.authorityWaitHours, chain.workHours)).toBe(false);
  });

  it('knows where the card is stuck right now, not just how long it took', () => {
    const quotedOnly = {
      status: 'REPORTED' as const,
      reportedAt: at('2026-11-16T08:00:00Z'),
      quotationAt: at('2026-11-16T10:00:00Z'),
    };
    const chain = commercialChain(quotedOnly, null, now);
    expect(chain.nextStep).toBe('AUTHORISED');
    expect(chain.stuckHours).toBe(86); // since the quotation, not since the fault
    expect(chain.steps.find((step) => step.key === 'AUTHORISED')?.done).toBe(false);
  });

  it('counts a card with nothing recorded as stuck since the fault was reported', () => {
    const bare = { status: 'REPORTED' as const, reportedAt: at('2026-11-19T00:00:00Z') };
    expect(commercialChain(bare, null, now).stuckHours).toBe(24);
  });

  it('flags work started before the order that later arrived', () => {
    const early = { ...full, startedAt: at('2026-11-04T08:00:00Z') };
    expect(commercialChain(early, null, now).startedBeforeOrder).toBe(true);
    expect(commercialChain(full, null, now).startedBeforeOrder).toBe(false);
  });

  it('separates "no order at all" from "started early" — they cost different things', () => {
    const noOrder = { ...full, purchaseOrderNumber: null, purchaseOrderAt: null };
    const chain = commercialChain(noOrder, 12000, now);
    expect(chain.workedWithoutOrder).toBe(true);
    // Nothing to have started early against.
    expect(chain.startedBeforeOrder).toBe(false);
  });

  it('says which completed work has not been invoiced', () => {
    const done = { ...full, invoicedAt: null, paidAt: null };
    const chain = commercialChain(done, 12000, now);
    expect(chain.uninvoiced).toBe(true);
    expect(chain.nextStep).toBe('INVOICED');
  });

  it('states quoted against actual, so a margin is a fact rather than a feeling', () => {
    const quoted = { ...full, quotationAmount: 42500 };
    const chain = commercialChain(quoted, 38100, now);
    expect(chain.variance).toBe(4400);
    expect(chain.quotedAmount).toBe(42500);
    expect(chain.actualCost).toBe(38100);
    // An overrun is negative, not hidden.
    expect(commercialChain(quoted, 45000, now).variance).toBe(-2500);
    // No quote, no variance — never a variance against zero.
    expect(commercialChain({ ...full, quotationAmount: null }, 45000, now).variance).toBeNull();
  });

  it('gives a cancelled card no live chain to be late on', () => {
    const cancelled = { ...full, status: 'CANCELLED' as const };
    const chain = commercialChain(cancelled, null, now);
    expect(chain.nextStep).toBeNull();
    expect(chain.stuckHours).toBeNull();
    expect(chain.uninvoiced).toBe(false);
  });

  it('labels every step, because an unlabelled timeline is a puzzle', () => {
    const chain = commercialChain(full, null, now);
    expect(chain.steps.map((step) => step.label)).toEqual(['Quoted', 'Authorised', 'Worked', 'Invoiced', 'Paid']);
    for (const step of chain.steps) expect(step.label.trim()).toBeTruthy();
  });
});

describe('refusing a chain that contradicts itself', () => {
  const completed = {
    completedAt: at('2026-11-11T12:00:00Z'),
  };

  it('refuses an order number with no date — it cannot end a wait it never dated', () => {
    const check = checkCommercialUpdate(completed, { purchaseOrderNumber: 'PO-1' });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/date it arrived/i);
  });

  it('refuses a date with no order number — the invoice cannot be matched to it', () => {
    const check = checkCommercialUpdate(completed, { purchaseOrderAt: at('2026-11-06T00:00:00Z') });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/reference/i);
  });

  it('accepts an order dated before the quotation, and leaves that wait blank', () => {
    // The order was signed before the quote was written up — the client's
    // admin lag, not a lie. Refusing it stopped the card being filled in at
    // all, and hoursBetween already declines to report such a gap as a
    // negative number, so the averages were never at risk.
    const check = checkCommercialUpdate(completed, {
      quotationAt: at('2026-11-06T00:00:00Z'),
      purchaseOrderNumber: 'PO-1',
      purchaseOrderAt: at('2026-11-02T00:00:00Z'),
    });
    expect(check.ok).toBe(true);
    expect(check.anomalies.join(' ')).toMatch(/before the quotation/i);
    // The protection the refusal used to claim it was providing: the wait is
    // blank rather than negative.
    const chain = commercialChain(
      { ...check.value, status: 'REPORTED' as const, reportedAt: at('2026-11-01T00:00:00Z') },
      null,
      at('2026-11-20T00:00:00Z'),
    );
    expect(chain.steps.find((s) => s.key === 'AUTHORISED')?.waitHours ?? null).toBeNull();
  });

  it('refuses an invoice for work that has not been completed', () => {
    const check = checkCommercialUpdate({ completedAt: null }, { invoicedAt: at('2026-11-12T00:00:00Z') });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not finished|no completion/i);
  });

  it('accepts an invoice dated before the completion, and says so', () => {
    const check = checkCommercialUpdate(completed, { invoicedAt: at('2026-11-01T00:00:00Z') });
    expect(check.ok).toBe(true);
    expect(check.anomalies.join(' ')).toMatch(/before the work was completed/i);
  });

  it('accepts an invoice raised before the order that authorised the spend', () => {
    // The order arrived on the Wednesday but was only typed in on the Friday,
    // after the invoice had gone out. This is the ordinary shape of a client's
    // paperwork — a tax invoice dated the 24th against an order the client
    // dated the 29th is five days of their admin, not a falsehood. The card
    // has to accept it; what it must not do is report a negative wait.
    const lateTyped = {
      completedAt: at('2026-11-10T12:00:00Z'),
      quotationAt: at('2026-11-02T09:00:00Z'),
      purchaseOrderNumber: 'PO-2026-118423',
      purchaseOrderAt: at('2026-11-14T08:00:00Z'),
      invoicedAt: at('2026-11-12T09:00:00Z'),
    };
    const check = checkCommercialUpdate(lateTyped, { paidAt: at('2026-11-20T09:00:00Z') });
    expect(check.ok).toBe(true);
    expect(check.anomalies.join(' ')).toMatch(/before the purchase order/i);
  });

  it('accepts a payment dated before its invoice, and says so', () => {
    const withInvoice = { completedAt: at('2026-11-11T12:00:00Z'), invoicedAt: at('2026-11-12T09:00:00Z') };
    const check = checkCommercialUpdate(withInvoice, { paidAt: at('2026-11-01T00:00:00Z') });
    expect(check.ok).toBe(true);
    expect(check.anomalies.join(' ')).toMatch(/before the invoice/i);
  });

  it('refuses a quotation of zero — that is a job done for free, not a quote', () => {
    const check = checkCommercialUpdate(completed, { quotationAmount: 0 });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not a quotation/i);
  });

  it('accepts the ordinary case and hands back the merged values', () => {
    const check = checkCommercialUpdate(completed, {
      quotationAmount: 42500,
      quotationAt: at('2026-11-02T09:00:00Z'),
      purchaseOrderNumber: '  PO-2026-118423 ',
      purchaseOrderAt: at('2026-11-06T09:00:00Z'),
    });
    expect(check.ok).toBe(true);
    expect(check.value.purchaseOrderNumber).toBe('PO-2026-118423');
    expect(check.value.quotationAmount).toBe(42500);
  });

  it('lets a wrong term be withdrawn — null is a correction, not a zero', () => {
    const check = checkCommercialUpdate(
      { ...completed, quotationAmount: 42500, purchaseOrderNumber: 'PO-1', purchaseOrderAt: at('2026-11-06T00:00:00Z') },
      { quotationAmount: null },
    );
    expect(check.ok).toBe(true);
    expect(check.value.quotationAmount).toBeNull();
  });

  it('leaves untouched fields alone rather than blanking them', () => {
    const check = checkCommercialUpdate(
      {
        completedAt: at('2026-11-11T12:00:00Z'),
        quotationAmount: 42500,
        purchaseOrderNumber: 'PO-1',
        purchaseOrderAt: at('2026-11-06T00:00:00Z'),
      },
      { invoicedAt: at('2026-11-12T00:00:00Z') },
    );
    expect(check.ok).toBe(true);
    expect(check.value.quotationAmount).toBe(42500);
    expect(check.value.purchaseOrderNumber).toBe('PO-1');
  });
});

/**
 * The fleet view of the commercial chain.
 *
 * Two failures that look similar in a dashboard and are nothing alike: a card
 * quoted and never authorised (the unit is standing still for a signature) and
 * a card finished and never invoiced (the work is done and the claim is not).
 * One costs availability, the other costs cash.
 */
describe('the commercial chain in the verdict', () => {
  const now = at('2026-11-20T00:00:00Z');
  const unit = { id: 'a1', assetCode: 'RTG-07', name: null, status: 'IN_SERVICE' as const, assetClass: 'RTG' as const };

  it('names the cards waiting for authority and how long they have waited', () => {
    const verdict = maintenanceVerdict({
      assets: [unit],
      jobs: [
        {
          id: 'j1',
          jobNumber: 'MJ-2026-0007',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'REPORTED',
          reportedAt: at('2026-11-16T08:00:00Z'),
          quotationAt: at('2026-11-16T10:00:00Z'),
        },
      ],
      windowDays: 30,
      now,
    });

    expect(verdict.metrics.awaitingOrder).toBe(1);
    const finding = verdict.findings.find((f) => f.code === 'awaiting_order');
    expect(finding?.message).toContain('86 hours');
    expect(finding?.message).toMatch(/repair has not begun/i);
  });

  it('reports the hours the fleet spent waiting rather than repairing', () => {
    const verdict = maintenanceVerdict({
      assets: [unit],
      jobs: [
        {
          id: 'j1',
          jobNumber: 'MJ-2026-0001',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'SIGNED_OFF',
          reportedAt: at('2026-11-02T08:00:00Z'),
          quotationAt: at('2026-11-02T09:00:00Z'),
          purchaseOrderNumber: 'PO-1',
          purchaseOrderAt: at('2026-11-06T09:00:00Z'),
          startedAt: at('2026-11-06T10:00:00Z'),
          completedAt: at('2026-11-09T10:00:00Z'),
        },
      ],
      windowDays: 30,
      now,
    });

    expect(verdict.metrics.authorityWaitHours).toBe(96);
    const finding = verdict.findings.find((f) => f.code === 'authority_wait:j1');
    expect(finding?.message).toContain('MJ-2026-0001');
    expect(finding?.message).toMatch(/96 hours for a purchase order/i);
    expect(finding?.message).toMatch(/72 hours to repair/i);
    expect(finding?.message).toMatch(/permission took longer than the job/i);
  });

  it('puts a figure on finished work that was never invoiced', () => {
    const verdict = maintenanceVerdict({
      assets: [unit],
      jobs: [
        {
          id: 'j1',
          jobNumber: 'MJ-2026-0002',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'SIGNED_OFF',
          reportedAt: at('2026-11-02T08:00:00Z'),
          startedAt: at('2026-11-02T09:00:00Z'),
          completedAt: at('2026-11-03T09:00:00Z'),
          costs: [{ amount: 12000 }],
        },
      ],
      windowDays: 30,
      now,
    });

    expect(verdict.metrics.unbilledExposure).toBe(12000);
    const finding = verdict.findings.find((f) => f.code === 'unbilled');
    expect(finding?.message).toContain('12 000.00');
    expect(finding?.message).toMatch(/claim is not/i);
  });

  it('says nothing at all when the chain is complete and paid', () => {
    const verdict = maintenanceVerdict({
      assets: [unit],
      jobs: [
        {
          id: 'j1',
          jobNumber: 'MJ-2026-0003',
          assetId: 'a1',
          type: 'BREAKDOWN',
          status: 'SIGNED_OFF',
          reportedAt: at('2026-11-02T08:00:00Z'),
          quotationAt: at('2026-11-02T09:00:00Z'),
          purchaseOrderNumber: 'PO-1',
          purchaseOrderAt: at('2026-11-03T09:00:00Z'),
          startedAt: at('2026-11-03T10:00:00Z'),
          completedAt: at('2026-11-05T10:00:00Z'),
          invoicedAt: at('2026-11-05T12:00:00Z'),
          paidAt: at('2026-11-18T12:00:00Z'),
          costs: [{ amount: 5000 }],
        },
      ],
      windowDays: 30,
      now,
    });

    expect(verdict.metrics.awaitingOrder).toBe(0);
    expect(verdict.metrics.unbilledExposure).toBe(0);
    expect(verdict.findings.filter((f) => f.code === 'unbilled' || f.code === 'awaiting_order')).toEqual([]);
  });
});

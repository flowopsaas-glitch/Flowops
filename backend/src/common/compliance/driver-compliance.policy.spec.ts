import {
  describeCompliance,
  DriverComplianceSnapshot,
  evaluateDriverCompliance,
} from './driver-compliance.policy';

/**
 * The compliance policy is the ONE decision table behind auto-dispatch, manual
 * assignment, route creation and the hub hand-over. These tests pin every rule
 * so no caller can quietly widen it: each blocker below is a scenario that, if
 * it stopped blocking, would put an unlicensed or suspended driver on a load.
 */

const NOW = new Date('2026-10-07T08:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function driver(overrides: Partial<DriverComplianceSnapshot> = {}): DriverComplianceSnapshot {
  return {
    driverId: 'drv-1',
    companyId: 'co-1',
    name: 'Sipho Dlamini',
    isActive: true,
    status: 'AVAILABLE',
    licenseExpiry: days(365),
    insuranceExpiry: days(365),
    backgroundCheckExpiry: days(365),
    nextServiceDate: days(60),
    currentKm: 100_000,
    nextServiceKm: 130_000,
    complianceHold: false,
    criticalSafetyAlerts: 0,
    ...overrides,
  };
}

describe('evaluateDriverCompliance — blocking rules', () => {
  it('a fully compliant driver is dispatchable with no issues', () => {
    const result = evaluateDriverCompliance(driver(), { now: NOW });
    expect(result.compliant).toBe(true);
    expect(result.dispatchable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.unverifiedDocuments).toEqual([]);
  });

  it.each([
    ['DRIVER_INACTIVE', { isActive: false }],
    ['COMPLIANCE_HOLD', { complianceHold: true, complianceHoldReason: 'Crash under investigation' }],
    ['DRIVER_NOT_AVAILABLE', { status: 'ON_ROUTE' }],
    ['LICENSEEXPIRY_EXPIRED', { licenseExpiry: days(-1) }],
    ['INSURANCEEXPIRY_EXPIRED', { insuranceExpiry: days(-30) }],
    ['BACKGROUNDCHECKEXPIRY_EXPIRED', { backgroundCheckExpiry: days(-400) }],
    ['SERVICE_OVERDUE', { nextServiceDate: days(-2) }],
    ['SERVICE_KM_EXCEEDED', { currentKm: 130_000 }],
    ['CRITICAL_SAFETY_ALERT', { criticalSafetyAlerts: 2 }],
    // Unknown, not zero: a check that could not run must never read as safe.
    ['SAFETY_ALERT_CHECK_UNAVAILABLE', { criticalSafetyAlerts: null }],
  ])('blocks with %s', (code, overrides) => {
    const result = evaluateDriverCompliance(driver(overrides), { now: NOW });
    expect(result.compliant).toBe(false);
    expect(result.dispatchable).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain(code);
  });

  it('treats an unparseable document date as a block, not as "no data"', () => {
    const result = evaluateDriverCompliance(
      driver({ licenseExpiry: new Date('not-a-date') }),
      { now: NOW },
    );
    expect(result.blockers.map((b) => b.code)).toContain('LICENSEEXPIRY_INVALID');
  });

  it('includes the hold reason in the message so the dispatcher knows why', () => {
    const result = evaluateDriverCompliance(
      driver({ complianceHold: true, complianceHoldReason: 'Unpaid COD' }),
      { now: NOW },
    );
    expect(result.blockers[0].message).toContain('Unpaid COD');
  });
});

describe('evaluateDriverCompliance — missing evidence', () => {
  it('reports missing documents as unverified and warns by default', () => {
    const result = evaluateDriverCompliance(
      driver({ licenseExpiry: null, insuranceExpiry: null, backgroundCheckExpiry: null }),
      { now: NOW },
    );
    expect(result.unverifiedDocuments).toEqual([
      'licenseExpiry',
      'insuranceExpiry',
      'backgroundCheckExpiry',
    ]);
    expect(result.compliant).toBe(true); // rollout default
    expect(result.warnings.map((w) => w.code)).toEqual([
      'LICENSEEXPIRY_MISSING',
      'INSURANCEEXPIRY_MISSING',
      'BACKGROUNDCHECKEXPIRY_MISSING',
    ]);
  });

  it('blocks on missing documents the moment documents are required', () => {
    const result = evaluateDriverCompliance(
      driver({ licenseExpiry: null }),
      { now: NOW, requireDocuments: true },
    );
    expect(result.compliant).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain('LICENSEEXPIRY_MISSING');
  });

  it('a missing document is never silently absent from the result', () => {
    const result = evaluateDriverCompliance(driver({ insuranceExpiry: null }), { now: NOW });
    expect(result.unverifiedDocuments).toEqual(['insuranceExpiry']);
    expect([...result.blockers, ...result.warnings].map((i) => i.field)).toContain(
      'insuranceExpiry',
    );
  });
});

describe('evaluateDriverCompliance — warnings and boundaries', () => {
  it('warns (does not block) when a document expires inside the warning window', () => {
    const result = evaluateDriverCompliance(driver({ licenseExpiry: days(10) }), { now: NOW });
    expect(result.compliant).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('LICENSEEXPIRY_EXPIRING');
  });

  it('honours a custom warning window', () => {
    const snapshot = driver({ licenseExpiry: days(20) });
    expect(evaluateDriverCompliance(snapshot, { now: NOW }).warnings).toHaveLength(0);
    expect(
      evaluateDriverCompliance(snapshot, { now: NOW, warningWindowDays: 30 }).warnings.map((w) => w.code),
    ).toContain('LICENSEEXPIRY_EXPIRING');
  });

  it('warns when the odometer is within 90% of the service point but has not passed it', () => {
    const result = evaluateDriverCompliance(driver({ currentKm: 117_000 }), { now: NOW });
    expect(result.compliant).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('SERVICE_KM_DUE_SOON');
  });

  it('an expiry exactly today is a warning, not an expiry', () => {
    const result = evaluateDriverCompliance(driver({ insuranceExpiry: NOW }), { now: NOW });
    expect(result.warnings.map((w) => w.code)).toContain('INSURANCEEXPIRY_EXPIRING');
    expect(result.blockers).toEqual([]);
  });
});

describe('evaluateDriverCompliance — availability policy', () => {
  it('an ON_ROUTE driver cannot be dispatched to a second load', () => {
    expect(evaluateDriverCompliance(driver({ status: 'ON_ROUTE' }), { now: NOW }).compliant).toBe(false);
  });

  it('callers can widen the available set explicitly (e.g. allow returning drivers)', () => {
    const result = evaluateDriverCompliance(driver({ status: 'OFFLINE' }), {
      now: NOW,
      availableStatuses: ['AVAILABLE', 'OFFLINE'],
    });
    expect(result.compliant).toBe(true);
  });
});

describe('describeCompliance', () => {
  it('summarises blockers for audit rows and API messages', () => {
    const result = evaluateDriverCompliance(
      driver({ licenseExpiry: days(-5), status: 'OFFLINE' }),
      { now: NOW },
    );
    const text = describeCompliance(result);
    expect(text).toMatch(/Driving licence \/ PrDP expired 5 day\(s\) ago/);
    expect(text).toMatch(/Driver status is OFFLINE/);
  });

  it('says "compliant" (with warnings when present) for a usable driver', () => {
    expect(describeCompliance(evaluateDriverCompliance(driver(), { now: NOW }))).toBe('Compliant');
    expect(
      describeCompliance(
        evaluateDriverCompliance(driver({ licenseExpiry: days(3) }), { now: NOW }),
      ),
    ).toMatch(/^Compliant with warnings:/);
  });
});

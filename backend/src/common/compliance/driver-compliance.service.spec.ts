import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriverComplianceService } from './driver-compliance.service';

/**
 * The compliance *service* — the Prisma-backed half.
 *
 * The pure policy has its own exhaustive suite; what is tested here is the part
 * that touches the database and the operator workflow around it:
 *  - tenancy: a driver from another company is "not found", never compliant;
 *  - the evidence endpoint validates, writes only what was sent, requires a
 *    reason for a hold, clears the reason when a hold is lifted, and audits the
 *    before/after;
 *  - the fleet report says how much of the fleet is documented, because that is
 *    the number that decides when document enforcement can be switched on.
 */

type Row = Record<string, any>;

function makeHarness(overrides: { drivers?: Row[]; companyId?: string } = {}) {
  const drivers = overrides.drivers ?? [
    {
      id: 'drv-1', name: 'Sipho', companyId: 'co-1', isActive: true, status: 'AVAILABLE',
      licenseExpiry: new Date('2027-01-01'), insuranceExpiry: new Date('2027-01-01'),
      backgroundCheckExpiry: new Date('2027-01-01'), nextServiceDate: new Date('2026-12-01'),
      currentKm: 100_000, nextServiceKm: 130_000, complianceHold: false, complianceHoldReason: null,
    },
    {
      id: 'drv-2', name: 'Thabo', companyId: 'co-1', isActive: true, status: 'AVAILABLE',
      licenseExpiry: null, insuranceExpiry: null, backgroundCheckExpiry: null,
      nextServiceDate: null, currentKm: 200_000, nextServiceKm: 100_000,
      complianceHold: true, complianceHoldReason: 'Crash investigation',
    },
  ];

  const prisma = {
    driver: {
      findFirst: jest.fn(async ({ where }: any) => {
        const found = drivers.find((d) => d.id === where.id && d.companyId === where.companyId);
        return found ? { ...found } : null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        drivers.filter((d) => d.companyId === where.companyId).map((d) => ({ ...d })),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = drivers.find((d) => d.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
    },
    safetyAlert: { count: jest.fn(async () => 0) },
  };

  const audit = { record: jest.fn(async () => 'audit-1') };
  const svc = new DriverComplianceService(prisma as any, audit as any);
  return { svc, prisma, audit, drivers };
}

describe('DriverComplianceService — tenancy', () => {
  it("reports another tenant's driver as not found, never as compliant", async () => {
    const { svc } = makeHarness();
    await expect(svc.snapshot('drv-1', 'co-2')).rejects.toThrow(NotFoundException);
  });

  it('assertDispatchable refuses a non-compliant driver with the blocker codes', async () => {
    const { svc } = makeHarness();
    await expect(svc.assertDispatchable('drv-2', 'co-1')).rejects.toThrow(ForbiddenException);
    await expect(svc.assertDispatchable('drv-2', 'co-1')).rejects.toThrow(/COMPLIANCE_HOLD/);
  });

  it('assertDispatchable lets a compliant driver through', async () => {
    const { svc } = makeHarness();
    await expect(svc.assertDispatchable('drv-1', 'co-1')).resolves.toMatchObject({ compliant: true });
  });
});

describe('DriverComplianceService.fleetReport', () => {
  it('summarises blocked drivers and document coverage across the fleet', async () => {
    const { svc } = makeHarness();
    const report = await svc.fleetReport('co-1');

    expect(report.summary).toMatchObject({
      drivers: 2,
      dispatchable: 1,
      blocked: 1,
      documented: 1,
      undocumented: 1,
      documentCoveragePercentage: 50,
    });
    expect(report.drivers.find((d) => d.driverId === 'drv-2')!.blockerCodes).toEqual(
      expect.arrayContaining(['COMPLIANCE_HOLD', 'SERVICE_KM_EXCEEDED']),
    );
    expect(report.drivers.find((d) => d.driverId === 'drv-2')!.unverifiedDocuments).toEqual([
      'licenseExpiry', 'insuranceExpiry', 'backgroundCheckExpiry',
    ]);
  });

  it('reports document coverage as null — not 0% — for an empty fleet', async () => {
    const { svc } = makeHarness({ drivers: [] });
    const report = await svc.fleetReport('co-1');
    expect(report.summary.documentCoveragePercentage).toBeNull();
    expect(report.readyToRequireDocuments).toBe(false);
  });

  it('says the fleet is ready for document enforcement only when every driver is documented', async () => {
    const { svc, drivers } = makeHarness();
    drivers[1].licenseExpiry = new Date('2027-01-01');
    drivers[1].insuranceExpiry = new Date('2027-01-01');
    drivers[1].backgroundCheckExpiry = new Date('2027-01-01');
    const report = await svc.fleetReport('co-1');
    expect(report.readyToRequireDocuments).toBe(true);
  });

  it('onlyProblems returns just the blocked drivers', async () => {
    const { svc } = makeHarness();
    const report = await svc.fleetReport('co-1', { onlyProblems: true });
    expect(report.drivers.map((d) => d.driverId)).toEqual(['drv-2']);
    // The summary still describes the whole fleet — a filtered list must not
    // silently look like a healthy fleet.
    expect(report.summary.drivers).toBe(2);
  });

  it("never returns another tenant's drivers", async () => {
    const { svc } = makeHarness({
      drivers: [
        { id: 'x', name: 'Other', companyId: 'co-9', isActive: true, status: 'AVAILABLE' },
      ],
    });
    const report = await svc.fleetReport('co-1');
    expect(report.summary.drivers).toBe(0);
  });
});

describe('DriverComplianceService.recordEvidence', () => {
  it('writes only the fields that were sent', async () => {
    const { svc, prisma } = makeHarness();
    await svc.recordEvidence('drv-1', 'co-1', { licenseExpiry: '2028-06-30' });
    expect(prisma.driver.update).toHaveBeenCalledTimes(1);
    const data = (prisma.driver.update as jest.Mock).mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['licenseExpiry']);
  });

  it('audits the change with before/after values', async () => {
    const { svc, audit } = makeHarness();
    await svc.recordEvidence(
      'drv-1', 'co-1',
      { insuranceExpiry: '2028-01-15' },
      { id: 'u-1', email: 'ops@co.za', role: 'MANAGER' },
    );
    const entry = (audit.record as jest.Mock).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'driver.compliance_evidence_updated',
      targetType: 'driver',
      targetId: 'drv-1',
      metadata: expect.objectContaining({
        companyId: 'co-1',
        actorRole: 'MANAGER',
        changes: { insuranceExpiry: { from: expect.anything(), to: expect.any(Date) } },
      }),
    });
  });

  it('rejects an unparseable date instead of storing it', async () => {
    const { svc, prisma } = makeHarness();
    await expect(
      svc.recordEvidence('drv-1', 'co-1', { licenseExpiry: 'not-a-date' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  it('an explicit null clears a document (and the policy then reports it unverified)', async () => {
    const { svc, prisma } = makeHarness();
    const result = await svc.recordEvidence('drv-1', 'co-1', { licenseExpiry: null });
    expect((prisma.driver.update as jest.Mock).mock.calls[0][0].data.licenseExpiry).toBeNull();
    expect(result.compliance.unverifiedDocuments).toContain('licenseExpiry');
  });

  it('requires a reason before placing a hold', async () => {
    const { svc, prisma } = makeHarness();
    await expect(
      svc.recordEvidence('drv-1', 'co-1', { complianceHold: true }),
    ).rejects.toThrow(/requires a reason/);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  it('accepts a hold with a reason and surfaces the block immediately', async () => {
    const { svc } = makeHarness();
    const result = await svc.recordEvidence('drv-1', 'co-1', {
      complianceHold: true,
      complianceHoldReason: 'Unpaid COD',
    });
    expect(result.compliance.compliant).toBe(false);
    expect(result.compliance.blockers.map((b) => b.code)).toContain('COMPLIANCE_HOLD');
    expect(result.compliance.blockers[0].message).toContain('Unpaid COD');
  });

  it('lifting a hold clears the stale reason so the driver card is not misleading', async () => {
    const { svc } = makeHarness();
    const result = await svc.recordEvidence('drv-2', 'co-1', { complianceHold: false });
    expect(result.changed).toEqual(expect.arrayContaining(['complianceHold', 'complianceHoldReason']));
    expect(result.compliance.blockers.map((b) => b.code)).not.toContain('COMPLIANCE_HOLD');
  });

  it('rejects an empty patch rather than issuing a pointless write', async () => {
    const { svc, prisma } = makeHarness();
    await expect(svc.recordEvidence('drv-1', 'co-1', {})).rejects.toThrow(BadRequestException);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  it('rejects a negative odometer reading', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.recordEvidence('drv-1', 'co-1', { currentKm: -5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("is tenant-scoped: evidence cannot be recorded for another company's driver", async () => {
    const { svc, prisma } = makeHarness();
    await expect(
      svc.recordEvidence('drv-1', 'co-2', { licenseExpiry: '2028-01-01' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });
});

describe('DriverComplianceService.policy', () => {
  it('reports the active switches so the UI can show how strict the account is', () => {
    const { svc } = makeHarness();
    expect(svc.policy()).toMatchObject({ requireDocuments: false, warningWindowDays: 14, availableStatuses: ['AVAILABLE'] });
  });

  it('reflects DRIVER_REQUIRE_DOCUMENTS when it is switched on', () => {
    const previous = process.env.DRIVER_REQUIRE_DOCUMENTS;
    process.env.DRIVER_REQUIRE_DOCUMENTS = 'true';
    try {
      const { svc } = makeHarness();
      expect(svc.policy().requireDocuments).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DRIVER_REQUIRE_DOCUMENTS;
      else process.env.DRIVER_REQUIRE_DOCUMENTS = previous;
    }
  });
});

/**
 * Safety incidents and trip documents — unit tests (mocked Prisma).
 *
 * The properties that matter: a decision on an incident is final so the record
 * of who made it survives, and a document cannot be hung off another tenant's
 * trip and then read back through this tenant's endpoint.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SafetyIncidentService } from './safety-incident.service';
import { TripDocumentService } from './trip-document.service';

const COMPANY = 'C-ACME';

function harness() {
  const incidents: Record<string, any> = {};
  const tx: any = {
    driver: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    trip: { findFirst: jest.fn(), findMany: jest.fn() },
    safetyIncident: {
      create: jest.fn(), findMany: jest.fn(), update: jest.fn(),
      // Default implementation reads the row store, so `decide` can tell "not
      // yours" from "already decided" after a conditional write matches nothing.
      // Tests that need a specific row still override with mockResolvedValue.
      findFirst: jest.fn(async ({ where }: any) => {
        const row = incidents[where?.id];
        if (!row) return null;
        if (where.companyId && row.companyId !== where.companyId) return null;
        return { ...row };
      }),
      // Honours the compare-and-set that `decide` now uses. A conditional write
      // that does not match claims nothing — that is what makes a decision
      // final under concurrency, so the mock has to model it rather than
      // blindly applying every write.
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = incidents[where.id];
        if (!row) return { count: 0 };
        if (where.companyId && row.companyId !== where.companyId) return { count: 0 };
        if (where.status && where.status.notIn && where.status.notIn.includes(row.status)) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const row = incidents[where.id];
        if (!row) throw new Error('not found');
        return { ...row };
      }),
    },
    tripDocument: { create: jest.fn(), findMany: jest.fn() },
    __incidents: incidents,
  };
  const prisma: any = {
    withTenant: jest.fn(async (_c: string, fn: (client: any) => Promise<unknown>) => fn(tx)),
  };
  return { tx, prisma };
}

const dispatcher = { id: 'u-1', role: 'DISPATCH', companyId: COMPANY };

describe('SafetyIncidentService', () => {
  let tx: any, prisma: any, svc: SafetyIncidentService;

  beforeEach(() => {
    ({ tx, prisma } = harness());
    svc = new SafetyIncidentService(prisma as any);
  });

  const REPORT = { type: 'THEFT', severity: 'HIGH', reportLat: -25.7, reportLng: 28.2 };

  it('records a report as REPORTED, tenant-scoped, with no verification', async () => {
    tx.safetyIncident.create.mockResolvedValue({
      id: 'i-1',
      companyId: COMPANY,
      ...REPORT,
      status: 'REPORTED',
      reportedByDriverId: null,
      reportedByUserId: 'u-1',
      reportLat: -25.7,
      reportLng: 28.2,
      locationSource: 'GPS',
      geohash6: null,
      narrative: null,
      verifiedByUserId: null,
      verifiedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      zoneId: null,
      broadcastCount: 0,
      reportedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const row: any = await svc.report(COMPANY, REPORT as any, dispatcher);

    expect(row.status).toBe('REPORTED');
    expect(row.verifiedByUserId).toBeNull();
    const data = tx.safetyIncident.create.mock.calls[0][0].data;
    expect(data.companyId).toBe(COMPANY);
    expect(data.status).toBe('REPORTED');
  });

  it('attributes a driver-submitted report to that driver, and only to them', async () => {
    tx.driver.findFirst.mockResolvedValue({ id: 'd-1' });
    tx.safetyIncident.create.mockResolvedValue({
      id: 'i-1', companyId: COMPANY, type: 'THEFT', severity: 'HIGH', status: 'REPORTED',
      reportedByDriverId: 'd-1', reportedByUserId: null, reportLat: 0, reportLng: 0,
      locationSource: 'GPS', geohash6: null, narrative: null, verifiedByUserId: null,
      verifiedAt: null, rejectedByUserId: null, rejectedAt: null, rejectionReason: null,
      zoneId: null, broadcastCount: 0, reportedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });

    await svc.report(COMPANY, REPORT as any, { id: 'u-9', role: 'DRIVER', companyId: COMPANY });

    // The lookup is by the session user, so a driver cannot name another driver.
    expect(tx.driver.findFirst.mock.calls[0][0].where).toEqual({
      companyId: COMPANY,
      userId: 'u-9',
    });
    expect(tx.safetyIncident.create.mock.calls[0][0].data.reportedByDriverId).toBe('d-1');
  });

  it('resolves reporter and reviewer names for the dispatch board', async () => {
    tx.safetyIncident.findMany.mockResolvedValue([
      {
        id: 'i-1', companyId: COMPANY, type: 'THEFT', severity: 'HIGH', status: 'VERIFIED',
        reportedByDriverId: 'd-1', reportedByUserId: 'u-1', reportLat: 0, reportLng: 0,
        locationSource: 'GPS', geohash6: null, narrative: null,
        verifiedByUserId: 'u-2', verifiedAt: new Date(), rejectedByUserId: null,
        rejectedAt: null, rejectionReason: null, zoneId: null, broadcastCount: 3,
        reportedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    tx.driver.findMany.mockResolvedValue([{ id: 'd-1', name: 'Sipho' }]);
    tx.user.findMany.mockResolvedValue([
      { id: 'u-1', name: 'Thandi' },
      { id: 'u-2', name: 'Kader' },
    ]);

    const rows: any[] = await svc.list(COMPANY);

    expect(rows[0]).toMatchObject({
      reportedByDriverName: 'Sipho',
      reportedByUserName: 'Thandi',
      verifiedByUserName: 'Kader',
    });
  });

  it('filters by the tenant', async () => {
    tx.safetyIncident.findMany.mockResolvedValue([]);
    await svc.list(COMPANY);
    expect(tx.safetyIncident.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
  });

  it('rejects an invented status', async () => {
    await expect(svc.list(COMPANY, 'MAYBE')).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── the decision is final ─────────────────────────────────────────────────

  it('records who verified an incident', async () => {
    tx.__incidents['i-1'] = { id: 'i-1', companyId: COMPANY, status: 'REPORTED' };

    await svc.decide(COMPANY, 'i-1', 'VERIFIED', undefined, dispatcher);

    const data = tx.safetyIncident.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('VERIFIED');
    expect(data.verifiedByUserId).toBe('u-1');
  });

  it('refuses to re-decide, so the first decision is not erased', async () => {
    tx.__incidents['i-1'] = { id: 'i-1', companyId: COMPANY, status: 'VERIFIED' };

    await expect(
      svc.decide(COMPANY, 'i-1', 'REJECTED', 'changed my mind', dispatcher),
    ).rejects.toBeInstanceOf(BadRequestException);

    // It tried, and the conditional write matched nothing — so the original
    // decision is still the one on the record.
    expect(tx.safetyIncident.updateMany).toHaveBeenCalled();
    expect(tx.__incidents['i-1'].status).toBe('VERIFIED');
  });

  it('lets exactly one of two concurrent decisions win', async () => {
    // THE RACE. Both callers see an OPEN incident; a read-then-write lets both
    // proceed and the second erases who made the first call. The whole point of
    // this table is preserving that, so the claim has to be conditional.
    tx.__incidents['i-1'] = { id: 'i-1', companyId: COMPANY, status: 'REPORTED' };

    const settled = await Promise.allSettled([
      svc.decide(COMPANY, 'i-1', 'VERIFIED', undefined, dispatcher),
      svc.decide(COMPANY, 'i-1', 'REJECTED', 'changed my mind', { id: 'u-2' }),
    ]);

    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // The FIRST decision is the one that survives.
    expect(tx.__incidents['i-1'].status).toBe('VERIFIED');
    expect(tx.__incidents['i-1'].verifiedByUserId).toBe('u-1');
  });

  it('will not decide another tenant\'s incident', async () => {
    // No row under 'i-other' at all.
    await expect(
      svc.decide(COMPANY, 'i-other', 'VERIFIED', undefined, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
    // The claim itself is tenant-scoped, not just the read that follows it.
    expect(tx.safetyIncident.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'i-other',
      companyId: COMPANY,
    });
  });
});

describe('TripDocumentService', () => {
  let tx: any, prisma: any, svc: TripDocumentService;

  beforeEach(() => {
    ({ tx, prisma } = harness());
    svc = new TripDocumentService(prisma as any);
  });

  it('resolves the trip reference and the capturing user for the pack', async () => {
    tx.tripDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1', companyId: COMPANY, tripId: 't-1', documentType: 'HS_ORIGIN',
        documentRef: null, hsCode: '8703', originStatus: 'PREFERENTIAL',
        dutyEstimated: null, dutyActual: null, declarationRef: null,
        capturedBy: 'u-1', capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    tx.trip.findMany.mockResolvedValue([{ id: 't-1', reference: 'TRIP-001' }]);
    tx.user.findMany.mockResolvedValue([{ id: 'u-1', name: 'Thandi' }]);

    const rows: any[] = await svc.list(COMPANY);

    expect(rows[0]).toMatchObject({ tripReference: 'TRIP-001', capturedByName: 'Thandi' });
  });

  it('filters documents by the tenant and optionally by trip', async () => {
    tx.tripDocument.findMany.mockResolvedValue([]);
    await svc.list(COMPANY, 't-1');
    expect(tx.tripDocument.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY, tripId: 't-1' });
  });

  it('refuses to attach a document to another tenant\'s trip', async () => {
    tx.trip.findFirst.mockResolvedValue(null); // trip not in this tenant

    await expect(
      svc.create(COMPANY, { tripId: 't-other', documentType: 'HS_ORIGIN' } as any, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);

    // The trip is looked up scoped to the tenant, so another company's trip is
    // indistinguishable from one that does not exist.
    expect(tx.trip.findFirst.mock.calls[0][0].where).toEqual({ id: 't-other', companyId: COMPANY });
    expect(tx.tripDocument.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed HS code', async () => {
    await expect(
      svc.create(COMPANY, { tripId: 't-1', documentType: 'HS_ORIGIN', hsCode: 'ABC' } as any, dispatcher),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps the creating user and time on capture', async () => {
    tx.trip.findFirst.mockResolvedValue({ id: 't-1' });
    tx.tripDocument.create.mockResolvedValue({ id: 'doc-1' });

    await svc.create(COMPANY, { tripId: 't-1', documentType: 'HS_ORIGIN' } as any, dispatcher);

    const data = tx.tripDocument.create.mock.calls[0][0].data;
    expect(data.companyId).toBe(COMPANY);
    expect(data.capturedBy).toBe('u-1');
    expect(data.capturedAt).toBeInstanceOf(Date);
  });
});

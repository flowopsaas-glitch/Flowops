/**
 * BorderDwellService — unit tests (mocked Prisma).
 *
 * The property that matters most is the one the schema could not express: a
 * session's duration is only a measurement if the fixes covering it are dense
 * enough to prove the driver stayed put. Everything here is about that
 * distinction, and about the tenant boundary around it.
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BorderDwellService, GAP_THRESHOLD_SECONDS } from './border-dwell.service';

const COMPANY = 'C-ACME';
const OTHER = 'C-GLOBEX';

/** A geofence 1km around (0, 0). */
const GEOFENCE = {
  id: 'g-1',
  companyId: COMPANY,
  postId: 'p-1',
  side: 'IMPORT',
  radiusM: 1000,
  lat: 0,
  lng: 0,
  post: { id: 'p-1', code: 'BEIT', name: 'Beitbridge' },
};

function makeService() {
  const tx: any = {
    driver: { findFirst: jest.fn() },
    borderGeofence: { findMany: jest.fn() },
    borderDwellSession: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma: any = {
    // Every query runs inside withTenant, so the mock hands the same client
    // back. That is the point of the ratchet the service has to satisfy: an
    // operation outside this callback is an operation the database is not
    // scoping.
    withTenant: jest.fn(async (_companyId: string, fn: (client: any) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx, service: new BorderDwellService(prisma as any) };
}

/** A driver standing still inside the geofence. */
const INSIDE = { lat: 0, lng: 0 };
/** Roughly 22km away — well outside a 1km geofence. */
const OUTSIDE = { lat: 0.2, lng: 0 };

describe('BorderDwellService', () => {
  let prisma: any;
  let prismaClient: any;
  let service: BorderDwellService;

  const dispatcher = { id: 'u-1', role: 'DISPATCH', companyId: COMPANY };

  beforeEach(() => {
    ({ prisma, tx: prismaClient, service } = makeService());
    void prisma;
    prismaClient.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Sipho' });
  });

  // ── ingest: opening and closing ───────────────────────────────────────────

  describe('ingestFix', () => {
    it('opens a session when a fix lands inside an active geofence', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]); // none open
      prismaClient.borderDwellSession.create.mockResolvedValue({ id: 's-1' });

      const res = await service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1' }, dispatcher);

      expect(res.opened).toEqual(['s-1']);
      expect(res.closed).toEqual([]);
      const data = prismaClient.borderDwellSession.create.mock.calls[0][0].data;
      expect(data.state).toBe('OPEN');
      expect(data.companyId).toBe(COMPANY);
      expect(data.driverId).toBe('d-1');
      expect(data.source).toBe('GPS_PORTAL');
      expect(data.exitedAt).toBeUndefined();
    });

    it('closes an open session once the driver is outside every geofence', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          geofenceId: 'g-1',
          companyId: COMPANY,
          enteredAt: new Date('2026-01-01T10:00:00Z'),
          exitedFromFixAt: new Date('2026-01-01T10:00:00Z'),
          gapLargestSeconds: 0,
        },
      ]);

      await service.ingestFix(
        COMPANY,
        { ...OUTSIDE, driverId: 'd-1', at: '2026-01-01T10:05:00Z' },
        dispatcher,
      );

      const { where, data } = prismaClient.borderDwellSession.update.mock.calls[0][0];
      expect(where.id).toBe('s-1');
      expect(data.state).toBe('CLOSED');
      expect(data.precisionSeconds).toBe(300);
    });

    it('marks a session GAPPED when the fixes are too sparse to measure it', async () => {
      // Two fixes an hour apart prove the driver was there for *at least* the
      // time between them. Calling that a 60-minute dwell would be a lie, and
      // trip-leg derivation would then label the resulting leg MEASURED.
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          geofenceId: 'g-1',
          companyId: COMPANY,
          enteredAt: new Date('2026-01-01T10:00:00Z'),
          exitedFromFixAt: new Date('2026-01-01T10:00:00Z'),
          gapLargestSeconds: 0,
        },
      ]);

      await service.ingestFix(
        COMPANY,
        { ...OUTSIDE, driverId: 'd-1', at: '2026-01-01T11:00:00Z' },
        dispatcher,
      );

      const data = prismaClient.borderDwellSession.update.mock.calls[0][0].data;
      expect(data.gapLargestSeconds).toBeGreaterThan(GAP_THRESHOLD_SECONDS);
      expect(data.state).toBe('GAPPED');
    });

    it('extends an open session instead of opening a second one', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          geofenceId: 'g-1',
          companyId: COMPANY,
          enteredAt: new Date('2026-01-01T10:00:00Z'),
          exitedFromFixAt: new Date('2026-01-01T10:00:00Z'),
          gapLargestSeconds: 0,
        },
      ]);

      await service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1' }, dispatcher);

      expect(prismaClient.borderDwellSession.create).not.toHaveBeenCalled();
      const data = prismaClient.borderDwellSession.update.mock.calls[0][0].data;
      expect(data.sampleCount).toEqual({ increment: 1 });
    });

    it('only evaluates active geofences, and lets the query do the filtering', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);
      prismaClient.borderDwellSession.create.mockResolvedValue({ id: 's-1' });

      await service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1' }, dispatcher);

      // A retired geofence must not keep generating sessions, and that belongs
      // in the query rather than in a filter the next reader has to remember to
      // apply. The service trusts the query; this pins that the query asks.
      expect(prismaClient.borderGeofence.findMany.mock.calls[0][0].where).toEqual({
        companyId: COMPANY,
        isActive: true,
      });
    });

    it('opens nothing when no geofence contains the fix', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([GEOFENCE]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);

      const res = await service.ingestFix(COMPANY, { ...OUTSIDE, driverId: 'd-1' }, dispatcher);

      expect(res.opened).toEqual([]);
      expect(prismaClient.borderDwellSession.create).not.toHaveBeenCalled();
    });

    // ── tenant boundary ─────────────────────────────────────────────────────

    it('refuses a driver from another tenant', async () => {
      prismaClient.driver.findFirst.mockResolvedValue(null); // not found in this tenant

      await expect(
        service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-other' }, dispatcher),
      ).rejects.toBeInstanceOf(NotFoundException);

      // The lookup must be tenant-scoped, not a bare findUnique by id.
      expect(prismaClient.driver.findFirst.mock.calls[0][0].where).toEqual({
        id: 'd-other',
        companyId: COMPANY,
      });
    });

    it('refuses a driver who names a different driver', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([]);
      await expect(
        service.ingestFix(
          COMPANY,
          { ...INSIDE, driverId: 'd-2' },
          { id: 'u-9', role: 'DRIVER', companyId: COMPANY },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires driverId from a non-driver caller', async () => {
      await expect(
        service.ingestFix(COMPANY, { ...INSIDE }, dispatcher),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a timestamp that is not a date', async () => {
      await expect(
        service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1', at: 'yesterday' }, dispatcher),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('runs every operation inside withTenant, with the tenant id threaded through', async () => {
      // The coverage ratchet is lexical, so this pins the runtime half: the
      // transaction is opened for this tenant and the callback receives the
      // client every query is executed on.
      prismaClient.borderGeofence.findMany.mockResolvedValue([]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);

      await service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1' }, dispatcher);

      expect(prisma.withTenant).toHaveBeenCalledTimes(1);
      expect(prisma.withTenant.mock.calls[0][0]).toBe(COMPANY);
      // Nothing reached for a client outside the transaction.
      expect(prismaClient.borderGeofence.findMany).toHaveBeenCalled();
      expect(prismaClient.borderDwellSession.findMany).toHaveBeenCalled();
    });

    it('scopes every geofence and session lookup to the tenant', async () => {
      prismaClient.borderGeofence.findMany.mockResolvedValue([]);
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);

      await service.ingestFix(COMPANY, { ...INSIDE, driverId: 'd-1' }, dispatcher);

      expect(prismaClient.borderGeofence.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: COMPANY,
      });
      expect(prismaClient.borderDwellSession.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: COMPANY,
      });
      // and never the other tenant
      expect(JSON.stringify(prismaClient.borderDwellSession.findMany.mock.calls)).not.toContain(OTHER);
    });
  });

  // ── read ──────────────────────────────────────────────────────────────────

  describe('listSessions', () => {
    it('flattens post and driver into the labels the board renders', async () => {
      prismaClient.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          companyId: COMPANY,
          postId: 'p-1',
          geofenceId: 'g-1',
          driverId: 'd-1',
          state: 'CLOSED',
          enteredAt: new Date('2026-01-01T10:00:00Z'),
          enteredFromFixAt: new Date('2026-01-01T10:00:00Z'),
          exitedAt: new Date('2026-01-01T10:30:00Z'),
          exitedFromFixAt: new Date('2026-01-01T10:30:00Z'),
          sampleCount: 12,
          precisionSeconds: 1800,
          gapLargestSeconds: 40,
          direction: 'INBOUND',
          source: 'GPS_PORTAL',
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:30:00Z'),
          post: { code: 'BEIT', name: 'Beitbridge' },
          driver: { name: 'Sipho' },
        },
      ]);

      const rows = await service.listSessions(COMPANY);

      expect(rows[0]).toMatchObject({
        postCode: 'BEIT',
        postName: 'Beitbridge',
        driverName: 'Sipho',
        state: 'CLOSED',
      });
      expect(rows[0].enteredAt).toBe('2026-01-01T10:00:00.000Z');
    });

    it('filters by the tenant, so another tenant cannot be read', async () => {
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);
      await service.listSessions(COMPANY);
      expect(prismaClient.borderDwellSession.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
    });

    it('accepts a state filter and rejects an invented one', async () => {
      prismaClient.borderDwellSession.findMany.mockResolvedValue([]);
      await service.listSessions(COMPANY, { state: 'open' });
      expect(prismaClient.borderDwellSession.findMany.mock.calls[0][0].where).toEqual({
        companyId: COMPANY,
        state: 'OPEN',
      });

      await expect(service.listSessions(COMPANY, { state: 'MAYBE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('survives a session whose driver was deleted', async () => {
      prismaClient.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          companyId: COMPANY,
          postId: 'p-1',
          geofenceId: 'g-1',
          driverId: null,
          state: 'OPEN',
          enteredAt: new Date(),
          enteredFromFixAt: new Date(),
          exitedAt: null,
          exitedFromFixAt: new Date(),
          sampleCount: 1,
          precisionSeconds: null,
          gapLargestSeconds: null,
          direction: 'INBOUND',
          source: 'GPS_PORTAL',
          createdAt: new Date(),
          updatedAt: new Date(),
          post: null,
          driver: null,
        },
      ]);

      const rows = await service.listSessions(COMPANY);
      expect(rows[0].driverName).toBeNull();
      expect(rows[0].postName).toBe('');
    });
  });
});

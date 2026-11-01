/**
 * WP3 Stage 4: TripLeg service — unit tests (mocked Prisma).
 *
 * Pins: tenant-scoped trip/leg CRUD, border leg derivation from dwell
 * sessions (MEASURED/DECLARED/REFERENCE provenance), trip total is
 * MEASURED only when every leg is MEASURED with a duration.
 */

import { NotFoundException } from '@nestjs/common';
import { TripLegService } from './trip-leg.service';

describe('TripLegService', () => {
  let service: TripLegService;
  let prisma: any;
  let audit: any;

  const COMPANY = 'C-ACME';
  const OTHER_COMPANY = 'C-EVIL';

  beforeEach(() => {
    prisma = {
      driver: { findFirst: jest.fn() },
      trip: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      tripLeg: { create: jest.fn() },
      borderDwellSession: { findMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    service = new TripLegService(prisma as any, audit as any);
  });

  // ── createTrip ───────────────────────────────────────────────────────────

  describe('createTrip', () => {
    it('creates a tenant-scoped trip', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', companyId: COMPANY });
      prisma.trip.create.mockResolvedValue({
        id: 'trip-1',
        companyId: COMPANY,
        reference: 'T-2026-0001',
        legs: [],
      });

      const trip = await service.createTrip(COMPANY, {
        reference: 'T-2026-0001',
        driverId: 'd-1',
        origin: 'Johannesburg',
        destination: 'Harare',
      });

      expect(trip.companyId).toBe(COMPANY);
      expect(trip.reference).toBe('T-2026-0001');
      expect(prisma.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trip.created',
          actorType: 'tenant',
          targetType: 'trip',
        }),
      );
    });

    it('refuses a driver from another tenant', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.createTrip(COMPANY, {
          reference: 'T-2026-0002',
          driverId: 'd-foreign',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.trip.create).not.toHaveBeenCalled();
    });
  });

  // ── getTrip ──────────────────────────────────────────────────────────────

  describe('getTrip', () => {
    it('returns a trip with legs and provenance summary', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        companyId: COMPANY,
        reference: 'T-2026-0001',
        legs: [
          {
            id: 'leg-1',
            kind: 'BORDER',
            postId: 'post-1',
            dwellSessionId: 'session-1',
            provenance: 'MEASURED',
            durationMinutes: 45,
            startedAt: new Date(),
            endedAt: new Date(),
          },
          {
            id: 'leg-2',
            kind: 'LINEHAUL',
            postId: null,
            dwellSessionId: null,
            provenance: 'REFERENCE',
            durationMinutes: 300,
            startedAt: null,
            endedAt: null,
          },
        ],
      });

      const trip = await service.getTrip(COMPANY, 'trip-1');

      expect(trip.reference).toBe('T-2026-0001');
      expect(trip.summary.provenance).toBe('PARTIAL');
      expect(trip.summary.isFullyMeasured).toBe(false);
      expect(trip.summary.totalDurationMinutes).toBeNull();
      expect(trip.summary.measuredLegs).toBe(1);
      expect(trip.summary.referenceLegs).toBe(1);
    });

    it('returns MEASURED provenance when all legs are MEASURED with duration', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        companyId: COMPANY,
        reference: 'T-2026-0001',
        legs: [
          {
            id: 'leg-1',
            kind: 'BORDER',
            postId: 'post-1',
            dwellSessionId: 'session-1',
            provenance: 'MEASURED',
            durationMinutes: 45,
          },
          {
            id: 'leg-2',
            kind: 'LINEHAUL',
            postId: null,
            dwellSessionId: null,
            provenance: 'MEASURED',
            durationMinutes: 300,
          },
        ],
      });

      const trip = await service.getTrip(COMPANY, 'trip-1');

      expect(trip.summary.provenance).toBe('MEASURED');
      expect(trip.summary.isFullyMeasured).toBe(true);
      expect(trip.summary.totalDurationMinutes).toBe(345);
    });

    it('scopes trip lookup by companyId — never leaks cross-tenant', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.getTrip(COMPANY, 'trip-foreign')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.trip.findFirst).toHaveBeenCalledWith({
        where: { id: 'trip-foreign', companyId: COMPANY },
        include: expect.any(Object),
      });
    });
  });

  // ── deriveBorderLegsFromDwellSessions ────────────────────────────────────

  describe('deriveBorderLegsFromDwellSessions', () => {
    const tripId = 'trip-1';

    it('creates MEASURED BORDER legs from CLOSED dwell sessions with duration', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: tripId, companyId: COMPANY, legs: [] });
      prisma.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          companyId: COMPANY,
          postId: 'post-beitbridge',
          post: { id: 'post-beitbridge', code: 'BEIT_BRIDGE', name: 'Beitbridge Border Post' },
          state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'),
          exitedAt: new Date('2026-11-01T09:45:00Z'),
          gapLargestSeconds: null,
          driverId: 'd-1',
        },
      ]);
      prisma.tripLeg.create.mockResolvedValue({
        id: 'leg-1',
        kind: 'BORDER',
        provenance: 'MEASURED',
        durationMinutes: 45,
      });

      const legs = await service.deriveBorderLegsFromDwellSessions(COMPANY, tripId);

      expect(legs).toHaveLength(1);
      expect(prisma.tripLeg.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            tripId,
            kind: 'BORDER',
            postId: 'post-beitbridge',
            dwellSessionId: 'session-1',
            provenance: 'MEASURED',
            durationMinutes: 45,
            confidenceNote: null,
          }),
        }),
      );
    });

    it('creates MEASURED BORDER leg with null duration for GAPPED sessions', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: tripId, companyId: COMPANY, legs: [] });
      prisma.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 'session-2',
          companyId: COMPANY,
          postId: 'post-chirundu',
          post: { id: 'post-chirundu', code: 'CHIRUNDU', name: 'Chirundu Border Post' },
          state: 'GAPPED',
          enteredAt: new Date('2026-11-01T09:00:00Z'),
          exitedAt: null,
          gapLargestSeconds: 1800,
          driverId: 'd-1',
        },
      ]);
      prisma.tripLeg.create.mockResolvedValue({
        id: 'leg-2',
        kind: 'BORDER',
        provenance: 'MEASURED',
        durationMinutes: null,
      });

      const legs = await service.deriveBorderLegsFromDwellSessions(COMPANY, tripId);

      expect(legs).toHaveLength(1);
      expect(prisma.tripLeg.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provenance: 'MEASURED',
            durationMinutes: null,
            confidenceNote: expect.stringContaining('GAPPED dwell session'),
          }),
        }),
      );
    });

    it('is idempotent — skips sessions that already have a leg', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: tripId,
        companyId: COMPANY,
        legs: [{ dwellSessionId: 'session-1', postId: 'post-1' }],
      });
      prisma.borderDwellSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          companyId: COMPANY,
          postId: 'post-1',
          post: { id: 'post-1', code: 'TEST', name: 'Test' },
          state: 'CLOSED',
          enteredAt: new Date(),
          exitedAt: new Date(),
          gapLargestSeconds: null,
          driverId: null,
        },
      ]);

      const legs = await service.deriveBorderLegsFromDwellSessions(COMPANY, tripId);

      expect(legs).toHaveLength(0);
      expect(prisma.tripLeg.create).not.toHaveBeenCalled();
    });

    it('scopes dwell session lookup by companyId', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: tripId, companyId: COMPANY, legs: [] });
      prisma.borderDwellSession.findMany.mockResolvedValue([]);

      await service.deriveBorderLegsFromDwellSessions(COMPANY, tripId);

      expect(prisma.borderDwellSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY }),
        }),
      );
    });

    it('refuses when trip is not in the caller tenant', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        service.deriveBorderLegsFromDwellSessions(COMPANY, 'trip-foreign'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.tripLeg.create).not.toHaveBeenCalled();
    });
  });

  // ── createDeclaredLeg ────────────────────────────────────────────────────

  describe('createDeclaredLeg', () => {
    it('creates a DECLARED leg with the acting user as source', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });
      prisma.tripLeg.create.mockResolvedValue({
        id: 'leg-declared',
        kind: 'BORDER',
        provenance: 'DECLARED',
        durationMinutes: 60,
      });

      const leg = await service.createDeclaredLeg(COMPANY, 'trip-1', {
        postId: 'post-1',
        durationMinutes: 60,
        confidenceNote: 'Dispatcher estimate',
        capturedBy: 'u-dispatch',
      });

      expect(leg.provenance).toBe('DECLARED');
      expect(prisma.tripLeg.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            provenance: 'DECLARED',
            source: 'declared:u-dispatch',
            durationMinutes: 60,
          }),
        }),
      );
    });
  });

  // ── createReferenceLeg ───────────────────────────────────────────────────

  describe('createReferenceLeg', () => {
    it('creates a REFERENCE leg that is never summed into measured totals', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });
      prisma.tripLeg.create.mockResolvedValue({
        id: 'leg-ref',
        kind: 'LINEHAUL',
        provenance: 'REFERENCE',
        durationMinutes: 300,
      });

      const leg = await service.createReferenceLeg(COMPANY, 'trip-1', {
        kind: 'LINEHAUL',
        durationMinutes: 300,
        source: 'static-corridor-table',
        notes: 'Planning estimate',
      });

      expect(leg.provenance).toBe('REFERENCE');
      expect(prisma.tripLeg.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provenance: 'REFERENCE',
            source: 'static-corridor-table',
          }),
        }),
      );
    });
  });
});

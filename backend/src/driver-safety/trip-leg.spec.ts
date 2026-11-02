/**
 * WP3 Stage 4 + Stage 5: TripLeg service — unit tests (mocked Prisma).
 *
 * Pins: tenant-scoped trip/leg CRUD, border leg derivation from dwell
 * sessions (MEASURED/DECLARED/REFERENCE provenance), trip total is
 * MEASURED only when every leg is MEASURED with a duration.
 *
 * Stage 5: HS code format validation, origin status never guessed,
 * duty ESTIMATED vs ACTUAL side by side with variance, never blended.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripLegService } from './trip-leg.service';

describe('TripLegService', () => {
  let service: TripLegService;
  let prisma: any;
  let audit: any;

  const COMPANY = 'C-ACME';

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

  // ── deriveBorderLegsFromDwellSessions ────────────────────────────────

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

    it('refuses when trip is not in the caller tenant', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        service.deriveBorderLegsFromDwellSessions(COMPANY, 'trip-foreign'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.tripLeg.create).not.toHaveBeenCalled();
    });
  });

  // ── createDeclaredLeg ────────────────────────────────────────────────

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

  // ── createReferenceLeg ───────────────────────────────────────────────

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

  // ── Stage 5: setHsOrigin ────────────────────────────────────────────

  describe('setHsOrigin', () => {
    it('sets HS code + origin status on a trip', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });
      prisma.trip.update.mockResolvedValue({
        id: 'trip-1', companyId: COMPANY, hsCode: '300490', originStatus: 'PREFERENTIAL',
      });

      const result = await service.setHsOrigin(COMPANY, 'trip-1', {
        hsCode: '300490',
        originStatus: 'PREFERENTIAL',
        certificateOfOriginRef: 'CO-2026-001',
        capturedBy: 'u-dispatch',
      });

      expect(result.hsCode).toBe('300490');
      expect(result.originStatus).toBe('PREFERENTIAL');
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          hsCode: '300490',
          originStatus: 'PREFERENTIAL',
          certificateOfOriginRef: 'CO-2026-001',
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'trip.hs_origin_set' }),
      );
    });

    it('rejects an invalid HS code (not 6-10 digits)', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });

      await expect(
        service.setHsOrigin(COMPANY, 'trip-1', {
          hsCode: '123', // too short
          capturedBy: 'u-dispatch',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('rejects a trip not in the caller tenant', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        service.setHsOrigin(COMPANY, 'trip-foreign', {
          hsCode: '300490', capturedBy: 'u-dispatch',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Stage 5: setDutyEstimate ────────────────────────────────────────

  describe('setDutyEstimate', () => {
    it('sets ESTIMATED duty from a named, versioned reference', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });
      prisma.trip.update.mockResolvedValue({
        id: 'trip-1', companyId: COMPANY, dutyEstimated: 450,
        estimateSource: 'AfCFTA e-Tariff Book', estimateVersion: '2026.11',
      });

      const result = await service.setDutyEstimate(COMPANY, 'trip-1', {
        duty: 450,
        estimateSource: 'AfCFTA e-Tariff Book',
        estimateVersion: '2026.11',
        capturedBy: 'u-dispatch',
      });

      expect(result.dutyEstimated).toBe(450);
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          dutyEstimated: 450,
          estimateSource: 'AfCFTA e-Tariff Book',
          estimateVersion: '2026.11',
          estimatedAt: expect.any(Date),
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trip.duty_estimate_set',
          metadata: expect.objectContaining({ provenance: 'ESTIMATED' }),
        }),
      );
    });
  });

  // ── Stage 5: setDutyActual ────────────────────────────────────────

  describe('setDutyActual', () => {
    it('sets ACTUAL duty from a declaration', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });
      prisma.trip.update.mockResolvedValue({
        id: 'trip-1', companyId: COMPANY, dutyActual: 480,
        declarationRef: 'DEC-2026-001', capturedBy: 'u-dispatch',
      });

      const result = await service.setDutyActual(COMPANY, 'trip-1', {
        duty: 480,
        declarationRef: 'DEC-2026-001',
        capturedBy: 'u-dispatch',
      });

      expect(result.dutyActual).toBe(480);
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          dutyActual: 480,
          declarationRef: 'DEC-2026-001',
          capturedBy: 'u-dispatch',
          capturedAt: expect.any(Date),
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trip.duty_actual_set',
          metadata: expect.objectContaining({ provenance: 'ACTUAL' }),
        }),
      );
    });

    it('rejects ACTUAL duty without a declarationRef', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1', companyId: COMPANY });

      await expect(
        service.setDutyActual(COMPANY, 'trip-1', {
          duty: 480, declarationRef: '', capturedBy: 'u-dispatch',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });

  // ── Stage 5: getDutySummary ────────────────────────────────────────

  describe('getDutySummary', () => {
    it('returns ESTIMATED vs ACTUAL side by side with variance when both present', () => {
      const trip: any = {
        id: 'trip-1', reference: 'T-2026-0001', hsCode: '300490',
        originStatus: 'PREFERENTIAL', certificateOfOriginRef: 'CO-1',
        dutyEstimated: 450, estimateSource: 'AfCFTA e-Tariff Book',
        estimateVersion: '2026.11', estimatedAt: new Date(),
        dutyActual: 480, declarationRef: 'DEC-1', capturedBy: 'u-dispatch',
        capturedAt: new Date(),
      };

      const summary = service.getDutySummary(trip);

      expect(summary.estimated.value).toBe(450);
      expect(summary.estimatedLabel).toContain('ESTIMATED');
      expect(summary.actual.value).toBe(480);
      expect(summary.actualLabel).toBe('ACTUAL (declaration)');
      expect(summary.variance).toBe(30);
      expect(summary.varianceLabel).toBe('+30');
      expect(summary.hasBoth).toBe(true);
    });

    it('returns NOT CAPTURED for actual when only estimate exists', () => {
      const trip: any = {
        id: 'trip-1', reference: 'T-2026-0001', hsCode: null,
        originStatus: 'UNKNOWN', certificateOfOriginRef: null,
        dutyEstimated: 450, estimateSource: 'AfCFTA e-Tariff Book',
        estimateVersion: '2026.11', estimatedAt: new Date(),
        dutyActual: null, declarationRef: null, capturedBy: null, capturedAt: null,
      };

      const summary = service.getDutySummary(trip);

      expect(summary.estimated.value).toBe(450);
      expect(summary.actual).toBeNull();
      expect(summary.actualLabel).toBe('NOT CAPTURED');
      expect(summary.variance).toBeNull();
      expect(summary.hasEstimateOnly).toBe(true);
      expect(summary.hasBoth).toBe(false);
    });

    it('returns NOT CAPTURED for both when neither exists', () => {
      const trip: any = {
        id: 'trip-1', reference: 'T-2026-0001', hsCode: null,
        originStatus: 'UNKNOWN', certificateOfOriginRef: null,
        dutyEstimated: null, estimateSource: null, estimateVersion: null, estimatedAt: null,
        dutyActual: null, declarationRef: null, capturedBy: null, capturedAt: null,
      };

      const summary = service.getDutySummary(trip);

      expect(summary.estimatedLabel).toBe('NOT CAPTURED');
      expect(summary.actualLabel).toBe('NOT CAPTURED');
      expect(summary.variance).toBeNull();
      expect(summary.hasBoth).toBe(false);
    });
  });
});

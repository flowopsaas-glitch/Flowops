/**
 * WP4 — Safety Incident Service — unit tests (mocked Prisma).
 *
 * Pins: claim/zone split (report creates incident, not a zone), rate limit,
 * dedupe, identity-from-session, verification creates zone + broadcast,
 * reject/withdraw rules, corroboration, expiry sweep, retention sweep,
 * cross-tenant denial.
 */

import { SafetyIncidentService } from './safety-incident.service';

describe('SafetyIncidentService', () => {
  let service: SafetyIncidentService;
  let prisma: any;
  let audit: any;
  let gateway: any;
  let outbox: any;
  let notifications: any;

  const COMPANY = 'C-ACME';
  const OTHER_COMPANY = 'C-EVIL';

  beforeEach(() => {
    prisma = {
      driver: { findFirst: jest.fn() },
      safetyIncident: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      safetyCorroboration: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      safetyZone: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      safetyAlert: { findMany: jest.fn(), update: jest.fn() },
      safetyRetentionSweep: { create: jest.fn() },
      notification: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    gateway = { emitToDriver: jest.fn(), broadcastToCompany: jest.fn() };
    outbox = { enqueue: jest.fn().mockResolvedValue('outbox-1') };
    notifications = { create: jest.fn().mockResolvedValue('notif-1') };
    service = new SafetyIncidentService(
      prisma as any, audit as any, gateway as any, outbox as any, notifications as any,
    );
  });

  // ── reportIncident ──────────────────────────────────────────────────────

  describe('reportIncident', () => {
    it('creates a REPORTED incident (claim), not a SafetyZone (assertion)', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });
      prisma.safetyIncident.count.mockResolvedValue(0);
      prisma.safetyIncident.findFirst.mockResolvedValue(null);
      prisma.safetyIncident.create.mockResolvedValue({
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'HIJACKING_ATTEMPT',
      });

      const result = await service.reportIncident(COMPANY, {
        id: 'u-driver', role: 'DRIVER', email: 'thabo@acme.co.za',
      }, {
        type: 'HIJACKING_ATTEMPT',
        reportLat: -26.2, reportLng: 28.0,
        reportAccuracyM: 15,
        locationSource: 'DEVICE_GPS',
        narrative: 'Suspicious vehicle following',
        idempotencyKey: 'report:d-1:HIJACKING_ATTEMPT:ABC123:1',
      });

      expect(result.action).toBe('reported');
      expect(prisma.safetyIncident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            status: 'REPORTED',
            reportedByDriverId: 'd-1',
            reportedByUserId: null,
          }),
        }),
      );
      // No SafetyZone created — only an incident
      expect(prisma.safetyZone.create).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'safety_incident.reported' }),
      );
    });

    it('refuses a driver not in the caller tenant', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.reportIncident(COMPANY, {
          id: 'u-foreign', role: 'DRIVER',
        }, {
          type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0,
          idempotencyKey: 'k',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.safetyIncident.create).not.toHaveBeenCalled();
    });

    it('enforces rate limit — 6 reports per hour', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1' });
      prisma.safetyIncident.count.mockResolvedValue(6); // at limit

      await expect(
        service.reportIncident(COMPANY, { id: 'u-driver', role: 'DRIVER' }, {
          type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0, idempotencyKey: 'k',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.safetyIncident.create).not.toHaveBeenCalled();
    });

    it('dedupes same reporter, same geohash6, same type within 10 min', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1' });
      prisma.safetyIncident.count.mockResolvedValue(0);
      prisma.safetyIncident.findFirst.mockResolvedValue({
        id: 'inc-existing', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
      });
      prisma.safetyIncident.update.mockResolvedValue({ id: 'inc-existing' });

      const result = await service.reportIncident(COMPANY, { id: 'u-driver', role: 'DRIVER' }, {
        type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0, idempotencyKey: 'k',
      });

      expect(result.action).toBe('deduplicated');
      expect(prisma.safetyIncident.create).not.toHaveBeenCalled();
    });

    it('allows a supervisory actor to report on a driver’s behalf', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-9', name: 'Nomsa Dlamini' });
      prisma.safetyIncident.count.mockResolvedValue(0);
      prisma.safetyIncident.findFirst.mockResolvedValue(null);
      prisma.safetyIncident.create.mockResolvedValue({ id: 'inc-1', status: 'REPORTED' });

      const result = await service.reportIncident(COMPANY, {
        id: 'u-dispatch', role: 'DISPATCH', email: 'dispatch@acme.co.za',
      }, {
        type: 'ROAD_CLOSED', reportLat: -26.2, reportLng: 28.0,
        idempotencyKey: 'k',
      });

      expect(result.action).toBe('reported');
      expect(prisma.safetyIncident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportedByDriverId: null,
            reportedByUserId: 'u-dispatch',
          }),
        }),
      );
    });
  });

  // ── verifyIncident ──────────────────────────────────────────────────────

  describe('verifyIncident', () => {
    it('creates a SafetyZone (assertion) only on verification', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'HIJACKING_ATTEMPT',
        severity: 'MEDIUM', reportLat: -26.2, reportLng: 28.0,
        reportedByUserId: 'u-reporter', reportedByDriverId: null,
        narrative: 'Hijacking attempt on N1',
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);
      prisma.safetyZone.create.mockResolvedValue({
        id: 'zone-1', companyId: COMPANY, incidentId: 'inc-1', radiusM: 3000,
      });
      prisma.safetyIncident.update.mockResolvedValue({
        ...incident, status: 'VERIFIED', zoneId: 'zone-1',
      });

      const result = await service.verifyIncident(COMPANY, 'inc-1', {
        id: 'u-verifier', email: 'verifier@acme.co.za',
      }, {
        verificationMethod: 'DISPATCH_CONFIRM',
        severity: 'CRITICAL',
        radiusM: 3000,
        ttlHours: 12,
      });

      expect(result.status).toBe('VERIFIED');
      expect(prisma.safetyZone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            incidentId: 'inc-1',
            source: 'VERIFIED_INCIDENT',
            expiresAt: expect.any(Date),
          }),
        }),
      );
      expect(gateway.emitToDriver).toHaveBeenCalled(); // broadcast fires
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'safety_incident.verified' }),
      );
    });

    it('refuses when the verifier is the reporter', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportedByUserId: 'u-reporter', reportedByDriverId: null,
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.verifyIncident(COMPANY, 'inc-1', { id: 'u-reporter' }, {
          verificationMethod: 'DISPATCH_CONFIRM',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.safetyZone.create).not.toHaveBeenCalled();
    });

    it('refuses to verify an already-verified incident', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'VERIFIED', type: 'ACCIDENT',
        reportedByUserId: 'u-reporter', reportedByDriverId: null,
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.verifyIncident(COMPANY, 'inc-1', { id: 'u-verifier' }, {
          verificationMethod: 'DISPATCH_CONFIRM',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── rejectIncident ──────────────────────────────────────────────────────

  describe('rejectIncident', () => {
    it('rejects with a reason and named rejecter', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportedByUserId: 'u-reporter', reportedByDriverId: null,
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);
      prisma.safetyIncident.update.mockResolvedValue({
        ...incident, status: 'REJECTED', rejectedByUserId: 'u-verifier',
      });

      const result = await service.rejectIncident(COMPANY, 'inc-1', {
        id: 'u-verifier', email: 'verifier@acme.co.za',
      }, {
        rejectionReason: 'NOT_THERE',
        rejectionNote: 'Driver was at a different location',
      });

      expect(result.status).toBe('REJECTED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'safety_incident.rejected' }),
      );
    });
  });

  // ── withdrawIncident ────────────────────────────────────────────────────

  describe('withdrawIncident', () => {
    it('allows the reporting driver to withdraw an unverified incident', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportedByDriverId: 'd-1', reportedByUserId: null,
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);
      prisma.safetyIncident.update.mockResolvedValue({
        ...incident, status: 'WITHDRAWN',
      });

      const result = await service.withdrawIncident(COMPANY, 'inc-1', 'd-1');

      expect(result.status).toBe('WITHDRAWN');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'safety_incident.withdrawn' }),
      );
    });

    it('refuses a non-reporting driver from withdrawing', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportedByDriverId: 'd-1', reportedByUserId: null,
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.withdrawIncident(COMPANY, 'inc-1', 'd-other'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── corroborateIncident ─────────────────────────────────────────────────

  describe('corroborateIncident', () => {
    it('promotes to CORROBORATED when a second driver matches within radius', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportLat: -26.2, reportLng: 28.0,
        reportedAt: new Date(),
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-2', name: 'Second Driver' });
      prisma.safetyCorroboration.findFirst.mockResolvedValue(null);
      prisma.safetyCorroboration.create.mockResolvedValue({
        id: 'corr-1', incidentId: 'inc-1', driverId: 'd-2', distanceM: 300,
      });
      prisma.safetyIncident.update.mockResolvedValue({
        ...incident, status: 'CORROBORATED',
      });

      const result = await service.corroborateIncident(COMPANY, { id: 'u-actor' }, {
        incidentId: 'inc-1', driverId: 'd-2', reportLat: -26.201, reportLng: 28.001,
      });

      expect(result.action).toBe('corroborated');
      expect(prisma.safetyCorroboration.create).toHaveBeenCalled();
    });

    it('refuses corroboration outside the 1500 m radius', async () => {
      const incident = {
        id: 'inc-1', companyId: COMPANY, status: 'REPORTED', type: 'ACCIDENT',
        reportLat: -26.2, reportLng: 28.0,
        reportedAt: new Date(),
      };
      prisma.safetyIncident.findFirst.mockResolvedValue(incident);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-2', name: 'Second Driver' });

      await expect(
        service.corroborateIncident(COMPANY, { id: 'u-actor' }, {
          incidentId: 'inc-1', driverId: 'd-2',
          reportLat: -26.5, reportLng: 28.5, // ~33 km away
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.safetyCorroboration.create).not.toHaveBeenCalled();
    });
  });

  // ── sweepExpiredIncidents ───────────────────────────────────────────────

  describe('sweepExpiredIncidents', () => {
    it('marks expired incidents EXPIRED and deactivates linked zones', async () => {
      const past = new Date(Date.now() - 3600000); // 1 hour ago
      prisma.safetyIncident.findMany.mockResolvedValue([
        {
          id: 'inc-1', companyId: COMPANY, status: 'VERIFIED', expiresAt: past,
          zoneId: 'zone-1', zone: { id: 'zone-1', isActive: true },
        },
      ]);
      prisma.safetyIncident.update.mockResolvedValue({});
      prisma.safetyZone.update.mockResolvedValue({});

      const result = await service.sweepExpiredIncidents(COMPANY);

      expect(result.expiredCount).toBe(1);
      expect(prisma.safetyIncident.update).toHaveBeenCalledWith({
        where: { id: 'inc-1' },
        data: { status: 'EXPIRED', expiredAt: expect.any(Date) },
      });
      expect(prisma.safetyZone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { isActive: false },
      });
    });
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';

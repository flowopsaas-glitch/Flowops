/**
 * WP4 — Safety Incident Layer, end to end against a real (in CI: PostgreSQL)
 * database.
 *
 * Covers claim/zone split (report creates incident, not a zone), verification
 * creates zone + broadcast, reject/withdraw rules, corroboration, expiry sweep,
 * and cross-tenant isolation.
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with: npm run test:integration
 */

import { PrismaClient } from '@prisma/client';
import { SafetyIncidentService } from '../../src/driver-safety/safety-incident.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('SafetyIncidentService (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: SafetyIncidentService;

  const audit = { record: jest.fn().mockResolvedValue('audit-id') };
  const gateway = { emitToDriver: jest.fn(), broadcastToCompany: jest.fn() };
  const outbox = { enqueue: jest.fn().mockResolvedValue('outbox-id') };
  const notifications = { create: jest.fn().mockResolvedValue('notif-id') };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new SafetyIncidentService(
      prisma as any, audit as any, gateway as any, outbox as any, notifications as any,
    );
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  // ── Seed helpers ───────────────────────────────────────────────────────

  async seedDriver(companyId: String, userId?: string) {
    return prisma.driver.create({
      data: {
        name: 'Thabo Mokoena',
        phone: '+27 82 000 0000',
        companyId: companyId as string,
        vehicleReg: 'GP 12345',
        isActive: true,
        ...(userId ? { userId } : {}),
      },
    });
  }

  async seedUser(companyId: string, role = 'DISPATCH') {
    return prisma.user.create({
      data: {
        email: `user-${role.toLowerCase()}@acme.co.za`,
        name: 'Test User',
        role: role as any,
        companyId,
        isActive: true,
      },
    });
  }

  // ── Report: claim, not zone ────────────────────────────────────────────

  it('creates a REPORTED incident, not a SafetyZone', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId as string);
    const user = await seedUser(companyId, 'DRIVER');
    await prisma.driver.update({
      where: { id: driver.id },
      data: { userId: user.id },
    });

    const result = await service.reportIncident(companyId, {
      id: user.id, role: 'DRIVER', email: user.email,
    }, {
      type: 'HIJACKING_ATTEMPT',
      reportLat: -26.2, reportLng: 28.0,
      reportAccuracyM: 15,
      locationSource: 'DEVICE_GPS',
      narrative: 'Suspicious vehicle following',
      idempotencyKey: `report:${driver.id}:HIJACKING_ATTEMPT:ABC123:1`,
    });

    expect(result.action).toBe('reported');
    expect(result.status).toBe('REPORTED');

    // Confirm no SafetyZone was created
    const zones = await prisma.safetyZone.findMany({ where: { companyId } });
    expect(zones).toHaveLength(0);

    // Confirm the incident exists
    const inc = await prisma.safetyIncident.findFirst({
      where: { companyId, id: result.id },
    });
    expect(inc.status).toBe('REPORTED');
  });

  // ── Verify: creates zone + broadcast ──────────────────────────────────

  it('verification creates a SafetyZone and broadcasts to drivers in radius', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const reporter = await seedDriver(companyId as string);
    const reporterUser = await seedUser(companyId, 'DRIVER');
    await prisma.driver.update({ where: { id: reporter.id }, data: { userId: reporterUser.id } });

    const verifier = await seedDriver(companyId as string, 'verifier-user');
    const verifierUser = await seedUser(companyId, 'DISPATCH');
    await prisma.driver.update({ where: { id: verifier.id }, data: { userId: verifierUser.id } });

    // Create incident
    const incident = await service.reportIncident(companyId, {
      id: reporterUser.id, role: 'DRIVER',
    }, {
      type: 'HIJACKING_ATTEMPT', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:${reporter.id}:HIJACKING_ATTEMPT:DEF456:1`,
    });

    // Verify it
    const verified = await service.verifyIncident(companyId, incident.id, {
      id: verifierUser.id, email: verifierUser.email,
    }, {
      verificationMethod: 'DISPATCH_CONFIRM',
      severity: 'CRITICAL',
      radiusM: 3000,
      ttlHours: 12,
    });

    expect(verified.status).toBe('VERIFIED');
    expect(verified.zoneId).toBeDefined();

    // Confirm a SafetyZone was created with incidentId and VERIFIED_INCIDENT source
    const zone = await prisma.safetyZone.findFirst({
      where: { companyId, incidentId: incident.id },
    });
    expect(zone).not.toBeNull();
    expect(zone.source).toBe('VERIFIED_INCIDENT');
    expect(zone.expiresAt).not.toBeNull();
    expect(zone.incidentId).toBe(incident.id);

    // Confirm broadcast fired
    expect(gateway.emitToDriver).toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  // ── Reject ────────────────────────────────────────────────────────────

  it('rejects an incident with a reason and named rejecter', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const reporterUser = await seedUser(companyId, 'DRIVER');
    const rejecter = await seedUser(companyId, 'DISPATCH');

    const incident = await service.reportIncident(companyId, {
      id: reporterUser.id, role: 'DRIVER',
    }, {
      type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:d-1:ACCIDENT:GHI789:1`,
    });

    const rejected = await service.rejectIncident(companyId, incident.id, {
      id: rejecter.id, email: rejecter.email,
    }, {
      rejectionReason: 'NOT_THERE',
      rejectionNote: 'Driver was at a different location',
    });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toContain('NOT_THERE');
  });

  // ── Withdraw ──────────────────────────────────────────────────────────

  it('allows the reporting driver to withdraw an unverified incident', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId as string);
    const user = await seedUser(companyId, 'DRIVER');
    await prisma.driver.update({ where: { id: driver.id }, data: { userId: user.id } });

    const incident = await service.reportIncident(companyId, {
      id: user.id, role: 'DRIVER',
    }, {
      type: 'VEHICLE_HAZARD', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:${driver.id}:VEHICLE_HAZARD:JKL012:1`,
    });

    const withdrawn = await service.withdrawIncident(companyId, incident.id, driver.id);

    expect(withdrawn.status).toBe('WITHDRAWN');
  });

  // ── Corroborate ───────────────────────────────────────────────────────

  it('corroborates when a second driver matches within 1500 m', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const reporterUser = await seedUser(companyId, 'DRIVER');
    const driver2 = await seedDriver(companyId as string, 'driver2-user');
    const driver2User = await seedUser(companyId, 'DRIVER');
    await prisma.driver.update({ where: { id: driver2.id }, data: { userId: driver2User.id } });

    const incident = await service.reportIncident(companyId, {
      id: reporterUser.id, role: 'DRIVER',
    }, {
      type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:d-1:ACCIDENT:MNO345:1`,
    });

    const result = await service.corroborateIncident(companyId, { id: driver2User.id }, {
      incidentId: incident.id, driverId: driver2.id,
      reportLat: -26.2005, reportLng: 28.0005, // ~50 m away
    });

    expect(result.action).toBe('corroborated');

    // Confirm incident is now CORROBORATED
    const inc = await prisma.safetyIncident.findFirst({
      where: { id: incident.id },
    });
    expect(inc.status).toBe('CORROBORATED');

    // Confirm corroboration record
    const corr = await prisma.safetyCorroboration.findFirst({
      where: { incidentId: incident.id, driverId: driver2.id },
    });
    expect(corr).not.toBeNull();
    expect(corr.distanceM).toBeGreaterThan(0);
  });

  // ── Expiry sweep ──────────────────────────────────────────────────────

  it('expires incidents past their TTL and deactivates linked zones', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const reporterUser = await seedUser(companyId, 'DRIVER');
    const verifierUser = await seedUser(companyId, 'DISPATCH');

    const incident = await service.reportIncident(companyId, {
      id: reporterUser.id, role: 'DRIVER',
    }, {
      type: 'VEHICLE_HAZARD', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:d-1:VEHICLE_HAZARD:PQR678:1`,
    });

    const verified = await service.verifyIncident(companyId, incident.id, {
      id: verifierUser.id, email: verifierUser.email,
    }, {
      verificationMethod: 'DISPATCH_CONFIRM',
      radiusM: 500,
      ttlHours: 0, // expires immediately
    });

    // Manually set expiresAt to the past
    await prisma.safetyIncident.update({
      where: { id: incident.id },
      data: { expiresAt: new Date(Date.now() - 60000) }, // 1 min ago
    });

    const result = await service.sweepExpiredIncidents(companyId);

    expect(result.expiredCount).toBe(1);

    // Confirm incident is EXPIRED
    const inc = await prisma.safetyIncident.findFirst({ where: { id: incident.id } });
    expect(inc.status).toBe('EXPIRED');

    // Confirm zone is deactivated
    const zone = await prisma.safetyZone.findFirst({ where: { id: verified.zoneId } });
    expect(zone.isActive).toBe(false);
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────

  it('does not leak incidents across tenants', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const reporterUser = await seedUser(acme, 'DRIVER');

    const incident = await service.reportIncident(acme, {
      id: reporterUser.id, role: 'DRIVER',
    }, {
      type: 'ACCIDENT', reportLat: -26.2, reportLng: 28.0,
      idempotencyKey: `report:d-1:ACCIDENT:STU901:1`,
    });

    // Evil Co cannot see Acme's incident
    await expect(
      service.getIncident(evil, incident.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const evilIncidents = await service.listIncidents(evil);
    expect(evilIncidents).toHaveLength(0);
  });
});

import { NotFoundException } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

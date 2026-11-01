/**
 * WP3 Stage 4: Trip corridor split, end to end against a real (in CI:
 * PostgreSQL) database.
 *
 * Covers trip creation, border leg derivation from dwell sessions,
 * provenance labels (MEASURED / DECLARED / REFERENCE), and trip total
 * computation — MEASURED only when every leg is MEASURED with a duration.
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with: npm run test:integration
 */

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TripLegService } from '../../src/driver-safety/trip-leg.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('TripLegService (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: TripLegService;

  const audit = { record: jest.fn().mockResolvedValue('audit-id') };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new TripLegService(prisma as any, audit as any);
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  // ── Seed helpers ─────────────────────────────────────────────────────────

  async seedPost(companyId: string, overrides: Partial<{ code: string; name: string; lat: number; lng: number }> = {}) {
    return prisma.borderPost.create({
      data: {
        companyId,
        code: overrides.code ?? 'BEIT_BRIDGE',
        name: overrides.name ?? 'Beitbridge Border Post',
        countries: 'ZA,ZW',
        lat: overrides.lat ?? -22.2167,
        lng: overrides.lng ?? 29.9833,
        is24Hour: true,
      },
    });
  }

  async seedGeofence(companyId: string, postId: string, overrides: Partial<{ code: string; lat: number; lng: number; radiusM: number; side: string }> = {}) {
    return prisma.borderGeofence.create({
      data: {
        companyId,
        postId,
        code: overrides.code ?? 'BEIT_BRIDGE_ZA',
        name: overrides.name ?? 'Beitbridge Border (SA side)',
        lat: overrides.lat ?? -22.2167,
        lng: overrides.lng ?? 29.9833,
        radiusM: overrides.radiusM ?? 3000,
        side: overrides.side ?? 'EXPORT',
        isActive: true,
        provenance: 'SEED',
      },
    });
  }

  async seedDriver(companyId: string) {
    return prisma.driver.create({
      data: {
        name: 'Thabo Mokoena',
        phone: '+27 82 000 0000',
        companyId,
        vehicleReg: 'GP 12345',
        isActive: true,
      },
    });
  }

  async seedSession(
    companyId: string,
    postId: string,
    geofenceId: string,
    overrides: Partial<{
      driverId: string;
      state: string;
      enteredAt: Date;
      exitedAt: Date;
      sampleCount: number;
    }> = {},
  ) {
    return prisma.borderDwellSession.create({
      data: {
        companyId,
        postId,
        geofenceId,
        driverId: overrides.driverId ?? null,
        state: overrides.state ?? 'CLOSED',
        enteredAt: overrides.enteredAt ?? new Date('2026-11-01T09:00:00Z'),
        enteredFromFixAt: overrides.enteredAt ?? new Date('2026-11-01T09:00:00Z'),
        exitedAt: overrides.exitedAt ?? new Date('2026-11-01T09:30:00Z'),
        exitedFromFixAt: overrides.exitedAt ?? new Date('2026-11-01T09:30:00Z'),
        sampleCount: overrides.sampleCount ?? 5,
        precisionSeconds: 60,
        direction: 'INBOUND',
        source: 'GPS_PORTAL',
      },
    });
  }

  // ── Trip CRUD ────────────────────────────────────────────────────────────

  it('creates a tenant-scoped trip', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
      vehicleReg: 'GP 12345',
      origin: 'Johannesburg',
      destination: 'Harare',
    });

    expect(trip.companyId).toBe(companyId);
    expect(trip.reference).toBe('T-2026-0001');
    expect(trip.driverId).toBe(driver.id);
    expect(trip.status).toBe('PLANNED');
  });

  it('refuses a driver from another tenant', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const driver = await seedDriver(evil);

    await expect(
      service.createTrip(acme, { reference: 'T-2026-0002', driverId: driver.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Border leg derivation from dwell sessions ────────────────────────────

  it('derives MEASURED BORDER legs from CLOSED dwell sessions with duration', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
      origin: 'Johannesburg',
      destination: 'Harare',
    });

    await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      enteredAt: new Date('2026-11-01T09:00:00Z'),
      exitedAt: new Date('2026-11-01T09:45:00Z'),
      state: 'CLOSED',
    });

    const legs = await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);

    expect(legs).toHaveLength(1);
    expect(legs[0].kind).toBe('BORDER');
    expect(legs[0].provenance).toBe('MEASURED');
    expect(legs[0].durationMinutes).toBe(45);
    expect(legs[0].dwellSessionId).toBeDefined();
    expect(legs[0].postId).toBe(post.id);
  });

  it('derives MEASURED BORDER leg with null duration for GAPPED sessions', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
    });

    await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      state: 'GAPPED',
      gapLargestSeconds: undefined as any, // will be set below
    });

    // Update to set gapLargestSeconds — Prisma doesn't support it in seedSession overrides directly
    const session = await prisma.borderDwellSession.findFirst({
      where: { companyId, state: 'GAPPED' },
    });
    await prisma.borderDwellSession.update({
      where: { id: session.id },
      data: { gapLargestSeconds: 1800 },
    });

    const legs = await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);

    expect(legs).toHaveLength(1);
    expect(legs[0].provenance).toBe('MEASURED');
    expect(legs[0].durationMinutes).toBeNull();
    expect(legs[0].confidenceNote).toContain('GAPPED dwell session');
  });

  it('excludes OPEN sessions from measured duration but creates a leg', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
    });

    await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      state: 'OPEN',
      exitedAt: null,
    });

    const legs = await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);

    expect(legs).toHaveLength(1);
    expect(legs[0].provenance).toBe('MEASURED');
    expect(legs[0].durationMinutes).toBeNull();
    expect(legs[0].confidenceNote).toContain('OPEN dwell session');
  });

  it('is idempotent — does not create duplicate legs for the same session', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
    });

    const session = await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      state: 'CLOSED',
      enteredAt: new Date('2026-11-01T09:00:00Z'),
      exitedAt: new Date('2026-11-01T09:30:00Z'),
    });

    // First derivation
    const legs1 = await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);
    expect(legs1).toHaveLength(1);

    // Second derivation — should skip since session already has a leg
    const legs2 = await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);
    expect(legs2).toHaveLength(0);

    // Confirm only one leg exists
    const allLegs = await prisma.tripLeg.findMany({ where: { tripId: trip.id } });
    expect(allLegs).toHaveLength(1);
  });

  // ── Trip provenance summary ──────────────────────────────────────────────

  it('reports MEASURED provenance when all legs are MEASURED with duration', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
      origin: 'Johannesburg',
      destination: 'Harare',
    });

    await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      enteredAt: new Date('2026-11-01T09:00:00Z'),
      exitedAt: new Date('2026-11-01T09:45:00Z'),
      state: 'CLOSED',
    });

    await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);

    const fullTrip = await service.getTrip(companyId, trip.id);

    expect(fullTrip.summary.provenance).toBe('MEASURED');
    expect(fullTrip.summary.isFullyMeasured).toBe(true);
    expect(fullTrip.summary.totalDurationMinutes).toBe(45);
    expect(fullTrip.summary.measuredLegs).toBe(1);
  });

  it('reports PARTIAL provenance when a DECLARED leg is mixed with MEASURED', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const driver = await seedDriver(companyId);
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      driverId: driver.id,
    });

    await seedSession(companyId, post.id, geofence.id, {
      driverId: driver.id,
      enteredAt: new Date('2026-11-01T09:00:00Z'),
      exitedAt: new Date('2026-11-01T09:45:00Z'),
      state: 'CLOSED',
    });

    await service.deriveBorderLegsFromDwellSessions(companyId, trip.id);

    // Add a DECLARED leg — trip becomes PARTIAL
    await service.createDeclaredLeg(companyId, trip.id, {
      postId: post.id,
      durationMinutes: 120,
      confidenceNote: 'Dispatcher estimate for linehaul',
      capturedBy: 'u-dispatch',
    });

    const fullTrip = await service.getTrip(companyId, trip.id);

    expect(fullTrip.summary.provenance).toBe('PARTIAL');
    expect(fullTrip.summary.isFullyMeasured).toBe(false);
    expect(fullTrip.summary.totalDurationMinutes).toBeNull();
    expect(fullTrip.summary.measuredLegs).toBe(1);
    expect(fullTrip.summary.declaredLegs).toBe(1);
  });

  it('reports REFERENCE_ONLY when all legs are REFERENCE', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');

    const trip = await service.createTrip(companyId, {
      reference: 'T-2026-0001',
      origin: 'Johannesburg',
      destination: 'Harare',
    });

    await service.createReferenceLeg(companyId, trip.id, {
      kind: 'LINEHAUL',
      durationMinutes: 300,
      source: 'static-corridor-table',
      notes: 'Planning estimate',
    });

    const fullTrip = await service.getTrip(companyId, trip.id);

    expect(fullTrip.summary.provenance).toBe('REFERENCE_ONLY');
    expect(fullTrip.summary.isFullyMeasured).toBe(false);
    expect(fullTrip.summary.totalDurationMinutes).toBeNull();
    expect(fullTrip.summary.referenceLegs).toBe(1);
  });

  // ── Cross-tenant isolation ───────────────────────────────────────────────

  it('does not leak trips across tenants', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');

    const trip = await service.createTrip(acme, {
      reference: 'T-2026-0001',
      origin: 'Johannesburg',
      destination: 'Harare',
    });

    // Evil Co cannot see Acme's trip
    await expect(service.getTrip(evil, trip.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const evilTrips = await service.getTrips(evil);
    expect(evilTrips).toHaveLength(0);
  });
});

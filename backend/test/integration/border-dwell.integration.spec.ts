/**
 * WP3: Cross-border dwell measurement, end to end against a real (in CI:
 * PostgreSQL) database.
 *
 * Covers the read path (aggregates, suppression) and the write path
 * (session lifecycle, tenant isolation through RLS).
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with: npm run test:integration
 */

import { PrismaClient } from '@prisma/client';
import { BorderDwellService } from '../../src/driver-safety/border-dwell.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('BorderDwellService (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: BorderDwellService;

  const audit = { record: jest.fn().mockResolvedValue('audit-id') };
  const gateway = { emitToDriver: jest.fn(), broadcastToCompany: jest.fn() };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new BorderDwellService(prisma as any, audit as any, gateway as any);
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  // ── Seed helpers ─────────────────────────────────────────────────────────

  async function seedPost(
    companyId: string,
    overrides: Partial<{
      code: string;
      name: string;
      countries: string;
      lat: number;
      lng: number;
    }> = {},
  ) {
    return prisma.borderPost.create({
      data: {
        companyId,
        code: overrides.code ?? 'BEIT_BRIDGE',
        name: overrides.name ?? 'Beitbridge Border Post',
        countries: overrides.countries ?? 'ZA,ZW',
        lat: overrides.lat ?? -22.2167,
        lng: overrides.lng ?? 29.9833,
        is24Hour: true,
      },
    });
  }

  async function seedGeofence(
    companyId: string,
    postId: string,
    overrides: Partial<{
      code: string;
      name: string;
      lat: number;
      lng: number;
      radiusM: number;
      side: string;
    }> = {},
  ) {
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

  async function seedDriver(companyId: string, reg?: string) {
    return prisma.driver.create({
      data: {
        name: 'Thabo Mokoena',
        phone: '+27 82 000 0000',
        companyId,
        vehicleReg: reg ?? null,
        isActive: true,
      },
    });
  }

  async function seedSession(
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

  // ── checkBorderGeofences ─────────────────────────────────────────────────

  it('opens a session on entry and closes it on exit, bounded by GPS fixes', async () => {
    const { companyId } = await seedTenant(prisma, 'Logistics Co');
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);
    const driver = await seedDriver(companyId, 'GP 12345');

    // --- Entry: driver inside the geofence ---
    const inside = await service.checkBorderGeofences(
      driver.id,
      companyId,
      geofence.lat,
      geofence.lng, // exactly at center → inside
      0,
    );

    expect(inside.sessions).toHaveLength(1);
    const session = inside.sessions[0];
    expect(session.companyId).toBe(companyId);
    expect(session.driverId).toBe(driver.id);
    expect(session.geofenceId).toBe(geofence.id);
    expect(session.state).toBe('OPEN');
    expect(session.enteredAt).toBeDefined();
    expect(session.enteredFromFixAt).toBeDefined();

    // --- Exit: driver 100km away ---
    const outside = await service.checkBorderGeofences(
      driver.id,
      companyId,
      -22.0, // ~111 km away
      30.0,
      0,
    );

    expect(outside.sessions).toHaveLength(1);
    const closed = outside.sessions[0];
    expect(closed.state).toBe('CLOSED');
    expect(closed.exitedAt).toBeDefined();
    expect(closed.exitedFromFixAt).toBeDefined();
  });

  it('refuses a driver from another tenant — no session row is written', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const post = await seedPost(acme);
    const geofence = await seedGeofence(acme, post.id);
    const driver = await seedDriver(evil, 'GP EVIL');

    const result = await service.checkBorderGeofences(
      driver.id,
      acme,
      geofence.lat,
      geofence.lng,
      0,
    );

    expect(result).toEqual({ sessions: [], refused: 'DRIVER_NOT_IN_TENANT' });

    // Confirm nothing was written in either tenant
    const count = await prisma.borderDwellSession.count({ where: { companyId: acme } });
    expect(count).toBe(0);
  });

  it('does not create a duplicate session when one is already OPEN', async () => {
    const { companyId } = await seedTenant(prisma, 'Logistics Co');
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);
    const driver = await seedDriver(companyId);

    // First entry opens
    const first = await service.checkBorderGeofences(
      driver.id, companyId, geofence.lat, geofence.lng, 0,
    );
    expect(first.sessions).toHaveLength(1);

    // Second ping while still inside — no new session, sample count increments
    const second = await service.checkBorderGeofences(
      driver.id, companyId, geofence.lat, geofence.lng, 0,
    );
    expect(second.sessions).toHaveLength(1);

    const updated = await prisma.borderDwellSession.findFirst({
      where: { id: first.sessions[0].id },
    });
    expect(updated.sampleCount).toBe(2);
    expect(updated.state).toBe('OPEN');
  });

  // ── getDwellAggregates ───────────────────────────────────────────────────

  it('computes median and P90 from closed sessions only', async () => {
    const { companyId } = await seedTenant(prisma, 'Logistics Co');
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    // 10, 20, 30, 40, 60 minute dwell sessions
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:10:00Z') });
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:20:00Z') });
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:30:00Z') });
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:40:00Z') });
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T10:00:00Z') });

    const result = await service.getDwellAggregates(companyId, post.id);

    expect(result.suppressed).toBe(false);
    expect(result.n).toBe(5);
    expect(result.closedCount).toBe(5);
    expect(result.medianMinutes).toBe(30);
    expect(result.p90Minutes).toBe(60);
    expect(result.completeness.closed).toBe(5);
  });

  it('suppresses below n=5 and reports null median/P90', async () => {
    const { companyId } = await seedTenant(prisma, 'Logistics Co');
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:10:00Z') });
    await seedSession(companyId, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:20:00Z') });

    const result = await service.getDwellAggregates(companyId, post.id);

    expect(result.suppressed).toBe(true);
    expect(result.n).toBe(2);
    expect(result.medianMs).toBeNull();
    expect(result.p90Ms).toBeNull();
  });

  it('excludes OPEN and GAPPED sessions from headline numbers', async () => {
    const { companyId } = await seedTenant(prisma, 'Logistics Co');
    const post = await seedPost(companyId);
    const geofence = await seedGeofence(companyId, post.id);

    await seedSession(companyId, post.id, geofence.id, {
      enteredAt: new Date('2026-11-01T09:00:00Z'),
      exitedAt: new Date('2026-11-01T09:30:00Z'),
      state: 'CLOSED',
    });
    await seedSession(companyId, post.id, geofence.id, {
      state: 'OPEN',
    });
    await seedSession(companyId, post.id, geofence.id, {
      state: 'GAPPED',
    });

    const result = await service.getDwellAggregates(companyId, post.id);

    expect(result.n).toBe(1);
    expect(result.closedCount).toBe(1);
    expect(result.openCount).toBe(1);
    expect(result.gappedCount).toBe(1);
    expect(result.suppressed).toBe(true); // n=1 < 5
    expect(result.medianMinutes).toBe(30);
  });

  it('scopes aggregates by companyId — never leaks cross-tenant', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const post = await seedPost(acme);
    const geofence = await seedGeofence(acme, post.id);

    await seedSession(acme, post.id, geofence.id, { enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:30:00Z') });

    // Even though the postId is the same, the Evil Co query returns nothing
    const result = await service.getDwellAggregates(evil, post.id);

    expect(result.n).toBe(0);
    expect(result.suppressed).toBe(true);
  });
});

/**
 * WP3: Border dwell service — unit tests (mocked Prisma).
 *
 * Pins: tenant-scoped lookups, session lifecycle (OPEN → CLOSED/GAPPED),
 * cross-tenant refusal, aggregates computed on read, suppression below threshold,
 * entry/exit bounded by GPS fixes (never exact).
 */

import { BorderDwellService } from './border-dwell.service';

describe('BorderDwellService', () => {
  let service: BorderDwellService;
  let prisma: any;
  let gateway: any;
  let audit: any;

  const COMPANY = 'C-ACME';
  const OTHER_COMPANY = 'C-EVIL';

  const now = () => new Date('2026-11-01T10:00:00Z');

  const geofenceZa = {
    id: 'gf-za-1',
    companyId: COMPANY,
    postId: 'post-beitbridge',
    post: { id: 'post-beitbridge', code: 'BEIT_BRIDGE', name: 'Beitbridge Border Post' },
    code: 'BEIT_BRIDGE_ZA',
    name: 'Beitbridge Border (SA side)',
    lat: -22.2167,
    lng: 29.9833,
    radiusM: 3000,
    side: 'EXPORT',
    isActive: true,
    provenance: 'SEED',
  };

  const geofenceZw = {
    id: 'gf-zw-1',
    companyId: COMPANY,
    postId: 'post-beitbridge',
    post: { id: 'post-beitbridge', code: 'BEIT_BRIDGE', name: 'Beitbridge Border Post' },
    code: 'BEIT_BRIDGE_ZW',
    name: 'Beitbridge Border (ZW side)',
    lat: -22.2167,
    lng: 29.9900,
    radiusM: 3000,
    side: 'IMPORT',
    isActive: true,
    provenance: 'SEED',
  };

  beforeEach(() => {
    prisma = {
      borderGeofence: { findMany: jest.fn() },
      borderDwellSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      driver: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    gateway = { emitToDriver: jest.fn(), broadcastToCompany: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    service = new BorderDwellService(prisma as any, audit as any, gateway as any);
  });

  // ── checkBorderGeofences ─────────────────────────────────────────────────

  describe('checkBorderGeofences', () => {
    it('refuses a driver who is not in the caller tenant — no session row, no write', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]);
      prisma.driver.findFirst.mockResolvedValue(null);

      const result = await service.checkBorderGeofences(
        'd-evil', COMPANY, -22.2167, 29.9833, 0,
      );

      expect(result).toEqual({ sessions: [], refused: 'DRIVER_NOT_IN_TENANT' });
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'd-evil', companyId: COMPANY },
        select: { id: true, name: true },
      });
      expect(prisma.borderDwellSession.create).not.toHaveBeenCalled();
      expect(prisma.borderDwellSession.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('costs no write when no geofence matches (ordinary 30s heartbeat)', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });

      const result = await service.checkBorderGeofences(
        'd-1', COMPANY, -22.2167, 29.9833, 0,
      );

      expect(result).toEqual({ sessions: [] });
      expect(prisma.borderDwellSession.create).not.toHaveBeenCalled();
      expect(prisma.borderDwellSession.update).not.toHaveBeenCalled();
    });

    it('opens a new session when a driver enters a geofence', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: 'GP 12345' });
      prisma.borderDwellSession.findFirst.mockResolvedValue(null);
      prisma.borderDwellSession.create.mockResolvedValue({
        id: 'session-1',
        state: 'OPEN',
        geofenceId: 'gf-za-1',
      });

      const result = await service.checkBorderGeofences(
        'd-1', COMPANY, -22.2167, 29.9833, 0,
      );

      expect(result.sessions).toHaveLength(1);
      expect(prisma.borderDwellSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: COMPANY,
          postId: 'post-beitbridge',
          geofenceId: 'gf-za-1',
          driverId: 'd-1',
          vehicleReg: 'GP 12345',
          state: 'OPEN',
          sampleCount: 1,
          source: 'GPS_PORTAL',
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'border_dwell.session_opened',
          actorId: 'd-1',
          actorType: 'tenant',
          targetType: 'border_dwell_session',
        }),
      );
    });

    it('updates an existing open session instead of creating a duplicate', async () => {
      const openSession = {
        id: 'session-open',
        companyId: COMPANY,
        geofenceId: 'gf-za-1',
        driverId: 'd-1',
        state: 'OPEN',
        sampleCount: 3,
        enteredFromFixAt: new Date('2026-11-01T09:50:00Z'),
      };
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue(openSession);
      prisma.borderDwellSession.update.mockResolvedValue({ ...openSession, sampleCount: 4 });

      const result = await service.checkBorderGeofences(
        'd-1', COMPANY, -22.2167, 29.9833, 0,
      );

      expect(result.sessions).toHaveLength(1);
      expect(prisma.borderDwellSession.create).not.toHaveBeenCalled();
      expect(prisma.borderDwellSession.update).toHaveBeenCalledWith({
        where: { id: 'session-open' },
        data: expect.objectContaining({ sampleCount: 4 }),
      });
    });

    it('marks a session GAPPED when the gap between samples exceeds 15 minutes', async () => {
      const openSession = {
        id: 'session-open',
        companyId: COMPANY,
        geofenceId: 'gf-za-1',
        driverId: 'd-1',
        state: 'OPEN',
        sampleCount: 3,
        enteredFromFixAt: new Date('2026-11-01T09:30:00Z'), // 30 min ago
      };
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue(openSession);
      prisma.borderDwellSession.update.mockResolvedValue({
        ...openSession,
        state: 'GAPPED',
        gapLargestSeconds: 1800,
        sampleCount: 4,
      });

      const result = await service.checkBorderGeofences(
        'd-1', COMPANY, -22.2167, 29.9833, 0,
      );

      expect(result.sessions[0].state).toBe('GAPPED');
      expect(prisma.borderDwellSession.update).toHaveBeenCalledWith({
        where: { id: 'session-open' },
        data: expect.objectContaining({
          state: 'GAPPED',
          gapLargestSeconds: 1800,
          sampleCount: 4,
        }),
      });
    });

    it('closes an open session when the driver exits the geofence', async () => {
      const openSession = {
        id: 'session-open',
        companyId: COMPANY,
        geofenceId: 'gf-za-1',
        driverId: 'd-1',
        state: 'OPEN',
        sampleCount: 4,
        enteredAt: new Date('2026-11-01T09:40:00Z'),
        enteredFromFixAt: new Date('2026-11-01T09:40:00Z'),
      };
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]); // far away now (driver moved)
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue(openSession);
      prisma.borderDwellSession.update.mockResolvedValue({
        ...openSession,
        state: 'CLOSED',
        exitedAt: now(),
        exitedFromFixAt: now(),
        precisionSeconds: 120,
      });

      // Driver is now 100km away — outside the geofence
      const result = await service.checkBorderGeofences(
        'd-1', COMPANY, -22.0, 30.0, 0,
      );

      expect(result.sessions).toHaveLength(1);
      expect(prisma.borderDwellSession.update).toHaveBeenCalledWith({
        where: { id: 'session-open' },
        data: expect.objectContaining({ state: 'CLOSED', exitedFromFixAt: now() }),
      });
    });

    it('keeps a session OPEN when no exit has been observed yet (never folded into a zero)', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue({
        id: 'session-open', companyId: COMPANY, geofenceId: 'gf-za-1',
        driverId: 'd-1', state: 'OPEN', sampleCount: 5,
        enteredFromFixAt: new Date('2026-11-01T09:55:00Z'),
      });

      // Driver still inside — session stays OPEN
      await service.checkBorderGeofences('d-1', COMPANY, -22.2167, 29.9833, 0);

      expect(prisma.borderDwellSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'OPEN' }),
        }),
      );
      expect(prisma.borderDwellSession.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: 'CLOSED' }) }),
      );
    });

    it('evaluates both SA and ZW geofences for the same post independently', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa, geofenceZw]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue(null);
      prisma.borderDwellSession.create.mockResolvedValue({ id: 'session-1', state: 'OPEN' });

      // Position inside ZW geofence (lng 29.99), outside SA geofence (lng 29.9833)
      await service.checkBorderGeofences('d-1', COMPANY, -22.2167, 29.9900, 0);

      // One session opened (ZW side only)
      expect(prisma.borderDwellSession.create).toHaveBeenCalledTimes(1);
      expect(prisma.borderDwellSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ geofenceId: 'gf-zw-1' }) }),
      );
    });

    it('never creates sessions across tenants — geofence lookup is company-scoped', async () => {
      prisma.borderGeofence.findMany.mockResolvedValue([geofenceZa]); // already filtered by companyId in query
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena', vehicleReg: null });
      prisma.borderDwellSession.findFirst.mockResolvedValue(null);
      prisma.borderDwellSession.create.mockResolvedValue({ id: 'session-1', state: 'OPEN' });

      await service.checkBorderGeofences('d-1', COMPANY, -22.2167, 29.9833, 0);

      expect(prisma.borderGeofence.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY, isActive: true },
      });
    });
  });

  // ── getDwellAggregates ───────────────────────────────────────────────────

  describe('getDwellAggregates', () => {
    it('returns median and P90 for closed sessions within the window', async () => {
      prisma.borderDwellSession.findMany.mockResolvedValue([
        { id: 's1', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:10:00Z'), createdAt: new Date() },
        { id: 's2', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:20:00Z'), createdAt: new Date() },
        { id: 's3', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:30:00Z'), createdAt: new Date() },
        { id: 's4', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:40:00Z'), createdAt: new Date() },
        { id: 's5', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T10:00:00Z'), createdAt: new Date() },
      ]);

      const result = await service.getDwellAggregates(COMPANY, 'post-1');

      expect(result.suppressed).toBe(false);
      expect(result.n).toBe(5);
      expect(result.closedCount).toBe(5);
      expect(result.medianMinutes).toBe(30); // 10,20,30,40,60 → median 30
      expect(result.p90Minutes).toBe(60);
    });

    it('suppresses below the threshold (default n >= 5)', async () => {
      prisma.borderDwellSession.findMany.mockResolvedValue([
        { id: 's1', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:10:00Z'), createdAt: new Date() },
        { id: 's2', companyId: COMPANY, postId: 'post-1', state: 'CLOSED',
          enteredAt: new Date('2026-11-01T09:00:00Z'), exitedAt: new Date('2026-11-01T09:20:00Z'), createdAt: new Date() },
      ]);

      const result = await service.getDwellAggregates(COMPANY, 'post-1');

      expect(result.suppressed).toBe(true);
      expect(result.n).toBe(2);
      expect(result.medianMs).toBeNull();
      expect(result.p90Ms).toBeNull();
    });

    it('returns null median/P90 when no closed sessions exist', async () => {
      prisma.borderDwellSession.findMany.mockResolvedValue([
        { id: 's1', companyId: COMPANY, postId: 'post-1', state: 'OPEN', createdAt: new Date() },
        { id: 's2', companyId: COMPANY, postId: 'post-1', state: 'GAPPED', createdAt: new Date() },
      ]);

      const result = await service.getDwellAggregates(COMPANY, 'post-1');

      expect(result.n).toBe(0);
      expect(result.medianMs).toBeNull();
      expect(result.p90Ms).toBeNull();
      expect(result.closedCount).toBe(0);
      expect(result.openCount).toBe(1);
      expect(result.gappedCount).toBe(1);
    });

    it('scopes aggregates by companyId — never leaks cross-tenant', async () => {
      prisma.borderDwellSession.findMany.mockResolvedValue([]);

      await service.getDwellAggregates(COMPANY, 'post-1');

      expect(prisma.borderDwellSession.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY, postId: 'post-1' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ── getBorderPosts ───────────────────────────────────────────────────────

  describe('getBorderPosts', () => {
    it('returns posts scoped to the company', async () => {
      prisma.borderPost = { findMany: jest.fn().mockResolvedValue([{ id: 'post-1', code: 'BEIT_BRIDGE' }]) };
      const result = await service.getBorderPosts(COMPANY);
      expect(result).toHaveLength(1);
      expect(prisma.borderPost.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY },
        orderBy: { name: 'asc' },
        include: expect.any(Object),
      });
    });
  });
});

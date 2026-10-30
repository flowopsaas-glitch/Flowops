import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';

/**
 * Driver safety — whose event is this?
 *
 * Both HTTP routes on this controller (`POST /safety/zones/report`,
 * `POST /safety/check`) used to take `driverId` straight from the request body
 * and act on it:
 *
 *   - `checkPosition` never looked the driver up at all. `safety_alerts.driverId`
 *     is a plain string with no relation and no tenant check, so it stored
 *     whatever was sent, used the caller-typed `driverName` on the alert, and
 *     pushed the alert to that driver's device with `emitToDriver(driverId, …)`
 *     plus a dispatch notification reading "⚠️ <typed name> entered high-risk
 *     zone". A caller in company A could put company B's driver on B's dispatch
 *     screen and on B's driver's phone.
 *   - `reportDangerZone` resolved the driver with
 *     `findFirst({ where: { id: driverId } })` — no companyId — and wrote that
 *     driver's real name into the new zone's `name` and `description`. That is a
 *     cross-tenant disclosure and a false attribution on a zone that is created
 *     ACTIVE, permanent and notifying, so it immediately alerts every driver who
 *     enters the circle.
 *
 * Identity now comes from the session: a driver acts as their own linked Driver
 * record, a supervisory role may act on a driver in their own tenant, the
 * subject must exist in the caller's tenant, and the name that lands on a record
 * is the one that was looked up. The zone lifecycle itself (verification,
 * expiry, abuse limits) is WP4 and is still design-only — these tests pin the
 * authorisation and attribution half only.
 */
describe('DriverSafetyService — who a safety action is about', () => {
  let service: DriverSafetyService;
  let prisma: any;
  let gateway: any;
  let email: any;
  let audit: any;

  const COMPANY = 'C-ACME';
  const OTHER_COMPANY = 'C-EVIL';

  const zoneNearby = {
    id: 'zone-1',
    name: 'N3 midnight hotspot',
    riskLevel: 'HIGH',
    lat: -26.0,
    lng: 28.0,
    radiusM: 2000,
    notifyDriver: true,
    notifyDispatch: true,
    notifyAdmin: false,
    alertMessage: 'Doors locked, keep moving.',
  };
  const zoneFarAway = { ...zoneNearby, id: 'zone-2', lat: -29.0, lng: 24.0 };

  beforeEach(() => {
    prisma = {
      driver: { findFirst: jest.fn() },
      safetyZone: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      safetyAlert: { create: jest.fn().mockResolvedValue({ id: 'alert-1' }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) },
    };
    gateway = { emitToDriver: jest.fn(), broadcastToCompany: jest.fn() };
    email = { sendTemplate: jest.fn(), sendMail: jest.fn(), send: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    service = new DriverSafetyService(prisma as any, gateway as any, email as any, audit as any);
  });

  // ── resolveSubjectDriver ─────────────────────────────────────────────────

  describe('resolveSubjectDriver', () => {
    it('a driver-role caller acts as the Driver record linked to their own user account', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });

      const subject = await service.resolveSubjectDriver(
        COMPANY,
        { id: 'u-driver', role: 'DRIVER' },
        null,
      );

      expect(subject).toEqual({ id: 'd-1', name: 'Thabo Mokoena' });
      // The lookup is by THEIR user id inside THEIR tenant — never by the id a
      // body might have carried.
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u-driver', companyId: COMPANY },
        select: { id: true, name: true },
      });
    });

    it('a driver naming somebody else is refused, and only their own record was ever looked up', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });

      await expect(
        service.resolveSubjectDriver(COMPANY, { id: 'u-driver', role: 'DRIVER' }, 'd-somebody-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.driver.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.driver.findFirst.mock.calls[0][0].where).toEqual({
        userId: 'u-driver',
        companyId: COMPANY,
      });
      // Nothing was written and nobody was pushed to.
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
      expect(prisma.safetyZone.create).not.toHaveBeenCalled();
      expect(gateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('a driver whose user account has no linked driver record is refused', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveSubjectDriver(COMPANY, { id: 'u-orphan', role: 'DRIVER' }, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
    });

    it('refuses before any lookup when there is no authenticated user', async () => {
      await expect(service.resolveSubjectDriver(COMPANY, null, 'd-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.resolveSubjectDriver(COMPANY, { id: null, role: 'DRIVER' }, 'd-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.driver.findFirst).not.toHaveBeenCalled();
    });

    it('a dispatch caller may act on a driver in their own tenant', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-9', name: 'Nomsa Dlamini' });

      const subject = await service.resolveSubjectDriver(
        COMPANY,
        { id: 'u-dispatch', role: 'DISPATCH' },
        'd-9',
      );

      expect(subject).toEqual({ id: 'd-9', name: 'Nomsa Dlamini' });
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'd-9', companyId: COMPANY },
        select: { id: true, name: true },
      });
    });

    it('a driverId belonging to another tenant is refused with a 404', async () => {
      // Scoped lookup returns nothing for a driver in a different company.
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveSubjectDriver(COMPANY, { id: 'u-dispatch', role: 'DISPATCH' }, 'd-foreign'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'd-foreign', companyId: COMPANY },
        select: { id: true, name: true },
      });
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
      expect(gateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('the same driverId resolves for its own tenant and is refused for another', async () => {
      // Emulate the database rather than the mock: a driver row belongs to
      // exactly one company, so the scoped lookup returns nothing when the
      // caller's tenant is not the driver's.
      const drivers = [{ id: 'd-9', name: 'Nomsa Dlamini', companyId: OTHER_COMPANY }];
      prisma.driver.findFirst.mockImplementation(async ({ where }: any) => {
        const row = drivers.find((d) => d.id === where.id && d.companyId === where.companyId);
        // Honour the `select`, as Prisma would.
        return row ? { id: row.id, name: row.name } : null;
      });

      await expect(
        service.resolveSubjectDriver(COMPANY, { id: 'u-acme', role: 'DISPATCH' }, 'd-9'),
      ).rejects.toBeInstanceOf(NotFoundException);

      const subject = await service.resolveSubjectDriver(
        OTHER_COMPANY,
        { id: 'u-other', role: 'DISPATCH' },
        'd-9',
      );
      expect(subject).toEqual({ id: 'd-9', name: 'Nomsa Dlamini' });
      // Both lookups were scoped; the refused one wrote nothing.
      expect(prisma.driver.findFirst.mock.calls.map((c: any[]) => c[0].where)).toEqual([
        { id: 'd-9', companyId: COMPANY },
        { id: 'd-9', companyId: OTHER_COMPANY },
      ]);
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
    });

    it('a supervisory caller must name the driver they are acting for', async () => {
      await expect(
        service.resolveSubjectDriver(COMPANY, { id: 'u-manager', role: 'MANAGER' }, null),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.driver.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── checkPosition ────────────────────────────────────────────────────────

  describe('checkPosition', () => {
    it('costs no extra query when no zone matches (the ordinary 30s heartbeat)', async () => {
      prisma.safetyZone.findMany.mockResolvedValue([zoneFarAway]);

      const result = await service.checkPosition('d-1', COMPANY, -26.0, 28.0, 80);

      expect(result).toEqual({ inZone: false, alerts: [] });
      expect(prisma.driver.findFirst).not.toHaveBeenCalled();
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
      expect(gateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('refuses a driver who is not in the caller tenant: no alert row, no push, and the refusal is reported', async () => {
      prisma.safetyZone.findMany.mockResolvedValue([zoneNearby]);
      prisma.driver.findFirst.mockResolvedValue(null);

      const result = await service.checkPosition('d-evil', COMPANY, -26.0, 28.0, 80);

      expect(result).toEqual({ inZone: false, alerts: [], refused: 'DRIVER_NOT_IN_TENANT' });
      // The lookup that guards it is scoped to the caller's tenant.
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'd-evil', companyId: COMPANY },
        select: { id: true, name: true },
      });
      expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
      expect(gateway.emitToDriver).not.toHaveBeenCalled();
      expect(gateway.broadcastToCompany).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('alerts a driver who IS in the tenant, using the looked-up name (there is no name to type)', async () => {
      prisma.safetyZone.findMany.mockResolvedValue([zoneNearby]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });

      const result = await service.checkPosition('d-1', COMPANY, -26.0, 28.0, 80);

      expect(result.inZone).toBe(true);
      expect(result.alerts).toHaveLength(1);
      expect(prisma.safetyAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            driverId: 'd-1',
            driverName: 'Thabo Mokoena',
            zoneId: 'zone-1',
          }),
        }),
      );
      // The push goes to the resolved driver id, and dispatch sees the resolved
      // name — not something the caller asserted.
      expect(gateway.emitToDriver).toHaveBeenCalledWith(
        'd-1',
        'safety-alert',
        expect.objectContaining({ type: 'SAFETY_ZONE_ENTERED', alertId: 'alert-1' }),
      );
      expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
        COMPANY,
        'safety-alert',
        expect.objectContaining({
          driverId: 'd-1',
          driverName: 'Thabo Mokoena',
          message: expect.stringContaining('Thabo Mokoena'),
        }),
      );
      // `checkPosition` takes five parameters now: driverId, companyId, lat,
      // lng, speed. A sixth — a caller-typed driverName — does not exist, so
      // `tsc` refuses it rather than the runtime having to distrust it.
      expect(service.checkPosition.length).toBe(5);
    });

    it('keeps the existing per-driver/zone cooldown after the change', async () => {
      prisma.safetyZone.findMany.mockResolvedValue([zoneNearby]);
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });

      const first = await service.checkPosition('d-1', COMPANY, -26.0, 28.0, 80);
      const second = await service.checkPosition('d-1', COMPANY, -26.0, 28.0, 82);

      expect(first.alerts).toHaveLength(1);
      expect(second).toEqual({ inZone: false, alerts: [] });
      expect(prisma.safetyAlert.create).toHaveBeenCalledTimes(1);
      // The subject is resolved once per call that reaches a zone, not per zone.
      expect(prisma.driver.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ── reportDangerZone ─────────────────────────────────────────────────────

  describe('reportDangerZone', () => {
    const dto = { lat: -26.1234, lng: 28.4321, riskLevel: 'HIGH' };

    it('refuses a driver from another tenant, so no zone is created and no foreign name is disclosed', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.reportDangerZone(COMPANY, 'd-foreign', dto, { id: 'u-driver', role: 'DRIVER' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'd-foreign', companyId: COMPANY },
        select: { id: true, name: true },
      });
      expect(prisma.safetyZone.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('writes the looked-up driver name onto the zone and records who asked for it', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });
      prisma.safetyZone.create.mockResolvedValue({
        id: 'zone-new',
        name: 'Reported by Thabo Mokoena',
        source: 'COMMUNITY',
        radiusM: 500,
        riskLevel: 'HIGH',
        isActive: true,
      });

      const zone = await service.reportDangerZone(COMPANY, 'd-1', dto, {
        id: 'u-driver',
        email: 'thabo@acme.co.za',
        role: 'DRIVER',
      });

      expect(zone.id).toBe('zone-new');
      expect(prisma.safetyZone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY,
            source: 'COMMUNITY',
            description: expect.stringContaining('Thabo Mokoena'),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'driver_safety.zone_reported',
          actorType: 'tenant',
          actorId: 'u-driver',
          actorEmail: 'thabo@acme.co.za',
          targetType: 'safety_zone',
          targetId: 'zone-new',
          metadata: expect.objectContaining({
            driverId: 'd-1',
            driverName: 'Thabo Mokoena',
            reportedBy: 'DRIVER_SELF',
            actorRole: 'DRIVER',
            radiusM: 500,
            isActive: true,
          }),
        }),
      );
    });

    it('records a supervisory report as being on a driver’s behalf, naming the acting user', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-9', name: 'Nomsa Dlamini' });
      prisma.safetyZone.create.mockResolvedValue({
        id: 'zone-new',
        name: 'Road closed — Nomsa Dlamini',
        source: 'COMMUNITY',
        radiusM: 500,
        riskLevel: 'HIGH',
        isActive: true,
      });

      await service.reportDangerZone(COMPANY, 'd-9', dto, {
        id: 'u-dispatch',
        email: 'dispatch@acme.co.za',
        role: 'DISPATCH',
      });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'u-dispatch',
          metadata: expect.objectContaining({
            driverId: 'd-9',
            driverName: 'Nomsa Dlamini',
            reportedBy: 'ON_BEHALF',
            actorRole: 'DISPATCH',
          }),
        }),
      );
    });

    it('still returns the zone when the audit write fails', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });
      prisma.safetyZone.create.mockResolvedValue({
        id: 'zone-new',
        name: 'Reported by Thabo Mokoena',
        source: 'COMMUNITY',
        radiusM: 500,
        riskLevel: 'HIGH',
        isActive: true,
      });
      audit.record.mockRejectedValue(new Error('audit table unavailable'));

      const zone = await service.reportDangerZone(COMPANY, 'd-1', dto, { id: 'u-driver', role: 'DRIVER' });

      expect(zone.id).toBe('zone-new');
      expect(audit.record).toHaveBeenCalled();
    });

    it('records an unknown actor rather than pretending there was none', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' });
      prisma.safetyZone.create.mockResolvedValue({
        id: 'zone-new',
        name: 'Reported by Thabo Mokoena',
        source: 'COMMUNITY',
        radiusM: 500,
        riskLevel: 'HIGH',
        isActive: true,
      });

      await service.reportDangerZone(COMPANY, 'd-1', dto);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: null,
          metadata: expect.objectContaining({ reportedBy: 'UNKNOWN' }),
        }),
      );
    });
  });
});

describe('DriverSafetyController — identity comes from the session', () => {
  const COMPANY = 'C-ACME';

  it('POST /safety/check resolves the driver first and never forwards a typed name', async () => {
    const svc: any = {
      resolveSubjectDriver: jest.fn().mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' }),
      checkPosition: jest.fn().mockResolvedValue({ inZone: false, alerts: [] }),
    };
    const controller = new DriverSafetyController(svc);
    const user = { id: 'u-driver', companyId: COMPANY, role: 'DRIVER' };

    // A caller still sending `driverName` gets it ignored: it is not in the
    // route's contract and it is not passed to the service.
    await controller.checkPosition(user, {
      driverId: 'd-somebody-else',
      lat: -26.0,
      lng: 28.0,
      speed: 80,
      driverName: 'Innocent Bystander',
    } as any);

    expect(svc.resolveSubjectDriver).toHaveBeenCalledWith(COMPANY, user, 'd-somebody-else');
    expect(svc.checkPosition).toHaveBeenCalledWith('d-1', COMPANY, -26.0, 28.0, 80);
  });

  it('POST /safety/zones/report passes the acting user so the audit can name them', async () => {
    const svc: any = {
      resolveSubjectDriver: jest.fn().mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' }),
      reportDangerZone: jest.fn().mockResolvedValue({ id: 'zone-new' }),
    };
    const controller = new DriverSafetyController(svc);
    const user = { id: 'u-driver', companyId: COMPANY, role: 'DRIVER', email: 'thabo@acme.co.za' };
    const body = { lat: -26.1, lng: 28.4, riskLevel: 'HIGH' };

    await controller.reportDangerZone(user, body as any);

    expect(svc.resolveSubjectDriver).toHaveBeenCalledWith(COMPANY, user, null);
    expect(svc.reportDangerZone).toHaveBeenCalledWith(COMPANY, 'd-1', body, user);
  });

  it('a driver-role caller may omit driverId entirely', async () => {
    const svc: any = {
      resolveSubjectDriver: jest.fn().mockResolvedValue({ id: 'd-1', name: 'Thabo Mokoena' }),
      checkPosition: jest.fn().mockResolvedValue({ inZone: false, alerts: [] }),
    };
    const controller = new DriverSafetyController(svc);

    await controller.checkPosition(
      { id: 'u-driver', companyId: COMPANY, role: 'DRIVER' },
      { lat: -26.0, lng: 28.0 } as any,
    );

    expect(svc.resolveSubjectDriver).toHaveBeenCalledWith(COMPANY, expect.anything(), null);
    expect(svc.checkPosition).toHaveBeenCalledWith('d-1', COMPANY, -26.0, 28.0, undefined);
  });
});

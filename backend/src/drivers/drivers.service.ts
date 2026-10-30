import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { FleetMaintenanceService } from '../fleet-maintenance/fleet-maintenance.service';
import { LogServiceDto } from '../fleet-maintenance/dto/log-service.dto';

/**
 * A `Driver` row carries the driver's PORTAL LOGIN CREDENTIAL.
 *
 * `driverPin` is a bcrypt hash of the 4-6 digit PIN a driver signs in with
 * (AuthService verifies it on POST /auth/driver/login) and `ratingToken` is a
 * bearer capability. A 4-6 digit PIN has at most 10^6 combinations, so cracking
 * that hash offline is seconds rather than years: serving it is much closer to
 * serving the PIN than to serving a password hash.
 *
 * It was being served. `findAll`/`findOne` answered with the whole row, so
 * GET /drivers and GET /drivers/:id returned the hash to every role that can
 * read drivers - ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH and VIEWER - and
 * `create`/`update`/`remove` returned the row they had just written.
 *
 * Nothing needs the value itself: AuthService reads the driver straight from
 * Prisma when it verifies a PIN, and `setPin`/`resetPin` already answered with
 * an explicit `{ id, name, phone }` select. The one client that read it only
 * asked whether it was there, so the redacted row carries a derived `hasPinSet`
 * boolean and `ratingToken` is dropped outright. Every row-shaped return in this
 * service now goes through here.
 */
export function withoutDriverSecrets<T>(driver: T): T {
  if (!driver || typeof driver !== 'object') return driver;
  const { driverPin, ratingToken, ...safe } = driver as Record<string, unknown>;
  // The drivers screen renders a "PIN SET" / "NO PIN" badge and a Clear button
  // that were driven by `!!driverPin` - that is, by the presence of the hash
  // itself. Answer with the derived flag instead: the same shape this repo
  // already uses for other credentials (SsoConnection -> clientSecretSet,
  // CustomsEdiCredential -> hasSecret, IntegrationCredential -> secretsSet).
  return { ...safe, hasPinSet: Boolean(driverPin) } as T;
}

@Injectable()
export class DriversService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private readonly fleetMaintenance: FleetMaintenanceService,
  ) {}

  /**
   * Whitelist + normalise a driver payload from the UI into valid Prisma data.
   * The create/update forms send a `pin` field (4–6 digits) which must be
   * hashed into `driverPin` — spreading it raw made Prisma reject the whole
   * request ("Unknown argument `pin`"). We also drop any other unknown keys so
   * a stray field never crashes the write.
   */
  private async normaliseDriverData(dto: any): Promise<Record<string, any>> {
    const allowed = [
      'name', 'phone', 'email', 'vehicleType', 'vehicleReg', 'status', 'isActive',
      'branchId', 'currentKm', 'nextServiceKm', 'nextServiceDate', 'vehicleNotes',
    ];
    const data: Record<string, any> = {};
    for (const k of allowed) if (dto?.[k] !== undefined) data[k] = dto[k];

    // Map the UI `pin` → hashed driverPin (only if a valid 4–6 digit PIN given).
    const rawPin = dto?.pin ?? dto?.driverPin;
    if (rawPin != null && String(rawPin).trim() !== '') {
      const pin = String(rawPin).trim();
      if (/^\d{4,6}$/.test(pin)) {
        data.driverPin = await bcrypt.hash(pin, 12);
      }
    }
    return data;
  }

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.branchId) where.branchId = query.branchId;
    const rows = await this.prisma.driver.findMany({ where, include: { branch: true }, orderBy: { name: 'asc' } });
    return rows.map(withoutDriverSecrets);
  }

  async findOne(id: string, companyId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, companyId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return withoutDriverSecrets(driver);
  }

  /**
   * Find the Driver record linked to the authenticated user.
   * Returns null when the user has no linked driver (e.g. they are an ADMIN
   * using the app in a DRIVER role for testing, not a real field driver).
   */
  async findMine(userId: string, companyId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, companyId, isActive: true },
    });
    return driver ? withoutDriverSecrets(driver) : driver;
  }

  async create(companyId: string, dto: any) {
    await this.billing.assertCanCreate(companyId, 'driver');
    const data = await this.normaliseDriverData(dto);
    return withoutDriverSecrets(await this.prisma.driver.create({ data: { ...data, companyId } as any }));
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    const data = await this.normaliseDriverData(dto);
    return withoutDriverSecrets(await this.prisma.driver.update({ where: { id }, data: data as any }));
  }

  async updateLocation(id: string, companyId: string, lat: number, lng: number) {
    // Tenant-scoped: never let one company move another company's driver.
    const res = await this.prisma.driver.updateMany({
      where: { id, companyId },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Driver not found');
    return { updated: true };
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return withoutDriverSecrets(await this.prisma.driver.update({ where: { id }, data: { isActive: false } }));
  }

  // ── Fleet maintenance ─────────────────────────────────────────────────────

  async getServiceHistory(driverId: string, companyId: string) {
    await this.findOne(driverId, companyId); // ownership check
    return this.prisma.vehicleService.findMany({
      where: { driverId },
      orderBy: { servicedAt: 'desc' },
      take: 100,
    });
  }

  async logService(driverId: string, companyId: string, dto: LogServiceDto) {
    await this.findOne(driverId, companyId);
    return this.fleetMaintenance.logService(companyId, { ...dto, driverId });
  }

  async updateOdometer(driverId: string, companyId: string, dto: {
    currentKm: number; nextServiceKm?: number; nextServiceDate?: string;
  }) {
    await this.findOne(driverId, companyId);
    return this.prisma.driver.update({
      where: { id: driverId },
      data: {
        currentKm: dto.currentKm,
        ...(dto.nextServiceKm   && { nextServiceKm: dto.nextServiceKm }),
        ...(dto.nextServiceDate && { nextServiceDate: new Date(dto.nextServiceDate) }),
      },
    });
  }

  /** Field ops view — drivers with active jobs + today's delivery count */
  async getFieldOps(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [drivers, activeCollections, activeShipments] = await Promise.all([
      this.prisma.driver.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.collection.findMany({
        where: { companyId, driverId: { not: null }, status: { in: ['IN_PROGRESS', 'ASSIGNED'] } },
        select: { id: true, driverId: true, clientName: true, pickupAddress: true, status: true },
      }),
      this.prisma.shipment.findMany({
        where: { companyId, status: { in: ['PENDING', 'IN_TRANSIT'] }, driverId: { not: null } },
        select: { id: true, driverId: true, status: true, waybill: { select: { trackingNumber: true, recipientName: true } } },
      }),
      this.prisma.waybill.groupBy({
        by: ['companyId'],
        where: { companyId, status: 'DELIVERED', updatedAt: { gte: today } },
        _count: { _all: true },
      }),
    ]);

    // Per-driver delivery counts today from shipments
    const collectedToday = await this.prisma.collection.groupBy({
      by: ['driverId'],
      where: { companyId, driverId: { not: null }, status: 'COLLECTED', updatedAt: { gte: today } },
      _count: { _all: true },
    });
    const collectedMap = new Map(collectedToday.map(c => [c.driverId, c._count._all]));
    const colsByDriver = new Map<string, any[]>();
    for (const c of activeCollections) {
      if (!c.driverId) continue;
      if (!colsByDriver.has(c.driverId)) colsByDriver.set(c.driverId, []);
      colsByDriver.get(c.driverId)!.push(c);
    }
    const shipsByDriver = new Map<string, any[]>();
    for (const s of activeShipments) {
      if (!s.driverId) continue;
      if (!shipsByDriver.has(s.driverId)) shipsByDriver.set(s.driverId, []);
      shipsByDriver.get(s.driverId)!.push(s);
    }

    return drivers.map(d => ({
      id:          d.id,
      name:        d.name,
      phone:       d.phone,
      vehicleType: d.vehicleType,
      vehicleReg:  d.vehicleReg,
      status:      d.status,
      lastLat:     d.lastLat,
      lastLng:     d.lastLng,
      lastSeen:    d.lastSeen,
      activeCollections: colsByDriver.get(d.id) ?? [],
      activeShipments:   shipsByDriver.get(d.id) ?? [],
      jobsToday:   collectedMap.get(d.id) ?? 0,
    }));
  }

  /** Returns all drivers with their fleet status for the maintenance dashboard. */
  async fleetDashboard(companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, name: true, vehicleType: true, vehicleReg: true, status: true,
        currentKm: true, nextServiceKm: true, nextServiceDate: true, vehicleNotes: true,
        services: {
          orderBy: { servicedAt: 'desc' },
          take: 1,
          select: { servicedAt: true, serviceType: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    return drivers.map((d) => {
      const kmDue    = d.nextServiceKm && d.currentKm ? d.nextServiceKm - d.currentKm : null;
      const daysDue  = d.nextServiceDate
        ? Math.ceil((d.nextServiceDate.getTime() - now.getTime()) / 86400000)
        : null;
      const alert = (kmDue != null && kmDue <= 500) || (daysDue != null && daysDue <= 14);
      return { ...d, kmUntilService: kmDue, daysUntilService: daysDue, serviceAlert: alert };
    });
  }

  // ── Driver PIN management ─────────────────────────────────────────────────

  /** Set or change a driver's 4–6 digit portal PIN (admin action). */
  async setPin(id: string, companyId: string, pin: string) {
    await this.findOne(id, companyId);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bcrypt = require('bcrypt') as typeof import('bcrypt');
    const hash = await bcrypt.hash(String(pin), 12);
    return this.prisma.driver.update({
      where: { id },
      data: { driverPin: hash },
      select: { id: true, name: true, phone: true },
    });
  }

  /** Clear a driver's PIN so they must set a new one on next login. */
  async resetPin(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.driver.update({
      where: { id },
      data: { driverPin: null },
      select: { id: true, name: true, phone: true },
    });
  }
}

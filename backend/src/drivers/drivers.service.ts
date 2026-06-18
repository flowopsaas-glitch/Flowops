import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.branchId) where.branchId = query.branchId;
    return this.prisma.driver.findMany({ where, include: { branch: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string, companyId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, companyId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  async create(companyId: string, dto: any) {
    return this.prisma.driver.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    return this.prisma.driver.update({ where: { id }, data: dto });
  }

  async updateLocation(id: string, companyId: string, lat: number, lng: number) {
    return this.prisma.driver.update({
      where: { id },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.driver.update({ where: { id }, data: { isActive: false } });
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

  async logService(driverId: string, companyId: string, dto: {
    serviceType: string; notes?: string; kmAtService?: number; cost?: number; servicedAt?: string;
  }) {
    await this.findOne(driverId, companyId);
    return this.prisma.vehicleService.create({
      data: {
        driverId,
        serviceType: dto.serviceType,
        notes: dto.notes,
        kmAtService: dto.kmAtService,
        cost: dto.cost,
        servicedAt: dto.servicedAt ? new Date(dto.servicedAt) : new Date(),
      },
    });
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
}

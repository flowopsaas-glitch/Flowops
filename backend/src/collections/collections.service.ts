import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private geo: GeocodingService,
  ) {}

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.driverId) where.driverId = query.driverId;
    return this.prisma.collection.findMany({
      where, include: { driver: true, agent: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
  }

  async findByCompany(companyId: string) {
    return this.findAll(companyId);
  }

  async findOne(id: string, companyId: string) {
    const c = await this.prisma.collection.findFirst({
      where: { id, companyId },
      include: { driver: true, agent: { select: { id: true, name: true } } },
    });
    if (!c) throw new NotFoundException('Collection not found');
    return c;
  }

  async create(companyId: string, dto: any) {
    const data: any = { ...dto, companyId };
    // Geocode the pickup address so the collection lands on the map and can be
    // routed/assigned by proximity. Best-effort: never blocks creation.
    if (data.pickupAddress && (data.pickupLat == null || data.pickupLng == null)) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { country: true },
      });
      const point = await this.geo.geocode(data.pickupAddress, company?.country ?? undefined);
      if (point) {
        data.pickupLat = point.lat;
        data.pickupLng = point.lng;
      }
    }
    return this.prisma.collection.create({ data });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    const data: any = { ...dto };
    // Re-geocode when the pickup address changes (and caller didn't pass coords).
    if (data.pickupAddress && data.pickupLat == null && data.pickupLng == null) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { country: true },
      });
      const point = await this.geo.geocode(data.pickupAddress, company?.country ?? undefined);
      if (point) {
        data.pickupLat = point.lat;
        data.pickupLng = point.lng;
      }
    }
    return this.prisma.collection.update({ where: { id }, data });
  }

  async cancel(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'CANCELLED' });
  }

  async autoSuggest(id: string, companyId: string) {
    // Return available drivers as suggestions
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, status: 'AVAILABLE', isActive: true },
      take: 5,
    });
    return { drivers, suggestedDriver: drivers[0] ?? null };
  }
}

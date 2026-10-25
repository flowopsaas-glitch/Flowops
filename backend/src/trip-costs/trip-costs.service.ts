import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { TripCostSource, TripCostType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripCostDto } from './dto/create-trip-cost.dto';

export interface TripCostActor {
  id?: string;
  role?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Measured trip costs — fuel, tolls and other on-road spend recorded at the
 * pump or in the office. This service only ever stores what a human (or an
 * import) actually captured: it never estimates. Per-trip margins built on
 * top of these rows must treat "no entries" as UNKNOWN cost, not zero —
 * that distinction is the whole point of the feature.
 *
 * Tenant safety: every read/write is scoped by the caller's companyId, and
 * linked records (driver, waybill, manifest) must belong to that company.
 */
@Injectable()
export class TripCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    dto: CreateTripCostDto,
    source: TripCostSource = TripCostSource.OFFICE,
    actor?: TripCostActor,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, companyId },
      select: { id: true, currentKm: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    if (dto.waybillId) {
      const waybill = await this.prisma.waybill.findFirst({
        where: { id: dto.waybillId, companyId },
        select: { id: true },
      });
      if (!waybill) throw new NotFoundException('Waybill not found');
    }
    if (dto.manifestId) {
      const manifest = await this.prisma.manifest.findFirst({
        where: { id: dto.manifestId, companyId },
        select: { id: true },
      });
      if (!manifest) throw new NotFoundException('Manifest not found');
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt must be a valid date');
    }
    if (occurredAt.getTime() > Date.now() + DAY_MS) {
      throw new BadRequestException('occurredAt cannot be in the future');
    }

    const entry = await this.prisma.tripCostEntry.create({
      data: {
        companyId,
        driverId: driver.id,
        waybillId: dto.waybillId ?? null,
        manifestId: dto.manifestId ?? null,
        type: dto.type,
        amount: dto.amount,
        // Litres only mean anything for fuel; never store them on tolls.
        litres: dto.type === TripCostType.FUEL ? dto.litres ?? null : null,
        odometerKm: dto.odometerKm ?? null,
        note: dto.note?.trim() ? dto.note.trim() : null,
        occurredAt,
        source,
        createdBy: actor?.id ?? null,
      },
    });

    // Odometer discipline: a capture carrying a higher reading advances the
    // vehicle's current km, which the maintenance schedules key off. Lower
    // readings are kept on the entry but never rewind the vehicle.
    if (dto.odometerKm != null && dto.odometerKm > (driver.currentKm ?? 0)) {
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: { currentKm: dto.odometerKm },
      });
    }

    return entry;
  }

  async list(
    companyId: string,
    query: {
      driverId?: string;
      type?: TripCostType;
      waybillId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const where: any = { companyId };
    if (query.driverId) where.driverId = query.driverId;
    if (query.type) where.type = query.type;
    if (query.waybillId) where.waybillId = query.waybillId;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    const [entries, total, grouped] = await Promise.all([
      this.prisma.tripCostEntry.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          driver: { select: { id: true, name: true, vehicleReg: true } },
        },
      }),
      this.prisma.tripCostEntry.count({ where }),
      this.prisma.tripCostEntry.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const byType: Record<string, { total: number; count: number }> = {};
    let filterTotal = 0;
    for (const row of grouped) {
      const totalForType = row._sum.amount ?? 0;
      byType[row.type] = { total: totalForType, count: row._count._all };
      filterTotal += totalForType;
    }

    // Totals describe the filtered, RECORDED entries only. Trips with no
    // captured costs are absent from these numbers — never counted as zero.
    return { data: entries, total, page, limit, totals: { byType, total: filterTotal, count: total } };
  }

  async summary(companyId: string, from?: string, to?: string) {
    const where: any = { companyId };
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = new Date(from);
      if (to) where.occurredAt.lte = new Date(to);
    }

    const [byType, byDriverRows, entryCount] = await Promise.all([
      this.prisma.tripCostEntry.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.tripCostEntry.groupBy({
        by: ['driverId'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.tripCostEntry.count({ where }),
    ]);

    const driverIds = byDriverRows.map((r) => r.driverId);
    const drivers = driverIds.length
      ? await this.prisma.driver.findMany({
          where: { id: { in: driverIds }, companyId },
          select: { id: true, name: true, vehicleReg: true },
        })
      : [];
    const driverById = new Map(drivers.map((d) => [d.id, d]));

    return {
      period: { from: from ?? null, to: to ?? null },
      entryCount,
      byType: byType.map((r) => ({
        type: r.type,
        total: r._sum.amount ?? 0,
        count: r._count._all,
      })),
      byDriver: byDriverRows
        .map((r) => ({
          driverId: r.driverId,
          driverName: driverById.get(r.driverId)?.name ?? null,
          vehicleReg: driverById.get(r.driverId)?.vehicleReg ?? null,
          total: r._sum.amount ?? 0,
          count: r._count._all,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async remove(companyId: string, id: string) {
    const existing = await this.prisma.tripCostEntry.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Trip cost entry not found');
    await this.prisma.tripCostEntry.delete({ where: { id } });
    return { deleted: true };
  }
}

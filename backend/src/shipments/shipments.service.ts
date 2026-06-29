import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
  ) {}

  private safeEmit(fn: () => void): void {
    try { fn(); } catch (err: any) { this.logger.warn(`Shipment realtime emit failed: ${err?.message ?? err}`); }
  }

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    return this.prisma.shipment.findMany({
      where,
      include: {
        waybill: { select: { trackingNumber: true, recipientName: true, recipientAddress: true } },
        driver: { select: { name: true, phone: true, vehicleType: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async findLive(companyId: string) {
    return this.prisma.shipment.findMany({
      where: { companyId, status: 'IN_TRANSIT' },
      include: {
        waybill: { select: { trackingNumber: true, recipientName: true, recipientAddress: true, status: true } },
        driver: { select: { id: true, name: true, phone: true, lastLat: true, lastLng: true } },
      },
    });
  }

  /**
   * Shipment ops-health — the movement view: status funnel, in-transit risk
   * (ETA-breached + stalled with no update), and average transit time. Distinct
   * from the dashboard's on-time KPI (delivery outcome) and the ops
   * exception-SLA (failed/returned waybills) — this is about shipments still
   * moving. Tenant-scoped, read-only.
   */
  async health(companyId: string) {
    const now = Date.now();
    const STALL_HOURS = 24;
    const d30 = new Date(now - 30 * 86_400_000);

    const [byStatus, inTransit, deliveredRecent] = await Promise.all([
      this.prisma.shipment.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.shipment.findMany({
        where: { companyId, status: 'IN_TRANSIT' },
        select: {
          id: true, estimatedDelivery: true, updatedAt: true, createdAt: true,
          waybill: { select: { trackingNumber: true, recipientName: true, recipientAddress: true } },
          driver: { select: { name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 500,
      }),
      this.prisma.shipment.findMany({
        where: { companyId, status: 'DELIVERED', deliveredAt: { gte: d30 } },
        select: { createdAt: true, deliveredAt: true },
      }),
    ]);

    const statusCounts: Record<string, number> = { PENDING: 0, IN_TRANSIT: 0, DELIVERED: 0, FAILED: 0 };
    for (const r of byStatus) statusCounts[r.status] = r._count._all;

    let etaBreaches = 0;
    let stalled = 0;
    const watch: any[] = [];
    for (const s of inTransit) {
      const etaBreached = s.estimatedDelivery ? new Date(s.estimatedDelivery).getTime() < now : false;
      const stallHours = (now - new Date(s.updatedAt).getTime()) / 3_600_000;
      const isStalled = stallHours >= STALL_HOURS;
      if (etaBreached) etaBreaches += 1;
      if (isStalled) stalled += 1;
      if (etaBreached || isStalled) {
        watch.push({
          id: s.id,
          trackingNumber: s.waybill?.trackingNumber ?? '—',
          recipient: s.waybill?.recipientName ?? s.waybill?.recipientAddress ?? '—',
          driver: s.driver?.name ?? null,
          etaBreached,
          stalled: isStalled,
          stalledHours: Math.round(stallHours * 10) / 10,
          ageHours: Math.round(((now - new Date(s.createdAt).getTime()) / 3_600_000) * 10) / 10,
        });
      }
    }
    // Worst first: ETA breaches, then longest stalled.
    watch.sort((a, b) => Number(b.etaBreached) - Number(a.etaBreached) || b.stalledHours - a.stalledHours);

    let transitSum = 0;
    for (const s of deliveredRecent) {
      if (s.deliveredAt) transitSum += (new Date(s.deliveredAt).getTime() - new Date(s.createdAt).getTime()) / 3_600_000;
    }
    const avgTransitHours = deliveredRecent.length ? Math.round((transitSum / deliveredRecent.length) * 10) / 10 : null;

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return {
      statusCounts,
      total,
      inTransit: statusCounts.IN_TRANSIT,
      etaBreaches,
      stalled,
      healthyInTransit: Math.max(0, statusCounts.IN_TRANSIT - watch.length),
      avgTransitHours,
      deliveredLast30: deliveredRecent.length,
      stallHours: STALL_HOURS,
      watch: watch.slice(0, 10),
      note:
        'Status funnel covers all shipments. In-transit risk flags ETA-breached or stalled (no update in 24h) shipments; average transit is over deliveries in the last 30 days.',
    };
  }

  async findOne(id: string, companyId: string) {
    const s = await this.prisma.shipment.findFirst({
      where: { id, companyId },
      include: { waybill: true, driver: true },
    });
    if (!s) throw new NotFoundException('Shipment not found');
    return s;
  }

  async create(companyId: string, dto: any) {
    return this.prisma.shipment.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    const updated = await this.prisma.shipment.update({ where: { id }, data: dto });
    // Live-refresh the operations dashboard / live map (the frontend's
    // premium socket listens for `shipment-status-changed`).
    this.safeEmit(() => this.gateway.emitShipmentUpdate(companyId, {
      id: updated.id,
      waybillId: updated.waybillId,
      status: updated.status,
      driverId: updated.driverId,
    }));
    return updated;
  }

  async getRisk(waybillId: string, companyId: string) {
    const waybill = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!waybill) throw new NotFoundException('Waybill not found');
    return { riskLevel: waybill.riskLevel, riskScore: waybill.riskScore, riskNotes: waybill.riskNotes };
  }

  async recalculateRisk(companyId: string, dto: any) {
    // Stub: real implementation would run ML model or rules engine
    const waybill = await this.prisma.waybill.update({
      where: { id: dto.waybillId },
      data: { riskScore: Math.random(), riskLevel: 'LOW' },
    });
    // Push the new score to dashboards listening on `risk-score-updated`.
    this.safeEmit(() => this.gateway.emitRiskScoreUpdated(companyId, {
      waybillId: waybill.id,
      trackingNumber: waybill.trackingNumber,
      riskLevel: waybill.riskLevel,
      riskScore: waybill.riskScore,
    }));
    return waybill;
  }
}

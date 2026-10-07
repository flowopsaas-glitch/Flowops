import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { pickAllowed } from '../common/pick-allowed.util';
import { assertFleetDispatchAllowed } from '../fleet-maintenance/fleet-compliance';

/** Client-writable Shipment fields (excludes id/companyId/timestamps). */
const SHIPMENT_FIELDS = [
  'status', 'waybillId', 'driverId', 'userId',
  'currentLat', 'currentLng', 'estimatedDelivery', 'deliveredAt',
] as const;

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
    if (dto?.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, companyId },
        select: { id: true, companyId: true, currentKm: true, nextServiceKm: true, nextServiceDate: true },
      });
      if (!driver) throw new NotFoundException('Driver not found in your company');
      assertFleetDispatchAllowed(driver);
    }
    return this.prisma.shipment.create({
      data: { ...pickAllowed(dto, SHIPMENT_FIELDS), companyId } as any,
    });
  }

  async update(id: string, companyId: string, dto: any) {
    // Tenant-scoped: verify the shipment belongs to the caller before mutating.
    const owned = await this.prisma.shipment.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Shipment not found');
    if (dto?.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, companyId },
        select: { id: true, companyId: true, currentKm: true, nextServiceKm: true, nextServiceDate: true },
      });
      if (!driver) throw new NotFoundException('Driver not found in your company');
      assertFleetDispatchAllowed(driver);
    }
    const updated = await this.prisma.shipment.update({ where: { id }, data: pickAllowed(dto, SHIPMENT_FIELDS) });
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
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, companyId },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    // Rule-based risk scoring engine (replaces ML stub)
    let score = 0;
    const notes: string[] = [];

    // Factor 1: COD amount (high COD = higher risk of disputes/fraud)
    if (waybill.codAmount && waybill.codAmount > 5000) { score += 20; notes.push('High COD amount (>R5000)'); }
    else if (waybill.codAmount && waybill.codAmount > 2000) { score += 10; notes.push('Moderate COD amount'); }

    // Factor 2: Delivery attempts (multiple failures = escalating risk)
    if (waybill.attemptCount >= 3) { score += 35; notes.push('Max delivery attempts reached'); }
    else if (waybill.attemptCount >= 2) { score += 20; notes.push('Multiple delivery attempts'); }
    else if (waybill.attemptCount >= 1) { score += 10; notes.push('Previous failed attempt'); }

    // Factor 3: Address quality (missing geocoding = harder to deliver)
    if (!waybill.recipientLat || !waybill.recipientLng) { score += 15; notes.push('Address not geocoded'); }

    // Factor 4: Age (older undelivered waybills are higher risk)
    const ageDays = Math.floor((Date.now() - new Date(waybill.createdAt).getTime()) / 86_400_000);
    if (ageDays > 7 && waybill.status !== 'DELIVERED') { score += 20; notes.push(`Aging ${ageDays} days without delivery`); }
    else if (ageDays > 3 && waybill.status !== 'DELIVERED') { score += 10; notes.push(`${ageDays} days old`); }

    // Factor 5: Return-to-sender flagged
    if (waybill.returnToSender) { score += 30; notes.push('Marked for return-to-sender'); }

    // Normalize to 0-1 scale and assign risk level
    const riskScore = Math.min(score / 100, 1.0);
    const riskLevel = riskScore >= 0.7 ? 'CRITICAL' : riskScore >= 0.5 ? 'HIGH' : riskScore >= 0.25 ? 'MEDIUM' : 'LOW';
    const riskNotes = notes.length > 0 ? notes.join('; ') : 'No risk factors detected';

    const updated = await this.prisma.waybill.update({
      where: { id: dto.waybillId },
      data: { riskScore, riskLevel, riskNotes },
    });

    this.safeEmit(() => this.gateway.emitRiskScoreUpdated(companyId, {
      waybillId: updated.id,
      trackingNumber: updated.trackingNumber,
      riskLevel: updated.riskLevel,
      riskScore: updated.riskScore,
    }));
    return updated;
  }
}

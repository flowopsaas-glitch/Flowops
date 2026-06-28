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

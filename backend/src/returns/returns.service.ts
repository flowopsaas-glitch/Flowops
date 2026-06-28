import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnDto, ReturnTransitionDto } from './dto/update-return.dto';

const INCLUDE = {
  items: true,
  assignedDriver: { select: { id: true, name: true, phone: true, status: true } },
  waybill: {
    select: {
      id: true, trackingNumber: true, recipientName: true,
      codAmount: true, totalAmount: true, status: true,
    },
  },
} as const;

@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────

  async findAll(companyId: string, query: any = {}) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.reason) where.reason = query.reason;
    if (query.resolution) where.resolution = query.resolution;
    if (query.driverId) where.assignedDriverId = query.driverId;
    if (query.search) {
      const s = String(query.search);
      where.OR = [
        { rmaNumber: { contains: s, mode: 'insensitive' } },
        { trackingNumber: { contains: s, mode: 'insensitive' } },
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone: { contains: s, mode: 'insensitive' } },
        { customerEmail: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.return.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, companyId: string) {
    const r = await this.prisma.return.findFirst({
      where: { id, companyId },
      include: INCLUDE,
    });
    if (!r) throw new NotFoundException('Return not found');
    return r;
  }

  /** Dashboard headline numbers for the Returns page. */
  async stats(companyId: string) {
    const [byStatus, byResolution, refundAgg, monthCount] = await Promise.all([
      this.prisma.return.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.return.groupBy({
        by: ['resolution'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.return.aggregate({
        where: { companyId, status: ReturnStatus.COMPLETED },
        _sum: { refundAmount: true, restockFee: true },
      }),
      this.prisma.return.count({
        where: {
          companyId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const resolutionCounts: Record<string, number> = {};
    for (const row of byResolution) resolutionCounts[row.resolution] = row._count._all;

    const total = byStatus.reduce((acc, r) => acc + r._count._all, 0);
    const open =
      (statusCounts.REQUESTED ?? 0) +
      (statusCounts.APPROVED ?? 0) +
      (statusCounts.SCHEDULED ?? 0) +
      (statusCounts.IN_TRANSIT ?? 0) +
      (statusCounts.RECEIVED ?? 0) +
      (statusCounts.INSPECTING ?? 0);

    return {
      total,
      open,
      thisMonth: monthCount,
      pendingApproval: statusCounts.REQUESTED ?? 0,
      awaitingCollection: (statusCounts.APPROVED ?? 0) + (statusCounts.SCHEDULED ?? 0),
      inInspection: statusCounts.INSPECTING ?? 0,
      completed: statusCounts.COMPLETED ?? 0,
      statusCounts,
      resolutionCounts,
      refundsPaid: refundAgg._sum.refundAmount ?? 0,
      restockFeesCollected: refundAgg._sum.restockFee ?? 0,
    };
  }

  // ── Writes ────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateReturnDto) {
    // Resolve the linked waybill (by id or tracking number) so we can carry
    // its tracking number + suggest a COD refund. Best-effort, never blocks.
    let waybillId = dto.waybillId ?? null;
    let trackingNumber = dto.trackingNumber ?? null;
    let suggestedRefund = dto.refundAmount;

    if (!waybillId && trackingNumber) {
      const wb = await this.prisma.waybill.findFirst({
        where: { companyId, trackingNumber },
        select: { id: true, codAmount: true, totalAmount: true },
      });
      if (wb) {
        waybillId = wb.id;
        if (suggestedRefund == null) suggestedRefund = wb.codAmount ?? wb.totalAmount ?? undefined;
      }
    } else if (waybillId) {
      const wb = await this.prisma.waybill.findFirst({
        where: { id: waybillId, companyId },
        select: { trackingNumber: true, codAmount: true, totalAmount: true },
      });
      if (!wb) throw new BadRequestException('Linked waybill not found for this company');
      trackingNumber = wb.trackingNumber;
      if (suggestedRefund == null) suggestedRefund = wb.codAmount ?? wb.totalAmount ?? undefined;
    }

    const rmaNumber = await this.nextRmaNumber(companyId);

    return this.prisma.return.create({
      data: {
        rmaNumber,
        companyId,
        waybillId,
        trackingNumber,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        pickupAddress: dto.pickupAddress,
        reason: dto.reason ?? 'OTHER',
        reasonNote: dto.reasonNote,
        status: dto.status ?? 'REQUESTED',
        resolution: dto.resolution ?? 'PENDING',
        refundAmount: suggestedRefund,
        restockFee: dto.restockFee,
        items: dto.items?.length
          ? {
              create: dto.items.map((it) => ({
                description: it.description,
                sku: it.sku,
                quantity: it.quantity ?? 1,
                unitValue: it.unitValue,
                condition: it.condition,
              })),
            }
          : undefined,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, companyId: string, dto: UpdateReturnDto) {
    await this.findOne(id, companyId);
    return this.prisma.return.update({
      where: { id },
      data: { ...dto, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined },
      include: INCLUDE,
    });
  }

  /**
   * Drive the RMA through its lifecycle. Each action applies the right status
   * + side-effect timestamps so the UI/timeline stays consistent.
   */
  async transition(
    id: string,
    companyId: string,
    action: string,
    body: ReturnTransitionDto,
    userId?: string,
  ) {
    const current = await this.findOne(id, companyId);
    const data: any = {};

    switch (action) {
      case 'approve':
        this.assertFrom(current.status, ['REQUESTED'], action);
        data.status = 'APPROVED';
        data.approvedById = userId ?? null;
        data.approvedAt = new Date();
        break;
      case 'reject':
        this.assertFrom(current.status, ['REQUESTED', 'APPROVED'], action);
        data.status = 'REJECTED';
        data.resolution = 'PENDING';
        if (body.note) data.inspectionNotes = body.note;
        data.resolvedAt = new Date();
        break;
      case 'schedule':
        this.assertFrom(current.status, ['APPROVED', 'REQUESTED', 'SCHEDULED'], action);
        data.status = 'SCHEDULED';
        if (body.assignedDriverId) data.assignedDriverId = body.assignedDriverId;
        data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
        break;
      case 'collect':
        this.assertFrom(current.status, ['SCHEDULED', 'APPROVED'], action);
        data.status = 'IN_TRANSIT';
        data.collectedAt = new Date();
        break;
      case 'receive':
        this.assertFrom(current.status, ['IN_TRANSIT', 'SCHEDULED'], action);
        data.status = 'RECEIVED';
        data.receivedAt = new Date();
        break;
      case 'inspect':
        this.assertFrom(current.status, ['RECEIVED', 'IN_TRANSIT'], action);
        data.status = 'INSPECTING';
        if (body.condition) data.condition = body.condition;
        if (body.note) data.inspectionNotes = body.note;
        break;
      case 'resolve':
        this.assertFrom(current.status, ['INSPECTING', 'RECEIVED'], action);
        if (!body.resolution || body.resolution === 'PENDING') {
          throw new BadRequestException('A concrete resolution is required to complete a return');
        }
        data.status = 'COMPLETED';
        data.resolution = body.resolution;
        data.resolvedAt = new Date();
        if (body.refundAmount != null) data.refundAmount = body.refundAmount;
        if (body.restockFee != null) data.restockFee = body.restockFee;
        if (body.condition) data.condition = body.condition;
        if (body.restocked != null) data.restocked = body.restocked;
        else if (body.resolution === 'RESTOCK') data.restocked = true;
        break;
      case 'cancel':
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
          throw new BadRequestException(`Cannot cancel a return that is already ${current.status}`);
        }
        data.status = 'CANCELLED';
        if (body.note) data.inspectionNotes = body.note;
        break;
      default:
        throw new BadRequestException(`Unknown return action: ${action}`);
    }

    const updated = await this.prisma.return.update({ where: { id }, data, include: INCLUDE });

    // ── Close the loop ───────────────────────────────────────────────────
    // Surface the transition to staff (notification bell) and email the
    // customer a branded update. Best-effort — never blocks the transition.
    void this.notifications.notifyReturnStatus({
      companyId,
      rmaNumber: updated.rmaNumber,
      trackingNumber: updated.trackingNumber,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      status: updated.status,
      resolution: updated.resolution,
      refundAmount: updated.refundAmount,
    });

    return updated;
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.return.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private assertFrom(current: ReturnStatus, allowed: ReturnStatus[] | string[], action: string) {
    if (!(allowed as string[]).includes(current)) {
      throw new BadRequestException(
        `Cannot ${action} a return in status ${current}. Allowed from: ${allowed.join(', ')}`,
      );
    }
  }

  /** RMA-YYMM-#### sequential per company per calendar month. */
  private async nextRmaNumber(companyId: string): Promise<string> {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const seq = await this.prisma.return.count({
      where: { companyId, createdAt: { gte: monthStart } },
    });
    return `RMA-${yy}${mm}-${String(seq + 1).padStart(4, '0')}`;
  }
}

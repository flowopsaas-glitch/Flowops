import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { claimTransition } from '../common/state-transition';
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

  /**
   * Returns intelligence — the "why are things coming back, how long does it
   * take, and how much do we recover?" view that the headline stats don't show.
   * - reasonMix: returns grouped by reason (the lever to actually reduce returns)
   * - avgCycleDays: request → completion turnaround
   * - restockRatePct: share of completed returns put back into sellable stock
   * - openRefundExposure: refund liability still owed on in-flight returns
   * All tenant-scoped, read-only.
   */
  async insights(companyId: string) {
    const [byReason, completed, openAgg] = await Promise.all([
      this.prisma.return.groupBy({
        by: ['reason'],
        where: { companyId },
        _count: { _all: true },
        _sum: { refundAmount: true },
      }),
      this.prisma.return.findMany({
        where: { companyId, status: ReturnStatus.COMPLETED },
        select: { createdAt: true, resolvedAt: true, receivedAt: true, restocked: true },
      }),
      this.prisma.return.aggregate({
        where: {
          companyId,
          status: { notIn: [ReturnStatus.COMPLETED, ReturnStatus.CANCELLED, ReturnStatus.REJECTED] },
        },
        _sum: { refundAmount: true },
        _count: { _all: true },
      }),
    ]);

    const reasonTotal = byReason.reduce((s, r) => s + r._count._all, 0);
    const reasonMix = byReason
      .map((r) => ({
        reason: r.reason,
        count: r._count._all,
        pct: reasonTotal ? Math.round((r._count._all / reasonTotal) * 1000) / 10 : 0,
        refundValue: Math.round(r._sum.refundAmount ?? 0),
      }))
      .sort((a, b) => b.count - a.count);

    const DAY = 86_400_000;
    let cycleSum = 0, cycleCount = 0;
    let inspectSum = 0, inspectCount = 0;
    let restocked = 0;
    for (const r of completed) {
      if (r.resolvedAt) {
        cycleSum += (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / DAY;
        cycleCount += 1;
        if (r.receivedAt) {
          inspectSum += (new Date(r.resolvedAt).getTime() - new Date(r.receivedAt).getTime()) / DAY;
          inspectCount += 1;
        }
      }
      if (r.restocked) restocked += 1;
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      reasonMix,
      reasonTotal,
      topReason: reasonMix[0]?.reason ?? null,
      avgCycleDays: cycleCount ? round1(cycleSum / cycleCount) : null,
      avgInspectToResolveDays: inspectCount ? round1(inspectSum / inspectCount) : null,
      completedCount: completed.length,
      restockRatePct: completed.length ? Math.round((restocked / completed.length) * 1000) / 10 : 0,
      restockedCount: restocked,
      openRefundExposure: Math.round(openAgg._sum.refundAmount ?? 0),
      openCount: openAgg._count._all,
      note:
        'Reason mix spans all returns; cycle time and restock rate are measured over completed returns; open refund exposure is the refund still owed on in-flight returns.',
    };
  }

  // ── Writes ────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateReturnDto) {
    // Resolve the linked waybill (by id or tracking number) so we can carry
    // its tracking number + suggest a COD refund. Best-effort, never blocks.
    //
    // Everything happens in ONE transaction: the waybill lookup, the RMA
    // allocation and the insert. The RMA lock only means something if the row
    // that consumes the number is written inside the same transaction.
    return this.prisma.withTenant(companyId, async (tx) => {
      let waybillId = dto.waybillId ?? null;
      let trackingNumber = dto.trackingNumber ?? null;
      let suggestedRefund = dto.refundAmount;

      if (!waybillId && trackingNumber) {
        const wb = await tx.waybill.findFirst({
          where: { companyId, trackingNumber },
          select: { id: true, codAmount: true, totalAmount: true },
        });
        if (wb) {
          waybillId = wb.id;
          if (suggestedRefund == null) suggestedRefund = wb.codAmount ?? wb.totalAmount ?? undefined;
        }
      } else if (waybillId) {
        const wb = await tx.waybill.findFirst({
          where: { id: waybillId, companyId },
          select: { trackingNumber: true, codAmount: true, totalAmount: true },
        });
        if (!wb) throw new BadRequestException('Linked waybill not found for this company');
        trackingNumber = wb.trackingNumber;
        if (suggestedRefund == null) suggestedRefund = wb.codAmount ?? wb.totalAmount ?? undefined;
      }

      const rmaNumber = await this.allocateRmaNumber(tx, companyId, new Date());

      return tx.return.create({
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
    });
  }

  /**
   * Edit the descriptive fields of a return. NOT its status.
   *
   * This used to spread `...dto`, and UpdateReturnDto declares
   * `status?: ReturnStatus` — so a PATCH could jump REQUESTED straight to
   * COMPLETED, skipping approval, collection and inspection, and attach a refund
   * to a return nobody had agreed to. The lifecycle in transition() was
   * therefore advisory: real only for callers who chose to use it.
   */
  async update(id: string, companyId: string, dto: UpdateReturnDto) {
    await this.findOne(id, companyId);
    const { status, resolution, ...editable } = dto as any;
    if (status !== undefined || resolution !== undefined) {
      throw new BadRequestException(
        'A return’s status and resolution are changed through the transition endpoint, ' +
          'so the lifecycle and its timestamps stay consistent. Use POST /returns/:id/transition.',
      );
    }
    return this.prisma.withTenant(companyId, (tx) =>
      tx.return.update({
        where: { id },
        data: {
          ...editable,
          scheduledAt: (editable as any).scheduledAt
            ? new Date((editable as any).scheduledAt)
            : undefined,
        },
        include: INCLUDE,
      }),
    );
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
    // The statuses this action is legal from. Kept alongside `data` because the
    // write below has to claim on it, not just the check above.
    let allowed: ReturnStatus[] = [];

    switch (action) {
      case 'approve':
        allowed = ['REQUESTED'];
        data.status = 'APPROVED';
        data.approvedById = userId ?? null;
        data.approvedAt = new Date();
        break;
      case 'reject':
        allowed = ['REQUESTED', 'APPROVED'];
        data.status = 'REJECTED';
        data.resolution = 'PENDING';
        if (body.note) data.inspectionNotes = body.note;
        data.resolvedAt = new Date();
        break;
      case 'schedule':
        allowed = ['APPROVED', 'REQUESTED', 'SCHEDULED'];
        data.status = 'SCHEDULED';
        if (body.assignedDriverId) data.assignedDriverId = body.assignedDriverId;
        data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
        break;
      case 'collect':
        allowed = ['SCHEDULED', 'APPROVED'];
        data.status = 'IN_TRANSIT';
        data.collectedAt = new Date();
        break;
      case 'receive':
        allowed = ['IN_TRANSIT', 'SCHEDULED'];
        data.status = 'RECEIVED';
        data.receivedAt = new Date();
        break;
      case 'inspect':
        allowed = ['RECEIVED', 'IN_TRANSIT'];
        data.status = 'INSPECTING';
        if (body.condition) data.condition = body.condition;
        if (body.note) data.inspectionNotes = body.note;
        break;
      case 'resolve':
        allowed = ['INSPECTING', 'RECEIVED'];
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
        allowed = [
          'REQUESTED', 'APPROVED', 'SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING',
        ];
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
          throw new BadRequestException(`Cannot cancel a return that is already ${current.status}`);
        }
        data.status = 'CANCELLED';
        if (body.note) data.inspectionNotes = body.note;
        break;
      default:
        throw new BadRequestException(`Unknown return action: ${action}`);
    }

    // Two guards, deliberately. assertFrom gives the caller a readable 400 for
    // an illegal action. The claim is what actually holds under concurrency: it
    // puts the expected statuses in the WHERE so the database decides, because
    // two staff approving at once both read the same committed row and both
    // passed the check above.
    this.assertFrom(current.status, allowed, action);

    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () =>
          tx.return.updateMany({
            where: { id, companyId, status: { in: allowed } },
            data,
          }),
        `Return was ${action}d by someone else.`,
      ),
    );

    const updated = await this.prisma.return.findFirst({ where: { id, companyId }, include: INCLUDE });

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

  /**
   * Delete a return that never went anywhere.
   *
   * A COMPLETED return is the record that a refund was agreed, carrying the
   * refund amount and any restock fee. Deleting it removes the only evidence
   * that money moved, so it is refused — cancel the return instead, which keeps
   * the audit trail.
   */
  async remove(id: string, companyId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status === 'COMPLETED') {
      throw new BadRequestException(
        'A completed return records an agreed refund and cannot be deleted. Cancel it instead.',
      );
    }
    await this.prisma.withTenant(companyId, (tx) => tx.return.delete({ where: { id } }));
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

  /**
   * RMA-YYMM-#### sequential per company per calendar month.
   *
   * Counting rows and adding one is not allocation: two returns created together
   * read the same count and are handed the same number. The count and the insert
   * now share one transaction holding a transaction-scoped advisory lock keyed
   * on company and month, so concurrent callers queue instead of colliding.
   *
   * Taking the lock in its own transaction would release it before the row that
   * consumed the number is written, which fixes nothing. See courier-management,
   * where that exact mistake was made first.
   */
  private async allocateRmaNumber(
    tx: any,
    companyId: string,
    now: Date,
  ): Promise<string> {
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rma:${companyId}:${yy}${mm}`}))`;
    const seq = await tx.return.count({
      where: { companyId, createdAt: { gte: monthStart } },
    });
    return `RMA-${yy}${mm}-${String(seq + 1).padStart(4, '0')}`;
  }
}

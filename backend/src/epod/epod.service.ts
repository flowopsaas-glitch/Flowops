import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureEpodDto, VerifyEpodDto, DisputeEpodDto } from './dto/epod.dto';
import { guardTransition } from '../waybills/waybill-status.machine';

/**
 * Actor context for an ePOD capture. Carries who is capturing so we can enforce
 * proper chain of custody: the parcel is delivered by the DRIVER it was assigned
 * to, and ops staff (admins/managers/dispatch) may capture on a driver's behalf.
 */
export interface EpodActor {
  userId?: string;
  /**
   * The authenticated DRIVER id, when the caller is the driver portal (the
   * driver token's subject). DriverAuthGuard has already verified this id
   * against the driver's session, so it is trusted here — but it must still
   * match the driver the parcel was dispatched to.
   */
  driverId?: string;
  role?: string;
}

/** Roles allowed to capture a POD on behalf of a driver (back-office / ops). */
const OPS_CAPTURE_ROLES = new Set(['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH']);

/** Waybill states from which a delivery may legitimately be completed. */
const CAPTURABLE_WAYBILL_STATUSES = ['OUT_FOR_DELIVERY', 'AT_DESTINATION_HUB', 'FAILED_DELIVERY'];

/**
 * ELECTRONIC PROOF OF DELIVERY — one capture, one delivery, one transaction.
 *
 * The previous implementation:
 *   - wrote the ElectronicPod row, the waybill status and the shipment status in
 *     three separate statements, so a failure between them left an ePOD with no
 *     delivery (or a delivery with no evidence);
 *   - never checked for an existing POD, so a retried/double-submitted capture
 *     created a second record and re-ran the delivery side effects.
 *
 * Now:
 *   - custody is checked (tenant + the driver the parcel is assigned to);
 *   - the lifecycle transition is validated before any write;
 *   - the waybill is claimed with a compare-and-set on `podDeliveredAt: null`,
 *     which is what makes a second concurrent capture impossible (Postgres
 *     locks the row; the loser sees count === 0 and gets a 409);
 *   - POD evidence, waybill delivery, shipment delivery and the tracking event
 *     are written in the SAME transaction, so evidence and state can never
 *     disagree.
 */
@Injectable()
export class EpodService {
  private readonly logger = new Logger(EpodService.name);

  constructor(private readonly prisma: PrismaService) {}

  async capture(companyId: string, dto: CaptureEpodDto, actor: EpodActor = {}) {
    if (!dto?.waybillId) throw new BadRequestException('waybillId is required');

    // Load the waybill WITH its assigned shipment/driver so we can enforce the
    // real logistics procedure (correct lifecycle + assigned-driver custody).
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, companyId },
      include: {
        shipments: {
          select: { id: true, driverId: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    // ── Idempotency / duplicate capture ─────────────────────────────────────
    if (waybill.podDeliveredAt || waybill.status === 'DELIVERED') {
      throw new ConflictException('An ePOD has already been captured for this waybill');
    }
    const existingPod = await this.prisma.electronicPod.findFirst({
      where: { waybillId: dto.waybillId, companyId },
      select: { id: true, status: true },
    });
    if (existingPod) {
      throw new ConflictException(
        `An ePOD (${existingPod.id}, ${existingPod.status}) already exists for this waybill`,
      );
    }

    // ── Chain of custody: who is allowed to capture this POD ────────────────
    const assignedDriverId = (waybill as any).shipments?.[0]?.driverId ?? null;
    const isOps = actor.role ? OPS_CAPTURE_ROLES.has(String(actor.role).toUpperCase()) : false;

    let callerDriverId: string | null = null;
    if (actor.driverId) {
      // Driver-portal caller: confirm the id really is a driver in this tenant.
      const driver = await this.prisma.driver.findFirst({
        where: { id: actor.driverId, companyId },
        select: { id: true },
      });
      callerDriverId = driver?.id ?? null;
    } else if (actor.userId) {
      const driver = await this.prisma.driver.findFirst({
        where: { userId: actor.userId, companyId },
        select: { id: true },
      });
      callerDriverId = driver?.id ?? null;
    }

    if (!isOps) {
      // Non-ops caller must be the assigned driver of this waybill.
      if (!callerDriverId || !assignedDriverId || callerDriverId !== assignedDriverId) {
        throw new ForbiddenException(
          'Only the driver assigned to this delivery (or an operations manager) may capture its proof of delivery.',
        );
      }
    }

    // ── Lifecycle: a parcel can only be delivered from a valid prior state ──
    if (!CAPTURABLE_WAYBILL_STATUSES.includes(waybill.status)) {
      throw new BadRequestException(
        `Waybill ${waybill.trackingNumber} is ${waybill.status}; a POD can only be captured for ${CAPTURABLE_WAYBILL_STATUSES.join('/')}.`,
      );
    }
    guardTransition(
      waybill.status,
      'DELIVERED',
      {
        waybillId: waybill.id,
        trackingNumber: (waybill as any).trackingNumber,
        actor: actor.driverId ?? actor.userId ?? 'epod',
      },
      (msg) => {
        throw new BadRequestException(msg);
      },
    );

    // Attribute the capture to the assigned driver when the client didn't send
    // one (or sent a mismatching id) — never trust a client-supplied driverId
    // for a non-ops caller.
    const attributedDriverId = isOps
      ? (dto.driverId ?? assignedDriverId ?? null)
      : (callerDriverId ?? assignedDriverId ?? null);

    // An ops capture on behalf of a driver must name a driver in this tenant.
    if (isOps && dto.driverId) {
      const named = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, companyId },
        select: { id: true },
      });
      if (!named) throw new BadRequestException('driverId does not belong to this company');
    }

    const deliveredAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: the delivery claim. Two concurrent captures cannot both
      // match `podDeliveredAt: null` — the row lock serialises them.
      const claim = await tx.waybill.updateMany({
        where: {
          id: dto.waybillId,
          companyId,
          podDeliveredAt: null,
          status: { in: CAPTURABLE_WAYBILL_STATUSES as any },
        },
        data: { status: 'DELIVERED', podDeliveredAt: deliveredAt },
      });
      if (claim.count === 0) {
        throw new ConflictException('This waybill was already marked delivered by another capture');
      }

      // 1. POD evidence.
      const epod = await tx.electronicPod.create({
        data: {
          companyId,
          waybillId: dto.waybillId,
          driverId: attributedDriverId ?? undefined,
          status: 'CAPTURED',
          signatureUrl: dto.signatureUrl,
          photoUrls: dto.photoUrls || [],
          recipientName: dto.recipientName,
          recipientId: dto.recipientId,
          notes: dto.notes,
          geoLat: dto.geoLat,
          geoLng: dto.geoLng,
          capturedAt: deliveredAt,
        },
      });

      // 2. The waybill's POD mirror fields (kept for the existing UI/reports).
      const updated = await tx.waybill.update({
        where: { id: dto.waybillId },
        data: {
          podSignatureUrl: dto.signatureUrl ?? undefined,
          podImageUrl: dto.photoUrls?.[0] ?? undefined,
          podRecipient: dto.recipientName ?? undefined,
        },
      });

      // 3. The linked shipment(s) — the dispatch board reads these.
      await tx.shipment.updateMany({
        where: { waybillId: dto.waybillId, companyId },
        data: { status: 'DELIVERED', deliveredAt },
      });

      // 4. Tracking event — the customer-visible timeline.
      await tx.trackingEvent.create({
        data: {
          waybillId: dto.waybillId,
          companyId,
          event: 'DELIVERED',
          status: 'DELIVERED',
          description: `Parcel delivered to ${dto.recipientName ?? 'recipient'}. ePOD ${epod.id} captured.`,
          location: dto.notes ?? null,
          actorType: isOps ? 'DISPATCH' : 'DRIVER',
          actorId: attributedDriverId ?? undefined,
          metadata: { epodId: epod.id, capturedBy: actor.userId ?? actor.driverId ?? null },
        },
      });

      return { epod, waybill: updated };
    });

    this.logger.log(
      `ePOD ${result.epod.id} captured for ${waybill.trackingNumber} by ${
        isOps ? `ops:${actor.userId ?? 'unknown'}` : `driver:${attributedDriverId}`
      }`,
    );

    return result.epod;
  }

  async findAll(companyId: string, query?: { status?: string; waybillId?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.waybillId) where.waybillId = query.waybillId;

    return this.prisma.electronicPod.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const epod = await this.prisma.electronicPod.findFirst({ where: { id, companyId } });
    if (!epod) throw new NotFoundException('ePOD not found');
    return epod;
  }

  async findByWaybill(waybillId: string, companyId: string) {
    return this.prisma.electronicPod.findFirst({
      where: { waybillId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async verify(id: string, companyId: string, dto: VerifyEpodDto) {
    const epod = await this.findOne(id, companyId);
    // CAS so two verifiers cannot both "win" and so a DISPUTED POD cannot be
    // quietly flipped back to VERIFIED.
    const updated = await this.prisma.electronicPod.updateMany({
      where: { id, companyId, status: 'CAPTURED' },
      data: { status: 'VERIFIED', verifiedBy: dto.verifiedBy, verifiedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Only captured ePODs can be verified (current status: ${epod.status})`);
    }
    return this.findOne(id, companyId);
  }

  async dispute(id: string, companyId: string, dto: DisputeEpodDto) {
    if (!dto?.reason?.trim()) throw new BadRequestException('A dispute reason is required');
    const epod = await this.findOne(id, companyId);
    const updated = await this.prisma.electronicPod.updateMany({
      where: { id, companyId, status: { not: 'DISPUTED' } },
      data: { status: 'DISPUTED', disputeReason: dto.reason },
    });
    if (updated.count === 0) {
      throw new ConflictException(`ePOD is already disputed (current status: ${epod.status})`);
    }
    return this.findOne(id, companyId);
  }

  /**
   * Delivery-completion statistics. `verificationRate` is null — not 0 — when
   * nothing has been captured yet, so a new tenant's dashboard cannot show
   * "0% verified" as if verification were failing.
   */
  async getStats(companyId: string) {
    const [total, captured, verified, disputed] = await Promise.all([
      this.prisma.electronicPod.count({ where: { companyId } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'CAPTURED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'VERIFIED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'DISPUTED' } }),
    ]);
    return {
      total,
      captured,
      verified,
      disputed,
      verificationRate: total ? Math.round((verified / total) * 100) : null,
    };
  }
}

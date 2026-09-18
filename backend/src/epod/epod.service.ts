import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
  role?: string;
}

/** Roles allowed to capture a POD on behalf of a driver (back-office / ops). */
const OPS_CAPTURE_ROLES = new Set(['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH']);

@Injectable()
export class EpodService {
  constructor(private readonly prisma: PrismaService) {}

  async capture(companyId: string, dto: CaptureEpodDto, actor: EpodActor = {}) {
    // Load the waybill WITH its assigned shipment/driver so we can enforce the
    // real logistics procedure (correct lifecycle + assigned-driver custody).
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, companyId },
      include: { shipments: { select: { driverId: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    // ── Chain of custody: who is allowed to capture this POD ────────────────
    // The parcel must be delivered by the driver it was dispatched to. Ops
    // roles (admin/manager/dispatch) may capture on the driver's behalf (e.g.
    // reconciling a paper POD). A driver may only close out their OWN parcel.
    const assignedDriverId = waybill.shipments[0]?.driverId ?? null;
    const isOps = actor.role ? OPS_CAPTURE_ROLES.has(String(actor.role).toUpperCase()) : false;

    // Resolve the caller's own Driver record (if they are a driver) so we can
    // verify they are the one this parcel was dispatched to.
    let callerDriverId: string | null = null;
    if (actor.userId) {
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

    // ── Proper lifecycle: a parcel can only be marked DELIVERED from a valid
    // prior state (e.g. OUT_FOR_DELIVERY). This stops PENDING → DELIVERED jumps
    // that skip pickup/transit. Honours WAYBILL_STRICT_TRANSITIONS (log-only by
    // default, enforced when strict mode is on) — same policy as the rest of
    // the codebase, so ePOD no longer bypasses the state machine.
    guardTransition(waybill.status, 'DELIVERED', {
      waybillId: waybill.id,
      trackingNumber: (waybill as any).trackingNumber,
      actor: actor.userId ?? 'epod',
    }, (msg) => { throw new BadRequestException(msg); });

    // Attribute the capture to the assigned driver when the client didn't send
    // one (or sent a mismatching id) — never trust a client-supplied driverId
    // for a non-ops caller.
    const attributedDriverId = isOps
      ? (dto.driverId ?? assignedDriverId ?? null)
      : (callerDriverId ?? assignedDriverId ?? null);

    const epod = await this.prisma.electronicPod.create({
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
        capturedAt: new Date(),
      },
    });

    // Advance the waybill (and keep the linked shipment in sync) to DELIVERED.
    await this.prisma.waybill.update({
      where: { id: dto.waybillId },
      data: { status: 'DELIVERED', podDeliveredAt: new Date() },
    });
    await this.prisma.shipment.updateMany({
      where: { waybillId: dto.waybillId, companyId },
      data: { status: 'DELIVERED' },
    });

    return epod;
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
    if (epod.status !== 'CAPTURED') {
      throw new BadRequestException('Only captured ePODs can be verified');
    }
    return this.prisma.electronicPod.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedBy: dto.verifiedBy, verifiedAt: new Date() },
    });
  }

  async dispute(id: string, companyId: string, dto: DisputeEpodDto) {
    const epod = await this.findOne(id, companyId);
    if (epod.status === 'DISPUTED') {
      throw new BadRequestException('ePOD is already disputed');
    }
    return this.prisma.electronicPod.update({
      where: { id },
      data: { status: 'DISPUTED', disputeReason: dto.reason },
    });
  }

  async getStats(companyId: string) {
    const [total, captured, verified, disputed] = await Promise.all([
      this.prisma.electronicPod.count({ where: { companyId } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'CAPTURED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'VERIFIED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'DISPUTED' } }),
    ]);
    return { total, captured, verified, disputed, verificationRate: total ? Math.round((verified / total) * 100) : 0 };
  }
}

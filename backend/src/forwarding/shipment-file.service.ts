import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CreateShipmentFileDto } from './dto/create-shipment-file.dto';
import { UpdateShipmentFileDto } from './dto/update-shipment-file.dto';

interface ListFilters {
  mode?: string;
  direction?: string;
  status?: string;
  q?: string;
}

@Injectable()
export class ShipmentFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── Entitlement gate ───────────────────────────────────────────────────────

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'freightForwarding'))) {
      throw new ForbiddenException(
        'Freight Forwarding is an Enterprise feature. Upgrade your plan to manage import/export shipments.',
      );
    }
  }

  /** Tenant-scoped, year-prefixed file number: IMP-2026-00042 / EXP-2026-00007. */
  private async nextFileNumber(companyId: string, direction: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = direction === 'EXPORT' ? 'EXP' : 'IMP';
    const yearStart = new Date(year, 0, 1);
    const count = await this.prisma.shipmentFile.count({
      where: { companyId, createdAt: { gte: yearStart } },
    });
    return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateShipmentFileDto) {
    await this.assertEntitled(companyId);
    const fileNumber = await this.nextFileNumber(companyId, dto.direction);
    return this.prisma.shipmentFile.create({
      data: {
        ...dto,
        fileNumber,
        companyId,
        etd: dto.etd ? new Date(dto.etd) : null,
        eta: dto.eta ? new Date(dto.eta) : null,
      },
    });
  }

  async list(companyId: string, filters: ListFilters) {
    await this.assertEntitled(companyId);
    const where: any = { companyId };
    if (filters.mode) where.mode = filters.mode;
    if (filters.direction) where.direction = filters.direction;
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      where.OR = [
        { fileNumber: { contains: filters.q, mode: 'insensitive' } },
        { shipperName: { contains: filters.q, mode: 'insensitive' } },
        { consigneeName: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.shipmentFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { containers: true, cargo: true, charges: true, documents: true } },
      },
    });
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id, companyId },
      include: {
        containers: true,
        cargo: true,
        charges: true,
        documents: { orderBy: { createdAt: 'desc' } },
        milestones: { orderBy: { reachedAt: 'asc' } },
      },
    });
    if (!file) throw new NotFoundException('Shipment file not found');
    return file;
  }

  async update(companyId: string, id: string, dto: UpdateShipmentFileDto) {
    await this.assertEntitled(companyId);
    await this.get(companyId, id); // ownership + existence
    const data: any = { ...dto };
    if (dto.etd !== undefined) data.etd = dto.etd ? new Date(dto.etd) : null;
    if (dto.eta !== undefined) data.eta = dto.eta ? new Date(dto.eta) : null;
    const { count } = await this.prisma.shipmentFile.updateMany({ where: { id, companyId }, data });
    if (count === 0) throw new NotFoundException('Shipment file not found');
    return this.get(companyId, id);
  }

  /** Soft cancel — never hard-delete a shipment file. */
  async cancel(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const file = await this.get(companyId, id);
    if (file.status === 'CANCELLED') return file;

    // A cancelled file is terminal. The status is part of the WHERE so a
    // milestone racing this call cannot land afterwards and quietly un-cancel
    // the file — the old plain update on the id alone always won.
    const { count } = await this.prisma.shipmentFile.updateMany({
      where: { id, companyId, status: { not: 'CANCELLED' } as any },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) {
      throw new ConflictException('The shipment file changed while it was being cancelled.');
    }
    return this.get(companyId, id);
  }

  // ── Milestones ─────────────────────────────────────────────────────────────

  /** Advance the file to a status, record a milestone, and emit a tracked event. */
  async advanceMilestone(companyId: string, id: string, status: string, note?: string) {
    await this.assertEntitled(companyId);
    const file = await this.get(companyId, id);
    if (file.status === 'CANCELLED') {
      throw new ConflictException('This shipment file is cancelled and cannot be advanced.');
    }

    // The milestone and the status move together. They used to be two
    // independent writes, so a failure between them left the timeline saying
    // something the file did not — and for a shipment the milestone log *is*
    // the record of where the cargo is.
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      // Compare-and-set FIRST, then write the milestone.
      //
      // Compare-and-set on the status we read, and never off CANCELLED: two
      // operators scanning at two gates used to both write, and the file kept
      // whichever landed last while both milestones sat in the timeline.
      //
      // The order matters. Writing the milestone first meant a caller who lost
      // the race still left a row behind — the timeline claimed the cargo moved
      // when the file said it did not. Only a transaction rollback removed it,
      // and relying on that makes the guarantee depend on how the caller's
      // client behaves rather than on the code.
      const { count } = await tx.shipmentFile.updateMany({
        where: { id, companyId, status: file.status as any },
        data: { status: status as any },
      });
      if (count === 0) {
        throw new ConflictException(
          'The shipment file was already advanced by someone else — no milestone was recorded.',
        );
      }

      await tx.shipmentMilestone.create({
        data: { fileId: id, status: status as any, note: note ?? null },
      });

      return tx.shipmentFile.findFirstOrThrow({ where: { id, companyId } });
    });

    // Tracked event (surfaces in AI Control Tower; best-effort).
    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId,
          type: 'FORWARDING_MILESTONE',
          title: `${file.fileNumber}: ${String(status).replace(/_/g, ' ').toLowerCase()}`,
          body: note || `Shipment file advanced to ${status}.`,
          severity: 'info',
          sourceType: 'FORWARDING',
          sourceId: id,
          resolved: true,
        },
      });
    } catch { /* event logging is best-effort */ }

    return updated;
  }

  // ── Documents (metadata; file bytes uploaded via storage separately) ─────────

  async attachDocument(companyId: string, id: string, dto: { type: string; fileName: string; fileKey: string }) {
    await this.assertEntitled(companyId);
    await this.get(companyId, id);
    return this.prisma.shipmentDocument.create({
      data: { fileId: id, type: dto.type, fileName: dto.fileName, fileKey: dto.fileKey },
    });
  }

  async removeDocument(companyId: string, id: string, documentId: string) {
    await this.assertEntitled(companyId);
    await this.get(companyId, id);
    await this.prisma.shipmentDocument.deleteMany({ where: { id: documentId, fileId: id } });
    return { deleted: true };
  }

  // ── Last-mile bridge ─────────────────────────────────────────────────────────

  /**
   * The unique cross-sell: once a file is cleared, spawn a domestic delivery
   * (Collection) pre-filled from the file, so the same platform handles the
   * final leg. Returns the new collection id for deep-linking.
   */
  async createDeliveryFromFile(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const file = await this.get(companyId, id);
    const collection = await this.prisma.collection.create({
      data: {
        companyId,
        clientName: file.consigneeName || 'Consignee',
        clientPhone: '',
        pickupAddress: file.pod || 'To be confirmed',
        notes: `Domestic leg for forwarding file ${file.fileNumber} (${file.direction} ${file.mode}). Complete consignee phone & address.`,
      },
    });
    return { collectionId: collection.id, fileNumber: file.fileNumber };
  }
}

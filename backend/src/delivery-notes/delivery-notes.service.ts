import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickAllowed } from '../common/pick-allowed.util';
import { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from './dto/delivery-note.dto';

/** Client-writable DeliveryNote fields (excludes id/companyId/timestamps). */
const DELIVERY_NOTE_FIELDS = ['content', 'priority', 'category', 'isResolved'] as const;

@Injectable()
export class DeliveryNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, userId: string, userName: string, dto: CreateDeliveryNoteDto) {
    // `waybillId` is a loose string column with no foreign key, so nothing else
    // stops a caller naming a waybill in another tenant. Shipments validates
    // the same reference before writing; notes should too.
    if (dto.waybillId) {
      const waybill = await this.prisma.withTenant(companyId, (tx) =>
        tx.waybill.findFirst({ where: { id: dto.waybillId }, select: { id: true } }),
      );
      if (!waybill) throw new BadRequestException('waybillId does not belong to this company');
    }

    return this.prisma.deliveryNote.create({
      data: {
        companyId,
        content: dto.content,
        waybillId: dto.waybillId,
        priority: dto.priority || 'NORMAL',
        category: dto.category || 'GENERAL',
        createdBy: userId,
        createdByName: userName,
      },
    });
  }

  async findAll(companyId: string, query?: { waybillId?: string; priority?: string; isResolved?: string }) {
    const where: any = { companyId };
    if (query?.waybillId) where.waybillId = query.waybillId;
    if (query?.priority) where.priority = query.priority;
    if (query?.isResolved !== undefined) where.isResolved = query.isResolved === 'true';

    return this.prisma.deliveryNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const note = await this.prisma.deliveryNote.findFirst({ where: { id, companyId } });
    if (!note) throw new NotFoundException('Delivery note not found');
    return note;
  }

  async update(id: string, companyId: string, dto: UpdateDeliveryNoteDto) {
    await this.findOne(id, companyId);
    // The global ValidationPipe already strips undeclared properties, so over
    // HTTP `dto` cannot carry companyId. This makes the service safe on its own
    // terms too — the same pickAllowed whitelist Shipments uses — rather than
    // relying on whoever calls it having gone through the pipe.
    return this.prisma.deliveryNote.update({
      where: { id },
      data: pickAllowed(dto, DELIVERY_NOTE_FIELDS) as any,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.deliveryNote.delete({ where: { id } });
  }

  async resolve(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.deliveryNote.update({
      where: { id },
      data: { isResolved: true },
    });
  }

  async getByWaybill(waybillId: string, companyId: string) {
    return this.prisma.deliveryNote.findMany({
      where: { waybillId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

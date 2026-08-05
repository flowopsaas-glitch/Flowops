import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from './dto/delivery-note.dto';

@Injectable()
export class DeliveryNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, userId: string, userName: string, dto: CreateDeliveryNoteDto) {
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
    return this.prisma.deliveryNote.update({
      where: { id },
      data: dto,
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

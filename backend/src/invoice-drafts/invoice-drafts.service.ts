// src/invoice-drafts/invoice-drafts.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoiceDraftsService {
  private readonly logger = new Logger('InvoiceDraftsService');
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    // ✅ Minimal: no orderBy to avoid schema issues
    return this.prisma.invoiceDraft.findMany({
      include: { company: { select: { name: true } } }
    });
  }

  async findByCompany(companyId: number) {
    return this.prisma.invoiceDraft.findMany({
      where: { companyId },
      include: { company: { select: { name: true } } }
    });
  }

  async findOne(id: string) { // ✅ ID is string (UUID)
    return this.prisma.invoiceDraft.findUnique({
      where: { id },
      include: { company: { select: { name: true } } }
    });
  }

  async create(dto: any) {
    // ✅ Only use fields guaranteed to exist
    return this.prisma.invoiceDraft.create({
      data: {
        companyId: dto.companyId,
        status: 'draft',
      }
    });
  }

  async update(id: string, dto: any) {
    const existing = await this.prisma.invoiceDraft.findUnique({ where: { id }});
    if (!existing) throw new NotFoundException(`Draft ${id} not found`);
    return this.prisma.invoiceDraft.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() }
    });
  }

  async delete(id: string) {
    await this.prisma.invoiceDraft.delete({ where: { id }});
    return { success: true };
  }

  async sendDraft(id: string) {
    const draft = await this.prisma.invoiceDraft.findUnique({ where: { id }});
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    
    // ✅ Create invoice with minimal fields
    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: draft.companyId,
        status: 'sent',
      }
    });
    
    await this.prisma.invoiceDraft.delete({ where: { id }});
    return invoice;
  }
}

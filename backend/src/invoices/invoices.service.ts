import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.overdue === 'true') {
      where.status = 'SENT';
      where.dueDate = { lt: new Date() };
    }
    return this.prisma.invoice.findMany({
      where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  async getSupervisorView(companyId: string) {
    return this.findAll(companyId);
  }

  async getMetrics(companyId: string) {
    const [outstanding, collected, total] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'PAID' },
        _sum: { total: true },
      }),
      this.prisma.invoice.count({ where: { companyId } }),
    ]);

    const out = outstanding._sum.total ?? 0;
    const col = collected._sum.total ?? 0;

    return {
      outstanding: out,
      collected: col,
      total,
      collectionRate: out + col > 0 ? (col / (out + col)) * 100 : 0,
    };
  }

  async findOne(id: string, companyId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId }, include: { items: true, payments: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  async create(companyId: string, dto: any) {
    const count = await this.prisma.invoice.count({ where: { companyId } });
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    const { items, ...rest } = dto;
    return this.prisma.invoice.create({
      data: {
        ...rest, invoiceNumber, companyId,
        items: items ? { create: items } : undefined,
      },
      include: { items: true },
    });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    const { items, ...rest } = dto;
    return this.prisma.invoice.update({ where: { id }, data: rest });
  }

  // Initiate Paystack payment for an invoice (returns redirect URL)
  async initiatePay(id: string, companyId: string) {
    const inv = await this.findOne(id, companyId);
    // Paystack integration happens in PaystackModule — stub here
    return {
      invoiceId: id,
      amount: inv.total,
      message: 'Use PaystackService.initializePayment to generate a payment URL',
    };
  }

  // ── Manual payment approval ──────────────────────────────────────────
  //
  // No Paystack needed. Admin clicks "Approve payment" in the UI,
  // which calls POST /invoices/:id/mark-paid.  A Payment record is
  // created with channel = 'manual' so the audit trail is preserved.

  async markPaid(
    id: string,
    companyId: string,
    dto: { note?: string; paidBy?: string; amount?: number } = {},
  ) {
    const inv = await this.findOne(id, companyId);

    if (inv.status === 'PAID') {
      return inv; // idempotent — already paid, just return it
    }

    // Create an audit-trail payment record
    await this.prisma.payment.create({
      data: {
        reference: `MANUAL-${Date.now()}-${id.slice(-6)}`,
        status: 'SUCCESS',
        amount: dto.amount ?? inv.total,
        currency: 'ZAR',
        description: dto.note ?? 'Manual payment approval',
        invoiceId: id,
        paystackChannel: 'manual',
        customerName: dto.paidBy,
        paidAt: new Date(),
        companyId,
      },
    });

    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
      include: { items: true, payments: true },
    });
  }

  // List invoices awaiting manual payment approval (SENT or OVERDUE)
  async getPendingPayment(companyId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
      include: { items: true, payments: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  // ── Drafts ──────────────────────────────────────────────────────────

  async findDrafts(companyId: string) {
    return this.prisma.invoiceDraft.findMany({
      where: { companyId, finalized: false }, orderBy: { createdAt: 'desc' },
    });
  }

  async findDraft(id: string, companyId: string) {
    const d = await this.prisma.invoiceDraft.findFirst({ where: { id, companyId } });
    if (!d) throw new NotFoundException('Draft not found');
    return d;
  }

  async getDraftAssist(id: string, companyId: string) {
    const draft = await this.findDraft(id, companyId);
    const data: any = draft.draftData || {};
    const issues: string[] = [];
    if (!data.clientName) issues.push('Missing client name');
    if (!data.items || !data.items?.length) issues.push('No line items');
    return {
      draftId: id,
      completeness: issues.length === 0 ? 1 : 1 - issues.length * 0.3,
      issues,
      suggestions: issues.length === 0 ? ['Draft is ready to finalize'] : issues,
      aiAnalysis: { reviewed: true, issueCount: issues.length },
    };
  }

  async finalizeDraft(id: string, companyId: string) {
    const draft = await this.findDraft(id, companyId);
    const invoice = await this.create(companyId, draft.draftData || {});
    await this.prisma.invoiceDraft.update({
      where: { id },
      data: { finalized: true, finalizedAt: new Date(), invoiceId: invoice.id },
    });
    return invoice;
  }
}

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

  // ── Print-optimised HTML for PDF download ─────────────────────────────────

  async generateInvoiceHtml(id: string, companyId: string): Promise<string> {
    const inv = await this.findOne(id, companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, tradingName: true, email: true, phone: true, address: true, city: true, vatNumber: true, logoUrl: true, primaryColor: true },
    });

    const fmt = (v?: number | null) =>
      `ZAR ${(v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d?: string | Date | null) =>
      d ? new Date(d).toLocaleDateString('en-ZA') : '—';

    const accent = company?.primaryColor ?? '#10b981';
    const rows = (inv.items ?? []).map((it: any) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${it.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${it.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(it.unitPrice)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(it.total)}</td>
      </tr>`,
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,sans-serif;color:#111827;background:#fff;padding:40px;max-width:800px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
    .brand-name{font-size:24px;font-weight:900;color:${accent}}
    .brand-sub{font-size:12px;color:#6b7280;margin-top:2px}
    .inv-title{font-size:32px;font-weight:900;color:#111827}
    .inv-meta{font-size:13px;color:#6b7280;margin-top:4px}
    .section{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:32px 0}
    .label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
    .value{font-size:14px;color:#111827}
    .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${accent}22;color:${accent};border:1px solid ${accent}55}
    table{width:100%;border-collapse:collapse;margin:24px 0;font-size:13px}
    thead{background:#f9fafb}
    th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}
    th:last-child,td:last-child{text-align:right}
    .totals{margin-left:auto;width:260px;font-size:13px}
    .totals tr td:first-child{color:#6b7280;padding:4px 0}
    .totals tr td:last-child{text-align:right;font-weight:600;padding:4px 0 4px 16px}
    .totals .grand td{font-size:16px;font-weight:900;padding-top:12px;border-top:2px solid #e5e7eb}
    .footer{margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
    @media print{body{padding:20px}.no-print{display:none}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-name">${company?.tradingName ?? company?.name ?? 'FlowOps'}</div>
      <div class="brand-sub">${company?.email ?? ''}${company?.phone ? ' · ' + company.phone : ''}</div>
      ${company?.vatNumber ? `<div class="brand-sub">VAT: ${company.vatNumber}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">${inv.invoiceNumber}</div>
      <div style="margin-top:8px"><span class="badge">${inv.status}</span></div>
    </div>
  </div>

  <div class="section">
    <div>
      <div class="label">Bill To</div>
      <div class="value" style="font-weight:700">${inv.clientName}</div>
      ${inv.clientEmail ? `<div class="value" style="color:#6b7280">${inv.clientEmail}</div>` : ''}
    </div>
    <div>
      <div class="label">Invoice Details</div>
      <div class="value">Date: ${fmtDate(inv.createdAt)}</div>
      ${inv.dueDate ? `<div class="value">Due: ${fmtDate(inv.dueDate)}</div>` : ''}
      ${inv.paidAt ? `<div class="value" style="color:#10b981;font-weight:600">Paid: ${fmtDate(inv.paidAt)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="4" style="padding:16px 12px;color:#9ca3af;text-align:center">No line items</td></tr>'}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td>${fmt(inv.subtotal)}</td></tr>
    <tr><td>VAT (15%)</td><td>${fmt(inv.tax)}</td></tr>
    ${inv.notes ? `<tr><td colspan="2" style="padding-top:8px;font-size:11px;color:#9ca3af">${inv.notes}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td>${fmt(inv.total)}</td></tr>
  </table>

  <div class="footer">
    Thank you for your business. Please reference <strong>${inv.invoiceNumber}</strong> when making payment.
  </div>

  <script>
    // Auto-open print dialog when opened in a new tab
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;
  }

  async getUnbilledWaybills(companyId: string) {    /**
     * Returns DELIVERED waybills that have a totalAmount AND do not yet appear
     * on any invoice item.  The GenerateModal uses this list so dispatchers
     * never accidentally double-bill a delivery.
     */
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED',
        totalAmount: { gt: 0 },
        invoiceItems: { none: {} },   // Waybill ← InvoiceItem back-relation
      },
      select: {
        id: true,
        trackingNumber: true,
        recipientName: true,
        recipientAddress: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
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

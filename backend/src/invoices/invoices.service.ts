import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
  ) {}

  /** Realtime emits are best-effort — they must never break invoicing. */
  private safeEmit(fn: () => void): void {
    try { fn(); } catch (err: any) { this.logger.warn(`Invoice realtime emit failed: ${err?.message ?? err}`); }
  }

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

  // ── AR Aging Report ────────────────────────────────────────────────────────

  async getArAging(companyId: string) {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
      select: { id: true, invoiceNumber: true, clientName: true, total: true, dueDate: true, createdAt: true },
    });

    const buckets = {
      current:   { label: 'Current',      days: '0',   amount: 0, count: 0, invoices: [] as typeof invoices },
      d1_30:     { label: '1–30 days',     days: '1-30',  amount: 0, count: 0, invoices: [] as typeof invoices },
      d31_60:    { label: '31–60 days',    days: '31-60', amount: 0, count: 0, invoices: [] as typeof invoices },
      d61_90:    { label: '61–90 days',    days: '61-90', amount: 0, count: 0, invoices: [] as typeof invoices },
      d90plus:   { label: '90+ days',      days: '90+',   amount: 0, count: 0, invoices: [] as typeof invoices },
    };

    for (const inv of invoices) {
      const daysPast = inv.dueDate
        ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)
        : -1; // not yet due

      let bucket: keyof typeof buckets;
      if (daysPast < 0) bucket = 'current';
      else if (daysPast <= 30)  bucket = 'd1_30';
      else if (daysPast <= 60)  bucket = 'd31_60';
      else if (daysPast <= 90)  bucket = 'd61_90';
      else                      bucket = 'd90plus';

      buckets[bucket].amount += inv.total;
      buckets[bucket].count += 1;
      buckets[bucket].invoices.push(inv);
    }

    const total = Object.values(buckets).reduce((s, b) => s + b.amount, 0);

    return {
      buckets: Object.values(buckets).map(b => ({
        ...b,
        pct: total > 0 ? Math.round((b.amount / total) * 100) : 0,
      })),
      total,
    };
  }

  // ── Revenue trend (last 6 months) ─────────────────────────────────────────

  async getRevenueTrend(companyId: string) {
    const months: { month: string; billed: number; collected: number; outstanding: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const [billed, paid] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: { companyId, createdAt: { gte: d, lte: end } },
          _sum: { total: true }, _count: { id: true },
        }),
        this.prisma.invoice.aggregate({
          where: { companyId, status: 'PAID', paidAt: { gte: d, lte: end } },
          _sum: { total: true },
        }),
      ]);

      const billedAmt   = billed._sum.total ?? 0;
      const collectedAmt = paid._sum.total ?? 0;

      months.push({
        month:      d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }),
        billed:     billedAmt,
        collected:  collectedAmt,
        outstanding: billedAmt - collectedAmt,
      });
    }

    return months;
  }

  // ── Payment reminder email ─────────────────────────────────────────────────

  async sendPaymentReminder(id: string, companyId: string) {
    const inv = await this.findOne(id, companyId);
    if (!inv.clientEmail) {
      return { sent: false, message: 'No client email on file for this invoice.' };
    }

    const daysPast = inv.dueDate
      ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
      : 0;
    const fmt = (d?: string | Date | null) =>
      d ? new Date(d).toLocaleDateString('en-ZA') : '—';
    const money = (v?: number | null) =>
      `ZAR ${(v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

    // Update sentAt to track the reminder
    await this.prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date() },
    });

    // TODO: wire to EmailService when SENDGRID_API_KEY is configured
    // For now, return the payload that would be sent
    return {
      sent: true,
      to: inv.clientEmail,
      subject: `Payment Reminder — ${inv.invoiceNumber} (${daysPast > 0 ? `${daysPast} days overdue` : 'due soon'})`,
      message: `Dear ${inv.clientName}, invoice ${inv.invoiceNumber} for ${money(inv.total)} was due on ${fmt(inv.dueDate)}. Please arrange payment at your earliest convenience.`,
      daysPastDue: daysPast,
    };
  }

  // ── Client-level metrics ───────────────────────────────────────────────────

  async getClientMetrics(companyId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId },
      select: {
        clientName: true, total: true, status: true,
        dueDate: true, paidAt: true, sentAt: true, createdAt: true,
      },
    });

    const clients: Record<string, {
      name: string; totalBilled: number; totalPaid: number;
      totalOverdue: number; invoiceCount: number; paidCount: number;
      avgDaysToPay: number; totalDays: number; paidWithDays: number;
    }> = {};

    for (const inv of invoices) {
      const key = inv.clientName;
      if (!clients[key]) clients[key] = {
        name: key, totalBilled: 0, totalPaid: 0, totalOverdue: 0,
        invoiceCount: 0, paidCount: 0, avgDaysToPay: 0, totalDays: 0, paidWithDays: 0,
      };
      const c = clients[key];
      c.totalBilled += inv.total;
      c.invoiceCount += 1;

      if (inv.status === 'PAID') {
        c.totalPaid += inv.total;
        c.paidCount += 1;
        if (inv.sentAt && inv.paidAt) {
          const days = Math.floor((new Date(inv.paidAt).getTime() - new Date(inv.sentAt).getTime()) / 86400000);
          if (days >= 0) { c.totalDays += days; c.paidWithDays += 1; }
        }
      }
      if (inv.status === 'SENT' && inv.dueDate && new Date(inv.dueDate) < new Date()) {
        c.totalOverdue += inv.total;
      }
    }

    return Object.values(clients)
      .map(c => ({
        ...c,
        avgDaysToPay: c.paidWithDays > 0 ? Math.round(c.totalDays / c.paidWithDays) : null,
        collectionRate: c.totalBilled > 0 ? Math.round((c.totalPaid / c.totalBilled) * 100) : 0,
      }))
      .sort((a, b) => b.totalBilled - a.totalBilled)
      .slice(0, 10);
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

  /**
   * Billing coverage / revenue-leakage audit. Across DELIVERED, billable
   * (totalAmount > 0) waybills: how many are on an invoice vs still unbilled,
   * the unbilled value at risk, and how stale the unbilled ones are. This is the
   * "are we billing everything we delivered?" check the batch desk needs.
   * Tenant-scoped, read-only.
   */
  async getBillingCoverage(companyId: string) {
    const now = Date.now();
    const DAY = 86_400_000;
    const billableWhere = { companyId, status: 'DELIVERED' as const, totalAmount: { gt: 0 } };

    const [billedCount, unbilledAgg, unbilledList] = await Promise.all([
      this.prisma.waybill.count({ where: { ...billableWhere, invoiceItems: { some: {} } } }),
      this.prisma.waybill.aggregate({
        where: { ...billableWhere, invoiceItems: { none: {} } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.waybill.findMany({
        where: { ...billableWhere, invoiceItems: { none: {} } },
        select: { id: true, trackingNumber: true, recipientName: true, totalAmount: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest unbilled first
        take: 500,
      }),
    ]);

    const unbilledCount = unbilledAgg._count._all;
    const unbilledValue = Math.round(unbilledAgg._sum.totalAmount ?? 0);
    const billable = billedCount + unbilledCount;
    const coverageRatePct = billable ? Math.round((billedCount / billable) * 1000) / 10 : 100;

    const aging = { lt7: 0, d7_30: 0, gt30: 0 };
    const watch = unbilledList.map((w) => {
      const ageDays = Math.floor((now - new Date(w.updatedAt).getTime()) / DAY);
      if (ageDays < 7) aging.lt7 += 1;
      else if (ageDays <= 30) aging.d7_30 += 1;
      else aging.gt30 += 1;
      return {
        id: w.id,
        trackingNumber: w.trackingNumber,
        recipient: w.recipientName ?? '—',
        amount: Math.round(w.totalAmount ?? 0),
        ageDays,
      };
    }).slice(0, 10);

    return {
      billable,
      billedCount,
      unbilledCount,
      unbilledValue,
      coverageRatePct,
      aging, // computed over the oldest unbilled (capped at 500)
      watch,
      note:
        'Coverage is delivered, billable (priced) waybills already on an invoice vs still unbilled. Unbilled value is revenue delivered but not yet invoiced. Aging is from the delivery/last-update date.',
    };
  }


  // ── Auto monthly invoicing ────────────────────────────────────────────────

  /**
   * Builds one consolidated "Monthly Delivery Statement" for a single company:
   * bundles every DELIVERED waybill that has a totalAmount and isn't already on
   * an invoice into line-items, sets dueDate = +30 days, and closes the loop —
   * emits `auto-invoice-completed` to refresh finance dashboards live and logs
   * a staff notification.
   *
   * Idempotent: getUnbilledWaybills filters out waybills already on an invoice,
   * so re-running is safe. Returns the created invoice, or null if there was
   * nothing to bill.
   */
  async generateMonthlyInvoiceForCompany(company: {
    id: string;
    name: string;
    tradingName?: string | null;
  }) {
    const waybills = await this.getUnbilledWaybills(company.id);
    if (!waybills.length) return null;

    const subtotal = waybills.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
    const tax      = Math.round(subtotal * 0.15 * 100) / 100;
    const total    = Math.round((subtotal + tax) * 100) / 100;

    const count         = await this.prisma.invoice.count({ where: { companyId: company.id } });
    const year          = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    const dueDate       = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const items = waybills.map((w) => ({
      description: `Delivery ${w.trackingNumber} — ${w.recipientName ?? ''}`.trimEnd(),
      quantity:    1,
      unitPrice:   w.totalAmount ?? 0,
      total:       w.totalAmount ?? 0,
      waybillId:   w.id,
    }));

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId:     company.id,
        invoiceNumber,
        clientName:    company.tradingName ?? company.name,
        subtotal,
        tax,
        total,
        status:        'SENT',
        sentAt:        new Date(),
        dueDate,
        notes:         `Auto-generated monthly statement — ${waybills.length} deliveries`,
        items:         { create: items },
      },
      include: { items: true },
    });

    // ── Close the loop ───────────────────────────────────────────────────
    // Live-refresh the Finance dashboards (frontend listens on
    // `auto-invoice-completed`) and drop a staff notification in the bell.
    this.safeEmit(() => this.gateway.emitAutoInvoiceCompleted(company.id, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      deliveryCount: waybills.length,
    }));
    try {
      await this.prisma.notification.create({
        data: {
          companyId: company.id,
          title: `Monthly statement generated · ${invoiceNumber}`,
          body: `${waybills.length} deliveries bundled — total R${total.toFixed(2)}, due ${dueDate.toLocaleDateString('en-ZA')}.`,
          type: 'INVOICE_GENERATED',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Auto-invoice notification failed: ${err?.message ?? err}`);
    }

    return invoice;
  }

  /**
   * Platform-wide monthly cron. Runs on the 1st of every month at 02:00
   * (off-peak) and generates a statement for every active company.
   */
  @Cron('0 2 1 * *', { name: 'auto-monthly-invoicing' })
  async autoGenerateMonthlyInvoices(): Promise<{ generated: number; skipped: number }> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true, tradingName: true },
    });

    let generated = 0;
    let skipped   = 0;

    for (const company of companies) {
      try {
        const invoice = await this.generateMonthlyInvoiceForCompany(company);
        if (invoice) generated++; else skipped++;
      } catch (err: any) {
        this.logger.error(`Auto-invoice failed for company ${company.id}: ${err?.message ?? err}`);
        skipped++;
      }
    }

    return { generated, skipped };
  }

  /**
   * Tenant-scoped manual trigger — used by the "Generate now" button so an
   * admin can produce their own statement on demand without waiting for the
   * 1st. Strictly isolated to the caller's company (the platform-wide cron
   * is the only path that touches every tenant).
   */
  async autoGenerateForCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, tradingName: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const invoice = await this.generateMonthlyInvoiceForCompany(company);
    return {
      generated: invoice ? 1 : 0,
      skipped:   invoice ? 0 : 1,
      invoice:   invoice ?? null,
      message:   invoice
        ? `Statement ${invoice.invoiceNumber} created with ${invoice.items?.length ?? 0} deliveries.`
        : 'No unbilled deliveries — nothing to invoice right now.',
    };
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

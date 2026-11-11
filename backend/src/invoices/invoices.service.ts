import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, Logger, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { Money } from '../common/money.util';

import { PrismaService } from '../prisma/prisma.service';
import { classifyRow, epodState, holdReason, isBillableProof } from '../billing/proof-payment.rules';
import { EventsGateway } from '../gateway/events.gateway';
import { EmailService } from '../email/email.service';
import { PaystackService } from '../paystack/paystack.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
    private email: EmailService,
    @Inject(forwardRef(() => PaystackService)) private paystack: PaystackService,
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

  /**
   * Return a tokenised public share link for an invoice. Generates the
   * unguessable publicToken on first use (lazy), so the public portal view
   * can be opened without auth but ONLY by someone holding the token — closing
   * the previous IDOR where any invoice was viewable by id alone.
   * Tenant-scoped: only the owning company can mint/read the link.
   */
  async getShareLink(id: string, companyId: string): Promise<{ token: string; path: string }> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      select: { id: true, publicToken: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    let token = (inv as any).publicToken as string | null;
    if (!token) {
      token = randomUUID();
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { publicToken: token } as any,
      });
    }
    return { token, path: `/api/v1/portal/invoices/${inv.id}/view?token=${token}` };
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

    const subject = `Payment Reminder — ${inv.invoiceNumber} (${daysPast > 0 ? `${daysPast} days overdue` : 'due soon'})`;
    const text = `Dear ${inv.clientName}, invoice ${inv.invoiceNumber} for ${money(inv.total)} was due on ${fmt(inv.dueDate)}. Please arrange payment at your earliest convenience.`;
    const html =
      `<p>Dear ${inv.clientName ?? 'Customer'},</p>` +
      `<p>This is a friendly reminder that invoice <strong>${inv.invoiceNumber}</strong> for ` +
      `<strong>${money(inv.total)}</strong> was due on <strong>${fmt(inv.dueDate)}</strong>` +
      `${daysPast > 0 ? ` — now <strong>${daysPast} day(s) overdue</strong>` : ''}.</p>` +
      `<p>Please arrange payment at your earliest convenience. If you have already paid, kindly disregard this message.</p>` +
      `<p>Thank you.</p>`;

    // Send via SendGrid (EmailService). Degrades gracefully if SendGrid isn't
    // configured — the service logs the email instead of throwing.
    const sent = await this.email.send({ to: inv.clientEmail, subject, html, text });

    // Track the reminder timestamp regardless (so the UI reflects the attempt).
    await this.prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date() },
    });

    return {
      sent,
      to: inv.clientEmail,
      subject,
      message: sent
        ? `Reminder emailed to ${inv.clientEmail}.`
        : 'Email not sent — configure SENDGRID_API_KEY to enable delivery. Reminder logged.',
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
      select: { name: true, tradingName: true, email: true, phone: true, address: true, city: true, vatNumber: true, logoUrl: true, primaryColor: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankBranchCode: true, bankAccountType: true },
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
    ${(company as any)?.bankName ? `
    <div style="margin-bottom:16px;text-align:left;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:8px">Payment Details</div>
      <div style="font-size:13px;color:#111827;line-height:1.8">
        <strong>Bank:</strong> ${(company as any).bankName}<br/>
        ${(company as any).bankAccountHolder ? `<strong>Account Holder:</strong> ${(company as any).bankAccountHolder}<br/>` : ''}
        <strong>Account No:</strong> ${(company as any).bankAccountNumber ?? '—'}<br/>
        <strong>Branch Code:</strong> ${(company as any).bankBranchCode ?? '—'}<br/>
        ${(company as any).bankAccountType ? `<strong>Account Type:</strong> ${(company as any).bankAccountType}<br/>` : ''}
      </div>
    </div>
    ` : ''}
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

  private unbilledWaybillWhere(companyId: string) {
    return {
      companyId,
      status: 'DELIVERED',
      totalAmount: { gt: 0 },
      invoiceItem: { is: null },
      NOT: {
        electronicPods: {
          some: {
            OR: [
              { status: 'DISPUTED', disputeResolution: null },
              { status: 'DISPUTED', disputeResolution: 'UPHELD' },
            ],
          },
        },
      },
    } as any;
  }

  private readonly unbilledWaybillSelect = {
    id: true,
    trackingNumber: true,
    recipientName: true,
    recipientAddress: true,
    totalAmount: true,
    createdAt: true,
  } as const;

  private async getUnbilledWaybillPage(companyId: string, db: any, cursor?: string) {
    return db.waybill.findMany({
      where: this.unbilledWaybillWhere(companyId),
      select: this.unbilledWaybillSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /** UI preview is intentionally separate from the fully paged billing worker. */
  async getUnbilledWaybills(companyId: string) {
    return this.getUnbilledWaybillPage(companyId, this.prisma);
  }

  /**
   * Billing coverage / revenue-leakage audit. Across DELIVERED, billable
   * (totalAmount > 0) waybills: how many are on an invoice vs still unbilled,
   * the unbilled value at risk, and how stale the unbilled ones are. This is the
   * "are we billing everything we delivered?" check the batch desk needs.
   * Tenant-scoped, read-only.
   */
  /**
   * Query a prisma model defensively: lean fakes (and odd partials) without the
   * model simply contribute no rows instead of exploding the board.
   */
  private async safeFind(model: string, args: any): Promise<any[]> {
    try {
      const delegate = (this.prisma as any)[model];
      if (!delegate?.findMany) return [];
      return await delegate.findMany(args);
    } catch {
      return [];
    }
  }

  /**
   * The settle-these-first queue across every lifecycle. Each row is a hold with
   * a reason and the next action. Road: disputed ePODs. Rail: weighbridge holds
   * on tariff calculations. Nothing enters invoices until the hold clears.
   */
  async getBillingHolds(companyId: string) {
    const holds: Array<{
      mode: 'ROAD' | 'RAIL';
      ref: string;
      epodId?: string;
      counterparty: string | null;
      amount: number | null;
      reason: string;
      nextAction: string;
      since: string | null;
    }> = [];

    // ROAD — disputed ePODs that still hold the money.
    const disputedPods = await this.prisma.electronicPod.findMany({
      where: {
        companyId,
        status: 'DISPUTED',
        OR: [{ disputeResolution: null }, { disputeResolution: 'UPHELD' }],
      },
      include: {
        waybill: {
          select: {
            trackingNumber: true, totalAmount: true, senderName: true, recipientName: true, createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    for (const pod of disputedPods) {
      const upheld = pod.disputeResolution === 'UPHELD';
      holds.push({
        mode: 'ROAD',
        ref: pod.waybill?.trackingNumber ?? 'unknown',
        epodId: pod.id,
        counterparty: pod.waybill?.senderName ?? pod.waybill?.recipientName ?? null,
        amount: pod.waybill?.totalAmount ?? null,
        reason: pod.disputeReason ?? 'Proof of delivery disputed',
        nextAction: upheld
          ? 'Dispute upheld — settle with the client or issue a credit, then close the POD'
          : 'Investigate and resolve the dispute (cleared → billing flows; upheld → settle or credit)',
        since: (pod.disputeResolvedAt ?? pod.updatedAt ?? pod.createdAt)?.toISOString() ?? null,
      });
    }

    // RAIL — weighbridge holds on tariff calculations (the same principle, already built).
    const railHolds = await this.safeFind('railTariffCalculation', {
      where: { companyId, holdTriggered: true },
      include: {
        request: { select: { customerName: true, origin: true, destination: true } },
      },
      orderBy: { calculatedAt: 'asc' },
      take: 50,
    });
    for (const calc of railHolds as any[]) {
      holds.push({
        mode: 'RAIL',
        ref: calc.calculationNumber ?? calc.id,
        counterparty: calc.request?.customerName ?? null,
        amount: (calc.totalCharge as any)?.toNumber?.() ?? calc.totalCharge ?? null,
        reason: 'Weighbridge status is hold — weights unsettled',
        nextAction: 'Settle the weighbridge weights, then release the invoice draft',
        since: calc.calculatedAt?.toISOString?.() ?? null,
      });
    }

    return { holds, count: holds.length };
  }

  /**
   * Cross-lifecycle Proof & Payments board — one page that answers, for every
   * mode, the only question finance asks: is the proof in good standing, and has
   * the money followed?
   */
  async getProofBoard(companyId: string) {
    const rows: Array<{
      mode: 'ROAD' | 'RAIL' | 'SEA';
      ref: string;
      counterparty: string | null;
      proof: string;
      money: string;
      held: boolean;
      holdReason: string | null;
      amount: number | null;
    }> = [];

    // ROAD — delivered waybills + their POD state.
    const waybills = await this.prisma.waybill.findMany({
      where: { companyId, status: 'DELIVERED', totalAmount: { gt: 0 } },
      include: { electronicPods: { orderBy: { capturedAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    for (const wb of waybills) {
      const pod = wb.electronicPods?.[0];
      const state = epodState(pod ? { status: pod.status, disputeResolution: (pod as any).disputeResolution } : null);
      const held = !isBillableProof(state);
      const billed = (wb as any).invoiceItem
        ? true
        : await this.safeFind('invoiceItem', { where: { waybillId: wb.id }, take: 1 }).then((r) => r.length > 0);
      const cls = classifyRow({ billed, proofHeld: held, holdReason: holdReason(state) });
      rows.push({
        mode: 'ROAD',
        ref: wb.trackingNumber,
        counterparty: wb.senderName ?? wb.recipientName ?? null,
        proof: state,
        money: cls.money,
        held: cls.held,
        holdReason: cls.holdReason,
        amount: wb.totalAmount,
      });
    }

    // RAIL — tariff calculations: proof = weighbridge/manifest, money = draft/hold.
    const railCalcs = await this.safeFind('railTariffCalculation', {
      where: { companyId },
      include: { request: { select: { customerName: true } } },
      orderBy: { calculatedAt: 'desc' },
      take: 15,
    });
    for (const calc of railCalcs as any[]) {
      const cls = classifyRow({
        billed: !!calc.invoiceDraftId,
        proofHeld: !!calc.holdTriggered,
        holdReason: calc.holdTriggered ? 'Weighbridge status is hold — weights unsettled' : null,
      });
      rows.push({
        mode: 'RAIL',
        ref: calc.calculationNumber ?? calc.id,
        counterparty: calc.request?.customerName ?? null,
        proof: calc.holdTriggered ? 'HELD' : 'VERIFIED',
        money: cls.money,
        held: cls.held,
        holdReason: cls.holdReason,
        amount: (calc.totalCharge as any)?.toNumber?.() ?? calc.totalCharge ?? null,
      });
    }

    // SEA — shipment files: proof = file progress (DELIVERED = proof done), money = charges → draft.
    const files = await this.safeFind('shipmentFile', {
      where: { companyId, fileStatus: { in: ['DELIVERED', 'DEPARTED', 'ARRIVED', 'CUSTOMS_CLEARED'] } },
      include: { charges: { select: { amount: true, chargeType: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });
    for (const file of files as any[]) {
      const sellTotal = (file.charges ?? [])
        .filter((c: any) => c.chargeType === 'SELL')
        .reduce((sum: number, c: any) => sum + Number((c.amount as any)?.toNumber?.() ?? c.amount ?? 0), 0);
      const cls = classifyRow({ billed: !!file.invoiceId, proofHeld: false });
      rows.push({
        mode: 'SEA',
        ref: file.fileNumber ?? file.id,
        counterparty: file.customerName ?? file.consigneeName ?? null,
        proof: file.fileStatus === 'DELIVERED' ? 'VERIFIED' : 'CAPTURED',
        money: cls.money,
        held: false,
        holdReason: null,
        amount: sellTotal || null,
      });
    }

    return { rows, count: rows.length };
  }

  async getBillingCoverage(companyId: string) {
    const now = Date.now();
    const DAY = 86_400_000;
    const billableWhere = { companyId, status: 'DELIVERED' as const, totalAmount: { gt: 0 } };
    // A disputed proof is an argument, not missing revenue — excluded here and
    // surfaced separately as `heldForDispute`.
    const notHeldPod = {
      NOT: {
        electronicPods: {
          some: {
            OR: [
              { status: 'DISPUTED', disputeResolution: null },
              { status: 'DISPUTED', disputeResolution: 'UPHELD' },
            ],
          },
        },
      },
    } as any;

    const [billedCount, unbilledAgg, unbilledList, heldAgg] = await Promise.all([
      this.prisma.waybill.count({ where: { ...billableWhere, invoiceItem: { isNot: null } } }),
      this.prisma.waybill.aggregate({
        where: { ...billableWhere, ...notHeldPod, invoiceItem: { is: null } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.waybill.findMany({
        where: { ...billableWhere, ...notHeldPod, invoiceItem: { is: null } },
        select: { id: true, trackingNumber: true, recipientName: true, totalAmount: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest unbilled first
        take: 500,
      }),
      this.prisma.waybill.aggregate({
        where: {
          ...billableWhere,
          invoiceItem: { is: null },
          electronicPods: {
            some: {
              OR: [
                { status: 'DISPUTED', disputeResolution: null },
                { status: 'DISPUTED', disputeResolution: 'UPHELD' },
              ],
            },
          },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
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
      heldForDispute: {
        count: heldAgg._count._all,
        value: Math.round(heldAgg._sum.totalAmount ?? 0),
      },
      note:
        'Coverage is delivered, billable (priced) waybills already on an invoice vs still unbilled. Unbilled value is revenue delivered but not yet invoiced. Waybills with a disputed POD are counted under heldForDispute (proof gates payment) — not as missing revenue. Aging is from the delivery/last-update date.',
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
   * Idempotent under a tenant-scoped transaction lock and a unique waybill-line
   * constraint. Candidates are cursor-paged in 500-row chunks; the database
   * transaction has a 180-second hard limit and rolls back as a whole on error.
   */
  private async lockInvoiceSequence(tx: any, companyId: string) {
    // A transaction-scoped advisory lock serializes every invoice-number
    // allocation and monthly bill run for this tenant across API replicas.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(641902, hashtext(${companyId}))`;
  }

  private async nextInvoiceNumber(tx: any, companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await tx.$queryRaw<Array<{ lastNumber: number | bigint }>>`
      SELECT COALESCE(MAX(
        CASE
          WHEN split_part("invoiceNumber", '-', 3) ~ '^[0-9]+$'
          THEN split_part("invoiceNumber", '-', 3)::bigint
          ELSE NULL
        END
      ), 0)::bigint AS "lastNumber"
      FROM "invoices"
      WHERE "companyId" = ${companyId}
        AND "invoiceNumber" LIKE ${`INV-${year}-%`}
    `;
    const lastNumber = Number(rows?.[0]?.lastNumber ?? 0);
    if (!Number.isSafeInteger(lastNumber) || lastNumber < 0 || lastNumber >= Number.MAX_SAFE_INTEGER) {
      throw new InternalServerErrorException('Invoice number sequence is invalid');
    }
    return `INV-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
  }

  async generateMonthlyInvoiceForCompany(company: {
    id: string;
    name: string;
    tradingName?: string | null;
  }) {
    // withTenant, not a bare $transaction: every statement in this block concerns
    // one company, and RLS then enforces that regardless of the filters.
    const generated = await this.prisma.withTenant(company.id, async (tx: any) => {
      await this.lockInvoiceSequence(tx, company.id);
      let page = await this.getUnbilledWaybillPage(company.id, tx);
      if (!page.length) return null;

      const invoiceNumber = await this.nextInvoiceNumber(tx, company.id);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          invoiceNumber,
          clientName: company.tradingName ?? company.name,
          subtotal: 0,
          tax: 0,
          total: 0,
          status: 'SENT',
          sentAt: new Date(),
          dueDate,
          notes: 'Auto-generated monthly statement — preparing delivery lines',
        },
      });

      let deliveryCount = 0;
      let subtotal = 0;
      let cursor: string | undefined;
      const persistPage = async (rows: any[]) => {
        await tx.invoiceItem.createMany({
          data: rows.map((w) => ({
            description: `Delivery ${w.trackingNumber} — ${w.recipientName ?? ''}`.trimEnd(),
            quantity: 1,
            unitPrice: w.totalAmount,
            total: w.totalAmount,
            invoiceId: invoice.id,
            waybillId: w.id,
          })),
        });
        subtotal = Money.add(subtotal, Money.sum(rows.map((w) => w.totalAmount)));
        deliveryCount += rows.length;
        cursor = rows[rows.length - 1].id;
      };

      while (page.length) {
        await persistPage(page);
        if (page.length < 500) break;
        page = await this.getUnbilledWaybillPage(company.id, tx, cursor);
      }

      const tax = Money.percent(subtotal, 15); // SA VAT 15%
      const total = Money.add(subtotal, tax);
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          tax,
          total,
          notes: `Auto-generated monthly statement — ${deliveryCount} deliveries`,
        },
      });
      return { invoice: updatedInvoice, deliveryCount, total, dueDate };
    }, { maxWait: 10_000, timeout: 180_000 });
    if (!generated) return null;

    const { invoice, deliveryCount, total, dueDate } = generated;
    this.safeEmit(() => this.gateway.emitAutoInvoiceCompleted(company.id, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      deliveryCount,
    }));
    try {
      await this.prisma.notification.create({
        data: {
          companyId: company.id,
          title: `Monthly statement generated · ${invoice.invoiceNumber}`,
          body: `${deliveryCount} deliveries bundled — total R${total.toFixed(2)}, due ${dueDate.toLocaleDateString('en-ZA')}.`,
          type: 'INVOICE_GENERATED',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Auto-invoice notification failed: ${err?.message ?? err}`);
    }

    return { ...invoice, deliveryCount };
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
        ? `Statement ${invoice.invoiceNumber} created with ${invoice.deliveryCount} deliveries.`
        : 'No unbilled deliveries — nothing to invoice right now.',
    };
  }

  async create(companyId: string, dto: any) {
    const input = dto && typeof dto === 'object' && !Array.isArray(dto) ? dto : {};
    const { items, taxRate: rawVatRate } = input;
    const clientName = typeof input.clientName === 'string' ? input.clientName.trim() : '';
    if (!clientName) throw new BadRequestException('Client name is required');

    let clientEmail: string | undefined;
    if (input.clientEmail != null) {
      if (typeof input.clientEmail !== 'string') throw new BadRequestException('Client email must be a string');
      clientEmail = input.clientEmail.trim() || undefined;
    }

    let notes: string | undefined;
    if (input.notes != null) {
      if (typeof input.notes !== 'string') throw new BadRequestException('Invoice notes must be a string');
      notes = input.notes;
    }

    let dueDate: Date | undefined;
    if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
      if (typeof input.dueDate !== 'string' && !(input.dueDate instanceof Date)) {
        throw new BadRequestException('Invoice due date must be a valid date');
      }
      dueDate = new Date(input.dueDate);
      if (!Number.isFinite(dueDate.getTime())) {
        throw new BadRequestException('Invoice due date must be a valid date');
      }
    }

    // SERVER-AUTHORITATIVE TOTALS. Build the database write from an explicit
    // allowlist: never spread caller fields such as status, paidAt, publicToken,
    // timestamps, invoiceNumber, tenant IDs, or client-supplied totals.
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('An invoice must contain at least one line item');
    }
    const line = items.map((it: any) => {
      const description = typeof it?.description === 'string' ? it.description.trim() : '';
      const quantity = Number(it?.quantity ?? 1);
      const unitPrice = Number(it?.unitPrice ?? 0);
      if (!description || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new BadRequestException('Invoice items require a description and a positive integer quantity');
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException('Invoice item unitPrice must be a non-negative number');
      }
      let waybillId: string | undefined;
      if (it?.waybillId != null && it.waybillId !== '') {
        if (typeof it.waybillId !== 'string') {
          throw new BadRequestException('Invoice item waybillId must be a string');
        }
        waybillId = it.waybillId.trim() || undefined;
      }
      return {
        description,
        quantity,
        unitPrice,
        total: Money.multiply(unitPrice, quantity),
        ...(waybillId ? { waybillId } : {}),
      };
    });
    const waybillIds = line.map((item: any) => item.waybillId).filter(Boolean);
    if (new Set(waybillIds).size !== waybillIds.length) {
      throw new BadRequestException('A waybill can only appear once on an invoice');
    }

    const subtotal = Money.sum(line.map((it: any) => it.total));
    const vatRate = rawVatRate === undefined ? 15 : Number(rawVatRate);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      throw new BadRequestException('VAT rate must be between 0 and 100 percent');
    }
    const tax = Money.percent(subtotal, vatRate);
    const total = Money.add(subtotal, tax);

    return this.prisma.$transaction(async (tx: any) => {
      await this.lockInvoiceSequence(tx, companyId);
      if (waybillIds.length) {
        const eligible = await tx.waybill.findMany({
          where: { companyId, id: { in: waybillIds }, invoiceItem: { is: null } },
          select: { id: true },
        });
        if (eligible.length !== waybillIds.length) {
          throw new BadRequestException('Every linked waybill must be unbilled and belong to this company');
        }
      }

      const invoiceNumber = await this.nextInvoiceNumber(tx, companyId);
      return tx.invoice.create({
        data: {
          clientName,
          ...(clientEmail ? { clientEmail } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(notes !== undefined ? { notes } : {}),
          invoiceNumber,
          companyId,
          subtotal,
          tax,
          total,
          items: { create: line },
        },
        include: { items: true },
      });
    });
  }

  async update(id: string, companyId: string, dto: any) {
    const invoice = await this.findOne(id, companyId);
    const input = dto && typeof dto === 'object' && !Array.isArray(dto) ? dto : {};

    // The current PATCH caller only marks a draft as sent. Payment, totals,
    // identity, share tokens, and timestamps have dedicated server-side flows
    // and must never be writable through a generic Prisma data spread.
    if (input.status !== 'SENT') {
      throw new BadRequestException('Invoices may only be marked SENT here; use the payment approval flow to record payment');
    }
    if (invoice.status === 'SENT') return invoice;
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(`A ${invoice.status} invoice cannot be marked SENT`);
    }

    const result = await this.prisma.invoice.updateMany({
      where: { id, companyId, status: 'DRAFT' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (result.count === 1) return this.findOne(id, companyId);

    // Another request changed the invoice after the initial read. Treat an
    // already-sent invoice as idempotent; never overwrite a concurrent payment
    // or cancellation.
    const current = await this.findOne(id, companyId);
    if (current.status === 'SENT') return current;
    throw new BadRequestException(`A ${current.status} invoice cannot be marked SENT`);
  }

  // Initiate Paystack payment for an invoice (returns redirect URL)
  async initiatePay(id: string, companyId: string) {
    const inv = await this.findOne(id, companyId);

    if (inv.status === 'PAID') return { invoiceId: id, message: 'Invoice already paid' };

    // Get client email from the invoice
    const email = inv.clientEmail || `billing+${inv.invoiceNumber}@flowop.work`;
    const appUrl = process.env.APP_URL || 'https://app.flowop.work';

    const result = await this.paystack.initializePayment({
      email,
      amount: Money.toCents(inv.total), // Paystack uses cents/kobo (exact)
      companyId,
      invoiceId: id,
      description: `Invoice ${inv.invoiceNumber} — ${inv.clientName}`,
      callbackUrl: `${appUrl}/invoices?paid=${id}`,
      metadata: { invoiceNumber: inv.invoiceNumber, clientName: inv.clientName },
    });

    return { invoiceId: id, ...result };
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

    // Validate the payment amount against the invoice total. Previously any
    // client-supplied amount (or none) was stored verbatim, so a R10 payment
    // could mark a R10,000 invoice fully PAID. Default to the invoice total;
    // if an explicit amount is given it must be positive and must not exceed
    // the total by more than a 1-cent rounding tolerance.
    const amount = dto.amount !== undefined ? Money.round(dto.amount) : Money.round(inv.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be a positive number');
    }
    // Exact cent comparison — no float tolerance fudge needed.
    if (Money.isGreater(amount, inv.total)) {
      throw new BadRequestException(
        `Payment amount (R${amount.toFixed(2)}) exceeds the invoice total (R${Money.round(inv.total).toFixed(2)}).`,
      );
    }

    // Create an audit-trail payment record
    await this.prisma.payment.create({
      data: {
        reference: `MANUAL-${Date.now()}-${id.slice(-6)}`,
        status: 'SUCCESS',
        amount,
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

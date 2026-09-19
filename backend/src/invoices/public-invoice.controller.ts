import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Public invoice view — allows clients to view/print invoices from the
 * customer portal without authentication. Access requires the invoice's
 * unguessable share token.
 */
@ApiTags('Public Invoice')
@Public()
@Controller('portal/invoices')
export class PublicInvoiceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/view')
  async viewInvoice(@Param('id') id: string, @Query('token') token: string, @Res() res: any) {
    if (!token || token.length > 128) throw new NotFoundException('Invoice not found');

    const inv = await this.prisma.invoice.findFirst({
      where: { id, publicToken: token },
      include: { items: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    const company = await this.prisma.company.findUnique({
      where: { id: inv.companyId },
      select: { name: true, tradingName: true, email: true, phone: true, vatNumber: true, primaryColor: true },
    });

    // Every database value inserted into this HTML must be escaped. A share
    // token is not authentication for stored-XSS: invoice/client fields remain
    // tenant-controlled and could otherwise execute in a recipient's browser.
    const escapeHtml = (value: unknown): string => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const fmt = (v?: number | null) =>
      `ZAR ${(v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d?: string | Date | null) =>
      d ? new Date(d).toLocaleDateString('en-ZA') : '—';

    // Only allow a conservative CSS colour format; never interpolate an
    // arbitrary tenant value into the document stylesheet.
    const accent = /^#[0-9a-fA-F]{6}$/.test(company?.primaryColor ?? '')
      ? company!.primaryColor!
      : '#10b981';
    const accentSafe = escapeHtml(accent);
    const rows = (inv.items ?? []).map((it: any) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(it.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(it.quantity)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(fmt(it.unitPrice))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${escapeHtml(fmt(it.total))}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,sans-serif;color:#111827;background:#fff;padding:40px;max-width:800px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .brand-name{font-size:24px;font-weight:900;color:${accentSafe}}
  .brand-sub{font-size:12px;color:#6b7280;margin-top:2px}
  .inv-title{font-size:32px;font-weight:900;color:#111827}
  .inv-meta{font-size:13px;color:#6b7280;margin-top:4px}
  .section{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:32px 0}
  .label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
  .value{font-size:14px;color:#111827}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${accentSafe}22;color:${accentSafe};border:1px solid ${accentSafe}55}
  table{width:100%;border-collapse:collapse;margin:24px 0;font-size:13px}
  thead{background:#f9fafb}
  th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}
  th:last-child,td:last-child{text-align:right}
  .totals{margin-left:auto;width:260px;font-size:13px}
  .totals tr td:first-child{color:#6b7280;padding:4px 0}
  .totals tr td:last-child{text-align:right;font-weight:600;padding:4px 0 4px 16px}
  .totals .grand td{font-size:16px;font-weight:900;padding-top:12px;border-top:2px solid #e5e7eb}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
  .actions{text-align:center;margin-top:24px;padding:16px;background:#f9fafb;border-radius:12px}
  @media print{body{padding:20px}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div>
      <div class="brand-name">${escapeHtml(company?.tradingName ?? company?.name ?? 'FlowOps')}</div>
      <div class="brand-sub">${escapeHtml(company?.email ?? '')}${company?.phone ? ' · ' + escapeHtml(company.phone) : ''}</div>
      ${company?.vatNumber ? `<div class="brand-sub">VAT: ${escapeHtml(company.vatNumber)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">${escapeHtml(inv.invoiceNumber)}</div>
      <div style="margin-top:8px"><span class="badge">${escapeHtml(inv.status)}</span></div>
    </div>
  </div>
  <div class="section">
    <div>
      <div class="label">Bill To</div>
      <div class="value" style="font-weight:700">${escapeHtml(inv.clientName)}</div>
      ${inv.clientEmail ? `<div class="value" style="color:#6b7280">${escapeHtml(inv.clientEmail)}</div>` : ''}
    </div>
    <div>
      <div class="label">Invoice Details</div>
      <div class="value">Date: ${escapeHtml(fmtDate(inv.createdAt))}</div>
      ${inv.dueDate ? `<div class="value">Due: ${escapeHtml(fmtDate(inv.dueDate))}</div>` : ''}
      ${inv.paidAt ? `<div class="value" style="color:#10b981;font-weight:600">Paid: ${escapeHtml(fmtDate(inv.paidAt))}</div>` : ''}
    </div>
  </div>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" style="padding:16px;color:#9ca3af;text-align:center">No line items</td></tr>'}</tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td>${escapeHtml(fmt(inv.subtotal))}</td></tr>
    <tr><td>VAT</td><td>${escapeHtml(fmt(inv.tax))}</td></tr>
    <tr class="grand"><td>Total</td><td>${escapeHtml(fmt(inv.total))}</td></tr>
  </table>
  <div class="footer">Thank you for your business. Reference <strong>${escapeHtml(inv.invoiceNumber)}</strong> when making payment.</div>
  <div class="actions no-print">Use your browser's print function to save this invoice as PDF.</div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'");
    res.send(html);
  }
}

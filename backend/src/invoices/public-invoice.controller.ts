import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { escapeHtml, safeCssColor, safeHexForSuffix } from '../common/security/html.util';

/**
 * Public invoice view — allows clients to view/print invoices from the
 * customer portal without authentication. Accessed by invoice ID.
 * Renders the same branded HTML used by the internal print endpoint.
 */
@ApiTags('Public Invoice')
@Public()
@Controller('portal/invoices')
export class PublicInvoiceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/view')
  async viewInvoice(@Param('id') id: string, @Query('token') token: string, @Res() res: any) {
    // Require an unguessable token that matches this invoice. This closes the
    // previous IDOR where anyone could view any invoice (client name, email,
    // amounts, company banking details) by its id alone. The share link the
    // tenant generates includes ?token=<publicToken>.
    if (!token) throw new NotFoundException('Invoice not found');
    const inv = await this.prisma.invoice.findFirst({
      where: { id, publicToken: token },
      include: { items: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    const company = await this.prisma.company.findUnique({
      where: { id: inv.companyId },
      select: { name: true, tradingName: true, email: true, phone: true, address: true, city: true, vatNumber: true, logoUrl: true, primaryColor: true },
    });

    // Coerce to Number first: toLocaleString on a string returns that string
    // unchanged, so a non-numeric value would be interpolated verbatim.
    const esc = escapeHtml;
    const fmt = (v?: number | null) =>
      `ZAR ${Number(v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d?: string | Date | null) =>
      d ? new Date(d).toLocaleDateString('en-ZA') : '—';

    // Tenant-controlled colour, interpolated into CSS: must be a plain colour
    // value — `red;background:url(...)` would break out of the rule.
    const accent = safeCssColor(company?.primaryColor);
    const accentHex = safeHexForSuffix(company?.primaryColor);
    const rows = (inv.items ?? []).map((it: any) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${esc(it.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${esc(it.quantity)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(it.unitPrice)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(it.total)}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(inv.invoiceNumber)}</title>
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
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#${accentHex}22;color:${accent};border:1px solid #${accentHex}55}
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
  .actions a{display:inline-block;padding:10px 24px;background:${accent};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px}
  @media print{body{padding:20px}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div>
      <div class="brand-name">${esc(company?.tradingName ?? company?.name ?? 'FlowOps')}</div>
      <div class="brand-sub">${esc(company?.email ?? '')}${company?.phone ? ' · ' + esc(company.phone) : ''}</div>
      ${company?.vatNumber ? `<div class="brand-sub">VAT: ${esc(company.vatNumber)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">${esc(inv.invoiceNumber)}</div>
      <div style="margin-top:8px"><span class="badge">${esc(inv.status)}</span></div>
    </div>
  </div>
  <div class="section">
    <div>
      <div class="label">Bill To</div>
      <div class="value" style="font-weight:700">${esc(inv.clientName)}</div>
      ${inv.clientEmail ? `<div class="value" style="color:#6b7280">${esc(inv.clientEmail)}</div>` : ''}
    </div>
    <div>
      <div class="label">Invoice Details</div>
      <div class="value">Date: ${fmtDate(inv.createdAt)}</div>
      ${inv.dueDate ? `<div class="value">Due: ${fmtDate(inv.dueDate)}</div>` : ''}
      ${inv.paidAt ? `<div class="value" style="color:#10b981;font-weight:600">Paid: ${fmtDate(inv.paidAt)}</div>` : ''}
    </div>
  </div>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" style="padding:16px;color:#9ca3af;text-align:center">No line items</td></tr>'}</tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td>${fmt(inv.subtotal)}</td></tr>
    <tr><td>VAT (15%)</td><td>${fmt(inv.tax)}</td></tr>
    <tr class="grand"><td>Total</td><td>${fmt(inv.total)}</td></tr>
  </table>
  <div class="footer">Thank you for your business. Reference <strong>${esc(inv.invoiceNumber)}</strong> when making payment.</div>
  <div class="actions no-print">
    <a href="javascript:window.print()">Download / Print PDF</a>
  </div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

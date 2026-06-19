import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller()
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get('invoices')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('invoices/supervisor')
  getSupervisorView(@CurrentUser() u: any) {
    return this.svc.getSupervisorView(u.companyId);
  }

  @Get('invoices/metrics')
  getMetrics(@CurrentUser() u: any) {
    return this.svc.getMetrics(u.companyId);
  }

  @Post('invoices')
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  /**
   * GET /api/v1/invoices/ar-aging
   * Returns outstanding invoices grouped into aging buckets:
   * Current (not yet due), 1–30 days, 31–60, 61–90, 90+ days overdue.
   * Standard AR Aging Report used by QuickBooks, NetSuite, Xero.
   */
  @Get('invoices/ar-aging')
  getArAging(@CurrentUser() u: any) {
    return this.svc.getArAging(u.companyId);
  }

  /**
   * GET /api/v1/invoices/revenue-trend
   * Returns monthly revenue totals for the last 6 months (billed + collected).
   * Powers the Finance Command Center trend chart.
   */
  @Get('invoices/revenue-trend')
  getRevenueTrend(@CurrentUser() u: any) {
    return this.svc.getRevenueTrend(u.companyId);
  }

  /**
   * POST /api/v1/invoices/:id/send-reminder
   * Sends a payment reminder email to the client for an overdue invoice.
   */
  @Post('invoices/:id/send-reminder')
  @HttpCode(HttpStatus.OK)
  sendReminder(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.sendPaymentReminder(id, u.companyId);
  }

  /**
   * GET /api/v1/invoices/client-metrics
   * Returns per-client summary: total billed, paid, overdue, avg days to pay.
   * Powers the "Top Clients" finance analytics.
   */
  @Get('invoices/client-metrics')
  getClientMetrics(@CurrentUser() u: any) {
    return this.svc.getClientMetrics(u.companyId);
  }

  /**
   * GET /api/v1/invoices/unbilled-waybills
   *
   * Returns DELIVERED waybills that have a totalAmount and have not yet been
   * added to any invoice. The Billing Batches → Generate modal uses this so
   * dispatchers only see deliveries that still need to be billed.
   */
  @Get('invoices/unbilled-waybills')
  getUnbilledWaybills(@CurrentUser() u: any) {
    return this.svc.getUnbilledWaybills(u.companyId);
  }

  @Get('invoices/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  /**
   * GET /api/v1/invoices/:id/print-html
   * Returns a self-contained, print-optimised HTML page for the invoice.
   * Open in a new browser tab and call window.print() to get a PDF.
   */
  @Get('invoices/:id/print-html')
  async printHtml(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Res() res: any,
  ) {
    const html = await this.svc.generateInvoiceHtml(id, u.companyId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Patch('invoices/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Post('invoices/:id/pay')
  initiatePay(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.initiatePay(id, u.companyId);
  }

  /**
   * POST /api/v1/invoices/:id/mark-paid
   *
   * Manual payment approval — no Paystack required.
   * Click this "Approve" button when you've confirmed payment outside
   * the system (cash, EFT, bank transfer, etc.).
   *
   * Body (all optional):
   *   { "note": "EFT received 12 Jun", "paidBy": "John Smith", "amount": 14999 }
   */
  @Post('invoices/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.markPaid(id, u.companyId, {
      note: body?.note,
      paidBy: body?.paidBy,
      amount: body?.amount,
    });
  }

  /**
   * GET /api/v1/invoices/pending-payment
   *
   * Returns all SENT and OVERDUE invoices — the approval queue.
   * Drive the "Approve payment" button list from this endpoint.
   */
  @Get('invoices/pending-payment')
  getPendingPayment(@CurrentUser() u: any) {
    return this.svc.getPendingPayment(u.companyId);
  }

  @Get('invoice-drafts')
  findDrafts(@CurrentUser() u: any) {
    return this.svc.findDrafts(u.companyId);
  }

  @Get('invoice-drafts/:id')
  findDraft(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findDraft(id, u.companyId);
  }

  @Get('invoice-drafts/:id/assist')
  getDraftAssist(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getDraftAssist(id, u.companyId);
  }

  @Post('invoice-drafts/:id/finalize')
  finalizeDraft(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.finalizeDraft(id, u.companyId);
  }
}

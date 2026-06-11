import { Controller, Get, Post, Param, Body, Req, ParseIntPipe, Res, UseGuards, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * 📋 LIST OFFICIAL INVOICES (With Filtering)
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string
  ) {
    const companyId = Number(req.user.companyId);
    
    if (status || overdue === 'true') {
      return this.billingService.findFilteredInvoices(companyId, {
        status,
        overdue: overdue === 'true'
      });
    }

    return this.prisma.invoice.findMany({
      where: { companyId },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 📊 REVENUE SNAPSHOT
   */
  @Get('metrics')
  async getMetrics(@Req() req: any) {
    return this.billingService.getRevenueMetrics(req.user.companyId);
  }

  /**
   * 📥 DOWNLOAD FINAL TAX INVOICE PDF
   */
  @Get(':id/pdf')
  async getFinalInvoicePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response
  ) {
    return this.billingService.generateFinalInvoicePdf(id, res);
  }

  /**
   * 💸 RECORD SETTLEMENT
   */
  @Post(':id/pay')
  async settleInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() paymentData: { paymentRef: string; amountPaid: number; notes?: string }
  ) {
    return this.billingService.recordPayment(id, paymentData);
  }
}

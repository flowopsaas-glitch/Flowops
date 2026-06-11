import { Controller, Param, Post, Query } from '@nestjs/common';
import { MonthlyInvoicingService } from './monthly-invoicing.service';

@Controller('invoices')
export class MonthlyInvoicingController {
  constructor(private readonly monthly: MonthlyInvoicingService) {}

  /**
   * POST /api/invoices/monthly/:companyId?month=YYYY-MM&sellerCompanyId=1&vatRate=0.15
   */
  @Post('monthly/:companyId')
  async generateMonthly(
    @Param('companyId') companyId: string,
    @Query('month') month?: string,
    @Query('sellerCompanyId') sellerCompanyId?: string,
    @Query('vatRate') vatRate?: string,
  ) {
    const buyerCompanyId = Number(companyId);
    const sellerId = Number(sellerCompanyId || 1);

    return this.monthly.generateMonthlyInvoice({
      buyerCompanyId,
      sellerCompanyId: sellerId,
      month: month || undefined,
      vatRate: vatRate ? Number(vatRate) : undefined,
    });
  }
}
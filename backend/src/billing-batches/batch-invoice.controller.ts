import { Controller, Get, Post, Param, Res, Query, ParseIntPipe, NotFoundException, Body } from '@nestjs/common';
import { Response } from 'express';
import { BatchInvoiceService } from './batch-invoice.service';

@Controller('billing-batches')
export class BatchInvoiceController {
  constructor(private readonly batchInvoiceService: BatchInvoiceService) {}

  @Post(':id/generate-invoice')
  async generateInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body('sendEmail') sendEmail?: boolean
  ) {
    return this.batchInvoiceService.generateInvoiceFromBatch(id, sendEmail || false);
  }

  @Get('invoices')
  async listInvoices(@Query('companyId') companyId?: string) {
    return this.batchInvoiceService.listInvoices(companyId ? Number(companyId) : undefined);
  }

  @Get('invoices/:id')
  async getInvoice(@Param('id') id: string) {
    return this.batchInvoiceService.getInvoice(id);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoicePdf(@Param('id') id: string, @Res() res: Response) {
    try {
      await this.batchInvoiceService.generateInvoicePdf(id, res);
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Failed to generate PDF' });
      }
    }
  }

  @Post('invoices/:id/send-email')
  async sendInvoiceEmail(@Param('id') id: string) {
    return this.batchInvoiceService.sendInvoiceEmail(id);
  }

  @Post('invoices/:id/mark-paid')
  async markAsPaid(
    @Param('id') id: string,
    @Query('method') method?: string,
    @Query('reference') reference?: string
  ) {
    return this.batchInvoiceService.markAsPaid(id, method, reference);
  }
}

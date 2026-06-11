import { 
  Body, 
  Controller, 
  Get, 
  Param, 
  ParseIntPipe,
  Post, 
  Res, 
  NotFoundException 
} from "@nestjs/common";
import { BillingBatchesService } from "./billing-batches.service";
import { InvoiceGeneratorService } from "./invoice-generator.service";
import { Response } from 'express';

@Controller("billing-batches")
export class BillingBatchesController {
  constructor(
    private readonly billingBatchesService: BillingBatchesService,
    private readonly invoiceGeneratorService: InvoiceGeneratorService
  ) {}

  @Get()
  async getBillingBatches() {
    return this.billingBatchesService.getBillingBatches();
  }

  @Post("sweep")
  async sweepCompletedJobs() {
    return this.billingBatchesService.sweepCompletedJobs();
  }

  @Get(":id/pdf")
  async downloadPdf(@Param("id", ParseIntPipe) id: number, @Res() res: Response) {
    const batch = await this.billingBatchesService.getBillingBatchById(id);
    
    if (!batch) {
      throw new NotFoundException(`Batch #${id} not found`);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-Batch-${id}.pdf`);

    return this.invoiceGeneratorService.generateInvoicePdf(batch, res);
  }

  @Post(":id/reprice")
  async reprice(@Param("id") id: string) {
    return this.billingBatchesService.repriceBatch(Number(id));
  }

  @Get(":id")
  async getBillingBatchById(@Param("id", ParseIntPipe) id: number) {
    return this.billingBatchesService.getBillingBatchById(id);
  }

  @Post(":id/generate-invoices")
  async generateInvoicesForBatch(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: any
  ) {
    return this.billingBatchesService.generateInvoicesForBatch(id, body);
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { MonthlyInvoicingService } from './monthly-invoicing.service';
import { MonthlyInvoicingController } from './monthly-invoicing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InvoicesController, MonthlyInvoicingController],
  providers: [InvoicePdfService, InvoicesService, MonthlyInvoicingService],
  exports: [InvoicesService, MonthlyInvoicingService],
})
export class InvoicesModule {}
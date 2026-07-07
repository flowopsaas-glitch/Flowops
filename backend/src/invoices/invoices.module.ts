import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PublicInvoiceController } from './public-invoice.controller';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [InvoicesController, PublicInvoiceController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

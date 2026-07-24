import { Module, forwardRef } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PublicInvoiceController } from './public-invoice.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { PaystackModule } from '../paystack/paystack.module';

@Module({
  imports: [GatewayModule, forwardRef(() => PaystackModule)],
  controllers: [InvoicesController, PublicInvoiceController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

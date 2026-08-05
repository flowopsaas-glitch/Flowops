import { Module } from '@nestjs/common';
import { AccountingIntegrationsController } from './accounting-integrations.controller';
import { AccountingIntegrationsService } from './accounting-integrations.service';
import { XeroProvider } from './providers/xero.provider';
import { SageProvider } from './providers/sage.provider';
import { PastelProvider } from './providers/pastel.provider';

@Module({
  controllers: [AccountingIntegrationsController],
  providers: [AccountingIntegrationsService, XeroProvider, SageProvider, PastelProvider],
  exports: [AccountingIntegrationsService],
})
export class AccountingIntegrationsModule {}

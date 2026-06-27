import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForwardingController } from './forwarding.controller';
import { ShipmentFileService } from './shipment-file.service';
import { ContainersService } from './containers.service';
import { ChargesService } from './charges.service';
import { ForwardingAiService } from './forwarding-ai.service';
import { CustomsService } from './customs.service';
import { ForwardingPdfService } from './forwarding-pdf.service';
import { CustomsDeclarationService } from './customs-declaration.service';
import { DemurrageService } from './demurrage.service';

/**
 * Freight Forwarding (import/export) — Phases 1–3.
 * BillingService is @Global (entitlement gate via freightForwarding feature).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ForwardingController],
  providers: [
    ShipmentFileService, ContainersService, ChargesService, ForwardingAiService,
    CustomsService, ForwardingPdfService, CustomsDeclarationService, DemurrageService,
  ],
  exports: [ShipmentFileService],
})
export class ForwardingModule {}

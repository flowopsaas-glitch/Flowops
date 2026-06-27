import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForwardingController } from './forwarding.controller';
import { ShipmentFileService } from './shipment-file.service';
import { ContainersService } from './containers.service';
import { ChargesService } from './charges.service';
import { ForwardingAiService } from './forwarding-ai.service';

/**
 * Freight Forwarding (import/export) — Phase 1.
 * BillingService is @Global (entitlement gate via freightForwarding feature).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ForwardingController],
  providers: [ShipmentFileService, ContainersService, ChargesService, ForwardingAiService],
  exports: [ShipmentFileService],
})
export class ForwardingModule {}

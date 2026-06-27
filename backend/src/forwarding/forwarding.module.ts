import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForwardingController } from './forwarding.controller';
import { ShipmentFileService } from './shipment-file.service';

/**
 * Freight Forwarding (import/export) — Phase 1.
 * BillingService is @Global (entitlement gate via freightForwarding feature).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ForwardingController],
  providers: [ShipmentFileService],
  exports: [ShipmentFileService],
})
export class ForwardingModule {}

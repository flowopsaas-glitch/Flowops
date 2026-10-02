import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RailController } from './rail.controller';
import { RailService } from './rail.service';
import { RailHandshakeController } from './rail-handshake.controller';
import { RailHandshakeService } from './rail-handshake.service';
import { RailSlotController } from './rail-slot.controller';
import { RailSlotService } from './rail-slot.service';

/**
 * Rail / Intermodal Operations.
 *
 * Coordination + intelligence layer above the rail network: consignment
 * lifecycle, wagon register, intermodal (road<->rail<->port) handoff tracking
 * and corridor KPIs. Additive — no changes to existing courier/forwarding
 * tables. PrismaService and BillingService are both @Global; every read/write
 * entry point is gated behind the `rail` Enterprise entitlement (like Freight
 * Forwarding) via BillingService.hasFeature().
 *
 * Wave 2 adds corridor / yard reference data, slot applications (with the Annexure 25
 * self-screening, the 60-day mobilisation clock and the corridor-envelope check) and operator
 * compliance documents. AuditService is @Global (AuditModule).
 */
@Module({
  imports: [PrismaModule],
  controllers: [RailController, RailHandshakeController, RailSlotController],
  providers: [RailService, RailHandshakeService, RailSlotService],
  exports: [RailService, RailHandshakeService, RailSlotService],
})
export class RailModule {}

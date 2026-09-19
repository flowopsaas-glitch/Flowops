import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RailController } from './rail.controller';
import { RailService } from './rail.service';
import { RailHandshakeController } from './rail-handshake.controller';
import { RailHandshakeService } from './rail-handshake.service';

/**
 * Rail / Intermodal Operations.
 *
 * Coordination + intelligence layer above the rail network: consignment
 * lifecycle, wagon register, intermodal (road<->rail<->port) handoff tracking
 * and corridor KPIs. Additive — no changes to existing courier/forwarding
 * tables. PrismaService and BillingService are both @Global; every read/write
 * entry point is gated behind the `rail` Enterprise entitlement (like Freight
 * Forwarding) via BillingService.hasFeature().
 */
@Module({
  imports: [PrismaModule],
  controllers: [RailController, RailHandshakeController],
  providers: [RailService, RailHandshakeService],
  exports: [RailService, RailHandshakeService],
})
export class RailModule {}

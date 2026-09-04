import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RailController } from './rail.controller';
import { RailService } from './rail.service';

/**
 * Rail / Intermodal Operations.
 *
 * Coordination + intelligence layer above the rail network: consignment
 * lifecycle, wagon register, intermodal (road<->rail<->port) handoff tracking
 * and corridor KPIs. Additive — no changes to existing courier/forwarding
 * tables. PrismaService is global; no entitlement gate (available to all
 * plans for the RASA demo — can be gated later via BillingService if desired).
 */
@Module({
  imports: [PrismaModule],
  controllers: [RailController],
  providers: [RailService],
  exports: [RailService],
})
export class RailModule {}

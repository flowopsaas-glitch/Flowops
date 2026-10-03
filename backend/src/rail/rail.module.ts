import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RailController } from './rail.controller';
import { RailService } from './rail.service';
import { RailHandshakeController } from './rail-handshake.controller';
import { RailHandshakeService } from './rail-handshake.service';
import { RailSlotController } from './rail-slot.controller';
import { RailSlotService } from './rail-slot.service';
import { RailChangeController } from './rail-change.controller';
import { RailChangeService } from './rail-change.service';
import { RailPossessionController } from './rail-possession.controller';
import { RailPossessionService } from './rail-possession.service';
import { RailOccurrenceController } from './rail-occurrence.controller';
import { RailOccurrenceService } from './rail-occurrence.service';
import { RailTariffController } from './rail-tariff.controller';
import { RailTariffService } from './rail-tariff.service';
import { RailWeighbridgeController } from './rail-weighbridge.controller';
import { RailWeighbridgeService } from './rail-weighbridge.service';

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
 *
 * Wave 3 adds cancel / reschedule requests (Annexure 20a/20b), possession windows with conflict
 * detection, occurrence reports and the dangerous-goods dispatch gate.
 *
 * Wave 4 adds the tariff calculator (GTK + traction energy + Annexure 40 ancillary services + the
 * weighbridge overload penalty, with an idempotent invoice draft) and weighbridge readings, whose
 * overload rule puts a consignment on HOLD_FOR_LOAD_ADJUSTMENT.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    RailController, RailHandshakeController, RailSlotController,
    RailChangeController, RailPossessionController, RailOccurrenceController, RailTariffController, RailWeighbridgeController,
  ],
  providers: [
    RailService, RailHandshakeService, RailSlotService,
    RailChangeService, RailPossessionService, RailOccurrenceService, RailTariffService, RailWeighbridgeService,
  ],
  exports: [
    RailService, RailHandshakeService, RailSlotService,
    RailChangeService, RailPossessionService, RailOccurrenceService, RailTariffService, RailWeighbridgeService,
  ],
})
export class RailModule {}

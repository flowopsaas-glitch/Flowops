import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
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
import { RailHandoffService } from './rail-handoff.service';
import { RailTimetableService } from './rail-timetable.service';
import { RailTimetableOwnerController } from './rail-timetable-owner.controller';
import { RailOptimizerController } from './rail-optimizer.controller';
import { RailOptimizerService } from './rail-optimizer.service';
import { RailTrainManifestController } from './rail-manifest.controller';
import { RailTrainManifestService } from './rail-manifest.service';
import { RailTelemetryController } from './rail-telemetry.controller';
import { RailTelemetryService } from './rail-telemetry.service';
import { RailTruckAppointmentsController } from './rail-truck-appointments.controller';
import { RailTruckAppointmentsService } from './rail-truck-appointments.service';
import { RailTruckWindowChangesController } from './rail-truck-window-changes.controller';
import { RailTruckWindowChangesService } from './rail-truck-window-changes.service';

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
 *
 * The truck-gate closed loop adds RailTruckWindowChangesService: a published
 * gate window change becomes a versioned event that supersedes the previous
 * one, is propagated to the haulier organisation AND the assigned driver over
 * the rails that already exist (socket.io company room with a transport
 * receipt, driver web-push, the notification bell, the transactional outbox and
 * the expiring share link), is acknowledged per recipient, escalates on the
 * clock, and is measured (change→ack median + P90 with n). GatewayModule,
 * NotificationsModule and PushModule are imported for that propagation — no new
 * transport is invented here.
 */
@Module({
  imports: [PrismaModule, GatewayModule, NotificationsModule, PushModule],
  controllers: [
    RailController, RailHandshakeController, RailSlotController,
    RailChangeController, RailPossessionController, RailOccurrenceController, RailTariffController, RailWeighbridgeController,
    RailTimetableOwnerController, RailOptimizerController, RailTrainManifestController, RailTelemetryController, RailTruckAppointmentsController,
    RailTruckWindowChangesController,
  ],
  providers: [
    RailService, RailHandshakeService, RailSlotService,
    RailChangeService, RailPossessionService, RailOccurrenceService, RailTariffService, RailWeighbridgeService,
    RailHandoffService, RailTimetableService, RailOptimizerService, RailTrainManifestService, RailTelemetryService, RailTruckAppointmentsService,
    RailTruckWindowChangesService,
  ],
  exports: [
    RailService, RailHandshakeService, RailSlotService,
    RailChangeService, RailPossessionService, RailOccurrenceService, RailTariffService, RailWeighbridgeService,
    RailHandoffService, RailTimetableService, RailOptimizerService, RailTrainManifestService, RailTelemetryService, RailTruckAppointmentsService,
    RailTruckWindowChangesService,
  ],
})
export class RailModule {}

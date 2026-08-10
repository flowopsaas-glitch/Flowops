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
import { VesselTrackingService } from './vessel-tracking.service';
import { AirCargoIntelligenceService } from './air-cargo-intelligence.service';
import { SadcCorridorService } from './sadc-corridor.service';
import { ConsolidationService } from './consolidation.service';
import { ForwardingOverviewService } from './forwarding-overview.service';
import { CustomsEdiCryptoService } from './customs-edi/crypto.service';
import { CustomsEdiCredentialService } from './customs-edi/customs-edi-credential.service';
import { CustomsEdiTransportFactory } from './customs-edi/customs-edi-transport.factory';
import { NullCustomsEdiTransport } from './customs-edi/transports/null.transport';
import { ClearingAgentHandoffTransport } from './customs-edi/transports/clearing-agent-handoff.transport';
import { ServiceProviderEdiTransport } from './customs-edi/transports/service-provider.transport';
import { DirectSarsEdiTransport } from './customs-edi/transports/direct-sars-edi.transport';

/**
 * Freight Forwarding (import/export) — Phases 1–3 + SARS EDI customs bridge.
 * BillingService is @Global (entitlement gate via freightForwarding feature).
 * EmailService, AuditService, ConfigService and PrismaService are all global.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ForwardingController],
  providers: [
    ShipmentFileService, ContainersService, ChargesService, ForwardingAiService,
    CustomsService, ForwardingPdfService, CustomsDeclarationService, DemurrageService,
    VesselTrackingService, AirCargoIntelligenceService, SadcCorridorService, ConsolidationService, ForwardingOverviewService,
    // SARS EDI customs bridge
    CustomsEdiCryptoService, CustomsEdiCredentialService, CustomsEdiTransportFactory,
    NullCustomsEdiTransport, ClearingAgentHandoffTransport, ServiceProviderEdiTransport,
    DirectSarsEdiTransport,
  ],
  exports: [ShipmentFileService],
})
export class ForwardingModule {}

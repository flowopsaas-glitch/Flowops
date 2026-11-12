import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { JourneysController } from './journeys.controller';
import { JourneyService } from './journey.service';

/**
 * Journeys — the WP2/WP3 driver-journey slice.
 *
 * Exported on purpose: the driver app reaches the same service through
 * DriverPortalController, so driver and dispatch operate on one implementation
 * rather than two that drift.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [JourneysController],
  providers: [JourneyService],
  exports: [JourneyService],
})
export class JourneysModule {}

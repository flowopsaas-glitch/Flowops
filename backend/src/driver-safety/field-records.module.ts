import { Module } from '@nestjs/common';
import { SafetyIncidentService } from './safety-incident.service';
import { SafetyIncidentController } from './safety-incident.controller';
import { TripDocumentService } from './trip-document.service';
import { TripDocumentController } from './trip-document.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Field records: safety incidents and trip document packs.
 *
 * Both models were added in the same migration and both exist because a screen
 * had been calling an endpoint that was never built. They are unrelated in
 * domain but share a module so the pair travels together.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SafetyIncidentController, TripDocumentController],
  providers: [SafetyIncidentService, TripDocumentService],
  exports: [SafetyIncidentService, TripDocumentService],
})
export class FieldRecordsModule {}

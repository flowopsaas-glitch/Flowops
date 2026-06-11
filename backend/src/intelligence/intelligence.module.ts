import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { UnifiedExtractionService } from './unified-extraction.service';
import { OpenAIWaybillVisionService } from '../waybills/extraction/openai-waybill-vision.service';
import { WaybillAiModule } from '../waybill-ai/waybill-ai.module';
import { SystemOverseerService } from './system-overseer.service';

/**
 * IntelligenceModule: The Command Center for FlowOps AI.
 * Now includes Claw 4 (SystemOverseer) for proactive system upgrades.
 */
@Module({
  imports: [
    PrismaModule, 
    DiscoveryModule, 
    ScheduleModule.forRoot(),
    WaybillAiModule, // Import the module instead of providing service directly
  ],
  providers: [
    UnifiedExtractionService,
    OpenAIWaybillVisionService,
    SystemOverseerService, // Claw 4
  ],
  exports: [
    UnifiedExtractionService,
    OpenAIWaybillVisionService,
    WaybillAiModule, // Export the module to make WaybillAiService available
    SystemOverseerService,
  ],
})
export class IntelligenceModule {}

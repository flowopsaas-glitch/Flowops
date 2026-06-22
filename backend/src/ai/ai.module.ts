import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CompetitiveIntelligenceService }    from './competitive-intelligence.service';
import { CompetitiveIntelligenceController } from './competitive-intelligence.controller';
import { PrismaModule }    from '../prisma/prisma.module';
import { GatewayModule }   from '../gateway/gateway.module';
import { WhatsAppModule }  from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    GatewayModule,
    // WhatsAppService is injected into AiService for notification dispatch
    WhatsAppModule,
  ],
  controllers: [
    AiController,
    CompetitiveIntelligenceController,
  ],
  providers: [
    AiService,
    CompetitiveIntelligenceService,
  ],
  exports: [AiService, CompetitiveIntelligenceService],
})
export class AiModule {}

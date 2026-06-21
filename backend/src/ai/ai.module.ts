import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiDiagnosticsController } from './ai-diagnostics.controller';
import { AiChatController } from './ai-chat.controller';
import { AiOpsController } from './ai-ops.controller';
import { AiWatchdog } from './ai.watchdog';
import { AiDevOpsService } from './ai-devops.service';
import { AiDiscoveryService } from './ai-discovery.service';
import { AiAutonomyService } from './ai-autonomy.service';
import { ClawService } from './claw.service';
import { Claw5SyncService } from './claw-5-sync.service';
import { Claw6SentinelService } from './claw-6-sentinel.service';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';
import { CompetitiveIntelligenceController } from './competitive-intelligence.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';
import { GatewayModule } from '../gateway/gateway.module';
import { AIEventsModule } from './ai-events.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    WhatsAppModule,
    EmailModule,
    GatewayModule,
    AIEventsModule,
    JwtModule.register({}),
  ],
  controllers: [
    AiController,
    AiDiagnosticsController,
    AiChatController,
    AiOpsController,
    CompetitiveIntelligenceController,
  ],
  providers: [
    AiService,
    AiWatchdog,
    AiDevOpsService,
    AiAutonomyService,
    AiDiscoveryService,
    ClawService,
    Claw5SyncService,
    Claw6SentinelService,
    CompetitiveIntelligenceService,
  ],
  exports: [
    AiService,
    AiDevOpsService,
    AiDiscoveryService,
    ClawService,
    CompetitiveIntelligenceService,
  ],
})
export class AiModule {}

import { Module }          from '@nestjs/common';
import { ScheduleModule }  from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule }       from '@nestjs/jwt';

import { AiController }               from './ai.controller';
import { AiChatController }           from './ai-chat.controller';
import { AiDiagnosticsController }    from './ai-diagnostics.controller';
import { AiEventsController }         from './ai-events.controller';
import { AiOpsController }            from './ai-ops.controller';
import { CompetitiveIntelligenceController } from './competitive-intelligence.controller';

import { AiService }                  from './ai.service';
import { AiDiscoveryService }         from './ai-discovery.service';
import { AiDevOpsService }            from './ai-devops.service';
import { AiEventsService }            from './ai-events.service';
import { AiAutonomyService }          from './ai-autonomy.service';
import { AiWatchdog }                 from './ai.watchdog';
import { ClawService }                from './claw.service';
import { ClawLogicEngine }            from './claw-logic.engine';
import { Claw5SyncService }           from './claw-5-sync.service';
import { Claw6SentinelService }       from './claw-6-sentinel.service';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';

import { PrismaModule }   from '../prisma/prisma.module';
import { GatewayModule }  from '../gateway/gateway.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

const PROVIDERS = [
  AiService, AiDiscoveryService, AiDevOpsService, AiEventsService,
  AiAutonomyService, AiWatchdog, ClawService, ClawLogicEngine,
  Claw5SyncService, Claw6SentinelService, CompetitiveIntelligenceService,
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    GatewayModule,
    WhatsAppModule,
    JwtModule.registerAsync({
      useFactory: (cfg: ConfigService) => ({ secret: cfg.get('JWT_SECRET') }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AiController, AiChatController, AiDiagnosticsController,
    AiEventsController, AiOpsController,
    CompetitiveIntelligenceController,
  ],
  providers: PROVIDERS,
  exports: PROVIDERS,
})
export class AiModule {}

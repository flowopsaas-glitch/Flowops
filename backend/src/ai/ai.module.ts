import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

// ── Route controllers ────────────────────────────────────────────────────────
import { AiController }                      from './ai.controller';
import { AiChatController }                  from './ai-chat.controller';
import { AiDiagnosticsController }           from './ai-diagnostics.controller';
import { AiEventsController }                from './ai-events.controller';
import { AiOpsController }                   from './ai-ops.controller';
import { CompetitiveIntelligenceController } from './competitive-intelligence.controller';

// ── Services / injectable providers ─────────────────────────────────────────
import { AiService }                         from './ai.service';
import { AiDiscoveryService }                from './ai-discovery.service';
import { AiDevOpsService }                   from './ai-devops.service';
import { AiAutonomyService }                 from './ai-autonomy.service';
import { AiEventsService }                   from './ai-events.service';
import { AiWatchdog }                        from './ai.watchdog';
import { ClawService }                       from './claw.service';
import { AIClawController }                  from './claw-controller';   // injectable — not a route controller
import { Claw5SyncService }                  from './claw-5-sync.service';
import { Claw6SentinelService }              from './claw-6-sentinel.service';
import { ClawLogicEngine }                   from './claw-logic.engine';
import { CompetitiveIntelligenceService }    from './competitive-intelligence.service';
import { IntegrationSentinelService }        from './integration-sentinel.service';

// ── External modules ─────────────────────────────────────────────────────────
import { PrismaModule }   from '../prisma/prisma.module';
import { GatewayModule }  from '../gateway/gateway.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { JwtModule }      from '@nestjs/jwt';
import { ConfigService }  from '@nestjs/config';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    GatewayModule,
    // WhatsAppService injected into AiService for notification dispatch
    WhatsAppModule,
    // JwtService injected into Claw6SentinelService (and possibly others)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AiController,
    AiChatController,
    AiDiagnosticsController,
    AiEventsController,
    AiOpsController,
    CompetitiveIntelligenceController,
  ],
  providers: [
    AiService,
    AiDiscoveryService,
    AiDevOpsService,
    AiAutonomyService,
    AiEventsService,
    AiWatchdog,
    ClawService,
    AIClawController,     // injectable service, not a route controller
    Claw5SyncService,
    Claw6SentinelService,
    ClawLogicEngine,
    CompetitiveIntelligenceService,
    IntegrationSentinelService,
  ],
  exports: [
    AiService,
    AiDiscoveryService,
    AiDevOpsService,
    AiEventsService,
    ClawService,
    CompetitiveIntelligenceService,
    IntegrationSentinelService,
  ],
})
export class AiModule {}

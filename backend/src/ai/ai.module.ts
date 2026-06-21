import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config'; 
import { JwtModule } from '@nestjs/jwt';

// Core AI Services
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiDiagnosticsController } from './ai-diagnostics.controller';
import { AiOpsController } from './ai-ops.controller';import { AiChatController } from './ai-chat.controller'; 
import { ClawService } from './claw.service';            
import { AiWatchdog } from './ai.watchdog';
import { AiDevOpsService } from './ai-devops.service'; 
import { AiDiscoveryService } from './ai-discovery.service';
import { AiAutonomyService } from './ai-autonomy.service';

// New specialized Claws
import { Claw5SyncService } from './claw-5-sync.service';
import { Claw6SentinelService } from './claw-6-sentinel.service';

// External Module Dependencies
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module'; 
import { AIEventsModule } from './ai-events.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule, 
    PrismaModule,
    WhatsAppModule,
    EmailModule,
    AIEventsModule,
    // Required for Claw 5/6 to communicate with Socket.io and Validate JWTs
    GatewayModule,
    JwtModule.register({}), 
  ],
  controllers: [
    AiController,
    AiDiagnosticsController,
    AiChatController 
  ],
  providers: [
    AiService, 
    AiWatchdog, 
    AiDevOpsService, 
    AiAutonomyService, 
    AiDiscoveryService,
    ClawService,
    // Initializing the new Claws
    Claw5SyncService,
    Claw6SentinelService,
  ],
  exports: [
    AiService, 
    AiDevOpsService, 
    AiDiscoveryService, 
    ClawService,
    Claw5SyncService,
    Claw6SentinelService,
  ],
})
export class AiModule {}

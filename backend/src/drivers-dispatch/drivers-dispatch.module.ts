import { Module } from '@nestjs/common';
import { DriversDispatchService } from './drivers-dispatch.service';
import { DriversDispatchController } from './drivers-dispatch.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { RouteOptimizerService } from '../collections/route-optimizer.service';

@Module({
  imports: [
    PrismaModule, 
    WhatsAppModule,
    BroadcastModule // 🚀 Added BroadcastGateway
  ],
  controllers: [DriversDispatchController],
  providers: [
    DriversDispatchService, 
    RouteOptimizerService
  ],
  exports: [
    DriversDispatchService, 
    RouteOptimizerService
  ]
})
export class DriversDispatchModule {}

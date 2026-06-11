import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WaybillsService } from './waybills.service';
import { WaybillsController } from './waybills.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { StorageModule } from '../storage/storage.module';
import { PublicTrackingModule } from '../public-tracking/public-tracking.module';
import { WaybillTrackingSubscriber } from './waybill-tracking.subscriber';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    WhatsAppModule,
    StorageModule,
    PublicTrackingModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue({
      name: 'waybill-queue',
    }),
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService, WaybillTrackingSubscriber],
  exports: [WaybillsService],
})
export class WaybillsModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadController } from './upload.controller';
import { WaybillAiModule } from '../waybill-ai/waybill-ai.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'waybill-queue',
    }),
    WaybillAiModule,
  ],
  controllers: [UploadController],
})
export class UploadModule {}

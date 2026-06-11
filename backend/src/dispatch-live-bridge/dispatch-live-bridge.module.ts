import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { DispatchLiveBridgeController } from './dispatch-live-bridge.controller';
import { DriversController } from './drivers.controller';
import { DispatchLiveBridgeService } from './dispatch-live-bridge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [CollectionsModule,PrismaModule],
  controllers: [DispatchLiveBridgeController, DriversController],
  providers: [DispatchLiveBridgeService],
})
export class DispatchLiveBridgeModule {}

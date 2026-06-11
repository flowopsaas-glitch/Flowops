import { DriversDispatchModule } from '../drivers-dispatch/drivers-dispatch.module';
import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
// If you have a RouteOptimizerModule, import it here:
// import { RouteOptimizerModule } from '../route-optimizer/route-optimizer.module';

@Module({
  imports: [
    DriversDispatchModule,
    PrismaModule, 
    WhatsAppModule,
    // RouteOptimizerModule 
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService]
})
export class CollectionsModule {}

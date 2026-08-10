import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntelligenceController } from './intelligence.controller';
import { PredictiveDeliveryService } from './predictive-delivery.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [PredictiveDeliveryService],
  exports: [PredictiveDeliveryService],
})
export class IntelligenceModule {}

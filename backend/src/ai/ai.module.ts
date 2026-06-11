import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AiService } from './ai.service';
import { AiVisionService } from './ai-vision.service';
import { AiFraudDetectionService } from './ai-fraud-detection.service';
import { AiPredictiveDeliveryService } from './ai-predictive-delivery.service';
import { AiSmartRoutingService } from './ai-smart-routing.service';
import { AiDynamicPricingService } from './ai-dynamic-pricing.service';
import { AiSentimentAnalysisService } from './ai-sentiment-analysis.service';
import { AiPredictiveDeliveryController } from './ai-predictive-delivery.controller';
import { AiSmartRoutingController } from './ai-smart-routing.controller';
import { AiDynamicPricingController } from './ai-dynamic-pricing.controller';
import { AiSentimentAnalysisController } from './ai-sentiment-analysis.controller';
import { ModelRouterService } from './model-router.service';

@Module({
  imports: [ConfigModule, PrismaModule, WhatsAppModule, BroadcastModule],
  controllers: [AiPredictiveDeliveryController],
  providers: [AiService, AiVisionService, AiFraudDetectionService, AiPredictiveDeliveryService, AiSmartRoutingService, AiDynamicPricingService, AiSentimentAnalysisService, ModelRouterService],
  exports: [AiService, AiVisionService, AiFraudDetectionService, AiPredictiveDeliveryService, ModelRouterService],
})
export class AiModule {}

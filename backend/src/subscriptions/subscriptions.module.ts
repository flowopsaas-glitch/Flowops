import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionTiersService } from './subscription-tiers.service';
import { SubscriptionTiersController } from './subscription-tiers.controller';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionsService, SubscriptionTiersService],
  controllers: [SubscriptionsController, SubscriptionTiersController],
  exports: [SubscriptionsService, SubscriptionTiersService],
})
export class SubscriptionsModule {}

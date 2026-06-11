// backend/src/rate-cards/rate-cards.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RateCardsService } from './rate-cards.service';
import { RateCardsController } from './rate-cards.controller';
import { QuotesModule } from '../quotes/quotes.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => QuotesModule), // circular dependency
  ],
  providers: [RateCardsService],
  controllers: [RateCardsController],
  exports: [RateCardsService],
})
export class RateCardsModule {}

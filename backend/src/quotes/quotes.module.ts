// backend/src/quotes/quotes.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { RateCardsModule } from '../rate-cards/rate-cards.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => RateCardsModule), // circular dependency
  ],
  providers: [QuotesService],
  controllers: [QuotesController],
  exports: [QuotesService],
})
export class QuotesModule {}

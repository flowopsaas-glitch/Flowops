import { Module, Global } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global() // 🚀 Making it Global so you don't have to import it everywhere
@Module({
  imports: [PrismaModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}

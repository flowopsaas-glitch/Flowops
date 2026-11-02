import { Module } from '@nestjs/common';
import { TripLegService } from './trip-leg.service';
import { TripLegController } from './trip-leg.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TripLegController],
  providers: [TripLegService],
  exports: [TripLegService],
})
export class TripLegModule {}

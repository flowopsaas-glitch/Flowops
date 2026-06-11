// backend/src/booking-portal/booking-portal.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingPortalService } from './booking-portal.service';
import { BookingPortalController } from './booking-portal.controller';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [BookingPortalService],
  controllers: [BookingPortalController],
  exports: [BookingPortalService],
})
export class BookingPortalModule {}

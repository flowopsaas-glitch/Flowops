import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingPortalController } from './booking-portal.controller';
import { BookingPortalPublicController } from './booking-portal-public.controller';
import { BookingPortalService } from './booking-portal.service';
import { BookingPortalLinkResolver } from './booking-portal-link.resolver';

/**
 * Both controllers share one service because they share one invariant: the
 * link is the authority for tenancy. Splitting them across services would put
 * the rule that keeps `booking_requests.companyId` honest in two places.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BookingPortalController, BookingPortalPublicController],
  providers: [BookingPortalService, BookingPortalLinkResolver],
  exports: [BookingPortalService, BookingPortalLinkResolver],
})
export class BookingPortalModule {}

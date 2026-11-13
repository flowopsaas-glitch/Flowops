import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { BookingPortalService } from './booking-portal.service';
import { PublicSubmitRequestDto } from './dto/booking-portal.dto';

/**
 * Public booking surface — a carrier shares a link, their customer submits a
 * delivery request, no account required.
 *
 * There is no JWT here. The only credential is the link token in the path,
 * which is a bearer capability: anyone holding it can submit. That makes the
 * token's entropy (32 random bytes, base64url) and the throttle below the two
 * things standing between an open URL and a flood, so neither is decorative.
 *
 * What this surface deliberately does NOT expose:
 *   - no request list (tenant data, and this endpoint has no tenant);
 *   - no status transitions (accepting is a commercial decision, tenant-side);
 *   - no companyId or linkId in either direction — tenancy is derived from the
 *     link the request arrived on.
 *
 * A revoked or expired link answers 404 for everything, including reads. The
 * same status is returned for "never existed" so the endpoint cannot be used to
 * probe which tokens are real.
 */
@ApiTags('Booking Portal (Public)')
@Public()
@Controller('booking-portal/public')
export class BookingPortalPublicController {
  constructor(private readonly portal: BookingPortalService) {}

  /**
   * GET /booking-portal/public/:token — branding for the submission form.
   *
   * Returns the carrier's name, logo and colour so the page looks like theirs.
   * No request data: a visitor has no right to anyone else's enquiries.
   */
  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  resolveLink(@Param('token') token: string) {
    return this.portal.resolvePublicLink(token);
  }

  /**
   * POST /booking-portal/public/:token — submit a delivery request.
   *
   * Tighter than the global 600/min: this is an unauthenticated write that
   * inserts a row, and it is the one endpoint here worth abusing.
   */
  @Post(':token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submitRequest(@Param('token') token: string, @Body() body: PublicSubmitRequestDto) {
    return this.portal.submitPublicRequest(token, body);
  }
}

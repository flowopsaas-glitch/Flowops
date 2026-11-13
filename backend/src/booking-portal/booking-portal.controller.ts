import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BookingPortalService } from './booking-portal.service';
import {
  CreateLinkDto,
  ListRequestsQueryDto,
  TransitionRequestDto,
  UpdateLinkDto,
} from './dto/booking-portal.dto';

/**
 * Tenant surface for the booking portal: manage shareable links and work the
 * requests that arrive on them.
 *
 * companyId always comes from the session. Every service method re-scopes by
 * it, so a link id or request id belonging to another tenant resolves to a 404
 * rather than to someone else's data.
 *
 * Not plan-gated: no booking-portal feature key exists in the billing surface,
 * and inventing one here would lock a revenue feature behind a flag the UI
 * does not know about.
 */

/** Seeing what customers have asked for is close to read-only ops data. */
const PORTAL_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.AGENT,
  UserRole.USER,
  UserRole.VIEWER,
];

/**
 * Accepting a request is a commercial commitment — it is the point where an
 * enquiry starts turning into priced work.
 */
const PORTAL_DECIDE_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
];

/** Creating or revoking a public link changes what the internet can reach. */
const PORTAL_ADMIN_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
];

@ApiTags('Booking Portal')
@ApiBearerAuth()
@Roles(...PORTAL_READ_ROLES)
@Controller('booking-portal')
export class BookingPortalController {
  constructor(private readonly portal: BookingPortalService) {}

  // ── Links ────────────────────────────────────────────────────────────────

  @Get('links')
  listLinks(
    @CurrentUser() u: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.portal.listLinks(u.companyId, includeInactive === 'true');
  }

  @Post('links')
  @Roles(...PORTAL_ADMIN_ROLES)
  createLink(@CurrentUser() u: any, @Body() body: CreateLinkDto) {
    return this.portal.createLink(u.companyId, body);
  }

  @Patch('links/:id')
  @Roles(...PORTAL_ADMIN_ROLES)
  updateLink(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() body: UpdateLinkDto,
  ) {
    return this.portal.updateLink(u.companyId, id, body);
  }

  /**
   * Revoke, not delete.
   *
   * A DELETE here would cascade the requests away with the link. The URL stops
   * working either way; the history is the part worth keeping.
   */
  @Post('links/:id/revoke')
  @Roles(...PORTAL_ADMIN_ROLES)
  revokeLink(@CurrentUser() u: any, @Param('id') id: string) {
    return this.portal.revokeLink(u.companyId, id);
  }

  // ── Requests ─────────────────────────────────────────────────────────────

  @Get('requests')
  listRequests(@CurrentUser() u: any, @Query() query: ListRequestsQueryDto) {
    return this.portal.listRequests(u.companyId, query);
  }

  @Get('requests/:id')
  getRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.portal.getRequest(u.companyId, id);
  }

  @Post('requests/:id/status')
  @Roles(...PORTAL_DECIDE_ROLES)
  transitionRequest(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() body: TransitionRequestDto,
  ) {
    return this.portal.transitionRequest(u.companyId, id, body);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GeneralAverageService } from './general-average.service';
import {
  AddContributorDto,
  CreateGaEventDto,
  LodgeSecurityDto,
  RecordAwardDto,
  UpdateGaEventDto,
} from './dto/general-average.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * General Average.
 *
 * Gated behind the freightForwarding entitlement: this is sea-freight
 * forwarding work, not a general logistics surface.
 *
 * Every route is tenant-scoped through the service, which resolves the event
 * via `findFirst({ id, companyId })` and 404s rather than leaking.
 *
 * Releasing cargo is deliberately NOT role-restricted beyond this. A dispatcher
 * who has confirmed security is on record should be able to record the release
 * — the gate that matters is the security check in the service, not the role on
 * the route. Restricting it to managers would just push the work to a manager
 * who is less likely to have looked at the file.
 */
@ApiTags('General Average')
@ApiBearerAuth()
@UseGuards(RolesGuard, FeatureGuard)
@RequireFeature('freightForwarding')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
@Controller('general-average')
export class GeneralAverageController {
  constructor(private readonly svc: GeneralAverageService) {}

  @Get('events')
  @ApiOperation({ summary: 'List general average events' })
  listEvents(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.listEvents(u.companyId);
  }

  @Post('events')
  @ApiOperation({ summary: 'Record a general average declaration' })
  createEvent(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateGaEventDto) {
    return this.svc.createEvent(u.companyId, dto);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'One event with its cargo interests and shares' })
  getEvent(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getEvent(u.companyId, id);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Amend an event' })
  updateEvent(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGaEventDto,
  ) {
    return this.svc.updateEvent(u.companyId, id, dto);
  }

  @Get('events/:id/candidates')
  @ApiOperation({
    summary: 'Shipment files on the same vessel/voyage not yet recorded as contributors',
  })
  discover(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.discoverContributors(u.companyId, id);
  }

  @Post('events/:id/contributors')
  @ApiOperation({ summary: 'Add a cargo interest' })
  addContributor(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddContributorDto,
  ) {
    return this.svc.addContributor(u.companyId, id, dto);
  }

  @Post('events/:id/contributors/:cid/security')
  @ApiOperation({ summary: 'Lodge GA security for a cargo interest' })
  lodgeSecurity(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cid') cid: string,
    @Body() dto: LodgeSecurityDto,
  ) {
    return this.svc.lodgeSecurity(u.companyId, id, cid, dto);
  }

  @Post('events/:id/contributors/:cid/release')
  @ApiOperation({
    summary: 'Record cargo release — refused unless GA security is on record',
  })
  releaseCargo(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cid') cid: string,
  ) {
    return this.svc.releaseCargo(u.companyId, id, cid, u.id);
  }

  @Post('events/:id/award')
  @ApiOperation({ summary: "Record the adjuster's award" })
  recordAward(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordAwardDto,
  ) {
    return this.svc.recordAward(u.companyId, id, dto);
  }

  @Post('events/:id/settle')
  @ApiOperation({ summary: 'Close the event once no balances are outstanding' })
  settle(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.settle(u.companyId, id);
  }
}

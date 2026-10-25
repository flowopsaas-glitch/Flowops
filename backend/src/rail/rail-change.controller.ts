import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailChangeService } from './rail-change.service';
import { AllocatePartyDto, CreateChangeRequestDto, PreviewChangeRequestDto, ProposeAlternativeDto } from './dto/rail-change.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/** Cancel / reschedule / re-plan (Annexure 20a) with Annexure 20b reasons. Allocating a "could be …" party is signatory-only. */
@ApiTags('Rail / Cancellations & reschedules')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/changes')
export class RailChangeController {
  constructor(private readonly changes: RailChangeService) {}

  @Get('codes')
  @ApiOperation({ summary: 'Annexure 20b cancellation reasons (82) with their responsible-party allocation' })
  codes(@CurrentUser() u: AuthenticatedUser) { return this.changes.listCodes(u.companyId); }

  @Get('windows')
  @ApiOperation({ summary: 'The notice / acknowledgement / 48 h / 72 h windows and the Annexure 20a process' })
  windows(@CurrentUser() u: AuthenticatedUser) { return this.changes.windows(u.companyId); }

  @Post('preview')
  @ApiOperation({ summary: 'Derive attribution, notice window and commercial consequence without saving anything' })
  preview(@CurrentUser() u: AuthenticatedUser, @Body() dto: PreviewChangeRequestDto) { return this.changes.preview(u.companyId, dto); }

  @Get()
  list(@CurrentUser() u: AuthenticatedUser, @Query('status') status?: string, @Query('consignmentId') consignmentId?: string) {
    return this.changes.list(u.companyId, { status, consignmentId });
  }

  @Get(':id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.changes.get(u.companyId, id); }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Log a cancel / reschedule / re-plan; optionally log it in a Daily Handshake report as a deviation' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateChangeRequestDto) { return this.changes.create(u.companyId, dto, u); }

  @Post(':id/acknowledge')
  @Roles(...RAIL_WRITE_ROLES)
  acknowledge(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.changes.acknowledge(u.companyId, id, u); }

  @Post(':id/propose-alternative')
  @Roles(...RAIL_WRITE_ROLES)
  propose(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ProposeAlternativeDto) { return this.changes.proposeAlternative(u.companyId, id, dto, u); }

  @Post(':id/accept')
  @Roles(...RAIL_WRITE_ROLES)
  accept(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.changes.accept(u.companyId, id, u); }

  @Post(':id/confirm-cancellation')
  @Roles(...RAIL_WRITE_ROLES)
  confirm(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.changes.confirmCancellation(u.companyId, id, u); }

  @Post(':id/allocate-party')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Record the Clearinghouse allocation of a "could be …" reason (authorised representative)' })
  allocate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AllocatePartyDto) { return this.changes.allocateParty(u.companyId, id, dto, u); }

  @Post(':id/close')
  @Roles(...RAIL_WRITE_ROLES)
  close(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.changes.close(u.companyId, id, u); }
}

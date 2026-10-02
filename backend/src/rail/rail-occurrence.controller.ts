import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailOccurrenceService } from './rail-occurrence.service';
import { CreateOccurrenceDto, NotifyOccurrenceDto, OccurrenceNoteDto } from './dto/rail-occurrence.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';

@ApiTags('Rail / Occurrences')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@Controller('rail/occurrences')
export class RailOccurrenceController {
  constructor(private readonly occurrences: RailOccurrenceService) {}

  @Get()
  list(@CurrentUser() u: AuthenticatedUser, @Query('status') status?: string) { return this.occurrences.list(u.companyId, { status }); }

  @Get(':id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.occurrences.get(u.companyId, id); }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Report an occurrence; links it to a handshake deviation (optional) and to its audit_logs row' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateOccurrenceDto) { return this.occurrences.create(u.companyId, dto, u); }

  @Post(':id/notify')
  @Roles(...RAIL_WRITE_ROLES)
  notify(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: NotifyOccurrenceDto) { return this.occurrences.notify(u.companyId, id, dto, u); }

  @Post(':id/investigate')
  @Roles(...RAIL_WRITE_ROLES)
  investigate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: OccurrenceNoteDto) { return this.occurrences.startInvestigation(u.companyId, id, dto, u); }

  @Post(':id/preliminary-report')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'File the preliminary report (due 48 hours after the occurrence)' })
  preliminary(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: OccurrenceNoteDto) { return this.occurrences.filePreliminary(u.companyId, id, dto, u); }

  @Post(':id/close')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Close the occurrence (authorised representative; the preliminary report must be filed)' })
  close(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: OccurrenceNoteDto) { return this.occurrences.close(u.companyId, id, dto, u); }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailPossessionService } from './rail-possession.service';
import { CreatePossessionDto } from './dto/rail-possession.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Rail / Possession windows')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/possessions')
export class RailPossessionController {
  constructor(private readonly possessions: RailPossessionService) {}

  // `conflicts` is declared before `:id` routes so it is not read as an id.
  @Get('conflicts')
  @ApiOperation({ summary: 'Possession windows that overlap active consignments (optionally for one consignment)' })
  conflicts(@CurrentUser() u: AuthenticatedUser, @Query('consignmentId') consignmentId?: string) { return this.possessions.conflicts(u.companyId, consignmentId); }

  @Get()
  list(@CurrentUser() u: AuthenticatedUser, @Query('corridorCode') corridorCode?: string, @Query('status') status?: string) {
    return this.possessions.list(u.companyId, { corridorCode, status });
  }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Record a possession window; the response lists any consignments it clashes with' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreatePossessionDto) { return this.possessions.create(u.companyId, dto, u); }

  @Post(':id/cancel')
  @Roles(...RAIL_WRITE_ROLES)
  cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.possessions.cancel(u.companyId, id, u); }

  @Post(':id/complete')
  @Roles(...RAIL_WRITE_ROLES)
  complete(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.possessions.complete(u.companyId, id, u); }
}

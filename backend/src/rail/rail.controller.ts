import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailService } from './rail.service';
import { CreateRailConsignmentDto } from './dto/create-rail-consignment.dto';
import { UpdateRailConsignmentDto } from './dto/update-rail-consignment.dto';
import { CreateWagonDto } from './dto/wagon.dto';
import { CreateIntermodalLegDto, AdvanceStatusDto } from './dto/intermodal-leg.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';

/**
 * Class-level roles are the READ set (includes VIEWER); every mutating handler
 * overrides them with the WRITE set, so VIEWER is read-only at the API too.
 */
@ApiTags('Rail / Intermodal')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@Controller('rail')
export class RailController {
  constructor(private readonly rail: RailService) {}

  // ── Command centre ───────────────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Rail / intermodal command centre: active consignments, wagons, corridor KPIs, dwell' })
  overview(@CurrentUser() u: AuthenticatedUser) {
    return this.rail.overview(u.companyId);
  }

  // ── Consignments ─────────────────────────────────────────────────────────────

  @Get('consignments')
  @ApiOperation({ summary: 'List rail consignments (filter by status / corridor / commodity / q)' })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('corridor') corridor?: string,
    @Query('commodity') commodity?: string,
    @Query('q') q?: string,
  ) {
    return this.rail.list(u.companyId, { status, corridor, commodity, q });
  }

  @Get('consignments/:id')
  @ApiOperation({ summary: 'Get a rail consignment with wagons, intermodal legs and event timeline' })
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.rail.get(u.companyId, id);
  }

  @Get('consignments/:id/dangerous-goods')
  @ApiOperation({ summary: 'Dangerous-goods readiness of a consignment — exactly what the departure gate checks' })
  dangerousGoods(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.rail.getDangerousGoods(u.companyId, id);
  }

  @Post('consignments')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a rail consignment' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateRailConsignmentDto) {
    return this.rail.create(u.companyId, dto, u);
  }

  @Patch('consignments/:id')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Update a rail consignment' })
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRailConsignmentDto,
  ) {
    return this.rail.update(u.companyId, id, dto, u);
  }

  @Post('consignments/:id/advance')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Advance consignment lifecycle status (records timeline event + AI event)' })
  advance(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdvanceStatusDto,
  ) {
    return this.rail.advanceStatus(u.companyId, id, dto.status, u, dto.note, dto.location);
  }

  @Delete('consignments/:id')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Soft-cancel a rail consignment' })
  cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.rail.cancel(u.companyId, id, u);
  }

  // ── Wagons ───────────────────────────────────────────────────────────────────

  @Post('consignments/:id/wagons')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Add a wagon to the consignment register' })
  addWagon(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWagonDto,
  ) {
    return this.rail.addWagon(u.companyId, id, dto, u);
  }

  @Delete('consignments/:id/wagons/:wagonId')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Remove a wagon from the consignment' })
  removeWagon(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('wagonId') wagonId: string,
  ) {
    return this.rail.removeWagon(u.companyId, id, wagonId, u);
  }

  // ── Intermodal legs ──────────────────────────────────────────────────────────

  @Post('consignments/:id/legs')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Add an intermodal leg (road / rail / port handoff)' })
  addLeg(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateIntermodalLegDto,
  ) {
    return this.rail.addLeg(u.companyId, id, dto, u);
  }

  @Post('consignments/:id/legs/:legId/advance')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Advance an intermodal leg (auto-computes dwell hours at handoff)' })
  advanceLeg(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('legId') legId: string,
    @Body() dto: AdvanceStatusDto,
  ) {
    return this.rail.advanceLeg(u.companyId, id, legId, dto.status, u);
  }
}

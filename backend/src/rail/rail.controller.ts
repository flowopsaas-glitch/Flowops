import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RailService } from './rail.service';
import { CreateRailConsignmentDto } from './dto/create-rail-consignment.dto';
import { UpdateRailConsignmentDto } from './dto/update-rail-consignment.dto';
import { CreateWagonDto } from './dto/wagon.dto';
import { CreateIntermodalLegDto, AdvanceStatusDto, ApproveHandoffReadinessDto } from './dto/intermodal-leg.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RailHandoffService } from './rail-handoff.service';
import { AddHandoffEvidenceDto, CreateHandoffReadinessDto } from './dto/handoff.dto';
import { RailTimetableService } from './rail-timetable.service';

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
  constructor(
    private readonly rail: RailService,
    private readonly handoff: RailHandoffService,
    private readonly timetable: RailTimetableService,
  ) {}

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

  /**
   * Read-only handoff readiness report: prerequisite checks for a custody
   * handover (leg started, receiver named, location recorded, tariff/billing
   * evidence stored and PRICED, no load hold) plus whether a readiness approval
   * exists that covers the current evidence fingerprint.
   */
  @Get('consignments/:id/legs/:legId/handoff-readiness')
  @ApiOperation({ summary: 'Handoff readiness report for a leg' })
  handoffReadiness(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('legId') legId: string,
  ) {
    return this.rail.handoffReadiness(u.companyId, id, legId);
  }

  /** Auditable sign-off; refused while the evidence is incomplete. */
  @Post('consignments/:id/legs/:legId/handoff-readiness/approve')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Approve handoff readiness' })
  approveHandoffReadiness(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('legId') legId: string,
    @Body() dto: ApproveHandoffReadinessDto,
  ) {
    return this.rail.approveHandoffReadiness(u.companyId, id, legId, u, dto?.note);
  }

  /**
   * Advance an intermodal leg (auto-computes dwell hours at handoff).
   * HANDED_OVER is gated: the leg must have started, the handler and location
   * must be recorded, the consignment must have a PRICED tariff calculation,
   * there must be no load-adjustment hold, and a readiness approval must cover
   * the current evidence. Illegal transitions are rejected and audited.
   */
  @Post('consignments/:id/legs/:legId/advance')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Advance an intermodal leg' })
  advanceLeg(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('legId') legId: string,
    @Body() dto: AdvanceStatusDto,
  ) {
    return this.rail.advanceLeg(u.companyId, id, legId, dto.status, u);
  }

  // ── Rail-to-final-mile handoff ────────────────────────────────────────────

  @Get('handoffs')
  @ApiOperation({ summary: 'List rail-to-final-mile handoff readiness records' })
  listHandoffs(@CurrentUser() u: AuthenticatedUser) {
    return this.handoff.list(u.companyId);
  }

  @Get('handoffs/:id')
  @ApiOperation({ summary: 'Get handoff readiness and chain-of-custody evidence' })
  getHandoff(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.handoff.get(u.companyId, id);
  }

  @Post('consignments/:id/handoffs')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a guarded rail-to-final-mile handoff readiness record' })
  createHandoff(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateHandoffReadinessDto,
  ) {
    return this.handoff.create(u.companyId, id, dto);
  }

  @Post('handoffs/:id/evidence')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Attach evidence to a handoff readiness record' })
  addHandoffEvidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddHandoffEvidenceDto,
  ) {
    return this.handoff.addEvidence(u.companyId, id, dto);
  }

  @Post('handoffs/:id/evidence/:evidenceId/verify')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Verify handoff evidence' })
  verifyHandoffEvidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.handoff.verifyEvidence(u.companyId, id, evidenceId);
  }

  @Post('handoffs/:id/evaluate')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Evaluate evidence and guarded readiness requirements' })
  evaluateHandoff(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.handoff.evaluate(u.companyId, id);
  }

  @Post('handoffs/:id/complete')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Complete a READY handoff and record final-mile acceptance' })
  completeHandoff(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.handoff.complete(u.companyId, id, u.id);
  }

  // ── Rail timetable ────────────────────────────────────────────────────────

  @Post('schedules/import')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Import an Annexure 33a tab-separated rail timetable' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  importTimetable(
    @CurrentUser() u: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.timetable.importFile(u.companyId, u.id, file);
  }

  @Get('schedules/imports')
  @ApiOperation({ summary: 'List this tenant’s rail timetable imports' })
  listTimetableImports(@CurrentUser() u: AuthenticatedUser) {
    return this.timetable.listImports(u.companyId);
  }

  @Get('schedules/imports/:id/rows')
  @ApiOperation({ summary: 'List and filter stops from a rail timetable import' })
  listTimetableRows(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('origin') origin?: string,
    @Query('train') train?: string,
    @Query('corridor') corridor?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.timetable.listRows(u.companyId, id, { origin, train, corridor, q, page, limit });
  }
}

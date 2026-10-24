import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailHandshakeService } from './rail-handshake.service';
import {
  CreateHandshakeReportDto, UpdateHandshakeReportDto, LogDeviationDto,
  UpdateDeviationDto, ReviewDeviationDto, ResolveDeviationDto, SignOffReportDto,
} from './dto/handshake.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Daily Handshake (Transnet Network Statement — Annexure 28).
 * TOC-side reconciliation of daily deviations with the Infrastructure Manager,
 * with the 24h → 48h → 72h/RLF → Regulator escalation ladder.
 *
 * Roles: class-level = READ set (includes VIEWER); mutating handlers use the
 * WRITE set; sign-off, resolve and Regulator dispute use the SIGNATORY set
 * (authorised representatives only — see rail-roles.ts).
 */
@ApiTags('Rail / Daily Handshake')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/handshake')
export class RailHandshakeController {
  constructor(private readonly handshake: RailHandshakeService) {}

  // ── Command centre ────────────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Handshake command centre: open items, disputes, exposure, responsible-party breakdown' })
  overview(@CurrentUser() u: AuthenticatedUser) {
    return this.handshake.overview(u.companyId);
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'List daily handshake reports (filter by status / corridor)' })
  listReports(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('corridor') corridor?: string,
  ) {
    return this.handshake.listReports(u.companyId, { status, corridor });
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a handshake report with all deviations (escalation stages refreshed)' })
  getReport(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.handshake.getReport(u.companyId, id);
  }

  @Post('reports')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a daily handshake report for a 24h operating-day window' })
  createReport(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateHandshakeReportDto) {
    return this.handshake.createReport(u.companyId, dto, u);
  }

  @Patch('reports/:id')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Update handshake report metadata' })
  updateReport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateHandshakeReportDto,
  ) {
    return this.handshake.updateReport(u.companyId, id, dto, u);
  }

  @Post('reports/:id/issue')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Issue the report to the TOC for review (DRAFT → PENDING_TOC)' })
  issueReport(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.handshake.issueReport(u.companyId, id, u);
  }

  @Post('reports/:id/sign-off')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'TOC sign-off of the daily handshake report (Annexure 28 steps 11-12). The authenticated identity is bound to the signature.' })
  signOff(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SignOffReportDto,
  ) {
    return this.handshake.signOff(u.companyId, id, dto, u);
  }

  @Post('reports/:id/run-escalation')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Recompute the escalation ladder for all OPEN items (24/48/72h → Regulator)' })
  runEscalation(@CurrentUser() u: AuthenticatedUser) {
    return this.handshake.runEscalation(u.companyId, u);
  }

  // ── Deviations ────────────────────────────────────────────────────────────

  @Post('reports/:id/deviations')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Log a deviation against a Train/Slot + Order number' })
  logDeviation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LogDeviationDto,
  ) {
    return this.handshake.logDeviation(u.companyId, id, dto, u);
  }

  @Patch('reports/:id/deviations/:deviationId')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Update a deviation line (cause, responsible party, impact, cost)' })
  updateDeviation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deviationId') deviationId: string,
    @Body() dto: UpdateDeviationDto,
  ) {
    return this.handshake.updateDeviation(u.companyId, id, deviationId, dto, u);
  }

  @Post('reports/:id/deviations/:deviationId/review')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'TOC review: agree, or flag OPEN (red-flag) with a dispute reason' })
  reviewDeviation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deviationId') deviationId: string,
    @Body() dto: ReviewDeviationDto,
  ) {
    return this.handshake.reviewDeviation(u.companyId, id, deviationId, dto, u);
  }

  @Post('reports/:id/deviations/:deviationId/resolve')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Resolve an OPEN item after escalation (agreement reached)' })
  resolveDeviation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deviationId') deviationId: string,
    @Body() dto: ResolveDeviationDto,
  ) {
    return this.handshake.resolveDeviation(u.companyId, id, deviationId, dto, u);
  }

  @Post('reports/:id/deviations/:deviationId/dispute')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Lodge an unresolved OPEN item as a dispute with the Regulator' })
  lodgeDispute(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deviationId') deviationId: string,
  ) {
    return this.handshake.lodgeDispute(u.companyId, id, deviationId, u);
  }

  @Delete('reports/:id/deviations/:deviationId')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Remove an unreviewed deviation line' })
  removeDeviation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deviationId') deviationId: string,
  ) {
    return this.handshake.removeDeviation(u.companyId, id, deviationId, u);
  }
}

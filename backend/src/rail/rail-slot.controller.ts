import {
  Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailSlotService } from './rail-slot.service';
import {
  AllocateApplicationDto, ConflictDto, CreateComplianceDocDto, CreateSlotApplicationDto, EnvelopeCheckDto,
  LinkConsignmentDto, MarkOperatedDto, RejectApplicationDto, RevokeComplianceDocDto, SelfScreeningDto,
  UpdateSlotApplicationDto,
} from './dto/rail-slot.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { SELF_SCREENING_QUESTIONS, SELF_SCREENING_VERSION } from './catalog/self-screening.catalog';
import { NETWORK_CONTACTS } from './catalog/corridors.catalog';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Slot applications, Annexure 25 self-screening, operator compliance and the corridor-envelope
 * check (RAIL-005 / 006 / 012). Class-level roles are the READ set; mutating handlers use WRITE;
 * submitting an application and verifying / revoking a compliance document are formal
 * commitments and use the SIGNATORY set (also enforced in the service).
 */
@ApiTags('Rail / Slot applications & compliance')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/slots')
export class RailSlotController {
  constructor(private readonly slots: RailSlotService) {}

  // ── reference data (platform-wide, read-only) ──────────────────────────────

  @Get('corridors')
  @ApiOperation({ summary: 'V4 corridor catalog with technical envelope and data status' })
  corridors(@CurrentUser() u: AuthenticatedUser) { return this.slots.listCorridors(u.companyId); }

  @Get('yards')
  @ApiOperation({ summary: 'Transfer-yard catalog (empty until a cited source is loaded)' })
  yards(@CurrentUser() u: AuthenticatedUser) { return this.slots.listYards(u.companyId); }

  @Get('reference-status')
  @ApiOperation({ summary: 'How much of the corridor / yard reference data is loaded and verified' })
  referenceStatus(@CurrentUser() u: AuthenticatedUser) { return this.slots.referenceCompleteness(u.companyId); }

  @Get('contacts')
  @ApiOperation({ summary: 'Network contact directory (function mailboxes only — no personal data)' })
  contacts() { return NETWORK_CONTACTS; }

  @Get('self-screening')
  @ApiOperation({ summary: 'Annexure 25 self-screening questions (Second Draft)' })
  selfScreeningQuestions() { return { version: SELF_SCREENING_VERSION, questions: SELF_SCREENING_QUESTIONS }; }

  @Post('envelope-check')
  @ApiOperation({ summary: 'Check rolling stock (manual particulars or a consignment) against a corridor envelope' })
  envelopeCheck(@CurrentUser() u: AuthenticatedUser, @Body() dto: EnvelopeCheckDto) { return this.slots.checkEnvelope(u.companyId, dto); }

  // ── overview ───────────────────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Slot-application counts, 60-day mobilisation clocks needing attention, RSR guard, reference completeness' })
  overview(@CurrentUser() u: AuthenticatedUser) { return this.slots.overview(u.companyId); }

  // ── compliance documents ───────────────────────────────────────────────────

  @Get('compliance')
  @ApiOperation({ summary: 'Compliance summary: RSR permit guard, SUBMIT / OPERATE gates and every document with its effective status' })
  compliance(@CurrentUser() u: AuthenticatedUser) { return this.slots.complianceSummary(u.companyId); }

  @Post('compliance/docs')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Record a compliance document (starts PENDING_REVIEW)' })
  createDoc(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateComplianceDocDto) { return this.slots.createDoc(u.companyId, dto, u); }

  @Post('compliance/docs/:docId/verify')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Verify a compliance document (authorised representative)' })
  verifyDoc(@CurrentUser() u: AuthenticatedUser, @Param('docId') docId: string) { return this.slots.verifyDoc(u.companyId, docId, u); }

  @Post('compliance/docs/:docId/revoke')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Revoke a compliance document (authorised representative)' })
  revokeDoc(@CurrentUser() u: AuthenticatedUser, @Param('docId') docId: string, @Body() dto: RevokeComplianceDocDto) {
    return this.slots.revokeDoc(u.companyId, docId, dto, u);
  }

  // ── applications ───────────────────────────────────────────────────────────

  @Get('applications')
  @ApiOperation({ summary: 'List slot applications with their mobilisation clock' })
  list(@CurrentUser() u: AuthenticatedUser, @Query('status') status?: string, @Query('corridorCode') corridorCode?: string) {
    return this.slots.list(u.companyId, { status, corridorCode });
  }

  @Get('applications/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.get(u.companyId, id); }

  @Get('applications/:id/readiness')
  @ApiOperation({ summary: 'Side-effect-free: the gates a submission must pass, and which are blocking' })
  readiness(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.readiness(u.companyId, id); }

  @Post('applications')
  @Roles(...RAIL_WRITE_ROLES)
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateSlotApplicationDto) { return this.slots.createApplication(u.companyId, dto, u); }

  @Patch('applications/:id')
  @Roles(...RAIL_WRITE_ROLES)
  update(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSlotApplicationDto) {
    return this.slots.updateApplication(u.companyId, id, dto, u);
  }

  @Put('applications/:id/self-screening')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Set the Annexure 25 self-screening answers (cover page of the application)' })
  selfScreening(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: SelfScreeningDto) {
    return this.slots.setSelfScreening(u.companyId, id, dto, u);
  }

  @Post('applications/:id/submit')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Submit (authorised representative). Hard gates: Annexure 25, compliance documents, corridor envelope' })
  submit(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.submit(u.companyId, id, u); }

  @Post('applications/:id/assess')
  @Roles(...RAIL_WRITE_ROLES)
  assess(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.startAssessment(u.companyId, id, u); }

  @Post('applications/:id/conflict')
  @Roles(...RAIL_WRITE_ROLES)
  conflict(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ConflictDto) { return this.slots.flagCapacityConflict(u.companyId, id, dto, u); }

  @Post('applications/:id/resolve-conflict')
  @Roles(...RAIL_WRITE_ROLES)
  resolveConflict(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.resolveCapacityConflict(u.companyId, id, u); }

  @Post('applications/:id/allocate')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Record the IM allocation. Starts the 60-day mobilisation clock' })
  allocate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AllocateApplicationDto) { return this.slots.allocate(u.companyId, id, dto, u); }

  @Post('applications/:id/reject')
  @Roles(...RAIL_WRITE_ROLES)
  reject(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectApplicationDto) { return this.slots.reject(u.companyId, id, dto, u); }

  @Post('applications/:id/expire')
  @Roles(...RAIL_WRITE_ROLES)
  expire(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.slots.expire(u.companyId, id, u); }

  @Post('applications/:id/operated')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Record first operation (stops the forfeiture clock). Gated by the OPERATE compliance set' })
  operated(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: MarkOperatedDto) { return this.slots.markOperated(u.companyId, id, dto, u); }

  @Post('applications/:id/link-consignment')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Attach a consignment. Rejected if its wagons violate the corridor gauge / axle load' })
  link(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: LinkConsignmentDto) { return this.slots.linkConsignment(u.companyId, id, dto, u); }
}

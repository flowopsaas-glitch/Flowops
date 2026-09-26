import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProcessControlService } from './process-control.service';
import {
  CompleteStepDto,
  CreateProcessDefinitionDto,
  CreateProcessVersionDto,
  ProposeChangeDto,
  ProposeSolutionDto,
  RaiseIncidentDto,
  RecordOutcomeDto,
  ResolveIncidentDto,
  ResolveSolutionDto,
  ReviewChangeDto,
  StartProcessInstanceDto,
  TransitionProcessVersionDto,
} from './process-control.dto';

/**
 * Process Control API — the Process Book and its execution.
 *
 * Everything here is tenant-scoped from the authenticated user: a caller can
 * never read or write another tenant's standards, instances or evidence, and
 * every call is refused outright while the capability flag is off.
 */
@ApiTags('Process Control')
@ApiBearerAuth()
@Controller('process-control')
export class ProcessControlController {
  constructor(private readonly processControl: ProcessControlService) {}

  // ── Process Book ──────────────────────────────────────────────────────────

  @Get('book')
  @ApiOperation({ summary: 'Process Book: standards, versions and execution evidence' })
  getProcessBook(@CurrentUser() u: AuthenticatedUser) {
    return this.processControl.getProcessBook(u.companyId);
  }

  @Get('enabled')
  @ApiOperation({ summary: 'Whether Process Control is enabled in this environment' })
  getEnabled() {
    return { enabled: this.processControl.isEnabled() };
  }

  // ── Definitions & versions ────────────────────────────────────────────────

  @Get('definitions')
  listDefinitions(@CurrentUser() u: AuthenticatedUser) {
    return this.processControl.listDefinitions(u.companyId);
  }

  @Post('definitions')
  createDefinition(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateProcessDefinitionDto) {
    return this.processControl.createDefinition(u.companyId, actorOf(u), dto);
  }

  @Get('definitions/:id')
  getDefinition(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.processControl.getDefinition(u.companyId, id);
  }

  @Post('definitions/:id/versions')
  createVersion(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProcessVersionDto,
  ) {
    return this.processControl.createVersion(u.companyId, actorOf(u), id, dto);
  }

  @Patch('versions/:versionId/steps')
  updateVersionSteps(
    @CurrentUser() u: AuthenticatedUser,
    @Param('versionId') versionId: string,
    @Body() dto: CreateProcessVersionDto,
  ) {
    return this.processControl.updateVersionSteps(u.companyId, actorOf(u), versionId, dto);
  }

  @Post('versions/:versionId/transition')
  @ApiOperation({ summary: 'Move a version through draft → pilot → approved → retired' })
  transitionVersion(
    @CurrentUser() u: AuthenticatedUser,
    @Param('versionId') versionId: string,
    @Body() dto: TransitionProcessVersionDto,
  ) {
    return this.processControl.transitionVersion(
      u.companyId,
      actorOf(u),
      versionId,
      dto.to as any,
      dto.note,
    );
  }

  // ── Instances ─────────────────────────────────────────────────────────────

  @Get('instances')
  listInstances(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('definitionId') definitionId?: string,
  ) {
    return this.processControl.listInstances(u.companyId, { status, definitionId });
  }

  @Post('instances')
  @ApiOperation({ summary: 'Start a process instance (idempotent on businessKey)' })
  startInstance(@CurrentUser() u: AuthenticatedUser, @Body() dto: StartProcessInstanceDto) {
    return this.processControl.startInstance(u.companyId, actorOf(u), dto);
  }

  @Get('instances/:id')
  getInstance(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.processControl.getInstance(u.companyId, id);
  }

  @Post('instances/:id/steps/complete')
  @ApiOperation({ summary: 'Complete the current step with evidence and a result' })
  completeStep(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteStepDto,
  ) {
    return this.processControl.completeStep(
      u.companyId,
      actorOf(u),
      id,
      dto.outcome as 'SUCCESS' | 'FAILURE' | 'EXCEPTION',
      dto,
    );
  }

  @Post('instances/:id/outcome')
  recordOutcome(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordOutcomeDto,
  ) {
    return this.processControl.recordOutcome(u.companyId, actorOf(u), id, dto);
  }

  // ── Incidents & solutions ─────────────────────────────────────────────────

  @Get('incidents')
  listIncidents(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.processControl.listIncidents(u.companyId, { status, severity });
  }

  @Post('instances/:id/incidents')
  raiseIncident(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RaiseIncidentDto,
  ) {
    return this.processControl.raiseIncident(u.companyId, actorOf(u), id, dto);
  }

  @Post('incidents/:incidentId/resolve')
  resolveIncident(
    @CurrentUser() u: AuthenticatedUser,
    @Param('incidentId') incidentId: string,
    @Body() dto: ResolveIncidentDto,
  ) {
    return this.processControl.resolveIncident(u.companyId, actorOf(u), incidentId, dto);
  }

  @Post('incidents/:incidentId/solutions')
  proposeSolution(
    @CurrentUser() u: AuthenticatedUser,
    @Param('incidentId') incidentId: string,
    @Body() dto: ProposeSolutionDto,
  ) {
    return this.processControl.proposeSolution(u.companyId, actorOf(u), incidentId, dto);
  }

  @Post('solutions/:solutionId/resolve')
  resolveSolution(
    @CurrentUser() u: AuthenticatedUser,
    @Param('solutionId') solutionId: string,
    @Body() dto: ResolveSolutionDto,
  ) {
    return this.processControl.resolveSolution(u.companyId, actorOf(u), solutionId, dto);
  }

  // ── Change proposals ──────────────────────────────────────────────────────

  @Post('definitions/:id/change-proposals')
  proposeChange(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProposeChangeDto,
  ) {
    return this.processControl.proposeChange(u.companyId, actorOf(u), id, dto);
  }

  @Post('change-proposals/:proposalId/review')
  reviewChange(
    @CurrentUser() u: AuthenticatedUser,
    @Param('proposalId') proposalId: string,
    @Body() dto: ReviewChangeDto,
  ) {
    return this.processControl.reviewChange(u.companyId, actorOf(u), proposalId, dto);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  @ApiOperation({ summary: 'Process Control audit trail (definitions, versions, executions)' })
  listAudit(
    @CurrentUser() u: AuthenticatedUser,
    @Query('instanceId') instanceId?: string,
    @Query('definitionId') definitionId?: string,
  ) {
    return this.processControl.listAuditEvents(u.companyId, { instanceId, definitionId });
  }
}

function actorOf(u: AuthenticatedUser) {
  return {
    userId: u?.id ?? null,
    name: u?.name ?? null,
    role: (u?.role as string) ?? null,
    permissions: (u?.permissions ?? null) as Record<string, boolean> | null,
  };
}

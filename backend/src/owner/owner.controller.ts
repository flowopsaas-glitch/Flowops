import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OwnerService } from './owner.service';
import { AlertingService } from '../alerting/alerting.service';
import { CompetitiveIntelligenceService } from '../ai/competitive-intelligence.service';
import { AiDevOpsService } from '../ai/ai-devops.service';
import { IntegrationSentinelService } from '../ai/integration-sentinel.service';
import { ObservabilityService } from '../observability/observability.service';
import { OwnerAuthGuard } from '../common/guards/owner-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

/** All owner routes require the owner JWT — bypass the global tenant JwtAuthGuard. */
@ApiTags('Owner (Platform Admin)')
@ApiBearerAuth()
@Controller('owner')
@UseGuards(OwnerAuthGuard)
@Public() // Skip global JwtAuthGuard; OwnerAuthGuard handles auth here
export class OwnerController {
  constructor(
    private readonly svc: OwnerService,
    private readonly alerting: AlertingService,
    private readonly intel: CompetitiveIntelligenceService,
    private readonly devops: AiDevOpsService,
    private readonly sentinel: IntegrationSentinelService,
    private readonly observatory: ObservabilityService,
  ) {}

  @Get('tenants')
  listTenants(@Query() q: any) {
    return this.svc.listTenants(q);
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.svc.getTenant(id);
  }

  @Get('tenants/:id/analytics')
  tenantAnalytics(@Param('id') id: string) {
    return this.svc.tenantAnalytics(id);
  }

  @Post('tenants/draft')
  draftTenant(@Body() body: any) {
    return this.svc.draftTenant(body);
  }

  @Patch('tenants/:id/action')
  tenantAction(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' | 'suspend'; reason?: string },
    @CurrentUser() owner: any,
  ) {
    return this.svc.tenantAction(id, body.action, { reason: body.reason }, owner);
  }

  @Post('impersonate/:tenantId')
  impersonate(@Param('tenantId') tenantId: string, @CurrentUser() owner: any) {
    return this.svc.impersonate(tenantId, owner);
  }

  @Get('tenants/:id/users')
  listTenantUsers(@Param('id') id: string) {
    return this.svc.listTenantUsers(id);
  }

  @Post('tenants/:id/users')
  createTenantUser(@Param('id') id: string, @Body() body: any, @CurrentUser() owner: any) {
    return this.svc.createTenantAdmin(id, body, owner);
  }

  @Post('tenants/:id/activate')
  activateTenant(@Param('id') id: string, @CurrentUser() owner: any) {
    return this.svc.activateTenant(id, owner);
  }

  @Patch('users/:userId/password')
  resetUserPassword(@Param('userId') userId: string, @Body() body: { password: string }, @CurrentUser() owner: any) {
    return this.svc.resetTenantUserPassword(userId, body.password, owner);
  }

  @Get('view-mode/:id')
  viewMode(@Param('id') id: string) {
    return this.svc.viewModeContext(id);
  }

  @Get('platform-metrics')
  platformMetrics() {
    return this.svc.platformMetrics();
  }

  @Get('analytics')
  platformAnalytics() {
    return this.svc.platformAnalytics();
  }

  @Get('mrr-movement')
  mrrMovement() {
    return this.svc.mrrMovement();
  }

  @Get('ops/live')
  liveOps() {
    return this.svc.liveOps();
  }

  @Post('mrr-snapshot')
  captureMrrSnapshot() {
    return this.svc.captureMrrSnapshot();
  }

  @Get('ai-alerts')
  getAlerts() {
    return this.svc.getPlatformAlerts();
  }

  @Get('alerts')
  listAlerts(@Query() q: any) {
    return this.alerting.list(q?.includeResolved === 'true' || q?.includeResolved === true);
  }

  @Post('alerts/run')
  runAlerts() {
    return this.alerting.evaluate();
  }

  @Post('trials/check')
  runTrialCheck() {
    return this.alerting.processTrials();
  }

  @Post('alerts/:id/resolve')
  resolveAlert(@Param('id') id: string) {
    return this.alerting.resolve(id);
  }

  // ── Competitive Intelligence (platform-wide, owner-scoped) ────────────────
  @Get('intel/latest')
  intelLatest() {
    return this.intel.getLatestReportAny();
  }

  @Get('intel/insights')
  intelInsights(@Query('limit') limit?: string) {
    return this.intel.getInsightsAny(Number(limit) || 20);
  }

  @Post('intel/sweep')
  intelSweep() {
    return this.intel.runSweepForPlatform();
  }

  /** Open competitive-intel action items (set ?all=1 to include actioned). */
  @Get('intel/actions')
  intelActions(@Query('all') all?: string) {
    return this.intel.getActionItemsAny(all === '1');
  }

  /** Mark an action item open|resolved|dismissed (applies across all companies). */
  @Patch('intel/actions/:id')
  intelActionStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.intel.setActionStatusAny(id, body?.status);
  }

  /** CLAW Build Planner — turn an action item into a grounded, buildable spec + agent prompt. */
  @Post('intel/actions/:id/build-plan')
  intelBuildPlan(@Param('id') id: string, @Body() body: { force?: boolean }) {
    return this.intel.generateBuildPlan(id, body?.force === true);
  }

  /** Stage 3 — open a real GitHub Issue in the FlowOps repo from the build plan. */
  @Post('intel/actions/:id/create-issue')
  intelCreateIssue(@Param('id') id: string) {
    return this.intel.createGithubIssue(id);
  }

  /** Run CLAW market-gap ideation → queue upgrade suggestions into Action items. */
  @Post('intel/suggest-upgrades')
  intelSuggestUpgrades() {
    return this.devops.suggestPlatformUpgrades();
  }

  /** CLAW Integration Sentinel — ping every external service; flag breakage into Action items. */
  @Get('health/integrations')
  integrationHealth() {
    return this.sentinel.runAndPersist();
  }

  // ── CLAW Observatory (self-hosted error intelligence) ─────────────────────
  @Get('observatory/stats')
  observatoryStats() {
    return this.observatory.stats();
  }

  @Get('observatory/errors')
  observatoryErrors(@Query('resolved') resolved?: string, @Query('source') source?: string, @Query('limit') limit?: string) {
    const r = resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.observatory.list({ resolved: r, source, limit: limit ? parseInt(limit, 10) : 100 });
  }

  @Patch('observatory/errors/:id/resolve')
  observatoryResolve(@Param('id') id: string, @Body() body: { resolved?: boolean }) {
    return this.observatory.setResolved(id, body?.resolved !== false);
  }

  @Post('observatory/errors/:id/retriage')
  observatoryRetriage(@Param('id') id: string) {
    return this.observatory.retriage(id);
  }

  @Get('audit')
  getAudit(@Query() q: any) {
    return this.svc.getAuditLog(q);
  }

  @Get('plans')
  getPlans() {
    return this.svc.getPlans();
  }

  @Get('feature-catalog')
  getFeatureCatalog() {
    return this.svc.getFeatureCatalog();
  }

  @Patch('plans')
  updatePlan(@Body() body: { tenantId: string; plan: string }, @CurrentUser() owner: any) {
    return this.svc.updateTenantPlan(body.tenantId, body.plan, owner);
  }

  @Patch('subscription')
  updateSubscription(
    @Body() body: { tenantId: string; plan?: string; featureOverrides?: Record<string, boolean>; priceOverrideZar?: number | null },
    @CurrentUser() owner: any,
  ) {
    return this.svc.updateTenantSubscription(body.tenantId, body, owner);
  }

  @Get('approval-requests')
  getApprovalRequests(@Query() q: any) {
    return this.svc.getApprovalRequests(q);
  }

  @Post('approval-requests/:id/approve')
  approveRequest(@Param('id') id: string, @CurrentUser() owner: any) {
    return this.svc.approveRequest(id, owner);
  }

  @Post('approval-requests/:id/reject')
  rejectRequest(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() owner: any) {
    return this.svc.rejectRequest(id, body?.reason, owner);
  }
}

/** Admin approval requests (also accessible by tenant admins checking status). */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: OwnerService) {}

  @Get('approval-requests')
  getApprovalRequests(@Query() q: any) {
    return this.svc.getApprovalRequests(q);
  }

  @Post('approval-requests/:id/approve')
  approveRequest(@Param('id') id: string) {
    return this.svc.approveRequest(id);
  }

  @Post('approval-requests/:id/reject')
  rejectRequest(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.svc.rejectRequest(id, body?.reason);
  }
}

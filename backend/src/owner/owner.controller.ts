import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OwnerService } from './owner.service';
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
  constructor(private readonly svc: OwnerService) {}

  @Get('tenants')
  listTenants(@Query() q: any) {
    return this.svc.listTenants(q);
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.svc.getTenant(id);
  }

  @Post('tenants/draft')
  draftTenant(@Body() body: any) {
    return this.svc.draftTenant(body);
  }

  @Patch('tenants/:id/action')
  tenantAction(@Param('id') id: string, @Body() body: { action: 'approve' | 'reject' | 'suspend'; reason?: string }) {
    return this.svc.tenantAction(id, body.action, { reason: body.reason });
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

  @Get('ai-alerts')
  getAlerts() {
    return this.svc.getPlatformAlerts();
  }

  @Get('audit')
  getAudit(@Query() q: any) {
    return this.svc.getAuditLog(q);
  }

  @Get('plans')
  getPlans() {
    return this.svc.getPlans();
  }

  @Patch('plans')
  updatePlan(@Body() body: { tenantId: string; plan: string }) {
    return this.svc.updateTenantPlan(body.tenantId, body.plan);
  }

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

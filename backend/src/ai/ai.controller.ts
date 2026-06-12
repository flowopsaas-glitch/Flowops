import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('AI')
@ApiBearerAuth()
@Controller()
export class AiController {
  constructor(private readonly svc: AiService) {}

  // ── AI copilot ────────────────────────────────────────────────────

  @Post('ai/shipments-copilot')
  shipmentsCopilot(@CurrentUser() u: any, @Body() body: { query: string }) {
    return this.svc.shipmentsCoopilot(u.companyId, body.query);
  }

  // ── AI events ─────────────────────────────────────────────────────

  @Get('ai-events')
  getEvents(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getEvents(u.companyId, q);
  }

  @Get('ai-events/stats')
  getEventStats(@CurrentUser() u: any) {
    return this.svc.getEventStats(u.companyId);
  }

  @Post('ai-events/seed-demo')
  seedDemoEvents(@CurrentUser() u: any) {
    return this.svc.seedDemoEvents(u.companyId);
  }

  @Patch('ai-events/:id/resolve')
  resolveEvent(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.resolveEvent(id, u.companyId);
  }

  @Patch('ai-events/:id/dismiss')
  dismissEvent(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.dismissEvent(id, u.companyId);
  }

  // ── AI Ops supervisor ─────────────────────────────────────────────

  @Get('ai-ops/supervisor/overview')
  getSupervisorOverview(@CurrentUser() u: any) {
    return this.svc.getSupervisorOverview(u.companyId);
  }

  @Post('ai-ops/repair-route')
  repairRoute(@Body() body: any) {
    return this.svc.repairRoute(body);
  }

  // ── AI Audit ──────────────────────────────────────────────────────

  @Get('ai-audit/logs')
  getAuditLogs(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getAuditLogs(u.companyId, q);
  }

  // ── Email hub ─────────────────────────────────────────────────────

  @Get('email-hub')
  getEmailHub(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getEmailHub(u.companyId, q);
  }

  @Get('email-hub/stats')
  getEmailHubStats(@CurrentUser() u: any) {
    return this.svc.getEmailHubStats(u.companyId);
  }

  @Post('email-hub')
  createEmailHubItem(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createEmailHubItem(u.companyId, body);
  }

  @Patch('email-hub/:id/read')
  markEmailRead(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.updateEmailHubItem(id, u.companyId, { read: true });
  }

  @Patch('email-hub/:id/resolve')
  resolveEmail(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.updateEmailHubItem(id, u.companyId, { resolved: true });
  }

  @Post('email-hub/seed-demo')
  seedDemoEmails(@CurrentUser() u: any) {
    return this.svc.seedDemoEmails(u.companyId);
  }

  // ── Leads ─────────────────────────────────────────────────────────

  @Post('leads/quote')
  createLead(@CurrentUser() u: any, @Body() body: { email: string }) {
    return this.svc.createLead(u.companyId, body.email);
  }

  // ── Booking portal ────────────────────────────────────────────────

  @Get('booking-portal/companies/:id/links')
  getPortalLinks(@Param('id') id: string) {
    return this.svc.getPortalLinks(id);
  }

  @Post('booking-portal/companies/:id/links')
  createPortalLink(@Param('id') id: string, @Body() body: any) {
    return this.svc.createPortalLink(id, body);
  }

  @Public()
  @Get('booking-portal/public/:token')
  getPublicPortal(@Param('token') token: string) {
    return this.svc.getPublicPortal(token);
  }

  @Public()
  @Post('booking-portal/public/:token/requests')
  submitBookingRequest(@Param('token') token: string, @Body() body: any) {
    return this.svc.submitBookingRequest(token, body);
  }
}

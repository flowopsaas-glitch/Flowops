import { Controller, Get, Post, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DispatchInboxService } from './dispatch-inbox.service';

@Controller('dispatch-inbox')
@UseGuards(JwtAuthGuard)
export class DispatchInboxController {
  constructor(private readonly dispatchInboxService: DispatchInboxService) {}

  @Get()
  async getInbox(@Request() req: any) {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'COMPANY_ADMIN' || userRole === 'ADMIN') {
      return this.dispatchInboxService.getAdminInbox(companyId);
    } else if (userRole === 'DISPATCHER') {
      return this.dispatchInboxService.getDispatcherInbox(companyId, userId);
    }
    return [];
  }

  @Post(':id/claim')
  async claimItem(@Param('id') id: string, @Request() req: any) {
    return this.dispatchInboxService.claimItem(req.user.companyId, id, req.user.id);
  }

  @Post(':id/approve')
  async approveItem(@Param('id') id: string, @Body() body: { notes?: string }, @Request() req: any) {
    return this.dispatchInboxService.approveItem(req.user.companyId, id, req.user.id, body.notes);
  }

  @Post(':id/reject')
  async rejectItem(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.dispatchInboxService.rejectItem(req.user.companyId, id, req.user.id, body.reason);
  }

  @Post(':id/analyze-fraud')
  async analyzeFraud(@Param('id') id: string, @Request() req: any) {
    return this.dispatchInboxService.analyzeFraud(req.user.companyId, id);
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    if (req.user.role === 'DISPATCHER') {
      return this.dispatchInboxService.getDispatcherStats(req.user.companyId, req.user.id);
    }
    return { message: 'Stats only available for dispatchers' };
  }
}

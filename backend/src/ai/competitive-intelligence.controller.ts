import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';

@Controller('ai/intel')
export class CompetitiveIntelligenceController {
  constructor(private readonly svc: CompetitiveIntelligenceService) {}

  /**
   * POST /ai/intel/sweep
   * Manually trigger a competitive intelligence sweep for the current tenant.
   */
  @Post('sweep')
  async runSweep(@CurrentUser() user: any) {
    const companyId = user?.companyId || user?.sub;
    return this.svc.runSweep(String(companyId));
  }

  /**
   * GET /ai/intel/latest
   * Get the most recent intelligence report.
   */
  @Get('latest')
  async getLatest(@CurrentUser() user: any) {
    const companyId = user?.companyId || user?.sub;
    return this.svc.getLatestReport(String(companyId));
  }

  /**
   * GET /ai/intel/insights
   * Get paginated intelligence events.
   */
  @Get('insights')
  async getInsights(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const companyId = user?.companyId || user?.sub;
    return this.svc.getInsights(String(companyId), Number(limit) || 20);
  }

  /**
   * GET /ai/intel/actions
   * Open competitive-intel action items for the tenant (?all=1 includes actioned).
   */
  @Get('actions')
  async getActions(@CurrentUser() user: any, @Query('all') all?: string) {
    const companyId = user?.companyId || user?.sub;
    return this.svc.getActionItems(String(companyId), all === '1');
  }

  /**
   * PATCH /ai/intel/actions/:id
   * Mark an action item open|resolved|dismissed.
   */
  @Patch('actions/:id')
  async setActionStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const companyId = user?.companyId || user?.sub;
    return this.svc.setActionStatus(String(companyId), id, body?.status);
  }
}

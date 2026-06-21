import { Controller, Get, Post, Query } from '@nestjs/common';
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
}

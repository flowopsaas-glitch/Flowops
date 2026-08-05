import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';

@UseGuards(FeatureGuard)
@RequireFeature('aiControlTower')
@Controller('ai-ops')
export class AiOpsController {
  constructor(private readonly aiService: AiService) {}

  @Get('supervisor/overview')
  async getOverview(@CurrentUser() u: any) {
    // SECURITY: stats are always for the authenticated tenant (was @Query companyId — cross-tenant + defaulted to "1").
    const stats = await this.aiService.getDashboardStats(u.companyId);

    return {
      status: 'OPERATIONAL',
      generatedAt: new Date().toISOString(),
      assistant: { name: 'FlowOps Z-AI', status: 'online', autopilot: true },
      stats,
      alerts: stats.highAiEvents > 0 ? [{
        id: 'ERR-01', severity: 'HIGH', area: 'LOGISTICS', title: 'Exceptions Detected',
        description: `Claw 6 is currently repairing ${stats.highAiEvents} waybills.`, eta: '30s'
      }] : []
    };
  }

  @Post('assist')
  async askCopilot(@CurrentUser() u: any, @Body() body: { query: string }) {
    const reply = await this.aiService.processIncomingMessage('USER', body.query, u.companyId);
    return { success: true, data: { reply } };
  }
}

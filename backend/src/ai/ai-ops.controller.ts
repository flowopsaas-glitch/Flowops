import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai-ops')
export class AiOpsController {
  constructor(private readonly aiService: AiService) {}

  @Get('supervisor/overview')
  async getOverview(@Query('companyId') companyId: string) {
    const stats = await this.aiService.getDashboardStats(parseInt(companyId) || 1);
    
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
  async askCopilot(@Body() body: { query: string; companyId: number }) {
    const reply = await this.aiService.processIncomingMessage('USER', body.query, body.companyId || 1);
    return { success: true, data: { reply } };
  }
}

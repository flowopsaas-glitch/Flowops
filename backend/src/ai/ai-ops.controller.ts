import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const AI_OPS_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH,
];


@UseGuards(FeatureGuard)
@RequireFeature('aiControlTower')
@Roles(...AI_OPS_ROLES)
@Controller('ai-ops')
export class AiOpsController {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('supervisor/overview')
  async getOverview(@CurrentUser() u: any) {
    // SECURITY: stats are always for the authenticated tenant (was @Query companyId — cross-tenant + defaulted to "1").
    const stats = await this.aiService.getDashboardStats(u.companyId);

    // Fetch real AI events from the aiEvent table for the Live Alert Stack
    // FILTER OUT owner/platform events — tenants should only see operational logistics alerts
    const OWNER_EVENT_TYPES = [
      'INTEGRATION_HEALTH', 'PLATFORM_HEALTH', 'SYSTEM_ERROR', 
      'CONFIG_WARNING', 'HEALTH_CHECK', 'INTEGRATION_FAILING',
    ];
    const aiEvents = await this.prisma.aiEvent.findMany({
      where: { 
        companyId: u.companyId, 
        resolved: false,
        type: { notIn: OWNER_EVENT_TYPES },
        // Only show events with logistics-relevant titles (not integration failures)
        NOT: {
          title: { startsWith: 'Integration' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Map aiEvent records to the SupervisorAlert format the frontend expects
    const alerts = aiEvents.map((e: any, i: number) => ({
      id: e.id || `EVT-${i + 1}`,
      severity: (e.severity || 'info').toUpperCase(),
      area: 'LOGISTICS',
      title: e.title || 'AI Event',
      description: e.body || '',
      eta: e.severity === 'critical' ? 'Immediate' : '30m',
    }));

    return {
      status: 'OPERATIONAL',
      generatedAt: new Date().toISOString(),
      scope: 'tenant',
      assistant: { name: 'FlowOps Z-AI', status: 'online', autopilot: true, provider: 'FlowOps CLAW', mode: 'hybrid', note: 'Online' },
      // Return as BOTH stats and metrics so frontend reads correctly
      stats,
      metrics: {
        totalCollections: stats.pendingCollections || 0,
        pendingCollections: stats.pendingCollections || 0,
        unassignedDispatches: 0,
        waybillsMissingPod: 0,
        draftInvoices: 0,
        highSeverityEvents: alerts.filter((a: any) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
        activeTenants: null,
      },
      alerts,
      recommendations: [],
      copilotContext: {},
    };
  }

  @Post('assist')
  async askCopilot(@CurrentUser() u: any, @Body() body: { query: string }) {
    const reply = await this.aiService.processIncomingMessage('USER', body.query, u.companyId);
    return { success: true, data: { reply } };
  }
}

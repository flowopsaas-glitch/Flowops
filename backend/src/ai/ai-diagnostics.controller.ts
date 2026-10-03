import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  NotFoundException, 
  ForbiddenException,
  BadRequestException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import {
  AI_ADMIN_ROLES,
  AI_OPERATIONAL_ROLES,
  isAiChaosSimulationAllowed,
} from './ai-security.policy';

// 💡 Patched: Changed from 'api/ai-diagnostics' to 'ai-diagnostics' 
// This avoids the /api/api/ path mirroring since the global prefix is already 'api'
//
// SECURITY: every endpoint here is tenant-scoped. Before this hardening, `logs`
// returned the platform-wide audit log and `simulate-chaos` accepted any
// companyId from the request body.
@Controller('ai-diagnostics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiDiagnosticsController {
  private readonly logger = new Logger(AiDiagnosticsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 📜 Fetch operational intelligence audit trail metrics — for THIS tenant only.
   *
   * AuditLog has no companyId column; tenant-attributed entries (e.g. the Rail
   * audit trail) carry it in `metadata.companyId`, which is what we filter on.
   * Owner/platform entries have no such key and are therefore never returned.
   */
  @Get('logs')
  @Roles(...AI_OPERATIONAL_ROLES)
  async getSystemHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.auditLog.findMany({
      where: { metadata: { path: ['companyId'], equals: user.companyId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 📊 Compile real-time system performance data — this tenant's waybills only.
   */
  @Get('system-check')
  @Roles(...AI_OPERATIONAL_ROLES)
  async systemCheck(@CurrentUser() user: AuthenticatedUser) {
    const counts = await this.prisma.waybill.groupBy({
      by: ['status'],
      where: { companyId: user.companyId },
      _count: { _all: true },
    });
    return { 
      waybillStats: counts, 
      timestamp: new Date().toISOString() 
    };
  }

  /**
   * ⚡ Chaos Injection Routine
   *
   * Deliberately corrupts a waybill (FAILED_DELIVERY, totalAmount 0), so it is:
   *   - ADMIN / COMPANY_ADMIN only,
   *   - confined to the caller's own tenant (a body companyId that differs is
   *     rejected, never obeyed),
   *   - disabled in production unless ALLOW_AI_CHAOS_SIMULATION=true,
   *   - audited.
   */
  @Patch('simulate-chaos')
  @Roles(...AI_ADMIN_ROLES)
  async simulateChaos(
    @CurrentUser() user: AuthenticatedUser,
    @Body('companyId') requestedCompanyId?: string | number,
  ) {
    if (!isAiChaosSimulationAllowed()) {
      this.logger.error(`🛑 simulate-chaos refused for ${user.email}: disabled in production.`);
      throw new ForbiddenException(
        'Chaos simulation is disabled in production (set ALLOW_AI_CHAOS_SIMULATION=true to enable it deliberately).',
      );
    }

    if (requestedCompanyId !== undefined && requestedCompanyId !== null && String(requestedCompanyId) !== user.companyId) {
      throw new ForbiddenException('Chaos simulation can only target your own company.');
    }
    if (!user.companyId) {
      throw new BadRequestException('Authenticated company context is required.');
    }

    const targetWaybill = await this.prisma.waybill.findFirst({
      where: { companyId: user.companyId },
    });

    if (!targetWaybill) {
      throw new NotFoundException('No waybills located for your company to simulate against.');
    }

    await this.prisma.waybill.update({
      where: { id: targetWaybill.id },
      data: { 
        status: WaybillStatus.FAILED_DELIVERY, 
        totalAmount: 0 
      }
    });

    await this.audit.record({
      action: 'ai.simulate_chaos',
      actorType: 'tenant',
      actorId: user.id,
      actorEmail: user.email,
      targetType: 'waybill',
      targetId: targetWaybill.id,
      metadata: { companyId: user.companyId, role: user.role },
    });

    return { 
      status: 'CHAOS_INJECTED',
      targetWaybillId: targetWaybill.id,
      timestamp: new Date().toISOString()
    };
  }
}

import { 
  Controller, Post, Get, Body, UseGuards, BadRequestException, Logger, Patch 
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiDiscoveryService } from './ai-discovery.service';
import { AiDevOpsService } from './ai-devops.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AI_ADMIN_ROLES, AI_OPERATIONAL_ROLES } from './ai-security.policy';
import { ClawChatQueryDto } from './dto/claw-chat-query.dto';
import { RepairRouteDto } from './dto/repair-route.dto';
import { SendWhatsAppMockDto } from './dto/send-whatsapp-mock.dto';

/**
 * AI operations surface.
 *
 * Access model (see ai-security.policy.ts for the evidence behind the role sets):
 *   - Claw terminal + WhatsApp mock endpoints → operational roles
 *     (ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH)
 *   - repair-route + diagnostics/force-upgrade → ADMIN, COMPANY_ADMIN only
 *
 * JwtAuthGuard and RolesGuard are also registered globally in AppModule; they
 * are repeated here so this controller stays protected if it is ever mounted
 * in a module that does not inherit the global guards.
 */
@ApiTags('FlowOps Core & AI Operations')
@Throttle({ default: { limit: 30, ttl: 60_000 } }) // cap expensive LLM calls per user
@Controller('ai') // 💡 Patched: Base prefix set to 'ai' to resolve the /api/api/ path duplicate natively
@UseGuards(JwtAuthGuard, RolesGuard) // authentication + role verification on every endpoint
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly discovery: AiDiscoveryService,
    private readonly devops: AiDevOpsService,
    private readonly audit: AuditService,
  ) {}

  // ======================================================
  // 🟢 CORE AI TERMINAL (Unified to /api/ai/claw-chat/query)
  // ======================================================
  @ApiOperation({ summary: 'Terminal Interface for Admin Commands' })
  @Post('claw-chat/query') // 💡 Patched: Resolves cleanly to /api/ai/claw-chat/query matching the React client
  @Roles(...AI_OPERATIONAL_ROLES)
  async adminInstruction(@CurrentUser() user: AuthenticatedUser, @Body() body: ClawChatQueryDto) {
    // SECURITY: derive the tenant from the JWT only — never from the request body.
    const companyId = user?.companyId;

    if (!companyId) {
      throw new BadRequestException('Authenticated company context is required');
    }

    this.logger.log(`🧠 Processing cognitive terminal query for Company ID: ${companyId}`);

    return this.aiService.processInstruction(
      body.command, 
      body.context || { liveMetrics: { risks: 0, activeDrivers: 0 }, history: [], telemetry: { contextTokens: 0 } }, 
      companyId,
      { id: user.id, email: user.email, role: user.role },
    );
  }

  // ======================================================
  // 🟢 DEVOPS & REPAIR (Optimized Routing Flow)
  // ======================================================
  @Post('repair-route') // 💡 Patched: Resolves clean path to /api/ai/repair-route
  @Roles(...AI_ADMIN_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // LLM-cost endpoint: tighter than the class default
  async repairRoute(@Body() data: RepairRouteDto) {
    // Accept both the documented { errorCode, logs } shape and the
    // { failedPath, error } shape the browser interceptor sends.
    const errorCode = data.errorCode || 'UI_ROUTE_ERROR';
    const logs = data.logs || [data.failedPath, data.error].filter(Boolean).join(' — ') || 'No logs provided';

    this.logger.log(`🔧 CLAW 6 initiating system repair for error: ${errorCode}`);
    
    const aiFix = await this.aiService.systemRepairAudit(errorCode, logs);

    return {
      success: true,
      message: "System analyzed by AI Architect",
      repairedAt: new Date().toISOString(),
      aiSuggestion: aiFix
    };
  }

  // ======================================================
  // 🟢 WHATSAPP INTERACTION AUDITING PASS
  // ======================================================
  @Get('whatsapp-threads-mock') // 💡 Patched: Unique endpoint name to prevent collisions with your native WhatsAppController
  @Roles(...AI_OPERATIONAL_ROLES)
  async getWhatsAppThreads() {
    return [
      { id: '1', phone: '+27123456789', lastMessage: 'Where is my parcel?', timestamp: new Date() }
    ];
  }

  @Post('whatsapp-send-mock') // 💡 Patched: Pre-empts collision warnings across active communication gateways
  @Roles(...AI_OPERATIONAL_ROLES)
  async sendWhatsApp(@Body() _data: SendWhatsAppMockDto) {
    return { success: true, messageId: 'wa_mock_' + Date.now() };
  }

  // ======================================================
  // 🟢 INTEL COGNITIVE FORCE-UPGRADE ROUTINE
  // ======================================================
  @Patch('diagnostics/force-upgrade') // 💡 Patched: Resolves cleanly to /api/ai/diagnostics/force-upgrade
  @Roles(...AI_ADMIN_ROLES)
  async forceUpgrade(@CurrentUser() user: AuthenticatedUser) {
    this.logger.warn(`⚠️ [CORE_UPGRADE] Master directive triggered by ${user?.email ?? 'unknown'}. Forcing system matrix refresh...`);
    await this.audit.record({
      action: 'ai.force_upgrade',
      actorType: 'tenant',
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      targetType: 'company',
      targetId: user?.companyId ?? null,
      metadata: { companyId: user?.companyId ?? null, role: user?.role ?? null },
    });
    return { status: 'upgraded', version: '1.8.2-ClawMesh', completedAt: new Date().toISOString() };
  }
}

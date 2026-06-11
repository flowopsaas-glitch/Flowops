import { 
  Controller, Post, Get, Body, UseGuards, Request, BadRequestException, Logger, Patch 
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { AiDiscoveryService } from './ai-discovery.service';
import { AiDevOpsService } from './ai-devops.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles.enum';

@ApiTags('FlowOps Core & AI Operations')
@Controller('ai') // 💡 Patched: Base prefix set to 'ai' to resolve the /api/api/ path duplicate natively
@UseGuards(JwtAuthGuard, RolesGuard) // Enforces authentication and role verification pools across all endpoints
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly discovery: AiDiscoveryService,
    private readonly devops: AiDevOpsService
  ) {}

  // ======================================================
  // 🟢 CORE AI TERMINAL (Unified to /api/ai/claw-chat/query)
  // ======================================================
  @ApiOperation({ summary: 'Terminal Interface for Admin Commands' })
  @Post('claw-chat/query') // 💡 Patched: Resolves cleanly to /api/ai/claw-chat/query matching the React client
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.OPS) // Restricted to higher-tier operational command profiles
  async adminInstruction(@Request() req: any, @Body() body: { command: string; companyId?: number; context?: any }) {
    const user = req.user;
    const companyId = body.companyId ? Number(body.companyId) : (user?.companyId || 1);
    
    if (!body?.command) {
      throw new BadRequestException('Instruction protocol payload required');
    }

    this.logger.log(`🧠 Processing cognitive terminal query for Company ID: ${companyId}`);

    const runtimePayload = await this.aiService.processInstruction(
      body.command, 
      body.context || { liveMetrics: { risks: 0, activeDrivers: 0 }, history: [], telemetry: { contextTokens: 0 } }, 
      companyId
    );

    return runtimePayload;
  }

  // ======================================================
  // 🟢 DEVOPS & REPAIR (Optimized Routing Flow)
  // ======================================================
  @Post('repair-route') // 💡 Patched: Resolves clean path to /api/ai/repair-route
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.OPS, Role.DISPATCH)
  async repairRoute(@Body() data: { errorCode: string; logs: string; routeId?: string }) {
    this.logger.log(`🔧 CLAW 6 initiating system repair for error: ${data.errorCode}`);
    
    const aiFix = await this.aiService.systemRepairAudit(
      data.errorCode || 'UI_ROUTE_ERROR', 
      data.logs || 'No logs provided'
    );

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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.OPS)
  async getWhatsAppThreads(@Request() req: any) {
    return [
      { id: '1', phone: '+27123456789', lastMessage: 'Where is my parcel?', timestamp: new Date() }
    ];
  }

  @Post('whatsapp-send-mock') // 💡 Patched: Pre-empts collision warnings across active communication gateways
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.OPS)
  async sendWhatsApp(@Body() data: { to: string; message: string }) {
    return { success: true, messageId: 'wa_mock_' + Date.now() };
  }

  // ======================================================
  // 🟢 INTEL COGNITIVE FORCE-UPGRADE ROUTINE
  // ======================================================
  @Patch('diagnostics/force-upgrade') // 💡 Patched: Resolves cleanly to /api/ai/diagnostics/force-upgrade
  @Roles(Role.SUPER_ADMIN, Role.ADMIN) // Strictly locked down against secondary dispatcher or driver access
  async forceUpgrade() {
    this.logger.warn('⚠️ [CORE_UPGRADE] Master directive triggered. Forcing system matrix refresh...');
    return { status: 'upgraded', version: '1.8.2-ClawMesh', completedAt: new Date().toISOString() };
  }
}


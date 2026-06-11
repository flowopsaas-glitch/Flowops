// File: src/ai-ops/ai-ops.controller.ts
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AiOpsService } from './ai-ops.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/roles.enum';

@Controller('ai-ops')
@Roles(
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.COMPANY_ADMIN,
  Role.DISPATCH,
  Role.OPERATOR,
  Role.DRIVER,
  Role.USER,
)
export class AiOpsController {
  constructor(private readonly svc: AiOpsService) {}

  // ✅ GET /api/ai-ops/health  (easy browser check)
  @Get('health')
  health(@Req() req: any) {
    return {
      ok: true,
      now: new Date().toISOString(),
      user: req?.user
        ? {
            id: req.user.sub ?? req.user.id ?? null,
            email: req.user.email ?? null,
            role: req.user.role ?? null,
            companyId: req.user.companyId ?? null,
          }
        : null,
      note: 'AI Ops module is loaded. Use POST /api/ai-ops/assist for copilot responses.',
    };
  }

  @Get('supervisor/overview')
  async supervisorOverview(@Req() req: any) {
    return this.svc.getSupervisorOverview(req?.user ?? null);
  }

  /**
   * POST /api/ai-ops/assist
   * body: { domain: "dispatch"|"sales"|"warehouse"|"collections"|"invoices"|"drivers", message: string, context?: any }
   */
  @Post('assist')
  async assist(@Req() req: any, @Body() body: any) {
    return this.svc.assist({
      user: req?.user ?? null,
      domain: body?.domain,
      message: body?.message,
      context: body?.context,
    });
  }

  /**
   * POST /api/ai-ops/actions/execute
   * body: { action: { type: string, payload?: any }, context?: any }
   * This is the safe action runner (allowlist).
   */
  @Post('actions/execute')
  async execute(@Req() req: any, @Body() body: any) {
    return this.svc.executeAction({
      user: req?.user ?? null,
      action: body?.action,
      context: body?.context,
    });
  }
}

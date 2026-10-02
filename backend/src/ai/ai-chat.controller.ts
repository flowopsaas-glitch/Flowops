import { Controller, Post, Body, BadRequestException, Logger, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClawService } from './claw.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AI_OPERATIONAL_ROLES } from './ai-security.policy';
import { ClawChatQueryDto } from './dto/claw-chat-query.dto';

/**
 * NOTE: POST /ai/claw-chat/query is also declared on AiController, which is
 * registered first in AiModule and therefore serves the live traffic. This
 * route is kept consistent with it (same guards, roles and DTO) so it can never
 * become a weaker second door if the registration order changes.
 */
@Controller('ai/claw-chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);
  constructor(private readonly claw: ClawService) {}

  @Post('query')
  @Roles(...AI_OPERATIONAL_ROLES)
  async tenantInstruction(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ClawChatQueryDto,
  ) {
    // SECURITY: the tenant is ALWAYS the authenticated user's company. We never
    // trust a client-supplied companyId (that was a cross-tenant hole + it
    // defaulted to "1", which never matches a real cuid company id anyway).
    if (!u?.companyId) {
      throw new BadRequestException('Authenticated company context is required.');
    }

    try {
      return await this.claw.processTenantQuery(body.command, u.companyId);
    } catch (error: any) {
      this.logger.error(`CLAW_ENGINE_FAULT: ${error?.message ?? error}`);
      throw new BadRequestException('The Claw engine encountered a reasoning error.');
    }
  }
}

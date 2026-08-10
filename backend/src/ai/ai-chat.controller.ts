import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClawService } from './claw.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('ai/claw-chat')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);
  constructor(private readonly claw: ClawService) {}

  @Post('query')
  async tenantInstruction(
    @CurrentUser() u: any,
    @Body() body: { command: string },
  ) {
    if (!body.command) {
      throw new BadRequestException('Message command is required for the Claw reasoning engine.');
    }

    // SECURITY: the tenant is ALWAYS the authenticated user's company. We never
    // trust a client-supplied companyId (that was a cross-tenant hole + it
    // defaulted to "1", which never matches a real cuid company id anyway).
    if (!u?.companyId) {
      throw new BadRequestException('Authenticated company context is required.');
    }

    try {
      return await this.claw.processTenantQuery(body.command, u.companyId);
    } catch (error) {
      this.logger.error(`CLAW_ENGINE_FAULT: ${error?.message ?? error}`);
      throw new BadRequestException('The Claw engine encountered a reasoning error.');
    }
  }
}

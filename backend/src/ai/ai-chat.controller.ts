import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClawService } from './claw.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai/claw-chat')
@Throttle({ default: { limit: 20, ttl: 60_000 } }) // public endpoint — tighter, IP-tracked
export class AiChatController {
  constructor(private readonly claw: ClawService) {}

  @Public()
  @Post('query')
  async tenantInstruction(@Body() body: { command: string; companyId?: number }) {
    // 1. Validation: Matches the key 'command' being sent by the frontend
    if (!body.command) {
      throw new BadRequestException('Message command is required for the Claw reasoning engine.');
    }

    /**
     * 2. Context Injection:
     * Extract the companyId. Default to 1 for testing stability.
     */
    const companyId = body.companyId || 1;

    /**
     * 3. Execution:
     * Passes the 'command' text and companyId into the Claw reasoning engine.
     */
    try {
      return await this.claw.processTenantQuery(body.command, Number(companyId));
    } catch (error) {
      console.error('CLAW_ENGINE_FAULT:', error);
      throw new BadRequestException('The Claw engine encountered a reasoning error.');
    }
  }
}

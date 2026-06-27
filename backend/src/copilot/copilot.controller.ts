import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CopilotService } from './copilot.service';
import { AskDto } from './dto/ask.dto';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Copilot')
@ApiBearerAuth()
@Throttle({ default: { limit: 30, ttl: 60_000 } }) // cap expensive LLM calls per user
@Controller('copilot')
export class CopilotController {
  constructor(private readonly svc: CopilotService) {}

  /** Plain-English question → live, company-scoped answer (+ optional chart). */
  @Post('ask')
  ask(@CurrentUser() u: any, @Body() body: AskDto) {
    return this.svc.ask(u.companyId, body.question);
  }

  /** Starter prompts for the UI. */
  @Get('suggestions')
  suggestions() {
    return { suggestions: this.svc.suggestions() };
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SupportService } from './support.service';
import { AskSupportDto } from './dto/ask.dto';
import { CreateTicketDto, UpdateTicketDto } from './dto/create-ticket.dto';
import { CurrentUser } from '../common/decorators/user.decorator';

/**
 * AI Support Agent — tenant-facing. Plan gating (Enterprise) is enforced inside
 * the service via the aiSupportAgent feature; any authenticated tenant user in
 * an entitled company can use it.
 */
@ApiTags('AI Support Agent')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Plain-English help — grounded in the FlowOps KB + live tenant data. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } }) // cap expensive LLM calls per user
  @Post('query')
  ask(@CurrentUser() user: any, @Body() dto: AskSupportDto) {
    return this.support.ask(user.companyId, user, dto);
  }

  @Get('suggestions')
  suggestions() {
    return this.support.suggestions();
  }

  /** Escalate a query into a tracked support ticket. */
  @Post('tickets')
  @ApiOperation({ summary: 'Raise a support ticket (escalation)' })
  createTicket(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user.companyId, user, dto);
  }

  @Get('tickets')
  listTickets(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.support.listTickets(user.companyId, status);
  }

  @Patch('tickets/:id')
  updateTicket(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.support.updateTicket(user.companyId, id, dto);
  }
}

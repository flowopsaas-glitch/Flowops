import { 
  BadRequestException, 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { AiEventsService } from './ai-events.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const AI_EVENT_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH,
];


@Roles(...AI_EVENT_ROLES)
@Controller('ai-events')
export class AiEventsController {
  constructor(private readonly aiEventsService: AiEventsService) {}

  @Get()
  async list(@CurrentUser() user: { companyId: string }) {
    return this.aiEventsService.list(user.companyId as any);
  }

  /** Queue counters for the High Risk Queue header cards. */
  @Get('stats')
  async stats(@CurrentUser() user: { companyId: string }) {
    return this.aiEventsService.stats(user.companyId as any);
  }

  // 🚀 FIX: The missing Copilot Endpoint
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askCopilot(
    @CurrentUser() user: { companyId: string },
    @Body('prompt') prompt: string,
  ) {
    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }

    // Stub: the copilot backend is not wired up. Say so explicitly instead of
    // returning a fabricated answer that looks like a real AI response.
    return {
      status: 'stub',
      stub: true,
      companyId: user.companyId,
      reply:
        'The FlowOps AI copilot is not connected yet. This endpoint returns a placeholder and no analysis was performed.',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('action/verify-pod')
  @HttpCode(HttpStatus.OK)
  async verifyPod(@CurrentUser() user: { companyId: string }) {
    return this.aiEventsService.verifyCompliance(user.companyId as any);
  }

  @Post('action/repair-billing')
  @HttpCode(HttpStatus.OK)
  async repairBilling(@CurrentUser() user: { companyId: string }) {
    return this.aiEventsService.repairInvoicing(user.companyId as any);
  }

  @Post('logic/learn')
  @HttpCode(HttpStatus.CREATED)
  async learn(
    @CurrentUser() user: { companyId: string },
    @Body() body: {
      type: string;
      old: string;
      new: string;
    },
  ) {
    // Tenant comes from the token. A body-supplied companyId let any
    // authenticated user teach the model using another tenant's context, so
    // only the pattern fields are read from the body.
    const patternData = { type: body?.type, old: body?.old, new: body?.new };
    const companyId = user.companyId;

    if (!companyId) {
      throw new BadRequestException('Tenant context is required for pattern learning');
    }

    if (!patternData.type || !patternData.new) {
      throw new BadRequestException('Incomplete correction data: type and new value are required');
    }

    return this.aiEventsService.learnFromCorrection(Number(companyId), patternData);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @Body('note') note?: string,
  ) {
    const resolutionNote = note || 'Resolved via AI Claw workflow';
    return this.aiEventsService.resolve(id as any, user.companyId as any, resolutionNote);
  }

  /** Dismiss (hide) an event from the queue — tenant-scoped, soft. */
  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismiss(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
  ) {
    return this.aiEventsService.dismiss(id as any, user.companyId as any);
  }
}

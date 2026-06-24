import { 
  BadRequestException, 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  ParseIntPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { AiEventsService } from './ai-events.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai-events')
export class AiEventsController {
  constructor(private readonly aiEventsService: AiEventsService) {}

  @Get()
  async list(@CurrentUser() user: { companyId: string }) {
    return this.aiEventsService.list(user.companyId as any);
  }

  // 🚀 FIX: The missing Copilot Endpoint
  @Public()
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askCopilot(
    @Body('companyId') companyId: number,
    @Body('prompt') prompt: string,
  ) {
    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }
    
    // We return a structured mock response so the UI stops crashing. 
    // You can wire this directly into your actual AI logic later.
    return {
      status: 'success',
      reply: `FlowOps AI: I received your request. Integrating live logic for: "${prompt}"`,
      timestamp: new Date().toISOString()
    };
  }

  @Public()
  @Post('action/verify-pod')
  @HttpCode(HttpStatus.OK)
  async verifyPod(@Body('companyId') companyId: number) {
    return this.aiEventsService.verifyCompliance(companyId);
  }

  @Public()
  @Post('action/repair-billing')
  @HttpCode(HttpStatus.OK)
  async repairBilling(@Body('companyId') companyId: number) {
    return this.aiEventsService.repairInvoicing(companyId);
  }

  @Public()
  @Post('logic/learn')
  @HttpCode(HttpStatus.CREATED)
  async learn(
    @Body() body: { 
      companyId: number; 
      type: string; 
      old: string; 
      new: string; 
    }
  ) {
    const { companyId, ...patternData } = body;
    
    if (!companyId) {
      throw new BadRequestException('companyId is required for pattern learning');
    }

    if (!patternData.type || !patternData.new) {
      throw new BadRequestException('Incomplete correction data: type and new value are required');
    }

    return this.aiEventsService.learnFromCorrection(Number(companyId), patternData);
  }

  @Public()
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: number, 
    @Body('companyId') companyId: number,
    @Body('note') note: string
  ) {
    if (!companyId) {
      throw new BadRequestException('companyId is required to resolve an event');
    }
    const resolutionNote = note || 'Resolved via AI Claw workflow';
    return this.aiEventsService.resolve(id, companyId, resolutionNote);
  }
}

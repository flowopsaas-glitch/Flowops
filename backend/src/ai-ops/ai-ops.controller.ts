import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiOpsService } from './ai-ops.service';

@Controller('ai-ops')
@UseGuards(JwtAuthGuard)
export class AiOpsController {
  constructor(private readonly aiOpsService: AiOpsService) {}

  @Post('assist')
  async assist(@Body() body: any, @Req() req: any) {
    const { domain, message, context } = body;
    
    const result = await this.aiOpsService.assist(domain, message, context || {});
    
    return {
      success: true,
      ...result,
    };
  }

  @Post('actions/execute')
  async executeAction(@Body() body: any) {
    const { action, context } = body;
    
    const result = await this.aiOpsService.executeAction(action, context || {});
    
    return result;
  }
}

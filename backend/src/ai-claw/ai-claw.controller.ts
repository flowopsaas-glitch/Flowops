import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiClawService } from './ai-claw.service';

@Controller('ai/claw-chat')
@UseGuards(JwtAuthGuard)
export class AiClawController {
  constructor(private readonly aiClawService: AiClawService) {}

  @Post('query')
  async query(@Body() body: any) {
    const { message, context } = body;
    
    const result = await this.aiClawService.query(message, context || {});
    
    return {
      success: true,
      ...result,
    };
  }
}

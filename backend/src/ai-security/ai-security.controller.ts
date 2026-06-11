import { Controller, Post, Get, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AISecurityService } from './ai-security.service';

@Controller('ai-security')
@UseGuards(JwtAuthGuard)
export class AISecurityController {
  constructor(private readonly securityService: AISecurityService) {}

  @Post('validate')
  async validateCode(
    @Body('code') code: string,
    @Body('clientEmail') clientEmail: string,
    @Req() req: any
  ) {
    const securityCode = await this.securityService.validateSecurityCode(
      req.user.companyId,
      code
    );

    const session = await this.securityService.getOrCreateSession(
      req.user.companyId,
      securityCode.id,
      clientEmail
    );

    return {
      success: true,
      sessionId: session.id,
      message: 'Security code validated successfully',
    };
  }

  @Get('session/:sessionId/stats')
  async getSessionStats(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.securityService.getSessionStats(sessionId);
  }

  @Post('session/:sessionId/bill')
  async createBill(@Param('sessionId', ParseIntPipe) sessionId: number) {
    const bill = await this.securityService.createBill(sessionId);
    return {
      success: true,
      bill,
    };
  }
}

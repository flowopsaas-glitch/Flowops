import { Controller, Get, Post, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiSentimentAnalysisService } from './ai-sentiment-analysis.service';

@Controller('ai/sentiment-analysis')
@UseGuards(JwtAuthGuard)
export class AiSentimentAnalysisController {
  constructor(private readonly sentimentAnalysis: AiSentimentAnalysisService) {}

  /**
   * Analyze single message sentiment
   */
  @Post('analyze-message')
  async analyzeMessage(
    @Body() body: { message: string; context?: any },
  ) {
    return this.sentimentAnalysis.analyzeMessage(body.message, body.context);
  }

  /**
   * Analyze entire conversation
   */
  @Post('analyze-conversation')
  async analyzeConversation(
    @Body() body: { customerPhone: string },
    @Request() req: any,
  ) {
    const companyId = req.user.companyId;
    return this.sentimentAnalysis.analyzeConversation(body.customerPhone, companyId);
  }

  /**
   * Get sentiment analytics
   */
  @Get('analytics')
  async getAnalytics(
    @Request() req: any,
    @Query('days') days: string = '30',
  ) {
    const companyId = req.user.companyId;
    return this.sentimentAnalysis.getSentimentAnalytics(companyId, parseInt(days));
  }
}

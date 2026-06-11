import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiDynamicPricingService } from './ai-dynamic-pricing.service';

@Controller('ai/dynamic-pricing')
@UseGuards(JwtAuthGuard)
export class AiDynamicPricingController {
  constructor(private readonly dynamicPricing: AiDynamicPricingService) {}

  /**
   * Calculate dynamic price for a delivery
   */
  @Post('calculate')
  async calculatePrice(
    @Body() body: {
      origin: string;
      destination: string;
      weight?: number;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      preferredDate?: string;
    },
    @Request() req: any,
  ) {
    const companyId = req.user.companyId;
    return this.dynamicPricing.calculateDynamicPrice({
      companyId,
      origin: body.origin,
      destination: body.destination,
      weight: body.weight,
      urgency: body.urgency,
      preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
    });
  }

  /**
   * Get pricing analytics
   */
  @Get('analytics')
  async getAnalytics(
    @Request() req: any,
    @Query('days') days: string = '30',
  ) {
    const companyId = req.user.companyId;
    return this.dynamicPricing.getPricingAnalytics(companyId, parseInt(days));
  }

  /**
   * Get price optimization recommendations
   */
  @Get('recommendations')
  async getRecommendations(@Request() req: any) {
    const companyId = req.user.companyId;
    return this.dynamicPricing.getPriceRecommendations(companyId);
  }
}

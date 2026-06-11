import { Controller, Get, Post, Param, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiPredictiveDeliveryService } from './ai-predictive-delivery.service';

@Controller('ai/predictive-delivery')
@UseGuards(JwtAuthGuard)
export class AiPredictiveDeliveryController {
  constructor(private readonly predictiveDelivery: AiPredictiveDeliveryService) {}

  /**
   * Predict delivery time for a waybill
   */
  @Post('predict/:waybillId')
  async predictDelivery(
    @Param('waybillId', ParseIntPipe) waybillId: number,
    @Request() req: any,
  ) {
    const companyId = req.user.companyId;
    return this.predictiveDelivery.predictDeliveryTime(waybillId, companyId);
  }

  /**
   * Update prediction with driver location
   */
  @Post('update-location/:waybillId')
  async updateWithLocation(
    @Param('waybillId', ParseIntPipe) waybillId: number,
    @Query('lat') lat: number,
    @Query('lng') lng: number,
  ) {
    return this.predictiveDelivery.updatePredictionWithLocation(waybillId, lat, lng);
  }

  /**
   * Get prediction accuracy metrics
   */
  @Get('accuracy')
  async getAccuracy(
    @Request() req: any,
    @Query('days') days: string = '30',
  ) {
    const companyId = req.user.companyId;
    return this.predictiveDelivery.getPredictionAccuracy(companyId, parseInt(days));
  }
}

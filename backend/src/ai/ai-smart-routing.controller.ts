import { Controller, Get, Post, Param, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiSmartRoutingService } from './ai-smart-routing.service';

@Controller('ai/smart-routing')
@UseGuards(JwtAuthGuard)
export class AiSmartRoutingController {
  constructor(private readonly smartRouting: AiSmartRoutingService) {}

  /**
   * Optimize route for a driver
   */
  @Post('optimize/:driverId')
  async optimizeRoute(
    @Param('driverId', ParseIntPipe) driverId: number,
    @Request() req: any,
  ) {
    const companyId = req.user.companyId;
    return this.smartRouting.optimizeRoute(driverId, companyId);
  }

  /**
   * Re-optimize route with real-time traffic
   */
  @Post('reoptimize/:driverId')
  async reoptimizeWithTraffic(
    @Param('driverId', ParseIntPipe) driverId: number,
    @Query('lat') lat: number,
    @Query('lng') lng: number,
  ) {
    return this.smartRouting.reoptimizeWithTraffic(driverId, lat, lng);
  }

  /**
   * Get routing analytics
   */
  @Get('analytics')
  async getAnalytics(
    @Request() req: any,
    @Query('days') days: string = '30',
  ) {
    const companyId = req.user.companyId;
    return this.smartRouting.getRoutingAnalytics(companyId, parseInt(days));
  }
}

// src/platform-health/platform-health.controller.ts
import { Controller, Get, Post, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformHealthService } from './platform-health.service';

@Controller('platform-health')
@UseGuards(JwtAuthGuard)
export class PlatformHealthController {
  private readonly logger = new Logger('PlatformHealthController');

  constructor(private readonly healthService: PlatformHealthService) {}

  /**
   * GET /api/v1/platform-health/status
   * Get full platform health status (metrics, system info, DB stats, score)
   */
  @Get('status')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getStatus() {
    this.logger.debug('Fetching platform health status');
    return this.healthService.getHealthStatus();
  }

  /**
   * GET /api/v1/platform-health/recommendations
   * Get AI-generated platform recommendations
   * Optional query: ?category=PERFORMANCE|SECURITY|SCALABILITY|RELIABILITY|FEATURE
   */
  @Get('recommendations')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getRecommendations(@Query('category') category?: string) {
    this.logger.debug(`Fetching recommendations (category: ${category || 'all'})`);
    return this.healthService.getRecommendations(category);
  }

  /**
   * POST /api/v1/platform-health/check
   * Trigger a manual health check (on-demand)
   */
  @Post('check')
  @Roles('SUPER_ADMIN')
  async triggerCheck() {
    this.logger.log('Manual platform health check triggered by Super Admin');
    return this.healthService.triggerManualCheck();
  }
}

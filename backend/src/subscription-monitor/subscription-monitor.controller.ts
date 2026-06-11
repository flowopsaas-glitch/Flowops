// src/subscription-monitor/subscription-monitor.controller.ts
import { Controller, Get, Post, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { SubscriptionMonitorService } from './subscription-monitor.service';

@Controller('subscription-monitor')
@UseGuards(JwtAuthGuard)
export class SubscriptionMonitorController {
  private readonly logger = new Logger('SubscriptionMonitorController');

  constructor(private readonly monitorService: SubscriptionMonitorService) {}

  /**
   * GET /api/v1/subscription-monitor/alerts
   * Get all current subscription/expiry alerts
   * Optional query: ?severity=CRITICAL|WARNING|INFO
   */
  @Get('alerts')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getAlerts(@Query('severity') severity?: string) {
    this.logger.debug(`Fetching subscription alerts (severity filter: ${severity || 'all'})`);
    return this.monitorService.getAlerts(severity);
  }

  /**
   * GET /api/v1/subscription-monitor/summary
   * Get a summary of alert counts and last sweep time
   */
  @Get('summary')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getSummary() {
    return this.monitorService.getAlertsSummary();
  }

  /**
   * POST /api/v1/subscription-monitor/sweep
   * Trigger a manual sweep (on-demand refresh)
   */
  @Post('sweep')
  @Roles('SUPER_ADMIN')
  async triggerSweep() {
    this.logger.log('Manual subscription sweep triggered by Super Admin');
    return this.monitorService.triggerManualSweep();
  }
}
